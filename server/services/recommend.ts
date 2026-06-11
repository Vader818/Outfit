import type { Formality, Garment, GarmentCategory, GarmentWarmth, OutfitRecommendation, RecommendationResult, RecommendationScoreBreakdown, Season, UserPreferenceProfile, WeatherScenario, WeatherSnapshot } from "../../src/shared/types";

export interface RecommendInput {
  garments: Garment[];
  weather: WeatherSnapshot;
  occasion: string;
  recentlyWornGarmentIds?: number[];
  userProfile?: UserPreferenceProfile;
}

interface Candidate {
  items: Garment[];
  score: number;
  reasons: string[];
  scoreBreakdown: RecommendationScoreBreakdown;
}

const NEUTRALS = new Set(["black", "white", "gray", "beige", "brown", "blue", "unknown"]);
const CORE_CATEGORIES = new Set<GarmentCategory>(["top", "bottom", "dress", "shoes"]);
const FORMALITY_RANK: Record<Formality, number> = {
  sport: 0,
  casual: 1,
  "smart-casual": 2,
  formal: 3
};

const WARMTH_VALUE: Record<GarmentWarmth, number> = {
  light: 0,
  medium: 1,
  warm: 2,
  heavy: 3
};

const CATEGORY_PAIR_WEIGHTS: Partial<Record<GarmentCategory, Partial<Record<GarmentCategory, number>>>> = {
  top: { bottom: 1.25, outerwear: 1, shoes: 0.65 },
  dress: { outerwear: 0.9, shoes: 1.25 },
  bottom: { shoes: 1 },
  outerwear: { shoes: 0.5 }
};

const CLASHING_ACCENTS = new Set(["green:red", "green:yellow", "purple:yellow", "red:green", "yellow:green", "yellow:purple"]);

export function recommendOutfits(input: RecommendInput): RecommendationResult {
  const available = input.garments.filter((item) => item.owned && !item.excluded);
  const tops = available.filter((item) => item.category === "top");
  const dresses = available.filter((item) => item.category === "dress");
  const bottoms = available.filter((item) => item.category === "bottom");
  const outerwear = available.filter((item) => item.category === "outerwear");
  const shoes = available.filter((item) => item.category === "shoes");
  const accessories = available.filter((item) => item.category === "accessory");
  const candidates: Candidate[] = [];

  for (const top of [...tops, ...dresses]) {
    const bases = top.category === "dress" ? [[top]] : bottoms.map((bottom) => [top, bottom]);
    for (const base of bases) {
      const outerOptions = outerwearOptions(outerwear, input.weather);
      const shoeOptions = shoes.length ? shoes : [undefined];
      const accessoryOptions = [undefined, ...accessories.slice(0, 3)];
      for (const coat of outerOptions) {
        for (const shoe of shoeOptions) {
          for (const accessory of accessoryOptions) {
            const items = [...base, coat, shoe, accessory].filter(Boolean) as Garment[];
            candidates.push(scoreCandidate(items, input));
          }
        }
      }
    }
  }

  const sorted = candidates.sort((left, right) => right.score - left.score);
  const outfits = selectDiverseCandidates(sorted).map((candidate, index) => ({
    id: `outfit-${index + 1}`,
    score: Number(candidate.score.toFixed(1)),
    matchPercent: normalizeMatchPercent(candidate.score),
    scoreBreakdown: normalizeBreakdown(candidate.scoreBreakdown),
    items: candidate.items,
    reasons: candidate.reasons,
    alternatives: findAlternatives(available, candidate.items, input)
  }));

  return {
    weather: input.weather,
    weatherScenario: classifyWeatherScenario(input.weather),
    occasion: input.occasion,
    outfits
  };
}

function selectDiverseCandidates(candidates: Candidate[]): Candidate[] {
  const selected: Candidate[] = [];
  const seenCoreSignatures = new Set<string>();

  for (const candidate of candidates) {
    const signature = coreSignature(candidate.items);
    if (seenCoreSignatures.has(signature)) continue;
    selected.push(candidate);
    seenCoreSignatures.add(signature);
    if (selected.length === 3) break;
  }

  for (const candidate of candidates) {
    if (selected.length === 3) break;
    if (!selected.includes(candidate)) selected.push(candidate);
  }

  return selected.slice(0, 3);
}

