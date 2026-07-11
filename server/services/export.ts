import type {
  OutfitExport,
  OutfitExportV2,
  RecommendationCandidateExport,
  RecommendationRunEntry,
  WearLogEntry
} from "../../src/shared/types";
import {
  getPersonalProfile,
  listGarments,
  type AppDatabase
} from "../db";
import { currentSchemaVersion } from "../db/migrations";

export const OUTFIT_EXPORT_V2_FEATURES = [
  "versioned-migrations",
  "recommendation-candidates"
] as const;

const GARMENT_CATEGORIES = ["top", "bottom", "dress", "outerwear", "shoes", "accessory"] as const;
const GARMENT_WARMTH = ["light", "medium", "warm", "heavy"] as const;
const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
const FORMALITIES = ["casual", "smart-casual", "formal", "sport"] as const;
const TEMPERATURE_SENSITIVITIES = ["runs-cold", "neutral", "runs-hot"] as const;
const BODY_TYPES = ["slim-tall", "average", "athletic", "stocky"] as const;
const SKIN_TONES = ["dark-yellow", "medium-yellow", "fair", "deep"] as const;
const COLOR_DISPOSITIONS = ["cool-clean", "neutral", "warm-soft"] as const;

export interface BuildOutfitExportOptions {
  now?: () => Date;
}

export class OutfitExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutfitExportError";
  }
}

export function buildOutfitExportV2(
  db: AppDatabase,
  options: BuildOutfitExportOptions = {}
): OutfitExportV2 {
  if (db.isTransaction) {
    throw new OutfitExportError("Cannot build an export inside an existing transaction");
  }

  // A deferred transaction takes a stable read snapshot without eagerly
  // acquiring SQLite's write lock. Every exported table must come from it.
  db.exec("BEGIN");
  try {
    assertStoredProfileJson(db);
    assertStoredGarmentJson(db);
    const exported: OutfitExportV2 = {
      version: 2,
      schemaVersion: currentSchemaVersion(db),
      exportedAt: (options.now ?? (() => new Date()))().toISOString(),
      features: [...OUTFIT_EXPORT_V2_FEATURES],
      profile: getPersonalProfile(db),
      garments: listGarments(db),
      sourceOrderItems: db.prepare("SELECT * FROM source_order_items ORDER BY id ASC").all(),
      wearLogs: listAllWearLogs(db),
      recommendationRuns: listAllRecommendationRuns(db),
      recommendationCandidates: listRecommendationCandidates(db)
    };
    validateOutfitExport(exported);
    db.exec("COMMIT");
    return exported;
  } catch (error) {
    if (db.isTransaction) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // Preserve the original export failure; it identifies the damaged data.
      }
    }
    throw error;
  }
}

export function validateOutfitExport(value: unknown): OutfitExport {
  if (!isRecord(value) || (value.version !== 1 && value.version !== 2)) {
    throw new OutfitExportError("Unsupported export version");
  }
  for (const key of ["garments", "sourceOrderItems", "wearLogs", "recommendationRuns"] as const) {
    if (!Array.isArray(value[key])) {
      throw new OutfitExportError(`Invalid export envelope: ${key} must be an array`);
    }
  }
  if (typeof value.exportedAt !== "string" || !isPersonalProfileShape(value.profile)) {
    throw new OutfitExportError("Invalid export envelope: exportedAt/profile is missing");
  }
  const garments = value.garments as unknown[];
  const wearLogs = value.wearLogs as unknown[];
  const recommendationRuns = value.recommendationRuns as unknown[];
  if (!garments.every(isGarmentShape)) {
    throw new OutfitExportError("Invalid export envelope: garments contains an invalid garment");
  }
  if (!wearLogs.every(isWearLogShape)) {
    throw new OutfitExportError("Invalid export envelope: wearLogs contains an invalid entry");
  }
  if (!recommendationRuns.every(isRecommendationRunShape)) {
    throw new OutfitExportError("Invalid export envelope: recommendationRuns contains an invalid entry");
  }
  if (value.version === 2) {
    if (!Number.isSafeInteger(value.schemaVersion) || Number(value.schemaVersion) < 0) {
      throw new OutfitExportError("Invalid export envelope: schemaVersion is invalid");
    }
    if (!Array.isArray(value.features) || !value.features.every((feature) => typeof feature === "string")) {
      throw new OutfitExportError("Invalid export envelope: features must be strings");
    }
    if (!Array.isArray(value.recommendationCandidates)) {
      throw new OutfitExportError("Invalid export envelope: recommendationCandidates must be an array");
    }
    if (!value.recommendationCandidates.every(isRecommendationCandidateShape)) {
      throw new OutfitExportError(
        "Invalid export envelope: recommendationCandidates contains an invalid entry"
      );
    }
  }
  return value as unknown as OutfitExport;
}

