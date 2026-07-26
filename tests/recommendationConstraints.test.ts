import { describe, expect, it } from "vitest";
import { validateRecommendationConstraints } from "../server/services/recommendationConstraints";
import { ValidationError, validateRecommendationRequest } from "../server/validation";
import type {
  Garment,
  GarmentCategory,
  RecommendationConstraintIssue,
  RecommendationRequest,
  WeatherSnapshot
} from "../src/shared/types";

const weather: WeatherSnapshot = {
  date: "2026-07-11",
  temperature: 27,
  apparentTemperature: 29,
  precipitationProbability: 20,
  windSpeed: 8,
  weatherCode: 1,
  summary: "晴"
};

function request(overrides: Partial<RecommendationRequest> = {}): RecommendationRequest {
  return {
    weather,
    occasion: "casual",
    recentlyWornGarmentIds: [],
    ...overrides
  };
}

function garment(
  id: number,
  category: GarmentCategory,
  overrides: Partial<Garment> = {}
): Garment {
  return {
    id,
    origin: "manual",
    brand: "",
    name: `${category}-${id}`,
    rawName: `${category}-${id}`,
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
    confidence: 0.8,
    ...overrides,
    availabilityStatus: overrides.availabilityStatus ?? "available"
  };
}

function captureValidationError(callback: () => unknown): ValidationError {
  try {
    callback();
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    return error as ValidationError;
  }
  throw new Error("Expected ValidationError");
}

function expectIssues(error: ValidationError, issues: RecommendationConstraintIssue[]): void {
  expect(error).toMatchObject({
    code: "VALIDATION_ERROR",
    status: 400,
    details: { issues }
  });
}

describe("recommendation constraint request validation", () => {
  it("preserves omitted fields while keeping the M0 sanitization contract", () => {
    const result = validateRecommendationRequest({
      weather,
      occasion: "casual",
      recentlyWornGarmentIds: ["bad", 7, 7, 0],
      debugToken: "ignored",
      candidateId: "client-forged"
    });

    expect(result.recentlyWornGarmentIds).toEqual([7]);
    expect(result).not.toHaveProperty("includeGarmentIds");
    expect(result).not.toHaveProperty("excludeGarmentIds");
    expect(result).not.toHaveProperty("debugToken");
    expect(result).not.toHaveProperty("candidateId");
  });

  it.each([
    ["temperature", null],
    ["apparentTemperature", "29"],
    ["precipitationProbability", true],
    ["windSpeed", ""],
    ["weatherCode", {}]
  ] as const)("rejects a non-numeric weather.%s value instead of coercing it", (field, value) => {
    expect(() => validateRecommendationRequest({
      weather: { ...weather, [field]: value }
    })).toThrow(new ValidationError(`weather.${field} 必须是数字`));
  });

  it("rejects an impossible recommendation weather calendar date", () => {
    expect(() => validateRecommendationRequest({
      weather: { ...weather, date: "2026-02-30" }
    })).toThrow(new ValidationError("weather.date 必须是真实日历日期"));
  });

  it("accepts present constraint arrays containing one through twenty-four positive safe integers", () => {
    const includeGarmentIds = Array.from({ length: 24 }, (_, index) => index + 1);
    const result = validateRecommendationRequest({
      weather,
      includeGarmentIds,
      excludeGarmentIds: [Number.MAX_SAFE_INTEGER]
    });

    expect(result.includeGarmentIds).toEqual(includeGarmentIds);
    expect(result.excludeGarmentIds).toEqual([Number.MAX_SAFE_INTEGER]);
  });

  it.each([
    ["includeGarmentIds", null],
    ["includeGarmentIds", "1"],
    ["includeGarmentIds", []],
    ["excludeGarmentIds", {}],
    ["excludeGarmentIds", []]
  ] as const)("rejects an invalid or empty %s array", (field, value) => {
    const error = captureValidationError(() => validateRecommendationRequest({
      weather,
      [field]: value
    }));

    expectIssues(error, [{ field, reason: "INVALID_ARRAY" }]);
  });

  it("rejects more than twenty-four IDs with a structured issue", () => {
    const error = captureValidationError(() => validateRecommendationRequest({
      weather,
      includeGarmentIds: Array.from({ length: 25 }, (_, index) => index + 1)
    }));

    expectIssues(error, [{ field: "includeGarmentIds", reason: "TOO_MANY" }]);
  });

  it("aggregates invalid IDs from both fields", () => {
    const error = captureValidationError(() => validateRecommendationRequest({
      weather,
      includeGarmentIds: [0, 1.5, "2"],
      excludeGarmentIds: [-1, Number.MAX_SAFE_INTEGER + 1]
    }));

    expectIssues(error, [
      { field: "includeGarmentIds", garmentId: 0, reason: "INVALID_ID" },
      { field: "includeGarmentIds", garmentId: 1.5, reason: "INVALID_ID" },
      { field: "includeGarmentIds", reason: "INVALID_ID" },
      { field: "excludeGarmentIds", garmentId: -1, reason: "INVALID_ID" },
      {
        field: "excludeGarmentIds",
        garmentId: Number.MAX_SAFE_INTEGER + 1,
        reason: "INVALID_ID"
      }
    ]);
  });

  it("aggregates duplicate IDs without silently deduplicating them", () => {
    const error = captureValidationError(() => validateRecommendationRequest({
      weather,
      includeGarmentIds: [1, 1, 2, 1],
      excludeGarmentIds: [3, 3]
    }));

    expectIssues(error, [
      { field: "includeGarmentIds", garmentId: 1, reason: "DUPLICATE" },
      { field: "excludeGarmentIds", garmentId: 3, reason: "DUPLICATE" }
    ]);
  });

  it("reports include/exclude intersections without accepting an ambiguous request", () => {
    const error = captureValidationError(() => validateRecommendationRequest({
      weather,
      includeGarmentIds: [1, 2],
      excludeGarmentIds: [2, 3]
    }));

    expectIssues(error, [{
      field: "includeGarmentIds",
      garmentId: 2,
      reason: "INCLUDE_EXCLUDE_CONFLICT"
    }]);
  });
});

