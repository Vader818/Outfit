# 数据库与类型 Schema

Outfit 使用本地 SQLite 数据库保存衣橱、淘宝来源记录、天气缓存、穿着记录和推荐历史。默认路径：

```text
data/outfit.sqlite
```

数据库由 `server/db.ts` 在启动时自动迁移。应用返回给前端的公共类型定义在 `src/shared/types.ts`。

## 迁移版本

项目支持的未版本化 M0 前数据库在首次打开时执行：

```text
legacyBaseline0 → 登记 schema_migrations baseline 0 → 顺序执行编号迁移
```

- baseline 0 的名称为 `legacy-baseline`，负责把项目支持的未版本化历史数据库归一到 M0 之前的 schema，并在同一事务中登记版本 0。已经存在 `schema_migrations` 的数据库不会再次运行 baseline，而是校验已应用记录后继续编号迁移。
- 当前编号迁移版本为 2：版本 1 为 `recommendation-candidates`，版本 2 为 `trusted-ingestion`。
- 编号必须是正整数并严格递增；数据库中的已应用记录必须是当前迁移列表的精确前缀。由更新版本应用过未知迁移的数据库会拒绝由旧代码继续写入。
- 每个迁移使用独立的 `BEGIN IMMEDIATE` 事务。失败时 schema 修改和版本登记一起回滚；重复启动不会重复应用已登记迁移。
- 生产代码只提供前向迁移，不提供 down migration。

## 枚举类型

