import {
  BarChart3,
  Check,
  CloudSun,
  Copy,
  Database,
  Download,
  ExternalLink,
  LockKeyhole,
  LogIn,
  LogOut,
  MapPin,
  Play,
  RefreshCw,
  Save,
  Settings,
  Shirt,
  Sparkles,
  Upload,
  UserRound,
  Wand2,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  deleteGarment,
  exportLocalData,
  getAuthStatus,
  getGarments,
  getInsights,
  getPersonalProfile,
  getRecommendations,
  getRecommendationRuns,
  getWeather,
  getWearLogs,
  getCaptureJobArtifact,
  importTaobaoBatch,
  previewTaobaoImport,
  readLatestTaobaoCapture,
  recordWearLog,
  refreshGarmentThumbnails,
  login,
  logout,
  register as registerAccount,
  savePersonalProfile,
  startCaptureJob,
  updateGarment,
  type CaptureStartResult,
  type ImportSummary
} from "./api";
import { getTaobaoBookmarklet } from "./bookmarklet/taobaoBookmarklet";
import type { AuthStatus, AuthUser, CaptureJob, Garment, OutfitExport, OutfitRecommendation, PersonalProfile, RecommendationResult, RecommendationRunEntry, TaobaoImportPreview, TaobaoWardrobeFilterSummary, WardrobeInsights, WearLogEntry, WeatherSnapshot } from "./shared/types";

type Tab = "import" | "wardrobe" | "recommend" | "history" | "settings";
type AuthInput = { username: string; password: string };
type WearLogFeedback = { outfitId: string; message: string };
type GarmentWithMeta = Garment & { brand?: string | null; rawName?: string | null };
type SelectOption = { value: string; label: string };
type BusyAction =
  | "import"
  | "preview-import"
  | "capture-orders"
  | "capture-item"
  | "read-capture"
  | "refresh-thumbnails"
  | "bulk-confirm"
  | "locate"
  | "save-settings"
  | "history"
  | "export"
  | "weather"
  | "recommend";
type WardrobeStatusFilter = "all" | "pending" | "confirmed" | "excluded";
type WardrobeOwnedFilter = "all" | "owned" | "not-owned";
type WardrobeFilters = {
  status: WardrobeStatusFilter;
  category: "all" | Garment["category"];
  color: string;
  season: "all" | Garment["seasons"][number];
  owned: WardrobeOwnedFilter;
  query: string;
};

const CATEGORY_LABELS: Record<Garment["category"], string> = {
  top: "上装",
  bottom: "下装",
  dress: "连衣裙",
  outerwear: "外套",
  shoes: "鞋履",
  accessory: "配饰"
};

const WARMTH_LABELS: Record<Garment["warmth"], string> = {
  light: "轻薄",
  medium: "常规",
  warm: "保暖",
  heavy: "厚重"
};

const SEASON_LABELS: Record<Garment["seasons"][number], string> = {
  spring: "春",
  summer: "夏",
  autumn: "秋",
  winter: "冬"
};

const COLOR_LABELS: Record<string, string> = {
  black: "黑色",
  white: "白色",
  gray: "灰色",
  blue: "蓝色",
  brown: "棕色",
  beige: "米色",
  red: "红色",
  pink: "粉色",
  green: "绿色",
  yellow: "黄色",
  purple: "紫色",
  unknown: "未知"
};

const OCCASIONS = ["casual", "smart-casual", "formal", "sport"] as const;

const OCCASION_LABELS: Record<(typeof OCCASIONS)[number], string> = {
  casual: "休闲",
  "smart-casual": "商务休闲",
  formal: "正装",
  sport: "运动"
};
const BODY_TYPE_LABELS: Record<NonNullable<PersonalProfile["bodyType"]>, string> = {
  "slim-tall": "瘦高",
  average: "标准",
  athletic: "运动型",
  stocky: "壮实"
};
const SKIN_TONE_LABELS: Record<NonNullable<PersonalProfile["skinTone"]>, string> = {
  "dark-yellow": "较黑黄",
  "medium-yellow": "中性偏黄",
  fair: "偏白",
  deep: "深色"
};
const COLOR_DISPOSITION_LABELS: Record<NonNullable<PersonalProfile["colorDisposition"]>, string> = {
  "cool-clean": "清爽冷感",
  neutral: "中性",
  "warm-soft": "柔和暖感"
};
const TEMPERATURE_LABELS: Record<NonNullable<PersonalProfile["temperatureSensitivity"]>, string> = {
  "runs-cold": "怕冷",
  neutral: "正常",
  "runs-hot": "怕热"
};
const TAOBAO_BOUGHT_ITEMS_URL = "https://buyertrade.taobao.com/trade/itemlist/list_bought_items.htm";
const CATEGORY_OPTIONS = toOptions(CATEGORY_LABELS);
const WARMTH_OPTIONS = toOptions(WARMTH_LABELS);
const COLOR_OPTIONS = Object.entries(COLOR_LABELS).map(([value, label]) => ({ value, label }));
const SEASON_OPTIONS = toOptions(SEASON_LABELS);
const STATUS_FILTER_OPTIONS: SelectOption[] = [
  { value: "all", label: "全部状态" },
  { value: "pending", label: "待确认" },
  { value: "confirmed", label: "已确认" },
  { value: "excluded", label: "已排除" }
];
const OWNED_FILTER_OPTIONS: SelectOption[] = [
  { value: "all", label: "全部拥有" },
  { value: "owned", label: "拥有" },
  { value: "not-owned", label: "不在衣橱" }
];
const CATEGORY_FILTER_OPTIONS: SelectOption[] = [{ value: "all", label: "全部类别" }, ...CATEGORY_OPTIONS];
const SEASON_FILTER_OPTIONS: SelectOption[] = [{ value: "all", label: "全部季节" }, ...SEASON_OPTIONS];
const BODY_TYPE_OPTIONS = toOptions(BODY_TYPE_LABELS);
const SKIN_TONE_OPTIONS = toOptions(SKIN_TONE_LABELS);
const COLOR_DISPOSITION_OPTIONS = toOptions(COLOR_DISPOSITION_LABELS);
const TEMPERATURE_OPTIONS = toOptions(TEMPERATURE_LABELS);
const DEFAULT_PROFILE: PersonalProfile = {
  heightCm: 176,
  weightKg: 57,
  bodyType: "slim-tall",
  skinTone: "dark-yellow",
  colorDisposition: "cool-clean",
  temperatureSensitivity: "neutral",
  preferredColors: ["white", "blue", "gray"],
  avoidedColors: ["yellow", "brown"],
  preferredStyles: ["smart-casual"]
};