function scoreCandidate(items: Garment[], input: RecommendInput): Candidate {
  const reasons: string[] = [];
  const scoreBreakdown: RecommendationScoreBreakdown = {
    slotCompleteness: slotCompletenessScore(items, reasons),
    weatherComfort: weatherComfortScore(items, input.weather, reasons),
    season: seasonScore(items, input.weather, reasons),
    occasion: occasionScore(items, input.occasion as Formality, reasons),
    pairCompatibility: pairwiseCompatibilityScore(items),
    colorHarmony: colorHarmonyScore(items, reasons),
    recentWear: recentWearScore(items, input.recentlyWornGarmentIds ?? [], reasons),
    itemConfidence: itemConfidenceScore(items),
    userPreference: userPreferenceScore(items, input.userProfile, input.weather, reasons)
  };
  const score = 50 + Object.values(scoreBreakdown).reduce((total, value) => total + value, 0);

  return { items, score, reasons: reasons.slice(0, 6), scoreBreakdown };
}

function slotCompletenessScore(items: Garment[], reasons: string[]): number {
  const categories = new Set(items.map((item) => item.category));
  let score = 0;
  if (categories.has("dress") || (categories.has("top") && categories.has("bottom"))) score += 12;
  if (categories.has("shoes")) score += 8;
  else {
    score -= 14;
    addReason(reasons, "缺少鞋履，完整度下降。");
  }
  return score;
}

function weatherComfortScore(items: Garment[], weather: WeatherSnapshot, reasons: string[]): number {
  const apparent = weather.apparentTemperature;
  const categories = new Set(items.map((item) => item.category));
  let score = 0;

  if (apparent <= 8) {
    score += items.reduce((total, item) => total + warmthPoints(item.warmth, "cold"), 0);
    score += categories.has("outerwear") ? 14 : -20;
    addReason(reasons, `体感温度 ${apparent}°C，优先保暖层次和外套。`);
  } else if (apparent >= 28) {
    for (const item of items) {
      if (item.warmth === "light") score += 7;
      if (item.warmth === "warm") score -= 8;
      if (item.warmth === "heavy") score -= 18;
      if (item.category === "outerwear") score -= item.warmth === "heavy" ? 26 : 16;
    }
    addReason(reasons, `体感温度 ${apparent}°C，高温天气优先轻薄夏季单品。`);
  } else {
    score += 7;
    if (items.some((item) => item.category === "outerwear" && item.warmth === "heavy")) score -= 8;
    addReason(reasons, "温度适中，保持轻便层次。");
  }

  if (weather.precipitationProbability >= 50) {
    const steadyShoes = items.some((item) => item.category === "shoes" && /靴|boot|防水|雨/i.test(item.name));
    score += categories.has("outerwear") ? 8 : -8;
    score += steadyShoes ? 9 : -3;
    addReason(reasons, `降雨概率 ${weather.precipitationProbability}%，鞋履和外层需要更稳妥。`);
  }

  if (weather.windSpeed >= 20) {
    score += categories.has("outerwear") ? 6 : -5;
    addReason(reasons, `风速 ${weather.windSpeed} km/h，防风外层会更舒适。`);
  }

  return score;
}

function warmthPoints(warmth: GarmentWarmth, mode: "cold" | "mild"): number {
  if (mode === "cold") {
    if (warmth === "heavy") return 13;
    if (warmth === "warm") return 9;
    if (warmth === "medium") return 4;
    return -6;
  }
  return warmth === "heavy" ? -5 : 2;
}

