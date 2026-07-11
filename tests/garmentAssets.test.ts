import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { createDatabase, type AppDatabase } from "../server/db";
import {
  DEFAULT_GARMENT_ASSET_ROOT,
  MAX_GARMENT_IMAGE_BYTES,
  MAX_GARMENT_IMAGE_PIXELS,
  readActiveGarmentAsset,
  resolveGarmentAssetPath,
  saveGarmentImageAsset
} from "../server/services/garmentAssets";

const FIRST_UUID = "11111111-1111-4111-8111-111111111111";
const SECOND_UUID = "22222222-2222-4222-8222-222222222222";
const THIRD_UUID = "33333333-3333-4333-8333-333333333333";

describe("garment asset image sanitization", () => {
  it("uses a fixed local default root and a five-megabyte byte limit", () => {
    expect(DEFAULT_GARMENT_ASSET_ROOT).toBe(join(process.cwd(), "data", "garment-assets"));
    expect(MAX_GARMENT_IMAGE_BYTES).toBe(5 * 1024 * 1024);
    expect(MAX_GARMENT_IMAGE_PIXELS).toBeGreaterThan(0);
  });

  it("auto-rotates a JPEG and strips EXIF, ICC, and XMP from the stored WebP", async () => {
    const db = createDatabase(":memory:");
    const garmentId = insertGarment(db, "带元数据照片");
    const assetRoot = await retainedTempDir();
    const input = await sharp({
      create: {
        width: 10,
        height: 20,
        channels: 3,
        background: { r: 180, g: 40, b: 30 }
      }
    })
      .withMetadata({ orientation: 6, exif: { IFD0: { Artist: "private-owner" } } })
      .withXmp("<x:xmpmeta xmlns:x='adobe:ns:meta/'><secret>private-note</secret></x:xmpmeta>")
      .jpeg({ quality: 90 })
      .toBuffer();
    const sourceMetadata = await sharp(input).metadata();
    expect(sourceMetadata).toMatchObject({ format: "jpeg", width: 10, height: 20, orientation: 6 });
    expect(sourceMetadata.exif).toBeDefined();
    expect(sourceMetadata.icc).toBeDefined();
    expect(sourceMetadata.xmp).toBeDefined();

    const saved = await saveGarmentImageAsset(db, garmentId, input, "image/jpeg", {
      assetRoot,
      uuidFactory: () => FIRST_UUID
    });

    expect(saved).toMatchObject({
      imageUrl: `/api/garment-assets/${saved.asset.id}/content`,
      asset: {
        garmentId,
        kind: "primary",
        mimeType: "image/webp",
        width: 20,
        height: 10,
        active: true
      }
    });
    expect(saved.asset).not.toHaveProperty("storageKey");
    expect(saved.asset).not.toHaveProperty("filePath");

    const storedPath = join(assetRoot, `${FIRST_UUID}.webp`);
    const storedBytes = await readFile(storedPath);
    const storedMetadata = await sharp(storedBytes).metadata();
    expect(storedMetadata).toMatchObject({ format: "webp", width: 20, height: 10 });
    expect(storedMetadata.orientation).toBeUndefined();
    expect(storedMetadata.exif).toBeUndefined();
    expect(storedMetadata.icc).toBeUndefined();
    expect(storedMetadata.xmp).toBeUndefined();
    expect(createHash("sha256").update(storedBytes).digest("hex")).toBe(saved.asset.sha256);
    expect(storedBytes.byteLength).toBe(saved.asset.byteSize);

    const files = await readdir(assetRoot);
    expect(files).toEqual([`${FIRST_UUID}.webp`]);
    expect(files.some((file) => file.endsWith(".tmp"))).toBe(false);
  });

  it.each([
    ["PNG", "image/png"],
    ["WebP", "image/webp"]
  ] as const)("accepts %s only when the decoded format matches its MIME", async (format, mimeType) => {
    const db = createDatabase(":memory:");
    const garmentId = insertGarment(db, `${format} 图片`);
    const assetRoot = await retainedTempDir();
    const pipeline = sharp({
      create: {
        width: 24,
        height: 18,
        channels: 4,
        background: { r: 20, g: 80, b: 160, alpha: 0.8 }
      }
    });
    const input = format === "PNG" ? await pipeline.png().toBuffer() : await pipeline.webp().toBuffer();

    const saved = await saveGarmentImageAsset(db, garmentId, input, mimeType, {
      assetRoot,
      uuidFactory: () => FIRST_UUID
    });
    const stored = await readFile(join(assetRoot, `${FIRST_UUID}.webp`));

    expect(saved.asset).toMatchObject({ mimeType: "image/webp", width: 24, height: 18 });
    expect((await sharp(stored).metadata()).format).toBe("webp");
  });

  it("rejects a forged MIME type even when the body decodes as another allowed format", async () => {
    const db = createDatabase(":memory:");
    const garmentId = insertGarment(db, "伪造 MIME");
    const assetRoot = await retainedTempDir();
    const png = await makeImage("png", 16, 12);

    await expect(saveGarmentImageAsset(db, garmentId, png, "image/jpeg", {
      assetRoot,
      uuidFactory: () => FIRST_UUID
    })).rejects.toMatchObject({
      name: "ApiError",
      code: "INVALID_IMAGE",
      status: 400
    });
    expect(await filesIfPresent(assetRoot)).toEqual([]);
    expect(assetCount(db)).toBe(0);
  });

  it("rejects unsupported MIME types and undecodable bodies with structured errors", async () => {
    const db = createDatabase(":memory:");
    const garmentId = insertGarment(db, "坏图片");
    const assetRoot = await retainedTempDir();
    const png = await makeImage("png", 16, 12);

    await expect(saveGarmentImageAsset(db, garmentId, png, "application/octet-stream", {
      assetRoot,
      uuidFactory: () => FIRST_UUID
    })).rejects.toMatchObject({
      name: "ApiError",
      code: "UNSUPPORTED_IMAGE_TYPE",
      status: 415
    });
    await expect(saveGarmentImageAsset(db, garmentId, Buffer.from("not an image"), "image/png", {
      assetRoot,
      uuidFactory: () => FIRST_UUID
    })).rejects.toMatchObject({
      name: "ApiError",
      code: "INVALID_IMAGE",
      status: 400
    });
    expect(await filesIfPresent(assetRoot)).toEqual([]);
    expect(assetCount(db)).toBe(0);
  });

  it("enforces both the raw byte ceiling and sharp input pixel ceiling before saving", async () => {
    const db = createDatabase(":memory:");
    const garmentId = insertGarment(db, "限制测试");
    const assetRoot = await retainedTempDir();

    await expect(saveGarmentImageAsset(
      db,
      garmentId,
      Buffer.alloc(MAX_GARMENT_IMAGE_BYTES + 1),
      "image/jpeg",
      { assetRoot, uuidFactory: () => FIRST_UUID }
    )).rejects.toMatchObject({
      name: "ApiError",
      code: "IMAGE_TOO_LARGE",
      status: 413
    });

    const elevenByTen = await makeImage("png", 11, 10);
    await expect(saveGarmentImageAsset(db, garmentId, elevenByTen, "image/png", {
      assetRoot,
      uuidFactory: () => SECOND_UUID,
      limitInputPixels: 100
    })).rejects.toMatchObject({
      name: "ApiError",
      code: "IMAGE_PIXEL_LIMIT_EXCEEDED",
      status: 413
    });
    expect(await filesIfPresent(assetRoot)).toEqual([]);
    expect(assetCount(db)).toBe(0);
  });

  it("checks the garment before creating an asset directory or decoding image bytes", async () => {
    const db = createDatabase(":memory:");
    const parent = await retainedTempDir();
    const assetRoot = join(parent, "not-created");

    await expect(saveGarmentImageAsset(db, 999_999, Buffer.from("bad"), "image/png", {
      assetRoot,
      uuidFactory: () => FIRST_UUID
    })).rejects.toMatchObject({
      name: "ApiError",
      code: "NOT_FOUND",
      status: 404,
      message: "衣服不存在"
    });
    expect(existsSync(assetRoot)).toBe(false);
  });
});

