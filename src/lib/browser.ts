import type { Garment, OutfitExport, OutfitRecommendation, RecommendationResult, WeatherSnapshot } from "../shared/types";

export const BACKUP_EXPORT_CONFIRMATION =
  "备份包含个人画像、淘宝来源与价格、穿着记录和推荐历史等敏感本地数据。确定要生成 JSON 备份吗？";
export const REMOTE_TAOBAO_IMAGES_SESSION_KEY = "outfit.remoteTaobaoImages.enabled";

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

export function readSessionStorageValue(key: string, fallback: string): string {
  try {
    return globalThis.sessionStorage?.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeSessionStorageValue(key: string, value: string): boolean {
  try {
    globalThis.sessionStorage?.setItem(key, value);
    return true;
  } catch {
    return false;
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

export function downloadJson(data: OutfitExport): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `outfit-backup-${data.exportedAt.slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function exportBackupWithConfirmation(
  confirmExport: (message: string) => boolean,
  loadExport: () => Promise<OutfitExport>,
  download: (data: OutfitExport) => void
): Promise<boolean> {
  if (!confirmExport(BACKUP_EXPORT_CONFIRMATION)) return false;
  download(await loadExport());
  return true;
}

export function buildRecommendationWearLogInput(
  outfit: OutfitRecommendation,
  occasion: string,
  weather: WeatherSnapshot | null
) {
  return {
    garmentIds: outfit.items.map((item) => item.id),
    context: { outfitId: outfit.id, occasion, weather }
  };
}

export function confirmGarmentDelete(item: Garment, displayName: string, onDelete: (id: number) => void) {
  if (globalThis.confirm(`确定删除「${displayName || item.name}」吗？此操作会从本地衣橱数据库移除这件衣服。`)) {
    onDelete(item.id);
  }
}
