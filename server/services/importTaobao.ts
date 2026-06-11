import { createHash } from "node:crypto";
import type { Garment, TaobaoCapturedBatch, TaobaoCapturedItem, TaobaoDetailProp, TaobaoPageType } from "../../src/shared/types";
import { classifyGarment } from "./classify";

export interface SourceOrderItemDraft {
  externalKey: string;
  source: string;
  pageType: TaobaoPageType;
  itemId: string;
  orderId: string;
  orderTime: string;
  title: string;
  sku: string;
  quantity: number;
  payment: number | null;
  status: string;
  refundText: string;
  itemUrl: string;
  imageUrl: string;
  rawText: string;
  detailUrl: string;
  detailTitle: string;
  detailProps: TaobaoDetailProp[];
  detailDescription: string;
  detailImages: string[];
  detailRawText: string;
  isRefunded: boolean;
  isApparel: boolean;
}

export interface NormalizedTaobaoBatch {
  batchId: string;
  capturedAt: string;
  pageUrl: string;
  sourceItems: SourceOrderItemDraft[];
  garmentDrafts: Omit<Garment, "id">[];
  summary: {
    totalItems: number;
    uniqueItems: number;
    skippedRefunded: number;
    skippedNonApparel: number;
    createdGarments: number;
  };
}

const REFUND_PATTERN = /退款成功|退货退款|交易关闭|已退款|售后成功|退款退货成功|订单关闭/i;
const GENERIC_DETAIL_TITLE_PATTERN = /^(宝贝描述|商品详情|图文详情|参数|参数信息|尺码|尺码信息|详情|描述)$/i;
const PRODUCT_TITLE_PATTERNS = [
  /([A-Za-z][A-Za-z0-9._ -]{0,40}\/[^¥￥]{8,160}?)\s+(?:已售|多人评价|回头客|券后|优惠前|官方立减|预计|快递|颜色|尺码)/gi,
  /([\u4e00-\u9fffA-Za-z0-9/·._ -]{12,160}?(?:T恤|t恤|tee|上衣|短袖|长袖|衬衫|外套|裤|鞋|裙|连衣裙|卫衣|毛衣|针织|背心|吊带|靴|包|帽|围巾)[\u4e00-\u9fffA-Za-z0-9/·._ -]{0,60}?)\s+(?:已售|多人评价|回头客|券后|优惠前|官方立减|预计|快递|颜色|尺码)/gi
];

export function normalizeTaobaoBatch(payload: unknown): NormalizedTaobaoBatch {
  const batch = assertBatch(payload);
  const capturedAt = batch.capturedAt || new Date().toISOString();
  const source = batch.source || "taobao-bookmarklet";
  const pageType = batch.pageType || guessPageType(batch.pageUrl || "");
  const pageUrl = batch.pageUrl || "";
  const merged = new Map<string, SourceOrderItemDraft>();
  const sourceItems: SourceOrderItemDraft[] = [];
  const garmentDrafts: Omit<Garment, "id">[] = [];
  let skippedRefunded = 0;
  let skippedNonApparel = 0;

  for (const item of batch.items || []) {
    const sourceItem = normalizeItem(item, source, pageType, pageUrl);
    if (shouldSkipSourceItem(sourceItem)) continue;
    if (sourceItem.pageType === "item-detail" && sourceItem.itemId && !sourceItem.sku) {
      const matches = Array.from(merged.entries()).filter(([, existing]) => existing.itemId === sourceItem.itemId);
      if (matches.length) {
        for (const [key, existing] of matches) {
          merged.set(key, mergeSourceItems(existing, sourceItem));
        }
        continue;
      }
    }
    const pendingDetailKey = sourceItem.itemId && sourceItem.sku ? stableKey({ itemId: sourceItem.itemId }) : "";
    const pendingDetail = pendingDetailKey ? merged.get(pendingDetailKey) : undefined;
    if (pendingDetail?.pageType === "item-detail") {
      merged.delete(pendingDetailKey);
      merged.set(sourceItem.externalKey, mergeSourceItems(sourceItem, pendingDetail));
      continue;
    }
    const previous = merged.get(sourceItem.externalKey);
    merged.set(sourceItem.externalKey, previous ? mergeSourceItems(previous, sourceItem) : sourceItem);
  }

  for (const sourceItem of merged.values()) {
    const statusText = `${sourceItem.status} ${sourceItem.refundText} ${sourceItem.rawText}`;
    sourceItem.isRefunded = REFUND_PATTERN.test(statusText);
    const classification = classifyGarment(displayTitle(sourceItem), classificationContext(sourceItem));
    sourceItem.isApparel = Boolean(classification);
    sourceItems.push(sourceItem);
    if (sourceItem.isRefunded) {
      skippedRefunded += 1;
      continue;
    }
    if (!classification) {
      skippedNonApparel += 1;
      continue;
    }

    garmentDrafts.push({
      sourceOrderItemId: undefined,
      name: displayTitle(sourceItem),
      category: classification.category,
      color: classification.color,
      warmth: classification.warmth,
      seasons: classification.seasons,
      styles: classification.styles,
      formality: classification.formality,
      imageUrl: preferredImage(sourceItem),
      owned: true,
      confirmed: false,
      excluded: false,
      confidence: classification.confidence,
      notes: ""
    });
  }

  return {
    batchId: hash(`${source}|${capturedAt}|${pageUrl}|${sourceItems.map((item) => item.externalKey).join(",")}`),
    capturedAt,
    pageUrl,
    sourceItems,
    garmentDrafts,
    summary: {
      totalItems: batch.items?.length || 0,
      uniqueItems: sourceItems.length,
      skippedRefunded,
      skippedNonApparel,
      createdGarments: garmentDrafts.length
    }
  };
}

