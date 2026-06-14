import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthView, HistoryInsightsView, ImportView, MainApp, SessionSummary, SettingsView } from "../src/App";
import type { Garment, OutfitRecommendation, RecommendationResult, WardrobeInsights, WeatherSnapshot } from "../src/shared/types";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("renders recommendation occasion chips in Chinese", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: vi.fn()
    });

    const markup = renderToStaticMarkup(<MainApp />);

    expect(markup).toContain(">休闲<");
    expect(markup).toContain(">商务休闲<");
    expect(markup).toContain(">正装<");
    expect(markup).toContain(">运动<");
    expect(markup).not.toContain(">casual<");
    expect(markup).not.toContain(">smart-casual<");
    expect(markup).not.toContain(">formal<");
    expect(markup).not.toContain(">sport<");
  });

  it("gives navigation icon buttons accessible names for compact layouts", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: vi.fn()
    });

    const markup = renderToStaticMarkup(<MainApp />);

    expect(markup).toContain('aria-label="今日推荐"');
    expect(markup).toContain('aria-label="衣服库');
    expect(markup).toContain('aria-label="导入"');
    expect(markup).toContain('aria-label="设置"');
  });

  it("renders first-run registration with username and password fields", () => {
    const markup = renderToStaticMarkup(
      <AuthView
        hasAccount={false}
        busy={false}
        error=""
        onSubmit={vi.fn()}
      />
    );

    expect(markup).toContain("创建本地账号");
    expect(markup).toContain("用户名");
    expect(markup).toContain("密码");
    expect(markup).toContain("创建并进入");
    expect(markup).not.toContain("邮箱");
  });

  it("renders login mode and auth error feedback", () => {
    const markup = renderToStaticMarkup(
      <AuthView
        hasAccount={true}
        busy={false}
        error="用户名或密码错误"
        onSubmit={vi.fn()}
      />
    );

    expect(markup).toContain("登录 Outfit");
    expect(markup).toContain("进入衣橱");
    expect(markup).toContain("用户名或密码错误");
  });

  it("wires the sidebar logout control", () => {
    const onLogout = vi.fn();
    const tree = SessionSummary({ user: { id: 1, username: "local_user" }, onLogout });

    const logoutButtons = findButtonsByText(tree, "退出");
    expect(logoutButtons).toHaveLength(1);

    logoutButtons[0].props.onClick();
    expect(onLogout).toHaveBeenCalled();
  });

  it("renders a control for reading Selenium capture artifacts into the import JSON box", () => {
    const markup = renderToStaticMarkup(
      <ImportView
        bookmarklet="https://example.com/bookmarklet"
        importText=""
        importResult={null}
        filterSummary={null}
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

  it("renders the wardrobe-only capture filter summary in the import view", () => {
    const markup = renderToStaticMarkup(
      <ImportView
        bookmarklet="https://example.com/bookmarklet"
        importText="{}"
        importResult={null}
        filterSummary={{
          originalItems: 8,
          keptItems: 3,
          skippedRefunded: 1,
          skippedNonApparel: 4
        }}
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

    expect(markup).toContain("已从 8 条订单中保留 3 条衣服/鞋候选");
    expect(markup).toContain("退款过滤 1 条");
    expect(markup).toContain("非服饰过滤 4 条");
  });

  it("keeps import controls operation-level while preview is running", () => {
    const tree = ImportView({
      bookmarklet: "https://example.com/bookmarklet",
      importText: "{}",
      importResult: null,
      filterSummary: null,
      captureUrl: "",
      captureResult: null,
      busy: true,
      busyAction: "preview-import",
      onCopyBookmarklet: vi.fn(),
      onImportText: vi.fn(),
      onImport: vi.fn(),
      onPreviewImport: vi.fn(),
      onCaptureUrl: vi.fn(),
      onStartOrdersCapture: vi.fn(),
      onStartItemCapture: vi.fn(),
      onReadLatestCapture: vi.fn()
    });

    expect(findButtonsByText(tree, "预览中")[0].props.disabled).toBe(true);
    expect(findButtonsByText(tree, "导入")[0].props.disabled).toBe(false);
    expect(findButtonsByText(tree, "读取产物")[0].props.disabled).toBe(false);
  });

  it("uses fifteen pages for Taobao order capture", async () => {
    const appModule = await import("../src/App");
    const buildTaobaoOrderCaptureOptions = (appModule as {
      buildTaobaoOrderCaptureOptions?: () => { maxPages: number; loginWait: number };
    }).buildTaobaoOrderCaptureOptions;

    expect(buildTaobaoOrderCaptureOptions?.()).toEqual({ maxPages: 15, loginWait: 60 });
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
    expect(markup).toContain("全部状态");
    expect(markup).toContain("全部类别");
    expect(markup).toContain("全部颜色");
    expect(markup).toContain("全部季节");
    expect(markup).toContain("全部拥有");
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

  it("does not render remote garment image URLs by default", async () => {
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

    const markup = renderToStaticMarkup(<>{WardrobeView?.({
      garments: [makeGarment(404, "远程图片衬衫", "top", { imageUrl: "https://img.alicdn.com/remote-shirt.jpg" })],
      selectedIds: [],
      busy: false,
      onRefresh: vi.fn(),
      onSelect: vi.fn(),
      onUpdate: vi.fn(),
      onDelete: vi.fn(),
      onBulkConfirm: vi.fn()
    })}</>);

    expect(markup).not.toContain("https://img.alicdn.com/remote-shirt.jpg");
    expect(markup).not.toContain("<img");
  });

  it("renders local cached garment thumbnails with privacy-preserving image attributes", async () => {
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

    const markup = renderToStaticMarkup(<>{WardrobeView?.({
      garments: [makeGarment(405, "本地缩略图衬衫", "top", { imageUrl: "/api/garment-thumbnails/garment-405-shirt.png" })],
      selectedIds: [],
      busy: false,
      onRefresh: vi.fn(),
      onSelect: vi.fn(),
      onUpdate: vi.fn(),
      onDelete: vi.fn(),
      onBulkConfirm: vi.fn()
    })}</>);

    expect(markup).toContain('src="/api/garment-thumbnails/garment-405-shirt.png"');
    expect(markup).toContain('loading="lazy"');
    expect(markup).toContain('decoding="async"');
    expect(markup).toContain('referrerPolicy="no-referrer"');
  });

  it("renders empty states for wardrobe and recommendation views", async () => {
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
    const RecommendationView = (appModule as {
      RecommendationView?: (props: {
        weather: WeatherSnapshot | null;
        recommendations: RecommendationResult | null;
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

    const wardrobeMarkup = renderToStaticMarkup(<>{WardrobeView?.({
      garments: [],
      selectedIds: [],
      busy: false,
      onRefresh: vi.fn(),
      onSelect: vi.fn(),
      onUpdate: vi.fn(),
      onDelete: vi.fn(),
      onBulkConfirm: vi.fn()
    })}</>);
    const recommendationMarkup = renderToStaticMarkup(<>{RecommendationView?.({
      weather: null,
      recommendations: null,
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
    })}</>);

    expect(wardrobeMarkup).toContain("还没有衣服");
    expect(recommendationMarkup).toContain("还没有推荐");
  });

  it("renders personal profile controls in settings", () => {
    const markup = renderToStaticMarkup(
      <SettingsView
        latitude="39.9042"
        longitude="116.4074"
        busy={false}
        profile={{
          heightCm: 176,
          weightKg: 57,
          bodyType: "slim-tall",
          skinTone: "dark-yellow",
          colorDisposition: "cool-clean",
          temperatureSensitivity: "neutral",
          preferredColors: ["white", "blue"],
          avoidedColors: ["yellow", "brown"],
          preferredStyles: ["smart-casual"]
        }}
        onLatitude={vi.fn()}
        onLongitude={vi.fn()}
        onLocate={vi.fn()}
        onSave={vi.fn()}
        onProfile={vi.fn()}
      />
    );

    expect(markup).toContain("个人画像");
    expect(markup).toContain('value="176"');
    expect(markup).toContain('value="57"');
    expect(markup).toContain("瘦高");
    expect(markup).toContain("较黑黄");
    expect(markup).toContain("白色,蓝色");
    expect(markup).toContain("黄色,棕色");
  });

  it("renders wardrobe detail fields for size materials patterns and tags", async () => {
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

    const markup = renderToStaticMarkup(<>{WardrobeView?.({
      garments: [
        makeGarment(303, "白色挺括衬衫", "top", {
          size: "M",
          materials: ["cotton"],
          patterns: ["solid"],
          tags: ["挺括", "层次"]
        })
      ],
      selectedIds: [],
      busy: false,
      onRefresh: vi.fn(),
      onSelect: vi.fn(),
      onUpdate: vi.fn(),
      onDelete: vi.fn(),
      onBulkConfirm: vi.fn()
    })}</>);

    expect(markup).toContain("尺码");
    expect(markup).toContain("材质");
    expect(markup).toContain("图案");
    expect(markup).toContain("标签");
    expect(markup).toContain('value="M"');
    expect(markup).toContain('value="cotton"');
    expect(markup).toContain('value="solid"');
    expect(markup).toContain('value="挺括,层次"');
  });

  it("renders history insights metrics and export control", () => {
    const insights: WardrobeInsights = {
      totalGarments: 4,
      ownedGarments: 4,
      confirmedGarments: 2,
      pendingGarments: 2,
      categoryDistribution: { top: 1, bottom: 1, shoes: 1, outerwear: 1 },
      colorDistribution: { white: 1, blue: 1 },
      mostWorn: [{ id: 101, name: "白衬衫", wearCount: 2 }],
      neverWorn: [{ id: 202, name: "黑长裤", category: "bottom" }]
    };

    const markup = renderToStaticMarkup(
      <HistoryInsightsView
        insights={insights}
        wearLogs={[{ id: 1, garmentIds: [101], context: { occasion: "casual" }, wornAt: "2026-06-12T00:00:00.000Z" }]}
        recommendationRuns={[{ id: 2, input: {}, result: {}, createdAt: "2026-06-12T00:00:00.000Z" }]}
        busy={false}
        onRefresh={vi.fn()}
        onExport={vi.fn()}
      />
    );

    expect(markup).toContain("历史洞察");
    expect(markup).toContain("常穿单品");
    expect(markup).toContain("近期未穿");
    expect(markup).toContain("白衬衫");
    expect(markup).toContain("导出备份");
  });

  it("asks for explicit confirmation before deleting a garment", async () => {
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
    const onDelete = vi.fn();
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);

    const tree = WardrobeView?.({
      garments: [makeGarment(303, "短款针织衫", "top")],
      selectedIds: [],
      busy: false,
      onRefresh: vi.fn(),
      onSelect: vi.fn(),
      onUpdate: vi.fn(),
      onDelete,
      onBulkConfirm: vi.fn()
    });

    findButtonsByTitle(tree, "删除")[0].props.onClick();
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("短款针织衫"));
    expect(onDelete).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    findButtonsByTitle(tree, "删除")[0].props.onClick();
    expect(onDelete).toHaveBeenCalledWith(303);
  });

  it("selects the current wardrobe result set for batch actions", async () => {
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
    const onSelect = vi.fn();

    const tree = WardrobeView?.({
      garments: [
        makeGarment(101, "白衬衫", "top"),
        makeGarment(202, "黑长裤", "bottom")
      ],
      selectedIds: [],
      busy: false,
      onRefresh: vi.fn(),
      onSelect,
      onUpdate: vi.fn(),
      onDelete: vi.fn(),
      onBulkConfirm: vi.fn()
    });

    findButtonsByText(tree, "选择当前结果")[0].props.onClick();
    expect(onSelect).toHaveBeenCalledWith([101, 202]);
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

  it("keeps recommendation score badges from stretching when an outfit expands", () => {
    const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

    expect(cssRule(styles, ".outfit-grid")).toMatch(/align-items:\s*start;/);
    expect(cssRule(styles, ".outfit")).toMatch(/align-content:\s*start;/);
    expect(cssRule(styles, ".score")).toMatch(/align-self:\s*start;/);
  });

  it("uses resilient layout utilities for filters and long imported text", () => {
    const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

    expect(cssRule(styles, ".filter-bar")).toMatch(/repeat\(auto-fit,\s*minmax\(min\(100%,\s*12rem\),\s*1fr\)\)/);
    expect(cssRule(styles, ".text-wrap-anywhere")).toMatch(/overflow-wrap:\s*anywhere;/);
    expect(cssRule(styles, ".text-wrap-anywhere")).toMatch(/word-break:\s*break-word;/);
  });
});

function cssRule(styles: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, "m").exec(styles);
  return match?.[1] ?? "";
}

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

function findButtonsByTitle(node: ReactNode, title: string): ReactElement[] {
  const matches: ReactElement[] = [];

  function visit(current: ReactNode) {
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    if (!isValidElement(current)) {
      return;
    }

    const props = current.props as { children?: ReactNode; title?: string };
    if (current.type === "button" && props.title === title) {
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
