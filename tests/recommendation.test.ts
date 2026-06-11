import { describe, expect, it } from "vitest";
import { recommendOutfits } from "../server/services/recommend";
import type { Garment, GarmentCategory, GarmentWarmth, WeatherSnapshot } from "../src/shared/types";

function garment(overrides: Partial<Garment> & Pick<Garment, "id" | "name" | "category">): Garment {
  return {
    brand: "",
    color: "black",
    warmth: "medium",
    seasons: ["spring", "autumn"],
    styles: ["casual"],
    formality: "casual",
    imageUrl: "",
    owned: true,
    confirmed: true,
    excluded: false,
    confidence: 0.8,
    rawName: overrides.rawName ?? overrides.name,
    ...overrides
  };
}

function weather(overrides: Partial<WeatherSnapshot>): WeatherSnapshot {
  return {
    date: "2026-01-03",
    temperature: 18,
    apparentTemperature: 18,
    precipitationProbability: 10,
    windSpeed: 8,
    weatherCode: 1,
    summary: "晴",
    ...overrides
  };
}

const coldRainyWeather = weather({
  temperature: 6,
  apparentTemperature: 4,
  precipitationProbability: 78,
  windSpeed: 22,
  weatherCode: 61,
  summary: "小雨"
});

const summerWeather = weather({
  date: "2026-07-18",
  temperature: 31,
  apparentTemperature: 34,
  precipitationProbability: 20,
  windSpeed: 8,
  summary: "晴热"
});

const coreGarments: Garment[] = [
  garment({
    id: 1,
    name: "米白高领毛衣",
    category: "top",
    color: "white",
    warmth: "warm",
    seasons: ["autumn", "winter"],
    styles: ["casual"],
    confidence: 0.9
  }),
  garment({
    id: 2,
    name: "深蓝直筒牛仔裤",
    category: "bottom",
    color: "blue",
    warmth: "medium",
    seasons: ["spring", "autumn", "winter"],
    styles: ["casual"]
  }),
  garment({
    id: 3,
    name: "黑色羊毛大衣",
    category: "outerwear",
    color: "black",
    warmth: "heavy",
    seasons: ["winter"],
    styles: ["smart-casual"],
    formality: "smart-casual",
    confidence: 0.95
  }),
  garment({
    id: 4,
    name: "黑色短靴",
    category: "shoes",
    warmth: "medium",
    seasons: ["autumn", "winter"],
    styles: ["casual"],
    confidence: 0.85
  }),
  garment({
    id: 5,
    name: "灰色围巾",
    category: "accessory",
    color: "gray",
    warmth: "warm",
    seasons: ["winter"],
    styles: ["casual"],
    confidence: 0.75
  }),
  garment({
    id: 6,
    name: "红色针织衫",
    category: "top",
    color: "red",
    warmth: "warm",
    seasons: ["autumn", "winter"],
    styles: ["casual"],
    confidence: 0.7
  }),
  garment({
    id: 7,
    name: "黑色半身裙",
    category: "bottom",
    warmth: "medium",
    seasons: ["spring", "autumn", "winter"],
    styles: ["smart-casual"],
    formality: "smart-casual"
  }),
  garment({
    id: 8,
    name: "驼色风衣",
    category: "outerwear",
    color: "brown",
    warmth: "warm",
    seasons: ["spring", "autumn", "winter"],
    styles: ["smart-casual"],
    formality: "smart-casual",
    confidence: 0.85
  }),
  garment({
    id: 9,
    name: "白色运动鞋",
    category: "shoes",
    color: "white",
    warmth: "light",
    seasons: ["spring", "summer", "autumn"],
    styles: ["casual", "sport"]
  })
];

