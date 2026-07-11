import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";

export type MigrationDatabase = DatabaseSyncType;

export interface Migration {
  version: number;
  name: string;
  up(db: MigrationDatabase): void;
}

export type LegacyBaseline = (db: MigrationDatabase) => void;

export interface AppliedMigration {
  version: number;
  name: string;
  appliedAt: string;
}

export const LEGACY_BASELINE_VERSION = 0;
export const LEGACY_BASELINE_NAME = "legacy-baseline";

export function runMigrations(
  db: MigrationDatabase,
  legacyBaseline: LegacyBaseline,
  migrations: readonly Migration[]
): void {
  validateMigrations(migrations);
  if (db.isTransaction) {
    throw new Error("Database migrations cannot start inside an existing transaction");
  }
  db.exec("PRAGMA foreign_keys = ON");

  if (!hasSchemaMigrationsTable(db)) {
    inMigrationTransaction(db, () => {
      // Another local process may have completed the baseline while this
      // connection was waiting for the write lock.
      if (hasSchemaMigrationsTable(db)) return;
      legacyBaseline(db);
      createSchemaMigrationsTable(db);
      db.prepare(`
        INSERT INTO schema_migrations (version, name, applied_at)
        VALUES (?, ?, ?)
      `).run(LEGACY_BASELINE_VERSION, LEGACY_BASELINE_NAME, new Date().toISOString());
    });
  }

  runNumberedMigrations(db, migrations);
}

export function runNumberedMigrations(
  db: MigrationDatabase,
  migrations: readonly Migration[]
): void {
  validateMigrations(migrations);
  validateAppliedPrefix(listAppliedMigrations(db), migrations);
  for (let index = 0; index < migrations.length; index += 1) {
    const migration = migrations[index];
    inMigrationTransaction(db, () => {
      // Re-read after acquiring the write lock. A concurrent process may
      // already have applied this migration after our initial inspection.
      const applied = listAppliedMigrations(db);
      validateAppliedPrefix(applied, migrations);
      const appliedNumberedCount = applied.length - 1;
      if (appliedNumberedCount > index) return;
      if (appliedNumberedCount < index) {
        throw new Error("Applied migrations changed while the migration runner was active");
      }
      migration.up(db);
      db.prepare(`
        INSERT INTO schema_migrations (version, name, applied_at)
        VALUES (?, ?, ?)
      `).run(migration.version, migration.name, new Date().toISOString());
    });
  }
}

export function listAppliedMigrations(db: MigrationDatabase): AppliedMigration[] {
  const rows = db.prepare(`
    SELECT version, name, applied_at
    FROM schema_migrations
    ORDER BY version ASC
  `).all() as Array<{ version: number; name: string; applied_at: string }>;
  return rows.map((row) => ({
    version: row.version,
    name: row.name,
    appliedAt: row.applied_at
  }));
}

export function currentSchemaVersion(db: MigrationDatabase): number {
  const row = db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get() as {
    version: number | null;
  };
  return row.version ?? LEGACY_BASELINE_VERSION;
}

function validateMigrations(migrations: readonly Migration[]): void {
  let previous = LEGACY_BASELINE_VERSION;
  for (const migration of migrations) {
    if (!Number.isSafeInteger(migration.version) || migration.version <= previous) {
      throw new Error("Migration versions must be positive and strictly increasing");
    }
    if (!migration.name.trim()) {
      throw new Error(`Migration ${migration.version} must have a name`);
    }
    previous = migration.version;
  }
}

function validateAppliedPrefix(
  applied: readonly AppliedMigration[],
  migrations: readonly Migration[]
): void {
  const baseline = applied[0];
  if (
    !baseline ||
    baseline.version !== LEGACY_BASELINE_VERSION ||
    baseline.name !== LEGACY_BASELINE_NAME
  ) {
    throw new Error("Schema migration baseline 0 is missing or invalid");
  }

  const appliedNumbered = applied.slice(1);
  if (appliedNumbered.length > migrations.length) {
    throw new Error("Database was migrated by newer application code");
  }
  for (let index = 0; index < appliedNumbered.length; index += 1) {
    const actual = appliedNumbered[index];
    const expected = migrations[index];
    if (actual.version !== expected.version) {
      throw new Error("Applied migrations are not an exact prefix of the current migration list");
    }
    if (actual.name !== expected.name) {
      throw new Error(
        `Applied migration ${actual.version} name ${actual.name} does not match ${expected.name}`
      );
    }
  }
}

function hasSchemaMigrationsTable(db: MigrationDatabase): boolean {
  const row = db.prepare(`
    SELECT 1 AS present
    FROM sqlite_master
    WHERE type = 'table' AND name = 'schema_migrations'
  `).get() as { present: number } | undefined;
  return row?.present === 1;
}

function createSchemaMigrationsTable(db: MigrationDatabase): void {
  db.exec(`
    CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT;
  `);
}

function inMigrationTransaction(db: MigrationDatabase, action: () => void): void {
  db.exec("BEGIN IMMEDIATE");
  try {
    action();
    db.exec("COMMIT");
  } catch (error) {
    if (db.isTransaction) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // Preserve the original migration failure; it is the actionable cause.
      }
    }
    throw error;
  }
}
