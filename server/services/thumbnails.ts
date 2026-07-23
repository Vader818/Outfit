import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import { join } from "node:path";
import sharp from "sharp";
import type { GarmentCategory } from "../../src/shared/types";

export interface ThumbnailCandidateInput {
  category: GarmentCategory;
  title: string;
  sku?: string;
  imageUrl?: string;
  detailImages?: string[];
  candidates?: string[];
}

export interface RankedThumbnailCandidate {
  url: string;
  score: number;
  source: "order" | "detail" | "candidate";
}

export interface ImageInfo {
  format: "jpg" | "png" | "webp";
  width: number;
  height: number;
}

export interface DownloadGarmentThumbnailInput extends ThumbnailCandidateInput {
  garmentId: number;
  itemId?: string;
  outputDir?: string;
  publicBasePath?: string;
  maxDownloads?: number;
  maxBytes?: number;
  timeoutMs?: number;
  allowedHostSuffixes?: string[];
  delayMs?: number;
  fetcher?: typeof fetch;
  onAttempt?: (url: string) => void;
  onFailure?: (event: ThumbnailDownloadFailure) => void;
}

export interface DownloadedThumbnail {
  sourceUrl: string;
  localUrl: string;
  filePath: string;
  imageInfo: ImageInfo;
}

export interface ThumbnailRefreshResult {
  scanned: number;
  attemptedDownloads: number;
  updated: number;
  skipped: number;
}

export type ThumbnailDownloadFailureReason =
  | "invalid_url"
  | "blocked_host"
  | "blocked_address"
  | "http_error"
  | "content_type"
  | "content_length_exceeded"
  | "size_limit_exceeded"
  | "invalid_image"
  | "timeout"
  | "fetch_error";

export interface ThumbnailDownloadFailure {
  url: string;
  reason: ThumbnailDownloadFailureReason;
  detail?: string;
}

const DEFAULT_THUMBNAIL_DIR = join(process.cwd(), "output", "garment-thumbnails");
const DEFAULT_PUBLIC_BASE_PATH = "/api/garment-thumbnails";
const DEFAULT_MAX_DOWNLOADS_PER_GARMENT = 4;
const DEFAULT_DOWNLOAD_DELAY_MS = 900;
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 5000;
const DEFAULT_MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;
export const MAX_THUMBNAIL_IMAGE_PIXELS = 40_000_000;
const DEFAULT_ALLOWED_IMAGE_HOST_SUFFIXES = [".alicdn.com", ".taobaocdn.com"];
const MIN_IMAGE_SIDE = 180;

export function defaultThumbnailOutputDir(): string {
  return DEFAULT_THUMBNAIL_DIR;
}

export function defaultThumbnailPublicBasePath(): string {
  return DEFAULT_PUBLIC_BASE_PATH;
}

