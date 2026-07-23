import type { AppDatabase } from "../db";
import { listGarments } from "../db";
import { ValidationError } from "../validation";
import type {
  Formality,
  Garment,
  GarmentCategory,
  GarmentSimilarityMatch,
  GarmentWarmth,
  CoverageDelta,
  PurchaseCheckResult,
  PurchaseCheckVerdict,
  SavedOutfit,
  Season,
  TaobaoCapturedBatch,
  TaobaoImportPreviewItem
} from "../../src/shared/types";
import {
  normalizeTaobaoBatch,
  previewTaobaoImport,
  type SourceOrderItemDraft
} from "./importTaobao";
import {
  computeCandidateSubjectKey,
  listCandidateSimilarGarments,
  normalizeSimilarityText
} from "./garmentSimilarity";
import { listSavedOutfits } from "./savedOutfits";

export type {
  CoverageDelta,
  PurchaseCheckResult,
  PurchaseCheckVerdict
} from "../../src/shared/types";

const PURCHASE_CHECK_FIELDS = new Set(["batch", "sourceItemKey"]);
const BATCH_FIELDS = new Set(["source", "pageType", "capturedAt", "pageUrl", "items"]);
const ITEM_FIELDS = new Set([
  "pageType",
  "itemId",
  "orderId",
  "orderTime",
  "title",
  "sku",
  "quantity",
  "payment",
  "status",
  "refundText",
  "itemUrl",
  "imageUrl",
  "rawText",
  "detailUrl",
  "detailTitle",
  "detailProps",
  "detailDescription",
  "detailImages",
  "detailRawText"
]);
const DETAIL_PROP_FIELDS = new Set(["name", "value"]);
const MAX_SOURCE_ITEM_KEY_LENGTH = 256;

const CATEGORY_TARGETS: Readonly<Record<GarmentCategory, number>> = {
  top: 3,
  bottom: 2,
  dress: 1,
  outerwear: 2,
  shoes: 3,
  accessory: 2
};
const SEASON_TARGET = 2;
const OCCASION_TARGET = 2;
const SEASON_ORDER: readonly Season[] = ["spring", "summer", "autumn", "winter"];
const FORMALITY_ORDER: readonly Formality[] = ["casual", "smart-casual", "formal", "sport"];
const FORMALITY_RANK: Readonly<Record<Formality, number>> = {
  sport: 0,
  casual: 1,
  "smart-casual": 2,
  formal: 3
};
const WARMTH_VALUE: Readonly<Record<GarmentWarmth, number>> = {
  light: 0,
  medium: 1,
  warm: 2,
  heavy: 3
};
const MISSING_COLORS = new Set(["", "unknown"]);
const NEUTRALS = new Set(["black", "white", "gray", "beige", "brown", "blue", "navy"]);
const CLASHING_ACCENTS = new Set([
  "green:red",
  "green:yellow",
  "purple:yellow",
  "red:green",
  "yellow:green",
  "yellow:purple"
]);

export interface PurchaseCheckInput {
  batch: TaobaoCapturedBatch;
  sourceItemKey: string;
}

export interface ResolvedTaobaoPurchaseCandidate {
  candidate: TaobaoImportPreviewItem;
  sourceItem: SourceOrderItemDraft;
  subjectKey: string;
}

export function resolveTaobaoPurchaseCandidate(payload: unknown): ResolvedTaobaoPurchaseCandidate {
  const input = validatePurchaseCheckInput(payload);
  const normalized = normalizeTaobaoBatch(input.batch);
  const preview = previewTaobaoImport(input.batch);
  const candidates = preview.candidates.filter((candidate) => candidate.sourceItemKey === input.sourceItemKey);
  const sourceItems = normalized.sourceItems.filter((item) => item.externalKey === input.sourceItemKey);
  if (
    candidates.length !== 1
    || sourceItems.length !== 1
    || sourceItems[0].isRefunded
    || !sourceItems[0].isApparel
  ) {
    throw new ValidationError("sourceItemKey 必须唯一命中一个未退款服饰候选");
  }
  const candidate = candidates[0];
  const sourceItem = sourceItems[0];
  return {
    candidate,
    sourceItem,
    subjectKey: computeCandidateSubjectKey({
      productIdentity: productIdentity(sourceItem),
      sku: sourceItem.sku,
      category: candidate.category,
      color: candidate.color,
      styles: candidate.styles,
      materials: candidate.materials,
      patterns: candidate.patterns,
      brand: candidate.brand,
      name: candidate.name
    })
  };
}

export function checkTaobaoPurchaseCandidate(
  db: AppDatabase,
  payload: unknown
): PurchaseCheckResult {
  const resolved = resolveTaobaoPurchaseCandidate(payload);
  const possibleDuplicates = listCandidateSimilarGarments(db, resolved.candidate, {
    subjectKey: resolved.subjectKey
  });
  const activeGarments = listGarments(db);
  const worksWith = listCompatibleSavedOutfits(db, resolved.candidate, activeGarments);
  const coverageDelta = calculateCoverageDelta(resolved.candidate, activeGarments, worksWith.length);
  const fillsGap = coverageDelta.categories.length > 0
    || coverageDelta.seasons.length > 0
    || coverageDelta.occasions.length > 0;
  const verdict = decidePurchaseVerdict(possibleDuplicates.length > 0, fillsGap);
  return {
    subjectKey: resolved.subjectKey,
    verdict,
    possibleDuplicates,
    worksWith,
    coverageDelta,
    explanation: buildExplanation(possibleDuplicates, coverageDelta)
  };
}