export function buildTaobaoOrderCaptureOptions() {
  return { maxPages: 15, loginWait: 60 };
}

export function App() {
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getAuthStatus()
      .then((status) => {
        if (!cancelled) setAuthStatus(status);
      })
      .catch((statusError) => {
        if (cancelled) return;
        setAuthStatus({ hasAccount: true, user: null });
        setAuthError(statusError instanceof Error ? statusError.message : "认证状态读取失败");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function submitAuth(input: AuthInput) {
    if (!authStatus) return;
    setAuthBusy(true);
    setAuthError("");
    try {
      const nextStatus = authStatus.hasAccount ? await login(input) : await registerAccount(input);
      setAuthStatus(nextStatus);
    } catch (authSubmitError) {
      setAuthError(authSubmitError instanceof Error ? authSubmitError.message : "认证失败");
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOut() {
    setAuthBusy(true);
    setAuthError("");
    try {
      await logout();
      setAuthStatus({ hasAccount: true, user: null });
    } catch (logoutError) {
      setAuthError(logoutError instanceof Error ? logoutError.message : "退出失败");
    } finally {
      setAuthBusy(false);
    }
  }

  if (!authStatus) {
    return (
      <div className="auth-shell" data-theme="corporate">
        <div className="auth-card loading">
          <Shirt size={30} />
          <strong>正在进入 Outfit</strong>
        </div>
      </div>
    );
  }

  if (!authStatus.user) {
    return (
      <AuthView
        hasAccount={authStatus.hasAccount}
        busy={authBusy}
        error={authError}
        onSubmit={submitAuth}
      />
    );
  }

  return <MainApp user={authStatus.user} onLogout={signOut} />;
}

export function MainApp(props: { user?: AuthUser | null; onLogout?: () => void } = {}) {
  const [tab, setTab] = useState<Tab>("recommend");
  const [garments, setGarments] = useState<Garment[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [wardrobeFilters, setWardrobeFilters] = useState<WardrobeFilters>({
    status: "all",
    category: "all",
    color: "all",
    season: "all",
    owned: "all",
    query: ""
  });
  const [importText, setImportText] = useState("");
  const [importResult, setImportResult] = useState<ImportSummary | null>(null);
  const [importPreview, setImportPreview] = useState<TaobaoImportPreview | null>(null);
  const [captureFilterSummary, setCaptureFilterSummary] = useState<TaobaoWardrobeFilterSummary | null>(null);
  const [captureUrl, setCaptureUrl] = useState("");
  const [captureResult, setCaptureResult] = useState<CaptureStartResult | CaptureJob | null>(null);
  const [captureJob, setCaptureJob] = useState<CaptureJob | null>(null);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationResult | null>(null);
  const [profile, setProfile] = useState<PersonalProfile>(DEFAULT_PROFILE);
  const [wearLogs, setWearLogs] = useState<WearLogEntry[]>([]);
  const [recommendationRuns, setRecommendationRuns] = useState<RecommendationRunEntry[]>([]);
  const [insights, setInsights] = useState<WardrobeInsights | null>(null);
  const [recordingOutfitId, setRecordingOutfitId] = useState<string | null>(null);
  const [wearLogFeedback, setWearLogFeedback] = useState<WearLogFeedback | null>(null);
  const [thumbnailRefreshMessage, setThumbnailRefreshMessage] = useState("");
  const [occasion, setOccasion] = useState("casual");
  const [latitude, setLatitude] = useState(() => localStorage.getItem("outfit.latitude") || "39.9042");
  const [longitude, setLongitude] = useState(() => localStorage.getItem("outfit.longitude") || "116.4074");
  const [busyAction, setBusyAction] = useState<BusyAction | null>(null);
  const [error, setError] = useState("");

  const bookmarklet = useMemo(() => getTaobaoBookmarklet(), []);
  const pendingCount = garments.filter((item) => !item.confirmed && !item.excluded).length;
  const activeGarments = garments.filter((item) => item.owned && !item.excluded);

  useEffect(() => {
    void refreshGarments();
    void refreshProfile();
    void refreshHistoryData();
  }, []);

  async function refreshGarments() {
    setError("");
    setGarments(await getGarments());
  }

  async function refreshProfile() {
    try {
      setProfile(await getPersonalProfile());
    } catch {
      setProfile(DEFAULT_PROFILE);
    }
  }

  async function refreshHistoryData() {
    setError("");
    try {
      const [nextWearLogs, nextRecommendationRuns, nextInsights] = await Promise.all([
        getWearLogs(),
        getRecommendationRuns(),
        getInsights()
      ]);
      setWearLogs(nextWearLogs);
      setRecommendationRuns(nextRecommendationRuns);
      setInsights(nextInsights);
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : "历史数据读取失败");
    }
  }

  async function runImport() {
    setBusyAction("import");
    setError("");
    try {
      const payload = JSON.parse(importText);
      const result = await importTaobaoBatch(payload);
      setImportResult(result);
      setImportPreview(null);
      setImportText("");
      setCaptureFilterSummary(null);
      await refreshGarments();
      setTab("wardrobe");
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "导入失败");
    } finally {
      setBusyAction(null);
    }
  }

  async function copyBookmarklet() {
    await navigator.clipboard.writeText(bookmarklet);
  }

  async function startOrdersCapture() {
    setBusyAction("capture-orders");
    setError("");
    setCaptureResult(null);
    try {
      const job = await startCaptureJob({ mode: "orders", ...buildTaobaoOrderCaptureOptions() });
      setCaptureJob(job);
      setCaptureResult(job);
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : "启动采集失败");
    } finally {
      setBusyAction(null);
    }
  }

  async function startItemCapture() {
    setBusyAction("capture-item");
    setError("");
    setCaptureResult(null);
    try {
      const job = await startCaptureJob({ mode: "item-detail", url: captureUrl.trim(), loginWait: 60 });
      setCaptureJob(job);
      setCaptureResult(job);
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : "启动采集失败");
    } finally {
      setBusyAction(null);
    }
  }

  async function readLatestCapture() {
    setBusyAction("read-capture");
    setError("");
    try {
      const latest = captureJob
        ? await getCaptureJobArtifact(captureJob.id, { wardrobeOnly: true })
        : await readLatestTaobaoCapture({ wardrobeOnly: true });
      setImportResult(null);
      setImportPreview(null);
      setCaptureFilterSummary(latest.filterSummary ?? null);
      setImportText(latest.jsonText || JSON.stringify(latest.payload, null, 2));
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : "读取采集产物失败");
    } finally {
      setBusyAction(null);
    }
  }

  function updateImportText(value: string) {
    setImportText(value);
    setCaptureFilterSummary(null);
    setImportPreview(null);
  }

  async function previewImport() {
    setBusyAction("preview-import");
    setError("");
    try {
      const payload = JSON.parse(importText);
      setImportPreview(await previewTaobaoImport(payload));
      setImportResult(null);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "预览失败");
    } finally {
      setBusyAction(null);
    }
  }

  async function updateOne(id: number, update: Partial<Garment>) {
    const updated = await updateGarment(id, update);
    setGarments((items) => items.map((item) => (item.id === id ? updated : item)));
  }

  async function deleteOne(id: number) {
    await deleteGarment(id);
    setGarments((items) => items.filter((item) => item.id !== id));
    setSelectedIds((ids) => ids.filter((selectedId) => selectedId !== id));
  }

  async function bulkConfirm() {
    setBusyAction("bulk-confirm");
    setError("");
    try {
      await Promise.all(selectedIds.map((id) => updateGarment(id, { confirmed: true })));
      setSelectedIds([]);
      await refreshGarments();
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : "批量确认失败");
    } finally {
      setBusyAction(null);
    }
  }

  async function refreshThumbnails() {
    setBusyAction("refresh-thumbnails");
    setError("");
    setThumbnailRefreshMessage("");
    try {
      const result = await refreshGarmentThumbnails({ maxDownloads: 8 });
      setThumbnailRefreshMessage(`缩略图更新 ${result.updated} 件，尝试下载 ${result.attemptedDownloads} 张`);
      await refreshGarments();
    } catch (thumbnailError) {
      setError(thumbnailError instanceof Error ? thumbnailError.message : "缩略图刷新失败");
    } finally {
      setBusyAction(null);
    }
  }

  async function locate() {
    if (!navigator.geolocation) return;
    setBusyAction("locate");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude.toFixed(4);
        const lon = position.coords.longitude.toFixed(4);
        setLatitude(lat);
        setLongitude(lon);
        localStorage.setItem("outfit.latitude", lat);
        localStorage.setItem("outfit.longitude", lon);
        setBusyAction(null);
      },
      () => setBusyAction(null)
    );
  }

  async function fetchForecast() {
    setBusyAction("weather");
    setError("");
    try {
      const snapshot = await getWeather(Number(latitude), Number(longitude));
      setWeather(snapshot);
    } catch (weatherError) {
      setError(weatherError instanceof Error ? weatherError.message : "天气获取失败");
    } finally {
      setBusyAction(null);
    }
  }

  async function generateRecommendations() {
    setBusyAction("recommend");
    setError("");
    try {
      const snapshot = weather ?? (await getWeather(Number(latitude), Number(longitude)));
      setWeather(snapshot);
      setRecommendations(await getRecommendations({ weather: snapshot, occasion, userProfile: profile }));
    } catch (recommendError) {
      setError(recommendError instanceof Error ? recommendError.message : "推荐失败");
    } finally {
      setBusyAction(null);
    }
  }

  async function recordRecommendationWear(outfit: OutfitRecommendation) {
    setError("");
    setWearLogFeedback(null);
    setRecordingOutfitId(outfit.id);
    try {
      await recordWearLog(buildRecommendationWearLogInput(outfit, occasion, weather ?? recommendations?.weather ?? null));
      setWearLogFeedback({ outfitId: outfit.id, message: "已标记已穿" });
      await refreshHistoryData();
    } catch (wearLogError) {
      setError(wearLogError instanceof Error ? wearLogError.message : "标记已穿失败");
    } finally {
      setRecordingOutfitId(null);
    }
  }

  async function saveSettings() {
    setBusyAction("save-settings");
    setError("");
    try {
      localStorage.setItem("outfit.latitude", latitude);
      localStorage.setItem("outfit.longitude", longitude);
      setProfile(await savePersonalProfile(profile));
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : "设置保存失败");
    } finally {
      setBusyAction(null);
    }
  }

  async function refreshHistory() {
    setBusyAction("history");
    try {
      await refreshHistoryData();
    } finally {
      setBusyAction(null);
    }
  }

  async function exportBackup() {
    setBusyAction("export");
    setError("");
    try {
      const data = await exportLocalData();
      downloadJson(data);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "导出失败");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="app-shell" data-theme="corporate">
      <aside className="sidebar">
        <div className="brand">
          <Shirt size={28} />
          <div>
            <strong>Outfit</strong>
            <span>{activeGarments.length} 件可用</span>
          </div>
        </div>
        <nav>
          <NavButton active={tab === "recommend"} icon={<Wand2 size={18} />} label="今日推荐" onClick={() => setTab("recommend")} />
          <NavButton active={tab === "wardrobe"} icon={<Database size={18} />} label={`衣服库 ${pendingCount ? `(${pendingCount})` : ""}`} onClick={() => setTab("wardrobe")} />
          <NavButton active={tab === "history"} icon={<BarChart3 size={18} />} label="历史洞察" onClick={() => setTab("history")} />
          <NavButton active={tab === "import"} icon={<Upload size={18} />} label="导入" onClick={() => setTab("import")} />
          <NavButton active={tab === "settings"} icon={<Settings size={18} />} label="设置" onClick={() => setTab("settings")} />
        </nav>
        {props.user && props.onLogout ? <SessionSummary user={props.user} onLogout={props.onLogout} /> : null}
      </aside>

      <main className="workspace">
        {error ? <div className="banner error">{error}</div> : null}
        {tab === "recommend" && (
          <RecommendationView
            weather={weather}
            recommendations={recommendations}
            occasion={occasion}
            latitude={latitude}
            longitude={longitude}
            busy={Boolean(busyAction)}
            busyAction={busyAction}
            recordingOutfitId={recordingOutfitId}
            wearLogFeedback={wearLogFeedback}
            onOccasion={setOccasion}
            onFetchWeather={fetchForecast}
            onGenerate={generateRecommendations}
            onRecordWearLog={recordRecommendationWear}
          />
        )}
        {tab === "wardrobe" && (
          <WardrobeView
            garments={garments}
            selectedIds={selectedIds}
            busy={Boolean(busyAction)}
            busyAction={busyAction}
            filters={wardrobeFilters}
            onFilters={setWardrobeFilters}
            onRefresh={refreshGarments}
            onSelect={setSelectedIds}
            onUpdate={updateOne}
            onDelete={deleteOne}
            onBulkConfirm={bulkConfirm}
            onRefreshThumbnails={refreshThumbnails}
            thumbnailRefreshMessage={thumbnailRefreshMessage}
          />
        )}
        {tab === "history" && (
          <HistoryInsightsView
            insights={insights}
            wearLogs={wearLogs}
            recommendationRuns={recommendationRuns}
            busy={Boolean(busyAction)}
            busyAction={busyAction}
            onRefresh={refreshHistory}
            onExport={exportBackup}
          />
        )}
        {tab === "import" && (
          <ImportView
            bookmarklet={bookmarklet}
            importText={importText}
            importResult={importResult}
            importPreview={importPreview}
            filterSummary={captureFilterSummary}
            captureUrl={captureUrl}
            captureResult={captureResult}
            busy={Boolean(busyAction)}
            busyAction={busyAction}
            onCopyBookmarklet={copyBookmarklet}
            onImportText={updateImportText}
            onImport={runImport}
            onCaptureUrl={setCaptureUrl}
            onStartOrdersCapture={startOrdersCapture}
            onStartItemCapture={startItemCapture}
            onReadLatestCapture={readLatestCapture}
            onPreviewImport={previewImport}
          />
        )}
        {tab === "settings" && (
          <SettingsView
            latitude={latitude}
            longitude={longitude}
            busy={Boolean(busyAction)}
            busyAction={busyAction}
            profile={profile}
            onLatitude={setLatitude}
            onLongitude={setLongitude}
            onLocate={locate}
            onSave={saveSettings}
            onProfile={setProfile}
          />
        )}
      </main>
    </div>
  );
}

