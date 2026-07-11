# 任务计划：Outfit M0–M6 完整研发执行

## 当前研发目标（2026-07-11）
根据用户最新指令，停止 M1–M6 的研发实现，把原计划中的 M1、M2、M3、M4、M5、M6 分别拆成六个独立 Markdown 子计划；保留已完成并提交的 M0，不删除原计划或任何电脑文件。拆分、校验和收尾记录完成后结束并标记当前 goal 已完成。

## 不可放宽的执行约束
- 每个子项目先细化为逐测试、逐提交清单，再按 TDD 先红后绿实施。
- M0–M6 使用独立 `codex/` 分支；每个里程碑达到验收标准后才进入下一个里程碑。
- 每个里程碑都更新 `docs/api.md`、`docs/schema.md` 与 OutfitExportV2 覆盖。
- 每个里程碑至少通过 `npm run typecheck`、`npm test`、`npm run build`；最终发布门额外通过 `python -m pytest -q`。
- 不读取或修改真实 `data/`、`output/`、`logs/` 与浏览器 profile；测试仅用临时目录和临时 SQLite。
- 不删除任何电脑文件。若后续确需删除，必须先向用户展示目标、影响并取得明确确认。
- 业务继续只监听 `127.0.0.1`，所有新增写接口复用 session、Origin/Sec-Fetch-Site、结构化错误与严格输入校验。

## 当前阶段
用户终止与计划拆分收尾（complete）。M1-A 未形成提交，局部红测/实现已手工撤回；M1–M6 不再继续研发，六份独立子计划已生成并验证。

## 里程碑总览
| 里程碑 | 状态 | 独立分支 |
|---|---|---|
| M0 可信基础 | complete | `codex/outfit-m0-foundation` |
| M1 可信建档与导入暂存区 | stopped | 已创建 `codex/outfit-m1-trusted-ingestion`，无 M1 提交 |
| M2 保存搭配、指定核心单品与换一件 | stopped | 按用户要求未启动 |
| M3 推荐反馈与衣物可用状态 | stopped | 按用户要求未启动 |
| M4 穿搭日记与周计划 | stopped | 按用户要求未启动 |
| M5 成本/次、重复购买与购买前检查 | stopped | 按用户要求未启动 |
| M6 旅行打包与胶囊覆盖 | stopped | 按用户要求未启动 |

## 用户终止与拆分收尾
- [x] 手工撤回尚未提交的 M1-A 业务源码与红测，确认 HEAD 仍为已验收的 M0 提交 `1453838`。
- [x] 从原计划精确提取 M1–M6，各生成一个独立 Markdown 子计划；保留原计划不删除。
- [x] 为六个子计划加入来源、依赖、里程碑范围及原文主体，确保代码围栏和本地链接有效。
- [x] 更新三份规划记录，验证 Git 状态无未提交 M1 业务源码、无删除文件。
- [x] 按用户要求结束并标记当前 goal 完成。

### 六份拆分结果
- [M1：可信建档与导入暂存区](docs/2026-07-10-outfit-m1-trusted-ingestion-plan.md)
- [M2：保存搭配、指定核心单品与换一件](docs/2026-07-10-outfit-m2-saved-outfits-plan.md)
- [M3：推荐反馈与衣物可用状态](docs/2026-07-10-outfit-m3-feedback-availability-plan.md)
- [M4：穿搭日记与周计划](docs/2026-07-10-outfit-m4-diary-week-plan.md)
- [M5：成本/次、重复购买与购买前检查](docs/2026-07-10-outfit-m5-decision-support-plan.md)
- [M6：旅行打包与胶囊覆盖](docs/2026-07-10-outfit-m6-trip-capsule-plan.md)

## M0 逐测试、逐提交执行清单

### M0-A 版本化迁移骨架（提交边界 1）
- [x] 失败测试：legacy baseline 0 首次登记，当前/历史 schema 均可升级。
- [x] 失败测试：同一编号迁移只执行一次；版本重复、乱序被拒绝。
- [x] 失败测试：失败迁移整体回滚且不写 `schema_migrations`。
- [x] 实现原子 `legacyBaseline0 + baseline 0 登记 → runNumberedMigrations`，每个编号迁移独立事务；后续启动不重跑 baseline。
- [x] 目标迁移测试、现有数据库测试与类型检查通过（24 项测试）。
- [x] 独立提交 `83224f1 feat(db): introduce versioned migration baseline`，未夹带推荐/UI 或规划文件。

