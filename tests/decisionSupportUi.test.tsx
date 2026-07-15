import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { InsightSuggestionList } from "../src/features/insights/InsightSuggestionList";
import { HistoryInsightsView } from "../src/features/insights/HistoryInsightsView";
import { ValueInsights } from "../src/features/insights/ValueInsights";
import { PurchaseCheckPanel } from "../src/features/import/PurchaseCheckPanel";
import { ImportView } from "../src/features/import/ImportView";
import { WardrobeView } from "../src/features/wardrobe/WardrobeView";
import { matchesWardrobeFilters } from "../src/lib/garments";
import { DEFAULT_WARDROBE_FILTERS } from "../src/shared/presentation";
import type { Garment, TaobaoImportPreview, WardrobeInsights, WardrobeSuggestion } from "../src/shared/types";

const garments: Garment[] = [
  garment(1, "米白衬衫", "top"),
  garment(2, "深蓝长裤", "bottom"),
  garment(3, "黑色乐福鞋", "shoes")
];

describe("M5 decision-support UI", () => {
  it("applies an exact related-garment filter without leaking unrelated wardrobe items", () => {
    const filters = { ...DEFAULT_WARDROBE_FILTERS, relatedGarmentIds: [1, 3] };

    expect(garments.filter((item) => matchesWardrobeFilters(item, filters)).map((item) => item.id))
      .toEqual([1, 3]);

    const html = renderToStaticMarkup(
      <WardrobeView
        garments={garments}
        archivedGarments={[]}
        selectedIds={[]}
        filters={filters}
        onFilters={vi.fn()}
        busy={false}
        onRefresh={vi.fn()}
        onSelect={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onBulkConfirm={vi.fn()}
      />
    );

    expect(html).toContain("正在查看 2 件相关衣物");
    expect(html).toContain("清除相关筛选");
    expect(html).toContain("米白衬衫");
    expect(html).not.toContain("深蓝长裤");
  });

  it("offers explicit view and filter actions for suggestions with related garment evidence", () => {
    const suggestion: WardrobeSuggestion = {
      id: "low-utilization-high-cost",
      priority: "medium",
      title: "低利用高成本",
      detail: "这件衣物购入时间较久，目前穿着次数较少。",
      relatedGarmentIds: [1, 3]
    };
    const onViewRelated = vi.fn();
    const onApplyRelatedFilter = vi.fn();
    const tree = InsightSuggestionList({
      items: [suggestion],
      empty: "暂无建议",
      onViewRelated,
      onApplyRelatedFilter
    });
    const buttons = findClickableElements(tree);

    expect(buttons.map((button) => textContent(button.props.children))).toEqual([
      "查看相关衣物",
      "应用筛选"
    ]);
    buttons[0].props.onClick();
    buttons[1].props.onClick();
    expect(onViewRelated).toHaveBeenCalledWith([1, 3]);
    expect(onApplyRelatedFilter).toHaveBeenCalledWith([1, 3]);
  });

  it("wires related-garment actions through the history insight surface", () => {
    const onViewRelatedGarments = vi.fn();
    const onApplyRelatedFilter = vi.fn();
    const html = renderToStaticMarkup(
      <HistoryInsightsView
        insights={insightsWithSuggestion([1, 3])}
        wearLogs={[]}
        recommendationRuns={[]}
        busy={false}
        onRefresh={vi.fn()}
        onExport={vi.fn()}
        onViewRelatedGarments={onViewRelatedGarments}
        onApplyRelatedFilter={onApplyRelatedFilter}
      />
    );

    expect(html).toContain("查看相关衣物");
    expect(html).toContain("应用筛选");
  });

  it("renders neutral value evidence, including a finite zero-wear state", () => {
    const html = renderToStaticMarkup(
      <ValueInsights
        insights={{
          generatedAt: "2026-07-13T12:00:00.000Z",
          knownPriceCount: 2,
          unknownPriceCount: 1,
          upperQuartilePriceCents: 129900,
          bestValue: [{
            garmentId: 2,
            name: "深蓝长裤",
            category: "bottom",
            acquiredAt: "2025-01-02",
            purchasePriceCents: 39900,
            currency: "CNY",
            costSource: "taobao",
            wearCount: 6,
            lastWornAt: "2026-07-12T09:00:00.000Z",
            costPerWearCents: 6650,
            evidence: ["穿着 6 次"]
          }],
          lowUtilizationHighCost: [{
            garmentId: 1,
            name: "米白衬衫",
            category: "top",
            acquiredAt: "2025-01-01",
            purchasePriceCents: 129900,
            currency: "CNY",
            costSource: "manual",
            wearCount: 0,
            costPerWearCents: null,
            evidence: ["购入已超过 90 天", "穿着 0 次"]
          }],
          dormantGarments: [],
          suggestions: []
        }}
      />
    );

    expect(html).toContain("价值与利用");
    expect(html).toContain("低利用高成本");
    expect(html).toContain("尚无穿着");
    expect(html).toContain("购入时间");
    expect(html).toContain("穿着次数");
    expect(html).toContain("<details");
  });

  it("keeps a failed value refresh visible beside previous value evidence", () => {
    const html = renderToStaticMarkup(
      <ValueInsights
        error="价值数据刷新失败，请重试"
        insights={{
          generatedAt: "2026-07-14T00:00:00.000Z",
          knownPriceCount: 1,
          unknownPriceCount: 0,
          bestValue: [],
          lowUtilizationHighCost: [],
          dormantGarments: [],
          suggestions: []
        }}
      />
    );

    expect(html).toContain("价值数据刷新失败，请重试");
    expect(html).toContain("价格已知");
  });

  it("renders explainable purchase checks and explicit duplicate feedback actions", () => {
    const onFeedback = vi.fn();
    const tree = PurchaseCheckPanel({
      result: {
        subjectKey: `candidate:v1:${"a".repeat(64)}`,
        verdict: "likely-duplicate",
        possibleDuplicates: [{
          garment: garments[0],
          similarity: 0.87,
          reasons: ["同为上装", "颜色一致", "材质高度相似"]
        }],
        worksWith: [],
        coverageDelta: {
          categories: [],
          seasons: ["winter"],
          occasions: ["casual"],
          compatibleOutfitCount: 0
        },
        explanation: ["与衣橱中的米白衬衫结构相近。"]
      },
      onFeedback
    });
    const html = renderToStaticMarkup(tree);
    const buttons = findClickableElements(tree);

    expect(html).toContain("可能重复");
    expect(html).toContain("87%");
    expect(html).toContain("颜色一致");
    expect(buttons.map((button) => textContent(button.props.children))).toEqual([
      "确实重复",
      "不是重复"
    ]);
    buttons[0].props.onClick();
    buttons[1].props.onClick();
    expect(onFeedback).toHaveBeenNthCalledWith(1, 1, "duplicate");
    expect(onFeedback).toHaveBeenNthCalledWith(2, 1, "not-duplicate");
  });

  it("keeps a failed explicit-feedback error visible beside the previous purchase result", () => {
    const html = renderToStaticMarkup(
      <PurchaseCheckPanel
        result={{
          subjectKey: `candidate:v1:${"b".repeat(64)}`,
          verdict: "likely-duplicate",
          possibleDuplicates: [{
            garment: garments[0],
            similarity: 0.9,
            reasons: ["颜色一致"]
          }],
          worksWith: [],
          coverageDelta: {
            categories: [],
            seasons: [],
            occasions: [],
            compatibleOutfitCount: 0
          },
          explanation: ["保留上一次成功检查结果。"]
        }}
        error="反馈保存失败，请重试"
        onFeedback={vi.fn()}
      />
    );

    expect(html).toContain("反馈保存失败，请重试");
    expect(html).toContain("保留上一次成功检查结果");
  });

  it("blocks every similarity feedback action while one feedback request is running", () => {
    const tree = PurchaseCheckPanel({
      result: {
        subjectKey: `candidate:v1:${"c".repeat(64)}`,
        verdict: "likely-duplicate",
        possibleDuplicates: [
          { garment: garments[0], similarity: 0.9, reasons: ["颜色一致"] },
          { garment: garments[1], similarity: 0.82, reasons: ["材质相近"] }
        ],
        worksWith: [],
        coverageDelta: { categories: [], seasons: [], occasions: [], compatibleOutfitCount: 0 },
        explanation: ["正在保存显式反馈。"]
      },
      feedbackBusyGarmentId: garments[0].id,
      onFeedback: vi.fn()
    });

    const buttons = findClickableElements(tree)
      .filter((button) => ["确实重复", "不是重复"].includes(textContent(button.props.children)));
    expect(buttons).toHaveLength(4);
    expect(buttons.every((button) => Boolean((button.props as { disabled?: boolean }).disabled))).toBe(true);
  });

  it("only offers eligible purchase candidates and locks mutable inputs during a request", () => {
    const html = renderToStaticMarkup(
      <ImportView
        {...baseImportViewProps()}
        mode="purchase-check"
        importPreview={purchaseCheckPreview()}
        purchaseCheckSourceItemKey="eligible-item"
        purchaseCheckBusy
        feedbackBusyGarmentId={garments[0].id}
        onPurchaseCheckSourceItemKey={vi.fn()}
        onPurchaseCheck={vi.fn()}
      />
    );

    expect(html).toContain("可检查衬衫");
    expect(html).not.toContain("已退款牛仔裤");
    expect(html).toMatch(/<textarea[^>]*id="import-json"[^>]*disabled=""/);
    expect(html).toMatch(/<select[^>]*id="purchase-check-candidate"[^>]*disabled=""/);
  });

  it("shows value insights inside history and keeps purchase-check mode free of import commits", () => {
    const valueInsights = {
      generatedAt: "2026-07-13T12:00:00.000Z",
      knownPriceCount: 0,
      unknownPriceCount: 3,
      bestValue: [],
      lowUtilizationHighCost: [],
      dormantGarments: [],
      suggestions: []
    };
    const historyHtml = renderToStaticMarkup(
      <HistoryInsightsView
        insights={insightsWithSuggestion([])}
        valueInsights={valueInsights}
        wearLogs={[]}
        recommendationRuns={[]}
        busy={false}
        onRefresh={vi.fn()}
        onExport={vi.fn()}
      />
    );
    const importHtml = renderToStaticMarkup(
      <ImportView
        mode="purchase-check"
        bookmarklet="javascript:void 0"
        importText={'{"source":"taobao","items":[]}' }
        importResult={null}
        importPreview={null}
        filterSummary={null}
        captureUrl=""
        captureEngine="selenium"
        captureResult={null}
        busy={false}
        purchaseCheckResult={null}
        onModeChange={vi.fn()}
        onCopyBookmarklet={vi.fn()}
        onImportText={vi.fn()}
        onImport={vi.fn()}
        onCaptureUrl={vi.fn()}
        onCaptureEngine={vi.fn()}
        onStartOrdersCapture={vi.fn()}
        onStartItemCapture={vi.fn()}
        onReadLatestCapture={vi.fn()}
        onPurchaseCheck={vi.fn()}
      />
    );

    expect(historyHtml).toContain("价值与利用");
    expect(importHtml).toContain("购买前检查模式");
    expect(importHtml).toContain("运行购买前检查");
    expect(importHtml).not.toContain("提交选择");
  });
});

function garment(id: number, name: string, category: Garment["category"]): Garment {
  return {
    id,
    origin: "manual",
    brand: "",
    name,
    rawName: name,
    category,
    color: "black",
    warmth: "medium",
    seasons: ["spring"],
    styles: ["casual"],
    formality: "casual",
    imageUrl: "",
    owned: true,
    confirmed: true,
    excluded: false,
    availabilityStatus: "available",
    confidence: 1
  };
}

function baseImportViewProps() {
  return {
    bookmarklet: "javascript:void 0",
    importText: '{"source":"taobao","items":[]}',
    importResult: null,
    filterSummary: null,
    captureUrl: "",
    captureEngine: "selenium" as const,
    captureResult: null,
    busy: false,
    onCopyBookmarklet: vi.fn(),
    onImportText: vi.fn(),
    onImport: vi.fn(),
    onCaptureUrl: vi.fn(),
    onCaptureEngine: vi.fn(),
    onStartOrdersCapture: vi.fn(),
    onStartItemCapture: vi.fn(),
    onReadLatestCapture: vi.fn()
  };
}

function purchaseCheckPreview(): TaobaoImportPreview {
  type Candidate = TaobaoImportPreview["candidates"][number] & {
    purchaseCheckEligible: boolean;
    purchaseCheckIneligibleReason?: "refunded" | "non-apparel";
  };
  const common = {
    brand: "",
    category: "top" as const,
    color: "black",
    warmth: "medium" as const,
    seasons: ["spring" as const],
    styles: ["casual"],
    formality: "casual" as const,
    materials: [],
    patterns: [],
    tags: [],
    notes: "",
    confidence: 1,
    imageUrl: ""
  };
  const candidates: Candidate[] = [
    {
      ...common,
      sourceItemKey: "refunded-item",
      name: "已退款牛仔裤",
      rawName: "已退款牛仔裤",
      disposition: "unchanged",
      purchaseCheckEligible: false,
      purchaseCheckIneligibleReason: "refunded"
    },
    {
      ...common,
      sourceItemKey: "eligible-item",
      name: "可检查衬衫",
      rawName: "可检查衬衫",
      disposition: "create",
      purchaseCheckEligible: true
    }
  ];
  return {
    batchId: "batch-1",
    summary: { totalItems: 2, uniqueItems: 2, skippedRefunded: 1, skippedNonApparel: 0, createdGarments: 1 },
    duplicateCount: 0,
    candidates,
    skipped: []
  };
}

function insightsWithSuggestion(relatedGarmentIds: number[]): WardrobeInsights {
  const suggestion: WardrobeSuggestion = {
    id: "low-utilization-high-cost",
    priority: "medium",
    title: "低利用高成本",
    detail: "可展开证据后再决定是否调整使用。",
    relatedGarmentIds
  };
  return {
    totalGarments: 3,
    ownedGarments: 3,
    confirmedGarments: 3,
    pendingGarments: 0,
    categoryDistribution: { top: 1, bottom: 1, shoes: 1 },
    colorDistribution: { black: 3 },
    seasonDistribution: { spring: 3 },
    styleDistribution: { casual: 3 },
    formalityDistribution: { casual: 3 },
    styleTendency: { dominantStyles: [], dominantFormalities: [] },
    health: {
      score: 80,
      level: "fair",
      components: {
        coreCompleteness: 80,
        seasonCoverage: 25,
        styleCoverage: 25,
        confirmationRate: 100,
        utilizationRate: 33
      },
      issues: []
    },
    insightSuggestions: [suggestion],
    shoppingSuggestions: [],
    bodySuggestions: [],
    mostWorn: [],
    neverWorn: []
  };
}

function findClickableElements(node: ReactNode): ReactElement[] {
  if (node === null || node === undefined || typeof node === "boolean") return [];
  if (typeof node === "string" || typeof node === "number") return [];
  if (Array.isArray(node)) return node.flatMap(findClickableElements);
  const element = node as ReactElement<{ children?: ReactNode; onClick?: () => void }>;
  return [
    ...(typeof element.props.onClick === "function" ? [element] : []),
    ...findClickableElements(element.props.children)
  ];
}

function textContent(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join("");
  return textContent((node as ReactElement<{ children?: ReactNode }>).props.children);
}
