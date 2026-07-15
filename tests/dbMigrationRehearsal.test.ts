import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdtempSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createDatabase, legacyBaseline0 } from "../server/db";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
const LEGACY_FIXTURE_PATH = fileURLToPath(new URL("./fixtures/legacy-v0.sql", import.meta.url));

const LEGACY_TABLES = [
  "source_order_items",
  "garments",
  "weather_cache",
  "wear_logs",
  "recommendation_runs",
  "app_settings",
  "users",
  "sessions"
] as const;

type LegacyTableName = (typeof LEGACY_TABLES)[number];
type ColumnContract = readonly [
  name: string,
  type: string,
  notNull: number,
  defaultValue: string | null,
  primaryKeyPosition: number
];
type ForeignKeyContract = readonly [
  id: number,
  sequence: number,
  referencedTable: string,
  fromColumn: string,
  toColumn: string,
  onUpdate: string,
  onDelete: string,
  match: string
];

interface IndexContract {
  name: string;
  unique: number;
  origin: string;
  partial: number;
  columns: Array<string | null>;
}

interface TableInfoRow {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

interface ForeignKeyRow {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string;
  on_update: string;
  on_delete: string;
  match: string;
}

interface IndexListRow {
  name: string;
  unique: number;
  origin: string;
  partial: number;
}

interface IndexInfoRow {
  seqno: number;
  name: string | null;
}

const LEGACY_COLUMN_CONTRACTS = {
  source_order_items: [
    ["id", "INTEGER", 0, null, 1],
    ["external_key", "TEXT", 1, null, 0],
    ["source", "TEXT", 1, null, 0],
    ["page_type", "TEXT", 0, null, 0],
    ["item_id", "TEXT", 0, null, 0],
    ["order_id", "TEXT", 0, null, 0],
    ["order_time", "TEXT", 0, null, 0],
    ["title", "TEXT", 1, null, 0],
    ["sku", "TEXT", 0, null, 0],
    ["quantity", "INTEGER", 1, "1", 0],
    ["payment", "REAL", 0, null, 0],
    ["status", "TEXT", 0, null, 0],
    ["refund_text", "TEXT", 0, null, 0],
    ["item_url", "TEXT", 0, null, 0],
    ["image_url", "TEXT", 0, null, 0],
    ["raw_text", "TEXT", 0, null, 0],
    ["detail_url", "TEXT", 0, null, 0],
    ["detail_title", "TEXT", 0, null, 0],
    ["detail_props", "TEXT", 0, null, 0],
    ["detail_description", "TEXT", 0, null, 0],
    ["detail_images", "TEXT", 0, null, 0],
    ["detail_raw_text", "TEXT", 0, null, 0],
    ["is_refunded", "INTEGER", 1, "0", 0],
    ["is_apparel", "INTEGER", 1, "0", 0],
    ["imported_at", "TEXT", 1, "CURRENT_TIMESTAMP", 0]
  ],
  garments: [
    ["id", "INTEGER", 0, null, 1],
    ["source_order_item_id", "INTEGER", 0, null, 0],
    ["brand", "TEXT", 0, null, 0],
    ["name", "TEXT", 1, null, 0],
    ["raw_name", "TEXT", 0, null, 0],
    ["category", "TEXT", 1, null, 0],
    ["color", "TEXT", 1, null, 0],
    ["warmth", "TEXT", 1, null, 0],
    ["seasons", "TEXT", 1, null, 0],
    ["styles", "TEXT", 1, null, 0],
    ["formality", "TEXT", 1, null, 0],
    ["size", "TEXT", 0, null, 0],
    ["materials", "TEXT", 1, "'[]'", 0],
    ["patterns", "TEXT", 1, "'[]'", 0],
    ["tags", "TEXT", 1, "'[]'", 0],
    ["cutout_image_url", "TEXT", 0, null, 0],
    ["vision_tags", "TEXT", 0, null, 0],
    ["vision_updated_at", "TEXT", 0, null, 0],
    ["image_url", "TEXT", 0, null, 0],
    ["owned", "INTEGER", 1, "1", 0],
    ["confirmed", "INTEGER", 1, "0", 0],
    ["excluded", "INTEGER", 1, "0", 0],
    ["confidence", "REAL", 1, "0", 0],
    ["notes", "TEXT", 0, null, 0],
    ["created_at", "TEXT", 1, "CURRENT_TIMESTAMP", 0],
    ["updated_at", "TEXT", 1, "CURRENT_TIMESTAMP", 0]
  ],
  weather_cache: [
    ["cache_key", "TEXT", 0, null, 1],
    ["latitude", "REAL", 1, null, 0],
    ["longitude", "REAL", 1, null, 0],
    ["payload", "TEXT", 1, null, 0],
    ["fetched_at", "TEXT", 1, "CURRENT_TIMESTAMP", 0]
  ],
  wear_logs: [
    ["id", "INTEGER", 0, null, 1],
    ["garment_ids", "TEXT", 1, null, 0],
    ["context", "TEXT", 0, null, 0],
    ["worn_at", "TEXT", 1, "CURRENT_TIMESTAMP", 0]
  ],
  recommendation_runs: [
    ["id", "INTEGER", 0, null, 1],
    ["input_json", "TEXT", 1, null, 0],
    ["result_json", "TEXT", 1, null, 0],
    ["created_at", "TEXT", 1, "CURRENT_TIMESTAMP", 0]
  ],
  app_settings: [
    ["key", "TEXT", 0, null, 1],
    ["value", "TEXT", 1, null, 0],
    ["updated_at", "TEXT", 1, "CURRENT_TIMESTAMP", 0]
  ],
  users: [
    ["id", "INTEGER", 0, null, 1],
    ["username", "TEXT", 1, null, 0],
    ["username_normalized", "TEXT", 1, null, 0],
    ["password_hash", "TEXT", 1, null, 0],
    ["password_salt", "TEXT", 1, null, 0],
    ["created_at", "TEXT", 1, "CURRENT_TIMESTAMP", 0],
    ["updated_at", "TEXT", 1, "CURRENT_TIMESTAMP", 0]
  ],
  sessions: [
    ["token_hash", "TEXT", 0, null, 1],
    ["user_id", "INTEGER", 1, null, 0],
    ["expires_at", "TEXT", 1, null, 0],
    ["created_at", "TEXT", 1, "CURRENT_TIMESTAMP", 0]
  ]
} satisfies Record<LegacyTableName, readonly ColumnContract[]>;

const LEGACY_FOREIGN_KEY_CONTRACTS = {
  source_order_items: [],
  garments: [[0, 0, "source_order_items", "source_order_item_id", "id", "NO ACTION", "NO ACTION", "NONE"]],
  weather_cache: [],
  wear_logs: [],
  recommendation_runs: [],
  app_settings: [],
  users: [],
  sessions: [[0, 0, "users", "user_id", "id", "NO ACTION", "CASCADE", "NONE"]]
} satisfies Record<LegacyTableName, readonly ForeignKeyContract[]>;

const LEGACY_INDEX_CONTRACTS = {
  source_order_items: [
    { name: "idx_source_order_items_item_id", unique: 0, origin: "c", partial: 0, columns: ["item_id"] },
    { name: "sqlite_autoindex_source_order_items_1", unique: 1, origin: "u", partial: 0, columns: ["external_key"] }
  ],
  garments: [
    { name: "sqlite_autoindex_garments_1", unique: 1, origin: "u", partial: 0, columns: ["source_order_item_id"] }
  ],
  weather_cache: [
    { name: "sqlite_autoindex_weather_cache_1", unique: 1, origin: "pk", partial: 0, columns: ["cache_key"] }
  ],
  wear_logs: [],
  recommendation_runs: [],
  app_settings: [
    { name: "sqlite_autoindex_app_settings_1", unique: 1, origin: "pk", partial: 0, columns: ["key"] }
  ],
  users: [
    { name: "sqlite_autoindex_users_1", unique: 1, origin: "u", partial: 0, columns: ["username_normalized"] }
  ],
  sessions: [
    { name: "idx_sessions_expires_at", unique: 0, origin: "c", partial: 0, columns: ["expires_at"] },
    { name: "idx_sessions_user_id", unique: 0, origin: "c", partial: 0, columns: ["user_id"] },
    { name: "sqlite_autoindex_sessions_1", unique: 1, origin: "pk", partial: 0, columns: ["token_hash"] }
  ]
} satisfies Record<LegacyTableName, readonly IndexContract[]>;

interface LegacySnapshot {
  sourceOrderItems: unknown[];
  garments: unknown[];
  weatherCache: unknown[];
  wearLogs: unknown[];
  recommendationRuns: unknown[];
  appSettings: unknown[];
  users: unknown[];
  sessions: unknown[];
}

interface AppliedMigrationRow {
  version: number;
  name: string;
  applied_at: string;
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function assertNoSqliteSidecars(path: string): void {
  expect(existsSync(`${path}-journal`)).toBe(false);
  expect(existsSync(`${path}-wal`)).toBe(false);
  expect(existsSync(`${path}-shm`)).toBe(false);
}

function userTableNames(db: DatabaseSyncType): string[] {
  return (db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name ASC
  `).all() as Array<{ name: string }>).map((row) => row.name);
}

function assertExactUserTables(db: DatabaseSyncType, expected: readonly string[]): void {
  expect(userTableNames(db)).toEqual([...expected].sort());
}

function tableColumns(db: DatabaseSyncType, table: string): ColumnContract[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as unknown as TableInfoRow[]).map(
    (row) => [row.name, row.type, row.notnull, row.dflt_value, row.pk] as ColumnContract
  );
}

function foreignKeyContracts(db: DatabaseSyncType, table: string): ForeignKeyContract[] {
  return (db.prepare(`PRAGMA foreign_key_list(${table})`).all() as unknown as ForeignKeyRow[]).map(
    (row) => [
      row.id,
      row.seq,
      row.table,
      row.from,
      row.to,
      row.on_update,
      row.on_delete,
      row.match
    ] as ForeignKeyContract
  );
}

function indexContracts(db: DatabaseSyncType, table: string): IndexContract[] {
  const indexes = db.prepare(`PRAGMA index_list(${table})`).all() as unknown as IndexListRow[];
  return indexes.map((index) => {
    const columns = (db.prepare(`PRAGMA index_info(${index.name})`).all() as unknown as IndexInfoRow[])
      .sort((left, right) => left.seqno - right.seqno)
      .map((row) => row.name);
    return {
      name: index.name,
      unique: index.unique,
      origin: index.origin,
      partial: index.partial,
      columns
    };
  }).sort((left, right) => left.name.localeCompare(right.name));
}

function assertLegacySchemaContract(db: DatabaseSyncType, allowAdditionalColumns = false): void {
  for (const table of LEGACY_TABLES) {
    const columns = tableColumns(db, table);
    expect(
      allowAdditionalColumns
        ? columns.filter((column) => LEGACY_COLUMN_CONTRACTS[table].some(([name]) => name === column[0]))
        : columns
    ).toEqual(LEGACY_COLUMN_CONTRACTS[table]);
    expect(foreignKeyContracts(db, table)).toEqual(LEGACY_FOREIGN_KEY_CONTRACTS[table]);
    expect(indexContracts(db, table)).toEqual(LEGACY_INDEX_CONTRACTS[table]);
  }
}

function assertLegacyDatabase(db: DatabaseSyncType): void {
  assertDatabaseHealthy(db);
  assertExactUserTables(db, LEGACY_TABLES);
  assertLegacySchemaContract(db);
}

function legacySnapshot(db: DatabaseSyncType): LegacySnapshot {
  return {
    sourceOrderItems: selectLegacyRows(db, "source_order_items", "id ASC"),
    garments: selectLegacyRows(db, "garments", "id ASC"),
    weatherCache: selectLegacyRows(db, "weather_cache", "cache_key ASC"),
    wearLogs: selectLegacyRows(db, "wear_logs", "id ASC"),
    recommendationRuns: selectLegacyRows(db, "recommendation_runs", "id ASC"),
    appSettings: selectLegacyRows(db, "app_settings", "key ASC"),
    users: selectLegacyRows(db, "users", "id ASC"),
    sessions: selectLegacyRows(db, "sessions", "token_hash ASC")
  };
}

function selectLegacyRows(
  db: DatabaseSyncType,
  table: LegacyTableName,
  orderBy: string
): unknown[] {
  const columns = LEGACY_COLUMN_CONTRACTS[table]
    .map(([name]) => `"${name}"`)
    .join(", ");
  return db.prepare(`SELECT ${columns} FROM "${table}" ORDER BY ${orderBy}`).all();
}

function readOnlySnapshot(path: string): LegacySnapshot {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    assertLegacyDatabase(db);
    return legacySnapshot(db);
  } finally {
    db.close();
  }
}

function appliedMigrations(db: DatabaseSyncType): AppliedMigrationRow[] {
  return db.prepare(`
    SELECT version, name, applied_at
    FROM schema_migrations
    ORDER BY version ASC
  `).all() as unknown as AppliedMigrationRow[];
}

function assertDatabaseHealthy(db: DatabaseSyncType): void {
  expect(db.prepare("PRAGMA integrity_check").all()).toEqual([{ integrity_check: "ok" }]);
  expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
}

function assertProductionMigration(
  db: DatabaseSyncType,
  expectedLegacyData: LegacySnapshot
): AppliedMigrationRow[] {
  assertDatabaseHealthy(db);
  expect(legacySnapshot(db)).toEqual(expectedLegacyData);
  assertExactUserTables(db, [
    ...LEGACY_TABLES,
    "schema_migrations",
    "recommendation_candidates",
    "garment_assets",
    "saved_outfits",
    "saved_outfit_items",
    "recommendation_feedback",
    "outfit_pair_stats",
    "garment_availability_events",
    "wear_events",
    "wear_event_items",
    "outfit_plan_entries",
    "garment_similarity_feedback",
    "garment_embeddings",
    "trips",
    "trip_days",
    "trip_day_activities",
    "trip_outfit_selections",
    "trip_packing_items"
  ]);
  assertLegacySchemaContract(db, true);

  const migrations = appliedMigrations(db);
  expect(migrations.map(({ version, name }) => ({ version, name }))).toEqual([
    { version: 0, name: "legacy-baseline" },
      { version: 1, name: "recommendation-candidates" },
      { version: 2, name: "trusted-ingestion" },
      { version: 3, name: "saved-outfits" },
      { version: 4, name: "feedback-availability" },
      { version: 5, name: "diary-week-planner" },
      { version: 6, name: "decision-support" },
      { version: 7, name: "trip-capsule-planner" }
  ]);

  expect(db.prepare(`
    SELECT origin, archived_at, acquired_at, purchase_price_cents, currency,
      cost_source, availability_status
    FROM garments
    ORDER BY id ASC
  `).all()).toEqual([
    {
      origin: "taobao",
      archived_at: null,
      acquired_at: "2025-12-01",
      purchase_price_cents: null,
      currency: null,
      cost_source: null,
      availability_status: "available"
    }
  ]);
  expect(db.prepare("SELECT COUNT(*) AS count FROM garment_assets").get()).toEqual({ count: 0 });
  expect(db.prepare("SELECT COUNT(*) AS count FROM recommendation_feedback").get()).toEqual({ count: 0 });
  expect(db.prepare("SELECT COUNT(*) AS count FROM outfit_pair_stats").get()).toEqual({ count: 0 });
  expect(db.prepare("SELECT COUNT(*) AS count FROM garment_availability_events").get()).toEqual({ count: 0 });
  expect(db.prepare("SELECT COUNT(*) AS count FROM garment_similarity_feedback").get()).toEqual({ count: 0 });
  expect(db.prepare("SELECT COUNT(*) AS count FROM garment_embeddings").get()).toEqual({ count: 0 });
  expect(db.prepare("SELECT COUNT(*) AS count FROM trips").get()).toEqual({ count: 0 });
  expect(db.prepare("SELECT COUNT(*) AS count FROM trip_days").get()).toEqual({ count: 0 });
  expect(db.prepare("SELECT COUNT(*) AS count FROM trip_day_activities").get()).toEqual({ count: 0 });
  expect(db.prepare("SELECT COUNT(*) AS count FROM trip_outfit_selections").get()).toEqual({ count: 0 });
  expect(db.prepare("SELECT COUNT(*) AS count FROM trip_packing_items").get()).toEqual({ count: 0 });
  expect(db.prepare(`
    SELECT quantity_explicit, payment_explicit FROM source_order_items
  `).get()).toEqual({ quantity_explicit: 0, payment_explicit: 1 });
  expect(db.prepare(`
    SELECT id, worn_at, time_zone, occasion, legacy_snapshot
    FROM wear_events
  `).get()).toEqual({
    id: 1,
    worn_at: "2025-12-04T08:00:00.000Z",
    time_zone: "UTC",
    occasion: "casual",
    legacy_snapshot: JSON.stringify({
      originalGarmentIds: [1],
      originalContext: { outfitId: "outfit-1", occasion: "casual", fixture: true }
    })
  });
  expect(db.prepare(`
    SELECT wear_event_id, item_id, position FROM wear_event_items
  `).all()).toEqual([{ wear_event_id: 1, item_id: 1, position: 0 }]);
  expect(db.prepare("SELECT COUNT(*) AS count FROM outfit_plan_entries").get()).toEqual({ count: 0 });

  expect(foreignKeyContracts(db, "recommendation_candidates")).toEqual([
    [0, 0, "recommendation_runs", "run_id", "id", "NO ACTION", "CASCADE", "NONE"]
  ]);

  const candidateIndexes = indexContracts(db, "recommendation_candidates");
  expect(candidateIndexes.filter((index) => index.origin === "c")).toEqual([
    {
      name: "idx_recommendation_candidates_run_id",
      unique: 0,
      origin: "c",
      partial: 0,
      columns: ["run_id"]
    },
    {
      name: "idx_recommendation_candidates_signature",
      unique: 0,
      origin: "c",
      partial: 0,
      columns: ["signature"]
    }
  ]);
  expect(
    candidateIndexes
      .filter((index) => index.origin === "u" && index.unique === 1)
      .map((index) => index.columns)
  ).toEqual([["run_id", "rank"]]);

  const candidateTable = db.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = 'recommendation_candidates'
  `).get() as { sql: string } | undefined;
  expect(candidateTable).toBeDefined();
  const candidateSql = candidateTable?.sql ?? "";
  expect(candidateSql).toMatch(
    /rank\s+INTEGER\s+NOT\s+NULL\s+CHECK\s*\(\s*rank\s*>=\s*1\s*\)/i
  );
  expect(candidateSql).toMatch(
    /CHECK\s*\(\s*json_valid\s*\(\s*item_ids_json\s*\)\s+AND\s+json_type\s*\(\s*item_ids_json\s*\)\s*=\s*'array'\s*\)/i
  );
  expect(candidateSql).toMatch(
    /CHECK\s*\(\s*json_valid\s*\(\s*score_snapshot\s*\)\s+AND\s+json_type\s*\(\s*score_snapshot\s*\)\s*=\s*'object'\s*\)/i
  );
  expect(candidateSql).toMatch(/\)\s*STRICT\s*$/i);

