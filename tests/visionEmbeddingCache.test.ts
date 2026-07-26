import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDatabase, type AppDatabase } from "../server/db";
import { DEFAULT_CLIP_MODEL_ID } from "../server/services/garmentSimilarity";
import { createGarmentVisionTags, type VisionTagInferenceResult } from "../server/services/vision";

describe("本地视觉 embedding 缓存", () => {
  const databases: AppDatabase[] = [];

  afterEach(() => {
    for (const db of databases.splice(0)) db.close();
  });

  it("仅在显式视觉分析时写入单位归一化的 Float32 向量", async () => {
    const fixture = createVisionFixture(databases);
    const inferVisionTags = vi.fn(async () => ({
      category: "top" as const,
      styles: ["casual"],
      patterns: ["solid"],
      tags: ["cotton"],
      scores: [{ label: "top", score: 0.91 }],
      embedding: [3, 4]
    }));

    const suggestion = await createGarmentVisionTags(fixture.db, fixture.garmentId, {
      modelRoot: fixture.modelRoot,
      thumbnailOutputDir: fixture.thumbnailOutputDir,
      inferVisionTags
    });

    expect(inferVisionTags).toHaveBeenCalledTimes(1);
    expect(suggestion).toEqual({
      category: "top",
      styles: ["casual"],
      patterns: ["solid"],
      tags: ["cotton"],
      scores: [{ label: "top", score: 0.91 }]
    });
    expect(suggestion).not.toHaveProperty("embedding");

    const row = fixture.db.prepare(`
      SELECT model_id, garment_id, vector_blob
      FROM garment_embeddings
    `).get() as unknown as {
      model_id: string;
      garment_id: number;
      vector_blob: Uint8Array;
    };
    const vector = decodeFloat32Vector(row.vector_blob);
    expect(row.model_id).toBe(DEFAULT_CLIP_MODEL_ID);
    expect(row.garment_id).toBe(fixture.garmentId);
    expect(vector).toEqual([expect.closeTo(0.6, 6), expect.closeTo(0.8, 6)]);
    expect(Math.hypot(...vector)).toBeCloseTo(1, 6);
  });

  it("重复显式刷新幂等覆盖同一模型与衣物的缓存", async () => {
    const fixture = createVisionFixture(databases);
    let embedding = [3, 4];
    const inferVisionTags = vi.fn(async () => ({
      styles: [],
      patterns: [],
      tags: [],
      scores: [],
      embedding
    }));
    const options = {
      modelRoot: fixture.modelRoot,
      thumbnailOutputDir: fixture.thumbnailOutputDir,
      inferVisionTags
    };

    await createGarmentVisionTags(fixture.db, fixture.garmentId, options);
    embedding = [0, 12];
    await createGarmentVisionTags(fixture.db, fixture.garmentId, options);

    expect(inferVisionTags).toHaveBeenCalledTimes(2);
    expect(fixture.db.prepare("SELECT COUNT(*) AS count FROM garment_embeddings").get()).toEqual({ count: 1 });
    const row = fixture.db.prepare("SELECT vector_blob FROM garment_embeddings").get() as unknown as {
      vector_blob: Uint8Array;
    };
    expect(decodeFloat32Vector(row.vector_blob)).toEqual([0, 1]);
  });

  it("本地 CLIP 模型缺失时结构化失败且不运行推理、不写缓存", async () => {
    const fixture = createVisionFixture(databases, { installClip: false });
    const inferVisionTags = vi.fn();

    await expect(createGarmentVisionTags(fixture.db, fixture.garmentId, {
      modelRoot: fixture.modelRoot,
      thumbnailOutputDir: fixture.thumbnailOutputDir,
      inferVisionTags
    })).rejects.toMatchObject({
      code: "VISION_MODEL_MISSING",
      status: 409,
      details: {
        modelId: "clip-vit-base-patch32",
        path: expect.stringContaining("clip-vit-base-patch32")
      }
    });
    expect(inferVisionTags).not.toHaveBeenCalled();
    expect(fixture.db.prepare("SELECT COUNT(*) AS count FROM garment_embeddings").get()).toEqual({ count: 0 });
  });

  it("拒绝零范数或非有限向量，并且不留下标签或缓存的部分写入", async () => {
    const fixture = createVisionFixture(databases);

    await expect(createGarmentVisionTags(fixture.db, fixture.garmentId, {
      modelRoot: fixture.modelRoot,
      thumbnailOutputDir: fixture.thumbnailOutputDir,
      inferVisionTags: async () => ({
        styles: ["formal"],
        patterns: [],
        tags: [],
        scores: [],
        embedding: [0, 0]
      })
    })).rejects.toMatchObject({
      code: "VISION_EMBEDDING_INVALID",
      status: 500
    });

    expect(fixture.db.prepare("SELECT COUNT(*) AS count FROM garment_embeddings").get()).toEqual({ count: 0 });
    expect(fixture.db.prepare("SELECT vision_tags FROM garments WHERE id = ?").get(fixture.garmentId)).toEqual({
      vision_tags: null
    });
  });

  it.each([
    ["非法分类和对象标签", {
      category: "hat",
      styles: [{ name: "formal" }],
      patterns: [],
      tags: [],
      scores: []
    }],
    ["空 score 项", {
      styles: [],
      patterns: [],
      tags: [],
      scores: [null]
    }]
  ])("拒绝视觉推理返回的%s且不写入标签或缓存", async (_label, inference) => {
    const fixture = createVisionFixture(databases);

    const rejection = await createGarmentVisionTags(fixture.db, fixture.garmentId, {
      modelRoot: fixture.modelRoot,
      thumbnailOutputDir: fixture.thumbnailOutputDir,
      inferVisionTags: async () => inference as unknown as VisionTagInferenceResult
    }).then(
      () => undefined,
      (error: unknown) => error
    );

    expect.soft(rejection).toMatchObject({
      code: "VISION_TAG_OUTPUT_INVALID",
      status: 500
    });
    expect.soft(fixture.db.prepare("SELECT vision_tags FROM garments WHERE id = ?").get(fixture.garmentId)).toEqual({
      vision_tags: null
    });
    expect.soft(fixture.db.prepare("SELECT COUNT(*) AS count FROM garment_embeddings").get()).toEqual({ count: 0 });
  });
});

