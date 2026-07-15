import type {
  Formality,
  Garment,
  GarmentCategory,
  OutfitPairStat,
  PersonalProfile,
  RecommendationScoreBreakdown,
  WeatherSnapshot
} from "../../src/shared/types";
import {
  evaluateRecommendationCandidate,
  generateCandidates
} from "./recommend";
import { createOutfitSignature } from "./recommendationCandidates";

const DEFAULT_TOP_CANDIDATES = 12;
const MAX_TOP_CANDIDATES = 12;
const DEFAULT_TRIP_BEAM_WIDTH = 100;
const MAX_TRIP_BEAM_WIDTH = 100;
const DEFAULT_SEARCH_TRANSITIONS = 100_000;
const MAX_SEARCH_TRANSITIONS = 100_000;
const TRIP_MIN_WEATHER_COMFORT = 0;
const TRIP_MIN_OCCASION_PER_ITEM = 2;
const COLD_OUTERWEAR_THRESHOLD = 8;
const CORE_CATEGORIES = new Set<GarmentCategory>(["top", "bottom", "dress"]);

export type TripRepeatPolicy = "allow" | "no-consecutive-core" | "no-repeat-core";

export interface TripOptimizationActivity {
  id: number;
  occasion: string;
  formality: Formality;
  weather: WeatherSnapshot;
}

export interface TripOptimizationSlot {
  id: string;
  date: string;
  activities: readonly TripOptimizationActivity[];
  includeGarmentIds?: readonly number[];
  excludeGarmentIds?: readonly number[];
}

export interface TripOptimizationConstraints {
  maxGarments: number;
  maxShoes: number;
  repeatPolicy: TripRepeatPolicy;
  maxCoreWearsBetweenLaundry: 1 | 2 | 3;
  laundryDay?: string;
}

export interface TripActivityEvaluation {
  activityId: number;
  occasion: string;
  formality: Formality;
  score: number;
  reasons: string[];
  scoreBreakdown: RecommendationScoreBreakdown;
  weatherComfort: number;
  occasionPerItem: number;
}

export interface TripSelection {
  slotId: string;
  date: string;
  activityIds: number[];
  occasionKeys: string[];
  candidateKey: string;
  items: Garment[];
  score: number;
  reasons: string[];
  activityEvaluations: TripActivityEvaluation[];
  limitingActivityId: number;
}

export interface TripOptimizationInput {
  garments: readonly Garment[];
  slots: readonly TripOptimizationSlot[];
  constraints: TripOptimizationConstraints;
  recentlyWornGarmentIds?: readonly number[];
  userProfile?: PersonalProfile;
  pairStats?: readonly OutfitPairStat[];
  prefix?: readonly TripSelection[];
  lockedGarmentIdsBySlot?: Readonly<Record<string, readonly number[]>>;
}

export interface TripOptimizationOptions {
  maxEvaluatedCandidatesPerSlot?: number;
  generationBeamWidth?: number;
  topCandidatesPerSlot?: number;
  beamWidth?: number;
  maxTransitions?: number;
}

export type TripOptimizationConflictCode =
  | "NO_CANDIDATES"
  | "REQUIRED_SLOTS"
  | "WEATHER_THRESHOLD"
  | "OCCASION_THRESHOLD"
  | "LOCKED_GARMENT"
  | "MAX_GARMENTS"
  | "MAX_SHOES"
  | "REPEAT_POLICY"
  | "LAUNDRY_WEAR_LIMIT"
  | "SEARCH_BUDGET";

export interface TripOptimizationConflict {
  code: TripOptimizationConflictCode;
  message: string;
  slotId?: string;
  minimumValue?: number;
}

export interface TripConstraintRelaxation {
  constraint: string;
  currentValue?: number | string;
  suggestedValue: number | string;
  message: string;
  guaranteed?: boolean;
}

export interface TripPackingCoverage {
  garmentId: number;
  category: GarmentCategory;
  dates: string[];
  activityIds: number[];
  occasions: string[];
  reasons: string[];
}

export interface TripOptimizationDiagnostics {
  candidateCountsBySlot: Record<string, number>;
  truncatedCandidateSlots: string[];
  maxCandidatesPerSlot: number;
  maxEvaluatedCandidatesPerSlot: number;
  maxBeamSize: number;
  evaluatedTransitions: number;
  searchBudget: number;
}

export type TripOptimizationResult =
  | {
      status: "feasible";
      selections: TripSelection[];
      packingItems: TripPackingCoverage[];
      objectiveScore: number;
      explanation: string[];
      diagnostics: TripOptimizationDiagnostics;
    }
  | {
      status: "infeasible";
      failedSlotId?: string;
      conflicts: TripOptimizationConflict[];
      relaxations: TripConstraintRelaxation[];
      diagnostics: TripOptimizationDiagnostics;
    };

interface TripSlotCandidate {
  key: string;
  items: Garment[];
  score: number;
  reasons: string[];
  activityEvaluations: TripActivityEvaluation[];
  limitingActivityId: number;
}