describe("recommendOutfits", () => {
  it("returns three explainable outfits for cold rainy weather", () => {
    const result = recommendOutfits({
      garments: coreGarments,
      weather: coldRainyWeather,
      occasion: "casual",
      recentlyWornGarmentIds: [6]
    });

    expect(result.outfits).toHaveLength(3);
    expect(result.outfits[0].items.some((item) => item.category === "outerwear")).toBe(true);
    expect(result.outfits[0].items.some((item) => item.category === "shoes")).toBe(true);
    expect(result.outfits[0].reasons.join(" ")).toMatch(/降雨|雨|保暖|低温/);
    expect(result.outfits[0].score).toBeGreaterThan(result.outfits[2].score);
    expect(result.outfits[0].alternatives.length).toBeGreaterThan(0);
  });

  it("keeps heavy winter outerwear out of the top summer outfit", () => {
    const result = recommendOutfits({
      garments: [
        garment({ id: 1, name: "白色亚麻衬衫", category: "top", color: "white", warmth: "light", seasons: ["summer"], confidence: 0.7 }),
        garment({ id: 2, name: "浅灰薄款长裤", category: "bottom", color: "gray", warmth: "light", seasons: ["summer"], confidence: 0.7 }),
        garment({ id: 3, name: "白色轻便运动鞋", category: "shoes", color: "white", warmth: "light", seasons: ["summer"], confidence: 0.7 }),
        garment({ id: 4, name: "黑色厚重羽绒服", category: "outerwear", warmth: "heavy", seasons: ["winter"], confidence: 0.99 })
      ],
      weather: summerWeather,
      occasion: "casual"
    });

    expect(result.outfits[0].items.map((item) => item.id)).toEqual(expect.arrayContaining([1, 2, 3]));
    expect(result.outfits[0].items.some((item) => item.id === 4)).toBe(false);
    expect(result.outfits[0].reasons.join(" ")).toMatch(/高温|炎热|轻薄|夏季/);
  });

  it("prefers formal-compatible pieces for formal occasions", () => {
    const result = recommendOutfits({
      garments: [
        garment({ id: 1, name: "白色正装衬衫", category: "top", color: "white", styles: ["formal"], formality: "formal" }),
        garment({ id: 2, name: "黑色西裤", category: "bottom", styles: ["formal"], formality: "formal" }),
        garment({ id: 3, name: "黑色皮鞋", category: "shoes", styles: ["formal"], formality: "formal" }),
        garment({ id: 4, name: "运动连帽卫衣", category: "top", color: "green", styles: ["sport"], formality: "sport", confidence: 0.99 }),
        garment({ id: 5, name: "慢跑束脚裤", category: "bottom", color: "green", styles: ["sport"], formality: "sport", confidence: 0.99 }),
        garment({ id: 6, name: "彩色跑鞋", category: "shoes", color: "red", styles: ["sport"], formality: "sport", confidence: 0.99 })
      ],
      weather: weather({ apparentTemperature: 19 }),
      occasion: "formal"
    });

    expect(result.outfits[0].items.map((item) => item.id)).toEqual(expect.arrayContaining([1, 2, 3]));
    expect(result.outfits[0].items.some((item) => item.formality === "sport")).toBe(false);
    expect(result.outfits[0].reasons.join(" ")).toMatch(/正式|场合|风格/);
  });

  it("explains color harmony and avoids loud conflicting palettes", () => {
    const result = recommendOutfits({
      garments: [
        garment({ id: 1, name: "红色针织衫", category: "top", color: "red", confidence: 0.99 }),
        garment({ id: 2, name: "绿色休闲裤", category: "bottom", color: "green", confidence: 0.99 }),
        garment({ id: 3, name: "黄色帆布鞋", category: "shoes", color: "yellow", confidence: 0.99 }),
        garment({ id: 4, name: "白色牛津衬衫", category: "top", color: "white", confidence: 0.4 }),
        garment({ id: 5, name: "灰色直筒裤", category: "bottom", color: "gray", confidence: 0.4 }),
        garment({ id: 6, name: "黑色乐福鞋", category: "shoes", color: "black", confidence: 0.4 })
      ],
      weather: weather({ apparentTemperature: 18 }),
      occasion: "casual"
    });

    expect(result.outfits[0].items.map((item) => item.id)).toEqual(expect.arrayContaining([4, 5, 6]));
    expect(result.outfits[0].reasons.join(" ")).toMatch(/色彩|配色/);
  });

  it("downranks recently worn core pieces when alternatives exist", () => {
    const result = recommendOutfits({
      garments: [
        garment({ id: 1, name: "常穿黑色T恤", category: "top", color: "black", confidence: 0.99 }),
        garment({ id: 2, name: "深蓝直筒牛仔裤", category: "bottom", color: "blue" }),
        garment({ id: 3, name: "白色运动鞋", category: "shoes", color: "white" }),
        garment({ id: 4, name: "干净白色T恤", category: "top", color: "white", confidence: 0.4 })
      ],
      weather: weather({ apparentTemperature: 20 }),
      occasion: "casual",
      recentlyWornGarmentIds: [1]
    });

    expect(result.outfits[0].items.some((item) => item.id === 1)).toBe(false);
    expect(result.outfits[0].items.some((item) => item.id === 4)).toBe(true);
    expect(result.outfits[0].reasons.join(" ")).toMatch(/最近|重复|换穿/);
  });

  it("sorts alternatives by replacement compatibility", () => {
    const result = recommendOutfits({
      garments: [
        garment({ id: 1, name: "白色基础T恤", category: "top", color: "white" }),
        garment({ id: 2, name: "黑色直筒裤", category: "bottom", color: "black" }),
        garment({ id: 3, name: "黑色乐福鞋", category: "shoes", color: "black" }),
        garment({ id: 4, name: "高饱和红色背心", category: "top", color: "red", confidence: 0.95 }),
        garment({ id: 5, name: "米色针织短袖", category: "top", color: "beige", confidence: 0.5 }),
        garment({ id: 6, name: "绿色运动短裤", category: "bottom", color: "green", confidence: 0.95 })
      ],
      weather: weather({ apparentTemperature: 22 }),
      occasion: "casual"
    });

    const alternativeIdsByCategory = result.outfits[0].alternatives.reduce<Record<GarmentCategory, number[]>>((groups, item) => {
      groups[item.category] = [...(groups[item.category] ?? []), item.id];
      return groups;
    }, {} as Record<GarmentCategory, number[]>);

    expect(result.outfits[0].alternatives.some((item) => result.outfits[0].items.some((selected) => selected.id === item.id))).toBe(false);
    expect(alternativeIdsByCategory.top[0]).toBe(5);
  });
});
