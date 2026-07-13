import type {
  FeedbackReason,
  FeedbackVerdict,
  OutfitOccasion,
  OutfitPairStat,
  RecommendationFeedback,
  RecommendationFeedbackClearPreview,
  RecommendationFeedbackClearResult,
  RecommendationFeedbackClearScope,
  RecommendationFeedbackInput,
  RecommendationFeedbackInsights,
  WeatherSnapshot
} from "../../src/shared/types";
import type { AppDatabase } from "../db";
import { ApiError, ValidationError } from "../validation";
import { insertWearEvent } from "./wearEvents";

interface RecommendationFeedbackServiceOptions {
  now?: () => Date;
}

interface CandidateRow {
  candidate_id: string;
  item_ids_json: string;
  input_json: string;
}

interface FeedbackRow {
  id: number;
  candidate_id: string;
  verdict: FeedbackVerdict | null;
  rating: 1 | 2 | 3 | 4 | 5 | null;
  actually_worn: number;
  reason_codes_json: string;
  comment: string;
  wore_instead_outfit_id: number | null;
  wear_log_id: number | null;
  wear_event_id: number | null;
  created_at: string;
  updated_at: string;
}

interface PairAccumulator {
  garmentAId: number;
  garmentBId: number;
  likes: number;
  dislikes: number;
  wornCount: number;
  totalFeedback: number;
}

export function upsertRecommendationFeedback(
  db: AppDatabase,
  input: RecommendationFeedbackInput,
  options: RecommendationFeedbackServiceOptions = {}
): { feedback: RecommendationFeedback; pairStatsRecomputed: number } {
  if (db.isTransaction) {
    throw new Error("Recommendation feedback cannot start inside an existing transaction");
  }
  const candidate = getCandidate(db, input.candidateId);
  const nowDate = options.now?.() ?? new Date();
  const now = nowDate.toISOString();

  db.exec("BEGIN IMMEDIATE");
  try {
    const existing = getFeedbackRow(db, input.candidateId);
    const hasRecordedWear = existing !== undefined &&
      (existing.wear_event_id !== null || existing.wear_log_id !== null);
    const actuallyWorn = hasRecordedWear || (input.actuallyWorn ?? Boolean(existing?.actually_worn));
    const woreInsteadOutfitId = input.woreInsteadOutfitId ?? existing?.wore_instead_outfit_id ?? null;
    if (actuallyWorn && woreInsteadOutfitId !== null) {
      throw new ValidationError("actuallyWorn 与 woreInsteadOutfitId 不能同时提交");
    }
    if (woreInsteadOutfitId !== null) {
      assertSavedOutfitExists(db, woreInsteadOutfitId);
    }

    let wearLogId = existing?.wear_log_id ?? null;
    let wearEventId = existing?.wear_event_id ?? null;
    if (actuallyWorn && wearEventId === null && wearLogId === null) {
      const context = parseCandidateWearContext(candidate);
      wearEventId = insertWearEvent(db, {
        wornAt: now,
        timeZone: "UTC",
        occasion: context.occasion,
        ...(context.weatherSnapshot ? { weatherSnapshot: context.weatherSnapshot } : {}),
        notes: `source=recommendation-feedback; candidateId=${input.candidateId}`,
        itemIds: parseCandidateItemIds(candidate)
      }, { now: () => nowDate }).id;
    }
    const createdAt = existing?.created_at ?? now;
    const verdict = input.verdict ?? existing?.verdict ?? null;
    const rating = input.rating === undefined ? existing?.rating ?? null : input.rating;
    const actualWornAugmentation = input.actuallyWorn === true &&
      input.verdict === undefined &&
      input.rating === undefined &&
      input.reasonCodes.length === 0 &&
      input.comment === undefined &&
      input.woreInsteadOutfitId === undefined;
    const reasonCodes = actualWornAugmentation && existing
      ? parseReasonCodes(existing)
      : input.reasonCodes;
    const comment = input.comment ?? existing?.comment ?? "";
    const hasPersistedSignal = verdict !== null ||
      rating !== null ||
      actuallyWorn ||
      reasonCodes.length > 0 ||
      Boolean(comment.trim()) ||
      woreInsteadOutfitId !== null;
    if (!hasPersistedSignal) {
      throw new ValidationError("清空后至少保留一个有效反馈字段；如需删除反馈，请使用反馈清理功能");
    }

    db.prepare(`
      INSERT INTO recommendation_feedback (
        candidate_id, verdict, rating, actually_worn, reason_codes_json, comment,
        wore_instead_outfit_id, wear_log_id, wear_event_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(candidate_id) DO UPDATE SET
        verdict = excluded.verdict,
        rating = excluded.rating,
        actually_worn = excluded.actually_worn,
        reason_codes_json = excluded.reason_codes_json,
        comment = excluded.comment,
        wore_instead_outfit_id = excluded.wore_instead_outfit_id,
        wear_log_id = excluded.wear_log_id,
        wear_event_id = excluded.wear_event_id,
        updated_at = excluded.updated_at
    `).run(
      input.candidateId,
      verdict,
      rating,
      actuallyWorn ? 1 : 0,
      JSON.stringify(reasonCodes),
      comment,
      woreInsteadOutfitId,
      wearLogId,
      wearEventId,
      createdAt,
      now
    );
    const pairStatsRecomputed = recomputeOutfitPairStats(db, now);
    const feedback = mapFeedbackRow(requireFeedbackRow(db, input.candidateId));
    db.exec("COMMIT");
    return { feedback, pairStatsRecomputed };
  } catch (error) {
    rollback(db);
    throw error;
  }
}

