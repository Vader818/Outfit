import type { Garment, OutfitExport, OutfitRecommendation, RecommendationResult, WeatherSnapshot } from "../shared/types";

export const BACKUP_EXPORT_CONFIRMATION =
  "备份包含个人画像、淘宝来源与价格、穿着记录和推荐历史等敏感本地数据。确定要生成 JSON 备份吗？";
export const COMPLETE_BACKUP_SENSITIVE_NOTICE =
  "完整备份包含个人画像、淘宝来源与价格、穿着记录、推荐历史和本地衣物图片（包括已失活资产）。文件只保存到你选择的下载位置；生成过程不会删除任何源文件。";
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

export interface CompleteBackupPreviewLike {
  assetCount: number;
  includedAssetCount: number;
  estimatedBytes: number;
  warnings: Array<{ assetId: number }>;
}

export interface DownloadableBackup {
  blob: Blob;
  fileName: string;
}

export async function exportCompleteBackupWithConfirmation(
  confirmExport: (message: string) => boolean,
  loadPreview: () => Promise<CompleteBackupPreviewLike>,
  loadArchive: () => Promise<DownloadableBackup>,
  download: (backup: DownloadableBackup) => void
): Promise<boolean> {
  const preview = await loadPreview();
  const warningMessage = preview.warnings.length
    ? `其中 ${preview.warnings.length} 项资产无法加入，将在 manifest 中记录警告。`
    : "所有资产均可加入。";
  const confirmation = [
    COMPLETE_BACKUP_SENSITIVE_NOTICE,
    `将尝试包含 ${preview.includedAssetCount}/${preview.assetCount} 项本地资产，预计大小 ${formatByteSize(preview.estimatedBytes)}。`,
    warningMessage,
    "确定开始生成 ZIP 完整备份吗？"
  ].join("\n\n");
  if (!confirmExport(confirmation)) return false;
  download(await loadArchive());
  return true;
}

export function downloadBlob(backup: DownloadableBackup): void {
  const url = URL.createObjectURL(backup.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = backup.fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function formatByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
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
  if (globalThis.confirm(`确定归档「${displayName || item.name}」吗？归档后可恢复，不会删除来源记录或本地图片。`)) {
    onDelete(item.id);
  }
}
