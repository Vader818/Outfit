import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename
} from "node:fs/promises";
import {
  isAbsolute,
  join,
  relative,
  resolve,
  sep
} from "node:path";
import sharp, { type Metadata } from "sharp";
import type { AppDatabase } from "../db";
import { ApiError } from "../validation";

export const DEFAULT_GARMENT_ASSET_ROOT = join(process.cwd(), "data", "garment-assets");
export const MAX_GARMENT_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_GARMENT_IMAGE_PIXELS = 40_000_000;
export const GARMENT_PRIMARY_ASSET_KIND = "primary";
export const ALLOWED_GARMENT_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp"
] as const;

export type GarmentImageMimeType = (typeof ALLOWED_GARMENT_IMAGE_MIME_TYPES)[number];

export interface GarmentAssetOptions {
  assetRoot?: string;
}

export interface SaveGarmentImageAssetOptions extends GarmentAssetOptions {
  uuidFactory?: () => string;
  limitInputPixels?: number;
}

export interface GarmentAssetMetadata {
  id: number;
  garmentId: number;
  kind: string;
  mimeType: "image/webp";
  byteSize: number;
  width: number;
  height: number;
  sha256: string;
  active: boolean;
  createdAt: string;
}

export interface SavedGarmentImageAsset {
  asset: GarmentAssetMetadata;
  imageUrl: string;
}

export interface ActiveGarmentAssetContent {
  asset: GarmentAssetMetadata;
  bytes: Buffer;
  /** Internal server path. Callers must never serialize this value to clients. */
  filePath: string;
}

interface GarmentAssetRow {
  id: number;
  garment_id: number;
  kind: string;
  storage_key: string;
  mime_type: string;
  byte_size: number;
  width: number;
  height: number;
  sha256: string;
  active: number;
  created_at: string;
}

interface SanitizedImage {
  bytes: Buffer;
  width: number;
  height: number;
  sha256: string;
}

interface LandedAssetFile {
  storageKey: string;
  filePath: string;
}

const EXPECTED_SHARP_FORMAT = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp"
} as const satisfies Record<GarmentImageMimeType, Metadata["format"]>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STORAGE_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export function defaultGarmentAssetRoot(): string {
  return DEFAULT_GARMENT_ASSET_ROOT;
}

/**
 * Decode, sanitize, atomically land and register a garment's primary image.
 * Physical files are never removed here: replaced rows are only marked inactive.
 */
export async function saveGarmentImageAsset(
  db: AppDatabase,
  garmentId: number,
  input: Buffer,
  contentType: string,
  options: SaveGarmentImageAssetOptions = {}
): Promise<SavedGarmentImageAsset> {
  assertGarmentExists(db, garmentId);
  if (db.isTransaction) {
    throw new Error("Cannot save a garment asset inside an existing transaction");
  }

  const mimeType = normalizeImageMimeType(contentType);
  if (!mimeType) {
    throw new ApiError("UNSUPPORTED_IMAGE_TYPE", "仅支持 JPEG、PNG 或 WebP 图片", 415);
  }
  if (!Buffer.isBuffer(input) || input.byteLength === 0) {
    throw invalidImageError();
  }
  if (input.byteLength > MAX_GARMENT_IMAGE_BYTES) {
    throw new ApiError("IMAGE_TOO_LARGE", "图片不能超过 5 MB", 413);
  }

  const sanitized = await sanitizeImage(input, mimeType, normalizePixelLimit(options.limitInputPixels));
  const assetRoot = options.assetRoot ?? DEFAULT_GARMENT_ASSET_ROOT;
  const landed = await landAssetFileAtomically(
    assetRoot,
    sanitized.bytes,
    options.uuidFactory ?? randomUUID
  );

  return persistPrimaryAsset(db, garmentId, landed, sanitized);
}

/**
 * Read one currently-active asset by database ID. Missing, inactive, corrupt,
 * traversing and symlinked rows intentionally collapse to the same public 404.
 */
