import { describe, expect, it } from "vitest";
import { recommendOutfits } from "../server/services/recommend";
import type { Garment, WeatherSnapshot } from "../src/shared/types";

const garments: Garment[] = [
  {
    id: 1,
    name: "米白高领毛衣",
    category: "top",
    color: "white",
    warmth: "warm",
    seasons: ["autumn", "winter"],
    styles: ["casual"],
    formality: "casual",
    imageUrl: "",
    owned: true,
    confirmed: true,
    excluded: false,
    confidence: 0.9
  },
  {
    id: 2,
    name: "深蓝直筒牛仔裤",
    category: "bottom",
    color: "blue",
    warmth: "medium",
    seasons: ["spring", "autumn", "winter"],
    styles: ["casual"],
    formality: "casual",
    imageUrl: "",
    owned: true,
    confirmed: true,
    excluded: false,
    confidence: 0.8
  },
  {
    id: 3,
    name: "黑色羊毛大衣",
    category: "outerwear",
    color: "black",
    warmth: "heavy",
    seasons: ["winter"],
    styles: ["smart-casual"],
    formality: "smart-casual",
    imageUrl: "",
    owned: true,
    confirmed: true,
    excluded: false,
    confidence: 0.95
  },
  {
    id: 4,
    name: "黑色短靴",
    category: "shoes",
    color: "black",
    warmth: "medium",
    seasons: ["autumn", "winter"],
    styles: ["casual"],
    formality: "casual",
    imageUrl: "",
    owned: true,
    confirmed: true,
    excluded: false,
    confidence: 0.85
  },
  {
    id: 5,
    name: "灰色围巾",
    category: "accessory",
    color: "gray",
    warmth: "warm",
    seasons: ["winter"],
    styles: ["casual"],
    formality: "casual",
    imageUrl: "",
    owned: true,
    confirmed: true,
    excluded: false,
    confidence: 0.75
  },
  {
    id: 6,
    name: "红色针织衫",
    category: "top",
    color: "red",
    warmth: "warm",
    seasons: ["autumn", "winter"],
    styles: ["casual"],
    formality: "casual",
    imageUrl: "",
    owned: true,
    confirmed: true,
    excluded: false,
    confidence: 0.7
  },
  {
    id: 7,
    name: "黑色半身裙",
    category: "bottom",
    color: "black",
    warmth: "medium",
    seasons: ["spring", "autumn", "winter"],
    styles: ["smart-casual"],
    formality: "smart-casual",
    imageUrl: "",
    owned: true,
    confirmed: true,
    excluded: false,
    confidence: 0.8
  },
  {
    id: 8,
    name: "驼色风衣",
    category: "outerwear",
    color: "brown",
    warmth: "warm",
    seasons: ["spring", "autumn", "winter"],
    styles: ["smart-casual"],
    formality: "smart-casual",
    imageUrl: "",
    owned: true,
    confirmed: true,
    excluded: false,
    confidence: 0.85
  },
  {
    id: 9,
    name: "白色运动鞋",
    category: "shoes",
    color: "white",
    warmth: "light",
    seasons: ["spring", "summer", "autumn"],
    styles: ["casual", "sport"],
    formality: "casual",
    imageUrl: "",
    owned: true,
    confirmed: true,
    excluded: false,
    confidence: 0.8
  }
];

describe("recommendOutfits", () => {
  it("returns three explainable outfits for cold rainy weather", () => {
    const weather: WeatherSnapshot = {
      date: "2026-01-03",
      temperature: 6,
      apparentTemperature: 4,
      precipitationProbability: 78,
      windSpeed: 22,
      weatherCode: 61,
      summary: "小雨"
    };

    const result = recommendOutfits({
      garments,
      weather,
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
});
