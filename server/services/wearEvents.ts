import type {
  JsonValue,
  OutfitOccasion,
  WearEvent,
  WearEventInput,
  WearEventItem,
  WearEventLegacySnapshot,
  WearEventPage,
  WeatherSnapshot
} from "../../src/shared/types";
import type { AppDatabase } from "../db";
import { ApiError, ValidationError } from "../validation";

const OCCASIONS = [
  "casual",
  "smart-casual",
  "formal",
  "sport",
  "date",
  "dinner"
] as const satisfies readonly OutfitOccasion[];
const WEAR_EVENT_INPUT_FIELDS = new Set([
  "wornAt",
  "timeZone",
  "outfitId",
  "occasion",
  "weatherSnapshot",
  "notes",
  "itemIds"
]);
const WEAR_EVENT_UPDATE_FIELDS = WEAR_EVENT_INPUT_FIELDS;
const WEATHER_FIELDS = new Set([
  "date",
  "temperature",
  "apparentTemperature",
  "precipitationProbability",
  "windSpeed",
  "weatherCode",
  "summary"
]);
const LIST_FIELDS = new Set(["from", "to", "timeZone", "cursor", "limit"]);
const MAX_EVENT_ITEMS = 24;
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;

interface WearEventServiceOptions {
  now?: () => Date;
}

interface WearEventQuery {
  from?: string;
  to?: string;
  timeZone: string;
  cursor?: string;
  limit: number;
}

interface WearEventRow {
  id: number;
  worn_at: string;
  time_zone: string;
  outfit_id: number | null;
  occasion: OutfitOccasion;
  weather_snapshot: string | null;
  notes: string;
  legacy_snapshot: string | null;
}

interface WearEventItemRow {
  id: number;
  wear_event_id: number;
  item_id: number;
  position: number;
}

interface EventCursor {
  wornAt: string;
  id: number;
}

interface FeedbackPairAccumulator {
  garmentAId: number;
  garmentBId: number;
  likes: number;
  dislikes: number;
  wornCount: number;
  totalFeedback: number;
}

export function listWearEvents(
  db: AppDatabase,
  query: unknown = {},
  options: WearEventServiceOptions = {}
): WearEventPage {
  const parsed = parseWearEventQuery(query);
  const defaultRange = currentWeekRange(parsed.timeZone, options.now?.() ?? new Date());
  const from = parsed.from ?? defaultRange.from;
  const to = parsed.to ?? defaultRange.to;
  if ((parsed.from === undefined) !== (parsed.to === undefined)) {
    throw new ValidationError("from 与 to 必须同时提供");
  }
  if (compareDateKeys(from, to) > 0) {
    throw new ValidationError("from 不能晚于 to");
  }
  const start = zonedCalendarStart(from, parsed.timeZone).toISOString();
  const end = zonedCalendarStart(addCalendarDays(to, 1), parsed.timeZone).toISOString();
  const cursor = parsed.cursor === undefined ? undefined : decodeCursor(parsed.cursor);
  const rows = db.prepare(`
    SELECT id, worn_at, time_zone, outfit_id, occasion, weather_snapshot, notes, legacy_snapshot
    FROM wear_events
    WHERE worn_at >= ? AND worn_at < ?
      AND (
        ? IS NULL OR worn_at < ? OR (worn_at = ? AND id < ?)
      )
    ORDER BY worn_at DESC, id DESC
    LIMIT ?
  `).all(
    start,
    end,
    cursor?.wornAt ?? null,
    cursor?.wornAt ?? null,
    cursor?.wornAt ?? null,
    cursor?.id ?? null,
    parsed.limit + 1
  ) as unknown as WearEventRow[];
  const hasMore = rows.length > parsed.limit;
  const selected = hasMore ? rows.slice(0, parsed.limit) : rows;
  const events = selected.map((row) => mapWearEvent(db, row));
  return {
    events,
    ...(hasMore && events.length
      ? { nextCursor: encodeCursor({ wornAt: events.at(-1)!.wornAt, id: events.at(-1)!.id }) }
      : {})
  };
}

export function createWearEvent(
  db: AppDatabase,
  input: unknown,
  options: WearEventServiceOptions = {}
): WearEvent {
  return inImmediateTransaction(db, "Wear event", () => insertWearEvent(db, input, options));
}

