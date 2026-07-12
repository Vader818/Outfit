import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App, AuthView, HistoryInsightsView, ImportView, MainApp, OutfitBuilder, RecommendationView, SavedOutfitsPanel, SessionSummary, SettingsView, ThumbnailPicker, WardrobeView } from "../src/App";
import { Button, Field, PageIntro, Surface } from "../src/components/ui";
import { ImportReviewTable } from "../src/features/import/ImportReviewTable";
import { ManualGarmentDialog, yuanToCents } from "../src/features/wardrobe/ManualGarmentDialog";
import { moveAccessoryItem, validateOutfitBuilderDraft } from "../src/features/outfits/OutfitBuilder";
import { fitImageDimensions, prepareGarmentImageForUpload } from "../src/lib/imageSanitization";
import {
  BACKUP_EXPORT_CONFIRMATION,
  COMPLETE_BACKUP_SENSITIVE_NOTICE,
  REMOTE_TAOBAO_IMAGES_SESSION_KEY,
  exportBackupWithConfirmation,
  exportCompleteBackupWithConfirmation,
  readSessionStorageValue,
  writeSessionStorageValue
} from "../src/lib/browser";
import {
  isRecommendationEligibleGarment,
  isRecommendationPendingGarment,
  isWardrobeReviewPendingGarment,
  resolveGarmentImageSource
} from "../src/lib/garments";
import {
  DEFAULT_LATITUDE,
  DEFAULT_LONGITUDE,
  DEFAULT_PROFILE,
  parseLocationCoordinates
} from "../src/shared/presentation";
import type { CaptureEngine, Garment, OutfitRecommendation, RecommendationResult, SavedOutfit, SavedOutfitItemInput, TaobaoImportPreview, ThumbnailCandidate, VisionModelsResponse, WardrobeInsights, WeatherSnapshot } from "../src/shared/types";