export function listRecommendationFeedback(db: AppDatabase): RecommendationFeedback[] {
  return (db.prepare(`
    SELECT id, candidate_id, verdict, rating, actually_worn, reason_codes_json,
      comment, wore_instead_outfit_id, wear_log_id, wear_event_id, created_at, updated_at
    FROM recommendation_feedback
    ORDER BY created_at ASC, id ASC
  `).all() as unknown as FeedbackRow[]).map(mapFeedbackRow);
}

export function getRecommendationFeedback(
  db: AppDatabase,
  candidateId: string
): RecommendationFeedback | null {
  getCandidate(db, candidateId);
  const row = getFeedbackRow(db, candidateId);
  return row ? mapFeedbackRow(row) : null;
}

export function listOutfitPairStats(db: AppDatabase): OutfitPairStat[] {
  const rows = db.prepare(`
    SELECT garment_a_id, garment_b_id, likes, dislikes, worn_count,
      total_feedback, signal, updated_at
    FROM outfit_pair_stats
    ORDER BY garment_a_id ASC, garment_b_id ASC
  `).all() as Array<{
    garment_a_id: number;
    garment_b_id: number;
    likes: number;
    dislikes: number;
    worn_count: number;
    total_feedback: number;
    signal: number;
    updated_at: string;
  }>;
  return rows.map((row) => ({
    garmentAId: row.garment_a_id,
    garmentBId: row.garment_b_id,
    likes: row.likes,
    dislikes: row.dislikes,
    wornCount: row.worn_count,
    totalFeedback: row.total_feedback,
    signal: row.signal,
    updatedAt: row.updated_at
  }));
}

export function calculateLearnedPreferenceBonus(
  garmentIds: readonly number[],
  stats: readonly OutfitPairStat[]
): number {
  const statsByPair = new Map(stats.map((stat) => [pairKey(stat.garmentAId, stat.garmentBId), stat]));
  const pairs = canonicalPairs(garmentIds);
  let total = 0;
  for (const [garmentAId, garmentBId] of pairs) {
    const stat = statsByPair.get(pairKey(garmentAId, garmentBId));
    if (!stat || stat.totalFeedback < 3) continue;
    const confidence = Math.min(1, stat.totalFeedback / 5);
    const normalizedSignal = clamp(stat.signal / Math.max(1, stat.totalFeedback), -1, 1);
    total += normalizedSignal * 4 * confidence;
  }
  return Number(clamp(total, -8, 8).toFixed(1));
}

