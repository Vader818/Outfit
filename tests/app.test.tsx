import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App, AuthView, HistoryInsightsView, ImportView, MainApp, RecommendationView, SessionSummary, SettingsView, ThumbnailPicker, WardrobeView } from "../src/App";
import { Button, Field, PageIntro, Surface } from "../src/components/ui";
import type { CaptureEngine, Garment, OutfitRecommendation, RecommendationResult, TaobaoImportPreview, ThumbnailCandidate, VisionModelsResponse, WardrobeInsights, WeatherSnapshot } from "../src/shared/types";

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

  it("falls back to default settings when browser storage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("storage blocked");
      },
      setItem: vi.fn()
    });

    expect(() => renderToStaticMarkup(<MainApp />)).not.toThrow();
  });

  it("renders a private local loading panel without liquid glass classes", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: vi.fn()
    });

    const markup = renderToStaticMarkup(<App />);

    expectClassTokens(markup, ["auth-panel", "auth-panel--loading"]);
    expect(markup).toContain("正在打开你的衣橱");
    expect(markup).toContain("保存在本机");
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toContain("liquid-");
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
    expect(markup).toContain('for="auth-username"');
    expect(markup).toContain('id="auth-username"');
    expect(markup).toContain('for="auth-password"');
    expect(markup).toContain('id="auth-password"');
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
    expect(markup).toContain('role="alert"');
  });

  it("wires the sidebar logout control", () => {
    const onLogout = vi.fn();
    const tree = SessionSummary({ user: { id: 1, username: "local_user" }, onLogout });

    const logoutButtons = findButtonsByText(tree, "退出");
    expect(logoutButtons).toHaveLength(1);

    logoutButtons[0].props.onClick();
    expect(onLogout).toHaveBeenCalled();
  });

  it("renders a compact mobile header, logout control, and visible navigation labels", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: vi.fn()
    });

    const markup = renderToStaticMarkup(
      <MainApp user={{ id: 1, username: "local_user" }} onLogout={vi.fn()} />
    );

    expectClassTokens(markup, ["mobile-header"]);
    expectClassTokens(markup, ["mobile-nav"]);
    expect(markup).toContain('aria-label="退出"');
    expect(markup).toContain('aria-label="移动导航"');
    expect(markup).toContain('class="app-nav__label">今日推荐</span>');
    expect(markup).toContain('class="app-nav__label">衣服库</span>');
    expect(markup).toContain('class="app-nav__label">历史洞察</span>');
    expect(markup).toContain('class="app-nav__label">导入</span>');
    expect(markup).toContain('class="app-nav__label">设置</span>');
  });

  it("renders a control for reading Selenium capture artifacts into the import JSON box", () => {
    const markup = renderToStaticMarkup(
      <ImportView
        bookmarklet="https://example.com/bookmarklet"
        importText=""
        importResult={null}
        filterSummary={null}
        captureUrl=""
        captureEngine="selenium"
        captureResult={null}
        busy={false}
        onCopyBookmarklet={vi.fn()}
        onImportText={vi.fn()}
        onImport={vi.fn()}
        onCaptureUrl={vi.fn()}
        onCaptureEngine={vi.fn()}
        onStartOrdersCapture={vi.fn()}
        onStartItemCapture={vi.fn()}
        onReadLatestCapture={vi.fn()}
      />
    );

    expect(markup).toContain("读取产物");
  });

  it("renders item-detail capture engine choices for interactive Playwright capture", () => {
    const markup = renderToStaticMarkup(
      <ImportView
        bookmarklet="https://example.com/bookmarklet"
        importText=""
        importResult={null}
        filterSummary={null}
        captureUrl=""
        captureEngine="playwright"
        captureResult={null}
        busy={false}
        onCopyBookmarklet={vi.fn()}
        onImportText={vi.fn()}
        onImport={vi.fn()}
        onCaptureUrl={vi.fn()}
        onCaptureEngine={vi.fn()}
        onStartOrdersCapture={vi.fn()}
        onStartItemCapture={vi.fn()}
        onReadLatestCapture={vi.fn()}
      />
    );

    expect(markup).toContain("采集引擎");
    expect(markup).toContain("Selenium");
    expect(markup).toContain("Playwright");
    expect(markup).toContain('value="playwright"');
    expect(markup).toContain("checked");
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
        captureEngine="selenium"
        captureResult={null}
        busy={false}
        onCopyBookmarklet={vi.fn()}
        onImportText={vi.fn()}
        onImport={vi.fn()}
        onCaptureUrl={vi.fn()}
        onCaptureEngine={vi.fn()}
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
      captureEngine: "selenium" as CaptureEngine,
      captureResult: null,
      busy: true,
      busyAction: "preview-import",
      onCopyBookmarklet: vi.fn(),
      onImportText: vi.fn(),
      onImport: vi.fn(),
      onPreviewImport: vi.fn(),
      onCaptureUrl: vi.fn(),
      onCaptureEngine: vi.fn(),
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

  it("renders the recommendation wear action and passes the selected outfit callback", async () => {
    const weather = makeWeather();
    const outfit = makeOutfit();
    const recommendations: RecommendationResult = {
      weather,
      occasion: "casual",
      outfits: [outfit],
      missingSlots: []
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

    const markup = renderToStaticMarkup(<>{tree}</>);
    const stages = findElementsByComponentName(tree, "OutfitStage");

    expect(markup).toContain("标记已穿");
    expect(stages).toHaveLength(1);
    expect(stages[0].props.outfit).toBe(outfit);
    expect(stages[0].props.onRecordWearLog).toBe(onRecordWearLog);

    stages[0].props.onRecordWearLog(stages[0].props.outfit);
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
        outfits: [outfit],
        missingSlots: []
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

    const markup = renderToStaticMarkup(<>{tree}</>);
    expect(markup).toContain("已标记已穿");
    expect(markup).toContain('role="status"');
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

  it("renders trusted Taobao remote garment images and still blocks unrelated remote URLs", async () => {
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

    const trustedMarkup = renderToStaticMarkup(<>{WardrobeView?.({
      garments: [makeGarment(404, "远程图片衬衫", "top", { imageUrl: "https://img.alicdn.com/remote-shirt.jpg" })],
      selectedIds: [],
      busy: false,
      onRefresh: vi.fn(),
      onSelect: vi.fn(),
      onUpdate: vi.fn(),
      onDelete: vi.fn(),
      onBulkConfirm: vi.fn()
    })}</>);
    const blockedMarkup = renderToStaticMarkup(<>{WardrobeView?.({
      garments: [makeGarment(405, "外站图片衬衫", "top", { imageUrl: "https://example.com/remote-shirt.jpg" })],
      selectedIds: [],
      busy: false,
      onRefresh: vi.fn(),
      onSelect: vi.fn(),
      onUpdate: vi.fn(),
      onDelete: vi.fn(),
      onBulkConfirm: vi.fn()
    })}</>);

    expect(trustedMarkup).toContain('src="https://img.alicdn.com/remote-shirt.jpg"');
    expect(trustedMarkup).toContain('referrerPolicy="no-referrer"');
    expect(blockedMarkup).not.toContain("https://example.com/remote-shirt.jpg");
    expect(blockedMarkup).not.toContain("<img");
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

  it("prefers local cutout images over original thumbnails when available", async () => {
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
      garments: [makeGarment(406, "透明背景衬衫", "top", {
        imageUrl: "/api/garment-thumbnails/garment-406-shirt.png",
        cutoutImageUrl: "/api/garment-thumbnails/garment-406-shirt-cutout.png"
      })],
      selectedIds: [],
      busy: false,
      onRefresh: vi.fn(),
      onSelect: vi.fn(),
      onUpdate: vi.fn(),
      onDelete: vi.fn(),
      onBulkConfirm: vi.fn()
    })}</>);

    expect(markup).toContain('src="/api/garment-thumbnails/garment-406-shirt-cutout.png"');
    expect(markup).not.toContain('src="/api/garment-thumbnails/garment-406-shirt.png"');
  });

  it("renders local vision actions and suggestion confirmation controls in the wardrobe", async () => {
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
        onCutoutGarment?: (id: number) => void;
        onAnalyzeGarmentVision?: (id: number) => void;
      }) => ReactNode;
    }).WardrobeView;
    const onUpdate = vi.fn();
    const onCutoutGarment = vi.fn();
    const onAnalyzeGarmentVision = vi.fn();

    const tree = WardrobeView?.({
      garments: [
        makeGarment(405, "本地缩略图衬衫", "top", {
          imageUrl: "/api/garment-thumbnails/garment-405-shirt.png",
          visionTags: {
            category: "top",
            styles: ["smart-casual"],
            patterns: ["solid"],
            tags: ["cotton"],
            scores: [{ label: "top", score: 0.92 }]
          }
        })
      ],
      selectedIds: [],
      busy: false,
      onRefresh: vi.fn(),
      onSelect: vi.fn(),
      onUpdate,
      onDelete: vi.fn(),
      onBulkConfirm: vi.fn(),
      onCutoutGarment,
      onAnalyzeGarmentVision
    });

    const markup = renderToStaticMarkup(<>{tree}</>);
    expect(markup).toContain("去背景");
    expect(markup).toContain("分析图片");
    expect(markup).toContain("视觉建议");
    expect(markup).toContain("smart-casual");
    expect(markup).toContain("cotton");

    const garmentItem = findElementsByComponentName(tree, "GarmentItem")[0];
    const garmentTree = renderFunctionElement(garmentItem);
    const garmentEditor = findElementsByComponentName(garmentTree, "GarmentEditor")[0];
    const editorTree = renderFunctionElement(garmentEditor);
    const visionSuggestion = findElementsByComponentName(editorTree, "VisionSuggestion")[0];
    const suggestionTree = renderFunctionElement(visionSuggestion);

    findButtonsByText(garmentTree, "去背景")[0].props.onClick();
    findButtonsByText(garmentTree, "分析图片")[0].props.onClick();
    findButtonsByText(suggestionTree, "应用建议")[0].props.onClick();

    expect(onCutoutGarment).toHaveBeenCalledWith(405);
    expect(onAnalyzeGarmentVision).toHaveBeenCalledWith(405);
    expect(onUpdate).toHaveBeenCalledWith(405, {
      category: "top",
      styles: ["smart-casual"],
      patterns: ["solid"],
      tags: ["cotton"]
    });
  });

  it("marks a visual suggestion as applied when the garment already matches it", async () => {
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
        onAnalyzeGarmentVision?: (id: number) => void;
      }) => ReactNode;
    }).WardrobeView;

    const tree = WardrobeView?.({
      garments: [
        makeGarment(407, "视觉匹配衬衫", "top", {
          styles: ["smart-casual"],
          patterns: ["solid"],
          tags: ["cotton"],
          visionTags: {
            category: "top",
            styles: ["smart-casual"],
            patterns: ["solid"],
            tags: ["cotton"],
            scores: [{ label: "top", score: 0.92 }]
          }
        })
      ],
      selectedIds: [],
      busy: false,
      onRefresh: vi.fn(),
      onSelect: vi.fn(),
      onUpdate: vi.fn(),
      onDelete: vi.fn(),
      onBulkConfirm: vi.fn(),
      onAnalyzeGarmentVision: vi.fn()
    });

    const markup = renderToStaticMarkup(<>{tree}</>);
    const garmentTree = renderFunctionElement(findElementsByComponentName(tree, "GarmentItem")[0]);
    const editorTree = renderFunctionElement(findElementsByComponentName(garmentTree, "GarmentEditor")[0]);
    const suggestionTree = renderFunctionElement(findElementsByComponentName(editorTree, "VisionSuggestion")[0]);
    const appliedButtons = findButtonsByText(suggestionTree, "已应用");

    expect(appliedButtons).toHaveLength(1);
    expect(markup).toContain("已应用");
    expect(markup).not.toContain("应用建议");

    const appliedButton = appliedButtons[0];
    expect(appliedButton.props.disabled).toBe(true);
  });

  it("renders the wardrobe thumbnail picker action and passes the selected garment", async () => {
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
        onOpenThumbnailPicker?: (garment: Garment) => void;
      }) => ReactNode;
    }).WardrobeView;
    const garment = makeGarment(407, "手动缩略图衬衫", "top");
    const onOpenThumbnailPicker = vi.fn();

    const tree = WardrobeView?.({
      garments: [garment],
      selectedIds: [],
      busy: false,
      onRefresh: vi.fn(),
      onSelect: vi.fn(),
      onUpdate: vi.fn(),
      onDelete: vi.fn(),
      onBulkConfirm: vi.fn(),
      onOpenThumbnailPicker
    });

    expect(renderToStaticMarkup(<>{tree}</>)).toContain("选择缩略图");
    const garmentTree = renderFunctionElement(findElementsByComponentName(tree, "GarmentItem")[0]);
    findButtonsByText(garmentTree, "选择缩略图")[0].props.onClick();
    expect(onOpenThumbnailPicker).toHaveBeenCalledWith(expect.objectContaining({ id: 407 }));
  });

  it("renders thumbnail candidates with selected state, errors, and save controls", () => {
    const garment = makeGarment(408, "候选缩略图衬衫", "top");
    const candidates: ThumbnailCandidate[] = [
      {
        url: "https://img.alicdn.com/imgextra/i1/100/O1CN01current.jpg",
        source: "current",
        score: 130,
        selected: true
      },
      {
        url: "https://img.alicdn.com/imgextra/i2/100/O1CN01detail.jpg",
        source: "detail",
        score: 120,
        selected: false
      }
    ];
    const onSelect = vi.fn();
    const onSave = vi.fn();
    const onClose = vi.fn();

    const tree = ThumbnailPicker({
      garment,
      candidates,
      selectedUrl: candidates[0].url,
      loading: false,
      saving: false,
      error: "保存失败",
      onSelect,
      onSave,
      onClose
    });
    const markup = renderToStaticMarkup(<>{tree}</>);

    expect(markup).toContain("选择缩略图");
    expect(markup).toContain("候选缩略图衬衫");
    expect(markup).toContain("当前图");
    expect(markup).toContain("详情图");
    expect(markup).toContain("保存失败");
    expect(markup).toContain("<dialog");
    expectClassTokens(markup, ["ui-dialog", "thumbnail-dialog"]);
    expect(markup).toContain('aria-labelledby="thumbnail-dialog-title-408"');
    expect(markup).toContain('role="alert"');
    expect(markup).not.toContain("liquid-");
    expectClassTokens(markup, ["thumbnail-candidate", "thumbnail-candidate--selected"]);
    expect(markup).toContain('aria-pressed="true"');
    findButtonsByText(tree, "详情图")[0].props.onClick();
    findButtonsByText(tree, "保存为主图")[0].props.onClick();
    findButtonsByText(tree, "关闭")[0].props.onClick();
    expect(onSelect).toHaveBeenCalledWith(candidates[1].url);
    expect(onSave).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("styles the native thumbnail dialog and responsive candidate grid", () => {
    const styles = readAppStyles();

    expect(cssRule(styles, ".ui-dialog")).toMatch(/max-height:\s*min\(48rem,\s*calc\(100dvh\s*-\s*2rem\)\);/);
    expect(cssRule(styles, ".thumbnail-dialog__skeletons")).toMatch(/grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(9rem,\s*1fr\)\);/);
    expect(styles).toMatch(/@media\s+\(max-width:\s*520px\)[\s\S]*\.thumbnail-dialog__candidates\s*{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
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

    expect(wardrobeMarkup).toContain("衣橱还是空的");
    expectClassTokens(wardrobeMarkup, ["ui-empty"]);
    expect(recommendationMarkup).toContain("还没有推荐");
    expectClassTokens(recommendationMarkup, ["recommendation-empty-stage"]);
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

  it("keeps blank profile numbers undefined instead of saving them as zero", () => {
    const onProfile = vi.fn();
    const tree = SettingsView({
      latitude: "39.9042",
      longitude: "116.4074",
      busy: false,
      profile: {
        heightCm: 176,
        weightKg: 57,
        bodyType: "slim-tall",
        skinTone: "dark-yellow",
        colorDisposition: "cool-clean",
        temperatureSensitivity: "neutral",
        preferredColors: ["white"],
        avoidedColors: [],
        preferredStyles: []
      },
      onLatitude: vi.fn(),
      onLongitude: vi.fn(),
      onLocate: vi.fn(),
      onSave: vi.fn(),
      onProfile
    });

    const [heightInput, weightInput] = findInputsByType(tree, "number");
    heightInput.props.onChange({ target: { value: "" } });
    weightInput.props.onChange({ target: { value: "   " } });

    expect(onProfile).toHaveBeenNthCalledWith(1, expect.objectContaining({ heightCm: undefined }));
    expect(onProfile).toHaveBeenNthCalledWith(2, expect.objectContaining({ weightKg: undefined }));
  });

  it("renders local vision model status and download controls in settings", () => {
    const visionModels: VisionModelsResponse = {
      modelRoot: "output\\models",
      models: [
        {
          id: "rembg-isnet",
          label: "rembg isnet-general-use",
          kind: "background-removal",
          installed: false,
          path: "output\\models\\rembg",
          message: "未下载"
        },
        {
          id: "clip-vit-base-patch32",
          label: "Xenova clip-vit-base-patch32",
          kind: "tagging",
          installed: true,
          path: "output\\models\\huggingface\\Xenova\\clip-vit-base-patch32",
          message: "已可用"
        }
      ],
      jobs: []
    };
    const onDownloadVisionModel = vi.fn();

    const tree = SettingsView({
      latitude: "39.9042",
      longitude: "116.4074",
      busy: false,
      profile: {
        heightCm: 176,
        weightKg: 57,
        bodyType: "slim-tall",
        skinTone: "dark-yellow",
        colorDisposition: "cool-clean",
        temperatureSensitivity: "neutral",
        preferredColors: ["white"],
        avoidedColors: [],
        preferredStyles: []
      },
      visionModels,
      onLatitude: vi.fn(),
      onLongitude: vi.fn(),
      onLocate: vi.fn(),
      onSave: vi.fn(),
      onProfile: vi.fn(),
      onRefreshVisionModels: vi.fn(),
      onDownloadVisionModel
    });
    const markup = renderToStaticMarkup(<>{tree}</>);

    expect(markup).toContain("本地视觉模型");
    expect(markup).toContain("不会上传图片");
    expect(markup).toContain("rembg isnet-general-use");
    expect(markup).toContain("未下载");
    expect(markup).toContain("Xenova clip-vit-base-patch32");
    expect(markup).toContain("已可用");
    expect(markup).toContain("output\\models");

    findButtonsByText(tree, "下载")[0].props.onClick();
    expect(onDownloadVisionModel).toHaveBeenCalledWith("rembg-isnet");
  });

  it("renders local vision enablement, verification controls, and job states in settings", () => {
    const visionModels: VisionModelsResponse = {
      modelRoot: "output\\models",
      models: [
        {
          id: "rembg-isnet",
          label: "rembg isnet-general-use",
          kind: "background-removal",
          installed: false,
          path: "output\\models\\rembg",
          message: "未下载",
          job: {
            id: "vision_running",
            modelId: "rembg-isnet",
            action: "download",
            status: "running",
            message: "本地模型下载已启动",
            startedAt: "2026-06-18T00:00:00.000Z",
            updatedAt: "2026-06-18T00:00:00.000Z"
          }
        },
        {
          id: "clip-vit-base-patch32",
          label: "Xenova clip-vit-base-patch32",
          kind: "tagging",
          installed: true,
          path: "output\\models\\huggingface\\Xenova\\clip-vit-base-patch32",
          message: "已可用",
          job: {
            id: "vision_failed",
            modelId: "clip-vit-base-patch32",
            action: "verify",
            status: "failed",
            message: "模型验证失败",
            startedAt: "2026-06-18T00:00:00.000Z",
            updatedAt: "2026-06-18T00:01:00.000Z",
            error: "clip model missing"
          }
        }
      ],
      jobs: []
    };
    const onVerifyVisionModel = vi.fn();
    const onVisionEnabled = vi.fn();

    const tree = SettingsView({
      latitude: "39.9042",
      longitude: "116.4074",
      busy: false,
      profile: {
        heightCm: 176,
        weightKg: 57,
        bodyType: "slim-tall",
        skinTone: "dark-yellow",
        colorDisposition: "cool-clean",
        temperatureSensitivity: "neutral",
        preferredColors: ["white"],
        avoidedColors: [],
        preferredStyles: []
      },
      visionModels,
      visionEnabled: true,
      onVisionEnabled,
      onLatitude: vi.fn(),
      onLongitude: vi.fn(),
      onLocate: vi.fn(),
      onSave: vi.fn(),
      onProfile: vi.fn(),
      onRefreshVisionModels: vi.fn(),
      onDownloadVisionModel: vi.fn(),
      onVerifyVisionModel
    });
    const markup = renderToStaticMarkup(<>{tree}</>);

    expect(markup).toContain("启用本地视觉");
    expect(markup).toContain("下载中");
    expect(markup).toContain("失败");
    expect(markup).toContain("clip model missing");

    const enabledVerifyButton = findButtonsByText(tree, "验证").find((button) => !button.props.disabled);
    expect(enabledVerifyButton).toEqual(expect.any(Object));
    enabledVerifyButton?.props.onClick();
    expect(onVerifyVisionModel).toHaveBeenCalledWith("clip-vit-base-patch32");

    findInputsByType(tree, "checkbox")[0].props.onChange({ target: { checked: false } });
    expect(onVisionEnabled).toHaveBeenCalledWith(false);
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

  it("builds an immediate optimistic garment patch for inline editing", async () => {
    const appModule = await import("../src/App");
    const applyGarmentPatch = (appModule as {
      applyGarmentPatch?: (garments: Garment[], id: number, update: Partial<Garment>) => Garment[];
    }).applyGarmentPatch;
    const original = makeGarment(303, "白色衬衫", "top");

    expect(applyGarmentPatch).toEqual(expect.any(Function));

    const next = applyGarmentPatch?.([original], 303, { name: "白色牛津纺衬衫" });

    expect(next?.[0]).toMatchObject({ id: 303, name: "白色牛津纺衬衫" });
    expect(next?.[0]).not.toBe(original);
    expect(original.name).toBe("白色衬衫");
  });

  it("converts garment refresh API failures into visible error state", async () => {
    const appModule = await import("../src/App");
    const refreshGarmentsForView = (appModule as {
      refreshGarmentsForView?: (
        loadGarments: () => Promise<Garment[]>,
        onGarments: (garments: Garment[]) => void,
        onError: (message: string) => void
      ) => Promise<void>;
    }).refreshGarmentsForView;
    const onGarments = vi.fn();
    const onError = vi.fn();

    expect(refreshGarmentsForView).toEqual(expect.any(Function));

    await expect(refreshGarmentsForView?.(
      () => Promise.reject(new Error("衣橱 API 失败")),
      onGarments,
      onError
    )).resolves.toBeUndefined();

    expect(onGarments).not.toHaveBeenCalled();
    expect(onError).toHaveBeenNthCalledWith(1, "");
    expect(onError).toHaveBeenLastCalledWith("衣橱 API 失败");
  });

  it("converts failed clipboard copies into visible error state", async () => {
    const appModule = await import("../src/App");
    const copyTextToClipboard = (appModule as {
      copyTextToClipboard?: (
        writeText: (text: string) => Promise<unknown>,
        text: string,
        onError: (message: string) => void
      ) => Promise<void>;
    }).copyTextToClipboard;
    const onError = vi.fn();

    expect(copyTextToClipboard).toEqual(expect.any(Function));

    await expect(copyTextToClipboard?.(
      () => Promise.reject(new Error("剪贴板被浏览器拦截")),
      "javascript:void 0",
      onError
    )).resolves.toBeUndefined();

    expect(onError).toHaveBeenNthCalledWith(1, "");
    expect(onError).toHaveBeenLastCalledWith("剪贴板被浏览器拦截");
  });

  it("keeps failed garment deletion visible without mutating local wardrobe state", async () => {
    const appModule = await import("../src/App");
    const deleteGarmentForView = (appModule as {
      deleteGarmentForView?: (
        removeGarment: (id: number) => Promise<void>,
        id: number,
        onGarments: (updater: (items: Garment[]) => Garment[]) => void,
        onSelectedIds: (updater: (ids: number[]) => number[]) => void,
        onError: (message: string) => void
      ) => Promise<void>;
    }).deleteGarmentForView;
    const onGarments = vi.fn();
    const onSelectedIds = vi.fn();
    const onError = vi.fn();

    expect(deleteGarmentForView).toEqual(expect.any(Function));

    await expect(deleteGarmentForView?.(
      () => Promise.reject(new Error("删除失败")),
      303,
      onGarments,
      onSelectedIds,
      onError
    )).resolves.toBeUndefined();

    expect(onGarments).not.toHaveBeenCalled();
    expect(onSelectedIds).not.toHaveBeenCalled();
    expect(onError).toHaveBeenNthCalledWith(1, "");
    expect(onError).toHaveBeenLastCalledWith("删除失败");
  });

  it("clears cached weather and recommendations when a location coordinate changes", async () => {
    const appModule = await import("../src/App");
    const updateCoordinateForRecommendation = (appModule as {
      updateCoordinateForRecommendation?: (
        value: string,
        onCoordinate: (value: string) => void,
        onWeather: (weather: WeatherSnapshot | null) => void,
        onRecommendations: (recommendations: RecommendationResult | null) => void
      ) => void;
    }).updateCoordinateForRecommendation;
    const onCoordinate = vi.fn();
    const onWeather = vi.fn();
    const onRecommendations = vi.fn();

    expect(updateCoordinateForRecommendation).toEqual(expect.any(Function));

    updateCoordinateForRecommendation?.("31.2304", onCoordinate, onWeather, onRecommendations);

    expect(onCoordinate).toHaveBeenCalledWith("31.2304");
    expect(onWeather).toHaveBeenCalledWith(null);
    expect(onRecommendations).toHaveBeenCalledWith(null);
  });

  it("renders history insights metrics and export control", () => {
    const insights = {
      totalGarments: 4,
      ownedGarments: 4,
      confirmedGarments: 2,
      pendingGarments: 2,
      categoryDistribution: { top: 1, bottom: 1, shoes: 1, outerwear: 1 },
      colorDistribution: { white: 1, blue: 1 },
      mostWorn: [{ id: 101, name: "白衬衫", wearCount: 2 }],
      neverWorn: [{ id: 202, name: "黑长裤", category: "bottom" }],
      seasonDistribution: { spring: 3, summer: 2, autumn: 2, winter: 1 },
      styleDistribution: { casual: 3, "smart-casual": 2 },
      formalityDistribution: { casual: 2, "smart-casual": 2 },
      styleTendency: {
        dominantStyles: [{ key: "casual", count: 3, ratio: 75 }],
        dominantFormalities: [{ key: "smart-casual", count: 2, ratio: 50 }]
      },
      health: {
        score: 64,
        level: "needs-attention",
        components: {
          coreCompleteness: 60,
          seasonCoverage: 50,
          styleCoverage: 70,
          confirmationRate: 50,
          utilizationRate: 25
        },
        issues: ["外套不足，换季层次会受限。"]
      },
      insightSuggestions: [
        {
          id: "top-heavy",
          priority: "medium",
          title: "上装占比偏高",
          detail: "上装超过衣橱 40%，后续购买可优先考虑下装或鞋履。"
        }
      ],
      shoppingSuggestions: [
        {
          id: "add-outerwear",
          priority: "high",
          title: "补充一件经典外套",
          detail: "外套数量不足，换季搭配会受限。"
        }
      ],
      bodySuggestions: [
        {
          id: "slim-tall-layer",
          priority: "low",
          title: "瘦高体型适合增加层次",
          detail: "当前个人画像为瘦高，挺括外套或层次搭配会更平衡。"
        }
      ]
    } as WardrobeInsights;

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
    expect(markup).toContain("衣橱健康度");
    expect(markup).toContain("季节分布");
    expect(markup).toContain("风格倾向");
    expect(markup).toContain("洞察建议");
    expect(markup).toContain("购物建议");
    expect(markup).toContain("身材建议");
    expect(markup).toContain("上装占比偏高");
    expect(markup).toContain("补充一件经典外套");
    expect(markup).toContain("瘦高体型适合增加层次");
    expect(markup).toContain("白衬衫");
    expect(markup).toContain("导出备份");
    expectClassTokens(markup, ["history-insights-view", "view-shell"]);
    expectClassTokens(markup, ["insights-content"]);
    expectClassTokens(markup, ["health-focus"]);
    expectClassTokens(markup, ["insight-section"]);
    expect(markup).toContain('<meter min="0" max="100" value="25"');
    expect(markup).toContain('aria-label="衣橱利用率 25%"');
    expect(markup).not.toContain("liquid-");
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

    const garmentTree = renderFunctionElement(findElementsByComponentName(tree, "GarmentItem")[0]);
    findButtonsByText(garmentTree, "删除")[0].props.onClick();
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("短款针织衫"));
    expect(onDelete).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    findButtonsByText(garmentTree, "删除")[0].props.onClick();
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
        outfits: [outfit],
        missingSlots: []
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

  it("keeps recommendation layout and match scores anchored to the top", () => {
    const styles = readAppStyles();

    expect(cssRule(styles, ".recommendation-layout")).toMatch(/align-items:\s*start;/);
    expect(cssRule(styles, ".outfit-stage")).toMatch(/overflow:\s*hidden;/);
    expect(cssRule(styles, ".outfit-stage__match")).toMatch(/display:\s*grid;/);
    expect(cssRule(styles, ".outfit-stage__match")).toMatch(/min-width:\s*4\.8rem;/);
  });

  it("uses resilient semantic layouts for wardrobe filters and technical paths", () => {
    const styles = readAppStyles();

    expect(cssRule(styles, ".wardrobe-filter-panel__fields")).toMatch(/grid-template-columns:\s*minmax\(14rem,\s*1\.5fr\)\s*repeat\(5,\s*minmax\(7\.5rem,\s*0\.7fr\)\);/);
    expect(cssRule(styles, ".technical-details dd")).toMatch(/overflow-wrap:\s*anywhere;/);
    expect(cssRule(styles, ".ui-stat > strong")).toMatch(/overflow-wrap:\s*anywhere;/);
  });

  it("removes liquid glass, backdrop filters, and legacy SVG filter hooks", () => {
    const styles = readAppStyles();
    const app = readFileSync(new URL("../src/app/App.tsx", import.meta.url), "utf8");
    const liquidDefsPath = new URL("../src/components/LiquidGlassDefs.tsx", import.meta.url);

    expect(styles).not.toMatch(/--glass-/);
    expect(styles).not.toMatch(/\.(glass-surface|glass-control|glass-sticky|glass-modal)\b/);
    expect(app).not.toMatch(/glass-(surface|control|sticky|modal)/);
    expect(styles).not.toMatch(/--liquid-/);
    expect(styles).not.toMatch(/\.liquid-/);
    expect(styles).not.toMatch(/liquid-glass-displacement/);
    expect(styles).not.toMatch(/backdrop-filter/);
    expect(app).not.toMatch(/LiquidGlassDefs|liquid-/);
    expect(existsSync(liquidDefsPath)).toBe(false);
    expect(styles).toMatch(/@media\s+\(prefers-reduced-motion:\s*reduce\)[\s\S]*animation-duration:\s*1ms\s*!important;/);
    expect(styles).toMatch(/@media\s+\(max-width:\s*980px\)[\s\S]*\.mobile-nav\s*{[\s\S]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\);/);
    expect(styles).toMatch(/@media\s+\(max-width:\s*980px\)[\s\S]*\.mobile-nav \.app-nav__item\s*{[\s\S]*min-height:\s*3\.35rem;/);
  });

  it("renders the app root without SVG liquid glass filter definitions", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: vi.fn()
    });

    const markup = renderToStaticMarkup(<MainApp />);

    expect(markup).not.toContain("liquid-glass-defs");
    expect(markup).not.toContain("liquid-glass-displacement");
    expect(markup).not.toContain("<feTurbulence");
    expect(markup).not.toContain("<feDisplacementMap");
    expect(markup).not.toContain("<feSpecularLighting");
  });

  it("defines coordinated light and dark tokens without liquid materials", () => {
    const styles = readAppStyles();

    expect(cssRule(styles, ":root")).not.toMatch(/--liquid-/);
    expect(cssRule(styles, ":root")).toMatch(/--color-accent:\s*#0f766e;/);
    expect(cssRule(styles, ":root")).toMatch(/--color-canvas:\s*#f3f5f4;/);
    expect(cssRule(styles, "body")).toMatch(/background:\s*var\(--color-canvas\);/);
    expect(styles).toMatch(/@media\s+\(prefers-color-scheme:\s*dark\)[\s\S]*color-scheme:\s*dark;/);
    expect(styles).toMatch(/@media\s+\(prefers-color-scheme:\s*dark\)[\s\S]*--color-canvas:\s*#101513;/);
    expect(styles).toMatch(/@media\s+\(prefers-color-scheme:\s*dark\)[\s\S]*--color-accent:\s*#4cc6b7;/);
  });

  it("keeps reusable UI primitives semantic and avoids a fixed inner workspace", () => {
    const styles = readAppStyles();
    const header = renderToStaticMarkup(<PageIntro title="Title" description="Description" actions={<Button>Action</Button>} />);
    const field = renderToStaticMarkup(<Field id="example-field" label="Example" value="Value" readOnly />);
    const surface = renderToStaticMarkup(<Surface className="custom-surface">Panel</Surface>);

    expect(styles).not.toMatch(/\.liquid-/);
    expectClassTokens(header, ["page-intro"]);
    expectClassTokens(header, ["ui-button"]);
    expectClassTokens(field, ["ui-field"]);
    expectClassTokens(surface, ["ui-surface", "custom-surface"]);
    expect(header).toContain("Title");
    expect(field).toContain('for="example-field"');
    expect(field).toContain('id="example-field"');
    expect(surface).toContain("Panel");
    expect(cssRule(styles, ".app-layout")).toMatch(/min-height:\s*100dvh;/);
    expect(cssRule(styles, ".app-main")).not.toMatch(/(?:min-)?height:\s*100(?:d?vh|%);/);
    expect(cssRule(styles, ".app-page")).not.toMatch(/(?:min-)?height:\s*100(?:d?vh|%);/);
  });

  it("fetches the service worker shell from network before falling back to cache", () => {
    const serviceWorker = readFileSync(new URL("../public/service-worker.js", import.meta.url), "utf8");
    const fetchIndex = serviceWorker.indexOf("fetch(event.request)");
    const cacheIndex = serviceWorker.indexOf("caches.match(event.request)");

    expect(fetchIndex).toBeGreaterThanOrEqual(0);
    expect(cacheIndex).toBeGreaterThanOrEqual(0);
    expect(fetchIndex).toBeLessThan(cacheIndex);
    expect(serviceWorker).toMatch(/cache\.put\(event\.request,\s*response\.clone\(\)\)/);
    expect(serviceWorker).toMatch(/event\.request\.mode\s*===\s*"navigate"/);
    expect(serviceWorker).toMatch(/caches\.match\("\/index\.html"\)/);
  });

  it("renders recommendation controls beside a visual outfit stage", () => {
    const weather = makeWeather();
    const recommendations: RecommendationResult = {
      weather,
      occasion: "casual",
      outfits: [makeOutfit()],
      missingSlots: []
    };

    const markup = renderToStaticMarkup(
      <RecommendationView
        weather={weather}
        recommendations={recommendations}
        occasion="casual"
        latitude="39.9042"
        longitude="116.4074"
        busy={false}
        recordingOutfitId={null}
        wearLogFeedback={null}
        onOccasion={vi.fn()}
        onFetchWeather={vi.fn()}
        onGenerate={vi.fn()}
        onRecordWearLog={vi.fn()}
      />
    );

    expectClassTokens(markup, ["recommendation-layout"]);
    expectClassTokens(markup, ["recommendation-controls"]);
    expectClassTokens(markup, ["decision-panel"]);
    expectClassTokens(markup, ["outfit-stage", "outfit-stage--featured"]);
    expectClassTokens(markup, ["outfit-stage__garments"]);
    expect(markup).toContain("今天先穿这一套");
    expect(markup).toContain("标记已穿");
    expect(markup).not.toContain("liquid-");
  });

  it("renders recommendation page intro metadata and weather context", () => {
    const weather = makeWeather();
    const recommendations: RecommendationResult = {
      weather,
      occasion: "casual",
      outfits: [makeOutfit()],
      missingSlots: []
    };

    const markup = renderToStaticMarkup(
      <RecommendationView
        weather={weather}
        recommendations={recommendations}
        occasion="casual"
        latitude="39.9042"
        longitude="116.4074"
        busy={false}
        recordingOutfitId={null}
        wearLogFeedback={null}
        onOccasion={vi.fn()}
        onFetchWeather={vi.fn()}
        onGenerate={vi.fn()}
        onRecordWearLog={vi.fn()}
      />
    );

    expectClassTokens(markup, ["page-intro", "recommendation-intro"]);
    expectClassTokens(markup, ["page-intro__meta"]);
    expectClassTokens(markup, ["weather-context", "weather-context--ready"]);
    expectClassTokens(markup, ["weather-context__facts"]);
    expect(markup).toContain("当前场合 休闲");
    expect(markup).toContain("天气 晴");
    expect(markup).toContain("体感");
    expect(markup).not.toContain("liquid-");
  });

  it("renders recommendation as an accessible decision and result layout", () => {
    const weather = makeWeather();
    const recommendations: RecommendationResult = {
      weather,
      occasion: "casual",
      outfits: [makeOutfit()],
      missingSlots: []
    };

    const markup = renderToStaticMarkup(
      <RecommendationView
        weather={weather}
        recommendations={recommendations}
        occasion="casual"
        latitude="39.9042"
        longitude="116.4074"
        busy={false}
        recordingOutfitId={null}
        wearLogFeedback={null}
        onOccasion={vi.fn()}
        onFetchWeather={vi.fn()}
        onGenerate={vi.fn()}
        onRecordWearLog={vi.fn()}
      />
    );

    expectClassTokens(markup, ["recommendation-view", "view-shell"]);
    expect(markup).toContain('aria-labelledby="recommendation-title"');
    expect(markup).toContain('aria-labelledby="decision-context-title"');
    expectClassTokens(markup, ["recommendation-layout"]);
    expectClassTokens(markup, ["recommendation-stage"]);
    expectClassTokens(markup, ["outfit-stage", "outfit-stage--featured"]);
    expect(markup).toContain('aria-label="匹配度 91%"');
    expect(markup).not.toContain("liquid-");
  });

  it("renders recommendation empty states with one contextual next action", () => {
    const importMarkup = renderToStaticMarkup(
      <RecommendationView
        weather={null}
        recommendations={null}
        availableGarmentCount={0}
        occasion="casual"
        latitude="39.9042"
        longitude="116.4074"
        busy={false}
        recordingOutfitId={null}
        wearLogFeedback={null}
        onOccasion={vi.fn()}
        onFetchWeather={vi.fn()}
        onGenerate={vi.fn()}
        onRecordWearLog={vi.fn()}
        onOpenImport={vi.fn()}
        onOpenSettings={vi.fn()}
      />
    );
    const settingsMarkup = renderToStaticMarkup(
      <RecommendationView
        weather={null}
        recommendations={null}
        availableGarmentCount={3}
        occasion="casual"
        latitude="invalid"
        longitude="invalid"
        busy={false}
        recordingOutfitId={null}
        wearLogFeedback={null}
        onOccasion={vi.fn()}
        onFetchWeather={vi.fn()}
        onGenerate={vi.fn()}
        onRecordWearLog={vi.fn()}
        onOpenSettings={vi.fn()}
      />
    );
    const generateMarkup = renderToStaticMarkup(
      <RecommendationView
        weather={null}
        recommendations={null}
        availableGarmentCount={3}
        occasion="casual"
        latitude="39.9042"
        longitude="116.4074"
        busy={false}
        recordingOutfitId={null}
        wearLogFeedback={null}
        onOccasion={vi.fn()}
        onFetchWeather={vi.fn()}
        onGenerate={vi.fn()}
        onRecordWearLog={vi.fn()}
      />
    );

    expectClassTokens(importMarkup, ["recommendation-empty-stage"]);
    expectClassTokens(importMarkup, ["ui-empty"]);
    expect(importMarkup).toContain("先导入衣物");
    expect(importMarkup).not.toContain("设置位置");
    expect(settingsMarkup).toContain("设置位置");
    expect(generateMarkup).toContain("生成今日搭配");
  });

  it("renders wardrobe filters, selection state, and garment editing regions", () => {
    const markup = renderToStaticMarkup(
      <WardrobeView
        garments={[makeGarment(1, "white shirt", "top"), makeGarment(2, "black pants", "bottom", { excluded: true })]}
        selectedIds={[1]}
        busy={false}
        onRefresh={vi.fn()}
        onSelect={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onBulkConfirm={vi.fn()}
      />
    );

    expectClassTokens(markup, ["wardrobe-page"]);
    expectClassTokens(markup, ["wardrobe-filter-panel"]);
    expectClassTokens(markup, ["wardrobe-batch-bar"]);
    expectClassTokens(markup, ["garment-library-item", "garment-library-item--selected"]);
    expectClassTokens(markup, ["garment-library-item", "garment-library-item--excluded"]);
    expect(markup).not.toContain("liquid-");
    expectClassTokens(markup, ["garment-editor-panel"]);
    expectClassTokens(markup, ["garment-library-item__primary-actions"]);
    expectClassTokens(markup, ["garment-library-item__tools"]);
  });

  it("separates pending review items from the wardrobe gallery", () => {
    const markup = renderToStaticMarkup(
      <WardrobeView
        garments={[makeGarment(1, "white shirt", "top", { confirmed: false }), makeGarment(2, "black pants", "bottom", { excluded: true })]}
        selectedIds={[1]}
        busy={false}
        onRefresh={vi.fn()}
        onSelect={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onBulkConfirm={vi.fn()}
      />
    );

    expectClassTokens(markup, ["wardrobe-review-list"]);
    expectClassTokens(markup, ["wardrobe-gallery"]);
    expectClassTokens(markup, ["garment-library-item", "garment-library-item--review"]);
    expectClassTokens(markup, ["garment-library-item", "garment-library-item--card", "garment-library-item--excluded"]);
    expect(markup).toContain("等待确认");
    expect(markup).toContain("日常衣橱");
  });

  it("renders wardrobe garments as scan-first cards with an edit drawer", () => {
    const markup = renderToStaticMarkup(
      <WardrobeView
        garments={[
          makeGarment(1, "white shirt", "top", { brand: "COS", wearCount: 3 }),
          makeGarment(2, "black pants", "bottom", { confirmed: false })
        ]}
        selectedIds={[1]}
        busy={false}
        onRefresh={vi.fn()}
        onSelect={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onBulkConfirm={vi.fn()}
      />
    );

    expectClassTokens(markup, ["garment-library-item", "garment-library-item--card"]);
    expectClassTokens(markup, ["garment-library-item", "garment-library-item--review"]);
    expectClassTokens(markup, ["garment-library-item__attributes"]);
    expectClassTokens(markup, ["garment-library-item__details"]);
    expect(markup).toContain('aria-label="选择 white shirt"');
    expect(markup).toContain("已穿 3 次");
    expect(markup).toContain("编辑与图片工具");
  });

  it("keeps wardrobe actions flexible across cards and review rows", () => {
    const styles = readAppStyles();

    expect(cssRule(styles, ".garment-library-item__tools")).toMatch(/display:\s*flex;/);
    expect(cssRule(styles, ".garment-library-item__tools")).toMatch(/flex-wrap:\s*wrap;/);
    expect(cssRule(styles, ".garment-library-item--review .garment-library-item__content")).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto;/);
    expect(styles).toMatch(/@media\s+\(max-width:\s*520px\)[\s\S]*\.garment-library-item__tools \.ui-button,[\s\S]*flex:\s*1\s+1\s+calc\(50%\s*-\s*var\(--space-2\)\);/);
  });

  it("collapses wardrobe filters and review items cleanly on mobile", () => {
    const styles = readAppStyles();

    expect(styles).toMatch(/@media\s+\(max-width:\s*760px\)[\s\S]*\.wardrobe-filter-panel__fields\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
    expect(styles).toMatch(/@media\s+\(max-width:\s*760px\)[\s\S]*\.garment-library-item--review \.garment-library-item__content\s*\{[\s\S]*grid-template-columns:\s*1fr;/);
    expect(styles).toMatch(/@media\s+\(max-width:\s*520px\)[\s\S]*\.wardrobe-filter-panel__fields\s*\{[\s\S]*grid-template-columns:\s*1fr;/);
    expect(styles).toMatch(/@media\s+\(max-width:\s*520px\)[\s\S]*\.garment-editor-panel__grid\s*\{[\s\S]*grid-template-columns:\s*1fr;/);
  });

  it("renders import and settings pages with semantic sections and associated labels", () => {
    const importPreview: TaobaoImportPreview = {
      batchId: "preview-1",
      summary: {
        totalItems: 1,
        uniqueItems: 1,
        skippedRefunded: 0,
        skippedNonApparel: 0,
        createdGarments: 1
      },
      duplicateCount: 0,
      candidates: [
        {
          sourceItemKey: "item-1",
          brand: "COS",
          name: "white shirt",
          rawName: "white shirt",
          category: "top",
          color: "white",
          warmth: "light",
          seasons: ["spring"],
          confidence: 0.88,
          imageUrl: ""
        }
      ],
      skipped: []
    };
    const importMarkup = renderToStaticMarkup(
      <ImportView
        bookmarklet="https://example.com/bookmarklet"
        importText="{}"
        importResult={null}
        importPreview={importPreview}
        filterSummary={null}
        captureUrl=""
        captureEngine="selenium"
        captureResult={null}
        busy={false}
        onCopyBookmarklet={vi.fn()}
        onImportText={vi.fn()}
        onImport={vi.fn()}
        onPreviewImport={vi.fn()}
        onCaptureUrl={vi.fn()}
        onCaptureEngine={vi.fn()}
        onStartOrdersCapture={vi.fn()}
        onStartItemCapture={vi.fn()}
        onReadLatestCapture={vi.fn()}
      />
    );
    const settingsMarkup = renderToStaticMarkup(
      <SettingsView
        latitude="39.9042"
        longitude="116.4074"
        busy={false}
        profile={{}}
        visionModels={null}
        visionEnabled={true}
        onLatitude={vi.fn()}
        onLongitude={vi.fn()}
        onLocate={vi.fn()}
        onSave={vi.fn()}
        onProfile={vi.fn()}
      />
    );

    expectClassTokens(importMarkup, ["view", "import-view"]);
    expectClassTokens(importMarkup, ["page-intro"]);
    expectClassTokens(importMarkup, ["capture-choice-grid"]);
    expectClassTokens(importMarkup, ["capture-choice", "capture-choice--orders"]);
    expectClassTokens(importMarkup, ["capture-choice", "capture-choice--item"]);
    expectClassTokens(importMarkup, ["advanced-import"]);
    expectClassTokens(importMarkup, ["preview-panel"]);
    expect(importMarkup).toContain('for="capture-item-url"');
    expect(importMarkup).toContain('id="capture-item-url"');
    expect(importMarkup).toContain('for="import-json"');
    expect(importMarkup).toContain('id="import-json"');
    expectClassTokens(settingsMarkup, ["view", "settings-view"]);
    expectClassTokens(settingsMarkup, ["settings-form"]);
    expectClassTokens(settingsMarkup, ["settings-section"]);
    expectClassTokens(settingsMarkup, ["location-settings"]);
    expectClassTokens(settingsMarkup, ["profile-settings"]);
    expectClassTokens(settingsMarkup, ["vision-settings"]);
    expect(settingsMarkup).toContain('for="settings-latitude"');
    expect(settingsMarkup).toContain('id="settings-latitude"');
    expect(settingsMarkup).toContain('for="profile-height"');
    expect(settingsMarkup).toContain('id="profile-height"');
    expect(settingsMarkup).toContain('for="vision-enabled"');
    expect(settingsMarkup).toContain('id="vision-enabled"');
    expect(`${importMarkup}${settingsMarkup}`).not.toContain("liquid-");
  });

  it("defines the new UI, garment, recommendation, and insight layout vocabulary", () => {
    const styles = readAppStyles();

    expect(cssRule(styles, ":root")).toMatch(/--color-surface-raised:\s*#ffffff;/);
    expect(cssRule(styles, ":root")).toMatch(/--color-surface-muted:\s*#edf1ef;/);
    expect(cssRule(styles, ":root")).toMatch(/--space-3:\s*0\.75rem;/);
    expect(cssRule(styles, ".ui-button")).toMatch(/display:\s*inline-flex;/);
    expect(cssRule(styles, ".page-intro")).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto;/);
    expect(cssRule(styles, ".wardrobe-batch-bar")).toMatch(/position:\s*sticky;/);
    expect(cssRule(styles, ".garment-library-item")).toMatch(/min-width:\s*0;/);
    expect(cssRule(styles, ".recommendation-layout")).toMatch(/align-items:\s*start;/);
    expect(cssRule(styles, ".insight-section")).toMatch(/border-top:\s*1px solid var\(--color-line\);/);
    expect(cssRule(styles, ".vision-models")).toMatch(/display:\s*grid;/);
  });

  it("keeps garment identity and actions resilient beside long brand names", () => {
    const styles = readAppStyles();

    expect(cssRule(styles, ".garment-library-item__identity")).toMatch(/min-width:\s*0;/);
    expect(cssRule(styles, ".garment-library-item__brand")).toMatch(/text-overflow:\s*ellipsis;/);
    expect(cssRule(styles, ".garment-library-item__identity h3")).toMatch(/text-overflow:\s*ellipsis;/);
    expect(cssRule(styles, ".garment-library-item__identity h3")).toMatch(/white-space:\s*nowrap;/);
    expect(cssRule(styles, ".garment-library-item--review")).toMatch(/grid-template-columns:\s*auto\s+5rem\s+minmax\(0,\s*1fr\);/);
    expect(cssRule(styles, ".garment-library-item__tools")).toMatch(/flex-wrap:\s*wrap;/);
  });
});

function cssRule(styles: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, "m").exec(styles);
  return match?.[1] ?? "";
}

function expectClassTokens(markup: string, expectedTokens: string[]) {
  const classValues = Array.from(markup.matchAll(/class="([^"]*)"/g), (match) => match[1]);
  const hasTokens = classValues.some((classValue) => {
    const tokens = classValue.split(/\s+/).filter(Boolean);
    return expectedTokens.every((token) => tokens.includes(token));
  });

  expect(hasTokens).toBe(true);
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
    if (isButtonElement(current) && elementText(props.children).includes(text)) {
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
    if (isButtonElement(current) && props.title === title) {
      matches.push(current);
    }
    visit(props.children);
  }

  visit(node);
  return matches;
}

function findInputsByType(node: ReactNode, type: string): ReactElement[] {
  const matches: ReactElement[] = [];

  function visit(current: ReactNode) {
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    if (!isValidElement(current)) {
      return;
    }

    const props = current.props as { children?: ReactNode; type?: string };
    if ((current.type === "input" || reactTypeName(current) === "Field") && props.type === type) {
      matches.push(current);
    }
    visit(props.children);
  }

  visit(node);
  return matches;
}

function findElementsByComponentName(node: ReactNode, name: string): ReactElement[] {
  const matches: ReactElement[] = [];

  function visit(current: ReactNode) {
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    if (!isValidElement(current)) {
      return;
    }

    if (reactTypeName(current) === name) {
      matches.push(current);
    }
    visit((current.props as { children?: ReactNode }).children);
  }

  visit(node);
  return matches;
}

function renderFunctionElement(element: ReactElement): ReactNode {
  if (typeof element.type !== "function") {
    throw new Error(`Expected a function component, received ${reactTypeName(element) || "unknown"}`);
  }
  const Component = element.type as (props: Record<string, unknown>) => ReactNode;
  return Component(element.props as Record<string, unknown>);
}

function reactTypeName(element: ReactElement): string {
  if (typeof element.type === "string") return element.type;
  if (typeof element.type === "function") {
    const component = element.type as typeof element.type & { displayName?: string; name?: string };
    return component.displayName || component.name || "";
  }
  if (element.type && typeof element.type === "object" && "render" in element.type) {
    const render = (element.type as { render?: { displayName?: string; name?: string } | ((...args: unknown[]) => unknown) }).render;
    if (typeof render === "function") return render.name;
    return render?.displayName || render?.name || "";
  }
  return "";
}

function isButtonElement(element: ReactElement): boolean {
  const name = reactTypeName(element);
  return element.type === "button" || name === "Button" || name === "IconButton";
}

function readAppStyles(): string {
  const entry = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const stylesDirectory = new URL("../src/styles/", import.meta.url);
  const modules = Array.from(entry.matchAll(/@import\s+"\.\/styles\/([^";]+)";/g), (match) => match[1])
    .map((name) => readFileSync(new URL(name, stylesDirectory), "utf8"));
  return [entry, ...modules].join("\n");
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
