export type GarmentCategory = "top" | "bottom" | "dress" | "outerwear" | "shoes" | "accessory";
export type GarmentWarmth = "light" | "medium" | "warm" | "heavy";
export type Season = "spring" | "summer" | "autumn" | "winter";
export type Formality = "casual" | "smart-casual" | "formal" | "sport";
export type BodyType = "slim-tall" | "average" | "athletic" | "stocky";
export type SkinTone = "dark-yellow" | "medium-yellow" | "fair" | "deep";
export type ColorDisposition = "cool-clean" | "neutral" | "warm-soft";

export interface Garment {
  id: number;
  sourceOrderItemId?: number;
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
  confidence: number;
  notes?: string;
  itemUrl?: string;
  detailUrl?: string;
  lastWornAt?: string;
  wearCount?: number;
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

export interface OutfitRecommendation {
  id: string;
  score: number;
  matchPercent?: number;
  scoreBreakdown?: RecommendationScoreBreakdown;
  items: Garment[];
  reasons: string[];
  alternatives: Garment[];
}

export interface RecommendationResult {
  weather: WeatherSnapshot;
  weatherScenario?: WeatherScenario;
  occasion: string;
  outfits: OutfitRecommendation[];
}

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

export interface WardrobeInsights {
  totalGarments: number;
  ownedGarments: number;
  confirmedGarments: number;
  pendingGarments: number;
  categoryDistribution: Partial<Record<GarmentCategory, number>>;
  colorDistribution: Record<string, number>;
  mostWorn: WornGarmentInsight[];
  neverWorn: WornGarmentInsight[];
}

export interface OutfitExport {
  version: 1;
  exportedAt: string;
  profile: PersonalProfile;
  garments: Garment[];
  sourceOrderItems: unknown[];
  wearLogs: WearLogEntry[];
  recommendationRuns: RecommendationRunEntry[];
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

export type CaptureJobStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled";
export type CaptureJobMode = "orders" | "item-detail";

export interface CaptureJob {
  id: string;
  mode: CaptureJobMode;
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
  confidence: number;
  imageUrl: string;
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