export function AuthView(props: {
  hasAccount: boolean;
  busy: boolean;
  error: string;
  onSubmit: (input: AuthInput) => void | Promise<void>;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const title = props.hasAccount ? "登录 Outfit" : "创建本地账号";
  const submitLabel = props.hasAccount ? "进入衣橱" : "创建并进入";

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void props.onSubmit({ username, password });
  }

  return (
    <main className="auth-shell" data-theme="corporate">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-mark">
          {props.hasAccount ? <LogIn size={28} /> : <LockKeyhole size={28} />}
        </div>
        <div>
          <h1>{title}</h1>
          <p>{props.hasAccount ? "输入本地账号进入衣橱。" : "首次使用 Outfit 时创建本机门禁账号。"}</p>
        </div>
        {props.error ? <div className="banner error">{props.error}</div> : null}
        <label htmlFor="auth-username">用户名</label>
        <input
          id="auth-username"
          className="input input-bordered"
          value={username}
          autoComplete="username"
          minLength={3}
          maxLength={32}
          pattern="[A-Za-z0-9_]{3,32}"
          required
          onChange={(event) => setUsername(event.target.value)}
        />
        <label htmlFor="auth-password">密码</label>
        <input
          id="auth-password"
          className="input input-bordered"
          value={password}
          type="password"
          autoComplete={props.hasAccount ? "current-password" : "new-password"}
          minLength={8}
          maxLength={128}
          required
          onChange={(event) => setPassword(event.target.value)}
        />
        <button className="primary btn btn-primary auth-submit" disabled={props.busy} type="submit">
          {props.hasAccount ? <LogIn size={18} /> : <LockKeyhole size={18} />}
          {props.busy ? "处理中" : submitLabel}
        </button>
      </form>
    </main>
  );
}

