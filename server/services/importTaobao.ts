import { createHash } from "node:crypto";
import type { Garment, GarmentCategory, TaobaoCapturedBatch, TaobaoCapturedItem, TaobaoDetailProp, TaobaoImportPreview, TaobaoPageType, TaobaoWardrobeFilterSummary } from "../../src/shared/types";
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

export interface TaobaoWardrobeFilteredBatch {
  payload: TaobaoCapturedBatch;
  filterSummary: TaobaoWardrobeFilterSummary;
}

export interface GarmentDisplayInfo {
  brand: string;
  name: string;
  rawName: string;
}

const WARDROBE_IMPORT_CATEGORIES: readonly GarmentCategory[] = ["top", "bottom", "dress", "outerwear", "shoes", "accessory"];
const REFUND_PATTERN = /退款成功|退货退款|交易关闭|已退款|售后成功|退款退货成功|订单关闭/i;
const GENERIC_DETAIL_TITLE_PATTERN = /^(宝贝描述|商品详情|图文详情|参数|参数信息|尺码|尺码信息|详情|描述)$/i;
const ORDER_STATUS_TEXT = "(?:Pending receipt|Pending review|Completed|交易成功|交易关闭|买家已付款|卖家已发货|待付款|待发货|待收货|待评价|已完成)";
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
    sourceItem.isApparel = Boolean(classification && isWardrobeImportCategory(classification.category));
    sourceItems.push(sourceItem);
    if (sourceItem.isRefunded) {
      skippedRefunded += 1;
      continue;
    }
    if (!classification || !isWardrobeImportCategory(classification.category)) {
      skippedNonApparel += 1;
      continue;
    }

    const displayInfo = buildGarmentDisplayInfo(sourceItem);
    garmentDrafts.push({
      sourceOrderItemId: undefined,
      brand: displayInfo.brand,
      name: displayInfo.name,
      rawName: displayInfo.rawName,
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

export function filterTaobaoBatchForWardrobe(payload: unknown): TaobaoWardrobeFilteredBatch {
  const batch = assertBatch(payload);
  const normalized = normalizeTaobaoBatch(batch);
  const keptItems = normalized.sourceItems
    .filter((item) => item.isApparel && !item.isRefunded)
    .map(sourceItemToCapturedItem);

  return {
    payload: {
      source: batch.source || "taobao-bookmarklet",
      pageType: batch.pageType || guessPageType(batch.pageUrl || ""),
      capturedAt: normalized.capturedAt,
      pageUrl: normalized.pageUrl,
      items: keptItems
    },
    filterSummary: {
      originalItems: batch.items?.length || 0,
      keptItems: keptItems.length,
      skippedRefunded: normalized.summary.skippedRefunded,
      skippedNonApparel: normalized.summary.skippedNonApparel
    }
  };
}

export function previewTaobaoImport(payload: unknown): TaobaoImportPreview {
  const normalized = normalizeTaobaoBatch(payload);
  const candidates: TaobaoImportPreview["candidates"] = [];
  const skipped: TaobaoImportPreview["skipped"] = [];

  for (const item of normalized.sourceItems) {
    if (item.isRefunded) {
      skipped.push({
        title: displayTitle(item) || item.title || item.detailTitle,
        reason: "refunded"
      });
      continue;
    }

    const classification = classifyGarment(displayTitle(item), classificationContext(item));
    if (!classification || !isWardrobeImportCategory(classification.category)) {
      skipped.push({
        title: displayTitle(item) || item.title || item.detailTitle,
        reason: "non-apparel"
      });
      continue;
    }

    const displayInfo = buildGarmentDisplayInfo(item);
    candidates.push({
      sourceItemKey: item.externalKey,
      brand: displayInfo.brand,
      name: displayInfo.name,
      rawName: displayInfo.rawName,
      category: classification.category,
      color: classification.color,
      warmth: classification.warmth,
      seasons: classification.seasons,
      confidence: classification.confidence,
      imageUrl: preferredImage(item)
    });
  }

  return {
    batchId: normalized.batchId,
    summary: normalized.summary,
    duplicateCount: Math.max(0, normalized.summary.totalItems - normalized.summary.uniqueItems),
    candidates,
    skipped
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

export function isWardrobeImportCategory(category: GarmentCategory): boolean {
  return WARDROBE_IMPORT_CATEGORIES.includes(category);
}

function sourceItemToCapturedItem(item: SourceOrderItemDraft): TaobaoCapturedItem {
  return {
    pageType: item.pageType,
    itemId: optionalText(item.itemId),
    orderId: optionalText(item.orderId),
    orderTime: optionalText(item.orderTime),
    title: optionalText(item.title),
    sku: optionalText(item.sku),
    quantity: item.quantity,
    payment: item.payment ?? undefined,
    status: optionalText(item.status),
    refundText: optionalText(item.refundText),
    itemUrl: optionalText(item.itemUrl),
    imageUrl: optionalText(item.imageUrl),
    rawText: optionalText(item.rawText),
    detailUrl: optionalText(item.detailUrl),
    detailTitle: optionalText(item.detailTitle),
    detailProps: item.detailProps.length ? item.detailProps : undefined,
    detailDescription: optionalText(item.detailDescription),
    detailImages: item.detailImages.length ? item.detailImages : undefined,
    detailRawText: optionalText(item.detailRawText)
  };
}

function optionalText(value: string): string | undefined {
  const cleaned = cleanText(value);
  return cleaned || undefined;
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

export function buildGarmentDisplayInfo(item: SourceOrderItemDraft): GarmentDisplayInfo {
  const rawName = displayTitle(item);
  const brand = extractBrand(item.detailProps, rawName);
  return {
    brand,
    name: cleanGarmentName(rawName, brand),
    rawName
  };
}

export function preferredImage(item: SourceOrderItemDraft): string {
  const candidates = [...item.detailImages, item.imageUrl].map(cleanText).filter(Boolean);
  return candidates.find(isTrustedProductImage) || "";
}

export function isTrustedProductImage(value: string): boolean {
  const url = cleanText(value);
  if (!url) return false;
  const lower = decodeURIComponent(url).toLowerCase();
  if (!/^https?:\/\//i.test(url) && !/^\/\//.test(url)) return false;
  if (/\.(?:svg|gif)(?:[?#].*)?$/i.test(lower)) return false;
  if (/logo|sprite|icon|avatar|placeholder|transparent|loading|wangwang|shop[_-]?card|store[_-]?card/.test(lower)) return false;

  const sizeMatch = lower.match(/(?:^|[^\d])(\d{1,3})[x_-](\d{1,3})(?:[^\d]|$)/);
  if (sizeMatch) {
    const width = Number(sizeMatch[1]);
    const height = Number(sizeMatch[2]);
    if (width < 120 || height < 120) return false;
  }

  return true;
}

function extractBrand(props: TaobaoDetailProp[], title: string): string {
  const propBrand = props.find((prop) => /^(品牌|brand)$/i.test(cleanText(prop.name)))?.value || "";
  const cleanedPropBrand = cleanBrand(propBrand);
  if (cleanedPropBrand) return cleanedPropBrand;

  const parsedOrderTitle = parseOrderTitle(title);
  const productTitle = parsedOrderTitle.productTitle || cleanText(title);
  const shopBrand = cleanBrand(parsedOrderTitle.shopName);
  if (shopBrand && productTitle.toLowerCase().startsWith(shopBrand.toLowerCase())) return shopBrand;

  const slashBrand = productTitle.match(/^([A-Za-z0-9][A-Za-z0-9°._· -]{1,30})\s*[\/／]\s*\S+/)?.[1] || "";
  if (slashBrand) return cleanBrand(slashBrand);

  const productToken = productTitle.match(/^([A-Za-z][A-Za-z0-9°._-]{1,30})(?=\s|[\/／])/i)?.[1] || "";
  if (productToken) return cleanBrand(productToken);

  return shopBrand;
}

function cleanBrand(value: string): string {
  const brand = cleanText(value)
    .replace(/^品牌[:：]\s*/i, "")
    .replace(/(?:官方旗舰店|旗舰店|官方店|专卖店|店铺)$/i, "")
    .replace(/[®™]/g, "")
    .trim();
  if (!brand || /^(无|其他|其它|other|none|不详)$/i.test(brand)) return "";
  return brand.slice(0, 40);
}

function cleanGarmentName(rawName: string, brand: string): string {
  let name = parseOrderTitle(rawName).productTitle || cleanText(rawName);
  if (brand) {
    const escapedBrand = escapeRegExp(brand);
    name = name
      .replace(new RegExp(`^${escapedBrand}\\s*[\\/／｜|:-]\\s*`, "i"), "")
      .replace(new RegExp(`^${escapedBrand}\\s+`, "i"), "")
      .replace(new RegExp(`^${escapedBrand}(?=[\\u4e00-\\u9fff])`, "i"), "");
  }
  name = name
    .replace(/\s*\[交易快照\].*$/i, "")
    .replace(/\s*(?:大促价保|假一赔四|极速退款|7天无理由|退货|退换|加入购物车|申请售后|再买一单).*$/i, "")
    .replace(/\b(?:官方旗舰店|旗舰店|淘宝|天猫|同款|包邮|券后|优惠前|官方立减)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (name || cleanText(rawName)).slice(0, 120);
}

function parseOrderTitle(value: string): { shopName: string; productTitle: string } {
  const title = cleanText(value);
  const orderMatch = title.match(new RegExp(`^\\d{4}-\\d{2}-\\d{2}\\s+(.+?)\\s+订单详情\\s+${ORDER_STATUS_TEXT}\\s+(.+)$`, "i"));
  if (!orderMatch) return { shopName: "", productTitle: title };
  return {
    shopName: cleanText(orderMatch[1]),
    productTitle: cleanText(orderMatch[2])
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
