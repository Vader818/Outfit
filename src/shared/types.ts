export type GarmentCategory = "top" | "bottom" | "dress" | "outerwear" | "shoes" | "accessory";
export type GarmentWarmth = "light" | "medium" | "warm" | "heavy";
export type Season = "spring" | "summer" | "autumn" | "winter";
export type Formality = "casual" | "smart-casual" | "formal" | "sport";
export type GarmentOrigin = "taobao" | "manual" | "backup";
export type GarmentCostSource = "manual" | "taobao";
export type GarmentAvailabilityStatus = "available" | "laundry" | "repair" | "loaned" | "packed";
export type BodyType = "slim-tall" | "average" | "athletic" | "stocky";
export type SkinTone = "dark-yellow" | "medium-yellow" | "fair" | "deep";
export type ColorDisposition = "cool-clean" | "neutral" | "warm-soft";

export interface AuthUser {
  id: number;
  username: string;
}

export interface AuthStatus {
  hasAccount: boolean;
  user: AuthUser | null;
}

export interface Garment {
  id: number;
  sourceOrderItemId?: number;
  origin: GarmentOrigin;
  archivedAt?: string;
  brand: string;
  name: string;
  rawName: string;
  category: GarmentCategory;
  color: string;
  warmth: GarmentWarmth;
  seasons: Season[];
  styles: string[];
  formality: Formality;
  size?: string;
  materials?: string[];
  patterns?: string[];
  tags?: string[];
  imageUrl: string;
  owned: boolean;
  confirmed: boolean;
  excluded: boolean;
  availabilityStatus: GarmentAvailabilityStatus;
  confidence: number;
  notes?: string;
  acquiredAt?: string;
  purchasePriceCents?: number;
  currency?: "CNY";
  costSource?: GarmentCostSource;
  itemUrl?: string;
  detailUrl?: string;
  lastWornAt?: string;
  wearCount?: number;
  cutoutImageUrl?: string;
  visionTags?: VisionTagSuggestion;
  visionUpdatedAt?: string;
}

export type GarmentUpdateInput = Partial<Pick<Garment,
  | "brand"
  | "name"
  | "rawName"
  | "category"
  | "color"
  | "warmth"
  | "seasons"
  | "styles"
  | "formality"
  | "size"
  | "materials"
  | "patterns"
  | "tags"
  | "owned"
  | "confirmed"
  | "excluded"
  | "notes"
  | "purchasePriceCents"
>>;

export type SavedOutfitSource = "recommendation" | "manual" | "replacement";
export type OutfitSlot = GarmentCategory;

export interface SavedOutfitGarmentSnapshot {
  id: number;
  name: string;
  brand: string;
  category: GarmentCategory;
  imageUrl: string;
}

export interface SavedOutfitItem {
  id: number;
  outfitId: number;
  garmentId?: number;
  slot: OutfitSlot;
  position: number;
  garmentSnapshot: SavedOutfitGarmentSnapshot;
}

export interface SavedOutfit {
  id: number;
  name: string;
  notes: string;
  source: SavedOutfitSource;
  sourceCandidateId?: string;
  derivedFromOutfitId?: number;
  favorite: boolean;
  archivedAt?: string;
  items: SavedOutfitItem[];
  createdAt: string;
  updatedAt: string;
}

export interface SavedOutfitItemInput {
  garmentId: number;
  slot: OutfitSlot;
  position: number;
}

export interface SavedOutfitCreateInput {
  name: string;
  notes?: string;
  favorite?: boolean;
  items: SavedOutfitItemInput[];
}

export interface SavedOutfitUpdateInput {
  name?: string;
  notes?: string;
  favorite?: boolean;
  items?: SavedOutfitItemInput[];
}

export interface SaveRecommendationCandidateInput {
  name?: string;
  notes?: string;
  favorite?: boolean;
}

export interface SavedOutfitReplacementInput {
  targetGarmentId: number;
  replacementGarmentId: number;
  name?: string;
}

export interface SimilarityReason {
  field: "color" | "styles" | "materials" | "patterns" | "brandName" | "visual";
  score: number;
  weight: number;
  detail: string;
}

export interface GarmentSimilarityMatch {
  garment: Garment;
  similarity: number;
  reasons: string[];
  evidence?: SimilarityReason[];
}

