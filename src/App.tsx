import {
  BarChart3,
  Check,
  CloudSun,
  Copy,
  Cpu,
  Database,
  Download,
  ExternalLink,
  Image as ImageIcon,
  LockKeyhole,
  LogIn,
  LogOut,
  MapPin,
  Play,
  RefreshCw,
  Save,
  Scissors,
  Settings,
  Shirt,
  Sparkles,
  Tags,
  Upload,
  UserRound,
  Wand2,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  analyzeGarmentVisionTags,
  createGarmentCutout,
  deleteGarment,
  downloadVisionModel,
  exportLocalData,
  getAuthStatus,
  getGarmentThumbnailCandidates,
  getGarments,
  getInsights,
  getPersonalProfile,
  getRecommendations,
  getRecommendationRuns,
  getVisionModels,
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
  selectGarmentThumbnail,
  startCaptureJob,
  updateGarment,
  verifyVisionModel,
  type CaptureStartResult,
  type ImportSummary
} from "./api";
import { getTaobaoBookmarklet } from "./bookmarklet/taobaoBookmarklet";
import { ActionCluster, CommandBar, PageHeader, SettingsSection, StatTile, StatusPill, WorkbenchPanel } from "./components/workbench";
import type { AuthStatus, AuthUser, CaptureEngine, CaptureJob, Garment, OutfitExport, OutfitRecommendation, PersonalProfile, RecommendationResult, RecommendationRunEntry, TaobaoImportPreview, TaobaoWardrobeFilterSummary, ThumbnailCandidate, VisionModelId, VisionModelStatus, VisionModelsResponse, VisionTagSuggestion, WardrobeInsights, WearLogEntry, WeatherSnapshot } from "./shared/types";