interface CandidatePoolResult {
  candidates: TripSlotCandidate[];
  evaluatedCandidates: number;
  truncated: boolean;
  conflicts: Rejection[];
}

interface EvaluatedSlotItems {
  items: Garment[];
  evaluations: TripActivityEvaluation[];
  limiting: TripActivityEvaluation;
}

interface BeamState {
  selections: TripSelection[];
  selectedGarmentIds: Set<number>;
  selectedShoeIds: Set<number>;
  usedCoreGarmentIds: Set<number>;
  coreLastWornDate: Map<number, string>;
  coreWearsSinceLaundry: Map<number, number>;
  garmentOccasions: Map<number, Set<string>>;
  currentDate?: string;
  currentDateCoreGarmentIds: Set<number>;
  objectiveScore: number;
  totalRecommendationScore: number;
}

interface Rejection {
  code: TripOptimizationConflictCode;
  slotId?: string;
  requiredValue?: number;
  observedValue?: number;
}

interface NormalizedOptions {
  maxEvaluatedCandidatesPerSlot: number | undefined;
  generationBeamWidth: number | undefined;
  topCandidatesPerSlot: number;
  beamWidth: number;
  maxTransitions: number;
}

export function optimizeTrip(
  input: TripOptimizationInput,
  options: TripOptimizationOptions = {}
): TripOptimizationResult {
  const result = optimizeTripOnce(input, options);
  if (result.status === "feasible") return result;
  return {
    ...result,
    relaxations: verifiedRelaxations(input, options, result)
  };
}

function optimizeTripOnce(
  input: TripOptimizationInput,
  options: TripOptimizationOptions = {}
): TripOptimizationResult {
  const normalized = normalizeOptions(options);
  const diagnostics: TripOptimizationDiagnostics = {
    candidateCountsBySlot: {},
    truncatedCandidateSlots: [],
    maxCandidatesPerSlot: normalized.topCandidatesPerSlot,
    maxEvaluatedCandidatesPerSlot: 0,
    maxBeamSize: 1,
    evaluatedTransitions: 0,
    searchBudget: normalized.maxTransitions
  };

  const orderedSlots = stableDateOrder(input.slots);
  const slotsById = new Map(orderedSlots.map((slot) => [slot.id, slot]));
  const prefixSlotIds = new Set<string>();
  let initial = emptyBeamState();
  for (const selection of input.prefix ?? []) {
    const slot = slotsById.get(selection.slotId);
    if (!slot || prefixSlotIds.has(selection.slotId) || slot.date !== selection.date ||
      !numberArraysEqual(selection.activityIds, slot.activities.map((activity) => activity.id))) {
      return infeasibleResult(
        [{ code: "NO_CANDIDATES", slotId: selection.slotId }],
        diagnostics,
        selection.slotId,
        input.constraints
      );
    }
    const fixedEvaluation = evaluateSlotItems(
      input,
      slot,
      selection.items,
      uniqueNumbers([
        ...(slot.includeGarmentIds ?? []),
        ...(input.lockedGarmentIdsBySlot?.[slot.id] ?? [])
      ]),
      uniqueNumbers(slot.excludeGarmentIds ?? [])
    );
    if ("code" in fixedEvaluation) {
      return infeasibleResult(
        [{ ...fixedEvaluation, slotId: selection.slotId }],
        diagnostics,
        selection.slotId,
        input.constraints
      );
    }
    const extension = extendState(initial, selection, input.constraints);
    if ("code" in extension) {
      return infeasibleResult([extension], diagnostics, selection.slotId, input.constraints);
    }
    initial = extension;
    prefixSlotIds.add(selection.slotId);
    diagnostics.candidateCountsBySlot[selection.slotId] = 1;
  }

  let beam = [initial];
  for (const slot of orderedSlots.filter((candidate) => !prefixSlotIds.has(candidate.id))) {
    const pool = buildCandidatePool(input, slot, normalized);
    diagnostics.candidateCountsBySlot[slot.id] = pool.candidates.length;
    diagnostics.maxEvaluatedCandidatesPerSlot = Math.max(
      diagnostics.maxEvaluatedCandidatesPerSlot,
      pool.evaluatedCandidates
    );
    if (pool.truncated) diagnostics.truncatedCandidateSlots.push(slot.id);
    if (!pool.candidates.length) {
      return infeasibleResult(pool.conflicts, diagnostics, slot.id, input.constraints);
    }

    const nextStates: BeamState[] = [];
    const rejections: Rejection[] = [];
    for (const state of beam) {
      for (const candidate of pool.candidates) {
        if (diagnostics.evaluatedTransitions >= normalized.maxTransitions) {
          return infeasibleResult(
            [{ code: "SEARCH_BUDGET", slotId: slot.id }],
            diagnostics,
            slot.id,
            input.constraints
          );
        }
        diagnostics.evaluatedTransitions += 1;
        const selection = candidateSelection(slot, candidate);
        const extension = extendState(state, selection, input.constraints);
        if ("code" in extension) {
          rejections.push({ ...extension, slotId: slot.id });
        } else {
          nextStates.push(extension);
        }
      }
    }

    if (!nextStates.length) {
      return infeasibleResult(rejections, diagnostics, slot.id, input.constraints);
    }
    beam = pruneTripBeam(nextStates, normalized.beamWidth);
    diagnostics.maxBeamSize = Math.max(diagnostics.maxBeamSize, beam.length);
  }

  const best = [...beam].sort(compareBeamStates)[0];
  const packingItems = buildPackingCoverage(best.selections);
  return {
    status: "feasible",
    selections: best.selections,
    packingItems,
    objectiveScore: Number(best.objectiveScore.toFixed(1)),
    explanation: explainOptimization(best, packingItems),
    diagnostics
  };
}

