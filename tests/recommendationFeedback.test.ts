import { describe, expect, it } from "vitest";
import { createDatabase, getGarmentById, type AppDatabase } from "../server/db";
import {
  clearRecommendationFeedback,
  getRecommendationFeedbackInsights,
  listOutfitPairStats,
  previewRecommendationFeedbackClear,
  upsertRecommendationFeedback
} from "../server/services/recommendationFeedback";
import {
  listGarmentAvailabilityEvents,
  setGarmentAvailability
} from "../server/services/garmentAvailability";

const FIRST_CANDIDATE = "11111111-1111-4111-8111-111111111111";
const SECOND_CANDIDATE = "22222222-2222-4222-8222-222222222222";
const THIRD_CANDIDATE = "33333333-3333-4333-8333-333333333333";

function insertGarment(db: AppDatabase, name: string, category: string): number {
  return Number(db.prepare(`
    INSERT INTO garments (
      name, category, color, warmth, seasons, styles, formality, confirmed
    ) VALUES (?, ?, 'black', 'medium', '["spring"]', '["casual"]', 'casual', 1)
  `).run(name, category).lastInsertRowid);
}

function insertCandidate(db: AppDatabase, candidateId: string, itemIds: number[]): void {
  const runId = Number(db.prepare(`
    INSERT INTO recommendation_runs (input_json, result_json) VALUES ('{}', '{}')
  `).run().lastInsertRowid);
  db.prepare(`
    INSERT INTO recommendation_candidates (
      candidate_id, run_id, signature, rank, item_ids_json, score_snapshot
    ) VALUES (?, ?, ?, 1, ?, '{}')
  `).run(candidateId, runId, `signature-${candidateId}`, JSON.stringify(itemIds));
}

