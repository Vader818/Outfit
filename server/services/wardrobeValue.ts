import type {
  GarmentCategory,
  GarmentCostSource,
  ValueGarmentEvidence,
  WardrobeSuggestion,
  WardrobeValueInsights
} from "../../src/shared/types";
import type { AppDatabase } from "../db";
import { ValidationError } from "../validation";

const DAY_MS = 24 * 60 * 60 * 1000;
const LOW_UTILIZATION_AGE_DAYS = 90;
const DORMANT_WEAR_DAYS = 90;
const NEW_PURCHASE_GRACE_DAYS = 30;

export interface WardrobeValueGarmentFact {
  garmentId: number;
  name: string;
  category: GarmentCategory;
  owned: boolean;
  archivedAt?: string;
  isRefunded?: boolean;
  acquiredAt?: string;
  purchasePriceCents?: number;
  currency?: "CNY";
  costSource?: GarmentCostSource;
  wearCount: number;
  lastWornAt?: string;
}

export interface WardrobeValueOptions {
  now?: () => Date;
}

export function buildWardrobeValueInsights(
  facts: readonly WardrobeValueGarmentFact[],
  options: WardrobeValueOptions = {}
): WardrobeValueInsights {
  const now = options.now?.() ?? new Date();
  if (!Number.isFinite(now.getTime())) {
    throw new ValidationError("价值洞察统计时间无效");
  }

  const active = facts
    .filter((fact) => fact.owned && !fact.archivedAt && !fact.isRefunded)
    .map(normalizeFact);
  const knownPriceFacts = active.filter(hasKnownPrice);
  const upperQuartilePriceCents = upperQuartileThreshold(knownPriceFacts);
  const bestValue = bestValueFacts(knownPriceFacts).map(toEvidence);
  const lowUtilizationHighCost = upperQuartilePriceCents === undefined
    ? []
    : knownPriceFacts
      .filter((fact) =>
        fact.purchasePriceCents >= upperQuartilePriceCents &&
        fact.wearCount <= 1 &&
        acquiredAgeDays(fact.acquiredAt, now) !== undefined &&
        acquiredAgeDays(fact.acquiredAt, now)! >= LOW_UTILIZATION_AGE_DAYS
      )
      .sort((left, right) =>
        right.purchasePriceCents - left.purchasePriceCents || left.garmentId - right.garmentId
      )
      .map(toEvidence);
  const dormantGarments = active
    .filter((fact) => isDormant(fact, now))
    .sort((left, right) => left.garmentId - right.garmentId)
    .map(toEvidence);

  return {
    generatedAt: now.toISOString(),
    knownPriceCount: knownPriceFacts.length,
    unknownPriceCount: active.length - knownPriceFacts.length,
    ...(upperQuartilePriceCents === undefined ? {} : { upperQuartilePriceCents }),
    bestValue,
    lowUtilizationHighCost,
    dormantGarments,
    suggestions: buildValueSuggestions(bestValue, lowUtilizationHighCost, dormantGarments)
  };
}

export function getWardrobeValueInsights(
  db: AppDatabase,
  options: WardrobeValueOptions = {}
): WardrobeValueInsights {
  const garmentColumns = new Set(
    (db.prepare("PRAGMA table_info(garments)").all() as Array<{ name: string }>).map((column) => column.name)
  );
  const costSourceExpression = garmentColumns.has("cost_source")
    ? "garments.cost_source"
    : "NULL";
  const rows = db.prepare(`
    SELECT
      garments.id AS garment_id,
      garments.name,
      garments.category,
      garments.owned,
      garments.archived_at,
      garments.acquired_at,
      garments.purchase_price_cents,
      garments.currency,
      ${costSourceExpression} AS cost_source,
      COUNT(wear_event_items.id) AS wear_count,
      MAX(wear_events.worn_at) AS last_worn_at
    FROM garments
    LEFT JOIN source_order_items
      ON source_order_items.id = garments.source_order_item_id
    LEFT JOIN wear_event_items
      ON wear_event_items.item_id = garments.id
    LEFT JOIN wear_events
      ON wear_events.id = wear_event_items.wear_event_id
    WHERE garments.owned = 1
      AND garments.archived_at IS NULL
      AND COALESCE(source_order_items.is_refunded, 0) = 0
    GROUP BY garments.id
    ORDER BY garments.id ASC
  `).all() as unknown as WardrobeValueRow[];

  return buildWardrobeValueInsights(rows.map(rowToFact), options);
}