describe("garment asset persistence and protected reads", () => {
  it("atomically lands a UUID WebP, updates the garment, and reads it by active asset ID", async () => {
    const db = createDatabase(":memory:");
    const garmentId = insertGarment(db, "原子落盘", "/api/garment-thumbnails/old.png");
    const assetRoot = await retainedTempDir();
    const input = await makeImage("png", 28, 32);

    const saved = await saveGarmentImageAsset(db, garmentId, input, "image/png; charset=binary", {
      assetRoot,
      uuidFactory: () => FIRST_UUID
    });
    const row = db.prepare(`
      SELECT garment_id, kind, storage_key, mime_type, byte_size, width, height, sha256, active
      FROM garment_assets
      WHERE id = ?
    `).get(saved.asset.id);
    expect(row).toEqual({
      garment_id: garmentId,
      kind: "primary",
      storage_key: `${FIRST_UUID}.webp`,
      mime_type: "image/webp",
      byte_size: saved.asset.byteSize,
      width: 28,
      height: 32,
      sha256: saved.asset.sha256,
      active: 1
    });
    expect(db.prepare("SELECT image_url, cutout_image_url FROM garments WHERE id = ?").get(garmentId)).toEqual({
      image_url: saved.imageUrl,
      cutout_image_url: null
    });

    const content = await readActiveGarmentAsset(db, saved.asset.id, { assetRoot });
    expect(content.asset).toEqual(saved.asset);
    expect(content.filePath).toBe(join(assetRoot, `${FIRST_UUID}.webp`));
    expect(content.bytes.equals(await readFile(content.filePath))).toBe(true);
    expect(content.bytes.byteLength).toBe(content.asset.byteSize);
  });

  it("soft-deactivates the previous primary asset without deleting either physical file", async () => {
    const db = createDatabase(":memory:");
    const garmentId = insertGarment(db, "替换图片");
    const assetRoot = await retainedTempDir();
    const first = await saveGarmentImageAsset(db, garmentId, await makeImage("png", 21, 22), "image/png", {
      assetRoot,
      uuidFactory: () => FIRST_UUID
    });
    const firstPath = join(assetRoot, `${FIRST_UUID}.webp`);
    const firstBytes = await readFile(firstPath);

    const second = await saveGarmentImageAsset(db, garmentId, await makeImage("webp", 31, 32), "image/webp", {
      assetRoot,
      uuidFactory: () => SECOND_UUID
    });
    const rows = db.prepare(`
      SELECT id, storage_key, active
      FROM garment_assets
      WHERE garment_id = ?
      ORDER BY id
    `).all(garmentId);

    expect(rows).toEqual([
      { id: first.asset.id, storage_key: `${FIRST_UUID}.webp`, active: 0 },
      { id: second.asset.id, storage_key: `${SECOND_UUID}.webp`, active: 1 }
    ]);
    expect(existsSync(firstPath)).toBe(true);
    expect(existsSync(join(assetRoot, `${SECOND_UUID}.webp`))).toBe(true);
    expect((await readFile(firstPath)).equals(firstBytes)).toBe(true);
    await expect(readActiveGarmentAsset(db, first.asset.id, { assetRoot })).rejects.toMatchObject({
      code: "GARMENT_ASSET_NOT_FOUND",
      status: 404
    });
    expect((await readActiveGarmentAsset(db, second.asset.id, { assetRoot })).asset.id).toBe(second.asset.id);
  });

  it("rejects traversal, missing files, and inactive or unknown IDs with one non-leaking error", async () => {
    const db = createDatabase(":memory:");
    const assetRoot = await retainedTempDir();
    const outsidePath = join(dirname(assetRoot), `${THIRD_UUID}.webp`);
    await writeFile(outsidePath, await makeImage("webp", 9, 9));

    const traversalId = insertAssetRow(db, insertGarment(db, "穿越行"), "../" + `${THIRD_UUID}.webp`, 1);
    const missingId = insertAssetRow(db, insertGarment(db, "缺失行"), `${SECOND_UUID}.webp`, 1);
    const inactiveId = insertAssetRow(db, insertGarment(db, "失活行"), `${FIRST_UUID}.webp`, 0);
    const failures = [
      () => readActiveGarmentAsset(db, 999_999, { assetRoot }),
      () => readActiveGarmentAsset(db, inactiveId, { assetRoot }),
      () => readActiveGarmentAsset(db, missingId, { assetRoot }),
      () => readActiveGarmentAsset(db, traversalId, { assetRoot })
    ];

    for (const read of failures) {
      let caught: unknown;
      try {
        await read();
      } catch (error) {
        caught = error;
      }
      expect(caught).toMatchObject({
        name: "ApiError",
        code: "GARMENT_ASSET_NOT_FOUND",
        status: 404,
        message: "衣物图片不存在"
      });
      const error = caught as Error & { details?: unknown };
      expect(error.details).toBeUndefined();
      expect(error.message).not.toContain(assetRoot);
      expect(error.message).not.toContain(outsidePath);
    }

    expect(() => resolveGarmentAssetPath(assetRoot, `../${THIRD_UUID}.webp`)).toThrowError(
      expect.objectContaining({ code: "GARMENT_ASSET_NOT_FOUND", status: 404 })
    );
  });

  it("rejects a symlinked asset even when a corrupted active row points at it", async (context) => {
    const db = createDatabase(":memory:");
    const assetRoot = await retainedTempDir();
    const outsidePath = await mkdtemp(join(dirname(assetRoot), `outside-${THIRD_UUID}-`));
    const linkPath = join(assetRoot, `${THIRD_UUID}.webp`);
    await writeFile(join(outsidePath, "payload.webp"), await makeImage("webp", 12, 13));
    try {
      // A Windows junction does not require Developer Mode/admin privileges,
      // while still exercising lstat/realpath rejection of a linked target.
      await symlink(outsidePath, linkPath, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (["EPERM", "EACCES", "ENOTSUP"].includes(code ?? "")) {
        context.skip();
        return;
      }
      throw error;
    }
    const assetId = insertAssetRow(db, insertGarment(db, "符号链接行"), `${THIRD_UUID}.webp`, 1);

    await expect(readActiveGarmentAsset(db, assetId, { assetRoot })).rejects.toMatchObject({
      name: "ApiError",
      code: "GARMENT_ASSET_NOT_FOUND",
      status: 404,
      message: "衣物图片不存在",
      details: undefined
    });
  });
});

function insertGarment(db: AppDatabase, name: string, imageUrl = ""): number {
  const result = db.prepare(`
    INSERT INTO garments (
      name, raw_name, category, color, warmth, seasons, styles, formality,
      image_url, cutout_image_url, owned, confirmed, excluded, confidence, notes
    ) VALUES (?, ?, 'top', 'black', 'medium', '["spring"]', '["casual"]', 'casual', ?, ?, 1, 1, 0, 1, '')
  `).run(name, name, imageUrl, imageUrl ? "/api/garment-thumbnails/old-cutout.png" : null);
  return Number(result.lastInsertRowid);
}

function insertAssetRow(db: AppDatabase, garmentId: number, storageKey: string, active: 0 | 1): number {
  db.exec("PRAGMA ignore_check_constraints = ON");
  try {
    const result = db.prepare(`
      INSERT INTO garment_assets (
        garment_id, kind, storage_key, mime_type, byte_size, width, height, sha256, active
      ) VALUES (?, 'primary', ?, 'image/webp', 10, 1, 1, ?, ?)
    `).run(garmentId, storageKey, "a".repeat(64), active);
    return Number(result.lastInsertRowid);
  } finally {
    db.exec("PRAGMA ignore_check_constraints = OFF");
  }
}

function assetCount(db: AppDatabase): number {
  return Number((db.prepare("SELECT COUNT(*) AS count FROM garment_assets").get() as { count: number }).count);
}

async function retainedTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "outfit-garment-assets-test-"));
}

async function filesIfPresent(root: string): Promise<string[]> {
  return existsSync(root) ? readdir(root) : [];
}

async function makeImage(format: "jpeg" | "png" | "webp", width: number, height: number): Promise<Buffer> {
  const pipeline = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 12, g: 90, b: 180, alpha: 1 }
    }
  });
  if (format === "jpeg") return pipeline.jpeg().toBuffer();
  if (format === "png") return pipeline.png().toBuffer();
  return pipeline.webp().toBuffer();
}
