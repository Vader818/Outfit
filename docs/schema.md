# 数据库与类型 Schema

Outfit 使用本地 SQLite 数据库保存衣橱、淘宝来源记录、天气缓存、穿着记录和推荐历史。默认路径：

```text
data/outfit.sqlite
```

数据库由 `server/db.ts` 在启动时自动迁移。应用返回给前端的公共类型定义在 `src/shared/types.ts`。

## 枚举类型

```ts
type GarmentCategory = "top" | "bottom" | "dress" | "outerwear" | "shoes" | "accessory";
type GarmentWarmth = "light" | "medium" | "warm" | "heavy";
type Season = "spring" | "summer" | "autumn" | "winter";
type Formality = "casual" | "smart-casual" | "formal" | "sport";
type TaobaoPageType = "order-list" | "item-detail";
type CaptureJobStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled";
type CaptureJobMode = "orders" | "item-detail";
type WeatherScenario = "cold_windy" | "cold_dry" | "rainy_mild" | "hot_humid" | "hot_dry" | "dry_sunny" | "mild";
type TemperatureSensitivity = "runs-cold" | "neutral" | "runs-hot";
```

说明：

- `accessory` 已纳入淘宝自动导入过滤；推荐算法把配饰作为可选增强项，不把它作为完整搭配的必需核心单品。
- `seasons` 和 `styles` 在 SQLite 中以 JSON 字符串保存，在 API 中返回数组。
- 布尔字段在 SQLite 中以 `0`/`1` 保存，在 API 中返回 `boolean`。

## API 类型

### Garment

```ts
interface Garment {
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
```

字段含义：

| 字段 | 说明 |
| --- | --- |
| `sourceOrderItemId` | 关联的淘宝来源记录 ID |
| `brand` | 从商品参数、店铺名或标题推断出的品牌 |
| `name` | 清洗后的展示名 |
| `rawName` | 原始或半清洗商品标题 |
| `category` | 推荐与过滤使用的服饰类别 |
| `color` | 分类器推断颜色 |
| `warmth` | 保暖程度 |
| `seasons` | 适用季节 |
| `styles` | 风格标签 |
| `formality` | 场合正式程度 |
| `size` | 尺码，预留给后续详情补全和手动维护 |
| `materials` | 材质标签，预留给后续自动标签 |
| `patterns` | 图案标签，预留给后续自动标签 |
| `tags` | 用户或系统标签 |
| `owned` | 是否仍拥有 |
| `confirmed` | 是否经过用户确认或手动编辑 |
| `excluded` | 是否从推荐中排除 |
| `confidence` | 自动分类置信度 |
| `itemUrl` / `detailUrl` | 从来源表联查出的淘宝链接 |
| `lastWornAt` | 最近穿着时间，预留展示字段 |
| `wearCount` | 穿着次数，预留展示字段 |

### WeatherSnapshot

```ts
interface WeatherSnapshot {
  date: string;
  temperature: number;
  apparentTemperature: number;
  precipitationProbability: number;
  windSpeed: number;
  weatherCode: number;
  summary: string;
}
```

### OutfitRecommendation

```ts
interface OutfitRecommendation {
  id: string;
  score: number;
  matchPercent?: number;
  scoreBreakdown?: RecommendationScoreBreakdown;
  items: Garment[];
  reasons: string[];
  alternatives: Garment[];
}

interface RecommendationResult {
  weather: WeatherSnapshot;
  weatherScenario?: WeatherScenario;
  occasion: string;
  outfits: OutfitRecommendation[];
}

interface RecommendationScoreBreakdown {
  slotCompleteness: number;
  weatherComfort: number;
  season: number;
  occasion: number;
  pairCompatibility: number;
  colorHarmony: number;
  recentWear: number;
  itemConfidence: number;
  userPreference: number;
}

interface UserPreferenceProfile {
  temperatureSensitivity?: TemperatureSensitivity;
  preferredColors?: string[];
  avoidedColors?: string[];
  preferredStyles?: string[];
}
```