  expect(db.prepare("SELECT COUNT(*) AS count FROM recommendation_candidates").get()).toEqual({
    count: 0
  });

  expect(tableColumns(db, "saved_outfits")).toEqual([
    ["id", "INTEGER", 0, null, 1],
    ["name", "TEXT", 1, null, 0],
    ["notes", "TEXT", 1, "''", 0],
    ["source", "TEXT", 1, null, 0],
    ["source_candidate_id", "TEXT", 0, null, 0],
    ["derived_from_outfit_id", "INTEGER", 0, null, 0],
    ["favorite", "INTEGER", 1, "0", 0],
    ["archived_at", "TEXT", 0, null, 0],
    ["created_at", "TEXT", 1, "CURRENT_TIMESTAMP", 0],
    ["updated_at", "TEXT", 1, "CURRENT_TIMESTAMP", 0]
  ]);
  expect(tableColumns(db, "saved_outfit_items")).toEqual([
    ["id", "INTEGER", 0, null, 1],
    ["outfit_id", "INTEGER", 1, null, 0],
    ["garment_id", "INTEGER", 0, null, 0],
    ["slot", "TEXT", 1, null, 0],
    ["position", "INTEGER", 1, null, 0],
    ["garment_snapshot", "TEXT", 1, null, 0]
  ]);

