import { describe, expect, it } from "vitest";
import type { AppDatabase } from "../server/db";
import {
  DEFAULT_CLIP_MODEL_ID,
  calculateGarmentSimilarity,
  canonicalizeGarmentFeedbackPair,
  computeCandidateSubjectKey,
  isPossibleDuplicate,
  listSimilarGarments,
  normalizeSimilarityText,
  upsertSimilarityFeedback
} from "../server/services/garmentSimilarity";
import type { Garment } from "../src/shared/types";
import { createDatabase } from "./helpers/testDatabase";

describe("garment similarity scoring", () => {
  it("normalizes Unicode width, case and whitespace deterministically", () => {
    expect(normalizeSimilarityText("  ＮＩＫＥ\u3000Air\t Shirt  ")).toBe("nike air shirt");
  });

  it("uses a hard category gate and stable weighted reasons", () => {
    const subject = garment({
      id: 1,
      category: "top",
      color: "Black",
      styles: ["minimal", "casual"],
      materials: ["cotton"],
      patterns: ["solid"],
      brand: "ＮＩＫＥ",
      name: "Air Shirt"
    });
    const compared = garment({
      id: 2,
      category: "top",
      color: " black ",
      styles: ["CASUAL"],
      materials: ["wool"],
      patterns: ["solid"],
      brand: "nike",
      name: "air shirt"
    });

    expect(calculateGarmentSimilarity(subject, { ...compared, category: "bottom" })).toBeNull();
    expect(calculateGarmentSimilarity(subject, compared)).toEqual({
      similarity: 72.2,
      availableWeight: 90,
      reasons: [
        "颜色一致：black",
        "风格重合 1/2",
        "材质重合 0/2",
        "图案重合 1/1",
        "品牌与名称相似度 100%"
      ]
    });
  });

  it("re-normalizes missing feature weights and includes optional cached visual similarity", () => {
    const sparseA = garment({ id: 1, color: "navy", name: "通勤衬衫", brand: "" });
    const sparseB = garment({ id: 2, color: "NAVY", name: "通勤衬衫", brand: "" });
    expect(calculateGarmentSimilarity(sparseA, sparseB)).toEqual({
      similarity: 100,
      availableWeight: 40,
      reasons: ["颜色一致：navy", "品牌与名称相似度 100%"]
    });

    expect(calculateGarmentSimilarity(sparseA, sparseB, {
      subjectEmbedding: [1, 0],
      comparedEmbedding: [1, 0]
    })).toEqual({
      similarity: 100,
      availableWeight: 50,
      reasons: ["颜色一致：navy", "品牌与名称相似度 100%", "视觉向量相似度 100%"]
    });
    expect(isPossibleDuplicate(75)).toBe(true);
    expect(isPossibleDuplicate(74.9)).toBe(false);
  });

  it("treats the classifier's unknown color sentinel as missing evidence", () => {
    const subject = garment({
      id: 1,
      color: "unknown",
      styles: ["casual"],
      name: "甲甲甲"
    });
    const compared = garment({
      id: 2,
      color: "unknown",
      styles: ["casual"],
      name: "乙乙乙"
    });

    const result = calculateGarmentSimilarity(subject, compared);
    expect(result).toEqual({
      similarity: 57.1,
      availableWeight: 35,
      reasons: ["风格重合 1/1", "品牌与名称相似度 0%"]
    });
    expect(isPossibleDuplicate(result!.similarity)).toBe(false);
  });

  it("builds stable server candidate fingerprints without order metadata or paths", () => {
    const first = computeCandidateSubjectKey({
      productIdentity: "123456",
      sku: " 蓝色 / M ",
      category: "top",
      color: "Blue",
      styles: ["minimal", "casual"],
      materials: ["cotton"],
      patterns: ["solid"],
      brand: "ＮＩＫＥ",
      name: " Air\u3000Shirt "
    });
    const reordered = computeCandidateSubjectKey({
      productIdentity: "123456",
      sku: "蓝色 / m",
      category: "top",
      color: "blue",
      styles: ["CASUAL", "MINIMAL"],
      materials: ["COTTON"],
      patterns: ["SOLID"],
      brand: "nike",
      name: "air shirt"
    });

    expect(first).toBe(reordered);
    expect(first).toMatch(/^candidate:v1:[a-f0-9]{64}$/);
    expect(first).not.toContain("D:\\");
    expect(computeCandidateSubjectKey({
      productIdentity: "123456",
      sku: "蓝色 / M",
      category: "top",
      color: "white",
      styles: ["formal"],
      materials: ["linen", "cotton"],
      patterns: ["striped"],
      brand: "补全后的品牌",
      name: "详情补全后的名称"
    })).toBe(first);
    expect(computeCandidateSubjectKey({
      productIdentity: "123456",
      sku: "蓝色 / L",
      category: "top",
      color: "blue",
      styles: ["casual", "minimal"],
      materials: ["cotton"],
      patterns: ["solid"],
      brand: "nike",
      name: "air shirt"
    })).not.toBe(first);
  });
});

