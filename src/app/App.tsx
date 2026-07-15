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
  applySavedOutfitReplacement,
  archiveGarment,
  archiveSavedOutfit,
  archiveTrip,
  checkTaobaoPurchaseCandidate,
  commitTaobaoImport,
  clearRecommendationFeedback,
  createGarment,
  createGarmentCutout,
  createOutfitPlan,
  createSavedOutfit,
  createTrip,
  createTripPackingItem,
  createWearEvent,
  completeTrip,
  deleteTripPackingItem,
  deleteOutfitPlan,
  deleteWearEvent,
  downloadCompleteBackup,
  downloadVisionModel,
  exportLocalData,
  getAuthStatus,
  getCaptureJobArtifact,
  getGarmentThumbnailCandidates,
  getGarments,
  getInsights,
  getOutfitPlans,
  getPersonalProfile,
  getRecommendationFeedback,
  getRecommendationRuns,
  getRecommendations,
  getSavedOutfits,
  getTrips,
  getValueInsights,
  getVisionModels,
  getWearLogs,
  getWearEvents,
  getWeather,
  getWeatherForecast,
  login,
  logout,
  markOutfitPlanWorn,
  previewTaobaoImport,
  previewCompleteBackup,
  previewRecommendationFeedbackClear,
  readLatestTaobaoCapture,
  recalculateTripSelection,
  refreshGarmentThumbnails,
  refreshTripWeather,
  register as registerAccount,
  restoreGarment,
  savePersonalProfile,
  saveRecommendationCandidate,
  selectGarmentThumbnail,
  startCaptureJob,
  submitRecommendationFeedback,
  submitSimilarityFeedback,
  generateTrip,
  updateGarment,
  updateGarmentAvailability,
  updateOutfitPlan,
  updateSavedOutfit,
  updateTrip,
  updateTripPackingItem,
  updateWearEvent,
  uploadGarmentImage,
  verifyVisionModel,
  type CaptureStartResult,
  type ImportSummary,
  type PlannerRangeQuery
} from "../api";
import { getTaobaoBookmarklet } from "../bookmarklet/taobaoBookmarklet";
import { AppMark, IconButton, Notice, Skeleton, cx } from "../components/ui";
import { AuthView, SessionSummary } from "../features/auth/AuthView";
import { HistoryInsightsView, type HistorySection } from "../features/insights/HistoryInsightsView";
import { ImportView } from "../features/import/ImportView";
import { eligiblePurchaseCheckCandidates } from "../features/import/purchaseCheckCandidates";
import { OutfitBuilder } from "../features/outfits/OutfitBuilder";
import { ReplacementDialog } from "../features/outfits/ReplacementDialog";
import { RecommendationView } from "../features/recommendations/RecommendationView";
import { FeedbackDialog } from "../features/recommendations/FeedbackDialog";
import { SettingsView } from "../features/settings/SettingsView";
import { ThumbnailPicker } from "../features/wardrobe/ThumbnailDialog";
import { ManualGarmentDialog } from "../features/wardrobe/ManualGarmentDialog";
import { WardrobeView } from "../features/wardrobe/WardrobeView";
import { FeedbackManagementDialog } from "../features/insights/FeedbackManagementDialog";
import { OutfitPlanDialog } from "../features/planner/OutfitPlanDialog";
import { PlannerView } from "../features/planner/PlannerView";
import { TripPlannerView } from "../features/planner/TripPlannerView";
import { WearDiaryPanel } from "../features/planner/WearDiaryPanel";
import { WearEventDialog, zonedDateTimeToIso, type WearEventDialogInitial } from "../features/planner/WearEventDialog";
import { addCalendarDays } from "../features/planner/WeekGrid";
import { REMOTE_TAOBAO_IMAGES_SESSION_KEY, downloadBlob, downloadJson, exportBackupWithConfirmation, exportCompleteBackupWithConfirmation, readLocalStorageValue, readSessionStorageValue, updateCoordinateForRecommendation, writeLocalStorageValue, writeSessionStorageValue } from "../lib/browser";
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
  FeedbackVerdict,
  Formality,
  Garment,
  GarmentAvailabilityStatus,
  ImportDecision,
  ManualGarmentCreate,
  OutfitRecommendation,
  OutfitPlanEntry,
  OutfitPlanInput,
  OutfitPlanUpdate,
  OutfitReplacementSuggestion,
  PersonalProfile,
  PurchaseCheckResult,
  RecommendationResult,
  RecommendationFeedbackClearPreview,
  RecommendationFeedbackClearScope,
  RecommendationFeedback,
  RecommendationFeedbackInput,
  RecommendationRunEntry,
  SavedOutfit,
  SavedOutfitCreateInput,
  SavedOutfitUpdateInput,
  Season,
  SimilarityFeedbackVerdict,
  TaobaoCapturedBatch,
  TaobaoImportPreview,
  TaobaoImportCommitResult,
  TaobaoWardrobeFilterSummary,
  ThumbnailCandidate,
  Trip,
  TripConstraintRelaxation,
  TripCreateInput,
  TripOptimizationResult,
  TripOutfitSelection,
  TripPackingItem,
  TripPackingStatus,
  VisionModelId,
  VisionModelsResponse,
  WardrobeInsights,
  WardrobeValueInsights,
  WearLogEntry,
  WearEvent,
  WearEventPage,
  WearEventInput,
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

type ReplacementDialogState = {
  outfit: OutfitRecommendation;
  targetGarment: Garment;
  suggestions: OutfitReplacementSuggestion[];
  appliedOutfit?: SavedOutfit;
} | null;

type FeedbackDialogState = {
  outfit: OutfitRecommendation;
  verdict: Extract<FeedbackVerdict, "liked" | "disliked">;
  initialFeedback?: RecommendationFeedback;
  loading: boolean;
} | null;

type OutfitPlanDialogState = {
  plan?: OutfitPlanEntry;
  initial?: Partial<OutfitPlanInput>;
  sourceRecommendation?: OutfitRecommendation;
} | null;

type WearEventDialogState = {
  event?: WearEvent;
  plan?: OutfitPlanEntry;
  initial?: WearEventDialogInitial;
} | null;

const NAV_ITEMS: Array<{ id: AppTab; label: string; icon: ReactNode }> = [
  { id: "recommend", label: "今日推荐", icon: <WandSparkles aria-hidden="true" /> },
  { id: "wardrobe", label: "衣服库", icon: <Database aria-hidden="true" /> },
  { id: "history", label: "历史洞察", icon: <BarChart3 aria-hidden="true" /> },
  { id: "import", label: "导入", icon: <Upload aria-hidden="true" /> },
  { id: "settings", label: "设置", icon: <Settings aria-hidden="true" /> }
];

const SAVED_OUTFIT_SLOT_ORDER: Record<Garment["category"], number> = {
  top: 0,
  bottom: 1,
  dress: 2,
  outerwear: 3,
  shoes: 4,
  accessory: 5
};

function resolveLocalTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function dateKeyInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const value = (type: "year" | "month" | "day") =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function weekStartDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return addCalendarDays(dateKey, -(weekday === 0 ? 6 : weekday - 1));
}

function createDefaultTripDraft(date: string): TripCreateInput {
  return {
    name: "",
    startDate: date,
    endDate: date,
    destination: { name: "" },
    maxGarments: 8,
    maxShoes: 2,
    repeatPolicy: "allow",
    maxCoreWearsBetweenLaundry: 2,
    days: [{
      date,
      activities: [{
        name: "",
        occasion: "日常活动",
        formality: "casual",
        requiresSeparateOutfit: false
      }]
    }]
  };
}

function tripToDraft(trip: Trip): TripCreateInput {
  return {
    name: trip.name,
    startDate: trip.startDate,
    endDate: trip.endDate,
    destination: { ...trip.destination },
    maxGarments: trip.maxGarments,
    maxShoes: trip.maxShoes,
    repeatPolicy: trip.repeatPolicy,
    maxCoreWearsBetweenLaundry: trip.maxCoreWearsBetweenLaundry,
    ...(trip.laundryDay ? { laundryDay: trip.laundryDay } : {}),
    days: trip.days.map((day) => ({
      date: day.date,
      activities: day.activities.map((activity) => ({
        name: activity.name,
        occasion: activity.occasion,
        formality: activity.formality,
        requiresSeparateOutfit: activity.requiresSeparateOutfit
      }))
    }))
  };
}

type WearEventPageFetcher = (query: PlannerRangeQuery) => Promise<WearEventPage>;

export async function loadAllWearEvents(
  query: PlannerRangeQuery,
  fetchPage: WearEventPageFetcher = getWearEvents
): Promise<WearEvent[]> {
  const events: WearEvent[] = [];
  let cursor = query.cursor;
  const seenCursors = new Set<string>();
  if (cursor) seenCursors.add(cursor);

  while (true) {
    const page = await fetchPage(cursor ? { ...query, cursor } : { ...query });
    events.push(...page.events);
    const nextCursor = page.nextCursor;
    if (!nextCursor) return events;
    if (seenCursors.has(nextCursor)) {
      throw new Error("穿着日记返回了重复分页游标");
    }
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }
}

