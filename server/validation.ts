import type { BodyType, CaptureEngine, ColorDisposition, Formality, GarmentCategory, GarmentWarmth, ManualGarmentCreate, PersonalProfile, Season, SkinTone, WeatherSnapshot } from "../src/shared/types";
import type { GarmentUpdate } from "./db";

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: unknown) {
    super("VALIDATION_ERROR", message, 400, details);
    this.name = "ValidationError";
  }
}

export const GARMENT_CATEGORIES = ["top", "bottom", "dress", "outerwear", "shoes", "accessory"] as const satisfies readonly GarmentCategory[];
export const GARMENT_WARMTHS = ["light", "medium", "warm", "heavy"] as const satisfies readonly GarmentWarmth[];
export const SEASONS = ["spring", "summer", "autumn", "winter"] as const satisfies readonly Season[];
export const FORMALITIES = ["casual", "smart-casual", "formal", "sport"] as const satisfies readonly Formality[];
export const CAPTURE_MODES = ["orders", "item-detail"] as const;
export const CAPTURE_ENGINES = ["selenium", "playwright"] as const satisfies readonly CaptureEngine[];
export const TEMPERATURE_SENSITIVITIES = ["runs-cold", "neutral", "runs-hot"] as const;
export const BODY_TYPES = ["slim-tall", "average", "athletic", "stocky"] as const satisfies readonly BodyType[];
export const SKIN_TONES = ["dark-yellow", "medium-yellow", "fair", "deep"] as const satisfies readonly SkinTone[];
export const COLOR_DISPOSITIONS = ["cool-clean", "neutral", "warm-soft"] as const satisfies readonly ColorDisposition[];

const COLOR_PATTERN = /^[a-z][a-z-]{1,30}$/i;
const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,32}$/;
const STRING_ARRAY_MAX_ITEMS = 32;
const STRING_ARRAY_MAX_ITEM_LENGTH = 64;
const GARMENT_STRING_LIMITS: Partial<Record<keyof GarmentUpdate, number>> = {
  brand: 120,
  name: 120,
  rawName: 180,
  color: 120,
  imageUrl: 2048,
  size: 120,
  notes: 1000
};
const MANUAL_GARMENT_FIELDS = new Set([
  "name",
  "category",
  "color",
  "warmth",
  "seasons",
  "styles",
  "formality",
  "brand",
  "size",
  "materials",
  "patterns",
  "tags",
  "notes"
]);

export function assertRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError(message);
  }
  return value as Record<string, unknown>;
}

export function validateGarmentUpdate(value: unknown): GarmentUpdate {
  const record = assertRecord(value, "衣物更新内容必须是 JSON 对象");
  const update: GarmentUpdate = {};

  copyOptionalString(record, update, "brand");
  copyOptionalString(record, update, "name");
  copyOptionalString(record, update, "rawName");
  copyOptionalString(record, update, "color", (color) => {
    if (color !== "unknown" && !COLOR_PATTERN.test(color)) {
      throw new ValidationError("color 必须是已知颜色标识");
    }
  });
  copyOptionalString(record, update, "imageUrl");
  copyOptionalString(record, update, "size");
  copyOptionalString(record, update, "notes");

  if ("category" in record) update.category = enumValue(record.category, GARMENT_CATEGORIES, "category");
  if ("warmth" in record) update.warmth = enumValue(record.warmth, GARMENT_WARMTHS, "warmth");
  if ("formality" in record) update.formality = enumValue(record.formality, FORMALITIES, "formality");
  if ("seasons" in record) update.seasons = enumArray(record.seasons, SEASONS, "seasons");
  if ("styles" in record) update.styles = stringArray(record.styles, "styles");
  if ("materials" in record) update.materials = stringArray(record.materials, "materials");
  if ("patterns" in record) update.patterns = stringArray(record.patterns, "patterns");
  if ("tags" in record) update.tags = stringArray(record.tags, "tags");
  if ("owned" in record) update.owned = booleanValue(record.owned, "owned");
  if ("confirmed" in record) update.confirmed = booleanValue(record.confirmed, "confirmed");
  if ("excluded" in record) update.excluded = booleanValue(record.excluded, "excluded");

  return update;
}

