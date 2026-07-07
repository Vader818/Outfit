import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App, AuthView, HistoryInsightsView, ImportView, MainApp, RecommendationView, SessionSummary, SettingsView, ThumbnailPicker, WardrobeView } from "../src/App";
import { CommandBar, PageHeader, SettingsSection, WorkbenchPanel } from "../src/components/workbench";
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

  it("renders the loading auth card without liquid glass classes", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: vi.fn()
    });

    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain('class="auth-card loading"');
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

  it("renders a compact mobile logout control outside the hidden session card", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: vi.fn()
    });

    const markup = renderToStaticMarkup(
      <MainApp user={{ id: 1, username: "local_user" }} onLogout={vi.fn()} />
    );

    expect(markup).toContain("has-mobile-logout");
    expect(markup).toContain("mobile-logout");
    expect(markup).toContain('aria-label="退出"');
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

    findButtonsByText(tree, "去背景")[0].props.onClick();
    findButtonsByText(tree, "分析图片")[0].props.onClick();
    findButtonsByText(tree, "应用建议")[0].props.onClick();

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

    const appliedButtons = findButtonsByText(tree, "已应用");
    expect(appliedButtons).toHaveLength(1);

    const markup = renderToStaticMarkup(<>{tree}</>);
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
    findButtonsByText(tree, "选择缩略图")[0].props.onClick();
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
    expect(markup).toContain('class="thumbnail-picker"');
    expect(markup).not.toContain("liquid-");
    expect(markup).toContain("thumbnail-candidate selected");
    findButtonsByText(tree, "详情图")[0].props.onClick();
    findButtonsByText(tree, "保存为主图")[0].props.onClick();
    findButtonsByText(tree, "关闭")[0].props.onClick();
    expect(onSelect).toHaveBeenCalledWith(candidates[1].url);
    expect(onSave).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("styles the thumbnail picker modal and responsive candidate grid", () => {
    const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

    expect(cssRule(styles, ".thumbnail-picker-backdrop")).toMatch(/position:\s*fixed;/);
    expect(cssRule(styles, ".thumbnail-candidate-grid")).toMatch(/grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(140px,\s*1fr\)\);/);
    expect(styles).toMatch(/@media\s+\(max-width:\s*560px\)[\s\S]*\.thumbnail-candidate-grid\s*{[\s\S]*grid-template-columns:\s*1fr;/);
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
    expect(markup).toContain('class="panel card"');
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

  it("removes liquid glass CSS, SVG hooks, and component module", () => {
    const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
    const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
    const workbench = readFileSync(new URL("../src/components/workbench.tsx", import.meta.url), "utf8");
    const liquidDefsPath = new URL("../src/components/LiquidGlassDefs.tsx", import.meta.url);

    expect(styles).not.toMatch(/--glass-/);
    expect(styles).not.toMatch(/\.(glass-surface|glass-control|glass-sticky|glass-modal)\b/);
    expect(app).not.toMatch(/glass-(surface|control|sticky|modal)/);
    expect(workbench).not.toMatch(/glass-(surface|control|sticky|modal)/);
    expect(styles).not.toMatch(/--liquid-/);
    expect(styles).not.toMatch(/\.liquid-/);
    expect(styles).not.toMatch(/liquid-glass-displacement/);
    expect(styles).not.toMatch(/backdrop-filter/);
    expect(app).not.toMatch(/LiquidGlassDefs|liquid-/);
    expect(workbench).not.toMatch(/liquid-/);
    expect(existsSync(liquidDefsPath)).toBe(false);
    expect(styles).toMatch(/@media\s+\(prefers-reduced-motion:\s*reduce\)[\s\S]*transform:\s*none;/);
    expect(styles).toMatch(/@media\s+\(max-width:\s*920px\)[\s\S]*nav\s*{[\s\S]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\);/);
    expect(styles).toMatch(/@media\s+\(max-width:\s*920px\)[\s\S]*\.nav-button\s*{[\s\S]*min-height:\s*54px;/);
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

  it("keeps quiet workbench styling without liquid material tokens", () => {
    const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

    expect(cssRule(styles, ":root")).not.toMatch(/--liquid-/);
    expect(cssRule(styles, ":root")).toMatch(/--app-primary:\s*#0f766e;/);
    expect(cssRule(styles, ":root")).toMatch(/--app-canvas:\s*#eef3f1;/);
    expect(cssRule(styles, "body")).toMatch(/background:\s*var\(--app-canvas\);/);
    expect(cssRule(styles, "body")).not.toMatch(/244,\s*114,\s*182/);
    expect(cssRule(styles, "body")).not.toMatch(/255,\s*247,\s*237/);
    expect(cssRule(styles, ".auth-shell")).toMatch(/background:\s*var\(--app-canvas\);/);
  });

  it("keeps reusable workbench surfaces on ordinary classes", () => {
    const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
    const header = renderToStaticMarkup(<PageHeader title="Title" description="Description"><button>Action</button></PageHeader>);
    const command = renderToStaticMarkup(<CommandBar className="custom-command"><span>Controls</span></CommandBar>);
    const panel = renderToStaticMarkup(<WorkbenchPanel className="custom-panel">Panel</WorkbenchPanel>);
    const settings = renderToStaticMarkup(<SettingsSection className="custom-section">Settings</SettingsSection>);

    expect(styles).not.toMatch(/\.liquid-/);
    expect(header).toContain('class="page-header"');
    expect(command).toContain('class="command-bar custom-command"');
    expect(panel).toContain('class="panel workbench-panel custom-panel"');
    expect(settings).toContain('class="settings-section custom-section"');
    expect(header).toContain("Title");
    expect(command).toContain("Controls");
    expect(panel).toContain("Panel");
    expect(settings).toContain("Settings");
  });

  it("fetches the service worker shell from network before falling back to cache", () => {
    const serviceWorker = readFileSync(new URL("../public/service-worker.js", import.meta.url), "utf8");
    const fetchIndex = serviceWorker.indexOf("fetch(event.request)");
    const cacheIndex = serviceWorker.indexOf("caches.match(event.request)");

    expect(fetchIndex).toBeGreaterThanOrEqual(0);
    expect(cacheIndex).toBeGreaterThanOrEqual(0);
    expect(fetchIndex).toBeLessThan(cacheIndex);
    expect(serviceWorker).toMatch(/cache\.put\(event\.request,\s*response\.clone\(\)\)/);
    expect(serviceWorker).toMatch(/caches\.match\("\/index\.html"\)/);
  });

  it("renders recommendation controls as a dense command bar with visual outfit previews", () => {
    const weather = makeWeather();
    const recommendations: RecommendationResult = {
      weather,
      occasion: "casual",
      outfits: [makeOutfit()]
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

    expect(markup).toContain('class="command-bar recommendation-command"');
    expect(markup).toContain('class="outfit-preview"');
    expect(markup).toContain('class="outfit-reasons"');
    expect(markup).toContain('class="outfit"');
    expect(markup).not.toContain("liquid-");
  });

  it("renders recommendation workbench header stats and weather context", () => {
    const weather = makeWeather();
    const recommendations: RecommendationResult = {
      weather,
      occasion: "casual",
      outfits: [makeOutfit()]
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

    expect(markup).toContain('class="page-header"');
    expect(markup).toContain('class="stat-tile"');
    expect(markup).toContain('class="status-pill');
    expect(markup).toContain('class="weather-band context-band"');
    expect(markup).not.toContain("liquid-");
  });

  it("renders recommendation as a decision panel with context and outfit surfaces", () => {
    const weather = makeWeather();
    const recommendations: RecommendationResult = {
      weather,
      occasion: "casual",
      outfits: [makeOutfit()]
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

    expect(markup).toContain('class="page-header recommendation-hero"');
    expect(markup).toContain('class="command-bar recommendation-command decision-command"');
    expect(markup).toContain('class="weather-band context-band compact-context"');
    expect(markup).toContain('class="outfit-grid decision-grid"');
    expect(markup).toContain('class="outfit decision-card"');
    expect(markup).not.toContain("liquid-");
  });

  it("renders wardrobe bulk state and row editing inside stable workbench regions", () => {
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

    expect(markup).toContain('class="filter-bar"');
    expect(markup).toContain('class="batch-strip"');
    expect(markup).toContain('class="garment-row"');
    expect(markup).toContain('class="garment-row muted"');
    expect(markup).not.toContain("liquid-");
    expect(markup).toContain('class="garment-row-main"');
    expect(markup).toContain('class="garment-editor"');
    expect(markup).toContain('class="garment-actions-row"');
  });

  it("renders wardrobe rows with quiet hierarchy hooks", () => {
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

    expect(markup).toContain('class="filter-bar quiet-filter-bar"');
    expect(markup).toContain('class="batch-strip selection-strip"');
    expect(markup).toContain('class="garment-row quiet-garment-row"');
    expect(markup).toContain('class="garment-row quiet-garment-row muted"');
    expect(markup).toContain('class="garment-editor garment-attribute-grid"');
    expect(markup).toContain('class="garment-actions-row compact-action-grid"');
  });

  it("keeps wardrobe row actions aligned in a uniform button grid", () => {
    const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

    expect(cssRule(styles, ".garment-actions-row")).toMatch(/display:\s*grid;/);
    expect(cssRule(styles, ".garment-actions-row")).toMatch(/grid-template-columns:\s*repeat\(3,\s*minmax\(6rem,\s*1fr\)\);/);
    expect(cssRule(styles, ".garment-actions-row > .btn")).toMatch(/width:\s*100%;/);
    expect(cssRule(styles, ".garment-actions-row > .btn")).toMatch(/min-width:\s*0;/);
    expect(cssRule(styles, '.garment-actions-row > .icon-button[title="删除"]')).toMatch(/grid-column:\s*3;/);
    expect(styles).toMatch(/@media\s+\(max-width:\s*560px\)[\s\S]*\.garment-actions-row\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
  });

  it("renders import and settings pages with workbench grouping hooks", () => {
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

    expect(importMarkup).toContain('class="import-flow"');
    expect(importMarkup).toContain('class="advanced-import"');
    expect(importMarkup).toContain('class="panel preview-panel card"');
    expect(settingsMarkup).toContain('class="settings-grid"');
    expect(settingsMarkup).toContain('class="panel workbench-panel settings-panel"');
    expect(settingsMarkup).toContain('class="settings-section"');
    expect(`${importMarkup}${settingsMarkup}`).not.toContain("liquid-");
  });

  it("defines quiet workbench tokens and dense layout utilities", () => {
    const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

    expect(cssRule(styles, ":root")).toMatch(/--app-surface-solid:\s*#ffffff;/);
    expect(cssRule(styles, ":root")).toMatch(/--app-surface-muted:\s*#f7faf9;/);
    expect(cssRule(styles, ":root")).toMatch(/--space-3:\s*12px;/);
    expect(cssRule(styles, ".command-bar")).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto;/);
    expect(cssRule(styles, ".batch-strip")).toMatch(/position:\s*sticky;/);
    expect(cssRule(styles, ".quiet-garment-row")).toMatch(/box-shadow:\s*none;/);
    expect(cssRule(styles, ".decision-card")).toMatch(/box-shadow:\s*var\(--app-shadow\);/);
    expect(cssRule(styles, ".vision-model-table")).toMatch(/display:\s*grid;/);
  });

  it("keeps wardrobe title editing from collapsing beside long brand tags", () => {
    const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

    expect(cssRule(styles, ".garment-title-line")).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\);/);
    expect(cssRule(styles, ".brand-tag")).toMatch(/justify-self:\s*start;/);
    expect(cssRule(styles, ".garment-row")).toMatch(/grid-template-columns:\s*minmax\(320px,\s*0\.85fr\)\s+minmax\(0,\s*1\.35fr\)\s+minmax\(0,\s*auto\);/);
    expect(cssRule(styles, ".garment-actions-row")).toMatch(/min-width:\s*0;/);
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
    if (current.type === "input" && props.type === type) {
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
