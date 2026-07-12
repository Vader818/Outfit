import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  buildRecommendationFeedbackInput,
  FeedbackDialog
} from "../src/features/recommendations/FeedbackDialog";
import { OutfitStage } from "../src/features/recommendations/OutfitStage";
import { RecommendationView } from "../src/features/recommendations/RecommendationView";
import { FeedbackSummary } from "../src/features/insights/HistoryInsightsView";
import { GarmentItem } from "../src/features/wardrobe/GarmentItem";
import { AvailabilityMenu } from "../src/features/wardrobe/AvailabilityMenu";
import { WardrobeView } from "../src/features/wardrobe/WardrobeView";
import { isRecommendationEligibleGarment } from "../src/lib/garments";
import type {
  FeedbackVerdict,
  Garment,
  GarmentAvailabilityStatus,
  OutfitRecommendation,
  RecommendationResult,
  WardrobeInsights,
  WeatherSnapshot
} from "../src/shared/types";

const CANDIDATE_ID = "11111111-1111-4111-8111-111111111111";

describe("M3 recommendation feedback", () => {
  it("builds an optional, bounded feedback payload without requiring a long comment", () => {
    expect(buildRecommendationFeedbackInput({
      candidateId: CANDIDATE_ID,
      verdict: "disliked",
      rating: "2",
      actuallyWorn: false,
      reasonCodes: ["fit", "too-formal"],
      comment: "   "
    })).toEqual({
      candidateId: CANDIDATE_ID,
      verdict: "disliked",
      rating: 2,
      actuallyWorn: false,
      reasonCodes: ["fit", "too-formal"],
      comment: ""
    });

    expect(buildRecommendationFeedbackInput({
      candidateId: CANDIDATE_ID,
      verdict: "liked",
      rating: "",
      actuallyWorn: true,
      reasonCodes: [],
      comment: "  很适合今天  "
    })).toEqual({
      candidateId: CANDIDATE_ID,
      verdict: "liked",
      rating: null,
      actuallyWorn: true,
      reasonCodes: [],
      comment: "很适合今天"
    });

    expect(buildRecommendationFeedbackInput({
      candidateId: CANDIDATE_ID,
      verdict: "liked",
      rating: "",
      actuallyWorn: undefined,
      reasonCodes: [],
      comment: ""
    })).toEqual({
      candidateId: CANDIDATE_ID,
      verdict: "liked",
      rating: null,
      reasonCodes: [],
      comment: ""
    });
  });

  it("offers finite dislike reasons plus optional rating and comment controls", () => {
    const markup = renderToStaticMarkup(
      <FeedbackDialog
        open
        candidateId={CANDIDATE_ID}
        verdict="disliked"
        busy={false}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(markup).toContain("不喜欢这套搭配");
    for (const label of ["太热", "太冷", "太正式", "太休闲", "颜色", "版型", "近期重复", "衣物不可用", "其他"]) {
      expect(markup).toContain(label);
    }
    expect(markup).toContain("评分（可选）");
    expect(markup).toContain("补充说明（可选）");
    expect(markup).toContain('maxLength="500"');
    expect(markup).not.toContain('textarea required=""');
  });

  it("prefills the persisted rating, reasons, comment, and actual-wear fact", () => {
    const markup = renderToStaticMarkup(
      <FeedbackDialog
        open
        candidateId={CANDIDATE_ID}
        verdict="disliked"
        initialFeedback={{
          candidateId: CANDIDATE_ID,
          verdict: "disliked",
          rating: 2,
          actuallyWorn: true,
          reasonCodes: ["fit"],
          comment: "版型不适合"
        }}
        busy={false}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(markup).toContain('<option value="2" selected="">2 分</option>');
    expect(markup).toMatch(/checked="" value="fit"/);
    expect(markup).toContain("版型不适合");
  });

  it("keeps exact candidates when recommendation feedback callbacks are forwarded", () => {
    const outfit = makeOutfit();
    const onRecommendationFeedback = vi.fn();
    const tree = RecommendationView({
      weather: null,
      recommendations: makeRecommendation(outfit),
      availableGarmentCount: 2,
      occasion: "casual",
      latitude: "31.2",
      longitude: "121.4",
      busy: false,
      recordingOutfitId: null,
      wearLogFeedback: null,
      onOccasion: vi.fn(),
      onFetchWeather: vi.fn(),
      onGenerate: vi.fn(),
      onRecordWearLog: vi.fn(),
      onRecommendationFeedback
    });
    const stage = findElementsByComponentName(tree, "OutfitStage")[0];
    const props = stage.props as {
      outfit: OutfitRecommendation;
      onRecommendationFeedback?: (outfit: OutfitRecommendation, verdict: FeedbackVerdict) => void;
    };

    props.onRecommendationFeedback?.(props.outfit, "disliked");
    expect(onRecommendationFeedback).toHaveBeenCalledWith(outfit, "disliked");
  });

  it("renders like, dislike, and actual-wear entries while showing learned preference separately", () => {
    const outfit = makeOutfit({
      scoreBreakdown: {
        slotCompleteness: 20,
        weatherComfort: 18,
        season: 8,
        occasion: 18,
        pairCompatibility: 7,
        colorHarmony: 14,
        recentWear: 0,
        itemConfidence: 6,
        userPreference: 5,
        bodyProportion: 4,
        colorSuitability: 3,
        learnedPreference: 2.5
      }
    });
    const markup = renderToStaticMarkup(
      <OutfitStage
        outfit={outfit}
        recordingOutfitId={null}
        wearLogFeedback={null}
        onRecordWearLog={vi.fn()}
        onRecommendationFeedback={vi.fn()}
      />
    );

    expect(markup).toContain("喜欢");
    expect(markup).toContain("不喜欢");
    expect(markup).toContain("实际穿了");
    expect(markup).toContain("学习偏好");
    expect(markup).toContain("+2.5");
  });

  it("shows the ranking threshold only when at least one pair is actually weighted", () => {
    const pending = renderToStaticMarkup(
      <FeedbackSummary insights={{
        feedbackSummary: {
          totalCount: 8,
          acceptedCount: 6,
          acceptanceRate: 75,
          weightedPairCount: 0,
          rejectionReasons: []
        }
      } as unknown as WardrobeInsights} />
    );
    expect(pending).toContain("样本积累中");
    expect(pending).not.toContain("已达到排序阈值");

    const weighted = renderToStaticMarkup(
      <FeedbackSummary insights={{
        feedbackSummary: {
          totalCount: 3,
          acceptedCount: 3,
          acceptanceRate: 100,
          weightedPairCount: 2,
          rejectionReasons: []
        }
      } as unknown as WardrobeInsights} />
    );
    expect(weighted).toContain("已达到排序阈值");
    expect(weighted).toContain("2 对衣物组合");
  });
});

describe("M3 garment availability", () => {
  it("uses a labelled native select with exactly the five availability states", () => {
    const markup = renderToStaticMarkup(
      <AvailabilityMenu
        value="repair"
        garmentName="灰色夹克"
        onChange={vi.fn()}
      />
    );

    expect(markup).toContain("<select");
    expect(markup).toContain("灰色夹克的可用状态");
    expect((markup.match(/<option/g) ?? [])).toHaveLength(5);
    for (const label of ["可用", "待洗", "维修中", "借出", "已装箱"]) {
      expect(markup).toContain(label);
    }
    expect(markup).toContain('value="repair" selected=""');
  });

  it("excludes unavailable garments and disables using them as recommendation cores", () => {
    const garment = makeGarment(101, "灰色夹克", "top", "laundry");
    expect(isRecommendationEligibleGarment(garment)).toBe(false);

    const wardrobeMarkup = renderToStaticMarkup(
      <GarmentItem
        item={garment}
        selected={false}
        presentation="card"
        onSelect={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onAvailabilityChange={vi.fn()}
        onUseGarmentAsCore={vi.fn()}
      />
    );
    expect(wardrobeMarkup).toContain("待洗");
    expect(wardrobeMarkup).toMatch(/aria-label="以灰色夹克为核心推荐"[^>]*disabled=""/);

    const outfitMarkup = renderToStaticMarkup(
      <OutfitStage
        outfit={makeOutfit({ items: [garment, makeGarment(202, "黑长裤", "bottom")] })}
        recordingOutfitId={null}
        wearLogFeedback={null}
        onRecordWearLog={vi.fn()}
        onUseGarmentAsCore={vi.fn()}
      />
    );
    expect(outfitMarkup).toMatch(/aria-label="以灰色夹克为核心推荐"[^>]*disabled=""/);
  });

  it("forwards single-item availability changes and exposes a batch callback", () => {
    const garment = makeGarment(101, "灰色夹克", "top");
    const onAvailabilityChange = vi.fn();
    const onBulkAvailability = vi.fn();
    const tree = WardrobeView({
      garments: [garment],
      selectedIds: [garment.id],
      busy: false,
      onRefresh: vi.fn(),
      onSelect: vi.fn(),
      onUpdate: vi.fn(),
      onDelete: vi.fn(),
      onBulkConfirm: vi.fn(),
      onAvailabilityChange,
      onBulkAvailability
    });
    const item = findElementsByComponentName(tree, "GarmentItem")[0];
    const itemProps = item.props as {
      item: Garment;
      onAvailabilityChange?: (id: number, status: GarmentAvailabilityStatus) => void;
    };
    itemProps.onAvailabilityChange?.(itemProps.item.id, "loaned");
    expect(onAvailabilityChange).toHaveBeenCalledWith(garment.id, "loaned");

    const markup = renderToStaticMarkup(<>{tree}</>);
    expect(markup).toContain("批量可用状态");
    expect(markup).toContain("应用状态");
  });

  it("includes unavailable counts in missing-slot guidance", () => {
    const recommendations: RecommendationResult = {
      runId: 1,
      weather: makeWeather(),
      occasion: "casual",
      outfits: [],
      missingSlots: ["top", "dress"],
      missingSlotDetails: [
        { slot: "top", unavailableCount: 2 },
        { slot: "dress", unavailableCount: 1 }
      ]
    };
    const markup = renderToStaticMarkup(
      <RecommendationView
        weather={null}
        recommendations={recommendations}
        availableGarmentCount={0}
        occasion="casual"
        latitude="31.2"
        longitude="121.4"
        busy={false}
        recordingOutfitId={null}
        wearLogFeedback={null}
        onOccasion={vi.fn()}
        onFetchWeather={vi.fn()}
        onGenerate={vi.fn()}
        onRecordWearLog={vi.fn()}
      />
    );

    expect(markup).toContain("3 件衣物因待洗、维修、借出或已装箱暂不可用");
  });
});

function makeOutfit(overrides: Partial<OutfitRecommendation> = {}): OutfitRecommendation {
  return {
    id: CANDIDATE_ID,
    candidateId: CANDIDATE_ID,
    outfitSignature: "a".repeat(64),
    score: 90,
    matchPercent: 90,
    items: [makeGarment(101, "白衬衫", "top"), makeGarment(202, "黑长裤", "bottom")],
    reasons: ["适合今天的天气与场合"],
    replacements: [],
    ...overrides
  };
}

function makeRecommendation(outfit: OutfitRecommendation): RecommendationResult {
  return {
    runId: 1,
    weather: makeWeather(),
    occasion: "casual",
    outfits: [outfit],
    missingSlots: []
  };
}

function makeGarment(
  id: number,
  name: string,
  category: Garment["category"],
  availabilityStatus: GarmentAvailabilityStatus = "available"
): Garment {
  return {
    id,
    origin: "manual",
    name,
    brand: "",
    rawName: name,
    category,
    color: "black",
    warmth: "medium",
    seasons: ["spring", "autumn"],
    styles: ["minimal"],
    formality: "smart-casual",
    imageUrl: "",
    owned: true,
    confirmed: true,
    excluded: false,
    availabilityStatus,
    confidence: 1
  };
}

function makeWeather(): WeatherSnapshot {
  return {
    date: "2026-07-12",
    temperature: 24,
    apparentTemperature: 25,
    precipitationProbability: 10,
    windSpeed: 8,
    weatherCode: 1,
    summary: "晴"
  };
}

function findElementsByComponentName(node: ReactNode, name: string): ReactElement[] {
  const matches: ReactElement[] = [];

  function visit(current: ReactNode) {
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    if (!isValidElement(current)) return;
    if (reactTypeName(current) === name) matches.push(current);
    visit((current.props as { children?: ReactNode }).children);
  }

  visit(node);
  return matches;
}

function reactTypeName(element: ReactElement): string {
  if (typeof element.type === "string") return element.type;
  if (typeof element.type === "function") {
    const component = element.type as typeof element.type & { displayName?: string; name?: string };
    return component.displayName || component.name || "";
  }
  return "";
}