export interface CoverageDelta {
  categories: string[];
  seasons: string[];
  occasions: string[];
  compatibleOutfitCount: number;
}

export type PurchaseCheckVerdict =
  | "fills-gap"
  | "likely-duplicate"
  | "mixed"
  | "insufficient-data";

export interface PurchaseCheckResult {
  subjectKey: string;
  verdict: PurchaseCheckVerdict;
  possibleDuplicates: GarmentSimilarityMatch[];
  worksWith: SavedOutfit[];
  coverageDelta: CoverageDelta;
  explanation: string[];
}

export type SimilarityFeedbackVerdict = "duplicate" | "not-duplicate";

export type SimilarityFeedbackSubjectInput =
  | { kind: "garment"; garmentId: number }
  | {
      kind: "taobao-candidate";
      batch: TaobaoCapturedBatch;
      sourceItemKey: string;
    };

export interface SimilarityFeedbackInput {
  subject: SimilarityFeedbackSubjectInput;
  comparedGarmentId: number;
  verdict: SimilarityFeedbackVerdict;
}

export interface GarmentSimilarityFeedback {
  id: number;
  subjectKey: string;
  comparedGarmentId: number;
  verdict: SimilarityFeedbackVerdict;
  createdAt: string;
  updatedAt: string;
}

export type SimilarityFeedback = GarmentSimilarityFeedback;

export interface ManualGarmentCreate {
  name: string;
  category: GarmentCategory;
  color: string;
  warmth: GarmentWarmth;
  seasons: Season[];
  styles: string[];
  formality: Formality;
  brand?: string;
  size?: string;
  materials?: string[];
  patterns?: string[];
  tags?: string[];
  notes?: string;
  acquiredAt?: string;
  purchasePriceCents?: number;
  currency?: "CNY";
}

export interface WeatherSnapshot {
  date: string;
  temperature: number;
  apparentTemperature: number;
  precipitationProbability: number;
  windSpeed: number;
  weatherCode: number;
  summary: string;
}

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type OutfitOccasion =
  | "casual"
  | "smart-casual"
  | "formal"
  | "sport"
  | "date"
  | "dinner";

export interface WearEventItem {
  id: number;
  wearEventId: number;
  itemId: number;
  position: number;
}

export interface WearEventLegacySnapshot {
  originalGarmentIds: number[];
  originalContext: JsonValue;
}

export interface WearEvent {
  id: number;
  wornAt: string;
  timeZone: string;
  outfitId?: number;
  occasion: OutfitOccasion;
  weatherSnapshot?: WeatherSnapshot;
  notes?: string;
  items: WearEventItem[];
  legacySnapshot?: WearEventLegacySnapshot;
}

export interface WearEventInput {
  wornAt: string;
  timeZone: string;
  outfitId?: number | null;
  occasion: OutfitOccasion;
  weatherSnapshot?: WeatherSnapshot;
  notes?: string | null;
  itemIds: number[];
}

export interface WearEventPage {
  events: WearEvent[];
  nextCursor?: string;
}

export type OutfitPlanStatus = "planned" | "worn" | "skipped";

export interface OutfitPlanEntry {
  id: number;
  plannedDate: string;
  timeZone: string;
  outfitId: number;
  occasion: OutfitOccasion;
  weatherSnapshot?: WeatherSnapshot;
  status: OutfitPlanStatus;
  wornAt?: string;
  wearEventId?: number;
  notes?: string;
}

export interface OutfitPlanInput {
  plannedDate: string;
  timeZone: string;
  outfitId: number;
  occasion: OutfitOccasion;
  weatherSnapshot?: WeatherSnapshot;
  notes?: string;
}

export interface OutfitPlanUpdate {
  plannedDate?: string;
  timeZone?: string;
  outfitId?: number;
  occasion?: OutfitOccasion;
  weatherSnapshot?: WeatherSnapshot | null;
  status?: "planned" | "skipped";
  notes?: string | null;
}

export interface RepeatWarning {
  code: "RECENT_OUTFIT_REPEAT";
  windowDays: 14 | 28;
  previousDate: string;
  message: string;
  canIgnore: true;
  action: "replace-one-item";
}

export interface OutfitPlanMutationResult {
  entry: OutfitPlanEntry;
  repeatWarning?: RepeatWarning;
}