function verifiedRelaxations(
  input: TripOptimizationInput,
  options: TripOptimizationOptions,
  result: Extract<TripOptimizationResult, { status: "infeasible" }>
): TripConstraintRelaxation[] {
  const verified = new Map<string, TripConstraintRelaxation>();
  const conflictCodes = new Set(result.conflicts.map((conflict) => conflict.code));

  if (conflictCodes.has("MAX_GARMENTS")) {
    const maximum = Math.min(100, new Set(
      input.garments.filter(isTripEligibleGarment).map((garment) => garment.id)
    ).size);
    const suggested = firstFeasibleIntegerConstraint(
      input,
      options,
      "maxGarments",
      input.constraints.maxGarments + 1,
      maximum
    );
    if (suggested !== undefined) {
      verified.set("maxGarments", {
        constraint: "maxGarments",
        currentValue: input.constraints.maxGarments,
        suggestedValue: suggested,
        message: `将最大衣物数至少放宽到 ${suggested}；该值已通过完整行程复验。`,
        guaranteed: true
      });
    }
  }

  if (conflictCodes.has("MAX_SHOES")) {
    const maximum = Math.min(20, new Set(
      input.garments.filter((garment) => isTripEligibleGarment(garment) && garment.category === "shoes")
        .map((garment) => garment.id)
    ).size);
    const suggested = firstFeasibleIntegerConstraint(
      input,
      options,
      "maxShoes",
      input.constraints.maxShoes + 1,
      maximum
    );
    if (suggested !== undefined) {
      verified.set("maxShoes", {
        constraint: "maxShoes",
        currentValue: input.constraints.maxShoes,
        suggestedValue: suggested,
        message: `将最大鞋履数至少放宽到 ${suggested}；该值已通过完整行程复验。`,
        guaranteed: true
      });
    }
  }

  if (conflictCodes.has("REPEAT_POLICY")) {
    const candidates: TripRepeatPolicy[] = input.constraints.repeatPolicy === "no-repeat-core"
      ? ["no-consecutive-core", "allow"]
      : input.constraints.repeatPolicy === "no-consecutive-core" ? ["allow"] : [];
    const suggested = candidates.find((repeatPolicy) => trialIsFeasible(input, options, { repeatPolicy }));
    if (suggested !== undefined) {
      verified.set("repeatPolicy", {
        constraint: "repeatPolicy",
        currentValue: input.constraints.repeatPolicy,
        suggestedValue: suggested,
        message: `将重复规则放宽为 ${suggested}；该规则已通过完整行程复验。`,
        guaranteed: true
      });
    }
  }

  if (conflictCodes.has("LAUNDRY_WEAR_LIMIT")) {
    const candidates = Array.from(
      { length: Math.max(0, 3 - input.constraints.maxCoreWearsBetweenLaundry) },
      (_, index) => input.constraints.maxCoreWearsBetweenLaundry + index + 1
    ) as Array<1 | 2 | 3>;
    const suggested = candidates.find((maxCoreWearsBetweenLaundry) =>
      trialIsFeasible(input, options, { maxCoreWearsBetweenLaundry })
    );
    if (suggested !== undefined) {
      verified.set("maxCoreWearsBetweenLaundry", {
        constraint: "maxCoreWearsBetweenLaundry",
        currentValue: input.constraints.maxCoreWearsBetweenLaundry,
        suggestedValue: suggested,
        message: `将每次洗衣前核心单品穿着次数放宽到 ${suggested}；该值已通过完整行程复验。`,
        guaranteed: true
      });
    }
  }

  return result.relaxations.map((relaxation) =>
    verified.get(relaxation.constraint) ?? { ...relaxation, guaranteed: false }
  );
}

function firstFeasibleIntegerConstraint(
  input: TripOptimizationInput,
  options: TripOptimizationOptions,
  field: "maxGarments" | "maxShoes",
  minimum: number,
  maximum: number
): number | undefined {
  for (let value = minimum; value <= maximum; value += 1) {
    if (trialIsFeasible(input, options, { [field]: value })) return value;
  }
  return undefined;
}