说明：

- `score` 保留算法内部排序分，前端展示优先使用 `matchPercent`。
- `matchPercent` 是 `0-100` 的用户可理解匹配度。
- `scoreBreakdown` 是归一化后的可解释维度分，方便展示天气舒适度、场合匹配、近期穿着惩罚和用户偏好贡献。
- `weatherScenario` 是天气归一化层，用于解释推荐依据。

### 淘宝采集类型

```ts
interface TaobaoDetailProp {
  name: string;
  value: string;
}

interface TaobaoCapturedItem {
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

interface TaobaoCapturedBatch {
  source?: string;
  pageType?: TaobaoPageType;
  capturedAt?: string;
  pageUrl?: string;
  items?: TaobaoCapturedItem[];
}

interface CaptureJob {
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

interface CaptureArtifact {
  jobId: string;
  outputDir: string;
  fileName: string;
  path: string;
  jsonText: string;
  payload: unknown;
  filterSummary?: TaobaoWardrobeFilterSummary;
}

interface TaobaoWardrobeFilterSummary {
  originalItems: number;
  keptItems: number;
  skippedRefunded: number;
  skippedNonApparel: number;
}

interface TaobaoImportPreviewItem {
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

interface TaobaoImportSkippedItem {
  title: string;
  reason: "refunded" | "non-apparel";
}

interface TaobaoImportPreview {
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
```

导入约定：

- `items` 必须是数组。
- `capturedAt` 缺省时由服务端补当前时间。
- `source` 缺省为 `taobao-bookmarklet`。
- `pageType` 可由 `pageUrl` 或单个 `item.pageType` 推断。
- `detailProps`、`detailImages` 会归一化、去重并保存为 JSON 字符串。
- `CaptureJob` 当前保存在 Node 进程内存中；重启 API 后历史 job 状态不会恢复，但产物文件仍在 `output/taobao-captures/<jobId>`。
- `TaobaoImportPreview` 不写入 SQLite，只复用导入归一化、去重和分类逻辑。

## SQLite 表

### source_order_items

保存淘宝订单页和商品详情页的原始来源记录。

| 列 | 类型 | 约束/默认值 | 说明 |
| --- | --- | --- | --- |
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | 来源记录 ID |
| `external_key` | TEXT | NOT NULL UNIQUE | 导入去重稳定键 |
| `source` | TEXT | NOT NULL | 采集来源 |
| `page_type` | TEXT |  | `order-list` 或 `item-detail` |
| `item_id` | TEXT |  | 淘宝商品 ID |
| `order_id` | TEXT |  | 订单号 |
| `order_time` | TEXT |  | 下单时间 |
| `title` | TEXT | NOT NULL | 订单项标题 |
| `sku` | TEXT |  | 规格、颜色、尺码 |
| `quantity` | INTEGER | NOT NULL DEFAULT 1 | 数量 |
| `payment` | REAL |  | 支付金额 |
| `status` | TEXT |  | 交易状态 |
| `refund_text` | TEXT |  | 售后/退款文本 |
| `item_url` | TEXT |  | 商品链接 |
| `image_url` | TEXT |  | 订单页图片 |
| `raw_text` | TEXT |  | 订单块原始文本 |
| `detail_url` | TEXT |  | 商品详情链接 |
| `detail_title` | TEXT |  | 详情页标题 |
| `detail_props` | TEXT |  | JSON 编码的 `TaobaoDetailProp[]` |
| `detail_description` | TEXT |  | 详情描述 |
| `detail_images` | TEXT |  | JSON 编码的图片 URL 数组 |
| `detail_raw_text` | TEXT |  | 详情页原始文本摘要 |
| `is_refunded` | INTEGER | NOT NULL DEFAULT 0 | 是否退款/售后 |
| `is_apparel` | INTEGER | NOT NULL DEFAULT 0 | 是否识别为衣橱候选 |
| `imported_at` | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 首次导入时间 |

索引：