export async function readActiveGarmentAsset(
  db: AppDatabase,
  assetId: number,
  options: GarmentAssetOptions = {}
): Promise<ActiveGarmentAssetContent> {
  return readGarmentAsset(db, assetId, true, options);
}

/**
 * Read an asset for an explicit complete backup, including inactive historical
 * versions. This has the same path, symlink and integrity checks as the active
 * content endpoint and must not be exposed as a general unauthenticated read.
 */
export async function readGarmentAssetForBackup(
  db: AppDatabase,
  assetId: number,
  options: GarmentAssetOptions = {}
): Promise<ActiveGarmentAssetContent> {
  return readGarmentAsset(db, assetId, false, options);
}

async function readGarmentAsset(
  db: AppDatabase,
  assetId: number,
  requireActive: boolean,
  options: GarmentAssetOptions
): Promise<ActiveGarmentAssetContent> {
  if (!Number.isSafeInteger(assetId) || assetId <= 0) {
    throw garmentAssetNotFoundError();
  }
  const row = db.prepare(`
    SELECT id, garment_id, kind, storage_key, mime_type, byte_size, width, height,
      sha256, active, created_at
    FROM garment_assets
    WHERE id = ? ${requireActive ? "AND active = 1" : ""}
  `).get(assetId) as GarmentAssetRow | undefined;
  if (!row || !isValidAssetRow(row, requireActive)) {
    throw garmentAssetNotFoundError();
  }

  const assetRoot = options.assetRoot ?? DEFAULT_GARMENT_ASSET_ROOT;
  let filePath: string;
  let bytes: Buffer;
  try {
    filePath = await resolveExistingRegularAssetPath(assetRoot, row.storage_key);
    bytes = await readFile(filePath);
    if (
      bytes.byteLength !== row.byte_size ||
      createHash("sha256").update(bytes).digest("hex") !== row.sha256
    ) {
      throw garmentAssetNotFoundError();
    }
  } catch {
    throw garmentAssetNotFoundError();
  }

  return {
    asset: rowToMetadata(row),
    bytes,
    filePath
  };
}

/**
 * Lexically resolve a generated storage key below the configured root.
 * This helper does not establish that a file exists; reads additionally use
 * lstat/realpath through readActiveGarmentAsset().
 */
export function resolveGarmentAssetPath(assetRoot: string, storageKey: string): string {
  if (!STORAGE_KEY_PATTERN.test(storageKey)) {
    throw garmentAssetNotFoundError();
  }
  const root = resolve(assetRoot);
  const target = resolve(root, storageKey);
  if (!isStrictDescendant(root, target)) {
    throw garmentAssetNotFoundError();
  }
  return target;
}