export function decidePurchaseVerdict(hasDuplicate: boolean, fillsGap: boolean): PurchaseCheckVerdict {
  if (hasDuplicate && fillsGap) return "mixed";
  if (hasDuplicate) return "likely-duplicate";
  if (fillsGap) return "fills-gap";
  return "insufficient-data";
}

export function calculateCoverageDelta(
  candidate: Pick<TaobaoImportPreviewItem, "category" | "seasons" | "formality">,
  activeGarments: readonly Garment[],
  compatibleOutfitCount: number
): CoverageDelta {
  const categoryCount = activeGarments.filter((garment) => garment.category === candidate.category).length;
  const categories = categoryCount < CATEGORY_TARGETS[candidate.category] ? [candidate.category] : [];
  const candidateSeasons = new Set(candidate.seasons);
  const seasons = SEASON_ORDER.filter((season) =>
    candidateSeasons.has(season)
    && activeGarments.filter((garment) => garment.seasons.includes(season)).length < SEASON_TARGET
  );
  const formalityCount = activeGarments.filter((garment) => garment.formality === candidate.formality).length;
  const occasions = FORMALITY_ORDER.filter((formality) =>
    formality === candidate.formality && formalityCount < OCCASION_TARGET
  );
  return { categories, seasons, occasions, compatibleOutfitCount };
}

function validatePurchaseCheckInput(payload: unknown): PurchaseCheckInput {
  const record = requireRecord(payload, "购买检查内容");
  assertExactKeys(record, PURCHASE_CHECK_FIELDS, "");
  const batch = requireRecord(record.batch, "batch");
  assertExactKeys(batch, BATCH_FIELDS, "batch");
  if (Array.isArray(batch.items)) {
    batch.items.forEach((value, index) => {
      const item = requireRecord(value, `batch.items[${index}]`);
      assertExactKeys(item, ITEM_FIELDS, `batch.items[${index}]`);
      if (Array.isArray(item.detailProps)) {
        item.detailProps.forEach((prop, propIndex) => {
          const detailProp = requireRecord(prop, `batch.items[${index}].detailProps[${propIndex}]`);
          assertExactKeys(detailProp, DETAIL_PROP_FIELDS, `batch.items[${index}].detailProps[${propIndex}]`);
        });
      }
    });
  }
  if (typeof record.sourceItemKey !== "string" || !record.sourceItemKey.trim()) {
    throw new ValidationError("sourceItemKey 必须是非空字符串");
  }
  if (record.sourceItemKey.length > MAX_SOURCE_ITEM_KEY_LENGTH) {
    throw new ValidationError(`sourceItemKey 不能超过 ${MAX_SOURCE_ITEM_KEY_LENGTH} 个字符`);
  }
  return {
    batch: batch as unknown as TaobaoCapturedBatch,
    sourceItemKey: record.sourceItemKey
  };
}

function listCompatibleSavedOutfits(
  db: AppDatabase,
  candidate: TaobaoImportPreviewItem,
  activeGarments: readonly Garment[]
): SavedOutfit[] {
  const garmentById = new Map(activeGarments.map((garment) => [garment.id, garment]));
  return listSavedOutfits(db).filter((outfit) => {
    const items = outfit.items.map((item) => item.garmentId === undefined
      ? undefined
      : garmentById.get(item.garmentId));
    if (items.some((item) => item === undefined)) return false;
    const liveItems = items as Garment[];
    const replacementIndex = replacementSlotIndex(candidate.category, liveItems);
    if (replacementIndex === null) return false;
    const companions = liveItems.filter((_, index) => index !== replacementIndex);
    return companions.length > 0 && isCompatibleWithAll(candidate, companions);
  });
}

function replacementSlotIndex(category: GarmentCategory, items: readonly Garment[]): number | null {
  const sameCategory = items.findIndex((item) => item.category === category);
  const hasTop = items.some((item) => item.category === "top");
  const hasBottom = items.some((item) => item.category === "bottom");
  const hasDress = items.some((item) => item.category === "dress");
  if (category === "top") return sameCategory >= 0 && hasBottom && !hasDress ? sameCategory : null;
  if (category === "bottom") return sameCategory >= 0 && hasTop && !hasDress ? sameCategory : null;
  if (category === "dress") return sameCategory >= 0 && !hasTop && !hasBottom ? sameCategory : null;
  return sameCategory >= 0 ? sameCategory : -1;
}

