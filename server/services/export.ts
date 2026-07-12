import type { Writable } from "node:stream";
import { finished } from "node:stream/promises";
import archiver, { type Archiver } from "archiver";
import type {
  FeedbackReason,
  FeedbackVerdict,
  GarmentAssetMetadata,
  GarmentAvailabilityEvent,
  GarmentAvailabilityStatus,
  OutfitExport,
  OutfitExportV2,
  OutfitPairStat,
  RecommendationCandidateExport,
  RecommendationFeedback,
  RecommendationRunEntry,
  SavedOutfit,
  WearLogEntry
} from "../../src/shared/types";
import {
  getPersonalProfile,
  listGarments,
  type AppDatabase
} from "../db";
import { currentSchemaVersion } from "../db/migrations";
import {
  DEFAULT_GARMENT_ASSET_ROOT,
  readGarmentAssetForBackup
} from "./garmentAssets";
import { listSavedOutfits } from "./savedOutfits";

export const OUTFIT_EXPORT_V2_FEATURES = [
  "versioned-migrations",
  "recommendation-candidates",
  "garment-assets",
  "saved-outfits",
  "feedback-availability"
] as const;

export const OUTFIT_EXPORT_JSON_ENTRY = "outfit-export-v2.json";
export const OUTFIT_EXPORT_MANIFEST_ENTRY = "manifest.json";

const GARMENT_CATEGORIES = ["top", "bottom", "dress", "outerwear", "shoes", "accessory"] as const;
const GARMENT_WARMTH = ["light", "medium", "warm", "heavy"] as const;
const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
const FORMALITIES = ["casual", "smart-casual", "formal", "sport"] as const;
const TEMPERATURE_SENSITIVITIES = ["runs-cold", "neutral", "runs-hot"] as const;
const BODY_TYPES = ["slim-tall", "average", "athletic", "stocky"] as const;
const SKIN_TONES = ["dark-yellow", "medium-yellow", "fair", "deep"] as const;
const COLOR_DISPOSITIONS = ["cool-clean", "neutral", "warm-soft"] as const;
const FEEDBACK_VERDICTS = ["liked", "disliked", "skipped"] as const;
const FEEDBACK_REASONS = [
  "too-warm",
  "too-cold",
  "too-formal",
  "too-casual",
  "color",
  "fit",
  "repeat",
  "unavailable",
  "other"
] as const;
const GARMENT_AVAILABILITY_STATUSES = [
  "available",
  "laundry",
  "repair",
  "loaned",
  "packed"
] as const;

export interface BuildOutfitExportOptions {
  now?: () => Date;
}

export interface OutfitExportZipOptions extends BuildOutfitExportOptions {
  assetRoot?: string;
}

export interface OutfitExportWarning {
  code: "ASSET_UNAVAILABLE";
  assetId: number;
  message: string;
}

export interface OutfitExportZipPreview {
  assetCount: number;
  includedAssetCount: number;
  assetBytes: number;
  includedAssetBytes: number;
  estimatedBytes: number;
  warnings: OutfitExportWarning[];
}

export interface OutfitExportManifestAsset {
  id: number;
  archivePath: string;
  byteSize: number;
  sha256: string;
}