### M0-B 有界推荐生成（提交边界 2）
- [x] 失败测试：500 件且至少三套合法核心组合的 fixture，`evaluatedCandidates <= 20_000` 且返回三套不同核心组合。
- [x] 失败测试：未确认、未拥有、excluded 衣物不参与；空结果返回 `missingSlots`。
- [x] 实现核心组合 → 外套 → 鞋 → 配饰的分层 beam，每层最多 120 个中间结果并暴露评估计数。
- [x] 保持现有天气、场合、颜色、近期穿着、画像和解释分项契约；小衣橱精确特征测试未漂移。
- [x] 目标回归 123 项、默认全量 216 项、类型检查和生产构建通过；独立提交 `5035c3d`。

### M0-C 全局候选身份与持久化（提交边界 3）
- [x] 失败测试：`candidateId` 跨 run 全局唯一；相同有序 slot 组合的 `outfitSignature` 稳定。
- [x] 失败测试：rank、天气、场合变化不改变 signature，但候选快照仍保留各 run 上下文。
- [x] 迁移 `recommendation_candidates`，加入全局 UNIQUE、run 外键、rank/JSON CHECK 与索引。
- [x] `saveRecommendationRun` 返回 runId；API/共享类型返回 runId、candidateId、outfitSignature。
- [x] 候选失败时 run/candidates 整体回滚；全量 221 项、typecheck、build 通过并提交 `45fda72`。

### M0-D OutfitExportV2（提交边界 4）
- [x] 失败测试：旧 V1 fixture 可识别，V2 保留 V1 顶层业务数据并带 schemaVersion/exportedAt/features。
- [x] 失败测试：M0 导出包含 migration version 和 recommendation candidates；绝对文件路径、路径穿越与内嵌二进制被拒绝。
- [x] 实现深度版本校验器、单一读快照稳定构建器与后续里程碑扩展点；`server/db.ts` 委托 export service。
- [x] 固定时钟/顺序、无 UI 上限、敏感导出确认、认证与现有 export API 测试通过；提交 `c91d677`，资产边界补强提交 `04dc3e6`。

### M0-E 可信默认值、确认语义与远程图片（提交边界 5）
- [x] 失败测试：新用户位置/画像为真正未设置；首次推荐前要求确认有效位置，空串不再被当作 `0,0`。
- [x] 失败测试：最小手工衣物 POST 默认 `confirmed=true` 且不可伪造状态/来源；淘宝导入仍为 false，重导不覆盖用户确认。
- [x] 失败测试：推荐与 UI 计数仅使用 `owned && confirmed && !excluded`；缺槽位按待确认/需补充给出结构化文案与 CTA。
- [x] 失败测试：远程淘宝图默认关闭，用户显式开启后仅本会话加载；衣橱、推荐、替代单品与缩略图候选均本地图优先。
- [x] 实现前后端空画像、空坐标、未设置选项和请求前门禁；不再静默写入北京坐标/具体身体画像。
- [x] 目标 5 文件 164 项、全量 240 项、typecheck/build 通过；三项只读复核清零中高风险，提交 `f98d192`。

### M0-F 隐私、文档与发布门（提交边界 6）
- [x] 失败测试：privacy-clean 预览列出 Playwright profile，默认不删除。
- [x] 失败测试：仅 `--confirm --include-login-state` 同时存在才允许清理两类登录态。
- [x] 更新 README、`docs/api.md`、`docs/schema.md`，文档与远程图片/迁移/导出真实行为一致。
- [x] 在临时复制的现有 schema fixture 上演练迁移；只读源文件，不触碰真实数据库。
- [x] 运行 M0 目标测试、`npm run typecheck`、`npm test`、`npm run build`、`python -m pytest -q`。
- [x] 复核 Git diff、无删除、无真实数据访问；完成 M0 独立提交 `1453838` 与验收记录。

## M1–M6 启动规则
进入每个后续里程碑前，从规范文档逐条复制该里程碑的实施任务与验收标准到本文件，拆成逐测试、逐提交清单；不得用概括性完成标记替代规范中的任何任务。

## M1 规范实施任务（逐条保留）
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

## M1 规范验收标准（逐条保留）
- [ ] 一件线下或非淘宝衣物可在 60 秒内用本地照片建档并进入推荐。
- [ ] 即使绕过前端直接调用 API，落盘图片也不含原文件 EXIF/ICC/XMP，且不会被发送到外部域名。
- [ ] 图片只能经认证 asset ID 端点读取，响应和导出不暴露电脑上的绝对路径。
- [ ] 归档衣物不进入推荐或默认洞察，仍可恢复；同来源再次导入不会生成重复 active 记录。
- [ ] 预览中的每个候选可选择、修正，并明确显示新增/更新/退款同步/无变化。
- [ ] 取消某项不会写入；退款同步不会因 wardrobeOnly 过滤而消失。
- [ ] 同批提交重放保持幂等。

