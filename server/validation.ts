import type { BodyType, CaptureEngine, ColorDisposition, FeedbackReason, FeedbackVerdict, Formality, GarmentAvailabilityStatus, GarmentCategory, GarmentWarmth, ImportDecision, ImportGarmentOverrides, ManualGarmentCreate, OutfitSlot, PersonalProfile, RecommendationConstraintField, RecommendationConstraintIssue, RecommendationFeedbackClearScope, RecommendationFeedbackInput, RecommendationRequest, SaveRecommendationCandidateInput, SavedOutfitCreateInput, SavedOutfitItemInput, SavedOutfitReplacementInput, SavedOutfitUpdateInput, Season, SkinTone, TaobaoCapturedBatch, TaobaoImportCommitRequest, WeatherSnapshot } from "../src/shared/types";
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
export const FEEDBACK_VERDICTS = ["liked", "disliked", "skipped"] as const satisfies readonly FeedbackVerdict[];
export const FEEDBACK_REASONS = [
  "too-warm",
  "too-cold",
  "too-formal",
  "too-casual",
  "color",
  "fit",
  "repeat",
  "unavailable",
  "other"
] as const satisfies readonly FeedbackReason[];
export const GARMENT_AVAILABILITY_STATUSES = [
  "available",
  "laundry",
  "repair",
  "loaned",
  "packed"
] as const satisfies readonly GarmentAvailabilityStatus[];

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
  "notes",
  "acquiredAt",
  "purchasePriceCents",
  "currency"
]);
const IMPORT_COMMIT_FIELDS = new Set(["batch", "decisions"]);
const IMPORT_DECISION_FIELDS = new Set(["sourceItemKey", "include", "overrides"]);
const IMPORT_OVERRIDE_FIELDS = new Set([
  "brand",
  "name",
  "category",
  "color",
  "warmth",
  "seasons",
  "styles",
  "formality",
  "size",
  "materials",
  "patterns",
  "tags",
  "notes"
]);
const SAVED_OUTFIT_CREATE_FIELDS = new Set(["name", "notes", "favorite", "items"]);
const SAVED_OUTFIT_UPDATE_FIELDS = new Set(["name", "notes", "favorite", "items"]);
const SAVED_OUTFIT_ITEM_FIELDS = new Set(["garmentId", "slot", "position"]);
const SAVE_RECOMMENDATION_CANDIDATE_FIELDS = new Set(["name", "notes", "favorite"]);
const SAVED_OUTFIT_REPLACEMENT_FIELDS = new Set(["targetGarmentId", "replacementGarmentId", "name"]);
const RECOMMENDATION_FEEDBACK_FIELDS = new Set([
  "candidateId",
  "verdict",
  "rating",
  "actuallyWorn",
  "reasonCodes",
  "comment",
  "woreInsteadOutfitId"
]);
const GARMENT_AVAILABILITY_FIELDS = new Set(["status"]);
const FEEDBACK_COMMENT_MAX_LENGTH = 2000;
const SAVED_OUTFIT_NAME_MAX_LENGTH = 120;
const SAVED_OUTFIT_NOTES_MAX_LENGTH = 2000;
const SAVED_OUTFIT_MAX_ITEMS = 24;
const RECOMMENDATION_CONSTRAINT_MAX_IDS = 24;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  if ("acquiredAt" in record) {
    input.acquiredAt = isoDateValue(record.acquiredAt, "acquiredAt");
  }
  if ("purchasePriceCents" in record) {
    input.purchasePriceCents = nonNegativeSafeInteger(record.purchasePriceCents, "purchasePriceCents");
  }
  if ("currency" in record) {
    input.currency = enumValue(record.currency, ["CNY"] as const, "currency");
  }
  return input;
}

