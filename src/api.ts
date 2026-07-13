import type { AuthStatus, CaptureArtifact, CaptureEngine, CaptureJob, CaptureJobMode, Garment, GarmentAvailabilityChangeResult, GarmentAvailabilityStatus, GarmentThumbnailCandidatesResponse, GarmentUpdateInput, ManualGarmentCreate, MarkWornInput, MarkWornResult, OutfitExport, OutfitPlanEntry, OutfitPlanInput, OutfitPlanMutationResult, OutfitPlanUpdate, PersonalProfile, RecommendationFeedback, RecommendationFeedbackClearPreview, RecommendationFeedbackClearResult, RecommendationFeedbackClearScope, RecommendationFeedbackInput, RecommendationRequest, RecommendationResult, RecommendationRunEntry, SaveRecommendationCandidateInput, SavedOutfit, SavedOutfitCreateInput, SavedOutfitReplacementInput, SavedOutfitUpdateInput, TaobaoImportCommitRequest, TaobaoImportCommitResult, TaobaoImportPreview, TaobaoWardrobeFilterSummary, ThumbnailRefreshResult, VisionModelId, VisionModelJob, VisionModelsResponse, VisionTagSuggestion, WardrobeInsights, WearEvent, WearEventInput, WearEventPage, WearLogEntry, WeatherSnapshot } from "./shared/types";

export const AUTH_REQUIRED_EVENT = "outfit:auth-required";

export class ApiClientError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(message: string, options: { status: number; code?: string; details?: unknown }) {
    super(message);
    this.name = "ApiClientError";
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }
}

export interface CaptureStartResult {
  started: true;
  mode: "orders" | "item-detail";
  engine: CaptureEngine;
  pid: number;
  outputDir: string;
  message: string;
}

export interface LatestTaobaoCaptureResult {
  outputDir: string;
  fileName: string;
  path: string;
  jsonText: string;
  payload: unknown;
  filterSummary?: TaobaoWardrobeFilterSummary;
}

export interface ImportSummary {
  batchId: string;
  summary: {
    totalItems: number;
    uniqueItems: number;
    skippedRefunded: number;
    skippedNonApparel: number;
    createdGarments: number;
  };
}

export interface CompleteBackupWarning {
  code: "ASSET_UNAVAILABLE";
  assetId: number;
  message: string;
}

export interface CompleteBackupPreview {
  assetCount: number;
  includedAssetCount: number;
  assetBytes: number;
  includedAssetBytes: number;
  estimatedBytes: number;
  warnings: CompleteBackupWarning[];
}

export interface DownloadedBackup {
  blob: Blob;
  fileName: string;
}

export interface RecommendationFeedbackSubmitResult {
  feedback: RecommendationFeedback;
  pairStatsRecomputed: number;
}

export async function getAuthStatus(): Promise<AuthStatus> {
  return request<AuthStatus>("/api/auth/status", {
    method: "GET"
  });
}

