import { describe, expect, it, vi } from "vitest";
import { currentSchemaVersion } from "../server/db/migrations";
import {
  archiveTrip,
  completeTrip,
  createTrip,
  createTripPackingItem,
  deleteTripPackingItem,
  generateTrip,
  getTrip,
  listTrips,
  recalculateTripSelection,
  refreshTripWeather,
  replaceTripDays,
  updateTrip,
  updateTripPackingItem
} from "../server/services/tripPlanner";
import { deleteWearEvent, updateWearEvent } from "../server/services/wearEvents";
import { createDatabase } from "./helpers/testDatabase";
import type { TripCreateInput, WeatherSnapshot } from "../src/shared/types";

const tripInput = (overrides: Partial<TripCreateInput> = {}): TripCreateInput => ({
  name: "上海三日出差",
  startDate: "2026-07-20",
  endDate: "2026-07-22",
  destination: {
    name: "上海",
    latitude: 31.2304,
    longitude: 121.4737
  },
  maxGarments: 8,
  maxShoes: 2,
  repeatPolicy: "no-consecutive-core",
  maxCoreWearsBetweenLaundry: 2,
  laundryDay: "2026-07-22",
  days: [
    {
      date: "2026-07-20",
      activities: [{
        name: "客户会议",
        occasion: "business",
        formality: "formal",
        requiresSeparateOutfit: false
      }]
    },
    {
      date: "2026-07-21",
      activities: [{
        name: "城市步行",
        occasion: "casual",
        formality: "casual",
        requiresSeparateOutfit: false
      }]
    },
    {
      date: "2026-07-22",
      activities: [{
        name: "返程",
        occasion: "travel",
        formality: "casual",
        requiresSeparateOutfit: false
      }]
    }
  ],
  ...overrides
});

const snapshots: WeatherSnapshot[] = [
  weather("2026-07-20", 31),
  weather("2026-07-21", 33),
  weather("2026-07-22", 30)
];

