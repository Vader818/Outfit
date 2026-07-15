import { createHash } from "node:crypto";
import type { AppDatabase } from "../db";
import { getGarmentById, listGarments } from "../db";
import { ApiError, ValidationError } from "../validation";
import type {
  Garment,
  GarmentCategory,
  GarmentSimilarityFeedback,
  GarmentSimilarityMatch,
  SimilarityFeedbackVerdict
} from "../../src/shared/types";

export type {
  GarmentSimilarityFeedback,
  GarmentSimilarityMatch,
  SimilarityFeedbackVerdict
} from "../../src/shared/types";

export const POSSIBLE_DUPLICATE_THRESHOLD = 75;
export const DEFAULT_CLIP_MODEL_ID = "Xenova/clip-vit-base-patch32";
const MAX_EMBEDDING_DIMENSIONS = 4096;

const COMPONENT_WEIGHTS = {
  color: 25,
  styles: 20,
  materials: 15,
  patterns: 15,
  brandName: 15,
  visual: 10
} as const;

export interface SimilarityComparable {
  category: GarmentCategory;
  color: string;
  styles: readonly string[];
  materials?: readonly string[];
  patterns?: readonly string[];
  brand: string;
  name: string;
}

export interface GarmentSimilarityScore {
  similarity: number;
  availableWeight: number;
  reasons: string[];
}

export interface CandidateFingerprintInput extends SimilarityComparable {
  productIdentity: string;
  sku: string;
}

export interface SimilarityFeedbackWrite {
  subjectKey: string;
  comparedGarmentId: number;
  verdict: SimilarityFeedbackVerdict;
}

interface SimilarityOptions {
  subjectEmbedding?: readonly number[];
  comparedEmbedding?: readonly number[];
}

interface ListSimilarityOptions {
  modelId?: string;
}

interface CandidateSimilarityOptions extends ListSimilarityOptions {
  subjectKey: string;
  subjectEmbedding?: readonly number[];
}

interface FeedbackOptions {
  now?: () => Date;
}

interface FeedbackRow {
  id: number;
  subject_key: string;
  compared_garment_id: number;
  verdict: SimilarityFeedbackVerdict;
  created_at: string;
  updated_at: string;
}

interface EmbeddingRow {
  garment_id: number;
  vector_blob: Uint8Array;
}

export interface GarmentEmbeddingCacheResult {
  modelId: string;
  garmentId: number;
  dimensions: number;
}

export function normalizeSimilarityText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/\s+/gu, " ")
    .trim();
}

export function calculateGarmentSimilarity(
  subject: SimilarityComparable,
  compared: SimilarityComparable,
  options: SimilarityOptions = {}
): GarmentSimilarityScore | null {
  const result = calculateGarmentSimilarityRaw(subject, compared, options);
  return result === null ? null : {
    ...result,
    similarity: roundOneDecimal(result.similarity)
  };
}

function calculateGarmentSimilarityRaw(
  subject: SimilarityComparable,
  compared: SimilarityComparable,
  options: SimilarityOptions = {}
): GarmentSimilarityScore | null {
  if (subject.category !== compared.category) return null;

  const weighted: Array<{ weight: number; score: number; reason: string }> = [];
  const subjectColor = normalizeSimilarityText(subject.color);
  const comparedColor = normalizeSimilarityText(compared.color);
  if (subjectColor && comparedColor) {
    const score = subjectColor === comparedColor ? 1 : 0;
    weighted.push({
      weight: COMPONENT_WEIGHTS.color,
      score,
      reason: score === 1
        ? `颜色一致：${subjectColor}`
        : `颜色不同：${subjectColor} / ${comparedColor}`
    });
  }

  addArrayComponent(weighted, "风格", subject.styles, compared.styles, COMPONENT_WEIGHTS.styles);
  addArrayComponent(weighted, "材质", subject.materials, compared.materials, COMPONENT_WEIGHTS.materials);
  addArrayComponent(weighted, "图案", subject.patterns, compared.patterns, COMPONENT_WEIGHTS.patterns);

  const brandNameScore = calculateBrandNameScore(subject, compared);
  if (brandNameScore !== null) {
    weighted.push({
      weight: COMPONENT_WEIGHTS.brandName,
      score: brandNameScore,
      reason: `品牌与名称相似度 ${formatPercent(brandNameScore)}`
    });
  }

  const visualScore = cosineSimilarity(options.subjectEmbedding, options.comparedEmbedding);
  if (visualScore !== null) {
    weighted.push({
      weight: COMPONENT_WEIGHTS.visual,
      score: visualScore,
      reason: `视觉向量相似度 ${formatPercent(visualScore)}`
    });
  }

  const availableWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  if (availableWeight === 0) {
    return { similarity: 0, availableWeight: 0, reasons: [] };
  }
  const weightedScore = weighted.reduce((sum, item) => sum + item.weight * item.score, 0);
  return {
    similarity: 100 * weightedScore / availableWeight,
    availableWeight,
    reasons: weighted.map((item) => item.reason)
  };
}