function trialIsFeasible(
  input: TripOptimizationInput,
  options: TripOptimizationOptions,
  update: Partial<TripOptimizationConstraints>
): boolean {
  return optimizeTripOnce({
    ...input,
    constraints: { ...input.constraints, ...update }
  }, options).status === "feasible";
}

function buildCandidatePool(
  input: TripOptimizationInput,
  slot: TripOptimizationSlot,
  options: NormalizedOptions
): CandidatePoolResult {
  if (!slot.activities.length) {
    return {
      candidates: [],
      evaluatedCandidates: 0,
      truncated: false,
      conflicts: [{ code: "NO_CANDIDATES", slotId: slot.id }]
    };
  }
  const firstActivity = slot.activities[0];
  const lockedIds = uniqueNumbers([
    ...(slot.includeGarmentIds ?? []),
    ...(input.lockedGarmentIdsBySlot?.[slot.id] ?? [])
  ]);
  const excludedIds = uniqueNumbers(slot.excludeGarmentIds ?? []);
  const generated = generateCandidates({
    garments: [...input.garments],
    weather: firstActivity.weather,
    occasion: firstActivity.formality,
    recentlyWornGarmentIds: [...(input.recentlyWornGarmentIds ?? [])],
    userProfile: input.userProfile,
    includeGarmentIds: lockedIds,
    excludeGarmentIds: excludedIds,
    pairStats: [...(input.pairStats ?? [])],
    scoringContexts: slot.activities.map((activity) => ({
      weather: activity.weather,
      occasion: activity.formality
    }))
  }, {
    maxEvaluatedCandidates: options.maxEvaluatedCandidatesPerSlot,
    beamWidth: options.generationBeamWidth
  });

  const hardRejects: Rejection[] = [];
  const candidatesByKey = new Map<string, TripSlotCandidate>();
  for (const generatedCandidate of generated.candidates) {
    const evaluated = evaluateSlotItems(input, slot, generatedCandidate.items, lockedIds, excludedIds);
    if ("code" in evaluated) {
      hardRejects.push({ ...evaluated, slotId: slot.id });
      continue;
    }

    const key = createOutfitSignature(evaluated.items);
    const candidate: TripSlotCandidate = {
      key,
      items: [...evaluated.items],
      score: evaluated.limiting.score,
      reasons: evaluated.limiting.reasons,
      activityEvaluations: evaluated.evaluations,
      limitingActivityId: evaluated.limiting.activityId
    };
    const previous = candidatesByKey.get(key);
    if (!previous || compareSlotCandidates(candidate, previous) < 0) {
      candidatesByKey.set(key, candidate);
    }
  }

  const candidates = [...candidatesByKey.values()]
    .sort(compareSlotCandidates)
    .slice(0, options.topCandidatesPerSlot);
  if (candidates.length) {
    return {
      candidates,
      evaluatedCandidates: generated.evaluatedCandidates,
      truncated: generated.truncated || candidatesByKey.size > options.topCandidatesPerSlot,
      conflicts: []
    };
  }

  const conflicts = lockedIds.length && (
    !generated.candidates.length ||
    hardRejects.some((item) => item.code === "LOCKED_GARMENT")
  )
    ? [{ code: "LOCKED_GARMENT" as const, slotId: slot.id }]
    : hardRejects.length
      ? hardRejects
      : [{ code: "NO_CANDIDATES" as const, slotId: slot.id }];
  return {
    candidates: [],
    evaluatedCandidates: generated.evaluatedCandidates,
    truncated: generated.truncated,
    conflicts
  };
}

