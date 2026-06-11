import type { Garment, RecommendationResult, WeatherSnapshot } from "./shared/types";

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

export async function importTaobaoBatch(payload: unknown): Promise<ImportSummary> {
  return request<ImportSummary>("/api/import/taobao-batch", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function getGarments(): Promise<Garment[]> {
  return request<Garment[]>("/api/garments");
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
}): Promise<RecommendationResult> {
  return request<RecommendationResult>("/api/recommendations", {
    method: "POST",
    body: JSON.stringify(input)
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
    throw new Error(data.error || "请求失败");
  }
  return data as T;
}
