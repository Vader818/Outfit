import type {
  Formality,
  Garment,
  OutfitOccasion,
  Trip,
  TripActivity,
  TripActivityEvaluation as StoredTripActivityEvaluation,
  TripCompleteResult,
  TripDay,
  TripDayInput,
  TripGenerationResult,
  TripOptimizationResult as ApiTripOptimizationResult,
  TripOutfitSelection,
  TripPackingCoverage,
  TripPackingItem,
  TripPackingStatus,
  TripRepeatPolicy,
  TripStatus,
  TripWeatherRefreshResult,
  WearEvent,
  WeatherSnapshot
} from "../../src/shared/types";
import {
  getGarmentById,
  getPersonalProfile,
  listGarments,
  listRecentlyWornGarmentIds,
  type AppDatabase
} from "../db";
import { ApiError, ValidationError } from "../validation";
import { listOutfitPairStats } from "./recommendationFeedback";
import {
  optimizeTrip,
  type TripOptimizationResult,
  type TripOptimizationSlot,
  type TripSelection
} from "./tripOptimizer";
import {
  canonicalUtcTimestamp,
  getWearEvent,
  insertWearEvent,
  parseWearEventItemIds,
  validateCalendarDate,
  validateIanaTimeZone
} from "./wearEvents";
import { buildEstimatedWeather } from "./weather";

const TRIP_CREATE_FIELDS = new Set([
  "name",
  "startDate",
  "endDate",
  "destination",
  "maxGarments",
  "maxShoes",
  "repeatPolicy",
  "maxCoreWearsBetweenLaundry",
  "laundryDay",
  "days"
]);
const TRIP_UPDATE_FIELDS = new Set([
  "name",
  "startDate",
  "endDate",
  "destination",
  "maxGarments",
  "maxShoes",
  "repeatPolicy",
  "maxCoreWearsBetweenLaundry",
  "laundryDay",
  "days",
  "status"
]);
const DESTINATION_FIELDS = new Set(["name", "latitude", "longitude"]);
const DAY_FIELDS = new Set(["date", "activities"]);
const ACTIVITY_FIELDS = new Set([
  "name",
  "occasion",
  "formality",
  "requiresSeparateOutfit"
]);
const REPLACE_DAYS_FIELDS = new Set(["days"]);
const PACKING_CREATE_FIELDS = new Set(["label"]);
const PACKING_UPDATE_FIELDS = new Set(["status"]);
const COMPLETE_FIELDS = new Set(["confirmations"]);
const CONFIRMATION_FIELDS = new Set([
  "selectionId",
  "confirmed",
  "wornAt",
  "timeZone",
  "occasion",
  "itemIds",
  "notes"
]);
const GENERATION_FIELDS = new Set(["useStoredWeather"]);
const RECALCULATE_FIELDS = new Set(["lockedGarmentIds", "replace"]);
const REPLACE_SELECTION_FIELDS = new Set(["fromGarmentId", "toGarmentId"]);
const FORMALITIES = ["casual", "smart-casual", "formal", "sport"] as const;
const REPEAT_POLICIES = ["allow", "no-consecutive-core", "no-repeat-core"] as const;
const TRIP_STATUSES = ["planning", "ready", "completed", "archived"] as const;
const EDITABLE_TRIP_STATUSES = ["planning", "ready", "archived"] as const;
const PACKING_STATUSES = ["unpacked", "packed", "on-body", "not-taking"] as const;
const OUTFIT_OCCASIONS = ["casual", "smart-casual", "formal", "sport", "date", "dinner"] as const;
const WEATHER_FIELDS = new Set([
  "date",
  "temperature",
  "apparentTemperature",
  "precipitationProbability",
  "windSpeed",
  "weatherCode",
  "summary"
]);
const MAX_TRIP_DAYS = 7;
const MAX_TRIP_ACTIVITIES_PER_DAY = 12;
const MAX_TRIP_CONFIRMATIONS = 84;

export interface TripPlannerOptions {
  now?: () => Date;
}

export type TripWeatherForecast = (
  latitude: number,
  longitude: number,
  startDate: string,
  endDate: string
) => Promise<WeatherSnapshot[]>;

export interface TripWeatherDependencies {
  fetchForecast: TripWeatherForecast;
  now?: () => Date;
}

interface TripRow {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  destination_name: string;
  destination_latitude: number | null;
  destination_longitude: number | null;
  max_garments: number;
  max_shoes: number;
  repeat_policy: TripRepeatPolicy;
  max_core_wears_between_laundry: 1 | 2 | 3;
  laundry_day: string | null;
  status: TripStatus;
  created_at: string;
  updated_at: string;
}

interface TripDayRow {
  id: number;
  trip_id: number;
  date: string;
  weather_snapshot: string | null;
}

interface TripActivityRow {
  id: number;
  trip_day_id: number;
  name: string;
  occasion: string;
  formality: Formality;
  requires_separate_outfit: number;
  position: number;
}

interface TripSelectionRow {
  id: number;
  trip_day_id: number;
  slot_index: number;
  activity_ids_json: string;
  garment_ids_json: string;
  score: number;
  reasons_json: string;
  activity_evaluations_json: string;
  locked_garment_ids_json: string;
  actual_wear_event_id: number | null;
}

interface TripPackingRow {
  id: number;
  trip_id: number;
  kind: "garment" | "essential";
  garment_id: number | null;
  label: string;
  status: TripPackingStatus;
  coverage_json: string;
}

interface ParsedTripCreate {
  name: string;
  startDate: string;
  endDate: string;
  destination: { name: string; latitude?: number; longitude?: number };
  maxGarments: number;
  maxShoes: number;
  repeatPolicy: TripRepeatPolicy;
  maxCoreWearsBetweenLaundry: 1 | 2 | 3;
  laundryDay?: string;
  days: TripDayInput[];
}

interface ParsedConfirmation {
  selectionId: number;
  confirmed: true;
  wornAt: string;
  timeZone: string;
  occasion: OutfitOccasion;
  itemIds: number[];
  notes?: string;
}

export function listTrips(
  db: AppDatabase,
  options: { archived?: boolean } = {}
): Trip[] {
  const rows = db.prepare(`
    SELECT id, name, start_date, end_date, destination_name,
      destination_latitude, destination_longitude, max_garments, max_shoes,
      repeat_policy, max_core_wears_between_laundry, laundry_day, status,
      created_at, updated_at
    FROM trips
    WHERE (? = 1 AND status = 'archived') OR (? = 0 AND status <> 'archived')
    ORDER BY start_date ASC, id ASC
  `).all(options.archived ? 1 : 0, options.archived ? 1 : 0) as unknown as TripRow[];
  return rows.map((row) => mapTrip(db, row));
}

export function getTrip(db: AppDatabase, id: number): Trip {
  const tripId = positiveId(id, "tripId");
  return mapTrip(db, getTripRow(db, tripId));
}

export function createTrip(
  db: AppDatabase,
  input: unknown,
  options: TripPlannerOptions = {}
): Trip {
  const parsed = parseTripCreate(input);
  return inImmediateTransaction(db, "Trip", () => {
    const now = (options.now?.() ?? new Date()).toISOString();
    const result = db.prepare(`
      INSERT INTO trips (
        name, start_date, end_date, destination_name,
        destination_latitude, destination_longitude, max_garments, max_shoes,
        repeat_policy, max_core_wears_between_laundry, laundry_day, status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'planning', ?, ?)
    `).run(
      parsed.name,
      parsed.startDate,
      parsed.endDate,
      parsed.destination.name,
      parsed.destination.latitude ?? null,
      parsed.destination.longitude ?? null,
      parsed.maxGarments,
      parsed.maxShoes,
      parsed.repeatPolicy,
      parsed.maxCoreWearsBetweenLaundry,
      parsed.laundryDay ?? null,
      now,
      now
    );
    const tripId = insertedId(result.lastInsertRowid, "trip");
    insertTripDays(db, tripId, parsed.days, now);
    return getTrip(db, tripId);
  });
}