function createVisionFixture(
  databases: AppDatabase[],
  options: { installClip?: boolean } = {}
): {
  db: AppDatabase;
  garmentId: number;
  modelRoot: string;
  thumbnailOutputDir: string;
} {
  const modelRoot = mkdtempSync(join(tmpdir(), "outfit-embedding-model-"));
  const thumbnailOutputDir = mkdtempSync(join(tmpdir(), "outfit-embedding-thumb-"));
  if (options.installClip !== false) installFakeClip(modelRoot);
  writeFileSync(join(thumbnailOutputDir, "garment-shirt.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  const db = createDatabase(":memory:");
  databases.push(db);
  const result = db.prepare(`
    INSERT INTO garments (
      name, category, color, warmth, seasons, styles, formality,
      image_url, owned, confirmed, excluded, confidence, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "白色衬衫",
    "top",
    "white",
    "light",
    JSON.stringify(["spring"]),
    JSON.stringify(["casual"]),
    "casual",
    "/api/garment-thumbnails/garment-shirt.png",
    1,
    1,
    0,
    0.9,
    ""
  );
  return {
    db,
    garmentId: Number(result.lastInsertRowid),
    modelRoot,
    thumbnailOutputDir
  };
}

function installFakeClip(modelRoot: string): void {
  const clipDir = join(modelRoot, "huggingface", "Xenova", "clip-vit-base-patch32");
  mkdirSync(join(clipDir, "onnx"), { recursive: true });
  for (const file of [
    "config.json",
    "preprocessor_config.json",
    "special_tokens_map.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "vocab.json",
    "merges.txt"
  ]) {
    writeFileSync(join(clipDir, file), "{}", "utf8");
  }
  writeFileSync(join(clipDir, "onnx", "model.onnx"), "fake-model", "utf8");
}

function decodeFloat32Vector(blob: Uint8Array): number[] {
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  const vector: number[] = [];
  for (let offset = 0; offset < blob.byteLength; offset += 4) {
    vector.push(view.getFloat32(offset, true));
  }
  return vector;
}