export interface OutfitExportZipManifest extends OutfitExportZipPreview {
  version: 1;
  exportedAt: string;
  entries: string[];
  includedAssets: OutfitExportManifestAsset[];
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
      garments: listGarments(db, { scope: "all" }),
      sourceOrderItems: listSourceOrderItems(db),
      wearLogs: listAllWearLogs(db),
      recommendationRuns: listAllRecommendationRuns(db),
      recommendationCandidates: listRecommendationCandidates(db),
      garmentAssets: listGarmentAssets(db),
      savedOutfits: listSavedOutfitsForExport(db),
      recommendationFeedback: listRecommendationFeedbackForExport(db),
      outfitPairStats: listOutfitPairStatsForExport(db),
      garmentAvailabilityEvents: listGarmentAvailabilityEventsForExport(db)
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
  const sourceOrderItems = value.sourceOrderItems as unknown[];
  const wearLogs = value.wearLogs as unknown[];
  const recommendationRuns = value.recommendationRuns as unknown[];
  if (!garments.every(isGarmentShape)) {
    throw new OutfitExportError("Invalid export envelope: garments contains an invalid garment");
  }
  if (!sourceOrderItems.every(isSourceOrderItemAssetSafe)) {
    throw new OutfitExportError(
      "Invalid export envelope: sourceOrderItems contains a non-portable asset reference"
    );
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
    if (
      value.garmentAssets !== undefined &&
      (!Array.isArray(value.garmentAssets) || !value.garmentAssets.every(isGarmentAssetMetadataShape))
    ) {
      throw new OutfitExportError(
        "Invalid export envelope: garmentAssets contains an invalid entry"
      );
    }
    if (
      value.savedOutfits !== undefined &&
      (!Array.isArray(value.savedOutfits) || !value.savedOutfits.every(isSavedOutfitShape))
    ) {
      throw new OutfitExportError(
        "Invalid export envelope: savedOutfits contains an invalid entry"
      );
    }
    if (
      value.recommendationFeedback !== undefined &&
      (!Array.isArray(value.recommendationFeedback) ||
        !value.recommendationFeedback.every(isRecommendationFeedbackShape))
    ) {
      throw new OutfitExportError(
        "Invalid export envelope: recommendationFeedback contains an invalid entry"
      );
    }
    if (
      value.outfitPairStats !== undefined &&
      (!Array.isArray(value.outfitPairStats) ||
        !value.outfitPairStats.every(isOutfitPairStatShape))
    ) {
      throw new OutfitExportError(
        "Invalid export envelope: outfitPairStats contains an invalid entry"
      );
    }
    if (
      value.garmentAvailabilityEvents !== undefined &&
      (!Array.isArray(value.garmentAvailabilityEvents) ||
        !value.garmentAvailabilityEvents.every(isGarmentAvailabilityEventShape))
    ) {
      throw new OutfitExportError(
        "Invalid export envelope: garmentAvailabilityEvents contains an invalid entry"
      );
    }
  }
  return value as unknown as OutfitExport;
}

/**
 * Inspect the explicit complete-backup payload without creating an archive.
 * Warnings contain only numeric asset IDs and never local paths/storage keys.
 */
export async function previewOutfitExportZip(
  db: AppDatabase,
  options: OutfitExportZipOptions = {}
): Promise<OutfitExportZipPreview> {
  const exported = buildOutfitExportV2(db, options);
  const assetRoot = options.assetRoot ?? DEFAULT_GARMENT_ASSET_ROOT;
  const warnings: OutfitExportWarning[] = [];
  let includedAssetCount = 0;
  let includedAssetBytes = 0;

  for (const metadata of exported.garmentAssets ?? []) {
    const content = await readBackupAssetOrWarn(db, metadata, assetRoot, warnings);
    if (!content) continue;
    includedAssetCount += 1;
    includedAssetBytes += content.byteLength;
  }

  const assetCount = exported.garmentAssets?.length ?? 0;
  const assetBytes = sumSafeBytes((exported.garmentAssets ?? []).map((asset) => asset.byteSize));
  const previewBase = {
    assetCount,
    includedAssetCount,
    assetBytes,
    includedAssetBytes,
    warnings
  };
  const manifest = buildZipManifest(exported, previewBase, []);
  return {
    ...previewBase,
    estimatedBytes: estimateArchiveBytes(
      serializeJson(exported).byteLength,
      includedAssetBytes,
      serializeJson(manifest).byteLength,
      includedAssetCount + 2
    )
  };
}

/**
 * Stream a complete backup directly to the caller-provided Writable. No ZIP
 * file or other temporary archive is created on disk, and source assets are
 * never removed. Each asset is integrity-checked before its safe numeric entry
 * is appended.
 */