export function validateManualGarmentCreate(value: unknown): ManualGarmentCreate {
  const record = assertRecord(value, "手工衣物必须是 JSON 对象");
  for (const key of Object.keys(record)) {
    if (!MANUAL_GARMENT_FIELDS.has(key)) {
      throw new ValidationError(`手工衣物不允许字段 ${key}`);
    }
  }
  const update = validateGarmentUpdate(record);
  const name = update.name?.trim();
  if (!name) throw new ValidationError("name 不能为空");
  if (!update.category) throw new ValidationError("category 为必填字段");
  if (!update.color) throw new ValidationError("color 为必填字段");
  if (!update.warmth) throw new ValidationError("warmth 为必填字段");
  if (!update.seasons) throw new ValidationError("seasons 为必填字段");
  if (!update.styles) throw new ValidationError("styles 为必填字段");
  if (!update.formality) throw new ValidationError("formality 为必填字段");

  const input: ManualGarmentCreate = {
    name,
    category: update.category as GarmentCategory,
    color: update.color,
    warmth: update.warmth as GarmentWarmth,
    seasons: update.seasons as Season[],
    styles: update.styles,
    formality: update.formality as Formality
  };
  for (const key of ["brand", "size", "notes"] as const) {
    if (update[key] !== undefined) input[key] = update[key];
  }
  for (const key of ["materials", "patterns", "tags"] as const) {
    if (update[key] !== undefined) input[key] = update[key];
  }
  return input;
}

export function validatePersonalProfile(value: unknown): PersonalProfile {
  const record = assertRecord(value, "个人画像必须是 JSON 对象");
  const profile: PersonalProfile = {};
  if ("heightCm" in record) profile.heightCm = boundedNumber(record.heightCm, "heightCm", 120, 230);
  if ("weightKg" in record) profile.weightKg = boundedNumber(record.weightKg, "weightKg", 30, 200);
  if ("bodyType" in record) profile.bodyType = enumValue(record.bodyType, BODY_TYPES, "bodyType");
  if ("skinTone" in record) profile.skinTone = enumValue(record.skinTone, SKIN_TONES, "skinTone");
  if ("colorDisposition" in record) profile.colorDisposition = enumValue(record.colorDisposition, COLOR_DISPOSITIONS, "colorDisposition");
  if ("temperatureSensitivity" in record) {
    profile.temperatureSensitivity = enumValue(record.temperatureSensitivity, TEMPERATURE_SENSITIVITIES, "temperatureSensitivity");
  }
  if ("preferredColors" in record) profile.preferredColors = stringArray(record.preferredColors, "preferredColors");
  if ("avoidedColors" in record) profile.avoidedColors = stringArray(record.avoidedColors, "avoidedColors");
  if ("preferredStyles" in record) profile.preferredStyles = stringArray(record.preferredStyles, "preferredStyles");
  return profile;
}

export function validateAuthCredentials(value: unknown): { username: string; password: string } {
  const record = assertRecord(value, "账号请求必须是 JSON 对象");
  const username = stringValue(record.username, "username").trim();
  if (!USERNAME_PATTERN.test(username)) {
    throw new ValidationError("用户名必须是 3-32 位字母、数字或下划线");
  }
  const password = stringValue(record.password, "password");
  if (password.length < 8 || password.length > 128) {
    throw new ValidationError("密码必须是 8-128 个字符");
  }
  return { username, password };
}

export function validateCaptureJobRequest(value: unknown): {
  mode: "orders" | "item-detail";
  maxPages?: number;
  loginWait?: number;
  url?: string;
  engine?: CaptureEngine;
} {
  const record = assertRecord(value, "采集任务请求必须是 JSON 对象");
  const mode = enumValue(record.mode, CAPTURE_MODES, "mode");
  const result: ReturnType<typeof validateCaptureJobRequest> = { mode };
  if ("maxPages" in record) result.maxPages = boundedInteger(record.maxPages, "maxPages", 1, 20);
  if ("loginWait" in record) result.loginWait = boundedInteger(record.loginWait, "loginWait", 1, 600);
  if ("engine" in record) {
    if (mode !== "item-detail") {
      throw new ValidationError("engine 仅支持商品详情采集，订单采集始终使用 Selenium");
    }
    result.engine = enumValue(record.engine, CAPTURE_ENGINES, "engine");
  }
  if (mode === "item-detail") {
    const url = stringValue(record.url, "url").trim();
    if (!isTaobaoItemUrl(url)) {
      throw new ValidationError("请输入有效的淘宝或天猫商品链接");
    }
    result.url = url;
  }
  return result;
}

export function validateWeatherQuery(latitudeValue: unknown, longitudeValue: unknown): { latitude: number; longitude: number } {
  const latitude = boundedNumber(latitudeValue, "latitude", -90, 90);
  const longitude = boundedNumber(longitudeValue, "longitude", -180, 180);
  return { latitude, longitude };
}

export function validatePositiveIntegerParam(value: unknown, name = "id"): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ValidationError(`${name} 必须是正整数`);
  }
  return parsed;
}

export function validateRecommendationRequest(value: unknown): {
  weather: WeatherSnapshot;
  occasion: Formality;
  recentlyWornGarmentIds: number[];
  userProfile?: PersonalProfile;
} {
  const record = assertRecord(value, "推荐请求必须是 JSON 对象");
  const weather = validateWeather(record.weather);
  const occasion = "occasion" in record ? enumValue(record.occasion, FORMALITIES, "occasion") : "casual";
  return {
    weather,
    occasion,
    recentlyWornGarmentIds: normalizeGarmentIds(record.recentlyWornGarmentIds),
    userProfile: validateRecommendationProfile(record.userProfile)
  };
}