  expect(foreignKeyContracts(db, "saved_outfits").map((foreignKey) => ({
    table: foreignKey[2],
    from: foreignKey[3],
    to: foreignKey[4],
    onDelete: foreignKey[6]
  }))).toEqual(expect.arrayContaining([
    {
      table: "recommendation_candidates",
      from: "source_candidate_id",
      to: "candidate_id",
      onDelete: "SET NULL"
    },
    {
      table: "saved_outfits",
      from: "derived_from_outfit_id",
      to: "id",
      onDelete: "RESTRICT"
    }
  ]));
  expect(foreignKeyContracts(db, "saved_outfits")).toHaveLength(2);
  expect(foreignKeyContracts(db, "saved_outfit_items").map((foreignKey) => ({
    table: foreignKey[2],
    from: foreignKey[3],
    to: foreignKey[4],
    onDelete: foreignKey[6]
  }))).toEqual(expect.arrayContaining([
    {
      table: "saved_outfits",
      from: "outfit_id",
      to: "id",
      onDelete: "CASCADE"
    },
    {
      table: "garments",
      from: "garment_id",
      to: "id",
      onDelete: "SET NULL"
    }
  ]));
  expect(foreignKeyContracts(db, "saved_outfit_items")).toHaveLength(2);

  expect(indexContracts(db, "saved_outfits").filter((index) => index.origin === "c")).toEqual([
    {
      name: "idx_saved_outfits_archived_at",
      unique: 0,
      origin: "c",
      partial: 0,
      columns: ["archived_at"]
    },
    {
      name: "idx_saved_outfits_derived_from_outfit_id",
      unique: 0,
      origin: "c",
      partial: 0,
      columns: ["derived_from_outfit_id"]
    },
    {
      name: "idx_saved_outfits_source_candidate_id",
      unique: 0,
      origin: "c",
      partial: 0,
      columns: ["source_candidate_id"]
    }
  ]);
  const savedItemIndexes = indexContracts(db, "saved_outfit_items");
  expect(savedItemIndexes.filter((index) => index.origin === "c")).toEqual([
    {
      name: "idx_saved_outfit_items_outfit_id",
      unique: 0,
      origin: "c",
      partial: 0,
      columns: ["outfit_id"]
    }
  ]);
  expect(savedItemIndexes.filter((index) => index.origin === "u")).toEqual([
    expect.objectContaining({
      unique: 1,
      columns: ["outfit_id", "slot", "position"]
    })
  ]);

