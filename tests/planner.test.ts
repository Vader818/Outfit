import { describe, expect, it } from "vitest";
import { legacyBaseline0, migrate, type AppDatabase } from "../server/db";
import {
  createWearEvent,
  deleteWearEvent,
  listWearEvents,
  updateWearEvent
} from "../server/services/wearEvents";
import {
  createOutfitPlan,
  deleteOutfitPlan,
  listOutfitPlans,
  markOutfitPlanWorn,
  updateOutfitPlan
} from "../server/services/outfitPlanner";
import { createDatabase, TestDatabaseSync as DatabaseSync } from "./helpers/testDatabase";

const weather = {
  date: "2026-07-14",
  temperature: 29,
  apparentTemperature: 31,
  precipitationProbability: 20,
  windSpeed: 8,
  weatherCode: 1,
  summary: "多云"
};

describe("M4 diary-week-planner migration", () => {
  it("migrates every legacy context shape, preserves missing garment ids, and canonicalizes UTC", () => {
    const db = new DatabaseSync(":memory:");
    legacyBaseline0(db);
    insertGarment(db, "迁移上衣", "top", 1);
    const contexts: unknown[] = [
      { occasion: "formal", weather },
      ["array", 1],
      "string",
      42,
      true,
      null
    ];
    const insert = db.prepare(`
      INSERT INTO wear_logs (id, garment_ids, context, worn_at)
      VALUES (?, ?, ?, ?)
    `);
    contexts.forEach((context, index) => {
      insert.run(
        index + 1,
        JSON.stringify([1, 999]),
        JSON.stringify(context),
        `2026-07-${String(index + 1).padStart(2, "0")} 08:30:00`
      );
    });
    insert.run(7, JSON.stringify([999]), null, "2026-07-07T08:30:00-08:00");

    migrate(db);

    expect(db.prepare("SELECT version, name FROM schema_migrations ORDER BY version").all()).toEqual([
      { version: 0, name: "legacy-baseline" },
      { version: 1, name: "recommendation-candidates" },
      { version: 2, name: "trusted-ingestion" },
      { version: 3, name: "saved-outfits" },
      { version: 4, name: "feedback-availability" },
      { version: 5, name: "diary-week-planner" },
      { version: 6, name: "decision-support" },
      { version: 7, name: "trip-capsule-planner" }
    ]);
    const events = db.prepare(`
      SELECT id, worn_at, time_zone, occasion, weather_snapshot, legacy_snapshot
      FROM wear_events ORDER BY id
    `).all() as Array<{
      id: number;
      worn_at: string;
      time_zone: string;
      occasion: string;
      weather_snapshot: string | null;
      legacy_snapshot: string;
    }>;
    expect(events).toHaveLength(7);
    expect(events[0]).toMatchObject({
      id: 1,
      worn_at: "2026-07-01T08:30:00.000Z",
      time_zone: "UTC",
      occasion: "formal"
    });
    expect(JSON.parse(events[0].weather_snapshot ?? "null")).toEqual(weather);
    expect(events[6].worn_at).toBe("2026-07-07T16:30:00.000Z");
    expect(events.map((event) => JSON.parse(event.legacy_snapshot).originalContext)).toEqual([
      contexts[0], contexts[1], contexts[2], contexts[3], contexts[4], contexts[5], null
    ]);
    expect(events.every((event) =>
      JSON.stringify(JSON.parse(event.legacy_snapshot).originalGarmentIds) ===
        JSON.stringify(event.id === 7 ? [999] : [1, 999])
    )).toBe(true);
    expect(db.prepare(`
      SELECT wear_event_id, item_id, position FROM wear_event_items ORDER BY wear_event_id
    `).all()).toEqual(contexts.map((_, index) => ({
      wear_event_id: index + 1,
      item_id: 1,
      position: 0
    })));
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("backfills the M3 feedback link when migrating a version-4 database", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      ) STRICT;
      INSERT INTO schema_migrations (version, name, applied_at) VALUES
        (0, 'legacy-baseline', '2026-07-01T00:00:00.000Z'),
        (1, 'recommendation-candidates', '2026-07-01T00:00:00.000Z'),
        (2, 'trusted-ingestion', '2026-07-01T00:00:00.000Z'),
        (3, 'saved-outfits', '2026-07-01T00:00:00.000Z'),
        (4, 'feedback-availability', '2026-07-01T00:00:00.000Z');
      CREATE TABLE source_order_items (
        id INTEGER PRIMARY KEY,
        order_time TEXT,
        quantity INTEGER NOT NULL DEFAULT 1,
        payment REAL,
        is_refunded INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE garments (
        id INTEGER PRIMARY KEY,
        source_order_item_id INTEGER,
        acquired_at TEXT,
        purchase_price_cents INTEGER,
        currency TEXT
      );
      CREATE TABLE saved_outfits (id INTEGER PRIMARY KEY);
      CREATE TABLE wear_logs (
        id INTEGER PRIMARY KEY,
        garment_ids TEXT NOT NULL,
        context TEXT,
        worn_at TEXT NOT NULL
      );
      CREATE TABLE recommendation_feedback (
        id INTEGER PRIMARY KEY,
        wear_log_id INTEGER UNIQUE
      );
      INSERT INTO garments (id) VALUES (1);
      INSERT INTO wear_logs (id, garment_ids, context, worn_at)
      VALUES (10, '[1,999]', '{"occasion":"formal"}', '2026-07-01 08:00:00');
      INSERT INTO recommendation_feedback (id, wear_log_id) VALUES (20, 10);
    `);

    migrate(db);

    expect(db.prepare("SELECT wear_event_id FROM recommendation_feedback WHERE id = 20").get()).toEqual({
      wear_event_id: 10
    });
    expect(db.prepare("SELECT id FROM wear_events").all()).toEqual([{ id: 10 }]);
    expect(db.prepare("SELECT item_id FROM wear_event_items").all()).toEqual([{ item_id: 1 }]);
  });

  it("keeps malformed legacy weather only in the legacy snapshot", () => {
    const db = new DatabaseSync(":memory:");
    legacyBaseline0(db);
    insertGarment(db, "旧天气上衣", "top", 1);
    const invalidWeather = [
      { ...weather, date: "2026-02-30" },
      { ...weather, summary: "" },
      { ...weather, extra: true }
    ];
    const insert = db.prepare(`
      INSERT INTO wear_logs (id, garment_ids, context, worn_at)
      VALUES (?, '[1]', ?, ?)
    `);
    invalidWeather.forEach((snapshot, index) => insert.run(
      index + 1,
      JSON.stringify({ occasion: "casual", weather: snapshot }),
      `2026-07-0${index + 1} 08:30:00`
    ));

    migrate(db);

    expect(db.prepare("SELECT weather_snapshot FROM wear_events ORDER BY id").all()).toEqual([
      { weather_snapshot: null },
      { weather_snapshot: null },
      { weather_snapshot: null }
    ]);
    expect(listWearEvents(db, {
      from: "2026-07-01",
      to: "2026-07-03",
      timeZone: "UTC"
    }).events).toHaveLength(3);
    expect(JSON.parse((db.prepare("SELECT legacy_snapshot FROM wear_events WHERE id = 1").get() as {
      legacy_snapshot: string;
    }).legacy_snapshot).originalContext.weather).toEqual(invalidWeather[0]);
  });

  it("rejects impossible legacy calendar timestamps instead of normalizing them", () => {
    const db = new DatabaseSync(":memory:");
    legacyBaseline0(db);
    db.prepare(`
      INSERT INTO wear_logs (id, garment_ids, context, worn_at)
      VALUES (1, '[1]', NULL, '2026-02-30 08:00:00')
    `).run();

    expect(() => migrate(db)).toThrow(/wear_logs row 1.*worn_at is invalid/);
  });
});

describe("wear event service", () => {
  it("creates, pages by a stable cursor, updates items, and deletes an event", () => {
    const db = createDatabase(":memory:");
    const top = insertGarment(db, "白衬衫", "top");
    const bottom = insertGarment(db, "黑西裤", "bottom");
    const shoes = insertGarment(db, "乐福鞋", "shoes");
    const outfit = insertSavedOutfit(db, "正式搭配", [top, bottom]);
    const first = createWearEvent(db, {
      wornAt: "2026-07-13T23:30:00+08:00",
      timeZone: "Asia/Shanghai",
      outfitId: outfit,
      occasion: "formal",
      weatherSnapshot: weather,
      notes: "跨午夜前",
      itemIds: [top, bottom]
    });
    const second = createWearEvent(db, {
      wornAt: "2026-07-14T09:00:00+08:00",
      timeZone: "Asia/Shanghai",
      occasion: "casual",
      itemIds: [top, shoes]
    });

    expect(first.wornAt).toBe("2026-07-13T15:30:00.000Z");
    const page1 = listWearEvents(db, {
      from: "2026-07-13",
      to: "2026-07-14",
      timeZone: "Asia/Shanghai",
      limit: 1
    });
    expect(page1.events.map((event) => event.id)).toEqual([second.id]);
    expect(page1.nextCursor).toEqual(expect.any(String));
    const page2 = listWearEvents(db, {
      from: "2026-07-13",
      to: "2026-07-14",
      timeZone: "Asia/Shanghai",
      limit: 1,
      cursor: page1.nextCursor
    });
    expect(page2.events.map((event) => event.id)).toEqual([first.id]);
    expect(page2.nextCursor).toBeUndefined();

    const updated = updateWearEvent(db, first.id, {
      notes: "已纠正",
      itemIds: [top, shoes]
    });
    expect(updated).toMatchObject({ notes: "已纠正" });
    expect(updated.items.map((item) => item.itemId)).toEqual([top, shoes]);
    const cleared = updateWearEvent(db, first.id, { outfitId: null, notes: null });
    expect(cleared).not.toHaveProperty("outfitId");
    expect(cleared).not.toHaveProperty("notes");
    expect(deleteWearEvent(db, first.id).id).toBe(first.id);
    expect(listWearEvents(db, {
      from: "2026-07-13",
      to: "2026-07-14",
      timeZone: "Asia/Shanghai"
    }).events.map((event) => event.id)).toEqual([second.id]);
  });

  it("uses the requested IANA zone for the default Monday-Sunday week", () => {
    const db = createDatabase(":memory:");
    const top = insertGarment(db, "测试上衣", "top");
    createWearEvent(db, {
      wornAt: "2026-03-08T23:30:00-07:00",
      timeZone: "America/Los_Angeles",
      occasion: "casual",
      itemIds: [top]
    });
    createWearEvent(db, {
      wornAt: "2026-03-09T00:30:00-07:00",
      timeZone: "America/Los_Angeles",
      occasion: "casual",
      itemIds: [top]
    });

    const page = listWearEvents(db, { timeZone: "America/Los_Angeles" }, {
      now: () => new Date("2026-03-11T12:00:00.000Z")
    });
    expect(page.events).toHaveLength(1);
    expect(page.events[0].wornAt).toBe("2026-03-09T07:30:00.000Z");
  });

  it("queries a valid calendar day whose DST transition skips local midnight", () => {
    const db = createDatabase(":memory:");
    const top = insertGarment(db, "夏令时上衣", "top");
    const previousDay = createWearEvent(db, {
      wornAt: "2018-11-04T02:30:00Z",
      timeZone: "America/Sao_Paulo",
      occasion: "casual",
      itemIds: [top]
    });
    const transitionDay = createWearEvent(db, {
      wornAt: "2018-11-04T03:30:00Z",
      timeZone: "America/Sao_Paulo",
      occasion: "casual",
      itemIds: [top]
    });

    const page = listWearEvents(db, {
      from: "2018-11-04",
      to: "2018-11-04",
      timeZone: "America/Sao_Paulo"
    });

    expect(page.events.map((event) => event.id)).toEqual([transitionDay.id]);
    expect(page.events.map((event) => event.id)).not.toContain(previousDay.id);
  });

  it("uses the next valid instant as an exclusive end when the following local date was skipped", () => {
    const db = createDatabase(":memory:");
    const top = insertGarment(db, "日期线外套", "top");
    const event = createWearEvent(db, {
      wornAt: "2011-12-29T20:00:00Z",
      timeZone: "Pacific/Apia",
      occasion: "casual",
      itemIds: [top]
    });

    expect(listWearEvents(db, {
      from: "2011-12-29",
      to: "2011-12-29",
      timeZone: "Pacific/Apia"
    }).events.map((item) => item.id)).toEqual([event.id]);
  });

  it("rejects timestamps without an offset, unknown zones, extra fields, and missing garments", () => {
    const db = createDatabase(":memory:");
    const top = insertGarment(db, "测试上衣", "top");
    const base = {
      wornAt: "2026-07-14T08:00:00.000Z",
      timeZone: "Asia/Shanghai",
      occasion: "casual",
      itemIds: [top]
    };
    expect(() => createWearEvent(db, { ...base, wornAt: "2026-07-14T08:00:00" })).toThrow(/UTC|时区|offset/i);
    expect(() => createWearEvent(db, { ...base, wornAt: "2026-02-30T08:00:00Z" })).toThrow(/wornAt|日期|时间戳/);
    expect(() => createWearEvent(db, { ...base, timeZone: "Mars/Olympus" })).toThrow(/时区/);
    expect(() => createWearEvent(db, { ...base, forged: true })).toThrow(/forged|字段/);
    expect(() => createWearEvent(db, { ...base, itemIds: [999] })).toThrow(/999|衣物/);
  });

  it("retracts linked feedback wear facts and rebuilds pair stats when an event is deleted", () => {
    const db = createDatabase(":memory:");
    const top = insertGarment(db, "反馈上衣", "top");
    const bottom = insertGarment(db, "反馈下装", "bottom");
    const firstEvent = createWearEvent(db, {
      wornAt: "2026-07-14T08:00:00.000Z",
      timeZone: "UTC",
      occasion: "casual",
      itemIds: [top, bottom]
    });
    const secondEvent = createWearEvent(db, {
      wornAt: "2026-07-15T08:00:00.000Z",
      timeZone: "UTC",
      occasion: "casual",
      itemIds: [top, bottom]
    });
    db.prepare(`
      INSERT INTO wear_logs (id, garment_ids, context, worn_at) VALUES (?, ?, NULL, ?)
    `).run(firstEvent.id, JSON.stringify([top, bottom]), firstEvent.wornAt);
    const runId = Number(db.prepare(`
      INSERT INTO recommendation_runs (input_json, result_json) VALUES ('{}', '{}')
    `).run().lastInsertRowid);
    const insertCandidate = db.prepare(`
      INSERT INTO recommendation_candidates (
        candidate_id, run_id, signature, rank, item_ids_json, score_snapshot
      ) VALUES (?, ?, ?, ?, ?, '{}')
    `);
    insertCandidate.run("delete-empty", runId, "delete-empty", 1, JSON.stringify([top, bottom]));
    insertCandidate.run("keep-liked", runId, "keep-liked", 2, JSON.stringify([top, bottom]));
    const now = "2026-07-15T09:00:00.000Z";
    db.prepare(`
      INSERT INTO recommendation_feedback (
        candidate_id, verdict, rating, actually_worn, reason_codes_json, comment,
        wore_instead_outfit_id, wear_log_id, wear_event_id, created_at, updated_at
      ) VALUES ('delete-empty', NULL, NULL, 1, '[]', '', NULL, ?, ?, ?, ?)
    `).run(firstEvent.id, firstEvent.id, now, now);
    db.prepare(`
      INSERT INTO recommendation_feedback (
        candidate_id, verdict, rating, actually_worn, reason_codes_json, comment,
        wore_instead_outfit_id, wear_log_id, wear_event_id, created_at, updated_at
      ) VALUES ('keep-liked', 'liked', NULL, 1, '[]', '', NULL, NULL, ?, ?, ?)
    `).run(secondEvent.id, now, now);
    db.prepare(`
      INSERT INTO outfit_pair_stats (
        garment_a_id, garment_b_id, likes, dislikes, worn_count,
        total_feedback, signal, updated_at
      ) VALUES (?, ?, 1, 0, 2, 2, 5, ?)
    `).run(Math.min(top, bottom), Math.max(top, bottom), now);

    deleteWearEvent(db, firstEvent.id);
    expect(db.prepare("SELECT candidate_id FROM recommendation_feedback ORDER BY candidate_id").all()).toEqual([
      { candidate_id: "keep-liked" }
    ]);
    deleteWearEvent(db, secondEvent.id);
    expect(db.prepare(`
      SELECT actually_worn, wear_log_id, wear_event_id
      FROM recommendation_feedback WHERE candidate_id = 'keep-liked'
    `).get()).toEqual({ actually_worn: 0, wear_log_id: null, wear_event_id: null });
    expect(db.prepare(`
      SELECT likes, dislikes, worn_count, total_feedback, signal
      FROM outfit_pair_stats
    `).all()).toEqual([{ likes: 1, dislikes: 0, worn_count: 0, total_feedback: 1, signal: 1 }]);
  });
});

describe("outfit planner service", () => {
  it("keeps plannedDate literal and returns occasion-aware non-blocking repeat warnings", () => {
    const db = createDatabase(":memory:");
    const top = insertGarment(db, "白衬衫", "top");
    const bottom = insertGarment(db, "黑西裤", "bottom");
    const outfit = insertSavedOutfit(db, "正式搭配", [top, bottom]);
    const sameCombination = insertSavedOutfit(db, "正式搭配副本", [bottom, top]);

    const first = createOutfitPlan(db, {
      plannedDate: "2026-07-10",
      timeZone: "Asia/Shanghai",
      outfitId: sameCombination,
      occasion: "formal",
      weatherSnapshot: { ...weather, date: "2026-07-10" },
      notes: "第一次"
    });
    expect(first.entry.plannedDate).toBe("2026-07-10");
    expect(first.repeatWarning).toBeUndefined();
    const repeated = createOutfitPlan(db, {
      plannedDate: "2026-08-07",
      timeZone: "America/Los_Angeles",
      outfitId: outfit,
      occasion: "formal"
    });
    expect(repeated.entry.plannedDate).toBe("2026-08-07");
    expect(repeated.repeatWarning).toMatchObject({
      code: "RECENT_OUTFIT_REPEAT",
      windowDays: 28,
      previousDate: "2026-07-10",
      canIgnore: true,
      action: "replace-one-item"
    });
    const casual = createOutfitPlan(db, {
      plannedDate: "2026-08-08",
      timeZone: "Asia/Shanghai",
      outfitId: outfit,
      occasion: "casual"
    });
    expect(casual.repeatWarning).toBeUndefined();

    const skipped = updateOutfitPlan(db, casual.entry.id, { status: "skipped", notes: "临时取消" });
    expect(skipped.entry).toMatchObject({ status: "skipped", notes: "临时取消" });
    const cleared = updateOutfitPlan(db, casual.entry.id, { status: "planned", notes: null });
    expect(cleared.entry.status).toBe("planned");
    expect(cleared.entry).not.toHaveProperty("notes");
    expect(listOutfitPlans(db, {
      from: "2026-07-01",
      to: "2026-08-31",
      timeZone: "UTC"
    }).map((entry) => entry.id)).toEqual([first.entry.id, repeated.entry.id, casual.entry.id]);
    expect(deleteOutfitPlan(db, casual.entry.id).id).toBe(casual.entry.id);
  });

  it("uses a 14-day window for date and dinner occasions", () => {
    const db = createDatabase(":memory:");
    const top = insertGarment(db, "约会上衣", "top");
    const bottom = insertGarment(db, "约会下装", "bottom");
    const outfit = insertSavedOutfit(db, "约会组合", [top, bottom]);
    createOutfitPlan(db, {
      plannedDate: "2026-09-01",
      timeZone: "Asia/Shanghai",
      outfitId: outfit,
      occasion: "date"
    });
    const repeated = createOutfitPlan(db, {
      plannedDate: "2026-09-15",
      timeZone: "Asia/Shanghai",
      outfitId: outfit,
      occasion: "dinner"
    });
    expect(repeated.repeatWarning).toMatchObject({ windowDays: 14, previousDate: "2026-09-01" });
  });

  it("checks the repeat window symmetrically and excludes the current plan during updates", () => {
    const db = createDatabase(":memory:");
    const top = insertGarment(db, "深色西装", "top");
    const bottom = insertGarment(db, "正式长裤", "bottom");
    const outfit = insertSavedOutfit(db, "对称窗口搭配", [top, bottom]);
    const later = createOutfitPlan(db, {
      plannedDate: "2026-10-20",
      timeZone: "Asia/Shanghai",
      outfitId: outfit,
      occasion: "formal"
    });

    expect(updateOutfitPlan(db, later.entry.id, {
      notes: "只更新当前计划"
    }).repeatWarning).toBeUndefined();

    const earlier = createOutfitPlan(db, {
      plannedDate: "2026-10-05",
      timeZone: "Asia/Shanghai",
      outfitId: outfit,
      occasion: "formal"
    });
    expect(earlier.repeatWarning).toMatchObject({
      windowDays: 28,
      previousDate: "2026-10-20",
      canIgnore: true
    });
  });

  it("marks a plan worn atomically and treats a replay as idempotent", () => {
    const db = createDatabase(":memory:");
    const top = insertGarment(db, "针织上衣", "top");
    const bottom = insertGarment(db, "半身裙", "bottom");
    const outfit = insertSavedOutfit(db, "约会搭配", [top, bottom]);
    const plan = createOutfitPlan(db, {
      plannedDate: "2026-07-14",
      timeZone: "Asia/Shanghai",
      outfitId: outfit,
      occasion: "date",
      weatherSnapshot: weather,
      notes: "晚餐"
    }).entry;

    db.exec(`
      CREATE TRIGGER fail_mark_worn
      BEFORE UPDATE OF status ON outfit_plan_entries
      WHEN NEW.status = 'worn'
      BEGIN
        SELECT RAISE(ABORT, 'planned mark-worn failure');
      END;
    `);
    expect(() => markOutfitPlanWorn(db, plan.id, {
      wornAt: "2026-07-14T19:30:00+08:00",
      timeZone: "Asia/Shanghai"
    })).toThrow(/planned mark-worn failure/);
    expect(db.prepare("SELECT COUNT(*) AS count FROM wear_events").get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT status FROM outfit_plan_entries WHERE id = ?").get(plan.id)).toEqual({ status: "planned" });
    db.exec("DROP TRIGGER fail_mark_worn");

    const worn = markOutfitPlanWorn(db, plan.id, {
      wornAt: "2026-07-14T19:30:00+08:00",
      timeZone: "Asia/Shanghai"
    });
    expect(worn.plan).toMatchObject({
      status: "worn",
      wornAt: "2026-07-14T11:30:00.000Z",
      wearEventId: worn.wearEvent.id
    });
    expect(worn.wearEvent).toMatchObject({
      outfitId: outfit,
      occasion: "date",
      notes: "晚餐",
      weatherSnapshot: weather
    });
    expect(worn.wearEvent.items.map((item) => item.itemId)).toEqual([top, bottom]);
    const replay = markOutfitPlanWorn(db, plan.id, {
      wornAt: "2026-07-14T20:00:00+08:00",
      timeZone: "Asia/Shanghai"
    });
    expect(replay.wearEvent.id).toBe(worn.wearEvent.id);
    expect(db.prepare("SELECT COUNT(*) AS count FROM wear_events").get()).toEqual({ count: 1 });
  });

  it("keeps a linked plan's actual timestamp in sync when the diary event is corrected", () => {
    const db = createDatabase(":memory:");
    const top = insertGarment(db, "同步上衣", "top");
    const bottom = insertGarment(db, "同步下装", "bottom");
    const outfit = insertSavedOutfit(db, "同步搭配", [top, bottom]);
    const plan = createOutfitPlan(db, {
      plannedDate: "2026-07-14",
      timeZone: "Asia/Shanghai",
      outfitId: outfit,
      occasion: "casual"
    }).entry;
    const worn = markOutfitPlanWorn(db, plan.id, {
      wornAt: "2026-07-14T19:30:00+08:00",
      timeZone: "Asia/Shanghai"
    });

    updateWearEvent(db, worn.wearEvent.id, {
      wornAt: "2026-07-14T20:15:00+08:00"
    });

    expect(listOutfitPlans(db, {
      from: "2026-07-14",
      to: "2026-07-14",
      timeZone: "Asia/Shanghai"
    })[0]).toMatchObject({
      id: plan.id,
      wornAt: "2026-07-14T12:15:00.000Z",
      wearEventId: worn.wearEvent.id
    });
  });

  it("uses the explicitly submitted actual outfit, items, occasion, and cleared notes when marking worn", () => {
    const db = createDatabase(":memory:");
    const top = insertGarment(db, "计划上衣", "top");
    const bottom = insertGarment(db, "计划下装", "bottom");
    const shoes = insertGarment(db, "实际运动鞋", "shoes");
    const plannedOutfit = insertSavedOutfit(db, "计划搭配", [top, bottom]);
    const actualOutfit = insertSavedOutfit(db, "实际搭配", [top, shoes]);
    const plan = createOutfitPlan(db, {
      plannedDate: "2026-07-14",
      timeZone: "Asia/Shanghai",
      outfitId: plannedOutfit,
      occasion: "date",
      weatherSnapshot: weather,
      notes: "原计划备注"
    }).entry;

    const worn = markOutfitPlanWorn(db, plan.id, {
      wornAt: "2026-07-14T20:00:00+08:00",
      timeZone: "Asia/Shanghai",
      outfitId: actualOutfit,
      occasion: "sport",
      itemIds: [top, shoes],
      notes: null
    });

    expect(worn.wearEvent).toMatchObject({
      outfitId: actualOutfit,
      occasion: "sport",
      weatherSnapshot: weather
    });
    expect(worn.wearEvent).not.toHaveProperty("notes");
    expect(worn.wearEvent.items.map((item) => item.itemId)).toEqual([top, shoes]);
  });

  it("rejects a timestamp in plannedDate and invalid calendar dates or zones", () => {
    const db = createDatabase(":memory:");
    const top = insertGarment(db, "上衣", "top");
    const bottom = insertGarment(db, "下装", "bottom");
    const outfit = insertSavedOutfit(db, "日常", [top, bottom]);
    const base = {
      plannedDate: "2026-07-14",
      timeZone: "Asia/Shanghai",
      outfitId: outfit,
      occasion: "casual" as const
    };
    expect(() => createOutfitPlan(db, { ...base, plannedDate: "2026-07-14T00:00:00Z" })).toThrow(/plannedDate|日期/);
    expect(() => createOutfitPlan(db, { ...base, plannedDate: "2026-02-30" })).toThrow(/plannedDate|日期/);
    expect(() => createOutfitPlan(db, { ...base, timeZone: "Invalid/Zone" })).toThrow(/时区/);
  });

});

function insertGarment(
  db: AppDatabase,
  name: string,
  category: "top" | "bottom" | "shoes",
  id?: number
): number {
  const columns = id === undefined ? "" : "id, ";
  const placeholders = id === undefined ? "" : "?, ";
  const result = db.prepare(`
    INSERT INTO garments (
      ${columns}name, category, color, warmth, seasons, styles, formality,
      owned, confirmed, excluded
    ) VALUES (${placeholders}?, ?, 'black', 'medium', '[]', '[]', 'casual', 1, 1, 0)
  `).run(...(id === undefined ? [] : [id]), name, category);
  return id ?? Number(result.lastInsertRowid);
}

function insertSavedOutfit(db: AppDatabase, name: string, itemIds: number[]): number {
  const now = "2026-07-01T00:00:00.000Z";
  const outfitId = Number(db.prepare(`
    INSERT INTO saved_outfits (
      name, notes, source, favorite, created_at, updated_at
    ) VALUES (?, '', 'manual', 0, ?, ?)
  `).run(name, now, now).lastInsertRowid);
  const read = db.prepare("SELECT id, name, brand, category, image_url FROM garments WHERE id = ?");
  const insert = db.prepare(`
    INSERT INTO saved_outfit_items (outfit_id, garment_id, slot, position, garment_snapshot)
    VALUES (?, ?, ?, ?, ?)
  `);
  const positions = new Map<string, number>();
  for (const itemId of itemIds) {
    const garment = read.get(itemId) as {
      id: number;
      name: string;
      brand: string | null;
      category: string;
      image_url: string | null;
    };
    const position = positions.get(garment.category) ?? 0;
    positions.set(garment.category, position + 1);
    insert.run(outfitId, itemId, garment.category, position, JSON.stringify({
      id: garment.id,
      name: garment.name,
      brand: garment.brand ?? "",
      category: garment.category,
      imageUrl: garment.image_url ?? ""
    }));
  }
  return outfitId;
}
