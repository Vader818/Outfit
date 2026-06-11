export type GarmentCategory = "top" | "bottom" | "dress" | "outerwear" | "shoes" | "accessory";
export type GarmentWarmth = "light" | "medium" | "warm" | "heavy";
export type Season = "spring" | "summer" | "autumn" | "winter";
export type Formality = "casual" | "smart-casual" | "formal" | "sport";

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
  imageUrl: string;
  owned: boolean;
  confirmed: boolean;
  excluded: boolean;
  confidence: number;
  notes?: string;
  itemUrl?: string;
  detailUrl?: string;
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
  items: Garment[];
  reasons: string[];
  alternatives: Garment[];
}

export interface RecommendationResult {
  weather: WeatherSnapshot;
  occasion: string;
  outfits: OutfitRecommendation[];
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