function evaluateSlotItems(
  input: TripOptimizationInput,
  slot: TripOptimizationSlot,
  sourceItems: readonly Garment[],
  lockedIds: readonly number[],
  excludedIds: readonly number[]
): EvaluatedSlotItems | Rejection {
  const garmentsById = new Map(input.garments.map((garment) => [garment.id, garment]));
  const items = sourceItems.map((item) => garmentsById.get(item.id));
  if (items.some((item) => item === undefined)) return { code: "LOCKED_GARMENT" };
  const canonicalItems = items as Garment[];
  const itemIds = new Set(canonicalItems.map((item) => item.id));
  if (lockedIds.some((id) => !itemIds.has(id)) || excludedIds.some((id) => itemIds.has(id)) ||
    canonicalItems.some((item) => !isTripEligibleGarment(item))) {
    return { code: "LOCKED_GARMENT" };
  }
  if (!hasRequiredSlots(canonicalItems)) return { code: "REQUIRED_SLOTS" };

  const evaluations = slot.activities.map((activity, sequence) => {
    const scored = evaluateRecommendationCandidate(canonicalItems, {
      garments: [...input.garments],
      weather: activity.weather,
      occasion: activity.formality,
      recentlyWornGarmentIds: [...(input.recentlyWornGarmentIds ?? [])],
      userProfile: input.userProfile,
      includeGarmentIds: [...lockedIds],
      excludeGarmentIds: [...excludedIds],
      pairStats: [...(input.pairStats ?? [])]
    }, sequence);
    return {
      activityId: activity.id,
      occasion: activity.occasion,
      formality: activity.formality,
      score: scored.score,
      reasons: scored.reasons,
      scoreBreakdown: scored.scoreBreakdown,
      weatherComfort: scored.scoreBreakdown.weatherComfort,
      occasionPerItem: scored.scoreBreakdown.occasion / Math.max(1, scored.items.length)
    } satisfies TripActivityEvaluation;
  });
  if (evaluations.some((evaluation, index) =>
    evaluation.weatherComfort < TRIP_MIN_WEATHER_COMFORT ||
    (
      slot.activities[index].weather.apparentTemperature <= COLD_OUTERWEAR_THRESHOLD &&
      !canonicalItems.some((item) => item.category === "outerwear")
    )
  )) {
    return {
      code: "WEATHER_THRESHOLD",
      observedValue: Math.min(...evaluations.map((item) => item.weatherComfort))
    };
  }
  if (evaluations.some((evaluation) => evaluation.occasionPerItem < TRIP_MIN_OCCASION_PER_ITEM)) {
    return {
      code: "OCCASION_THRESHOLD",
      observedValue: Math.min(...evaluations.map((item) => item.occasionPerItem))
    };
  }
  const limiting = [...evaluations].sort((left, right) =>
    left.score - right.score || left.activityId - right.activityId
  )[0];
  return { items: canonicalItems, evaluations, limiting };
}

function isTripEligibleGarment(garment: Garment): boolean {
  return garment.owned && garment.confirmed && !garment.excluded &&
    !garment.archivedAt && garment.availabilityStatus === "available";
}

function candidateSelection(
  slot: TripOptimizationSlot,
  candidate: TripSlotCandidate
): TripSelection {
  return {
    slotId: slot.id,
    date: slot.date,
    activityIds: slot.activities.map((activity) => activity.id),
    occasionKeys: uniqueStrings(slot.activities.map((activity) => activity.occasion)),
    candidateKey: candidate.key,
    items: [...candidate.items],
    score: candidate.score,
    reasons: [...candidate.reasons],
    activityEvaluations: candidate.activityEvaluations.map((evaluation) => ({
      ...evaluation,
      reasons: [...evaluation.reasons],
      scoreBreakdown: { ...evaluation.scoreBreakdown }
    })),
    limitingActivityId: candidate.limitingActivityId
  };
}

function extendState(
  source: BeamState,
  selection: TripSelection,
  constraints: TripOptimizationConstraints
): BeamState | Rejection {
  const items = selection.items;
  const coreItems = items.filter((item) => CORE_CATEGORIES.has(item.category));
  const selectedGarmentIds = new Set(source.selectedGarmentIds);
  const selectedShoeIds = new Set(source.selectedShoeIds);
  for (const item of items) {
    selectedGarmentIds.add(item.id);
    if (item.category === "shoes") selectedShoeIds.add(item.id);
  }
  if (selectedGarmentIds.size > constraints.maxGarments) {
    return { code: "MAX_GARMENTS", requiredValue: selectedGarmentIds.size };
  }
  if (selectedShoeIds.size > constraints.maxShoes) {
    return { code: "MAX_SHOES", requiredValue: selectedShoeIds.size };
  }

  const changedDate = source.currentDate !== selection.date;
  const coreWearsSinceLaundry = changedDate && constraints.laundryDay === selection.date
    ? new Map<number, number>()
    : new Map(source.coreWearsSinceLaundry);
  const currentDateCoreGarmentIds = changedDate
    ? new Set<number>()
    : new Set(source.currentDateCoreGarmentIds);
  const usedCoreGarmentIds = new Set(source.usedCoreGarmentIds);
  const coreLastWornDate = new Map(source.coreLastWornDate);

  for (const item of coreItems) {
    if (constraints.repeatPolicy === "no-repeat-core" && usedCoreGarmentIds.has(item.id)) {
      return { code: "REPEAT_POLICY" };
    }
    const lastDate = coreLastWornDate.get(item.id);
    if (
      constraints.repeatPolicy === "no-consecutive-core" &&
      lastDate !== undefined &&
      lastDate !== selection.date &&
      isNextCalendarDate(lastDate, selection.date)
    ) {
      return { code: "REPEAT_POLICY" };
    }
    const nextWearCount = (coreWearsSinceLaundry.get(item.id) ?? 0) + 1;
    if (nextWearCount > constraints.maxCoreWearsBetweenLaundry) {
      return { code: "LAUNDRY_WEAR_LIMIT", requiredValue: nextWearCount };
    }
  }

  const newUniqueGarments = items.filter((item) => !source.selectedGarmentIds.has(item.id)).length;
  const extraSameDayCore = currentDateCoreGarmentIds.size
    ? coreItems.filter((item) => !currentDateCoreGarmentIds.has(item.id)).length
    : 0;
  const garmentOccasions = cloneOccasionMap(source.garmentOccasions);
  let newOccasionCoverage = 0;
  for (const item of items) {
    const previous = garmentOccasions.get(item.id) ?? new Set<string>();
    const next = new Set(previous);
    selection.occasionKeys.forEach((occasion) => next.add(occasion));
    const previousRewardedCount = Math.max(0, previous.size - 1);
    const nextRewardedCount = Math.max(0, next.size - 1);
    newOccasionCoverage += nextRewardedCount - previousRewardedCount;
    garmentOccasions.set(item.id, next);
  }

  for (const item of coreItems) {
    coreWearsSinceLaundry.set(item.id, (coreWearsSinceLaundry.get(item.id) ?? 0) + 1);
    currentDateCoreGarmentIds.add(item.id);
    usedCoreGarmentIds.add(item.id);
    coreLastWornDate.set(item.id, selection.date);
  }

  const objectiveDelta = selection.score
    - 3 * newUniqueGarments
    + 4 * newOccasionCoverage
    - 2 * extraSameDayCore;
  return {
    selections: [...source.selections, selection],
    selectedGarmentIds,
    selectedShoeIds,
    usedCoreGarmentIds,
    coreLastWornDate,
    coreWearsSinceLaundry,
    garmentOccasions,
    currentDate: selection.date,
    currentDateCoreGarmentIds,
    objectiveScore: source.objectiveScore + objectiveDelta,
    totalRecommendationScore: source.totalRecommendationScore + selection.score
  };
}

