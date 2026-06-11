import type { Garment, GarmentCategory, OutfitRecommendation, RecommendationResult, WeatherSnapshot } from "../../src/shared/types";

export interface RecommendInput {
  garments: Garment[];
  weather: WeatherSnapshot;
  occasion: string;
  recentlyWornGarmentIds?: number[];
}

interface Candidate {
  items: Garment[];
  score: number;
  reasons: string[];
}

const NEUTRALS = new Set(["black", "white", "gray", "beige", "brown", "blue", "unknown"]);

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
      const outerOptions = shouldUseOuterwear(input.weather) ? outerwear : [undefined, ...outerwear];
      for (const coat of outerOptions) {
        for (const shoe of shoes) {
          const accessory = pickAccessory(accessories, input.weather);
          const items = [...base, coat, shoe, accessory].filter(Boolean) as Garment[];
          candidates.push(scoreCandidate(items, input));
        }
      }
    }
  }

  const outfits = candidates
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map((candidate, index) => ({
      id: `outfit-${index + 1}`,
      score: Number(candidate.score.toFixed(1)),
      items: candidate.items,
      reasons: candidate.reasons,
      alternatives: findAlternatives(available, candidate.items)
    }));

  return {
    weather: input.weather,
    occasion: input.occasion,
    outfits
  };
}

function scoreCandidate(items: Garment[], input: RecommendInput): Candidate {
  const reasons: string[] = [];
  let score = 50;
  const apparent = input.weather.apparentTemperature;
  const rain = input.weather.precipitationProbability;
  const categories = new Set(items.map((item) => item.category));

  if (apparent <= 8) {
    const warmth = warmthScore(items);
    score += warmth;
    reasons.push(`体感温度 ${apparent}°C，优先选择保暖层次。`);
    if (categories.has("outerwear")) score += 12;
  } else if (apparent >= 26) {
    score += items.filter((item) => item.warmth === "light").length * 8;
    reasons.push(`气温偏高，轻薄单品更舒适。`);
  } else {
    score += 8;
    reasons.push(`温度适中，保持轻便层次。`);
  }

  if (rain >= 50) {
    score += categories.has("outerwear") ? 8 : -8;
    score += items.some((item) => /靴|boot/i.test(item.name)) ? 8 : 0;
    reasons.push(`降雨概率 ${rain}%，鞋履和外层需要更稳妥。`);
  }

  if (input.weather.windSpeed >= 20) {
    score += categories.has("outerwear") ? 6 : -4;
    reasons.push(`风速偏高，外套能提升防风感。`);
  }

  if (input.occasion) {
    score += items.filter((item) => item.styles.includes(input.occasion) || item.formality === input.occasion).length * 4;
  }

  score += colorHarmonyScore(items);
  for (const item of items) {
    if (input.recentlyWornGarmentIds?.includes(item.id)) score -= 15;
    score += item.confirmed ? 2 : 0;
    score += item.confidence;
  }

  return { items, score, reasons };
}

function shouldUseOuterwear(weather: WeatherSnapshot): boolean {
  return weather.apparentTemperature <= 16 || weather.precipitationProbability >= 50 || weather.windSpeed >= 20;
}

function warmthScore(items: Garment[]): number {
  return items.reduce((score, item) => {
    if (item.warmth === "heavy") return score + 12;
    if (item.warmth === "warm") return score + 8;
    if (item.warmth === "medium") return score + 4;
    return score - 3;
  }, 0);
}

function colorHarmonyScore(items: Garment[]): number {
  const colors = items.map((item) => item.color);
  const accentCount = colors.filter((color) => !NEUTRALS.has(color)).length;
  const neutralCount = colors.length - accentCount;
  if (accentCount <= 1 && neutralCount >= 2) return 10;
  if (accentCount === 2) return 4;
  return -6;
}

function pickAccessory(accessories: Garment[], weather: WeatherSnapshot): Garment | undefined {
  if (weather.apparentTemperature <= 10) {
    return accessories.find((item) => item.warmth === "warm" || /围巾|scarf/i.test(item.name)) ?? accessories[0];
  }
  return accessories[0];
}

function findAlternatives(available: Garment[], selected: Garment[]): Garment[] {
  const selectedIds = new Set(selected.map((item) => item.id));
  const selectedCategories = new Set<GarmentCategory>(selected.map((item) => item.category));
  return available
    .filter((item) => !selectedIds.has(item.id) && selectedCategories.has(item.category))
    .slice(0, 4);
}