export interface MarkWornInput {
  wornAt: string;
  timeZone: string;
  outfitId?: number | null;
  occasion?: OutfitOccasion;
  weatherSnapshot?: WeatherSnapshot;
  notes?: string | null;
  itemIds?: number[];
}

export interface MarkWornResult {
  plan: OutfitPlanEntry;
  wearEvent: WearEvent;
}

export type TripRepeatPolicy = "allow" | "no-consecutive-core" | "no-repeat-core";
export type TripStatus = "planning" | "ready" | "completed" | "archived";
export type TripPackingStatus = "unpacked" | "packed" | "on-body" | "not-taking";

export interface TripDestination {
  name: string;
  latitude?: number;
  longitude?: number;
}

export interface TripActivityInput {
  name: string;
  occasion: string;
  formality: Formality;
  requiresSeparateOutfit: boolean;
}

export interface TripActivity extends TripActivityInput {
  id: number;
  tripDayId: number;
  position: number;
}

export interface TripDayInput {
  date: string;
  activities: TripActivityInput[];
}

export interface TripDay {
  id: number;
  tripId: number;
  date: string;
  activities: TripActivity[];
  weather?: WeatherSnapshot;
}

export interface TripActivityEvaluation {
  activityId: number;
  score: number;
  weatherComfort: number;
  occasion: number;
  hardEligible: boolean;
}

export interface TripOutfitSelection {
  id: number;
  tripDayId: number;
  slotIndex: number;
  activityIds: number[];
  garments: Garment[];
  score: number;
  reasons: string[];
  activityEvaluations: TripActivityEvaluation[];
  lockedGarmentIds: number[];
  actualWearEventId?: number;
}

export interface TripPackingCoverage {
  dates: string[];
  activityIds: number[];
  activities?: string[];
  occasions?: string[];
  reasons?: string[];
}

export interface TripPackingItem {
  id: number;
  tripId: number;
  kind: "garment" | "essential";
  garmentId?: number;
  label: string;
  status: TripPackingStatus;
  coverage: TripPackingCoverage;
}

export interface Trip {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  destination: TripDestination;
  maxGarments: number;
  maxShoes: number;
  repeatPolicy: TripRepeatPolicy;
  maxCoreWearsBetweenLaundry: 1 | 2 | 3;
  laundryDay?: string;
  status: TripStatus;
  days: TripDay[];
  selections: TripOutfitSelection[];
  packingItems: TripPackingItem[];
  createdAt: string;
  updatedAt: string;
}

export interface TripCreateInput {
  name: string;
  startDate: string;
  endDate: string;
  destination: TripDestination;
  maxGarments: number;
  maxShoes: number;
  repeatPolicy: TripRepeatPolicy;
  maxCoreWearsBetweenLaundry: 1 | 2 | 3;
  laundryDay?: string;
  days: TripDayInput[];
}

export type TripUpdateInput = Partial<Omit<TripCreateInput, "laundryDay">> & {
  laundryDay?: string | null;
  status?: Exclude<TripStatus, "completed">;
};

export type TripConstraintCode =
  | "availability"
  | "required-slots"
  | "weather"
  | "occasion"
  | "maxGarments"
  | "maxShoes"
  | "repeatPolicy"
  | "maxCoreWearsBetweenLaundry"
  | "lockedGarments"
  | "searchBudget";

export interface TripConstraintConflict {
  constraint: TripConstraintCode;
  message: string;
  slotId?: string;
}

export interface TripConstraintRelaxation {
  constraint: TripConstraintCode;
  from: string | number;
  to: string | number;
  message: string;
  guaranteed: boolean;
}

export type TripOptimizationResult =
  | {
      status: "feasible";
      selections: TripOutfitSelection[];
      packingItems: TripPackingItem[];
      objectiveScore: number;
      evaluatedCandidates: number;
      maxBeamSize: number;
    }
  | {
      status: "infeasible";
      conflicts: TripConstraintConflict[];
      relaxations: TripConstraintRelaxation[];
      evaluatedCandidates: number;
    };

export interface TripGenerationInput {
  useStoredWeather?: boolean;
}

export interface TripGenerationResult {
  trip: Trip;
  optimization: TripOptimizationResult;
}