function emptyBeamState(): BeamState {
  return {
    selections: [],
    selectedGarmentIds: new Set(),
    selectedShoeIds: new Set(),
    usedCoreGarmentIds: new Set(),
    coreLastWornDate: new Map(),
    coreWearsSinceLaundry: new Map(),
    garmentOccasions: new Map(),
    currentDateCoreGarmentIds: new Set(),
    objectiveScore: 0,
    totalRecommendationScore: 0
  };
}

function pruneTripBeam(states: readonly BeamState[], beamWidth: number): BeamState[] {
  const bestByConstraintState = new Map<string, BeamState>();
  for (const state of states) {
    const key = constraintStateSignature(state);
    const previous = bestByConstraintState.get(key);
    if (!previous || compareBeamStates(state, previous) < 0) {
      bestByConstraintState.set(key, state);
    }
  }
  return [...bestByConstraintState.values()]
    .sort(compareBeamStates)
    .slice(0, beamWidth);
}

function compareBeamStates(left: BeamState, right: BeamState): number {
  return right.objectiveScore - left.objectiveScore ||
    right.totalRecommendationScore - left.totalRecommendationScore ||
    left.selectedGarmentIds.size - right.selectedGarmentIds.size ||
    left.selectedShoeIds.size - right.selectedShoeIds.size ||
    selectionPath(left).localeCompare(selectionPath(right));
}

function compareSlotCandidates(left: TripSlotCandidate, right: TripSlotCandidate): number {
  return right.score - left.score || left.key.localeCompare(right.key);
}

function constraintStateSignature(state: BeamState): string {
  return [
    sortedNumbers(state.selectedGarmentIds).join(","),
    sortedNumbers(state.selectedShoeIds).join(","),
    sortedNumbers(state.usedCoreGarmentIds).join(","),
    sortedMap(state.coreLastWornDate),
    sortedMap(state.coreWearsSinceLaundry),
    state.currentDate ?? "",
    sortedNumbers(state.currentDateCoreGarmentIds).join(","),
    [...state.garmentOccasions.entries()]
      .sort(([left], [right]) => left - right)
      .map(([id, occasions]) => `${id}:${[...occasions].sort().join(",")}`)
      .join("|")
  ].join(";");
}

function selectionPath(state: BeamState): string {
  return state.selections.map((selection) => `${selection.slotId}:${selection.candidateKey}`).join("|");
}

function hasRequiredSlots(items: readonly Garment[]): boolean {
  const categories = new Set(items.map((item) => item.category));
  const completeCore = categories.has("dress") ||
    (categories.has("top") && categories.has("bottom"));
  return completeCore && categories.has("shoes");
}