export function updateTrip(
  db: AppDatabase,
  id: number,
  input: unknown,
  options: TripPlannerOptions = {}
): Trip {
  const tripId = positiveId(id, "tripId");
  const update = parseTripUpdate(input);
  return inImmediateTransaction(db, "Trip", () => {
    const current = getTrip(db, tripId);
    const updateFields = Object.keys(update);
    if (current.status === "completed" && (
      update.status !== "archived" || updateFields.length !== 1
    )) {
      throw new ApiError("TRIP_COMPLETED", "已完成旅行只能归档", 409);
    }
    if (current.status === "archived" && (
      update.status !== "planning" || updateFields.length !== 1
    )) {
      throw new ApiError("TRIP_ARCHIVED", "已归档旅行只能先恢复为 planning", 409);
    }
    const currentDays = current.days.map((day) => ({
      date: day.date,
      activities: day.activities.map(activityInput)
    }));
    const daysChanged = update.days !== undefined && !tripDaysEqual(update.days, currentDays);
    const dateRangeChanged = update.startDate !== undefined && update.startDate !== current.startDate ||
      update.endDate !== undefined && update.endDate !== current.endDate;
    const destinationChanged = update.destination !== undefined &&
      !tripDestinationsEqual(update.destination, current.destination);
    const laundryDayChanged = update.laundryDay !== undefined &&
      (update.laundryDay ?? undefined) !== current.laundryDay;
    const constraintChanged = update.maxGarments !== undefined && update.maxGarments !== current.maxGarments ||
      update.maxShoes !== undefined && update.maxShoes !== current.maxShoes ||
      update.repeatPolicy !== undefined && update.repeatPolicy !== current.repeatPolicy ||
      update.maxCoreWearsBetweenLaundry !== undefined &&
        update.maxCoreWearsBetweenLaundry !== current.maxCoreWearsBetweenLaundry ||
      laundryDayChanged;
    const clearsWeather = dateRangeChanged || destinationChanged || daysChanged;
    const clearsOptimization = clearsWeather || constraintChanged;
    if (clearsOptimization && update.status !== undefined && update.status !== "planning") {
      throw new ValidationError("修改旅行优化上下文时状态只能设为 planning");
    }
    const merged: ParsedTripCreate = {
      name: update.name ?? current.name,
      startDate: update.startDate ?? current.startDate,
      endDate: update.endDate ?? current.endDate,
      destination: update.destination ?? current.destination,
      maxGarments: update.maxGarments ?? current.maxGarments,
      maxShoes: update.maxShoes ?? current.maxShoes,
      repeatPolicy: update.repeatPolicy ?? current.repeatPolicy,
      maxCoreWearsBetweenLaundry:
        update.maxCoreWearsBetweenLaundry ?? current.maxCoreWearsBetweenLaundry,
      ...(update.laundryDay === null
        ? {}
        : { laundryDay: update.laundryDay ?? current.laundryDay }),
      days: update.days ?? currentDays
    };
    validateTripDatesAndDays(merged);
    const status = clearsOptimization ? "planning" : update.status ?? current.status;
    const now = (options.now?.() ?? new Date()).toISOString();
    db.prepare(`
      UPDATE trips
      SET name = ?, start_date = ?, end_date = ?, destination_name = ?,
        destination_latitude = ?, destination_longitude = ?, max_garments = ?,
        max_shoes = ?, repeat_policy = ?, max_core_wears_between_laundry = ?,
        laundry_day = ?, status = ?, updated_at = ?
      WHERE id = ?
    `).run(
      merged.name,
      merged.startDate,
      merged.endDate,
      merged.destination.name,
      merged.destination.latitude ?? null,
      merged.destination.longitude ?? null,
      merged.maxGarments,
      merged.maxShoes,
      merged.repeatPolicy,
      merged.maxCoreWearsBetweenLaundry,
      merged.laundryDay ?? null,
      status,
      now,
      tripId
    );
    if (daysChanged && update.days !== undefined) {
      replaceTripDayRows(db, tripId, update.days, now);
    } else {
      if (clearsOptimization) clearTripOptimizationRows(db, tripId, now);
      if (clearsWeather) clearTripWeatherRows(db, tripId, now);
    }
    return getTrip(db, tripId);
  });
}

export function archiveTrip(
  db: AppDatabase,
  id: number,
  options: TripPlannerOptions = {}
): Trip {
  const tripId = positiveId(id, "tripId");
  const current = getTrip(db, tripId);
  if (current.status === "archived") return current;
  db.prepare(`
    UPDATE trips SET status = 'archived', updated_at = ? WHERE id = ?
  `).run((options.now?.() ?? new Date()).toISOString(), tripId);
  return getTrip(db, tripId);
}

export function replaceTripDays(
  db: AppDatabase,
  id: number,
  input: unknown,
  options: TripPlannerOptions = {}
): Trip {
  const tripId = positiveId(id, "tripId");
  const record = strictRecord(input, "旅行逐日内容", REPLACE_DAYS_FIELDS);
  const days = parseTripDays(record.days);
  return inImmediateTransaction(db, "Trip days", () => {
    const current = getTrip(db, tripId);
    assertTripWritable(current);
    validateTripDatesAndDays({
      ...tripToCreate(current),
      days
    });
    const now = (options.now?.() ?? new Date()).toISOString();
    replaceTripDayRows(db, tripId, days, now);
    db.prepare(`
      UPDATE trips SET status = 'planning', updated_at = ? WHERE id = ?
    `).run(now, tripId);
    return getTrip(db, tripId);
  });
}

export async function refreshTripWeather(
  db: AppDatabase,
  id: number,
  dependencies: TripWeatherDependencies
): Promise<TripWeatherRefreshResult> {
  const tripId = positiveId(id, "tripId");
  const before = getTrip(db, tripId);
  assertTripWritable(before);
  const { latitude, longitude } = before.destination;
  if (latitude === undefined || longitude === undefined) {
    throw new ValidationError("旅行目的地必须同时包含 latitude 和 longitude 才能刷新天气");
  }
  let received: WeatherSnapshot[];
  try {
    received = await dependencies.fetchForecast(
      latitude,
      longitude,
      before.startDate,
      before.endDate
    );
  } catch (error) {
    if (error instanceof ApiError || error instanceof ValidationError) throw error;
    throw new ApiError("WEATHER_UNAVAILABLE", "旅行天气刷新失败，已保留原有快照", 502);
  }
  const snapshots = validateForecast(received, before.days.map((day) => day.date));
  return inImmediateTransaction(db, "Trip weather", () => {
    const current = getTrip(db, tripId);
    if (
      current.updatedAt !== before.updatedAt ||
      current.startDate !== before.startDate ||
      current.endDate !== before.endDate ||
      current.destination.latitude !== latitude ||
      current.destination.longitude !== longitude
    ) {
      throw new ApiError("TRIP_CHANGED", "旅行在天气请求期间已被修改，请重试", 409);
    }
    const now = (dependencies.now?.() ?? new Date()).toISOString();
    const update = db.prepare(`
      UPDATE trip_days SET weather_snapshot = ?, updated_at = ?
      WHERE trip_id = ? AND date = ?
    `);
    snapshots.forEach((snapshot) => {
      const result = update.run(JSON.stringify(snapshot), now, tripId, snapshot.date);
      if (Number(result.changes) !== 1) {
        throw new Error(`Trip weather day ${snapshot.date} changed concurrently`);
      }
    });
    db.prepare("UPDATE trips SET updated_at = ? WHERE id = ?").run(now, tripId);
    return { trip: getTrip(db, tripId), snapshots };
  });
}

