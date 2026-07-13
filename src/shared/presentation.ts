import type {
  CaptureJob,
  FeedbackReason,
  Garment,
  GarmentAvailabilityStatus,
  PersonalProfile,
  VisionModelStatus,
  WardrobeInsights,
  WardrobeSuggestion
} from "./types";

export type AppTab = "import" | "wardrobe" | "recommend" | "history" | "settings";
export type AuthInput = { username: string; password: string };
export type WearLogFeedback = { outfitId: string; message: string };
export type SelectOption = { value: string; label: string };
export type BusyAction =
  | "import"
  | "preview-import"
  | "capture-orders"
  | "capture-item"
  | "read-capture"
  | "refresh-thumbnails"
  | "bulk-confirm"
  | "bulk-update"
  | "bulk-availability"
  | "download-vision-model"
  | "verify-vision-model"
  | "locate"
  | "save-settings"
  | "history"
  | "export"
  | "export-complete"
  | "weather"
  | "cutout-garment"
  | "vision-tags"
  | "recommend";

export type WardrobeStatusFilter = "all" | "pending" | "confirmed" | "excluded";
export type WardrobeOwnedFilter = "all" | "owned" | "not-owned";
export type WardrobeFilters = {
  status: WardrobeStatusFilter;
  category: "all" | Garment["category"];
  color: string;
  season: "all" | Garment["seasons"][number];
  owned: WardrobeOwnedFilter;
  query: string;
};

export const CATEGORY_LABELS: Record<Garment["category"], string> = {
  top: "上装",
  bottom: "下装",
  dress: "连衣裙",
  outerwear: "外套",
  shoes: "鞋履",
  accessory: "配饰"
};

export const WARMTH_LABELS: Record<Garment["warmth"], string> = {
  light: "轻薄",
  medium: "常规",
  warm: "保暖",
  heavy: "厚重"
};

export const SEASON_LABELS: Record<Garment["seasons"][number], string> = {
  spring: "春",
  summer: "夏",
  autumn: "秋",
  winter: "冬"
};

export const COLOR_LABELS: Record<string, string> = {
  black: "黑色",
  white: "白色",
  gray: "灰色",
  blue: "蓝色",
  navy: "藏蓝",
  brown: "棕色",
  beige: "米色",
  red: "红色",
  pink: "粉色",
  green: "绿色",
  yellow: "黄色",
  purple: "紫色",
  unknown: "未知"
};

export const GARMENT_AVAILABILITY_LABELS: Record<GarmentAvailabilityStatus, string> = {
  available: "可用",
  laundry: "待洗",
  repair: "维修中",
  loaned: "借出",
  packed: "已装箱"
};

export const FEEDBACK_REASON_LABELS: Record<FeedbackReason, string> = {
  "too-warm": "太热",
  "too-cold": "太冷",
  "too-formal": "太正式",
  "too-casual": "太休闲",
  color: "颜色",
  fit: "版型",
  repeat: "近期重复",
  unavailable: "衣物不可用",
  other: "其他"
};

export const OCCASIONS = ["casual", "smart-casual", "formal", "sport"] as const;
export const OCCASION_LABELS: Record<(typeof OCCASIONS)[number], string> = {
  casual: "休闲",
  "smart-casual": "商务休闲",
  formal: "正装",
  sport: "运动"
};

export const PLANNER_OCCASIONS = [...OCCASIONS, "date", "dinner"] as const;
export const PLANNER_OCCASION_LABELS: Record<(typeof PLANNER_OCCASIONS)[number], string> = {
  ...OCCASION_LABELS,
  date: "约会",
  dinner: "晚餐"
};

export const BODY_TYPE_LABELS: Record<NonNullable<PersonalProfile["bodyType"]>, string> = {
  "slim-tall": "瘦高",
  average: "标准",
  athletic: "运动型",
  stocky: "壮实"
};

export const SKIN_TONE_LABELS: Record<NonNullable<PersonalProfile["skinTone"]>, string> = {
  "dark-yellow": "较黑黄",
  "medium-yellow": "中性偏黄",
  fair: "偏白",
  deep: "深色"
};

export const COLOR_DISPOSITION_LABELS: Record<NonNullable<PersonalProfile["colorDisposition"]>, string> = {
  "cool-clean": "清爽冷感",
  neutral: "中性",
  "warm-soft": "柔和暖感"
};

export const TEMPERATURE_LABELS: Record<NonNullable<PersonalProfile["temperatureSensitivity"]>, string> = {
  "runs-cold": "怕冷",
  neutral: "正常",
  "runs-hot": "怕热"
};

export const HEALTH_LEVEL_LABELS: Record<WardrobeInsights["health"]["level"], string> = {
  good: "健康",
  fair: "可优化",
  "needs-attention": "需关注"
};

export const SUGGESTION_PRIORITY_LABELS: Record<WardrobeSuggestion["priority"], string> = {
  high: "优先",
  medium: "建议",
  low: "可选"
};

export const TAOBAO_BOUGHT_ITEMS_URL = "https://buyertrade.taobao.com/trade/itemlist/list_bought_items.htm";
export const DEFAULT_LATITUDE = "";
export const DEFAULT_LONGITUDE = "";

export const DEFAULT_PROFILE: PersonalProfile = {};

export const DEFAULT_WARDROBE_FILTERS: WardrobeFilters = {
  status: "all",
  category: "all",
  color: "all",
  season: "all",
  owned: "all",
  query: ""
};