type PersistPlannerWeather = (
  plan: OutfitPlanEntry,
  snapshot: WeatherSnapshot
) => Promise<OutfitPlanEntry>;

export async function hydratePlannerPlansWeather(
  plans: OutfitPlanEntry[],
  forecasts: WeatherSnapshot[],
  persist: PersistPlannerWeather = async (plan, snapshot) =>
    (await updateOutfitPlan(plan.id, { weatherSnapshot: snapshot })).entry
): Promise<OutfitPlanEntry[]> {
  return Promise.all(plans.map(async (plan) => {
    if (plan.status !== "planned" || plan.weatherSnapshot) return plan;
    const snapshot = forecasts.find((forecast) => forecast.date === plan.plannedDate);
    if (!snapshot) return plan;
    try {
      return await persist(plan, snapshot);
    } catch {
      return plan;
    }
  }));
}

export function rollPlannerCalendarDay(
  currentToday: string,
  currentWeekStart: string,
  nextToday: string
): { today: string; weekStart: string } {
  if (nextToday === currentToday) {
    return { today: currentToday, weekStart: currentWeekStart };
  }
  const viewingCurrentWeek = currentWeekStart === weekStartDateKey(currentToday);
  return {
    today: nextToday,
    weekStart: viewingCurrentWeek ? weekStartDateKey(nextToday) : currentWeekStart
  };
}

export function findExactSavedRecommendationParent(
  savedOutfits: readonly SavedOutfit[],
  candidate: OutfitRecommendation
): SavedOutfit | undefined {
  const positions = new Map<Garment["category"], number>();
  const expectedItems = [...candidate.items]
    .sort((left, right) =>
      SAVED_OUTFIT_SLOT_ORDER[left.category] - SAVED_OUTFIT_SLOT_ORDER[right.category] || left.id - right.id
    )
    .map((garment) => {
      const position = positions.get(garment.category) ?? 0;
      positions.set(garment.category, position + 1);
      return { garmentId: garment.id, slot: garment.category, position };
    });

  return savedOutfits.find((saved) => {
    if (saved.sourceCandidateId !== candidate.candidateId || saved.items.length !== expectedItems.length) {
      return false;
    }
    const actualItems = [...saved.items].sort((left, right) =>
      SAVED_OUTFIT_SLOT_ORDER[left.slot] - SAVED_OUTFIT_SLOT_ORDER[right.slot] ||
      left.position - right.position ||
      left.garmentSnapshot.id - right.garmentSnapshot.id
    );
    return actualItems.every((item, index) => {
      const expected = expectedItems[index];
      return item.garmentId === expected.garmentId &&
        item.garmentSnapshot.id === expected.garmentId &&
        item.slot === expected.slot &&
        item.position === expected.position;
    });
  });
}

export async function resolveSavedRecommendationParent(
  savedOutfits: readonly SavedOutfit[],
  candidate: OutfitRecommendation,
  saveCandidate: (candidateId: string) => Promise<SavedOutfit> = saveRecommendationCandidate
): Promise<{ parent: SavedOutfit; created: boolean }> {
  const existing = findExactSavedRecommendationParent(savedOutfits, candidate);
  if (existing) return { parent: existing, created: false };
  return { parent: await saveCandidate(candidate.candidateId), created: true };
}

export function buildTaobaoOrderCaptureOptions() {
  return { maxPages: 15, loginWait: 60 };
}

