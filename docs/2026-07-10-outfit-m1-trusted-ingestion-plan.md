# Outfit M1：可信建档与导入暂存区

> 恢复说明：本文件正文从 2026-07-11 的本地 Codex 会话存档中按原章节边界恢复，未凭记忆改写。
> 状态：按用户指令停止本轮 M1–M6 实施；本文件作为后续可独立执行的开发计划保留。

## 共同执行约束

- 依赖关系：硬依赖 M0；与 M2 可并行开发。
- 产品继续保持单用户、本地优先；业务数据、衣物图片与反馈默认不离开本机。
- 新写接口继续经过本地 session、Origin/Sec-Fetch-Site、结构化错误与严格输入校验。
- 图片流程必须遵守 SSRF、重定向、私网地址、格式、像素与字节限制。
- 采用 TDD，并同步更新 `docs/api.md`、`docs/schema.md`；完成时运行 `npm run typecheck`、`npm test`、`npm run build`。
- 删除任何电脑文件前，必须先展示目标和影响并取得用户明确确认。

---
## 8. 子项目 M1：可信建档与导入暂存区

**目标：** 让非淘宝衣物也能安全进入衣橱，并让淘宝批次在写库前逐项选择、修正和判断“新增/更新/退款同步/无变化”。

### 数据与 API

新增 garments 字段：

~~~ts
type GarmentOrigin = "taobao" | "manual" | "backup";

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
~~~

新增表：

- garment_assets(id, garment_id, kind, storage_key, mime_type, byte_size, width, height, sha256, active, created_at)

新增端点：

- POST /api/garments：JSON 新建手工衣物。
- PUT /api/garments/:id/image：最大 5 MB 的 image/jpeg、image/png 或 image/webp 原始 body，服务端统一净化为 WebP。
- GET /api/garment-assets/:id/content：认证后按 asset ID 返回图片，不接收文件路径。
- POST /api/garments/:id/archive 与 POST /api/garments/:id/restore：软归档与恢复；旧 DELETE 路由改为相同的软归档语义并标记弃用。
- POST /api/import/taobao-preview：改为数据库感知，返回 disposition。
- POST /api/import/taobao-commit：接收原 batch 与逐项 decisions，服务端重新归一化并校验。
- GET /api/export?format=zip：用户显式选择时生成 V2 JSON + 本地资产的完整备份；默认 JSON 导出不含图片二进制。

图片安全边界：

- 浏览器 `canvas` 重编码只用于预览和减小上传，不作为安全控制；直接调用 API 也必须得到同样结果。
- 后端为该路由单独启用 raw-body 中间件，先限制 5 MB 字节数，再用 `sharp` 的 `limitInputPixels` 解码、自动旋转并重新编码为 WebP；不调用 `withMetadata()`，因此 EXIF/ICC/XMP 不进入落盘文件。
- 资产根固定为 `data/garment-assets`，文件名由 UUID 生成；数据库只保存不可由用户控制的 `storage_key`。每次读写都解析并断言目标仍位于该根目录内。
- `Garment.imageUrl` 只指向 `/api/garment-assets/:id/content`；API 经过现有 session/来源保护并设置正确的 MIME、缓存和 `X-Content-Type-Options`，物理路径永不返回客户端。
- ZIP 条目使用 asset ID 与白名单扩展名，拒绝绝对路径和 `..`；生成前展示将包含的敏感数据与预计大小，不自动删除任何源文件。

导入决定：

~~~ts
type ImportDisposition = "create" | "update" | "refund-sync" | "unchanged" | "skip";

interface ImportDecision {
  sourceItemKey: string;
  include: boolean;
  overrides?: Partial<Pick<Garment,
    "brand" | "name" | "category" | "color" | "warmth" |
    "seasons" | "styles" | "formality" | "size" |
    "materials" | "patterns" | "tags" | "notes"
  >>;
}
~~~

### 文件结构

创建：

- server/services/garmentAssets.ts
- server/routes/garments.ts
- src/features/wardrobe/ManualGarmentDialog.tsx
- src/features/import/ImportReviewTable.tsx
- src/lib/imageSanitization.ts
- tests/garmentAssets.test.ts

修改：

- package.json、server/db.ts、server/services/importTaobao.ts、server/routes.ts、server/validation.ts
- src/shared/types.ts、src/api.ts、src/app/App.tsx
- src/features/wardrobe/WardrobeView.tsx、GarmentEditor.tsx
- src/features/import/ImportView.tsx
- tests/api.test.ts、tests/app.test.tsx、tests/importTaobao.test.ts

### 实施任务

- [ ] 写 migration 测试并新增 origin、archived_at、acquired_at、purchase_price_cents、currency 与 garment_assets；availability_status 留到 M3，避免重复归属。
- [ ] 写 POST /api/garments 失败测试：手工衣物无 sourceOrderItemId、默认 confirmed=true/origin=manual、非法枚举和负价格被拒绝。
- [ ] 实现 createManualGarment() 和 JSON 路由，不要求图片即可保存。
- [ ] 写后端图片净化失败测试：带 EXIF 的 JPEG、PNG/WebP、伪造 MIME、像素炸弹、解码失败、超字节上限和路径穿越；浏览器 canvas 只补交互测试。
- [ ] 加入并锁定 `sharp`，实现 PUT image 专用 raw body、服务器端解码/旋转/无元数据 WebP 重编码、UUID storage_key、sha256 和原子落盘。
- [ ] 实现认证 GET asset content；验证不存在/非 active/越界 storage_key 均不泄露物理路径，Garment.imageUrl 指向该端点。
- [ ] 旧图片不自动删除；只将 active 置为 false，后续由 privacy-clean 预览和明确确认处理。
- [ ] 在衣服库增加“添加衣物”入口和 ManualGarmentDialog；保存成功后直接进入已确认藏品。
- [ ] 把衣物删除 UI 改为“归档”，实现 archive/restore；统一 active predicate 为 `owned=true AND archived_at IS NULL`，推荐再叠加 `confirmed=true AND excluded=false`。
- [ ] 列表、洞察默认只计算 active garments；导入去重必须命中已归档来源并提示“恢复并更新”，不能静默创建重复衣物。
- [ ] 写数据库感知预览测试：同一来源区分 create/update/unchanged/refund-sync，且预览不写库。
- [ ] 读取采集产物时不再提前丢弃退款事件；在 ImportReviewTable 中逐项勾选和修正字段。
- [ ] 提交时服务端重新计算 sourceItemKey/disposition，拒绝不存在的 decision 或非法 override。
- [ ] 补齐品牌、风格、正式度、备注和“排除推荐”的编辑入口；新增批量季节/标签/排除动作。
- [ ] 扩展 OutfitExportV2 资产元数据并实现显式 ZIP 完整备份；验证 ZIP 无绝对路径、无路径穿越、缺失资产有 manifest 警告。
- [ ] 更新文档并完成全量验证。

### 验收标准

- 一件线下或非淘宝衣物可在 60 秒内用本地照片建档并进入推荐。
- 即使绕过前端直接调用 API，落盘图片也不含原文件 EXIF/ICC/XMP，且不会被发送到外部域名。
- 图片只能经认证 asset ID 端点读取，响应和导出不暴露电脑上的绝对路径。
- 归档衣物不进入推荐或默认洞察，仍可恢复；同来源再次导入不会生成重复 active 记录。
- 预览中的每个候选可选择、修正，并明确显示新增/更新/退款同步/无变化。
- 取消某项不会写入；退款同步不会因 wardrobeOnly 过滤而消失。
- 同批提交重放保持幂等。

---
