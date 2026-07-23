import { describe, expect, it } from "vitest";
import { archiveGarment, type AppDatabase } from "../server/db";
import { previewTaobaoImport } from "../server/services/importTaobao";
import {
  checkTaobaoPurchaseCandidate,
  decidePurchaseVerdict,
  resolveTaobaoPurchaseCandidate
} from "../server/services/purchaseCheck";
import { upsertSimilarityFeedback } from "../server/services/garmentSimilarity";
import {
  archiveSavedOutfit,
  createSavedOutfit
} from "../server/services/savedOutfits";
import type { Garment, TaobaoCapturedBatch } from "../src/shared/types";
import { createDatabase } from "./helpers/testDatabase";

describe("Taobao purchase candidate validation", () => {
  it("selects exactly one normalized non-refunded apparel candidate from a multi-item batch", () => {
    const batch = taobaoBatch();
    const preview = previewTaobaoImport(batch);
    expect(preview.candidates).toHaveLength(2);
    const selected = preview.candidates[1];

    const resolved = resolveTaobaoPurchaseCandidate({
      batch,
      sourceItemKey: selected.sourceItemKey
    });

    expect(resolved.candidate).toMatchObject({
      sourceItemKey: selected.sourceItemKey,
      name: selected.name,
      category: selected.category
    });
    expect(resolved.subjectKey).toMatch(/^candidate:v1:[a-f0-9]{64}$/);
    expect(resolved.sourceItem.itemId).toBe("20002");
  });

  it("rejects client fingerprints, paths, unknown nested fields, oversized keys and ambiguous selections", () => {
    const batch = taobaoBatch();
    const selected = previewTaobaoImport(batch).candidates[0];

    expect(() => resolveTaobaoPurchaseCandidate({
      batch,
      sourceItemKey: selected.sourceItemKey,
      subjectKey: "candidate:v1:forged"
    })).toThrow(/未知字段.*subjectKey/i);
    expect(() => resolveTaobaoPurchaseCandidate({
      batch,
      sourceItemKey: selected.sourceItemKey,
      path: "D:\\capture.json"
    })).toThrow(/未知字段.*path/i);
    expect(() => resolveTaobaoPurchaseCandidate({
      batch: {
        ...batch,
        items: [{ ...batch.items?.[0], artifactPath: "D:\\capture.json" }]
      },
      sourceItemKey: selected.sourceItemKey
    })).toThrow(/未知字段.*artifactPath/i);
    expect(() => resolveTaobaoPurchaseCandidate({
      batch,
      sourceItemKey: "x".repeat(257)
    })).toThrow(/sourceItemKey.*256/i);
    expect(() => resolveTaobaoPurchaseCandidate({ batch, sourceItemKey: "missing" }))
      .toThrow(/唯一命中|未找到/i);
  });
});

