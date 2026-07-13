import type {
  MarkWornInput,
  MarkWornResult,
  OutfitOccasion,
  OutfitPlanEntry,
  OutfitPlanInput,
  OutfitPlanMutationResult,
  OutfitPlanStatus,
  OutfitPlanUpdate,
  RepeatWarning,
  WeatherSnapshot
} from "../../src/shared/types";
import type { AppDatabase } from "../db";
import { ApiError, ValidationError } from "../validation";
import {
  canonicalUtcTimestamp,
  currentWeekRange,
  getWearEvent,
  insertWearEvent,
  parseWearEventItemIds,
  validateCalendarDate,
  validateIanaTimeZone
} from "./wearEvents";

const OCCASIONS = [
  "casual",
  "smart-casual",
  "formal",
  "sport",
  "date",
  "dinner"
] as const satisfies readonly OutfitOccasion[];
const PLAN_INPUT_FIELDS = new Set([
  "plannedDate",
  "timeZone",
  "outfitId",
  "occasion",
  "weatherSnapshot",
  "notes"
]);
const PLAN_UPDATE_FIELDS = new Set([
  ...PLAN_INPUT_FIELDS,
  "status"
]);
const MARK_WORN_FIELDS = new Set([
  "wornAt",
  "timeZone",
  "outfitId",
  "occasion",
  "weatherSnapshot",
  "notes",
  "itemIds"
]);
const LIST_FIELDS = new Set(["from", "to", "timeZone"]);
const WEATHER_FIELDS = new Set([
  "date",
  "temperature",
  "apparentTemperature",
  "precipitationProbability",
  "windSpeed",
  "weatherCode",
  "summary"
]);

interface OutfitPlannerOptions {
  now?: () => Date;
}

interface OutfitPlanRow {
  id: number;
  planned_date: string;
  time_zone: string;
  outfit_id: number;
  occasion: OutfitOccasion;
  weather_snapshot: string | null;
  status: OutfitPlanStatus;
  worn_at: string | null;
  wear_event_id: number | null;
  notes: string;
}

interface PlanListQuery {
  from?: string;
  to?: string;
  timeZone: string;
}

export function listOutfitPlans(
  db: AppDatabase,
  query: unknown = {},
  options: OutfitPlannerOptions = {}
): OutfitPlanEntry[] {
  const parsed = parseListQuery(query);
  if ((parsed.from === undefined) !== (parsed.to === undefined)) {
    throw new ValidationError("from 与 to 必须同时提供");
  }
  const week = currentWeekRange(parsed.timeZone, options.now?.() ?? new Date());
  const from = parsed.from ?? week.from;
  const to = parsed.to ?? week.to;
  if (from > to) throw new ValidationError("from 不能晚于 to");
  const rows = db.prepare(`
    SELECT id, planned_date, time_zone, outfit_id, occasion, weather_snapshot,
      status, worn_at, wear_event_id, notes
    FROM outfit_plan_entries
    WHERE planned_date >= ? AND planned_date <= ?
    ORDER BY planned_date ASC, id ASC
  `).all(from, to) as unknown as OutfitPlanRow[];
  return rows.map(mapPlanRow);
}

export function createOutfitPlan(
  db: AppDatabase,
  input: unknown,
  options: OutfitPlannerOptions = {}
): OutfitPlanMutationResult {
  const parsed = parsePlanInput(input);
  return inImmediateTransaction(db, () => {
    assertOutfitCanBePlanned(db, parsed.outfitId);
    assertWeatherMatchesDate(parsed.weatherSnapshot, parsed.plannedDate);
    const repeatWarning = findRepeatWarning(db, parsed);
    const now = (options.now?.() ?? new Date()).toISOString();
    const result = db.prepare(`
      INSERT INTO outfit_plan_entries (
        planned_date, time_zone, outfit_id, occasion, weather_snapshot,
        status, worn_at, wear_event_id, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'planned', NULL, NULL, ?, ?, ?)
    `).run(
      parsed.plannedDate,
      parsed.timeZone,
      parsed.outfitId,
      parsed.occasion,
      parsed.weatherSnapshot === undefined ? null : JSON.stringify(parsed.weatherSnapshot),
      parsed.notes ?? "",
      now,
      now
    );
    const id = insertedId(result.lastInsertRowid, "outfit plan");
    return {
      entry: getOutfitPlan(db, id),
      ...(repeatWarning === undefined ? {} : { repeatWarning })
    };
  });
}