type Tab = "import" | "wardrobe" | "recommend" | "history" | "settings";
type AuthInput = { username: string; password: string };
type WearLogFeedback = { outfitId: string; message: string };
type GarmentWithMeta = Garment & { brand?: string | null; rawName?: string | null };
type ThumbnailPickerState = {
  garment: Garment;
  candidates: ThumbnailCandidate[];
  selectedUrl: string;
  loading: boolean;
  saving: boolean;
  error: string;
} | null;
type SelectOption = { value: string; label: string };
type BusyAction =
  | "import"
  | "preview-import"
  | "capture-orders"
  | "capture-item"
  | "read-capture"
  | "refresh-thumbnails"
  | "bulk-confirm"
  | "download-vision-model"
  | "verify-vision-model"
  | "locate"
  | "save-settings"
  | "history"
  | "export"
  | "weather"
  | "cutout-garment"
  | "vision-tags"
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
const DEFAULT_LATITUDE = "39.9042";
const DEFAULT_LONGITUDE = "116.4074";
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
  const garmentUpdateVersions = useRef(new Map<number, number>());
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
  const [captureEngine, setCaptureEngine] = useState<CaptureEngine>("selenium");
  const [captureResult, setCaptureResult] = useState<CaptureStartResult | CaptureJob | null>(null);
  const [captureJob, setCaptureJob] = useState<CaptureJob | null>(null);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationResult | null>(null);
  const [profile, setProfile] = useState<PersonalProfile>(DEFAULT_PROFILE);
  const [wearLogs, setWearLogs] = useState<WearLogEntry[]>([]);
  const [recommendationRuns, setRecommendationRuns] = useState<RecommendationRunEntry[]>([]);
  const [insights, setInsights] = useState<WardrobeInsights | null>(null);
  const [visionModels, setVisionModels] = useState<VisionModelsResponse | null>(null);
  const [visionEnabled, setVisionEnabled] = useState(() => readLocalStorageValue("outfit.localVision.enabled", "true") !== "false");
  const [recordingOutfitId, setRecordingOutfitId] = useState<string | null>(null);
  const [visionBusyId, setVisionBusyId] = useState<number | null>(null);
  const [wearLogFeedback, setWearLogFeedback] = useState<WearLogFeedback | null>(null);
  const [thumbnailRefreshMessage, setThumbnailRefreshMessage] = useState("");
  const [thumbnailPicker, setThumbnailPicker] = useState<ThumbnailPickerState>(null);
  const thumbnailPickerRequestId = useRef(0);
  const [occasion, setOccasion] = useState("casual");
  const [latitude, setLatitude] = useState(() => readLocalStorageValue("outfit.latitude", DEFAULT_LATITUDE));
  const [longitude, setLongitude] = useState(() => readLocalStorageValue("outfit.longitude", DEFAULT_LONGITUDE));
  const [busyAction, setBusyAction] = useState<BusyAction | null>(null);
  const [error, setError] = useState("");

  const bookmarklet = useMemo(() => getTaobaoBookmarklet(), []);
  const pendingCount = garments.filter((item) => !item.confirmed && !item.excluded).length;
  const activeGarments = garments.filter((item) => item.owned && !item.excluded);
  const canLogout = Boolean(props.user && props.onLogout);

  useEffect(() => {
    void refreshGarments();
    void refreshProfile();
    void refreshHistoryData();
    void refreshVisionModels();
  }, []);

  async function refreshGarments() {
    await refreshGarmentsForView(getGarments, setGarments, setError);
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

  async function refreshVisionModels() {
    try {
      setVisionModels(await getVisionModels());
    } catch {
      setVisionModels(null);
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
    const writeText = navigator.clipboard?.writeText?.bind(navigator.clipboard);
    if (!writeText) {
      setError("当前浏览器不支持剪贴板复制");
      return;
    }
    await copyTextToClipboard(writeText, bookmarklet, setError);
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
      const job = await startCaptureJob({ mode: "item-detail", url: captureUrl.trim(), loginWait: 60, engine: captureEngine });
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
    const version = (garmentUpdateVersions.current.get(id) ?? 0) + 1;
    let previous: Garment | undefined;
    garmentUpdateVersions.current.set(id, version);
    setError("");
    setGarments((items) => {
      previous = items.find((item) => item.id === id);
      return applyGarmentPatch(items, id, update);
    });
    try {
      const updated = await updateGarment(id, update);
      if (garmentUpdateVersions.current.get(id) === version) {
        setGarments((items) => applyGarmentPatch(items, id, updated));
      }
    } catch (updateError) {
      if (garmentUpdateVersions.current.get(id) !== version) return;
      if (previous) {
        const rollback = previous;
        setGarments((items) => applyGarmentPatch(items, id, rollback));
      }
      setError(updateError instanceof Error ? updateError.message : "衣物保存失败");
    }
  }

  async function deleteOne(id: number) {
    await deleteGarmentForView(deleteGarment, id, setGarments, setSelectedIds, setError);
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

  async function openThumbnailPicker(garment: Garment) {
    const requestId = thumbnailPickerRequestId.current + 1;
    thumbnailPickerRequestId.current = requestId;
    setError("");
    setThumbnailPicker({
      garment,
      candidates: [],
      selectedUrl: "",
      loading: true,
      saving: false,
      error: ""
    });
    try {
      const response = await getGarmentThumbnailCandidates(garment.id);
      if (thumbnailPickerRequestId.current !== requestId) return;
      const selectedUrl = response.candidates.find((candidate) => candidate.selected)?.url || response.candidates[0]?.url || "";
      setThumbnailPicker({
        garment,
        candidates: response.candidates,
        selectedUrl,
        loading: false,
        saving: false,
        error: response.candidates.length ? "" : "没有可选择的商品图"
      });
    } catch (pickerError) {
      if (thumbnailPickerRequestId.current !== requestId) return;
      setThumbnailPicker((current) => current && current.garment.id === garment.id ? {
        ...current,
        loading: false,
        saving: false,
        error: pickerError instanceof Error ? pickerError.message : "候选图加载失败"
      } : current);
    }
  }

  function closeThumbnailPicker() {
    thumbnailPickerRequestId.current += 1;
    setThumbnailPicker(null);
  }

  function chooseThumbnailCandidate(imageUrl: string) {
    setThumbnailPicker((current) => current ? { ...current, selectedUrl: imageUrl, error: "" } : current);
  }

  async function saveThumbnailSelection() {
    if (!thumbnailPicker || !thumbnailPicker.selectedUrl) return;
    const { garment, selectedUrl } = thumbnailPicker;
    setThumbnailPicker((current) => current ? { ...current, saving: true, error: "" } : current);
    try {
      const updated = await selectGarmentThumbnail(garment.id, selectedUrl);
      setGarments((items) => items.map((item) => (item.id === garment.id ? updated : item)));
      setThumbnailPicker(null);
    } catch (pickerError) {
      setThumbnailPicker((current) => current && current.garment.id === garment.id ? {
        ...current,
        saving: false,
        error: pickerError instanceof Error ? pickerError.message : "缩略图保存失败"
      } : current);
    }
  }

  async function cutoutGarment(id: number) {
    setBusyAction("cutout-garment");
    setVisionBusyId(id);
    setError("");
    try {
      const updated = await createGarmentCutout(id);
      setGarments((items) => items.map((item) => (item.id === id ? updated : item)));
    } catch (visionError) {
      setError(visionError instanceof Error ? visionError.message : "去背景失败");
    } finally {
      setVisionBusyId(null);
      setBusyAction(null);
    }
  }

  async function analyzeVisionTags(id: number) {
    setBusyAction("vision-tags");
    setVisionBusyId(id);
    setError("");
    try {
      const suggestion = await analyzeGarmentVisionTags(id);
      setGarments((items) => items.map((item) => (
        item.id === id ? { ...item, visionTags: suggestion, visionUpdatedAt: new Date().toISOString() } : item
      )));
    } catch (visionError) {
      setError(visionError instanceof Error ? visionError.message : "图片分析失败");
    } finally {
      setVisionBusyId(null);
      setBusyAction(null);
    }
  }

  async function downloadLocalVisionModel(id: VisionModelId) {
    setBusyAction("download-vision-model");
    setError("");
    try {
      await downloadVisionModel(id);
      await refreshVisionModels();
    } catch (visionError) {
      setError(visionError instanceof Error ? visionError.message : "模型下载启动失败");
    } finally {
      setBusyAction(null);
    }
  }

  async function verifyLocalVisionModel(id: VisionModelId) {
    setBusyAction("verify-vision-model");
    setError("");
    try {
      await verifyVisionModel(id);
      await refreshVisionModels();
    } catch (visionError) {
      setError(visionError instanceof Error ? visionError.message : "模型验证启动失败");
    } finally {
      setBusyAction(null);
    }
  }

  function updateVisionEnabled(enabled: boolean) {
    setVisionEnabled(enabled);
    writeLocalStorageValue("outfit.localVision.enabled", enabled ? "true" : "false");
  }

  function updateLatitude(value: string) {
    updateCoordinateForRecommendation(value, setLatitude, setWeather, setRecommendations);
  }

  function updateLongitude(value: string) {
    updateCoordinateForRecommendation(value, setLongitude, setWeather, setRecommendations);
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
        setWeather(null);
        setRecommendations(null);
        writeLocalStorageValue("outfit.latitude", lat);
        writeLocalStorageValue("outfit.longitude", lon);
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
      writeLocalStorageValue("outfit.latitude", latitude);
      writeLocalStorageValue("outfit.longitude", longitude);
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
      <aside className={canLogout ? "sidebar has-mobile-logout" : "sidebar"}>
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
        {props.user && props.onLogout ? (
          <button className="nav-button mobile-logout" type="button" aria-label="退出" title="退出" onClick={props.onLogout}>
            <LogOut size={18} />
            <span>退出</span>
          </button>
        ) : null}
        {props.user && props.onLogout ? <SessionSummary user={props.user} onLogout={props.onLogout} /> : null}
      </aside>

      <main className="workspace">
        {error ? <div className="banner error">{error}</div> : null}
        {tab === "recommend" && (
          <RecommendationView
            weather={weather}
            recommendations={recommendations}
            availableGarmentCount={activeGarments.length}
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
            onOpenThumbnailPicker={openThumbnailPicker}
            onCutoutGarment={cutoutGarment}
            onAnalyzeGarmentVision={analyzeVisionTags}
            visionEnabled={visionEnabled}
            visionBusyId={visionBusyId}
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
            captureEngine={captureEngine}
            captureResult={captureResult}
            busy={Boolean(busyAction)}
            busyAction={busyAction}
            onCopyBookmarklet={copyBookmarklet}
            onImportText={updateImportText}
            onImport={runImport}
            onCaptureUrl={setCaptureUrl}
            onCaptureEngine={setCaptureEngine}
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
            visionModels={visionModels}
            visionEnabled={visionEnabled}
            onLatitude={updateLatitude}
            onLongitude={updateLongitude}
            onLocate={locate}
            onSave={saveSettings}
            onProfile={setProfile}
            onVisionEnabled={updateVisionEnabled}
            onRefreshVisionModels={refreshVisionModels}
            onDownloadVisionModel={downloadLocalVisionModel}
            onVerifyVisionModel={verifyLocalVisionModel}
          />
        )}
      </main>
      {thumbnailPicker ? (
        <ThumbnailPicker
          garment={thumbnailPicker.garment}
          candidates={thumbnailPicker.candidates}
          selectedUrl={thumbnailPicker.selectedUrl}
          loading={thumbnailPicker.loading}
          saving={thumbnailPicker.saving}
          error={thumbnailPicker.error}
          onSelect={chooseThumbnailCandidate}
          onSave={saveThumbnailSelection}
          onClose={closeThumbnailPicker}
        />
      ) : null}
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
  captureEngine: CaptureEngine;
  captureResult: CaptureStartResult | CaptureJob | null;
  busy: boolean;
  busyAction?: BusyAction | null;
  onCopyBookmarklet: () => void;
  onImportText: (value: string) => void;
  onImport: () => void;
  onPreviewImport?: () => void;
  onCaptureUrl: (value: string) => void;
  onCaptureEngine: (value: CaptureEngine) => void;
  onStartOrdersCapture: () => void;
  onStartItemCapture: () => void;
  onReadLatestCapture: () => void;
}) {
  return (
    <section className="view">
      <PageHeader title="导入淘宝订单" description="本地 JSON 入口，不保存淘宝账号。">
        <ActionCluster>
          <a className="secondary link-button btn btn-soft" href={TAOBAO_BOUGHT_ITEMS_URL} target="_blank" rel="noreferrer">
            <ExternalLink size={18} />
            已买到的宝贝
          </a>
          <button className="icon-button btn btn-square btn-soft" title="复制书签脚本" onClick={props.onCopyBookmarklet}>
            <Copy size={18} />
          </button>
        </ActionCluster>
      </PageHeader>
      <div className="import-flow">
        <span className="import-step"><b>采集</b><small>书签脚本或浏览器采集</small></span>
        <span className="import-step"><b>检查</b><small>读取 JSON 并预览候选</small></span>
        <span className="import-step"><b>导入</b><small>确认后写入本地衣橱</small></span>
      </div>
      <WorkbenchPanel className="selenium-panel capture-step">
        <div className="panel-heading">
          <StatusPill tone="info">采集</StatusPill>
          <label>浏览器采集</label>
        </div>
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
          <fieldset className="capture-engine-picker">
            <legend>采集引擎</legend>
            <div className="segmented-control capture-engine-options">
              <label className={props.captureEngine === "selenium" ? "active" : ""}>
                <input
                  type="radio"
                  name="item-capture-engine"
                  value="selenium"
                  checked={props.captureEngine === "selenium"}
                  onChange={() => props.onCaptureEngine("selenium")}
                />
                Selenium
              </label>
              <label className={props.captureEngine === "playwright" ? "active" : ""}>
                <input
                  type="radio"
                  name="item-capture-engine"
                  value="playwright"
                  checked={props.captureEngine === "playwright"}
                  onChange={() => props.onCaptureEngine("playwright")}
                />
                Playwright
              </label>
            </div>
          </fieldset>
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
      </WorkbenchPanel>
      <div className="grid two">
        <WorkbenchPanel className="bookmarklet-step">
          <div className="panel-heading">
            <StatusPill tone="neutral">采集</StatusPill>
            <label>书签脚本</label>
          </div>
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
        </WorkbenchPanel>
        <details className="advanced-import" open>
          <summary><span>检查</span> 采集 JSON</summary>
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
        </details>
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
  onOpenThumbnailPicker?: (garment: Garment) => void;
  onCutoutGarment?: (id: number) => void;
  onAnalyzeGarmentVision?: (id: number) => void;
  visionEnabled?: boolean;
  visionBusyId?: number | null;
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
  const pendingCount = props.garments.filter((item) => !item.confirmed && !item.excluded).length;
  const activeCount = props.garments.filter((item) => item.owned && !item.excluded).length;

  function updateFilter<K extends keyof WardrobeFilters>(key: K, value: WardrobeFilters[K]) {
    props.onFilters?.({ ...filters, [key]: value });
  }

  return (
    <section className="view">
      <PageHeader title="衣服库" description={`${props.garments.length} 件，${pendingCount} 件待确认，当前显示 ${filteredGarments.length} 件。`}>
        <div className="header-stat-grid">
          <StatTile label="可穿" value={`${activeCount} 件`} />
          <StatTile label="待确认" value={`${pendingCount} 件`} />
          <StatTile label="已选择" value={`${props.selectedIds.length} 件`} />
        </div>
        <ActionCluster>
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
        </ActionCluster>
      </PageHeader>
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
      <div className="batch-strip">
        <span>{filteredGarments.length} 件当前结果，已选 {props.selectedIds.length} 件</span>
        <div className="actions">
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
      </div>
      {props.garments.length ? (
        filteredGarments.length ? (
          <div className="wardrobe-list">
            {filteredGarments.map((item) => (
          <article className={item.excluded ? "garment-row muted" : "garment-row"} key={item.id} title={garmentMeta(item).rawName || undefined}>
            <div className="garment-row-main">
              <input
                className="checkbox checkbox-sm"
                type="checkbox"
                checked={props.selectedIds.includes(item.id)}
                onChange={(event) =>
                  props.onSelect(event.target.checked ? [...props.selectedIds, item.id] : props.selectedIds.filter((id) => id !== item.id))
                }
              />
              <GarmentThumbnail item={item} />
              <div className="garment-title-line">
                {garmentMeta(item).brand ? <span className="brand-tag">{garmentMeta(item).brand}</span> : null}
                <input
                  className="input input-bordered input-sm"
                  value={item.name}
                  title={garmentMeta(item).rawName || item.name}
                  onChange={(event) => props.onUpdate(item.id, { name: event.target.value })}
                />
              </div>
            </div>
            <div className="garment-editor">
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
              {VisionSuggestion({ item, onApply: (update) => props.onUpdate(item.id, update) })}
            </div>
            <div className="garment-actions-row">
              {props.onOpenThumbnailPicker ? (
                <button className="status btn btn-sm" onClick={() => props.onOpenThumbnailPicker?.(item)}>
                  <ImageIcon size={16} />
                  选择缩略图
                </button>
              ) : null}
              {item.detailUrl || item.itemUrl ? (
                <a className="icon-button btn btn-square btn-soft" title="商品详情" href={item.detailUrl || item.itemUrl} target="_blank" rel="noreferrer">
                  <ExternalLink size={16} />
                </a>
              ) : null}
              {props.onCutoutGarment ? (
                <button className="status btn btn-sm" disabled={props.visionEnabled === false || props.visionBusyId === item.id} onClick={() => props.onCutoutGarment?.(item.id)}>
                  <Scissors size={16} />
                  {props.visionBusyId === item.id && props.busyAction === "cutout-garment" ? "处理中" : "去背景"}
                </button>
              ) : null}
              {props.onAnalyzeGarmentVision ? (
                <button className="status btn btn-sm" disabled={props.visionEnabled === false || props.visionBusyId === item.id} onClick={() => props.onAnalyzeGarmentVision?.(item.id)}>
                  <Tags size={16} />
                  {props.visionBusyId === item.id && props.busyAction === "vision-tags" ? "分析中" : "分析图片"}
                </button>
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
  availableGarmentCount?: number;
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
  const availableCount = props.availableGarmentCount ?? 0;
  const activeOccasion = OCCASION_LABELS[props.occasion as (typeof OCCASIONS)[number]] ?? props.occasion;
  return (
    <section className="view">
      <PageHeader title="今日推荐" description="默认工作台首页，按天气、场合和本地衣橱生成今日搭配。">
        <div className="header-stat-grid">
          <StatTile label="坐标" value={`${props.latitude}, ${props.longitude}`} />
          <StatTile label="可用衣物" value={`${availableCount} 件`} />
          <StatTile label="当前场合" value={<StatusPill tone="info">{activeOccasion}</StatusPill>} />
        </div>
      </PageHeader>
      <CommandBar className="recommendation-command">
        <div className="toolbar segmented-control" aria-label="场合">
          {OCCASIONS.map((value) => (
            <button className={props.occasion === value ? "chip btn btn-sm active" : "chip btn btn-sm"} key={value} onClick={() => props.onOccasion(value)}>
              {OCCASION_LABELS[value]}
            </button>
          ))}
        </div>
        <ActionCluster>
          <button className="secondary btn btn-soft" disabled={props.busyAction === "weather"} onClick={props.onFetchWeather}>
            <CloudSun size={18} />
            {props.busyAction === "weather" ? "获取中" : "天气"}
          </button>
          <button className="primary btn btn-primary" disabled={props.busyAction === "recommend"} onClick={props.onGenerate}>
            <Sparkles size={18} />
            {props.busyAction === "recommend" ? "生成中" : "生成"}
          </button>
        </ActionCluster>
      </CommandBar>
      {props.weather ? (
        <div className="weather-band context-band">
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
            <div className="outfit-card-head">
              <StatusPill tone="good">搭配 {outfit.items.length} 件</StatusPill>
              <div className="score">匹配度 {outfit.matchPercent ?? Math.round(Math.min(100, outfit.score))}%</div>
            </div>
            <div className="outfit-preview">
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
            </div>
            <ul className="outfit-reasons">
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
  visionModels?: VisionModelsResponse | null;
  visionEnabled?: boolean;
  onLatitude: (value: string) => void;
  onLongitude: (value: string) => void;
  onLocate: () => void;
  onSave: () => void;
  onProfile: (profile: PersonalProfile) => void;
  onVisionEnabled?: (enabled: boolean) => void;
  onRefreshVisionModels?: () => void;
  onDownloadVisionModel?: (id: VisionModelId) => void;
  onVerifyVisionModel?: (id: VisionModelId) => void;
}) {
  function updateProfile(update: Partial<PersonalProfile>) {
    props.onProfile({ ...props.profile, ...update });
  }

  return (
    <section className="view compact">
      <PageHeader title="设置" description="SQLite: data/outfit.sqlite">
        <StatusPill tone="neutral">本地工作台</StatusPill>
      </PageHeader>
      <WorkbenchPanel className="settings-panel">
        <div className="settings-grid">
          <SettingsSection>
        <div className="section-title-row">
          <h2>位置</h2>
          <StatusPill tone="info">{props.latitude}, {props.longitude}</StatusPill>
        </div>
        <label>纬度</label>
        <input className="input input-bordered" value={props.latitude} onChange={(event) => props.onLatitude(event.target.value)} />
        <label>经度</label>
        <input className="input input-bordered" value={props.longitude} onChange={(event) => props.onLongitude(event.target.value)} />
          </SettingsSection>
          <SettingsSection>
        <div className="section-title-row">
          <h2>个人画像</h2>
          <StatusPill tone="neutral">{props.profile.preferredStyles?.[0] ?? "未设置风格"}</StatusPill>
        </div>
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
          </SettingsSection>
          <SettingsSection>
        <div className="section-title-row">
          <h2>本地视觉模型</h2>
          <StatusPill tone={props.visionEnabled === false ? "warn" : "good"}>{props.visionEnabled === false ? "已关闭" : "已启用"}</StatusPill>
        </div>
        <p className="settings-note">模型只保存在本机，不会上传图片。下载需要你手动点击。</p>
        <label className="vision-toggle">
          <input type="checkbox" checked={props.visionEnabled ?? true} onChange={(event) => props.onVisionEnabled?.(event.target.checked)} />
          <span>启用本地视觉</span>
        </label>
        {props.visionModels ? (
          <div className="vision-models vision-model-table">
            <span className="model-root text-wrap-anywhere">{props.visionModels.modelRoot}</span>
            {props.visionModels.models.map((model) => {
              const display = visionModelDisplay(model);
              const running = model.job?.status === "running";
              const downloading = running && model.job?.action === "download";
              const verifying = running && model.job?.action === "verify";
              const pillTone = display.tone === "ready" ? "good" : display.tone === "failed" ? "danger" : display.tone === "running" ? "info" : "neutral";
              return (
                <div className="vision-model-row" key={model.id}>
                  <Cpu size={18} />
                  <div>
                    <strong>{model.label}</strong>
                    <StatusPill className={`vision-state ${display.tone}`} tone={pillTone}>{display.label}</StatusPill>
                    <span>{display.message}</span>
                    {model.job?.status === "failed" && model.job.error ? <small className="vision-error text-wrap-anywhere">{model.job.error}</small> : null}
                    <small className="text-wrap-anywhere">{model.path}</small>
                  </div>
                  <div className="vision-model-actions">
                    {props.onDownloadVisionModel ? (
                      <button className="secondary btn btn-sm" disabled={model.installed || running || props.busyAction === "download-vision-model"} onClick={() => props.onDownloadVisionModel?.(model.id)}>
                        <Download size={16} />
                        {downloading ? "下载中" : "下载"}
                      </button>
                    ) : null}
                    {props.onVerifyVisionModel ? (
                      <button className="secondary btn btn-sm" disabled={!model.installed || running || props.busyAction === "verify-vision-model"} onClick={() => props.onVerifyVisionModel?.(model.id)}>
                        <Play size={16} />
                        {verifying ? "验证中" : "验证"}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">本地视觉模型状态暂不可用。</div>
        )}
          </SettingsSection>
        </div>
        <ActionCluster className="settings-actions">
          {props.onRefreshVisionModels ? (
            <button className="secondary btn btn-soft" onClick={props.onRefreshVisionModels}>
              <RefreshCw size={18} />
              刷新模型
            </button>
          ) : null}
          <button className="secondary btn btn-soft" disabled={props.busyAction === "locate"} onClick={props.onLocate}>
            <MapPin size={18} />
            {props.busyAction === "locate" ? "定位中" : "定位"}
          </button>
          <button className="primary btn btn-primary" disabled={props.busyAction === "save-settings"} onClick={props.onSave}>
            <Save size={18} />
            {props.busyAction === "save-settings" ? "保存中" : "保存"}
          </button>
        </ActionCluster>
      </WorkbenchPanel>
    </section>
  );
}

function visionModelDisplay(model: VisionModelStatus): { label: string; message: string; tone: "idle" | "running" | "ready" | "failed" } {
  if (model.job?.status === "running") {
    return {
      label: model.job.action === "verify" ? "验证中" : "下载中",
      message: model.job.message,
      tone: "running"
    };
  }
  if (model.job?.status === "failed") {
    return {
      label: "失败",
      message: model.job.message,
      tone: "failed"
    };
  }
  if (model.installed) {
    return {
      label: "已可用",
      message: model.job?.status === "succeeded" ? model.job.message : model.message,
      tone: "ready"
    };
  }
  return {
    label: "未下载",
    message: model.message,
    tone: "idle"
  };
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
      <PageHeader title="历史洞察" description={insights ? `${insights.totalGarments} 件衣物，${props.wearLogs.length} 条穿着记录。` : "本地穿着记录和推荐历史。"}>
        <ActionCluster>
          <button className="secondary btn btn-soft" disabled={props.busyAction === "history"} onClick={props.onRefresh}>
            <RefreshCw size={18} />
            {props.busyAction === "history" ? "刷新中" : "刷新"}
          </button>
          <button className="primary btn btn-primary" disabled={props.busyAction === "export"} onClick={props.onExport}>
            <Download size={18} />
            {props.busyAction === "export" ? "导出中" : "导出备份"}
          </button>
        </ActionCluster>
      </PageHeader>
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
  const thumbnailUrl = displayThumbnailUrl(item.cutoutImageUrl || item.imageUrl);

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

export function ThumbnailPicker(props: {
  garment: Garment;
  candidates: ThumbnailCandidate[];
  selectedUrl: string;
  loading: boolean;
  saving: boolean;
  error: string;
  onSelect: (imageUrl: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <div className="thumbnail-picker-backdrop" role="presentation">
      <section className="thumbnail-picker" role="dialog" aria-modal="true" aria-labelledby="thumbnail-picker-title">
        <header className="thumbnail-picker-header">
          <div>
            <h2 id="thumbnail-picker-title">选择缩略图</h2>
            <p>{props.garment.name}</p>
          </div>
          <button className="icon-button btn btn-square btn-soft" type="button" title="关闭" onClick={props.onClose}>
            <X size={18} />
          </button>
        </header>
        {props.loading ? (
          <div className="thumbnail-picker-state">候选图加载中</div>
        ) : props.candidates.length ? (
          <div className="thumbnail-candidate-grid">
            {props.candidates.map((candidate) => {
              const selected = candidate.url === props.selectedUrl;
              return (
                <button
                  className={selected ? "thumbnail-candidate selected" : "thumbnail-candidate"}
                  key={`${candidate.source}-${candidate.url}`}
                  type="button"
                  title={`选择候选图：${thumbnailSourceLabel(candidate.source)}`}
                  aria-pressed={selected}
                  onClick={() => props.onSelect(candidate.url)}
                >
                  <ThumbnailCandidatePreview candidate={candidate} />
                  <span className="thumbnail-candidate-meta">
                    <b>{thumbnailSourceLabel(candidate.source)}</b>
                    <small>评分 {candidate.score}</small>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="thumbnail-picker-state">没有可选择的商品图</div>
        )}
        {props.error ? <p className="inline-feedback error">{props.error}</p> : null}
        <footer className="thumbnail-picker-actions">
          <button className="secondary btn btn-soft" type="button" onClick={props.onClose}>
            <X size={16} />
            关闭
          </button>
          <button className="primary btn btn-primary" type="button" disabled={props.loading || props.saving || !props.selectedUrl} onClick={props.onSave}>
            <Save size={16} />
            {props.saving ? "保存中" : "保存为主图"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function ThumbnailCandidatePreview({ candidate }: { candidate: ThumbnailCandidate }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="thumbnail-candidate-frame">
      {failed ? (
        <Shirt size={24} />
      ) : (
        <img
          src={candidate.url}
          alt={thumbnailSourceLabel(candidate.source)}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

function thumbnailSourceLabel(source: ThumbnailCandidate["source"]): string {
  if (source === "current") return "当前图";
  if (source === "order") return "订单图";
  if (source === "detail") return "详情图";
  return "采集图";
}

function VisionSuggestion({ item, onApply }: { item: Garment; onApply: (update: Partial<Garment>) => void }) {
  const suggestion = item.visionTags;
  if (!suggestion) return null;
  const chips = [
    suggestion.category ? CATEGORY_LABELS[suggestion.category] : "",
    ...suggestion.styles,
    ...suggestion.patterns,
    ...suggestion.tags
  ].filter(Boolean);
  const update: Partial<Garment> = {
    ...(suggestion.category ? { category: suggestion.category } : {}),
    styles: suggestion.styles,
    patterns: suggestion.patterns,
    tags: suggestion.tags
  };
  const applied = isVisionSuggestionApplied(item, suggestion);
  return (
    <div className="vision-suggestion">
      <span>视觉建议</span>
      <div className="vision-chip-row">
        {chips.length ? chips.map((chip) => <b key={chip}>{chip}</b>) : <b>暂无标签</b>}
      </div>
      {suggestion.scores.length ? (
        <small>{suggestion.scores.slice(0, 3).map((score) => `${score.label} ${Math.round(score.score * 100)}%`).join(" / ")}</small>
      ) : null}
      <button
        className={applied ? "secondary btn btn-sm good" : "secondary btn btn-sm"}
        disabled={applied}
        onClick={() => onApply(update)}
        type="button"
      >
        <Check size={16} />
        {applied ? "已应用" : "应用建议"}
      </button>
    </div>
  );
}

function isVisionSuggestionApplied(item: Garment, suggestion: VisionTagSuggestion): boolean {
  return (
    (!suggestion.category || item.category === suggestion.category) &&
    stringSetEquals(item.styles, suggestion.styles) &&
    stringSetEquals(item.patterns ?? [], suggestion.patterns) &&
    stringSetEquals(item.tags ?? [], suggestion.tags)
  );
}

function stringSetEquals(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const normalized = new Set(left);
  if (normalized.size !== right.length) return false;
  return right.every((value) => normalized.has(value));
}

function displayThumbnailUrl(value: string): string {
  const cleaned = value.trim();
  if (cleaned.startsWith("/api/garment-thumbnails/")) return cleaned;
  if (isTrustedTaobaoImageUrl(cleaned)) return cleaned;
  return "";
}

function isTrustedTaobaoImageUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const hostname = parsed.hostname.toLowerCase();
  if (!hostname.endsWith(".alicdn.com") && !hostname.endsWith(".taobaocdn.com")) return false;
  let pathname = parsed.pathname.toLowerCase();
  try {
    pathname = decodeURIComponent(parsed.pathname).toLowerCase();
  } catch {
    return false;
  }
  if (!/\.(?:jpe?g|png|webp)(?:$|[._-])/.test(pathname)) return false;
  if (/logo|sprite|icon|avatar|placeholder|transparent|loading|wangwang|shop[_-]?card|store[_-]?card/.test(pathname)) return false;
  return true;
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
  return <StatTile className="metric stat" label={label} value={value} />;
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

export async function refreshGarmentsForView(
  loadGarments: () => Promise<Garment[]>,
  onGarments: (garments: Garment[]) => void,
  onError: (message: string) => void
): Promise<void> {
  onError("");
  try {
    onGarments(await loadGarments());
  } catch (garmentError) {
    onError(garmentError instanceof Error ? garmentError.message : "衣橱读取失败");
  }
}

export async function copyTextToClipboard(
  writeText: (text: string) => Promise<unknown>,
  text: string,
  onError: (message: string) => void
): Promise<void> {
  onError("");
  try {
    await writeText(text);
  } catch (copyError) {
    onError(copyError instanceof Error ? copyError.message : "复制失败");
  }
}

export async function deleteGarmentForView(
  removeGarment: (id: number) => Promise<void>,
  id: number,
  onGarments: (updater: (items: Garment[]) => Garment[]) => void,
  onSelectedIds: (updater: (ids: number[]) => number[]) => void,
  onError: (message: string) => void
): Promise<void> {
  onError("");
  try {
    await removeGarment(id);
    onGarments((items) => items.filter((item) => item.id !== id));
    onSelectedIds((ids) => ids.filter((selectedId) => selectedId !== id));
  } catch (deleteError) {
    onError(deleteError instanceof Error ? deleteError.message : "衣物删除失败");
  }
}

export function updateCoordinateForRecommendation(
  value: string,
  onCoordinate: (value: string) => void,
  onWeather: (weather: WeatherSnapshot | null) => void,
  onRecommendations: (recommendations: RecommendationResult | null) => void
): void {
  onCoordinate(value);
  onWeather(null);
  onRecommendations(null);
}

export function readLocalStorageValue(key: string, fallback: string): string {
  try {
    return globalThis.localStorage?.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeLocalStorageValue(key: string, value: string): boolean {
  try {
    globalThis.localStorage?.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function applyGarmentPatch(garments: Garment[], id: number, update: Partial<Garment>): Garment[] {
  return garments.map((item) => (item.id === id ? { ...item, ...update } : item));
}

function numberOrUndefined(value: string): number | undefined {
  if (!value.trim()) return undefined;
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