export function SessionSummary({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  return (
    <div className="session-card">
      <div className="session-user">
        <UserRound size={18} />
        <div>
          <span>当前账号</span>
          <strong>{user.username}</strong>
        </div>
      </div>
      <button className="nav-button session-logout" type="button" onClick={onLogout}>
        <LogOut size={18} />
        <span>退出</span>
      </button>
    </div>
  );
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  const accessibleLabel = label.trim();
  return (
    <button className={active ? "nav-button active" : "nav-button"} aria-current={active ? "page" : undefined} aria-label={accessibleLabel} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

export function ImportView(props: {
  bookmarklet: string;
  importText: string;
  importResult: ImportSummary | null;
  importPreview?: TaobaoImportPreview | null;
  filterSummary: TaobaoWardrobeFilterSummary | null;
  captureUrl: string;
  captureResult: CaptureStartResult | CaptureJob | null;
  busy: boolean;
  busyAction?: BusyAction | null;
  onCopyBookmarklet: () => void;
  onImportText: (value: string) => void;
  onImport: () => void;
  onPreviewImport?: () => void;
  onCaptureUrl: (value: string) => void;
  onStartOrdersCapture: () => void;
  onStartItemCapture: () => void;
  onReadLatestCapture: () => void;
}) {
  return (
    <section className="view">
      <header className="view-header">
        <div>
          <h1>导入淘宝订单</h1>
          <p>本地 JSON 入口，不保存淘宝账号。</p>
        </div>
        <div className="actions">
          <a className="secondary link-button btn btn-soft" href={TAOBAO_BOUGHT_ITEMS_URL} target="_blank" rel="noreferrer">
            <ExternalLink size={18} />
            已买到的宝贝
          </a>
          <button className="icon-button btn btn-square btn-soft" title="复制书签脚本" onClick={props.onCopyBookmarklet}>
            <Copy size={18} />
          </button>
        </div>
      </header>
      <div className="import-guide">
        <span>1 安装采集书签</span>
        <span>2 打开已买到或商品详情</span>
        <span>3 粘贴 JSON 导入</span>
      </div>
      <div className="panel selenium-panel card">
        <label>Selenium 采集</label>
        <div className="selenium-controls">
          <button className="secondary btn btn-soft" disabled={props.busyAction === "capture-orders"} onClick={props.onStartOrdersCapture}>
            <Play size={18} />
            {props.busyAction === "capture-orders" ? "采集中" : "采集订单页"}
          </button>
          <input
            className="input input-bordered"
            value={props.captureUrl}
            onChange={(event) => props.onCaptureUrl(event.target.value)}
            placeholder="https://item.taobao.com/item.htm?id=..."
          />
          <button className="primary btn btn-primary" disabled={props.busyAction === "capture-item" || !props.captureUrl.trim()} onClick={props.onStartItemCapture}>
            <Play size={18} />
            {props.busyAction === "capture-item" ? "采集中" : "采集商品详情"}
          </button>
        </div>
        {props.captureResult ? (
          <div className="capture-status text-wrap-anywhere">
            已启动 {props.captureResult.mode === "orders" ? "订单页采集" : "商品详情采集"}，PID {props.captureResult.pid}，输出目录 {props.captureResult.outputDir}
            {"status" in props.captureResult ? `，状态 ${captureStatusLabel(props.captureResult.status)}` : ""}
          </div>
        ) : null}
      </div>
      <div className="grid two">
        <div className="panel card">
          <label>书签脚本</label>
          <textarea className="code-box textarea textarea-bordered" readOnly value={props.bookmarklet} />
          <div className="bookmarklet-actions">
            <a className="bookmarklet-link" href={props.bookmarklet}>
              Outfit 淘宝采集
            </a>
            <button className="secondary btn btn-soft" onClick={props.onCopyBookmarklet}>
              <Copy size={18} />
              复制脚本
            </button>
          </div>
        </div>
        <div className="panel card">
          <label>采集 JSON</label>
          <textarea
            className="import-box textarea textarea-bordered"
            value={props.importText}
            onChange={(event) => props.onImportText(event.target.value)}
            placeholder='{"source":"taobao-bookmarklet","items":[]}'
          />
          <div className="import-actions">
            <button className="secondary btn btn-soft" disabled={props.busyAction === "read-capture"} onClick={props.onReadLatestCapture}>
              <Database size={18} />
              {props.busyAction === "read-capture" ? "读取中" : "读取产物"}
            </button>
            <button className="secondary btn btn-soft" disabled={props.busyAction === "preview-import" || !props.importText.trim()} onClick={props.onPreviewImport}>
              <Sparkles size={18} />
              {props.busyAction === "preview-import" ? "预览中" : "预览"}
            </button>
            <button className="primary btn btn-primary" disabled={props.busyAction === "import" || !props.importText.trim()} onClick={props.onImport}>
              <Upload size={18} />
              {props.busyAction === "import" ? "导入中" : "导入"}
            </button>
          </div>
          {props.filterSummary ? (
            <div className="capture-status text-wrap-anywhere">
              已从 {props.filterSummary.originalItems} 条订单中保留 {props.filterSummary.keptItems} 条衣服/鞋候选，退款过滤 {props.filterSummary.skippedRefunded} 条，非服饰过滤 {props.filterSummary.skippedNonApparel} 条。
            </div>
          ) : null}
        </div>
      </div>
      {props.importResult ? (
        <div className="metric-strip">
          <Metric label="订单项" value={props.importResult.summary.totalItems} />
          <Metric label="唯一项" value={props.importResult.summary.uniqueItems} />
          <Metric label="退款过滤" value={props.importResult.summary.skippedRefunded} />
          <Metric label="非服饰过滤" value={props.importResult.summary.skippedNonApparel} />
          <Metric label="新衣服" value={props.importResult.summary.createdGarments} />
        </div>
      ) : null}
      {props.importPreview ? (
        <div className="panel preview-panel card">
          <label>导入预览</label>
          <div className="metric-strip">
            <Metric label="候选" value={props.importPreview.candidates.length} />
            <Metric label="重复" value={props.importPreview.duplicateCount} />
            <Metric label="退款过滤" value={props.importPreview.summary.skippedRefunded} />
            <Metric label="非服饰过滤" value={props.importPreview.summary.skippedNonApparel} />
            <Metric label="唯一项" value={props.importPreview.summary.uniqueItems} />
          </div>
          <div className="preview-list">
            {props.importPreview.candidates.slice(0, 6).map((item) => (
              <span className="text-wrap-anywhere" key={item.sourceItemKey}>{CATEGORY_LABELS[item.category]} · {item.name} · 置信度 {Math.round(item.confidence * 100)}%</span>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function WardrobeView(props: {
  garments: Garment[];
  selectedIds: number[];
  busy: boolean;
  busyAction?: BusyAction | null;
  filters?: WardrobeFilters;
  onFilters?: (filters: WardrobeFilters) => void;
  onRefresh: () => void;
  onSelect: (ids: number[]) => void;
  onUpdate: (id: number, update: Partial<Garment>) => void;
  onDelete: (id: number) => void;
  onBulkConfirm: () => void;
  onRefreshThumbnails?: () => void;
  thumbnailRefreshMessage?: string;
}) {
  const filters = props.filters ?? {
    status: "all",
    category: "all",
    color: "all",
    season: "all",
    owned: "all",
    query: ""
  };
  const colorFilterOptions = buildColorFilterOptions(props.garments);
  const filteredGarments = props.garments.filter((item) => matchesWardrobeFilters(item, filters));
  const filteredIds = filteredGarments.map((item) => item.id);

  function updateFilter<K extends keyof WardrobeFilters>(key: K, value: WardrobeFilters[K]) {
    props.onFilters?.({ ...filters, [key]: value });
  }

  return (
    <section className="view">
      <header className="view-header">
        <div>
          <h1>衣服库</h1>
          <p>{props.garments.length} 件，{props.garments.filter((item) => !item.confirmed && !item.excluded).length} 件待确认，当前显示 {filteredGarments.length} 件。</p>
        </div>
        <div className="actions">
          <button className="secondary btn btn-soft" title="刷新" onClick={props.onRefresh}>
            <RefreshCw size={18} />
            刷新
          </button>
          {props.onRefreshThumbnails ? (
            <button className="secondary btn btn-soft" disabled={props.busyAction === "refresh-thumbnails"} onClick={props.onRefreshThumbnails}>
              <Shirt size={18} />
              {props.busyAction === "refresh-thumbnails" ? "处理中" : "补缩略图"}
            </button>
          ) : null}
          <button className="secondary btn btn-soft" disabled={!filteredIds.length} onClick={() => props.onSelect(filteredIds)}>
            <Check size={18} />
            选择当前结果
          </button>
          <button className="secondary btn btn-soft" disabled={!props.selectedIds.length} onClick={() => props.onSelect([])}>
            <X size={18} />
            清空选择
          </button>
          <button className="primary btn btn-primary" disabled={!props.selectedIds.length || props.busyAction === "bulk-confirm"} onClick={props.onBulkConfirm}>
            <Check size={18} />
            {props.busyAction === "bulk-confirm" ? "确认中" : "批量确认"}
          </button>
        </div>
      </header>
      {props.thumbnailRefreshMessage ? <p className="inline-feedback">{props.thumbnailRefreshMessage}</p> : null}
      <div className="filter-bar">
        <input
          className="input input-bordered input-sm"
          value={filters.query}
          onChange={(event) => updateFilter("query", event.target.value)}
          placeholder="搜索名称、品牌、材质或标签"
        />
        <Select value={filters.status} options={STATUS_FILTER_OPTIONS} onChange={(value) => updateFilter("status", value as WardrobeStatusFilter)} />
        <Select value={filters.category} options={CATEGORY_FILTER_OPTIONS} onChange={(value) => updateFilter("category", value as WardrobeFilters["category"])} />
        <Select value={filters.color} options={colorFilterOptions} onChange={(value) => updateFilter("color", value)} />
        <Select value={filters.season} options={SEASON_FILTER_OPTIONS} onChange={(value) => updateFilter("season", value as WardrobeFilters["season"])} />
        <Select value={filters.owned} options={OWNED_FILTER_OPTIONS} onChange={(value) => updateFilter("owned", value as WardrobeOwnedFilter)} />
      </div>
      {props.garments.length ? (
        filteredGarments.length ? (
          <div className="wardrobe-list">
            {filteredGarments.map((item) => (
          <article className={item.excluded ? "garment-row muted" : "garment-row"} key={item.id} title={garmentMeta(item).rawName || undefined}>
            <input
              className="checkbox checkbox-sm"
              type="checkbox"
              checked={props.selectedIds.includes(item.id)}
              onChange={(event) =>
                props.onSelect(event.target.checked ? [...props.selectedIds, item.id] : props.selectedIds.filter((id) => id !== item.id))
              }
            />
            <GarmentThumbnail item={item} />
            <div className="garment-main">
              <div className="garment-title-line">
                {garmentMeta(item).brand ? <span className="brand-tag">{garmentMeta(item).brand}</span> : null}
                <input
                  className="input input-bordered input-sm"
                  value={item.name}
                  title={garmentMeta(item).rawName || item.name}
                  onChange={(event) => props.onUpdate(item.id, { name: event.target.value })}
                />
              </div>
              <div className="field-grid">
                <Select value={item.category} options={CATEGORY_OPTIONS} onChange={(value) => props.onUpdate(item.id, { category: value as Garment["category"] })} />
                <Select value={item.color} options={withCurrentOption(COLOR_OPTIONS, item.color)} onChange={(value) => props.onUpdate(item.id, { color: value })} />
                <Select value={item.warmth} options={WARMTH_OPTIONS} onChange={(value) => props.onUpdate(item.id, { warmth: value as Garment["warmth"] })} />
                <SeasonPicker seasons={item.seasons} onChange={(seasons) => props.onUpdate(item.id, { seasons })} />
                <label className="detail-field">
                  <span>尺码</span>
                  <input className="input input-bordered input-sm" value={item.size ?? ""} onChange={(event) => props.onUpdate(item.id, { size: event.target.value })} />
                </label>
                <label className="detail-field">
                  <span>材质</span>
                  <input className="input input-bordered input-sm" value={formatList(item.materials)} onChange={(event) => props.onUpdate(item.id, { materials: parseList(event.target.value) })} />
                </label>
                <label className="detail-field">
                  <span>图案</span>
                  <input className="input input-bordered input-sm" value={formatList(item.patterns)} onChange={(event) => props.onUpdate(item.id, { patterns: parseList(event.target.value) })} />
                </label>
                <label className="detail-field">
                  <span>标签</span>
                  <input className="input input-bordered input-sm" value={formatList(item.tags)} onChange={(event) => props.onUpdate(item.id, { tags: parseList(event.target.value) })} />
                </label>
              </div>
            </div>
            <div className="row-actions">
              {item.detailUrl || item.itemUrl ? (
                <a className="icon-button btn btn-square btn-soft" title="商品详情" href={item.detailUrl || item.itemUrl} target="_blank" rel="noreferrer">
                  <ExternalLink size={16} />
                </a>
              ) : null}
              <button className={item.confirmed ? "status btn btn-sm good" : "status btn btn-sm"} onClick={() => props.onUpdate(item.id, { confirmed: !item.confirmed })}>
                <Check size={16} />
                {item.confirmed ? "已确认" : "确认"}
              </button>
              <button className={item.owned ? "status btn btn-sm" : "status btn btn-sm warn"} onClick={() => props.onUpdate(item.id, { owned: !item.owned })}>
                {item.owned ? "拥有" : "不在衣橱"}
              </button>
              <button className="icon-button btn btn-square btn-soft" title="删除" onClick={() => confirmDelete(item, props.onDelete)}>
                <X size={16} />
              </button>
            </div>
          </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">没有符合当前筛选条件的衣物。</div>
        )
      ) : (
        <div className="empty-state">还没有衣服。先从淘宝采集或粘贴 JSON 导入衣橱。</div>
      )}
    </section>
  );
}

export function RecommendationView(props: {
  weather: WeatherSnapshot | null;
  recommendations: RecommendationResult | null;
  occasion: string;
  latitude: string;
  longitude: string;
  busy: boolean;
  busyAction?: BusyAction | null;
  recordingOutfitId: string | null;
  wearLogFeedback: WearLogFeedback | null;
  onOccasion: (value: string) => void;
  onFetchWeather: () => void;
  onGenerate: () => void;
  onRecordWearLog: (outfit: OutfitRecommendation) => void;
}) {
  return (
    <section className="view">
      <header className="view-header">
        <div>
          <h1>今日推荐</h1>
          <p>{props.latitude}, {props.longitude}</p>
        </div>
        <div className="actions">
          <button className="secondary btn btn-soft" disabled={props.busyAction === "weather"} onClick={props.onFetchWeather}>
            <CloudSun size={18} />
            {props.busyAction === "weather" ? "获取中" : "天气"}
          </button>
          <button className="primary btn btn-primary" disabled={props.busyAction === "recommend"} onClick={props.onGenerate}>
            <Sparkles size={18} />
            {props.busyAction === "recommend" ? "生成中" : "生成"}
          </button>
        </div>
      </header>
      <div className="toolbar">
        {OCCASIONS.map((value) => (
          <button className={props.occasion === value ? "chip btn btn-sm active" : "chip btn btn-sm"} key={value} onClick={() => props.onOccasion(value)}>
            {OCCASION_LABELS[value]}
          </button>
        ))}
      </div>
      {props.weather ? (
        <div className="weather-band">
          <CloudSun size={24} />
          <strong>{props.weather.summary}</strong>
          <span>{props.weather.apparentTemperature}°C 体感</span>
          <span>{props.weather.precipitationProbability}% 降雨</span>
          <span>{props.weather.windSpeed} km/h 风</span>
        </div>
      ) : null}
      {props.recommendations?.outfits.length ? (
        <div className="outfit-grid">
          {props.recommendations.outfits.map((outfit) => (
          <article className="outfit" key={outfit.id}>
            <div className="score">匹配度 {outfit.matchPercent ?? Math.round(Math.min(100, outfit.score))}%</div>
            <div className="item-stack">
              {outfit.items.map((item) => (
                <div className="mini-item" key={item.id}>
                  <GarmentThumbnail item={item} />
                  <div>
                    <span>{CATEGORY_LABELS[item.category]}</span>
                    <strong>{displayGarmentName(item)}</strong>
                  </div>
                </div>
              ))}
            </div>
            <ul>
              {outfit.reasons.slice(0, 2).map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            {outfit.reasons.length > 2 || outfit.alternatives.length ? (
              <details className="outfit-more">
                <summary>更多理由和替代单品</summary>
                {outfit.reasons.length > 2 ? (
                  <ul>
                    {outfit.reasons.slice(2).map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                ) : null}
                {outfit.alternatives.length ? (
                  <p className="alt">可替换：{outfit.alternatives.map((item) => displayGarmentName(item)).join(" / ")}</p>
                ) : null}
              </details>
            ) : null}
            <div className="outfit-actions">
              <button className="secondary btn btn-soft" disabled={props.recordingOutfitId === outfit.id} onClick={() => props.onRecordWearLog(outfit)}>
                <Check size={16} />
                {props.recordingOutfitId === outfit.id ? "标记中" : "标记已穿"}
              </button>
              {props.wearLogFeedback?.outfitId === outfit.id ? <span className="wear-log-feedback">{props.wearLogFeedback.message}</span> : null}
            </div>
          </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">还没有推荐。获取天气后生成今日搭配。</div>
      )}
    </section>
  );
}

export function SettingsView(props: {
  latitude: string;
  longitude: string;
  busy: boolean;
  busyAction?: BusyAction | null;
  profile: PersonalProfile;
  onLatitude: (value: string) => void;
  onLongitude: (value: string) => void;
  onLocate: () => void;
  onSave: () => void;
  onProfile: (profile: PersonalProfile) => void;
}) {
  function updateProfile(update: Partial<PersonalProfile>) {
    props.onProfile({ ...props.profile, ...update });
  }

  return (
    <section className="view compact">
      <header className="view-header">
        <div>
          <h1>设置</h1>
          <p>SQLite: data/outfit.sqlite</p>
        </div>
      </header>
      <div className="panel settings-panel">
        <label>纬度</label>
        <input className="input input-bordered" value={props.latitude} onChange={(event) => props.onLatitude(event.target.value)} />
        <label>经度</label>
        <input className="input input-bordered" value={props.longitude} onChange={(event) => props.onLongitude(event.target.value)} />
        <h2>个人画像</h2>
        <label>身高 cm</label>
        <input className="input input-bordered" type="number" value={props.profile.heightCm ?? ""} onChange={(event) => updateProfile({ heightCm: numberOrUndefined(event.target.value) })} />
        <label>体重 kg</label>
        <input className="input input-bordered" type="number" value={props.profile.weightKg ?? ""} onChange={(event) => updateProfile({ weightKg: numberOrUndefined(event.target.value) })} />
        <label>体型</label>
        <Select value={props.profile.bodyType ?? "slim-tall"} options={BODY_TYPE_OPTIONS} onChange={(value) => updateProfile({ bodyType: value as PersonalProfile["bodyType"] })} />
        <label>肤色</label>
        <Select value={props.profile.skinTone ?? "dark-yellow"} options={SKIN_TONE_OPTIONS} onChange={(value) => updateProfile({ skinTone: value as PersonalProfile["skinTone"] })} />
        <label>色彩倾向</label>
        <Select value={props.profile.colorDisposition ?? "cool-clean"} options={COLOR_DISPOSITION_OPTIONS} onChange={(value) => updateProfile({ colorDisposition: value as PersonalProfile["colorDisposition"] })} />
        <label>温度感受</label>
        <Select value={props.profile.temperatureSensitivity ?? "neutral"} options={TEMPERATURE_OPTIONS} onChange={(value) => updateProfile({ temperatureSensitivity: value as PersonalProfile["temperatureSensitivity"] })} />
        <label>偏好颜色</label>
        <input className="input input-bordered" value={formatColorList(props.profile.preferredColors)} onChange={(event) => updateProfile({ preferredColors: parseColorList(event.target.value) })} placeholder="白色,蓝色,灰色" />
        <label>避开颜色</label>
        <input className="input input-bordered" value={formatColorList(props.profile.avoidedColors)} onChange={(event) => updateProfile({ avoidedColors: parseColorList(event.target.value) })} placeholder="黄色,棕色" />
        <label>偏好风格</label>
        <input className="input input-bordered" value={formatList(props.profile.preferredStyles)} onChange={(event) => updateProfile({ preferredStyles: parseList(event.target.value) })} placeholder="casual,smart-casual" />
        <div className="actions">
          <button className="secondary btn btn-soft" disabled={props.busyAction === "locate"} onClick={props.onLocate}>
            <MapPin size={18} />
            {props.busyAction === "locate" ? "定位中" : "定位"}
          </button>
          <button className="primary btn btn-primary" disabled={props.busyAction === "save-settings"} onClick={props.onSave}>
            <Save size={18} />
            {props.busyAction === "save-settings" ? "保存中" : "保存"}
          </button>
        </div>
      </div>
    </section>
  );
}

export function HistoryInsightsView(props: {
  insights: WardrobeInsights | null;
  wearLogs: WearLogEntry[];
  recommendationRuns: RecommendationRunEntry[];
  busy: boolean;
  busyAction?: BusyAction | null;
  onRefresh: () => void;
  onExport: () => void;
}) {
  const insights = props.insights;
  return (
    <section className="view">
      <header className="view-header">
        <div>
          <h1>历史洞察</h1>
          <p>{insights ? `${insights.totalGarments} 件衣物，${props.wearLogs.length} 条穿着记录。` : "本地穿着记录和推荐历史。"}</p>
        </div>
        <div className="actions">
          <button className="secondary btn btn-soft" disabled={props.busyAction === "history"} onClick={props.onRefresh}>
            <RefreshCw size={18} />
            {props.busyAction === "history" ? "刷新中" : "刷新"}
          </button>
          <button className="primary btn btn-primary" disabled={props.busyAction === "export"} onClick={props.onExport}>
            <Download size={18} />
            {props.busyAction === "export" ? "导出中" : "导出备份"}
          </button>
        </div>
      </header>
      {insights ? (
        <>
          <div className="metric-strip">
            <Metric label="衣物总数" value={insights.totalGarments} />
            <Metric label="可穿" value={insights.ownedGarments} />
            <Metric label="已确认" value={insights.confirmedGarments} />
            <Metric label="待确认" value={insights.pendingGarments} />
          </div>
          <div className="grid two">
            <div className="panel card">
              <label>常穿单品</label>
              <InsightList items={insights.mostWorn} empty="还没有穿着统计。" />
            </div>
            <div className="panel card">
              <label>近期未穿</label>
              <InsightList items={insights.neverWorn} empty="所有衣物都有穿着记录。" />
            </div>
          </div>
          <div className="grid two">
            <div className="panel card">
              <label>类别分布</label>
              <Distribution data={labelDistribution(insights.categoryDistribution, CATEGORY_LABELS)} />
            </div>
            <div className="panel card">
              <label>颜色分布</label>
              <Distribution data={labelDistribution(insights.colorDistribution, COLOR_LABELS)} />
            </div>
          </div>
          <div className="panel card">
            <label>推荐历史</label>
            {props.recommendationRuns.length ? (
              <div className="history-list">
                {props.recommendationRuns.slice(0, 5).map((run) => (
                  <span key={run.id}>{run.createdAt}</span>
                ))}
              </div>
            ) : (
              <div className="empty-state">还没有推荐历史。</div>
            )}
          </div>
        </>
      ) : (
        <div className="empty-state">还没有可展示的历史洞察。</div>
      )}
    </section>
  );
}

function GarmentThumbnail({ item }: { item: Garment }) {
  const [failed, setFailed] = useState(false);
  const meta = garmentMeta(item);
  const alt = [meta.brand, item.name].filter(Boolean).join(" ");
  const thumbnailUrl = localThumbnailUrl(item.imageUrl);

  useEffect(() => {
    setFailed(false);
  }, [thumbnailUrl]);

  return (
    <div className="thumb">
      {thumbnailUrl && !failed ? (
        <img
          src={thumbnailUrl}
          alt={alt || item.name}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : <Shirt size={24} />}
    </div>
  );
}

function localThumbnailUrl(value: string): string {
  return value.startsWith("/api/garment-thumbnails/") ? value : "";
}

function SeasonPicker({ seasons, onChange }: { seasons: Garment["seasons"]; onChange: (seasons: Garment["seasons"]) => void }) {
  function toggle(value: Garment["seasons"][number]) {
    onChange(seasons.includes(value) ? seasons.filter((season) => season !== value) : [...seasons, value]);
  }

  return (
    <div className="season-picker" aria-label="季节">
      {SEASON_OPTIONS.map((option) => (
        <button
          className={seasons.includes(option.value as Garment["seasons"][number]) ? "season-chip btn btn-sm active" : "season-chip btn btn-sm"}
          key={option.value}
          aria-pressed={seasons.includes(option.value as Garment["seasons"][number])}
          type="button"
          onClick={() => toggle(option.value as Garment["seasons"][number])}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Select({ value, options, onChange }: { value: string; options: SelectOption[]; onChange: (value: string) => void }) {
  return (
    <select className="select select-bordered select-sm" value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function InsightList({ items, empty }: { items: Array<{ id: number; name: string; wearCount?: number }>; empty: string }) {
  if (!items.length) return <div className="empty-state">{empty}</div>;
  return (
    <div className="history-list">
      {items.map((item) => (
        <span key={item.id}>{item.name}{item.wearCount ? ` · ${item.wearCount} 次` : ""}</span>
      ))}
    </div>
  );
}

function Distribution({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).filter(([, value]) => value > 0);
  if (!entries.length) return <div className="empty-state">暂无分布数据。</div>;
  return (
    <div className="history-list">
      {entries.map(([label, value]) => (
        <span key={label}>{label} · {value}</span>
      ))}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function toOptions<T extends string>(labels: Record<T, string>): SelectOption[] {
  return Object.entries(labels).map(([value, label]) => ({ value, label: label as string }));
}

function withCurrentOption(options: SelectOption[], value: string): SelectOption[] {
  if (options.some((option) => option.value === value)) {
    return options;
  }
  return [{ value, label: COLOR_LABELS[value] || value || COLOR_LABELS.unknown }, ...options];
}

function buildColorFilterOptions(garments: Garment[]): SelectOption[] {
  const colors = Array.from(new Set(garments.map((item) => item.color || "unknown"))).sort();
  return [
    { value: "all", label: "全部颜色" },
    ...colors.map((color) => ({ value: color, label: COLOR_LABELS[color] || color }))
  ];
}

function matchesWardrobeFilters(item: Garment, filters: WardrobeFilters): boolean {
  const query = filters.query.trim().toLowerCase();
  if (query) {
    const searchable = [
      item.name,
      item.brand,
      item.rawName,
      item.size,
      ...(item.materials ?? []),
      ...(item.patterns ?? []),
      ...(item.tags ?? [])
    ].filter(Boolean).join(" ").toLowerCase();
    if (!searchable.includes(query)) return false;
  }
  if (filters.status === "pending" && (item.confirmed || item.excluded)) return false;
  if (filters.status === "confirmed" && (!item.confirmed || item.excluded)) return false;
  if (filters.status === "excluded" && !item.excluded) return false;
  if (filters.category !== "all" && item.category !== filters.category) return false;
  if (filters.color !== "all" && item.color !== filters.color) return false;
  if (filters.season !== "all" && !item.seasons.includes(filters.season)) return false;
  if (filters.owned === "owned" && !item.owned) return false;
  if (filters.owned === "not-owned" && item.owned) return false;
  return true;
}

function parseList(value: string): string[] {
  return Array.from(new Set(value.split(/[,，]/).map((item) => item.trim()).filter(Boolean)));
}

function formatList(value: string[] | undefined): string {
  return (value ?? []).join(",");
}

function formatColorList(value: string[] | undefined): string {
  return (value ?? []).map((color) => COLOR_LABELS[color] || color).join(",");
}

function parseColorList(value: string): string[] {
  const reverse = Object.fromEntries(Object.entries(COLOR_LABELS).map(([key, label]) => [label, key]));
  return parseList(value).map((color) => reverse[color] || color);
}

function numberOrUndefined(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function labelDistribution<T extends string>(data: Partial<Record<T, number>> | Record<string, number>, labels: Record<string, string>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [labels[key] || key, Number(value ?? 0)])
  );
}

function downloadJson(data: OutfitExport): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `outfit-backup-${data.exportedAt.slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function confirmDelete(item: Garment, onDelete: (id: number) => void) {
  if (globalThis.confirm(`确定删除「${displayGarmentName(item) || item.name}」吗？此操作会从本地衣橱数据库移除这件衣服。`)) {
    onDelete(item.id);
  }
}

function captureStatusLabel(status: CaptureJob["status"]): string {
  return {
    pending: "等待中",
    running: "运行中",
    succeeded: "已完成",
    failed: "失败",
    cancelled: "已取消"
  }[status];
}

function garmentMeta(item: Garment): GarmentWithMeta {
  return item as GarmentWithMeta;
}

function displayGarmentName(item: Garment): string {
  const meta = garmentMeta(item);
  return [meta.brand, item.name].filter(Boolean).join(" ");
}

export function buildRecommendationWearLogInput(outfit: OutfitRecommendation, occasion: string, weather: WeatherSnapshot | null) {
  return {
    garmentIds: outfit.items.map((item) => item.id),
    context: {
      outfitId: outfit.id,
      occasion,
      weather
    }
  };
}
