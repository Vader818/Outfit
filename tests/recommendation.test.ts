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
    ...overrides,
    availabilityStatus: overrides.availabilityStatus ?? "available"
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
      replacementIds: outfit.replacements.map((suggestion) => suggestion.replacement.id)
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
        replacementIds: [2, 3, 6]
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
        replacementIds: [1, 3, 6]
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
        replacementIds: [2, 4, 6]
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
    expect(result.outfits.flatMap((outfit) => outfit.replacements).every((suggestion) => !forbidden.has(suggestion.replacement.id))).toBe(true);
    expect(result.missingSlots).toEqual([]);
  });

  it("hard-locks included garments before candidate generation and removes explicit exclusions", () => {
    const lockedTop = garment({
      id: 20,
      name: "必须出现的低分上装",
      category: "top",
      color: "red",
      confidence: 0.1
    });
    const excludedBottom = garment({
      id: 30,
      name: "本次排除的下装",
      category: "bottom",
      color: "white",
      confidence: 1
    });
    const result = recommendOutfits({
      garments: [
        garment({ id: 1, name: "高分白上装", category: "top", color: "white", confidence: 1 }),
        lockedTop,
        garment({ id: 2, name: "保留下装", category: "bottom", color: "black" }),
        excludedBottom,
        garment({ id: 3, name: "黑鞋", category: "shoes" })
      ],
      weather: weather({ apparentTemperature: 20 }),
      occasion: "casual",
      includeGarmentIds: [lockedTop.id],
      excludeGarmentIds: [excludedBottom.id]
    });

    expect(result.outfits.length).toBeGreaterThan(0);
    expect(result.outfits.every((outfit) => outfit.items.some((item) => item.id === lockedTop.id))).toBe(true);
    expect(result.outfits.every((outfit) => outfit.items.every((item) => item.id !== excludedBottom.id))).toBe(true);
    expect(result.outfits.flatMap((outfit) => outfit.replacements).every((suggestion) => suggestion.replacement.id !== excludedBottom.id)).toBe(true);
  });

  it("forces locked optional layers even when weather or accessory slicing would omit them", () => {
    const lockedOuterwear = garment({
      id: 40,
      name: "指定外套",
      category: "outerwear",
      warmth: "heavy",
      seasons: ["winter"]
    });
    const lockedAccessory = garment({ id: 54, name: "第四件指定配饰", category: "accessory" });
    const result = recommendOutfits({
      garments: [
        garment({ id: 1, name: "白上装", category: "top" }),
        garment({ id: 2, name: "黑下装", category: "bottom" }),
        lockedOuterwear,
        garment({ id: 51, name: "配饰一", category: "accessory" }),
        garment({ id: 52, name: "配饰二", category: "accessory" }),
        garment({ id: 53, name: "配饰三", category: "accessory" }),
        lockedAccessory
      ],
      weather: summerWeather,
      occasion: "casual",
      includeGarmentIds: [lockedOuterwear.id, lockedAccessory.id]
    });

    expect(result.outfits.length).toBeGreaterThan(0);
    expect(result.outfits.every((outfit) => {
      const ids = new Set(outfit.items.map((item) => item.id));
      return ids.has(lockedOuterwear.id) && ids.has(lockedAccessory.id);
    })).toBe(true);
  });

  it("keeps every locked accessory together in every candidate without duplicates", () => {
    const lockedAccessories = [
      garment({ id: 60, name: "锁定腰带", category: "accessory", color: "black" }),
      garment({ id: 61, name: "锁定腕表", category: "accessory", color: "gray" })
    ];
    const generated = generateCandidates({
      garments: [
        garment({ id: 1, name: "白上装", category: "top", color: "white" }),
        garment({ id: 2, name: "蓝上装", category: "top", color: "blue" }),
        garment({ id: 3, name: "黑下装", category: "bottom", color: "black" }),
        garment({ id: 4, name: "灰下装", category: "bottom", color: "gray" }),
        garment({ id: 5, name: "黑鞋", category: "shoes", color: "black" }),
        ...lockedAccessories
      ],
      weather: weather({ apparentTemperature: 20 }),
      occasion: "casual",
      includeGarmentIds: lockedAccessories.map((item) => item.id)
    }, { maxEvaluatedCandidates: 40, beamWidth: 8 });

    expect(generated.candidates.length).toBeGreaterThan(0);
    expect(generated.evaluatedCandidates).toBeLessThanOrEqual(40);
    expect(generated.candidates.every((candidate) => {
      const ids = candidate.items.map((item) => item.id);
      return lockedAccessories.every((item) => ids.includes(item.id)) &&
        new Set(ids).size === ids.length;
    })).toBe(true);
  });

  it("combines multiple locked accessories with core includes and exclusions deterministically", () => {
    const garments = [
      garment({ id: 1, name: "锁定上装", category: "top", color: "white" }),
      garment({ id: 2, name: "候选上装", category: "top", color: "blue" }),
      garment({ id: 3, name: "保留下装", category: "bottom", color: "black" }),
      garment({ id: 4, name: "排除下装", category: "bottom", color: "gray" }),
      garment({ id: 10, name: "替换下装", category: "bottom", color: "blue" }),
      garment({ id: 5, name: "黑鞋", category: "shoes", color: "black" }),
      garment({ id: 6, name: "排除鞋履", category: "shoes", color: "white" }),
      garment({ id: 7, name: "锁定腰带", category: "accessory", color: "black" }),
      garment({ id: 8, name: "锁定腕表", category: "accessory", color: "gray" }),
      garment({ id: 9, name: "其他配饰", category: "accessory", color: "red" })
    ];
    const input = {
      garments,
      weather: weather({ apparentTemperature: 20 }),
      occasion: "casual",
      includeGarmentIds: [1, 7, 8],
      excludeGarmentIds: [4, 6]
    };

    const first = recommendOutfits(input);
    const second = recommendOutfits(input);

    expect(second.outfits.map((outfit) => outfit.items.map((item) => item.id))).toEqual(
      first.outfits.map((outfit) => outfit.items.map((item) => item.id))
    );
    expect(first.outfits.length).toBeGreaterThan(0);
    expect(first.outfits.every((outfit) => {
      const ids = outfit.items.map((item) => item.id);
      return [1, 7, 8].every((id) => ids.includes(id)) &&
        [4, 6].every((id) => !ids.includes(id)) &&
        new Set(ids).size === ids.length;
    })).toBe(true);
    expect(first.outfits.flatMap((outfit) => outfit.replacements).length).toBeGreaterThan(0);
    expect(first.outfits.flatMap((outfit) => outfit.replacements).every((suggestion) =>
      suggestion.targetGarmentId !== 7 &&
      suggestion.targetGarmentId !== 8 &&
      suggestion.nextItems.some((item) => item.id === 7) &&
      suggestion.nextItems.some((item) => item.id === 8)
    )).toBe(true);
  });

  it("keeps a late locked core item inside a bounded large-wardrobe beam", () => {
    const garments: Garment[] = [];
    for (let index = 0; index < 250; index += 1) {
      garments.push(garment({
        id: index + 1,
        name: `上装 ${index + 1}`,
        category: "top",
        confidence: index === 249 ? 0.1 : 1
      }));
      garments.push(garment({
        id: index + 1001,
        name: `下装 ${index + 1}`,
        category: "bottom"
      }));
    }
    const lockedTopId = 250;
    const generated = generateCandidates({
      garments,
      weather: weather({ apparentTemperature: 20 }),
      occasion: "casual",
      includeGarmentIds: [lockedTopId]
    }, { maxEvaluatedCandidates: 120, beamWidth: 12 });

    expect(generated.candidates.length).toBeGreaterThan(0);
    expect(generated.candidates.every((candidate) => candidate.items.some((item) => item.id === lockedTopId))).toBe(true);
    expect(generated.evaluatedCandidates).toBeLessThanOrEqual(120);
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

  it("reports unavailable garment counts alongside compatible missing slot categories", () => {
    const result = recommendOutfits({
      garments: [
        garment({ id: 1, name: "可用上装", category: "top", availabilityStatus: "available" }),
        garment({ id: 2, name: "待洗下装", category: "bottom", availabilityStatus: "laundry" }),
        garment({ id: 3, name: "维修连衣裙", category: "dress", availabilityStatus: "repair" }),
        garment({ id: 4, name: "可用鞋履", category: "shoes", availabilityStatus: "available" })
      ],
      weather: weather({ apparentTemperature: 18 }),
      occasion: "casual"
    });

    expect(result.outfits).toEqual([]);
    expect(result.missingSlots).toEqual(["bottom", "dress"]);
    expect(result.missingSlotDetails).toEqual([
      { slot: "bottom", unavailableCount: 1 },
      { slot: "dress", unavailableCount: 1 }
    ]);
  });

  it.each(["laundry", "repair", "loaned", "packed"] as const)(
    "hard filters %s garments from outfits and replacements",
    (availabilityStatus) => {
      const result = recommendOutfits({
        garments: [
          garment({ id: 1, name: "可用上装", category: "top", availabilityStatus: "available" }),
          garment({ id: 2, name: "可用下装", category: "bottom", availabilityStatus: "available" }),
          garment({ id: 3, name: "可用鞋履", category: "shoes", availabilityStatus: "available" }),
          garment({ id: 4, name: "不可用备选上装", category: "top", availabilityStatus })
        ],
        weather: weather({ apparentTemperature: 18 }),
        occasion: "casual"
      });

      expect(result.outfits.length).toBeGreaterThan(0);
      expect(result.outfits.flatMap((outfit) => outfit.items).some((item) => item.id === 4)).toBe(false);
      expect(result.outfits.flatMap((outfit) => outfit.replacements).some((item) => item.replacement.id === 4)).toBe(false);
    }
  );

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
    expect(result.outfits[0].replacements.length).toBeGreaterThan(0);
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

  it("keeps learned preference at zero below three evidence rows and applies the exact bounded formula at threshold", () => {
    const garments = [
      garment({ id: 1, name: "上装", category: "top" }),
      garment({ id: 2, name: "下装", category: "bottom" }),
      garment({ id: 3, name: "鞋履", category: "shoes" })
    ];
    const common = {
      garments,
      weather: weather({ apparentTemperature: 18 }),
      occasion: "casual" as const
    };
    const belowThreshold = recommendOutfits({
      ...common,
      pairStats: [{
        garmentAId: 1,
        garmentBId: 2,
        likes: 2,
        dislikes: 0,
        wornCount: 0,
        totalFeedback: 2,
        signal: 2,
        updatedAt: "2026-07-12T00:00:00.000Z"
      }]
    });
    const atThreshold = recommendOutfits({
      ...common,
      pairStats: [{
        garmentAId: 1,
        garmentBId: 2,
        likes: 3,
        dislikes: 0,
        wornCount: 0,
        totalFeedback: 3,
        signal: 3,
        updatedAt: "2026-07-12T00:00:00.000Z"
      }]
    });

    expect(belowThreshold.outfits[0].scoreBreakdown?.learnedPreference).toBe(0);
    expect(atThreshold.outfits[0].scoreBreakdown?.learnedPreference).toBe(2.4);
    expect(atThreshold.outfits[0].score - belowThreshold.outfits[0].score).toBeCloseTo(2.4, 5);
  });

  it("caps the sum of learned pair bonuses to minus eight through plus eight", () => {
    const garments = [
      garment({ id: 1, name: "上装", category: "top" }),
      garment({ id: 2, name: "下装", category: "bottom" }),
      garment({ id: 3, name: "鞋履", category: "shoes" })
    ];
    const stats = [[1, 2], [1, 3], [2, 3]].map(([garmentAId, garmentBId]) => ({
      garmentAId,
      garmentBId,
      likes: 5,
      dislikes: 0,
      wornCount: 0,
      totalFeedback: 5,
      signal: 5,
      updatedAt: "2026-07-12T00:00:00.000Z"
    }));
    const positive = recommendOutfits({
      garments,
      weather: weather({ apparentTemperature: 18 }),
      occasion: "casual",
      pairStats: stats
    });
    const negative = recommendOutfits({
      garments,
      weather: weather({ apparentTemperature: 18 }),
      occasion: "casual",
      pairStats: stats.map((stat) => ({
        ...stat,
        likes: 0,
        dislikes: 5,
        signal: -10
      }))
    });

    expect(positive.outfits[0].scoreBreakdown?.learnedPreference).toBe(8);
    expect(negative.outfits[0].scoreBreakdown?.learnedPreference).toBe(-8);
  });

  it("uses learned preference to reorder otherwise equivalent candidate pairs", () => {
    const result = recommendOutfits({
      garments: [
        garment({ id: 1, name: "默认上装", category: "top" }),
        garment({ id: 2, name: "下装", category: "bottom" }),
        garment({ id: 3, name: "鞋履", category: "shoes" }),
        garment({ id: 4, name: "偏好上装", category: "top" })
      ],
      weather: weather({ apparentTemperature: 18 }),
      occasion: "casual",
      pairStats: [{
        garmentAId: 2,
        garmentBId: 4,
        likes: 3,
        dislikes: 0,
        wornCount: 0,
        totalFeedback: 3,
        signal: 3,
        updatedAt: "2026-07-12T00:00:00.000Z"
      }]
    });

    expect(result.outfits[0].items.some((item) => item.id === 4)).toBe(true);
    expect(result.outfits[0].scoreBreakdown?.learnedPreference).toBe(2.4);
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

  it("returns structured replacements with target, next outfit, score delta, and reasons", () => {
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

    const outfit = result.outfits[0];
    const replacementIdsByTargetCategory = outfit.replacements.reduce<Record<GarmentCategory, number[]>>((groups, suggestion) => {
      const target = outfit.items.find((item) => item.id === suggestion.targetGarmentId);
      if (!target) throw new Error("replacement target missing from original outfit");
      groups[target.category] = [...(groups[target.category] ?? []), suggestion.replacement.id];
      return groups;
    }, {} as Record<GarmentCategory, number[]>);

    expect(outfit.replacements.length).toBeGreaterThan(0);
    for (const suggestion of outfit.replacements) {
      const target = outfit.items.find((item) => item.id === suggestion.targetGarmentId);
      expect(target).toBeDefined();
      expect(suggestion.replacement.category).toBe(target!.category);
      expect(outfit.items.some((item) => item.id === suggestion.replacement.id)).toBe(false);
      expect(suggestion.nextItems).toHaveLength(outfit.items.length);
      expect(suggestion.nextItems.filter((item, index) => item.id !== outfit.items[index].id)).toEqual([
        suggestion.replacement
      ]);
      expect(suggestion.matchPercentDelta).toEqual(expect.any(Number));
      expect(suggestion.reasons.length).toBeGreaterThan(0);
    }
    expect(replacementIdsByTargetCategory.top[0]).toBe(5);
  });

  it("does not offer replacing a locked core garment", () => {
    const result = recommendOutfits({
      garments: [
        garment({ id: 1, name: "锁定上装", category: "top" }),
        garment({ id: 2, name: "替代上装", category: "top", color: "white" }),
        garment({ id: 3, name: "黑色长裤", category: "bottom" }),
        garment({ id: 4, name: "灰色长裤", category: "bottom", color: "gray" })
      ],
      weather: weather({ apparentTemperature: 20 }),
      occasion: "casual",
      includeGarmentIds: [1]
    });

    expect(result.outfits.every((outfit) => outfit.items.some((item) => item.id === 1))).toBe(true);
    expect(result.outfits.flatMap((outfit) => outfit.replacements).every((suggestion) =>
      suggestion.targetGarmentId !== 1 && suggestion.nextItems.some((item) => item.id === 1)
    )).toBe(true);
  });
});
