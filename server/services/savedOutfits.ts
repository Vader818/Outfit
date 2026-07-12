import type {
  Garment,
  OutfitSlot,
  SaveRecommendationCandidateInput,
  SavedOutfit,
  SavedOutfitCreateInput,
  SavedOutfitGarmentSnapshot,
  SavedOutfitItem,
  SavedOutfitItemInput,
  SavedOutfitReplacementInput,
  SavedOutfitSource,
  SavedOutfitUpdateInput
} from "../../src/shared/types";
import { getGarmentById, type AppDatabase } from "../db";
import {
  ApiError,
  ValidationError,
  validateSaveRecommendationCandidate,
  validateSavedOutfitCreate,
  validateSavedOutfitReplacement,
  validateSavedOutfitUpdate,
  validateUuidParam
} from "../validation";

export interface ListSavedOutfitOptions {
  scope?: "active" | "archived" | "all";
}

interface SavedOutfitHeaderRow {
  id: number;
  name: string;
  notes: string;
  source: SavedOutfitSource;
  source_candidate_id: string | null;
  derived_from_outfit_id: number | null;
  favorite: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SavedOutfitItemRow {
  id: number;
  outfit_id: number;
  garment_id: number | null;
  slot: OutfitSlot;
  position: number;
  garment_snapshot: string;
}

interface PreparedSavedOutfitItem {
  garmentId: number | null;
  slot: OutfitSlot;
  position: number;
  snapshot: SavedOutfitGarmentSnapshot;
}

interface RecommendationCandidateSnapshotRow {
  candidate_id: string;
  item_ids_json: string;
  input_json: string;
  result_json: string;
}

const SLOT_ORDER: Record<OutfitSlot, number> = {
  top: 0,
  bottom: 1,
  dress: 2,
  outerwear: 3,
  shoes: 4,
  accessory: 5
};
const OUTFIT_SLOTS = new Set<OutfitSlot>(Object.keys(SLOT_ORDER) as OutfitSlot[]);
const OCCASION_LABELS: Record<string, string> = {
  casual: "日常",
  "smart-casual": "通勤",
  formal: "正式",
  sport: "运动"
};

export function listSavedOutfits(
  db: AppDatabase,
  options: ListSavedOutfitOptions = {}
): SavedOutfit[] {
  const where = options.scope === "all"
    ? "1 = 1"
    : options.scope === "archived"
      ? "archived_at IS NOT NULL"
      : "archived_at IS NULL";
  const rows = db.prepare(`
    SELECT id, name, notes, source, source_candidate_id, derived_from_outfit_id,
      favorite, archived_at, created_at, updated_at
    FROM saved_outfits
    WHERE ${where}
    ORDER BY favorite DESC, updated_at DESC, id DESC
  `).all() as unknown as SavedOutfitHeaderRow[];
  return rows.map((row) => mapSavedOutfit(db, row));
}

export function getSavedOutfit(db: AppDatabase, id: number): SavedOutfit {
  return mapSavedOutfit(db, getSavedOutfitHeader(db, id));
}

export function createSavedOutfit(
  db: AppDatabase,
  input: SavedOutfitCreateInput
): SavedOutfit {
  const validated = validateSavedOutfitCreate(input);
  return inImmediateTransaction(db, () => {
    const items = prepareLiveItems(db, validated.items);
    assertOutfitCompleteness(items);
    const timestamp = new Date().toISOString();
    const insert = db.prepare(`
      INSERT INTO saved_outfits (
        name, notes, source, source_candidate_id, derived_from_outfit_id,
        favorite, archived_at, created_at, updated_at
      ) VALUES (?, ?, 'manual', NULL, NULL, ?, NULL, ?, ?)
    `).run(
      validated.name,
      validated.notes ?? "",
      validated.favorite ? 1 : 0,
      timestamp,
      timestamp
    );
    const outfitId = Number(insert.lastInsertRowid);
    assertInsertedId(outfitId, "saved outfit");
    insertItems(db, outfitId, items);
    return getSavedOutfit(db, outfitId);
  });
}

export function saveRecommendationCandidate(
  db: AppDatabase,
  candidateId: string,
  input: SaveRecommendationCandidateInput
): SavedOutfit {
  const trustedCandidateId = validateUuidParam(candidateId, "candidateId");
  const validated = validateSaveRecommendationCandidate(input);
  return inImmediateTransaction(db, () => {
    const candidate = getRecommendationCandidateSnapshot(db, trustedCandidateId);
    const { items, defaultName } = prepareRecommendationCandidate(db, candidate);
    assertOutfitCompleteness(items);
    const timestamp = new Date().toISOString();
    const insert = db.prepare(`
      INSERT INTO saved_outfits (
        name, notes, source, source_candidate_id, derived_from_outfit_id,
        favorite, archived_at, created_at, updated_at
      ) VALUES (?, ?, 'recommendation', ?, NULL, ?, NULL, ?, ?)
    `).run(
      validated.name ?? defaultName,
      validated.notes ?? "",
      trustedCandidateId,
      validated.favorite ? 1 : 0,
      timestamp,
      timestamp
    );
    const outfitId = Number(insert.lastInsertRowid);
    assertInsertedId(outfitId, "saved recommendation outfit");
    insertItems(db, outfitId, items);
    return getSavedOutfit(db, outfitId);
  });
}

export function applySavedOutfitReplacement(
  db: AppDatabase,
  outfitId: number,
  input: SavedOutfitReplacementInput
): SavedOutfit {
  const validated = validateSavedOutfitReplacement(input);
  return inImmediateTransaction(db, () => {
    const original = getSavedOutfit(db, outfitId);
    const target = original.items.find((item) =>
      item.garmentSnapshot.id === validated.targetGarmentId
    );
    if (!target) {
      throw new ValidationError("替换目标不在原搭配中");
    }
    if (original.items.some((item) => item.garmentSnapshot.id === validated.replacementGarmentId)) {
      throw new ValidationError("替换衣物已经在原搭配中");
    }
    const replacement = getGarmentById(db, validated.replacementGarmentId);
    if (!replacement.owned || replacement.archivedAt || !replacement.confirmed || replacement.excluded) {
      throw new ValidationError("替换衣物必须是当前已确认且未排除推荐的衣物");
    }
    if (replacement.category !== target.slot) {
      throw new ValidationError("替换衣物类别与目标位置不一致");
    }

    const items: PreparedSavedOutfitItem[] = original.items.map((item) =>
      item.id === target.id
        ? {
            garmentId: replacement.id,
            slot: item.slot,
            position: item.position,
            snapshot: snapshotGarment(replacement)
          }
        : {
            garmentId: item.garmentId ?? garmentLinkId(db, item.garmentSnapshot.id),
            slot: item.slot,
            position: item.position,
            snapshot: item.garmentSnapshot
          }
    );
    assertOutfitCompleteness(items);
    const timestamp = new Date().toISOString();
    const insert = db.prepare(`
      INSERT INTO saved_outfits (
        name, notes, source, source_candidate_id, derived_from_outfit_id,
        favorite, archived_at, created_at, updated_at
      ) VALUES (?, ?, 'replacement', NULL, ?, 0, NULL, ?, ?)
    `).run(
      validated.name ?? `${original.name} · 新版本`,
      original.notes,
      original.id,
      timestamp,
      timestamp
    );
    const derivedId = Number(insert.lastInsertRowid);
    assertInsertedId(derivedId, "replacement outfit");
    insertItems(db, derivedId, items);
    return getSavedOutfit(db, derivedId);
  });
}

export function updateSavedOutfit(
  db: AppDatabase,
  id: number,
  input: SavedOutfitUpdateInput
): SavedOutfit {
  const validated = validateSavedOutfitUpdate(input);
  return inImmediateTransaction(db, () => {
    const current = getSavedOutfit(db, id);
    const replacementItems = validated.items === undefined
      ? undefined
      : prepareLiveItems(db, validated.items);
    if (replacementItems) assertOutfitCompleteness(replacementItems);

    db.prepare(`
      UPDATE saved_outfits
      SET name = ?, notes = ?, favorite = ?, updated_at = ?
      WHERE id = ?
    `).run(
      validated.name ?? current.name,
      validated.notes ?? current.notes,
      (validated.favorite ?? current.favorite) ? 1 : 0,
      new Date().toISOString(),
      id
    );

    if (replacementItems) {
      db.prepare("DELETE FROM saved_outfit_items WHERE outfit_id = ?").run(id);
      insertItems(db, id, replacementItems);
    }
    return getSavedOutfit(db, id);
  });
}

export function archiveSavedOutfit(db: AppDatabase, id: number): SavedOutfit {
  getSavedOutfitHeader(db, id);
  db.prepare(`
    UPDATE saved_outfits
    SET archived_at = COALESCE(archived_at, ?), updated_at = ?
    WHERE id = ?
  `).run(new Date().toISOString(), new Date().toISOString(), id);
  return getSavedOutfit(db, id);
}

function prepareLiveItems(
  db: AppDatabase,
  inputs: readonly SavedOutfitItemInput[]
): PreparedSavedOutfitItem[] {
  const items = inputs.map((input) => {
    const garment = getGarmentById(db, input.garmentId);
    if (!garment.owned || garment.archivedAt) {
      throw new ValidationError(`衣物 ${garment.id} 已归档或不在当前衣橱中`);
    }
    if (!garment.confirmed) {
      throw new ValidationError(`衣物 ${garment.id} 尚未确认`);
    }
    if (garment.category !== input.slot) {
      throw new ValidationError(`衣物 ${garment.id} 的类别与 slot ${input.slot} 不一致`);
    }
    return {
      garmentId: garment.id,
      slot: input.slot,
      position: input.position,
      snapshot: snapshotGarment(garment)
    };
  });
  return items.sort(comparePreparedItems);
}

function getRecommendationCandidateSnapshot(
  db: AppDatabase,
  candidateId: string
): RecommendationCandidateSnapshotRow {
  const row = db.prepare(`
    SELECT candidates.candidate_id, candidates.item_ids_json,
      runs.input_json, runs.result_json
    FROM recommendation_candidates AS candidates
    INNER JOIN recommendation_runs AS runs ON runs.id = candidates.run_id
    WHERE candidates.candidate_id = ?
  `).get(candidateId) as unknown as RecommendationCandidateSnapshotRow | undefined;
  if (!row) {
    throw new ApiError("NOT_FOUND", "推荐候选不存在", 404);
  }
  return row;
}

function prepareRecommendationCandidate(db: AppDatabase, candidate: RecommendationCandidateSnapshotRow): {
  items: PreparedSavedOutfitItem[];
  defaultName: string;
} {
  const input = parseStoredRecord("recommendation_runs.input_json", candidate.input_json);
  const result = parseStoredRecord("recommendation_runs.result_json", candidate.result_json);
  if (!Array.isArray(result.outfits)) {
    throw new Error(`Recommendation candidate ${candidate.candidate_id} snapshot has no outfits`);
  }
  const outfit = result.outfits.find((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    return record.candidateId === candidate.candidate_id && record.id === candidate.candidate_id;
  }) as Record<string, unknown> | undefined;
  if (!outfit || !Array.isArray(outfit.items)) {
    throw new Error(`Recommendation candidate ${candidate.candidate_id} snapshot is missing`);
  }

  const snapshots = outfit.items.map((value, index) => parseHistoricalGarmentSnapshot(
    candidate.candidate_id,
    value,
    index
  )).sort((left, right) =>
    SLOT_ORDER[left.category] - SLOT_ORDER[right.category] || left.id - right.id
  );
  const positions = new Map<OutfitSlot, number>();
  const items = snapshots.map((snapshot) => {
    const slot = snapshot.category;
    const position = positions.get(slot) ?? 0;
    positions.set(slot, position + 1);
    return {
      garmentId: garmentLinkId(db, snapshot.id),
      slot,
      position,
      snapshot
    };
  });
  const storedItemIds = parseStoredItemIds(candidate.candidate_id, candidate.item_ids_json);
  const snapshotItemIds = items.map((item) => item.snapshot.id);
  if (
    storedItemIds.length !== snapshotItemIds.length ||
    storedItemIds.some((id, index) => id !== snapshotItemIds[index])
  ) {
    throw new Error(`Recommendation candidate ${candidate.candidate_id} snapshot item IDs do not match`);
  }

  const resultWeather = result.weather && typeof result.weather === "object" && !Array.isArray(result.weather)
    ? result.weather as Record<string, unknown>
    : undefined;
  const inputWeather = input.weather && typeof input.weather === "object" && !Array.isArray(input.weather)
    ? input.weather as Record<string, unknown>
    : undefined;
  const date = resultWeather?.date ?? inputWeather?.date;
  const occasion = result.occasion ?? input.occasion;
  if (typeof date !== "string" || typeof occasion !== "string") {
    throw new Error(`Recommendation candidate ${candidate.candidate_id} snapshot has no date or occasion`);
  }
  return {
    items,
    defaultName: `${date} · ${OCCASION_LABELS[occasion] ?? occasion}`
  };
}

function garmentLinkId(db: AppDatabase, id: number): number | null {
  const row = db.prepare("SELECT id FROM garments WHERE id = ?").get(id) as { id: number } | undefined;
  return row?.id ?? null;
}

function parseHistoricalGarmentSnapshot(
  candidateId: string,
  value: unknown,
  index: number
): SavedOutfitGarmentSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Recommendation candidate ${candidateId} item ${index} is invalid`);
  }
  const item = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(item.id) || Number(item.id) <= 0 ||
    typeof item.name !== "string" ||
    typeof item.brand !== "string" ||
    typeof item.category !== "string" || !OUTFIT_SLOTS.has(item.category as OutfitSlot) ||
    typeof item.imageUrl !== "string"
  ) {
    throw new Error(`Recommendation candidate ${candidateId} item ${index} snapshot is invalid`);
  }
  return {
    id: Number(item.id),
    name: item.name,
    brand: item.brand,
    category: item.category as OutfitSlot,
    imageUrl: item.imageUrl
  };
}

function parseStoredItemIds(candidateId: string, value: string): number[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`Recommendation candidate ${candidateId} item IDs are invalid JSON`);
  }
  if (!Array.isArray(parsed) || !parsed.every((id) => Number.isSafeInteger(id) && id > 0)) {
    throw new Error(`Recommendation candidate ${candidateId} item IDs are invalid`);
  }
  return parsed as number[];
}

function parseStoredRecord(label: string, value: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${label} is invalid JSON`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be an object`);
  }
  return parsed as Record<string, unknown>;
}

function snapshotGarment(garment: Garment): SavedOutfitGarmentSnapshot {
  return {
    id: garment.id,
    name: garment.name,
    brand: garment.brand,
    category: garment.category,
    imageUrl: garment.imageUrl
  };
}

function assertOutfitCompleteness(items: readonly PreparedSavedOutfitItem[]): void {
  const garmentIds = new Set<number>();
  const positionKeys = new Set<string>();
  const slots = new Map<OutfitSlot, PreparedSavedOutfitItem[]>();
  for (const item of items) {
    const snapshotId = item.snapshot.id;
    if (garmentIds.has(snapshotId)) {
      throw new ValidationError(`衣物 ${snapshotId} 不能在同一搭配中重复`);
    }
    const positionKey = `${item.slot}:${item.position}`;
    if (positionKeys.has(positionKey)) {
      throw new ValidationError(`搭配位置 ${positionKey} 不能重复`);
    }
    if (item.slot !== "accessory" && item.position !== 0) {
      throw new ValidationError(`${item.slot} 位置只能使用 position 0`);
    }
    garmentIds.add(snapshotId);
    positionKeys.add(positionKey);
    slots.set(item.slot, [...(slots.get(item.slot) ?? []), item]);
  }

  const accessories = [...(slots.get("accessory") ?? [])].sort((left, right) => left.position - right.position);
  accessories.forEach((item, index) => {
    if (item.position !== index) {
      throw new ValidationError("配饰 position 必须从 0 开始连续排列");
    }
  });

  const hasDress = Boolean(slots.get("dress")?.length);
  const hasTop = Boolean(slots.get("top")?.length);
  const hasBottom = Boolean(slots.get("bottom")?.length);
  if (hasDress && (hasTop || hasBottom)) {
    throw new ValidationError("连衣裙不能与上装或下装同时作为核心单品");
  }
  if (!hasDress && !(hasTop && hasBottom)) {
    throw new ValidationError("完整搭配需要一件连衣裙，或同时包含上装和下装");
  }
}

function insertItems(
  db: AppDatabase,
  outfitId: number,
  items: readonly PreparedSavedOutfitItem[]
): void {
  const insert = db.prepare(`
    INSERT INTO saved_outfit_items (
      outfit_id, garment_id, slot, position, garment_snapshot
    ) VALUES (?, ?, ?, ?, ?)
  `);
  for (const item of items) {
    const result = insert.run(
      outfitId,
      item.garmentId,
      item.slot,
      item.position,
      JSON.stringify(item.snapshot)
    );
    assertInsertedId(Number(result.lastInsertRowid), "saved outfit item");
  }
}

function getSavedOutfitHeader(db: AppDatabase, id: number): SavedOutfitHeaderRow {
  const row = db.prepare(`
    SELECT id, name, notes, source, source_candidate_id, derived_from_outfit_id,
      favorite, archived_at, created_at, updated_at
    FROM saved_outfits
    WHERE id = ?
  `).get(id) as unknown as SavedOutfitHeaderRow | undefined;
  if (!row) {
    throw new ApiError("NOT_FOUND", "保存的搭配不存在", 404);
  }
  return row;
}

function mapSavedOutfit(db: AppDatabase, row: SavedOutfitHeaderRow): SavedOutfit {
  const itemRows = db.prepare(`
    SELECT id, outfit_id, garment_id, slot, position, garment_snapshot
    FROM saved_outfit_items
    WHERE outfit_id = ?
    ORDER BY
      CASE slot
        WHEN 'top' THEN 0
        WHEN 'bottom' THEN 1
        WHEN 'dress' THEN 2
        WHEN 'outerwear' THEN 3
        WHEN 'shoes' THEN 4
        WHEN 'accessory' THEN 5
        ELSE 6
      END,
      position ASC,
      id ASC
  `).all(row.id) as unknown as SavedOutfitItemRow[];
  return {
    id: row.id,
    name: row.name,
    notes: row.notes,
    source: row.source,
    ...(row.source_candidate_id === null ? {} : { sourceCandidateId: row.source_candidate_id }),
    ...(row.derived_from_outfit_id === null ? {} : { derivedFromOutfitId: row.derived_from_outfit_id }),
    favorite: Boolean(row.favorite),
    ...(row.archived_at === null ? {} : { archivedAt: row.archived_at }),
    items: itemRows.map(mapSavedOutfitItem),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapSavedOutfitItem(row: SavedOutfitItemRow): SavedOutfitItem {
  return {
    id: row.id,
    outfitId: row.outfit_id,
    ...(row.garment_id === null ? {} : { garmentId: row.garment_id }),
    slot: row.slot,
    position: row.position,
    garmentSnapshot: parseSnapshot(row)
  };
}

function parseSnapshot(row: SavedOutfitItemRow): SavedOutfitGarmentSnapshot {
  let value: unknown;
  try {
    value = JSON.parse(row.garment_snapshot);
  } catch {
    throw new Error(`saved_outfit_items row ${row.id} has invalid garment_snapshot JSON`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`saved_outfit_items row ${row.id} garment_snapshot must be an object`);
  }
  const snapshot = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(snapshot.id) || Number(snapshot.id) <= 0 ||
    typeof snapshot.name !== "string" ||
    typeof snapshot.brand !== "string" ||
    typeof snapshot.category !== "string" || !OUTFIT_SLOTS.has(snapshot.category as OutfitSlot) ||
    typeof snapshot.imageUrl !== "string"
  ) {
    throw new Error(`saved_outfit_items row ${row.id} has an invalid garment_snapshot shape`);
  }
  return snapshot as unknown as SavedOutfitGarmentSnapshot;
}

function comparePreparedItems(left: PreparedSavedOutfitItem, right: PreparedSavedOutfitItem): number {
  return SLOT_ORDER[left.slot] - SLOT_ORDER[right.slot] ||
    left.position - right.position ||
    left.snapshot.id - right.snapshot.id;
}

function assertInsertedId(value: number, entity: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`SQLite returned an invalid ${entity} id`);
  }
}

function inImmediateTransaction<T>(db: AppDatabase, callback: () => T): T {
  if (db.isTransaction) {
    throw new Error("Saved outfit transaction cannot start inside an existing transaction");
  }
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
        // Preserve the original saved-outfit failure.
      }
    }
    throw error;
  }
}
