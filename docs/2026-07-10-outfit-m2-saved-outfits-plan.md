# Outfit M2：保存搭配、指定核心单品与换一件

> 恢复说明：本文件正文从 2026-07-11 的本地 Codex 会话存档中按原章节边界恢复，未凭记忆改写。
> 状态：M2 已完成实现，并于 2026-07-12 经独立验收修复后通过本计划验收。

## 共同执行约束

- 依赖关系：硬依赖 M0；不硬依赖 M1。
- 产品继续保持单用户、本地优先；业务数据、衣物图片与反馈默认不离开本机。
- 新写接口继续经过本地 session、Origin/Sec-Fetch-Site、结构化错误与严格输入校验。
- 图片流程必须遵守 SSRF、重定向、私网地址、格式、像素与字节限制。
- 采用 TDD，并同步更新 `docs/api.md`、`docs/schema.md`；完成时运行 `npm run typecheck`、`npm test`、`npm run build`。
- 删除任何电脑文件前，必须先展示目标和影响并取得用户明确确认。

---
## 9. 子项目 M2：保存搭配、指定核心单品与“换一件”

**目标：** 把一次性推荐升级为可命名、可编辑、可复用的搭配，并把已有替代单品从只读列表变成操作。

### 数据模型

~~~ts
type SavedOutfitSource = "recommendation" | "manual" | "replacement";
type OutfitSlot = "top" | "bottom" | "dress" | "outerwear" | "shoes" | "accessory";

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

interface SavedOutfitItem {
  id: number;
  outfitId: number;
  garmentId?: number;
  slot: OutfitSlot;
  position: number;
  garmentSnapshot: Pick<Garment, "id" | "name" | "brand" | "category" | "imageUrl">;
}
~~~

表：

- saved_outfits
- saved_outfit_items

`saved_outfits.derived_from_outfit_id` 是可空自外键。应用替代项时创建一个新的 saved outfit，`source=replacement` 且指向原搭配；旧记录不变，因此“新版本”不是一句 UI 文案，而是可查询的派生关系。

API：

- GET/POST /api/outfits
- GET/PUT /api/outfits/:id
- POST /api/outfits/:id/archive
- POST /api/recommendation-candidates/:candidateId/save（candidateId 使用 M0 的全局唯一 UUID）
- POST /api/outfits/:id/replacements
- 推荐请求新增 includeGarmentIds/excludeGarmentIds

结构化替代项：

~~~ts
interface OutfitReplacementSuggestion {
  targetGarmentId: number;
  replacement: Garment;
  nextItems: Garment[];
  matchPercentDelta: number;
  reasons: string[];
}
~~~

### 文件结构

创建：

- server/services/savedOutfits.ts
- server/routes/outfits.ts
- src/features/outfits/OutfitBuilder.tsx
- src/features/outfits/SavedOutfitsPanel.tsx
- src/features/outfits/ReplacementDialog.tsx
- tests/savedOutfits.test.ts

修改：

- server/services/recommend.ts、server/routes.ts、server/validation.ts
- src/shared/types.ts、src/api.ts、src/app/App.tsx
- src/features/recommendations/OutfitStage.tsx、RecommendationView.tsx
- src/features/insights/HistoryInsightsView.tsx
- tests/api.test.ts、tests/app.test.tsx、tests/recommendation.test.ts

### 实施任务

- [x] 先写表迁移与 CRUD 失败测试；同一 outfit 中 slot+position 唯一，derived_from_outfit_id 必须存在且不能自引用，衣物归档后 snapshot 仍可回看。
- [x] 实现 savedOutfits 服务与路由；删除按钮实际执行 archive，不物理删除。
- [x] 推荐候选卡增加“保存搭配”；默认名称由日期+场合生成，用户可立即改名。
- [x] 在现有“历史洞察”页内增加二级区域“保存的搭配”，不增加第六个移动端主导航项。
- [x] 实现 OutfitBuilder：按 slot 选择衣物、拖动/按钮调整配饰顺序、保存前做完整性校验。
- [x] 扩展推荐请求校验，支持锁定 includeGarmentIds 和排除 excludeGarmentIds；不存在、未确认、已归档或 excluded ID 返回结构化校验错误，M3 上线后再叠加 availability 校验。
- [x] 把 findAlternatives() 改为结构化 replacements；每个建议标明替换目标、分数变化和理由。
- [x] ReplacementDialog 应用替代后生成带 derivedFromOutfitId 的新 saved outfit，不静默覆盖旧版本。
- [x] 为推荐卡增加“以这件为核心”和“换这件”动作；键盘和移动端均可完成。
- [x] 扩展 OutfitExportV2，加入 saved outfits、items、snapshot 与 derivedFromOutfitId，并用归档衣物 fixture 验证导出完整。
- [x] 更新文档并完成全量验证。

### 验收标准

- 任一推荐可一键保存、命名、重新打开和归档。
- 用户可从衣物详情发起“以这件为核心”推荐。
- 点击某件衣物的替代项后，界面显示新整套、分数变化与理由；旧搭配仍可回看。
- 已归档/删除来源衣物不会使历史搭配页面崩溃。
- 替换产生的新搭配可以追溯到原搭配，归档或修改新搭配不会改变原记录。

### 独立验收记录（2026-07-12）

- 修复多个配饰 include 未同时进入每套候选的问题；约束保持确定性、有界且替换建议不会移除锁定项。
- 历史搭配默认使用 metadata-only 更新，归档、删除或不可用来源的快照不会静默丢失；组合更新必须显式替换或移除。
- 归档搭配现可在历史洞察的独立区域回看保存时快照和派生关系。
- 与 M1 合并后的全量验证为 Vitest 24 个文件、330 项测试及 Python 33 项测试全部通过；类型检查、生产构建和依赖审计通过。

---