export interface TripSelectionRecalculateInput {
  lockedGarmentIds?: number[];
  replace?: {
    fromGarmentId: number;
    toGarmentId: number;
  };
}

export interface TripWeatherRefreshResult {
  trip: Trip;
  snapshots: WeatherSnapshot[];
}

export interface TripPackingItemCreateInput {
  label: string;
}

export interface TripPackingItemUpdateInput {
  status: TripPackingStatus;
}

export interface TripWearConfirmation {
  selectionId: number;
  confirmed: true;
  wornAt: string;
  timeZone: string;
  occasion: OutfitOccasion;
  itemIds: number[];
  notes?: string;
}

export interface TripCompleteInput {
  confirmations: TripWearConfirmation[];
}

export interface TripCompleteResult {
  trip: Trip;
  wearEvents: WearEvent[];
}

export interface RecommendationRequest {
  weather: WeatherSnapshot;
  occasion: Formality;
  recentlyWornGarmentIds?: number[];
  userProfile?: PersonalProfile;
  includeGarmentIds?: number[];
  excludeGarmentIds?: number[];
}

export type RecommendationConstraintField = "includeGarmentIds" | "excludeGarmentIds";
export type RecommendationConstraintReason =
  | "INVALID_ARRAY"
  | "INVALID_ID"
  | "TOO_MANY"
  | "DUPLICATE"
  | "INCLUDE_EXCLUDE_CONFLICT"
  | "NOT_FOUND"
  | "NOT_OWNED"
  | "ARCHIVED"
  | "UNCONFIRMED"
  | "EXCLUDED"
  | "UNAVAILABLE"
  | "UNSATISFIABLE";

export interface RecommendationConstraintIssue {
  field: RecommendationConstraintField;
  garmentId?: number;
  reason: RecommendationConstraintReason;
}

export interface OutfitReplacementSuggestion {
  targetGarmentId: number;
  replacement: Garment;
  nextItems: Garment[];
  matchPercentDelta: number;
  reasons: string[];
}

export interface OutfitRecommendation {
  id: string;
  candidateId: string;
  outfitSignature: string;
  score: number;
  matchPercent?: number;
  scoreBreakdown?: RecommendationScoreBreakdown;
  items: Garment[];
  reasons: string[];
  replacements: OutfitReplacementSuggestion[];
}

export interface RecommendationResult {
  runId: number;
  weather: WeatherSnapshot;
  weatherScenario?: WeatherScenario;
  occasion: string;
  outfits: OutfitRecommendation[];
  missingSlots: GarmentCategory[];
  missingSlotDetails?: RecommendationMissingSlotDetail[];
}

export interface RecommendationMissingSlotDetail {
  slot: GarmentCategory;
  unavailableCount: number;
}

export type RecommendationDraftResult = Omit<RecommendationResult, "runId">;
export type RecommendationOutfitDraft = Omit<
  OutfitRecommendation,
  "id" | "candidateId" | "outfitSignature"
>;

export type WeatherScenario = "cold_windy" | "cold_dry" | "rainy_mild" | "hot_humid" | "hot_dry" | "dry_sunny" | "mild";

export interface RecommendationScoreBreakdown {
  slotCompleteness: number;
  weatherComfort: number;
  season: number;
  occasion: number;
  pairCompatibility: number;
  colorHarmony: number;
  recentWear: number;
  itemConfidence: number;
  userPreference: number;
  bodyProportion: number;
  colorSuitability: number;
  learnedPreference: number;
}

export type FeedbackVerdict = "liked" | "disliked" | "skipped";
export type FeedbackReason =
  | "too-warm"
  | "too-cold"
  | "too-formal"
  | "too-casual"
  | "color"
  | "fit"
  | "repeat"
  | "unavailable"
  | "other";

export interface RecommendationFeedbackInput {
  candidateId: string;
  verdict?: FeedbackVerdict;
  rating?: 1 | 2 | 3 | 4 | 5 | null;
  actuallyWorn?: boolean;
  reasonCodes: FeedbackReason[];
  comment?: string;
  woreInsteadOutfitId?: number;
}

export interface RecommendationFeedback extends Omit<RecommendationFeedbackInput, "rating"> {
  id: number;
  rating?: 1 | 2 | 3 | 4 | 5;
  actuallyWorn: boolean;
  comment: string;
  wearLogId?: number;
  wearEventId?: number;
  createdAt: string;
  updatedAt: string;
}

