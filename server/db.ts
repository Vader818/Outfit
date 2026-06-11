import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import type { Garment, TaobaoDetailProp, WeatherSnapshot } from "../src/shared/types";
import { classifyGarment } from "./services/classify";
import { normalizeTaobaoBatch, type SourceOrderItemDraft } from "./services/importTaobao";

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
  name?: string;
  category?: string;
  color?: string;
  warmth?: string;
  seasons?: string[];
  styles?: string[];
  formality?: string;
  imageUrl?: string;
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
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      color TEXT NOT NULL,
      warmth TEXT NOT NULL,
      seasons TEXT NOT NULL,
      styles TEXT NOT NULL,
      formality TEXT NOT NULL,
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
  `);
  ensureColumn(db, "source_order_items", "page_type", "TEXT");
  ensureColumn(db, "source_order_items", "item_id", "TEXT");
  ensureColumn(db, "source_order_items", "detail_url", "TEXT");
  ensureColumn(db, "source_order_items", "detail_title", "TEXT");
  ensureColumn(db, "source_order_items", "detail_props", "TEXT");
  ensureColumn(db, "source_order_items", "detail_description", "TEXT");
  ensureColumn(db, "source_order_items", "detail_images", "TEXT");
  ensureColumn(db, "source_order_items", "detail_raw_text", "TEXT");
  db.exec("CREATE INDEX IF NOT EXISTS idx_source_order_items_item_id ON source_order_items(item_id)");
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
      source_order_item_id, name, category, color, warmth, seasons, styles, formality,
      image_url, owned, confirmed, excluded, confidence, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const selectGarmentBySource = db.prepare("SELECT id FROM garments WHERE source_order_item_id = ?");
  const updateGarmentFromSource = db.prepare(`
    UPDATE garments
    SET name = ?, category = ?, color = ?, warmth = ?, seasons = ?, styles = ?,
      formality = ?, image_url = ?, confidence = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE source_order_item_id = ?
  `);

  function upsertGarmentForSource(sourceItemId: number, sourceItem: SourceOrderItemDraft): number {
    if (sourceItem.isRefunded) {
      excludeRefundedGarment.run(sourceItemId);
      return 0;
    }
    if (!sourceItem.isApparel) return 0;

    const classification = classifyGarment(sourceItem.detailTitle || sourceItem.title, [
      sourceItem.sku,
      sourceItem.detailProps.map((prop) => `${prop.name} ${prop.value}`).join(" "),
      sourceItem.detailDescription
    ].filter(Boolean).join(" "));
    if (!classification) return 0;
    const garmentName = sourceItem.detailTitle || sourceItem.title;
    const garmentImage = sourceItem.detailImages[0] || sourceItem.imageUrl;
    const garmentNotes = sourceItem.detailProps.length || sourceItem.detailDescription
      ? [
          sourceItem.detailProps.map((prop) => `${prop.name}: ${prop.value}`).join("; "),
          sourceItem.detailDescription
        ].filter(Boolean).join("\n")
      : "";

    const existingGarment = selectGarmentBySource.get(sourceItemId) as { id: number } | undefined;
    if (existingGarment) {
      updateGarmentFromSource.run(
        garmentName,
        classification.category,
        classification.color,
        classification.warmth,
        JSON.stringify(classification.seasons),
        JSON.stringify(classification.styles),
        classification.formality,
        garmentImage,
        classification.confidence,
        garmentNotes,
        sourceItemId
      );
      return 0;
    }

    const garmentResult = insertGarment.run(
      sourceItemId,
      garmentName,
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
    name: update.name ?? current.name,
    category: update.category ?? current.category,
    color: update.color ?? current.color,
    warmth: update.warmth ?? current.warmth,
    seasons: JSON.stringify(update.seasons ?? safeJson<string[]>(current.seasons, [])),
    styles: JSON.stringify(update.styles ?? safeJson<string[]>(current.styles, [])),
    formality: update.formality ?? current.formality,
    imageUrl: update.imageUrl ?? current.image_url ?? "",
    owned: boolToInt(update.owned ?? Boolean(current.owned)),
    confirmed: boolToInt(update.confirmed ?? Boolean(current.confirmed)),
    excluded: boolToInt(update.excluded ?? Boolean(current.excluded)),
    notes: update.notes ?? current.notes ?? ""
  };

  db.prepare(`
    UPDATE garments
    SET name = ?, category = ?, color = ?, warmth = ?, seasons = ?, styles = ?,
      formality = ?, image_url = ?, owned = ?, confirmed = ?, excluded = ?, notes = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    next.name,
    next.category,
    next.color,
    next.warmth,
    next.seasons,
    next.styles,
    next.formality,
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

export function saveRecommendationRun(db: AppDatabase, input: unknown, result: unknown): void {
  db.prepare("INSERT INTO recommendation_runs (input_json, result_json) VALUES (?, ?)").run(
    JSON.stringify(input),
    JSON.stringify(result)
  );
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
  name: string;
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
  item_url: string | null;
  detail_url: string | null;
}

function rowToGarment(row: GarmentRow): Garment {
  return {
    id: row.id,
    sourceOrderItemId: row.source_order_item_id ?? undefined,
    name: row.name,
    category: row.category,
    color: row.color,
    warmth: row.warmth,
    seasons: safeJson(row.seasons, []),
    styles: safeJson(row.styles, []),
    formality: row.formality,
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