function infeasibleResult(
  rejections: readonly Rejection[],
  diagnostics: TripOptimizationDiagnostics,
  failedSlotId: string | undefined,
  constraints: TripOptimizationConstraints
): TripOptimizationResult {
  const normalizedRejections = rejections.length
    ? rejections
    : [{ code: "NO_CANDIDATES" as const, slotId: failedSlotId }];
  const order: TripOptimizationConflictCode[] = [
    "LOCKED_GARMENT",
    "REQUIRED_SLOTS",
    "WEATHER_THRESHOLD",
    "OCCASION_THRESHOLD",
    "MAX_GARMENTS",
    "MAX_SHOES",
    "REPEAT_POLICY",
    "LAUNDRY_WEAR_LIMIT",
    "SEARCH_BUDGET",
    "NO_CANDIDATES"
  ];
  const conflicts = order.flatMap((code) => {
    const matches = normalizedRejections.filter((item) => item.code === code);
    if (!matches.length) return [];
    const requiredValues = matches
      .map((item) => item.requiredValue)
      .filter((value): value is number => value !== undefined);
    return [{
      code,
      message: conflictMessage(code),
      ...(failedSlotId === undefined ? {} : { slotId: failedSlotId }),
      ...(requiredValues.length ? { minimumValue: Math.min(...requiredValues) } : {})
    } satisfies TripOptimizationConflict];
  });
  return {
    status: "infeasible",
    ...(failedSlotId === undefined ? {} : { failedSlotId }),
    conflicts,
    relaxations: conflicts.map((conflict) => relaxationFor(conflict, constraints, normalizedRejections)),
    diagnostics
  };
}

function relaxationFor(
  conflict: TripOptimizationConflict,
  constraints: TripOptimizationConstraints,
  rejections: readonly Rejection[]
): TripConstraintRelaxation {
  if (conflict.code === "MAX_GARMENTS") {
    return {
      constraint: "maxGarments",
      currentValue: constraints.maxGarments,
      suggestedValue: conflict.minimumValue ?? constraints.maxGarments + 1,
      message: `将最大衣物数至少放宽到 ${conflict.minimumValue ?? constraints.maxGarments + 1}。`
    };
  }
  if (conflict.code === "MAX_SHOES") {
    return {
      constraint: "maxShoes",
      currentValue: constraints.maxShoes,
      suggestedValue: conflict.minimumValue ?? constraints.maxShoes + 1,
      message: `将最大鞋履数至少放宽到 ${conflict.minimumValue ?? constraints.maxShoes + 1}。`
    };
  }
  if (conflict.code === "REPEAT_POLICY") {
    const suggested = constraints.repeatPolicy === "no-repeat-core"
      ? "no-consecutive-core"
      : "allow";
    return {
      constraint: "repeatPolicy",
      currentValue: constraints.repeatPolicy,
      suggestedValue: suggested,
      message: `将重复规则最小放宽为 ${suggested}。`
    };
  }
  if (conflict.code === "LAUNDRY_WEAR_LIMIT") {
    const required = conflict.minimumValue ?? constraints.maxCoreWearsBetweenLaundry + 1;
    return required <= 3
      ? {
          constraint: "maxCoreWearsBetweenLaundry",
          currentValue: constraints.maxCoreWearsBetweenLaundry,
          suggestedValue: required,
          message: `将每次洗衣前核心单品穿着次数至少放宽到 ${required}。`
        }
      : {
          constraint: "laundryDay",
          suggestedValue: "增加更早的洗衣日",
          message: "在超出穿着次数前增加洗衣机会。"
        };
  }
  if (conflict.code === "OCCASION_THRESHOLD") {
    const observed = Math.max(
      ...rejections
        .filter((item) => item.code === conflict.code)
        .map((item) => item.observedValue ?? Number.NEGATIVE_INFINITY)
    );
    return {
      constraint: "occasionPerItem",
      currentValue: TRIP_MIN_OCCASION_PER_ITEM,
      suggestedValue: Number.isFinite(observed)
        ? Math.min(TRIP_MIN_OCCASION_PER_ITEM, observed)
        : "选择更匹配场合的衣物",
      message: "降低场合阈值，或选择正式度更匹配的衣物。"
    };
  }
  if (conflict.code === "WEATHER_THRESHOLD") {
    return {
      constraint: "weatherCompatibility",
      currentValue: TRIP_MIN_WEATHER_COMFORT,
      suggestedValue: "补充适温外套或调整天气阈值",
      message: "补充满足当天温度的外套，或显式降低天气阈值。"
    };
  }
  if (conflict.code === "REQUIRED_SLOTS") {
    return {
      constraint: "requiredSlots",
      suggestedValue: "补充可用核心单品和鞋履",
      message: "为该活动补充连衣裙或上装加下装，并提供可用鞋履。"
    };
  }
  if (conflict.code === "LOCKED_GARMENT") {
    return {
      constraint: "lockedGarmentIds",
      suggestedValue: "移除或替换失效锁定",
      message: "移除不可用锁定，或锁定同类别的可用替代单品。"
    };
  }
  if (conflict.code === "SEARCH_BUDGET") {
    return {
      constraint: "searchBudget",
      currentValue: DEFAULT_SEARCH_TRANSITIONS,
      suggestedValue: "缩小活动候选空间后重试",
      message: "搜索预算已耗尽；缩小候选或减少锁定组合后重试。"
    };
  }
  return {
    constraint: "candidatePool",
    suggestedValue: "放宽排除条件或补充可用衣物",
    message: "当前 Top 12 候选预算内无可行搭配。"
  };
}