describe("purchase check service", () => {
  it("returns duplicate evidence, active compatible outfits and gap deltas without changing any table", () => {
    const db = createDatabase(":memory:");
    ensureM5Tables(db);
    const request = purchaseRequest();
    const resolved = resolveTaobaoPurchaseCandidate(request);
    const duplicateId = insertGarment(db, {
      ...garment(),
      ...resolved.candidate,
      id: 0,
      rawName: resolved.candidate.rawName,
      imageUrl: ""
    });
    const oldTopId = insertGarment(db, garment({ name: "白色基础衬衫", color: "white" }));
    const bottomId = insertGarment(db, garment({
      name: "黑色休闲长裤",
      rawName: "黑色休闲长裤",
      category: "bottom",
      color: "black",
      seasons: resolved.candidate.seasons,
      styles: resolved.candidate.styles,
      formality: resolved.candidate.formality
    }));
    const activeOutfit = createSavedOutfit(db, {
      name: "活动通勤搭配",
      items: [
        { garmentId: oldTopId, slot: "top", position: 0 },
        { garmentId: bottomId, slot: "bottom", position: 0 }
      ]
    });
    const archivedOutfit = createSavedOutfit(db, {
      name: "已归档搭配",
      items: [
        { garmentId: oldTopId, slot: "top", position: 0 },
        { garmentId: bottomId, slot: "bottom", position: 0 }
      ]
    });
    archiveSavedOutfit(db, archivedOutfit.id);
    const countsBefore = databaseCounts(db);

    const result = checkTaobaoPurchaseCandidate(db, request);

    expect(result.subjectKey).toBe(resolved.subjectKey);
    expect(result.possibleDuplicates).toEqual([
      expect.objectContaining({
        garment: expect.objectContaining({ id: duplicateId }),
        similarity: 100,
        reasons: expect.any(Array)
      })
    ]);
    expect(result.worksWith).toEqual([activeOutfit]);
    expect(result.coverageDelta).toMatchObject({
      categories: expect.any(Array),
      seasons: expect.any(Array),
      occasions: expect.any(Array),
      compatibleOutfitCount: 1
    });
    expect(result.verdict).toBe("mixed");
    expect(result.explanation).toEqual(expect.arrayContaining([
      expect.stringMatching(/相似|重复/),
      expect.stringMatching(/搭配|缺口/)
    ]));
    expect(databaseCounts(db)).toEqual(countsBefore);
  });

  it("applies not-duplicate feedback immediately and skips outfits with archived live garments", () => {
    const db = createDatabase(":memory:");
    ensureM5Tables(db);
    const request = purchaseRequest();
    const resolved = resolveTaobaoPurchaseCandidate(request);
    const duplicateId = insertGarment(db, {
      ...garment(),
      ...resolved.candidate,
      id: 0,
      imageUrl: ""
    });
    const topId = insertGarment(db, garment({ name: "旧上衣", color: "white" }));
    const bottomId = insertGarment(db, garment({ category: "bottom", name: "旧下装", rawName: "旧下装" }));
    createSavedOutfit(db, {
      name: "含归档衣物的活动搭配",
      items: [
        { garmentId: topId, slot: "top", position: 0 },
        { garmentId: bottomId, slot: "bottom", position: 0 }
      ]
    });
    archiveGarment(db, bottomId);
    upsertSimilarityFeedback(db, {
      subjectKey: resolved.subjectKey,
      comparedGarmentId: duplicateId,
      verdict: "not-duplicate"
    });
    const countsBefore = databaseCounts(db);

    const result = checkTaobaoPurchaseCandidate(db, request);

    expect(result.possibleDuplicates).toEqual([]);
    expect(result.worksWith).toEqual([]);
    expect(result.coverageDelta.compatibleOutfitCount).toBe(0);
    expect(result.verdict).toBe("fills-gap");
    expect(databaseCounts(db)).toEqual(countsBefore);
  });

  it("does not treat an unknown candidate color as positive compatibility evidence", () => {
    const db = createDatabase(":memory:");
    ensureM5Tables(db);
    const request = unknownColorPurchaseRequest();
    const resolved = resolveTaobaoPurchaseCandidate(request);
    expect(resolved.candidate).toMatchObject({
      category: "top",
      color: "unknown",
      warmth: "medium",
      seasons: ["spring", "autumn"],
      formality: "smart-casual"
    });
    const oldTopId = insertGarment(db, garment({
      name: "待替换上衣",
      rawName: "待替换上衣"
    }));
    const bottomId = insertGarment(db, garment({
      name: "无颜色证据运动下装",
      rawName: "无颜色证据运动下装",
      category: "bottom",
      color: "unknown",
      warmth: resolved.candidate.warmth,
      seasons: resolved.candidate.seasons,
      styles: ["deliberately-unrelated"],
      formality: "sport"
    }));
    createSavedOutfit(db, {
      name: "未知颜色不应制造兼容性",
      items: [
        { garmentId: oldTopId, slot: "top", position: 0 },
        { garmentId: bottomId, slot: "bottom", position: 0 }
      ]
    });

    const result = checkTaobaoPurchaseCandidate(db, request);

    expect(result.worksWith).toEqual([]);
    expect(result.coverageDelta.compatibleOutfitCount).toBe(0);
  });

  it("uses the complete deterministic verdict matrix", () => {
    expect(decidePurchaseVerdict(true, true)).toBe("mixed");
    expect(decidePurchaseVerdict(true, false)).toBe("likely-duplicate");
    expect(decidePurchaseVerdict(false, true)).toBe("fills-gap");
    expect(decidePurchaseVerdict(false, false)).toBe("insufficient-data");
  });
});

function purchaseRequest(): { batch: TaobaoCapturedBatch; sourceItemKey: string } {
  const batch: TaobaoCapturedBatch = {
    source: "taobao-bookmarklet",
    pageType: "item-detail",
    capturedAt: "2026-07-13T01:00:00.000Z",
    pageUrl: "https://item.taobao.com/item.htm?id=10001",
    items: [{
      pageType: "item-detail",
      itemId: "10001",
      title: "NIKE 蓝色休闲衬衫男士长袖上衣",
      sku: "蓝色 / M",
      itemUrl: "https://item.taobao.com/item.htm?id=10001",
      detailTitle: "NIKE 蓝色休闲衬衫男士长袖上衣",
      detailProps: [{ name: "品牌", value: "NIKE" }],
      detailDescription: "棉质纯色日常通勤衬衫"
    }]
  };
  const preview = previewTaobaoImport(batch);
  if (preview.candidates.length !== 1) throw new Error("purchase fixture did not classify as one garment");
  return { batch, sourceItemKey: preview.candidates[0].sourceItemKey };
}