export function rankThumbnailCandidates(input: ThumbnailCandidateInput): RankedThumbnailCandidate[] {
  const candidates = collectCandidateUrls(input);
  const ranked = candidates
    .map((candidate, index) => ({
      ...candidate,
      score: scoreCandidateUrl(candidate.url, input.category, input.title, input.sku || "", candidate.source, index)
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);
  return ranked.map(({ url, score, source }) => ({ url, score, source }));
}

export function readImageInfo(bytes: Uint8Array): ImageInfo | null {
  if (isPng(bytes)) {
    return {
      format: "png",
      width: readUInt32BE(bytes, 16),
      height: readUInt32BE(bytes, 20)
    };
  }
  if (isJpeg(bytes)) {
    return readJpegInfo(bytes);
  }
  if (isWebp(bytes)) {
    return readWebpInfo(bytes);
  }
  return null;
}

export async function downloadGarmentThumbnail(input: DownloadGarmentThumbnailInput): Promise<DownloadedThumbnail | null> {
  const outputDir = input.outputDir || DEFAULT_THUMBNAIL_DIR;
  const publicBasePath = input.publicBasePath || DEFAULT_PUBLIC_BASE_PATH;
  const maxDownloads = Math.max(1, input.maxDownloads ?? DEFAULT_MAX_DOWNLOADS_PER_GARMENT);
  const delayMs = Math.max(0, input.delayMs ?? DEFAULT_DOWNLOAD_DELAY_MS);
  const fetcher = input.fetcher || fetch;
  const candidates = rankThumbnailCandidates(input).slice(0, maxDownloads);

  await mkdir(outputDir, { recursive: true });
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (index > 0 && delayMs > 0) {
      await delay(delayMs);
    }
    input.onAttempt?.(candidate.url);
    const downloaded = await tryDownloadCandidate({
      candidate,
      input,
      outputDir,
      publicBasePath,
      fetcher
    });
    if (downloaded) return downloaded;
  }
  return null;
}

function collectCandidateUrls(input: ThumbnailCandidateInput): Array<{ url: string; source: RankedThumbnailCandidate["source"] }> {
  const values: Array<{ url: string; source: RankedThumbnailCandidate["source"] }> = [];
  if (input.imageUrl) values.push({ url: input.imageUrl, source: "order" });
  for (const image of input.detailImages || []) {
    values.push({ url: image, source: "detail" });
  }
  for (const image of input.candidates || []) {
    values.push({ url: image, source: "candidate" });
  }

  const seen = new Set<string>();
  const unique: Array<{ url: string; source: RankedThumbnailCandidate["source"] }> = [];
  for (const value of values) {
    const normalized = normalizeImageUrl(value.url);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push({ url: normalized, source: value.source });
  }
  return unique;
}

function scoreCandidateUrl(url: string, category: GarmentCategory, title: string, sku: string, source: RankedThumbnailCandidate["source"], index: number): number {
  const lower = safeDecode(url).toLowerCase();
  if (!/^https?:\/\//i.test(url)) return 0;
  if (!/\.(?:jpe?g|png|webp)(?:[?#_].*)?$/i.test(lower)) return 0;
  if (/\.(?:svg|gif)(?:[?#_].*)?$/i.test(lower)) return 0;
  if (/logo|sprite|icon|avatar|placeholder|transparent|loading|wangwang|shop[_-]?card|store[_-]?card/.test(lower)) return 0;
  if (/-\d-?tps-\d{1,5}-\d{1,5}|(?:^|[/_-])tps[-_/]\d{1,5}[-x_]\d{1,5}|-\d{1,5}-\d{1,5}\.png/.test(lower)) return 0;

  const hintedSize = parseUrlSize(lower);
  if (hintedSize && (hintedSize.width < MIN_IMAGE_SIDE || hintedSize.height < MIN_IMAGE_SIDE)) return 0;

  let score = Math.max(0, 20 - index);
  if (source === "detail") score += 24;
  if (/alicdn|taobaocdn/.test(lower)) score += 20;
  if (/item_pic/.test(lower)) score += 90;
  if (/bao\/uploaded/.test(lower)) score += 58;
  if (/imgextra\/i\d\/\d+/.test(lower)) score += 42;
  if (/\.(?:jpe?g|webp)(?:[?#_].*)?$/i.test(lower)) score += 12;
  if (/\.(?:png)(?:[?#_].*)?$/i.test(lower)) score += 4;
  if (/qnaigc|600000000\d{4}/.test(lower)) score -= 35;
  if (/\/tfs\//.test(lower)) score -= 30;
  if (/tb1[a-z0-9]+/.test(lower) && !/item_pic|bao\/uploaded/.test(lower)) score -= 12;

  const text = `${title} ${sku}`.toLowerCase();
  if (category === "shoes" && /shoe|sneaker|boots?|loafer|鞋|靴/.test(text)) score += 8;
  if (category === "top" && /shirt|tee|hoodie|sweater|t恤|上衣|衬衫|卫衣|毛衣/.test(text)) score += 6;
  if (category === "bottom" && /pants|jeans|trousers|shorts|裤|裙/.test(text)) score += 6;
  if (category === "outerwear" && /coat|jacket|blazer|外套|夹克|大衣|羽绒/.test(text)) score += 6;
  return score;
}

async function tryDownloadCandidate(options: {
  candidate: RankedThumbnailCandidate;
  input: DownloadGarmentThumbnailInput;
  outputDir: string;
  publicBasePath: string;
  fetcher: typeof fetch;
}): Promise<DownloadedThumbnail | null> {
  const maxBytes = Math.max(1, options.input.maxBytes ?? DEFAULT_MAX_THUMBNAIL_BYTES);
  const timeoutMs = Math.max(1, options.input.timeoutMs ?? DEFAULT_DOWNLOAD_TIMEOUT_MS);
  const urlCheck = validateDownloadUrl(options.candidate.url, options.input.allowedHostSuffixes);
  if (!urlCheck.ok) {
    recordDownloadFailure(options.input, options.candidate.url, urlCheck.reason);
    return null;
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), timeoutMs);
  try {
    const response = await fetchWithValidatedRedirects({
      url: options.candidate.url,
      input: options.input,
      fetcher: options.fetcher,
      signal: abortController.signal
    });
    if (!response) return null;
    if (!response.ok) {
      await cancelResponseBody(response);
      recordDownloadFailure(options.input, options.candidate.url, "http_error", String(response.status));
      return null;
    }
    const contentType = response.headers.get("content-type") || "";
    if (contentType && !/^image\//i.test(contentType)) {
      await cancelResponseBody(response);
      recordDownloadFailure(options.input, options.candidate.url, "content_type", contentType);
      return null;
    }

    const contentLength = parseContentLength(response.headers.get("content-length"));
    if (contentLength !== null && contentLength > maxBytes) {
      await cancelResponseBody(response);
      recordDownloadFailure(options.input, options.candidate.url, "content_length_exceeded", String(contentLength));
      return null;
    }

    const bytes = await readResponseBody(response, maxBytes);
    const sanitized = await sanitizeDownloadedThumbnail(bytes, options.input.category, maxBytes);
    if (!sanitized) {
      recordDownloadFailure(options.input, options.candidate.url, "invalid_image");
      return null;
    }

    const fileName = localThumbnailFileName(options.input, sanitized.imageInfo);
    const filePath = join(options.outputDir, fileName);
    await writeFile(filePath, sanitized.bytes);
    return {
      sourceUrl: options.candidate.url,
      localUrl: `${options.publicBasePath.replace(/\/$/, "")}/${fileName}`,
      filePath,
      imageInfo: sanitized.imageInfo
    };
  } catch (error) {
    if (error instanceof ThumbnailDownloadError) {
      recordDownloadFailure(options.input, options.candidate.url, error.reason);
    } else if ((error as Error).name === "AbortError") {
      recordDownloadFailure(options.input, options.candidate.url, "timeout");
    } else {
      recordDownloadFailure(options.input, options.candidate.url, "fetch_error", error instanceof Error ? error.message : undefined);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function validateDownloadUrl(value: string, allowedHostSuffixes = DEFAULT_ALLOWED_IMAGE_HOST_SUFFIXES): { ok: true } | { ok: false; reason: ThumbnailDownloadFailureReason } {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { ok: false, reason: "invalid_url" };
  }
  if (isBlockedAddressHost(parsed.hostname)) {
    return { ok: false, reason: "blocked_address" };
  }
  if (!isAllowedImageHost(parsed.hostname, allowedHostSuffixes)) {
    return { ok: false, reason: "blocked_host" };
  }
  return { ok: true };
}

async function fetchWithValidatedRedirects(options: {
  url: string;
  input: DownloadGarmentThumbnailInput;
  fetcher: typeof fetch;
  signal: AbortSignal;
}): Promise<Response | null> {
  let currentUrl = options.url;
  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    const response = await options.fetcher(currentUrl, {
      headers: {
        "user-agent": "Mozilla/5.0 Outfit local thumbnail fetcher",
        "accept": "image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8"
      },
      redirect: "manual",
      signal: options.signal
    });
    const location = response.headers.get("location");
    if (!isRedirectStatus(response.status) || !location) {
      return response;
    }
    const redirectUrl = resolveRedirectUrl(location, currentUrl);
    if (!redirectUrl) {
      recordDownloadFailure(options.input, options.url, "invalid_url", location);
      return null;
    }
    const urlCheck = validateDownloadUrl(redirectUrl, options.input.allowedHostSuffixes);
    if (!urlCheck.ok) {
      recordDownloadFailure(options.input, options.url, urlCheck.reason, redirectUrl);
      return null;
    }
    currentUrl = redirectUrl;
  }
  recordDownloadFailure(options.input, options.url, "http_error", "too_many_redirects");
  return null;
}

function isRedirectStatus(status: number): boolean {
  return status >= 300 && status < 400;
}

function resolveRedirectUrl(location: string, baseUrl: string): string | null {
  try {
    return new URL(location, baseUrl).toString();
  } catch {
    return null;
  }
}

function isAllowedImageHost(hostname: string, allowedHostSuffixes: string[]): boolean {
  const normalized = normalizeHostname(hostname);
  return allowedHostSuffixes.some((suffix) => {
    const cleaned = suffix.toLowerCase();
    const withoutWildcard = cleaned.startsWith("*.") ? cleaned.slice(1) : cleaned;
    if (withoutWildcard.startsWith(".")) {
      return normalized.endsWith(withoutWildcard) && normalized.length > withoutWildcard.length;
    }
    return normalized === withoutWildcard || normalized.endsWith(`.${withoutWildcard}`);
  });
}

function isBlockedAddressHost(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  if (!normalized || normalized === "localhost" || normalized.endsWith(".localhost")) return true;
  const ipVersion = isIP(normalized);
  if (ipVersion === 4) return isBlockedIpv4(normalized);
  if (ipVersion === 6) return isBlockedIpv6(normalized);
  return false;
}

function isBlockedIpv4(value: string): boolean {
  const parts = value.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

function isBlockedIpv6(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd")
  );
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
}

function parseContentLength(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

async function readResponseBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new ThumbnailDownloadError("size_limit_exceeded");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function cancelResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // The response may already be closed by the fetch implementation.
  }
}

async function sanitizeDownloadedThumbnail(
  bytes: Uint8Array,
  category: GarmentCategory,
  maxBytes: number
): Promise<{ bytes: Buffer; imageInfo: ImageInfo } | null> {
  try {
    const input = Buffer.from(bytes);
    const metadata = await sharp(input, {
      failOn: "error",
      limitInputPixels: MAX_THUMBNAIL_IMAGE_PIXELS,
      sequentialRead: true
    }).metadata();
    if (
      !metadata.format ||
      !["jpeg", "png", "webp"].includes(metadata.format) ||
      !metadata.width ||
      !metadata.height ||
      (metadata.pages ?? 1) !== 1
    ) {
      return null;
    }

    const { data, info } = await sharp(input, {
      failOn: "error",
      limitInputPixels: MAX_THUMBNAIL_IMAGE_PIXELS,
      sequentialRead: true
    })
      .rotate()
      .webp({ quality: 88, effort: 4, smartSubsample: true })
      .toBuffer({ resolveWithObject: true });
    const imageInfo: ImageInfo = {
      format: "webp",
      width: info.width,
      height: info.height
    };
    if (!isCategoryCompatibleImage(imageInfo, category)) return null;
    if (data.byteLength > maxBytes) {
      throw new ThumbnailDownloadError("size_limit_exceeded");
    }
    return { bytes: data, imageInfo };
  } catch (error) {
    if (error instanceof ThumbnailDownloadError) throw error;
    return null;
  }
}

class ThumbnailDownloadError extends Error {
  reason: ThumbnailDownloadFailureReason;

  constructor(reason: ThumbnailDownloadFailureReason) {
    super(reason);
    this.reason = reason;
  }
}

function recordDownloadFailure(input: DownloadGarmentThumbnailInput, url: string, reason: ThumbnailDownloadFailureReason, detail?: string): void {
  input.onFailure?.({
    url,
    reason,
    ...(detail ? { detail } : {})
  });
}

function isCategoryCompatibleImage(info: ImageInfo, category: GarmentCategory): boolean {
  if (info.width < MIN_IMAGE_SIDE || info.height < MIN_IMAGE_SIDE) return false;
  const ratio = info.width / info.height;
  if (ratio > 3.4 || ratio < 0.25) return false;
  if (category === "shoes") return ratio >= 0.45 && ratio <= 3.2;
  if (category === "accessory") return ratio >= 0.3 && ratio <= 3.2;
  return ratio >= 0.35 && ratio <= 2.4;
}

function localThumbnailFileName(input: DownloadGarmentThumbnailInput, imageInfo: ImageInfo): string {
  const itemKey = sanitizePathPart(input.itemId || hash(input.title).slice(0, 12));
  return `garment-${input.garmentId}-${itemKey}.${imageInfo.format === "jpg" ? "jpg" : imageInfo.format}`;
}

function normalizeImageUrl(value: string): string {
  const cleaned = String(value || "").replace(/\\\//g, "/").trim();
  if (!cleaned) return "";
  if (cleaned.startsWith("//")) return `https:${cleaned}`;
  return cleaned;
}

function parseUrlSize(lowerUrl: string): { width: number; height: number } | null {
  const matches = [
    lowerUrl.match(/[-_](\d{1,5})x(\d{1,5})(?:[._?#-]|$)/),
    lowerUrl.match(/-(\d{1,5})-(\d{1,5})(?:[._?#-]|$)/),
    lowerUrl.match(/tps[-_/](\d{1,5})[-x_](\d{1,5})/)
  ];
  for (const match of matches) {
    if (!match) continue;
    return { width: Number(match[1]), height: Number(match[2]) };
  }
  return null;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function sanitizePathPart(value: string): string {
  return String(value || "").replace(/[^a-zA-Z0-9_-]+/g, "").slice(0, 48) || "unknown";
}

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[12] === 0x49 &&
    bytes[13] === 0x48 &&
    bytes[14] === 0x44 &&
    bytes[15] === 0x52;
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

function isWebp(bytes: Uint8Array): boolean {
  return bytes.length >= 30 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 4) === "WEBP";
}

function readJpegInfo(bytes: Uint8Array): ImageInfo | null {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    const length = readUInt16BE(bytes, offset + 2);
    if (length < 2) return null;
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      return {
        format: "jpg",
        height: readUInt16BE(bytes, offset + 5),
        width: readUInt16BE(bytes, offset + 7)
      };
    }
    offset += 2 + length;
  }
  return null;
}

function readWebpInfo(bytes: Uint8Array): ImageInfo | null {
  const chunk = ascii(bytes, 12, 4);
  if (chunk === "VP8X" && bytes.length >= 30) {
    return {
      format: "webp",
      width: 1 + readUInt24LE(bytes, 24),
      height: 1 + readUInt24LE(bytes, 27)
    };
  }
  if (chunk === "VP8 " && bytes.length >= 30) {
    return {
      format: "webp",
      width: readUInt16LE(bytes, 26) & 0x3fff,
      height: readUInt16LE(bytes, 28) & 0x3fff
    };
  }
  if (chunk === "VP8L" && bytes.length >= 25) {
    const b0 = bytes[21];
    const b1 = bytes[22];
    const b2 = bytes[23];
    const b3 = bytes[24];
    return {
      format: "webp",
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + ((b3 << 6) | (b2 >> 2) | ((b1 & 0xc0) << 6))
    };
  }
  return null;
}

function readUInt16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) + bytes[offset + 1];
}

function readUInt16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] + (bytes[offset + 1] << 8);
}

function readUInt24LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] + (bytes[offset + 1] << 8) + (bytes[offset + 2] << 16);
}

function readUInt32BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}
