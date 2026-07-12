# Outfit M3：推荐反馈与衣物可用状态

> 恢复说明：本文件正文从 2026-07-11 的本地 Codex 会话存档中按原章节边界恢复，未凭记忆改写。
> 状态：已完成；M3 实现、文档、自动化回归、隔离浏览器验收与用户授权后的标准生产构建均已通过。

## 共同执行约束

- 依赖关系：硬依赖 M2。
- 产品继续保持单用户、本地优先；业务数据、衣物图片与反馈默认不离开本机。
- 新写接口继续经过本地 session、Origin/Sec-Fetch-Site、结构化错误与严格输入校验。
- 图片流程必须遵守 SSRF、重定向、私网地址、格式、像素与字节限制。
- 采用 TDD，并同步更新 `docs/api.md`、`docs/schema.md`；完成时运行 `npm run typecheck`、`npm test`、`npm run build`。
- 删除任何电脑文件前，必须先展示目标和影响并取得用户明确确认。

---
## 10. 子项目 M3：推荐反馈与衣物可用状态

**目标：** 让用户的真实选择改变后续排序，同时确保待洗、维修、借出或已装箱的衣物不会被推荐。

### 数据与评分

新增：

- garments.availability_status，默认 available，枚举 available/laundry/repair/loaned/packed
- recommendation_feedback
- outfit_pair_stats
- garment_availability_events

API 增加：

- POST /api/recommendation-feedback：按 candidateId 幂等新增或更新反馈。
- DELETE /api/recommendation-feedback?scope=all|candidate|date-range：清空前由 UI 展示范围并二次确认；服务端记录结构化审计结果并重算 pair stats。
- POST /api/garments/:id/availability：校验状态并写 garment 与事件历史的同一事务。

反馈：

~~~ts
type FeedbackVerdict = "liked" | "disliked" | "skipped";
type FeedbackReason =
  | "too-warm" | "too-cold" | "too-formal" | "too-casual"
  | "color" | "fit" | "repeat" | "unavailable" | "other";

interface RecommendationFeedback {
  candidateId: string;
  verdict?: FeedbackVerdict;
  rating?: 1 | 2 | 3 | 4 | 5;
  actuallyWorn?: boolean;
  reasonCodes: FeedbackReason[];
  comment?: string;
  woreInsteadOutfitId?: number;
}
~~~

首版 pair bonus 使用透明、有界公式：

~~~text
signal = likes + 2*worn - 2*dislikes
confidence = min(1, totalFeedback / 5)
pairBonus = clamp(signal / max(1,totalFeedback), -1, 1) × 4 × confidence
~~~

每个 outfit 的全部 pairBonus 总和限制在 -8…+8，并作为 scoreBreakdown.learnedPreference 单独展示。少于 3 条证据时仍记录，但不改变排序。

### 文件结构

创建：

- server/services/recommendationFeedback.ts
- server/services/garmentAvailability.ts
- server/routes/feedback.ts
- src/features/recommendations/FeedbackDialog.tsx
- src/features/wardrobe/AvailabilityMenu.tsx
- tests/recommendationFeedback.test.ts

修改：

- server/services/recommend.ts、server/db.ts、server/routes.ts
- src/shared/types.ts、src/api.ts
- src/features/recommendations/OutfitStage.tsx
- src/features/wardrobe/GarmentItem.tsx、WardrobeView.tsx
- tests/api.test.ts、tests/app.test.tsx、tests/recommendation.test.ts

### 实施任务

- [x] 写反馈幂等、评分范围、原因枚举、候选归属和重复提交测试。
- [x] 实现反馈写入与 pair stats 重算；同一候选的后续提交更新而不是叠加。
- [x] 写推荐排序测试：证据不足不调权，达到阈值后只产生 -8…+8 的可解释 bonus。
- [x] OutfitStage 增加喜欢、不喜欢和“实际穿了”入口；不喜欢时提供有限原因而非强制长文本。
- [x] 穿着成功后把 actuallyWorn=true 与当前 wear_logs 写入放在同一事务；M4 迁移后复用同一 service 改写为 wear_event，避免提前依赖尚不存在的表。
- [x] 为 garment 迁移 availability_status，并增加 available/laundry/repair/loaned/packed 状态校验和变更历史。
- [x] 推荐硬过滤非 available 衣物；若过滤后缺槽位，missingSlots 同时提示不可用数量。
- [x] 衣服库增加单件和批量状态切换；“标记已穿”后只建议而不自动把衣物设为待洗。
- [x] 洞察页显示反馈数量、接受率和最常见拒绝原因，不展示未经阈值验证的“学习结论”。
- [x] 实现按全部/候选/日期范围清空反馈的预览、确认和 pair stats 重算；API 集成测试覆盖越权 scope、空范围和重放。
- [x] 扩展 OutfitExportV2，加入 feedback、pair stats 与 availability events，并验证导出不漏状态历史。
- [x] 更新文档并完成全量验证。

### 验收标准

- 反馈永远关联到稳定 candidateId，而不是临时序号。
- 同一反馈重复提交不会重复加权。
- 待洗/维修/借出/已装箱衣物不进入推荐。
- 用户能看到“学习偏好”对分数的有限贡献，并可清空反馈；清空前必须展示将影响的数据范围。
- 清空后 pair stats 与推荐 bonus 在同一事务结果中一致，不残留由已删除反馈计算出的权重。

### 2026-07-12 验收进度

- 自动化回归：`npm run typecheck` 通过；Vitest 27 个文件、365 项通过；Python unittest 25 项与 pytest 33 项通过。
- 安全与差异：生产及全量 npm 审计均为 0 漏洞；`git diff --check` 通过，仅有既有 LF/CRLF 转换提示。
- 隔离浏览器：桌面端完成反馈、实际穿着、availability 失效推荐、洞察与预览后清空；390×844 移动端无页面横向溢出，反馈弹层及底部导航可用。
- 数据边界：真实 `data/outfit.sqlite` 未由新代码打开或迁移；浏览器验收只使用保留的临时数据库；未删除任何文件。
- 标准构建：用户已明确确认清理重建 `dist` 6 个生成文件；`npm run build` 成功，Vite 转换 1595 个模块并生成新哈希产物。
- 文件操作：仅按明确授权由标准构建清理并重建 `dist` 生成物，没有删除源码、数据库、临时验收目录或其他文件。

---