export interface OutfitPairStat {
  garmentAId: number;
  garmentBId: number;
  likes: number;
  dislikes: number;
  wornCount: number;
  totalFeedback: number;
  signal: number;
  updatedAt: string;
}

export interface RecommendationFeedbackInsights {
  totalCount: number;
  acceptedCount: number;
  acceptanceRate: number;
  weightedPairCount: number;
  mostCommonRejectionReason?: FeedbackReason;
  rejectionReasons: Array<{ reason: FeedbackReason; count: number }>;
}

export type RecommendationFeedbackClearScope =
  | { scope: "all" }
  | { scope: "candidate"; candidateId: string }
  | { scope: "date-range"; from: string; to: string };

export interface RecommendationFeedbackClearPreview {
  scope: RecommendationFeedbackClearScope["scope"];
  candidateId?: string;
  from?: string;
  to?: string;
  feedbackCount: number;
  affectedPairCount: number;
}

export interface RecommendationFeedbackClearResult extends RecommendationFeedbackClearPreview {
  deletedFeedbackCount: number;
  remainingPairStatsCount: number;
  clearedAt: string;
}

export interface GarmentAvailabilityEvent {
  id: number;
  garmentId: number;
  previousStatus: GarmentAvailabilityStatus;
  status: GarmentAvailabilityStatus;
  changedAt: string;
}

export interface GarmentAvailabilityChangeResult {
  changed: boolean;
  garment: Garment;
  event?: GarmentAvailabilityEvent;
}

export type TemperatureSensitivity = "runs-cold" | "neutral" | "runs-hot";

export interface UserPreferenceProfile {
  temperatureSensitivity?: TemperatureSensitivity;
  preferredColors?: string[];
  avoidedColors?: string[];
  preferredStyles?: string[];
}

export interface PersonalProfile extends UserPreferenceProfile {
  heightCm?: number;
  weightKg?: number;
  bodyType?: BodyType;
  skinTone?: SkinTone;
  colorDisposition?: ColorDisposition;
}

export interface WearLogEntry {
  id: number;
  garmentIds: number[];
  context: unknown;
  wornAt: string;
}

export interface RecommendationRunEntry {
  id: number;
  input: unknown;
  result: unknown;
  createdAt: string;
}

export interface WornGarmentInsight {
  id: number;
  name: string;
  category?: GarmentCategory;
  color?: string;
  wearCount?: number;
  lastWornAt?: string;
}

export interface WardrobeDistributionEntry<Key extends string = string> {
  key: Key;
  count: number;
  ratio: number;
}

export type WardrobeHealthLevel = "good" | "fair" | "needs-attention";

export interface WardrobeHealth {
  score: number;
  level: WardrobeHealthLevel;
  components: {
    coreCompleteness: number;
    seasonCoverage: number;
    styleCoverage: number;
    confirmationRate: number;
    utilizationRate: number;
  };
  issues: string[];
}

export type WardrobeSuggestionPriority = "low" | "medium" | "high";

export interface WardrobeSuggestion {
  id: string;
  priority: WardrobeSuggestionPriority;
  title: string;
  detail: string;
  evidence?: string[];
  relatedGarmentIds?: number[];
  relatedCategories?: GarmentCategory[];
  relatedSeasons?: Season[];
  relatedStyles?: string[];
}

export interface ValueGarmentEvidence {
  garmentId: number;
  name: string;
  category: GarmentCategory;
  acquiredAt?: string;
  purchasePriceCents?: number;
  currency?: "CNY";
  costSource?: GarmentCostSource;
  wearCount: number;
  lastWornAt?: string;
  costPerWearCents: number | null;
  evidence: string[];
}

export interface WardrobeValueInsights {
  generatedAt: string;
  knownPriceCount: number;
  unknownPriceCount: number;
  upperQuartilePriceCents?: number;
  bestValue: ValueGarmentEvidence[];
  lowUtilizationHighCost: ValueGarmentEvidence[];
  dormantGarments: ValueGarmentEvidence[];
  suggestions: WardrobeSuggestion[];
}

