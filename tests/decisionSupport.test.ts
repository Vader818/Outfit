import { describe, expect, it } from "vitest";
import type { AppDatabase } from "../server/db";
import { createWearEvent, deleteWearEvent, updateWearEvent } from "../server/services/wearEvents";
import {
  buildWardrobeValueInsights,
  getWardrobeValueInsights
} from "../server/services/wardrobeValue";
import { createDatabase } from "./helpers/testDatabase";

const NOW = new Date("2026-07-13T00:00:00.000Z");

describe("M5 wardrobe value pure calculations", () => {
  it("keeps missing prices unknown, represents zero wears as null, and returns every best-value tie", () => {
    const result = buildWardrobeValueInsights([
      fact(1, { name: "价格未知", wearCount: 5 }),
      fact(2, { name: "尚未穿着", acquiredAt: "2026-01-01", purchasePriceCents: 12_900, wearCount: 0 }),
      fact(3, { name: "最佳价值甲", purchasePriceCents: 9_000, wearCount: 3 }),
      fact(4, { name: "最佳价值乙", purchasePriceCents: 12_000, wearCount: 4 }),
      fact(5, { name: "次数不足", purchasePriceCents: 100, wearCount: 2 })
    ], { now: () => NOW });

    expect(result.knownPriceCount).toBe(4);
    expect(result.unknownPriceCount).toBe(1);
    expect(result.bestValue.map((item) => item.garmentId)).toEqual([3, 4]);
    expect(result.bestValue.every((item) => item.costPerWearCents === 3_000)).toBe(true);
    expect(result.lowUtilizationHighCost).toContainEqual(expect.objectContaining({
      garmentId: 2,
      wearCount: 0,
      costPerWearCents: null
    }));
    expect(result.lowUtilizationHighCost.find((item) => item.garmentId === 2)?.evidence).toEqual(
      expect.arrayContaining(["购入价格：129.00 元", "购入时间：2026-01-01", "穿着次数：0 次"])
    );
  });

  it("defines the upper quartile as ceil(n/4) descending and includes every threshold tie", () => {
    const result = buildWardrobeValueInsights([
      fact(1, { purchasePriceCents: 10_000, acquiredAt: "2026-01-01", wearCount: 1 }),
      fact(2, { purchasePriceCents: 9_000, acquiredAt: "2026-01-01", wearCount: 1 }),
      fact(3, { purchasePriceCents: 9_000, acquiredAt: "2026-01-01", wearCount: 1 }),
      fact(4, { purchasePriceCents: 2_000, acquiredAt: "2026-01-01", wearCount: 1 }),
      fact(5, { purchasePriceCents: 1_000, acquiredAt: "2026-01-01", wearCount: 1 })
    ], { now: () => NOW });

    expect(result.upperQuartilePriceCents).toBe(9_000);
    expect(result.lowUtilizationHighCost.map((item) => item.garmentId)).toEqual([1, 2, 3]);

    const one = buildWardrobeValueInsights([
      fact(9, { purchasePriceCents: 2_500, acquiredAt: "2026-01-01", wearCount: 0 })
    ], { now: () => NOW });
    expect(one.upperQuartilePriceCents).toBe(2_500);
    expect(one.lowUtilizationHighCost.map((item) => item.garmentId)).toEqual([9]);
  });

  it("applies inclusive 90-day purchase and wear boundaries and conservative invalid-date handling", () => {
    const result = buildWardrobeValueInsights([
      fact(1, { acquiredAt: "2026-04-14", purchasePriceCents: 10_000, wearCount: 1 }),
      fact(2, { acquiredAt: "2026-04-15", purchasePriceCents: 10_000, wearCount: 1 }),
      fact(3, { acquiredAt: "2026-04-14", purchasePriceCents: 10_000, wearCount: 2 }),
      fact(4, { acquiredAt: "not-a-date", purchasePriceCents: 10_000, wearCount: 0 }),
      fact(5, { acquiredAt: "2026-07-14", purchasePriceCents: 10_000, wearCount: 0 }),
      fact(6, { acquiredAt: "2026-01-01", lastWornAt: "2026-04-14T00:00:00.000Z", wearCount: 3 }),
      fact(7, { acquiredAt: "2026-01-01", lastWornAt: "2026-04-15T00:00:00.000Z", wearCount: 3 })
    ], { now: () => NOW });

    expect(result.lowUtilizationHighCost.map((item) => item.garmentId)).toEqual([1]);
    expect(result.dormantGarments.map((item) => item.garmentId)).toContain(6);
    expect(result.dormantGarments.map((item) => item.garmentId)).not.toContain(7);
    expect(result.dormantGarments.map((item) => item.garmentId)).not.toEqual(expect.arrayContaining([4, 5]));
  });

  it("suppresses never-worn purchases younger than 30 days and includes the exact 30-day boundary", () => {
    const result = buildWardrobeValueInsights([
      fact(1, { acquiredAt: "2026-06-14", wearCount: 0 }),
      fact(2, { acquiredAt: "2026-06-13", wearCount: 0 }),
      fact(3, {
        acquiredAt: "2026-06-14",
        lastWornAt: "2026-03-01T00:00:00.000Z",
        wearCount: 1
      })
    ], { now: () => NOW });

    expect(result.dormantGarments.map((item) => item.garmentId)).toEqual([2]);
  });

  it("uses active owned garments, still includes excluded or unavailable items, and explicitly removes refunds", () => {
    const result = buildWardrobeValueInsights([
      fact(1, { purchasePriceCents: 3_000, wearCount: 3, excluded: true, availabilityStatus: "repair" }),
      fact(2, { purchasePriceCents: 2_000, wearCount: 3, confirmed: false }),
      fact(3, { purchasePriceCents: 1_000, wearCount: 3, owned: false }),
      fact(4, { purchasePriceCents: 1_000, wearCount: 3, archivedAt: "2026-07-01T00:00:00.000Z" }),
      fact(5, { purchasePriceCents: 100, wearCount: 3, isRefunded: true })
    ], { now: () => NOW });

    expect(result.knownPriceCount).toBe(2);
    expect(result.unknownPriceCount).toBe(0);
    expect(result.bestValue.map((item) => item.garmentId)).toEqual([2]);
  });

  it("emits neutral actionable suggestions with evidence and related garment ids", () => {
    const result = buildWardrobeValueInsights([
      fact(10, {
        name: "高价低利用外套",
        category: "outerwear",
        acquiredAt: "2026-01-01",
        purchasePriceCents: 80_000,
        wearCount: 1,
        lastWornAt: "2026-07-01T00:00:00.000Z"
      }),
      fact(11, { name: "久未穿衬衫", acquiredAt: "2025-01-01", lastWornAt: "2026-01-01T00:00:00.000Z", wearCount: 5 })
    ], { now: () => NOW });

    expect(result.suggestions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "low-utilization-high-cost",
        title: "低利用高成本",
        relatedGarmentIds: [10],
        evidence: expect.arrayContaining([expect.stringContaining("购入价格：800.00 元")])
      }),
      expect.objectContaining({
        id: "dormant-garments",
        title: "沉睡单品",
        relatedGarmentIds: [11],
        evidence: expect.arrayContaining([expect.stringContaining("穿着次数：5 次")])
      })
    ]));
    expect(result.suggestions.map((item) => `${item.title}${item.detail}`).join(" ")).not.toMatch(/浪费|剁手|不该买/);
  });
});