async function sanitizeImage(
  input: Buffer,
  mimeType: GarmentImageMimeType,
  limitInputPixels: number
): Promise<SanitizedImage> {
  let metadata: Metadata;
  try {
    metadata = await sharp(input, {
      failOn: "error",
      limitInputPixels,
      sequentialRead: true
    }).metadata();
  } catch (error) {
    throw normalizeSharpError(error);
  }

  if (
    metadata.format !== EXPECTED_SHARP_FORMAT[mimeType] ||
    !metadata.width ||
    !metadata.height ||
    (metadata.pages ?? 1) !== 1
  ) {
    throw invalidImageError();
  }

  try {
    const { data, info } = await sharp(input, {
      failOn: "error",
      limitInputPixels,
      sequentialRead: true
    })
      .rotate()
      .webp({ quality: 90, effort: 4, smartSubsample: true })
      .toBuffer({ resolveWithObject: true });
    if (info.format !== "webp" || info.width <= 0 || info.height <= 0 || data.byteLength <= 0) {
      throw invalidImageError();
    }
    return {
      bytes: data,
      width: info.width,
      height: info.height,
      sha256: createHash("sha256").update(data).digest("hex")
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw normalizeSharpError(error);
  }
}

async function landAssetFileAtomically(
  assetRoot: string,
  bytes: Buffer,
  uuidFactory: () => string
): Promise<LandedAssetFile> {
  const uuid = uuidFactory();
  if (!UUID_PATTERN.test(uuid)) {
    throw new Error("UUID factory returned an invalid UUID");
  }
  const storageKey = `${uuid.toLowerCase()}.webp`;
  const root = resolve(assetRoot);
  await mkdir(root, { recursive: true });

  const realRoot = await realpath(root);
  const finalPath = resolveGarmentAssetPath(root, storageKey);
  const temporaryPath = resolveInternalTemporaryPath(root, `.${uuid.toLowerCase()}.tmp`);
  if (!samePath(await realpath(root), realRoot)) {
    throw new Error("Garment asset root changed while saving");
  }
  await assertPathDoesNotExist(finalPath);

  const handle = await open(temporaryPath, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }

  const temporaryStat = await lstat(temporaryPath);
  const temporaryRealParent = await realpath(root);
  if (
    !temporaryStat.isFile() ||
    temporaryStat.isSymbolicLink() ||
    !samePath(temporaryRealParent, realRoot)
  ) {
    throw new Error("Garment asset temporary path is unsafe");
  }
  await assertPathDoesNotExist(finalPath);
  await rename(temporaryPath, finalPath);

  const finalStat = await lstat(finalPath);
  const finalRealPath = await realpath(finalPath);
  if (
    !finalStat.isFile() ||
    finalStat.isSymbolicLink() ||
    !isStrictDescendant(realRoot, finalRealPath)
  ) {
    throw new Error("Garment asset final path is unsafe");
  }
  return { storageKey, filePath: finalPath };
}

function persistPrimaryAsset(
  db: AppDatabase,
  garmentId: number,
  landed: LandedAssetFile,
  image: SanitizedImage
): SavedGarmentImageAsset {
  db.exec("BEGIN IMMEDIATE");
  try {
    assertGarmentExists(db, garmentId);
    db.prepare(`
      UPDATE garment_assets
      SET active = 0
      WHERE garment_id = ? AND kind = ? AND active = 1
    `).run(garmentId, GARMENT_PRIMARY_ASSET_KIND);
    const inserted = db.prepare(`
      INSERT INTO garment_assets (
        garment_id, kind, storage_key, mime_type, byte_size, width, height,
        sha256, active
      ) VALUES (?, ?, ?, 'image/webp', ?, ?, ?, ?, 1)
    `).run(
      garmentId,
      GARMENT_PRIMARY_ASSET_KIND,
      landed.storageKey,
      image.bytes.byteLength,
      image.width,
      image.height,
      image.sha256
    );
    const assetId = Number(inserted.lastInsertRowid);
    if (!Number.isSafeInteger(assetId) || assetId <= 0) {
      throw new Error("SQLite returned an invalid garment asset id");
    }
    const imageUrl = `/api/garment-assets/${assetId}/content`;
    const updated = db.prepare(`
      UPDATE garments
      SET image_url = ?, cutout_image_url = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(imageUrl, garmentId);
    if (Number(updated.changes) !== 1) {
      throw garmentNotFoundError();
    }
    const row = db.prepare(`
      SELECT id, garment_id, kind, storage_key, mime_type, byte_size, width,
        height, sha256, active, created_at
      FROM garment_assets
      WHERE id = ?
    `).get(assetId) as GarmentAssetRow | undefined;
    if (!row || !isValidAssetRow(row)) {
      throw new Error("Stored garment asset metadata is invalid");
    }
    db.exec("COMMIT");
    return { asset: rowToMetadata(row), imageUrl };
  } catch (error) {
    if (db.isTransaction) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // Preserve the original database failure. The landed file remains for
        // the explicit privacy-clean preview rather than being silently deleted.
      }
    }
    throw error;
  }
}

async function resolveExistingRegularAssetPath(assetRoot: string, storageKey: string): Promise<string> {
  const root = resolve(assetRoot);
  const target = resolveGarmentAssetPath(root, storageKey);
  const rootRealPath = await realpath(root);
  const targetStat = await lstat(target);
  if (!targetStat.isFile() || targetStat.isSymbolicLink()) {
    throw garmentAssetNotFoundError();
  }
  const targetRealPath = await realpath(target);
  if (!isStrictDescendant(rootRealPath, targetRealPath)) {
    throw garmentAssetNotFoundError();
  }
  return target;
}

function resolveInternalTemporaryPath(assetRoot: string, fileName: string): string {
  if (!/^\.[0-9a-f-]+\.tmp$/i.test(fileName)) {
    throw new Error("Invalid garment asset temporary name");
  }
  const root = resolve(assetRoot);
  const target = resolve(root, fileName);
  if (!isStrictDescendant(root, target)) {
    throw new Error("Garment asset temporary path is unsafe");
  }
  return target;
}

async function assertPathDoesNotExist(path: string): Promise<void> {
  try {
    await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  throw new ApiError("GARMENT_ASSET_STORAGE_CONFLICT", "无法安全保存衣物图片", 409);
}

function assertGarmentExists(db: AppDatabase, garmentId: number): void {
  if (!Number.isSafeInteger(garmentId) || garmentId <= 0) {
    throw garmentNotFoundError();
  }
  const row = db.prepare("SELECT id FROM garments WHERE id = ?").get(garmentId) as {
    id: number;
  } | undefined;
  if (!row) throw garmentNotFoundError();
}

function isValidAssetRow(row: GarmentAssetRow, requireActive = true): boolean {
  return (
    Number.isSafeInteger(row.id) &&
    row.id > 0 &&
    Number.isSafeInteger(row.garment_id) &&
    row.garment_id > 0 &&
    typeof row.kind === "string" &&
    row.kind.trim().length > 0 &&
    STORAGE_KEY_PATTERN.test(row.storage_key) &&
    row.mime_type === "image/webp" &&
    Number.isSafeInteger(row.byte_size) &&
    row.byte_size > 0 &&
    Number.isSafeInteger(row.width) &&
    row.width > 0 &&
    Number.isSafeInteger(row.height) &&
    row.height > 0 &&
    SHA256_PATTERN.test(row.sha256) &&
    (row.active === 0 || row.active === 1) &&
    (!requireActive || row.active === 1) &&
    typeof row.created_at === "string" &&
    row.created_at.length > 0
  );
}

function rowToMetadata(row: GarmentAssetRow): GarmentAssetMetadata {
  return {
    id: row.id,
    garmentId: row.garment_id,
    kind: row.kind,
    mimeType: "image/webp",
    byteSize: row.byte_size,
    width: row.width,
    height: row.height,
    sha256: row.sha256,
    active: Boolean(row.active),
    createdAt: row.created_at
  };
}

function normalizeImageMimeType(value: string): GarmentImageMimeType | undefined {
  const normalized = String(value || "").split(";", 1)[0].trim().toLowerCase();
  return ALLOWED_GARMENT_IMAGE_MIME_TYPES.find((mimeType) => mimeType === normalized);
}

function normalizePixelLimit(value: number | undefined): number {
  if (value === undefined) return MAX_GARMENT_IMAGE_PIXELS;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("limitInputPixels must be a positive safe integer");
  }
  return value;
}

function normalizeSharpError(error: unknown): ApiError {
  if (error instanceof Error && /pixel limit/i.test(error.message)) {
    return new ApiError("IMAGE_PIXEL_LIMIT_EXCEEDED", "图片像素尺寸过大", 413);
  }
  return invalidImageError();
}

function invalidImageError(): ApiError {
  return new ApiError("INVALID_IMAGE", "无法解码或净化这张图片", 400);
}

function garmentNotFoundError(): ApiError {
  return new ApiError("NOT_FOUND", "衣服不存在", 404);
}

function garmentAssetNotFoundError(): ApiError {
  return new ApiError("GARMENT_ASSET_NOT_FOUND", "衣物图片不存在", 404);
}

function isStrictDescendant(root: string, target: string): boolean {
  const relativePath = relative(root, target);
  return (
    relativePath.length > 0 &&
    !isAbsolute(relativePath) &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${sep}`)
  );
}

function samePath(left: string, right: string): boolean {
  return process.platform === "win32"
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}