export function isPossibleDuplicate(similarity: number): boolean {
  return Number.isFinite(similarity) && similarity >= POSSIBLE_DUPLICATE_THRESHOLD;
}

export function normalizeGarmentEmbedding(vector: unknown): Float32Array {
  if (!Array.isArray(vector) || vector.length === 0 || vector.length > MAX_EMBEDDING_DIMENSIONS) {
    throw invalidEmbeddingError();
  }
  const values = vector.map((value) => typeof value === "number" ? value : Number.NaN);
  if (values.some((value) => !Number.isFinite(value))) throw invalidEmbeddingError();
  const norm = Math.hypot(...values);
  if (!Number.isFinite(norm) || norm <= 0) throw invalidEmbeddingError();

  const normalized = Float32Array.from(values, (value) => value / norm);
  const floatNorm = Math.hypot(...normalized);
  if (!Number.isFinite(floatNorm) || floatNorm <= 0) throw invalidEmbeddingError();
  for (let index = 0; index < normalized.length; index += 1) {
    normalized[index] = Math.fround(normalized[index] / floatNorm);
  }
  return normalized;
}

export function upsertGarmentEmbedding(
  db: AppDatabase,
  garmentId: number,
  vector: unknown,
  modelId = DEFAULT_CLIP_MODEL_ID
): GarmentEmbeddingCacheResult {
  assertPositiveInteger(garmentId, "garmentId");
  if (typeof modelId !== "string" || modelId.trim().length === 0 || modelId.trim().length > 200) {
    throw new ApiError("VISION_EMBEDDING_INVALID", "本地视觉向量的模型标识无效", 500);
  }
  const normalized = normalizeGarmentEmbedding(vector);
  db.prepare(`
    INSERT INTO garment_embeddings (
      model_id, garment_id, vector_blob, created_at, updated_at
    ) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(model_id, garment_id) DO UPDATE SET
      vector_blob = excluded.vector_blob,
      updated_at = CURRENT_TIMESTAMP
  `).run(modelId.trim(), garmentId, encodeFloat32Vector(normalized));
  return {
    modelId: modelId.trim(),
    garmentId,
    dimensions: normalized.length
  };
}

export function computeCandidateSubjectKey(input: CandidateFingerprintInput): string {
  const canonical = {
    version: 1,
    source: "taobao",
    productIdentity: normalizeSimilarityText(input.productIdentity),
    sku: normalizeSimilarityText(input.sku)
  };
  return `candidate:v1:${createHash("sha256").update(JSON.stringify(canonical), "utf8").digest("hex")}`;
}

export function canonicalizeGarmentFeedbackPair(
  garmentId: number,
  comparedGarmentId: number
): { subjectKey: string; comparedGarmentId: number } {
  assertPositiveInteger(garmentId, "garmentId");
  assertPositiveInteger(comparedGarmentId, "comparedGarmentId");
  if (garmentId === comparedGarmentId) {
    throw new ValidationError("不能对同一件衣物提交相似度反馈");
  }
  const subjectId = Math.min(garmentId, comparedGarmentId);
  return {
    subjectKey: `garment:${subjectId}`,
    comparedGarmentId: Math.max(garmentId, comparedGarmentId)
  };
}