describe("recommendation constraint wardrobe validation", () => {
  it("returns trusted include and exclude IDs when every referenced garment is eligible", () => {
    const constraints = validateRecommendationConstraints(
      [garment(1, "top"), garment(2, "bottom"), garment(3, "shoes")],
      request({ includeGarmentIds: [1, 2], excludeGarmentIds: [3] })
    );

    expect(constraints).toEqual({
      includeGarmentIds: [1, 2],
      excludeGarmentIds: [3]
    });
  });

  it("accepts multiple accessories because the accessory slot is multi-value", () => {
    const constraints = validateRecommendationConstraints(
      [
        garment(1, "top"),
        garment(2, "bottom"),
        garment(3, "accessory"),
        garment(4, "accessory")
      ],
      request({ includeGarmentIds: [1, 3, 4] })
    );

    expect(constraints.includeGarmentIds).toEqual([1, 3, 4]);
  });

  it("aggregates missing and ineligible garment states in stable request order", () => {
    const allGarments = [
      garment(2, "top", { owned: false }),
      garment(3, "bottom", { archivedAt: "2026-07-10T00:00:00.000Z" }),
      garment(4, "shoes", { confirmed: false }),
      garment(5, "outerwear", { excluded: true })
    ];
    const error = captureValidationError(() => validateRecommendationConstraints(
      allGarments,
      request({ includeGarmentIds: [1, 2, 3], excludeGarmentIds: [4, 5] })
    ));

    expectIssues(error, [
      { field: "includeGarmentIds", garmentId: 1, reason: "NOT_FOUND" },
      { field: "includeGarmentIds", garmentId: 2, reason: "NOT_OWNED" },
      { field: "includeGarmentIds", garmentId: 3, reason: "ARCHIVED" },
      { field: "excludeGarmentIds", garmentId: 4, reason: "UNCONFIRMED" },
      { field: "excludeGarmentIds", garmentId: 5, reason: "EXCLUDED" }
    ]);
  });

  it("rejects a locked garment that is not currently available", () => {
    const error = captureValidationError(() => validateRecommendationConstraints(
      [garment(1, "top", { availabilityStatus: "loaned" })],
      request({ includeGarmentIds: [1] })
    ));

    expectIssues(error, [{
      field: "includeGarmentIds",
      garmentId: 1,
      reason: "UNAVAILABLE"
    }]);
  });

  it("reports every included garment in a repeated single-value slot as unsatisfiable", () => {
    const error = captureValidationError(() => validateRecommendationConstraints(
      [garment(1, "top"), garment(2, "top"), garment(3, "bottom")],
      request({ includeGarmentIds: [1, 2, 3] })
    ));

    expectIssues(error, [
      { field: "includeGarmentIds", garmentId: 1, reason: "UNSATISFIABLE" },
      { field: "includeGarmentIds", garmentId: 2, reason: "UNSATISFIABLE" }
    ]);
  });

  it("reports dress and top/bottom include combinations as unsatisfiable", () => {
    const error = captureValidationError(() => validateRecommendationConstraints(
      [garment(1, "dress"), garment(2, "top"), garment(3, "bottom")],
      request({ includeGarmentIds: [1, 2, 3] })
    ));

    expectIssues(error, [
      { field: "includeGarmentIds", garmentId: 1, reason: "UNSATISFIABLE" },
      { field: "includeGarmentIds", garmentId: 2, reason: "UNSATISFIABLE" },
      { field: "includeGarmentIds", garmentId: 3, reason: "UNSATISFIABLE" }
    ]);
  });
});