```sql
CREATE INDEX IF NOT EXISTS idx_source_order_items_item_id
ON source_order_items(item_id);
```

### garments

保存衣橱条目。

| 列 | 类型 | 约束/默认值 | 说明 |
| --- | --- | --- | --- |
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | 衣橱条目 ID |
| `source_order_item_id` | INTEGER | UNIQUE, FK | 关联 `source_order_items.id` |
| `brand` | TEXT |  | 品牌 |
| `name` | TEXT | NOT NULL | 展示名 |
| `raw_name` | TEXT |  | 原始标题 |
| `category` | TEXT | NOT NULL | `GarmentCategory` |
| `color` | TEXT | NOT NULL | 颜色 |
| `warmth` | TEXT | NOT NULL | `GarmentWarmth` |
| `seasons` | TEXT | NOT NULL | JSON 编码的 `Season[]` |
| `styles` | TEXT | NOT NULL | JSON 编码的风格标签 |
| `formality` | TEXT | NOT NULL | `Formality` |
| `image_url` | TEXT |  | 展示图片 |
| `owned` | INTEGER | NOT NULL DEFAULT 1 | 是否拥有 |
| `confirmed` | INTEGER | NOT NULL DEFAULT 0 | 是否确认 |
| `excluded` | INTEGER | NOT NULL DEFAULT 0 | 是否排除推荐 |
| `confidence` | REAL | NOT NULL DEFAULT 0 | 自动分类置信度 |
| `notes` | TEXT |  | 用户备注 |
| `created_at` | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| `updated_at` | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 更新时间 |

更新行为：

- `PUT /api/garments/:id` 会更新展示字段和 `updated_at`。
- 用户确认过的名称在迁移回填时会尽量保留，避免被自动清洗覆盖。
- 删除衣橱条目只删除 `garments` 行，不删除淘宝来源记录或采集文件。

### weather_cache

保存天气响应缓存。

| 列 | 类型 | 约束/默认值 | 说明 |
| --- | --- | --- | --- |
| `cache_key` | TEXT | PRIMARY KEY | `weather:<lat>:<lon>`，经纬度保留 4 位 |
| `latitude` | REAL | NOT NULL | 纬度 |
| `longitude` | REAL | NOT NULL | 经度 |
| `payload` | TEXT | NOT NULL | JSON 编码的 `WeatherSnapshot` |
| `fetched_at` | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 拉取时间 |

缓存策略：

- 默认有效期 30 分钟。
- Open-Meteo 失败时可返回过期缓存。
- 没有缓存时返回本地估算天气。

### wear_logs

保存穿着记录。

| 列 | 类型 | 约束/默认值 | 说明 |
| --- | --- | --- | --- |
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | 记录 ID |
| `garment_ids` | TEXT | NOT NULL | JSON 编码的衣橱 ID 数组 |
| `context` | TEXT |  | JSON 编码的场合、天气等上下文 |
| `worn_at` | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 穿着记录时间 |

推荐时会读取最近 8 条穿着记录，并降低重复核心单品的得分。

### recommendation_runs

保存推荐请求与结果，便于本地回看或调试。

| 列 | 类型 | 约束/默认值 | 说明 |
| --- | --- | --- | --- |
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | 推荐记录 ID |
| `input_json` | TEXT | NOT NULL | JSON 编码的推荐输入 |
| `result_json` | TEXT | NOT NULL | JSON 编码的推荐结果 |
| `created_at` | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 创建时间 |

## 数据目录

| 路径 | 内容 | 是否应提交 |
| --- | --- | --- |
| `data/outfit.sqlite` | 本地衣橱数据库 | 否 |
| `data/outfit.sqlite-*` | SQLite WAL/SHM 等辅助文件 | 否 |
| `output/taobao-captures` | 淘宝采集 JSON，任务式采集会使用 `<jobId>` 子目录 | 否 |
| `output/chrome-taobao-profile` | Selenium Chrome 用户数据目录 | 否 |
| `logs` | 本地日志 | 否 |

这些路径已在 `.gitignore` 中忽略。