describe("M6 trip capsule migration and persistence", () => {
  it("appends migration 7 with the five strict trip tables", () => {
    const db = createDatabase(":memory:");

    expect(currentSchemaVersion(db)).toBe(7);
    expect(db.prepare(`
      SELECT version, name FROM schema_migrations ORDER BY version DESC LIMIT 1
    `).get()).toEqual({ version: 7, name: "trip-capsule-planner" });
    expect(db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name LIKE 'trip%'
      ORDER BY name
    `).all()).toEqual([
      { name: "trip_day_activities" },
      { name: "trip_days" },
      { name: "trip_outfit_selections" },
      { name: "trip_packing_items" },
      { name: "trips" }
    ]);

    const tripTables = (db.prepare("PRAGMA table_list").all() as unknown as Array<{ name: string; strict: number }>)
      .filter((table) => table.name === "trips" || table.name.startsWith("trip_"))
      .map((table) => ({ name: table.name, strict: table.strict }))
      .sort((left, right) => left.name.localeCompare(right.name));
    expect(tripTables).toEqual([
      { name: "trip_day_activities", strict: 1 },
      { name: "trip_days", strict: 1 },
      { name: "trip_outfit_selections", strict: 1 },
      { name: "trip_packing_items", strict: 1 },
      { name: "trips", strict: 1 }
    ]);
    expect(db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'index' AND name LIKE 'idx_trip%'
      ORDER BY name
    `).all()).toEqual([
      { name: "idx_trip_day_activities_selection_id" },
      { name: "idx_trip_day_activities_trip_day_id" },
      { name: "idx_trip_days_trip_id_date" },
      { name: "idx_trip_outfit_selections_trip_day_id" },
      { name: "idx_trip_packing_items_garment" },
      { name: "idx_trip_packing_items_trip_id" },
      { name: "idx_trips_status_updated_at" }
    ]);
    expect(db.prepare("PRAGMA index_list(trip_packing_items)").all()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "idx_trip_packing_items_garment", unique: 1, partial: 1 })
    ]));
    expect(db.prepare("PRAGMA foreign_key_list(trip_packing_items)").all()).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: "trips", from: "trip_id", on_delete: "CASCADE" }),
      expect.objectContaining({ table: "garments", from: "garment_id", on_delete: "RESTRICT" })
    ]));
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);

    expect(() => db.prepare(`
      INSERT INTO trips (
        name, start_date, end_date, destination_name, max_garments, max_shoes,
        repeat_policy, max_core_wears_between_laundry, status, created_at, updated_at
      ) VALUES ('坏旅行', '2026-07-20', '2026-07-19', '上海', -1, 1,
        'allow', 2, 'planning', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run()).toThrow();
    expect(() => db.prepare(`
      INSERT INTO trip_days (trip_id, date, created_at, updated_at)
      VALUES (999999, '2026-07-20', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run()).toThrow();
  });

  it("creates, reads, updates, replaces days, lists, and softly archives a trip", () => {
    const db = createDatabase(":memory:");
    const created = createTrip(db, tripInput(), { now: () => new Date("2026-07-15T00:00:00.000Z") });

    expect(created).toMatchObject({
      id: expect.any(Number),
      name: "上海三日出差",
      startDate: "2026-07-20",
      endDate: "2026-07-22",
      status: "planning",
      destination: { name: "上海", latitude: 31.2304, longitude: 121.4737 }
    });
    expect(created.days.map((day) => day.date)).toEqual([
      "2026-07-20",
      "2026-07-21",
      "2026-07-22"
    ]);
    expect(created.days[0].activities[0]).toMatchObject({
      name: "客户会议",
      position: 0,
      formality: "formal"
    });
    expect(listTrips(db)).toHaveLength(1);
    expect(getTrip(db, created.id)).toEqual(created);

    const updated = updateTrip(db, created.id, {
      name: "上海胶囊出差",
      maxShoes: 1
    });
    expect(updated).toMatchObject({ name: "上海胶囊出差", maxShoes: 1, status: "planning" });
    const ready = updateTrip(db, created.id, { status: "ready" });
    expect(ready.status).toBe("ready");

    const replaced = replaceTripDays(db, created.id, {
      days: tripInput().days.map((day, index) => ({
        ...day,
        activities: index === 1
          ? [{
              name: "白天步行 + 晚宴",
              occasion: "dinner",
              formality: "formal" as const,
              requiresSeparateOutfit: true
            }]
          : day.activities
      }))
    });
    expect(replaced.status).toBe("planning");
    expect(replaced.days[1].activities[0]).toMatchObject({
      name: "白天步行 + 晚宴",
      requiresSeparateOutfit: true
    });

    const archived = archiveTrip(db, created.id);
    expect(archived.status).toBe("archived");
    expect(getTrip(db, created.id).status).toBe("archived");
  });

  it("updates a trip date range and its days atomically", () => {
    const db = createDatabase(":memory:");
    const created = createTrip(db, tripInput());
    const nextDays = tripInput().days.slice(0, 2).map((day) => ({
      ...day,
      activities: day.activities.map((activity) => ({ ...activity }))
    }));

    const updated = updateTrip(db, created.id, {
      endDate: "2026-07-21",
      laundryDay: null,
      days: nextDays
    });

    expect(updated).toMatchObject({
      startDate: "2026-07-20",
      endDate: "2026-07-21",
      status: "planning"
    });
    expect(updated.days.map((day) => day.date)).toEqual(["2026-07-20", "2026-07-21"]);
    expect(updated.laundryDay).toBeUndefined();
  });

  it("does not allow protected status transitions to carry unrelated edits", () => {
    const db = createDatabase(":memory:");
    const completed = createTrip(db, tripInput());
    db.prepare("UPDATE trips SET status = 'completed' WHERE id = ?").run(completed.id);

    expect(() => updateTrip(db, completed.id, {
      status: "archived",
      name: "夹带改名"
    })).toThrow(/只能归档|状态|修改/);
    expect(getTrip(db, completed.id)).toMatchObject({ status: "completed", name: completed.name });

    const archived = createTrip(db, tripInput({ name: "已归档旅行" }));
    archiveTrip(db, archived.id);
    expect(() => updateTrip(db, archived.id, {
      status: "planning",
      name: "夹带恢复改名"
    })).toThrow(/只能.*恢复|状态|修改/);
    expect(getTrip(db, archived.id)).toMatchObject({ status: "archived", name: archived.name });
  });

  it("strictly rejects unknown fields, impossible dates, gaps, bad coordinates, and negative limits", () => {
    const db = createDatabase(":memory:");

    expect(() => createTrip(db, {
      ...tripInput(),
      unexpected: true
    })).toThrow(/不允许|未知/);
    expect(() => createTrip(db, tripInput({ endDate: "2026-02-30" }))).toThrow(/日期/);
    expect(() => createTrip(db, tripInput({
      startDate: "2026-07-22",
      endDate: "2026-07-20"
    }))).toThrow(/endDate|startDate|结束日期|开始日期|日期/);
    expect(() => createTrip(db, tripInput({ endDate: "2026-07-28" }))).toThrow(/7/);
    expect(() => createTrip(db, tripInput({
      destination: { name: "上海", latitude: 31.2 }
    }))).toThrow(/经纬度|latitude|longitude/);
    expect(() => createTrip(db, tripInput({ maxGarments: -1 }))).toThrow(/maxGarments/);
    expect(() => createTrip(db, tripInput({
      days: [tripInput().days[0], tripInput().days[2]]
    }))).toThrow(/days|逐日|日期/);
  });
});