export function updateOutfitPlan(
  db: AppDatabase,
  id: number,
  input: unknown,
  options: OutfitPlannerOptions = {}
): OutfitPlanMutationResult {
  const planId = positiveId(id, "outfitPlanId");
  const update = parsePlanUpdate(input);
  return inImmediateTransaction(db, () => {
    const current = getOutfitPlan(db, planId);
    if (current.status === "worn") {
      throw new ApiError("PLAN_ALREADY_WORN", "已穿计划不能再编辑，请修改对应穿着记录", 409);
    }
    const plannedDate = update.plannedDate ?? current.plannedDate;
    const weatherSnapshot = update.weatherSnapshot === null
      ? undefined
      : update.weatherSnapshot !== undefined
        ? update.weatherSnapshot
        : update.plannedDate !== undefined && update.plannedDate !== current.plannedDate
          ? undefined
          : current.weatherSnapshot;
    const notes = update.notes === null
      ? undefined
      : update.notes ?? current.notes;
    const merged: OutfitPlanInput & { status: "planned" | "skipped" } = {
      plannedDate,
      timeZone: update.timeZone ?? current.timeZone,
      outfitId: update.outfitId ?? current.outfitId,
      occasion: update.occasion ?? current.occasion,
      ...(weatherSnapshot === undefined ? {} : { weatherSnapshot }),
      ...(notes === undefined ? {} : { notes }),
      status: update.status ?? (current.status === "skipped" ? "skipped" : "planned")
    };
    assertOutfitCanBePlanned(db, merged.outfitId);
    assertWeatherMatchesDate(merged.weatherSnapshot, merged.plannedDate);
    const repeatWarning = merged.status === "skipped"
      ? undefined
      : findRepeatWarning(db, merged, planId);
    db.prepare(`
      UPDATE outfit_plan_entries
      SET planned_date = ?, time_zone = ?, outfit_id = ?, occasion = ?,
        weather_snapshot = ?, status = ?, notes = ?, updated_at = ?
      WHERE id = ?
    `).run(
      merged.plannedDate,
      merged.timeZone,
      merged.outfitId,
      merged.occasion,
      merged.weatherSnapshot === undefined ? null : JSON.stringify(merged.weatherSnapshot),
      merged.status,
      merged.notes ?? "",
      (options.now?.() ?? new Date()).toISOString(),
      planId
    );
    return {
      entry: getOutfitPlan(db, planId),
      ...(repeatWarning === undefined ? {} : { repeatWarning })
    };
  });
}

export function deleteOutfitPlan(db: AppDatabase, id: number): OutfitPlanEntry {
  const planId = positiveId(id, "outfitPlanId");
  return inImmediateTransaction(db, () => {
    const current = getOutfitPlan(db, planId);
    db.prepare("DELETE FROM outfit_plan_entries WHERE id = ?").run(planId);
    return current;
  });
}

export function markOutfitPlanWorn(
  db: AppDatabase,
  id: number,
  input: unknown,
  options: OutfitPlannerOptions = {}
): MarkWornResult {
  const planId = positiveId(id, "outfitPlanId");
  const parsed = parseMarkWornInput(input);
  return inImmediateTransaction(db, () => {
    const plan = getOutfitPlan(db, planId);
    if (plan.status === "worn" && plan.wearEventId !== undefined) {
      return { plan, wearEvent: getWearEvent(db, plan.wearEventId) };
    }
    const outfitId = parsed.outfitId === undefined ? plan.outfitId : parsed.outfitId ?? undefined;
    const itemIds = parsed.itemIds ?? outfitItemIds(db, outfitId ?? plan.outfitId);
    const weatherSnapshot = parsed.weatherSnapshot ?? plan.weatherSnapshot;
    const notes = parsed.notes === null ? undefined : parsed.notes ?? plan.notes;
    assertWeatherMatchesDate(weatherSnapshot, plan.plannedDate);
    const wearEvent = insertWearEvent(db, {
      wornAt: parsed.wornAt,
      timeZone: parsed.timeZone,
      ...(outfitId === undefined ? {} : { outfitId }),
      occasion: parsed.occasion ?? plan.occasion,
      ...(weatherSnapshot === undefined ? {} : { weatherSnapshot }),
      ...(notes === undefined ? {} : { notes }),
      itemIds
    }, options);
    db.prepare(`
      UPDATE outfit_plan_entries
      SET status = 'worn', worn_at = ?, wear_event_id = ?, updated_at = ?
      WHERE id = ?
    `).run(
      wearEvent.wornAt,
      wearEvent.id,
      (options.now?.() ?? new Date()).toISOString(),
      planId
    );
    return { plan: getOutfitPlan(db, planId), wearEvent };
  });
}

