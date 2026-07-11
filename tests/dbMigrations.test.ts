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
      { version: 2, name: "trusted-ingestion" }
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
      { version: 2 }
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
      { version: 2, name: "trusted-ingestion" }
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
});
