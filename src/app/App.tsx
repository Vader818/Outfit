import {
  BarChart3,
  Database,
  LogOut,
  Settings,
  Upload,
  WandSparkles,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AUTH_REQUIRED_EVENT,
  analyzeGarmentVisionTags,
  archiveGarment,
  commitTaobaoImport,
  createGarment,
  createGarmentCutout,
  downloadCompleteBackup,
  downloadVisionModel,
  exportLocalData,
  getAuthStatus,
  getCaptureJobArtifact,
  getGarmentThumbnailCandidates,
  getGarments,
  getInsights,
  getPersonalProfile,
  getRecommendationRuns,
  getRecommendations,
  getVisionModels,
  getWearLogs,
  getWeather,
  login,
  logout,
  previewTaobaoImport,
  previewCompleteBackup,
  readLatestTaobaoCapture,
  recordWearLog,
  refreshGarmentThumbnails,
  register as registerAccount,
  restoreGarment,
  savePersonalProfile,
  selectGarmentThumbnail,
  startCaptureJob,
  updateGarment,
  uploadGarmentImage,
  verifyVisionModel,
  type CaptureStartResult,
  type ImportSummary
} from "../api";
import { getTaobaoBookmarklet } from "../bookmarklet/taobaoBookmarklet";
import { AppMark, IconButton, Notice, Skeleton, cx } from "../components/ui";
import { AuthView, SessionSummary } from "../features/auth/AuthView";
import { HistoryInsightsView } from "../features/insights/HistoryInsightsView";
import { ImportView } from "../features/import/ImportView";
import { RecommendationView } from "../features/recommendations/RecommendationView";
import { SettingsView } from "../features/settings/SettingsView";
import { ThumbnailPicker } from "../features/wardrobe/ThumbnailDialog";
import { ManualGarmentDialog } from "../features/wardrobe/ManualGarmentDialog";
import { WardrobeView } from "../features/wardrobe/WardrobeView";
import { REMOTE_TAOBAO_IMAGES_SESSION_KEY, buildRecommendationWearLogInput, downloadBlob, downloadJson, exportBackupWithConfirmation, exportCompleteBackupWithConfirmation, readLocalStorageValue, readSessionStorageValue, updateCoordinateForRecommendation, writeLocalStorageValue, writeSessionStorageValue } from "../lib/browser";
import { prepareGarmentImageForUpload } from "../lib/imageSanitization";
import { applyGarmentPatch, isRecommendationEligibleGarment, isRecommendationPendingGarment, isWardrobeReviewPendingGarment } from "../lib/garments";
import {
  DEFAULT_LATITUDE,
  DEFAULT_LONGITUDE,
  DEFAULT_PROFILE,
  DEFAULT_WARDROBE_FILTERS,
  parseLocationCoordinates,
  type AppTab,
  type AuthInput,
  type BusyAction,
  type WearLogFeedback,
  type WardrobeFilters
} from "../shared/presentation";
import type {
  AuthStatus,
  AuthUser,
  CaptureEngine,
  CaptureJob,
  Garment,
  ImportDecision,
  ManualGarmentCreate,
  OutfitRecommendation,
  PersonalProfile,
  RecommendationResult,
  RecommendationRunEntry,
  Season,
  TaobaoImportPreview,
  TaobaoImportCommitResult,
  TaobaoWardrobeFilterSummary,
  ThumbnailCandidate,
  VisionModelId,
  VisionModelsResponse,
  WardrobeInsights,
  WearLogEntry,
  WeatherSnapshot
} from "../shared/types";

type ThumbnailPickerState = {
  garment: Garment;
  candidates: ThumbnailCandidate[];
  selectedUrl: string;
  loading: boolean;
  saving: boolean;
  error: string;
} | null;

