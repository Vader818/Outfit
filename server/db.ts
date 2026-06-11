import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import type { Garment, OutfitExport, PersonalProfile, RecommendationRunEntry, TaobaoDetailProp, WardrobeInsights, WearLogEntry, WeatherSnapshot } from "../src/shared/types";
import { classifyGarment } from "./services/classify";
import { buildGarmentDisplayInfo, isTrustedProductImage, isWardrobeImportCategory, normalizeTaobaoBatch, preferredImage, type SourceOrderItemDraft } from "./services/importTaobao";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");

export type AppDatabase = DatabaseSyncType;

export interface DbImportResult {
  batchId: string;
  summary: {
    totalItems: number;
    uniqueItems: number;
    skippedRefunded: number;
    skippedNonApparel: number;
    createdGarments: number;
  };
}

export interface GarmentUpdate {
  brand?: string;
  name?: string;
  rawName?: string;
  category?: string;
  color?: string;
  warmth?: string;
  seasons?: string[];
  styles?: string[];
  formality?: string;
  imageUrl?: string;
  size?: string;
  materials?: string[];
  patterns?: string[];
  tags?: string[];
  owned?: boolean;
  confirmed?: boolean;
  excluded?: boolean;
  notes?: string;
}

interface PurchasedSourceRow {
  id: number;
  title: string;
  sku: string;
  image_url: string | null;
  is_refunded: number;
}

interface StoredDetailRow {
  id: number;
  detail_url: string | null;
  detail_title: string | null;
  detail_props: string | null;
  detail_description: string | null;
  detail_images: string | null;
  detail_raw_text: string | null;
}

export const DEFAULT_PERSONAL_PROFILE: PersonalProfile = {
  heightCm: 176,
  weightKg: 57,
  bodyType: "slim-tall",
  skinTone: "dark-yellow",
  colorDisposition: "cool-clean",
  temperatureSensitivity: "neutral",
  preferredColors: ["white", "blue", "gray"],
  avoidedColors: ["yellow", "brown"],
  preferredStyles: ["smart-casual"]
};

export function defaultDatabasePath(): string {
  return join(process.cwd(), "data", "outfit.sqlite");
}

export function createDatabase(databasePath = defaultDatabasePath()): AppDatabase {
  if (databasePath !== ":memory:") {
    mkdirSync(dirname(databasePath), { recursive: true });
  }
  const db = new DatabaseSync(databasePath);
  migrate(db);
  return db;
}

export function migrate(db: AppDatabase): void {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS source_order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_key TEXT NOT NULL UNIQUE,
      source TEXT NOT NULL,
      page_type TEXT,
      item_id TEXT,
      order_id TEXT,
      order_time TEXT,
      title TEXT NOT NULL,
      sku TEXT,
      quantity INTEGER NOT NULL DEFAULT 1,
      payment REAL,
      status TEXT,
      refund_text TEXT,
      item_url TEXT,
      image_url TEXT,
      raw_text TEXT,
      detail_url TEXT,
      detail_title TEXT,
      detail_props TEXT,
      detail_description TEXT,
      detail_images TEXT,
      detail_raw_text TEXT,
      is_refunded INTEGER NOT NULL DEFAULT 0,
      is_apparel INTEGER NOT NULL DEFAULT 0,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS garments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_order_item_id INTEGER UNIQUE,
      brand TEXT,
      name TEXT NOT NULL,
      raw_name TEXT,
      category TEXT NOT NULL,
      color TEXT NOT NULL,
      warmth TEXT NOT NULL,
      seasons TEXT NOT NULL,
      styles TEXT NOT NULL,
      formality TEXT NOT NULL,
      size TEXT,
      materials TEXT NOT NULL DEFAULT '[]',
      patterns TEXT NOT NULL DEFAULT '[]',
      tags TEXT NOT NULL DEFAULT '[]',
      image_url TEXT,
      owned INTEGER NOT NULL DEFAULT 1,
      confirmed INTEGER NOT NULL DEFAULT 0,
      excluded INTEGER NOT NULL DEFAULT 0,
      confidence REAL NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (source_order_item_id) REFERENCES source_order_items(id)
    );

    CREATE TABLE IF NOT EXISTS weather_cache (
      cache_key TEXT PRIMARY KEY,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      payload TEXT NOT NULL,
      fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS wear_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      garment_ids TEXT NOT NULL,
      context TEXT,
      worn_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS recommendation_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      input_json TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      username_normalized TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  ensureColumn(db, "source_order_items", "page_type", "TEXT");
  ensureColumn(db, "source_order_items", "item_id", "TEXT");
  ensureColumn(db, "source_order_items", "order_id", "TEXT");
  ensureColumn(db, "source_order_items", "order_time", "TEXT");
  ensureColumn(db, "source_order_items", "sku", "TEXT");
  ensureColumn(db, "source_order_items", "quantity", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "source_order_items", "payment", "REAL");
  ensureColumn(db, "source_order_items", "status", "TEXT");
  ensureColumn(db, "source_order_items", "refund_text", "TEXT");
  ensureColumn(db, "source_order_items", "item_url", "TEXT");
  ensureColumn(db, "source_order_items", "image_url", "TEXT");
  ensureColumn(db, "source_order_items", "raw_text", "TEXT");
  ensureColumn(db, "source_order_items", "detail_url", "TEXT");
  ensureColumn(db, "source_order_items", "detail_title", "TEXT");
  ensureColumn(db, "source_order_items", "detail_props", "TEXT");
  ensureColumn(db, "source_order_items", "detail_description", "TEXT");
  ensureColumn(db, "source_order_items", "detail_images", "TEXT");
  ensureColumn(db, "source_order_items", "detail_raw_text", "TEXT");
  ensureColumn(db, "source_order_items", "is_refunded", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "source_order_items", "is_apparel", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "garments", "brand", "TEXT");
  ensureColumn(db, "garments", "raw_name", "TEXT");
  ensureColumn(db, "garments", "size", "TEXT");
  ensureColumn(db, "garments", "materials", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "garments", "patterns", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "garments", "tags", "TEXT NOT NULL DEFAULT '[]'");
  db.exec("CREATE INDEX IF NOT EXISTS idx_source_order_items_item_id ON source_order_items(item_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)");
  backfillGarmentDisplayData(db);
}

