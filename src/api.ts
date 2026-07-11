import type { AuthStatus, CaptureArtifact, CaptureEngine, CaptureJob, CaptureJobMode, Garment, GarmentThumbnailCandidatesResponse, ManualGarmentCreate, OutfitExport, PersonalProfile, RecommendationResult, RecommendationRunEntry, TaobaoImportCommitRequest, TaobaoImportCommitResult, TaobaoImportPreview, TaobaoWardrobeFilterSummary, ThumbnailRefreshResult, VisionModelId, VisionModelJob, VisionModelsResponse, VisionTagSuggestion, WardrobeInsights, WearLogEntry, WeatherSnapshot } from "./shared/types";

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

export async function importTaobaoBatch(payload: unknown): Promise<ImportSummary> {
  return request<ImportSummary>("/api/import/taobao-batch", {
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

export async function updateGarment(id: number, update: Partial<Garment>): Promise<Garment> {
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

export async function getRecommendations(input: {
  weather: WeatherSnapshot;
  occasion: string;
  recentlyWornGarmentIds?: number[];
  userProfile?: PersonalProfile;
}): Promise<RecommendationResult> {
  return request<RecommendationResult>("/api/recommendations", {
    method: "POST",
    body: JSON.stringify(input)
  });
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
