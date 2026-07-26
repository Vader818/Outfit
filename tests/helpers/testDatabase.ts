import { DatabaseSync } from "node:sqlite";
import { afterAll } from "vitest";
import {
  createDatabase as createAppDatabase,
  type AppDatabase
} from "../../server/db";

const databases = new Set<AppDatabase>();

afterAll(() => {
  for (const database of databases) {
    if (database.isOpen) {
      database.close();
    }
  }
  databases.clear();
});

export function trackTestDatabase<T extends AppDatabase>(database: T): T {
  databases.add(database);
  return database;
}

export function createDatabase(databasePath?: string): AppDatabase {
  return trackTestDatabase(createAppDatabase(databasePath));
}

export class TestDatabaseSync extends DatabaseSync {
  constructor(...args: ConstructorParameters<typeof DatabaseSync>) {
    super(...args);
    trackTestDatabase(this);
  }
}

export function createRawTestDatabase(
  ...args: ConstructorParameters<typeof DatabaseSync>
): AppDatabase {
  return trackTestDatabase(new DatabaseSync(...args));
}