export function listSimilarGarments(
  db: AppDatabase,
  garmentId: number,
  options: ListSimilarityOptions = {}
): GarmentSimilarityMatch[] {
  assertPositiveInteger(garmentId, "garmentId");
  const subject = getGarmentById(db, garmentId);
  const modelId = options.modelId ?? DEFAULT_CLIP_MODEL_ID;
  const embeddings = readEmbeddingCache(db, modelId);
  const hiddenPairs = readNotDuplicatePairs(db);
  return rankSimilarGarments(
    listGarments(db).filter((garment) => garment.id !== garmentId),
    subject,
    {
      subjectKeyFor: (comparedId) => canonicalizeGarmentFeedbackPair(garmentId, comparedId),
      hiddenPairs,
      subjectEmbedding: embeddings.get(garmentId),
      comparedEmbeddingFor: (comparedId) => embeddings.get(comparedId)
    }
  );
}

export function listCandidateSimilarGarments(
  db: AppDatabase,
  candidate: SimilarityComparable,
  options: CandidateSimilarityOptions
): GarmentSimilarityMatch[] {
  assertCandidateSubjectKey(options.subjectKey);
  const modelId = options.modelId ?? DEFAULT_CLIP_MODEL_ID;
  const embeddings = readEmbeddingCache(db, modelId);
  const hiddenPairs = readNotDuplicatePairs(db);
  return rankSimilarGarments(listGarments(db), candidate, {
    subjectKeyFor: (comparedId) => ({ subjectKey: options.subjectKey, comparedGarmentId: comparedId }),
    hiddenPairs,
    subjectEmbedding: options.subjectEmbedding,
    comparedEmbeddingFor: (comparedId) => embeddings.get(comparedId)
  });
}

export function upsertSimilarityFeedback(
  db: AppDatabase,
  input: SimilarityFeedbackWrite,
  options: FeedbackOptions = {}
): GarmentSimilarityFeedback {
  assertFeedbackWrite(input);
  assertFeedbackGarmentsExist(db, input);
  const timestamp = (options.now?.() ?? new Date()).toISOString();
  db.prepare(`
    INSERT INTO garment_similarity_feedback (
      subject_key, compared_garment_id, verdict, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(subject_key, compared_garment_id) DO UPDATE SET
      verdict = excluded.verdict,
      updated_at = excluded.updated_at
  `).run(input.subjectKey, input.comparedGarmentId, input.verdict, timestamp, timestamp);
  const row = db.prepare(`
    SELECT id, subject_key, compared_garment_id, verdict, created_at, updated_at
    FROM garment_similarity_feedback
    WHERE subject_key = ? AND compared_garment_id = ?
  `).get(input.subjectKey, input.comparedGarmentId) as unknown as FeedbackRow | undefined;
  if (!row) throw new Error("相似度反馈写入后无法读取");
  return mapFeedback(row);
}

function rankSimilarGarments(
  garments: Garment[],
  subject: SimilarityComparable,
  options: {
    subjectKeyFor: (comparedId: number) => { subjectKey: string; comparedGarmentId: number };
    hiddenPairs: ReadonlySet<string>;
    subjectEmbedding?: readonly number[];
    comparedEmbeddingFor: (comparedId: number) => readonly number[] | undefined;
  }
): GarmentSimilarityMatch[] {
  const matches: GarmentSimilarityMatch[] = [];
  for (const garment of garments) {
    const pair = options.subjectKeyFor(garment.id);
    if (options.hiddenPairs.has(feedbackPairKey(pair.subjectKey, pair.comparedGarmentId))) continue;
    const result = calculateGarmentSimilarityRaw(subject, garment, {
      subjectEmbedding: options.subjectEmbedding,
      comparedEmbedding: options.comparedEmbeddingFor(garment.id)
    });
    if (!result || !isPossibleDuplicate(result.similarity)) continue;
    matches.push({ garment, similarity: roundOneDecimal(result.similarity), reasons: result.reasons });
  }
  return matches.sort((left, right) =>
    right.similarity - left.similarity || left.garment.id - right.garment.id
  );
}