export async function defaultTripWeatherForecast(
  latitude: number,
  longitude: number,
  startDate: string,
  endDate: string
): Promise<WeatherSnapshot[]> {
  validateCalendarDate(startDate, "startDate");
  validateCalendarDate(endDate, "endDate");
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    daily: [
      "temperature_2m_max",
      "temperature_2m_min",
      "apparent_temperature_max",
      "apparent_temperature_min",
      "precipitation_probability_max",
      "weather_code",
      "wind_speed_10m_max"
    ].join(","),
    timezone: "auto",
    start_date: startDate,
    end_date: endDate
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Open-Meteo 请求失败: ${response.status}`);
    const payload = await response.json() as {
      daily?: {
        time?: string[];
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        apparent_temperature_max?: number[];
        apparent_temperature_min?: number[];
        precipitation_probability_max?: number[];
        weather_code?: number[];
        wind_speed_10m_max?: number[];
      };
    };
    const dates = calendarDates(startDate, endDate);
    return dates.map((date, index) => {
      if (payload.daily?.time?.[index] !== date) {
        throw new Error("Open-Meteo 返回的日期范围不完整");
      }
      const maximum = finiteUpstream(payload.daily.temperature_2m_max?.[index]);
      const minimum = finiteUpstream(payload.daily.temperature_2m_min?.[index]);
      const apparentMaximum = finiteUpstream(payload.daily.apparent_temperature_max?.[index]);
      const apparentMinimum = finiteUpstream(payload.daily.apparent_temperature_min?.[index]);
      const weatherCode = finiteUpstream(payload.daily.weather_code?.[index]);
      return {
        date,
        temperature: Math.round((maximum + minimum) / 2),
        apparentTemperature: Math.round((apparentMaximum + apparentMinimum) / 2),
        precipitationProbability: finiteUpstream(
          payload.daily.precipitation_probability_max?.[index]
        ),
        windSpeed: finiteUpstream(payload.daily.wind_speed_10m_max?.[index]),
        weatherCode,
        summary: weatherSummary(weatherCode)
      };
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function createTripPackingItem(
  db: AppDatabase,
  id: number,
  input: unknown,
  options: TripPlannerOptions = {}
): TripPackingItem {
  const tripId = positiveId(id, "tripId");
  const record = strictRecord(input, "旅行必需品", PACKING_CREATE_FIELDS);
  const label = boundedString(record.label, "label", 1, 200);
  return inImmediateTransaction(db, "Trip packing", () => {
    assertTripWritable(getTrip(db, tripId));
    const now = (options.now?.() ?? new Date()).toISOString();
    const result = db.prepare(`
      INSERT INTO trip_packing_items (
        trip_id, kind, garment_id, label, status, coverage_json, created_at, updated_at
      ) VALUES (?, 'essential', NULL, ?, 'unpacked', ?, ?, ?)
    `).run(tripId, label, JSON.stringify(emptyCoverage()), now, now);
    return getPackingItem(db, tripId, insertedId(result.lastInsertRowid, "packing item"));
  });
}

export function updateTripPackingItem(
  db: AppDatabase,
  tripIdValue: number,
  itemIdValue: number,
  input: unknown,
  options: TripPlannerOptions = {}
): TripPackingItem {
  const tripId = positiveId(tripIdValue, "tripId");
  const itemId = positiveId(itemIdValue, "packingItemId");
  const record = strictRecord(input, "旅行装箱状态", PACKING_UPDATE_FIELDS);
  const status = enumValue(record.status, PACKING_STATUSES, "status");
  return inImmediateTransaction(db, "Trip packing", () => {
    assertTripWritable(getTrip(db, tripId));
    const current = getPackingItem(db, tripId, itemId);
    if (current.status === status) return current;
    db.prepare(`
      UPDATE trip_packing_items SET status = ?, updated_at = ?
      WHERE id = ? AND trip_id = ?
    `).run(status, (options.now?.() ?? new Date()).toISOString(), itemId, tripId);
    return getPackingItem(db, tripId, itemId);
  });
}

export function deleteTripPackingItem(
  db: AppDatabase,
  tripIdValue: number,
  itemIdValue: number
): TripPackingItem {
  const tripId = positiveId(tripIdValue, "tripId");
  const itemId = positiveId(itemIdValue, "packingItemId");
  return inImmediateTransaction(db, "Trip packing", () => {
    assertTripWritable(getTrip(db, tripId));
    const current = getPackingItem(db, tripId, itemId);
    if (current.kind !== "essential") {
      throw new ApiError(
        "TRIP_GARMENT_PACKING_REQUIRED",
        "生成的衣物装箱项不能删除",
        409
      );
    }
    db.prepare("DELETE FROM trip_packing_items WHERE id = ? AND trip_id = ?").run(itemId, tripId);
    return current;
  });
}

export function completeTrip(
  db: AppDatabase,
  id: number,
  input: unknown,
  options: TripPlannerOptions = {}
): TripCompleteResult {
  const tripId = positiveId(id, "tripId");
  const confirmations = parseCompleteInput(input);
  return inImmediateTransaction(db, "Trip completion", () => {
    const trip = getTrip(db, tripId);
    if (trip.status === "archived") throw new ApiError("TRIP_ARCHIVED", "已归档旅行不能确认穿着", 409);
    const wearEvents: WearEvent[] = [];
    for (const confirmation of confirmations) {
      const selection = getSelectionForCompletion(db, tripId, confirmation.selectionId);
      if (selection.actual_wear_event_id !== null) {
        const existing = getWearEvent(db, selection.actual_wear_event_id);
        assertConfirmationReplay(existing, confirmation);
        wearEvents.push(existing);
        continue;
      }
      const storedItemIds = parseStoredIdArray(
        "trip_outfit_selections",
        selection.id,
        "garment_ids_json",
        selection.garment_ids_json
      );
      if (!arraysEqual(storedItemIds, confirmation.itemIds)) {
        throw new ValidationError("itemIds 必须与旅行搭配选择中的衣物完全一致");
      }
      const weatherSnapshot = selection.weather_snapshot === null
        ? undefined
        : parseStoredWeather(selection.trip_day_id, selection.weather_snapshot);
      const event = insertWearEvent(db, {
        wornAt: confirmation.wornAt,
        timeZone: confirmation.timeZone,
        occasion: confirmation.occasion,
        ...(weatherSnapshot === undefined ? {} : { weatherSnapshot }),
        ...(confirmation.notes === undefined ? {} : { notes: confirmation.notes }),
        itemIds: confirmation.itemIds
      }, options);
      const linked = db.prepare(`
        UPDATE trip_outfit_selections
        SET actual_wear_event_id = ?, updated_at = ?
        WHERE id = ? AND actual_wear_event_id IS NULL
      `).run(
        event.id,
        (options.now?.() ?? new Date()).toISOString(),
        confirmation.selectionId
      );
      if (Number(linked.changes) !== 1) {
        throw new ApiError("TRIP_CONFIRMATION_CONFLICT", "旅行实际穿着已被其他操作确认", 409);
      }
      wearEvents.push(event);
    }
    const remaining = db.prepare(`
      SELECT COUNT(*) AS count
      FROM trip_outfit_selections
      INNER JOIN trip_days ON trip_days.id = trip_outfit_selections.trip_day_id
      WHERE trip_days.trip_id = ? AND trip_outfit_selections.actual_wear_event_id IS NULL
    `).get(tripId) as { count: number };
    const selectionCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM trip_outfit_selections
      INNER JOIN trip_days ON trip_days.id = trip_outfit_selections.trip_day_id
      WHERE trip_days.trip_id = ?
    `).get(tripId) as { count: number };
    if (!selectionCount.count || remaining.count) {
      throw new ValidationError("必须逐日确认旅行中的每个实际穿着搭配");
    }
    db.prepare(`
      UPDATE trips SET status = 'completed', updated_at = ? WHERE id = ?
    `).run((options.now?.() ?? new Date()).toISOString(), tripId);
    return { trip: getTrip(db, tripId), wearEvents };
  });
}

export function generateTrip(db: AppDatabase, id: number, input: unknown = {}): TripGenerationResult {
  const tripId = positiveId(id, "tripId");
  const generation = parseGenerationInput(input);
  const trip = getTrip(db, tripId);
  assertTripWritable(trip);
  const { slots } = optimizationSlots(trip, generation.useStoredWeather);
  const optimized = optimizeTrip({
    garments: listGarments(db, { scope: "all" }),
    slots,
    constraints: tripConstraints(trip),
    recentlyWornGarmentIds: listRecentlyWornGarmentIds(db),
    userProfile: getPersonalProfile(db),
    pairStats: listOutfitPairStats(db)
  });
  return persistOptimization(db, tripId, optimized);
}