  for (const table of ["saved_outfits", "saved_outfit_items"]) {
    const definition = db.prepare(`
      SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?
    `).get(table) as { sql: string } | undefined;
    expect(definition?.sql).toMatch(/\)\s*STRICT\s*$/i);
  }
  expect(db.prepare("SELECT COUNT(*) AS count FROM saved_outfits").get()).toEqual({ count: 0 });
  expect(db.prepare("SELECT COUNT(*) AS count FROM saved_outfit_items").get()).toEqual({ count: 0 });
  assertDatabaseHealthy(db);

  return migrations;
}

describe("production database migration rehearsal", () => {
  it("keeps the production legacy baseline frozen at the exact pre-M0 schema", () => {
    const db = new DatabaseSync(":memory:");
    try {
      legacyBaseline0(db);
      assertExactUserTables(db, LEGACY_TABLES);
      assertLegacySchemaContract(db);
      assertDatabaseHealthy(db);
    } finally {
      db.close();
    }
  });

  it("backs up a frozen legacy file and migrates only its temporary rehearsal copy", () => {
    const rehearsalRoot = mkdtempSync(join(tmpdir(), "outfit-migration-rehearsal-"));
    const sourcePath = join(rehearsalRoot, "legacy-source.sqlite");
    const backupPath = join(rehearsalRoot, "legacy-backup.sqlite");
    const rehearsalPath = join(rehearsalRoot, "migration-rehearsal.sqlite");
    console.warn(`M0-F migration rehearsal artifacts retained at: ${rehearsalRoot}`);

    const fixtureSql = readFileSync(LEGACY_FIXTURE_PATH, "utf8");
    const fixtureDb = new DatabaseSync(sourcePath);
    try {
      fixtureDb.exec(fixtureSql);
      assertLegacyDatabase(fixtureDb);
    } finally {
      fixtureDb.close();
    }

    const sourceHashBefore = sha256(sourcePath);
    copyFileSync(sourcePath, backupPath);
    copyFileSync(sourcePath, rehearsalPath);
    const backupHashBefore = sha256(backupPath);
    expect(backupHashBefore).toBe(sourceHashBefore);

    const expectedLegacyData = readOnlySnapshot(sourcePath);
    expect(readOnlySnapshot(backupPath)).toEqual(expectedLegacyData);
    expect(readOnlySnapshot(rehearsalPath)).toEqual(expectedLegacyData);

    let firstAppliedMigrations: AppliedMigrationRow[];
    const migratedDb = createDatabase(rehearsalPath);
    try {
      firstAppliedMigrations = assertProductionMigration(migratedDb, expectedLegacyData);
    } finally {
      migratedDb.close();
    }

    const reopenedDb = createDatabase(rehearsalPath);
    try {
      expect(assertProductionMigration(reopenedDb, expectedLegacyData)).toEqual(
        firstAppliedMigrations
      );
    } finally {
      reopenedDb.close();
    }

    expect(readOnlySnapshot(sourcePath)).toEqual(expectedLegacyData);
    expect(readOnlySnapshot(backupPath)).toEqual(expectedLegacyData);
    expect(sha256(sourcePath)).toBe(sourceHashBefore);
    expect(sha256(backupPath)).toBe(backupHashBefore);
    assertNoSqliteSidecars(sourcePath);
    assertNoSqliteSidecars(backupPath);
  }, 15_000);
});