const TEST_CANDIDATE_ID = "11111111-1111-4111-8111-111111111111";
const TEST_OUTFIT_SIGNATURE = "a".repeat(64);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("starts with truly unset location and profile values and parses coordinates strictly", () => {
    expect(DEFAULT_LATITUDE).toBe("");
    expect(DEFAULT_LONGITUDE).toBe("");
    expect(DEFAULT_PROFILE).toEqual({});

    for (const coordinates of [
      ["", ""],
      ["   ", "116.4"],
      ["31.2", ""],
      ["NaN", "116.4"],
      ["91", "116.4"],
      ["31.2", "181"]
    ] as const) {
      expect(parseLocationCoordinates(coordinates[0], coordinates[1])).toBeNull();
    }
    expect(parseLocationCoordinates("0", "0")).toEqual({ latitude: 0, longitude: 0 });
    expect(parseLocationCoordinates(" 31.2304 ", " 121.4737 ")).toEqual({
      latitude: 31.2304,
      longitude: 121.4737
    });
  });

  it("stores remote image consent only in session storage", () => {
    const sessionSet = vi.fn();
    const localSet = vi.fn();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => key === REMOTE_TAOBAO_IMAGES_SESSION_KEY ? "true" : null,
      setItem: sessionSet
    });
    vi.stubGlobal("localStorage", { setItem: localSet });

    expect(readSessionStorageValue(REMOTE_TAOBAO_IMAGES_SESSION_KEY, "false")).toBe("true");
    expect(writeSessionStorageValue(REMOTE_TAOBAO_IMAGES_SESSION_KEY, "false")).toBe(true);
    expect(sessionSet).toHaveBeenCalledWith(REMOTE_TAOBAO_IMAGES_SESSION_KEY, "false");
    expect(localSet).not.toHaveBeenCalled();
  });

  it("does not request or create a backup when sensitive export confirmation is cancelled", async () => {
    const loadExport = vi.fn();
    const download = vi.fn();
    const confirmExport = vi.fn(() => false);

    await expect(exportBackupWithConfirmation(confirmExport, loadExport, download)).resolves.toBe(false);

    expect(BACKUP_EXPORT_CONFIRMATION).toMatch(/个人画像|淘宝|穿着记录|推荐历史/);
    expect(confirmExport).toHaveBeenCalledWith(BACKUP_EXPORT_CONFIRMATION);
    expect(loadExport).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it("previews complete-backup sensitivity and size before asking to create a ZIP", async () => {
    const loadPreview = vi.fn(async () => ({
      assetCount: 4,
      includedAssetCount: 3,
      assetBytes: 5_000_000,
      includedAssetBytes: 4_000_000,
      estimatedBytes: 4_500_000,
      warnings: [{ code: "ASSET_UNAVAILABLE" as const, assetId: 17, message: "asset unavailable" }]
    }));
    const loadArchive = vi.fn();
    const download = vi.fn();
    const confirmExport = vi.fn(() => false);

    await expect(exportCompleteBackupWithConfirmation(
      confirmExport,
      loadPreview,
      loadArchive,
      download
    )).resolves.toBe(false);

    expect(loadPreview).toHaveBeenCalledOnce();
    expect(confirmExport).toHaveBeenCalledWith(expect.stringMatching(/个人画像.*淘宝来源.*本地衣物图片/s));
    expect(confirmExport).toHaveBeenCalledWith(expect.stringMatching(/3.*4.*4\.3 MB/s));
    expect(confirmExport).toHaveBeenCalledWith(expect.stringContaining("1 项资产无法加入"));
    expect(COMPLETE_BACKUP_SENSITIVE_NOTICE).toContain("不会删除");
    expect(loadArchive).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it("uses browser canvas only to resize and re-encode a local upload preview", async () => {
    const drawImage = vi.fn();
    const closeBitmap = vi.fn();
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage })),
      toBlob: vi.fn((callback: (blob: Blob | null) => void, type: string) => {
        callback(new Blob([new Uint8Array(1024)], { type }));
      })
    };
    vi.stubGlobal("document", {
      createElement: vi.fn(() => canvas)
    });
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({
      width: 4096,
      height: 2048,
      close: closeBitmap
    })));

    const source = new Blob([new Uint8Array(2048)], { type: "image/jpeg" });
    const prepared = await prepareGarmentImageForUpload(source);

    expect(fitImageDimensions(4096, 2048)).toEqual({ width: 2048, height: 1024 });
    expect(drawImage).toHaveBeenCalledWith(expect.any(Object), 0, 0, 2048, 1024);
    expect(prepared).not.toBe(source);
    expect(prepared.type).toBe("image/webp");
    expect(prepared.size).toBeLessThanOrEqual(5 * 1024 * 1024);
    expect(closeBitmap).toHaveBeenCalledOnce();
  });

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

  it("reports that refund events remain available for database-aware import review", () => {
    const markup = renderToStaticMarkup(
      <ImportView
        bookmarklet="https://example.com/bookmarklet"
        importText="{}"
        importResult={null}
        filterSummary={{
          originalItems: 8,
          keptItems: 4,
          skippedRefunded: 0,
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

    expect(markup).toContain("已从 8 条订单中保留 4 条可审阅记录");
    expect(markup).toContain("退款事件保留 完整");
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
    expect(findButtonsByText(tree, "提交选择")[0].props.disabled).toBe(true);
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
        outfitId: TEST_CANDIDATE_ID,
        occasion: "smart-casual",
        weather
      }
    });
  });

  it("renders the recommendation wear action and passes the selected outfit callback", async () => {
    const weather = makeWeather();
    const outfit = makeOutfit();
    const recommendations: RecommendationResult = {
      runId: 1,
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

    expect(markup).toContain("实际穿了");
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
        runId: 1,
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
      wearLogFeedback: { outfitId: TEST_CANDIDATE_ID, message: "已标记已穿" },
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

  it("loads trusted Taobao garment images only after explicit session opt-in", async () => {
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
        allowRemoteTaobaoImages?: boolean;
      }) => ReactNode;
    }).WardrobeView;

    const defaultMarkup = renderToStaticMarkup(<>{WardrobeView?.({
      garments: [makeGarment(404, "远程图片衬衫", "top", { imageUrl: "https://img.alicdn.com/remote-shirt.jpg" })],
      selectedIds: [],
      busy: false,
      onRefresh: vi.fn(),
      onSelect: vi.fn(),
      onUpdate: vi.fn(),
      onDelete: vi.fn(),
      onBulkConfirm: vi.fn()
    })}</>);
    const enabledMarkup = renderToStaticMarkup(<>{WardrobeView?.({
      garments: [makeGarment(404, "远程图片衬衫", "top", { imageUrl: "https://img.alicdn.com/remote-shirt.jpg" })],
      selectedIds: [],
      busy: false,
      onRefresh: vi.fn(),
      onSelect: vi.fn(),
      onUpdate: vi.fn(),
      onDelete: vi.fn(),
      onBulkConfirm: vi.fn(),
      allowRemoteTaobaoImages: true
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

    expect(defaultMarkup).not.toContain("https://img.alicdn.com/remote-shirt.jpg");
    expect(defaultMarkup).not.toContain("<img");
    expect(enabledMarkup).toContain('src="https://img.alicdn.com/remote-shirt.jpg"');
    expect(enabledMarkup).toContain('referrerPolicy="no-referrer"');
    expect(blockedMarkup).not.toContain("https://example.com/remote-shirt.jpg");
    expect(blockedMarkup).not.toContain("<img");
  });

  it("keeps local thumbnails ahead of remote cutouts and remote originals", () => {
    const localOriginal = makeGarment(500, "本地图优先", "top", {
      imageUrl: "/api/garment-thumbnails/local-original.webp",
      cutoutImageUrl: "https://img.alicdn.com/remote-cutout.png"
    });
    expect(resolveGarmentImageSource(localOriginal, true)).toEqual({
      url: "/api/garment-thumbnails/local-original.webp",
      cutout: false,
      remote: false
    });
    expect(resolveGarmentImageSource(
      makeGarment(501, "远程原图", "top", { imageUrl: "https://img.alicdn.com/remote-shirt.jpg" })
    )).toBeNull();
    expect(resolveGarmentImageSource(
      makeGarment(501, "远程原图", "top", { imageUrl: "https://img.alicdn.com/remote-shirt.jpg" }),
      true
    )).toMatchObject({ url: "https://img.alicdn.com/remote-shirt.jpg", cutout: false, remote: true });
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
    const enabledMarkup = renderToStaticMarkup(
      <ThumbnailPicker
        garment={garment}
        candidates={candidates}
        selectedUrl={candidates[0].url}
        loading={false}
        saving={false}
        error=""
        allowRemoteTaobaoImages
        onSelect={onSelect}
        onSave={onSave}
        onClose={onClose}
      />
    );

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
    expect(markup).not.toContain('src="https://img.alicdn.com/');
    expect(enabledMarkup).toContain('src="https://img.alicdn.com/');
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

  it("renders and preserves a genuinely unset profile in settings", () => {
    const onProfile = vi.fn();
    const tree = SettingsView({
      latitude: "",
      longitude: "",
      busy: false,
      profile: {},
      onLatitude: vi.fn(),
      onLongitude: vi.fn(),
      onLocate: vi.fn(),
      onSave: vi.fn(),
      onProfile
    });
    const profileSelects = findElementsByComponentName(tree, "SelectField")
      .filter((field) => String(field.props.id).startsWith("profile-"));

    expect(profileSelects).toHaveLength(4);
    expect(profileSelects.every((field) => field.props.value === "")).toBe(true);
    expect(renderToStaticMarkup(<>{tree}</>).match(/>未设置</g)?.length).toBeGreaterThanOrEqual(4);

    profileSelects[0].props.onChange({ target: { value: "" } });
    expect(onProfile).toHaveBeenCalledWith(expect.objectContaining({ bodyType: undefined }));
  });

  it("explains that remote image permission lasts only for the current session", () => {
    const onRemoteTaobaoImagesEnabled = vi.fn();
    const tree = SettingsView({
      latitude: "",
      longitude: "",
      busy: false,
      profile: {},
      remoteTaobaoImagesEnabled: false,
      onLatitude: vi.fn(),
      onLongitude: vi.fn(),
      onLocate: vi.fn(),
      onSave: vi.fn(),
      onProfile: vi.fn(),
      onRemoteTaobaoImagesEnabled
    });
    const remoteToggle = findInputsByType(tree, "checkbox")
      .find((input) => input.props.id === "remote-taobao-images-enabled");

    expect(renderToStaticMarkup(<>{tree}</>)).toMatch(/图片隐私|仅本次.*会话|淘宝 CDN/);
    expect(remoteToggle?.props.checked).toBe(false);
    remoteToggle?.props.onChange({ target: { checked: true } });
    expect(onRemoteTaobaoImagesEnabled).toHaveBeenCalledWith(true);
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

    findInputsByType(tree, "checkbox")
      .find((input) => input.props.id === "vision-enabled")
      ?.props.onChange({ target: { checked: false } });
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
        onExportComplete={vi.fn()}
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
    expect(markup).toContain("导出 JSON");
    expect(markup).toContain("完整备份（含图片）");
    expectClassTokens(markup, ["history-insights-view", "view-shell"]);
    expectClassTokens(markup, ["insights-content"]);
    expectClassTokens(markup, ["health-focus"]);
    expectClassTokens(markup, ["insight-section"]);
    expect(markup).toContain('<meter min="0" max="100" value="25"');
    expect(markup).toContain('aria-label="衣橱利用率 25%"');
    expect(markup).not.toContain("liquid-");
  });

  it("asks for explicit confirmation before archiving a garment", async () => {
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
    findButtonsByText(garmentTree, "归档")[0].props.onClick();
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("短款针织衫"));
    expect(onDelete).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    findButtonsByText(garmentTree, "归档")[0].props.onClick();
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
      replacements: [{
        targetGarmentId: 101,
        replacement: makeGarment(404, "灰色夹克", "top", { brand: "COS" }),
        nextItems: [
          makeGarment(404, "灰色夹克", "top", { brand: "COS" }),
          makeGarment(202, "黑长裤", "bottom", { brand: "优衣库" })
        ],
        matchPercentDelta: 2,
        reasons: ["替换后更适合当前天气"]
      }]
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
        runId: 1,
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
      runId: 1,
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
    expect(markup).toContain("实际穿了");
    expect(markup).not.toContain("liquid-");
  });

  it("renders recommendation page intro metadata and weather context", () => {
    const weather = makeWeather();
    const recommendations: RecommendationResult = {
      runId: 1,
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
      runId: 1,
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

  it("requires a non-blank valid location before the first recommendation", () => {
    const renderLocation = (latitude: string, longitude: string) => renderToStaticMarkup(
      <RecommendationView
        weather={null}
        recommendations={null}
        availableGarmentCount={3}
        occasion="casual"
        latitude={latitude}
        longitude={longitude}
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

    for (const [latitude, longitude] of [["", ""], ["   ", "  "]] as const) {
      const markup = renderLocation(latitude, longitude);
      expect(markup).toContain("设置位置");
      expect(markup).not.toContain(">生成今日搭配</button>");
    }
    expect(renderLocation("0", "0")).toContain("生成今日搭配");
  });

  it("distinguishes pending garments and explains structured missing slots", () => {
    const pendingMarkup = renderToStaticMarkup(
      <RecommendationView
        weather={null}
        recommendations={null}
        availableGarmentCount={0}
        pendingGarmentCount={2}
        occasion="casual"
        latitude="31.2304"
        longitude="121.4737"
        busy={false}
        recordingOutfitId={null}
        wearLogFeedback={null}
        onOccasion={vi.fn()}
        onFetchWeather={vi.fn()}
        onGenerate={vi.fn()}
        onRecordWearLog={vi.fn()}
        onOpenImport={vi.fn()}
        onOpenWardrobe={vi.fn()}
      />
    );
    const missingMarkup = renderToStaticMarkup(
      <RecommendationView
        weather={makeWeather()}
        recommendations={{
          runId: 9,
          weather: makeWeather(),
          occasion: "casual",
          outfits: [],
          missingSlots: ["bottom", "dress"]
        }}
        availableGarmentCount={1}
        pendingGarmentCount={0}
        occasion="casual"
        latitude="31.2304"
        longitude="121.4737"
        busy={false}
        recordingOutfitId={null}
        wearLogFeedback={null}
        onOccasion={vi.fn()}
        onFetchWeather={vi.fn()}
        onGenerate={vi.fn()}
        onRecordWearLog={vi.fn()}
        onOpenImport={vi.fn()}
        onOpenWardrobe={vi.fn()}
      />
    );

    expect(pendingMarkup).toContain("2 件衣物等待确认");
    expect(pendingMarkup).toContain("去确认衣物");
    expect(pendingMarkup).not.toContain("先导入衣物");
    expect(missingMarkup).toContain("下装或连衣裙");
    expect(missingMarkup).toContain("补充衣物");
    expect(missingMarkup).not.toContain("去确认衣物");
  });

  it("uses the backend recommendation eligibility rule for visible counts", () => {
    expect(isRecommendationEligibleGarment(makeGarment(1, "已确认", "top"))).toBe(true);
    expect(isRecommendationEligibleGarment(makeGarment(2, "待确认", "top", { confirmed: false }))).toBe(false);
    expect(isRecommendationEligibleGarment(makeGarment(3, "未拥有", "top", { owned: false }))).toBe(false);
    expect(isRecommendationEligibleGarment(makeGarment(4, "已排除", "top", { excluded: true }))).toBe(false);
    const notOwnedPending = makeGarment(5, "未拥有待审核", "top", { owned: false, confirmed: false });
    expect(isWardrobeReviewPendingGarment(notOwnedPending)).toBe(true);
    expect(isRecommendationPendingGarment(notOwnedPending)).toBe(false);
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
          styles: ["minimal"],
          formality: "smart-casual",
          materials: ["cotton"],
          patterns: ["solid"],
          tags: ["通勤"],
          notes: "",
          confidence: 0.88,
          imageUrl: "",
          disposition: "create"
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

  it("exposes trusted manual creation, archive recovery, batch editing, and complete import review", () => {
    const active = makeGarment(901, "白色衬衫", "top");
    const archived = makeGarment(902, "旧外套", "outerwear", {
      archivedAt: "2026-07-11T00:00:00.000Z"
    });
    const wardrobeMarkup = renderToStaticMarkup(
      <WardrobeView
        garments={[active]}
        archivedGarments={[archived]}
        selectedIds={[active.id]}
        busy={false}
        onRefresh={vi.fn()}
        onSelect={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onRestore={vi.fn()}
        onAddGarment={vi.fn()}
        onBulkConfirm={vi.fn()}
        onBulkSeasons={vi.fn()}
        onBulkTags={vi.fn()}
        onBulkExcluded={vi.fn()}
      />
    );
    expect(wardrobeMarkup).toContain("添加衣物");
    expect(wardrobeMarkup).toContain("归档");
    expect(wardrobeMarkup).not.toContain(">删除<");
    expect(wardrobeMarkup).toContain("已归档");
    expect(wardrobeMarkup).toContain("恢复");
    for (const label of ["品牌", "风格", "正式度", "备注", "排除推荐", "批量季节", "批量添加标签"]) {
      expect(wardrobeMarkup).toContain(label);
    }

    const candidates = Array.from({ length: 7 }, (_, index) => ({
      sourceItemKey: `v2:${String(index).padStart(64, "0")}`,
      brand: "",
      name: `候选衣物 ${index + 1}`,
      rawName: `候选衣物 ${index + 1}`,
      category: "top" as const,
      color: "white",
      warmth: "light" as const,
      seasons: ["spring" as const],
      styles: ["casual"],
      formality: "casual" as const,
      materials: [],
      patterns: [],
      tags: [],
      notes: "",
      confidence: 0.9,
      imageUrl: "",
      disposition: index === 6 ? "unchanged" as const : "create" as const
    }));
    const preview: TaobaoImportPreview = {
      batchId: "batch-review",
      summary: { totalItems: 7, uniqueItems: 7, skippedRefunded: 0, skippedNonApparel: 0, createdGarments: 6 },
      duplicateCount: 0,
      candidates,
      skipped: []
    };
    const decisions = Object.fromEntries(candidates.map((item) => [item.sourceItemKey, {
      sourceItemKey: item.sourceItemKey,
      include: item.disposition === "create"
    }]));
    const importMarkup = renderToStaticMarkup(
      <ImportView
        bookmarklet="javascript:void(0)"
        importText="{}"
        importResult={null}
        importPreview={preview}
        importDecisions={decisions}
        filterSummary={null}
        captureUrl=""
        captureEngine="selenium"
        captureResult={null}
        busy={false}
        onCopyBookmarklet={vi.fn()}
        onImportText={vi.fn()}
        onImport={vi.fn()}
        onImportDecision={vi.fn()}
        onCaptureUrl={vi.fn()}
        onCaptureEngine={vi.fn()}
        onStartOrdersCapture={vi.fn()}
        onStartItemCapture={vi.fn()}
        onReadLatestCapture={vi.fn()}
        onPreviewImport={vi.fn()}
      />
    );
    expect(importMarkup).toContain("淘宝衣物导入逐项审阅");
    expect(importMarkup).toContain("候选衣物 7");
    expect(importMarkup).toContain("提交选择");
    expect(importMarkup).not.toContain("preview-list");
    expect(renderToStaticMarkup(
      <ImportReviewTable preview={preview} decisions={decisions} onDecision={vi.fn()} />
    )).toContain("已选择 6 / 7 个可处理候选");

    expect(yuanToCents("299.05")).toBe(29905);
    expect(yuanToCents("-1")).toBeNull();
    const manualMarkup = renderToStaticMarkup(
      <ManualGarmentDialog open busy={false} onClose={vi.fn()} onSubmit={vi.fn()} />
    );
    expect(manualMarkup).toContain("本地照片（可选）");
    expect(manualMarkup).toContain("image/jpeg,image/png,image/webp");
  });

  it("renders active and archived saved outfits from immutable snapshots and wires management actions", () => {
    const parent = makeSavedOutfit(41, "周一通勤", [
      { id: 1, garmentId: 101, slot: "top", position: 0, name: "白衬衫", brand: "无印良品" },
      { id: 2, garmentId: 202, slot: "bottom", position: 0, name: "黑长裤", brand: "优衣库" }
    ]);
    const derived = makeSavedOutfit(42, "周一通勤 · 换鞋", [
      { id: 3, garmentId: 101, slot: "top", position: 0, name: "白衬衫", brand: "无印良品" },
      { id: 4, garmentId: 303, slot: "shoes", position: 0, name: "乐福鞋", brand: "Clarks" }
    ], { source: "replacement", derivedFromOutfitId: parent.id, favorite: true });
    const archived = makeSavedOutfit(43, "已经归档的搭配", [], { archivedAt: "2026-07-11T00:00:00.000Z" });
    const onCreate = vi.fn();
    const onOpen = vi.fn();
    const onFavorite = vi.fn();
    const onArchive = vi.fn();

    const tree = SavedOutfitsPanel({
      outfits: [parent, derived, archived],
      busy: false,
      onCreate,
      onOpen,
      onFavorite,
      onArchive
    });
    const markup = renderToStaticMarkup(<>{tree}</>);

    expect(markup).toContain("保存的搭配");
    expect(markup).toContain("周一通勤 · 换鞋");
    expect(markup).toContain("已归档的搭配");
    expect(markup).toContain("已经归档的搭配");
    expect(markup).toContain('aria-label="查看或编辑资料 已经归档的搭配"');
    expect(markup).toContain("源自「周一通勤」");
    expect(markup).toContain("无印良品");
    expect(markup).toContain("白衬衫 暂无本地图片");
    expect(markup).toContain('aria-label="取消收藏 周一通勤 · 换鞋"');
    expect(markup).toContain('aria-pressed="true"');

    findButtonsByText(tree, "新建搭配")[0].props.onClick();
    const activeCardTree = renderFunctionElement(findElementsByComponentName(tree, "SavedOutfitCard")[0]);
    findButtonsByText(activeCardTree, "打开编辑")[0].props.onClick();
    findButtonsByText(activeCardTree, "归档")[0].props.onClick();
    const favoriteButtons = findElementsByComponentName(activeCardTree, "IconButton")
      .filter((button) => String(button.props["aria-label"] ?? "").includes("收藏"));
    favoriteButtons[0].props.onClick();

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(parent);
    expect(onArchive).toHaveBeenCalledWith(parent);
    expect(onFavorite).toHaveBeenCalledWith(parent, true);
  });

  it("opens an existing outfit in safe metadata-only mode with composition controls disabled", () => {
    const top = makeGarment(101, "白衬衫", "top");
    const bottom = makeGarment(202, "黑长裤", "bottom");
    const scarf = makeGarment(301, "羊毛围巾", "accessory");
    const watch = makeGarment(302, "银色腕表", "accessory");
    const pending = makeGarment(401, "待确认上衣", "top", { confirmed: false });
    const archived = makeGarment(402, "归档上衣", "top", { archivedAt: "2026-07-11T00:00:00.000Z" });
    const outfit = makeSavedOutfit(51, "冬日通勤", [
      { id: 11, garmentId: top.id, slot: "top", position: 0, name: top.name },
      { id: 12, garmentId: bottom.id, slot: "bottom", position: 0, name: bottom.name },
      { id: 13, garmentId: scarf.id, slot: "accessory", position: 0, name: scarf.name },
      { id: 14, garmentId: watch.id, slot: "accessory", position: 1, name: watch.name }
    ], { notes: "室内外温差大", favorite: true });

    const markup = renderToStaticMarkup(
      <OutfitBuilder
        open
        outfit={outfit}
        garments={[top, bottom, scarf, watch, pending, archived]}
        busy={false}
        error="保存搭配失败"
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expectClassTokens(markup, ["ui-dialog", "outfit-builder"]);
    expect(markup).toContain("编辑保存的搭配");
    expect(markup).toContain('aria-labelledby="');
    expect(markup).toContain('aria-describedby="');
    expect(markup).toContain('value="冬日通勤"');
    expect(markup).toContain("室内外温差大");
    expect(markup).toContain("收藏这套搭配");
    expect(markup).toContain("白衬衫");
    expect(markup).toContain("黑长裤");
    expect(markup).not.toContain("待确认上衣");
    expect(markup).not.toContain("归档上衣");
    expect(markup).toContain('aria-label="上移 羊毛围巾"');
    expect(markup).toContain('aria-label="下移 羊毛围巾"');
    expect(markup).toContain('aria-label="上移 银色腕表"');
    expect(markup).toContain("当前只编辑名称、备注和收藏状态");
    expect(markup).toContain("调整搭配内容");
    expect(markup).toContain('draggable="false"');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("保存搭配失败");
  });

  it("validates outfit builder completeness, item identity, slot category, and position uniqueness", () => {
    const garments = [
      makeGarment(101, "白衬衫", "top"),
      makeGarment(202, "黑长裤", "bottom"),
      makeGarment(303, "针织连衣裙", "dress"),
      makeGarment(404, "羊毛围巾", "accessory")
    ];
    const topBottom: SavedOutfitItemInput[] = [
      { garmentId: 101, slot: "top", position: 0 },
      { garmentId: 202, slot: "bottom", position: 0 }
    ];

    expect(validateOutfitBuilderDraft("周一通勤", topBottom, garments)).toEqual({ items: [] });
    expect(validateOutfitBuilderDraft("", [], garments)).toMatchObject({
      name: "请输入搭配名称",
      items: expect.arrayContaining([expect.stringContaining("上装和下装")])
    });
    expect(validateOutfitBuilderDraft("冲突搭配", [
      ...topBottom,
      { garmentId: 303, slot: "dress", position: 0 }
    ], garments).items).toContain("连衣裙不能与上装或下装同时使用");
    expect(validateOutfitBuilderDraft("重复衣物", [
      ...topBottom,
      { garmentId: 101, slot: "top", position: 1 }
    ], garments).items).toEqual(expect.arrayContaining([
      expect.stringContaining("同一件衣物只能使用一次"),
      expect.stringContaining("位置")
    ]));
    expect(validateOutfitBuilderDraft("类别错误", [
      { garmentId: 101, slot: "bottom", position: 0 },
      { garmentId: 202, slot: "bottom", position: 0 }
    ], garments).items).toEqual(expect.arrayContaining([
      expect.stringContaining("衣物类别与搭配位置不一致"),
      expect.stringContaining("位置")
    ]));
  });

  it("moves accessories deterministically while normalizing every position", () => {
    const items: SavedOutfitItemInput[] = [
      { garmentId: 301, slot: "accessory", position: 0 },
      { garmentId: 302, slot: "accessory", position: 1 },
      { garmentId: 303, slot: "accessory", position: 2 }
    ];

    expect(moveAccessoryItem(items, 302, -1)).toEqual([
      { garmentId: 302, slot: "accessory", position: 0 },
      { garmentId: 301, slot: "accessory", position: 1 },
      { garmentId: 303, slot: "accessory", position: 2 }
    ]);
    expect(moveAccessoryItem(items, 301, -1)).toEqual(items);
    expect(moveAccessoryItem(items, 303, 1)).toEqual(items);
  });

  it("lays out saved outfit cards and builder controls responsively without adding mobile navigation", () => {
    const styles = readAppStyles();

    expect(cssRule(styles, ".saved-outfits-grid")).toMatch(/display:\s*grid;/);
    expect(cssRule(styles, ".outfit-builder__accessory-actions")).toMatch(/display:\s*flex;/);
    expect(styles).toMatch(/@media\s+\(max-width:\s*640px\)[\s\S]*\.saved-outfits-grid\s*\{[\s\S]*grid-template-columns:\s*1fr;/);
    expect(styles).toMatch(/@media\s+\(max-width:\s*640px\)[\s\S]*\.outfit-builder__footer \.ui-button[\s\S]*min-height:\s*2\.75rem;/);
    expect(styles).toMatch(/\.mobile-nav[\s\S]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\);/);
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
    id: TEST_CANDIDATE_ID,
    candidateId: TEST_CANDIDATE_ID,
    outfitSignature: TEST_OUTFIT_SIGNATURE,
    score: 91,
    items: [
      makeGarment(101, "白衬衫", "top", { brand: "无印良品", rawName: "无印良品白衬衫长标题" }),
      makeGarment(202, "黑长裤", "bottom", { brand: "优衣库", rawName: "优衣库黑长裤长标题" })
    ],
    reasons: ["适合通勤"],
    replacements: []
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

function makeSavedOutfit(
  id: number,
  name: string,
  items: Array<{
    id: number;
    garmentId?: number;
    slot: SavedOutfit["items"][number]["slot"];
    position: number;
    name: string;
    brand?: string;
    imageUrl?: string;
  }>,
  overrides: Partial<SavedOutfit> = {}
): SavedOutfit {
  return {
    id,
    name,
    notes: "",
    source: "manual",
    favorite: false,
    items: items.map((item) => ({
      id: item.id,
      outfitId: id,
      garmentId: item.garmentId,
      slot: item.slot,
      position: item.position,
      garmentSnapshot: {
        id: item.garmentId ?? item.id,
        name: item.name,
        brand: item.brand ?? "",
        category: item.slot,
        imageUrl: item.imageUrl ?? ""
      }
    })),
    createdAt: "2026-07-11T08:00:00.000Z",
    updatedAt: "2026-07-11T08:00:00.000Z",
    ...overrides
  };
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