function assertStoredProfileJson(db: AppDatabase): void {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'personalProfile'").get() as {
    value: string;
  } | undefined;
  if (!row) return;

  const profile = parseJsonColumn<unknown>("app_settings", "personalProfile", "value", row.value);
  if (!isRecord(profile)) {
    throw invalidColumnShape("app_settings", "personalProfile", "value", "an object");
  }
  assertOptionalFiniteNumber(profile, "heightCm", "app_settings", "personalProfile", "value");
  assertOptionalFiniteNumber(profile, "weightKg", "app_settings", "personalProfile", "value");
  for (const key of ["preferredColors", "avoidedColors", "preferredStyles"] as const) {
    if (profile[key] !== undefined && !isStringArray(profile[key])) {
      throw invalidColumnShape("app_settings", "personalProfile", "value", `${key} as a string array`);
    }
  }
  assertOptionalEnum(profile, "temperatureSensitivity", TEMPERATURE_SENSITIVITIES);
  assertOptionalEnum(profile, "bodyType", BODY_TYPES);
  assertOptionalEnum(profile, "skinTone", SKIN_TONES);
  assertOptionalEnum(profile, "colorDisposition", COLOR_DISPOSITIONS);
}

function assertStoredGarmentJson(db: AppDatabase): void {
  const rows = db.prepare(`
    SELECT id, seasons, styles, materials, patterns, tags, vision_tags
    FROM garments
    ORDER BY id ASC
  `).all() as Array<{
    id: number;
    seasons: string;
    styles: string;
    materials: string;
    patterns: string;
    tags: string;
    vision_tags: string | null;
  }>;

  for (const row of rows) {
    for (const column of ["seasons", "styles", "materials", "patterns", "tags"] as const) {
      const parsed = parseJsonColumn<unknown>("garments", row.id, column, row[column]);
      if (!isStringArray(parsed)) {
        throw invalidColumnShape("garments", row.id, column, "a string array");
      }
      if (column === "seasons" && !parsed.every((season) => includes(SEASONS, season))) {
        throw invalidColumnShape("garments", row.id, column, "only valid Season values");
      }
    }
    if (row.vision_tags !== null) {
      const suggestion = parseJsonColumn<unknown>(
        "garments",
        row.id,
        "vision_tags",
        row.vision_tags
      );
      assertVisionTagSuggestion(suggestion, row.id);
    }
  }
}

function listAllWearLogs(db: AppDatabase): WearLogEntry[] {
  const rows = db.prepare(`
    SELECT id, garment_ids, context, worn_at
    FROM wear_logs
    ORDER BY worn_at DESC, id DESC
  `).all() as Array<{ id: number; garment_ids: string; context: string | null; worn_at: string }>;
  return rows.map((row) => {
    const garmentIds = parseJsonColumn<unknown>("wear_logs", row.id, "garment_ids", row.garment_ids);
    if (!Array.isArray(garmentIds) || !garmentIds.every((id) => Number.isSafeInteger(id))) {
      throw new OutfitExportError(`Cannot export wear_logs row ${row.id}: garment_ids is not an integer array`);
    }
    return {
      id: row.id,
      garmentIds: garmentIds as number[],
      context: row.context === null
        ? null
        : parseJsonColumn("wear_logs", row.id, "context", row.context),
      wornAt: row.worn_at
    };
  });
}

function listAllRecommendationRuns(db: AppDatabase): RecommendationRunEntry[] {
  const rows = db.prepare(`
    SELECT id, input_json, result_json, created_at
    FROM recommendation_runs
    ORDER BY created_at DESC, id DESC
  `).all() as Array<{ id: number; input_json: string; result_json: string; created_at: string }>;
  return rows.map((row) => ({
    id: row.id,
    input: parseJsonColumn("recommendation_runs", row.id, "input_json", row.input_json),
    result: parseJsonColumn("recommendation_runs", row.id, "result_json", row.result_json),
    createdAt: row.created_at
  }));
}