const NAV_ITEMS: Array<{ id: AppTab; label: string; icon: ReactNode }> = [
  { id: "recommend", label: "今日推荐", icon: <WandSparkles aria-hidden="true" /> },
  { id: "wardrobe", label: "衣服库", icon: <Database aria-hidden="true" /> },
  { id: "history", label: "历史洞察", icon: <BarChart3 aria-hidden="true" /> },
  { id: "import", label: "导入", icon: <Upload aria-hidden="true" /> },
  { id: "settings", label: "设置", icon: <Settings aria-hidden="true" /> }
];

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

  useEffect(() => {
    function requireAuthentication() {
      setAuthStatus((current) => ({ hasAccount: current?.hasAccount ?? true, user: null }));
      setAuthError("登录状态已过期，请重新登录");
    }
    window.addEventListener(AUTH_REQUIRED_EVENT, requireAuthentication);
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, requireAuthentication);
  }, []);

  async function submitAuth(input: AuthInput) {
    if (!authStatus) return;
    setAuthBusy(true);
    setAuthError("");
    try {
      setAuthStatus(authStatus.hasAccount ? await login(input) : await registerAccount(input));
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "认证失败");
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
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "退出失败");
    } finally {
      setAuthBusy(false);
    }
  }

  if (!authStatus) return <AppLoadingScreen />;
  if (!authStatus.user) {
    return <AuthView hasAccount={authStatus.hasAccount} busy={authBusy} error={authError} onSubmit={submitAuth} />;
  }
  return <MainApp user={authStatus.user} onLogout={signOut} />;
}

function AppLoadingScreen() {
  return (
    <main className="auth-layout" aria-busy="true">
      <section className="auth-panel auth-panel--loading">
        <AppMark />
        <div className="auth-loading-copy">
          <strong>正在打开你的衣橱</strong>
          <span>衣物、购买记录和偏好都保存在本机。</span>
        </div>
        <Skeleton className="auth-loading-line" />
      </section>
    </main>
  );
}