export function getOutfitPlan(db: AppDatabase, id: number): OutfitPlanEntry {
  const planId = positiveId(id, "outfitPlanId");
  const row = db.prepare(`
    SELECT id, planned_date, time_zone, outfit_id, occasion, weather_snapshot,
      status, worn_at, wear_event_id, notes
    FROM outfit_plan_entries
    WHERE id = ?
  `).get(planId) as unknown as OutfitPlanRow | undefined;
  if (!row) throw new ApiError("NOT_FOUND", "穿搭计划不存在", 404);
  return mapPlanRow(row);
}

function parsePlanInput(value: unknown): OutfitPlanInput {
  const record = strictRecord(value, "穿搭计划", PLAN_INPUT_FIELDS);
  return {
    plannedDate: validateCalendarDate(record.plannedDate, "plannedDate"),
    timeZone: validateIanaTimeZone(record.timeZone),
    outfitId: positiveId(record.outfitId, "outfitId"),
    occasion: parseOccasion(record.occasion),
    ...(record.weatherSnapshot === undefined
      ? {}
      : { weatherSnapshot: parseWeatherSnapshot(record.weatherSnapshot) }),
    ...(record.notes === undefined || record.notes === null ? {} : { notes: parseNotes(record.notes) })
  };
}

function parsePlanUpdate(value: unknown): OutfitPlanUpdate {
  const record = strictRecord(value, "穿搭计划更新", PLAN_UPDATE_FIELDS);
  if (!Object.keys(record).length) throw new ValidationError("穿搭计划更新至少包含一个字段");
  return {
    ...(record.plannedDate === undefined
      ? {}
      : { plannedDate: validateCalendarDate(record.plannedDate, "plannedDate") }),
    ...(record.timeZone === undefined ? {} : { timeZone: validateIanaTimeZone(record.timeZone) }),
    ...(record.outfitId === undefined ? {} : { outfitId: positiveId(record.outfitId, "outfitId") }),
    ...(record.occasion === undefined ? {} : { occasion: parseOccasion(record.occasion) }),
    ...(record.weatherSnapshot === undefined
      ? {}
      : record.weatherSnapshot === null
        ? { weatherSnapshot: null }
        : { weatherSnapshot: parseWeatherSnapshot(record.weatherSnapshot) }),
    ...(record.status === undefined ? {} : { status: parseEditableStatus(record.status) }),
    ...(record.notes === undefined
      ? {}
      : record.notes === null
        ? { notes: null }
        : { notes: parseNotes(record.notes) })
  };
}

function parseMarkWornInput(value: unknown): MarkWornInput {
  const record = strictRecord(value, "标记已穿请求", MARK_WORN_FIELDS);
  return {
    wornAt: canonicalUtcTimestamp(record.wornAt),
    timeZone: validateIanaTimeZone(record.timeZone),
    ...(record.outfitId === undefined
      ? {}
      : record.outfitId === null
        ? { outfitId: null }
        : { outfitId: positiveId(record.outfitId, "outfitId") }),
    ...(record.occasion === undefined ? {} : { occasion: parseOccasion(record.occasion) }),
    ...(record.weatherSnapshot === undefined
      ? {}
      : { weatherSnapshot: parseWeatherSnapshot(record.weatherSnapshot) }),
    ...(record.notes === undefined
      ? {}
      : record.notes === null
        ? { notes: null }
        : { notes: parseNotes(record.notes) }),
    ...(record.itemIds === undefined ? {} : { itemIds: parseWearEventItemIds(record.itemIds) })
  };
}

function parseListQuery(value: unknown): PlanListQuery {
  const record = strictRecord(value, "穿搭计划查询", LIST_FIELDS);
  return {
    ...(record.from === undefined ? {} : { from: validateCalendarDate(record.from, "from") }),
    ...(record.to === undefined ? {} : { to: validateCalendarDate(record.to, "to") }),
    timeZone: validateIanaTimeZone(record.timeZone ?? "UTC")
  };
}

