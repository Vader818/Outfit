import type { Formality, GarmentCategory, GarmentWarmth, Season, UserPreferenceProfile, WeatherSnapshot } from "../src/shared/types";
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
export const TEMPERATURE_SENSITIVITIES = ["runs-cold", "neutral", "runs-hot"] as const;

const COLOR_PATTERN = /^[a-z][a-z-]{1,30}$/i;

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
  copyOptionalString(record, update, "notes");

  if ("category" in record) update.category = enumValue(record.category, GARMENT_CATEGORIES, "category");
  if ("warmth" in record) update.warmth = enumValue(record.warmth, GARMENT_WARMTHS, "warmth");
  if ("formality" in record) update.formality = enumValue(record.formality, FORMALITIES, "formality");
  if ("seasons" in record) update.seasons = enumArray(record.seasons, SEASONS, "seasons");
  if ("styles" in record) update.styles = stringArray(record.styles, "styles");
  if ("owned" in record) update.owned = booleanValue(record.owned, "owned");
  if ("confirmed" in record) update.confirmed = booleanValue(record.confirmed, "confirmed");
  if ("excluded" in record) update.excluded = booleanValue(record.excluded, "excluded");

  return update;
}

export function validateCaptureJobRequest(value: unknown): {
  mode: "orders" | "item-detail";
  maxPages?: number;
  loginWait?: number;
  url?: string;
} {
  const record = assertRecord(value, "采集任务请求必须是 JSON 对象");
  const mode = enumValue(record.mode, CAPTURE_MODES, "mode");
  const result: ReturnType<typeof validateCaptureJobRequest> = { mode };
  if ("maxPages" in record) result.maxPages = boundedInteger(record.maxPages, "maxPages", 1, 20);
  if ("loginWait" in record) result.loginWait = boundedInteger(record.loginWait, "loginWait", 1, 600);
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
  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new ValidationError("latitude 和 longitude 必须是数字");
  }
  return { latitude, longitude };
}

export function validateRecommendationRequest(value: unknown): {
  weather: WeatherSnapshot;
  occasion: Formality;
  recentlyWornGarmentIds: number[];
  userProfile?: UserPreferenceProfile;
} {
  const record = assertRecord(value, "推荐请求必须是 JSON 对象");
  const weather = validateWeather(record.weather);
  const occasion = "occasion" in record ? enumValue(record.occasion, FORMALITIES, "occasion") : "casual";
  return {
    weather,
    occasion,
    recentlyWornGarmentIds: normalizeGarmentIds(record.recentlyWornGarmentIds),
    userProfile: validateUserProfile(record.userProfile)
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

function validateUserProfile(value: unknown): UserPreferenceProfile | undefined {
  if (value == null) return undefined;
  const record = assertRecord(value, "userProfile 必须是 JSON 对象");
  return {
    temperatureSensitivity: "temperatureSensitivity" in record
      ? enumValue(record.temperatureSensitivity, TEMPERATURE_SENSITIVITIES, "temperatureSensitivity")
      : undefined,
    preferredColors: "preferredColors" in record ? stringArray(record.preferredColors, "preferredColors") : undefined,
    avoidedColors: "avoidedColors" in record ? stringArray(record.avoidedColors, "avoidedColors") : undefined,
    preferredStyles: "preferredStyles" in record ? stringArray(record.preferredStyles, "preferredStyles") : undefined
  };
}

function copyOptionalString<T extends Record<string, unknown>, K extends keyof GarmentUpdate>(
  source: T,
  target: GarmentUpdate,
  key: K,
  check?: (value: string) => void
): void {
  if (!(key in source)) return;
  const value = stringValue(source[key], String(key));
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
  return Array.from(new Set(value.map((item) => stringValue(item, name).trim()).filter(Boolean)));
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
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new ValidationError(`${name} 必须是 ${min}-${max} 之间的整数`);
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