export async function register(input: { username: string; password: string }): Promise<AuthStatus> {
  return request<AuthStatus>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function login(input: { username: string; password: string }): Promise<AuthStatus> {
  return request<AuthStatus>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function logout(): Promise<{ ok: true }> {
  return request<{ ok: true }>("/api/auth/logout", {
    method: "POST"
  });
}

export async function previewTaobaoImport(payload: unknown): Promise<TaobaoImportPreview> {
  return request<TaobaoImportPreview>("/api/import/taobao-preview", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function commitTaobaoImport(input: TaobaoImportCommitRequest): Promise<TaobaoImportCommitResult> {
  return request<TaobaoImportCommitResult>("/api/import/taobao-commit", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function startTaobaoOrderCapture(options: { maxPages?: number; loginWait?: number } = {}): Promise<CaptureStartResult> {
  return request<CaptureStartResult>("/api/capture/taobao-orders", {
    method: "POST",
    body: JSON.stringify(options)
  });
}

export async function startTaobaoItemCapture(options: { url: string; loginWait?: number }): Promise<CaptureStartResult> {
  return request<CaptureStartResult>("/api/capture/taobao-item", {
    method: "POST",
    body: JSON.stringify(options)
  });
}

export async function startCaptureJob(options: {
  mode: CaptureJobMode;
  maxPages?: number;
  loginWait?: number;
  url?: string;
  engine?: CaptureEngine;
}): Promise<CaptureJob> {
  return request<CaptureJob>("/api/capture/jobs", {
    method: "POST",
    body: JSON.stringify(options)
  });
}

export async function getCaptureJob(id: string): Promise<CaptureJob> {
  return request<CaptureJob>(`/api/capture/jobs/${id}`, {
    method: "GET"
  });
}

export async function cancelCaptureJob(id: string): Promise<CaptureJob> {
  return request<CaptureJob>(`/api/capture/jobs/${id}/cancel`, {
    method: "POST"
  });
}

export async function getCaptureJobArtifact(id: string, options: { wardrobeOnly?: boolean } = {}): Promise<CaptureArtifact> {
  const query = options.wardrobeOnly ? "?wardrobeOnly=1" : "";
  return request<CaptureArtifact>(`/api/capture/jobs/${id}/artifact${query}`, {
    method: "GET"
  });
}

export async function readLatestTaobaoCapture(options: { wardrobeOnly?: boolean } = {}): Promise<LatestTaobaoCaptureResult> {
  const query = options.wardrobeOnly ? "?wardrobeOnly=1" : "";
  return request<LatestTaobaoCaptureResult>(`/api/capture/taobao-latest${query}`, {
    method: "GET"
  });
}

export async function getGarments(options: { archived?: boolean } = {}): Promise<Garment[]> {
  return request<Garment[]>(options.archived ? "/api/garments?archived=1" : "/api/garments");
}

export async function createGarment(input: ManualGarmentCreate): Promise<Garment> {
  return request<Garment>("/api/garments", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function getPersonalProfile(): Promise<PersonalProfile> {
  return request<PersonalProfile>("/api/profile", {
    method: "GET"
  });
}

export async function savePersonalProfile(profile: PersonalProfile): Promise<PersonalProfile> {
  return request<PersonalProfile>("/api/profile", {
    method: "PUT",
    body: JSON.stringify(profile)
  });
}

export async function updateGarment(id: number, update: GarmentUpdateInput): Promise<Garment> {
  return request<Garment>(`/api/garments/${id}`, {
    method: "PUT",
    body: JSON.stringify(update)
  });
}

export async function deleteGarment(id: number): Promise<void> {
  await request<void>(`/api/garments/${id}`, {
    method: "DELETE"
  });
}

export async function archiveGarment(id: number): Promise<Garment> {
  return request<Garment>(`/api/garments/${id}/archive`, {
    method: "POST"
  });
}

export async function restoreGarment(id: number): Promise<Garment> {
  return request<Garment>(`/api/garments/${id}/restore`, {
    method: "POST"
  });
}

export async function updateGarmentAvailability(
  id: number,
  status: GarmentAvailabilityStatus
): Promise<GarmentAvailabilityChangeResult> {
  return request<GarmentAvailabilityChangeResult>(`/api/garments/${id}/availability`, {
    method: "POST",
    body: JSON.stringify({ status })
  });
}

export const setGarmentAvailability = updateGarmentAvailability;

export async function getSavedOutfits(options: { archived?: boolean } = {}): Promise<SavedOutfit[]> {
  return request<SavedOutfit[]>(options.archived ? "/api/outfits?archived=1" : "/api/outfits", {
    method: "GET"
  });
}

export async function getSavedOutfit(id: number): Promise<SavedOutfit> {
  return request<SavedOutfit>(`/api/outfits/${id}`, { method: "GET" });
}

export async function createSavedOutfit(input: SavedOutfitCreateInput): Promise<SavedOutfit> {
  return request<SavedOutfit>("/api/outfits", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function updateSavedOutfit(
  id: number,
  input: SavedOutfitUpdateInput
): Promise<SavedOutfit> {
  return request<SavedOutfit>(`/api/outfits/${id}`, {
    method: "PUT",
    body: JSON.stringify(input)
  });
}

export async function archiveSavedOutfit(id: number): Promise<SavedOutfit> {
  return request<SavedOutfit>(`/api/outfits/${id}/archive`, { method: "POST" });
}

export async function saveRecommendationCandidate(
  candidateId: string,
  input: SaveRecommendationCandidateInput = {}
): Promise<SavedOutfit> {
  return request<SavedOutfit>(`/api/recommendation-candidates/${candidateId}/save`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function applySavedOutfitReplacement(
  outfitId: number,
  input: SavedOutfitReplacementInput
): Promise<SavedOutfit> {
  return request<SavedOutfit>(`/api/outfits/${outfitId}/replacements`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function uploadGarmentImage(id: number, image: Blob): Promise<Garment> {
  return request<Garment>(`/api/garments/${id}/image`, {
    method: "PUT",
    headers: { "content-type": image.type },
    body: image
  });
}

export async function refreshGarmentThumbnails(options: { maxDownloads?: number } = {}): Promise<ThumbnailRefreshResult> {
  return request<ThumbnailRefreshResult>("/api/garments/thumbnails/refresh", {
    method: "POST",
    body: JSON.stringify(options)
  });
}

export async function getGarmentThumbnailCandidates(id: number): Promise<GarmentThumbnailCandidatesResponse> {
  return request<GarmentThumbnailCandidatesResponse>(`/api/garments/${id}/thumbnail-candidates`, {
    method: "GET"
  });
}

export async function selectGarmentThumbnail(id: number, imageUrl: string): Promise<Garment> {
  return request<Garment>(`/api/garments/${id}/thumbnail`, {
    method: "POST",
    body: JSON.stringify({ imageUrl })
  });
}

export async function getVisionModels(): Promise<VisionModelsResponse> {
  return request<VisionModelsResponse>("/api/vision/models", {
    method: "GET"
  });
}

export async function downloadVisionModel(id: VisionModelId): Promise<VisionModelJob> {
  return request<VisionModelJob>(`/api/vision/models/${id}/download`, {
    method: "POST"
  });
}

export async function verifyVisionModel(id: VisionModelId): Promise<VisionModelJob> {
  return request<VisionModelJob>(`/api/vision/models/${id}/verify`, {
    method: "POST"
  });
}

export async function createGarmentCutout(id: number): Promise<Garment> {
  return request<Garment>(`/api/garments/${id}/cutout`, {
    method: "POST"
  });
}

export async function analyzeGarmentVisionTags(id: number): Promise<VisionTagSuggestion> {
  return request<VisionTagSuggestion>(`/api/garments/${id}/vision-tags`, {
    method: "POST"
  });
}

export async function getWeather(latitude: number, longitude: number): Promise<WeatherSnapshot> {
  return request<WeatherSnapshot>(`/api/weather?latitude=${latitude}&longitude=${longitude}`);
}

export async function getWeatherForecast(
  latitude: number,
  longitude: number,
  days = 7
): Promise<WeatherSnapshot[]> {
  const query = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    days: String(days)
  });
  return request<WeatherSnapshot[]>(`/api/weather/forecast?${query.toString()}`);
}

export async function getRecommendations(input: RecommendationRequest): Promise<RecommendationResult> {
  return request<RecommendationResult>("/api/recommendations", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function submitRecommendationFeedback(
  input: RecommendationFeedbackInput
): Promise<RecommendationFeedbackSubmitResult> {
  return request<RecommendationFeedbackSubmitResult>("/api/recommendation-feedback", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function getRecommendationFeedback(
  candidateId: string
): Promise<RecommendationFeedback | null> {
  return request<RecommendationFeedback | null>(
    `/api/recommendation-feedback/${encodeURIComponent(candidateId)}`,
    { method: "GET" }
  );
}

export async function previewRecommendationFeedbackClear(
  scope: RecommendationFeedbackClearScope
): Promise<RecommendationFeedbackClearPreview> {
  return request<RecommendationFeedbackClearPreview>(
    `/api/recommendation-feedback/clear-preview?${recommendationFeedbackClearQuery(scope)}`,
    { method: "GET" }
  );
}

export async function clearRecommendationFeedback(
  scope: RecommendationFeedbackClearScope
): Promise<RecommendationFeedbackClearResult> {
  return request<RecommendationFeedbackClearResult>(
    `/api/recommendation-feedback?${recommendationFeedbackClearQuery(scope)}`,
    { method: "DELETE" }
  );
}

export async function recordWearLog(input: {
  garmentIds: number[];
  context?: Record<string, unknown>;
}): Promise<unknown> {
  return request<unknown>("/api/wear-logs", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function getWearLogs(): Promise<WearLogEntry[]> {
  return request<WearLogEntry[]>("/api/wear-logs", {
    method: "GET"
  });
}

export interface PlannerRangeQuery {
  timeZone: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

export async function getWearEvents(query: PlannerRangeQuery): Promise<WearEventPage> {
  return request<WearEventPage>(`/api/wear-events?${plannerRangeQuery(query)}`);
}

export async function createWearEvent(input: WearEventInput): Promise<WearEvent> {
  return request<WearEvent>("/api/wear-events", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function updateWearEvent(id: number, input: Partial<WearEventInput>): Promise<WearEvent> {
  return request<WearEvent>(`/api/wear-events/${id}`, {
    method: "PUT",
    body: JSON.stringify(input)
  });
}

export async function deleteWearEvent(id: number): Promise<WearEvent> {
  return request<WearEvent>(`/api/wear-events/${id}`, { method: "DELETE" });
}

export async function getOutfitPlans(query: Omit<PlannerRangeQuery, "cursor" | "limit">): Promise<OutfitPlanEntry[]> {
  return request<OutfitPlanEntry[]>(`/api/outfit-plans?${plannerRangeQuery(query)}`);
}

export async function createOutfitPlan(input: OutfitPlanInput): Promise<OutfitPlanMutationResult> {
  return request<OutfitPlanMutationResult>("/api/outfit-plans", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function updateOutfitPlan(
  id: number,
  input: OutfitPlanUpdate
): Promise<OutfitPlanMutationResult> {
  return request<OutfitPlanMutationResult>(`/api/outfit-plans/${id}`, {
    method: "PUT",
    body: JSON.stringify(input)
  });
}

export async function deleteOutfitPlan(id: number): Promise<OutfitPlanEntry> {
  return request<OutfitPlanEntry>(`/api/outfit-plans/${id}`, { method: "DELETE" });
}

export async function markOutfitPlanWorn(id: number, input: MarkWornInput): Promise<MarkWornResult> {
  return request<MarkWornResult>(`/api/outfit-plans/${id}/mark-worn`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function getRecommendationRuns(): Promise<RecommendationRunEntry[]> {
  return request<RecommendationRunEntry[]>("/api/recommendation-runs", {
    method: "GET"
  });
}

export async function getInsights(): Promise<WardrobeInsights> {
  return request<WardrobeInsights>("/api/insights", {
    method: "GET"
  });
}

export async function exportLocalData(): Promise<OutfitExport> {
  return request<OutfitExport>("/api/export", {
    method: "GET"
  });
}

export async function previewCompleteBackup(): Promise<CompleteBackupPreview> {
  return request<CompleteBackupPreview>("/api/export?format=zip&preview=1", {
    method: "GET"
  });
}

export async function downloadCompleteBackup(): Promise<DownloadedBackup> {
  const response = await fetch("/api/export?format=zip", {
    method: "GET",
    credentials: "same-origin"
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throwApiResponseError(response, data);
  }
  const disposition = response.headers.get("content-disposition") || "";
  const serverName = /filename="([^"]+)"/.exec(disposition)?.[1];
  const fileName = serverName && /^outfit-complete-backup-\d{4}-\d{2}-\d{2}\.zip$/.test(serverName)
    ? serverName
    : `outfit-complete-backup-${new Date().toISOString().slice(0, 10)}.zip`;
  return { blob: await response.blob(), fileName };
}

function recommendationFeedbackClearQuery(scope: RecommendationFeedbackClearScope): string {
  const query = new URLSearchParams({ scope: scope.scope });
  if (scope.scope === "candidate") {
    query.set("candidateId", scope.candidateId);
  } else if (scope.scope === "date-range") {
    query.set("from", scope.from);
    query.set("to", scope.to);
  }
  return query.toString();
}

function plannerRangeQuery(query: PlannerRangeQuery): string {
  const params = new URLSearchParams({ timeZone: query.timeZone });
  if (query.from !== undefined) params.set("from", query.from);
  if (query.to !== undefined) params.set("to", query.to);
  if (query.cursor !== undefined) params.set("cursor", query.cursor);
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  return params.toString();
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      ...(init.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throwApiResponseError(response, data);
  }
  return data as T;
}

function throwApiResponseError(response: Response, data: unknown): never {
  const payload = data && typeof data === "object" ? data as {
    error?: string | { message?: unknown; code?: unknown; details?: unknown };
  } : {};
  const errorPayload = payload.error;
  const message = typeof errorPayload === "string"
    ? errorPayload
    : typeof errorPayload?.message === "string"
      ? errorPayload.message
      : "请求失败";
  const code = typeof errorPayload === "object" && typeof errorPayload?.code === "string"
    ? errorPayload.code
    : undefined;
  const details = typeof errorPayload === "object" ? errorPayload?.details : undefined;
  if (response.status === 401 && code === "UNAUTHENTICATED" && typeof window !== "undefined") {
    window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
  }
  throw new ApiClientError(message, { status: response.status, code, details });
}