export interface WardrobeInsights {
  totalGarments: number;
  ownedGarments: number;
  confirmedGarments: number;
  pendingGarments: number;
  categoryDistribution: Partial<Record<GarmentCategory, number>>;
  colorDistribution: Record<string, number>;
  seasonDistribution: Partial<Record<Season, number>>;
  styleDistribution: Record<string, number>;
  formalityDistribution: Partial<Record<Formality, number>>;
  styleTendency: {
    dominantStyles: WardrobeDistributionEntry[];
    dominantFormalities: WardrobeDistributionEntry<Formality>[];
  };
  health: WardrobeHealth;
  insightSuggestions: WardrobeSuggestion[];
  shoppingSuggestions: WardrobeSuggestion[];
  bodySuggestions: WardrobeSuggestion[];
  mostWorn: WornGarmentInsight[];
  recentlyUnworn?: WornGarmentInsight[];
  neverWorn: WornGarmentInsight[];
  feedbackSummary?: RecommendationFeedbackInsights;
}

export interface OutfitExportBase {
  exportedAt: string;
  profile: PersonalProfile;
  garments: Garment[];
  sourceOrderItems: unknown[];
  wearLogs: WearLogEntry[];
  recommendationRuns: RecommendationRunEntry[];
}

export interface OutfitExportV1 extends OutfitExportBase {
  version: 1;
}

export interface RecommendationCandidateExport {
  candidateId: string;
  runId: number;
  outfitSignature: string;
  rank: number;
  itemIds: number[];
  scoreSnapshot: unknown;
  createdAt: string;
}

export interface GarmentAssetMetadata {
  id: number;
  garmentId: number;
  kind: string;
  mimeType: "image/webp";
  byteSize: number;
  width: number;
  height: number;
  sha256: string;
  active: boolean;
  createdAt: string;
  archivePath: string;
}

export type TripExportRecord = Omit<Trip, "days" | "selections" | "packingItems">;
export type TripDayExportRecord = Omit<TripDay, "activities">;
export type TripOutfitSelectionExportRecord = Omit<TripOutfitSelection, "garments"> & {
  garmentIds: number[];
};

export interface OutfitExportV2 extends OutfitExportBase {
  version: 2;
  schemaVersion: number;
  features: string[];
  recommendationCandidates: RecommendationCandidateExport[];
  garmentAssets?: GarmentAssetMetadata[];
  savedOutfits?: SavedOutfit[];
  recommendationFeedback?: RecommendationFeedback[];
  outfitPairStats?: OutfitPairStat[];
  garmentAvailabilityEvents?: GarmentAvailabilityEvent[];
  wearEvents?: WearEvent[];
  outfitPlanEntries?: OutfitPlanEntry[];
  similarityFeedback?: GarmentSimilarityFeedback[];
  trips?: TripExportRecord[];
  tripDays?: TripDayExportRecord[];
  tripActivities?: TripActivity[];
  tripOutfitSelections?: TripOutfitSelectionExportRecord[];
  tripPackingItems?: TripPackingItem[];
}

export type OutfitExport = OutfitExportV1 | OutfitExportV2;

export type VisionModelId = "rembg-isnet" | "clip-vit-base-patch32";
export type VisionModelKind = "background-removal" | "tagging";
export type VisionJobStatus = "running" | "succeeded" | "failed";
export type VisionJobAction = "download" | "verify";

export interface VisionModelStatus {
  id: VisionModelId;
  label: string;
  kind: VisionModelKind;
  installed: boolean;
  path: string;
  message: string;
  job?: VisionModelJob;
}

export interface VisionModelJob {
  id: string;
  modelId: VisionModelId;
  action: VisionJobAction;
  status: VisionJobStatus;
  message: string;
  startedAt: string;
  updatedAt: string;
  pid?: number;
  error?: string;
}

export interface VisionModelsResponse {
  modelRoot: string;
  models: VisionModelStatus[];
  jobs: VisionModelJob[];
}

export interface VisionTagScore {
  label: string;
  score: number;
}

export interface VisionTagSuggestion {
  category?: GarmentCategory;
  styles: string[];
  patterns: string[];
  tags: string[];
  scores: VisionTagScore[];
}

export type TaobaoPageType = "order-list" | "item-detail";

export interface TaobaoDetailProp {
  name: string;
  value: string;
}

