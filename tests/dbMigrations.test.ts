import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { createDatabase, legacyBaseline0, migrate } from "../server/db";
import {
  runMigrations,
  type Migration
} from "../server/db/migrations";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");

function migration(version: number, name: string, up: Migration["up"]): Migration {
  return { version, name, up };
}

describe("versioned database migrations", () => {
  it("migrates decision-support cost provenance without trusting legacy default quantities", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE source_order_items (
        id INTEGER PRIMARY KEY,
        quantity INTEGER NOT NULL DEFAULT 1,
        payment REAL,
        order_time TEXT,
        is_refunded INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE garments (
        id INTEGER PRIMARY KEY,
        source_order_item_id INTEGER UNIQUE,
        acquired_at TEXT,
        purchase_price_cents INTEGER,
        currency TEXT,
        FOREIGN KEY (source_order_item_id) REFERENCES source_order_items(id)
      );
    `);
    const appliedAt = "2026-07-13T00:00:00.000Z";
    const applied = db.prepare(`
      INSERT INTO schema_migrations (version, name, applied_at)
      VALUES (?, ?, ?)
    `);
    for (const [version, name] of [
      [0, "legacy-baseline"],
      [1, "recommendation-candidates"],
      [2, "trusted-ingestion"],
      [3, "saved-outfits"],
      [4, "feedback-availability"],
      [5, "diary-week-planner"]
    ] as const) {
      applied.run(version, name, appliedAt);
    }

    const insertSource = db.prepare(`
      INSERT INTO source_order_items (id, quantity, payment, order_time, is_refunded)
      VALUES (?, ?, ?, ?, ?)
    `);
    insertSource.run(1, 2, 399, "2025-12-01 08:30:00", 0);
    insertSource.run(2, 1, 129, "2025-12-02T09:00:00.000Z", 0);
    insertSource.run(3, 3, 0, "2025-12-03", 0);
    insertSource.run(4, 2, null, "not-a-date", 0);
    insertSource.run(5, 2, -1, "2025-02-30 10:00:00", 0);
    insertSource.run(6, 2, 50, "2025-12-06 10:00:00", 1);
    insertSource.run(7, 2, 999, "2025-12-07 10:00:00", 0);
    insertSource.run(8, 2, 1e308, "2025-12-08 10:00:00", 0);

    const insertGarment = db.prepare(`
      INSERT INTO garments (
        id, source_order_item_id, acquired_at, purchase_price_cents, currency
      ) VALUES (?, ?, ?, ?, ?)
    `);
    for (let id = 1; id <= 6; id += 1) {
      insertGarment.run(id, id, null, null, null);
    }
    insertGarment.run(7, 7, "2024-01-01", 12345, "CNY");
    insertGarment.run(8, 8, null, null, null);
    insertGarment.run(9, null, "2025-01-01", 8888, "CNY");

    migrate(db);

    expect(db.prepare(`
      SELECT version, name FROM schema_migrations ORDER BY version
    `).all()).toEqual([
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
      SELECT id, quantity_explicit, payment_explicit
      FROM source_order_items
      ORDER BY id
    `).all()).toEqual([
      { id: 1, quantity_explicit: 1, payment_explicit: 1 },
      { id: 2, quantity_explicit: 0, payment_explicit: 1 },
      { id: 3, quantity_explicit: 1, payment_explicit: 1 },
      { id: 4, quantity_explicit: 1, payment_explicit: 0 },
      { id: 5, quantity_explicit: 1, payment_explicit: 1 },
      { id: 6, quantity_explicit: 1, payment_explicit: 1 },
      { id: 7, quantity_explicit: 1, payment_explicit: 1 },
      { id: 8, quantity_explicit: 1, payment_explicit: 1 }
    ]);
    expect(db.prepare(`
      SELECT id, acquired_at, purchase_price_cents, currency, cost_source
      FROM garments
      ORDER BY id
    `).all()).toEqual([
      { id: 1, acquired_at: "2025-12-01", purchase_price_cents: 19950, currency: "CNY", cost_source: "taobao" },
      { id: 2, acquired_at: "2025-12-02", purchase_price_cents: null, currency: null, cost_source: null },
      { id: 3, acquired_at: "2025-12-03", purchase_price_cents: 0, currency: "CNY", cost_source: "taobao" },
      { id: 4, acquired_at: null, purchase_price_cents: null, currency: null, cost_source: null },
      { id: 5, acquired_at: null, purchase_price_cents: null, currency: null, cost_source: null },
      { id: 6, acquired_at: "2025-12-06", purchase_price_cents: null, currency: null, cost_source: null },
      { id: 7, acquired_at: "2024-01-01", purchase_price_cents: 12345, currency: "CNY", cost_source: "manual" },
      { id: 8, acquired_at: "2025-12-08", purchase_price_cents: null, currency: null, cost_source: null },
      { id: 9, acquired_at: "2025-01-01", purchase_price_cents: 8888, currency: "CNY", cost_source: "manual" }
    ]);
    expect(() => db.prepare("UPDATE garments SET cost_source = 'backup' WHERE id = 1").run()).toThrow();
    expect(() => db.prepare("UPDATE source_order_items SET quantity_explicit = 2 WHERE id = 1").run()).toThrow();

    expect(db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name IN ('garment_similarity_feedback', 'garment_embeddings')
      ORDER BY name
    `).all()).toEqual([
      { name: "garment_embeddings" },
      { name: "garment_similarity_feedback" }
    ]);
  });

  it("registers the frozen legacy schema as baseline version 0", () => {
    const db = new DatabaseSync(":memory:");

    migrate(db);

    const rows = db.prepare(`
      SELECT version, name
      FROM schema_migrations
      ORDER BY version ASC
    `).all() as Array<{ version: number; name: string }>;
    expect(rows).toEqual([
      { version: 0, name: "legacy-baseline" },
      { version: 1, name: "recommendation-candidates" },
      { version: 2, name: "trusted-ingestion" },
      { version: 3, name: "saved-outfits" },
      { version: 4, name: "feedback-availability" },
      { version: 5, name: "diary-week-planner" },
      { version: 6, name: "decision-support" },
      { version: 7, name: "trip-capsule-planner" }
    ]);
  });

  it("upgrades an older legacy schema before registering baseline 0", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE source_order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        external_key TEXT NOT NULL UNIQUE,
        source TEXT NOT NULL,
        title TEXT NOT NULL,
        imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    migrate(db);

    const columns = db.prepare("PRAGMA table_info(source_order_items)").all() as Array<{ name: string }>;
    expect(columns.map((column) => column.name)).toEqual(expect.arrayContaining([
      "item_id",
      "detail_title",
      "detail_props",
      "detail_images"
    ]));
    expect(db.prepare("SELECT version FROM schema_migrations ORDER BY version").all()).toEqual([
      { version: 0 },
      { version: 1 },
      { version: 2 },
      { version: 3 },
      { version: 4 },
      { version: 5 },
      { version: 6 },
      { version: 7 }
    ]);
  });

  it("applies each numbered migration only once", () => {
    const db = new DatabaseSync(":memory:");
    let baselineRuns = 0;
    const legacyBaseline = (database: Parameters<Migration["up"]>[0]) => {
      baselineRuns += 1;
      database.exec("CREATE TABLE legacy_probe (id INTEGER PRIMARY KEY)");
    };
    const migrations = [migration(1, "create-probe", (database) => {
      database.exec(`
        CREATE TABLE migration_probe (value TEXT NOT NULL);
        INSERT INTO migration_probe (value) VALUES ('once');
      `);
    })];

    runMigrations(db, legacyBaseline, migrations);
    runMigrations(db, legacyBaseline, migrations);

    expect(baselineRuns).toBe(1);
    expect(db.prepare("SELECT value FROM migration_probe").all()).toEqual([{ value: "once" }]);
    expect(db.prepare("SELECT version, name FROM schema_migrations ORDER BY version").all()).toEqual([
      { version: 0, name: "legacy-baseline" },
      { version: 1, name: "create-probe" }
    ]);
  });

  it("rejects duplicate or non-increasing migration versions before changing schema", () => {
    const db = new DatabaseSync(":memory:");
    const createProbe = (name: string) => (database: Parameters<Migration["up"]>[0]) => {
      database.exec(`CREATE TABLE ${name} (id INTEGER PRIMARY KEY)`);
    };
    const legacyBaseline = (database: Parameters<Migration["up"]>[0]) => {
      database.exec("CREATE TABLE legacy_probe (id INTEGER PRIMARY KEY)");
    };

    expect(() => runMigrations(db, legacyBaseline, [
      migration(2, "second", createProbe("probe_two")),
      migration(1, "first", createProbe("probe_one"))
    ])).toThrow(/strictly increasing/i);
    expect(() => runMigrations(db, legacyBaseline, [
      migration(1, "first", createProbe("probe_one")),
      migration(1, "duplicate", createProbe("probe_duplicate"))
    ])).toThrow(/strictly increasing/i);
    expect(db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name LIKE 'probe_%'
    `).all()).toEqual([]);
  });

  it("rolls back a failed migration without recording its version", () => {
    const db = new DatabaseSync(":memory:");
    const failing = migration(1, "failing", (database) => {
      database.exec(`
        CREATE TABLE should_rollback (value TEXT NOT NULL);
        INSERT INTO should_rollback (value) VALUES ('temporary');
      `);
      throw new Error("planned migration failure");
    });

    expect(() => runMigrations(db, () => undefined, [failing])).toThrow("planned migration failure");

    expect(db.prepare("SELECT version FROM schema_migrations ORDER BY version").all()).toEqual([
      { version: 0 }
    ]);
    expect(db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = 'should_rollback'
    `).all()).toEqual([]);
  });

  it("rolls back the legacy baseline and version registry together", () => {
    const db = new DatabaseSync(":memory:");

    expect(() => runMigrations(db, (database) => {
      database.exec("CREATE TABLE partial_legacy_schema (id INTEGER PRIMARY KEY)");
      throw new Error("legacy baseline failed");
    }, [])).toThrow("legacy baseline failed");

    expect(db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name IN ('partial_legacy_schema', 'schema_migrations')
    `).all()).toEqual([]);
  });

  it("preserves the original migration error when rollback also fails", () => {
    const db = new DatabaseSync(":memory:");
    const originalError = new Error("original migration failure");
    const proxiedDb = new Proxy(db, {
      get(target, property) {
        if (property === "exec") {
          return (sql: string) => {
            if (sql.trim().toUpperCase() === "ROLLBACK") {
              throw new Error("rollback failure");
            }
            return target.exec(sql);
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      }
    }) as Parameters<typeof runMigrations>[0];

    let caught: unknown;
    try {
      runMigrations(proxiedDb, () => {
        throw originalError;
      }, []);
    } catch (error) {
      caught = error;
    } finally {
      if (db.isTransaction) db.exec("ROLLBACK");
    }

    expect(caught).toBe(originalError);
  });

  it("enables foreign keys before starting the baseline transaction", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = OFF");

    runMigrations(db, (database) => {
      database.exec(`
        CREATE TABLE migration_parent (id INTEGER PRIMARY KEY);
        CREATE TABLE migration_child (
          id INTEGER PRIMARY KEY,
          parent_id INTEGER NOT NULL REFERENCES migration_parent(id)
        );
      `);
    }, []);

    expect(db.prepare("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
  });

  it("rejects applied migrations that are not an exact prefix of the current code", () => {
    const db = new DatabaseSync(":memory:");
    const migrations = [
      migration(1, "first", () => undefined),
      migration(2, "second", () => undefined)
    ];
    runMigrations(db, () => undefined, migrations);
    db.prepare("DELETE FROM schema_migrations WHERE version = 1").run();

    expect(() => runMigrations(db, () => undefined, migrations)).toThrow(/prefix/i);
  });

  it("rejects a database migrated by newer code or a renamed applied migration", () => {
    const newerDb = new DatabaseSync(":memory:");
    runMigrations(newerDb, () => undefined, [migration(1, "first", () => undefined)]);
    newerDb.prepare(`
      INSERT INTO schema_migrations (version, name, applied_at)
      VALUES (2, 'future', ?)
    `).run(new Date().toISOString());
    expect(() => runMigrations(
      newerDb,
      () => undefined,
      [migration(1, "first", () => undefined)]
    )).toThrow(/newer/i);

    const renamedDb = new DatabaseSync(":memory:");
    runMigrations(renamedDb, () => undefined, [migration(1, "original-name", () => undefined)]);
    expect(() => runMigrations(
      renamedDb,
      () => undefined,
      [migration(1, "renamed", () => undefined)]
    )).toThrow(/name/i);
  });

  it("creates recommendation candidates only in numbered migration 1 with history-safe constraints", () => {
    const legacyDb = new DatabaseSync(":memory:");
    legacyBaseline0(legacyDb);
    expect(legacyDb.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name = 'recommendation_candidates'
    `).get()).toBeUndefined();

    const db = createDatabase(":memory:");
    const migrations = db.prepare(`
      SELECT version, name FROM schema_migrations ORDER BY version
    `).all();
    const indexes = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'index' AND tbl_name = 'recommendation_candidates'
      ORDER BY name
    `).all() as Array<{ name: string }>;
    expect(migrations).toEqual([
      { version: 0, name: "legacy-baseline" },
      { version: 1, name: "recommendation-candidates" },
      { version: 2, name: "trusted-ingestion" },
      { version: 3, name: "saved-outfits" },
      { version: 4, name: "feedback-availability" },
      { version: 5, name: "diary-week-planner" },
      { version: 6, name: "decision-support" },
      { version: 7, name: "trip-capsule-planner" }
    ]);
    expect(indexes.map((index) => index.name)).toEqual(expect.arrayContaining([
      "idx_recommendation_candidates_run_id",
      "idx_recommendation_candidates_signature"
    ]));

    const run = db.prepare(`
      INSERT INTO recommendation_runs (input_json, result_json)
      VALUES ('{}', '{}')
    `).run();
    const runId = Number(run.lastInsertRowid);
    const insert = db.prepare(`
      INSERT INTO recommendation_candidates (
        candidate_id, run_id, signature, rank, item_ids_json, score_snapshot
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    insert.run("candidate-1", runId, "signature-1", 1, "[99,100]", "{}");

    expect(() => insert.run("candidate-1", runId, "signature-2", 2, "[]", "{}")).toThrow();
    expect(() => insert.run("candidate-2", runId, "signature-2", 1, "[]", "{}")).toThrow();
    expect(() => insert.run("candidate-3", runId, "signature-3", 0, "[]", "{}")).toThrow();
    expect(() => insert.run("candidate-4", runId + 999, "signature-4", 2, "[]", "{}")).toThrow();
    expect(() => insert.run("candidate-5", runId, "signature-5", 2, "not-json", "{}")).toThrow();
    expect(() => insert.run("candidate-6", runId, "signature-6", 3, "[]", "not-json")).toThrow();
  });

  it("adds trusted garment provenance, soft archive fields, and protected asset metadata in migration 2", () => {
    const db = createDatabase(":memory:");

    const garmentColumns = db.prepare("PRAGMA table_info(garments)").all() as Array<{
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
    }>;
    expect(garmentColumns).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "origin", type: "TEXT", notnull: 1, dflt_value: "'taobao'" }),
      expect.objectContaining({ name: "archived_at", type: "TEXT" }),
      expect.objectContaining({ name: "acquired_at", type: "TEXT" }),
      expect.objectContaining({ name: "purchase_price_cents", type: "INTEGER" }),
      expect.objectContaining({ name: "currency", type: "TEXT" })
    ]));

    const assetColumns = db.prepare("PRAGMA table_info(garment_assets)").all() as Array<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }>;
    expect(assetColumns.map((column) => column.name)).toEqual([
      "id",
      "garment_id",
      "kind",
      "storage_key",
      "mime_type",
      "byte_size",
      "width",
      "height",
      "sha256",
      "active",
      "created_at"
    ]);
    expect(assetColumns.find((column) => column.name === "id")).toMatchObject({ type: "INTEGER", pk: 1 });

    expect(db.prepare("PRAGMA foreign_key_list(garment_assets)").all()).toEqual([
      expect.objectContaining({ table: "garments", from: "garment_id", to: "id", on_delete: "RESTRICT" })
    ]);
    const assetIndexes = db.prepare("PRAGMA index_list(garment_assets)").all() as Array<{
      name: string;
      unique: number;
      partial: number;
    }>;
    expect(assetIndexes).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "idx_garment_assets_garment_id", unique: 0 }),
      expect.objectContaining({ name: "idx_garment_assets_active_kind", unique: 1, partial: 1 })
    ]));

    const garment = db.prepare(`
      INSERT INTO garments (
        name, category, color, warmth, seasons, styles, formality
      ) VALUES ('手工外套', 'outerwear', 'black', 'warm', '[]', '[]', 'casual')
    `).run();
    const garmentId = Number(garment.lastInsertRowid);
    const insertAsset = db.prepare(`
      INSERT INTO garment_assets (
        garment_id, kind, storage_key, mime_type, byte_size, width, height, sha256, active
      ) VALUES (?, 'primary', ?, 'image/webp', 10, 1, 1, ?, 1)
    `);
    insertAsset.run(garmentId, "11111111-1111-4111-8111-111111111111.webp", "a".repeat(64));
    expect(() => insertAsset.run(garmentId, "22222222-2222-4222-8222-222222222222.webp", "b".repeat(64))).toThrow();
    expect(() => db.prepare(`
      INSERT INTO garment_assets (
        garment_id, kind, storage_key, mime_type, byte_size, width, height, sha256, active
      ) VALUES (?, 'secondary', '../escape.webp', 'image/webp', 10, 1, 1, ?, 0)
    `).run(garmentId, "c".repeat(64))).toThrow();
    expect(() => db.prepare("UPDATE garments SET purchase_price_cents = 1.5 WHERE id = ?").run(garmentId)).toThrow();
    expect(() => db.prepare("DELETE FROM garments WHERE id = ?").run(garmentId)).toThrow();
  });

  it("adds strict saved outfit history with provenance, snapshots, and derivation constraints in migration 3", () => {
    const legacyDb = new DatabaseSync(":memory:");
    legacyBaseline0(legacyDb);
    expect(legacyDb.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name IN ('saved_outfits', 'saved_outfit_items')
    `).all()).toEqual([]);

    const db = createDatabase(":memory:");
    const outfitColumns = db.prepare("PRAGMA table_info(saved_outfits)").all() as Array<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }>;
    expect(outfitColumns.map((column) => column.name)).toEqual([
      "id",
      "name",
      "notes",
      "source",
      "source_candidate_id",
      "derived_from_outfit_id",
      "favorite",
      "archived_at",
      "created_at",
      "updated_at"
    ]);
    expect(outfitColumns.find((column) => column.name === "id")).toMatchObject({
      type: "INTEGER",
      pk: 1
    });

    const itemColumns = db.prepare("PRAGMA table_info(saved_outfit_items)").all() as Array<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }>;
    expect(itemColumns.map((column) => column.name)).toEqual([
      "id",
      "outfit_id",
      "garment_id",
      "slot",
      "position",
      "garment_snapshot"
    ]);
    expect(itemColumns.find((column) => column.name === "id")).toMatchObject({
      type: "INTEGER",
      pk: 1
    });

    expect(db.prepare("PRAGMA foreign_key_list(saved_outfits)").all()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "recommendation_candidates",
        from: "source_candidate_id",
        to: "candidate_id",
        on_delete: "SET NULL"
      }),
      expect.objectContaining({
        table: "saved_outfits",
        from: "derived_from_outfit_id",
        to: "id",
        on_delete: "RESTRICT"
      })
    ]));
    expect(db.prepare("PRAGMA foreign_key_list(saved_outfit_items)").all()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "saved_outfits",
        from: "outfit_id",
        to: "id",
        on_delete: "CASCADE"
      }),
      expect.objectContaining({
        table: "garments",
        from: "garment_id",
        to: "id",
        on_delete: "SET NULL"
      })
    ]));

    const outfitIndexes = db.prepare("PRAGMA index_list(saved_outfits)").all() as Array<{
      name: string;
      unique: number;
    }>;
    expect(outfitIndexes).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "idx_saved_outfits_archived_at", unique: 0 }),
      expect.objectContaining({ name: "idx_saved_outfits_source_candidate_id", unique: 0 }),
      expect.objectContaining({ name: "idx_saved_outfits_derived_from_outfit_id", unique: 0 })
    ]));
    const itemIndexes = db.prepare("PRAGMA index_list(saved_outfit_items)").all() as Array<{
      name: string;
      unique: number;
    }>;
    expect(itemIndexes).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "idx_saved_outfit_items_outfit_id", unique: 0 }),
      expect.objectContaining({ unique: 1 })
    ]));

    const runId = Number(db.prepare(`
      INSERT INTO recommendation_runs (input_json, result_json)
      VALUES ('{}', '{}')
    `).run().lastInsertRowid);
    const candidateId = "11111111-1111-4111-8111-111111111111";
    db.prepare(`
      INSERT INTO recommendation_candidates (
        candidate_id, run_id, signature, rank, item_ids_json, score_snapshot
      ) VALUES (?, ?, 'signature', 1, '[]', '{}')
    `).run(candidateId, runId);
    const garmentId = Number(db.prepare(`
      INSERT INTO garments (
        name, category, color, warmth, seasons, styles, formality
      ) VALUES ('白色衬衫', 'top', 'white', 'light', '[]', '[]', 'casual')
    `).run().lastInsertRowid);

    const insertOutfit = db.prepare(`
      INSERT INTO saved_outfits (
        id, name, notes, source, source_candidate_id, derived_from_outfit_id, favorite
      ) VALUES (?, ?, '', ?, ?, ?, ?)
    `);
    insertOutfit.run(1, "手工搭配", "manual", null, null, 0);
    insertOutfit.run(2, "推荐搭配", "recommendation", candidateId, null, 1);
    insertOutfit.run(3, "替换版本", "replacement", null, 1, 0);

    const snapshot = JSON.stringify({
      id: garmentId,
      name: "白色衬衫",
      brand: "",
      category: "top",
      imageUrl: ""
    });
    const insertItem = db.prepare(`
      INSERT INTO saved_outfit_items (
        outfit_id, garment_id, slot, position, garment_snapshot
      ) VALUES (?, ?, ?, ?, ?)
    `);
    insertItem.run(1, garmentId, "top", 0, snapshot);

    expect(() => insertOutfit.run(4, "非法来源", "generated", null, null, 0)).toThrow();
    expect(() => insertOutfit.run(5, "非法收藏值", "manual", null, null, 2)).toThrow();
    expect(() => insertOutfit.run(6, "缺少父搭配", "replacement", null, null, 0)).toThrow();
    expect(() => insertOutfit.run(7, "不存在的父搭配", "replacement", null, 999, 0)).toThrow();
    expect(() => insertOutfit.run(8, "不存在的候选", "recommendation", "missing", null, 0)).toThrow();
    expect(() => insertOutfit.run(9, "自引用", "replacement", null, 9, 0)).toThrow();
    expect(() => insertItem.run(1, garmentId, "top", 0, snapshot)).toThrow();
    expect(() => insertItem.run(1, garmentId, "hat", 1, snapshot)).toThrow();
    expect(() => insertItem.run(1, garmentId, "accessory", -1, snapshot)).toThrow();
    expect(() => insertItem.run(1, garmentId, "accessory", 1, "not-json")).toThrow();
    expect(() => insertItem.run(1, garmentId, "accessory", 1, "[]")).toThrow();

    db.prepare("DELETE FROM garments WHERE id = ?").run(garmentId);
    expect(db.prepare(`
      SELECT garment_id, garment_snapshot
      FROM saved_outfit_items
      WHERE outfit_id = 1
    `).get()).toEqual({ garment_id: null, garment_snapshot: snapshot });

    const cascadeOutfitId = Number(db.prepare(`
      INSERT INTO saved_outfits (name, notes, source, favorite)
      VALUES ('可级联删除', '', 'manual', 0)
    `).run().lastInsertRowid);
    insertItem.run(cascadeOutfitId, null, "accessory", 0, JSON.stringify({
      id: 999,
      name: "历史配饰",
      brand: "",
      category: "accessory",
      imageUrl: ""
    }));
    db.prepare("DELETE FROM saved_outfits WHERE id = ?").run(cascadeOutfitId);
    expect(db.prepare(`
      SELECT COUNT(*) AS count FROM saved_outfit_items WHERE outfit_id = ?
    `).get(cascadeOutfitId)).toEqual({ count: 0 });

    db.prepare("DELETE FROM recommendation_runs WHERE id = ?").run(runId);
    expect(db.prepare(`
      SELECT source_candidate_id FROM saved_outfits WHERE id = 2
    `).get()).toEqual({ source_candidate_id: null });
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("adds feedback, pair statistics, and garment availability history in migration 4", () => {
    const legacyDb = new DatabaseSync(":memory:");
    legacyBaseline0(legacyDb);
    expect(legacyDb.prepare("PRAGMA table_info(garments)").all()).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "availability_status" })
    ]));

    const db = createDatabase(":memory:");
    expect(db.prepare("PRAGMA table_info(garments)").all()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "availability_status",
        type: "TEXT",
        notnull: 1,
        dflt_value: "'available'"
      })
    ]));
    expect(db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table'
        AND name IN ('recommendation_feedback', 'outfit_pair_stats', 'garment_availability_events')
      ORDER BY name
    `).all()).toEqual([
      { name: "garment_availability_events" },
      { name: "outfit_pair_stats" },
      { name: "recommendation_feedback" }
    ]);

    const garmentId = Number(db.prepare(`
      INSERT INTO garments (name, category, color, warmth, seasons, styles, formality)
      VALUES ('测试上衣', 'top', 'black', 'medium', '[]', '[]', 'casual')
    `).run().lastInsertRowid);
    const secondGarmentId = Number(db.prepare(`
      INSERT INTO garments (name, category, color, warmth, seasons, styles, formality)
      VALUES ('测试下装', 'bottom', 'black', 'medium', '[]', '[]', 'casual')
    `).run().lastInsertRowid);
    expect(db.prepare("SELECT availability_status FROM garments WHERE id = ?").get(garmentId)).toEqual({
      availability_status: "available"
    });
    expect(() => db.prepare("UPDATE garments SET availability_status = 'lost' WHERE id = ?").run(garmentId)).toThrow();

    const runId = Number(db.prepare(`
      INSERT INTO recommendation_runs (input_json, result_json) VALUES ('{}', '{}')
    `).run().lastInsertRowid);
    const candidateId = "44444444-4444-4444-8444-444444444444";
    db.prepare(`
      INSERT INTO recommendation_candidates (
        candidate_id, run_id, signature, rank, item_ids_json, score_snapshot
      ) VALUES (?, ?, 'm3-signature', 1, ?, '{}')
    `).run(candidateId, runId, JSON.stringify([garmentId, secondGarmentId]));

    const feedbackInsert = db.prepare(`
      INSERT INTO recommendation_feedback (
        candidate_id, verdict, rating, actually_worn, reason_codes_json, comment,
        wore_instead_outfit_id, wear_log_id, created_at, updated_at
      ) VALUES (?, 'liked', 5, 1, '[]', '', NULL, NULL, ?, ?)
    `);
    const now = "2026-07-12T10:00:00.000Z";
    feedbackInsert.run(candidateId, now, now);
    expect(() => feedbackInsert.run(candidateId, now, now)).toThrow();
    expect(() => db.prepare(`
      INSERT INTO recommendation_feedback (
        candidate_id, verdict, rating, actually_worn, reason_codes_json, comment,
        created_at, updated_at
      ) VALUES ('missing', 'liked', NULL, 0, '[]', '', ?, ?)
    `).run(now, now)).toThrow();

    db.prepare(`
      INSERT INTO outfit_pair_stats (
        garment_a_id, garment_b_id, likes, dislikes, worn_count, total_feedback, signal, updated_at
      ) VALUES (?, ?, 1, 0, 1, 1, 3, ?)
    `).run(garmentId, secondGarmentId, now);
    expect(() => db.prepare(`
      INSERT INTO outfit_pair_stats (
        garment_a_id, garment_b_id, likes, dislikes, worn_count, total_feedback, signal, updated_at
      ) VALUES (?, ?, 0, 0, 0, 0, 0, ?)
    `).run(secondGarmentId, garmentId, now)).toThrow();

    db.prepare(`
      INSERT INTO garment_availability_events (
        garment_id, previous_status, status, changed_at
      ) VALUES (?, 'available', 'laundry', ?)
    `).run(garmentId, now);
    expect(() => db.prepare(`
      INSERT INTO garment_availability_events (
        garment_id, previous_status, status, changed_at
      ) VALUES (?, 'available', 'missing', ?)
    `).run(garmentId, now)).toThrow();
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("adds diary and planner tables with strict foreign keys and indexes in migration 5", () => {
    const db = createDatabase(":memory:");
    expect(db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name IN ('wear_events', 'wear_event_items', 'outfit_plan_entries')
      ORDER BY name
    `).all()).toEqual([
      { name: "outfit_plan_entries" },
      { name: "wear_event_items" },
      { name: "wear_events" }
    ]);
    expect((db.prepare("PRAGMA table_info(recommendation_feedback)").all() as Array<{ name: string }>)
      .map((column) => column.name)).toContain("wear_event_id");
    const indexNames = (table: string) => (db.prepare(`PRAGMA index_list(${table})`).all() as Array<{ name: string }>)
      .map((index) => index.name);
    expect(indexNames("wear_events")).toContain("idx_wear_events_worn_at");
    expect(indexNames("wear_event_items")).toContain("idx_wear_event_items_item_id");
    expect(indexNames("outfit_plan_entries")).toContain("idx_outfit_plan_entries_planned_date");
    expect(db.prepare("PRAGMA foreign_key_list(wear_event_items)").all()).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: "wear_events", from: "wear_event_id", on_delete: "CASCADE" }),
      expect.objectContaining({ table: "garments", from: "item_id", on_delete: "RESTRICT" })
    ]));
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });
});