export function recalculateTripSelection(
  db: AppDatabase,
  tripIdValue: number,
  selectionIdValue: number,
  input: unknown
): TripGenerationResult {
  const tripId = positiveId(tripIdValue, "tripId");
  const selectionId = positiveId(selectionIdValue, "selectionId");
  const parsed = parseRecalculationInput(input);
  const trip = getTrip(db, tripId);
  assertTripWritable(trip);
  const targetIndex = trip.selections.findIndex((selection) => selection.id === selectionId);
  if (targetIndex < 0) throw new ApiError("NOT_FOUND", "旅行搭配选择不存在", 404);
  const target = trip.selections[targetIndex];
  let locks = parsed.lockedGarmentIds ?? target.lockedGarmentIds;
  if (parsed.replace) {
    if (!target.garments.some((garment) => garment.id === parsed.replace!.fromGarmentId)) {
      throw new ValidationError("fromGarmentId 不在目标旅行搭配中");
    }
    locks = target.garments
      .map((garment) => garment.id)
      .filter((garmentId) => garmentId !== parsed.replace!.fromGarmentId);
    locks.push(parsed.replace.toGarmentId);
  }
  const { slots } = optimizationSlots(trip, trip.days.some((day) => Boolean(day.weather)));
  const targetSlotIndex = slots.findIndex((slot) => slot.date === trip.days.find(
    (day) => day.id === target.tripDayId
  )?.date && slot.activityIdsEqual(target.activityIds));
  if (targetSlotIndex < 0) throw new Error("Stored trip selection cannot be mapped to an optimizer slot");
  const activityById = new Map(
    trip.days.flatMap((day) => day.activities).map((activity) => [activity.id, activity])
  );
  const dateByDayId = new Map(trip.days.map((day) => [day.id, day.date]));
  const prefix = trip.selections.slice(0, targetIndex).map((selection) =>
    storedSelectionAsOptimizerPrefix(
      selection,
      dateByDayId.get(selection.tripDayId)!,
      selection.activityIds
        .map((activityId) => activityById.get(activityId)?.occasion)
        .filter((occasion): occasion is string => occasion !== undefined)
    )
  );
  const targetSlotId = slots[targetSlotIndex].id;
  const optimized = optimizeTrip({
    garments: listGarments(db, { scope: "all" }),
    slots,
    constraints: tripConstraints(trip),
    recentlyWornGarmentIds: listRecentlyWornGarmentIds(db),
    userProfile: getPersonalProfile(db),
    pairStats: listOutfitPairStats(db),
    prefix,
    lockedGarmentIdsBySlot: { [targetSlotId]: locks }
  });
  return persistOptimization(db, tripId, optimized, {
    slotId: targetSlotId,
    garmentIds: new Set(locks)
  });
}

