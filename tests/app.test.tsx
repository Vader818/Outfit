import { renderToStaticMarkup } from "react-dom/server";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App, ImportView } from "../src/App";
import type { Garment, OutfitRecommendation, RecommendationResult, WeatherSnapshot } from "../src/shared/types";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("renders recommendation occasion chips in Chinese", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: vi.fn()
    });

    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain(">休闲<");
    expect(markup).toContain(">商务休闲<");
    expect(markup).toContain(">正装<");
    expect(markup).toContain(">运动<");
    expect(markup).not.toContain(">casual<");
    expect(markup).not.toContain(">smart-casual<");
    expect(markup).not.toContain(">formal<");
    expect(markup).not.toContain(">sport<");
  });

  it("renders a control for reading Selenium capture artifacts into the import JSON box", () => {
    const markup = renderToStaticMarkup(
      <ImportView
        bookmarklet="https://example.com/bookmarklet"
        importText=""
        importResult={null}
        captureUrl=""
        captureResult={null}
        busy={false}
        onCopyBookmarklet={vi.fn()}
        onImportText={vi.fn()}
        onImport={vi.fn()}
        onCaptureUrl={vi.fn()}
        onStartOrdersCapture={vi.fn()}
        onStartItemCapture={vi.fn()}
        onReadLatestCapture={vi.fn()}
      />
    );

    expect(markup).toContain("读取产物");
  });

  it("builds a wear log payload from a recommendation outfit", async () => {
    const weather = makeWeather();
    const outfit = makeOutfit();
    const appModule = await import("../src/App");
    const buildRecommendationWearLogInput = (appModule as {
      buildRecommendationWearLogInput?: (
        outfit: OutfitRecommendation,
        occasion: string,
        weather: WeatherSnapshot
      ) => { garmentIds: number[]; context?: Record<string, unknown> };
    }).buildRecommendationWearLogInput;

    expect(buildRecommendationWearLogInput).toEqual(expect.any(Function));

    expect(buildRecommendationWearLogInput?.(outfit, "smart-casual", weather)).toEqual({
      garmentIds: [101, 202],
      context: {
        outfitId: "outfit-1",
        occasion: "smart-casual",
        weather
      }
    });
  });

  it("wires the recommendation card wear button to the selected outfit", async () => {
    const weather = makeWeather();
    const outfit = makeOutfit();
    const recommendations: RecommendationResult = {
      weather,
      occasion: "casual",
      outfits: [outfit]
    };
    const appModule = await import("../src/App");
    const RecommendationView = (appModule as {
      RecommendationView?: (props: {
        weather: WeatherSnapshot;
        recommendations: RecommendationResult;
        occasion: string;
        latitude: string;
        longitude: string;
        busy: boolean;
        recordingOutfitId: string | null;
        wearLogFeedback: { outfitId: string; message: string } | null;
        onOccasion: (value: string) => void;
        onFetchWeather: () => void;
        onGenerate: () => void;
        onRecordWearLog: (outfit: OutfitRecommendation) => void;
      }) => ReactNode;
    }).RecommendationView;
    const onRecordWearLog = vi.fn();

    expect(RecommendationView).toEqual(expect.any(Function));

    const tree = RecommendationView?.({
      weather,
      recommendations,
      occasion: "casual",
      latitude: "39.9042",
      longitude: "116.4074",
      busy: false,
      recordingOutfitId: null,
      wearLogFeedback: null,
      onOccasion: vi.fn(),
      onFetchWeather: vi.fn(),
      onGenerate: vi.fn(),
      onRecordWearLog
    });

    const wearButtons = findButtonsByText(tree, "标记已穿");
    expect(wearButtons).toHaveLength(1);

    wearButtons[0].props.onClick();

    expect(onRecordWearLog).toHaveBeenCalledWith(outfit);
  });

  it("renders a short wear log success feedback on the recommendation card", async () => {
    const weather = makeWeather();
    const outfit = makeOutfit();
    const appModule = await import("../src/App");
    const RecommendationView = (appModule as {
      RecommendationView?: (props: {
        weather: WeatherSnapshot;
        recommendations: RecommendationResult;
        occasion: string;
        latitude: string;
        longitude: string;
        busy: boolean;
        recordingOutfitId: string | null;
        wearLogFeedback: { outfitId: string; message: string } | null;
        onOccasion: (value: string) => void;
        onFetchWeather: () => void;
        onGenerate: () => void;
        onRecordWearLog: (outfit: OutfitRecommendation) => void;
      }) => ReactNode;
    }).RecommendationView;

    expect(RecommendationView).toEqual(expect.any(Function));

    const tree = RecommendationView?.({
      weather,
      recommendations: {
        weather,
        occasion: "casual",
        outfits: [outfit]
      },
      occasion: "casual",
      latitude: "39.9042",
      longitude: "116.4074",
      busy: false,
      recordingOutfitId: null,
      wearLogFeedback: { outfitId: "outfit-1", message: "已标记已穿" },
      onOccasion: vi.fn(),
      onFetchWeather: vi.fn(),
      onGenerate: vi.fn(),
      onRecordWearLog: vi.fn()
    });

    expect(renderToStaticMarkup(<>{tree}</>)).toContain("已标记已穿");
  });

  it("renders wardrobe labels, color names, and season chips in Chinese without visible enum text", async () => {
    const appModule = await import("../src/App");
    const WardrobeView = (appModule as {
      WardrobeView?: (props: {
        garments: Garment[];
        selectedIds: number[];
        busy: boolean;
        onRefresh: () => void;
        onSelect: (ids: number[]) => void;
        onUpdate: (id: number, update: Partial<Garment>) => void;
        onDelete: (id: number) => void;
        onBulkConfirm: () => void;
      }) => ReactNode;
    }).WardrobeView;

    expect(WardrobeView).toEqual(expect.any(Function));

    const tree = WardrobeView?.({
      garments: [
        makeGarment(303, "短款针织衫", "top", {
          brand: "优衣库",
          rawName: "优衣库女装短款针织衫春秋新款长标题",
          color: "blue",
          warmth: "light",
          seasons: ["spring", "winter"]
        })
      ],
      selectedIds: [],
      busy: false,
      onRefresh: vi.fn(),
      onSelect: vi.fn(),
      onUpdate: vi.fn(),
      onDelete: vi.fn(),
      onBulkConfirm: vi.fn()
    });

    const markup = renderToStaticMarkup(<>{tree}</>);

    expect(markup).toContain("优衣库");
    expect(markup).toContain('value="短款针织衫"');
    expect(markup).toContain("上装");
    expect(markup).toContain("蓝色");
    expect(markup).toContain("轻薄");
    expect(markup).toContain(">春<");
    expect(markup).toContain(">冬<");
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).not.toContain(">top<");
    expect(markup).not.toContain(">blue<");
    expect(markup).not.toContain(">light<");
    expect(markup).not.toContain(">spring<");
    expect(markup).not.toContain(">winter<");
  });

  it("collapses extra recommendation reasons and alternatives behind a Chinese details summary", async () => {
    const weather = makeWeather();
    const outfit: OutfitRecommendation = {
      ...makeOutfit(),
      reasons: ["体感温度适合", "颜色协调", "第三条理由"],
      alternatives: [makeGarment(404, "灰色夹克", "outerwear", { brand: "COS" })]
    };
    const appModule = await import("../src/App");
    const RecommendationView = (appModule as {
      RecommendationView?: (props: {
        weather: WeatherSnapshot;
        recommendations: RecommendationResult;
        occasion: string;
        latitude: string;
        longitude: string;
        busy: boolean;
        recordingOutfitId: string | null;
        wearLogFeedback: { outfitId: string; message: string } | null;
        onOccasion: (value: string) => void;
        onFetchWeather: () => void;
        onGenerate: () => void;
        onRecordWearLog: (outfit: OutfitRecommendation) => void;
      }) => ReactNode;
    }).RecommendationView;

    expect(RecommendationView).toEqual(expect.any(Function));

    const tree = RecommendationView?.({
      weather,
      recommendations: {
        weather,
        occasion: "casual",
        outfits: [outfit]
      },
      occasion: "casual",
      latitude: "39.9042",
      longitude: "116.4074",
      busy: false,
      recordingOutfitId: null,
      wearLogFeedback: null,
      onOccasion: vi.fn(),
      onFetchWeather: vi.fn(),
      onGenerate: vi.fn(),
      onRecordWearLog: vi.fn()
    });

    const markup = renderToStaticMarkup(<>{tree}</>);
    const visibleSummary = markup.slice(0, markup.indexOf("<details"));

    expect(visibleSummary).toContain("体感温度适合");
    expect(visibleSummary).toContain("颜色协调");
    expect(visibleSummary).not.toContain("第三条理由");
    expect(markup).toContain("<summary>更多理由和替代单品</summary>");
    expect(markup).toContain("第三条理由");
    expect(markup).toContain("可替换");
    expect(markup).toContain("COS");
    expect(markup).toContain("灰色夹克");
  });
});