function addArrayComponent(
  target: Array<{ weight: number; score: number; reason: string }>,
  label: string,
  subjectValues: readonly string[] | undefined,
  comparedValues: readonly string[] | undefined,
  weight: number
): void {
  const subject = normalizeStringList(subjectValues);
  const compared = normalizeStringList(comparedValues);
  if (subject.length === 0 || compared.length === 0) return;
  const subjectSet = new Set(subject);
  const comparedSet = new Set(compared);
  const intersection = subject.filter((value) => comparedSet.has(value)).length;
  const union = new Set([...subjectSet, ...comparedSet]).size;
  target.push({
    weight,
    score: intersection / union,
    reason: `${label}重合 ${intersection}/${union}`
  });
}

function calculateBrandNameScore(
  subject: Pick<SimilarityComparable, "brand" | "name">,
  compared: Pick<SimilarityComparable, "brand" | "name">
): number | null {
  const subjectBrand = normalizeSimilarityText(subject.brand);
  const comparedBrand = normalizeSimilarityText(compared.brand);
  const subjectName = normalizeProductName(subject.name, subjectBrand);
  const comparedName = normalizeProductName(compared.name, comparedBrand);
  const nameScore = textDiceSimilarity(subjectName, comparedName);
  const hasNames = subjectName.length > 0 && comparedName.length > 0;
  const hasBrands = subjectBrand.length > 0 && comparedBrand.length > 0;
  if (!hasNames && !hasBrands) return null;
  if (!hasBrands) return hasNames ? nameScore : null;
  const brandScore = subjectBrand === comparedBrand ? 1 : 0;
  if (!hasNames) return brandScore;
  return brandScore * 0.4 + nameScore * 0.6;
}

function normalizeProductName(name: string, brand: string): string {
  let normalized = normalizeSimilarityText(name);
  if (brand && normalized.startsWith(`${brand} `)) normalized = normalized.slice(brand.length + 1);
  return normalized.replace(/[^\p{L}\p{N}]+/gu, "");
}

function textDiceSimilarity(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const leftNgrams = ngrams(left, 3);
  const rightNgrams = ngrams(right, 3);
  if (leftNgrams.length === 0 || rightNgrams.length === 0) return 0;
  const remaining = new Map<string, number>();
  for (const value of rightNgrams) remaining.set(value, (remaining.get(value) ?? 0) + 1);
  let intersection = 0;
  for (const value of leftNgrams) {
    const count = remaining.get(value) ?? 0;
    if (count <= 0) continue;
    intersection += 1;
    remaining.set(value, count - 1);
  }
  return 2 * intersection / (leftNgrams.length + rightNgrams.length);
}

function ngrams(value: string, size: number): string[] {
  if (value.length < size) return [value];
  return Array.from({ length: value.length - size + 1 }, (_, index) => value.slice(index, index + size));
}

function cosineSimilarity(
  left: readonly number[] | undefined,
  right: readonly number[] | undefined
): number | null {
  if (!left || !right || left.length === 0 || left.length !== right.length) return null;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index];
    const rightValue = right[index];
    if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) return null;
    dot += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }
  if (leftNorm === 0 || rightNorm === 0) return null;
  return Math.max(0, Math.min(1, dot / Math.sqrt(leftNorm * rightNorm)));
}

function normalizeStringList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map(normalizeSimilarityText).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "en"));
}

function readEmbeddingCache(db: AppDatabase, modelId: string): Map<number, number[]> {
  try {
    const rows = db.prepare(`
      SELECT garment_id, vector_blob
      FROM garment_embeddings
      WHERE model_id = ?
      ORDER BY garment_id ASC
    `).all(modelId) as unknown as EmbeddingRow[];
    return new Map(rows.flatMap((row) => {
      const vector = decodeFloat32Vector(row.vector_blob);
      return vector ? [[row.garment_id, vector] as const] : [];
    }));
  } catch (error) {
    if (isMissingTableError(error, "garment_embeddings")) return new Map();
    throw error;
  }
}