function assertBatch(payload: unknown): TaobaoCapturedBatch {
  if (!payload || typeof payload !== "object") {
    throw new Error("导入内容必须是 JSON 对象");
  }
  const batch = payload as TaobaoCapturedBatch;
  if (!Array.isArray(batch.items)) {
    throw new Error("导入内容缺少 items 数组");
  }
  return batch;
}

function stableKey(item: TaobaoCapturedItem): string {
  const itemId = cleanText(item.itemId || extractItemId(item.itemUrl) || extractItemId(item.detailUrl) || "");
  const sku = cleanText(item.sku || "");
  if (itemId && sku) return hash(`item:${itemId}|sku:${sku}`);
  if (itemId) return hash(`item:${itemId}`);
  return hash([item.orderId || "", item.orderTime || "", item.itemUrl || item.detailUrl || "", item.title || item.detailTitle || "", item.sku || ""].join("|"));
}

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function cleanText(value: string): string {
  return String(value).replace(/\s+/g, " ").trim();
}

function normalizeItem(item: TaobaoCapturedItem, source: string, batchPageType: TaobaoPageType, pageUrl: string): SourceOrderItemDraft {
  const pageType = item.pageType || batchPageType || guessPageType(pageUrl);
  const itemUrl = cleanText(item.itemUrl || "");
  const detailUrl = cleanText(item.detailUrl || (pageType === "item-detail" ? itemUrl || pageUrl : ""));
  const itemId = cleanText(item.itemId || extractItemId(itemUrl) || extractItemId(detailUrl) || "");
  const detailTitle = cleanText(item.detailTitle || "");
  const title = cleanText(item.title || detailTitle);
  const detailImages = normalizeStringList(item.detailImages);
  const imageUrl = cleanText(item.imageUrl || "");

  return {
    externalKey: stableKey({ ...item, itemId, itemUrl, detailUrl, title }),
    source,
    pageType,
    itemId,
    orderId: cleanText(item.orderId || ""),
    orderTime: cleanText(item.orderTime || ""),
    title,
    sku: cleanText(item.sku || ""),
    quantity: toInteger(item.quantity, 1),
    payment: toMoney(item.payment),
    status: cleanText(item.status || ""),
    refundText: cleanText(item.refundText || ""),
    itemUrl,
    imageUrl,
    rawText: cleanText(item.rawText || ""),
    detailUrl,
    detailTitle,
    detailProps: normalizeDetailProps(item.detailProps),
    detailDescription: cleanText(item.detailDescription || ""),
    detailImages,
    detailRawText: cleanText(item.detailRawText || ""),
    isRefunded: false,
    isApparel: false
  };
}

