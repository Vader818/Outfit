import type { Garment, VisionTagSuggestion } from "../shared/types";
import type { WardrobeFilters } from "../shared/presentation";

export type GarmentWithMeta = Garment & { brand?: string | null; rawName?: string | null };

export function garmentMeta(item: Garment): GarmentWithMeta {
  return item as GarmentWithMeta;
}

export function displayGarmentName(item: Garment): string {
  const meta = garmentMeta(item);
  return [meta.brand, item.name].filter(Boolean).join(" ");
}

export function displayThumbnailUrl(value: string, allowRemoteTaobaoImages = false): string {
  const cleaned = value.trim();
  if (isLocalGarmentImageUrl(cleaned)) return cleaned;
  if (allowRemoteTaobaoImages && isTrustedTaobaoImageUrl(cleaned)) return cleaned;
  return "";
}

export interface ResolvedGarmentImageSource {
  url: string;
  cutout: boolean;
  remote: boolean;
}

export function resolveGarmentImageSource(
  item: Garment,
  allowRemoteTaobaoImages = false
): ResolvedGarmentImageSource | null {
  if (item.cutoutImageUrl && isLocalGarmentImageUrl(item.cutoutImageUrl)) {
    return { url: item.cutoutImageUrl.trim(), cutout: true, remote: false };
  }
  if (isLocalGarmentImageUrl(item.imageUrl)) {
    return { url: item.imageUrl.trim(), cutout: false, remote: false };
  }
  if (allowRemoteTaobaoImages && isTrustedTaobaoImageUrl(item.imageUrl)) {
    return { url: item.imageUrl.trim(), cutout: false, remote: true };
  }
  return null;
}

export function isLocalGarmentImageUrl(value: string): boolean {
  const cleaned = value.trim();
  return (
    cleaned.startsWith("/api/garment-thumbnails/") ||
    cleaned.startsWith("/api/garment-assets/")
  );
}

export function isTrustedTaobaoImageUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  if (parsed.username || parsed.password) return false;
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

export function isRecommendationEligibleGarment(item: Garment): boolean {
  return item.owned && !item.archivedAt && item.confirmed && !item.excluded;
}

export function isWardrobeReviewPendingGarment(item: Garment): boolean {
  return !item.archivedAt && !item.confirmed && !item.excluded;
}

export function isRecommendationPendingGarment(item: Garment): boolean {
  return item.owned && isWardrobeReviewPendingGarment(item);
}

export function matchesWardrobeFilters(item: Garment, filters: WardrobeFilters): boolean {
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

export function applyGarmentPatch(garments: Garment[], id: number, update: Partial<Garment>): Garment[] {
  return garments.map((item) => (item.id === id ? { ...item, ...update } : item));
}

export function stringSetEquals(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const normalized = new Set(left);
  if (normalized.size !== right.length) return false;
  return right.every((value) => normalized.has(value));
}

export function isVisionSuggestionApplied(item: Garment, suggestion: VisionTagSuggestion): boolean {
  return (
    (!suggestion.category || item.category === suggestion.category) &&
    stringSetEquals(item.styles, suggestion.styles) &&
    stringSetEquals(item.patterns ?? [], suggestion.patterns) &&
    stringSetEquals(item.tags ?? [], suggestion.tags)
  );
}
