import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OutfitStage } from "../src/features/recommendations/OutfitStage";
import { RecommendationView } from "../src/features/recommendations/RecommendationView";
import { HistoryInsightsView } from "../src/features/insights/HistoryInsightsView";
import {
  buildOutfitBuilderSubmission,
  findUnavailableOutfitItems,
  OutfitBuilder
} from "../src/features/outfits/OutfitBuilder";
import { ReplacementDialog } from "../src/features/outfits/ReplacementDialog";
import { SavedOutfitsPanel } from "../src/features/outfits/SavedOutfitsPanel";
import { GarmentItem } from "../src/features/wardrobe/GarmentItem";
import {
  findExactSavedRecommendationParent,
  resolveSavedRecommendationParent
} from "../src/app/App";
import type { Garment, OutfitRecommendation, RecommendationResult, SavedOutfit } from "../src/shared/types";

const CANDIDATE_ID = "11111111-1111-4111-8111-111111111111";

describe("saved outfit recommendation actions", () => {
  it("renders an accessible save action and forwards the exact candidate", () => {
    const outfit = makeOutfit();
    const onSaveOutfit = vi.fn();
    const onScheduleOutfit = vi.fn();
    const element = RecommendationView({
      weather: null,
      recommendations: makeRecommendation(outfit),
      availableGarmentCount: 2,
      occasion: "casual",
      latitude: "31.2",
      longitude: "121.4",
      busy: false,
      savingOutfitId: null,
      recordingOutfitId: null,
      wearLogFeedback: null,
      onOccasion: vi.fn(),
      onFetchWeather: vi.fn(),
      onGenerate: vi.fn(),
      onRecordWearLog: vi.fn(),
      onSaveOutfit,
      onScheduleOutfit
    });
    const stage = findElementsByComponentName(element, "OutfitStage")[0];
    expect(stage).toBeDefined();
    const props = stage.props as {
      outfit: OutfitRecommendation;
      onSaveOutfit?: (value: OutfitRecommendation) => void;
      onScheduleOutfit?: (value: OutfitRecommendation) => void;
    };
    props.onSaveOutfit?.(props.outfit);
    props.onScheduleOutfit?.(props.outfit);
    expect(onSaveOutfit).toHaveBeenCalledWith(outfit);
    expect(onScheduleOutfit).toHaveBeenCalledWith(outfit);

    const markup = renderToStaticMarkup(
      <OutfitStage
        outfit={outfit}
        recordingOutfitId={null}
        savingOutfitId={null}
        wearLogFeedback={null}
        onRecordWearLog={vi.fn()}
        onSaveOutfit={onSaveOutfit}
        onScheduleOutfit={onScheduleOutfit}
      />
    );
    expect(markup).toContain("保存搭配");
    expect(markup).toContain("安排日期");
    expect(markup).toContain("type=\"button\"");
  });

  it("announces candidate save progress and disables duplicate submission", () => {
    const outfit = makeOutfit();
    const markup = renderToStaticMarkup(
      <OutfitStage
        outfit={outfit}
        recordingOutfitId={null}
        savingOutfitId={outfit.candidateId}
        wearLogFeedback={null}
        onRecordWearLog={vi.fn()}
        onSaveOutfit={vi.fn()}
      />
    );
    expect(markup).toContain("保存中");
    expect(markup).toContain("aria-busy=\"true\"");
    expect(markup).toContain("disabled=\"\"");
  });

  it("offers core-garment actions on recommendation pieces and wardrobe details", () => {
    const outfit = makeOutfit();
    const onUseGarmentAsCore = vi.fn();
    const stageMarkup = renderToStaticMarkup(
      <OutfitStage
        outfit={outfit}
        recordingOutfitId={null}
        wearLogFeedback={null}
        onRecordWearLog={vi.fn()}
        onUseGarmentAsCore={onUseGarmentAsCore}
      />
    );
    expect(stageMarkup).toContain("以白衬衫为核心推荐");
    expect(stageMarkup).toContain("以黑长裤为核心推荐");

    const wardrobeMarkup = renderToStaticMarkup(
      <GarmentItem
        item={outfit.items[0]}
        selected={false}
        presentation="card"
        onSelect={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onUseGarmentAsCore={onUseGarmentAsCore}
      />
    );
    expect(wardrobeMarkup).toContain("以这件为核心");
    expect(wardrobeMarkup).toContain("以白衬衫为核心推荐");
  });

  it("shows and clears the active core constraint in recommendation context", () => {
    const outfit = makeOutfit();
    const markup = renderToStaticMarkup(
      <RecommendationView
        weather={null}
        recommendations={makeRecommendation(outfit)}
        availableGarmentCount={2}
        occasion="casual"
        latitude="31.2"
        longitude="121.4"
        busy={false}
        recordingOutfitId={null}
        wearLogFeedback={null}
        coreGarments={[outfit.items[0]]}
        onClearGarmentConstraints={vi.fn()}
        onOccasion={vi.fn()}
        onFetchWeather={vi.fn()}
        onGenerate={vi.fn()}
        onRecordWearLog={vi.fn()}
      />
    );
    expect(markup).toContain("已锁定核心单品");
    expect(markup).toContain("白衬衫");
    expect(markup).toContain("清除核心单品");
  });

  it("opens per-garment replacement actions and explains the complete next outfit", () => {
    const outfit = makeOutfit();
    const replacement = makeGarment(3, "蓝衬衫", "top");
    const suggestion = {
      targetGarmentId: outfit.items[0].id,
      replacement,
      nextItems: [replacement, outfit.items[1]],
      matchPercentDelta: 4,
      reasons: ["蓝色与黑色更协调", "仍适合当前场合"]
    };
    outfit.replacements = [suggestion];

    const stageMarkup = renderToStaticMarkup(
      <OutfitStage
        outfit={outfit}
        recordingOutfitId={null}
        wearLogFeedback={null}
        onRecordWearLog={vi.fn()}
        onReplaceGarment={vi.fn()}
      />
    );
    expect(stageMarkup).toContain("换白衬衫");
    expect(stageMarkup).toContain("换这件");

    const dialogMarkup = renderToStaticMarkup(
      <ReplacementDialog
        open
        outfit={outfit}
        targetGarment={outfit.items[0]}
        suggestions={[suggestion]}
        busy={false}
        onClose={vi.fn()}
        onApply={vi.fn()}
      />
    );
    expect(dialogMarkup).toContain("换一件");
    expect(dialogMarkup).toContain("白衬衫");
    expect(dialogMarkup).toContain("蓝衬衫");
    expect(dialogMarkup).toContain("黑长裤");
    expect(dialogMarkup).toContain("+4");
    expect(dialogMarkup).toContain("蓝色与黑色更协调");
    expect(dialogMarkup).toContain("应用为新版本");
  });

  it("reuses a recommendation parent only when garment ids, slots, and positions match the candidate snapshot", () => {
    const candidate = makeOutfit();
    const editedParent = makeSavedRecommendationParent(8, candidate);
    editedParent.items[1] = {
      ...editedParent.items[1],
      garmentId: 4,
      garmentSnapshot: {
        ...editedParent.items[1].garmentSnapshot,
        id: 4,
        name: "灰长裤"
      }
    };
    const exactParent = makeSavedRecommendationParent(9, candidate);

    expect(findExactSavedRecommendationParent([editedParent], candidate)).toBeUndefined();
    expect(findExactSavedRecommendationParent([editedParent, exactParent], candidate)).toBe(exactParent);

    const wrongPosition = makeSavedRecommendationParent(10, candidate);
    wrongPosition.items[0] = { ...wrongPosition.items[0], position: 1 };
    expect(findExactSavedRecommendationParent([wrongPosition], candidate)).toBeUndefined();
  });

  it("creates a clean candidate parent after an edited snapshot and reuses that exact parent on replay", async () => {
    const candidate = makeOutfit();
    const editedParent = makeSavedRecommendationParent(8, candidate);
    editedParent.items[1] = {
      ...editedParent.items[1],
      garmentId: 4,
      garmentSnapshot: { ...editedParent.items[1].garmentSnapshot, id: 4, name: "灰长裤" }
    };
    const cleanParent = makeSavedRecommendationParent(9, candidate);
    const saveCandidate = vi.fn().mockResolvedValue(cleanParent);

    await expect(resolveSavedRecommendationParent(
      [editedParent],
      candidate,
      saveCandidate
    )).resolves.toEqual({ parent: cleanParent, created: true });
    expect(saveCandidate).toHaveBeenCalledOnce();
    expect(saveCandidate).toHaveBeenCalledWith(candidate.candidateId);

    saveCandidate.mockClear();
    await expect(resolveSavedRecommendationParent(
      [editedParent, cleanParent],
      candidate,
      saveCandidate
    )).resolves.toEqual({ parent: cleanParent, created: false });
    expect(saveCandidate).not.toHaveBeenCalled();
  });
});

describe("saved outfits history integration", () => {
  it("keeps saved outfits visible when wardrobe insights are still empty", () => {
    const outfit: SavedOutfit = {
      id: 8,
      name: "可复用通勤搭配",
      notes: "",
      source: "manual",
      favorite: false,
      items: [],
      createdAt: "2026-07-11T00:00:00.000Z",
      updatedAt: "2026-07-11T00:00:00.000Z"
    };
    const markup = renderToStaticMarkup(
      <HistoryInsightsView
        activeSection="saved"
        insights={null}
        wearLogs={[]}
        recommendationRuns={[]}
        savedOutfits={[outfit]}
        busy={false}
        onRefresh={vi.fn()}
        onExport={vi.fn()}
        onCreateSavedOutfit={vi.fn()}
        onOpenSavedOutfit={vi.fn()}
        onFavoriteSavedOutfit={vi.fn()}
        onArchiveSavedOutfit={vi.fn()}
      />
    );
    expect(markup).toContain("保存的搭配");
    expect(markup).toContain("可复用通勤搭配");
    expect(markup).not.toContain("还没有可展示的历史洞察");
  });
});

describe("saved outfit historical snapshot safety", () => {
  it("submits metadata only and preserves items when historical sources are unavailable", () => {
    const outfit = makeHistoricalOutfit();
    const garments = [
      { ...makeGarment(1, "已归档衬衫", "top"), archivedAt: "2026-07-11T08:00:00.000Z" },
      makeGarment(3, "黑长裤", "bottom")
    ];
    const unavailable = findUnavailableOutfitItems(outfit, garments);

    expect(unavailable.map((entry) => entry.reason)).toEqual(["archived", "deleted"]);
    const result = buildOutfitBuilderSubmission(
      "更新后的旧搭配",
      "只修改备注",
      true,
      [{ garmentId: 3, slot: "bottom", position: 0 }],
      garments.filter((garment) => !garment.archivedAt),
      {
        existing: true,
        contentEditing: false,
        contentDirty: false,
        unresolvedItemCount: unavailable.length
      }
    );

    expect(result.validation).toEqual({ name: undefined, items: [] });
    expect(result.input).toEqual({
      name: "更新后的旧搭配",
      notes: "只修改备注",
      favorite: true
    });
    expect(result.input).not.toHaveProperty("items");
  });

  it("blocks composition updates until every unavailable snapshot is explicitly resolved", () => {
    const result = buildOutfitBuilderSubmission(
      "旧搭配",
      "",
      false,
      [{ garmentId: 3, slot: "bottom", position: 0 }],
      [makeGarment(3, "黑长裤", "bottom")],
      {
        existing: true,
        contentEditing: true,
        contentDirty: true,
        unresolvedItemCount: 2
      }
    );

    expect(result.input).toBeUndefined();
    expect(result.validation.items).toContain("请先逐项替换或移除不可用的历史衣物");
  });

  it("explains the safe metadata-only path before historical composition editing begins", () => {
    const outfit = makeHistoricalOutfit();
    const markup = renderToStaticMarkup(
      <OutfitBuilder
        open
        outfit={outfit}
        garments={[
          { ...makeGarment(1, "已归档衬衫", "top"), archivedAt: "2026-07-11T08:00:00.000Z" },
          makeGarment(3, "黑长裤", "bottom")
        ]}
        busy={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(markup).toContain("保存时不会发送衣物列表");
    expect(markup).toContain("历史快照将原样保留");
    expect(markup).toContain("有 2 件历史衣物当前不可用");
    expect(markup).toContain("已归档衬衫");
    expect(markup).toContain("来源衣物已归档");
    expect(markup).not.toContain('<option value="1">');
    expect(markup).toContain("旧鞋");
    expect(markup).toContain("来源衣物已删除");
    expect(markup).toContain("调整搭配内容");
  });

  it("renders archived outfits with snapshots and both directions of lineage without re-archive actions", () => {
    const archived = makeHistoricalOutfit();
    archived.archivedAt = "2026-07-11T09:00:00.000Z";
    const derived: SavedOutfit = {
      id: 10,
      name: "换鞋版",
      notes: "",
      source: "replacement",
      derivedFromOutfitId: archived.id,
      favorite: false,
      items: [],
      createdAt: "2026-07-11T10:00:00.000Z",
      updatedAt: "2026-07-11T10:00:00.000Z"
    };
    const markup = renderToStaticMarkup(
      <SavedOutfitsPanel
        outfits={[archived, derived]}
        busy={false}
        onCreate={vi.fn()}
        onOpen={vi.fn()}
        onFavorite={vi.fn()}
        onArchive={vi.fn()}
        onSchedule={vi.fn()}
      />
    );

    expect(markup).toContain("已归档的搭配");
    expect(markup).toContain("归档旧搭配");
    expect(markup).toContain("保存时快照");
    expect(markup).toContain("来源已删除");
    expect(markup).toContain("派生版本：");
    expect(markup).toContain("换鞋版");
    expect(markup).toContain("源自「归档旧搭配」（已归档）");
    expect(markup).toContain("查看或编辑资料 归档旧搭配");
    expect(markup).toContain("aria-label=\"安排日期 换鞋版\"");
    expect(markup).not.toContain("aria-label=\"安排日期 归档旧搭配\"");
    expect(markup).not.toContain("aria-label=\"归档 归档旧搭配\"");
  });
});

function makeRecommendation(outfit: OutfitRecommendation): RecommendationResult {
  return {
    runId: 1,
    weather: {
      date: "2026-07-11",
      temperature: 25,
      apparentTemperature: 26,
      precipitationProbability: 10,
      windSpeed: 8,
      weatherCode: 1,
      summary: "晴"
    },
    occasion: "casual",
    outfits: [outfit],
    missingSlots: []
  };
}

function makeOutfit(): OutfitRecommendation {
  return {
    id: CANDIDATE_ID,
    candidateId: CANDIDATE_ID,
    outfitSignature: "a".repeat(64),
    score: 90,
    items: [
      makeGarment(1, "白衬衫", "top"),
      makeGarment(2, "黑长裤", "bottom")
    ],
    reasons: ["适合当前场合"],
    replacements: []
  };
}

function makeGarment(id: number, name: string, category: Garment["category"]): Garment {
  return {
    id,
    origin: "manual",
    brand: "",
    name,
    rawName: name,
    category,
    color: "black",
    warmth: "medium",
    seasons: ["spring", "autumn"],
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

function makeHistoricalOutfit(): SavedOutfit {
  return {
    id: 9,
    name: "归档旧搭配",
    notes: "保留当时的样子",
    source: "manual",
    favorite: false,
    items: [
      {
        id: 91,
        outfitId: 9,
        garmentId: 1,
        slot: "top",
        position: 0,
        garmentSnapshot: {
          id: 1,
          name: "已归档衬衫",
          brand: "旧品牌",
          category: "top",
          imageUrl: ""
        }
      },
      {
        id: 92,
        outfitId: 9,
        slot: "shoes",
        position: 0,
        garmentSnapshot: {
          id: 2,
          name: "旧鞋",
          brand: "",
          category: "shoes",
          imageUrl: ""
        }
      },
      {
        id: 93,
        outfitId: 9,
        garmentId: 3,
        slot: "bottom",
        position: 0,
        garmentSnapshot: {
          id: 3,
          name: "黑长裤",
          brand: "",
          category: "bottom",
          imageUrl: ""
        }
      }
    ],
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-11T00:00:00.000Z"
  };
}

function makeSavedRecommendationParent(id: number, candidate: OutfitRecommendation): SavedOutfit {
  return {
    id,
    name: "推荐快照",
    notes: "",
    source: "recommendation",
    sourceCandidateId: candidate.candidateId,
    favorite: false,
    items: candidate.items.map((garment, index) => ({
      id: id * 10 + index,
      outfitId: id,
      garmentId: garment.id,
      slot: garment.category,
      position: 0,
      garmentSnapshot: {
        id: garment.id,
        name: garment.name,
        brand: garment.brand,
        category: garment.category,
        imageUrl: garment.imageUrl
      }
    })),
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z"
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
    const componentName = typeof current.type === "function"
      ? (current.type as { name?: string }).name ?? ""
      : "";
    if (componentName === name) matches.push(current);
    visit((current.props as { children?: ReactNode }).children);
  }
  visit(node);
  return matches;
}
