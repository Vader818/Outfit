# 数据库与类型 Schema

Outfit 使用本地 SQLite 数据库保存衣橱、淘宝来源记录、天气缓存、穿着日记、周计划、旅行胶囊、推荐历史与决策支持反馈。默认路径：

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
- 当前编号迁移版本为 7：版本 1 为 `recommendation-candidates`，版本 2 为 `trusted-ingestion`，版本 3 为 `saved-outfits`，版本 4 为 `feedback-availability`，版本 5 为 `diary-week-planner`，版本 6 为 `decision-support`，版本 7 为 `trip-capsule-planner`。
- 版本 5 在一个迁移事务中创建 `wear_events`、`wear_event_items`、`outfit_plan_entries`，为 `recommendation_feedback` 增加 `wear_event_id`，并迁移全部旧 `wear_logs`。旧 `garment_ids/context` 原样进入 `legacy_snapshot`；不存在的衣物 ID 仍保留在 `originalGarmentIds`，但不会创建无效外键。只有完全满足新 WeatherSnapshot 契约的旧 `context.weather` 才提升为权威天气快照，畸形天气仍只保留在 legacy snapshot，避免迁移后产生不可读事件。旧 SQLite UTC 时间会规范化为 UTC ISO timestamp，既有反馈关联同步回填到新事件。
- 版本 6 增加 `source_order_items.quantity_explicit/payment_explicit`、`garments.cost_source`、`garment_similarity_feedback` 与 `garment_embeddings`。历史数量仅在大于 `1` 时视为明确（旧默认值 `1` 具有歧义），非空付款视为明确；只对未退款、数量与付款都明确且数值有效的来源回填单件淘宝成本。既有价格先标记为 `manual` 并保持优先，不被回填覆盖；有效订单日期只补充缺失的 `acquired_at`。
- 版本 7 创建 `trips`、`trip_days`、`trip_day_activities`、`trip_outfit_selections`、`trip_packing_items` 五张 STRICT 表。外键将 day/activity/selection/packing 绑定到旅行，selection 可唯一关联实际 WearEvent；迁移不读取网络、不回填或修改任何 garment availability。
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
type GarmentCostSource = "manual" | "taobao";
type GarmentAvailabilityStatus = "available" | "laundry" | "repair" | "loaned" | "packed";
type FeedbackVerdict = "liked" | "disliked" | "skipped";
type FeedbackReason =
  | "too-warm" | "too-cold" | "too-formal" | "too-casual"
  | "color" | "fit" | "repeat" | "unavailable" | "other";
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
type SavedOutfitSource = "recommendation" | "manual" | "replacement";
type OutfitSlot = GarmentCategory;
type OutfitOccasion = "casual" | "smart-casual" | "formal" | "sport" | "date" | "dinner";
type OutfitPlanStatus = "planned" | "worn" | "skipped";
type PurchaseCheckVerdict = "fills-gap" | "likely-duplicate" | "mixed" | "insufficient-data";
type SimilarityFeedbackVerdict = "duplicate" | "not-duplicate";
type TripRepeatPolicy = "allow" | "no-consecutive-core" | "no-repeat-core";
type TripStatus = "planning" | "ready" | "completed" | "archived";
type TripPackingStatus = "unpacked" | "packed" | "on-body" | "not-taking";
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
| `availabilityStatus` | 当前可用状态；只有 `available` 会进入推荐，其他状态仍保留在衣服库与历史中 |
| `confidence` | 自动分类置信度 |
| `acquiredAt` | 可选购入日期，`YYYY-MM-DD` |
| `purchasePriceCents` / `currency` | 可选非负整数分与 `CNY`；缺失价格保持未知，不等同于 `0` |
| `costSource` | 可选成本来源；`manual` 为手工值，`taobao` 为明确付款与数量推导的单件价格 |
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

服务端不接受来源、图片或状态字段，并固定写入 `source_order_item_id=NULL`、`origin=manual`、`raw_name=name`、空图片、`owned=1`、`confirmed=1`、`excluded=0`、`availability_status=available`、`confidence=1`。

