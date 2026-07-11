# Outfit M5：成本/次、重复购买与购买前检查

> 本文件由[原始综合计划](./2026-07-10-github-feature-research-and-development-plan.md)对应里程碑章节机械拆分而来；章节正文未改写。
> 执行时仍须遵守父计划中的全局约束、M0 前置、统一测试/发布策略及许可证与隐私清单。
> 状态：按用户指令停止本轮实施，仅保留为后续独立子计划。

---
## 12. 子项目 M5：成本/次、重复购买与购买前检查

**目标：** 把已有淘宝金额、穿着记录、衣橱缺口和本地相似度转成可操作的理性购物建议。

### 指标定义

- 成本/次：purchasePriceCents / wearCount；wearCount=0 时显示“尚无穿着”，不制造无穷值。
- 最佳价值：价格已知且 wearCount≥3 的衣物中成本/次最低。
- 低利用高成本：购入≥90 天、wearCount≤1，且价格处于当前衣橱已知价格的最高四分位。
- 沉睡单品：活跃衣物中 90 天无穿着；新购未满 30 天不提示。
- 结构相似度首版：

~~~text
同类别为必要条件
颜色 25% + 风格 20% + 材质 15% + 图案 15% +
品牌/规范化名称 15% + 可选本地视觉相似度 10%
总分 ≥ 75% 才标记“可能重复”
~~~

没有 CLIP 模型时只按前五项归一化，不下载模型、不外发图片。

### API

- GET /api/insights/value
- POST /api/purchase-checks/taobao-candidate
- GET /api/garments/:id/similar
- POST /api/similarity-feedback

新增 `garment_similarity_feedback`：`subject_key` 是现有 garment ID 或未入库候选的稳定 fingerprint，`compared_garment_id` 指向被比较衣物，`verdict` 为 duplicate/not-duplicate，二者组合唯一。反馈只用于校准阈值和隐藏已否定配对，不自动修改衣物字段。

购买前返回：

~~~ts
interface PurchaseCheckResult {
  verdict: "fills-gap" | "likely-duplicate" | "mixed" | "insufficient-data";
  possibleDuplicates: Array<{ garment: Garment; similarity: number; reasons: string[] }>;
  worksWith: SavedOutfit[];
  coverageDelta: {
    categories: string[];
    seasons: string[];
    occasions: string[];
    compatibleOutfitCount: number;
  };
  explanation: string[];
}
~~~

### 文件结构

创建：

- server/services/wardrobeValue.ts
- server/services/garmentSimilarity.ts
- server/services/purchaseCheck.ts
- server/routes/decisionSupport.ts
- src/features/insights/ValueInsights.tsx
- src/features/import/PurchaseCheckPanel.tsx
- tests/decisionSupport.test.ts

修改：

- server/db.ts、server/services/importTaobao.ts、server/routes.ts
- src/shared/types.ts、src/api.ts
- src/features/insights/HistoryInsightsView.tsx
- src/features/import/ImportView.tsx
- tests/api.test.ts、tests/app.test.tsx

### 实施任务

- [ ] 写价格迁移测试：只在 payment/quantity 明确时回填单件价格，保留 costSource=taobao；手工值优先且不被重导入覆盖。
- [ ] 实现成本/次、四分位、沉睡单品和最佳价值纯函数，并覆盖缺价格、退款、多数量和零穿着。
- [ ] 在洞察页增加“价值与利用”区域；文案使用中性“低利用高成本”，避免羞辱或诱导消费。
- [ ] 写结构相似度表驱动测试，确保不同类别永不判重复，缺字段时权重重新归一化。
- [ ] 如果本地 CLIP 已安装，可把归一化 embedding 存入 garment_embeddings(model_id, garment_id, vector_blob)；它是可重建缓存、不进入导出，模型缺失时功能仍完整可用。
- [ ] 商品详情采集增加“购买前检查”模式：只预览，不写 source_order_items/garments。
- [ ] 计算 possibleDuplicates、worksWith 和 coverageDelta；结果只给“补缺口/可能重复/信息不足”，不替用户做购买决定。
- [ ] 写 similarity feedback migration/API 失败测试并实现幂等 upsert；候选 fingerprint 必须由服务端规范化输入生成，不能接受客户端伪造的任意路径或超长键。
- [ ] 在重复建议上提供“确实重复/不是重复”，后者立即隐藏该 pair，并为后续离线阈值评估保留证据。
- [ ] 洞察建议的 relatedGarmentIds 增加“查看相关衣物”与“应用筛选”动作。
- [ ] 扩展 OutfitExportV2，加入 similarity feedback；派生成本/次和排行在导入后重算，不重复持久化。
- [ ] 更新文档并完成全量验证。

### 验收标准

- 价格缺失不会被当作 0；退款项不进入价值排行。
- 任何“昂贵但低利用”提示都能展开看到价格、购入时间和穿着次数证据。
- 生成购买前检查结果本身不写数据库、不调用云端 AI、不自动下载模型；只有用户显式提交“确实重复/不是重复”时才写 similarity feedback。
- 相似建议可解释，并允许用户标记“不是重复”作为后续阈值校准数据。
- 同一配对重复反馈保持幂等；标记“不是重复”后不会在下一次检查中再次提示该配对。

---
