import { describe, expect, it } from "vitest";
import {
  optimizeTrip,
  type TripOptimizationInput,
  type TripOptimizationSlot,
  type TripSelection
} from "../server/services/tripOptimizer";
import type { Formality, Garment, GarmentCategory, WeatherSnapshot } from "../src/shared/types";

function garment(
  id: number,
  category: GarmentCategory,
  overrides: Partial<Garment> = {}
): Garment {
  const formality = overrides.formality ?? "casual";
  return {
    id,
    origin: "manual",
    name: `${category}-${id}`,
    brand: "",
    category,
    color: "black",
    warmth: "medium",
    seasons: ["spring", "summer", "autumn", "winter"],
    styles: [formality],
    formality,
    imageUrl: "",
    owned: true,
    confirmed: true,
    excluded: false,
    confidence: 0.8,
    rawName: `${category}-${id}`,
    availabilityStatus: "available",
    ...overrides
  };
}

function weather(overrides: Partial<WeatherSnapshot> = {}): WeatherSnapshot {
  return {
    date: "2026-08-01",
    temperature: 20,
    apparentTemperature: 20,
    precipitationProbability: 10,
    windSpeed: 8,
    weatherCode: 1,
    summary: "晴",
    ...overrides
  };
}

function activity(
  id: number,
  date: string,
  formality: Formality = "casual",
  occasion: string = formality,
  snapshot = weather({ date })
) {
  return { id, occasion, formality, weather: snapshot };
}

function slot(
  id: string,
  date: string,
  includeGarmentIds: readonly number[],
  activities = [activity(Number(id.replace(/\D/g, "")) || 1, date)]
): TripOptimizationSlot {
  return { id, date, activities, includeGarmentIds };
}

function input(
  garments: readonly Garment[],
  slots: readonly TripOptimizationSlot[],
  overrides: Partial<TripOptimizationInput["constraints"]> = {},
  extra: Partial<Omit<TripOptimizationInput, "garments" | "slots" | "constraints">> = {}
): TripOptimizationInput {
  return {
    garments,
    slots,
    constraints: {
      maxGarments: 30,
      maxShoes: 4,
      repeatPolicy: "allow",
      maxCoreWearsBetweenLaundry: 3,
      ...overrides
    },
    ...extra
  };
}