function seasonScore(items: Garment[], weather: WeatherSnapshot, reasons: string[]): number {
  const target = targetSeason(weather);
  let matched = 0;
  let mismatched = 0;
  let score = 0;

  for (const item of items) {
    if (!item.seasons.length || item.seasons.includes(target)) {
      matched += 1;
      score += 4;
      continue;
    }
    mismatched += 1;
    score -= item.category === "outerwear" ? 8 : 4;
    if (target === "summer" && (item.warmth === "heavy" || item.warmth === "warm")) score -= 8;
    if (target === "winter" && item.warmth === "light") score -= 6;
  }

  if (matched >= Math.max(2, items.length - 1)) addReason(reasons, `单品季节与${seasonLabel(target)}匹配。`);
  if (mismatched > 0) addReason(reasons, `${mismatched} 件单品季节不完全匹配，已降低排序。`);
  return score;
}

function occasionScore(items: Garment[], occasion: Formality, reasons: string[]): number {
  if (!occasion || !(occasion in FORMALITY_RANK)) return 0;
  let exact = 0;
  let close = 0;
  let mismatch = 0;
  let score = 0;

  for (const item of items) {
    const styleMatch = item.styles.includes(occasion);
    const distance = Math.abs(FORMALITY_RANK[item.formality] - FORMALITY_RANK[occasion]);
    if (item.formality === occasion || styleMatch) {
      exact += 1;
      score += 7;
    } else if (distance === 1) {
      close += 1;
      score += 2;
    } else {
      mismatch += 1;
      score -= occasion === "formal" && item.formality === "sport" ? 14 : 6;
    }
  }

  if (exact >= Math.max(2, items.length - 1)) addReason(reasons, `风格和${occasionLabel(occasion)}场合匹配。`);
  else if (close > exact && mismatch === 0) addReason(reasons, `整体风格接近${occasionLabel(occasion)}场合。`);
  else if (mismatch > 0) addReason(reasons, `部分单品与${occasionLabel(occasion)}场合不够一致。`);
  return score;
}

function pairwiseCompatibilityScore(items: Garment[]): number {
  let score = 0;
  for (let leftIndex = 0; leftIndex < items.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < items.length; rightIndex += 1) {
      const left = items[leftIndex];
      const right = items[rightIndex];
      score += pairWeight(left.category, right.category) * pairScore(left, right);
    }
  }
  return score;
}

function pairWeight(left: GarmentCategory, right: GarmentCategory): number {
  return CATEGORY_PAIR_WEIGHTS[left]?.[right] ?? CATEGORY_PAIR_WEIGHTS[right]?.[left] ?? 0.25;
}

function pairScore(left: Garment, right: Garment): number {
  let score = 0;
  score += colorPairScore(left.color, right.color);
  if (left.styles.some((style) => right.styles.includes(style))) score += 3;
  const formalityDistance = Math.abs(FORMALITY_RANK[left.formality] - FORMALITY_RANK[right.formality]);
  if (formalityDistance === 0) score += 2;
  if (formalityDistance >= 2) score -= 5;
  if (left.seasons.some((season) => right.seasons.includes(season))) score += 2;
  if (Math.abs(WARMTH_VALUE[left.warmth] - WARMTH_VALUE[right.warmth]) >= 3) score -= 4;
  return score;
}

function colorPairScore(left: string, right: string): number {
  const leftNeutral = NEUTRALS.has(left);
  const rightNeutral = NEUTRALS.has(right);
  if (leftNeutral && rightNeutral) return 4;
  if (leftNeutral || rightNeutral) return 2;
  if (left === right) return 1;
  return CLASHING_ACCENTS.has(`${left}:${right}`) ? -8 : -2;
}

function colorHarmonyScore(items: Garment[], reasons: string[]): number {
  const colors = items.map((item) => item.color);
  const accents = colors.filter((color) => !NEUTRALS.has(color));
  const uniqueAccents = Array.from(new Set(accents));
  const neutralCount = colors.length - accents.length;

  if (uniqueAccents.length === 0 && neutralCount >= 2) {
    addReason(reasons, "配色以中性色为主，稳定耐看。");
    return 12;
  }
  if (uniqueAccents.length === 1 && neutralCount >= 2) {
    addReason(reasons, "中性色搭配少量重点色，色彩层次清晰。");
    return 8;
  }
  if (uniqueAccents.length === 2 && !hasClashingAccents(uniqueAccents)) {
    addReason(reasons, "配色有两个重点色，整体仍可协调。");
    return 1;
  }
  addReason(reasons, "色彩重点偏多或存在冲突，已降低排序。");
  return -22;
}