function unknownColorPurchaseRequest(): { batch: TaobaoCapturedBatch; sourceItemKey: string } {
  const batch: TaobaoCapturedBatch = {
    source: "taobao-bookmarklet",
    pageType: "item-detail",
    capturedAt: "2026-07-13T01:00:00.000Z",
    pageUrl: "https://item.taobao.com/item.htm?id=30003",
    items: [{
      pageType: "item-detail",
      itemId: "30003",
      title: "商务正装衬衫男士长袖上衣",
      itemUrl: "https://item.taobao.com/item.htm?id=30003",
      detailTitle: "商务正装衬衫男士长袖上衣",
      detailDescription: "会议通勤正式场合"
    }]
  };
  const preview = previewTaobaoImport(batch);
  if (preview.candidates.length !== 1) throw new Error("unknown-color fixture did not classify as one garment");
  return { batch, sourceItemKey: preview.candidates[0].sourceItemKey };
}

function taobaoBatch(): TaobaoCapturedBatch {
  return {
    source: "taobao-bookmarklet",
    pageType: "order-list",
    capturedAt: "2026-07-13T01:00:00.000Z",
    pageUrl: "https://buyertrade.taobao.com/trade/itemlist/list_bought_items.htm",
    items: [
      {
        pageType: "order-list",
        itemId: "10001",
        orderId: "order-1",
        title: "NIKE 蓝色休闲衬衫男士长袖上衣",
        sku: "蓝色 / M",
        quantity: 1,
        payment: "299.00",
        itemUrl: "https://item.taobao.com/item.htm?id=10001"
      },
      {
        pageType: "order-list",
        itemId: "20002",
        orderId: "order-2",
        title: "优衣库 黑色休闲长裤男士直筒裤",
        sku: "黑色 / 175",
        quantity: 1,
        payment: "199.00",
        itemUrl: "https://item.taobao.com/item.htm?id=20002"
      }
    ]
  };
}

function garment(overrides: Partial<Garment> = {}): Garment {
  return {
    id: 0,
    origin: "manual",
    brand: "",
    name: "基础上衣",
    rawName: "基础上衣",
    category: "top",
    color: "black",
    warmth: "medium",
    seasons: ["spring", "autumn"],
    styles: ["casual"],
    formality: "casual",
    materials: [],
    patterns: [],
    tags: [],
    imageUrl: "",
    owned: true,
    confirmed: true,
    excluded: false,
    availabilityStatus: "available",
    confidence: 1,
    notes: "",
    ...overrides
  };
}

function insertGarment(db: AppDatabase, value: Garment): number {
  return Number(db.prepare(`
    INSERT INTO garments (
      brand, name, raw_name, category, color, warmth, seasons, styles, formality,
      materials, patterns, tags, image_url, owned, confirmed, excluded, confidence,
      notes, origin
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 0, 1, '', 'manual')
  `).run(
    value.brand,
    value.name,
    value.rawName,
    value.category,
    value.color,
    value.warmth,
    JSON.stringify(value.seasons),
    JSON.stringify(value.styles),
    value.formality,
    JSON.stringify(value.materials ?? []),
    JSON.stringify(value.patterns ?? []),
    JSON.stringify(value.tags ?? []),
    value.imageUrl
  ).lastInsertRowid);
}

function databaseCounts(db: AppDatabase): Record<string, number> {
  return Object.fromEntries([
    "garments",
    "source_order_items",
    "garment_similarity_feedback",
    "garment_embeddings"
  ].map((table) => {
    const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
    return [table, row.count];
  }));
}

function ensureM5Tables(db: AppDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS garment_similarity_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_key TEXT NOT NULL,
      compared_garment_id INTEGER NOT NULL,
      verdict TEXT NOT NULL CHECK (verdict IN ('duplicate', 'not-duplicate')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(subject_key, compared_garment_id),
      FOREIGN KEY(compared_garment_id) REFERENCES garments(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS garment_embeddings (
      model_id TEXT NOT NULL,
      garment_id INTEGER NOT NULL,
      vector_blob BLOB NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(model_id, garment_id),
      FOREIGN KEY(garment_id) REFERENCES garments(id) ON DELETE CASCADE
    );
  `);
}