describe("M6 trip weather, packing, and actual wear", () => {
  it("only calls the injected forecast after explicit refresh and atomically freezes exact trip dates", async () => {
    const db = createDatabase(":memory:");
    const fetchForecast = vi.fn(async () => snapshots);
    const created = createTrip(db, tripInput());

    expect(fetchForecast).not.toHaveBeenCalled();
    const refreshed = await refreshTripWeather(db, created.id, { fetchForecast });
    expect(fetchForecast).toHaveBeenCalledTimes(1);
    expect(fetchForecast).toHaveBeenCalledWith(
      31.2304,
      121.4737,
      "2026-07-20",
      "2026-07-22"
    );
    expect(refreshed.snapshots).toEqual(snapshots);
    expect(refreshed.trip.days.map((day) => day.weather)).toEqual(snapshots);

    const invalidForecast = vi.fn(async () => snapshots.slice(0, 2));
    await expect(refreshTripWeather(db, created.id, {
      fetchForecast: invalidForecast
    })).rejects.toThrow(/天气|日期|完整/);
    expect(getTrip(db, created.id).days.map((day) => day.weather)).toEqual(snapshots);
  });

  it("persists essential packing states idempotently without changing garment availability", () => {
    const db = createDatabase(":memory:");
    const garmentId = insertGarment(db, "白衬衫", "top");
    const trip = createTrip(db, tripInput());
    const before = availabilityState(db, garmentId);

    const essential = createTripPackingItem(db, trip.id, { label: "充电器" });
    expect(essential).toMatchObject({
      tripId: trip.id,
      kind: "essential",
      label: "充电器",
      status: "unpacked",
      coverage: { dates: [], activityIds: [] }
    });
    const packed = updateTripPackingItem(db, trip.id, essential.id, { status: "packed" });
    expect(packed.status).toBe("packed");
    expect(updateTripPackingItem(db, trip.id, essential.id, { status: "packed" })).toEqual(packed);
    expect(availabilityState(db, garmentId)).toEqual(before);

    expect(deleteTripPackingItem(db, trip.id, essential.id)).toEqual(packed);
    expect(getTrip(db, trip.id).packingItems).toEqual([]);
  });

  it("persists optimizer selections and locally recalculates only the target and later slots", () => {
    const db = createDatabase(":memory:");
    const firstTopId = insertGarment(db, "白衬衫", "top");
    const secondTopId = insertGarment(db, "蓝衬衫", "top");
    const bottomId = insertGarment(db, "西裤", "bottom");
    const shoesId = insertGarment(db, "皮鞋", "shoes");
    const trip = createTrip(db, tripInput({
      endDate: "2026-07-21",
      laundryDay: undefined,
      repeatPolicy: "allow",
      maxCoreWearsBetweenLaundry: 3,
      days: ["2026-07-20", "2026-07-21"].map((date) => ({
        date,
        activities: [{
          name: "客户会议",
          occasion: "business",
          formality: "formal" as const,
          requiresSeparateOutfit: false
        }]
      }))
    }));
    const beforeAvailability = [firstTopId, secondTopId, bottomId, shoesId]
      .map((garmentId) => availabilityState(db, garmentId));

    const generated = generateTrip(db, trip.id, { useStoredWeather: false });
    expect(generated.optimization.status).toBe("feasible");
    expect(generated.trip.status).toBe("ready");
    expect(generated.trip.selections).toHaveLength(2);
    expect(generated.trip.packingItems.filter((item) => item.kind === "garment")).toHaveLength(3);
    expect(generated.trip.packingItems.find((item) => item.kind === "garment")?.coverage).toMatchObject({
      activities: ["客户会议"],
      occasions: ["business"],
      reasons: expect.arrayContaining([expect.stringMatching(/客户会议|business|2026-07/)] )
    });
    const firstSelectionGarments = generated.trip.selections[0].garments.map((garment) => garment.id);
    const firstSelectionId = generated.trip.selections[0].id;
    const target = generated.trip.selections[1];
    const selectedTopId = target.garments.find((garment) => garment.category === "top")!.id;
    const replacementTopId = selectedTopId === firstTopId ? secondTopId : firstTopId;
    const sentinelTrip = createTrip(db, tripInput({
      name: "其他旅行",
      endDate: "2026-07-20",
      laundryDay: undefined,
      days: [tripInput().days[0]]
    }));
    insertSelection(
      db,
      sentinelTrip.days[0].id,
      sentinelTrip.days[0].activities[0].id,
      firstTopId
    );

    const recalculated = recalculateTripSelection(db, trip.id, target.id, {
      replace: { fromGarmentId: selectedTopId, toGarmentId: replacementTopId }
    });
    expect(recalculated.optimization.status).toBe("feasible");
    expect(recalculated.trip.selections).toHaveLength(2);
    expect(recalculated.trip.selections[0].garments.map((garment) => garment.id))
      .toEqual(firstSelectionGarments);
    expect(recalculated.trip.selections[0].id).toBe(firstSelectionId);
    expect(recalculated.trip.selections[1].garments.map((garment) => garment.id))
      .toContain(replacementTopId);
    expect(recalculated.trip.selections[1].garments.map((garment) => garment.id))
      .not.toContain(selectedTopId);
    expect([firstTopId, secondTopId, bottomId, shoesId]
      .map((garmentId) => availabilityState(db, garmentId))).toEqual(beforeAvailability);
  });

  it("rejects local recalculation when an immutable prefix has become unavailable", () => {
    const db = createDatabase(":memory:");
    insertGarment(db, "白衬衫", "top");
    insertGarment(db, "蓝衬衫", "top");
    insertGarment(db, "黑西裤", "bottom");
    insertGarment(db, "灰西裤", "bottom");
    insertGarment(db, "皮鞋", "shoes");
    const trip = createTrip(db, tripInput({
      endDate: "2026-07-21",
      laundryDay: undefined,
      repeatPolicy: "no-consecutive-core",
      maxCoreWearsBetweenLaundry: 3,
      days: ["2026-07-20", "2026-07-21"].map((date) => ({
        date,
        activities: [{
          name: "客户会议",
          occasion: "business",
          formality: "formal" as const,
          requiresSeparateOutfit: false
        }]
      }))
    }));
    const generated = generateTrip(db, trip.id, { useStoredWeather: false }).trip;
    const prefix = generated.selections[0];
    const target = generated.selections[1];
    const targetIds = new Set(target.garments.map((garment) => garment.id));
    const unavailableId = prefix.garments.find((garment) =>
      ["top", "bottom", "dress"].includes(garment.category) && !targetIds.has(garment.id)
    )!.id;
    db.prepare("UPDATE garments SET availability_status = 'laundry' WHERE id = ?").run(unavailableId);
    const selectionIdentityBefore = generated.selections.map((selection) => ({
      id: selection.id,
      garmentIds: selection.garments.map((garment) => garment.id)
    }));

    const recalculated = recalculateTripSelection(db, trip.id, target.id, {
      lockedGarmentIds: target.garments.map((garment) => garment.id)
    });
    expect(recalculated.optimization.status).toBe("infeasible");
    expect(getTrip(db, trip.id).selections.map((selection) => ({
      id: selection.id,
      garmentIds: selection.garments.map((garment) => garment.id)
    }))).toEqual(selectionIdentityBefore);
  });

  it("invalidates stale weather and generated artifacts when optimization context changes", async () => {
    const db = createDatabase(":memory:");
    const garmentIds = [
      insertGarment(db, "白衬衫", "top"),
      insertGarment(db, "西裤", "bottom"),
      insertGarment(db, "皮鞋", "shoes")
    ];
    const trip = createTrip(db, tripInput({
      endDate: "2026-07-20",
      laundryDay: undefined,
      days: [tripInput().days[0]]
    }));
    const essential = createTripPackingItem(db, trip.id, { label: "充电器" });
    await refreshTripWeather(db, trip.id, { fetchForecast: vi.fn(async () => [weather("2026-07-20", 31)]) });
    const generated = generateTrip(db, trip.id, { useStoredWeather: true });
    expect(generated.trip).toMatchObject({ status: "ready" });
    expect(generated.trip.selections.length).toBeGreaterThan(0);
    expect(generated.trip.packingItems.some((item) => item.kind === "garment")).toBe(true);

    const renamed = updateTrip(db, trip.id, {
      name: "只改名称的旅行",
      startDate: generated.trip.startDate,
      endDate: generated.trip.endDate,
      destination: generated.trip.destination,
      maxGarments: generated.trip.maxGarments,
      maxShoes: generated.trip.maxShoes,
      repeatPolicy: generated.trip.repeatPolicy,
      maxCoreWearsBetweenLaundry: generated.trip.maxCoreWearsBetweenLaundry,
      laundryDay: generated.trip.laundryDay ?? null,
      days: generated.trip.days.map((day) => ({
        date: day.date,
        activities: day.activities.map((activity) => ({
          name: activity.name,
          occasion: activity.occasion,
          formality: activity.formality,
          requiresSeparateOutfit: activity.requiresSeparateOutfit
        }))
      }))
    });
    expect(renamed.status).toBe("ready");
    expect(renamed.days).toEqual(generated.trip.days);
    expect(renamed.selections).toEqual(generated.trip.selections);
    expect(renamed.packingItems).toEqual(generated.trip.packingItems);

    const moved = updateTrip(db, trip.id, {
      destination: { name: "北京", latitude: 39.9042, longitude: 116.4074 }
    });
    expect(moved).toMatchObject({ status: "planning", destination: { name: "北京" } });
    expect(moved.days[0].weather).toBeUndefined();
    expect(moved.selections).toEqual([]);
    expect(moved.packingItems).toEqual([essential]);

    const regenerated = generateTrip(db, trip.id, { useStoredWeather: false });
    expect(regenerated.trip.selections.length).toBeGreaterThan(0);
    const constrained = updateTrip(db, trip.id, { maxGarments: 0, maxShoes: 0 });
    expect(constrained.status).toBe("planning");
    expect(constrained.selections).toEqual([]);
    expect(constrained.packingItems).toEqual([essential]);
    expect(garmentIds.map((garmentId) => availabilityState(db, garmentId)))
      .toEqual(garmentIds.map(() => ({ status: "available", events: 0 })));
  });

  it("does not allow generated garment packing items to be deleted as essentials", () => {
    const db = createDatabase(":memory:");
    insertGarment(db, "白衬衫", "top");
    insertGarment(db, "西裤", "bottom");
    insertGarment(db, "皮鞋", "shoes");
    const trip = createTrip(db, tripInput({
      endDate: "2026-07-20",
      laundryDay: undefined,
      days: [tripInput().days[0]]
    }));
    const generated = generateTrip(db, trip.id, { useStoredWeather: false }).trip;
    const garmentItem = generated.packingItems.find((item) => item.kind === "garment")!;

    expect(() => deleteTripPackingItem(db, trip.id, garmentItem.id)).toThrow(/衣物|garment|删除/);
    expect(getTrip(db, trip.id).packingItems).toContainEqual(garmentItem);
  });

  it("confirms actual wear in one outer transaction, replays idempotently, and rolls back link failures", () => {
    const db = createDatabase(":memory:");
    const garmentId = insertGarment(db, "白衬衫", "top");
    const trip = createTrip(db, tripInput({
      endDate: "2026-07-20",
      laundryDay: undefined,
      days: [tripInput().days[0]]
    }));
    const selectionId = insertSelection(db, trip.days[0].id, trip.days[0].activities[0].id, garmentId);
    const input = {
      confirmations: [{
        selectionId,
        confirmed: true as const,
        wornAt: "2026-07-20T09:00:00+08:00",
        timeZone: "Asia/Shanghai",
        occasion: "formal" as const,
        itemIds: [garmentId],
        notes: "实际穿着"
      }]
    };

    const completed = completeTrip(db, trip.id, input);
    expect(completed.trip.status).toBe("completed");
    expect(completed.wearEvents).toHaveLength(1);
    expect(completed.wearEvents[0]).toMatchObject({
      wornAt: "2026-07-20T01:00:00.000Z",
      items: [{ itemId: garmentId }]
    });
    expect(completeTrip(db, trip.id, input).wearEvents).toEqual(completed.wearEvents);
    expect(db.prepare("SELECT COUNT(*) AS count FROM wear_events").get()).toEqual({ count: 1 });
    expect(availabilityState(db, garmentId)).toEqual({ status: "available", events: 0 });

    const secondTrip = createTrip(db, tripInput({
      name: "回滚旅行",
      endDate: "2026-07-20",
      laundryDay: undefined,
      days: [tripInput().days[0]]
    }));
    const secondSelectionId = insertSelection(
      db,
      secondTrip.days[0].id,
      secondTrip.days[0].activities[0].id,
      garmentId
    );
    db.exec(`
      CREATE TRIGGER fail_trip_wear_link
      BEFORE UPDATE OF actual_wear_event_id ON trip_outfit_selections
      WHEN NEW.id = ${secondSelectionId}
      BEGIN
        SELECT RAISE(ABORT, 'trip wear link failure');
      END;
    `);

    expect(() => completeTrip(db, secondTrip.id, {
      confirmations: [{ ...input.confirmations[0], selectionId: secondSelectionId }]
    })).toThrow(/trip wear link failure/);
    expect(db.prepare("SELECT COUNT(*) AS count FROM wear_events").get()).toEqual({ count: 1 });
    expect(db.prepare(`
      SELECT actual_wear_event_id FROM trip_outfit_selections WHERE id = ?
    `).get(secondSelectionId)).toEqual({ actual_wear_event_id: null });
    expect(getTrip(db, secondTrip.id).status).toBe("planning");
  });

  it("binds actual-wear confirmations to the garments stored in each trip selection", () => {
    const db = createDatabase(":memory:");
    const plannedGarmentId = insertGarment(db, "旅行白衬衫", "top");
    const unrelatedGarmentId = insertGarment(db, "未计划针织衫", "top");
    const trip = createTrip(db, tripInput({
      endDate: "2026-07-20",
      laundryDay: undefined,
      days: [tripInput().days[0]]
    }));
    const selectionId = insertSelection(
      db,
      trip.days[0].id,
      trip.days[0].activities[0].id,
      plannedGarmentId
    );

    expect(() => completeTrip(db, trip.id, {
      confirmations: [{
        selectionId,
        confirmed: true,
        wornAt: "2026-07-20T09:00:00+08:00",
        timeZone: "Asia/Shanghai",
        occasion: "formal",
        itemIds: [unrelatedGarmentId]
      }]
    })).toThrow(/旅行搭配|衣物|itemIds/);

    expect(db.prepare("SELECT COUNT(*) AS count FROM wear_events").get()).toEqual({ count: 0 });
    expect(db.prepare(`
      SELECT actual_wear_event_id FROM trip_outfit_selections WHERE id = ?
    `).get(selectionId)).toEqual({ actual_wear_event_id: null });
    expect(getTrip(db, trip.id).status).toBe("planning");
  });

  it("does not let diary edits change the garments bound to a completed trip selection", () => {
    const db = createDatabase(":memory:");
    const plannedGarmentId = insertGarment(db, "旅行白衬衫", "top");
    const unrelatedGarmentId = insertGarment(db, "旅行外针织衫", "top");
    const trip = createTrip(db, tripInput({
      endDate: "2026-07-20",
      laundryDay: undefined,
      days: [tripInput().days[0]]
    }));
    const selectionId = insertSelection(
      db,
      trip.days[0].id,
      trip.days[0].activities[0].id,
      plannedGarmentId
    );
    const completed = completeTrip(db, trip.id, {
      confirmations: [{
        selectionId,
        confirmed: true,
        wornAt: "2026-07-20T09:00:00+08:00",
        timeZone: "Asia/Shanghai",
        occasion: "formal",
        itemIds: [plannedGarmentId]
      }]
    });
    const wearEventId = completed.wearEvents[0].id;

    expect(() => updateWearEvent(db, wearEventId, {
      itemIds: [unrelatedGarmentId]
    })).toThrow(/旅行.*衣物|衣物.*旅行|itemIds/);
    expect(db.prepare(`
      SELECT item_id FROM wear_event_items WHERE wear_event_id = ? ORDER BY position
    `).all(wearEventId)).toEqual([{ item_id: plannedGarmentId }]);
    expect(getTrip(db, trip.id)).toMatchObject({
      status: "completed",
      selections: [expect.objectContaining({ actualWearEventId: wearEventId })]
    });
  });

  it("reopens a completed trip when its diary event is deleted so it can be confirmed again", () => {
    const db = createDatabase(":memory:");
    const garmentId = insertGarment(db, "可撤销旅行衬衫", "top");
    const trip = createTrip(db, tripInput({
      endDate: "2026-07-20",
      laundryDay: undefined,
      days: [tripInput().days[0]]
    }));
    const selectionId = insertSelection(
      db,
      trip.days[0].id,
      trip.days[0].activities[0].id,
      garmentId
    );
    const confirmation = {
      confirmations: [{
        selectionId,
        confirmed: true as const,
        wornAt: "2026-07-20T09:00:00+08:00",
        timeZone: "Asia/Shanghai",
        occasion: "formal" as const,
        itemIds: [garmentId]
      }]
    };
    const completed = completeTrip(db, trip.id, confirmation);
    const originalWearEventId = completed.wearEvents[0].id;

    deleteWearEvent(db, originalWearEventId);
    const reopened = getTrip(db, trip.id);
    expect(reopened.status).toBe("ready");
    expect(reopened.selections[0].actualWearEventId).toBeUndefined();

    const reconfirmed = completeTrip(db, trip.id, confirmation);
    expect(reconfirmed.trip.status).toBe("completed");
    expect(reconfirmed.trip.selections[0].actualWearEventId).toBe(reconfirmed.wearEvents[0].id);
    expect(db.prepare("SELECT COUNT(*) AS count FROM wear_events").get()).toEqual({ count: 1 });
  });
});