function hasClashingAccents(accents: string[]): boolean {
  for (let left = 0; left < accents.length; left += 1) {
    for (let right = left + 1; right < accents.length; right += 1) {
      if (CLASHING_ACCENTS.has(`${accents[left]}:${accents[right]}`)) return true;
    }
  }
  return accents.length >= 3;
}

function recentWearScore(items: Garment[], recentlyWornGarmentIds: number[], reasons: string[]): number {
  if (!recentlyWornGarmentIds.length) return 0;
  const recentIds = new Set(recentlyWornGarmentIds);
  const repeated = items.filter((item) => recentIds.has(item.id));
  if (!repeated.length) {
    addReason(reasons, "已避开最近穿过的核心单品，优先换穿。");
    return 6;
  }
  const penalty = repeated.reduce((total, item) => total + (CORE_CATEGORIES.has(item.category) ? 34 : 18), 0);
  addReason(reasons, `包含 ${repeated.length} 件最近穿过的单品，已降低重复穿着排序。`);
  return -penalty;
}

function itemConfidenceScore(items: Garment[]): number {
  return items.reduce((score, item) => score + (item.confirmed ? 2 : 0) + item.confidence * 2, 0);
}

function userPreferenceScore(items: Garment[], profile: UserPreferenceProfile | undefined, weather: WeatherSnapshot, reasons: string[]): number {
  if (!profile) return 0;
  let score = 0;
  const preferredColors = new Set((profile.preferredColors ?? []).map((color) => color.toLowerCase()));
  const avoidedColors = new Set((profile.avoidedColors ?? []).map((color) => color.toLowerCase()));
  const preferredStyles = new Set((profile.preferredStyles ?? []).map((style) => style.toLowerCase()));
  let matchedPreference = false;
  let avoidedPenalty = false;

  for (const item of items) {
    const color = item.color.toLowerCase();
    if (preferredColors.has(color)) {
      score += CORE_CATEGORIES.has(item.category) ? 8 : 3;
      matchedPreference = true;
    }
    if (avoidedColors.has(color)) {
      score -= CORE_CATEGORIES.has(item.category) ? 12 : 4;
      avoidedPenalty = true;
    }
    if (item.styles.some((style) => preferredStyles.has(style.toLowerCase()))) {
      score += 2;
      matchedPreference = true;
    }
  }

  if (profile.temperatureSensitivity === "runs-cold" && weather.apparentTemperature <= 18) {
    const warmItems = items.filter((item) => item.warmth === "warm" || item.warmth === "heavy").length;
    score += warmItems * 6;
    if (warmItems) {
      addReason(reasons, "已按怕冷偏好提高保暖单品排序。");
      matchedPreference = true;
    }
  }
  if (profile.temperatureSensitivity === "runs-hot" && weather.apparentTemperature >= 18) {
    const heavyItems = items.filter((item) => item.warmth === "warm" || item.warmth === "heavy").length;
    const lightItems = items.filter((item) => item.warmth === "light").length;
    score += lightItems * 5 - heavyItems * 7;
    if (lightItems) {
      addReason(reasons, "已按怕热偏好提高轻薄单品排序。");
      matchedPreference = true;
    }
  }
  if (matchedPreference) addReason(reasons, "颜色或风格更贴近你的偏好。");
  if (avoidedPenalty) addReason(reasons, "包含偏好中避开的颜色，已降低排序。");
  return score;
}

function normalizeMatchPercent(score: number): number {
  return Math.max(0, Math.min(100, Math.round((score / 140) * 100)));
}