export async function writeOutfitExportZip(
  db: AppDatabase,
  destination: Writable,
  options: OutfitExportZipOptions = {}
): Promise<OutfitExportZipManifest> {
  const exported = buildOutfitExportV2(db, options);
  const assetRoot = options.assetRoot ?? DEFAULT_GARMENT_ASSET_ROOT;
  const archiveDate = validArchiveDate(exported.exportedAt);
  const archive = archiver("zip", { zlib: { level: 9 } });
  const streamFailure = archiveFailure(archive, destination);
  archive.pipe(destination);
  const destinationFinished = finished(destination, { readable: false });

  await Promise.race([
    appendArchiveEntry(archive, serializeJson(exported), OUTFIT_EXPORT_JSON_ENTRY, archiveDate),
    streamFailure
  ]);

  const warnings: OutfitExportWarning[] = [];
  const includedAssets: OutfitExportManifestAsset[] = [];
  let includedAssetBytes = 0;
  for (const metadata of exported.garmentAssets ?? []) {
    const bytes = await readBackupAssetOrWarn(db, metadata, assetRoot, warnings);
    if (!bytes) continue;
    await Promise.race([
      appendArchiveEntry(archive, bytes, metadata.archivePath, archiveDate, true),
      streamFailure
    ]);
    includedAssetBytes += bytes.byteLength;
    includedAssets.push({
      id: metadata.id,
      archivePath: metadata.archivePath,
      byteSize: bytes.byteLength,
      sha256: metadata.sha256
    });
  }

  const assetCount = exported.garmentAssets?.length ?? 0;
  const assetBytes = sumSafeBytes((exported.garmentAssets ?? []).map((asset) => asset.byteSize));
  const previewBase = {
    assetCount,
    includedAssetCount: includedAssets.length,
    assetBytes,
    includedAssetBytes,
    warnings
  };
  const manifestWithoutEstimate = buildZipManifest(exported, previewBase, includedAssets);
  const estimatedBytes = estimateArchiveBytes(
    serializeJson(exported).byteLength,
    includedAssetBytes,
    serializeJson(manifestWithoutEstimate).byteLength,
    includedAssets.length + 2
  );
  const manifest: OutfitExportZipManifest = {
    ...manifestWithoutEstimate,
    estimatedBytes
  };
  await Promise.race([
    appendArchiveEntry(archive, serializeJson(manifest), OUTFIT_EXPORT_MANIFEST_ENTRY, archiveDate),
    streamFailure
  ]);
  await Promise.race([
    archive.finalize().then(() => destinationFinished),
    streamFailure
  ]);
  return manifest;
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
    SELECT id, seasons, styles, materials, patterns, tags, vision_tags, image_url, cutout_image_url
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
    image_url: string | null;
    cutout_image_url: string | null;
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
    assertPortableAssetReference("garments", row.id, "image_url", row.image_url);
    assertPortableAssetReference("garments", row.id, "cutout_image_url", row.cutout_image_url);
  }
}