export function toOptions<T extends string>(labels: Record<T, string>): SelectOption[] {
  return Object.entries(labels).map(([value, label]) => ({ value, label: label as string }));
}

export const CATEGORY_OPTIONS = toOptions(CATEGORY_LABELS);
export const WARMTH_OPTIONS = toOptions(WARMTH_LABELS);
export const COLOR_OPTIONS = Object.entries(COLOR_LABELS).map(([value, label]) => ({ value, label }));
export const SEASON_OPTIONS = toOptions(SEASON_LABELS);
export const GARMENT_AVAILABILITY_OPTIONS = toOptions(GARMENT_AVAILABILITY_LABELS);
export const FEEDBACK_REASON_OPTIONS = toOptions(FEEDBACK_REASON_LABELS);
const UNSET_OPTION: SelectOption = { value: "", label: "未设置" };
export const BODY_TYPE_OPTIONS = [UNSET_OPTION, ...toOptions(BODY_TYPE_LABELS)];
export const SKIN_TONE_OPTIONS = [UNSET_OPTION, ...toOptions(SKIN_TONE_LABELS)];
export const COLOR_DISPOSITION_OPTIONS = [UNSET_OPTION, ...toOptions(COLOR_DISPOSITION_LABELS)];
export const TEMPERATURE_OPTIONS = [UNSET_OPTION, ...toOptions(TEMPERATURE_LABELS)];
export const STATUS_FILTER_OPTIONS: SelectOption[] = [
  { value: "all", label: "全部状态" },
  { value: "pending", label: "待确认" },
  { value: "confirmed", label: "已确认" },
  { value: "excluded", label: "已排除" }
];
export const OWNED_FILTER_OPTIONS: SelectOption[] = [
  { value: "all", label: "全部拥有" },
  { value: "owned", label: "拥有" },
  { value: "not-owned", label: "不在衣橱" }
];
export const CATEGORY_FILTER_OPTIONS: SelectOption[] = [{ value: "all", label: "全部类别" }, ...CATEGORY_OPTIONS];
export const SEASON_FILTER_OPTIONS: SelectOption[] = [{ value: "all", label: "全部季节" }, ...SEASON_OPTIONS];

export function withCurrentOption(options: SelectOption[], value: string): SelectOption[] {
  if (options.some((option) => option.value === value)) return options;
  return [{ value, label: COLOR_LABELS[value] || value || COLOR_LABELS.unknown }, ...options];
}

export function buildColorFilterOptions(garments: Garment[]): SelectOption[] {
  const colors = Array.from(new Set(garments.map((item) => item.color || "unknown"))).sort();
  return [
    { value: "all", label: "全部颜色" },
    ...colors.map((color) => ({ value: color, label: COLOR_LABELS[color] || color }))
  ];
}

export function parseList(value: string): string[] {
  return Array.from(new Set(value.split(/[,，]/).map((item) => item.trim()).filter(Boolean)));
}

export function formatList(value: string[] | undefined): string {
  return (value ?? []).join(",");
}

export function formatColorList(value: string[] | undefined): string {
  return (value ?? []).map((color) => COLOR_LABELS[color] || color).join(",");
}

export function parseColorList(value: string): string[] {
  const reverse = Object.fromEntries(Object.entries(COLOR_LABELS).map(([key, label]) => [label, key]));
  return parseList(value).map((color) => reverse[color] || color);
}

export function numberOrUndefined(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseLocationCoordinates(
  latitudeValue: string,
  longitudeValue: string
): { latitude: number; longitude: number } | null {
  if (!latitudeValue.trim() || !longitudeValue.trim()) return null;
  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }
  return { latitude, longitude };
}

export function labelDistribution<T extends string>(
  data: Partial<Record<T, number>> | Record<string, number>,
  labels: Record<string, string>
): Record<string, number> {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [labels[key] || key, Number(value ?? 0)]));
}

export function styleLabel(value: string): string {
  return PLANNER_OCCASION_LABELS[value as keyof typeof PLANNER_OCCASION_LABELS] || value;
}

export function labelStyleDistribution(data: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [styleLabel(key), Number(value ?? 0)]));
}

export function thumbnailSourceLabel(source: "current" | "order" | "detail" | "capture"): string {
  if (source === "current") return "当前图";
  if (source === "order") return "订单图";
  if (source === "detail") return "详情图";
  return "采集图";
}

export function captureStatusLabel(status: CaptureJob["status"]): string {
  return {
    pending: "等待中",
    running: "运行中",
    succeeded: "已完成",
    failed: "失败",
    cancelled: "已取消"
  }[status];
}

export function visionModelDisplay(model: VisionModelStatus): {
  label: string;
  message: string;
  tone: "idle" | "running" | "ready" | "failed";
} {
  if (model.job?.status === "running") {
    return { label: model.job.action === "verify" ? "验证中" : "下载中", message: model.job.message, tone: "running" };
  }
  if (model.job?.status === "failed") return { label: "失败", message: model.job.message, tone: "failed" };
  if (model.installed) {
    return {
      label: "已可用",
      message: model.job?.status === "succeeded" ? model.job.message : model.message,
      tone: "ready"
    };
  }
  return { label: "未下载", message: model.message, tone: "idle" };
}

export function formatLocalDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function formatDateTimeInTimeZone(value: string, timeZone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short"
    }).format(date);
  } catch {
    return formatLocalDateTime(value);
  }
}
