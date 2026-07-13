import { describe, expect, it } from "vitest";
import {
  archiveGarment,
  createDatabase,
  getWardrobeInsights,
  listRecentlyWornGarmentIds,
  type AppDatabase
} from "../server/db";
import { createWearEvent, deleteWearEvent, updateWearEvent } from "../server/services/wearEvents";

describe("M4 wardrobe insight event facts", () => {
  it("rolls counts and never-worn membership back immediately after event item edits and deletion", () => {
    const db = createDatabase(":memory:");
    const top = insertGarment(db, "白衬衫", "top");
    const bottom = insertGarment(db, "黑西裤", "bottom");
    const shoes = insertGarment(db, "乐福鞋", "shoes");
    const event = createWearEvent(db, {
      wornAt: "2026-07-10T08:00:00.000Z",
      timeZone: "UTC",
      occasion: "casual",
      itemIds: [top, bottom]
    });

    expect(insightById(getWardrobeInsights(db), top)).toMatchObject({ wearCount: 1 });
    expect(listRecentlyWornGarmentIds(db)).toEqual([top, bottom]);

    updateWearEvent(db, event.id, { itemIds: [top, shoes] });
    const edited = getWardrobeInsights(db, { now: () => new Date("2026-07-11T00:00:00.000Z") });
    expect(insightById(edited, top)).toMatchObject({ wearCount: 1, lastWornAt: "2026-07-10T08:00:00.000Z" });
    expect(insightById(edited, shoes)).toMatchObject({ wearCount: 1, lastWornAt: "2026-07-10T08:00:00.000Z" });
    expect(edited.neverWorn).toContainEqual(expect.objectContaining({ id: bottom, wearCount: 0 }));
    expect(listRecentlyWornGarmentIds(db)).toEqual([top, shoes]);

    deleteWearEvent(db, event.id);
    const deleted = getWardrobeInsights(db, { now: () => new Date("2026-07-11T00:00:00.000Z") });
    expect(deleted.mostWorn).toEqual([]);
    expect(deleted.recentlyUnworn).toEqual([]);
    expect(deleted.neverWorn.map((item) => item.id).sort((a, b) => a - b)).toEqual([top, bottom, shoes].sort((a, b) => a - b));
    expect(deleted.neverWorn.every((item) => item.wearCount === 0 && item.lastWornAt === undefined)).toBe(true);
    expect(listRecentlyWornGarmentIds(db)).toEqual([]);
  });

  it("counts complete wear-event history beyond the old 500-log cap", () => {
    const db = createDatabase(":memory:");
    const top = insertGarment(db, "高频上衣", "top");
    const insertEvent = db.prepare(`
      INSERT INTO wear_events (
        worn_at, time_zone, occasion, notes, created_at, updated_at
      ) VALUES (?, 'UTC', 'casual', '', ?, ?)
    `);
    const insertItem = db.prepare(`
      INSERT INTO wear_event_items (wear_event_id, item_id, position) VALUES (?, ?, 0)
    `);
    db.exec("BEGIN IMMEDIATE");
    try {
      for (let index = 0; index < 501; index += 1) {
        const day = String((index % 28) + 1).padStart(2, "0");
        const timestamp = `2026-06-${day}T08:00:00.000Z`;
        const eventId = Number(insertEvent.run(timestamp, timestamp, timestamp).lastInsertRowid);
        insertItem.run(eventId, top);
      }
      db.exec("COMMIT");
    } catch (error) {
      if (db.isTransaction) db.exec("ROLLBACK");
      throw error;
    }

    const insights = getWardrobeInsights(db, { now: () => new Date("2026-07-01T00:00:00.000Z") });
    expect(insights.mostWorn).toEqual([
      expect.objectContaining({ id: top, wearCount: 501, lastWornAt: "2026-06-28T08:00:00.000Z" })
    ]);
  });

  it("keeps distributions active-only and strictly separates older-than-30-days from never worn", () => {
    const db = createDatabase(":memory:");
    const oldTop = insertGarment(db, "久未穿上衣", "top");
    const neverBottom = insertGarment(db, "从未穿下装", "bottom");
    const recentShoes = insertGarment(db, "最近穿鞋", "shoes");
    const archivedAccessory = insertGarment(db, "归档配饰", "accessory");
    const notOwnedDress = insertGarment(db, "不再拥有连衣裙", "dress", false);
    archiveGarment(db, archivedAccessory);
    createWearEvent(db, {
      wornAt: "2026-06-30T00:00:00.000Z",
      timeZone: "UTC",
      occasion: "casual",
      itemIds: [oldTop, archivedAccessory, notOwnedDress]
    });
    createWearEvent(db, {
      wornAt: "2026-07-30T00:00:00.000Z",
      timeZone: "UTC",
      occasion: "casual",
      itemIds: [recentShoes]
    });

    const insights = getWardrobeInsights(db, {
      now: () => new Date("2026-07-31T00:00:00.000Z"),
      recentDays: 30
    });
    expect(insights.totalGarments).toBe(3);
    expect(insights.categoryDistribution).toEqual({ top: 1, bottom: 1, shoes: 1 });
    expect(insights.recentlyUnworn).toEqual([
      expect.objectContaining({
        id: oldTop,
        wearCount: 1,
        lastWornAt: "2026-06-30T00:00:00.000Z"
      })
    ]);
    expect(insights.neverWorn).toEqual([
      expect.objectContaining({ id: neverBottom, wearCount: 0 })
    ]);
    expect(insights.mostWorn.map((item) => item.id)).toEqual(expect.arrayContaining([oldTop, recentShoes]));
    for (const collection of [insights.mostWorn, insights.recentlyUnworn ?? [], insights.neverWorn]) {
      expect(collection.some((item) => item.id === archivedAccessory || item.id === notOwnedDress)).toBe(false);
    }
  });
});

function insightById(
  insights: ReturnType<typeof getWardrobeInsights>,
  id: number
): { id: number; wearCount?: number; lastWornAt?: string } | undefined {
  return [...insights.mostWorn, ...(insights.recentlyUnworn ?? []), ...insights.neverWorn]
    .find((item) => item.id === id);
}

function insertGarment(
  db: AppDatabase,
  name: string,
  category: "top" | "bottom" | "dress" | "shoes" | "accessory",
  owned = true
): number {
  return Number(db.prepare(`
    INSERT INTO garments (
      name, category, color, warmth, seasons, styles, formality,
      owned, confirmed, excluded
    ) VALUES (?, ?, 'black', 'medium', '[]', '[]', 'casual', ?, 1, 0)
  `).run(name, category, owned ? 1 : 0).lastInsertRowid);
}