export function confirmedSelectionIdsAfterRecalculation(
  confirmedIds: readonly number[],
  previousSelections: readonly Pick<TripOutfitSelection, "id">[],
  targetIndex: number,
  recalculationApplied: boolean
): number[] {
  if (!recalculationApplied) return [...confirmedIds];
  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= previousSelections.length) return [];
  const unchangedPrefixIds = new Set(previousSelections.slice(0, targetIndex).map((selection) => selection.id));
  return confirmedIds.filter((id) => unchangedPrefixIds.has(id));
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
  const [importMode, setImportMode] = useState<"import" | "purchase-check">("import");
  const [purchaseCheckResult, setPurchaseCheckResult] = useState<PurchaseCheckResult | null>(null);
  const [purchaseCheckSourceItemKey, setPurchaseCheckSourceItemKey] = useState("");
  const [purchaseCheckBusy, setPurchaseCheckBusy] = useState(false);
  const [purchaseCheckError, setPurchaseCheckError] = useState("");
  const [similarityFeedbackBusyGarmentId, setSimilarityFeedbackBusyGarmentId] = useState<number | null>(null);
  const purchaseCheckRequestVersion = useRef(0);
  const [captureFilterSummary, setCaptureFilterSummary] = useState<TaobaoWardrobeFilterSummary | null>(null);
  const [captureUrl, setCaptureUrl] = useState("");
  const [captureEngine, setCaptureEngine] = useState<CaptureEngine>("selenium");
  const [captureResult, setCaptureResult] = useState<CaptureStartResult | CaptureJob | null>(null);
  const [captureJob, setCaptureJob] = useState<CaptureJob | null>(null);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationResult | null>(null);
  const [includeGarmentIds, setIncludeGarmentIds] = useState<number[]>([]);
  const [excludeGarmentIds, setExcludeGarmentIds] = useState<number[]>([]);
  const [profile, setProfile] = useState<PersonalProfile>(DEFAULT_PROFILE);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [wearLogs, setWearLogs] = useState<WearLogEntry[]>([]);
  const [wearEvents, setWearEvents] = useState<WearEvent[]>([]);
  const [outfitPlans, setOutfitPlans] = useState<OutfitPlanEntry[]>([]);
  const [plannerForecasts, setPlannerForecasts] = useState<WeatherSnapshot[]>([]);
  const [historySection, setHistorySection] = useState<HistorySection>("planner");
  const [plannerTimeZone] = useState(resolveLocalTimeZone);
  const [plannerToday, setPlannerToday] = useState(() => dateKeyInTimeZone(new Date(), resolveLocalTimeZone()));
  const [plannerWeekStart, setPlannerWeekStart] = useState(() => weekStartDateKey(
    dateKeyInTimeZone(new Date(), resolveLocalTimeZone())
  ));
  const [plannerBusy, setPlannerBusy] = useState(false);
  const [plannerError, setPlannerError] = useState("");
  const [trips, setTrips] = useState<Trip[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<number | null>(null);
  const [tripEditorMode, setTripEditorMode] = useState<"create" | "edit" | null>(null);
  const [editingTripId, setEditingTripId] = useState<number | null>(null);
  const [tripDraft, setTripDraft] = useState<TripCreateInput>(() => createDefaultTripDraft(
    dateKeyInTimeZone(new Date(), resolveLocalTimeZone())
  ));
  const [tripOptimization, setTripOptimization] = useState<TripOptimizationResult | null>(null);
  const [confirmedTripSelectionIds, setConfirmedTripSelectionIds] = useState<number[]>([]);
  const [tripEssentialDraft, setTripEssentialDraft] = useState("");
  const [tripLoading, setTripLoading] = useState(() => typeof window !== "undefined");
  const [tripBusy, setTripBusy] = useState(false);
  const [tripError, setTripError] = useState("");
  const tripRequestVersion = useRef(0);
  const [busyPlanId, setBusyPlanId] = useState<number | null>(null);
  const [busyWearEventId, setBusyWearEventId] = useState<number | null>(null);
  const [schedulingOutfitId, setSchedulingOutfitId] = useState<string | null>(null);
  const [outfitPlanDialog, setOutfitPlanDialog] = useState<OutfitPlanDialogState>(null);
  const [wearEventDialog, setWearEventDialog] = useState<WearEventDialogState>(null);
  const [planRepeatWarning, setPlanRepeatWarning] = useState("");
  const [recommendationRuns, setRecommendationRuns] = useState<RecommendationRunEntry[]>([]);
  const [insights, setInsights] = useState<WardrobeInsights | null>(null);
  const [valueInsights, setValueInsights] = useState<WardrobeValueInsights | null>(null);
  const [valueInsightsBusy, setValueInsightsBusy] = useState(false);
  const [valueInsightsError, setValueInsightsError] = useState("");
  const [savedOutfits, setSavedOutfits] = useState<SavedOutfit[]>([]);
  const [savedOutfitBusy, setSavedOutfitBusy] = useState(false);
  const [savingOutfitId, setSavingOutfitId] = useState<string | null>(null);
  const [outfitBuilderOutfit, setOutfitBuilderOutfit] = useState<SavedOutfit | null | undefined>(undefined);
  const [outfitBuilderError, setOutfitBuilderError] = useState("");
  const [replacementDialog, setReplacementDialog] = useState<ReplacementDialogState>(null);
  const [replacementBusy, setReplacementBusy] = useState(false);
  const [replacementError, setReplacementError] = useState("");
  const [applyingReplacementId, setApplyingReplacementId] = useState<number | null>(null);
  const [visionModels, setVisionModels] = useState<VisionModelsResponse | null>(null);
  const [visionEnabled, setVisionEnabled] = useState(() => readLocalStorageValue("outfit.localVision.enabled", "true") !== "false");
  const [remoteTaobaoImagesEnabled, setRemoteTaobaoImagesEnabled] = useState(() =>
    readSessionStorageValue(REMOTE_TAOBAO_IMAGES_SESSION_KEY, "false") === "true"
  );
  const [recordingOutfitId, setRecordingOutfitId] = useState<string | null>(null);
  const [feedbackDialog, setFeedbackDialog] = useState<FeedbackDialogState>(null);
  const [feedbackBusyCandidateId, setFeedbackBusyCandidateId] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState("");
  const [availabilityBusyGarmentId, setAvailabilityBusyGarmentId] = useState<number | null>(null);
  const [feedbackManagementOpen, setFeedbackManagementOpen] = useState(false);
  const [feedbackClearPreview, setFeedbackClearPreview] = useState<RecommendationFeedbackClearPreview | null>(null);
  const [feedbackClearBusy, setFeedbackClearBusy] = useState(false);
  const [feedbackClearError, setFeedbackClearError] = useState("");
  const [visionBusyId, setVisionBusyId] = useState<number | null>(null);
  const [wearLogFeedback, setWearLogFeedback] = useState<WearLogFeedback | null>(null);
  const [thumbnailRefreshMessage, setThumbnailRefreshMessage] = useState("");
  const [thumbnailPicker, setThumbnailPicker] = useState<ThumbnailPickerState>(null);
  const [manualGarmentOpen, setManualGarmentOpen] = useState(false);
  const [manualGarmentBusy, setManualGarmentBusy] = useState(false);
  const [manualGarmentError, setManualGarmentError] = useState("");
  const [manualSavedGarment, setManualSavedGarment] = useState<Garment | null>(null);
  const thumbnailPickerRequestId = useRef(0);
  const feedbackDialogRequestId = useRef(0);
  const [occasion, setOccasion] = useState<Formality>("casual");
  const [latitude, setLatitude] = useState(() => readLocalStorageValue("outfit.latitude", DEFAULT_LATITUDE));
  const [longitude, setLongitude] = useState(() => readLocalStorageValue("outfit.longitude", DEFAULT_LONGITUDE));
  const [busyAction, setBusyAction] = useState<BusyAction | null>(null);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const bookmarklet = useMemo(() => getTaobaoBookmarklet(), []);
  const outfitBuilderGarments = useMemo(
    () => [...garments, ...archivedGarments],
    [archivedGarments, garments]
  );
  const selectedTrip = trips.find((trip) => trip.id === selectedTripId) ?? null;
  const reviewPendingCount = garments.filter(isWardrobeReviewPendingGarment).length;
  const recommendationPendingCount = garments.filter(isRecommendationPendingGarment).length;
  const recommendationGarments = garments.filter(isRecommendationEligibleGarment);
  const coreGarments = includeGarmentIds
    .map((id) => garments.find((garment) => garment.id === id))
    .filter((garment): garment is Garment => Boolean(garment));
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
    Promise.allSettled([
      refreshGarments(),
      refreshProfile(),
      refreshHistoryData(),
      refreshSavedOutfits(),
      refreshTrips(),
      refreshVisionModels()
    ])
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
    const syncCalendarDay = () => {
      const nextToday = dateKeyInTimeZone(new Date(), plannerTimeZone);
      const next = rollPlannerCalendarDay(plannerToday, plannerWeekStart, nextToday);
      if (next.today === plannerToday) return;
      setPlannerToday(next.today);
      setPlannerWeekStart(next.weekStart);
      if (next.weekStart !== plannerWeekStart) {
        void refreshPlannerWeek(next.weekStart);
      }
    };
    syncCalendarDay();
    const interval = window.setInterval(syncCalendarDay, 30_000);
    return () => window.clearInterval(interval);
  }, [plannerTimeZone, plannerToday, plannerWeekStart]);

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

  async function refreshValueInsights() {
    setValueInsightsBusy(true);
    setValueInsightsError("");
    try {
      setValueInsights(await getValueInsights());
    } catch (valueError) {
      setValueInsightsError(valueError instanceof Error ? valueError.message : "价值与利用数据读取失败");
    } finally {
      setValueInsightsBusy(false);
    }
  }

  async function refreshTrips() {
    const requestVersion = ++tripRequestVersion.current;
    try {
      const nextTrips = await getTrips();
      if (requestVersion !== tripRequestVersion.current) return;
      setTrips(nextTrips);
      setSelectedTripId((current) =>
        current && nextTrips.some((trip) => trip.id === current)
          ? current
          : nextTrips[0]?.id ?? null
      );
      setTripError("");
    } catch (tripLoadError) {
      if (requestVersion !== tripRequestVersion.current) return;
      setTripError(tripLoadError instanceof Error ? tripLoadError.message : "旅行计划读取失败");
    } finally {
      if (requestVersion === tripRequestVersion.current) setTripLoading(false);
    }
  }

  async function refreshHistoryData() {
    void refreshValueInsights();
    setError("");
    try {
      const weekEnd = addCalendarDays(plannerWeekStart, 6);
      const coordinates = parseLocationCoordinates(latitude, longitude);
      const [nextWearLogs, nextRuns, nextInsights, nextWearEvents, nextPlans, nextForecasts] = await Promise.all([
        getWearLogs(),
        getRecommendationRuns(),
        getInsights(),
        loadAllWearEvents({
          timeZone: plannerTimeZone,
          from: addCalendarDays(plannerToday, -3650),
          to: plannerToday,
          limit: 100
        }),
        getOutfitPlans({
          timeZone: plannerTimeZone,
          from: plannerWeekStart,
          to: weekEnd
        }),
        coordinates
          ? getWeatherForecast(coordinates.latitude, coordinates.longitude, 7)
          : Promise.resolve([])
      ]);
      setWearLogs(nextWearLogs);
      setRecommendationRuns(nextRuns);
      setInsights(nextInsights);
      setWearEvents(nextWearEvents);
      const hydratedPlans = await hydratePlannerPlansWeather(nextPlans, nextForecasts);
      setOutfitPlans(hydratedPlans);
      setPlannerForecasts(nextForecasts);
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : "历史数据读取失败");
    }
  }

  async function refreshPlannerWeek(weekStart = plannerWeekStart) {
    setPlannerBusy(true);
    setPlannerError("");
    try {
      const coordinates = parseLocationCoordinates(latitude, longitude);
      const [nextPlans, nextForecasts] = await Promise.all([
        getOutfitPlans({
          timeZone: plannerTimeZone,
          from: weekStart,
          to: addCalendarDays(weekStart, 6)
        }),
        coordinates
          ? getWeatherForecast(coordinates.latitude, coordinates.longitude, 7)
          : Promise.resolve([])
      ]);
      setOutfitPlans(await hydratePlannerPlansWeather(nextPlans, nextForecasts));
      setPlannerForecasts(nextForecasts);
    } catch (plannerLoadError) {
      setPlannerError(plannerLoadError instanceof Error ? plannerLoadError.message : "周计划读取失败");
    } finally {
      setPlannerBusy(false);
    }
  }

  async function refreshSavedOutfits() {
    try {
      const [active, archived] = await Promise.all([
        getSavedOutfits(),
        getSavedOutfits({ archived: true })
      ]);
      setSavedOutfits([...active, ...archived]);
    } catch (savedOutfitError) {
      setError(savedOutfitError instanceof Error ? savedOutfitError.message : "保存搭配读取失败");
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
      resetPurchaseCheck();
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
      resetPurchaseCheck();
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
    resetPurchaseCheck();
  }

  async function previewImport() {
    resetPurchaseCheck();
    setBusyAction("preview-import");
    setError("");
    try {
      const preview = await previewTaobaoImport(JSON.parse(importText));
      const purchaseCandidates = eligiblePurchaseCheckCandidates(preview);
      setImportPreview(preview);
      setPurchaseCheckSourceItemKey((current) => purchaseCandidates.some((candidate) => candidate.sourceItemKey === current)
        ? current
        : purchaseCandidates[0]?.sourceItemKey ?? "");
      setPurchaseCheckResult(null);
      setPurchaseCheckError("");
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

  function resetPurchaseCheck() {
    purchaseCheckRequestVersion.current += 1;
    setPurchaseCheckResult(null);
    setPurchaseCheckSourceItemKey("");
    setPurchaseCheckError("");
    setPurchaseCheckBusy(false);
    setSimilarityFeedbackBusyGarmentId(null);
  }

  function changeImportMode(mode: "import" | "purchase-check") {
    purchaseCheckRequestVersion.current += 1;
    setPurchaseCheckBusy(false);
    setSimilarityFeedbackBusyGarmentId(null);
    setImportMode(mode);
    setPurchaseCheckError("");
    if (mode === "purchase-check" && !purchaseCheckSourceItemKey) {
      setPurchaseCheckSourceItemKey(eligiblePurchaseCheckCandidates(importPreview)[0]?.sourceItemKey ?? "");
    }
  }

  function changePurchaseCheckSourceItemKey(sourceItemKey: string) {
    purchaseCheckRequestVersion.current += 1;
    setPurchaseCheckBusy(false);
    setSimilarityFeedbackBusyGarmentId(null);
    setPurchaseCheckSourceItemKey(sourceItemKey);
    setPurchaseCheckResult(null);
    setPurchaseCheckError("");
  }

  async function runPurchaseCheck() {
    const requestVersion = ++purchaseCheckRequestVersion.current;
    const requestedSourceItemKey = purchaseCheckSourceItemKey;
    const requestedImportText = importText;
    setPurchaseCheckBusy(true);
    setSimilarityFeedbackBusyGarmentId(null);
    setPurchaseCheckError("");
    setPurchaseCheckResult(null);
    try {
      const batch = JSON.parse(requestedImportText) as TaobaoCapturedBatch;
      let preview = importPreview;
      if (!preview) {
        preview = await previewTaobaoImport(batch);
        if (purchaseCheckRequestVersion.current !== requestVersion) return;
        setImportPreview(preview);
        setImportDecisions(Object.fromEntries(preview.candidates.map((candidate) => [
          candidate.sourceItemKey,
          {
            sourceItemKey: candidate.sourceItemKey,
            include: candidate.disposition === "create" || candidate.disposition === "update" || candidate.disposition === "refund-sync"
          }
        ])));
      }
      const purchaseCandidates = eligiblePurchaseCheckCandidates(preview);
      const sourceItemKey = purchaseCandidates.some((candidate) => candidate.sourceItemKey === requestedSourceItemKey)
        ? requestedSourceItemKey
        : purchaseCandidates[0]?.sourceItemKey ?? "";
      if (!sourceItemKey) {
        throw new Error("没有可用于购买前检查的未退款服饰候选");
      }
      setPurchaseCheckSourceItemKey(sourceItemKey);
      const result = await checkTaobaoPurchaseCandidate({ batch, sourceItemKey });
      if (purchaseCheckRequestVersion.current !== requestVersion) return;
      setPurchaseCheckResult(result);
    } catch (checkError) {
      if (purchaseCheckRequestVersion.current !== requestVersion) return;
      setPurchaseCheckResult(null);
      setPurchaseCheckError(checkError instanceof Error ? checkError.message : "购买前检查失败");
    } finally {
      if (purchaseCheckRequestVersion.current === requestVersion) {
        setPurchaseCheckBusy(false);
      }
    }
  }

  async function saveSimilarityFeedback(
    comparedGarmentId: number,
    verdict: SimilarityFeedbackVerdict
  ) {
    if (!purchaseCheckSourceItemKey || purchaseCheckBusy || similarityFeedbackBusyGarmentId !== null) return;
    const requestVersion = ++purchaseCheckRequestVersion.current;
    const sourceItemKey = purchaseCheckSourceItemKey;
    const requestedImportText = importText;
    setSimilarityFeedbackBusyGarmentId(comparedGarmentId);
    setPurchaseCheckError("");
    try {
      let batch: TaobaoCapturedBatch;
      try {
        batch = JSON.parse(requestedImportText) as TaobaoCapturedBatch;
        await submitSimilarityFeedback({
          subject: {
            kind: "taobao-candidate",
            batch,
            sourceItemKey
          },
          comparedGarmentId,
          verdict
        });
      } catch (feedbackError) {
        if (purchaseCheckRequestVersion.current === requestVersion) {
          setPurchaseCheckError(feedbackError instanceof Error ? feedbackError.message : "相似度反馈保存失败");
        }
        return;
      }
      if (purchaseCheckRequestVersion.current !== requestVersion) return;

      if (verdict === "not-duplicate") {
        setPurchaseCheckResult((current) => current ? {
          ...current,
          possibleDuplicates: current.possibleDuplicates.filter((match) => match.garment.id !== comparedGarmentId)
        } : current);
      }
      setStatusMessage(verdict === "not-duplicate" ? "已记录为不是重复，相似项已更新" : "已记录为确实重复");

      try {
        const refreshed = await checkTaobaoPurchaseCandidate({ batch, sourceItemKey });
        if (purchaseCheckRequestVersion.current === requestVersion) {
          setPurchaseCheckResult(refreshed);
        }
      } catch (refreshError) {
        if (purchaseCheckRequestVersion.current === requestVersion) {
          const detail = refreshError instanceof Error ? refreshError.message : "请稍后重试";
          setPurchaseCheckError(`反馈已保存，但重新检查失败：${detail}`);
        }
      }
    } finally {
      if (purchaseCheckRequestVersion.current === requestVersion) {
        setSimilarityFeedbackBusyGarmentId(null);
      }
    }
  }

  function openRelatedGarments(garmentIds: number[], message = "已显示洞察中的相关衣物") {
    const relatedGarmentIds = Array.from(new Set(
      garmentIds.filter((id) => Number.isSafeInteger(id) && id > 0)
    ));
    if (!relatedGarmentIds.length) {
      setError("这条洞察没有可查看的相关衣物");
      return;
    }
    setSelectedIds([]);
    setWardrobeFilters({ ...DEFAULT_WARDROBE_FILTERS, relatedGarmentIds });
    setStatusMessage(message);
    navigateTo("wardrobe");
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

  async function changeGarmentAvailability(id: number, status: GarmentAvailabilityStatus) {
    setAvailabilityBusyGarmentId(id);
    setError("");
    try {
      const result = await updateGarmentAvailability(id, status);
      setGarments((items) => applyGarmentPatch(items, id, result.garment));
      setArchivedGarments((items) => applyGarmentPatch(items, id, result.garment));
      if (status !== "available") {
        setIncludeGarmentIds((ids) => ids.filter((garmentId) => garmentId !== id));
      }
      setRecommendations(null);
      setStatusMessage(result.changed ? "衣物可用状态已更新" : "衣物已经是该状态");
      await refreshHistoryData();
    } catch (availabilityError) {
      setError(availabilityError instanceof Error ? availabilityError.message : "衣物状态更新失败");
    } finally {
      setAvailabilityBusyGarmentId(null);
    }
  }

  async function bulkAvailability(status: GarmentAvailabilityStatus) {
    if (!selectedIds.length) return;
    setBusyAction("bulk-availability");
    setError("");
    const ids = [...selectedIds];
    try {
      const results = await Promise.allSettled(ids.map((id) => updateGarmentAvailability(id, status)));
      const succeededIds = ids.filter((_, index) => results[index].status === "fulfilled");
      const failedIds = ids.filter((_, index) => results[index].status === "rejected");
      setSelectedIds(failedIds);
      if (status !== "available") {
        const succeeded = new Set(succeededIds);
        setIncludeGarmentIds((current) => current.filter((id) => !succeeded.has(id)));
      }
      setRecommendations(null);
      await Promise.all([refreshGarments(), refreshHistoryData()]);
      if (succeededIds.length) {
        setStatusMessage(`${succeededIds.length} 件衣物状态已更新`);
      }
      if (failedIds.length) {
        setError(`${failedIds.length} 件衣物更新失败，已保留选择以便重试`);
      }
    } finally {
      setBusyAction(null);
    }
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
    setOccasion(value as Formality);
    setRecommendations(null);
    setWearLogFeedback(null);
  }

  async function generateRecommendations() {
    await requestRecommendations({ includeGarmentIds, excludeGarmentIds });
  }

  async function requestRecommendations(constraints: {
    includeGarmentIds: number[];
    excludeGarmentIds: number[];
  }) {
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
      setRecommendations(await getRecommendations({
        weather: snapshot,
        occasion,
        userProfile: profile,
        ...(constraints.includeGarmentIds.length
          ? { includeGarmentIds: constraints.includeGarmentIds }
          : {}),
        ...(constraints.excludeGarmentIds.length
          ? { excludeGarmentIds: constraints.excludeGarmentIds }
          : {})
      }));
    } catch (recommendError) {
      setError(recommendError instanceof Error ? recommendError.message : "推荐失败");
    } finally {
      setBusyAction(null);
    }
  }

  function useGarmentAsCore(garment: Garment) {
    const nextInclude = [garment.id];
    setIncludeGarmentIds(nextInclude);
    setExcludeGarmentIds([]);
    setRecommendations(null);
    setWearLogFeedback(null);
    navigateTo("recommend");
    void requestRecommendations({ includeGarmentIds: nextInclude, excludeGarmentIds: [] });
  }

  function clearGarmentConstraints() {
    setIncludeGarmentIds([]);
    setExcludeGarmentIds([]);
    setRecommendations(null);
    setStatusMessage("已清除核心单品，可重新生成搭配");
  }

  function openReplacementDialog(outfit: OutfitRecommendation, targetGarment: Garment) {
    const suggestions = outfit.replacements.filter((suggestion) =>
      suggestion.targetGarmentId === targetGarment.id
    );
    if (!suggestions.length) return;
    setReplacementError("");
    setReplacementDialog({ outfit, targetGarment, suggestions });
  }

  function closeReplacementDialog() {
    if (replacementBusy) return;
    setReplacementDialog(null);
    setReplacementError("");
    setApplyingReplacementId(null);
  }

  async function applyReplacementSuggestion(suggestion: OutfitReplacementSuggestion) {
    if (!replacementDialog) return;
    setReplacementBusy(true);
    setApplyingReplacementId(suggestion.replacement.id);
    setReplacementError("");
    try {
      const resolvedParent = await resolveSavedRecommendationParent(savedOutfits, replacementDialog.outfit);
      const parent = resolvedParent.parent;
      if (resolvedParent.created) {
        upsertSavedOutfit(parent);
      }
      const derived = await applySavedOutfitReplacement(parent.id, {
        targetGarmentId: suggestion.targetGarmentId,
        replacementGarmentId: suggestion.replacement.id
      });
      upsertSavedOutfit(derived);
      setReplacementDialog((current) => current ? { ...current, appliedOutfit: derived } : current);
      setStatusMessage("替换版本已保存，原搭配保持不变");
    } catch (replacementActionError) {
      setReplacementError(
        replacementActionError instanceof Error ? replacementActionError.message : "替换版本生成失败"
      );
    } finally {
      setApplyingReplacementId(null);
      setReplacementBusy(false);
    }
  }

  async function recordRecommendationWear(outfit: OutfitRecommendation) {
    setError("");
    setWearLogFeedback(null);
    setRecordingOutfitId(outfit.candidateId);
    try {
      await submitRecommendationFeedback({
        candidateId: outfit.candidateId,
        actuallyWorn: true,
        reasonCodes: []
      });
      setWearLogFeedback({
        outfitId: outfit.candidateId,
        message: "已记录实际穿着；如需可手动将相关衣物设为待洗"
      });
      await refreshHistoryData();
    } catch (wearLogError) {
      setError(wearLogError instanceof Error ? wearLogError.message : "记录实际穿着失败");
    } finally {
      setRecordingOutfitId(null);
    }
  }

  function openRecommendationFeedback(
    outfit: OutfitRecommendation,
    verdict: Extract<FeedbackVerdict, "liked" | "disliked">
  ) {
    const requestId = feedbackDialogRequestId.current + 1;
    feedbackDialogRequestId.current = requestId;
    setFeedbackError("");
    setFeedbackDialog({ outfit, verdict, loading: true });
    void getRecommendationFeedback(outfit.candidateId)
      .then((initialFeedback) => {
        if (feedbackDialogRequestId.current !== requestId) return;
        setFeedbackDialog((current) => current?.outfit.candidateId === outfit.candidateId
          ? { ...current, ...(initialFeedback ? { initialFeedback } : {}), loading: false }
          : current);
      })
      .catch((feedbackLoadError) => {
        if (feedbackDialogRequestId.current !== requestId) return;
        setFeedbackDialog(null);
        setError(feedbackLoadError instanceof Error ? feedbackLoadError.message : "已有反馈读取失败");
      });
  }

  function closeRecommendationFeedback() {
    if (feedbackBusyCandidateId) return;
    feedbackDialogRequestId.current += 1;
    setFeedbackDialog(null);
    setFeedbackError("");
  }

  async function saveRecommendationFeedback(input: RecommendationFeedbackInput) {
    if (!feedbackDialog || input.candidateId !== feedbackDialog.outfit.candidateId) {
      setFeedbackError("反馈候选已变化，请重新打开");
      return;
    }
    setFeedbackBusyCandidateId(input.candidateId);
    setFeedbackError("");
    try {
      await submitRecommendationFeedback(input);
      setFeedbackDialog(null);
      setWearLogFeedback({ outfitId: input.candidateId, message: "反馈已保存，将用于后续有限排序" });
      setStatusMessage("推荐反馈已保存");
      await refreshHistoryData();
    } catch (feedbackSubmitError) {
      setFeedbackError(feedbackSubmitError instanceof Error ? feedbackSubmitError.message : "反馈保存失败");
    } finally {
      setFeedbackBusyCandidateId(null);
    }
  }

  function openFeedbackManagement() {
    setFeedbackClearError("");
    setFeedbackClearPreview(null);
    setFeedbackManagementOpen(true);
  }

  function closeFeedbackManagement() {
    if (feedbackClearBusy) return;
    setFeedbackManagementOpen(false);
    setFeedbackClearPreview(null);
    setFeedbackClearError("");
  }

  async function previewFeedbackClear(scope: RecommendationFeedbackClearScope) {
    setFeedbackClearBusy(true);
    setFeedbackClearError("");
    try {
      setFeedbackClearPreview(await previewRecommendationFeedbackClear(scope));
    } catch (previewError) {
      setFeedbackClearPreview(null);
      setFeedbackClearError(previewError instanceof Error ? previewError.message : "反馈范围预览失败");
    } finally {
      setFeedbackClearBusy(false);
    }
  }

  async function confirmFeedbackClear(scope: RecommendationFeedbackClearScope) {
    if (!feedbackClearPreview) return;
    setFeedbackClearBusy(true);
    setFeedbackClearError("");
    try {
      const result = await clearRecommendationFeedback(scope);
      setFeedbackManagementOpen(false);
      setFeedbackClearPreview(null);
      setRecommendations(null);
      setStatusMessage(`已清空 ${result.deletedFeedbackCount} 条反馈，学习权重已重算`);
      await refreshHistoryData();
    } catch (clearError) {
      setFeedbackClearError(clearError instanceof Error ? clearError.message : "反馈清空失败");
    } finally {
      setFeedbackClearBusy(false);
    }
  }

  async function saveRecommendationOutfit(outfit: OutfitRecommendation) {
    setSavingOutfitId(outfit.candidateId);
    setError("");
    setOutfitBuilderError("");
    try {
      const saved = await saveRecommendationCandidate(outfit.candidateId);
      upsertSavedOutfit(saved);
      setOutfitBuilderOutfit(saved);
      setStatusMessage("搭配已保存，可以立即改名或调整");
    } catch (savedOutfitError) {
      setError(savedOutfitError instanceof Error ? savedOutfitError.message : "推荐搭配保存失败");
    } finally {
      setSavingOutfitId(null);
    }
  }

  async function scheduleRecommendationOutfit(outfit: OutfitRecommendation) {
    setSchedulingOutfitId(outfit.candidateId);
    setError("");
    try {
      const resolved = await resolveSavedRecommendationParent(savedOutfits, outfit);
      if (resolved.created) upsertSavedOutfit(resolved.parent);
      setPlanRepeatWarning("");
      setOutfitPlanDialog({
        initial: {
          plannedDate: plannerToday,
          timeZone: plannerTimeZone,
          outfitId: resolved.parent.id,
          occasion
        },
        sourceRecommendation: outfit
      });
    } catch (scheduleError) {
      setError(scheduleError instanceof Error ? scheduleError.message : "推荐搭配安排失败");
    } finally {
      setSchedulingOutfitId(null);
    }
  }

  function scheduleSavedOutfit(outfit: SavedOutfit) {
    setPlanRepeatWarning("");
    setOutfitPlanDialog({
      initial: {
        plannedDate: plannerToday,
        timeZone: plannerTimeZone,
        outfitId: outfit.id,
        occasion: "casual"
      }
    });
  }

  function openNewOutfitPlan() {
    setPlanRepeatWarning("");
    setOutfitPlanDialog({
      initial: {
        plannedDate: plannerToday,
        timeZone: plannerTimeZone,
        occasion: "casual"
      }
    });
  }

  function editOutfitPlan(plan: OutfitPlanEntry) {
    setPlanRepeatWarning("");
    setOutfitPlanDialog({
      plan,
      initial: {
        plannedDate: plan.plannedDate,
        timeZone: plan.timeZone,
        outfitId: plan.outfitId,
        occasion: plan.occasion,
        notes: plan.notes,
        weatherSnapshot: plan.weatherSnapshot
      }
    });
  }

  function editWornPlanEvent(plan: OutfitPlanEntry) {
    const event = plan.wearEventId
      ? wearEvents.find((candidate) => candidate.id === plan.wearEventId)
      : undefined;
    if (!event) {
      setPlannerError("没有找到这条计划对应的穿着记录，请刷新穿搭历史后重试");
      return;
    }
    setPlannerError("");
    setWearEventDialog({ event });
  }

  async function toggleOutfitPlanSkipped(plan: OutfitPlanEntry) {
    if (plan.status === "worn") return;
    const nextStatus = plan.status === "skipped" ? "planned" : "skipped";
    setBusyPlanId(plan.id);
    setPlannerError("");
    setPlanRepeatWarning("");
    try {
      const result = await updateOutfitPlan(plan.id, { status: nextStatus });
      setOutfitPlans((plans) => [result.entry, ...plans.filter((item) => item.id !== result.entry.id)]);
      if (result.repeatWarning) {
        setOutfitPlanDialog({
          plan: result.entry,
          initial: {
            plannedDate: result.entry.plannedDate,
            timeZone: result.entry.timeZone,
            outfitId: result.entry.outfitId,
            occasion: result.entry.occasion,
            notes: result.entry.notes,
            weatherSnapshot: result.entry.weatherSnapshot
          }
        });
        setPlanRepeatWarning(result.repeatWarning.message);
      } else {
        setStatusMessage(nextStatus === "skipped" ? "计划已跳过" : "计划已恢复");
      }
    } catch (planError) {
      setPlannerError(planError instanceof Error ? planError.message : "计划状态更新失败");
    } finally {
      setBusyPlanId(null);
    }
  }

  function closeOutfitPlanDialog() {
    if (plannerBusy) return;
    setOutfitPlanDialog(null);
    setPlanRepeatWarning("");
  }

  async function submitOutfitPlan(input: OutfitPlanInput) {
    if (!outfitPlanDialog) return;
    if (planRepeatWarning && outfitPlanDialog.plan) {
      setStatusMessage("重复提醒已关闭，已保存的计划保持不变");
      closeOutfitPlanDialog();
      return;
    }
    setPlannerBusy(true);
    setPlannerError("");
    try {
      const result = outfitPlanDialog.plan
        ? await updateOutfitPlan(outfitPlanDialog.plan.id, input as OutfitPlanUpdate)
        : await createOutfitPlan(input);
      setOutfitPlans((plans) => [result.entry, ...plans.filter((plan) => plan.id !== result.entry.id)]);
      if (result.repeatWarning) {
        setOutfitPlanDialog((current) => current ? { ...current, plan: result.entry } : current);
        setPlanRepeatWarning(result.repeatWarning.message);
        return;
      }
      setOutfitPlanDialog(null);
      setStatusMessage("穿搭计划已保存");
      setHistorySection("planner");
      navigateTo("history");
      await refreshHistoryData();
    } catch (planError) {
      setPlannerError(planError instanceof Error ? planError.message : "穿搭计划保存失败");
    } finally {
      setPlannerBusy(false);
    }
  }

  function replaceRepeatedPlanOutfit() {
    const recommendation = outfitPlanDialog?.sourceRecommendation;
    const target = recommendation?.items.find((item) =>
      recommendation.replacements.some((replacement) => replacement.targetGarmentId === item.id)
    );
    closeOutfitPlanDialog();
    if (recommendation && target) {
      openReplacementDialog(recommendation, target);
      return;
    }
    setStatusMessage("当前计划仍会保留；可在今日推荐或保存搭配中换一件后另行安排");
    navigateTo("recommend");
  }

  async function removeOutfitPlan(plan: OutfitPlanEntry) {
    if (!globalThis.confirm(`确定删除 ${plan.plannedDate} 的计划吗？已生成的穿着日记不会删除。`)) return;
    setBusyPlanId(plan.id);
    setPlannerError("");
    try {
      await deleteOutfitPlan(plan.id);
      setOutfitPlans((plans) => plans.filter((item) => item.id !== plan.id));
      setStatusMessage("穿搭计划已删除");
    } catch (planError) {
      setPlannerError(planError instanceof Error ? planError.message : "穿搭计划删除失败");
    } finally {
      setBusyPlanId(null);
    }
  }

  function markPlanWorn(plan: OutfitPlanEntry) {
    const saved = savedOutfits.find((outfit) => outfit.id === plan.outfitId);
    setWearEventDialog({
      plan,
      initial: {
        timeZone: plan.timeZone,
        outfitId: plan.outfitId,
        occasion: plan.occasion,
        notes: plan.notes,
        itemIds: saved?.items
          .map((item) => item.garmentId)
          .filter((id): id is number => typeof id === "number") ?? []
      }
    });
  }

  function openNewWearEvent() {
    setWearEventDialog({ initial: { timeZone: plannerTimeZone, occasion: "casual", itemIds: [] } });
  }

  function editWearEvent(event: WearEvent) {
    setWearEventDialog({ event });
  }

  function closeWearEventDialog() {
    if (plannerBusy) return;
    setWearEventDialog(null);
    setPlannerError("");
  }

  async function submitWearEvent(input: WearEventInput) {
    if (!wearEventDialog) return;
    setPlannerBusy(true);
    setPlannerError("");
    try {
      if (wearEventDialog.plan) {
        await markOutfitPlanWorn(wearEventDialog.plan.id, {
          wornAt: input.wornAt,
          timeZone: input.timeZone,
          outfitId: input.outfitId ?? null,
          occasion: input.occasion,
          itemIds: input.itemIds,
          ...(wearEventDialog.plan.weatherSnapshot
            ? { weatherSnapshot: wearEventDialog.plan.weatherSnapshot }
            : {}),
          notes: input.notes ?? null
        });
      } else if (wearEventDialog.event) {
        await updateWearEvent(wearEventDialog.event.id, input);
      } else {
        await createWearEvent(input);
      }
      setWearEventDialog(null);
      setStatusMessage(wearEventDialog.plan ? "计划已标记为已穿" : "穿着日记已保存");
      await refreshHistoryData();
    } catch (wearError) {
      setPlannerError(wearError instanceof Error ? wearError.message : "穿着日记保存失败");
    } finally {
      setPlannerBusy(false);
    }
  }

  async function removeWearEvent(event: WearEvent) {
    if (!globalThis.confirm("确定撤销这条穿着记录吗？相关统计会立即重算。")) return;
    setBusyWearEventId(event.id);
    setPlannerError("");
    try {
      await deleteWearEvent(event.id);
      setWearEvents((events) => events.filter((item) => item.id !== event.id));
      setStatusMessage("穿着记录已撤销，统计已更新");
      await refreshHistoryData();
    } catch (wearError) {
      setPlannerError(wearError instanceof Error ? wearError.message : "穿着记录撤销失败");
    } finally {
      setBusyWearEventId(null);
    }
  }

  function changePlannerWeek(amount: number) {
    const next = addCalendarDays(plannerWeekStart, amount * 7);
    setPlannerWeekStart(next);
    void refreshPlannerWeek(next);
  }

  function returnPlannerToToday() {
    const next = weekStartDateKey(plannerToday);
    setPlannerWeekStart(next);
    void refreshPlannerWeek(next);
  }

  function openNewSavedOutfit() {
    setOutfitBuilderError("");
    setOutfitBuilderOutfit(null);
  }

  function openSavedOutfit(outfit: SavedOutfit) {
    setOutfitBuilderError("");
    setOutfitBuilderOutfit(outfit);
  }

  function closeOutfitBuilder() {
    if (savedOutfitBusy) return;
    setOutfitBuilderOutfit(undefined);
    setOutfitBuilderError("");
  }

  async function submitSavedOutfit(input: SavedOutfitCreateInput | SavedOutfitUpdateInput) {
    setSavedOutfitBusy(true);
    setOutfitBuilderError("");
    try {
      const saved = outfitBuilderOutfit
        ? await updateSavedOutfit(outfitBuilderOutfit.id, input as SavedOutfitUpdateInput)
        : await createSavedOutfit(input as SavedOutfitCreateInput);
      upsertSavedOutfit(saved);
      setOutfitBuilderOutfit(undefined);
      setStatusMessage(outfitBuilderOutfit ? "保存的搭配已更新" : "新搭配已保存");
    } catch (savedOutfitError) {
      setOutfitBuilderError(savedOutfitError instanceof Error ? savedOutfitError.message : "搭配保存失败");
    } finally {
      setSavedOutfitBusy(false);
    }
  }

  async function favoriteSavedOutfit(outfit: SavedOutfit, favorite: boolean) {
    setSavedOutfitBusy(true);
    setError("");
    try {
      upsertSavedOutfit(await updateSavedOutfit(outfit.id, { favorite }));
      setStatusMessage(favorite ? "搭配已收藏" : "已取消收藏");
    } catch (savedOutfitError) {
      setError(savedOutfitError instanceof Error ? savedOutfitError.message : "搭配收藏状态更新失败");
    } finally {
      setSavedOutfitBusy(false);
    }
  }

  async function archiveOneSavedOutfit(outfit: SavedOutfit) {
    if (!globalThis.confirm(`确定归档「${outfit.name}」吗？归档后历史版本仍会保留。`)) return;
    setSavedOutfitBusy(true);
    setError("");
    try {
      upsertSavedOutfit(await archiveSavedOutfit(outfit.id));
      setStatusMessage("搭配已归档");
    } catch (savedOutfitError) {
      setError(savedOutfitError instanceof Error ? savedOutfitError.message : "搭配归档失败");
    } finally {
      setSavedOutfitBusy(false);
    }
  }

  function upsertSavedOutfit(saved: SavedOutfit) {
    setSavedOutfits((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
  }

  function upsertTrip(nextTrip: Trip) {
    setTrips((items) => [nextTrip, ...items.filter((item) => item.id !== nextTrip.id)]);
    setSelectedTripId(nextTrip.id);
  }

  function beginTripMutation() {
    tripRequestVersion.current += 1;
    setTripBusy(true);
    setTripError("");
  }

  function startTripCreate() {
    setTripDraft(createDefaultTripDraft(plannerToday));
    setEditingTripId(null);
    setTripEditorMode("create");
    setTripError("");
  }

  function startTripEdit(trip: Trip) {
    setSelectedTripId(trip.id);
    setTripDraft(tripToDraft(trip));
    setEditingTripId(trip.id);
    setTripEditorMode("edit");
    setTripError("");
  }

  async function saveTripDraft(draft: TripCreateInput, mode: "create" | "edit") {
    beginTripMutation();
    try {
      const { days, ...tripFields } = draft;
      let saved: Trip;
      if (mode === "edit") {
        if (editingTripId === null) throw new Error("旅行编辑目标已失效，请重新打开编辑器");
        saved = await updateTrip(editingTripId, {
          ...tripFields,
          days,
          laundryDay: draft.laundryDay ?? null
        });
      } else {
        saved = await createTrip(draft);
      }
      upsertTrip(saved);
      setTripDraft(tripToDraft(saved));
      setEditingTripId(null);
      setTripEditorMode(null);
      setTripOptimization(null);
      setConfirmedTripSelectionIds([]);
      setStatusMessage(mode === "edit" ? "旅行计划已更新" : "旅行计划已创建");
    } catch (tripSaveError) {
      setTripError(tripSaveError instanceof Error ? tripSaveError.message : "旅行计划保存失败");
    } finally {
      setTripBusy(false);
    }
  }

  async function archiveOneTrip(trip: Trip) {
    if (!globalThis.confirm(`确定归档「${trip.name}」吗？已确认的实际穿着记录仍会保留。`)) return;
    beginTripMutation();
    try {
      await archiveTrip(trip.id);
      const remaining = trips.filter((item) => item.id !== trip.id);
      setTrips(remaining);
      setSelectedTripId(remaining[0]?.id ?? null);
      setEditingTripId(null);
      setTripEditorMode(null);
      setTripOptimization(null);
      setStatusMessage("旅行计划已归档");
    } catch (tripArchiveError) {
      setTripError(tripArchiveError instanceof Error ? tripArchiveError.message : "旅行计划归档失败");
    } finally {
      setTripBusy(false);
    }
  }

  async function refreshOneTripWeather(trip: Trip) {
    beginTripMutation();
    try {
      const result = await refreshTripWeather(trip.id);
      upsertTrip(result.trip);
      setStatusMessage(`已刷新 ${result.snapshots.length} 天天气快照`);
    } catch (weatherError) {
      setTripError(weatherError instanceof Error ? weatherError.message : "旅行天气刷新失败");
    } finally {
      setTripBusy(false);
    }
  }

  async function generateOneTrip(trip: Trip) {
    beginTripMutation();
    try {
      const result = await generateTrip(trip.id, {
        useStoredWeather: trip.days.some((day) => Boolean(day.weather))
      });
      upsertTrip(result.trip);
      setTripOptimization(result.optimization);
      setConfirmedTripSelectionIds([]);
      setStatusMessage(result.optimization.status === "feasible" ? "旅行胶囊已生成" : "当前硬约束下没有可行方案");
    } catch (tripGenerationError) {
      setTripError(tripGenerationError instanceof Error ? tripGenerationError.message : "旅行胶囊生成失败");
    } finally {
      setTripBusy(false);
    }
  }

  async function applyTripRelaxation(trip: Trip, relaxation: TripConstraintRelaxation) {
    if (!relaxation.guaranteed) {
      startTripEdit(trip);
      setTripError("这条建议需要手动调整并重新生成验证");
      return;
    }
    const next = tripToDraft(trip);
    if (relaxation.constraint === "maxGarments" && typeof relaxation.to === "number") next.maxGarments = relaxation.to;
    else if (relaxation.constraint === "maxShoes" && typeof relaxation.to === "number") next.maxShoes = relaxation.to;
    else if (relaxation.constraint === "maxCoreWearsBetweenLaundry" && [1, 2, 3].includes(Number(relaxation.to))) {
      next.maxCoreWearsBetweenLaundry = Number(relaxation.to) as 1 | 2 | 3;
    } else if (relaxation.constraint === "repeatPolicy" && ["allow", "no-consecutive-core", "no-repeat-core"].includes(String(relaxation.to))) {
      next.repeatPolicy = String(relaxation.to) as TripCreateInput["repeatPolicy"];
    } else {
      startTripEdit(trip);
      setTripError("这条放宽建议需要手动编辑旅行约束");
      return;
    }
    beginTripMutation();
    try {
      const { days: _days, ...update } = next;
      const updated = await updateTrip(trip.id, update);
      upsertTrip(updated);
      setTripDraft(tripToDraft(updated));
      setTripOptimization(null);
      setConfirmedTripSelectionIds([]);
      const result = await generateTrip(updated.id, { useStoredWeather: updated.days.some((day) => Boolean(day.weather)) });
      upsertTrip(result.trip);
      setTripDraft(tripToDraft(result.trip));
      setTripOptimization(result.optimization);
    } catch (relaxError) {
      setTripError(relaxError instanceof Error ? relaxError.message : "约束放宽后重新生成失败");
    } finally {
      setTripBusy(false);
    }
  }

  async function updateTripSelection(
    selection: TripOutfitSelection,
    input: { lockedGarmentIds?: number[]; replace?: { fromGarmentId: number; toGarmentId: number } }
  ) {
    if (!selectedTrip) return;
    const targetIndex = selectedTrip.selections.findIndex((candidate) => candidate.id === selection.id);
    beginTripMutation();
    try {
      const result = await recalculateTripSelection(selectedTrip.id, selection.id, input);
      upsertTrip(result.trip);
      setTripOptimization(result.optimization);
      setConfirmedTripSelectionIds((ids) => confirmedSelectionIdsAfterRecalculation(
        ids,
        selectedTrip.selections,
        targetIndex,
        result.optimization.status === "feasible"
      ));
    } catch (selectionError) {
      setTripError(selectionError instanceof Error ? selectionError.message : "旅行搭配局部重算失败");
    } finally {
      setTripBusy(false);
    }
  }

  async function setTripPackingStatus(item: TripPackingItem, status: TripPackingStatus) {
    if (!selectedTrip) return;
    beginTripMutation();
    try {
      const updated = await updateTripPackingItem(selectedTrip.id, item.id, { status });
      upsertTrip({
        ...selectedTrip,
        packingItems: selectedTrip.packingItems.map((candidate) => candidate.id === updated.id ? updated : candidate)
      });
    } catch (packingError) {
      setTripError(packingError instanceof Error ? packingError.message : "装箱状态更新失败");
    } finally {
      setTripBusy(false);
    }
  }

  async function addTripEssential(label: string) {
    if (!selectedTrip) return;
    beginTripMutation();
    try {
      const item = await createTripPackingItem(selectedTrip.id, { label });
      upsertTrip({ ...selectedTrip, packingItems: [...selectedTrip.packingItems, item] });
      setTripEssentialDraft("");
    } catch (essentialError) {
      setTripError(essentialError instanceof Error ? essentialError.message : "必需品添加失败");
    } finally {
      setTripBusy(false);
    }
  }

  async function removeTripEssential(item: TripPackingItem) {
    if (!selectedTrip) return;
    beginTripMutation();
    try {
      await deleteTripPackingItem(selectedTrip.id, item.id);
      upsertTrip({
        ...selectedTrip,
        packingItems: selectedTrip.packingItems.filter((candidate) => candidate.id !== item.id)
      });
    } catch (essentialError) {
      setTripError(essentialError instanceof Error ? essentialError.message : "必需品移除失败");
    } finally {
      setTripBusy(false);
    }
  }

  async function completeOneTrip(trip: Trip) {
    const expectedIds = trip.selections.map((selection) => selection.id);
    if (expectedIds.some((id) => !confirmedTripSelectionIds.includes(id))) {
      setTripError("请逐套确认每天实际穿着后再完成旅行");
      return;
    }
    beginTripMutation();
    try {
      const result = await completeTrip(trip.id, {
        confirmations: trip.selections.map((selection) => {
          const day = trip.days.find((candidate) => candidate.id === selection.tripDayId);
          const activity = day?.activities.find((candidate) => selection.activityIds.includes(candidate.id));
          if (!day) throw new Error("旅行搭配缺少对应日期");
          return {
            selectionId: selection.id,
            confirmed: true as const,
            wornAt: zonedDateTimeToIso(`${day.date}T12:00`, plannerTimeZone),
            timeZone: plannerTimeZone,
            occasion: activity?.formality ?? "casual",
            itemIds: selection.garments.map((garment) => garment.id)
          };
        })
      });
      upsertTrip(result.trip);
      setTripOptimization(null);
      setConfirmedTripSelectionIds([]);
      setStatusMessage(`已按逐日确认写入 ${result.wearEvents.length} 条穿着日记`);
      await refreshHistoryData();
    } catch (completeError) {
      setTripError(completeError instanceof Error ? completeError.message : "旅行实际穿着写入失败");
    } finally {
      setTripBusy(false);
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
      await Promise.all([refreshHistoryData(), refreshSavedOutfits(), refreshTrips()]);
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
                savingOutfitId={savingOutfitId}
                schedulingOutfitId={schedulingOutfitId}
                feedbackBusyCandidateId={feedbackBusyCandidateId}
                coreGarments={coreGarments}
                recordingOutfitId={recordingOutfitId}
                wearLogFeedback={wearLogFeedback}
                onOccasion={updateOccasion}
                onFetchWeather={fetchForecast}
                onGenerate={generateRecommendations}
                onRecordWearLog={recordRecommendationWear}
                onRecommendationFeedback={openRecommendationFeedback}
                onSaveOutfit={saveRecommendationOutfit}
                onScheduleOutfit={scheduleRecommendationOutfit}
                onUseGarmentAsCore={useGarmentAsCore}
                onClearGarmentConstraints={clearGarmentConstraints}
                onReplaceGarment={openReplacementDialog}
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
                availabilityBusyGarmentId={availabilityBusyGarmentId}
                onAvailabilityChange={(id, status) => { void changeGarmentAvailability(id, status); }}
                onBulkAvailability={(status) => { void bulkAvailability(status); }}
                onRefreshThumbnails={refreshThumbnails}
                onOpenThumbnailPicker={openThumbnailPicker}
                onUseGarmentAsCore={useGarmentAsCore}
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
                activeSection={historySection}
                onSectionChange={setHistorySection}
                insights={insights}
                valueInsights={valueInsights}
                valueInsightsBusy={valueInsightsBusy}
                valueInsightsError={valueInsightsError}
                wearLogs={wearLogs}
                wearEventCount={wearEvents.length}
                recommendationRuns={recommendationRuns}
                savedOutfits={savedOutfits}
                savedOutfitsBusy={savedOutfitBusy}
                allowRemoteTaobaoImages={remoteTaobaoImagesEnabled}
                busy={Boolean(busyAction)}
                busyAction={busyAction}
                onRefresh={refreshHistory}
                onExport={exportBackup}
                onExportComplete={exportCompleteBackup}
                onCreateSavedOutfit={openNewSavedOutfit}
                onOpenSavedOutfit={openSavedOutfit}
                onFavoriteSavedOutfit={favoriteSavedOutfit}
                onArchiveSavedOutfit={archiveOneSavedOutfit}
                onScheduleSavedOutfit={scheduleSavedOutfit}
                onViewRelatedGarments={(ids) => openRelatedGarments(ids)}
                onApplyRelatedFilter={(ids) => openRelatedGarments(ids, "已应用相关衣物筛选")}
                onManageFeedback={openFeedbackManagement}
                plannerContent={(
                  <PlannerView
                    weekStart={plannerWeekStart}
                    today={plannerToday}
                    plans={outfitPlans}
                    outfits={savedOutfits}
                    busy={plannerBusy}
                    busyPlanId={busyPlanId}
                    error={plannerError}
                    onPreviousWeek={() => changePlannerWeek(-1)}
                    onNextWeek={() => changePlannerWeek(1)}
                    onToday={returnPlannerToToday}
                    onCreate={openNewOutfitPlan}
                    onEdit={editOutfitPlan}
                    onEditWearEvent={editWornPlanEvent}
                    onDelete={(plan) => { void removeOutfitPlan(plan); }}
                    onMarkWorn={markPlanWorn}
                    onToggleSkipped={(plan) => { void toggleOutfitPlanSkipped(plan); }}
                  />
                )}
                tripContent={(
                  <TripPlannerView
                    trips={trips}
                    selectedTripId={selectedTripId}
                    editorMode={tripEditorMode}
                    draft={tripDraft}
                    availableGarments={recommendationGarments}
                    optimization={tripOptimization}
                    confirmedSelectionIds={confirmedTripSelectionIds}
                    essentialDraft={tripEssentialDraft}
                    loading={tripLoading}
                    busy={tripBusy || busyAction === "history"}
                    error={tripError}
                    onSelectTrip={(id) => {
                      setSelectedTripId(id);
                      setEditingTripId(null);
                      setTripEditorMode(null);
                      setTripOptimization(null);
                      setConfirmedTripSelectionIds([]);
                      setTripError("");
                    }}
                    onStartCreate={startTripCreate}
                    onStartEdit={startTripEdit}
                    onArchiveTrip={(trip) => { void archiveOneTrip(trip); }}
                    onCancelEdit={() => {
                      setEditingTripId(null);
                      setTripEditorMode(null);
                    }}
                    onDraftChange={setTripDraft}
                    onSave={(draft, mode) => { void saveTripDraft(draft, mode); }}
                    onRefreshWeather={(trip) => { void refreshOneTripWeather(trip); }}
                    onGenerate={(trip) => { void generateOneTrip(trip); }}
                    onApplyRelaxation={(trip, relaxation) => { void applyTripRelaxation(trip, relaxation); }}
                    onToggleGarmentLock={(selection, garmentId, locked) => {
                      const next = new Set(selection.lockedGarmentIds);
                      if (locked) next.add(garmentId);
                      else next.delete(garmentId);
                      void updateTripSelection(selection, { lockedGarmentIds: [...next] });
                    }}
                    onReplaceGarment={(selection, fromGarmentId, toGarmentId) => {
                      void updateTripSelection(selection, { replace: { fromGarmentId, toGarmentId } });
                    }}
                    onPackingStatus={(item, status) => { void setTripPackingStatus(item, status); }}
                    onEssentialDraftChange={setTripEssentialDraft}
                    onAddEssential={(label) => { void addTripEssential(label); }}
                    onRemoveEssential={(item) => { void removeTripEssential(item); }}
                    onToggleWearConfirmation={(selection, confirmed) => {
                      setConfirmedTripSelectionIds((ids) => confirmed
                        ? [...new Set([...ids, selection.id])]
                        : ids.filter((id) => id !== selection.id));
                    }}
                    onCompleteTrip={(trip) => { void completeOneTrip(trip); }}
                  />
                )}
                diaryContent={(
                  <WearDiaryPanel
                    events={wearEvents}
                    outfits={savedOutfits}
                    garments={outfitBuilderGarments}
                    busy={plannerBusy}
                    busyEventId={busyWearEventId}
                    error={plannerError}
                    onCreate={openNewWearEvent}
                    onEdit={editWearEvent}
                    onDelete={(event) => { void removeWearEvent(event); }}
                  />
                )}
              />
            ) : null}
            {tab === "import" ? (
              <ImportView
                mode={importMode}
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
                purchaseCheckResult={purchaseCheckResult}
                purchaseCheckBusy={purchaseCheckBusy}
                purchaseCheckError={purchaseCheckError}
                purchaseCheckSourceItemKey={purchaseCheckSourceItemKey}
                feedbackBusyGarmentId={similarityFeedbackBusyGarmentId}
                onModeChange={changeImportMode}
                onPurchaseCheckSourceItemKey={changePurchaseCheckSourceItemKey}
                onPurchaseCheck={() => { void runPurchaseCheck(); }}
                onSimilarityFeedback={(garmentId, verdict) => { void saveSimilarityFeedback(garmentId, verdict); }}
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

      <OutfitBuilder
        open={outfitBuilderOutfit !== undefined}
        outfit={outfitBuilderOutfit ?? null}
        garments={outfitBuilderGarments}
        busy={savedOutfitBusy}
        error={outfitBuilderError}
        onClose={closeOutfitBuilder}
        onSave={submitSavedOutfit}
      />

      <ReplacementDialog
        open={Boolean(replacementDialog)}
        outfit={replacementDialog?.outfit ?? null}
        targetGarment={replacementDialog?.targetGarment ?? null}
        suggestions={replacementDialog?.suggestions ?? []}
        busy={replacementBusy}
        applyingReplacementId={applyingReplacementId}
        error={replacementError}
        appliedOutfit={replacementDialog?.appliedOutfit}
        allowRemoteTaobaoImages={remoteTaobaoImagesEnabled}
        onClose={closeReplacementDialog}
        onApply={applyReplacementSuggestion}
      />

      <FeedbackDialog
        open={Boolean(feedbackDialog)}
        candidateId={feedbackDialog?.outfit.candidateId ?? ""}
        verdict={feedbackDialog?.verdict ?? "liked"}
        initialFeedback={feedbackDialog?.initialFeedback}
        busy={Boolean(feedbackDialog?.loading) || feedbackBusyCandidateId === feedbackDialog?.outfit.candidateId}
        error={feedbackError}
        onClose={closeRecommendationFeedback}
        onSubmit={saveRecommendationFeedback}
      />

      <FeedbackManagementDialog
        open={feedbackManagementOpen}
        busy={feedbackClearBusy}
        error={feedbackClearError}
        preview={feedbackClearPreview}
        onClose={closeFeedbackManagement}
        onPreview={(scope) => { void previewFeedbackClear(scope); }}
        onConfirm={(scope) => { void confirmFeedbackClear(scope); }}
        onResetPreview={() => setFeedbackClearPreview(null)}
      />

      <OutfitPlanDialog
        open={Boolean(outfitPlanDialog)}
        mode={outfitPlanDialog?.plan ? "edit" : "create"}
        initial={outfitPlanDialog?.initial}
        outfits={savedOutfits}
        forecasts={plannerForecasts}
        minDate={plannerToday}
        busy={plannerBusy}
        error={plannerError}
        repeatWarning={planRepeatWarning}
        onClose={closeOutfitPlanDialog}
        onSubmit={submitOutfitPlan}
        onReplace={replaceRepeatedPlanOutfit}
      />

      <WearEventDialog
        open={Boolean(wearEventDialog)}
        event={wearEventDialog?.event}
        initial={wearEventDialog?.initial}
        outfits={savedOutfits}
        garments={outfitBuilderGarments}
        defaultTimeZone={plannerTimeZone}
        busy={plannerBusy}
        error={plannerError}
        onClose={closeWearEventDialog}
        onSubmit={submitWearEvent}
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