function normalizeBreakdown(scoreBreakdown: RecommendationScoreBreakdown): RecommendationScoreBreakdown {
  return Object.fromEntries(
    Object.entries(scoreBreakdown).map(([key, value]) => [key, Number(value.toFixed(1))])
  ) as unknown as RecommendationScoreBreakdown;
}

export function classifyWeatherScenario(weather: WeatherSnapshot): WeatherScenario {
  const apparent = weather.apparentTemperature;
  const rainy = weather.precipitationProbability >= 50 || [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(weather.weatherCode);
  const windy = weather.windSpeed >= 20;
  if (apparent <= 10 && windy) return "cold_windy";
  if (apparent <= 10) return "cold_dry";
  if (apparent >= 28 && rainy) return "hot_humid";
  if (apparent >= 28) return "hot_dry";
  if (rainy) return "rainy_mild";
  if (weather.precipitationProbability <= 20 && weather.windSpeed < 16) return "dry_sunny";
  return "mild";
}

function outerwearOptions(outerwear: Garment[], weather: WeatherSnapshot): Array<Garment | undefined> {
  if (shouldUseOuterwear(weather)) return outerwear.length ? outerwear : [undefined];
  return [undefined, ...outerwear];
}

function shouldUseOuterwear(weather: WeatherSnapshot): boolean {
  return weather.apparentTemperature <= 16 || weather.precipitationProbability >= 50 || weather.windSpeed >= 20;
}

function findAlternatives(available: Garment[], selected: Garment[], input: RecommendInput): Garment[] {
  const selectedIds = new Set(selected.map((item) => item.id));
  const selectedCategories = new Set<GarmentCategory>(selected.map((item) => item.category));
  return available
    .filter((item) => !selectedIds.has(item.id) && selectedCategories.has(item.category))
    .map((item) => ({
      item,
      score: bestReplacementScore(item, selected, input)
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 4)
    .map(({ item }) => item);
}

function bestReplacementScore(replacement: Garment, selected: Garment[], input: RecommendInput): number {
  const matchingIndexes = selected
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.category === replacement.category);
  if (!matchingIndexes.length) return -Infinity;

  return Math.max(
    ...matchingIndexes.map(({ index }) => {
      const nextItems = selected.map((item, itemIndex) => (itemIndex === index ? replacement : item));
      const score = scoreCandidateForReplacement(nextItems, input);
      return score;
    })
  );
}

function scoreCandidateForReplacement(items: Garment[], input: RecommendInput): number {
  const reasons: string[] = [];
  return (
    slotCompletenessScore(items, reasons) +
    weatherComfortScore(items, input.weather, reasons) +
    seasonScore(items, input.weather, reasons) +
    occasionScore(items, input.occasion as Formality, reasons) +
    pairwiseCompatibilityScore(items) +
    colorHarmonyScore(items, reasons) +
    recentWearScore(items, input.recentlyWornGarmentIds ?? [], reasons)
  );
}

function coreSignature(items: Garment[]): string {
  return items
    .filter((item) => CORE_CATEGORIES.has(item.category))
    .map((item) => `${item.category}:${item.id}`)
    .sort()
    .join("|");
}

function targetSeason(weather: WeatherSnapshot): Season {
  if (weather.apparentTemperature >= 28) return "summer";
  if (weather.apparentTemperature <= 8) return "winter";
  const month = Number(weather.date.slice(5, 7));
  if ([12, 1, 2].includes(month)) return "winter";
  if ([3, 4, 5].includes(month)) return "spring";
  if ([6, 7, 8].includes(month)) return "summer";
  return "autumn";
}

function seasonLabel(season: Season): string {
  return {
    spring: "春季",
    summer: "夏季",
    autumn: "秋季",
    winter: "冬季"
  }[season];
}

function occasionLabel(occasion: Formality): string {
  return {
    casual: "日常",
    "smart-casual": "通勤",
    formal: "正式",
    sport: "运动"
  }[occasion];
}

function addReason(reasons: string[], reason: string): void {
  if (!reasons.includes(reason)) reasons.push(reason);
}