function normalizeFact(fact: WardrobeValueGarmentFact): WardrobeValueGarmentFact {
  const wearCount = Number.isSafeInteger(fact.wearCount) && fact.wearCount >= 0
    ? fact.wearCount
    : 0;
  return {
    ...fact,
    wearCount,
    purchasePriceCents: isKnownPrice(fact.purchasePriceCents)
      ? fact.purchasePriceCents
      : undefined
  };
}

function hasKnownPrice(
  fact: WardrobeValueGarmentFact
): fact is WardrobeValueGarmentFact & { purchasePriceCents: number } {
  return isKnownPrice(fact.purchasePriceCents);
}

function isKnownPrice(value: number | undefined): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function upperQuartileThreshold(
  facts: ReadonlyArray<WardrobeValueGarmentFact & { purchasePriceCents: number }>
): number | undefined {
  if (!facts.length) return undefined;
  const prices = facts
    .map((fact) => fact.purchasePriceCents)
    .sort((left, right) => right - left);
  return prices[Math.ceil(prices.length / 4) - 1];
}

function bestValueFacts(
  facts: ReadonlyArray<WardrobeValueGarmentFact & { purchasePriceCents: number }>
): Array<WardrobeValueGarmentFact & { purchasePriceCents: number }> {
  const eligible = facts.filter((fact) => fact.wearCount >= 3);
  if (!eligible.length) return [];
  let best = eligible[0];
  for (const fact of eligible.slice(1)) {
    if (compareCostPerWear(fact, best) < 0) best = fact;
  }
  return eligible
    .filter((fact) => compareCostPerWear(fact, best) === 0)
    .sort((left, right) => left.garmentId - right.garmentId);
}

function compareCostPerWear(
  left: WardrobeValueGarmentFact & { purchasePriceCents: number },
  right: WardrobeValueGarmentFact & { purchasePriceCents: number }
): number {
  const leftProduct = BigInt(left.purchasePriceCents) * BigInt(right.wearCount);
  const rightProduct = BigInt(right.purchasePriceCents) * BigInt(left.wearCount);
  return leftProduct < rightProduct ? -1 : leftProduct > rightProduct ? 1 : 0;
}

function isDormant(fact: WardrobeValueGarmentFact, now: Date): boolean {
  const purchaseAge = fact.acquiredAt === undefined
    ? undefined
    : acquiredAgeDays(fact.acquiredAt, now);
  if (fact.acquiredAt !== undefined && purchaseAge === undefined) return false;
  if (purchaseAge !== undefined && purchaseAge < NEW_PURCHASE_GRACE_DAYS) return false;

  if (!fact.lastWornAt) {
    return purchaseAge !== undefined && purchaseAge >= NEW_PURCHASE_GRACE_DAYS;
  }
  const lastWorn = parseTimestamp(fact.lastWornAt);
  if (lastWorn === undefined || lastWorn > now.getTime()) return false;
  return now.getTime() - lastWorn >= DORMANT_WEAR_DAYS * DAY_MS;
}

function acquiredAgeDays(value: string | undefined, now: Date): number | undefined {
  if (!value) return undefined;
  const acquired = parseIsoCalendarDate(value);
  if (acquired === undefined) return undefined;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (acquired > today) return undefined;
  return Math.floor((today - acquired) / DAY_MS);
}

function parseIsoCalendarDate(value: string): number | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }
  return timestamp;
}