describe("M5 wardrobe value database facts", () => {
  it("uses the already-derived per-item price for multi-quantity orders and excludes active refunded sources", () => {
    const db = createDatabase(":memory:");
    const paidSource = insertSource(db, "paid", { quantity: 2, payment: 399, refunded: false });
    const refundedSource = insertSource(db, "refunded", { quantity: 1, payment: 999, refunded: true });
    const paid = insertGarment(db, "两件订单中的单件", { sourceOrderItemId: paidSource, purchasePriceCents: 19_950, acquiredAt: "2026-01-01" });
    const refunded = insertGarment(db, "已退款", { sourceOrderItemId: refundedSource, purchasePriceCents: 99_900, acquiredAt: "2026-01-01" });
    insertGarment(db, "价格未知", {});
    insertGarment(db, "不再拥有", { purchasePriceCents: 1, owned: false });
    insertGarment(db, "已归档", { purchasePriceCents: 1, archivedAt: "2026-07-01T00:00:00.000Z" });

    for (let index = 0; index < 3; index += 1) {
      createWearEvent(db, {
        wornAt: `2026-07-${String(index + 1).padStart(2, "0")}T08:00:00.000Z`,
        timeZone: "UTC",
        occasion: "casual",
        itemIds: [paid, refunded]
      });
    }

    const result = getWardrobeValueInsights(db, { now: () => NOW });
    expect(result.knownPriceCount).toBe(1);
    expect(result.unknownPriceCount).toBe(1);
    expect(result.bestValue).toEqual([
      expect.objectContaining({ garmentId: paid, wearCount: 3, purchasePriceCents: 19_950, costPerWearCents: 6_650 })
    ]);
    expect(JSON.stringify(result)).not.toContain(`\"garmentId\":${refunded}`);
  });

  it("recomputes full wear facts after event item edits and deletion", () => {
    const db = createDatabase(":memory:");
    const first = insertGarment(db, "第一件", { purchasePriceCents: 20_000, acquiredAt: "2026-01-01" });
    const second = insertGarment(db, "第二件", { purchasePriceCents: 30_000, acquiredAt: "2026-01-01" });
    const event = createWearEvent(db, {
      wornAt: "2026-07-01T08:00:00.000Z",
      timeZone: "UTC",
      occasion: "casual",
      itemIds: [first]
    });

    updateWearEvent(db, event.id, { itemIds: [second] });
    const edited = getWardrobeValueInsights(db, { now: () => NOW });
    expect(edited.lowUtilizationHighCost).toContainEqual(expect.objectContaining({ garmentId: second, wearCount: 1 }));
    expect(edited.lowUtilizationHighCost).not.toContainEqual(expect.objectContaining({ garmentId: first, wearCount: 1 }));

    deleteWearEvent(db, event.id);
    const deleted = getWardrobeValueInsights(db, { now: () => NOW });
    expect(deleted.lowUtilizationHighCost).toContainEqual(expect.objectContaining({ garmentId: second, wearCount: 0 }));
  });

  it("counts complete wear history beyond the former 500-row legacy limit", () => {
    const db = createDatabase(":memory:");
    const garmentId = insertGarment(db, "完整历史", { purchasePriceCents: 50_100, acquiredAt: "2025-01-01" });
    const insertEvent = db.prepare(`
      INSERT INTO wear_events (worn_at, time_zone, occasion, notes, created_at, updated_at)
      VALUES (?, 'UTC', 'casual', '', ?, ?)
    `);
    const insertItem = db.prepare("INSERT INTO wear_event_items (wear_event_id, item_id, position) VALUES (?, ?, 0)");
    db.exec("BEGIN IMMEDIATE");
    try {
      for (let index = 0; index < 501; index += 1) {
        const day = String((index % 28) + 1).padStart(2, "0");
        const wornAt = `2026-06-${day}T08:00:00.000Z`;
        const eventId = Number(insertEvent.run(wornAt, wornAt, wornAt).lastInsertRowid);
        insertItem.run(eventId, garmentId);
      }
      db.exec("COMMIT");
    } catch (error) {
      if (db.isTransaction) db.exec("ROLLBACK");
      throw error;
    }

    const result = getWardrobeValueInsights(db, { now: () => NOW });
    expect(result.bestValue).toEqual([
      expect.objectContaining({ garmentId, wearCount: 501, costPerWearCents: 100 })
    ]);
  });
});