function assertOutfitCanBePlanned(db: AppDatabase, outfitId: number): void {
  const outfit = db.prepare("SELECT id FROM saved_outfits WHERE id = ?").get(outfitId);
  if (!outfit) throw new ApiError("NOT_FOUND", "保存的搭配不存在", 404);
  outfitItemIds(db, outfitId);
}

function outfitItemIds(db: AppDatabase, outfitId: number): number[] {
  const rows = db.prepare(`
    SELECT garment_id
    FROM saved_outfit_items
    WHERE outfit_id = ?
    ORDER BY
      CASE slot
        WHEN 'top' THEN 0 WHEN 'bottom' THEN 1 WHEN 'dress' THEN 2
        WHEN 'outerwear' THEN 3 WHEN 'shoes' THEN 4 ELSE 5
      END,
      position ASC,
      id ASC
  `).all(outfitId) as Array<{ garment_id: number | null }>;
  if (!rows.length) throw new ValidationError("保存的搭配不包含衣物");
  if (rows.some((row) => row.garment_id === null)) {
    throw new ValidationError("保存的搭配包含已删除衣物，无法标记为已穿");
  }
  return rows.map((row) => row.garment_id!);
}

function findRepeatWarning(
  db: AppDatabase,
  input: OutfitPlanInput,
  excludedPlanId?: number
): RepeatWarning | undefined {
  const windowDays = repeatWindow(input.occasion);
  if (windowDays === 0) return undefined;
  const signature = itemSignature(outfitItemIds(db, input.outfitId));
  const earliest = addDays(input.plannedDate, -windowDays);
  const latest = addDays(input.plannedDate, windowDays);
  let previousDate: string | undefined;
  const plans = db.prepare(`
    SELECT id, planned_date, outfit_id
    FROM outfit_plan_entries
    WHERE status <> 'skipped'
      AND planned_date >= ? AND planned_date <= ?
      AND (? IS NULL OR id <> ?)
    ORDER BY planned_date ASC, id ASC
  `).all(earliest, latest, excludedPlanId ?? null, excludedPlanId ?? null) as Array<{
    id: number;
    planned_date: string;
    outfit_id: number;
  }>;
  for (const plan of plans) {
    if (itemSignature(outfitItemIds(db, plan.outfit_id)) === signature) {
      previousDate = closerRepeatDate(previousDate, plan.planned_date, input.plannedDate);
    }
  }

  const eventRows = db.prepare(`
    SELECT id, worn_at, time_zone
    FROM wear_events
    ORDER BY worn_at DESC, id DESC
  `).all() as Array<{ id: number; worn_at: string; time_zone: string }>;
  for (const event of eventRows) {
    const eventDate = dateInZone(new Date(event.worn_at), event.time_zone);
    if (eventDate < earliest || eventDate > latest) continue;
    const ids = (db.prepare(`
      SELECT item_id FROM wear_event_items WHERE wear_event_id = ? ORDER BY position, id
    `).all(event.id) as Array<{ item_id: number }>).map((row) => row.item_id);
    if (itemSignature(ids) !== signature) continue;
    previousDate = closerRepeatDate(previousDate, eventDate, input.plannedDate);
  }
  if (previousDate === undefined) return undefined;
  return {
    code: "RECENT_OUTFIT_REPEAT",
    windowDays,
    previousDate,
    message: `这套搭配在 ${windowDays} 天提醒窗口内已经安排或穿过；你仍可保留计划，或换一件。`,
    canIgnore: true,
    action: "replace-one-item"
  };
}

function repeatWindow(occasion: OutfitOccasion): 0 | 14 | 28 {
  if (occasion === "formal") return 28;
  if (occasion === "date" || occasion === "dinner") return 14;
  return 0;
}

function mapPlanRow(row: OutfitPlanRow): OutfitPlanEntry {
  return {
    id: row.id,
    plannedDate: row.planned_date,
    timeZone: row.time_zone,
    outfitId: row.outfit_id,
    occasion: row.occasion,
    ...(row.weather_snapshot === null
      ? {}
      : { weatherSnapshot: parseStoredWeather(row.id, row.weather_snapshot) }),
    status: row.status,
    ...(row.worn_at === null ? {} : { wornAt: row.worn_at }),
    ...(row.wear_event_id === null ? {} : { wearEventId: row.wear_event_id }),
    ...(row.notes ? { notes: row.notes } : {})
  };
}

function parseStoredWeather(rowId: number, value: string): WeatherSnapshot {
  try {
    return parseWeatherSnapshot(JSON.parse(value) as unknown);
  } catch (error) {
    throw new Error(`outfit_plan_entries row ${rowId} has invalid weather_snapshot: ${errorMessage(error)}`);
  }
}

