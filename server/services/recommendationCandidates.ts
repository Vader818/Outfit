import { createHash, randomUUID } from "node:crypto";
import type {
  Garment,
  GarmentCategory,
  OutfitRecommendation,
  RecommendationDraftResult,
  RecommendationOutfitDraft,
  RecommendationResult
} from "../../src/shared/types";
import { saveRecommendationRun, type AppDatabase } from "../db";

const SLOT_ORDER: Record<GarmentCategory, number> = {
  top: 0,
  bottom: 1,
  dress: 2,
  outerwear: 3,
  shoes: 4,
  accessory: 5
};
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface CanonicalOutfitSlot {
  slot: GarmentCategory;
  position: number;
  garmentId: number;
}

export type CandidateIdFactory = () => string;

export function canonicalizeOutfitSlots(items: readonly Garment[]): CanonicalOutfitSlot[] {
  const positions = new Map<GarmentCategory, number>();
  return [...items]
    .sort((left, right) =>
      SLOT_ORDER[left.category] - SLOT_ORDER[right.category] || left.id - right.id
    )
    .map((item) => {
      const position = positions.get(item.category) ?? 0;
      positions.set(item.category, position + 1);
      return { slot: item.category, position, garmentId: item.id };
    });
}

export function createOutfitSignature(items: readonly Garment[]): string {
  const canonical = canonicalizeOutfitSlots(items)
    .map(({ slot, position, garmentId }) => `${slot}[${position}]:${garmentId}`)
    .join("|");
  return createHash("sha256").update(`outfit:v1|${canonical}`, "utf8").digest("hex");
}

export function attachCandidateIdentities(
  outfits: readonly RecommendationOutfitDraft[],
  candidateIdFactory: CandidateIdFactory = randomUUID
): OutfitRecommendation[] {
  return outfits.map((outfit) => {
    const candidateId = candidateIdFactory();
    return {
      ...outfit,
      id: candidateId,
      candidateId,
      outfitSignature: createOutfitSignature(outfit.items)
    };
  });
}

export function persistRecommendationSnapshot(
  db: AppDatabase,
  input: unknown,
  result: RecommendationDraftResult
): RecommendationResult {
  if (db.isTransaction) {
    throw new Error("Recommendation snapshot cannot start inside an existing transaction");
  }
  db.exec("BEGIN IMMEDIATE");
  try {
    validateCandidateIdentities(result.outfits);
    const runId = saveRecommendationRun(db, input, result);
    const persistedResult: RecommendationResult = { runId, ...result };
    const update = db.prepare(`
      UPDATE recommendation_runs
      SET result_json = ?
      WHERE id = ?
    `).run(JSON.stringify(persistedResult), runId);
    if (Number(update.changes) !== 1) {
      throw new Error(`Recommendation run ${runId} could not be finalized`);
    }

    const insertCandidate = db.prepare(`
      INSERT INTO recommendation_candidates (
        candidate_id, run_id, signature, rank, item_ids_json, score_snapshot
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    result.outfits.forEach((outfit, index) => {
      insertCandidate.run(
        outfit.candidateId,
        runId,
        outfit.outfitSignature,
        index + 1,
        JSON.stringify(canonicalizeOutfitSlots(outfit.items).map((slot) => slot.garmentId)),
        JSON.stringify({
          score: outfit.score,
          matchPercent: outfit.matchPercent,
          scoreBreakdown: outfit.scoreBreakdown,
          reasons: outfit.reasons
        })
      );
    });
    db.exec("COMMIT");
    return persistedResult;
  } catch (error) {
    if (db.isTransaction) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // Keep the original persistence failure as the actionable error.
      }
    }
    throw error;
  }
}

function validateCandidateIdentities(outfits: readonly OutfitRecommendation[]): void {
  for (const outfit of outfits) {
    if (!UUID_PATTERN.test(outfit.candidateId) || outfit.id !== outfit.candidateId) {
      throw new Error("Recommendation candidateId must be a UUID and match id");
    }
    if (outfit.outfitSignature !== createOutfitSignature(outfit.items)) {
      throw new Error("Recommendation outfitSignature does not match its item snapshot");
    }
  }
}
