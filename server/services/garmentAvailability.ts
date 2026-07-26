import type {
  GarmentAvailabilityChangeResult,
  GarmentAvailabilityEvent,
  GarmentAvailabilityStatus
} from "../../src/shared/types";
import { getGarmentById, type AppDatabase } from "../db";
import { ValidationError } from "../validation";

export const GARMENT_AVAILABILITY_STATUSES = [
  "available",
  "laundry",
  "repair",
  "loaned",
  "packed"
] as const satisfies readonly GarmentAvailabilityStatus[];

const AVAILABILITY_STATUS_SET = new Set<string>(GARMENT_AVAILABILITY_STATUSES);

export interface GarmentAvailabilityServiceOptions {
  now?: () => Date;
}

export function setGarmentAvailability(
  db: AppDatabase,
  garmentId: number,
  status: GarmentAvailabilityStatus,
  options: GarmentAvailabilityServiceOptions = {}
): GarmentAvailabilityChangeResult {
  if (!AVAILABILITY_STATUS_SET.has(status)) {
    throw new ValidationError("availabilityStatus 无效");
  }
  if (db.isTransaction) {
    throw new Error("Garment availability cannot start inside an existing transaction");
  }

  db.exec("BEGIN IMMEDIATE");
  try {
    const current = getGarmentById(db, garmentId);
    if (current.availabilityStatus === status) {
      db.exec("COMMIT");
      return { changed: false, garment: current };
    }
    const changedAt = (options.now?.() ?? new Date()).toISOString();
    const updated = db.prepare(`
      UPDATE garments
      SET availability_status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND availability_status = ?
    `).run(status, garmentId, current.availabilityStatus);
    if (Number(updated.changes) !== 1) {
      throw new Error(`Garment ${garmentId} availability changed concurrently`);
    }
    const inserted = db.prepare(`
      INSERT INTO garment_availability_events (
        garment_id, previous_status, status, changed_at
      ) VALUES (?, ?, ?, ?)
    `).run(garmentId, current.availabilityStatus, status, changedAt);
    const eventId = Number(inserted.lastInsertRowid);
    if (!Number.isSafeInteger(eventId) || eventId <= 0) {
      throw new Error("SQLite returned an invalid garment availability event id");
    }
    const event: GarmentAvailabilityEvent = {
      id: eventId,
      garmentId,
      previousStatus: current.availabilityStatus,
      status,
      changedAt
    };
    const garment = getGarmentById(db, garmentId);
    db.exec("COMMIT");
    return { changed: true, garment, event };
  } catch (error) {
    rollback(db);
    throw error;
  }
}

export function listGarmentAvailabilityEvents(db: AppDatabase): GarmentAvailabilityEvent[] {
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
  return rows.map((row) => ({
    id: row.id,
    garmentId: row.garment_id,
    previousStatus: row.previous_status,
    status: row.status,
    changedAt: row.changed_at
  }));
}

function rollback(db: AppDatabase): void {
  if (!db.isTransaction) return;
  try {
    db.exec("ROLLBACK");
  } catch {
    // Preserve the original transaction failure.
  }
}