export function validateTaobaoImportCommitRequest(value: unknown): TaobaoImportCommitRequest {
  const record = assertRecord(value, "导入提交必须是 JSON 对象");
  for (const key of Object.keys(record)) {
    if (!IMPORT_COMMIT_FIELDS.has(key)) {
      throw new ValidationError(`导入提交不允许字段 ${key}`);
    }
  }
  const batch = assertRecord(record.batch, "batch 必须是原始淘宝批次") as unknown as TaobaoCapturedBatch;
  if (!Array.isArray(record.decisions)) {
    throw new ValidationError("decisions 必须是数组");
  }
  if (record.decisions.length > 1000) {
    throw new ValidationError("decisions 最多包含 1000 项");
  }
  const decisions: ImportDecision[] = record.decisions.map((value, index) => {
    const decision = assertRecord(value, `decisions[${index}] 必须是 JSON 对象`);
    for (const key of Object.keys(decision)) {
      if (!IMPORT_DECISION_FIELDS.has(key)) {
        throw new ValidationError(`decisions[${index}] 不允许字段 ${key}`);
      }
    }
    const sourceItemKey = stringValue(decision.sourceItemKey, `decisions[${index}].sourceItemKey`).trim();
    if (!sourceItemKey || sourceItemKey.length > 128) {
      throw new ValidationError(`decisions[${index}].sourceItemKey 长度无效`);
    }
    const include = booleanValue(decision.include, `decisions[${index}].include`);
    let overrides: ImportGarmentOverrides | undefined;
    if ("overrides" in decision) {
      const overrideRecord = assertRecord(decision.overrides, `decisions[${index}].overrides 必须是 JSON 对象`);
      for (const key of Object.keys(overrideRecord)) {
        if (!IMPORT_OVERRIDE_FIELDS.has(key)) {
          throw new ValidationError(`decisions[${index}].overrides 不允许字段 ${key}`);
        }
      }
      if (!include && Object.keys(overrideRecord).length) {
        throw new ValidationError(`decisions[${index}] 未选择时不能包含 overrides`);
      }
      overrides = validateGarmentUpdate(overrideRecord) as ImportGarmentOverrides;
      if (overrides.name !== undefined && !overrides.name.trim()) {
        throw new ValidationError(`decisions[${index}].overrides.name 不能为空`);
      }
    }
    return {
      sourceItemKey,
      include,
      ...(overrides && Object.keys(overrides).length ? { overrides } : {})
    };
  });
  return { batch, decisions };
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

export function validateUuidParam(value: unknown, name = "id"): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new ValidationError(`${name} 必须是有效 UUID`);
  }
  return value.toLowerCase();
}

export function validateRecommendationFeedbackInput(value: unknown): RecommendationFeedbackInput {
  const record = assertRecord(value, "推荐反馈必须是 JSON 对象");
  assertOnlyFields(record, RECOMMENDATION_FEEDBACK_FIELDS, "推荐反馈");
  const candidateId = validateUuidParam(record.candidateId, "candidateId");
  if (!Array.isArray(record.reasonCodes)) {
    throw new ValidationError("reasonCodes 必须是数组");
  }
  const reasonCodes = record.reasonCodes.map((reason) =>
    enumValue(reason, FEEDBACK_REASONS, "reasonCodes")
  );
  if (new Set(reasonCodes).size !== reasonCodes.length) {
    throw new ValidationError("reasonCodes 不能包含重复值");
  }
  const input: RecommendationFeedbackInput = { candidateId, reasonCodes };
  if ("verdict" in record) {
    input.verdict = enumValue(record.verdict, FEEDBACK_VERDICTS, "verdict");
  }
  if ("rating" in record) {
    input.rating = strictBoundedInteger(record.rating, "rating", 1, 5) as 1 | 2 | 3 | 4 | 5;
  }
  if ("actuallyWorn" in record) {
    input.actuallyWorn = booleanValue(record.actuallyWorn, "actuallyWorn");
  }
  if ("comment" in record) {
    const comment = stringValue(record.comment, "comment").trim();
    if (comment.length > FEEDBACK_COMMENT_MAX_LENGTH) {
      throw new ValidationError(`comment 不能超过 ${FEEDBACK_COMMENT_MAX_LENGTH} 个字符`);
    }
    input.comment = comment;
  }
  if ("woreInsteadOutfitId" in record) {
    input.woreInsteadOutfitId = positiveSafeInteger(record.woreInsteadOutfitId, "woreInsteadOutfitId");
  }
  if (input.actuallyWorn && input.woreInsteadOutfitId !== undefined) {
    throw new ValidationError("actuallyWorn 与 woreInsteadOutfitId 不能同时提交");
  }
  const hasMeaningfulSignal = input.verdict !== undefined ||
    input.rating !== undefined ||
    input.actuallyWorn === true ||
    input.reasonCodes.length > 0 ||
    Boolean(input.comment) ||
    input.woreInsteadOutfitId !== undefined;
  if (!hasMeaningfulSignal) {
    throw new ValidationError("推荐反馈至少需要一个有效反馈字段");
  }
  return input;
}

export function validateRecommendationFeedbackClearScope(
  value: unknown
): RecommendationFeedbackClearScope {
  const record = assertRecord(value, "反馈清空范围必须是查询对象");
  const scope = enumValue(record.scope, ["all", "candidate", "date-range"] as const, "scope");
  if (scope === "all") {
    assertOnlyFields(record, new Set(["scope"]), "全部反馈清空范围");
    return { scope };
  }
  if (scope === "candidate") {
    assertOnlyFields(record, new Set(["scope", "candidateId"]), "候选反馈清空范围");
    return {
      scope,
      candidateId: validateUuidParam(record.candidateId, "candidateId")
    };
  }
  assertOnlyFields(record, new Set(["scope", "from", "to"]), "日期反馈清空范围");
  const from = isoDateValue(record.from, "from");
  const to = isoDateValue(record.to, "to");
  if (from > to) {
    throw new ValidationError("from 不能晚于 to");
  }
  return { scope, from, to };
}