```ts
type GarmentCategory = "top" | "bottom" | "dress" | "outerwear" | "shoes" | "accessory";
type GarmentWarmth = "light" | "medium" | "warm" | "heavy";
type Season = "spring" | "summer" | "autumn" | "winter";
type Formality = "casual" | "smart-casual" | "formal" | "sport";
type GarmentOrigin = "taobao" | "manual" | "backup";
type ImportDisposition = "create" | "update" | "refund-sync" | "unchanged" | "skip";
type TaobaoPageType = "order-list" | "item-detail";
type CaptureJobStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled";
type CaptureJobMode = "orders" | "item-detail";
type CaptureEngine = "selenium" | "playwright";
type WeatherScenario = "cold_windy" | "cold_dry" | "rainy_mild" | "hot_humid" | "hot_dry" | "dry_sunny" | "mild";
type TemperatureSensitivity = "runs-cold" | "neutral" | "runs-hot";
type BodyType = "slim-tall" | "average" | "athletic" | "stocky";
type SkinTone = "dark-yellow" | "medium-yellow" | "fair" | "deep";
type ColorDisposition = "cool-clean" | "neutral" | "warm-soft";
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
| `origin` | 来源：淘宝、手工或备份恢复 |
| `archivedAt` | 软归档时间；存在时不属于默认 active 衣橱 |
| `seasons` | 适用季节 |
| `styles` | 风格标签 |
| `formality` | 场合正式程度 |
| `size` | 尺码，预留给后续详情补全和手动维护 |
| `materials` | 材质标签，预留给后续自动标签 |
| `patterns` | 图案标签，预留给后续自动标签 |
| `tags` | 用户或系统标签 |
| `imageUrl` | 本地图片引用或来源图片 URL；前端默认不请求远程 URL，只有本次会话显式开启后才加载受信淘宝 CDN 图片 |
| `owned` | 是否仍拥有 |
| `confirmed` | 是否经过用户确认或手动编辑 |
| `excluded` | 是否从推荐中排除 |
| `confidence` | 自动分类置信度 |
| `acquiredAt` | 可选购入日期，`YYYY-MM-DD` |
| `purchasePriceCents` / `currency` | 可选非负整数分与 `CNY` |
| `itemUrl` / `detailUrl` | 从来源表联查出的淘宝链接 |
| `lastWornAt` | 最近穿着时间，预留展示字段 |
| `wearCount` | 穿着次数，预留展示字段 |
| `cutoutImageUrl` | 本地去背景透明 PNG 路径 |
| `visionTags` | 本地视觉模型生成的标签建议，用户确认前不覆盖正式字段 |
| `visionUpdatedAt` | 最近一次视觉处理或分析时间 |

### ManualGarmentCreate

`POST /api/garments` 使用以下负载创建无淘宝来源的手工衣物：

```ts
interface ManualGarmentCreate {
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
```

服务端不接受来源、图片或状态字段，并固定写入 `source_order_item_id=NULL`、`origin=manual`、`raw_name=name`、空图片、`owned=1`、`confirmed=1`、`excluded=0`、`confidence=1`。

### PersonalProfile

```ts
interface PersonalProfile {
  heightCm?: number;
  weightKg?: number;
  bodyType?: BodyType;
  skinTone?: SkinTone;
  colorDisposition?: ColorDisposition;
  temperatureSensitivity?: TemperatureSensitivity;
  preferredColors?: string[];
  avoidedColors?: string[];
  preferredStyles?: string[];
}
```

画像的所有字段均可省略。数据库没有保存画像时，`GET /api/profile` 返回 `{}`；前端初始经纬度也为空，不会静默注入北京坐标或具体个人数据。位置保存在浏览器 `localStorage`，不属于 `PersonalProfile` 或 SQLite 画像记录。

### WardrobeInsights

`GET /api/insights` 返回结构化衣橱分析。默认洞察只读取 `owned=1 AND archived_at IS NULL` 的 active 衣物；推荐资格在此基础上再要求 `confirmed=1 AND excluded=0`。

```ts
interface WardrobeDistributionEntry<Key extends string = string> {
  key: Key;
  count: number;
  ratio: number;
}

interface WardrobeHealth {
  score: number;
  level: "good" | "fair" | "needs-attention";
  components: {
    coreCompleteness: number;
    seasonCoverage: number;
    styleCoverage: number;
    confirmationRate: number;
    utilizationRate: number;
  };
  issues: string[];
}

interface WardrobeSuggestion {
  id: string;
  priority: "low" | "medium" | "high";
  title: string;
  detail: string;
  evidence?: string[];
  relatedGarmentIds?: number[];
  relatedCategories?: GarmentCategory[];
  relatedSeasons?: Season[];
  relatedStyles?: string[];
}

interface WardrobeInsights {
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
}
```

### 本地视觉模型类型

```ts
type VisionModelId = "rembg-isnet" | "clip-vit-base-patch32";
type VisionModelKind = "background-removal" | "tagging";
type VisionJobStatus = "running" | "succeeded" | "failed";
type VisionJobAction = "download" | "verify";

interface VisionModelStatus {
  id: VisionModelId;
  label: string;
  kind: VisionModelKind;
  installed: boolean;
  path: string;
  message: string;
  job?: VisionModelJob;
}

interface VisionModelJob {
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

interface VisionModelsResponse {
  modelRoot: string;
  models: VisionModelStatus[];
  jobs: VisionModelJob[];
}

interface VisionTagSuggestion {
  category?: GarmentCategory;
  styles: string[];
  patterns: string[];
  tags: string[];
  scores: Array<{ label: string; score: number }>;
}
```

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
  candidateId: string;
  outfitSignature: string;
  score: number;
  matchPercent?: number;
  scoreBreakdown?: RecommendationScoreBreakdown;
  items: Garment[];
  reasons: string[];
  alternatives: Garment[];
}

interface RecommendationResult {
  runId: number;
  weather: WeatherSnapshot;
  weatherScenario?: WeatherScenario;
  occasion: string;
  outfits: OutfitRecommendation[];
  missingSlots: GarmentCategory[];
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
  bodyProportion: number;
  colorSuitability: number;
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
- `runId` 指向保存本次请求与结果的 `recommendation_runs.id`。
- `candidateId` 是全局唯一候选 UUID；`id === candidateId` 是当前兼容约定。
- `outfitSignature` 是按固定 slot 顺序和衣物 ID 计算的完整组合 SHA-256 签名。它可跨 run 识别相同组合，但不代替天气、场合、rank 或评分上下文。
- `missingSlots` 只表达无法构成连衣裙或“上装＋下装”核心时的结构化缺口；鞋履是软缺口。
- 候选按核心、外套、鞋履、配饰分层生成，默认总评估上限 20,000，每层 beam width 上限 120；超限时采用确定性均匀采样。

### OutfitExport

```ts
interface OutfitExportBase {
  exportedAt: string;
  profile: PersonalProfile;
  garments: Garment[];
  sourceOrderItems: unknown[];
  wearLogs: WearLogEntry[];
  recommendationRuns: RecommendationRunEntry[];
}

interface OutfitExportV1 extends OutfitExportBase {
  version: 1;
}

interface RecommendationCandidateExport {
  candidateId: string;
  runId: number;
  outfitSignature: string;
  rank: number;
  itemIds: number[];
  scoreSnapshot: unknown;
  createdAt: string;
}

interface GarmentAssetMetadata {
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
  archivePath: `assets/${number}.webp`;
}

interface OutfitExportV2 extends OutfitExportBase {
  version: 2;
  schemaVersion: number;
  features: string[];
  recommendationCandidates: RecommendationCandidateExport[];
  garmentAssets?: GarmentAssetMetadata[];
}

type OutfitExport = OutfitExportV1 | OutfitExportV2;
```

`GET /api/export` 当前只生成 V2；内部校验器仍识别没有 `garmentAssets` 的旧 V2 与 V1。`schemaVersion` 是数据库迁移版本，不等同于 envelope 的 `version`。默认 JSON 导出所有 active/归档衣物及 active/inactive 资产元数据，但不内嵌图片、`storage_key` 或绝对路径。`format=zip` 才把校验通过的 WebP 以 `assets/<id>.webp` 写入流式完整备份；当前没有恢复导入 API。

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

interface ThumbnailRefreshResult {
  scanned: number;
  attemptedDownloads: number;
  updated: number;
  skipped: number;
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

type ImportGarmentOverrides = Partial<Pick<Garment,
  "brand" | "name" | "category" | "color" | "warmth" |
  "seasons" | "styles" | "formality" | "size" |
  "materials" | "patterns" | "tags" | "notes"
>>;

interface ImportDecision {
  sourceItemKey: string;
  include: boolean;
  overrides?: ImportGarmentOverrides;
}

interface TaobaoImportCommitRequest {
  batch: TaobaoCapturedBatch;
  decisions: ImportDecision[];
}

interface TaobaoImportCommitResult {
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
  items: Array<{
    sourceItemKey: string;
    disposition: ImportDisposition;
    garmentId?: number;
  }>;
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
- `capturedAt` 缺省时不会混入服务端当前时间；同一规范化内容会得到稳定、与 items 顺序无关的 `batchId`。
- `source` 缺省为 `taobao-bookmarklet`。
- `pageType` 可由 `pageUrl` 或单个 `item.pageType` 推断。
- `detailProps`、`detailImages` 会归一化、去重并保存为 JSON 字符串。
- `CaptureJob.engine` 表示实际采集 runner。订单页固定为 `selenium`；商品详情默认 `selenium`，请求传 `engine=playwright` 时使用 Playwright；未传请求值时可用 `OUTFIT_TAOBAO_ITEM_CAPTURE_ENGINE=playwright` 设置 API 默认值。
- `CaptureJob` 当前保存在 Node 进程内存中；重启 API 后历史 job 状态不会恢复，但产物文件仍在 `output/taobao-captures/<jobId>`。
- `sourceItemKey` v2 优先使用规范化的 `orderId + itemId/URL + SKU`，不同订单的同商品同 SKU 不再误合并；数据库仍能兼容匹配 legacy key。
- `TaobaoImportPreview` 读取 SQLite 判定 disposition，但不写库。commit 在事务内重新计算身份、disposition 和 decision 覆盖关系，前端不能指定 disposition。
- 退款事件不会被 `wardrobeOnly` 提前丢弃；`include=false` 不写来源或衣物，同批重放保持幂等。

## SQLite 表

### schema_migrations

记录 legacy baseline 与每个已成功提交的编号迁移。

| 列 | 类型 | 约束/默认值 | 说明 |
| --- | --- | --- | --- |
| `version` | INTEGER | PRIMARY KEY | `0` 为 legacy baseline，正整数为编号迁移 |
| `name` | TEXT | NOT NULL | 稳定迁移名称 |
| `applied_at` | TEXT | NOT NULL | 提交迁移时的 ISO 时间 |

当前迁移列表对应：

| version | name |
| ---: | --- |
| 0 | `legacy-baseline` |
| 1 | `recommendation-candidates` |
| 2 | `trusted-ingestion` |

### users

保存本地门禁账号。当前产品仍是个人本地应用，只允许首次注册一个账号，不按用户隔离衣橱数据。

| 列 | 类型 | 约束/默认值 | 说明 |
| --- | --- | --- | --- |
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | 本地账号 ID |
| `username` | TEXT | NOT NULL | 展示用用户名 |
| `username_normalized` | TEXT | NOT NULL UNIQUE | 小写用户名，用于大小写不敏感登录 |
| `password_hash` | TEXT | NOT NULL | `crypto.scrypt` 派生的密码哈希 |
| `password_salt` | TEXT | NOT NULL | 随机 salt |
| `created_at` | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| `updated_at` | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 更新时间 |

### sessions

保存本地登录会话。浏览器 cookie 中保存原始 session token，SQLite 中只保存 token 的 SHA-256 hash。

| 列 | 类型 | 约束/默认值 | 说明 |
| --- | --- | --- | --- |
| `token_hash` | TEXT | PRIMARY KEY | session token 的 hash |
| `user_id` | INTEGER | NOT NULL, FK | 关联 `users.id` |
| `expires_at` | TEXT | NOT NULL | 过期时间，默认创建后 7 天 |
| `created_at` | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 创建时间 |

索引：

```sql
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
```

### source_order_items

保存淘宝订单页和商品详情页的原始来源记录。

| 列 | 类型 | 约束/默认值 | 说明 |
| --- | --- | --- | --- |
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | 来源记录 ID |
| `external_key` | TEXT | NOT NULL UNIQUE | 导入去重稳定键；M1 新记录为 order-aware 的 `v2:<sha256>`，查询兼容 legacy key |
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
| `origin` | TEXT | NOT NULL DEFAULT 'taobao', CHECK | `taobao`、`manual` 或 `backup`；迁移时无来源旧记录回填为 `manual` |
| `archived_at` | TEXT |  | 软归档时间；非空时不属于默认 active 集合 |
| `brand` | TEXT |  | 品牌 |
| `name` | TEXT | NOT NULL | 展示名 |
| `raw_name` | TEXT |  | 原始标题 |
| `category` | TEXT | NOT NULL | `GarmentCategory` |
| `color` | TEXT | NOT NULL | 颜色 |
| `warmth` | TEXT | NOT NULL | `GarmentWarmth` |
| `seasons` | TEXT | NOT NULL | JSON 编码的 `Season[]` |
| `styles` | TEXT | NOT NULL | JSON 编码的风格标签 |
| `formality` | TEXT | NOT NULL | `Formality` |
| `size` | TEXT |  | 尺码 |
| `materials` | TEXT | NOT NULL DEFAULT '[]' | JSON 编码的材质标签 |
| `patterns` | TEXT | NOT NULL DEFAULT '[]' | JSON 编码的图案标签 |
| `tags` | TEXT | NOT NULL DEFAULT '[]' | JSON 编码的用户或系统标签 |
| `cutout_image_url` | TEXT |  | 本地去背景透明 PNG 路径 |
| `vision_tags` | TEXT |  | JSON 编码的 `VisionTagSuggestion` |
| `vision_updated_at` | TEXT |  | 最近一次视觉处理时间 |
| `image_url` | TEXT |  | 展示图片 |
| `owned` | INTEGER | NOT NULL DEFAULT 1 | 是否拥有 |
| `confirmed` | INTEGER | NOT NULL DEFAULT 0 | 是否确认 |
| `excluded` | INTEGER | NOT NULL DEFAULT 0 | 是否排除推荐 |
| `confidence` | REAL | NOT NULL DEFAULT 0 | 自动分类置信度 |
| `notes` | TEXT |  | 用户备注 |
| `acquired_at` | TEXT |  | 可选购入日期 |
| `purchase_price_cents` | INTEGER | 非负整数 CHECK | 可选购入价格，单位分 |
| `currency` | TEXT | CHECK | 可选币种，当前仅 `CNY` |
| `created_at` | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| `updated_at` | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 更新时间 |

更新行为：

- legacy 表定义中的 `confirmed` 默认值仍为 `0`。淘宝导入显式写入 `0`，手工创建接口显式写入 `1`；不能用表默认值推断衣物来源。
- 淘宝重复导入不会覆盖用户已经确认的状态。
- 默认衣橱与洞察只使用 `owned=1 AND archived_at IS NULL` 的 active 衣物；推荐和替代单品再叠加 `confirmed=1 AND excluded=0`。
- `PUT /api/garments/:id` 会更新展示字段和 `updated_at`。
- 用户确认过的名称在迁移回填时会尽量保留，避免被自动清洗覆盖。
- archive 与弃用 DELETE 都只设置 `archived_at`；restore 清除它。两者都不删除衣物、来源记录、图片资产或采集文件。

### garment_assets

保存服务端净化后的衣物 WebP 元数据。表为 SQLite `STRICT`；客户端永远只看到 asset ID 和可移植元数据，不看到 `storage_key` 或物理路径。

| 列 | 类型 | 约束/默认值 | 说明 |
| --- | --- | --- | --- |
| `id` | INTEGER | PRIMARY KEY | 资产 ID，也是 API/ZIP 条目使用的公开身份 |
| `garment_id` | INTEGER | NOT NULL, FK RESTRICT | 关联 `garments.id`，禁止级联物理删除 |
| `kind` | TEXT | NOT NULL, 非空 CHECK | 当前主图为 `primary` |
| `storage_key` | TEXT | NOT NULL UNIQUE, 安全 CHECK | 服务端生成的 UUID `.webp` 文件名；禁止 `/`、反斜杠和 `..` |
| `mime_type` | TEXT | NOT NULL CHECK | 固定 `image/webp` |
| `byte_size` | INTEGER | `> 0` | 净化后字节数 |
| `width` | INTEGER | `> 0` | 净化后宽度 |
| `height` | INTEGER | `> 0` | 净化后高度 |
| `sha256` | TEXT | 64 位小写十六进制 CHECK | 完整性校验 |
| `active` | INTEGER | NOT NULL DEFAULT 1, 0/1 CHECK | 当前是否可由内容端点读取 |
| `created_at` | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 创建时间 |

索引与生命周期：

```sql
CREATE INDEX idx_garment_assets_garment_id ON garment_assets(garment_id);
CREATE UNIQUE INDEX idx_garment_assets_active_kind
ON garment_assets(garment_id, kind) WHERE active = 1;
```

同一衣物同一 kind 最多一条 active 资产。替换图片只把旧行置为 inactive，旧文件不自动删除；显式完整备份会同时列出 active 与 inactive 元数据，并只打包仍能通过路径、符号链接、大小和哈希校验的文件。

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

推荐 run 与最终候选在同一事务中保存。`result_json` 包含响应 `runId`、`candidateId` 和 `outfitSignature`；任一候选写入失败时，run 与全部 candidate 一并回滚。

### app_settings

保存本机应用级设置；当前使用 `personalProfile` 键保存用户明确提交的个人画像。

| 列 | 类型 | 约束/默认值 | 说明 |
| --- | --- | --- | --- |
| `key` | TEXT | PRIMARY KEY | 设置键；当前画像键为 `personalProfile` |
| `value` | TEXT | NOT NULL | JSON 编码的设置值 |
| `updated_at` | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 最近更新时间 |

未保存 `personalProfile` 行时画像为 `{}`；服务端不会写入具体身体数据默认值。位置经纬度保存在浏览器 `localStorage`，不属于该表。

### recommendation_candidates

保存最终返回的候选快照，不保存 beam search 的中间状态。

| 列 | 类型 | 约束/默认值 | 说明 |
| --- | --- | --- | --- |
| `candidate_id` | TEXT | PRIMARY KEY NOT NULL | 全局唯一候选 UUID |
| `run_id` | INTEGER | NOT NULL, FK | 关联 `recommendation_runs.id`，删除 run 时级联删除 |
| `signature` | TEXT | NOT NULL | 完整衣物组合的稳定 SHA-256 签名 |
| `rank` | INTEGER | NOT NULL, `CHECK (rank >= 1)` | 在该 run 返回数组中的一基排名 |
| `item_ids_json` | TEXT | NOT NULL, JSON array CHECK | 按 canonical slot 顺序保存的衣物 ID |
| `score_snapshot` | TEXT | NOT NULL, JSON object CHECK | 返回时的分数、匹配度、breakdown 与理由快照 |
| `created_at` | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 创建时间 |

约束与索引：

```sql
UNIQUE (run_id, rank);
CREATE INDEX idx_recommendation_candidates_run_id ON recommendation_candidates(run_id);
CREATE INDEX idx_recommendation_candidates_signature ON recommendation_candidates(signature);
```

`signature` 不唯一：同一组合可以在多个 run 中再次出现；`candidate_id` 才是单次候选快照的全局身份。

## 数据目录

| 路径 | 内容 | 是否应提交 |
| --- | --- | --- |
| `data/outfit.sqlite` | 本地衣橱数据库 | 否 |
| `data/outfit.sqlite-*` | SQLite WAL/SHM 等辅助文件 | 否 |
| `data/garment-assets` | 服务端净化后的 UUID WebP 衣物资产；替换/归档不会自动删除旧文件 | 否 |
| `output/taobao-captures` | 淘宝采集 JSON，任务式采集会使用 `<jobId>` 子目录 | 否 |
| `output/garment-thumbnails` | 从淘宝采集图片候选低频下载的本地衣橱缩略图 | 否 |
| `output/chrome-taobao-profile` | Selenium Chrome 用户数据目录 | 否 |
| `output/playwright-taobao-profile` | Playwright Chrome 用户数据目录，可能包含淘宝登录态 | 否 |
| `output/models` | 本地可选视觉模型缓存 | 否 |
| `logs` | 本地日志 | 否 |

这些路径已在 `.gitignore` 中忽略。

`npm run privacy:clean` 默认只打印包含绝对路径的清理计划，不删除文件。当前脚本的确认清理范围仍是采集产物、旧缩略图、日志和 `data/outfit.sqlite*`；M1 的 `data/garment-assets` 不在自动清理目标中，旧资产必须留待后续 privacy-clean 资产预览和用户明确确认。登录 profile 只有显式加入 `--include-login-state` 才允许清理。所有目标的词法路径和真实路径都必须位于项目根目录内；junction/symlink 外逃或 realpath 解析失败会中止清理。`output/models` 也不在当前 privacy-clean 目标中。