## M1 逐测试、逐提交执行清单

### M1-A schema、手工字段与 JSON 建档（提交边界 1）
- [ ] 红测 migration 2：六个 garments 字段、`garment_assets` 全部约束/索引、旧库数据保持、重复启动幂等；baseline 0 不漂移且无 availability_status。
- [ ] 红测扩展 `POST /api/garments`：origin 固定 manual、source 为空、confirmed=true；acquiredAt/非负整数分价格/CNY 可选，未知/状态/图片字段与非法日期、货币、价格拒绝。
- [ ] 实现共享类型、严格验证、migration 2 与 `createManualGarment()`；无图片也可保存，淘宝导入写 origin=taobao。
- [ ] 目标 DB/API/导出兼容测试、typecheck；独立提交，不夹带图片二进制处理。

### M1-B 本地图片资产安全链路（提交边界 2）
- [ ] 红测 5 MB raw body 门禁、JPEG/PNG/WebP、伪造 MIME、解码失败、像素炸弹、路径穿越、EXIF/ICC/XMP 去除与原子失败不留活跃资产。
- [ ] 锁定 `sharp`；实现专用 raw middleware、自动旋转/净化 WebP、UUID storage_key、sha256/尺寸/字节元数据及资产根 realpath containment。
- [ ] 红测/实现认证 `PUT /api/garments/:id/image` 与 `GET /api/garment-assets/:id/content`；不存在、非 active、越界 key 均使用不泄露物理路径的结构化错误。
- [ ] 替换图片只停用旧 asset，不删除文件；Garment.imageUrl 只指向认证 asset ID 端点。
- [ ] 目标资产/API/隐私测试与 typecheck；独立提交。

### M1-C 手工建档 UI、归档与批量整理（提交边界 3）
- [ ] 红测 Wardrobe“添加衣物”→ JSON 保存→可选照片上传→成功刷新；canvas 只负责预览/减小上传，服务端仍是安全边界。
- [ ] 实现 `ManualGarmentDialog`，键盘/dialog 焦点与错误态可用，保存后进入已确认藏品。
- [ ] 红测/实现 archive/restore 与旧 DELETE 软归档；active predicate 统一到列表、推荐、替代、洞察和计数。
- [ ] 导入去重命中 archived 来源时给出 restore/update，不创建重复 active 行。
- [ ] 补全单件编辑字段及批量季节/标签/排除动作与交互测试；独立提交。

### M1-D 数据库感知导入暂存区（提交边界 4）
- [ ] 红测 preview 对 create/update/unchanged/refund-sync/archived restore 的判定，预览事务严格零写入。
- [ ] 去除采集读取阶段的退款早过滤；API/前端仍可展示 wardrobeOnly 摘要但退款事件可进入同步判定。
- [ ] 实现 `ImportReviewTable` 的逐项 include 与 overrides，明确 disposition 和字段差异。
- [ ] 红测/实现 `/api/import/taobao-commit`：服务端重算 sourceItemKey/disposition，拒绝未知 decision/非法 override/重复 key，取消项零写入，批次重放幂等且事务原子。
- [ ] 目标 import/API/React 测试、typecheck；独立提交。

### M1-E V2 资产元数据与显式 ZIP 完整备份（提交边界 5）
- [ ] 红测 V2 增加 origin/archive/price 与 asset 元数据，JSON 仍不含图片二进制或绝对路径。
- [ ] 红测 `GET /api/export?format=zip` 的显式敏感确认链路、`outfit-export.json + assets/<assetId>.<ext>`、条目白名单、zip-slip 拒绝、缺失/非活跃资产 manifest 警告与稳定顺序。
- [ ] 实现流式 ZIP 构建与认证端点；取消确认不请求、不生成、不删除任何源文件。
- [ ] 更新导出 validator/快照、README、API/Schema 文档与隐私清理预览影响说明；独立提交。

### M1-F 验收与发布门（提交边界 6）
- [ ] 用临时 SQLite/临时资产目录跑 60 秒手工照片建档真实浏览器路径，不访问外站。
- [ ] 逐条核验七项规范验收，完成无真实数据访问、无删除、无绝对路径泄露和 Git diff 审计。
- [ ] 运行 M1 目标测试、`npm run typecheck`、`npm test`、`npm run build`、`python -m pytest -q`。
- [ ] 记录测试数、临时产物、独立提交和全部审计结论后再进入 M2。