function shouldSkipSourceItem(item: SourceOrderItemDraft): boolean {
  if (!item.title && !item.detailTitle) return true;
  if (item.pageType !== "item-detail") return false;
  if (item.itemId) return false;
  if (item.detailTitle || item.detailProps.length || item.detailDescription || item.detailImages.length || item.detailRawText) return false;
  return true;
}

function mergeSourceItems(current: SourceOrderItemDraft, incoming: SourceOrderItemDraft): SourceOrderItemDraft {
  return {
    ...current,
    pageType: current.pageType === "item-detail" || incoming.pageType === "item-detail" ? "item-detail" : current.pageType,
    itemId: current.itemId || incoming.itemId,
    orderId: current.orderId || incoming.orderId,
    orderTime: current.orderTime || incoming.orderTime,
    title: current.title || incoming.title,
    sku: current.sku || incoming.sku,
    quantity: current.quantity || incoming.quantity,
    payment: current.payment ?? incoming.payment,
    status: current.status || incoming.status,
    refundText: current.refundText || incoming.refundText,
    itemUrl: current.itemUrl || incoming.itemUrl,
    imageUrl: current.imageUrl || incoming.imageUrl,
    rawText: current.rawText || incoming.rawText,
    detailUrl: incoming.detailUrl || current.detailUrl,
    detailTitle: incoming.detailTitle || current.detailTitle,
    detailProps: incoming.detailProps.length ? incoming.detailProps : current.detailProps,
    detailDescription: incoming.detailDescription || current.detailDescription,
    detailImages: incoming.detailImages.length ? incoming.detailImages : current.detailImages,
    detailRawText: incoming.detailRawText || current.detailRawText
  };
}

function displayTitle(item: SourceOrderItemDraft): string {
  const title = cleanText(item.detailTitle || item.title);
  if (!title || GENERIC_DETAIL_TITLE_PATTERN.test(title)) {
    return inferProductTitle(item) || title;
  }
  return title;
}

function classificationContext(item: SourceOrderItemDraft): string {
  return [item.sku, detailPropsText(item.detailProps), item.detailDescription, item.detailRawText, item.rawText].filter(Boolean).join(" ");
}

function detailPropsText(props: TaobaoDetailProp[]): string {
  return props.map((prop) => `${prop.name} ${prop.value}`).join(" ");
}

function inferProductTitle(item: SourceOrderItemDraft): string {
  const normalized = cleanText([item.detailRawText, item.rawText].filter(Boolean).join(" "));
  for (const pattern of PRODUCT_TITLE_PATTERNS) {
    const candidates = Array.from(normalized.matchAll(pattern), (match) => cleanProductTitle(match[1]));
    for (const candidate of candidates.reverse()) {
      if (candidate) return candidate;
    }
  }
  return "";
}

function cleanProductTitle(value: string): string {
  return cleanText(value)
    .replace(/^(?:图文详情|商品详情|宝贝描述|参数信息|尺码信息)\s+/, "")
    .slice(0, 180);
}

function preferredImage(item: SourceOrderItemDraft): string {
  return item.detailImages[0] || item.imageUrl;
}

function normalizeDetailProps(value: unknown): TaobaoDetailProp[] {
  if (!Array.isArray(value)) return [];
  const props: TaobaoDetailProp[] = [];
  for (const prop of value) {
    if (!prop || typeof prop !== "object") continue;
    const record = prop as Record<string, unknown>;
    const name = cleanText(String(record.name ?? ""));
    const propValue = cleanText(String(record.value ?? ""));
    if (name && propValue) props.push({ name, value: propValue });
  }
  return props;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => cleanText(String(item ?? ""))).filter(Boolean))).slice(0, 12);
}

function extractItemId(url: string | undefined): string {
  if (!url) return "";
  try {
    const parsed = new URL(url, "https://item.taobao.com");
    return cleanText(parsed.searchParams.get("id") || "");
  } catch {
    const match = String(url).match(/[?&]id=(\d+)/);
    return match ? match[1] : "";
  }
}

function guessPageType(url: string): TaobaoPageType {
  return /item\.taobao\.com|detail\.tmall\.com|item\.tmall\.com/i.test(url) ? "item-detail" : "order-list";
}

function toInteger(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toMoney(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number.parseFloat(String(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}