export function insertWearEvent(
  db: AppDatabase,
  input: unknown,
  options: WearEventServiceOptions = {}
): WearEvent {
  const parsed = parseWearEventInput(input);
  assertWearReferences(db, parsed);
  const now = (options.now?.() ?? new Date()).toISOString();
  const result = db.prepare(`
    INSERT INTO wear_events (
      worn_at, time_zone, outfit_id, occasion, weather_snapshot, notes,
      legacy_snapshot, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
  `).run(
    parsed.wornAt,
    parsed.timeZone,
    parsed.outfitId ?? null,
    parsed.occasion,
    parsed.weatherSnapshot === undefined ? null : JSON.stringify(parsed.weatherSnapshot),
    parsed.notes ?? "",
    now,
    now
  );
  const eventId = insertedId(result.lastInsertRowid, "wear event");
  insertWearEventItems(db, eventId, parsed.itemIds);
  return getWearEvent(db, eventId);
}

export function updateWearEvent(
  db: AppDatabase,
  id: number,
  input: unknown,
  options: WearEventServiceOptions = {}
): WearEvent {
  const eventId = positiveId(id, "wearEventId");
  const update = parseWearEventUpdate(input);
  return inImmediateTransaction(db, "Wear event", () => {
    const current = getWearEvent(db, eventId);
    const outfitId = update.outfitId === null
      ? undefined
      : update.outfitId ?? current.outfitId;
    const notes = update.notes === null
      ? undefined
      : update.notes ?? current.notes;
    const merged: WearEventInput = {
      wornAt: update.wornAt ?? current.wornAt,
      timeZone: update.timeZone ?? current.timeZone,
      ...(outfitId === undefined ? {} : { outfitId }),
      occasion: update.occasion ?? current.occasion,
      ...(update.weatherSnapshot !== undefined
        ? { weatherSnapshot: update.weatherSnapshot }
        : current.weatherSnapshot === undefined ? {} : { weatherSnapshot: current.weatherSnapshot }),
      ...(notes === undefined ? {} : { notes }),
      itemIds: update.itemIds ?? current.items.map((item) => item.itemId)
    };
    assertWearReferences(db, merged);
    const now = (options.now?.() ?? new Date()).toISOString();
    db.prepare(`
      UPDATE wear_events
      SET worn_at = ?, time_zone = ?, outfit_id = ?, occasion = ?,
        weather_snapshot = ?, notes = ?, updated_at = ?
      WHERE id = ?
    `).run(
      merged.wornAt,
      merged.timeZone,
      merged.outfitId ?? null,
      merged.occasion,
      merged.weatherSnapshot === undefined ? null : JSON.stringify(merged.weatherSnapshot),
      merged.notes ?? "",
      now,
      eventId
    );
    if (update.itemIds !== undefined) {
      db.prepare("DELETE FROM wear_event_items WHERE wear_event_id = ?").run(eventId);
      insertWearEventItems(db, eventId, merged.itemIds);
    }
    return getWearEvent(db, eventId);
  });
}