function fact(garmentId: number, overrides: Record<string, unknown> = {}) {
  return {
    garmentId,
    name: `衣物 ${garmentId}`,
    category: "top" as const,
    owned: true,
    archivedAt: undefined,
    isRefunded: false,
    acquiredAt: undefined,
    purchasePriceCents: undefined,
    currency: "CNY" as const,
    costSource: undefined,
    wearCount: 0,
    lastWornAt: undefined,
    ...overrides
  };
}

function insertSource(
  db: AppDatabase,
  key: string,
  input: { quantity: number; payment: number; refunded: boolean }
): number {
  return Number(db.prepare(`
    INSERT INTO source_order_items (
      external_key, source, page_type, title, quantity, payment, is_refunded, is_apparel
    ) VALUES (?, 'test', 'order-list', ?, ?, ?, ?, 1)
  `).run(key, key, input.quantity, input.payment, input.refunded ? 1 : 0).lastInsertRowid);
}

function insertGarment(
  db: AppDatabase,
  name: string,
  input: {
    sourceOrderItemId?: number;
    purchasePriceCents?: number;
    acquiredAt?: string;
    owned?: boolean;
    archivedAt?: string;
  }
): number {
  return Number(db.prepare(`
    INSERT INTO garments (
      source_order_item_id, name, raw_name, category, color, warmth, seasons, styles,
      formality, image_url, owned, confirmed, excluded, confidence, notes,
      acquired_at, purchase_price_cents, currency, archived_at
    ) VALUES (?, ?, ?, 'top', 'black', 'medium', '[]', '[]', 'casual', '', ?, 1, 0, 1, '', ?, ?, ?, ?)
  `).run(
    input.sourceOrderItemId ?? null,
    name,
    name,
    input.owned === false ? 0 : 1,
    input.acquiredAt ?? null,
    input.purchasePriceCents ?? null,
    input.purchasePriceCents === undefined ? null : "CNY",
    input.archivedAt ?? null
  ).lastInsertRowid);
}