---

## 历史：GitHub 功能调研与开发路线图（已完成）

## 目标
在以源码、文档、测试和数据模型为依据完整理解 Outfit 的功能及真实使用场景后，检索并核验 GitHub 上的相关开源项目，筛选对 Outfit 有明确增量价值且可落地的功能，最终交付一份带来源、取舍、优先级、架构影响、实施步骤与验收标准的 Markdown 开发计划。

## 当前阶段
已完成：最终 Markdown 已生成并通过事实、结构、链接和独立审稿验证

## 各阶段

### 阶段 1：恢复上下文与项目全量审计
- [x] 确认并沿用当前 active goal。
- [x] 完整读取项目约束、规划技能和既有规划记录。
- [x] 检查 Git 工作区状态，区分用户已有改动与本轮交付物。
- [x] 盘点源码、文档、测试、配置、数据模型、API 与主要业务流程。
- [x] 并行启动三个只读子 Agent，分别调查产品场景、技术扩展点和 GitHub 候选。
- **状态：** complete

### 阶段 2：建立功能、场景与缺口地图
- [x] 还原目标用户、触发场景、端到端主链路、异常链路及隐私边界。
- [x] 建立“已有 / 部分已有 / 缺失 / 明确不适合”能力清单。
- [x] 用代码与测试位置交叉验证关键结论，避免仅依据 README。
- **状态：** complete

### 阶段 3：GitHub 检索与候选项目核验
- [x] 按数字衣橱、穿搭推荐、衣物识别、搭配规划、衣橱分析等类别设计多组检索词。
- [x] 核验首批核心候选的实际代码、活跃度、许可证、技术栈、功能成熟度与可复用边界。
- [x] 从候选中筛出最有参考价值的项目，并记录具体可借鉴功能及证据链接。
- **状态：** complete

### 阶段 4：功能价值与适配度评估
- [x] 按用户价值、场景频率、产品契合、数据可得性、工程成本、隐私风险和维护成本评分。
- [x] 区分“直接借鉴交互/规则”“参考架构后自研”“暂缓/不采用”，不把仓库热度等同于适配价值。
- [x] 检查功能间依赖关系、重复建设风险和与现有能力的冲突。
- **状态：** complete

### 阶段 5：开发路线图与详细计划
- [x] 将高价值功能组织为 P0/P1/P2 与 M0–M6 路线图。
- [x] 为每项功能写明目标、范围/非范围、数据与 API、后端、前端、迁移、测试、验收和风险。
- [x] 给出实施顺序、硬依赖/建议顺序、P50/P80 工作量和前置依赖，确保计划可直接进入开发。
- **状态：** complete

### 阶段 6：交付物验证
- [x] 生成最终 Markdown 文件并检查结构、链接、事实、术语与优先级一致性。
- [x] 确认每个推荐都有本地需求依据和外部项目依据，每个开发阶段都有验收标准。
- [x] 完成两轮独立只读审稿并修正候选身份、图片安全、导出、硬约束、里程碑归属、许可证和日期语义等问题。
- [x] 更新 `findings.md`、`progress.md` 和本计划，确认未删除任何电脑文件。
- **状态：** complete

## 关键问题
1. Outfit 现有能力的真实边界是什么，哪些表面缺口其实已经部分实现？
2. 用户最频繁、最费力、最容易中断的主任务分别是什么？
3. 哪些 GitHub 功能能在本地优先、隐私敏感、单用户的产品边界内产生最大价值？
4. 哪些功能虽吸引人但依赖云端、社交网络、重型模型或不可接受的许可证，应明确排除？
5. 最终计划如何拆成可独立验收、风险递增合理的开发阶段？

## 已做决策
| 决策 | 理由 |
|------|------|
| 先以代码、测试和数据模型建立本地事实，再搜索外部项目 | 防止被同类项目的功能列表带偏，确保推荐来自 Outfit 的真实缺口 |
| 外部网页内容只写入 `findings.md` | 遵守规划技能的提示注入安全边界 |
| 子 Agent 初期只读且范围互斥 | 并行提高覆盖面，并避免与用户已有改动发生写入冲突 |
| GitHub 项目必须核验实际实现、许可证和近期状态 | README 宣传和 star 数不足以证明功能可复用或适合本项目 |
| 本轮只交付研究与开发计划，不实现推荐功能 | 与用户指定的最终交付物保持一致，避免未经选择扩大修改范围 |
| 用全局 UUID 标识推荐候选、用 signature 表示组合内容 | 同时保证反馈/保存 API 可唯一定位，并保留跨 run 识别同组合的能力 |
| M1 负责归档，M3 负责 availability；M2 不硬依赖 M1 | 消除重复迁移和“只选 M2”与依赖图之间的矛盾 |
| GitHub 代码只在许可允许时复用；AGPL/无许可证仅 clean-room，CC BY 规则保留归属 | 降低后续实现的许可证风险 |