export function deleteWearEvent(db: AppDatabase, id: number): WearEvent {
  const eventId = positiveId(id, "wearEventId");
  return inImmediateTransaction(db, "Wear event", () => {
    const current = getWearEvent(db, eventId);
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE outfit_plan_entries
      SET status = 'planned', worn_at = NULL, wear_event_id = NULL, updated_at = ?
      WHERE wear_event_id = ?
    `).run(now, eventId);
    retractFeedbackWearFacts(db, eventId, now);
    db.prepare("DELETE FROM wear_events WHERE id = ?").run(eventId);
    return current;
  });
}

export function getWearEvent(db: AppDatabase, id: number): WearEvent {
  const eventId = positiveId(id, "wearEventId");
  const row = db.prepare(`
    SELECT id, worn_at, time_zone, outfit_id, occasion, weather_snapshot, notes, legacy_snapshot
    FROM wear_events
    WHERE id = ?
  `).get(eventId) as unknown as WearEventRow | undefined;
  if (!row) throw new ApiError("NOT_FOUND", "穿着记录不存在", 404);
  return mapWearEvent(db, row);
}

export function canonicalUtcTimestamp(value: unknown, field = "wornAt"): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ValidationError(`${field} 必须是带 UTC offset 的时间戳`);
  }
  if (!/T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    throw new ValidationError(`${field} 必须包含 Z 或 UTC offset`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new ValidationError(`${field} 不是有效时间戳`);
  }
  return parsed.toISOString();
}

export function validateIanaTimeZone(value: unknown, field = "timeZone"): string {
  if (typeof value !== "string" || !value || value !== value.trim() || value.length > 255) {
    throw new ValidationError(`${field} 必须是有效 IANA 时区`);
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
  } catch {
    throw new ValidationError(`${field} 必须是有效 IANA 时区`);
  }
  return value;
}

export function validateCalendarDate(value: unknown, field = "plannedDate"): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ValidationError(`${field} 必须是 YYYY-MM-DD 本地日期，不能包含时间`);
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    throw new ValidationError(`${field} 不是有效日历日期`);
  }
  return value;
}

export function currentWeekRange(timeZone: string, now: Date): { from: string; to: string } {
  validateIanaTimeZone(timeZone);
  if (!Number.isFinite(now.getTime())) throw new ValidationError("当前时间无效");
  const today = dateKeyInZone(now, timeZone);
  const [year, month, day] = today.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const from = addCalendarDays(today, mondayOffset);
  return { from, to: addCalendarDays(from, 6) };
}

function parseWearEventInput(value: unknown): WearEventInput {
  const record = strictRecord(value, "穿着记录", WEAR_EVENT_INPUT_FIELDS);
  if (!("itemIds" in record)) throw new ValidationError("itemIds 是必填字段");
  return {
    wornAt: canonicalUtcTimestamp(record.wornAt),
    timeZone: validateIanaTimeZone(record.timeZone),
    ...(record.outfitId === undefined || record.outfitId === null
      ? {}
      : { outfitId: positiveId(record.outfitId, "outfitId") }),
    occasion: parseOccasion(record.occasion),
    ...(record.weatherSnapshot === undefined
      ? {}
      : { weatherSnapshot: parseWeatherSnapshot(record.weatherSnapshot) }),
    ...(record.notes === undefined || record.notes === null ? {} : { notes: parseNotes(record.notes) }),
    itemIds: parseWearEventItemIds(record.itemIds)
  };
}

function parseWearEventUpdate(value: unknown): Partial<WearEventInput> {
  const record = strictRecord(value, "穿着记录更新", WEAR_EVENT_UPDATE_FIELDS);
  if (!Object.keys(record).length) throw new ValidationError("穿着记录更新至少包含一个字段");
  return {
    ...(record.wornAt === undefined ? {} : { wornAt: canonicalUtcTimestamp(record.wornAt) }),
    ...(record.timeZone === undefined ? {} : { timeZone: validateIanaTimeZone(record.timeZone) }),
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

function parseWearEventQuery(value: unknown): WearEventQuery {
  const record = strictRecord(value, "穿着记录查询", LIST_FIELDS);
  const timeZone = validateIanaTimeZone(record.timeZone ?? "UTC");
  const from = record.from === undefined ? undefined : validateCalendarDate(record.from, "from");
  const to = record.to === undefined ? undefined : validateCalendarDate(record.to, "to");
  const cursor = record.cursor === undefined ? undefined : nonEmptyString(record.cursor, "cursor", 2048);
  const limitValue = typeof record.limit === "string" && /^\d+$/.test(record.limit)
    ? Number(record.limit)
    : record.limit;
  const limit = record.limit === undefined ? DEFAULT_PAGE_SIZE : boundedInteger(limitValue, "limit", 1, MAX_PAGE_SIZE);
  return { from, to, timeZone, cursor, limit };
}

function assertWearReferences(db: AppDatabase, input: WearEventInput): void {
  if (input.outfitId !== undefined && input.outfitId !== null) {
    const outfit = db.prepare("SELECT id FROM saved_outfits WHERE id = ?").get(input.outfitId);
    if (!outfit) throw new ApiError("NOT_FOUND", `保存搭配 ${input.outfitId} 不存在`, 404);
  }
  const find = db.prepare("SELECT id FROM garments WHERE id = ?");
  for (const itemId of input.itemIds) {
    if (!find.get(itemId)) throw new ValidationError(`衣物 ${itemId} 不存在`);
  }
}

function insertWearEventItems(db: AppDatabase, eventId: number, itemIds: readonly number[]): void {
  const insert = db.prepare(`
    INSERT INTO wear_event_items (wear_event_id, item_id, position)
    VALUES (?, ?, ?)
  `);
  itemIds.forEach((itemId, position) => insert.run(eventId, itemId, position));
}

function mapWearEvent(db: AppDatabase, row: WearEventRow): WearEvent {
  const itemRows = db.prepare(`
    SELECT id, wear_event_id, item_id, position
    FROM wear_event_items
    WHERE wear_event_id = ?
    ORDER BY position ASC, id ASC
  `).all(row.id) as unknown as WearEventItemRow[];
  return {
    id: row.id,
    wornAt: row.worn_at,
    timeZone: row.time_zone,
    ...(row.outfit_id === null ? {} : { outfitId: row.outfit_id }),
    occasion: row.occasion,
    ...(row.weather_snapshot === null
      ? {}
      : { weatherSnapshot: parseStoredWeather(row.id, row.weather_snapshot) }),
    ...(row.notes ? { notes: row.notes } : {}),
    items: itemRows.map(mapWearEventItem),
    ...(row.legacy_snapshot === null
      ? {}
      : { legacySnapshot: parseStoredLegacySnapshot(row.id, row.legacy_snapshot) })
  };
}

function mapWearEventItem(row: WearEventItemRow): WearEventItem {
  return {
    id: row.id,
    wearEventId: row.wear_event_id,
    itemId: row.item_id,
    position: row.position
  };
}

function parseStoredWeather(rowId: number, value: string): WeatherSnapshot {
  try {
    return parseWeatherSnapshot(JSON.parse(value) as unknown);
  } catch (error) {
    throw new Error(`wear_events row ${rowId} has invalid weather_snapshot: ${errorMessage(error)}`);
  }
}

function parseStoredLegacySnapshot(rowId: number, value: string): WearEventLegacySnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error(`wear_events row ${rowId} has invalid legacy_snapshot JSON`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`wear_events row ${rowId} legacy_snapshot must be an object`);
  }
  const record = parsed as Record<string, unknown>;
  if (!Array.isArray(record.originalGarmentIds) ||
    !record.originalGarmentIds.every((id) => Number.isSafeInteger(id) && Number(id) > 0) ||
    !isJsonValue(record.originalContext)) {
    throw new Error(`wear_events row ${rowId} has invalid legacy_snapshot shape`);
  }
  return {
    originalGarmentIds: record.originalGarmentIds as number[],
    originalContext: record.originalContext
  };
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

function parseOccasion(value: unknown): OutfitOccasion {
  if (typeof value !== "string" || !OCCASIONS.includes(value as OutfitOccasion)) {
    throw new ValidationError(`occasion 必须是 ${OCCASIONS.join("、")} 之一`);
  }
  return value as OutfitOccasion;
}

export function parseWearEventItemIds(value: unknown): number[] {
  if (!Array.isArray(value) || !value.length || value.length > MAX_EVENT_ITEMS) {
    throw new ValidationError(`itemIds 必须是 1-${MAX_EVENT_ITEMS} 项正整数数组`);
  }
  const result = value.map((id, index) => positiveId(id, `itemIds[${index}]`));
  if (new Set(result).size !== result.length) throw new ValidationError("itemIds 不能重复");
  return result;
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

function boundedInteger(value: unknown, field: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) {
    throw new ValidationError(`${field} 必须是 ${min}-${max} 的整数`);
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

function encodeCursor(cursor: EventCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: string): EventCursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("shape");
    const record = parsed as Record<string, unknown>;
    if (Object.keys(record).length !== 2 || typeof record.wornAt !== "string" ||
      !Number.isSafeInteger(record.id) || Number(record.id) <= 0 ||
      canonicalUtcTimestamp(record.wornAt, "cursor.wornAt") !== record.wornAt) {
      throw new Error("shape");
    }
    return { wornAt: record.wornAt, id: Number(record.id) };
  } catch {
    throw new ValidationError("cursor 无效");
  }
}

function dateKeyInZone(date: Date, timeZone: string): string {
  const parts = dateParts(date, timeZone);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function zonedCalendarStart(dateKey: string, timeZone: string): Date {
  validateCalendarDate(dateKey);
  validateIanaTimeZone(timeZone);
  const [year, month, day] = dateKey.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day, 0, 0, 0);
  let guess = target;
  for (let pass = 0; pass < 6; pass += 1) {
    const parts = dateParts(new Date(guess), timeZone, true);
    const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const adjustment = target - represented;
    guess += adjustment;
    if (adjustment === 0) break;
  }
  const actual = dateParts(new Date(guess), timeZone, true);
  if (actual.year !== year || actual.month !== month || actual.day !== day || actual.hour !== 0) {
    throw new ValidationError(`${dateKey} 在时区 ${timeZone} 中没有有效的本地午夜`);
  }
  return new Date(guess);
}

function dateParts(date: Date, timeZone: string, includeTime = false): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(includeTime
      ? { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" as const }
      : {})
  });
  const values = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: includeTime ? Number(values.hour) : 0,
    minute: includeTime ? Number(values.minute) : 0,
    second: includeTime ? Number(values.second) : 0
  };
}

function addCalendarDays(dateKey: string, days: number): string {
  const [year, month, day] = validateCalendarDate(dateKey).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${String(date.getUTCFullYear()).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function compareDateKeys(left: string, right: string): number {
  return left.localeCompare(right);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return Boolean(value) && typeof value === "object" &&
    Object.values(value as Record<string, unknown>).every(isJsonValue);
}

function retractFeedbackWearFacts(db: AppDatabase, eventId: number, updatedAt: string): void {
  db.prepare(`
    UPDATE recommendation_feedback
    SET actually_worn = 0,
      wear_log_id = NULL,
      wear_event_id = NULL,
      updated_at = ?
    WHERE wear_event_id = ? OR wear_log_id = ?
  `).run(updatedAt, eventId, eventId);
  db.prepare(`
    DELETE FROM recommendation_feedback
    WHERE actually_worn = 0
      AND wear_log_id IS NULL
      AND wear_event_id IS NULL
      AND verdict IS NULL
      AND rating IS NULL
      AND json_array_length(reason_codes_json) = 0
      AND length(trim(comment)) = 0
      AND wore_instead_outfit_id IS NULL
  `).run();
  rebuildFeedbackPairStats(db, updatedAt);
}

function rebuildFeedbackPairStats(db: AppDatabase, updatedAt: string): void {
  const existingGarmentIds = new Set((db.prepare("SELECT id FROM garments").all() as Array<{ id: number }>)
    .map((row) => row.id));
  const rows = db.prepare(`
    SELECT feedback.verdict, feedback.actually_worn, candidates.item_ids_json
    FROM recommendation_feedback AS feedback
    JOIN recommendation_candidates AS candidates
      ON candidates.candidate_id = feedback.candidate_id
    ORDER BY feedback.id ASC
  `).all() as Array<{
    verdict: "liked" | "disliked" | "skipped" | null;
    actually_worn: number;
    item_ids_json: string;
  }>;
  const stats = new Map<string, FeedbackPairAccumulator>();
  for (const row of rows) {
    const itemIds = parseFeedbackItemIds(row.item_ids_json)
      .filter((itemId) => existingGarmentIds.has(itemId));
    for (const [garmentAId, garmentBId] of feedbackItemPairs(itemIds)) {
      const key = `${garmentAId}:${garmentBId}`;
      const stat = stats.get(key) ?? {
        garmentAId,
        garmentBId,
        likes: 0,
        dislikes: 0,
        wornCount: 0,
        totalFeedback: 0
      };
      stat.totalFeedback += 1;
      if (row.verdict === "liked") stat.likes += 1;
      if (row.verdict === "disliked") stat.dislikes += 1;
      if (Boolean(row.actually_worn)) stat.wornCount += 1;
      stats.set(key, stat);
    }
  }

  db.prepare("DELETE FROM outfit_pair_stats").run();
  const insert = db.prepare(`
    INSERT INTO outfit_pair_stats (
      garment_a_id, garment_b_id, likes, dislikes, worn_count,
      total_feedback, signal, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const stat of [...stats.values()].sort((left, right) =>
    left.garmentAId - right.garmentAId || left.garmentBId - right.garmentBId
  )) {
    insert.run(
      stat.garmentAId,
      stat.garmentBId,
      stat.likes,
      stat.dislikes,
      stat.wornCount,
      stat.totalFeedback,
      stat.likes + 2 * stat.wornCount - 2 * stat.dislikes,
      updatedAt
    );
  }
}

function parseFeedbackItemIds(value: string): number[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error("Cannot rebuild outfit_pair_stats: candidate item IDs are invalid JSON");
  }
  if (!Array.isArray(parsed) || !parsed.every((id) => Number.isSafeInteger(id) && Number(id) > 0)) {
    throw new Error("Cannot rebuild outfit_pair_stats: candidate item IDs are invalid");
  }
  return [...new Set(parsed as number[])];
}

function feedbackItemPairs(itemIds: readonly number[]): Array<readonly [number, number]> {
  const sorted = [...new Set(itemIds)].sort((left, right) => left - right);
  const pairs: Array<readonly [number, number]> = [];
  for (let left = 0; left < sorted.length; left += 1) {
    for (let right = left + 1; right < sorted.length; right += 1) {
      pairs.push([sorted[left], sorted[right]]);
    }
  }
  return pairs;
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