export function MainApp(props: { user?: AuthUser | null; onLogout?: () => void } = {}) {
  const [tab, setTab] = useState<AppTab>("recommend");
  const [bootstrapping, setBootstrapping] = useState(() => typeof window !== "undefined");
  const [garments, setGarments] = useState<Garment[]>([]);
  const [archivedGarments, setArchivedGarments] = useState<Garment[]>([]);
  const garmentUpdateVersions = useRef(new Map<number, number>());
  const garmentUpdateQueues = useRef(new Map<number, Promise<Garment>>());
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [wardrobeFilters, setWardrobeFilters] = useState<WardrobeFilters>(DEFAULT_WARDROBE_FILTERS);
  const [importText, setImportText] = useState("");
  const [importResult, setImportResult] = useState<ImportSummary | TaobaoImportCommitResult | null>(null);
  const [importPreview, setImportPreview] = useState<TaobaoImportPreview | null>(null);
  const [importDecisions, setImportDecisions] = useState<Record<string, ImportDecision>>({});
  const [captureFilterSummary, setCaptureFilterSummary] = useState<TaobaoWardrobeFilterSummary | null>(null);
  const [captureUrl, setCaptureUrl] = useState("");
  const [captureEngine, setCaptureEngine] = useState<CaptureEngine>("selenium");
  const [captureResult, setCaptureResult] = useState<CaptureStartResult | CaptureJob | null>(null);
  const [captureJob, setCaptureJob] = useState<CaptureJob | null>(null);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationResult | null>(null);
  const [profile, setProfile] = useState<PersonalProfile>(DEFAULT_PROFILE);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [wearLogs, setWearLogs] = useState<WearLogEntry[]>([]);
  const [recommendationRuns, setRecommendationRuns] = useState<RecommendationRunEntry[]>([]);
  const [insights, setInsights] = useState<WardrobeInsights | null>(null);
  const [visionModels, setVisionModels] = useState<VisionModelsResponse | null>(null);
  const [visionEnabled, setVisionEnabled] = useState(() => readLocalStorageValue("outfit.localVision.enabled", "true") !== "false");
  const [remoteTaobaoImagesEnabled, setRemoteTaobaoImagesEnabled] = useState(() =>
    readSessionStorageValue(REMOTE_TAOBAO_IMAGES_SESSION_KEY, "false") === "true"
  );
  const [recordingOutfitId, setRecordingOutfitId] = useState<string | null>(null);
  const [visionBusyId, setVisionBusyId] = useState<number | null>(null);
  const [wearLogFeedback, setWearLogFeedback] = useState<WearLogFeedback | null>(null);
  const [thumbnailRefreshMessage, setThumbnailRefreshMessage] = useState("");
  const [thumbnailPicker, setThumbnailPicker] = useState<ThumbnailPickerState>(null);
  const [manualGarmentOpen, setManualGarmentOpen] = useState(false);
  const [manualGarmentBusy, setManualGarmentBusy] = useState(false);
  const [manualGarmentError, setManualGarmentError] = useState("");
  const [manualSavedGarment, setManualSavedGarment] = useState<Garment | null>(null);
  const thumbnailPickerRequestId = useRef(0);
  const [occasion, setOccasion] = useState("casual");
  const [latitude, setLatitude] = useState(() => readLocalStorageValue("outfit.latitude", DEFAULT_LATITUDE));
  const [longitude, setLongitude] = useState(() => readLocalStorageValue("outfit.longitude", DEFAULT_LONGITUDE));
  const [busyAction, setBusyAction] = useState<BusyAction | null>(null);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const bookmarklet = useMemo(() => getTaobaoBookmarklet(), []);
  const reviewPendingCount = garments.filter(isWardrobeReviewPendingGarment).length;
  const recommendationPendingCount = garments.filter(isRecommendationPendingGarment).length;
  const recommendationGarments = garments.filter(isRecommendationEligibleGarment);
  const canLogout = Boolean(props.user && props.onLogout);

  function navigateTo(nextTab: AppTab) {
    setTab(nextTab);
    if (typeof document !== "undefined") {
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      window.requestAnimationFrame(() => {
        document.getElementById("main-content")?.focus({ preventScroll: true });
      });
    }
  }

  useEffect(() => {
    let active = true;
    const timeout = window.setTimeout(() => {
      if (!active) return;
      setBootstrapping(false);
      setStatusMessage("部分数据仍在加载，可以先使用其他功能");
    }, 10_000);
    Promise.allSettled([refreshGarments(), refreshProfile(), refreshHistoryData(), refreshVisionModels()])
      .finally(() => {
        window.clearTimeout(timeout);
        if (active) setBootstrapping(false);
      });
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    document.title = `${NAV_ITEMS.find((item) => item.id === tab)?.label ?? "Outfit"} · Outfit`;
  }, [tab]);

  useEffect(() => {
    if (!statusMessage) return;
    const timeout = window.setTimeout(() => setStatusMessage(""), 4500);
    return () => window.clearTimeout(timeout);
  }, [statusMessage]);

  async function refreshGarments() {
    setError("");
    try {
      const [active, archived] = await Promise.all([
        getGarments(),
        getGarments({ archived: true })
      ]);
      setGarments(active);
      setArchivedGarments(archived);
    } catch (garmentError) {
      setError(garmentError instanceof Error ? garmentError.message : "衣橱读取失败");
    }
  }

  async function refreshProfile() {
    try {
      setProfile(await getPersonalProfile());
      setProfileLoaded(true);
    } catch (profileError) {
      setProfileLoaded(false);
      setError(profileError instanceof Error ? profileError.message : "个人画像读取失败");
    }
  }

  async function refreshHistoryData() {
    setError("");
    try {
      const [nextWearLogs, nextRuns, nextInsights] = await Promise.all([getWearLogs(), getRecommendationRuns(), getInsights()]);
      setWearLogs(nextWearLogs);
      setRecommendationRuns(nextRuns);
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
    if (!importPreview) {
      setError("请先预览并逐项确认导入内容");
      return;
    }
    setBusyAction("import");
    setError("");
    try {
      const result = await commitTaobaoImport({
        batch: JSON.parse(importText),
        decisions: importPreview.candidates.map((candidate) => importDecisions[candidate.sourceItemKey] ?? {
          sourceItemKey: candidate.sourceItemKey,
          include: false
        })
      });
      setImportResult(result);
      setImportPreview(null);
      setImportDecisions({});
      setImportText("");
      setCaptureFilterSummary(null);
      await refreshGarments();
      await refreshHistoryData();
      setStatusMessage(`新增 ${result.summary.created} 件，更新 ${result.summary.updated} 件，退款同步 ${result.summary.refundSynced} 件`);
      navigateTo("wardrobe");
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
    setError("");
    try {
      await writeText(bookmarklet);
      setStatusMessage("书签脚本已复制");
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : "复制失败");
    }
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
        ? await getCaptureJobArtifact(captureJob.id)
        : await readLatestTaobaoCapture();
      setImportResult(null);
      setImportPreview(null);
      setImportDecisions({});
      setCaptureFilterSummary(latest.filterSummary ?? null);
      setImportText(latest.jsonText || JSON.stringify(latest.payload, null, 2));
      setStatusMessage("采集产物已读取，可以先预览再导入");
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
    setImportDecisions({});
  }

  async function previewImport() {
    setBusyAction("preview-import");
    setError("");
    try {
      const preview = await previewTaobaoImport(JSON.parse(importText));
      setImportPreview(preview);
      setImportDecisions(Object.fromEntries(preview.candidates.map((candidate) => [
        candidate.sourceItemKey,
        {
          sourceItemKey: candidate.sourceItemKey,
          include: candidate.disposition === "create" || candidate.disposition === "update" || candidate.disposition === "refund-sync"
        }
      ])));
      setImportResult(null);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "预览失败");
    } finally {
      setBusyAction(null);
    }
  }

  function updateImportDecision(sourceItemKey: string, decision: ImportDecision) {
    setImportDecisions((current) => ({ ...current, [sourceItemKey]: decision }));
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
      const queued = (garmentUpdateQueues.current.get(id) ?? Promise.resolve())
        .catch(() => undefined)
        .then(() => updateGarment(id, update));
      garmentUpdateQueues.current.set(id, queued);
      const updated = await queued;
      if (garmentUpdateVersions.current.get(id) === version) {
        setGarments((items) => applyGarmentPatch(items, id, updated));
      }
    } catch (updateError) {
      if (garmentUpdateVersions.current.get(id) !== version) return;
      if (previous) setGarments((items) => applyGarmentPatch(items, id, previous as Garment));
      setError(updateError instanceof Error ? updateError.message : "衣物保存失败");
    } finally {
      if (garmentUpdateQueues.current.get(id) && garmentUpdateVersions.current.get(id) === version) {
        garmentUpdateQueues.current.delete(id);
      }
    }
  }

  async function archiveOne(id: number) {
    setError("");
    try {
      const archived = await archiveGarment(id);
      setGarments((items) => items.filter((item) => item.id !== id));
      setArchivedGarments((items) => [archived, ...items.filter((item) => item.id !== id)]);
      setSelectedIds((ids) => ids.filter((selectedId) => selectedId !== id));
      setStatusMessage("衣物已归档，可在衣服库底部恢复");
      await refreshHistoryData();
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "衣物归档失败");
    }
  }

  async function restoreOne(id: number) {
    setError("");
    try {
      const restored = await restoreGarment(id);
      setArchivedGarments((items) => items.filter((item) => item.id !== id));
      setGarments((items) => [restored, ...items.filter((item) => item.id !== id)]);
      setStatusMessage("衣物已恢复到衣橱");
      await refreshHistoryData();
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "衣物恢复失败");
    }
  }

  async function bulkConfirm() {
    setBusyAction("bulk-confirm");
    setError("");
    try {
      await Promise.all(selectedIds.map((id) => updateGarment(id, { confirmed: true })));
      setSelectedIds([]);
      await refreshGarments();
      setStatusMessage("所选衣物已确认");
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : "批量确认失败");
    } finally {
      setBusyAction(null);
    }
  }

  async function bulkUpdate(
    label: string,
    buildUpdate: (garment: Garment) => Partial<Garment>
  ) {
    setBusyAction("bulk-update");
    setError("");
    try {
      const selected = garments.filter((garment) => selectedIds.includes(garment.id));
      await Promise.all(selected.map((garment) => updateGarment(garment.id, buildUpdate(garment))));
      setSelectedIds([]);
      await refreshGarments();
      setStatusMessage(label);
    } catch (bulkError) {
      await refreshGarments();
      setError(bulkError instanceof Error ? bulkError.message : "批量更新失败");
    } finally {
      setBusyAction(null);
    }
  }

  function bulkSeasons(seasons: Season[]) {
    void bulkUpdate("所选衣物季节已更新", () => ({ seasons }));
  }

  function bulkTags(tags: string[]) {
    void bulkUpdate("标签已添加到所选衣物", (garment) => ({
      tags: Array.from(new Set([...(garment.tags ?? []), ...tags]))
    }));
  }

  function bulkExcluded(excluded: boolean) {
    void bulkUpdate(excluded ? "所选衣物已排除推荐" : "所选衣物已恢复推荐", () => ({ excluded }));
  }

  function openManualGarmentDialog() {
    setManualGarmentError("");
    setManualSavedGarment(null);
    setManualGarmentOpen(true);
  }

  function closeManualGarmentDialog() {
    if (manualGarmentBusy) return;
    setManualGarmentOpen(false);
    setManualGarmentError("");
    setManualSavedGarment(null);
  }

  async function submitManualGarment(input: ManualGarmentCreate, imageFile?: File) {
    setManualGarmentBusy(true);
    setManualGarmentError("");
    let saved = manualSavedGarment;
    try {
      if (!saved) {
        saved = await createGarment(input);
        setManualSavedGarment(saved);
        setGarments((items) => [saved as Garment, ...items.filter((item) => item.id !== saved?.id)]);
      }
      if (imageFile) {
        const prepared = await prepareGarmentImageForUpload(imageFile);
        saved = await uploadGarmentImage(saved.id, prepared);
        setGarments((items) => items.map((item) => item.id === saved?.id ? saved as Garment : item));
      }
      setManualGarmentOpen(false);
      setManualSavedGarment(null);
      setStatusMessage(imageFile ? "衣物与本地照片已保存" : "衣物已保存，可立即用于推荐");
      await refreshGarments();
      await refreshHistoryData();
    } catch (manualError) {
      const message = manualError instanceof Error ? manualError.message : "手工建档失败";
      if (saved) {
        setManualSavedGarment(saved);
        setManualGarmentError(`衣物已保存，但照片处理失败：${message}`);
        await refreshGarments();
      } else {
        setManualGarmentError(message);
      }
    } finally {
      setManualGarmentBusy(false);
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
    setThumbnailPicker({ garment, candidates: [], selectedUrl: "", loading: true, saving: false, error: "" });
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
    if (!thumbnailPicker?.selectedUrl) return;
    const { garment, selectedUrl } = thumbnailPicker;
    setThumbnailPicker((current) => current ? { ...current, saving: true, error: "" } : current);
    try {
      const updated = await selectGarmentThumbnail(garment.id, selectedUrl);
      setGarments((items) => items.map((item) => item.id === garment.id ? updated : item));
      setThumbnailPicker(null);
      setStatusMessage("主图已更新");
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
      setGarments((items) => items.map((item) => item.id === id ? updated : item));
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
      setGarments((items) => items.map((item) => item.id === id ? { ...item, visionTags: suggestion, visionUpdatedAt: new Date().toISOString() } : item));
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

  function updateRemoteTaobaoImagesEnabled(enabled: boolean) {
    setRemoteTaobaoImagesEnabled(enabled);
    writeSessionStorageValue(REMOTE_TAOBAO_IMAGES_SESSION_KEY, enabled ? "true" : "false");
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
        setStatusMessage("位置已更新");
        setBusyAction(null);
      },
      () => {
        setError("无法获取当前位置，请检查浏览器权限或手动输入坐标");
        setBusyAction(null);
      }
    );
  }

  async function fetchForecast() {
    const coordinates = parseLocationCoordinates(latitude, longitude);
    if (!coordinates) {
      setError("请先在设置中确认有效位置");
      navigateTo("settings");
      return;
    }
    setBusyAction("weather");
    setError("");
    try {
      setWeather(await getWeather(coordinates.latitude, coordinates.longitude));
      setRecommendations(null);
      setWearLogFeedback(null);
    } catch (weatherError) {
      setError(weatherError instanceof Error ? weatherError.message : "天气获取失败");
    } finally {
      setBusyAction(null);
    }
  }

  function updateOccasion(value: string) {
    setOccasion(value);
    setRecommendations(null);
    setWearLogFeedback(null);
  }

  async function generateRecommendations() {
    const coordinates = parseLocationCoordinates(latitude, longitude);
    if (!coordinates) {
      setError("请先在设置中确认有效位置");
      navigateTo("settings");
      return;
    }
    setBusyAction("recommend");
    setError("");
    try {
      const snapshot = weather ?? await getWeather(coordinates.latitude, coordinates.longitude);
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
      await recordWearLog(buildRecommendationWearLogInput(
        outfit,
        recommendations?.occasion ?? occasion,
        recommendations?.weather ?? weather
      ));
      setWearLogFeedback({ outfitId: outfit.id, message: "已标记已穿" });
      await refreshHistoryData();
    } catch (wearLogError) {
      setError(wearLogError instanceof Error ? wearLogError.message : "标记已穿失败");
    } finally {
      setRecordingOutfitId(null);
    }
  }

  async function saveSettings() {
    if (!profileLoaded) {
      setError("个人画像尚未成功读取，请刷新后再保存");
      return;
    }
    if ((latitude.trim() || longitude.trim()) && !parseLocationCoordinates(latitude, longitude)) {
      setError("位置需要同时填写有效的纬度和经度");
      return;
    }
    setBusyAction("save-settings");
    setError("");
    try {
      const latitudeSaved = writeLocalStorageValue("outfit.latitude", latitude);
      const longitudeSaved = writeLocalStorageValue("outfit.longitude", longitude);
      setProfile(await savePersonalProfile(profile));
      setProfileLoaded(true);
      setStatusMessage(latitudeSaved && longitudeSaved
        ? "设置已保存在本机"
        : "个人画像已保存，但浏览器未允许保存位置");
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
      const exported = await exportBackupWithConfirmation(
        (message) => globalThis.confirm(message),
        exportLocalData,
        downloadJson
      );
      if (exported) setStatusMessage("备份已生成");
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "导出失败");
    } finally {
      setBusyAction(null);
    }
  }

  async function exportCompleteBackup() {
    setBusyAction("export-complete");
    setError("");
    try {
      const exported = await exportCompleteBackupWithConfirmation(
        (message) => globalThis.confirm(message),
        previewCompleteBackup,
        downloadCompleteBackup,
        downloadBlob
      );
      if (exported) setStatusMessage("含本地图片的完整备份已生成");
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "完整备份导出失败");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="app-layout">
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <aside className="app-sidebar">
        <AppMark />
        <nav className="app-nav" aria-label="主导航">
          {NAV_ITEMS.map((item) => (
            <NavButton
              key={item.id}
              active={tab === item.id}
              icon={item.icon}
              label={item.id === "wardrobe" && reviewPendingCount ? `${item.label} (${reviewPendingCount})` : item.label}
              onClick={() => navigateTo(item.id)}
            />
          ))}
        </nav>
        {props.user && props.onLogout ? <SessionSummary user={props.user} onLogout={props.onLogout} /> : null}
      </aside>

      <header className="mobile-header">
        <AppMark />
        {canLogout ? <IconButton label="退出" onClick={props.onLogout}><LogOut aria-hidden="true" /></IconButton> : null}
      </header>

      <main className="app-main" id="main-content" tabIndex={-1}>
        <div className="app-feedback" aria-live="polite">
          {error ? (
            <Notice tone="danger" role="alert">
              <span>{error}</span>
              <IconButton label="关闭错误" onClick={() => setError("")}><X aria-hidden="true" /></IconButton>
            </Notice>
          ) : null}
          {statusMessage ? <Notice tone="success" role="status">{statusMessage}</Notice> : null}
        </div>
        {bootstrapping ? (
          <AppPageSkeleton />
        ) : (
          <div className="app-page" key={tab}>
            {tab === "recommend" ? (
              <RecommendationView
                weather={weather}
                recommendations={recommendations}
                availableGarmentCount={recommendationGarments.length}
                pendingGarmentCount={recommendationPendingCount}
                occasion={occasion}
                latitude={latitude}
                longitude={longitude}
                busy={Boolean(busyAction)}
                busyAction={busyAction}
                recordingOutfitId={recordingOutfitId}
                wearLogFeedback={wearLogFeedback}
                onOccasion={updateOccasion}
                onFetchWeather={fetchForecast}
                onGenerate={generateRecommendations}
                onRecordWearLog={recordRecommendationWear}
                onOpenImport={() => navigateTo("import")}
                onOpenSettings={() => navigateTo("settings")}
                onOpenWardrobe={() => navigateTo("wardrobe")}
                allowRemoteTaobaoImages={remoteTaobaoImagesEnabled}
              />
            ) : null}
            {tab === "wardrobe" ? (
              <WardrobeView
                garments={garments}
                archivedGarments={archivedGarments}
                selectedIds={selectedIds}
                busy={Boolean(busyAction)}
                busyAction={busyAction}
                filters={wardrobeFilters}
                onFilters={setWardrobeFilters}
                onRefresh={refreshGarments}
                onSelect={setSelectedIds}
                onUpdate={updateOne}
                onDelete={archiveOne}
                onRestore={restoreOne}
                onAddGarment={openManualGarmentDialog}
                onBulkConfirm={bulkConfirm}
                onBulkSeasons={bulkSeasons}
                onBulkTags={bulkTags}
                onBulkExcluded={bulkExcluded}
                onRefreshThumbnails={refreshThumbnails}
                onOpenThumbnailPicker={openThumbnailPicker}
                onCutoutGarment={cutoutGarment}
                onAnalyzeGarmentVision={analyzeVisionTags}
                visionEnabled={visionEnabled}
                visionBusyId={visionBusyId}
                thumbnailRefreshMessage={thumbnailRefreshMessage}
                allowRemoteTaobaoImages={remoteTaobaoImagesEnabled}
              />
            ) : null}
            {tab === "history" ? (
              <HistoryInsightsView
                insights={insights}
                wearLogs={wearLogs}
                recommendationRuns={recommendationRuns}
                busy={Boolean(busyAction)}
                busyAction={busyAction}
                onRefresh={refreshHistory}
                onExport={exportBackup}
                onExportComplete={exportCompleteBackup}
              />
            ) : null}
            {tab === "import" ? (
              <ImportView
                bookmarklet={bookmarklet}
                importText={importText}
                importResult={importResult}
                importPreview={importPreview}
                importDecisions={importDecisions}
                filterSummary={captureFilterSummary}
                captureUrl={captureUrl}
                captureEngine={captureEngine}
                captureResult={captureResult}
                busy={Boolean(busyAction)}
                busyAction={busyAction}
                onCopyBookmarklet={copyBookmarklet}
                onImportText={updateImportText}
                onImport={runImport}
                onImportDecision={updateImportDecision}
                onCaptureUrl={setCaptureUrl}
                onCaptureEngine={setCaptureEngine}
                onStartOrdersCapture={startOrdersCapture}
                onStartItemCapture={startItemCapture}
                onReadLatestCapture={readLatestCapture}
                onPreviewImport={previewImport}
              />
            ) : null}
            {tab === "settings" ? (
              <SettingsView
                latitude={latitude}
                longitude={longitude}
                busy={Boolean(busyAction)}
                busyAction={busyAction}
                profile={profile}
                visionModels={visionModels}
                visionEnabled={visionEnabled}
                remoteTaobaoImagesEnabled={remoteTaobaoImagesEnabled}
                onLatitude={updateLatitude}
                onLongitude={updateLongitude}
                onLocate={locate}
                onSave={saveSettings}
                onProfile={setProfile}
                onVisionEnabled={updateVisionEnabled}
                onRemoteTaobaoImagesEnabled={updateRemoteTaobaoImagesEnabled}
                onRefreshVisionModels={refreshVisionModels}
                onDownloadVisionModel={downloadLocalVisionModel}
                onVerifyVisionModel={verifyLocalVisionModel}
              />
            ) : null}
          </div>
        )}
      </main>

      <nav className="mobile-nav" aria-label="移动导航">
        {NAV_ITEMS.map((item) => (
          <NavButton
            key={item.id}
            active={tab === item.id}
            icon={item.icon}
            label={item.id === "wardrobe" && reviewPendingCount ? `${item.label} ${reviewPendingCount}` : item.label}
            onClick={() => navigateTo(item.id)}
          />
        ))}
      </nav>

      {thumbnailPicker ? (
        <ThumbnailPicker
          garment={thumbnailPicker.garment}
          candidates={thumbnailPicker.candidates}
          selectedUrl={thumbnailPicker.selectedUrl}
          loading={thumbnailPicker.loading}
          saving={thumbnailPicker.saving}
          error={thumbnailPicker.error}
          allowRemoteTaobaoImages={remoteTaobaoImagesEnabled}
          onSelect={chooseThumbnailCandidate}
          onSave={saveThumbnailSelection}
          onClose={closeThumbnailPicker}
        />
      ) : null}

      <ManualGarmentDialog
        open={manualGarmentOpen}
        busy={manualGarmentBusy}
        error={manualGarmentError}
        savedGarment={manualSavedGarment}
        onClose={closeManualGarmentDialog}
        onSubmit={submitManualGarment}
      />
    </div>
  );
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      className={cx("app-nav__item", active && "is-active")}
      aria-current={active ? "page" : undefined}
      aria-label={label}
      type="button"
      onClick={onClick}
    >
      <span className="app-nav__icon">{icon}</span>
      <span className="app-nav__label">{label}</span>
    </button>
  );
}

function AppPageSkeleton() {
  return (
    <section className="page-skeleton" aria-busy="true" aria-label="正在加载衣橱数据">
      <div><Skeleton className="page-skeleton__title" /><Skeleton className="page-skeleton__copy" /></div>
      <div className="page-skeleton__grid"><Skeleton /><Skeleton /><Skeleton /></div>
      <Skeleton className="page-skeleton__stage" />
    </section>
  );
}