export function validateWearLogRequest(value: unknown): { garmentIds: number[]; context: unknown } {
  const record = assertRecord(value, "穿着记录必须是 JSON 对象");
  const garmentIds = normalizeGarmentIds(record.garmentIds);
  if (!garmentIds.length) {
    throw new ValidationError("garmentIds 必须是非空数字数组");
  }
  return {
    garmentIds,
    context: record.context ?? null
  };
}

export function validateThumbnailSelectionRequest(value: unknown): { imageUrl: string } {
  const record = assertRecord(value, "缩略图选择请求必须是 JSON 对象");
  if (typeof record.imageUrl !== "string") {
    throw new ValidationError("imageUrl 必须是字符串");
  }
  const imageUrl = record.imageUrl.trim();
  if (!imageUrl) {
    throw new ValidationError("imageUrl 不能为空");
  }
  if (imageUrl.length > 2048) {
    throw new ValidationError("imageUrl 不能超过 2048 个字符");
  }
  return { imageUrl };
}

export function normalizeGarmentIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((id): id is number => Number.isInteger(id) && id > 0)));
}

function validateWeather(value: unknown): WeatherSnapshot {
  const record = assertRecord(value, "weather 必须是天气对象");
  return {
    date: stringValue(record.date, "weather.date"),
    temperature: numberValue(record.temperature, "weather.temperature"),
    apparentTemperature: numberValue(record.apparentTemperature, "weather.apparentTemperature"),
    precipitationProbability: numberValue(record.precipitationProbability, "weather.precipitationProbability"),
    windSpeed: numberValue(record.windSpeed, "weather.windSpeed"),
    weatherCode: numberValue(record.weatherCode, "weather.weatherCode"),
    summary: stringValue(record.summary, "weather.summary")
  };
}

function validateRecommendationProfile(value: unknown): PersonalProfile | undefined {
  if (value == null) return undefined;
  return validatePersonalProfile(value);
}

function copyOptionalString<T extends Record<string, unknown>, K extends keyof GarmentUpdate>(
  source: T,
  target: GarmentUpdate,
  key: K,
  check?: (value: string) => void
): void {
  if (!(key in source)) return;
  const value = stringValue(source[key], String(key));
  const maxLength = GARMENT_STRING_LIMITS[key];
  if (maxLength !== undefined && value.length > maxLength) {
    throw new ValidationError(`${String(key)} 不能超过 ${maxLength} 个字符`);
  }
  check?.(value);
  target[key] = value as never;
}

function enumValue<T extends readonly string[]>(value: unknown, allowed: T, name: string): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new ValidationError(`${name} 必须是以下值之一：${allowed.join(", ")}`);
  }
  return value as T[number];
}

function enumArray<T extends readonly string[]>(value: unknown, allowed: T, name: string): T[number][] {
  if (!Array.isArray(value)) {
    throw new ValidationError(`${name} 必须是数组`);
  }
  return value.map((item) => enumValue(item, allowed, name));
}

function stringArray(value: unknown, name: string): string[] {
  if (!Array.isArray(value)) {
    throw new ValidationError(`${name} 必须是字符串数组`);
  }
  if (value.length > STRING_ARRAY_MAX_ITEMS) {
    throw new ValidationError(`${name} 最多包含 ${STRING_ARRAY_MAX_ITEMS} 项`);
  }
  return Array.from(new Set(value.map((item) => {
    const text = stringValue(item, name).trim();
    if (text.length > STRING_ARRAY_MAX_ITEM_LENGTH) {
      throw new ValidationError(`${name} 单项不能超过 ${STRING_ARRAY_MAX_ITEM_LENGTH} 个字符`);
    }
    return text;
  }).filter(Boolean)));
}

function stringValue(value: unknown, name: string): string {
  if (typeof value !== "string") {
    throw new ValidationError(`${name} 必须是字符串`);
  }
  return value;
}

function numberValue(value: unknown, name: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new ValidationError(`${name} 必须是数字`);
  }
  return parsed;
}

function booleanValue(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") {
    throw new ValidationError(`${name} 必须是布尔值`);
  }
  return value;
}

function boundedInteger(value: unknown, name: string, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new ValidationError(`${name} 必须是 ${min}-${max} 之间的整数`);
  }
  return parsed;
}

function boundedNumber(value: unknown, name: string, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new ValidationError(`${name} 必须是 ${min}-${max} 之间的数字`);
  }
  return parsed;
}

function isTaobaoItemUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      /(^|\.)((item\.taobao\.com)|(detail\.tmall\.com)|(item\.tmall\.com))$/i.test(url.hostname)
    );
  } catch {
    return false;
  }
}