function parseTimestamp(value: string): number | undefined {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function toEvidence(fact: WardrobeValueGarmentFact): ValueGarmentEvidence {
  const price = fact.purchasePriceCents;
  const knownPrice = isKnownPrice(price);
  const costPerWearCents = knownPrice && fact.wearCount > 0
    ? price / fact.wearCount
    : null;
  const evidence = [
    knownPrice ? `购入价格：${formatCents(price)} 元` : "购入价格：未知",
    `购入时间：${fact.acquiredAt ?? "未知"}`,
    `穿着次数：${fact.wearCount} 次`
  ];
  if (fact.lastWornAt) evidence.push(`最近穿着：${fact.lastWornAt}`);
  if (costPerWearCents !== null) evidence.push(`成本/次：${formatCents(costPerWearCents)} 元`);
  return {
    garmentId: fact.garmentId,
    name: fact.name,
    category: fact.category,
    ...(fact.acquiredAt === undefined ? {} : { acquiredAt: fact.acquiredAt }),
    ...(knownPrice ? { purchasePriceCents: price } : {}),
    ...(fact.currency === undefined ? {} : { currency: fact.currency }),
    ...(fact.costSource === undefined ? {} : { costSource: fact.costSource }),
    wearCount: fact.wearCount,
    ...(fact.lastWornAt === undefined ? {} : { lastWornAt: fact.lastWornAt }),
    costPerWearCents,
    evidence
  };
}

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

function buildValueSuggestions(
  bestValue: ValueGarmentEvidence[],
  lowUtilizationHighCost: ValueGarmentEvidence[],
  dormantGarments: ValueGarmentEvidence[]
): WardrobeSuggestion[] {
  const suggestions: WardrobeSuggestion[] = [];
  if (bestValue.length) {
    suggestions.push({
      id: "best-value",
      priority: "low",
      title: "最佳价值",
      detail: "这些衣物在已有穿着记录中具有较低的单次使用成本，可作为利用情况参考。",
      evidence: suggestionEvidence(bestValue),
      relatedGarmentIds: bestValue.map((item) => item.garmentId)
    });
  }
  if (lowUtilizationHighCost.length) {
    suggestions.push({
      id: "low-utilization-high-cost",
      priority: "medium",
      title: "低利用高成本",
      detail: "这些较早购入且价格位于当前衣橱最高四分位的衣物，目前穿着次数较少。",
      evidence: suggestionEvidence(lowUtilizationHighCost),
      relatedGarmentIds: lowUtilizationHighCost.map((item) => item.garmentId)
    });
  }
  if (dormantGarments.length) {
    suggestions.push({
      id: "dormant-garments",
      priority: "medium",
      title: "沉睡单品",
      detail: "这些衣物近期没有穿着记录，可按实际状态决定是否继续保留在活跃衣橱。",
      evidence: suggestionEvidence(dormantGarments),
      relatedGarmentIds: dormantGarments.map((item) => item.garmentId)
    });
  }
  return suggestions;
}

function suggestionEvidence(items: readonly ValueGarmentEvidence[]): string[] {
  return items.flatMap((item) => item.evidence.map((evidence) => `${item.name} · ${evidence}`));
}

interface WardrobeValueRow {
  garment_id: number;
  name: string;
  category: GarmentCategory;
  owned: number;
  archived_at: string | null;
  acquired_at: string | null;
  purchase_price_cents: number | null;
  currency: "CNY" | null;
  cost_source: string | null;
  wear_count: number;
  last_worn_at: string | null;
}

function rowToFact(row: WardrobeValueRow): WardrobeValueGarmentFact {
  return {
    garmentId: row.garment_id,
    name: row.name,
    category: row.category,
    owned: Boolean(row.owned),
    archivedAt: row.archived_at ?? undefined,
    isRefunded: false,
    acquiredAt: row.acquired_at ?? undefined,
    purchasePriceCents: row.purchase_price_cents ?? undefined,
    currency: row.currency ?? undefined,
    costSource: row.cost_source === "manual" || row.cost_source === "taobao"
      ? row.cost_source
      : undefined,
    wearCount: Number(row.wear_count),
    lastWornAt: row.last_worn_at ?? undefined
  };
}
