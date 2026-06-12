import type { Formality, GarmentCategory, GarmentWarmth, Season } from "../../src/shared/types";

export interface Classification {
  category: GarmentCategory;
  color: string;
  warmth: GarmentWarmth;
  seasons: Season[];
  styles: string[];
  formality: Formality;
  confidence: number;
}

const CATEGORY_KEYWORDS: Array<[GarmentCategory, RegExp]> = [
  ["dress", /连衣裙|one\s?piece|dress/i],
  ["outerwear", /外套|大衣|羽绒服|棉服|夹克|西装|风衣|开衫|马甲|coat|jacket|blazer|parka/i],
  ["bottom", /牛仔裤|休闲裤|西裤|长裤|短裤|半身裙|裙裤|打底裤|裤|skirt|pants|jeans|trousers|shorts/i],
  ["shoes", /短靴|长靴|运动鞋|帆布鞋|皮鞋|凉鞋|拖鞋|鞋|boots?|sneakers?|shoes?|loafer/i],
  ["accessory", /围巾|帽子?|腰带|背包|包包|手提包|斜挎包|单肩包|袜子?|短袜|长袜|手套|领带|项链|耳环|scarf|hat|belt|bag|socks?|gloves?/i],
  ["top", /T恤|t恤|衬衫|毛衣|针织|卫衣|上衣|背心|吊带|polo|shirt|sweater|hoodie|tee|blouse/i]
];

const COLOR_KEYWORDS: Array<[string, RegExp]> = [
  ["black", /黑|墨|black/i],
  ["white", /白|米白|象牙|white|ivory/i],
  ["gray", /灰|银|gray|grey|silver/i],
  ["blue", /蓝|牛仔|藏青|navy|blue|denim/i],
  ["brown", /棕|咖|驼|卡其|brown|camel|khaki/i],
  ["beige", /米色|杏色|裸色|beige|cream/i],
  ["red", /红|酒红|red|burgundy/i],
  ["pink", /粉|pink/i],
  ["green", /绿|green/i],
  ["yellow", /黄|yellow/i],
  ["purple", /紫|purple/i]
];

const NON_WEARABLE_PRODUCT_PATTERN = /手机壳|保护套|保护壳|蓝牙耳机|耳机|牙刷|水果|李子|零食|饼干|鸭脖|沐浴露|洗面奶|面霜|爽肤水|纸巾|抽纸|饮用水|香皂|肥皂|台灯|收纳袋|收纳盒|置物架|鞋架|衣柜|衣服柜|橱柜|隔板|行李箱|流量卡/i;

export function classifyGarment(title: string, sku = ""): Classification | null {
  const titleText = title.trim();
  const text = `${titleText} ${sku}`.trim();
  if (NON_WEARABLE_PRODUCT_PATTERN.test(titleText)) {
    return null;
  }

  const titleCategory = detectCategory(titleText);
  const category = titleCategory ?? detectCategory(text);
  if (!category) {
    return null;
  }
  if (!titleCategory && NON_WEARABLE_PRODUCT_PATTERN.test(text)) {
    return null;
  }

  const color = COLOR_KEYWORDS.find(([, pattern]) => pattern.test(text))?.[0] ?? "unknown";
  const warmth = detectWarmth(text, category);
  const seasons = detectSeasons(text, warmth);
  const formality = detectFormality(text);
  const styles = Array.from(new Set([formality, category === "shoes" && /运动|sneaker|跑步|sport/i.test(text) ? "sport" : "casual"]));
  const confidence =
    0.45 +
    (color !== "unknown" ? 0.18 : 0) +
    (seasons.length > 0 ? 0.14 : 0) +
    (warmth !== "medium" ? 0.12 : 0) +
    (sku ? 0.06 : 0);

  return {
    category,
    color,
    warmth,
    seasons,
    styles,
    formality,
    confidence: Number(Math.min(confidence, 0.95).toFixed(2))
  };
}

function detectCategory(text: string): GarmentCategory | undefined {
  return CATEGORY_KEYWORDS.find(([, pattern]) => pattern.test(text))?.[0];
}

function detectWarmth(text: string, category: GarmentCategory): GarmentWarmth {
  if (/羽绒|羊毛|毛呢|加绒|加厚|厚款|厚实|厚重|偏厚|棉服|大衣|parka|down|wool|fleece/i.test(text)) return "heavy";
  if (/毛衣|针织|卫衣|风衣|夹克|靴|sweater|hoodie|jacket|boots?/i.test(text)) return "warm";
  if (/短袖|薄|雪纺|亚麻|凉鞋|吊带|背心|short sleeve|linen|sandals?/i.test(text)) return "light";
  if (category === "outerwear") return "warm";
  return "medium";
}

function detectSeasons(text: string, warmth: GarmentWarmth): Season[] {
  const seasons = new Set<Season>();
  if (/春|spring/i.test(text)) seasons.add("spring");
  if (/夏|summer|短袖|凉鞋|亚麻|吊带|背心/i.test(text)) seasons.add("summer");
  if (/秋|autumn|fall/i.test(text)) seasons.add("autumn");
  if (/冬|winter|羽绒|羊毛|毛呢|加绒|加厚|厚款|厚实|厚重|偏厚/i.test(text)) seasons.add("winter");
  if (seasons.size === 0) {
    if (warmth === "light") ["spring", "summer"].forEach((season) => seasons.add(season as Season));
    if (warmth === "medium") ["spring", "autumn"].forEach((season) => seasons.add(season as Season));
    if (warmth === "warm") ["autumn", "winter"].forEach((season) => seasons.add(season as Season));
    if (warmth === "heavy") seasons.add("winter");
  }
  return Array.from(seasons);
}

function detectFormality(text: string): Formality {
  if (/西装|西裤|正装|通勤|商务|衬衫|blazer|formal|business/i.test(text)) return "smart-casual";
  if (/运动|跑步|瑜伽|健身|sport|training|running/i.test(text)) return "sport";
  return "casual";
}