export function validateGarmentAvailabilityRequest(
  value: unknown
): { status: GarmentAvailabilityStatus } {
  const record = assertRecord(value, "衣物可用状态必须是 JSON 对象");
  assertOnlyFields(record, GARMENT_AVAILABILITY_FIELDS, "衣物可用状态");
  return {
    status: enumValue(record.status, GARMENT_AVAILABILITY_STATUSES, "status")
  };
}

export function validateSavedOutfitCreate(value: unknown): SavedOutfitCreateInput {
  const record = assertRecord(value, "保存搭配内容必须是 JSON 对象");
  assertOnlyFields(record, SAVED_OUTFIT_CREATE_FIELDS, "保存搭配");
  return {
    name: savedOutfitName(record.name),
    ...(record.notes === undefined ? {} : { notes: savedOutfitNotes(record.notes) }),
    ...(record.favorite === undefined ? {} : { favorite: booleanValue(record.favorite, "favorite") }),
    items: validateSavedOutfitItems(record.items)
  };
}

export function validateSavedOutfitUpdate(value: unknown): SavedOutfitUpdateInput {
  const record = assertRecord(value, "搭配更新内容必须是 JSON 对象");
  assertOnlyFields(record, SAVED_OUTFIT_UPDATE_FIELDS, "搭配更新");
  if (!Object.keys(record).length) {
    throw new ValidationError("搭配更新至少需要一个字段");
  }
  return {
    ...(record.name === undefined ? {} : { name: savedOutfitName(record.name) }),
    ...(record.notes === undefined ? {} : { notes: savedOutfitNotes(record.notes) }),
    ...(record.favorite === undefined ? {} : { favorite: booleanValue(record.favorite, "favorite") }),
    ...(record.items === undefined ? {} : { items: validateSavedOutfitItems(record.items) })
  };
}

export function validateSaveRecommendationCandidate(
  value: unknown
): SaveRecommendationCandidateInput {
  const record = assertRecord(value, "保存推荐内容必须是 JSON 对象");
  assertOnlyFields(record, SAVE_RECOMMENDATION_CANDIDATE_FIELDS, "保存推荐");
  return {
    ...(record.name === undefined ? {} : { name: savedOutfitName(record.name) }),
    ...(record.notes === undefined ? {} : { notes: savedOutfitNotes(record.notes) }),
    ...(record.favorite === undefined ? {} : { favorite: booleanValue(record.favorite, "favorite") })
  };
}

export function validateSavedOutfitReplacement(value: unknown): SavedOutfitReplacementInput {
  const record = assertRecord(value, "替换搭配内容必须是 JSON 对象");
  assertOnlyFields(record, SAVED_OUTFIT_REPLACEMENT_FIELDS, "替换搭配");
  const targetGarmentId = positiveSafeInteger(record.targetGarmentId, "targetGarmentId");
  const replacementGarmentId = positiveSafeInteger(record.replacementGarmentId, "replacementGarmentId");
  if (targetGarmentId === replacementGarmentId) {
    throw new ValidationError("replacementGarmentId 必须与 targetGarmentId 不同");
  }
  return {
    targetGarmentId,
    replacementGarmentId,
    ...(record.name === undefined ? {} : { name: savedOutfitName(record.name) })
  };
}