describe("garment similarity persistence", () => {
  it("reads optional local embeddings but never writes the cache", () => {
    const db = createDatabase(":memory:");
    ensureM5Tables(db);
    const first = insertGarment(db, garment({ id: 0, name: "深蓝衬衫", color: "navy" }));
    const second = insertGarment(db, garment({ id: 0, name: "深蓝衬衫", color: "navy" }));
    const vector = Buffer.from(new Float32Array([1, 0]).buffer);
    db.prepare(`
      INSERT INTO garment_embeddings (model_id, garment_id, vector_blob, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)
    `).run(
      DEFAULT_CLIP_MODEL_ID, first, vector, "2026-07-13T00:00:00.000Z", "2026-07-13T00:00:00.000Z",
      DEFAULT_CLIP_MODEL_ID, second, vector, "2026-07-13T00:00:00.000Z", "2026-07-13T00:00:00.000Z"
    );
    const before = db.prepare("SELECT COUNT(*) AS count FROM garment_embeddings").get();

    expect(listSimilarGarments(db, first)).toEqual([
      expect.objectContaining({
        garment: expect.objectContaining({ id: second }),
        similarity: 100,
        reasons: expect.arrayContaining(["视觉向量相似度 100%"])
      })
    ]);
    expect(db.prepare("SELECT COUNT(*) AS count FROM garment_embeddings").get()).toEqual(before);
  });

  it("applies the 75% duplicate threshold before rounding the display score", () => {
    const db = createDatabase(":memory:");
    ensureM5Tables(db);
    const first = insertGarment(db, garment({
      id: 0,
      brand: "brand-a",
      name: "aaa",
      color: "navy",
      styles: ["casual"]
    }));
    const second = insertGarment(db, garment({
      id: 0,
      brand: "brand-b",
      name: "bbb",
      color: "navy",
      styles: ["casual"]
    }));
    const visualSimilarity = 0.7472;
    const firstVector = Buffer.from(new Float32Array([1, 0]).buffer);
    const secondVector = Buffer.from(new Float32Array([
      visualSimilarity,
      Math.sqrt(1 - visualSimilarity ** 2)
    ]).buffer);
    db.prepare(`
      INSERT INTO garment_embeddings (model_id, garment_id, vector_blob, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)
    `).run(
      DEFAULT_CLIP_MODEL_ID, first, firstVector, "2026-07-13T00:00:00.000Z", "2026-07-13T00:00:00.000Z",
      DEFAULT_CLIP_MODEL_ID, second, secondVector, "2026-07-13T00:00:00.000Z", "2026-07-13T00:00:00.000Z"
    );

    expect(calculateGarmentSimilarity(
      garment({ brand: "brand-a", name: "aaa", color: "navy", styles: ["casual"] }),
      garment({ brand: "brand-b", name: "bbb", color: "navy", styles: ["casual"] }),
      { subjectEmbedding: [1, 0], comparedEmbedding: [visualSimilarity, Math.sqrt(1 - visualSimilarity ** 2)] }
    )?.similarity).toBe(75);
    expect(listSimilarGarments(db, first)).toEqual([]);
  });

  it("canonicalizes garment pairs, upserts idempotently and hides not-duplicate immediately", () => {
    const db = createDatabase(":memory:");
    ensureM5Tables(db);
    const first = insertGarment(db, garment({ id: 0, name: "同款衬衫", color: "white" }));
    const second = insertGarment(db, garment({ id: 0, name: "同款衬衫", color: "white" }));
    const beforeGarments = db.prepare("SELECT * FROM garments ORDER BY id").all();

    expect(canonicalizeGarmentFeedbackPair(second, first)).toEqual({
      subjectKey: `garment:${first}`,
      comparedGarmentId: second
    });
    const now = new Date("2026-07-13T08:00:00.000Z");
    const firstWrite = upsertSimilarityFeedback(db, {
      ...canonicalizeGarmentFeedbackPair(second, first),
      verdict: "not-duplicate"
    }, { now: () => now });
    const replay = upsertSimilarityFeedback(db, {
      ...canonicalizeGarmentFeedbackPair(first, second),
      verdict: "not-duplicate"
    }, { now: () => now });

    expect(replay.id).toBe(firstWrite.id);
    expect(replay).toMatchObject({
      subjectKey: `garment:${first}`,
      comparedGarmentId: second,
      verdict: "not-duplicate",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    });
    expect(db.prepare("SELECT COUNT(*) AS count FROM garment_similarity_feedback").get()).toEqual({ count: 1 });
    expect(listSimilarGarments(db, first)).toEqual([]);
    expect(listSimilarGarments(db, second)).toEqual([]);
    expect(db.prepare("SELECT * FROM garments ORDER BY id").all()).toEqual(beforeGarments);
  });
});

function garment(overrides: Partial<Garment> = {}): Garment {
  return {
    id: 1,
    origin: "manual",
    brand: "",
    name: "基础上衣",
    rawName: "基础上衣",
    category: "top",
    color: "",
    warmth: "medium",
    seasons: [],
    styles: [],
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
