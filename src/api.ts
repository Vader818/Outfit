import type { CaptureArtifact, CaptureJob, CaptureJobMode, Garment, OutfitExport, PersonalProfile, RecommendationResult, RecommendationRunEntry, TaobaoImportPreview, TaobaoWardrobeFilterSummary, WardrobeInsights, WearLogEntry, WeatherSnapshot } from "./shared/types";

export interface CaptureStartResult {
  started: true;
  mode: "orders" | "item-detail";
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

export async function getGarments(): Promise<Garment[]> {
  return request<Garment[]>("/api/garments");
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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data.error === "string"
      ? data.error
      : data.error?.message || "请求失败";
    throw new Error(message);
  }
  return data as T;
}