export function validateRecommendationRequest(value: unknown): RecommendationRequest {
  const record = assertRecord(value, "推荐请求必须是 JSON 对象");
  const weather = validateWeather(record.weather);
  const occasion = "occasion" in record ? enumValue(record.occasion, FORMALITIES, "occasion") : "casual";
  const issues: RecommendationConstraintIssue[] = [];
  const includeGarmentIds = recommendationConstraintIds(record, "includeGarmentIds", issues);
  const excludeGarmentIds = recommendationConstraintIds(record, "excludeGarmentIds", issues);
  if (includeGarmentIds && excludeGarmentIds) {
    const excludedIds = new Set(excludeGarmentIds);
    for (const garmentId of new Set(includeGarmentIds)) {
      if (excludedIds.has(garmentId)) {
        issues.push({
          field: "includeGarmentIds",
          garmentId,
          reason: "INCLUDE_EXCLUDE_CONFLICT"
        });
      }
    }
  }
  if (issues.length) {
    throw new ValidationError("推荐衣物约束无效", { issues });
  }
  return {
    weather,
    occasion,
    recentlyWornGarmentIds: normalizeGarmentIds(record.recentlyWornGarmentIds),
    userProfile: validateRecommendationProfile(record.userProfile),
    ...(includeGarmentIds === undefined ? {} : { includeGarmentIds }),
    ...(excludeGarmentIds === undefined ? {} : { excludeGarmentIds })
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

function recommendationConstraintIds(
  record: Record<string, unknown>,
  field: RecommendationConstraintField,
  issues: RecommendationConstraintIssue[]
): number[] | undefined {
  if (!(field in record)) return undefined;
  const value = record[field];
  if (!Array.isArray(value) || value.length === 0) {
    issues.push({ field, reason: "INVALID_ARRAY" });
    return undefined;
  }
  if (value.length > RECOMMENDATION_CONSTRAINT_MAX_IDS) {
    issues.push({ field, reason: "TOO_MANY" });
    return undefined;
  }

  const result: number[] = [];
  const seen = new Set<number>();
  const duplicateIds = new Set<number>();
  for (const item of value) {
    if (typeof item !== "number" || !Number.isSafeInteger(item) || item <= 0) {
      issues.push({
        field,
        ...(typeof item === "number" && Number.isFinite(item) ? { garmentId: item } : {}),
        reason: "INVALID_ID"
      });
      continue;
    }
    result.push(item);
    if (seen.has(item)) duplicateIds.add(item);
    else seen.add(item);
  }
  for (const garmentId of duplicateIds) {
    issues.push({ field, garmentId, reason: "DUPLICATE" });
  }
  return result;
}

function validateSavedOutfitItems(value: unknown): SavedOutfitItemInput[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ValidationError("items 必须是非空数组");
  }
  if (value.length > SAVED_OUTFIT_MAX_ITEMS) {
    throw new ValidationError(`items 最多包含 ${SAVED_OUTFIT_MAX_ITEMS} 项`);
  }
  const garmentIds = new Set<number>();
  const positions = new Set<string>();
  return value.map((item, index) => {
    const record = assertRecord(item, `items[${index}] 必须是 JSON 对象`);
    assertOnlyFields(record, SAVED_OUTFIT_ITEM_FIELDS, `items[${index}]`);
    const garmentId = positiveSafeInteger(record.garmentId, `items[${index}].garmentId`);
    const slot = enumValue(record.slot, GARMENT_CATEGORIES, `items[${index}].slot`) as OutfitSlot;
    const position = nonNegativeSafeInteger(record.position, `items[${index}].position`);
    if (position >= SAVED_OUTFIT_MAX_ITEMS) {
      throw new ValidationError(`items[${index}].position 必须小于 ${SAVED_OUTFIT_MAX_ITEMS}`);
    }
    if (garmentIds.has(garmentId)) {
      throw new ValidationError(`items 中衣物 ${garmentId} 不能重复`);
    }
    const positionKey = `${slot}:${position}`;
    if (positions.has(positionKey)) {
      throw new ValidationError(`items 中 ${slot}+${position} 位置不能重复`);
    }
    garmentIds.add(garmentId);
    positions.add(positionKey);
    return { garmentId, slot, position };
  });
}

function savedOutfitName(value: unknown): string {
  const name = stringValue(value, "name").trim();
  if (!name) throw new ValidationError("name 不能为空");
  if (name.length > SAVED_OUTFIT_NAME_MAX_LENGTH) {
    throw new ValidationError(`name 不能超过 ${SAVED_OUTFIT_NAME_MAX_LENGTH} 个字符`);
  }
  return name;
}

function savedOutfitNotes(value: unknown): string {
  const notes = stringValue(value, "notes").trim();
  if (notes.length > SAVED_OUTFIT_NOTES_MAX_LENGTH) {
    throw new ValidationError(`notes 不能超过 ${SAVED_OUTFIT_NOTES_MAX_LENGTH} 个字符`);
  }
  return notes;
}

function assertOnlyFields(record: Record<string, unknown>, allowed: ReadonlySet<string>, label: string): void {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw new ValidationError(`${label}不允许字段 ${key}`);
    }
  }
}

function positiveSafeInteger(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new ValidationError(`${name} 必须是正安全整数`);
  }
  return value;
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

function strictBoundedInteger(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new ValidationError(`${name} 必须是 ${min}-${max} 之间的整数`);
  }
  return value;
}

function boundedNumber(value: unknown, name: string, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new ValidationError(`${name} 必须是 ${min}-${max} 之间的数字`);
  }
  return parsed;
}

function nonNegativeSafeInteger(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new ValidationError(`${name} 必须是非负安全整数`);
  }
  return value;
}

function isoDateValue(value: unknown, name: string): string {
  const text = stringValue(value, name);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) {
    throw new ValidationError(`${name} 必须是 YYYY-MM-DD 日期`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new ValidationError(`${name} 必须是真实日历日期`);
  }
  return text;
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