export function getRecommendationFeedbackInsights(db: AppDatabase): RecommendationFeedbackInsights {
  const feedback = listRecommendationFeedback(db);
  const weightedPairCount = listOutfitPairStats(db).filter((stat) => stat.totalFeedback >= 3).length;
  const acceptedCount = feedback.filter((item) => item.verdict === "liked" || item.actuallyWorn).length;
  const reasonCounts = new Map<FeedbackReason, number>();
  for (const item of feedback) {
    if (item.verdict !== "disliked") continue;
    for (const reason of item.reasonCodes) {
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    }
  }
  const rejectionReasons = [...reasonCounts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason));
  return {
    totalCount: feedback.length,
    acceptedCount,
    acceptanceRate: feedback.length ? Number(((acceptedCount / feedback.length) * 100).toFixed(1)) : 0,
    weightedPairCount,
    ...(rejectionReasons[0] ? { mostCommonRejectionReason: rejectionReasons[0].reason } : {}),
    rejectionReasons
  };
}

export function previewRecommendationFeedbackClear(
  db: AppDatabase,
  scope: RecommendationFeedbackClearScope
): RecommendationFeedbackClearPreview {
  assertClearCandidateExists(db, scope);
  const predicate = clearPredicate(scope);
  const rows = db.prepare(`
    SELECT candidates.item_ids_json
    FROM recommendation_feedback
    JOIN recommendation_candidates AS candidates
      ON candidates.candidate_id = recommendation_feedback.candidate_id
    WHERE ${predicate.sql}
  `).all(...predicate.params) as Array<{ item_ids_json: string }>;
  const affectedPairs = new Set<string>();
  for (const row of rows) {
    for (const [garmentAId, garmentBId] of canonicalPairs(parseItemIdsJson(row.item_ids_json))) {
      affectedPairs.add(pairKey(garmentAId, garmentBId));
    }
  }
  return {
    ...scope,
    feedbackCount: rows.length,
    affectedPairCount: affectedPairs.size
  };
}

export function clearRecommendationFeedback(
  db: AppDatabase,
  scope: RecommendationFeedbackClearScope,
  options: RecommendationFeedbackServiceOptions = {}
): RecommendationFeedbackClearResult {
  if (db.isTransaction) {
    throw new Error("Recommendation feedback clear cannot start inside an existing transaction");
  }
  const clearedAt = (options.now?.() ?? new Date()).toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    const preview = previewRecommendationFeedbackClear(db, scope);
    const predicate = clearPredicate(scope);
    const deleted = db.prepare(`
      DELETE FROM recommendation_feedback
      WHERE ${predicate.sql}
    `).run(...predicate.params);
    const remainingPairStatsCount = recomputeOutfitPairStats(db, clearedAt);
    const result: RecommendationFeedbackClearResult = {
      ...preview,
      deletedFeedbackCount: Number(deleted.changes),
      remainingPairStatsCount,
      clearedAt
    };
    db.exec("COMMIT");
    return result;
  } catch (error) {
    rollback(db);
    throw error;
  }
}