function conflictMessage(code: TripOptimizationConflictCode): string {
  const messages: Record<TripOptimizationConflictCode, string> = {
    NO_CANDIDATES: "当前候选预算内没有可用搭配。",
    REQUIRED_SLOTS: "候选缺少核心单品或鞋履。",
    WEATHER_THRESHOLD: "候选未达到天气硬阈值。",
    OCCASION_THRESHOLD: "候选未达到场合硬阈值。",
    LOCKED_GARMENT: "锁定衣物不可用、被排除或无法组成完整搭配。",
    MAX_GARMENTS: "继续规划会超过最大衣物数。",
    MAX_SHOES: "继续规划会超过最大鞋履数。",
    REPEAT_POLICY: "继续规划会违反核心单品重复规则。",
    LAUNDRY_WEAR_LIMIT: "继续规划会超过洗衣前核心单品穿着次数。",
    SEARCH_BUDGET: "搜索预算已耗尽，不能声明存在可行方案。"
  };
  return messages[code];
}

function buildPackingCoverage(selections: readonly TripSelection[]): TripPackingCoverage[] {
  const coverage = new Map<number, TripPackingCoverage>();
  for (const selection of selections) {
    for (const item of selection.items) {
      const current = coverage.get(item.id) ?? {
        garmentId: item.id,
        category: item.category,
        dates: [],
        activityIds: [],
        occasions: [],
        reasons: []
      };
      current.dates = uniqueStrings([...current.dates, selection.date]);
      current.activityIds = uniqueNumbers([...current.activityIds, ...selection.activityIds]);
      current.occasions = uniqueStrings([...current.occasions, ...selection.occasionKeys]);
      current.reasons = uniqueStrings([
        ...current.reasons,
        ...selection.reasons,
        `服务 ${selection.date} 的 ${selection.occasionKeys.join("、") || "活动"}`
      ]);
      coverage.set(item.id, current);
    }
  }
  return [...coverage.values()].sort((left, right) => left.garmentId - right.garmentId);
}

function explainOptimization(
  state: BeamState,
  packingItems: readonly TripPackingCoverage[]
): string[] {
  return [
    `在硬约束内为 ${state.selections.length} 个活动时段生成搭配。`,
    `去重后需携带 ${packingItems.length} 件衣物，其中 ${state.selectedShoeIds.size} 双鞋。`,
    "洗衣次数只在本次搜索状态中模拟，未修改衣橱可用状态。"
  ];
}

function normalizeOptions(options: TripOptimizationOptions): NormalizedOptions {
  return {
    maxEvaluatedCandidatesPerSlot: finiteInteger(options.maxEvaluatedCandidatesPerSlot),
    generationBeamWidth: finiteInteger(options.generationBeamWidth),
    topCandidatesPerSlot: clampInteger(
      options.topCandidatesPerSlot,
      1,
      MAX_TOP_CANDIDATES,
      DEFAULT_TOP_CANDIDATES
    ),
    beamWidth: clampInteger(
      options.beamWidth,
      1,
      MAX_TRIP_BEAM_WIDTH,
      DEFAULT_TRIP_BEAM_WIDTH
    ),
    maxTransitions: clampInteger(
      options.maxTransitions,
      1,
      MAX_SEARCH_TRANSITIONS,
      DEFAULT_SEARCH_TRANSITIONS
    )
  };
}

function stableDateOrder(slots: readonly TripOptimizationSlot[]): TripOptimizationSlot[] {
  return slots
    .map((slot, index) => ({ slot, index }))
    .sort((left, right) => left.slot.date.localeCompare(right.slot.date) || left.index - right.index)
    .map(({ slot }) => slot);
}

function isNextCalendarDate(previous: string, current: string): boolean {
  const previousDate = new Date(`${previous}T00:00:00.000Z`);
  if (Number.isNaN(previousDate.getTime())) return false;
  previousDate.setUTCDate(previousDate.getUTCDate() + 1);
  return previousDate.toISOString().slice(0, 10) === current;
}

function cloneOccasionMap(source: ReadonlyMap<number, Set<string>>): Map<number, Set<string>> {
  return new Map([...source.entries()].map(([id, occasions]) => [id, new Set(occasions)]));
}

function sortedNumbers(values: Iterable<number>): number[] {
  return [...values].sort((left, right) => left - right);
}

function sortedMap<T extends string | number>(values: ReadonlyMap<number, T>): string {
  return [...values.entries()]
    .sort(([left], [right]) => left - right)
    .map(([key, value]) => `${key}:${value}`)
    .join("|");
}

function uniqueNumbers(values: readonly number[]): number[] {
  return [...new Set(values)];
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function numberArraysEqual(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function finiteInteger(value: number | undefined): number | undefined {
  return Number.isFinite(value) ? Math.floor(value as number) : undefined;
}

function clampInteger(
  value: number | undefined,
  minimum: number,
  maximum: number,
  fallback: number
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(value as number)));
}