function decodeFloat32Vector(blob: Uint8Array): number[] | null {
  if (!(blob instanceof Uint8Array) || blob.byteLength === 0 || blob.byteLength % 4 !== 0) return null;
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  const vector: number[] = [];
  for (let offset = 0; offset < blob.byteLength; offset += 4) {
    const value = view.getFloat32(offset, true);
    if (!Number.isFinite(value)) return null;
    vector.push(value);
  }
  return vector;
}

function encodeFloat32Vector(vector: Float32Array): Buffer {
  const blob = Buffer.alloc(vector.length * Float32Array.BYTES_PER_ELEMENT);
  for (let index = 0; index < vector.length; index += 1) {
    blob.writeFloatLE(vector[index], index * Float32Array.BYTES_PER_ELEMENT);
  }
  return blob;
}

function invalidEmbeddingError(): ApiError {
  return new ApiError(
    "VISION_EMBEDDING_INVALID",
    "本地视觉模型返回了无效的图片向量",
    500
  );
}

function readNotDuplicatePairs(db: AppDatabase): Set<string> {
  try {
    const rows = db.prepare(`
      SELECT subject_key, compared_garment_id
      FROM garment_similarity_feedback
      WHERE verdict = 'not-duplicate'
      ORDER BY subject_key ASC, compared_garment_id ASC
    `).all() as unknown as Array<{ subject_key: string; compared_garment_id: number }>;
    return new Set(rows.map((row) => feedbackPairKey(row.subject_key, row.compared_garment_id)));
  } catch (error) {
    if (isMissingTableError(error, "garment_similarity_feedback")) return new Set();
    throw error;
  }
}

function assertFeedbackWrite(input: SimilarityFeedbackWrite): void {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ValidationError("相似度反馈必须是 JSON 对象");
  }
  assertPositiveInteger(input.comparedGarmentId, "comparedGarmentId");
  if (input.verdict !== "duplicate" && input.verdict !== "not-duplicate") {
    throw new ValidationError("verdict 必须是 duplicate 或 not-duplicate");
  }
  if (/^candidate:v1:[a-f0-9]{64}$/.test(input.subjectKey)) return;
  const garmentMatch = /^garment:([1-9]\d*)$/.exec(input.subjectKey);
  if (!garmentMatch) throw new ValidationError("subjectKey 格式无效");
  const subjectId = Number(garmentMatch[1]);
  if (!Number.isSafeInteger(subjectId) || subjectId >= input.comparedGarmentId) {
    throw new ValidationError("衣物相似度反馈必须使用规范化的对称配对");
  }
}

function assertCandidateSubjectKey(value: string): void {
  if (!/^candidate:v1:[a-f0-9]{64}$/.test(value)) {
    throw new ValidationError("候选指纹格式无效");
  }
}

function assertFeedbackGarmentsExist(db: AppDatabase, input: SimilarityFeedbackWrite): void {
  const compared = db.prepare("SELECT id FROM garments WHERE id = ?").get(input.comparedGarmentId);
  if (!compared) throw new ApiError("NOT_FOUND", "被比较衣物不存在", 404);
  const garmentMatch = /^garment:([1-9]\d*)$/.exec(input.subjectKey);
  if (garmentMatch && !db.prepare("SELECT id FROM garments WHERE id = ?").get(Number(garmentMatch[1]))) {
    throw new ApiError("NOT_FOUND", "主题衣物不存在", 404);
  }
}

function mapFeedback(row: FeedbackRow): GarmentSimilarityFeedback {
  return {
    id: row.id,
    subjectKey: row.subject_key,
    comparedGarmentId: row.compared_garment_id,
    verdict: row.verdict,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ValidationError(`${field} 必须是正整数`);
  }
}

function feedbackPairKey(subjectKey: string, comparedGarmentId: number): string {
  return `${subjectKey}\u0000${comparedGarmentId}`;
}

function isMissingTableError(error: unknown, table: string): boolean {
  return error instanceof Error && error.message.includes(`no such table: ${table}`);
}

function formatPercent(score: number): string {
  return `${roundOneDecimal(score * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
}

function roundOneDecimal(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}
