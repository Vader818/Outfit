import type {
  Garment,
  GarmentCategory,
  RecommendationConstraintField,
  RecommendationConstraintIssue,
  RecommendationConstraintReason,
  RecommendationRequest
} from "../../src/shared/types";
import { ValidationError } from "../validation";

const SINGLE_VALUE_CATEGORIES = new Set<GarmentCategory>([
  "top",
  "bottom",
  "dress",
  "outerwear",
  "shoes"
]);

export interface TrustedRecommendationConstraints {
  includeGarmentIds: number[];
  excludeGarmentIds: number[];
}

export function validateRecommendationConstraints(
  allGarments: readonly Garment[],
  request: Pick<RecommendationRequest, "includeGarmentIds" | "excludeGarmentIds">
): TrustedRecommendationConstraints {
  const includeGarmentIds = [...(request.includeGarmentIds ?? [])];
  const excludeGarmentIds = [...(request.excludeGarmentIds ?? [])];
  const garmentsById = new Map(allGarments.map((garment) => [garment.id, garment]));
  const issues: RecommendationConstraintIssue[] = [];
  const eligibleIncludedGarments: Garment[] = [];

  validateReferencedGarments(
    "includeGarmentIds",
    includeGarmentIds,
    garmentsById,
    issues,
    eligibleIncludedGarments
  );
  validateReferencedGarments(
    "excludeGarmentIds",
    excludeGarmentIds,
    garmentsById,
    issues
  );
  appendUnsatisfiableIssues(eligibleIncludedGarments, includeGarmentIds, issues);

  if (issues.length) {
    throw new ValidationError("推荐衣物约束无效", { issues });
  }
  return { includeGarmentIds, excludeGarmentIds };
}

function validateReferencedGarments(
  field: RecommendationConstraintField,
  garmentIds: readonly number[],
  garmentsById: ReadonlyMap<number, Garment>,
  issues: RecommendationConstraintIssue[],
  eligibleGarments?: Garment[]
): void {
  for (const garmentId of garmentIds) {
    const garment = garmentsById.get(garmentId);
    const reason = garmentConstraintReason(garment);
    if (reason) {
      issues.push({ field, garmentId, reason });
      continue;
    }
    if (eligibleGarments && garment) eligibleGarments.push(garment);
  }
}

function garmentConstraintReason(
  garment: Garment | undefined
): RecommendationConstraintReason | undefined {
  if (!garment) return "NOT_FOUND";
  if (!garment.owned) return "NOT_OWNED";
  if (garment.archivedAt) return "ARCHIVED";
  if (!garment.confirmed) return "UNCONFIRMED";
  if (garment.excluded) return "EXCLUDED";
  if ((garment.availabilityStatus ?? "available") !== "available") return "UNAVAILABLE";
  return undefined;
}

function appendUnsatisfiableIssues(
  includedGarments: readonly Garment[],
  includeGarmentIds: readonly number[],
  issues: RecommendationConstraintIssue[]
): void {
  const unsatisfiableIds = new Set<number>();
  const garmentsByCategory = new Map<GarmentCategory, Garment[]>();
  for (const garment of includedGarments) {
    const categoryGarments = garmentsByCategory.get(garment.category) ?? [];
    categoryGarments.push(garment);
    garmentsByCategory.set(garment.category, categoryGarments);
  }

  for (const category of SINGLE_VALUE_CATEGORIES) {
    const categoryGarments = garmentsByCategory.get(category) ?? [];
    if (categoryGarments.length > 1) {
      categoryGarments.forEach((garment) => unsatisfiableIds.add(garment.id));
    }
  }

  const dresses = garmentsByCategory.get("dress") ?? [];
  const separateCore = [
    ...(garmentsByCategory.get("top") ?? []),
    ...(garmentsByCategory.get("bottom") ?? [])
  ];
  if (dresses.length && separateCore.length) {
    [...dresses, ...separateCore].forEach((garment) => unsatisfiableIds.add(garment.id));
  }

  for (const garmentId of includeGarmentIds) {
    if (unsatisfiableIds.has(garmentId)) {
      issues.push({ field: "includeGarmentIds", garmentId, reason: "UNSATISFIABLE" });
    }
  }
}