function recomputeOutfitPairStats(db: AppDatabase, updatedAt: string): number {
  const existingGarmentIds = new Set((db.prepare("SELECT id FROM garments").all() as Array<{ id: number }>).map((row) => row.id));
  const rows = db.prepare(`
    SELECT feedback.verdict,
      CASE
        WHEN feedback.actually_worn = 1
          OR feedback.wear_event_id IS NOT NULL
          OR feedback.wear_log_id IS NOT NULL THEN 1
        ELSE 0
      END AS actually_worn,
      candidates.item_ids_json
    FROM recommendation_feedback AS feedback
    JOIN recommendation_candidates AS candidates
      ON candidates.candidate_id = feedback.candidate_id
    ORDER BY feedback.id ASC
  `).all() as Array<{
    verdict: FeedbackVerdict | null;
    actually_worn: number;
    item_ids_json: string;
  }>;
  const stats = new Map<string, PairAccumulator>();
  for (const row of rows) {
    const itemIds = parseItemIdsJson(row.item_ids_json).filter((id) => existingGarmentIds.has(id));
    for (const [garmentAId, garmentBId] of canonicalPairs(itemIds)) {
      const key = pairKey(garmentAId, garmentBId);
      const stat = stats.get(key) ?? {
        garmentAId,
        garmentBId,
        likes: 0,
        dislikes: 0,
        wornCount: 0,
        totalFeedback: 0
      };
      stat.totalFeedback += 1;
      if (row.verdict === "liked") stat.likes += 1;
      if (row.verdict === "disliked") stat.dislikes += 1;
      if (Boolean(row.actually_worn)) stat.wornCount += 1;
      stats.set(key, stat);
    }
  }

  db.prepare("DELETE FROM outfit_pair_stats").run();
  const insert = db.prepare(`
    INSERT INTO outfit_pair_stats (
      garment_a_id, garment_b_id, likes, dislikes, worn_count,
      total_feedback, signal, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const stat of [...stats.values()].sort((left, right) =>
    left.garmentAId - right.garmentAId || left.garmentBId - right.garmentBId
  )) {
    const signal = stat.likes + 2 * stat.wornCount - 2 * stat.dislikes;
    insert.run(
      stat.garmentAId,
      stat.garmentBId,
      stat.likes,
      stat.dislikes,
      stat.wornCount,
      stat.totalFeedback,
      signal,
      updatedAt
    );
  }
  return stats.size;
}

function getCandidate(db: AppDatabase, candidateId: string): CandidateRow {
  const row = db.prepare(`
    SELECT candidates.candidate_id, candidates.item_ids_json, runs.input_json
    FROM recommendation_candidates AS candidates
    JOIN recommendation_runs AS runs ON runs.id = candidates.run_id
    WHERE candidates.candidate_id = ?
  `).get(candidateId) as CandidateRow | undefined;
  if (!row) {
    throw new ApiError("RECOMMENDATION_CANDIDATE_NOT_FOUND", "推荐候选不存在", 404);
  }
  return row;
}

function assertSavedOutfitExists(db: AppDatabase, outfitId: number): void {
  const row = db.prepare("SELECT id FROM saved_outfits WHERE id = ?").get(outfitId);
  if (!row) throw new ApiError("SAVED_OUTFIT_NOT_FOUND", "替代搭配不存在", 404);
}

function assertClearCandidateExists(db: AppDatabase, scope: RecommendationFeedbackClearScope): void {
  if (scope.scope === "candidate") getCandidate(db, scope.candidateId);
}

function getFeedbackRow(db: AppDatabase, candidateId: string): FeedbackRow | undefined {
  return db.prepare(`
    SELECT id, candidate_id, verdict, rating, actually_worn, reason_codes_json,
      comment, wore_instead_outfit_id, wear_log_id, wear_event_id, created_at, updated_at
    FROM recommendation_feedback
    WHERE candidate_id = ?
  `).get(candidateId) as FeedbackRow | undefined;
}

function requireFeedbackRow(db: AppDatabase, candidateId: string): FeedbackRow {
  const row = getFeedbackRow(db, candidateId);
  if (!row) throw new Error(`Feedback for candidate ${candidateId} was not persisted`);
  return row;
}

function mapFeedbackRow(row: FeedbackRow): RecommendationFeedback {
  const feedback: RecommendationFeedback & { wearEventId?: number } = {
    id: row.id,
    candidateId: row.candidate_id,
    ...(row.verdict === null ? {} : { verdict: row.verdict }),
    ...(row.rating === null ? {} : { rating: row.rating }),
    actuallyWorn: Boolean(row.actually_worn) || row.wear_event_id !== null || row.wear_log_id !== null,
    reasonCodes: parseReasonCodes(row),
    comment: row.comment,
    ...(row.wore_instead_outfit_id === null ? {} : { woreInsteadOutfitId: row.wore_instead_outfit_id }),
    ...(row.wear_log_id === null ? {} : { wearLogId: row.wear_log_id }),
    ...(row.wear_event_id === null ? {} : { wearEventId: row.wear_event_id }),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
  return feedback;
}

function parseReasonCodes(row: FeedbackRow): FeedbackReason[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.reason_codes_json);
  } catch {
    throw new ApiError("CORRUPT_FEEDBACK", `反馈 ${row.id} 的 reason_codes_json 损坏`, 500);
  }
  if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === "string")) {
    throw new ApiError("CORRUPT_FEEDBACK", `反馈 ${row.id} 的 reason_codes_json 无效`, 500);
  }
  return parsed as FeedbackReason[];
}

function parseCandidateItemIds(candidate: CandidateRow): number[] {
  try {
    return parseItemIdsJson(candidate.item_ids_json);
  } catch {
    throw new ApiError(
      "CORRUPT_RECOMMENDATION_CANDIDATE",
      `推荐候选 ${candidate.candidate_id} 的衣物快照无效`,
      500
    );
  }
}

function parseCandidateWearContext(candidate: CandidateRow): {
  occasion: OutfitOccasion;
  weatherSnapshot?: WeatherSnapshot;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate.input_json);
  } catch {
    return { occasion: "casual" };
  }
  if (!isRecord(parsed)) return { occasion: "casual" };
  const occasion = isOutfitOccasion(parsed.occasion) ? parsed.occasion : "casual";
  const weatherSnapshot = parseCandidateWeather(parsed.weather);
  return {
    occasion,
    ...(weatherSnapshot ? { weatherSnapshot } : {})
  };
}

function parseCandidateWeather(value: unknown): WeatherSnapshot | undefined {
  if (!isRecord(value) || !validCalendarDate(value.date) ||
    !finite(value.temperature) || !finite(value.apparentTemperature) ||
    !finite(value.precipitationProbability) || !finite(value.windSpeed) ||
    !finite(value.weatherCode) || typeof value.summary !== "string" ||
    !value.summary || value.summary.length > 200) {
    return undefined;
  }
  return {
    date: value.date,
    temperature: value.temperature,
    apparentTemperature: value.apparentTemperature,
    precipitationProbability: value.precipitationProbability,
    windSpeed: value.windSpeed,
    weatherCode: value.weatherCode,
    summary: value.summary
  };
}

function isOutfitOccasion(value: unknown): value is OutfitOccasion {
  return value === "casual" || value === "smart-casual" || value === "formal" ||
    value === "sport" || value === "date" || value === "dinner";
}

function validCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseItemIdsJson(value: string): number[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || !parsed.every((id) => Number.isSafeInteger(id) && id > 0)) {
    throw new Error("Candidate item ids must be positive safe integers");
  }
  return [...new Set(parsed as number[])];
}

function canonicalPairs(garmentIds: readonly number[]): Array<readonly [number, number]> {
  const sorted = [...new Set(garmentIds)].sort((left, right) => left - right);
  const pairs: Array<readonly [number, number]> = [];
  for (let left = 0; left < sorted.length; left += 1) {
    for (let right = left + 1; right < sorted.length; right += 1) {
      pairs.push([sorted[left], sorted[right]]);
    }
  }
  return pairs;
}

function pairKey(garmentAId: number, garmentBId: number): string {
  return `${Math.min(garmentAId, garmentBId)}:${Math.max(garmentAId, garmentBId)}`;
}

function clearPredicate(scope: RecommendationFeedbackClearScope): { sql: string; params: string[] } {
  if (scope.scope === "candidate") {
    return { sql: "recommendation_feedback.candidate_id = ?", params: [scope.candidateId] };
  }
  if (scope.scope === "date-range") {
    return {
      sql: "date(recommendation_feedback.updated_at) BETWEEN date(?) AND date(?)",
      params: [scope.from, scope.to]
    };
  }
  return { sql: "1 = 1", params: [] };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function rollback(db: AppDatabase): void {
  if (!db.isTransaction) return;
  try {
    db.exec("ROLLBACK");
  } catch {
    // Preserve the original transaction failure.
  }
}