function parseWeatherSnapshot(value: unknown): WeatherSnapshot {
  const record = strictRecord(value, "weatherSnapshot", WEATHER_FIELDS);
  return {
    date: validateCalendarDate(record.date, "weatherSnapshot.date"),
    temperature: finiteNumber(record.temperature, "weatherSnapshot.temperature"),
    apparentTemperature: finiteNumber(record.apparentTemperature, "weatherSnapshot.apparentTemperature"),
    precipitationProbability: finiteNumber(record.precipitationProbability, "weatherSnapshot.precipitationProbability"),
    windSpeed: finiteNumber(record.windSpeed, "weatherSnapshot.windSpeed"),
    weatherCode: finiteNumber(record.weatherCode, "weatherSnapshot.weatherCode"),
    summary: nonEmptyString(record.summary, "weatherSnapshot.summary", 200)
  };
}

function assertWeatherMatchesDate(weather: WeatherSnapshot | undefined, plannedDate: string): void {
  if (weather !== undefined && weather.date !== plannedDate) {
    throw new ValidationError("weatherSnapshot.date 必须与 plannedDate 一致");
  }
}

function parseOccasion(value: unknown): OutfitOccasion {
  if (typeof value !== "string" || !OCCASIONS.includes(value as OutfitOccasion)) {
    throw new ValidationError(`occasion 必须是 ${OCCASIONS.join("、")} 之一`);
  }
  return value as OutfitOccasion;
}

function parseEditableStatus(value: unknown): "planned" | "skipped" {
  if (value !== "planned" && value !== "skipped") {
    throw new ValidationError("status 只能由计划编辑设为 planned 或 skipped；worn 必须使用 mark-worn");
  }
  return value;
}

function parseNotes(value: unknown): string {
  if (typeof value !== "string" || value.length > 4000) {
    throw new ValidationError("notes 必须是最多 4000 个字符的字符串");
  }
  return value;
}

function strictRecord(value: unknown, label: string, fields: ReadonlySet<string>): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError(`${label}必须是 JSON 对象`);
  }
  const record = value as Record<string, unknown>;
  const unknown = Object.keys(record).find((key) => !fields.has(key));
  if (unknown) throw new ValidationError(`${label}包含不允许的字段 ${unknown}`);
  return record;
}

function positiveId(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new ValidationError(`${field} 必须是正整数`);
  }
  return Number(value);
}

function finiteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ValidationError(`${field} 必须是有限数字`);
  }
  return value;
}

function nonEmptyString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || !value || value.length > maxLength) {
    throw new ValidationError(`${field} 必须是 1-${maxLength} 个字符的字符串`);
  }
  return value;
}

function insertedId(value: number | bigint, entity: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`SQLite returned an invalid ${entity} id`);
  return id;
}

function itemSignature(ids: readonly number[]): string {
  return [...ids].sort((left, right) => left - right).join(",");
}

function addDays(dateKey: string, days: number): string {
  const [year, month, day] = validateCalendarDate(dateKey).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${String(date.getUTCFullYear()).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function closerRepeatDate(
  current: string | undefined,
  candidate: string,
  target: string
): string {
  if (current === undefined) return candidate;
  const currentDistance = calendarDayDistance(current, target);
  const candidateDistance = calendarDayDistance(candidate, target);
  if (candidateDistance < currentDistance) return candidate;
  if (candidateDistance > currentDistance) return current;
  return candidate < current ? candidate : current;
}

function calendarDayDistance(left: string, right: string): number {
  const [leftYear, leftMonth, leftDay] = validateCalendarDate(left).split("-").map(Number);
  const [rightYear, rightMonth, rightDay] = validateCalendarDate(right).split("-").map(Number);
  return Math.abs(
    Date.UTC(leftYear, leftMonth - 1, leftDay) -
    Date.UTC(rightYear, rightMonth - 1, rightDay)
  ) / 86_400_000;
}

function dateInZone(date: Date, timeZone: string): string {
  validateIanaTimeZone(timeZone);
  const values = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone,
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function inImmediateTransaction<T>(db: AppDatabase, callback: () => T): T {
  if (db.isTransaction) throw new Error("Outfit planner transaction cannot start inside an existing transaction");
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
        // Preserve the original planner failure.
      }
    }
    throw error;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