describe("optimizeTrip", () => {
  it("generates a stable Top 12 within the M0 budget", () => {
    const garments = [
      ...Array.from({ length: 16 }, (_, index) => garment(index + 1, "dress")),
      garment(100, "shoes")
    ];
    const result = optimizeTrip(input(garments, [{
      id: "slot-1",
      date: "2026-08-01",
      activities: [activity(1, "2026-08-01")]
    }]));

    expect(result.status).toBe("feasible");
    expect(result.diagnostics.candidateCountsBySlot).toEqual({ "slot-1": 12 });
    expect(result.diagnostics.maxCandidatesPerSlot).toBe(12);
    expect(result.diagnostics.maxEvaluatedCandidatesPerSlot).toBeLessThanOrEqual(20_000);
    if (result.status !== "feasible") return;
    expect(result.selections).toHaveLength(1);
    expect(result.selections[0].activityEvaluations).toHaveLength(1);
  });

  it("evaluates every shared activity, applies hard thresholds, and uses the lowest score", () => {
    const shared = [
      garment(1, "top", { formality: "smart-casual", styles: ["smart-casual"] }),
      garment(2, "bottom", { formality: "smart-casual", styles: ["smart-casual"] }),
      garment(3, "shoes", { formality: "smart-casual", styles: ["smart-casual"] })
    ];
    const result = optimizeTrip(input(shared, [{
      id: "shared",
      date: "2026-08-01",
      activities: [
        activity(1, "2026-08-01", "casual", "步行"),
        activity(2, "2026-08-01", "formal", "晚宴")
      ]
    }]));

    expect(result.status).toBe("feasible");
    if (result.status !== "feasible") return;
    const selected = result.selections[0];
    expect(selected.activityEvaluations).toHaveLength(2);
    expect(selected.score).toBe(Math.min(...selected.activityEvaluations.map((item) => item.score)));
    expect(selected.limitingActivityId).toEqual(expect.any(Number));

    const mismatch = shared.map((item) => ({
      ...item,
      formality: "sport" as const,
      styles: ["sport"] as Formality[]
    }));
    const rejected = optimizeTrip(input(mismatch, [{
      id: "formal",
      date: "2026-08-01",
      activities: [activity(3, "2026-08-01", "formal", "典礼")]
    }]));
    expect(rejected.status).toBe("infeasible");
    if (rejected.status === "infeasible") {
      expect(rejected.conflicts.map((item) => item.code)).toContain("OCCASION_THRESHOLD");
    }
  });

  it("uses the shared minimum score while pruning the M0 generation beam", () => {
    const casualDresses = Array.from({ length: 120 }, (_, index) => garment(
      index + 1,
      "dress",
      { formality: "casual", styles: ["casual"] }
    ));
    const bridgeDress = garment(121, "dress", {
      formality: "smart-casual",
      styles: ["smart-casual"]
    });
    const bridgeShoes = garment(500, "shoes", {
      formality: "smart-casual",
      styles: ["smart-casual"]
    });
    const result = optimizeTrip(input(
      [...casualDresses, bridgeDress, bridgeShoes],
      [{
        id: "shared-beam",
        date: "2026-08-01",
        activities: [
          activity(1, "2026-08-01", "casual", "白天"),
          activity(2, "2026-08-01", "formal", "晚宴")
        ]
      }]
    ));

    expect(result.status).toBe("feasible");
    if (result.status !== "feasible") return;
    expect(result.selections[0].items.map((item) => item.id)).toContain(bridgeDress.id);
  });

  it("requires a core foundation and shoes, plus outerwear at or below 8 degrees", () => {
    const coldWithoutOuterwear = [
      garment(1, "top", { warmth: "heavy" }),
      garment(2, "bottom", { warmth: "heavy" }),
      garment(3, "shoes", { warmth: "heavy" })
    ];
    const coldSlot: TripOptimizationSlot = {
      id: "cold",
      date: "2026-01-01",
      activities: [activity(1, "2026-01-01", "casual", "户外", weather({
        date: "2026-01-01",
        apparentTemperature: 4,
        temperature: 5
      }))]
    };
    const cold = optimizeTrip(input(coldWithoutOuterwear, [coldSlot]));
    expect(cold.status).toBe("infeasible");
    if (cold.status === "infeasible") {
      expect(cold.conflicts.map((item) => item.code)).toContain("WEATHER_THRESHOLD");
    }

    const noShoes = optimizeTrip(input(coldWithoutOuterwear.slice(0, 2), [{
      id: "no-shoes",
      date: "2026-08-01",
      activities: [activity(2, "2026-08-01")]
    }]));
    expect(noShoes.status).toBe("infeasible");
    if (noShoes.status === "infeasible") {
      expect(noShoes.conflicts.map((item) => item.code)).toContain("REQUIRED_SLOTS");
    }
  });

  it.each([
    ["allow", [1, 2, 1], true],
    ["no-consecutive-core", [1, 2, 1], true],
    ["no-consecutive-core", [1, 1], false],
    ["no-repeat-core", [1, 2, 1], false]
  ] as const)("enforces repeat policy %s for foundations %j", (repeatPolicy, foundations, feasible) => {
    const garments = [
      garment(1, "dress"),
      garment(2, "dress"),
      garment(10, "shoes")
    ];
    const slots = foundations.map((foundationId, index) => slot(
      `day-${index + 1}`,
      `2026-08-0${index + 1}`,
      [foundationId, 10]
    ));
    const result = optimizeTrip(input(garments, slots, {
      repeatPolicy,
      maxCoreWearsBetweenLaundry: 3
    }));

    expect(result.status).toBe(feasible ? "feasible" : "infeasible");
    if (!feasible && result.status === "infeasible") {
      expect(result.conflicts.map((item) => item.code)).toContain("REPEAT_POLICY");
    }
  });

  it("counts each independent use, resets wear counts before laundry day, and never relaxes no-repeat", () => {
    const garments = [garment(1, "dress"), garment(10, "shoes")];
    const threeDays = [1, 2, 3].map((day) => slot(
      `day-${day}`,
      `2026-08-0${day}`,
      [1, 10]
    ));

    const withoutLaundry = optimizeTrip(input(garments, threeDays, {
      maxCoreWearsBetweenLaundry: 2
    }));
    expect(withoutLaundry.status).toBe("infeasible");
    if (withoutLaundry.status === "infeasible") {
      expect(withoutLaundry.conflicts.map((item) => item.code)).toContain("LAUNDRY_WEAR_LIMIT");
    }

    const withLaundry = optimizeTrip(input(garments, threeDays, {
      maxCoreWearsBetweenLaundry: 2,
      laundryDay: "2026-08-03"
    }));
    expect(withLaundry.status).toBe("feasible");

    const noRepeat = optimizeTrip(input(garments, threeDays, {
      repeatPolicy: "no-repeat-core",
      maxCoreWearsBetweenLaundry: 2,
      laundryDay: "2026-08-02"
    }));
    expect(noRepeat.status).toBe("infeasible");
    if (noRepeat.status === "infeasible") {
      expect(noRepeat.conflicts.map((item) => item.code)).toContain("REPEAT_POLICY");
    }

    const sameDaySeparate = optimizeTrip(input(garments, [
      slot("morning", "2026-08-01", [1, 10], [activity(11, "2026-08-01", "casual", "通勤")]),
      slot("evening", "2026-08-01", [1, 10], [activity(12, "2026-08-01", "casual", "晚餐")])
    ], { maxCoreWearsBetweenLaundry: 1 }));
    expect(sameDaySeparate.status).toBe("infeasible");
  });

  it("treats a shared slot as one wear and records every covered activity", () => {
    const garments = [garment(1, "dress"), garment(10, "shoes")];
    const result = optimizeTrip(input(garments, [{
      id: "shared-day",
      date: "2026-08-01",
      activities: [
        activity(1, "2026-08-01", "casual", "通勤"),
        activity(2, "2026-08-01", "casual", "晚餐")
      ],
      includeGarmentIds: [1, 10]
    }], { maxCoreWearsBetweenLaundry: 1 }));

    expect(result.status).toBe("feasible");
    if (result.status !== "feasible") return;
    expect(result.selections).toHaveLength(1);
    expect(result.selections[0].activityIds).toEqual([1, 2]);
    expect(result.packingItems.find((item) => item.garmentId === 1)?.activityIds).toEqual([1, 2]);
  });

  it("enforces maxGarments including shoes and maxShoes with minimum relaxations", () => {
    const garments = [
      garment(1, "dress"),
      garment(2, "dress"),
      garment(10, "shoes"),
      garment(11, "shoes")
    ];
    const slots = [
      slot("day-1", "2026-08-01", [1, 10]),
      slot("day-2", "2026-08-02", [2, 11])
    ];
    const shoeLimited = optimizeTrip(input(garments, slots, { maxShoes: 1 }));
    expect(shoeLimited.status).toBe("infeasible");
    if (shoeLimited.status === "infeasible") {
      expect(shoeLimited.conflicts.map((item) => item.code)).toContain("MAX_SHOES");
      expect(shoeLimited.relaxations).toEqual(expect.arrayContaining([
        expect.objectContaining({ constraint: "maxShoes", suggestedValue: 2 })
      ]));
    }

    const garmentLimited = optimizeTrip(input(garments, [slots[0]], { maxGarments: 1 }));
    expect(garmentLimited.status).toBe("infeasible");
    if (garmentLimited.status === "infeasible") {
      expect(garmentLimited.conflicts.map((item) => item.code)).toContain("MAX_GARMENTS");
      expect(garmentLimited.relaxations).toEqual(expect.arrayContaining([
        expect.objectContaining({ constraint: "maxGarments", suggestedValue: 2 })
      ]));
    }
  });

  it("verifies repeat and garment relaxations against the complete trip", () => {
    const sharedShoe = garment(10, "shoes");
    const oneDress = garment(1, "dress");
    const repeatInput = input(
      [oneDress, sharedShoe],
      [
        slot("repeat-1", "2026-08-01", [1, 10]),
        slot("repeat-2", "2026-08-02", [1, 10])
      ],
      { repeatPolicy: "no-repeat-core", maxCoreWearsBetweenLaundry: 3 }
    );
    const repeatResult = optimizeTrip(repeatInput);
    expect(repeatResult.status).toBe("infeasible");
    if (repeatResult.status !== "infeasible") return;
    const repeatRelaxation = repeatResult.relaxations.find((item) => item.constraint === "repeatPolicy")!;
    expect(repeatRelaxation).toEqual(expect.objectContaining({ suggestedValue: "allow", guaranteed: true }));
    expect(optimizeTrip({
      ...repeatInput,
      constraints: { ...repeatInput.constraints, repeatPolicy: repeatRelaxation.suggestedValue as "allow" }
    }).status).toBe("feasible");

    const garments = [garment(1, "dress"), garment(2, "dress"), garment(3, "dress"), sharedShoe];
    const garmentInput = input(garments, [
      slot("garment-1", "2026-08-01", [1, 10]),
      slot("garment-2", "2026-08-02", [2, 10]),
      slot("garment-3", "2026-08-03", [3, 10])
    ], { maxGarments: 2 });
    const garmentResult = optimizeTrip(garmentInput);
    expect(garmentResult.status).toBe("infeasible");
    if (garmentResult.status !== "infeasible") return;
    const garmentRelaxation = garmentResult.relaxations.find((item) => item.constraint === "maxGarments")!;
    expect(garmentRelaxation).toEqual(expect.objectContaining({ suggestedValue: 4, guaranteed: true }));
    expect(optimizeTrip({
      ...garmentInput,
      constraints: { ...garmentInput.constraints, maxGarments: Number(garmentRelaxation.suggestedValue) }
    }).status).toBe("feasible");
  });

  it("never describes a higher occasion threshold as a reduction", () => {
    const casual = [
      garment(1, "dress", { formality: "casual", styles: ["casual"] }),
      garment(10, "shoes", { formality: "casual", styles: ["casual"] })
    ];
    const result = optimizeTrip(input(casual, [{
      id: "mixed-occasion",
      date: "2026-08-01",
      activities: [
        activity(1, "2026-08-01", "casual", "步行"),
        activity(2, "2026-08-01", "formal", "晚宴")
      ]
    }]));

    expect(result.status).toBe("infeasible");
    if (result.status !== "infeasible") return;
    const relaxation = result.relaxations.find((item) => item.constraint === "occasionPerItem")!;
    expect(relaxation).toEqual(expect.objectContaining({ guaranteed: false }));
    if (typeof relaxation.suggestedValue === "number") {
      expect(relaxation.suggestedValue).toBeLessThanOrEqual(2);
    }
  });

  it("caps the cross-slot beam at 100 after expanding two Top 12 pools", () => {
    const firstDresses = Array.from({ length: 12 }, (_, index) => garment(index + 1, "dress"));
    const secondDresses = Array.from({ length: 12 }, (_, index) => garment(index + 101, "dress"));
    const garments = [...firstDresses, ...secondDresses, garment(500, "shoes")];
    const result = optimizeTrip(input(garments, [
      {
        id: "first",
        date: "2026-08-01",
        activities: [activity(1, "2026-08-01")],
        excludeGarmentIds: secondDresses.map((item) => item.id)
      },
      {
        id: "second",
        date: "2026-08-02",
        activities: [activity(2, "2026-08-02")],
        excludeGarmentIds: firstDresses.map((item) => item.id)
      }
    ]));

    expect(result.status).toBe("feasible");
    expect(result.diagnostics.candidateCountsBySlot).toEqual({ first: 12, second: 12 });
    expect(result.diagnostics.maxBeamSize).toBe(100);
  });

  it("supports a locked replacement with an immutable prefix and local suffix recalculation", () => {
    const garments = [
      garment(1, "dress"),
      garment(2, "dress"),
      garment(3, "dress"),
      garment(10, "shoes")
    ];
    const prefix: TripSelection = {
      slotId: "day-1",
      date: "2026-08-01",
      activityIds: [1],
      occasionKeys: ["casual"],
      candidateKey: "prefix",
      items: [garments[0], garments[3]],
      score: 100,
      reasons: ["已锁定前缀"],
      activityEvaluations: [],
      limitingActivityId: 1
    };
    const prefixSnapshot = structuredClone(prefix);
    const result = optimizeTrip(input(
      garments,
      [
        {
          id: "day-1",
          date: "2026-08-01",
          activities: [activity(1, "2026-08-01")]
        },
        {
          id: "day-2",
          date: "2026-08-02",
          activities: [activity(2, "2026-08-02")]
        }
      ],
      {},
      {
        prefix: [prefix],
        lockedGarmentIdsBySlot: { "day-2": [3, 10] }
      }
    ));

    expect(result.status).toBe("feasible");
    expect(prefix).toEqual(prefixSnapshot);
    if (result.status !== "feasible") return;
    expect(result.selections[0]).toEqual(prefixSnapshot);
    expect(result.selections[1].items.map((item) => item.id)).toEqual(expect.arrayContaining([3, 10]));
  });

  it("does not mutate garments or global availability and never returns a violating fallback", () => {
    const garments = [
      garment(1, "dress"),
      garment(2, "dress", { availabilityStatus: "laundry" }),
      garment(10, "shoes")
    ];
    const before = structuredClone(garments);
    const result = optimizeTrip(input(garments, [slot("blocked", "2026-08-01", [2, 10])]));

    expect(result.status).toBe("infeasible");
    expect(garments).toEqual(before);
    if (result.status === "infeasible") {
      expect(result).not.toHaveProperty("selections");
      expect(result.conflicts.map((item) => item.code)).toContain("LOCKED_GARMENT");
    }
  });
});