describe("recommendation feedback service", () => {
  it("upserts one stable candidate feedback and never double counts a replay", () => {
    const db = createDatabase(":memory:");
    const top = insertGarment(db, "上衣", "top");
    const bottom = insertGarment(db, "下装", "bottom");
    const shoes = insertGarment(db, "鞋", "shoes");
    insertCandidate(db, FIRST_CANDIDATE, [top, bottom, shoes]);
    const now = new Date("2026-07-12T10:00:00.000Z");
    const input = {
      candidateId: FIRST_CANDIDATE,
      verdict: "liked" as const,
      rating: 5 as const,
      actuallyWorn: true,
      reasonCodes: []
    };

    const created = upsertRecommendationFeedback(db, input, { now: () => now });
    const replayed = upsertRecommendationFeedback(db, input, { now: () => now });

    expect(created.feedback).toMatchObject({
      candidateId: FIRST_CANDIDATE,
      verdict: "liked",
      rating: 5,
      actuallyWorn: true,
      reasonCodes: []
    });
    expect(replayed.feedback.id).toBe(created.feedback.id);
    expect(db.prepare("SELECT COUNT(*) AS count FROM recommendation_feedback").get()).toEqual({ count: 1 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM wear_logs").get()).toEqual({ count: 1 });
    expect(listOutfitPairStats(db)).toEqual([
      expect.objectContaining({ garmentAId: top, garmentBId: bottom, likes: 1, dislikes: 0, wornCount: 1, totalFeedback: 1, signal: 3 }),
      expect.objectContaining({ garmentAId: top, garmentBId: shoes, likes: 1, dislikes: 0, wornCount: 1, totalFeedback: 1, signal: 3 }),
      expect.objectContaining({ garmentAId: bottom, garmentBId: shoes, likes: 1, dislikes: 0, wornCount: 1, totalFeedback: 1, signal: 3 })
    ]);
  });

  it("updates rather than stacks feedback and preserves an already recorded wear fact", () => {
    const db = createDatabase(":memory:");
    const top = insertGarment(db, "上衣", "top");
    const bottom = insertGarment(db, "下装", "bottom");
    insertCandidate(db, FIRST_CANDIDATE, [top, bottom]);
    upsertRecommendationFeedback(db, {
      candidateId: FIRST_CANDIDATE,
      verdict: "liked",
      actuallyWorn: true,
      reasonCodes: []
    });

    const updated = upsertRecommendationFeedback(db, {
      candidateId: FIRST_CANDIDATE,
      verdict: "disliked",
      reasonCodes: ["too-formal"],
      comment: "不适合今天"
    });

    expect(updated.feedback).toMatchObject({
      verdict: "disliked",
      actuallyWorn: true,
      reasonCodes: ["too-formal"],
      comment: "不适合今天"
    });
    expect(db.prepare("SELECT COUNT(*) AS count FROM recommendation_feedback").get()).toEqual({ count: 1 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM wear_logs").get()).toEqual({ count: 1 });
    expect(listOutfitPairStats(db)).toEqual([
      expect.objectContaining({ likes: 0, dislikes: 1, wornCount: 1, totalFeedback: 1, signal: 0 })
    ]);
  });

  it("adds the actual-worn fact without erasing an earlier verdict or rejection reasons", () => {
    const db = createDatabase(":memory:");
    const top = insertGarment(db, "上衣", "top");
    const bottom = insertGarment(db, "下装", "bottom");
    insertCandidate(db, FIRST_CANDIDATE, [top, bottom]);
    upsertRecommendationFeedback(db, {
      candidateId: FIRST_CANDIDATE,
      verdict: "disliked",
      reasonCodes: ["fit"],
      comment: "版型不适合"
    });

    const worn = upsertRecommendationFeedback(db, {
      candidateId: FIRST_CANDIDATE,
      actuallyWorn: true,
      reasonCodes: []
    });

    expect(worn.feedback).toMatchObject({
      verdict: "disliked",
      actuallyWorn: true,
      reasonCodes: ["fit"],
      comment: "版型不适合"
    });
    expect(db.prepare("SELECT COUNT(*) AS count FROM wear_logs").get()).toEqual({ count: 1 });
  });

  it("rolls back feedback and wear log together when the wear write fails", () => {
    const db = createDatabase(":memory:");
    const top = insertGarment(db, "上衣", "top");
    const bottom = insertGarment(db, "下装", "bottom");
    insertCandidate(db, FIRST_CANDIDATE, [top, bottom]);
    db.exec(`
      CREATE TRIGGER fail_feedback_wear
      BEFORE INSERT ON wear_logs
      BEGIN
        SELECT RAISE(ABORT, 'planned wear failure');
      END;
    `);

    expect(() => upsertRecommendationFeedback(db, {
      candidateId: FIRST_CANDIDATE,
      actuallyWorn: true,
      reasonCodes: []
    })).toThrow(/planned wear failure/i);
    expect(db.prepare("SELECT COUNT(*) AS count FROM recommendation_feedback").get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM wear_logs").get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM outfit_pair_stats").get()).toEqual({ count: 0 });
  });

  it("previews scoped clears, recomputes pair stats, and makes replay empty", () => {
    const db = createDatabase(":memory:");
    const top = insertGarment(db, "上衣", "top");
    const bottom = insertGarment(db, "下装", "bottom");
    for (const candidateId of [FIRST_CANDIDATE, SECOND_CANDIDATE, THIRD_CANDIDATE]) {
      insertCandidate(db, candidateId, [top, bottom]);
    }
    upsertRecommendationFeedback(db, {
      candidateId: FIRST_CANDIDATE,
      verdict: "liked",
      reasonCodes: []
    }, { now: () => new Date("2026-07-01T08:00:00.000Z") });
    upsertRecommendationFeedback(db, {
      candidateId: SECOND_CANDIDATE,
      verdict: "disliked",
      reasonCodes: ["color"]
    }, { now: () => new Date("2026-07-02T08:00:00.000Z") });
    upsertRecommendationFeedback(db, {
      candidateId: THIRD_CANDIDATE,
      verdict: "liked",
      reasonCodes: []
    }, { now: () => new Date("2026-07-03T08:00:00.000Z") });

    const scope = { scope: "date-range" as const, from: "2026-07-02", to: "2026-07-02" };
    expect(previewRecommendationFeedbackClear(db, scope)).toMatchObject({
      scope: "date-range",
      from: "2026-07-02",
      to: "2026-07-02",
      feedbackCount: 1,
      affectedPairCount: 1
    });
    expect(clearRecommendationFeedback(db, scope)).toMatchObject({
      deletedFeedbackCount: 1,
      remainingPairStatsCount: 1
    });
    expect(listOutfitPairStats(db)).toEqual([
      expect.objectContaining({ likes: 2, dislikes: 0, totalFeedback: 2, signal: 2 })
    ]);
    expect(clearRecommendationFeedback(db, scope)).toMatchObject({ deletedFeedbackCount: 0 });

    expect(getRecommendationFeedbackInsights(db)).toMatchObject({
      totalCount: 2,
      acceptedCount: 2,
      acceptanceRate: 100,
      rejectionReasons: []
    });
  });
});

describe("garment availability service", () => {
  it("changes status with one history event and treats a replay as idempotent", () => {
    const db = createDatabase(":memory:");
    const garmentId = insertGarment(db, "测试上衣", "top");
    const now = new Date("2026-07-12T11:00:00.000Z");

    expect(getGarmentById(db, garmentId).availabilityStatus).toBe("available");
    const changed = setGarmentAvailability(db, garmentId, "laundry", { now: () => now });
    const replayed = setGarmentAvailability(db, garmentId, "laundry", { now: () => now });

    expect(changed).toMatchObject({
      changed: true,
      garment: { id: garmentId, availabilityStatus: "laundry" },
      event: { garmentId, previousStatus: "available", status: "laundry" }
    });
    expect(replayed).toMatchObject({ changed: false, garment: { availabilityStatus: "laundry" } });
    expect(replayed.event).toBeUndefined();
    expect(listGarmentAvailabilityEvents(db)).toEqual([
      expect.objectContaining({ garmentId, previousStatus: "available", status: "laundry" })
    ]);
  });

  it("rolls back garment status when history insertion fails", () => {
    const db = createDatabase(":memory:");
    const garmentId = insertGarment(db, "测试上衣", "top");
    db.exec(`
      CREATE TRIGGER fail_availability_event
      BEFORE INSERT ON garment_availability_events
      BEGIN
        SELECT RAISE(ABORT, 'planned availability failure');
      END;
    `);

    expect(() => setGarmentAvailability(db, garmentId, "repair")).toThrow(/planned availability failure/i);
    expect(getGarmentById(db, garmentId).availabilityStatus).toBe("available");
    expect(listGarmentAvailabilityEvents(db)).toEqual([]);
  });
});