function isCompatibleWithAll(candidate: TaobaoImportPreviewItem, companions: readonly Garment[]): boolean {
  let weightedScore = 0;
  let totalWeight = 0;
  for (const companion of companions) {
    const colorScore = colorPairScore(candidate.color, companion.color);
    const formalityDistance = Math.abs(
      FORMALITY_RANK[candidate.formality] - FORMALITY_RANK[companion.formality]
    );
    if (colorScore <= -8 || formalityDistance >= 3) return false;
    const weight = pairWeight(candidate.category, companion.category);
    weightedScore += weight * pairScore(candidate, companion);
    totalWeight += weight;
  }
  return totalWeight > 0 && weightedScore / totalWeight >= 0;
}

function pairScore(
  left: Pick<TaobaoImportPreviewItem, "color" | "styles" | "formality" | "seasons" | "warmth">,
  right: Pick<Garment, "color" | "styles" | "formality" | "seasons" | "warmth">
): number {
  let score = colorPairScore(left.color, right.color);
  const rightStyles = new Set(right.styles.map(normalizeSimilarityText));
  if (left.styles.map(normalizeSimilarityText).some((style) => rightStyles.has(style))) score += 3;
  const formalityDistance = Math.abs(FORMALITY_RANK[left.formality] - FORMALITY_RANK[right.formality]);
  if (formalityDistance === 0) score += 2;
  if (formalityDistance >= 2) score -= 5;
  if (left.seasons.some((season) => right.seasons.includes(season))) score += 2;
  if (Math.abs(WARMTH_VALUE[left.warmth] - WARMTH_VALUE[right.warmth]) >= 3) score -= 4;
  return score;
}

function colorPairScore(leftValue: string, rightValue: string): number {
  const left = normalizeSimilarityText(leftValue);
  const right = normalizeSimilarityText(rightValue);
  if (MISSING_COLORS.has(left) || MISSING_COLORS.has(right)) return 0;
  const leftNeutral = NEUTRALS.has(left);
  const rightNeutral = NEUTRALS.has(right);
  if (leftNeutral && rightNeutral) return 4;
  if (leftNeutral || rightNeutral) return 2;
  if (left === right) return 1;
  return CLASHING_ACCENTS.has(`${left}:${right}`) ? -8 : -2;
}

function pairWeight(left: GarmentCategory, right: GarmentCategory): number {
  const pair = `${left}:${right}`;
  const reverse = `${right}:${left}`;
  const weights: Readonly<Record<string, number>> = {
    "top:bottom": 1.25,
    "top:outerwear": 1,
    "top:shoes": 0.65,
    "dress:outerwear": 0.9,
    "dress:shoes": 1.25,
    "bottom:shoes": 1,
    "outerwear:shoes": 0.5
  };
  return weights[pair] ?? weights[reverse] ?? 0.25;
}

function buildExplanation(
  possibleDuplicates: readonly GarmentSimilarityMatch[],
  coverageDelta: CoverageDelta
): string[] {
  const explanation = possibleDuplicates.length > 0
    ? [`发现 ${possibleDuplicates.length} 件可能重复或高度相似的衣物。`]
    : ["未发现达到阈值的相似衣物。"];
  if (coverageDelta.compatibleOutfitCount > 0) {
    explanation.push(`可与 ${coverageDelta.compatibleOutfitCount} 套已保存搭配协同使用。`);
  } else {
    explanation.push("暂未找到可直接协同使用的已保存搭配。");
  }
  const gaps = [
    ...coverageDelta.categories.map((value) => `类别:${value}`),
    ...coverageDelta.seasons.map((value) => `季节:${value}`),
    ...coverageDelta.occasions.map((value) => `场合:${value}`)
  ];
  explanation.push(gaps.length > 0
    ? `可补充以下衣橱缺口：${gaps.join("、")}。`
    : "未识别到明确的衣橱覆盖缺口。");
  return explanation;
}

function productIdentity(item: SourceOrderItemDraft): string {
  const itemId = normalizeSimilarityText(item.itemId);
  if (itemId) return `item:${itemId}`;
  for (const value of [item.detailUrl, item.itemUrl]) {
    const canonical = canonicalProductUrl(value);
    if (canonical) return `url:${canonical}`;
  }
  return `semantic:${normalizeSimilarityText([item.detailTitle, item.title, item.sku].filter(Boolean).join(" "))}`;
}

function canonicalProductUrl(value: string): string {
  if (!value) return "";
  try {
    const parsed = new URL(value.startsWith("//") ? `https:${value}` : value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    const id = parsed.searchParams.get("id");
    return `${parsed.hostname.toLocaleLowerCase("en-US")}${parsed.pathname}${id ? `?id=${id}` : ""}`;
  } catch {
    return "";
  }
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError(`${path} 必须是 JSON 对象`);
  }
  return value as Record<string, unknown>;
}

function assertExactKeys(record: Record<string, unknown>, allowed: ReadonlySet<string>, path: string): void {
  const unknown = Object.keys(record).filter((key) => !allowed.has(key)).sort();
  if (unknown.length === 0) return;
  const qualified = unknown.map((key) => path ? `${path}.${key}` : key);
  throw new ValidationError(`未知字段：${qualified.join(", ")}`);
}