function listSourceOrderItems(db: AppDatabase): unknown[] {
  const rows = db.prepare("SELECT * FROM source_order_items ORDER BY id ASC").all() as Array<
    Record<string, unknown> & { id: number }
  >;
  for (const row of rows) {
    assertPortableAssetReference("source_order_items", row.id, "image_url", row.image_url);
    if (row.detail_images !== null && row.detail_images !== undefined) {
      if (typeof row.detail_images !== "string") {
        throw invalidColumnShape("source_order_items", row.id, "detail_images", "a JSON string array");
      }
      const images = parseJsonColumn<unknown>(
        "source_order_items",
        row.id,
        "detail_images",
        row.detail_images
      );
      if (!isStringArray(images)) {
        throw invalidColumnShape("source_order_items", row.id, "detail_images", "a string array");
      }
      for (const image of images) {
        assertPortableAssetReference("source_order_items", row.id, "detail_images", image);
      }
    }
    if (row.detail_props !== null && row.detail_props !== undefined) {
      if (typeof row.detail_props !== "string") {
        throw invalidColumnShape("source_order_items", row.id, "detail_props", "a JSON property array");
      }
      const properties = parseJsonColumn<unknown>(
        "source_order_items",
        row.id,
        "detail_props",
        row.detail_props
      );
      if (
        !Array.isArray(properties) ||
        !properties.every((property) =>
          isRecord(property) && typeof property.name === "string" && typeof property.value === "string"
        )
      ) {
        throw invalidColumnShape("source_order_items", row.id, "detail_props", "name/value objects");
      }
    }
  }
  return rows;
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

function listGarmentAssets(db: AppDatabase): GarmentAssetMetadata[] {
  const rows = db.prepare(`
    SELECT id, garment_id, kind, mime_type, byte_size, width, height, sha256,
      active, created_at
    FROM garment_assets
    ORDER BY id ASC
  `).all() as Array<{
    id: number;
    garment_id: number;
    kind: string;
    mime_type: string;
    byte_size: number;
    width: number;
    height: number;
    sha256: string;
    active: number;
    created_at: string;
  }>;
  return rows.map((row) => {
    const metadata: GarmentAssetMetadata = {
      id: row.id,
      garmentId: row.garment_id,
      kind: row.kind,
      mimeType: row.mime_type as GarmentAssetMetadata["mimeType"],
      byteSize: row.byte_size,
      width: row.width,
      height: row.height,
      sha256: row.sha256,
      active: Boolean(row.active),
      createdAt: row.created_at,
      archivePath: assetArchivePath(row.id)
    };
    if (!isGarmentAssetMetadataShape(metadata)) {
      throw new OutfitExportError(`Cannot export garment_assets row ${row.id}: invalid metadata`);
    }
    return metadata;
  });
}

function listSavedOutfitsForExport(db: AppDatabase): SavedOutfit[] {
  let outfits: SavedOutfit[];
  try {
    outfits = listSavedOutfits(db, { scope: "all" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new OutfitExportError(`Cannot export saved_outfit_items: ${message}`);
  }

  for (const outfit of outfits) {
    for (const item of outfit.items) {
      if (!isPortableAssetReference(item.garmentSnapshot.imageUrl)) {
        throw new OutfitExportError(
          `Cannot export saved_outfit_items row ${item.id}: garment_snapshot.imageUrl must contain a portable URL, never a filesystem path or embedded binary`
        );
      }
    }
  }

  return outfits.sort((left, right) => left.id - right.id);
}

function listRecommendationFeedbackForExport(db: AppDatabase): RecommendationFeedback[] {
  const rows = db.prepare(`
    SELECT id, candidate_id, verdict, rating, actually_worn, reason_codes_json,
      comment, wore_instead_outfit_id, wear_log_id, created_at, updated_at
    FROM recommendation_feedback
    ORDER BY created_at ASC, id ASC
  `).all() as Array<{
    id: number;
    candidate_id: string;
    verdict: FeedbackVerdict | null;
    rating: 1 | 2 | 3 | 4 | 5 | null;
    actually_worn: number;
    reason_codes_json: string;
    comment: string;
    wore_instead_outfit_id: number | null;
    wear_log_id: number | null;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((row) => {
    const reasonCodes = parseJsonColumn<unknown>(
      "recommendation_feedback",
      row.id,
      "reason_codes_json",
      row.reason_codes_json
    );
    if (
      !Array.isArray(reasonCodes) ||
      !reasonCodes.every((reason) =>
        typeof reason === "string" && includes(FEEDBACK_REASONS, reason)
      )
    ) {
      throw invalidColumnShape(
        "recommendation_feedback",
        row.id,
        "reason_codes_json",
        "only valid FeedbackReason values"
      );
    }
    if (row.actually_worn !== 0 && row.actually_worn !== 1) {
      throw invalidColumnShape(
        "recommendation_feedback",
        row.id,
        "actually_worn",
        "0 or 1"
      );
    }
    const feedback: RecommendationFeedback = {
      id: row.id,
      candidateId: row.candidate_id,
      ...(row.verdict === null ? {} : { verdict: row.verdict }),
      ...(row.rating === null ? {} : { rating: row.rating }),
      actuallyWorn: Boolean(row.actually_worn),
      reasonCodes: reasonCodes as FeedbackReason[],
      comment: row.comment,
      ...(row.wore_instead_outfit_id === null
        ? {}
        : { woreInsteadOutfitId: row.wore_instead_outfit_id }),
      ...(row.wear_log_id === null ? {} : { wearLogId: row.wear_log_id }),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
    if (!isRecommendationFeedbackShape(feedback)) {
      throw new OutfitExportError(
        `Cannot export recommendation_feedback row ${row.id}: invalid feedback data`
      );
    }
    return feedback;
  });
}

function listOutfitPairStatsForExport(db: AppDatabase): OutfitPairStat[] {
  const rows = db.prepare(`
    SELECT garment_a_id, garment_b_id, likes, dislikes, worn_count,
      total_feedback, signal, updated_at
    FROM outfit_pair_stats
    ORDER BY garment_a_id ASC, garment_b_id ASC
  `).all() as Array<{
    garment_a_id: number;
    garment_b_id: number;
    likes: number;
    dislikes: number;
    worn_count: number;
    total_feedback: number;
    signal: number;
    updated_at: string;
  }>;
  return rows.map((row) => {
    const stat: OutfitPairStat = {
      garmentAId: row.garment_a_id,
      garmentBId: row.garment_b_id,
      likes: row.likes,
      dislikes: row.dislikes,
      wornCount: row.worn_count,
      totalFeedback: row.total_feedback,
      signal: row.signal,
      updatedAt: row.updated_at
    };
    if (!isOutfitPairStatShape(stat)) {
      throw new OutfitExportError(
        `Cannot export outfit_pair_stats row ${row.garment_a_id}/${row.garment_b_id}: invalid pair statistics`
      );
    }
    return stat;
  });
}

function listGarmentAvailabilityEventsForExport(db: AppDatabase): GarmentAvailabilityEvent[] {
  const rows = db.prepare(`
    SELECT id, garment_id, previous_status, status, changed_at
    FROM garment_availability_events
    ORDER BY changed_at ASC, id ASC
  `).all() as Array<{
    id: number;
    garment_id: number;
    previous_status: GarmentAvailabilityStatus;
    status: GarmentAvailabilityStatus;
    changed_at: string;
  }>;
  return rows.map((row) => {
    const event: GarmentAvailabilityEvent = {
      id: row.id,
      garmentId: row.garment_id,
      previousStatus: row.previous_status,
      status: row.status,
      changedAt: row.changed_at
    };
    if (!isGarmentAvailabilityEventShape(event)) {
      throw new OutfitExportError(
        `Cannot export garment_availability_events row ${row.id}: invalid availability event`
      );
    }
    return event;
  });
}

async function readBackupAssetOrWarn(
  db: AppDatabase,
  metadata: GarmentAssetMetadata,
  assetRoot: string,
  warnings: OutfitExportWarning[]
): Promise<Buffer | undefined> {
  try {
    const content = await readGarmentAssetForBackup(db, metadata.id, { assetRoot });
    if (!matchesExportedAssetMetadata(content.asset, metadata)) {
      throw new Error("Asset metadata changed while preparing backup");
    }
    return content.bytes;
  } catch {
    warnings.push(assetUnavailableWarning(metadata.id));
    return undefined;
  }
}

function matchesExportedAssetMetadata(
  actual: Awaited<ReturnType<typeof readGarmentAssetForBackup>>["asset"],
  expected: GarmentAssetMetadata
): boolean {
  return (
    actual.id === expected.id &&
    actual.garmentId === expected.garmentId &&
    actual.kind === expected.kind &&
    actual.mimeType === expected.mimeType &&
    actual.byteSize === expected.byteSize &&
    actual.width === expected.width &&
    actual.height === expected.height &&
    actual.sha256 === expected.sha256 &&
    actual.active === expected.active &&
    actual.createdAt === expected.createdAt &&
    expected.archivePath === assetArchivePath(expected.id)
  );
}

function assetUnavailableWarning(assetId: number): OutfitExportWarning {
  return {
    code: "ASSET_UNAVAILABLE",
    assetId,
    message: `资产 ${assetId} 的文件缺失、损坏或不安全，已跳过。`
  };
}

type ManifestWithoutEstimate = Omit<OutfitExportZipManifest, "estimatedBytes">;

function buildZipManifest(
  exported: OutfitExportV2,
  preview: Omit<OutfitExportZipPreview, "estimatedBytes">,
  includedAssets: OutfitExportManifestAsset[]
): ManifestWithoutEstimate {
  return {
    version: 1,
    exportedAt: exported.exportedAt,
    ...preview,
    entries: [
      OUTFIT_EXPORT_JSON_ENTRY,
      ...includedAssets.map((asset) => asset.archivePath),
      OUTFIT_EXPORT_MANIFEST_ENTRY
    ],
    includedAssets
  };
}

function assetArchivePath(assetId: number): string {
  if (!Number.isSafeInteger(assetId) || assetId <= 0) {
    throw new OutfitExportError("Cannot build an archive path for an invalid asset ID");
  }
  return `assets/${assetId}.webp`;
}

function serializeJson(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function estimateArchiveBytes(
  exportJsonBytes: number,
  includedAssetBytes: number,
  manifestBytes: number,
  entryCount: number
): number {
  // ZIP headers are small but compression is data-dependent. This is a safe
  // display estimate, not a byte-exact Content-Length promise.
  return sumSafeBytes([
    exportJsonBytes,
    includedAssetBytes,
    manifestBytes,
    entryCount * 160,
    64
  ]);
}

function sumSafeBytes(values: number[]): number {
  let total = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value < 0 || total > Number.MAX_SAFE_INTEGER - value) {
      throw new OutfitExportError("Backup size exceeds the supported safe integer range");
    }
    total += value;
  }
  return total;
}

function validArchiveDate(value: string): Date {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new OutfitExportError("Cannot create ZIP with an invalid export timestamp");
  }
  return date;
}

function archiveFailure(archive: Archiver, destination: Writable): Promise<never> {
  return new Promise((_, reject) => {
    archive.once("warning", reject);
    archive.once("error", reject);
    destination.once("error", reject);
  });
}

function appendArchiveEntry(
  archive: Archiver,
  content: Buffer,
  name: string,
  date: Date,
  store = false
): Promise<void> {
  assertSafeArchiveEntry(name);
  return new Promise((resolveEntry, rejectEntry) => {
    const onEntry = (entry: { name: string }) => {
      if (entry.name !== name) return;
      cleanup();
      resolveEntry();
    };
    const onError = (error: Error) => {
      cleanup();
      rejectEntry(error);
    };
    const cleanup = () => {
      archive.off("entry", onEntry);
      archive.off("warning", onError);
      archive.off("error", onError);
    };
    archive.on("entry", onEntry);
    archive.once("warning", onError);
    archive.once("error", onError);
    archive.append(content, {
      name,
      date,
      mode: 0o600,
      store
    });
  });
}

function assertSafeArchiveEntry(name: string): void {
  if (
    !name ||
    name.includes("\\") ||
    name.startsWith("/") ||
    /^[A-Za-z]:/.test(name) ||
    name.split("/").some((segment) => segment === "" || segment === "." || segment === "..") ||
    !(
      name === OUTFIT_EXPORT_JSON_ENTRY ||
      name === OUTFIT_EXPORT_MANIFEST_ENTRY ||
      /^assets\/[1-9][0-9]*\.webp$/.test(name)
    )
  ) {
    throw new OutfitExportError("Refusing an unsafe ZIP entry name");
  }
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

function assertPortableAssetReference(
  table: string,
  rowId: string | number,
  column: string,
  value: unknown
): void {
  if (value === null || value === undefined) return;
  if (typeof value !== "string" || !isPortableAssetReference(value)) {
    throw invalidColumnShape(table, rowId, column, "a portable URL, never a filesystem path or embedded binary");
  }
}

function isPortableAssetReference(value: string): boolean {
  const cleaned = value.trim();
  if (
    cleaned !== value ||
    /[\\\u0000-\u001f\u007f]/.test(cleaned) ||
    /;base64,/i.test(cleaned) ||
    /^(?:data|blob|file):/i.test(cleaned)
  ) {
    return false;
  }
  if (cleaned === "") return true;
  if (cleaned.startsWith("//")) {
    if (/^\/\/[a-z]:\//i.test(cleaned)) return false;
    return isValidRemoteAssetUrl(`https:${cleaned}`);
  }
  if (/^https?:\/\//i.test(cleaned)) return isValidRemoteAssetUrl(cleaned);
  if (!/^\/(?:api\/(?:garment-thumbnails|garment-assets)|assets)\//.test(cleaned)) {
    return false;
  }
  return isSafeLocalAssetPath(cleaned);
}

function isValidRemoteAssetUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      Boolean(parsed.hostname) &&
      parsed.username === "" &&
      parsed.password === ""
    );
  } catch {
    return false;
  }
}

function isSafeLocalAssetPath(value: string): boolean {
  const path = value.split(/[?#]/, 1)[0];
  let decoded = path;
  let fullyDecoded = false;
  try {
    for (let pass = 0; pass < 8; pass += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) {
        fullyDecoded = true;
        break;
      }
      decoded = next;
    }
  } catch {
    return false;
  }
  if (
    !fullyDecoded ||
    /[\\\u0000-\u001f\u007f]/.test(decoded) ||
    decoded.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    return false;
  }
  return /^\/(?:api\/(?:garment-thumbnails|garment-assets)|assets)\//.test(decoded);
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
    typeof value.imageUrl !== "string" ||
    !isPortableAssetReference(value.imageUrl) ||
    typeof value.owned !== "boolean" ||
    typeof value.confirmed !== "boolean" ||
    typeof value.excluded !== "boolean" ||
    !hasOptionalEnum(value, "availabilityStatus", GARMENT_AVAILABILITY_STATUSES) ||
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
  const cutoutImageUrl = value.cutoutImageUrl;
  return (
    (cutoutImageUrl === undefined ||
      (typeof cutoutImageUrl === "string" && isPortableAssetReference(cutoutImageUrl))) &&
    (value.visionTags === undefined || isVisionTagSuggestionShape(value.visionTags))
  );
}

function isSourceOrderItemAssetSafe(value: unknown): boolean {
  if (!isRecord(value)) return true;
  if (
    value.image_url !== undefined &&
    value.image_url !== null &&
    (typeof value.image_url !== "string" || !isPortableAssetReference(value.image_url))
  ) {
    return false;
  }
  if (value.detail_images !== undefined && value.detail_images !== null) {
    if (typeof value.detail_images !== "string") return false;
    try {
      const images = JSON.parse(value.detail_images) as unknown;
      if (!isStringArray(images) || !images.every(isPortableAssetReference)) return false;
    } catch {
      return false;
    }
  }
  if (value.detail_props !== undefined && value.detail_props !== null) {
    if (typeof value.detail_props !== "string") return false;
    try {
      if (!isDetailPropertyArray(JSON.parse(value.detail_props) as unknown)) return false;
    } catch {
      return false;
    }
  }
  return true;
}

function isDetailPropertyArray(value: unknown): boolean {
  return Boolean(
    Array.isArray(value) &&
    value.every((property) =>
      isRecord(property) && typeof property.name === "string" && typeof property.value === "string"
    )
  );
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

function isSavedOutfitShape(value: unknown): value is SavedOutfit {
  if (!isRecord(value)) return false;
  if (
    !isSafeInteger(value.id) ||
    typeof value.name !== "string" ||
    typeof value.notes !== "string" ||
    typeof value.source !== "string" ||
    !includes(["recommendation", "manual", "replacement"] as const, value.source) ||
    !hasOptionalString(value, "sourceCandidateId") ||
    !hasOptionalSafeInteger(value, "derivedFromOutfitId") ||
    typeof value.favorite !== "boolean" ||
    !hasOptionalString(value, "archivedAt") ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string" ||
    !Array.isArray(value.items)
  ) {
    return false;
  }

  return value.items.every((item) => {
    if (!isRecord(item) || !isRecord(item.garmentSnapshot)) return false;
    const snapshot = item.garmentSnapshot;
    return (
      isSafeInteger(item.id) &&
      isSafeInteger(item.outfitId) &&
      hasOptionalSafeInteger(item, "garmentId") &&
      typeof item.slot === "string" &&
      includes(GARMENT_CATEGORIES, item.slot) &&
      isSafeInteger(item.position) &&
      item.position >= 0 &&
      isSafeInteger(snapshot.id) &&
      typeof snapshot.name === "string" &&
      typeof snapshot.brand === "string" &&
      typeof snapshot.category === "string" &&
      includes(GARMENT_CATEGORIES, snapshot.category) &&
      snapshot.category === item.slot &&
      typeof snapshot.imageUrl === "string" &&
      isPortableAssetReference(snapshot.imageUrl)
    );
  });
}

function isRecommendationFeedbackShape(value: unknown): value is RecommendationFeedback {
  if (!isRecord(value)) return false;
  return Boolean(
    isSafeInteger(value.id) &&
    value.id > 0 &&
    typeof value.candidateId === "string" &&
    value.candidateId.length > 0 &&
    hasOptionalEnum(value, "verdict", FEEDBACK_VERDICTS) &&
    (value.rating === undefined ||
      (isSafeInteger(value.rating) && value.rating >= 1 && value.rating <= 5)) &&
    typeof value.actuallyWorn === "boolean" &&
    Array.isArray(value.reasonCodes) &&
    value.reasonCodes.every((reason) =>
      typeof reason === "string" && includes(FEEDBACK_REASONS, reason)
    ) &&
    typeof value.comment === "string" &&
    hasOptionalPositiveSafeInteger(value, "woreInsteadOutfitId") &&
    hasOptionalPositiveSafeInteger(value, "wearLogId") &&
    typeof value.createdAt === "string" &&
    value.createdAt.length > 0 &&
    typeof value.updatedAt === "string" &&
    value.updatedAt.length > 0
  );
}

function isOutfitPairStatShape(value: unknown): value is OutfitPairStat {
  if (!isRecord(value)) return false;
  return Boolean(
    isSafeInteger(value.garmentAId) &&
    value.garmentAId > 0 &&
    isSafeInteger(value.garmentBId) &&
    value.garmentBId > value.garmentAId &&
    isSafeInteger(value.likes) &&
    value.likes >= 0 &&
    isSafeInteger(value.dislikes) &&
    value.dislikes >= 0 &&
    isSafeInteger(value.wornCount) &&
    value.wornCount >= 0 &&
    isSafeInteger(value.totalFeedback) &&
    value.totalFeedback >= 1 &&
    value.likes + value.dislikes <= value.totalFeedback &&
    value.wornCount <= value.totalFeedback &&
    isSafeInteger(value.signal) &&
    value.signal === value.likes + 2 * value.wornCount - 2 * value.dislikes &&
    typeof value.updatedAt === "string" &&
    value.updatedAt.length > 0
  );
}

function isGarmentAvailabilityEventShape(value: unknown): value is GarmentAvailabilityEvent {
  if (!isRecord(value)) return false;
  return Boolean(
    isSafeInteger(value.id) &&
    value.id > 0 &&
    isSafeInteger(value.garmentId) &&
    value.garmentId > 0 &&
    typeof value.previousStatus === "string" &&
    includes(GARMENT_AVAILABILITY_STATUSES, value.previousStatus) &&
    typeof value.status === "string" &&
    includes(GARMENT_AVAILABILITY_STATUSES, value.status) &&
    value.previousStatus !== value.status &&
    typeof value.changedAt === "string" &&
    value.changedAt.length > 0
  );
}

function isGarmentAssetMetadataShape(value: unknown): value is GarmentAssetMetadata {
  if (!isRecord(value)) return false;
  return Boolean(
    isSafeInteger(value.id) &&
    value.id > 0 &&
    isSafeInteger(value.garmentId) &&
    value.garmentId > 0 &&
    typeof value.kind === "string" &&
    value.kind.trim().length > 0 &&
    value.mimeType === "image/webp" &&
    isSafeInteger(value.byteSize) &&
    value.byteSize > 0 &&
    isSafeInteger(value.width) &&
    value.width > 0 &&
    isSafeInteger(value.height) &&
    value.height > 0 &&
    typeof value.sha256 === "string" &&
    /^[0-9a-f]{64}$/.test(value.sha256) &&
    typeof value.active === "boolean" &&
    typeof value.createdAt === "string" &&
    value.createdAt.length > 0 &&
    typeof value.archivePath === "string" &&
    value.archivePath === `assets/${value.id}.webp`
  );
}

function hasOptionalFiniteNumber(record: Record<string, unknown>, key: string): boolean {
  return record[key] === undefined || isFiniteNumber(record[key]);
}

function hasOptionalSafeInteger(record: Record<string, unknown>, key: string): boolean {
  return record[key] === undefined || isSafeInteger(record[key]);
}

function hasOptionalPositiveSafeInteger(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  return value === undefined || (isSafeInteger(value) && value > 0);
}

function hasOptionalString(record: Record<string, unknown>, key: string): boolean {
  return record[key] === undefined || typeof record[key] === "string";
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