export function importTaobaoBatchIntoDb(db: AppDatabase, payload: unknown): DbImportResult {
  const normalized = normalizeTaobaoBatch(payload);
  const upsertSource = db.prepare(`
    INSERT INTO source_order_items (
      external_key, source, page_type, item_id, order_id, order_time, title, sku, quantity, payment, status,
      refund_text, item_url, image_url, raw_text, detail_url, detail_title, detail_props,
      detail_description, detail_images, detail_raw_text, is_refunded, is_apparel
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(external_key) DO UPDATE SET
      source = excluded.source,
      page_type = excluded.page_type,
      item_id = COALESCE(NULLIF(excluded.item_id, ''), source_order_items.item_id),
      order_id = excluded.order_id,
      order_time = excluded.order_time,
      title = excluded.title,
      sku = excluded.sku,
      quantity = excluded.quantity,
      payment = excluded.payment,
      status = excluded.status,
      refund_text = excluded.refund_text,
      item_url = excluded.item_url,
      image_url = excluded.image_url,
      raw_text = excluded.raw_text,
      detail_url = COALESCE(NULLIF(excluded.detail_url, ''), source_order_items.detail_url),
      detail_title = COALESCE(NULLIF(excluded.detail_title, ''), source_order_items.detail_title),
      detail_props = COALESCE(NULLIF(excluded.detail_props, '[]'), source_order_items.detail_props),
      detail_description = COALESCE(NULLIF(excluded.detail_description, ''), source_order_items.detail_description),
      detail_images = COALESCE(NULLIF(excluded.detail_images, '[]'), source_order_items.detail_images),
      detail_raw_text = COALESCE(NULLIF(excluded.detail_raw_text, ''), source_order_items.detail_raw_text),
      is_refunded = excluded.is_refunded,
      is_apparel = excluded.is_apparel,
      imported_at = CURRENT_TIMESTAMP
  `);
  const selectSourceId = db.prepare("SELECT id FROM source_order_items WHERE external_key = ?");
  const selectPurchasedSourcesByItemId = db.prepare(`
    SELECT id, title, sku, image_url, is_refunded
    FROM source_order_items
    WHERE item_id = ?
      AND (page_type = 'order-list' OR COALESCE(order_id, '') <> '' OR COALESCE(sku, '') <> '')
    ORDER BY id ASC
  `);
  const selectStandaloneDetailByItemId = db.prepare(`
    SELECT id, detail_url, detail_title, detail_props, detail_description, detail_images, detail_raw_text
    FROM source_order_items
    WHERE item_id = ?
      AND page_type = 'item-detail'
      AND COALESCE(sku, '') = ''
      AND COALESCE(order_id, '') = ''
    ORDER BY id DESC
    LIMIT 1
  `);
  const updateSourceDetailsFromDetail = db.prepare(`
    UPDATE source_order_items
    SET page_type = 'item-detail',
      detail_url = COALESCE(NULLIF(?, ''), detail_url),
      detail_title = COALESCE(NULLIF(?, ''), detail_title),
      detail_props = COALESCE(NULLIF(?, '[]'), detail_props),
      detail_description = COALESCE(NULLIF(?, ''), detail_description),
      detail_images = COALESCE(NULLIF(?, '[]'), detail_images),
      detail_raw_text = COALESCE(NULLIF(?, ''), detail_raw_text),
      imported_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  const excludeStandaloneDetailGarments = db.prepare(`
    UPDATE garments
    SET owned = 0, excluded = 1, updated_at = CURRENT_TIMESTAMP
    WHERE source_order_item_id IN (
      SELECT id
      FROM source_order_items
      WHERE item_id = ?
        AND page_type = 'item-detail'
        AND COALESCE(sku, '') = ''
        AND COALESCE(order_id, '') = ''
    )
  `);
  const excludeRefundedGarment = db.prepare(`
    UPDATE garments
    SET owned = 0, excluded = 1, updated_at = CURRENT_TIMESTAMP
    WHERE source_order_item_id = ?
  `);
  const insertGarment = db.prepare(`
    INSERT OR IGNORE INTO garments (
      source_order_item_id, brand, name, raw_name, category, color, warmth, seasons, styles, formality,
      image_url, owned, confirmed, excluded, confidence, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const selectGarmentBySource = db.prepare("SELECT id, brand, name, raw_name, image_url, confirmed FROM garments WHERE source_order_item_id = ?");
  const updateGarmentFromSource = db.prepare(`
    UPDATE garments
    SET brand = ?, name = ?, raw_name = ?, category = ?, color = ?, warmth = ?, seasons = ?, styles = ?,
      formality = ?, image_url = ?, confidence = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE source_order_item_id = ?
  `);

  function upsertGarmentForSource(sourceItemId: number, sourceItem: SourceOrderItemDraft): number {
    if (sourceItem.isRefunded) {
      excludeRefundedGarment.run(sourceItemId);
      return 0;
    }
    if (!sourceItem.isApparel) return 0;

    const displayInfo = buildGarmentDisplayInfo(sourceItem);
    const classification = classifyGarment(displayInfo.rawName, [
      sourceItem.sku,
      sourceItem.detailProps.map((prop) => `${prop.name} ${prop.value}`).join(" "),
      sourceItem.detailDescription
    ].filter(Boolean).join(" "));
    if (!classification || !isWardrobeImportCategory(classification.category)) return 0;
    const garmentImage = preferredImage(sourceItem);
    const garmentNotes = sourceItem.detailProps.length || sourceItem.detailDescription
      ? [
          sourceItem.detailProps.map((prop) => `${prop.name}: ${prop.value}`).join("; "),
          sourceItem.detailDescription
        ].filter(Boolean).join("\n")
      : "";

    const existingGarment = selectGarmentBySource.get(sourceItemId) as Pick<GarmentRow, "id" | "brand" | "name" | "raw_name" | "image_url" | "confirmed"> | undefined;
    if (existingGarment) {
      const isConfirmed = Boolean(existingGarment.confirmed);
      const preserveName = shouldPreserveConfirmedName(existingGarment.name, displayInfo, isConfirmed);
      updateGarmentFromSource.run(
        displayInfo.brand || existingGarment.brand || "",
        preserveName ? existingGarment.name : displayInfo.name,
        displayInfo.rawName || existingGarment.raw_name || existingGarment.name,
        classification.category,
        classification.color,
        classification.warmth,
        JSON.stringify(classification.seasons),
        JSON.stringify(classification.styles),
        classification.formality,
        chooseImageForUpdate(existingGarment.image_url || "", garmentImage, isConfirmed),
        classification.confidence,
        garmentNotes,
        sourceItemId
      );
      return 0;
    }

    const garmentResult = insertGarment.run(
      sourceItemId,
      displayInfo.brand,
      displayInfo.name,
      displayInfo.rawName,
      classification.category,
      classification.color,
      classification.warmth,
      JSON.stringify(classification.seasons),
      JSON.stringify(classification.styles),
      classification.formality,
      garmentImage,
      1,
      0,
      0,
      classification.confidence,
      garmentNotes
    );
    return Number(garmentResult.changes);
  }

  function applyDetailToPurchasedSources(detailItem: SourceOrderItemDraft): number | null {
    if (!isStandaloneDetailItem(detailItem)) return null;
    const purchasedSources = selectPurchasedSourcesByItemId.all(detailItem.itemId) as unknown as PurchasedSourceRow[];
    if (!purchasedSources.length) return null;

    let created = 0;
    for (const purchasedSource of purchasedSources) {
      updateSourceDetailsFromDetail.run(
        detailItem.detailUrl,
        detailItem.detailTitle,
        JSON.stringify(detailItem.detailProps),
        detailItem.detailDescription,
        JSON.stringify(detailItem.detailImages),
        detailItem.detailRawText,
        purchasedSource.id
      );
      created += upsertGarmentForSource(purchasedSource.id, {
        ...detailItem,
        title: purchasedSource.title || detailItem.title,
        sku: purchasedSource.sku || detailItem.sku,
        imageUrl: purchasedSource.image_url || detailItem.imageUrl,
        isRefunded: Boolean(purchasedSource.is_refunded)
      });
    }
    excludeStandaloneDetailGarments.run(detailItem.itemId);
    return created;
  }

  let createdGarments = 0;
  db.exec("BEGIN");
  try {
    for (const normalizedItem of normalized.sourceItems) {
      const appliedDetailCount = applyDetailToPurchasedSources(normalizedItem);
      if (appliedDetailCount !== null) {
        createdGarments += appliedDetailCount;
        continue;
      }

      const sourceItem = withStoredStandaloneDetail(normalizedItem, selectStandaloneDetailByItemId);
      const externalKey = sourceItem.externalKey;
      upsertSource.run(
        externalKey,
        sourceItem.source,
        sourceItem.pageType,
        sourceItem.itemId,
        sourceItem.orderId,
        sourceItem.orderTime,
        sourceItem.title,
        sourceItem.sku,
        sourceItem.quantity,
        sourceItem.payment,
        sourceItem.status,
        sourceItem.refundText,
        sourceItem.itemUrl,
        sourceItem.imageUrl,
        sourceItem.rawText,
        sourceItem.detailUrl,
        sourceItem.detailTitle,
        JSON.stringify(sourceItem.detailProps),
        sourceItem.detailDescription,
        JSON.stringify(sourceItem.detailImages),
        sourceItem.detailRawText,
        sourceItem.isRefunded ? 1 : 0,
        sourceItem.isApparel ? 1 : 0
      );

      const row = selectSourceId.get(externalKey) as { id: number } | undefined;
      if (!row) continue;
      createdGarments += upsertGarmentForSource(row.id, sourceItem);
      if (sourceItem.itemId && hasDetailData(sourceItem) && !isStandaloneDetailItem(sourceItem)) {
        excludeStandaloneDetailGarments.run(sourceItem.itemId);
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return {
    batchId: normalized.batchId,
    summary: {
      ...normalized.summary,
      createdGarments
    }
  };
}

export function listGarments(db: AppDatabase): Garment[] {
  const rows = db.prepare(`
    SELECT garments.*, source_order_items.item_url, source_order_items.detail_url
    FROM garments
    LEFT JOIN source_order_items ON source_order_items.id = garments.source_order_item_id
    ORDER BY garments.excluded ASC, garments.owned DESC, garments.id DESC
  `).all() as unknown as GarmentRow[];
  return rows.map(rowToGarment);
}

export function updateGarment(db: AppDatabase, id: number, update: GarmentUpdate): Garment {
  const current = db.prepare("SELECT * FROM garments WHERE id = ?").get(id) as GarmentRow | undefined;
  if (!current) {
    throw new Error("衣服不存在");
  }
  const next = {
    brand: update.brand ?? current.brand ?? "",
    name: update.name ?? current.name,
    rawName: update.rawName ?? current.raw_name ?? current.name,
    category: update.category ?? current.category,
    color: update.color ?? current.color,
    warmth: update.warmth ?? current.warmth,
    seasons: JSON.stringify(update.seasons ?? safeJson<string[]>(current.seasons, [])),
    styles: JSON.stringify(update.styles ?? safeJson<string[]>(current.styles, [])),
    formality: update.formality ?? current.formality,
    size: update.size ?? current.size ?? "",
    materials: JSON.stringify(update.materials ?? safeJson<string[]>(current.materials || "[]", [])),
    patterns: JSON.stringify(update.patterns ?? safeJson<string[]>(current.patterns || "[]", [])),
    tags: JSON.stringify(update.tags ?? safeJson<string[]>(current.tags || "[]", [])),
    imageUrl: update.imageUrl ?? current.image_url ?? "",
    owned: boolToInt(update.owned ?? Boolean(current.owned)),
    confirmed: boolToInt(update.confirmed ?? Boolean(current.confirmed)),
    excluded: boolToInt(update.excluded ?? Boolean(current.excluded)),
    notes: update.notes ?? current.notes ?? ""
  };

  db.prepare(`
    UPDATE garments
    SET brand = ?, name = ?, raw_name = ?, category = ?, color = ?, warmth = ?, seasons = ?, styles = ?,
      formality = ?, size = ?, materials = ?, patterns = ?, tags = ?, image_url = ?, owned = ?, confirmed = ?, excluded = ?, notes = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    next.brand,
    next.name,
    next.rawName,
    next.category,
    next.color,
    next.warmth,
    next.seasons,
    next.styles,
    next.formality,
    next.size,
    next.materials,
    next.patterns,
    next.tags,
    next.imageUrl,
    next.owned,
    next.confirmed,
    next.excluded,
    next.notes,
    id
  );

  const updated = db.prepare(`
    SELECT garments.*, source_order_items.item_url, source_order_items.detail_url
    FROM garments
    LEFT JOIN source_order_items ON source_order_items.id = garments.source_order_item_id
    WHERE garments.id = ?
  `).get(id) as unknown as GarmentRow;
  return rowToGarment(updated);
}

export function deleteGarment(db: AppDatabase, id: number): void {
  const result = db.prepare("DELETE FROM garments WHERE id = ?").run(id);
  if (Number(result.changes) === 0) {
    throw new Error("衣服不存在");
  }
}

export function saveWearLog(db: AppDatabase, garmentIds: number[], context: unknown = null): void {
  db.prepare("INSERT INTO wear_logs (garment_ids, context) VALUES (?, ?)").run(
    JSON.stringify(garmentIds),
    context == null ? null : JSON.stringify(context)
  );
}

export function listRecentlyWornGarmentIds(db: AppDatabase, limit = 8): number[] {
  const rows = db.prepare(`
    SELECT garment_ids
    FROM wear_logs
    ORDER BY worn_at DESC, id DESC
    LIMIT ?
  `).all(limit) as Array<{ garment_ids: string }>;
  const seen = new Set<number>();
  for (const row of rows) {
    for (const id of safeJson<number[]>(row.garment_ids, [])) {
      if (Number.isFinite(id)) seen.add(id);
    }
  }
  return Array.from(seen);
}

export function listWearLogs(db: AppDatabase, limit = 50): WearLogEntry[] {
  const rows = db.prepare(`
    SELECT id, garment_ids, context, worn_at
    FROM wear_logs
    ORDER BY worn_at DESC, id DESC
    LIMIT ?
  `).all(limit) as Array<{ id: number; garment_ids: string; context: string | null; worn_at: string }>;
  return rows.map((row) => ({
    id: row.id,
    garmentIds: safeJson<number[]>(row.garment_ids, []),
    context: row.context ? safeJson<unknown>(row.context, null) : null,
    wornAt: row.worn_at
  }));
}

export function saveRecommendationRun(db: AppDatabase, input: unknown, result: unknown): void {
  db.prepare("INSERT INTO recommendation_runs (input_json, result_json) VALUES (?, ?)").run(
    JSON.stringify(input),
    JSON.stringify(result)
  );
}

export function listRecommendationRuns(db: AppDatabase, limit = 20): RecommendationRunEntry[] {
  const rows = db.prepare(`
    SELECT id, input_json, result_json, created_at
    FROM recommendation_runs
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).all(limit) as Array<{ id: number; input_json: string; result_json: string; created_at: string }>;
  return rows.map((row) => ({
    id: row.id,
    input: safeJson<unknown>(row.input_json, {}),
    result: safeJson<unknown>(row.result_json, {}),
    createdAt: row.created_at
  }));
}

export function getPersonalProfile(db: AppDatabase): PersonalProfile {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get("personalProfile") as { value: string } | undefined;
  if (!row) return { ...DEFAULT_PERSONAL_PROFILE };
  return normalizePersonalProfile(safeJson<PersonalProfile>(row.value, {}));
}

export function savePersonalProfile(db: AppDatabase, profile: PersonalProfile): PersonalProfile {
  const next = normalizePersonalProfile(profile);
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run("personalProfile", JSON.stringify(next), new Date().toISOString());
  return next;
}

export function getWardrobeInsights(db: AppDatabase): WardrobeInsights {
  const garments = listGarments(db);
  const wornCounts = new Map<number, number>();
  for (const log of listWearLogs(db, 500)) {
    for (const id of log.garmentIds) {
      wornCounts.set(id, (wornCounts.get(id) ?? 0) + 1);
    }
  }
  const categoryDistribution: WardrobeInsights["categoryDistribution"] = {};
  const colorDistribution: WardrobeInsights["colorDistribution"] = {};
  for (const garment of garments) {
    categoryDistribution[garment.category] = (categoryDistribution[garment.category] ?? 0) + 1;
    colorDistribution[garment.color || "unknown"] = (colorDistribution[garment.color || "unknown"] ?? 0) + 1;
  }
  const worn = garments
    .filter((garment) => (wornCounts.get(garment.id) ?? 0) > 0)
    .map((garment) => ({
      id: garment.id,
      name: displayInsightName(garment),
      category: garment.category,
      color: garment.color,
      wearCount: wornCounts.get(garment.id) ?? 0
    }))
    .sort((left, right) => (right.wearCount ?? 0) - (left.wearCount ?? 0))
    .slice(0, 5);
  return {
    totalGarments: garments.length,
    ownedGarments: garments.filter((garment) => garment.owned).length,
    confirmedGarments: garments.filter((garment) => garment.confirmed).length,
    pendingGarments: garments.filter((garment) => !garment.confirmed && !garment.excluded).length,
    categoryDistribution,
    colorDistribution,
    mostWorn: worn,
    neverWorn: garments
      .filter((garment) => !wornCounts.has(garment.id))
      .slice(0, 8)
      .map((garment) => ({ id: garment.id, name: displayInsightName(garment), category: garment.category, color: garment.color }))
  };
}

export function exportOutfitData(db: AppDatabase): OutfitExport {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: getPersonalProfile(db),
    garments: listGarments(db),
    sourceOrderItems: db.prepare("SELECT * FROM source_order_items ORDER BY id ASC").all(),
    wearLogs: listWearLogs(db, 1000),
    recommendationRuns: listRecommendationRuns(db, 200)
  };
}

export function getCachedWeather(db: AppDatabase, latitude: number, longitude: number, maxAgeMs = 30 * 60 * 1000): WeatherSnapshot | null {
  const row = db.prepare("SELECT payload, fetched_at FROM weather_cache WHERE cache_key = ?").get(weatherCacheKey(latitude, longitude)) as
    | { payload: string; fetched_at: string }
    | undefined;
  if (!row) return null;
  const fetchedAt = Date.parse(row.fetched_at);
  if (!Number.isFinite(fetchedAt) || Date.now() - fetchedAt > maxAgeMs) return null;
  return safeJson<WeatherSnapshot | null>(row.payload, null);
}

export function saveWeatherCache(db: AppDatabase, latitude: number, longitude: number, weather: WeatherSnapshot): void {
  db.prepare(`
    INSERT INTO weather_cache (cache_key, latitude, longitude, payload, fetched_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      payload = excluded.payload,
      fetched_at = excluded.fetched_at
  `).run(weatherCacheKey(latitude, longitude), latitude, longitude, JSON.stringify(weather), new Date().toISOString());
}

function weatherCacheKey(latitude: number, longitude: number): string {
  return `weather:${latitude.toFixed(4)}:${longitude.toFixed(4)}`;
}

interface GarmentRow {
  id: number;
  source_order_item_id: number | null;
  brand: string | null;
  name: string;
  raw_name: string | null;
  category: Garment["category"];
  color: string;
  warmth: Garment["warmth"];
  seasons: string;
  styles: string;
  formality: Garment["formality"];
  image_url: string | null;
  owned: number;
  confirmed: number;
  excluded: number;
  confidence: number;
  notes: string | null;
  size: string | null;
  materials: string | null;
  patterns: string | null;
  tags: string | null;
  item_url: string | null;
  detail_url: string | null;
}

function rowToGarment(row: GarmentRow): Garment {
  return {
    id: row.id,
    sourceOrderItemId: row.source_order_item_id ?? undefined,
    brand: row.brand ?? "",
    name: row.name,
    rawName: row.raw_name ?? row.name,
    category: row.category,
    color: row.color,
    warmth: row.warmth,
    seasons: safeJson(row.seasons, []),
    styles: safeJson(row.styles, []),
    formality: row.formality,
    size: row.size ?? undefined,
    materials: safeJson(row.materials || "[]", []),
    patterns: safeJson(row.patterns || "[]", []),
    tags: safeJson(row.tags || "[]", []),
    imageUrl: row.image_url ?? "",
    owned: Boolean(row.owned),
    confirmed: Boolean(row.confirmed),
    excluded: Boolean(row.excluded),
    confidence: row.confidence,
    notes: row.notes ?? "",
    itemUrl: row.item_url ?? undefined,
    detailUrl: row.detail_url ?? undefined
  };
}

interface GarmentDisplayBackfillRow {
  garment_id: number;
  source_order_item_id: number | null;
  garment_brand: string | null;
  garment_name: string;
  raw_name: string | null;
  image_url: string | null;
  confirmed: number;
  external_key: string | null;
  source: string | null;
  page_type: string | null;
  item_id: string | null;
  order_id: string | null;
  order_time: string | null;
  title: string | null;
  sku: string | null;
  quantity: number | null;
  payment: number | null;
  status: string | null;
  refund_text: string | null;
  item_url: string | null;
  source_image_url: string | null;
  raw_text: string | null;
  detail_url: string | null;
  detail_title: string | null;
  detail_props: string | null;
  detail_description: string | null;
  detail_images: string | null;
  detail_raw_text: string | null;
  is_refunded: number | null;
  is_apparel: number | null;
}

function backfillGarmentDisplayData(db: AppDatabase): void {
  const rows = db.prepare(`
    SELECT
      garments.id AS garment_id,
      garments.source_order_item_id,
      garments.brand AS garment_brand,
      garments.name AS garment_name,
      garments.raw_name,
      garments.image_url,
      garments.confirmed,
      source_order_items.external_key,
      source_order_items.source,
      source_order_items.page_type,
      source_order_items.item_id,
      source_order_items.order_id,
      source_order_items.order_time,
      source_order_items.title,
      source_order_items.sku,
      source_order_items.quantity,
      source_order_items.payment,
      source_order_items.status,
      source_order_items.refund_text,
      source_order_items.item_url,
      source_order_items.image_url AS source_image_url,
      source_order_items.raw_text,
      source_order_items.detail_url,
      source_order_items.detail_title,
      source_order_items.detail_props,
      source_order_items.detail_description,
      source_order_items.detail_images,
      source_order_items.detail_raw_text,
      source_order_items.is_refunded,
      source_order_items.is_apparel
    FROM garments
    LEFT JOIN source_order_items ON source_order_items.id = garments.source_order_item_id
  `).all() as unknown as GarmentDisplayBackfillRow[];
  const updateDisplay = db.prepare(`
    UPDATE garments
    SET brand = ?, name = ?, raw_name = ?, image_url = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  for (const row of rows) {
    const sourceItem = backfillRowToSourceItem(row);
    const displayInfo = sourceItem ? buildGarmentDisplayInfo(sourceItem) : {
      brand: row.garment_brand || "",
      name: row.garment_name,
      rawName: row.raw_name || row.garment_name
    };
    const isConfirmed = Boolean(row.confirmed);
    const preserveName = shouldPreserveConfirmedName(row.garment_name, displayInfo, isConfirmed);
    const nextBrand = displayInfo.brand || row.garment_brand || "";
    const nextName = preserveName ? row.garment_name : displayInfo.name;
    const nextRawName = row.raw_name || displayInfo.rawName || row.garment_name;
    const nextImage = chooseImageForUpdate(row.image_url || "", sourceItem ? preferredImage(sourceItem) : "", isConfirmed);

    if (
      nextBrand !== (row.garment_brand || "") ||
      nextName !== row.garment_name ||
      nextRawName !== (row.raw_name || "") ||
      nextImage !== (row.image_url || "")
    ) {
      updateDisplay.run(nextBrand, nextName, nextRawName, nextImage, row.garment_id);
    }
  }
}

function backfillRowToSourceItem(row: GarmentDisplayBackfillRow): SourceOrderItemDraft | null {
  if (!row.source_order_item_id || !row.title) return null;
  return {
    externalKey: row.external_key || String(row.source_order_item_id),
    source: row.source || "",
    pageType: (row.page_type || "order-list") as SourceOrderItemDraft["pageType"],
    itemId: row.item_id || "",
    orderId: row.order_id || "",
    orderTime: row.order_time || "",
    title: row.title,
    sku: row.sku || "",
    quantity: row.quantity || 1,
    payment: row.payment,
    status: row.status || "",
    refundText: row.refund_text || "",
    itemUrl: row.item_url || "",
    imageUrl: row.source_image_url || "",
    rawText: row.raw_text || "",
    detailUrl: row.detail_url || "",
    detailTitle: row.detail_title || "",
    detailProps: safeJson<TaobaoDetailProp[]>(row.detail_props || "[]", []),
    detailDescription: row.detail_description || "",
    detailImages: safeJson<string[]>(row.detail_images || "[]", []),
    detailRawText: row.detail_raw_text || "",
    isRefunded: Boolean(row.is_refunded),
    isApparel: Boolean(row.is_apparel)
  };
}

function chooseImageForUpdate(currentImage: string, candidateImage: string, isConfirmed: boolean): string {
  const current = currentImage || "";
  const candidate = candidateImage || "";
  if (isConfirmed && isTrustedProductImage(current)) return current;
  if (candidate) return candidate;
  return isTrustedProductImage(current) ? current : "";
}

function shouldPreserveConfirmedName(currentName: string, displayInfo: { brand: string; name: string; rawName: string }, isConfirmed: boolean): boolean {
  if (!isConfirmed) return false;
  const current = currentName.trim();
  if (!current) return false;
  if (normalizeNameForComparison(current) === normalizeNameForComparison(displayInfo.rawName)) return false;
  if (/订单详情|交易快照|加入购物车|申请售后|再买一单|7天无理由/.test(current)) return false;
  if (
    /订单详情|交易快照/.test(displayInfo.rawName) &&
    current.length >= 12 &&
    normalizeNameForComparison(displayInfo.rawName).includes(normalizeNameForComparison(current))
  ) {
    return false;
  }
  return normalizeNameForComparison(current) !== normalizeNameForComparison(displayInfo.name);
}

function normalizeNameForComparison(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function ensureColumn(db: AppDatabase, tableName: string, columnName: string, definition: string): void {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  if (rows.some((row) => row.name === columnName)) return;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

function isStandaloneDetailItem(item: SourceOrderItemDraft): boolean {
  return item.pageType === "item-detail" && Boolean(item.itemId) && !item.sku && !item.orderId;
}

function hasDetailData(item: SourceOrderItemDraft): boolean {
  return Boolean(
    item.detailUrl ||
    item.detailTitle ||
    item.detailProps.length ||
    item.detailDescription ||
    item.detailImages.length ||
    item.detailRawText
  );
}

function hasStoredDetail(row: StoredDetailRow | undefined): row is StoredDetailRow {
  if (!row) return false;
  return Boolean(
    row.detail_url ||
    row.detail_title ||
    (row.detail_props && row.detail_props !== "[]") ||
    row.detail_description ||
    (row.detail_images && row.detail_images !== "[]") ||
    row.detail_raw_text
  );
}

function withStoredStandaloneDetail(
  item: SourceOrderItemDraft,
  selectStandaloneDetailByItemId: { get: (itemId: string) => unknown }
): SourceOrderItemDraft {
  if (!item.itemId || isStandaloneDetailItem(item) || hasDetailData(item)) {
    return item;
  }

  const storedDetail = selectStandaloneDetailByItemId.get(item.itemId) as StoredDetailRow | undefined;
  if (!hasStoredDetail(storedDetail)) {
    return item;
  }

  const detailProps = safeJson<TaobaoDetailProp[]>(storedDetail.detail_props || "[]", []);
  const detailImages = safeJson<string[]>(storedDetail.detail_images || "[]", []);
  const detailTitle = storedDetail.detail_title || item.detailTitle;
  const isApparel = item.isApparel || Boolean(classifyGarment(detailTitle || item.title, [
    item.sku,
    detailProps.map((prop) => `${prop.name} ${prop.value}`).join(" "),
    storedDetail.detail_description || ""
  ].filter(Boolean).join(" ")));

  return {
    ...item,
    detailUrl: storedDetail.detail_url || item.detailUrl,
    detailTitle,
    detailProps,
    detailDescription: storedDetail.detail_description || item.detailDescription,
    detailImages,
    detailRawText: storedDetail.detail_raw_text || item.detailRawText,
    isApparel
  };
}

function normalizePersonalProfile(profile: PersonalProfile): PersonalProfile {
  return {
    ...DEFAULT_PERSONAL_PROFILE,
    ...profile,
    preferredColors: normalizeStringArray(profile.preferredColors ?? DEFAULT_PERSONAL_PROFILE.preferredColors),
    avoidedColors: normalizeStringArray(profile.avoidedColors ?? DEFAULT_PERSONAL_PROFILE.avoidedColors),
    preferredStyles: normalizeStringArray(profile.preferredStyles ?? DEFAULT_PERSONAL_PROFILE.preferredStyles)
  };
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => String(item).trim()).filter(Boolean)));
}

function displayInsightName(garment: Garment): string {
  return [garment.brand, garment.name].filter(Boolean).join(" ") || garment.name;
}

function safeJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function boolToInt(value: boolean): number {
  return value ? 1 : 0;
}