function listRecommendationCandidates(db: AppDatabase): RecommendationCandidateExport[] {
  const rows = db.prepare(`
    SELECT candidate_id, run_id, signature, rank, item_ids_json, score_snapshot, created_at
    FROM recommendation_candidates
    ORDER BY run_id ASC, rank ASC, candidate_id ASC
  `).all() as Array<{
    candidate_id: string;
    run_id: number;
    signature: string;
    rank: number;
    item_ids_json: string;
    score_snapshot: string;
    created_at: string;
  }>;
  return rows.map((row) => {
    const itemIds = parseJsonColumn<unknown>(
      "recommendation_candidates",
      row.candidate_id,
      "item_ids_json",
      row.item_ids_json
    );
    if (!Array.isArray(itemIds) || !itemIds.every((id) => Number.isSafeInteger(id))) {
      throw new OutfitExportError(
        `Cannot export recommendation_candidates row ${row.candidate_id}: item_ids_json is not an integer array`
      );
    }
    return {
      candidateId: row.candidate_id,
      runId: row.run_id,
      outfitSignature: row.signature,
      rank: row.rank,
      itemIds: itemIds as number[],
      scoreSnapshot: parseJsonColumn(
        "recommendation_candidates",
        row.candidate_id,
        "score_snapshot",
        row.score_snapshot
      ),
      createdAt: row.created_at
    };
  });
}

function parseJsonColumn<T = unknown>(
  table: string,
  rowId: string | number,
  column: string,
  value: string
): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new OutfitExportError(`Cannot export ${table} row ${rowId}: invalid JSON in ${column}`);
  }
}

function assertVisionTagSuggestion(value: unknown, rowId: number): void {
  if (!isRecord(value)) {
    throw invalidColumnShape("garments", rowId, "vision_tags", "an object");
  }
  for (const key of ["styles", "patterns", "tags"] as const) {
    if (!isStringArray(value[key])) {
      throw invalidColumnShape("garments", rowId, "vision_tags", `${key} as a string array`);
    }
  }
  if (
    !Array.isArray(value.scores) ||
    !value.scores.every((score) =>
      isRecord(score) && typeof score.label === "string" && isFiniteNumber(score.score)
    )
  ) {
    throw invalidColumnShape("garments", rowId, "vision_tags", "scores as label/score objects");
  }
  if (
    value.category !== undefined &&
    (typeof value.category !== "string" || !includes(GARMENT_CATEGORIES, value.category))
  ) {
    throw invalidColumnShape("garments", rowId, "vision_tags", "category as a valid GarmentCategory");
  }
}

function assertOptionalFiniteNumber(
  record: Record<string, unknown>,
  key: string,
  table: string,
  rowId: string | number,
  column: string
): void {
  if (record[key] !== undefined && !isFiniteNumber(record[key])) {
    throw invalidColumnShape(table, rowId, column, `${key} as a finite number`);
  }
}

function assertOptionalEnum(
  record: Record<string, unknown>,
  key: string,
  values: readonly string[]
): void {
  const value = record[key];
  if (value !== undefined && (typeof value !== "string" || !values.includes(value))) {
    throw invalidColumnShape(
      "app_settings",
      "personalProfile",
      "value",
      `${key} as one of ${values.join(", ")}`
    );
  }
}

function invalidColumnShape(
  table: string,
  rowId: string | number,
  column: string,
  expected: string
): OutfitExportError {
  return new OutfitExportError(`Cannot export ${table} row ${rowId}: ${column} must contain ${expected}`);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isPersonalProfileShape(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    hasOptionalFiniteNumber(value, "heightCm") &&
    hasOptionalFiniteNumber(value, "weightKg") &&
    hasOptionalEnum(value, "temperatureSensitivity", TEMPERATURE_SENSITIVITIES) &&
    hasOptionalEnum(value, "bodyType", BODY_TYPES) &&
    hasOptionalEnum(value, "skinTone", SKIN_TONES) &&
    hasOptionalEnum(value, "colorDisposition", COLOR_DISPOSITIONS) &&
    hasOptionalStringArray(value, "preferredColors") &&
    hasOptionalStringArray(value, "avoidedColors") &&
    hasOptionalStringArray(value, "preferredStyles")
  );
}

