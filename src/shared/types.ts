export type GarmentCategory = "top" | "bottom" | "dress" | "outerwear" | "shoes" | "accessory";
export type GarmentWarmth = "light" | "medium" | "warm" | "heavy";
export type Season = "spring" | "summer" | "autumn" | "winter";
export type Formality = "casual" | "smart-casual" | "formal" | "sport";
export type GarmentOrigin = "taobao" | "manual" | "backup";
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
