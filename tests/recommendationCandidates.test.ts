import { describe, expect, it } from "vitest";
import { createDatabase } from "../server/db";
import {
  attachCandidateIdentities,
  createOutfitSignature,
  persistRecommendationSnapshot
} from "../server/services/recommendationCandidates";
import type { Garment, RecommendationScoreBreakdown, WeatherSnapshot } from "../src/shared/types";

function garment(id: number, category: Garment["category"], name = `${category}-${id}`): Garment {
  return {
    id,
    origin: "manual",
    brand: "",
    name,
    rawName: name,
    category,
    color: "black",
    warmth: "medium",
    seasons: ["spring"],
    styles: ["casual"],
    formality: "casual",
    imageUrl: "",
    owned: true,
    confirmed: true,
    excluded: false,
    availabilityStatus: "available",
    confidence: 0.8
  };
}

const weather: WeatherSnapshot = {
  date: "2026-04-12",
  temperature: 18,
  apparentTemperature: 18,
  precipitationProbability: 10,
  windSpeed: 8,
  weatherCode: 1,
  summary: "晴"
};

const scoreBreakdown: RecommendationScoreBreakdown = {
  slotCompleteness: 20,
  weatherComfort: 7,
  season: 12,
  occasion: 21,
  pairCompatibility: 10,
  colorHarmony: 12,
  recentWear: 0,
  itemConfidence: 8,
  userPreference: 0,
  bodyProportion: 0,
  colorSuitability: 0,
  learnedPreference: 0
};

function draft(items: Garment[], score = 90) {
  return {
    score,
    matchPercent: 75,
    scoreBreakdown,
    items,
    reasons: ["测试理由"],
    replacements: []
  };
}

describe("recommendation candidate identities", () => {
  it("builds a stable full-outfit signature independent of input order", () => {
    const items = [
      garment(1, "top"),
      garment(2, "bottom"),
      garment(3, "outerwear"),
      garment(4, "shoes"),
      garment(5, "accessory")
    ];
    const signature = createOutfitSignature(items);

    expect(signature).toMatch(/^[a-f0-9]{64}$/);
    expect(createOutfitSignature([...items].reverse())).toBe(signature);
    expect(createOutfitSignature(items.map((item) => item.category === "shoes" ? garment(40, "shoes") : item))).not.toBe(signature);
    expect(createOutfitSignature(items.map((item) => item.category === "outerwear" ? garment(30, "outerwear") : item))).not.toBe(signature);
    expect(createOutfitSignature(items.map((item) => item.category === "accessory" ? garment(50, "accessory") : item))).not.toBe(signature);
  });

  it("uses a global candidate UUID while keeping the signature stable across runs", () => {
    const items = [garment(1, "top"), garment(2, "bottom"), garment(3, "shoes")];
    const ids = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222"
    ];
    const first = attachCandidateIdentities([draft(items)], () => ids[0])[0];
    const second = attachCandidateIdentities([draft([...items].reverse(), 40)], () => ids[1])[0];

    expect(first.id).toBe(ids[0]);
    expect(first.candidateId).toBe(ids[0]);
    expect(second.candidateId).toBe(ids[1]);
    expect(first.outfitSignature).toBe(second.outfitSignature);
  });

  it("rolls back the run and all candidates when candidate persistence fails", () => {
    const db = createDatabase(":memory:");
    const duplicateId = "33333333-3333-4333-8333-333333333333";
    const outfits = attachCandidateIdentities([
      draft([garment(1, "top"), garment(2, "bottom")]),
      draft([garment(4, "dress")], 80)
    ], () => duplicateId);

    expect(() => persistRecommendationSnapshot(db, { occasion: "casual" }, {
      weather,
      occasion: "casual",
      missingSlots: [],
      outfits
    })).toThrow();

    expect(db.prepare("SELECT COUNT(*) AS count FROM recommendation_runs").get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM recommendation_candidates").get()).toEqual({ count: 0 });
  });
});