function isGarmentShape(value: unknown): boolean {
  if (!isRecord(value) || !isSafeInteger(value.id)) return false;
  for (const key of ["brand", "name", "rawName", "color", "imageUrl"] as const) {
    if (typeof value[key] !== "string") return false;
  }
  if (
    typeof value.category !== "string" ||
    !includes(GARMENT_CATEGORIES, value.category) ||
    typeof value.warmth !== "string" ||
    !includes(GARMENT_WARMTH, value.warmth) ||
    typeof value.formality !== "string" ||
    !includes(FORMALITIES, value.formality) ||
    !isStringArray(value.seasons) ||
    !value.seasons.every((season) => includes(SEASONS, season)) ||
    !isStringArray(value.styles) ||
    typeof value.owned !== "boolean" ||
    typeof value.confirmed !== "boolean" ||
    typeof value.excluded !== "boolean" ||
    !isFiniteNumber(value.confidence)
  ) {
    return false;
  }
  if (
    !hasOptionalSafeInteger(value, "sourceOrderItemId") ||
    !hasOptionalSafeInteger(value, "wearCount") ||
    !hasOptionalStringArray(value, "materials") ||
    !hasOptionalStringArray(value, "patterns") ||
    !hasOptionalStringArray(value, "tags")
  ) {
    return false;
  }
  for (const key of [
    "size",
    "notes",
    "itemUrl",
    "detailUrl",
    "lastWornAt",
    "cutoutImageUrl",
    "visionUpdatedAt"
  ] as const) {
    if (value[key] !== undefined && typeof value[key] !== "string") return false;
  }
  return value.visionTags === undefined || isVisionTagSuggestionShape(value.visionTags);
}

function isVisionTagSuggestionShape(value: unknown): boolean {
  return Boolean(
    isRecord(value) &&
    (value.category === undefined ||
      (typeof value.category === "string" && includes(GARMENT_CATEGORIES, value.category))) &&
    isStringArray(value.styles) &&
    isStringArray(value.patterns) &&
    isStringArray(value.tags) &&
    Array.isArray(value.scores) &&
    value.scores.every((score) =>
      isRecord(score) && typeof score.label === "string" && isFiniteNumber(score.score)
    )
  );
}

function isWearLogShape(value: unknown): boolean {
  return Boolean(
    isRecord(value) &&
    isSafeInteger(value.id) &&
    Array.isArray(value.garmentIds) &&
    value.garmentIds.every(isSafeInteger) &&
    hasOwn(value, "context") &&
    typeof value.wornAt === "string"
  );
}

function isRecommendationRunShape(value: unknown): boolean {
  return Boolean(
    isRecord(value) &&
    isSafeInteger(value.id) &&
    hasOwn(value, "input") &&
    hasOwn(value, "result") &&
    typeof value.createdAt === "string"
  );
}

function isRecommendationCandidateShape(value: unknown): boolean {
  return Boolean(
    isRecord(value) &&
    typeof value.candidateId === "string" &&
    isSafeInteger(value.runId) &&
    typeof value.outfitSignature === "string" &&
    isSafeInteger(value.rank) &&
    Array.isArray(value.itemIds) &&
    value.itemIds.every(isSafeInteger) &&
    hasOwn(value, "scoreSnapshot") &&
    typeof value.createdAt === "string"
  );
}

function hasOptionalFiniteNumber(record: Record<string, unknown>, key: string): boolean {
  return record[key] === undefined || isFiniteNumber(record[key]);
}

function hasOptionalSafeInteger(record: Record<string, unknown>, key: string): boolean {
  return record[key] === undefined || isSafeInteger(record[key]);
}

function hasOptionalStringArray(record: Record<string, unknown>, key: string): boolean {
  return record[key] === undefined || isStringArray(record[key]);
}

function hasOptionalEnum(
  record: Record<string, unknown>,
  key: string,
  values: readonly string[]
): boolean {
  const value = record[key];
  return value === undefined || (typeof value === "string" && values.includes(value));
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function includes(values: readonly string[], value: string): boolean {
  return values.includes(value);
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