function makeWeather(): WeatherSnapshot {
  return {
    date: "2026-06-11",
    temperature: 24,
    apparentTemperature: 25,
    precipitationProbability: 15,
    windSpeed: 9,
    weatherCode: 1,
    summary: "晴"
  };
}

function makeOutfit(): OutfitRecommendation {
  return {
    id: "outfit-1",
    score: 91,
    items: [
      makeGarment(101, "白衬衫", "top", { brand: "无印良品", rawName: "无印良品白衬衫长标题" }),
      makeGarment(202, "黑长裤", "bottom", { brand: "优衣库", rawName: "优衣库黑长裤长标题" })
    ],
    reasons: ["适合通勤"],
    alternatives: []
  };
}

function makeGarment(
  id: number,
  name: string,
  category: Garment["category"],
  overrides: Partial<Garment> & { brand?: string; rawName?: string } = {}
): Garment {
  const garment = {
    id,
    name,
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
    confidence: 1,
    brand: overrides.brand ?? "",
    rawName: overrides.rawName ?? name,
    ...overrides
  };
  return garment as Garment;
}

function findButtonsByText(node: ReactNode, text: string): ReactElement[] {
  const matches: ReactElement[] = [];

  function visit(current: ReactNode) {
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    if (!isValidElement(current)) {
      return;
    }

    const props = current.props as { children?: ReactNode };
    if (current.type === "button" && elementText(props.children).includes(text)) {
      matches.push(current);
    }
    visit(props.children);
  }

  visit(node);
  return matches;
}

function elementText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(elementText).join("");
  }
  if (isValidElement(node)) {
    return elementText((node.props as { children?: ReactNode }).children);
  }
  return "";
}