## 遇到的错误
| 错误 | 尝试次数 | 解决方案 |
|------|---------|---------|
| 请求新建 goal 时发现线程已有相同目标的 active goal | 1 | 读取 `get_goal` 后沿用现有目标 |
| 首次合并读取旧规划文件的工具输出被截断 | 1 | 分文件使用 UTF-8 原文读取，已完整恢复上下文 |
| PowerShell 将 `foreach` 结果直接接管道触发 `EmptyPipeElement` | 2 | 已停止在命令字符串中使用该结构；统一先赋值给 `$rows`，再由独立语句接管道 |
| 首次并发验证 GitHub 链接时当前 PowerShell 不支持所用 `ForEach-Object -Parallel` 参数组合 | 1 | 改为原生顺序 `foreach` + `Invoke-WebRequest`，35/35 链接验证可达 |
| 首次最终门禁把 `Get-Item -LiteralPath` 误写为不存在的 `Get-Item-LiteralPath`，非终止错误未改变退出码 | 1 | 不接受该次 PASS；修正拼写并启用 `$ErrorActionPreference='Stop'` 后重跑完整门禁 |
| 首次严格门禁压缩命令时又把 `Get-Content -LiteralPath` 等参数空格合并，严格模式按预期退出 1 | 1 | 改用不压缩的多行 PowerShell，保留 cmdlet 与命名参数间空格后重跑 |
| M0-A 首版迁移骨架允许空库直接登记 baseline，且 baseline DDL/登记非原子 | 1 | 采纳独立审计，改为事务外启用外键、首次事务内执行 baseline+建 registry+登记 0，后续验证前缀并跳过 baseline |
| M0-A 冻结 baseline 后 4 个旧测试仍靠重复 `migrate()` 触发回填而失败 | 1 | 测试改为显式调用 `legacyBaseline0()` 验证冻结的旧回填逻辑；生产 `migrate()` 保持一次性 baseline 语义 |
| 共享内存 SQLite 探针首次使用 `node -e` 时 PowerShell 引号转义失败 | 1 | 改用 PowerShell UTF-8 here-string 通过标准输入执行，确认共享内存连接可用；未创建或删除磁盘文件 |
| M0-B 首次把 API 与 React 两个大测试文件并发运行时一个 Vitest worker 异常退出 | 1 | 改用单 worker 分文件定位；确认唯一真实回归是旧测试依赖未确认衣物，修正后默认并发全量测试通过 |
| `RecommendationResult.missingSlots` 改为必填后 6 个强类型前端 fixture 缺字段 | 1 | 为明确的成功 fixture 添加 `missingSlots: []`，未把字段改回可选；类型检查恢复通过 |
| M0-B 首版截断遍历会饿死后半段鞋履/连衣裙 | 1 | 根据只读复核新增两个红测，改为覆盖完整组合空间的均匀采样；末尾高分单品均可进入候选 |
| M0-C 新增必填 runId/candidateId/signature 后前端强类型 fixture 缺字段 | 1 | 统一测试 UUID 与 signature fixture，成功响应显式带 runId；没有把正式字段降为可选 |
| M0-C 首版候选 JSON 列只设 TEXT NOT NULL，损坏 JSON 红测失败 | 1 | migration 1 增加 `json_valid` 与 `json_type` CHECK，item IDs 只允许数组、score snapshot 只允许对象 |

## 备注
- 所有回答和计划使用中文。
- 优先使用 PowerShell 原生命令；命令显式设置 UTF-8；不先尝试 `rg`。
- 删除电脑上的任何文件前必须先确保用户知晓；本轮预计不需要删除文件。
- 当前环境最多 4 个并发 Agent（含主 Agent），计划并行开启 3 个只读子 Agent。
- 最终交付物为 `docs/2026-07-10-github-feature-research-and-development-plan.md`。
- 本轮只新增研究文档并更新三份规划记录；没有删除文件，也没有修改业务源码。