export interface TaobaoCapturedItem {
  pageType?: TaobaoPageType;
  itemId?: string;
  orderId?: string;
  orderTime?: string;
  title?: string;
  sku?: string;
  quantity?: number | string;
  payment?: number | string;
  status?: string;
  refundText?: string;
  itemUrl?: string;
  imageUrl?: string;
  rawText?: string;
  detailUrl?: string;
  detailTitle?: string;
  detailProps?: TaobaoDetailProp[];
  detailDescription?: string;
  detailImages?: string[];
  detailRawText?: string;
}

export interface TaobaoCapturedBatch {
  source?: string;
  pageType?: TaobaoPageType;
  capturedAt?: string;
  pageUrl?: string;
  items?: TaobaoCapturedItem[];
}

export interface TaobaoWardrobeFilterSummary {
  originalItems: number;
  keptItems: number;
  skippedRefunded: number;
  skippedNonApparel: number;
}

export interface ThumbnailRefreshResult {
  scanned: number;
  attemptedDownloads: number;
  updated: number;
  skipped: number;
}

export type ThumbnailCandidateSource = "current" | "order" | "detail" | "capture";

export interface ThumbnailCandidate {
  url: string;
  source: ThumbnailCandidateSource;
  score: number;
  selected: boolean;
}

export interface GarmentThumbnailCandidatesResponse {
  garmentId: number;
  currentImageUrl: string;
  candidates: ThumbnailCandidate[];
}

export type CaptureJobStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled";
export type CaptureJobMode = "orders" | "item-detail";
export type CaptureEngine = "selenium" | "playwright";

export interface CaptureJob {
  id: string;
  mode: CaptureJobMode;
  engine: CaptureEngine;
  status: CaptureJobStatus;
  pid: number;
  outputDir: string;
  logPath?: string;
  artifactPath?: string;
  error?: string;
  message: string;
  createdAt: string;
  updatedAt: string;
}

export interface CaptureArtifact {
  jobId: string;
  outputDir: string;
  fileName: string;
  path: string;
  jsonText: string;
  payload: unknown;
  filterSummary?: TaobaoWardrobeFilterSummary;
}

export interface TaobaoImportPreviewItem {
  sourceItemKey: string;
  purchaseCheckEligible: boolean;
  purchaseCheckIneligibleReason?: "refunded" | "non-apparel" | "needs-review";
  brand: string;
  name: string;
  rawName: string;
  category: GarmentCategory;
  color: string;
  warmth: GarmentWarmth;
  seasons: Season[];
  styles: string[];
  formality: Formality;
  size?: string;
  materials: string[];
  patterns: string[];
  tags: string[];
  notes: string;
  confidence: number;
  imageUrl: string;
  disposition: ImportDisposition;
  existingGarmentId?: number;
  restoreRequired?: boolean;
  message?: string;
}

export type ImportDisposition = "create" | "update" | "refund-sync" | "unchanged" | "skip";

export type ImportGarmentOverrides = Partial<Pick<Garment,
  "brand" | "name" | "category" | "color" | "warmth" |
  "seasons" | "styles" | "formality" | "size" |
  "materials" | "patterns" | "tags" | "notes"
>>;

export interface ImportDecision {
  sourceItemKey: string;
  include: boolean;
  overrides?: ImportGarmentOverrides;
}

export interface TaobaoImportCommitRequest {
  batch: TaobaoCapturedBatch;
  decisions: ImportDecision[];
}

export interface TaobaoImportCommitItem {
  sourceItemKey: string;
  disposition: ImportDisposition;
  garmentId?: number;
}

export interface TaobaoImportCommitResult {
  batchId: string;
  summary: {
    totalDecisions: number;
    included: number;
    created: number;
    updated: number;
    refundSynced: number;
    unchanged: number;
    skipped: number;
  };
  items: TaobaoImportCommitItem[];
}

export interface TaobaoImportSkippedItem {
  title: string;
  reason: "refunded" | "non-apparel";
}

export interface TaobaoImportPreview {
  batchId: string;
  summary: {
    totalItems: number;
    uniqueItems: number;
    skippedRefunded: number;
    skippedNonApparel: number;
    createdGarments: number;
  };
  duplicateCount: number;
  candidates: TaobaoImportPreviewItem[];
  skipped: TaobaoImportSkippedItem[];
}