function weather(date: string, temperature: number): WeatherSnapshot {
  return {
    date,
    temperature,
    apparentTemperature: temperature + 1,
    precipitationProbability: 20,
    windSpeed: 8,
    weatherCode: 1,
    summary: "多云"
  };
}

function insertGarment(db: ReturnType<typeof createDatabase>, name: string, category: string): number {
  const result = db.prepare(`
    INSERT INTO garments (
      name, category, color, warmth, seasons, styles, formality,
      materials, patterns, tags, owned, confirmed, excluded, confidence
    ) VALUES (?, ?, 'white', 'light', '["summer"]', '["minimal"]', 'formal',
      '[]', '[]', '[]', 1, 1, 0, 1)
  `).run(name, category);
  return Number(result.lastInsertRowid);
}

function insertSelection(
  db: ReturnType<typeof createDatabase>,
  tripDayId: number,
  activityId: number,
  garmentId: number
): number {
  const result = db.prepare(`
    INSERT INTO trip_outfit_selections (
      trip_day_id, slot_index, activity_ids_json, garment_ids_json,
      score, reasons_json, activity_evaluations_json, locked_garment_ids_json,
      created_at, updated_at
    ) VALUES (?, 0, ?, ?, 88, '["适合行程"]', '[]', '[]', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(tripDayId, JSON.stringify([activityId]), JSON.stringify([garmentId]));
  return Number(result.lastInsertRowid);
}

function availabilityState(
  db: ReturnType<typeof createDatabase>,
  garmentId: number
): { status: string; events: number } {
  const garment = db.prepare(`
    SELECT availability_status AS status FROM garments WHERE id = ?
  `).get(garmentId) as { status: string };
  const history = db.prepare(`
    SELECT COUNT(*) AS events FROM garment_availability_events WHERE garment_id = ?
  `).get(garmentId) as { events: number };
  return { status: garment.status, events: history.events };
}