function persistOptimization(
  db: AppDatabase,
  tripId: number,
  optimized: TripOptimizationResult,
  targetLocks?: { slotId: string; garmentIds: ReadonlySet<number> }
): TripGenerationResult {
  if (optimized.status === "infeasible") {
    return {
      trip: getTrip(db, tripId),
      optimization: mapInfeasibleOptimization(optimized)
    };
  }
  return inImmediateTransaction(db, "Trip optimization", () => {
    const before = getTrip(db, tripId);
    assertTripWritable(before);
    const oldPackingStatuses = new Map(
      before.packingItems
        .filter((item) => item.kind === "garment" && item.garmentId !== undefined)
        .map((item) => [item.garmentId!, item.status])
    );
    const now = new Date().toISOString();
    const dayByDate = new Map(before.days.map((day) => [day.date, day]));
    const activityNameById = new Map(
      before.days.flatMap((day) => day.activities).map((activity) => [activity.id, activity.name])
    );
    const existingEvaluationByActivityId = new Map(
      before.selections.flatMap((selection) => selection.activityEvaluations)
        .map((evaluation) => [evaluation.activityId, evaluation])
    );
    const dateByDayId = new Map(before.days.map((day) => [day.id, day.date]));
    const existingLocksBySlotId = new Map(
      before.selections.map((selection) => [
        `${dateByDayId.get(selection.tripDayId)}:${selection.slotIndex}`,
        selection.lockedGarmentIds
      ])
    );
    const selectionBySlot = new Map<string, number>();
    const preservedSlotIds = new Set<string>();
    if (targetLocks !== undefined) {
      const targetIndex = optimized.selections.findIndex((selection) => selection.slotId === targetLocks.slotId);
      if (targetIndex < 0) throw new Error("Optimizer omitted the recalculation target slot");
      optimized.selections.slice(0, targetIndex).forEach((selection) => preservedSlotIds.add(selection.slotId));
    }
    const clearSelectionActivities = db.prepare(`
      UPDATE trip_day_activities SET selection_id = NULL, updated_at = ? WHERE selection_id = ?
    `);
    const deleteSelection = db.prepare("DELETE FROM trip_outfit_selections WHERE id = ?");
    before.selections.forEach((selection) => {
      const slotId = `${dateByDayId.get(selection.tripDayId)}:${selection.slotIndex}`;
      if (preservedSlotIds.has(slotId)) {
        selectionBySlot.set(slotId, selection.id);
        return;
      }
      clearSelectionActivities.run(now, selection.id);
      deleteSelection.run(selection.id);
    });
    db.prepare("DELETE FROM trip_packing_items WHERE trip_id = ? AND kind = 'garment'").run(tripId);
    const insertSelection = db.prepare(`
      INSERT INTO trip_outfit_selections (
        trip_day_id, slot_index, activity_ids_json, garment_ids_json, score,
        reasons_json, activity_evaluations_json, locked_garment_ids_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    optimized.selections.forEach((selection) => {
      if (preservedSlotIds.has(selection.slotId)) return;
      const day = dayByDate.get(selection.date);
      if (!day) throw new Error(`Optimizer returned unknown trip date ${selection.date}`);
      const slotIndex = slotIndexFromId(selection.slotId);
      const activityEvaluations: StoredTripActivityEvaluation[] = selection.activityEvaluations.length
        ? selection.activityEvaluations.map((evaluation) => ({
            activityId: evaluation.activityId,
            score: evaluation.score,
            weatherComfort: evaluation.weatherComfort,
            occasion: evaluation.occasionPerItem,
            hardEligible: true
          }))
        : selection.activityIds.map((activityId) => existingEvaluationByActivityId.get(activityId))
            .filter((evaluation): evaluation is StoredTripActivityEvaluation => evaluation !== undefined);
      const lockedGarmentIds = selection.slotId === targetLocks?.slotId
        ? selection.items.map((item) => item.id).filter((itemId) => targetLocks.garmentIds.has(itemId))
        : targetLocks === undefined ? [] : existingLocksBySlotId.get(selection.slotId) ?? [];
      const result = insertSelection.run(
        day.id,
        slotIndex,
        JSON.stringify(selection.activityIds),
        JSON.stringify(selection.items.map((item) => item.id)),
        selection.score,
        JSON.stringify(selection.reasons),
        JSON.stringify(activityEvaluations),
        JSON.stringify(lockedGarmentIds),
        now,
        now
      );
      selectionBySlot.set(selection.slotId, insertedId(result.lastInsertRowid, "trip selection"));
    });
    const updateActivity = db.prepare(`
      UPDATE trip_day_activities SET selection_id = ?, updated_at = ?
      WHERE id = ? AND trip_day_id = ?
    `);
    optimized.selections.forEach((selection) => {
      if (preservedSlotIds.has(selection.slotId)) return;
      const day = dayByDate.get(selection.date)!;
      const selectionId = selectionBySlot.get(selection.slotId)!;
      selection.activityIds.forEach((activityId) => {
        const result = updateActivity.run(selectionId, now, activityId, day.id);
        if (Number(result.changes) !== 1) {
          throw new Error(`Optimizer returned invalid activity ${activityId}`);
        }
      });
    });
    const insertPacking = db.prepare(`
      INSERT INTO trip_packing_items (
        trip_id, kind, garment_id, label, status, coverage_json, created_at, updated_at
      ) VALUES (?, 'garment', ?, ?, ?, ?, ?, ?)
    `);
    optimized.packingItems.forEach((coverage) => {
      const garment = getGarmentById(db, coverage.garmentId);
      insertPacking.run(
        tripId,
        garment.id,
        garment.name,
        oldPackingStatuses.get(garment.id) ?? "unpacked",
        JSON.stringify({
          dates: coverage.dates,
          activityIds: coverage.activityIds,
          activities: [...new Set(
            coverage.activityIds
              .map((activityId) => activityNameById.get(activityId))
              .filter((name): name is string => name !== undefined)
          )],
          occasions: coverage.occasions,
          reasons: coverage.reasons
        }),
        now,
        now
      );
    });
    db.prepare("UPDATE trips SET status = 'ready', updated_at = ? WHERE id = ?").run(now, tripId);
    const persisted = getTrip(db, tripId);
    const optimization: ApiTripOptimizationResult = {
      status: "feasible",
      selections: persisted.selections,
      packingItems: persisted.packingItems,
      objectiveScore: optimized.objectiveScore,
      evaluatedCandidates: optimized.diagnostics.evaluatedTransitions,
      maxBeamSize: optimized.diagnostics.maxBeamSize
    };
    return { trip: persisted, optimization };
  });
}

function mapInfeasibleOptimization(
  optimized: Extract<TripOptimizationResult, { status: "infeasible" }>
): ApiTripOptimizationResult {
  return {
    status: "infeasible",
    conflicts: optimized.conflicts.map((conflict) => ({
      constraint: conflictCode(conflict.code),
      message: conflict.message,
      ...(conflict.slotId === undefined ? {} : { slotId: conflict.slotId })
    })),
    relaxations: optimized.relaxations.map((relaxation) => ({
      constraint: relaxationConstraint(relaxation.constraint),
      from: relaxation.currentValue ?? "当前限制",
      to: relaxation.suggestedValue,
      message: relaxation.message,
      guaranteed: relaxation.guaranteed === true
    })),
    evaluatedCandidates: optimized.diagnostics.evaluatedTransitions
  };
}

function optimizationSlots(
  trip: Trip,
  requireStoredWeather: boolean | undefined
): { slots: Array<TripOptimizationSlot & { activityIdsEqual(ids: readonly number[]): boolean }> } {
  const slots: Array<TripOptimizationSlot & { activityIdsEqual(ids: readonly number[]): boolean }> = [];
  trip.days.forEach((day) => {
    const groups: TripActivity[][] = [];
    let shared: TripActivity[] = [];
    const flush = () => {
      if (shared.length) groups.push(shared);
      shared = [];
    };
    day.activities.forEach((activity) => {
      if (activity.requiresSeparateOutfit) {
        flush();
        groups.push([activity]);
      } else {
        shared.push(activity);
      }
    });
    flush();
    groups.forEach((activities, slotIndex) => {
      const weather = day.weather ?? estimatedWeatherForDate(trip, day.date);
      if (requireStoredWeather && day.weather === undefined) {
        throw new ValidationError(`旅行日期 ${day.date} 缺少已刷新的天气快照`);
      }
      const ids = activities.map((activity) => activity.id);
      slots.push({
        id: `${day.date}:${slotIndex}`,
        date: day.date,
        activities: activities.map((activity) => ({
          id: activity.id,
          occasion: activity.occasion,
          formality: activity.formality,
          weather
        })),
        activityIdsEqual(candidateIds) {
          return ids.length === candidateIds.length && ids.every((id, index) => id === candidateIds[index]);
        }
      });
    });
  });
  return { slots };
}

function storedSelectionAsOptimizerPrefix(
  selection: TripOutfitSelection,
  date: string,
  occasionKeys: string[]
): TripSelection {
  return {
    slotId: `${date}:${selection.slotIndex}`,
    date,
    activityIds: [...selection.activityIds],
    occasionKeys,
    candidateKey: selection.garments.map((garment) => garment.id).sort((a, b) => a - b).join(","),
    items: [...selection.garments],
    score: selection.score,
    reasons: [...selection.reasons],
    activityEvaluations: [],
    limitingActivityId: selection.activityIds[0] ?? 0
  };
}

function tripConstraints(trip: Trip) {
  return {
    maxGarments: trip.maxGarments,
    maxShoes: trip.maxShoes,
    repeatPolicy: trip.repeatPolicy,
    maxCoreWearsBetweenLaundry: trip.maxCoreWearsBetweenLaundry,
    ...(trip.laundryDay === undefined ? {} : { laundryDay: trip.laundryDay })
  };
}

function parseTripCreate(value: unknown): ParsedTripCreate {
  const record = strictRecord(value, "旅行", TRIP_CREATE_FIELDS);
  const parsed: ParsedTripCreate = {
    name: boundedString(record.name, "name", 1, 120),
    startDate: validateCalendarDate(record.startDate, "startDate"),
    endDate: validateCalendarDate(record.endDate, "endDate"),
    destination: parseDestination(record.destination),
    maxGarments: boundedInteger(record.maxGarments, "maxGarments", 0, 100),
    maxShoes: boundedInteger(record.maxShoes, "maxShoes", 0, 20),
    repeatPolicy: enumValue(record.repeatPolicy, REPEAT_POLICIES, "repeatPolicy"),
    maxCoreWearsBetweenLaundry: enumValue(
      record.maxCoreWearsBetweenLaundry,
      [1, 2, 3] as const,
      "maxCoreWearsBetweenLaundry"
    ),
    ...(record.laundryDay === undefined
      ? {}
      : { laundryDay: validateCalendarDate(record.laundryDay, "laundryDay") }),
    days: parseTripDays(record.days)
  };
  validateTripDatesAndDays(parsed);
  return parsed;
}

function parseTripUpdate(value: unknown): {
  name?: string;
  startDate?: string;
  endDate?: string;
  destination?: ParsedTripCreate["destination"];
  maxGarments?: number;
  maxShoes?: number;
  repeatPolicy?: TripRepeatPolicy;
  maxCoreWearsBetweenLaundry?: 1 | 2 | 3;
  laundryDay?: string | null;
  days?: TripDayInput[];
  status?: Exclude<TripStatus, "completed">;
} {
  const record = strictRecord(value, "旅行更新", TRIP_UPDATE_FIELDS);
  if (!Object.keys(record).length) throw new ValidationError("旅行更新至少包含一个字段");
  return {
    ...(record.name === undefined ? {} : { name: boundedString(record.name, "name", 1, 120) }),
    ...(record.startDate === undefined
      ? {}
      : { startDate: validateCalendarDate(record.startDate, "startDate") }),
    ...(record.endDate === undefined
      ? {}
      : { endDate: validateCalendarDate(record.endDate, "endDate") }),
    ...(record.destination === undefined ? {} : { destination: parseDestination(record.destination) }),
    ...(record.maxGarments === undefined
      ? {}
      : { maxGarments: boundedInteger(record.maxGarments, "maxGarments", 0, 100) }),
    ...(record.maxShoes === undefined
      ? {}
      : { maxShoes: boundedInteger(record.maxShoes, "maxShoes", 0, 20) }),
    ...(record.repeatPolicy === undefined
      ? {}
      : { repeatPolicy: enumValue(record.repeatPolicy, REPEAT_POLICIES, "repeatPolicy") }),
    ...(record.maxCoreWearsBetweenLaundry === undefined
      ? {}
      : {
          maxCoreWearsBetweenLaundry: enumValue(
            record.maxCoreWearsBetweenLaundry,
            [1, 2, 3] as const,
            "maxCoreWearsBetweenLaundry"
          )
        }),
    ...(record.laundryDay === undefined
      ? {}
      : record.laundryDay === null
        ? { laundryDay: null }
        : { laundryDay: validateCalendarDate(record.laundryDay, "laundryDay") }),
    ...(record.days === undefined ? {} : { days: parseTripDays(record.days) }),
    ...(record.status === undefined
      ? {}
      : { status: enumValue(record.status, EDITABLE_TRIP_STATUSES, "status") })
  };
}

function parseDestination(value: unknown): ParsedTripCreate["destination"] {
  const record = strictRecord(value, "destination", DESTINATION_FIELDS);
  const hasLatitude = record.latitude !== undefined;
  const hasLongitude = record.longitude !== undefined;
  if (hasLatitude !== hasLongitude) {
    throw new ValidationError("destination 经纬度必须同时提供 latitude 和 longitude");
  }
  return {
    name: boundedString(record.name, "destination.name", 1, 200),
    ...(hasLatitude
      ? {
          latitude: boundedNumber(record.latitude, "destination.latitude", -90, 90),
          longitude: boundedNumber(record.longitude, "destination.longitude", -180, 180)
        }
      : {})
  };
}

function parseTripDays(value: unknown): TripDayInput[] {
  if (!Array.isArray(value) || !value.length || value.length > MAX_TRIP_DAYS) {
    throw new ValidationError("days 必须是 1-7 个旅行日");
  }
  return value.map((day, dayIndex) => {
    const record = strictRecord(day, `days[${dayIndex}]`, DAY_FIELDS);
    if (!Array.isArray(record.activities) || !record.activities.length ||
      record.activities.length > MAX_TRIP_ACTIVITIES_PER_DAY) {
      throw new ValidationError(`days[${dayIndex}].activities 必须是 1-${MAX_TRIP_ACTIVITIES_PER_DAY} 项`);
    }
    return {
      date: validateCalendarDate(record.date, `days[${dayIndex}].date`),
      activities: record.activities.map((activity, activityIndex) => {
        const activityRecord = strictRecord(
          activity,
          `days[${dayIndex}].activities[${activityIndex}]`,
          ACTIVITY_FIELDS
        );
        return {
          name: boundedString(activityRecord.name, "activity.name", 1, 200),
          occasion: boundedString(activityRecord.occasion, "activity.occasion", 1, 120),
          formality: enumValue(activityRecord.formality, FORMALITIES, "activity.formality"),
          requiresSeparateOutfit: strictBoolean(
            activityRecord.requiresSeparateOutfit,
            "activity.requiresSeparateOutfit"
          )
        };
      })
    };
  });
}

function validateTripDatesAndDays(input: ParsedTripCreate): void {
  if (input.startDate > input.endDate) throw new ValidationError("endDate 不能早于 startDate");
  const dates = calendarDates(input.startDate, input.endDate);
  if (dates.length > MAX_TRIP_DAYS) throw new ValidationError("旅行最多只能包含 7 天");
  const actual = [...input.days].map((day) => day.date).sort();
  if (new Set(actual).size !== actual.length ||
    actual.length !== dates.length || actual.some((date, index) => date !== dates[index])) {
    throw new ValidationError("days 必须逐日完整覆盖 startDate 到 endDate");
  }
  if (input.laundryDay !== undefined &&
    (input.laundryDay < input.startDate || input.laundryDay > input.endDate)) {
    throw new ValidationError("laundryDay 必须位于旅行日期范围内");
  }
}

function parseCompleteInput(value: unknown): ParsedConfirmation[] {
  const record = strictRecord(value, "完成旅行请求", COMPLETE_FIELDS);
  if (!Array.isArray(record.confirmations) || !record.confirmations.length ||
    record.confirmations.length > MAX_TRIP_CONFIRMATIONS) {
    throw new ValidationError(`confirmations 必须是 1-${MAX_TRIP_CONFIRMATIONS} 项数组`);
  }
  const confirmations = record.confirmations.map((item, index): ParsedConfirmation => {
    const confirmation = strictRecord(item, `confirmations[${index}]`, CONFIRMATION_FIELDS);
    if (confirmation.confirmed !== true) {
      throw new ValidationError(`confirmations[${index}].confirmed 必须显式为 true`);
    }
    return {
      selectionId: positiveId(confirmation.selectionId, `confirmations[${index}].selectionId`),
      confirmed: true,
      wornAt: canonicalUtcTimestamp(confirmation.wornAt),
      timeZone: validateIanaTimeZone(confirmation.timeZone),
      occasion: enumValue(confirmation.occasion, OUTFIT_OCCASIONS, "occasion"),
      itemIds: parseWearEventItemIds(confirmation.itemIds),
      ...(confirmation.notes === undefined
        ? {}
        : { notes: boundedString(confirmation.notes, "notes", 0, 4000, false) })
    };
  });
  const ids = confirmations.map((confirmation) => confirmation.selectionId);
  if (new Set(ids).size !== ids.length) throw new ValidationError("confirmations 中 selectionId 不能重复");
  return confirmations;
}

function parseGenerationInput(value: unknown): { useStoredWeather?: boolean } {
  const record = strictRecord(value, "旅行生成请求", GENERATION_FIELDS);
  return record.useStoredWeather === undefined
    ? {}
    : { useStoredWeather: strictBoolean(record.useStoredWeather, "useStoredWeather") };
}

function parseRecalculationInput(value: unknown): {
  lockedGarmentIds?: number[];
  replace?: { fromGarmentId: number; toGarmentId: number };
} {
  const record = strictRecord(value, "旅行局部重算请求", RECALCULATE_FIELDS);
  const lockedGarmentIds = record.lockedGarmentIds === undefined
    ? undefined
    : positiveIdArray(record.lockedGarmentIds, "lockedGarmentIds", true);
  let replace: { fromGarmentId: number; toGarmentId: number } | undefined;
  if (record.replace !== undefined) {
    const replacement = strictRecord(record.replace, "replace", REPLACE_SELECTION_FIELDS);
    replace = {
      fromGarmentId: positiveId(replacement.fromGarmentId, "replace.fromGarmentId"),
      toGarmentId: positiveId(replacement.toGarmentId, "replace.toGarmentId")
    };
    if (replace.fromGarmentId === replace.toGarmentId) {
      throw new ValidationError("替换前后的衣物不能相同");
    }
  }
  if (lockedGarmentIds === undefined && replace === undefined) {
    throw new ValidationError("局部重算至少需要 lockedGarmentIds 或 replace");
  }
  return {
    ...(lockedGarmentIds === undefined ? {} : { lockedGarmentIds }),
    ...(replace === undefined ? {} : { replace })
  };
}

function insertTripDays(db: AppDatabase, tripId: number, days: readonly TripDayInput[], now: string): void {
  const insertDay = db.prepare(`
    INSERT INTO trip_days (trip_id, date, weather_snapshot, created_at, updated_at)
    VALUES (?, ?, NULL, ?, ?)
  `);
  const insertActivity = db.prepare(`
    INSERT INTO trip_day_activities (
      trip_day_id, name, occasion, formality, requires_separate_outfit,
      position, selection_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
  `);
  [...days].sort((left, right) => left.date.localeCompare(right.date)).forEach((day) => {
    const dayId = insertedId(insertDay.run(tripId, day.date, now, now).lastInsertRowid, "trip day");
    day.activities.forEach((activity, position) => {
      insertActivity.run(
        dayId,
        activity.name,
        activity.occasion,
        activity.formality,
        activity.requiresSeparateOutfit ? 1 : 0,
        position,
        now,
        now
      );
    });
  });
}

function replaceTripDayRows(
  db: AppDatabase,
  tripId: number,
  days: readonly TripDayInput[],
  now: string
): void {
  clearTripOptimizationRows(db, tripId, now);
  db.prepare("DELETE FROM trip_days WHERE trip_id = ?").run(tripId);
  insertTripDays(db, tripId, days, now);
}

function clearTripOptimizationRows(db: AppDatabase, tripId: number, now: string): void {
  db.prepare(`
    UPDATE trip_day_activities
    SET selection_id = NULL, updated_at = ?
    WHERE trip_day_id IN (SELECT id FROM trip_days WHERE trip_id = ?)
  `).run(now, tripId);
  db.prepare(`
    DELETE FROM trip_outfit_selections
    WHERE trip_day_id IN (SELECT id FROM trip_days WHERE trip_id = ?)
  `).run(tripId);
  db.prepare("DELETE FROM trip_packing_items WHERE trip_id = ? AND kind = 'garment'").run(tripId);
}

function clearTripWeatherRows(db: AppDatabase, tripId: number, now: string): void {
  db.prepare(`
    UPDATE trip_days SET weather_snapshot = NULL, updated_at = ? WHERE trip_id = ?
  `).run(now, tripId);
}

function mapTrip(db: AppDatabase, row: TripRow): Trip {
  const days = listTripDays(db, row.id);
  return {
    id: row.id,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
    destination: {
      name: row.destination_name,
      ...(row.destination_latitude === null
        ? {}
        : {
            latitude: row.destination_latitude,
            longitude: row.destination_longitude!
          })
    },
    maxGarments: row.max_garments,
    maxShoes: row.max_shoes,
    repeatPolicy: row.repeat_policy,
    maxCoreWearsBetweenLaundry: row.max_core_wears_between_laundry,
    ...(row.laundry_day === null ? {} : { laundryDay: row.laundry_day }),
    status: row.status,
    days,
    selections: listTripSelections(db, days),
    packingItems: listTripPackingItems(db, row.id),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function getTripRow(db: AppDatabase, tripId: number): TripRow {
  const row = db.prepare(`
    SELECT id, name, start_date, end_date, destination_name,
      destination_latitude, destination_longitude, max_garments, max_shoes,
      repeat_policy, max_core_wears_between_laundry, laundry_day, status,
      created_at, updated_at
    FROM trips WHERE id = ?
  `).get(tripId) as unknown as TripRow | undefined;
  if (!row) throw new ApiError("NOT_FOUND", "旅行不存在", 404);
  return row;
}

function listTripDays(db: AppDatabase, tripId: number): TripDay[] {
  const rows = db.prepare(`
    SELECT id, trip_id, date, weather_snapshot
    FROM trip_days WHERE trip_id = ? ORDER BY date ASC, id ASC
  `).all(tripId) as unknown as TripDayRow[];
  const activities = db.prepare(`
    SELECT id, trip_day_id, name, occasion, formality,
      requires_separate_outfit, position
    FROM trip_day_activities WHERE trip_day_id = ? ORDER BY position ASC, id ASC
  `);
  return rows.map((row) => ({
    id: row.id,
    tripId: row.trip_id,
    date: row.date,
    activities: (activities.all(row.id) as unknown as TripActivityRow[]).map((activity) => ({
      id: activity.id,
      tripDayId: activity.trip_day_id,
      name: activity.name,
      occasion: activity.occasion,
      formality: activity.formality,
      requiresSeparateOutfit: activity.requires_separate_outfit === 1,
      position: activity.position
    })),
    ...(row.weather_snapshot === null
      ? {}
      : { weather: parseStoredWeather(row.id, row.weather_snapshot) })
  }));
}

function listTripSelections(db: AppDatabase, days: readonly TripDay[]): TripOutfitSelection[] {
  if (!days.length) return [];
  const rows = db.prepare(`
    SELECT id, trip_day_id, slot_index, activity_ids_json, garment_ids_json,
      score, reasons_json, activity_evaluations_json, locked_garment_ids_json,
      actual_wear_event_id
    FROM trip_outfit_selections
    WHERE trip_day_id IN (${days.map(() => "?").join(",")})
    ORDER BY trip_day_id ASC, slot_index ASC, id ASC
  `).all(...days.map((day) => day.id)) as unknown as TripSelectionRow[];
  return rows.map((row) => ({
    id: row.id,
    tripDayId: row.trip_day_id,
    slotIndex: row.slot_index,
    activityIds: parseStoredIdArray("trip_outfit_selections", row.id, "activity_ids_json", row.activity_ids_json),
    garments: parseStoredIdArray(
      "trip_outfit_selections",
      row.id,
      "garment_ids_json",
      row.garment_ids_json
    ).map((garmentId) => getGarmentById(db, garmentId)),
    score: row.score,
    reasons: parseStoredStringArray("trip_outfit_selections", row.id, "reasons_json", row.reasons_json),
    activityEvaluations: parseStoredActivityEvaluations(row.id, row.activity_evaluations_json),
    lockedGarmentIds: parseStoredIdArray(
      "trip_outfit_selections",
      row.id,
      "locked_garment_ids_json",
      row.locked_garment_ids_json,
      true
    ),
    ...(row.actual_wear_event_id === null ? {} : { actualWearEventId: row.actual_wear_event_id })
  }));
}

function listTripPackingItems(db: AppDatabase, tripId: number): TripPackingItem[] {
  const rows = db.prepare(`
    SELECT id, trip_id, kind, garment_id, label, status, coverage_json
    FROM trip_packing_items WHERE trip_id = ?
    ORDER BY CASE kind WHEN 'garment' THEN 0 ELSE 1 END, id ASC
  `).all(tripId) as unknown as TripPackingRow[];
  return rows.map(mapPackingRow);
}

function getPackingItem(db: AppDatabase, tripId: number, itemId: number): TripPackingItem {
  const row = db.prepare(`
    SELECT id, trip_id, kind, garment_id, label, status, coverage_json
    FROM trip_packing_items WHERE id = ? AND trip_id = ?
  `).get(itemId, tripId) as unknown as TripPackingRow | undefined;
  if (!row) throw new ApiError("NOT_FOUND", "旅行装箱项不存在", 404);
  return mapPackingRow(row);
}

function mapPackingRow(row: TripPackingRow): TripPackingItem {
  return {
    id: row.id,
    tripId: row.trip_id,
    kind: row.kind,
    ...(row.garment_id === null ? {} : { garmentId: row.garment_id }),
    label: row.label,
    status: row.status,
    coverage: parseStoredCoverage(row.id, row.coverage_json)
  };
}

function getSelectionForCompletion(db: AppDatabase, tripId: number, selectionId: number): {
  id: number;
  trip_day_id: number;
  actual_wear_event_id: number | null;
  garment_ids_json: string;
  weather_snapshot: string | null;
} {
  const row = db.prepare(`
    SELECT trip_outfit_selections.id, trip_outfit_selections.trip_day_id,
      trip_outfit_selections.actual_wear_event_id,
      trip_outfit_selections.garment_ids_json, trip_days.weather_snapshot
    FROM trip_outfit_selections
    INNER JOIN trip_days ON trip_days.id = trip_outfit_selections.trip_day_id
    WHERE trip_outfit_selections.id = ? AND trip_days.trip_id = ?
  `).get(selectionId, tripId) as {
    id: number;
    trip_day_id: number;
    actual_wear_event_id: number | null;
    garment_ids_json: string;
    weather_snapshot: string | null;
  } | undefined;
  if (!row) throw new ApiError("NOT_FOUND", "旅行搭配选择不存在", 404);
  return row;
}

function assertConfirmationReplay(event: WearEvent, confirmation: ParsedConfirmation): void {
  const same = event.wornAt === confirmation.wornAt &&
    event.timeZone === confirmation.timeZone &&
    event.occasion === confirmation.occasion &&
    (event.notes ?? "") === (confirmation.notes ?? "") &&
    arraysEqual(event.items.map((item) => item.itemId), confirmation.itemIds);
  if (!same) {
    throw new ApiError(
      "TRIP_CONFIRMATION_CONFLICT",
      "该旅行搭配已用不同内容确认实际穿着",
      409
    );
  }
}

function validateForecast(value: unknown, expectedDates: readonly string[]): WeatherSnapshot[] {
  if (!Array.isArray(value) || value.length !== expectedDates.length) {
    throw new ValidationError("天气快照必须完整覆盖旅行日期");
  }
  const snapshots = value.map((snapshot, index) => parseWeatherSnapshot(
    snapshot,
    `snapshots[${index}]`
  ));
  if (new Set(snapshots.map((snapshot) => snapshot.date)).size !== snapshots.length ||
    snapshots.some((snapshot, index) => snapshot.date !== expectedDates[index])) {
    throw new ValidationError("天气快照日期必须与旅行逐日日期一一对应");
  }
  return snapshots;
}

function parseWeatherSnapshot(value: unknown, label: string): WeatherSnapshot {
  const record = strictRecord(value, label, WEATHER_FIELDS);
  const precipitationProbability = boundedNumber(
    record.precipitationProbability,
    `${label}.precipitationProbability`,
    0,
    100
  );
  const windSpeed = boundedNumber(record.windSpeed, `${label}.windSpeed`, 0, 1000);
  return {
    date: validateCalendarDate(record.date, `${label}.date`),
    temperature: finiteNumber(record.temperature, `${label}.temperature`),
    apparentTemperature: finiteNumber(record.apparentTemperature, `${label}.apparentTemperature`),
    precipitationProbability,
    windSpeed,
    weatherCode: boundedInteger(record.weatherCode, `${label}.weatherCode`, 0, 999),
    summary: boundedString(record.summary, `${label}.summary`, 1, 200)
  };
}

function parseStoredWeather(rowId: number, value: string): WeatherSnapshot {
  try {
    return parseWeatherSnapshot(JSON.parse(value) as unknown, "weatherSnapshot");
  } catch (error) {
    throw new Error(`trip_days row ${rowId} has invalid weather_snapshot: ${errorMessage(error)}`);
  }
}

function parseStoredActivityEvaluations(
  rowId: number,
  value: string
): StoredTripActivityEvaluation[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) throw new Error("must be an array");
    return parsed.map((item) => {
      const record = strictRecord(
        item,
        "activityEvaluation",
        new Set(["activityId", "score", "weatherComfort", "occasion", "hardEligible"])
      );
      return {
        activityId: positiveId(record.activityId, "activityId"),
        score: finiteNumber(record.score, "score"),
        weatherComfort: finiteNumber(record.weatherComfort, "weatherComfort"),
        occasion: finiteNumber(record.occasion, "occasion"),
        hardEligible: strictBoolean(record.hardEligible, "hardEligible")
      };
    });
  } catch (error) {
    throw new Error(`trip_outfit_selections row ${rowId} has invalid activity evaluations: ${errorMessage(error)}`);
  }
}

function parseStoredCoverage(rowId: number, value: string): TripPackingCoverage {
  try {
    const record = strictRecord(
      JSON.parse(value) as unknown,
      "coverage",
      new Set(["dates", "activityIds", "activities", "occasions", "reasons"])
    );
    if (!Array.isArray(record.dates) || !record.dates.every((date) => typeof date === "string")) {
      throw new Error("dates must be strings");
    }
    const coverage: TripPackingCoverage = {
      dates: record.dates.map((date) => validateCalendarDate(date, "coverage.date")),
      activityIds: positiveIdArray(record.activityIds, "coverage.activityIds", true)
    };
    for (const field of ["activities", "occasions", "reasons"] as const) {
      if (record[field] === undefined) continue;
      if (!Array.isArray(record[field]) || !record[field].every((item) => typeof item === "string" && item.trim())) {
        throw new Error(`${field} must be non-empty strings`);
      }
      if (new Set(record[field]).size !== record[field].length) {
        throw new Error(`${field} must not contain duplicates`);
      }
      coverage[field] = record[field];
    }
    return coverage;
  } catch (error) {
    throw new Error(`trip_packing_items row ${rowId} has invalid coverage: ${errorMessage(error)}`);
  }
}

function parseStoredIdArray(
  table: string,
  rowId: number,
  field: string,
  value: string,
  allowEmpty = false
): number[] {
  try {
    return positiveIdArray(JSON.parse(value) as unknown, field, allowEmpty);
  } catch (error) {
    throw new Error(`${table} row ${rowId} has invalid ${field}: ${errorMessage(error)}`);
  }
}

function parseStoredStringArray(table: string, rowId: number, field: string, value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
      throw new Error("must be a string array");
    }
    return parsed;
  } catch (error) {
    throw new Error(`${table} row ${rowId} has invalid ${field}: ${errorMessage(error)}`);
  }
}

function tripToCreate(trip: Trip): ParsedTripCreate {
  return {
    name: trip.name,
    startDate: trip.startDate,
    endDate: trip.endDate,
    destination: trip.destination,
    maxGarments: trip.maxGarments,
    maxShoes: trip.maxShoes,
    repeatPolicy: trip.repeatPolicy,
    maxCoreWearsBetweenLaundry: trip.maxCoreWearsBetweenLaundry,
    ...(trip.laundryDay === undefined ? {} : { laundryDay: trip.laundryDay }),
    days: trip.days.map((day) => ({ date: day.date, activities: day.activities.map(activityInput) }))
  };
}

function activityInput(activity: TripActivity) {
  return {
    name: activity.name,
    occasion: activity.occasion,
    formality: activity.formality,
    requiresSeparateOutfit: activity.requiresSeparateOutfit
  };
}

function tripDestinationsEqual(
  left: ParsedTripCreate["destination"],
  right: ParsedTripCreate["destination"]
): boolean {
  return left.name === right.name &&
    left.latitude === right.latitude &&
    left.longitude === right.longitude;
}

function tripDaysEqual(left: readonly TripDayInput[], right: readonly TripDayInput[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort((a, b) => a.date.localeCompare(b.date));
  const sortedRight = [...right].sort((a, b) => a.date.localeCompare(b.date));
  return sortedLeft.every((day, dayIndex) => {
    const candidate = sortedRight[dayIndex];
    return day.date === candidate.date && day.activities.length === candidate.activities.length &&
      day.activities.every((activity, activityIndex) => {
        const other = candidate.activities[activityIndex];
        return activity.name === other.name && activity.occasion === other.occasion &&
          activity.formality === other.formality &&
          activity.requiresSeparateOutfit === other.requiresSeparateOutfit;
      });
  });
}

function assertTripWritable(trip: Trip): void {
  if (trip.status === "archived") throw new ApiError("TRIP_ARCHIVED", "已归档旅行不能修改", 409);
  if (trip.status === "completed") throw new ApiError("TRIP_COMPLETED", "已完成旅行不能修改", 409);
}

function strictRecord(value: unknown, label: string, fields: ReadonlySet<string>): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError(`${label}必须是 JSON 对象`);
  }
  const record = value as Record<string, unknown>;
  const unknown = Object.keys(record).find((field) => !fields.has(field));
  if (unknown) throw new ValidationError(`${label}不允许字段 ${unknown}`);
  return record;
}

function positiveId(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new ValidationError(`${field} 必须是正安全整数`);
  }
  return value;
}

function positiveIdArray(value: unknown, field: string, allowEmpty = false): number[] {
  if (!Array.isArray(value) || (!allowEmpty && !value.length) || value.length > 100) {
    throw new ValidationError(`${field} 必须是${allowEmpty ? "最多 100 项" : "1-100 项"}正整数数组`);
  }
  const ids = value.map((item, index) => positiveId(item, `${field}[${index}]`));
  if (new Set(ids).size !== ids.length) throw new ValidationError(`${field} 不能包含重复值`);
  return ids;
}

function boundedInteger(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`${field} 必须是 ${min}-${max} 的安全整数`);
  }
  return value;
}

function finiteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ValidationError(`${field} 必须是有限数字`);
  }
  return value;
}

function boundedNumber(value: unknown, field: string, min: number, max: number): number {
  const number = finiteNumber(value, field);
  if (number < min || number > max) {
    throw new ValidationError(`${field} 必须是 ${min}-${max} 的数字`);
  }
  return number;
}

function boundedString(
  value: unknown,
  field: string,
  min: number,
  max: number,
  trim = true
): string {
  if (typeof value !== "string") throw new ValidationError(`${field} 必须是字符串`);
  const normalized = trim ? value.trim() : value;
  if (normalized.length < min || normalized.length > max) {
    throw new ValidationError(`${field} 长度必须是 ${min}-${max}`);
  }
  return normalized;
}

function strictBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new ValidationError(`${field} 必须是布尔值`);
  return value;
}

function enumValue<T>(value: unknown, allowed: readonly T[], field: string): T {
  if (!allowed.includes(value as T)) {
    throw new ValidationError(`${field} 必须是 ${allowed.join("、") as string} 之一`);
  }
  return value as T;
}

function calendarDates(startDate: string, endDate: string): string[] {
  const [year, month, day] = validateCalendarDate(startDate, "startDate").split("-").map(Number);
  const end = validateCalendarDate(endDate, "endDate");
  const result: string[] = [];
  for (let offset = 0; offset <= MAX_TRIP_DAYS; offset += 1) {
    const current = new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10);
    if (current > end) break;
    result.push(current);
    if (current === end) return result;
  }
  return result;
}

function estimatedWeatherForDate(trip: Trip, date: string): WeatherSnapshot {
  const estimate = buildEstimatedWeather(
    trip.destination.latitude ?? 0,
    trip.destination.longitude ?? 0,
    new Date(`${date}T12:00:00.000Z`)
  );
  return { ...estimate, date };
}

function emptyCoverage(): TripPackingCoverage {
  return { dates: [], activityIds: [] };
}

function insertedId(value: number | bigint, entity: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`SQLite returned an invalid ${entity} id`);
  return id;
}

function inImmediateTransaction<T>(db: AppDatabase, label: string, callback: () => T): T {
  if (db.isTransaction) throw new Error(`${label} transaction cannot start inside an existing transaction`);
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = callback();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    if (db.isTransaction) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // Preserve the original service failure.
      }
    }
    throw error;
  }
}

function arraysEqual(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function finiteUpstream(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("Open-Meteo 返回了不完整的逐日天气数据");
  }
  return value;
}

function weatherSummary(code: number): string {
  if (code === 0) return "晴";
  if ([1, 2, 3].includes(code)) return "多云";
  if ([45, 48].includes(code)) return "雾";
  if ([51, 53, 55, 56, 57, 61].includes(code)) return "小雨";
  if ([63, 65, 66, 67, 80, 81, 82].includes(code)) return "雨";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "雪";
  if ([95, 96, 99].includes(code)) return "雷雨";
  return "天气";
}

function slotIndexFromId(slotId: string): number {
  const value = Number(slotId.split(":").at(-1));
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid optimizer slot id ${slotId}`);
  return value;
}

function conflictCode(code: string): ApiTripOptimizationResult extends infer _ ?
  "availability" | "required-slots" | "weather" | "occasion" | "maxGarments" |
  "maxShoes" | "repeatPolicy" | "maxCoreWearsBetweenLaundry" | "lockedGarments" |
  "searchBudget" : never {
  if (code === "REQUIRED_SLOTS" || code === "NO_CANDIDATES") return "required-slots";
  if (code === "WEATHER_THRESHOLD") return "weather";
  if (code === "OCCASION_THRESHOLD") return "occasion";
  if (code === "MAX_GARMENTS") return "maxGarments";
  if (code === "MAX_SHOES") return "maxShoes";
  if (code === "REPEAT_POLICY") return "repeatPolicy";
  if (code === "LAUNDRY_WEAR_LIMIT") return "maxCoreWearsBetweenLaundry";
  if (code === "LOCKED_GARMENT") return "lockedGarments";
  if (code === "SEARCH_BUDGET") return "searchBudget";
  return "availability";
}

function relaxationConstraint(value: string): ReturnType<typeof conflictCode> {
  const normalized = value.toUpperCase().replaceAll("-", "_");
  return conflictCode(normalized);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
