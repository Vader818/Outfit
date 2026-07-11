import { describe, expect, it } from "vitest";
import { generateCandidates, recommendOutfits } from "../server/services/recommend";
import type { Garment, GarmentCategory, GarmentWarmth, PersonalProfile, WeatherSnapshot } from "../src/shared/types";

function garment(overrides: Partial<Garment> & Pick<Garment, "id" | "name" | "category">): Garment {
  return {
    origin: "manual",
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
  it("preserves the existing small-wardrobe ranking contract", () => {
    const result = recommendOutfits({
      garments: [
        garment({ id: 1, name: "白色衬衫", category: "top", color: "white" }),
        garment({ id: 2, name: "蓝色针织衫", category: "top", color: "blue", warmth: "warm" }),
        garment({ id: 3, name: "黑色长裤", category: "bottom" }),
        garment({ id: 4, name: "灰色半裙", category: "bottom", color: "gray", formality: "smart-casual" }),
        garment({ id: 5, name: "黑色乐福鞋", category: "shoes" }),
        garment({ id: 6, name: "白色运动鞋", category: "shoes", color: "white", formality: "sport" }),
        garment({ id: 7, name: "米色风衣", category: "outerwear", color: "beige", warmth: "warm", formality: "smart-casual" }),
        garment({ id: 8, name: "红色围巾", category: "accessory", color: "red" })
      ],
      weather: weather({
        date: "2026-04-12",
        apparentTemperature: 15,
        precipitationProbability: 20,
        windSpeed: 10,
        weatherCode: 2,
        summary: "多云"
      }),
      occasion: "smart-casual"
    });

    expect(result.outfits.map((outfit) => ({
      itemIds: outfit.items.map((item) => item.id),
      score: outfit.score,
      reasons: outfit.reasons,
      alternativeIds: outfit.alternatives.map((item) => item.id)
    }))).toEqual([
      {
        itemIds: [1, 4, 7, 5, 8],
        score: 194.7,
        reasons: [
          "温度适中，保持轻便层次。",
          "单品季节与春季匹配。",
          "整体风格接近通勤场合。",
          "中性色搭配少量重点色，色彩层次清晰。"
        ],
        alternativeIds: [2, 3, 6]
      },
      {
        itemIds: [2, 4, 7, 5, 8],
        score: 194.7,
        reasons: [
          "温度适中，保持轻便层次。",
          "单品季节与春季匹配。",
          "整体风格接近通勤场合。",
          "中性色搭配少量重点色，色彩层次清晰。"
        ],
        alternativeIds: [1, 3, 6]
      },
      {
        itemIds: [1, 3, 7, 5, 8],
        score: 194.2,
        reasons: [
          "温度适中，保持轻便层次。",
          "单品季节与春季匹配。",
          "整体风格接近通勤场合。",
          "中性色搭配少量重点色，色彩层次清晰。"
        ],
        alternativeIds: [4, 2, 6]
      }
    ]);
  });

  it("keeps a 500-garment wardrobe within the deterministic candidate budget", () => {
    const garments: Garment[] = [];
    let id = 1;
    for (let index = 0; index < 250; index += 1) {
      garments.push(garment({
        id: id++,
        name: `测试上装 ${index + 1}`,
        category: "top",
        color: index % 2 === 0 ? "white" : "blue"
      }));
    }
    for (let index = 0; index < 249; index += 1) {
      garments.push(garment({
        id: id++,
        name: `测试下装 ${index + 1}`,
        category: "bottom",
        color: index % 2 === 0 ? "black" : "gray"
      }));
    }
    garments.push(garment({ id, name: "测试鞋履", category: "shoes", color: "black" }));
    const input = {
      garments,
      weather: weather({ apparentTemperature: 18 }),
      occasion: "casual"
    };

    const generated = generateCandidates(input);
    const result = recommendOutfits(input);
    const coreSignatures = new Set(result.outfits.map((outfit) => outfit.items
      .filter((item) => item.category === "top" || item.category === "bottom" || item.category === "dress")
      .map((item) => `${item.category}:${item.id}`)
      .sort()
      .join("|")));

    expect(generated.evaluatedCandidates).toBeLessThanOrEqual(20_000);
    expect(generated.candidates.length).toBeLessThanOrEqual(120);
    expect(generated.truncated).toBe(true);
    expect(result.outfits).toHaveLength(3);
    expect(coreSignatures.size).toBe(3);
  });

  it("samples late shoe options fairly when a layer exceeds its budget", () => {
    const dresses = Array.from({ length: 120 }, (_, index) => garment({
      id: index + 1,
      name: `正式连衣裙 ${index + 1}`,
      category: "dress",
      color: "black",
      styles: ["formal"],
      formality: "formal"
    }));
    const shoes = Array.from({ length: 60 }, (_, index) => garment({
      id: 121 + index,
      name: index === 59 ? "最佳正式鞋" : `运动鞋 ${index + 1}`,
      category: "shoes",
      color: index === 59 ? "black" : "yellow",
      styles: index === 59 ? ["formal"] : ["sport"],
      formality: index === 59 ? "formal" : "sport"
    }));
    const bestShoeId = shoes.at(-1)!.id;

    const result = recommendOutfits({
      garments: [...dresses, ...shoes],
      weather: weather({ apparentTemperature: 18 }),
      occasion: "formal"
    });

    expect(result.outfits[0].items.some((item) => item.id === bestShoeId)).toBe(true);
  });

  it("does not starve late dresses when core combinations exceed their budget", () => {
    const garments: Garment[] = [];
    let id = 1;
    for (let index = 0; index < 200; index += 1) {
      garments.push(garment({
        id: id++,
        name: `运动上装 ${index + 1}`,
        category: "top",
        color: "yellow",
        styles: ["sport"],
        formality: "sport"
      }));
    }
    for (let index = 0; index < 41; index += 1) {
      garments.push(garment({
        id: id++,
        name: `运动下装 ${index + 1}`,
        category: "bottom",
        color: "green",
        styles: ["sport"],
        formality: "sport"
      }));
    }
    for (let index = 0; index < 258; index += 1) {
      garments.push(garment({
        id: id++,
        name: index === 257 ? "最佳正式连衣裙" : `运动连衣裙 ${index + 1}`,
        category: "dress",
        color: index === 257 ? "black" : "yellow",
        styles: index === 257 ? ["formal"] : ["sport"],
        formality: index === 257 ? "formal" : "sport"
      }));
    }
    const bestDressId = id - 1;
    garments.push(garment({
      id,
      name: "黑色正式鞋",
      category: "shoes",
      color: "black",
      styles: ["formal"],
      formality: "formal"
    }));

    const result = recommendOutfits({
      garments,
      weather: weather({ apparentTemperature: 18 }),
      occasion: "formal"
    });

    expect(result.outfits[0].items.some((item) => item.id === bestDressId)).toBe(true);
  });

  it("hard-filters unconfirmed, unowned, and excluded garments from outfits and alternatives", () => {
    const result = recommendOutfits({
      garments: [
        garment({ id: 1, name: "已确认上装", category: "top", color: "white" }),
        garment({ id: 2, name: "已确认下装", category: "bottom", color: "black" }),
        garment({ id: 3, name: "已确认鞋履", category: "shoes", color: "black" }),
        garment({ id: 4, name: "未确认高分上装", category: "top", color: "white", confirmed: false, confidence: 1 }),
        garment({ id: 5, name: "未拥有下装", category: "bottom", owned: false, confidence: 1 }),
        garment({ id: 6, name: "已排除鞋履", category: "shoes", excluded: true, confidence: 1 })
      ],
      weather: weather({ apparentTemperature: 18 }),
      occasion: "casual"
    });
    const forbidden = new Set([4, 5, 6]);

    expect(result.outfits).toHaveLength(1);
    expect(result.outfits.flatMap((outfit) => outfit.items)).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 4 })])
    );
    expect(result.outfits.flatMap((outfit) => outfit.alternatives).every((item) => !forbidden.has(item.id))).toBe(true);
    expect(result.missingSlots).toEqual([]);
  });

  it("returns actionable missing slots when confirmed garments cannot form a core outfit", () => {
    const onlyTop = recommendOutfits({
      garments: [
        garment({ id: 1, name: "已确认上装", category: "top" }),
        garment({ id: 2, name: "未确认下装", category: "bottom", confirmed: false }),
        garment({ id: 3, name: "已确认鞋履", category: "shoes" })
      ],
      weather: weather({ apparentTemperature: 18 }),
      occasion: "casual"
    });
    const noCore = recommendOutfits({
      garments: [garment({ id: 4, name: "已确认鞋履", category: "shoes" })],
      weather: weather({ apparentTemperature: 18 }),
      occasion: "casual"
    });

    expect(onlyTop.outfits).toEqual([]);
    expect(onlyTop.missingSlots).toEqual(["bottom", "dress"]);
    expect(noCore.outfits).toEqual([]);
    expect(noCore.missingSlots).toEqual(["top", "bottom", "dress"]);
  });

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
    expect(result.weatherScenario).toBe("cold_windy");
    expect(result.outfits[0].matchPercent).toBeGreaterThanOrEqual(0);
    expect(result.outfits[0].matchPercent).toBeLessThanOrEqual(100);
    expect(result.outfits[0].scoreBreakdown).toMatchObject({
      weatherComfort: expect.any(Number),
      season: expect.any(Number),
      occasion: expect.any(Number),
      colorHarmony: expect.any(Number),
      recentWear: expect.any(Number),
      itemConfidence: expect.any(Number),
      userPreference: expect.any(Number)
    });
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

  it("uses lightweight user preferences in scoring explanations", () => {
    const result = recommendOutfits({
      garments: [
        garment({ id: 1, name: "黑色薄衬衫", category: "top", color: "black", warmth: "light", seasons: ["spring"] }),
        garment({ id: 2, name: "深蓝直筒牛仔裤", category: "bottom", color: "blue", warmth: "medium", seasons: ["spring"] }),
        garment({ id: 3, name: "白色运动鞋", category: "shoes", color: "white", warmth: "light", seasons: ["spring"] }),
        garment({ id: 4, name: "红色针织衫", category: "top", color: "red", warmth: "warm", seasons: ["spring"] })
      ],
      weather: weather({ apparentTemperature: 16 }),
      occasion: "casual",
      userProfile: {
        temperatureSensitivity: "runs-cold",
        preferredColors: ["red"],
        avoidedColors: ["black"],
        preferredStyles: ["casual"]
      }
    });

    const outfit = result.outfits[0];
    expect(outfit.items.some((item) => item.id === 4)).toBe(true);
    expect(outfit.scoreBreakdown).toBeDefined();
    expect(outfit.scoreBreakdown!.userPreference).toBeGreaterThan(0);
    expect(outfit.reasons.join(" ")).toMatch(/偏好|怕冷|颜色/);
  });

  it("uses body proportion and skin tone profile signals in scoring explanations", () => {
    const personalProfile: PersonalProfile = {
      heightCm: 176,
      weightKg: 57,
      bodyType: "slim-tall",
      skinTone: "dark-yellow",
      colorDisposition: "cool-clean",
      temperatureSensitivity: "neutral",
      preferredColors: [],
      avoidedColors: [],
      preferredStyles: ["smart-casual"]
    };
    const result = recommendOutfits({
      garments: [
        garment({ id: 1, name: "土黄色贴身针织衫", category: "top", color: "yellow", confidence: 0.99 }),
        garment({ id: 2, name: "驼色窄腿裤", category: "bottom", color: "brown", confidence: 0.99 }),
        garment({ id: 3, name: "米色低帮鞋", category: "shoes", color: "beige", confidence: 0.99 }),
        garment({ id: 4, name: "白色挺括衬衫", category: "top", color: "white", tags: ["挺括", "层次"], confidence: 0.65 }),
        garment({ id: 5, name: "深蓝直筒牛仔裤", category: "bottom", color: "blue", tags: ["直筒"], confidence: 0.65 }),
        garment({ id: 6, name: "灰色休闲鞋", category: "shoes", color: "gray", confidence: 0.65 }),
        garment({ id: 7, name: "海军蓝轻夹克", category: "outerwear", color: "blue", tags: ["结构感"], confidence: 0.65 })
      ],
      weather: weather({ apparentTemperature: 18 }),
      occasion: "smart-casual",
      userProfile: personalProfile
    });

    expect(result.outfits[0].items.map((item) => item.id)).toEqual(expect.arrayContaining([4, 5, 6]));
    expect(result.outfits[0].scoreBreakdown).toMatchObject({
      bodyProportion: expect.any(Number),
      colorSuitability: expect.any(Number)
    });
    expect(result.outfits[0].scoreBreakdown!.bodyProportion).toBeGreaterThanOrEqual(0);
    expect(result.outfits[0].scoreBreakdown!.colorSuitability).toBeGreaterThan(0);
    expect(result.outfits[0].reasons.join(" ")).toMatch(/瘦高|肤色|黑黄|清爽|对比/);
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