`PUT /api/garments/:id` 的 `GarmentUpdateInput` 还允许可选 `purchasePriceCents`。该值必须是非负安全整数分；出现时服务端强制写 `currency=CNY` 与 `cost_source=manual`，省略则保留既有价格及来源。当前更新契约不以 `null` 清除价格。

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
  feedbackSummary?: RecommendationFeedbackInsights;
}
```

### 价值、相似度与购买前检查

```ts
interface ValueGarmentEvidence {
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

interface WardrobeValueInsights {
  generatedAt: string;
  knownPriceCount: number;
  unknownPriceCount: number;
  upperQuartilePriceCents?: number;
  bestValue: ValueGarmentEvidence[];
  lowUtilizationHighCost: ValueGarmentEvidence[];
  dormantGarments: ValueGarmentEvidence[];
  suggestions: WardrobeSuggestion[];
}

interface SimilarityReason {
  field: "color" | "styles" | "materials" | "patterns" | "brandName" | "visual";
  score: number;
  weight: number;
  detail: string;
}

interface GarmentSimilarityMatch {
  garment: Garment;
  similarity: number;
  reasons: string[];
  evidence?: SimilarityReason[];
}

interface CoverageDelta {
  categories: string[];
  seasons: string[];
  occasions: string[];
  compatibleOutfitCount: number;
}

interface PurchaseCheckResult {
  subjectKey: string;
  verdict: PurchaseCheckVerdict;
  possibleDuplicates: GarmentSimilarityMatch[];
  worksWith: SavedOutfit[];
  coverageDelta: CoverageDelta;
  explanation: string[];
}

type SimilarityFeedbackSubjectInput =
  | { kind: "garment"; garmentId: number }
  | {
      kind: "taobao-candidate";
      batch: TaobaoCapturedBatch;
      sourceItemKey: string;
    };

interface SimilarityFeedbackInput {
  subject: SimilarityFeedbackSubjectInput;
  comparedGarmentId: number;
  verdict: SimilarityFeedbackVerdict;
}

interface GarmentSimilarityFeedback {
  id: number;
  subjectKey: string;
  comparedGarmentId: number;
  verdict: SimilarityFeedbackVerdict;
  createdAt: string;
  updatedAt: string;
}
```

价值口径直接聚合完整 WearEvent 明细，只使用仍拥有、未归档、未退款的衣物。成本/次为 `purchasePriceCents / wearCount`；零穿着返回 `null`。最佳价值要求价格已知且至少穿着 3 次；低利用高成本要求购入满 90 天、穿着不超过 1 次并达到已知价格最高四分位阈值。有穿着记录的沉睡单品要求最近穿着距今至少 90 天；从未穿过的衣物在购入满 30 天后才提示。上述值与排行都是派生数据，不单独持久化。

结构相似度要求类别完全一致，再按颜色 25、风格 20、材质 15、图案 15、品牌/规范化名称 15、可选本地视觉向量 10 加权；缺失成分不进入分母，现有权重重新归一化。`similarity` 是 0–100 的展示百分数；是否达到 75 使用未舍入的内部得分判定，避免 74.96 因展示舍入被误收录。现有衣物之间的查询可读取已有 embedding 缓存；淘宝候选未生成视觉向量时只使用其余结构字段。缓存只由用户显式调用 `POST /api/garments/:id/vision-tags` 的本地 CLIP 分析刷新，普通相似查询和购买检查不会触发推理、下载或联网。购买检查仅读现有衣橱、保存搭配与反馈；候选 `subjectKey` 由服务端对规范化商品身份与 SKU 做 SHA-256 生成，结构字段后续补全不会改变候选身份。客户端提交反馈时必须提供衣物 ID，或重新提供原 batch 与 `sourceItemKey`，不能直接伪造指纹。

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

逐日天气接口返回 `WeatherSnapshot[]`。逐日 `temperature` 和 `apparentTemperature` 分别是 Open-Meteo 当日 max/min 的四舍五入均值，`windSpeed` 使用当日最大值。

### WearEvent 与 OutfitPlanEntry

```ts
type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

interface WearEventItem {
  id: number;
  wearEventId: number;
  itemId: number;
  position: number;
}

interface WearEventLegacySnapshot {
  originalGarmentIds: number[];
  originalContext: JsonValue;
}

interface WearEvent {
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

interface WearEventInput {
  wornAt: string;
  timeZone: string;
  outfitId?: number | null;
  occasion: OutfitOccasion;
  weatherSnapshot?: WeatherSnapshot;
  notes?: string | null;
  itemIds: number[];
}

interface WearEventPage {
  events: WearEvent[];
  nextCursor?: string;
}

interface OutfitPlanEntry {
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

interface OutfitPlanInput {
  plannedDate: string;
  timeZone: string;
  outfitId: number;
  occasion: OutfitOccasion;
  weatherSnapshot?: WeatherSnapshot;
  notes?: string;
}

interface OutfitPlanUpdate {
  plannedDate?: string;
  timeZone?: string;
  outfitId?: number;
  occasion?: OutfitOccasion;
  weatherSnapshot?: WeatherSnapshot | null;
  status?: "planned" | "skipped";
  notes?: string | null;
}

interface RepeatWarning {
  code: "RECENT_OUTFIT_REPEAT";
  windowDays: 14 | 28;
  previousDate: string;
  message: string;
  canIgnore: true;
  action: "replace-one-item";
}

interface OutfitPlanMutationResult {
  entry: OutfitPlanEntry;
  repeatWarning?: RepeatWarning;
}

interface MarkWornInput {
  wornAt: string;
  timeZone: string;
  outfitId?: number | null;
  occasion?: OutfitOccasion;
  weatherSnapshot?: WeatherSnapshot;
  notes?: string | null;
  itemIds?: number[];
}

interface MarkWornResult {
  plan: OutfitPlanEntry;
  wearEvent: WearEvent;
}
```

`plannedDate` 是指定 IANA 时区中的本地日历键，只按严格 `YYYY-MM-DD` 保存和导出；它不是 timestamp。`wornAt` 必须在请求中带 `Z` 或 UTC offset，服务端规范化为 UTC ISO timestamp，同时保存事件发生时的 `timeZone` 以便还原显示。`planned`/`skipped` 计划没有 `wornAt` 或 `wearEventId`；`worn` 计划必须同时拥有两者。

更新 WearEvent 时，省略 `outfitId/notes` 表示保留，显式 `null` 表示清除。更新 OutfitPlan 时，`notes: null` 或 `notes: ""` 都会清空；省略仍保留。mark-worn 的可选 `outfitId`、`occasion`、`itemIds`、`weatherSnapshot`、`notes` 是实际 WearEvent 覆盖值：`outfitId: null` 可创建不关联保存搭配的事件，`notes: null` 清空，省略字段按计划或有效搭配继承；计划行自身只更新状态、实际时间和事件关联。日历范围查询以目标 IANA 时区中该日期的第一个有效瞬间为边界，因此也支持夏令时在午夜跳转、当天从 01:00 开始的区域。

重复提醒以目标日期为中心做对称日历窗口检查：`formal` 前后各 28 天，`date/dinner` 前后各 14 天。服务比较规范化衣物集合，从计划和 WearEvent 中选择距离目标日期最近的冲突；更新时排除自身。`OutfitPlanMutationResult.entry` 在 warning 返回前已经保存，关闭提醒或进入换一件流程都不会撤销它。

### OutfitRecommendation

```ts
interface RecommendationRequest {
  weather: WeatherSnapshot;
  occasion: Formality;
  recentlyWornGarmentIds?: number[];
  userProfile?: PersonalProfile;
  includeGarmentIds?: number[];
  excludeGarmentIds?: number[];
}

type RecommendationConstraintField = "includeGarmentIds" | "excludeGarmentIds";
type RecommendationConstraintReason =
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
  | "UNSATISFIABLE";

interface RecommendationConstraintIssue {
  field: RecommendationConstraintField;
  garmentId?: number;
  reason: RecommendationConstraintReason;
}

interface OutfitReplacementSuggestion {
  targetGarmentId: number;
  replacement: Garment;
  nextItems: Garment[];
  matchPercentDelta: number;
  reasons: string[];
}

interface OutfitRecommendation {
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

interface RecommendationResult {
  runId: number;
  weather: WeatherSnapshot;
  weatherScenario?: WeatherScenario;
  occasion: string;
  outfits: OutfitRecommendation[];
  missingSlots: GarmentCategory[];
  missingSlotDetails?: Array<{
    slot: GarmentCategory;
    unavailableCount: number;
  }>;
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
  learnedPreference: number;
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
- `scoreBreakdown` 是归一化后的可解释维度分，方便展示天气舒适度、场合匹配、近期穿着惩罚、用户偏好和反馈学习贡献；`learnedPreference` 始终限制在 -8…+8。
- `weatherScenario` 是天气归一化层，用于解释推荐依据。
- `runId` 指向保存本次请求与结果的 `recommendation_runs.id`。
- `candidateId` 是全局唯一候选 UUID；`id === candidateId` 是当前兼容约定。
- `outfitSignature` 是按固定 slot 顺序和衣物 ID 计算的完整组合 SHA-256 签名。它可跨 run 识别相同组合，但不代替天气、场合、rank 或评分上下文。
- `missingSlots` 只表达无法构成连衣裙或“上装＋下装”核心时的结构化缺口；`missingSlotDetails[].unavailableCount` 说明对应槽位因非 `available` 被硬过滤的数量；鞋履是软缺口。
- 候选按核心、外套、鞋履、配饰分层生成，默认总评估上限 20,000，每层 beam width 上限 120；超限时采用确定性均匀采样。
- `includeGarmentIds` 与 `excludeGarmentIds` 是最多 24 项的严格硬约束；约束在持久化 run 前完成结构和数据库状态校验，错误通过 `RecommendationConstraintIssue[]` 返回。
- `replacements` 对每个可替换目标给出同类别 replacement、完整 `nextItems`、相对匹配度变化和理由；include 锁定的目标不生成替换建议。

### 推荐反馈与衣物可用状态

```ts
interface RecommendationFeedbackInput {
  candidateId: string;
  verdict?: FeedbackVerdict;
  rating?: 1 | 2 | 3 | 4 | 5;
  actuallyWorn?: boolean;
  reasonCodes: FeedbackReason[];
  comment?: string;
  woreInsteadOutfitId?: number;
}

interface RecommendationFeedback extends RecommendationFeedbackInput {
  id: number;
  actuallyWorn: boolean;
  comment: string;
  wearLogId?: number;
  createdAt: string;
  updatedAt: string;
}

interface OutfitPairStat {
  garmentAId: number;
  garmentBId: number;
  likes: number;
  dislikes: number;
  wornCount: number;
  totalFeedback: number;
  signal: number;
  updatedAt: string;
}

interface RecommendationFeedbackInsights {
  totalCount: number;
  acceptedCount: number;
  acceptanceRate: number;
  mostCommonRejectionReason?: FeedbackReason;
  rejectionReasons: Array<{ reason: FeedbackReason; count: number }>;
}

type RecommendationFeedbackClearScope =
  | { scope: "all" }
  | { scope: "candidate"; candidateId: string }
  | { scope: "date-range"; from: string; to: string };

interface RecommendationFeedbackClearPreview {
  scope: RecommendationFeedbackClearScope["scope"];
  candidateId?: string;
  from?: string;
  to?: string;
  feedbackCount: number;
  affectedPairCount: number;
}

interface RecommendationFeedbackClearResult extends RecommendationFeedbackClearPreview {
  deletedFeedbackCount: number;
  remainingPairStatsCount: number;
  clearedAt: string;
}

interface GarmentAvailabilityEvent {
  id: number;
  garmentId: number;
  previousStatus: GarmentAvailabilityStatus;
  status: GarmentAvailabilityStatus;
  changedAt: string;
}

interface GarmentAvailabilityChangeResult {
  changed: boolean;
  garment: Garment;
  event?: GarmentAvailabilityEvent;
}
```

同一 `candidateId` 只保留一条反馈，后续提交更新而不是累加。输入必须至少包含 verdict、rating、`actuallyWorn=true`、非空原因/评论或 `woreInsteadOutfitId` 中的一个有效信号。`totalFeedback` 计入该衣物对出现过的每一条候选反馈，包括 `skipped`、仅评分或没有 verdict 的反馈；`likes`、`dislikes`、`wornCount` 分别按 verdict 与 `actuallyWorn` 计数，同一反馈可同时贡献 verdict 与 worn。接受率使用满足 `verdict=liked` 或 `actuallyWorn=true` 的去重反馈数除以总反馈数。

反馈学习公式为：

```text
signal = likes + 2*wornCount - 2*dislikes
confidence = min(1, totalFeedback / 5)
pairBonus = clamp(signal / max(1, totalFeedback), -1, 1) × 4 × confidence
```

`totalFeedback < 3` 的衣物对只记录、不调权；达到阈值后每对最多贡献 -4…+4，整套组合最终 clamp 到 -8…+8。`actuallyWorn=true` 与 `woreInsteadOutfitId` 互斥。日期清空范围按反馈 `updatedAt` 的日期闭区间匹配；UI 必须先获取 `RecommendationFeedbackClearPreview` 并展示影响，再允许最终确认。

### SavedOutfit

```ts
interface SavedOutfitGarmentSnapshot {
  id: number;
  name: string;
  brand: string;
  category: GarmentCategory;
  imageUrl: string;
}

interface SavedOutfitItem {
  id: number;
  outfitId: number;
  garmentId?: number;
  slot: OutfitSlot;
  position: number;
  garmentSnapshot: SavedOutfitGarmentSnapshot;
}

interface SavedOutfit {
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

interface SavedOutfitItemInput {
  garmentId: number;
  slot: OutfitSlot;
  position: number;
}

interface SavedOutfitCreateInput {
  name: string;
  notes?: string;
  favorite?: boolean;
  items: SavedOutfitItemInput[];
}

interface SavedOutfitUpdateInput {
  name?: string;
  notes?: string;
  favorite?: boolean;
  items?: SavedOutfitItemInput[];
}

interface SaveRecommendationCandidateInput {
  name?: string;
  notes?: string;
  favorite?: boolean;
}

interface SavedOutfitReplacementInput {
  targetGarmentId: number;
  replacementGarmentId: number;
  name?: string;
}
```

`garmentSnapshot` 是保存时的不可变展示快照，不会在读取时与当前 garment 合并。手工 create/update 的 item DTO 不接受 snapshot 或 provenance；候选保存从持久化 run 读取历史快照；replacement 总是新建派生记录而不覆盖父记录。

### Trip 旅行胶囊

```ts
interface TripDestination {
  name: string;
  latitude?: number;
  longitude?: number;
}

interface TripActivityInput {
  name: string;
  occasion: string;
  formality: Formality;
  requiresSeparateOutfit: boolean;
}

interface TripActivity extends TripActivityInput {
  id: number;
  tripDayId: number;
  position: number;
}

interface TripDay {
  id: number;
  tripId: number;
  date: string;
  activities: TripActivity[];
  weather?: WeatherSnapshot;
}

interface TripOutfitSelection {
  id: number;
  tripDayId: number;
  slotIndex: number;
  activityIds: number[];
  garments: Garment[];
  score: number;
  reasons: string[];
  activityEvaluations: Array<{
    activityId: number;
    score: number;
    weatherComfort: number;
    occasion: number;
    hardEligible: boolean;
  }>;
  lockedGarmentIds: number[];
  actualWearEventId?: number;
}

interface TripPackingItem {
  id: number;
  tripId: number;
  kind: "garment" | "essential";
  garmentId?: number;
  label: string;
  status: TripPackingStatus;
  coverage: { dates: string[]; activityIds: number[] };
}

interface Trip {
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

type TripOptimizationResult =
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
```

Trip 创建 DTO 使用不带 ID 的 `days/activities`。起止日期必须存在且组成连续 1–7 天，目的地经纬度成对出现；共享活动按顺序分组，`requiresSeparateOutfit=true` 切出独立 slot。优化器仅在内存中维护重复和洗衣计数，不写 garment availability；只有逐套确认完成旅行时才创建 WearEvent。

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

type OutfitExport = OutfitExportV1 | OutfitExportV2;
```

`GET /api/export` 当前只生成 V2，envelope 继续使用 `version=2`，数据库迁移自动报告 `schemaVersion=7`。当前 builder 始终输出 `saved-outfits`、`feedback-availability`、`diary-week-planner`、`decision-support`、`trip-capsule` feature，以及完整 `savedOutfits`、反馈/日记/计划数组和五类 Trip 关系数组。穿着事件按 `wornAt DESC,id DESC`、事件衣物按 `position,id`、计划按 `plannedDate,id`、相似度反馈按 `subjectKey,comparedGarmentId` 确定排序；Trip 同时覆盖 active/archived，并按 trip startDate/id、day date、activity position、selection slot、packing kind/id 稳定排序。所有表都在同一个 deferred SQLite 读快照中取得。`plannedDate` 与旅行日期直接读取文本，不经过 `Date` 或 UTC 转换。

内部校验器仍识别 V1，以及没有较新可选数组的旧 V2；但声明 `diary-week-planner` feature 的 V2 必须同时包含 `wearEvents` 与 `outfitPlanEntries`，声明 `decision-support` feature 时必须包含合法 `similarityFeedback`，声明 `trip-capsule` feature 时必须包含五个合法 Trip 数组。`schemaVersion` 是数据库迁移版本，不等同于 envelope 的 `version`。默认 JSON 还导出所有 active/归档衣物及 active/inactive 资产元数据，但不内嵌图片、`storage_key` 或绝对路径；Trip selection 只导出 `garmentIds`。成本/次、四分位和排行是派生值，`garment_embeddings` 是可重建缓存，均不导出。损坏的天气、legacy JsonValue、反馈、搭配快照或 Trip JSON 会明确中止导出。`format=zip` 才把校验通过的 WebP 以 `assets/<id>.webp` 写入流式完整备份；当前没有恢复导入 API。

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
- `sourceItemKey` v2 优先使用规范化的 `orderId + itemId/URL + SKU`，不同订单的同商品同 SKU 不再误合并。legacy key 仅在 `orderId + itemId + SKU` 全部一致时兼容匹配并原位升级；legacy/v2 双记录冲突会以 409 中止预览或提交。
- `TaobaoImportPreview` 读取 SQLite 判定 disposition，但不写库。`purchaseCheckEligible` 只对未退款、可分类且无需人工处理的候选为真；前端只从这些候选中选择购买检查对象。commit 在事务内重新计算身份、disposition 和 decision 覆盖关系，前端不能指定 disposition。
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
| 3 | `saved-outfits` |
| 4 | `feedback-availability` |
| 5 | `diary-week-planner` |
| 6 | `decision-support` |

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
| `external_key` | TEXT | NOT NULL UNIQUE | 导入去重稳定键；M1 新记录为 order-aware 的 `v2:<sha256>`，仅对相同 orderId+itemId+SKU 的 legacy 行安全升级 |
| `source` | TEXT | NOT NULL | 采集来源 |
| `page_type` | TEXT |  | `order-list` 或 `item-detail` |
| `item_id` | TEXT |  | 淘宝商品 ID |
| `order_id` | TEXT |  | 订单号 |
| `order_time` | TEXT |  | 下单时间 |
| `title` | TEXT | NOT NULL | 订单项标题 |
| `sku` | TEXT |  | 规格、颜色、尺码 |
| `quantity` | INTEGER | NOT NULL DEFAULT 1 | 数量 |
| `quantity_explicit` | INTEGER | NOT NULL DEFAULT 0，0/1 CHECK | 数量是否由采集输入明确提供；区别于历史默认值 `1` |
| `payment` | REAL |  | 支付金额 |
| `payment_explicit` | INTEGER | NOT NULL DEFAULT 0，0/1 CHECK | 付款金额是否由采集输入明确提供 |
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

新导入会分别保存数量与付款的显式性；后续缺少字段的采集不会抹掉已有明确证据。版本 6 迁移只能确认历史 `quantity>1` 与非空 `payment`，不会把可能来自默认值的历史数量 `1` 当作明确数量。只有两个显式标记都为 `1`、订单项未退款且数值有效时，服务层才允许推导单件淘宝成本。

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
| `availability_status` | TEXT | NOT NULL DEFAULT `available`，枚举 CHECK | `available`、`laundry`、`repair`、`loaned`、`packed` |
| `confidence` | REAL | NOT NULL DEFAULT 0 | 自动分类置信度 |
| `notes` | TEXT |  | 用户备注 |
| `acquired_at` | TEXT |  | 可选购入日期 |
| `purchase_price_cents` | INTEGER | 非负整数 CHECK | 可选购入价格，单位分 |
| `currency` | TEXT | CHECK | 可选币种，当前仅 `CNY` |
| `cost_source` | TEXT | 可空，枚举 CHECK | `manual` 或 `taobao`；价格未知时为空 |
| `created_at` | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| `updated_at` | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 更新时间 |

更新行为：

- legacy 表定义中的 `confirmed` 默认值仍为 `0`。淘宝导入显式写入 `0`，手工创建接口显式写入 `1`；不能用表默认值推断衣物来源。
- 淘宝重复导入不会覆盖用户已经确认的状态。
- 默认衣橱与洞察只使用 `owned=1 AND archived_at IS NULL` 的 active 衣物；推荐和替代单品再叠加 `confirmed=1 AND excluded=0 AND availability_status='available'`。非可用状态不等于归档或不再拥有。
- `PUT /api/garments/:id` 会更新白名单展示字段和 `updated_at`；公共 JSON 路由禁止 `imageUrl`，图片只能经净化上传或受控缩略图选择路径修改。
- 用户确认过的名称在迁移回填时会尽量保留，避免被自动清洗覆盖。
- 手工创建在提供价格时写 `cost_source='manual'`；淘宝导入只在付款与数量都明确、未退款时写 `cost_source='taobao'`。可信重导入可更新淘宝成本，但永不覆盖 `manual` 成本。版本 6 会先把既有非空价格标记为 `manual`，再保守回填尚无价格的淘宝衣物。
- archive 与弃用 DELETE 都只设置 `archived_at`；restore 清除它。两者都不删除衣物、来源记录、图片资产或采集文件。

### garment_similarity_feedback

保存用户显式提交的结构相似度判断。表为 SQLite `STRICT`。

| 列 | 类型 | 约束/默认值 | 说明 |
| --- | --- | --- | --- |
| `id` | INTEGER | PRIMARY KEY | 反馈 ID |
| `subject_key` | TEXT | NOT NULL，trim 后 1–512 字符 CHECK | `garment:<id>` 或服务端生成的 `candidate:v1:<64位十六进制 SHA-256>` |
| `compared_garment_id` | INTEGER | NOT NULL，FK CASCADE | 被比较衣物 ID |
| `verdict` | TEXT | NOT NULL，枚举 CHECK | `duplicate` 或 `not-duplicate` |
| `created_at` | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 首次反馈时间 |
| `updated_at` | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 最近一次 upsert 时间 |

```sql
UNIQUE (subject_key, compared_garment_id);
CREATE INDEX idx_garment_similarity_feedback_compared_garment_id
ON garment_similarity_feedback(compared_garment_id);
```

公共 API 不接收原始 `subject_key`。现有衣物对按较小 ID 作为 `garment:<id>`、较大 ID 作为 `compared_garment_id` 规范化；淘宝候选则由服务端重新归一化 batch，并以规范化商品身份与 SKU 计算稳定指纹。同一配对重复提交只更新 verdict 与 `updated_at`，保留原 `created_at`。`not-duplicate` 会在后续查询时立即隐藏该 pair；反馈不会修改衣物字段。

### garment_embeddings

保存可选、可重建的本地视觉向量缓存。表为 SQLite `STRICT`。

| 列 | 类型 | 约束/默认值 | 说明 |
| --- | --- | --- | --- |
| `model_id` | TEXT | PK，trim 后 1–200 字符 CHECK | 模型标识；默认相似度读取 `Xenova/clip-vit-base-patch32` |
| `garment_id` | INTEGER | PK，FK CASCADE | 衣物 ID |
| `vector_blob` | BLOB | NOT NULL，非空 CHECK | 单位归一化的本地 Float32 小端向量字节；当前 CLIP 输出 512 维 |
| `created_at` | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 首次缓存时间 |
| `updated_at` | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 最近更新时间 |

主键为 `(model_id, garment_id)`，另有 `idx_garment_embeddings_garment_id(garment_id)`。用户显式调用 `POST /api/garments/:id/vision-tags` 时，正式本地 CLIP 推理同时返回标签和 `image_embeds`；服务端拒绝空、非有限、零范数或过长向量，完成单位归一化与 Float32 小端编码后，和 `garments.vision_tags` 在同一 `BEGIN IMMEDIATE` 事务内 upsert。重复分析只覆盖同一模型/衣物缓存行。模型缺失返回 `VISION_MODEL_MISSING`，无效向量返回 `VISION_EMBEDDING_INVALID`，都不会留下标签或缓存的部分写入。

结构相似度只在比较两端都存在同一模型的有效向量时加入 10% 视觉权重；缺失或损坏向量时退回其余结构字段并重新归一化。读取相似度或购买检查不会生成向量、下载模型或外发图片。API 响应不包含 embedding；该表属于可重建缓存，不进入 `OutfitExportV2`。

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
| `cache_key` | TEXT | PRIMARY KEY | 单日为 `weather:<lat>:<lon>`；逐日为 `weather-forecast:<lat>:<lon>:<days>`，经纬度保留 4 位 |
| `latitude` | REAL | NOT NULL | 纬度 |
| `longitude` | REAL | NOT NULL | 经度 |
| `payload` | TEXT | NOT NULL | JSON 编码的 `WeatherSnapshot` 或固定长度 `WeatherSnapshot[]` |
| `fetched_at` | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 拉取时间 |

缓存策略：

- 默认有效期 30 分钟。
- Open-Meteo 失败时可返回过期缓存。
- 没有缓存时返回本地估算天气。
- 逐日缓存把 `days` 纳入 key，并在读取时校验数组长度与每个快照形状，不会与旧单日 payload 混用。

### wear_logs

M0 遗留穿着表。版本 5 迁移后，权威日记数据改为 `wear_events`；该表仍因旧导出、推荐反馈兼容字段和历史数据库兼容而保留，不应作为新 CRUD 的写入目标。

| 列 | 类型 | 约束/默认值 | 说明 |
| --- | --- | --- | --- |
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | 记录 ID |
| `garment_ids` | TEXT | NOT NULL | JSON 编码的衣橱 ID 数组 |
| `context` | TEXT |  | JSON 编码的场合、天气等上下文 |
| `worn_at` | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 穿着记录时间 |

旧 `/api/wear-logs` 已是兼容适配器：POST 写入新 WearEvent 与 `legacy_snapshot`，GET 从新事件投影旧 DTO。部分 M3 推荐反馈逻辑仍保留 `wear_log_id` 兼容列。

### wear_events

保存权威穿着日记事件。表为 SQLite `STRICT`。

| 列 | 类型 | 约束/默认值 | 说明 |
| --- | --- | --- | --- |
| `id` | INTEGER | PRIMARY KEY | 事件 ID；迁移旧日志时保留原 ID |
| `worn_at` | TEXT | NOT NULL，非空 CHECK | UTC ISO timestamp |
| `time_zone` | TEXT | NOT NULL，长度 1–255 | 记录时 IANA 时区；服务层验证有效性 |
| `outfit_id` | INTEGER | 可空，FK RESTRICT | 可选保存搭配 |
| `occasion` | TEXT | NOT NULL，枚举 CHECK | `OutfitOccasion` |
| `weather_snapshot` | TEXT | 可空，JSON object CHECK | 冻结的 `WeatherSnapshot` |
| `notes` | TEXT | NOT NULL DEFAULT `''`，最长 4000 | 日记备注 |
| `legacy_snapshot` | TEXT | 可空，JSON object CHECK | 旧 `garment_ids/context` 的无损快照 |
| `created_at` | TEXT | NOT NULL | 创建时间 |
| `updated_at` | TEXT | NOT NULL | 更新时间 |

索引：`idx_wear_events_worn_at(worn_at,id)`、`idx_wear_events_outfit_id(outfit_id)`。删除事件会级联删除 items；服务层在同一事务中把关联计划恢复为 `planned`，撤销反馈穿着事实并重算组合统计。

### wear_event_items

| 列 | 类型 | 约束/默认值 | 说明 |
| --- | --- | --- | --- |
| `id` | INTEGER | PRIMARY KEY | 明细 ID |
| `wear_event_id` | INTEGER | NOT NULL，FK CASCADE | 关联 `wear_events.id` |
| `item_id` | INTEGER | NOT NULL，FK RESTRICT | 关联 `garments.id` |
| `position` | INTEGER | NOT NULL，非负 CHECK | 事件内稳定顺序 |

同一事件不能重复同一 `item_id`。索引为 `idx_wear_event_items_item_id(item_id)` 和 `idx_wear_event_items_wear_event_id(wear_event_id)`。迁移时不存在的旧衣物 ID 不创建本表行，只保留在 `legacy_snapshot.originalGarmentIds`。

### outfit_plan_entries

保存用户时区下的本地日历计划。表为 SQLite `STRICT`。

| 列 | 类型 | 约束/默认值 | 说明 |
| --- | --- | --- | --- |
| `id` | INTEGER | PRIMARY KEY | 计划 ID |
| `planned_date` | TEXT | NOT NULL，`YYYY-MM-DD` 形状 CHECK | 本地日历键，绝不保存为 timestamp |
| `time_zone` | TEXT | NOT NULL，长度 1–255 | IANA 时区；服务层验证有效性 |
| `outfit_id` | INTEGER | NOT NULL，FK RESTRICT | 保存搭配 |
| `occasion` | TEXT | NOT NULL，枚举 CHECK | `OutfitOccasion` |
| `weather_snapshot` | TEXT | 可空，JSON object CHECK | 与 planned_date 同日的冻结天气 |
| `status` | TEXT | NOT NULL DEFAULT `planned`，枚举 CHECK | `planned`、`worn`、`skipped` |
| `worn_at` | TEXT | 可空 | 标记已穿后的 UTC ISO timestamp |
| `wear_event_id` | INTEGER | 可空 UNIQUE，FK RESTRICT | 原子 mark-worn 生成的事件 |
| `notes` | TEXT | NOT NULL DEFAULT `''`，最长 4000 | 计划备注 |
| `created_at` | TEXT | NOT NULL | 创建时间 |
| `updated_at` | TEXT | NOT NULL | 更新时间 |

CHECK 保证 `worn` 同时拥有 `worn_at/wear_event_id`，而 `planned/skipped` 两者均为空。索引为 `idx_outfit_plan_entries_planned_date(planned_date,id)` 和 `idx_outfit_plan_entries_outfit_id(outfit_id)`。服务层另外拒绝不存在的日历日期、带时间的 plannedDate、未知时区和日期不匹配的天气快照；纠正关联 WearEvent 的 `worn_at` 时会在同一事务同步本表的实际时间副本。

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

### saved_outfits

保存搭配 header、来源、收藏、软归档和派生关系。表为 SQLite `STRICT`。

| 列 | 类型 | 约束/默认值 | 说明 |
| --- | --- | --- | --- |
| `id` | INTEGER | PRIMARY KEY | 保存搭配 ID |
| `name` | TEXT | NOT NULL，trim 后 1-120 字符 CHECK | 展示名称 |
| `notes` | TEXT | NOT NULL DEFAULT `''`，最多 4000 字符 CHECK | 备注；当前 API 上限为 2000 字符 |
| `source` | TEXT | NOT NULL CHECK | `recommendation`、`manual` 或 `replacement` |
| `source_candidate_id` | TEXT | FK SET NULL | 推荐来源 UUID，关联 `recommendation_candidates.candidate_id` |
| `derived_from_outfit_id` | INTEGER | 自 FK RESTRICT | replacement 的父搭配；禁止引用自身 |
| `favorite` | INTEGER | NOT NULL DEFAULT 0，0/1 CHECK | 收藏状态 |
| `archived_at` | TEXT |  | 软归档时间 |
| `created_at` | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| `updated_at` | TEXT | NOT NULL DEFAULT CURRENT_TIMESTAMP | 最近更新时间 |

约束与索引：

```sql
CHECK (derived_from_outfit_id IS NULL OR derived_from_outfit_id <> id);
CHECK (source <> 'replacement' OR derived_from_outfit_id IS NOT NULL);
CREATE INDEX idx_saved_outfits_archived_at ON saved_outfits(archived_at);
CREATE INDEX idx_saved_outfits_source_candidate_id ON saved_outfits(source_candidate_id);
CREATE INDEX idx_saved_outfits_derived_from_outfit_id ON saved_outfits(derived_from_outfit_id);
```

产品只提供软归档，不提供物理删除端点。replacement 必须新建一行并指向父记录；修改或归档子记录不会改变父记录。若推荐候选被物理删除，`source_candidate_id` 置空但搭配继续存在；存在子记录时父记录受 RESTRICT 保护。

从推荐卡应用 replacement 时，客户端只会复用 `source_candidate_id` 相同且 garment ID、保存快照 ID、slot、position 与原候选规范快照全部一致的 recommendation parent。同 candidate 的已编辑搭配不会成为替换父记录；系统会先从持久化候选新建干净 parent，再由它派生 replacement，保证预览整套与落盘整套一致。

### saved_outfit_items

保存搭配内的 slot/顺序和不可变衣物快照。表为 SQLite `STRICT`。

| 列 | 类型 | 约束/默认值 | 说明 |
| --- | --- | --- | --- |
| `id` | INTEGER | PRIMARY KEY | item ID |
| `outfit_id` | INTEGER | NOT NULL，FK CASCADE | 关联 `saved_outfits.id` |
| `garment_id` | INTEGER | FK SET NULL | 当前衣物的可选引用；来源行不存在时允许为空 |
| `slot` | TEXT | NOT NULL CHECK | `GarmentCategory`/`OutfitSlot` |
| `position` | INTEGER | NOT NULL，`>= 0` CHECK | slot 内顺序；配饰使用连续顺序 |
| `garment_snapshot` | TEXT | NOT NULL，合法 JSON object CHECK | `{id,name,brand,category,imageUrl}` 保存时快照 |

约束与索引：

```sql
UNIQUE (outfit_id, slot, position);
CREATE INDEX idx_saved_outfit_items_outfit_id ON saved_outfit_items(outfit_id);
```

服务层还强制同一搭配衣物不重复、slot 与 category 一致、非配饰 position 为 0、配饰从 0 连续、核心为 dress 或 top+bottom 且互斥。读取历史时只使用 `garment_snapshot` 展示，不 JOIN 当前衣物覆盖它；因此衣物改名、归档或外键置空不会破坏历史搭配。只有内部物理删除 header 时 items 才按 FK 级联，当前 API 不执行该操作。

### recommendation_feedback

按稳定候选 UUID 保存一条可更新反馈。表为 SQLite `STRICT`。

| 列 | 类型 | 约束/默认值 | 说明 |
| --- | --- | --- | --- |
| `id` | INTEGER | PRIMARY KEY | 反馈 ID |
| `candidate_id` | TEXT | NOT NULL UNIQUE，FK CASCADE | 关联 `recommendation_candidates.candidate_id`；保证同一候选幂等更新 |
| `verdict` | TEXT | 可空，枚举 CHECK | `liked`、`disliked`、`skipped` |
| `rating` | INTEGER | 可空，1–5 整数 CHECK | 可选评分 |
| `actually_worn` | INTEGER | NOT NULL DEFAULT 0，0/1 CHECK | 是否实际穿着该候选 |
| `reason_codes_json` | TEXT | NOT NULL DEFAULT `[]`，合法 JSON array CHECK | `FeedbackReason[]`；服务层继续校验枚举与去重 |
| `comment` | TEXT | NOT NULL DEFAULT `''`，最多 2000 字符 CHECK | 自由文本反馈 |
| `wore_instead_outfit_id` | INTEGER | 可空，FK RESTRICT | 实际改穿的保存搭配；与 `actually_worn=1` 互斥由服务层保证 |
| `wear_log_id` | INTEGER | 可空 UNIQUE，FK RESTRICT | `actually_worn` 首次写入时同事务创建的穿着记录 |
| `wear_event_id` | INTEGER | 可空 UNIQUE，FK SET NULL | M4 权威日记事件；版本 5 从既有 `wear_log_id` 回填 |
| `created_at` | TEXT | NOT NULL | 首次反馈时间 |
| `updated_at` | TEXT | NOT NULL | 最近更新与日期范围清理依据 |

```sql
CREATE INDEX idx_recommendation_feedback_created_at
ON recommendation_feedback(created_at);
CREATE INDEX idx_recommendation_feedback_verdict
ON recommendation_feedback(verdict);
CREATE UNIQUE INDEX idx_recommendation_feedback_wear_event_id
ON recommendation_feedback(wear_event_id) WHERE wear_event_id IS NOT NULL;
```

upsert 后从全部现存反馈重算组合统计。`rating=NULL` 与空 `comment` 可显式清除旧值，但合并后不允许留下完全无信号的空反馈。旧反馈写入仍保留 `wear_log_id` 兼容语义；版本 5 为已有记录补上 `wear_event_id`，以便撤销日记时同步撤销实际穿着事实并重算统计。清空先按 `all`、`candidate` 或 `updated_at` 日期闭区间预览；实际 DELETE 与重算 `outfit_pair_stats` 在同一事务中提交，空范围和重放不会留下旧权重。

### outfit_pair_stats

保存规范化衣物 ID 对的派生反馈统计；可由 `recommendation_feedback` 与候选 `item_ids_json` 完整重建。表为 SQLite `STRICT`。

| 列 | 类型 | 约束/默认值 | 说明 |
| --- | --- | --- | --- |
| `garment_a_id` | INTEGER | PK，FK CASCADE，正整数 | 较小的衣物 ID |
| `garment_b_id` | INTEGER | PK，FK CASCADE，正整数且大于 A | 较大的衣物 ID |
| `likes` | INTEGER | NOT NULL，非负 CHECK | `verdict=liked` 数量 |
| `dislikes` | INTEGER | NOT NULL，非负 CHECK | `verdict=disliked` 数量 |
| `worn_count` | INTEGER | NOT NULL，非负 CHECK | `actually_worn=1` 数量，可与 verdict 同时计数 |
| `total_feedback` | INTEGER | NOT NULL，非负 CHECK | 包含 liked、disliked、skipped、仅评分等每条候选反馈 |
| `signal` | INTEGER | NOT NULL | `likes + 2*worn_count - 2*dislikes` |
| `updated_at` | TEXT | NOT NULL | 最近一次整表重算时间 |

主键为 `(garment_a_id, garment_b_id)`，并有 `garment_a_id < garment_b_id` CHECK。评分时 `total_feedback < 3` 不产生 bonus；达到阈值后使用 `confidence=min(1,total_feedback/5)`，每对贡献限制为 -4…+4，整套限制为 -8…+8。洞察中的 `weightedPairCount` 直接统计 `total_feedback >= 3` 的 pair 行，不由全局反馈总数推断。

### garment_availability_events

保存衣物可用状态的只追加历史。表为 SQLite `STRICT`。

| 列 | 类型 | 约束/默认值 | 说明 |
| --- | --- | --- | --- |
| `id` | INTEGER | PRIMARY KEY | 事件 ID |
| `garment_id` | INTEGER | NOT NULL，FK RESTRICT | 关联衣物；保留历史时禁止物理删除来源衣物 |
| `previous_status` | TEXT | NOT NULL，枚举 CHECK | 变更前 `GarmentAvailabilityStatus` |
| `status` | TEXT | NOT NULL，枚举 CHECK | 变更后 `GarmentAvailabilityStatus` |
| `changed_at` | TEXT | NOT NULL | 变更时间 |

`previous_status <> status` 由 CHECK 保证；重复提交当前状态不写事件。`garments.availability_status` 更新与事件插入位于同一事务。索引为 `(garment_id, changed_at, id)`，导出按 `changed_at,id` 确定排序并保留全部历史。

### trips

旅行 header，SQLite `STRICT`。

| 列 | 类型 | 约束/默认值 | 说明 |
| --- | --- | --- | --- |
| `id` | INTEGER | PRIMARY KEY | 旅行 ID |
| `name` | TEXT | trim 后 1–120 | 名称 |
| `start_date` / `end_date` | TEXT | 严格日期形状，end >= start | 起止本地日历日；服务层再验证真实日期和最多 7 天 |
| `destination_name` | TEXT | trim 后 1–200 | 目的地名称 |
| `destination_latitude` / `destination_longitude` | REAL | 必须同时为空或同时存在，范围 ±90/±180 | 仅显式刷新天气时发送 |
| `max_garments` | INTEGER | 0–100 | 全程唯一衣物硬上限，包含鞋 |
| `max_shoes` | INTEGER | 0–20 | 唯一鞋履硬上限；与总衣物上限独立，实际方案仍必须同时满足两者 |
| `repeat_policy` | TEXT | `allow/no-consecutive-core/no-repeat-core` | 核心重复硬规则 |
| `max_core_wears_between_laundry` | INTEGER | 1、2 或 3 | 洗衣前核心件模拟穿着上限 |
| `laundry_day` | TEXT | 可空，必须位于旅行内 | 只重置优化状态内计数 |
| `status` | TEXT | 默认 `planning` | `planning/ready/completed/archived` |
| `created_at` / `updated_at` | TEXT | NOT NULL | UTC ISO timestamp |

索引为 `idx_trips_status_updated_at(status,updated_at,id)`；归档为状态更新，不物理删除。

### trip_days

| 列 | 类型 | 约束/默认值 | 说明 |
| --- | --- | --- | --- |
| `id` | INTEGER | PRIMARY KEY | 日 ID |
| `trip_id` | INTEGER | FK trips CASCADE | 所属旅行 |
| `date` | TEXT | 每旅行唯一 | 严格本地日历日；服务层要求连续完整覆盖旅行 |
| `weather_snapshot` | TEXT | 可空，合法 JSON object | 与 date 精确一致的冻结 WeatherSnapshot |
| `created_at` / `updated_at` | TEXT | NOT NULL | 时间戳 |

索引为 `(trip_id,date,id)`。天气字段只有显式 refresh 成功后原子写入；远端失败保留旧值。

### trip_outfit_selections

| 列 | 类型 | 约束/默认值 | 说明 |
| --- | --- | --- | --- |
| `id` | INTEGER | PRIMARY KEY | 方案选择 ID |
| `trip_day_id` | INTEGER | FK day CASCADE | 所属日期 |
| `slot_index` | INTEGER | 非负；与 day 唯一 | 当日活动槽顺序 |
| `activity_ids_json` | TEXT | JSON array | 被该套覆盖的活动 ID |
| `garment_ids_json` | TEXT | JSON array | 规范顺序衣物 ID |
| `score` | REAL | NOT NULL | 统一推荐评分 |
| `reasons_json` | TEXT | JSON array | 选择理由 |
| `activity_evaluations_json` | TEXT | JSON array | 各活动最低适配证据 |
| `locked_garment_ids_json` | TEXT | 默认 `[]` | 用户锁定 ID |
| `actual_wear_event_id` | INTEGER | 可空 UNIQUE，FK wear_events SET NULL | 完成旅行时的幂等实际穿着链接 |
| `created_at` / `updated_at` | TEXT | NOT NULL | 时间戳 |

另有 `(trip_day_id,id)` 唯一键供同日 activity 复合外键引用，索引按 `(trip_day_id,slot_index,id)`。生成/重算会在一个事务内替换受影响方案和衣物清单；无可行解时不持久化违规选择。

### trip_day_activities

| 列 | 类型 | 约束/默认值 | 说明 |
| --- | --- | --- | --- |
| `id` | INTEGER | PRIMARY KEY | 活动 ID |
| `trip_day_id` | INTEGER | FK day CASCADE | 所属日期 |
| `name` | TEXT | trim 后 1–200 | 活动名 |
| `occasion` | TEXT | trim 后 1–120 | 自由文本场合说明 |
| `formality` | TEXT | Formality 枚举 | 进入统一 scorer |
| `requires_separate_outfit` | INTEGER | 0/1 | 是否强制独立 slot |
| `position` | INTEGER | 非负；与 day 唯一 | 当日顺序 |
| `selection_id` | INTEGER | 可空，同日复合 FK | 当前覆盖该活动的 selection |
| `created_at` / `updated_at` | TEXT | NOT NULL | 时间戳 |

索引为 `(trip_day_id,position,id)`，非空 selection 另有部分索引。共享活动逐个评估并取最低适配分，不隐式把独立活动合并。

### trip_packing_items

| 列 | 类型 | 约束/默认值 | 说明 |
| --- | --- | --- | --- |
| `id` | INTEGER | PRIMARY KEY | 清单项 ID |
| `trip_id` | INTEGER | FK trips CASCADE | 所属旅行 |
| `kind` | TEXT | `garment/essential` | 衣物或自由文本必需品 |
| `garment_id` | INTEGER | 可空，FK garments RESTRICT | garment kind 必填且每旅行唯一；essential 必须为空 |
| `label` | TEXT | trim 后 1–200 | 展示文本 |
| `status` | TEXT | 默认 `unpacked` | `unpacked/packed/on-body/not-taking` |
| `coverage_json` | TEXT | 默认 `{\"dates\":[],\"activityIds\":[]}` | 衣物覆盖日期、活动 ID/名称、场合与逐件选择理由；旧双字段对象继续可读 |
| `created_at` / `updated_at` | TEXT | NOT NULL | 时间戳 |

索引按 `(trip_id,kind,id)`；生成方案对衣物项幂等重建，自由文本项独立保留。新生成的 garment coverage 使用 `{dates,activityIds,activities,occasions,reasons}`，其中可读活动名由本地 activity ID 映射并去重，不需要新增迁移。四态只属于旅行清单，不会写 `garments.availability_status` 或 availability event。

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

`npm run privacy:clean` 默认只打印包含绝对路径的清理计划，不删除文件。显式提供 `--confirm` 后，清理范围包括采集产物、旧缩略图、`data/garment-assets`、日志和 `data/outfit.sqlite*`；登录 profile 只有再显式加入 `--include-login-state` 才允许清理。所有目标的词法路径和真实路径都必须位于项目根目录内；junction/symlink 外逃或 realpath 解析失败会中止清理。`output/models` 不在当前 privacy-clean 目标中。
