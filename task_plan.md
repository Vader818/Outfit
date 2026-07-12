# 任务计划：Outfit M1–M3 连续交付

## 目标
在已完成并保留 M1/M2 工作区成果的基础上，严格执行 `docs/2026-07-10-outfit-m3-feedback-availability-plan.md`，完整交付 Outfit M3：稳定 candidateId 反馈、幂等 pair stats、透明有界的学习偏好、衣物可用状态及历史、推荐硬过滤、反馈清空一致性、V2 导出、文档、自动化测试与真实交互验收。

## 当前阶段
进行中：阶段 46——全量回归与真实交互复验

## 各阶段

### 阶段 1：恢复上下文与全量审计
- [x] 确认并沿用当前 active goal。
- [x] 读取项目约束、旧规划记录与 Git 工作区状态。
- [x] 盘点技术栈、目录结构、前端入口、页面树、组件、样式、资源和测试。
- [x] 识别当前未提交改动来源并确保不覆盖已有工作。
- [x] 启动并等待只读子 Agent，分别审计架构、产品体验和验证基线。
- **状态：** complete

### 阶段 2：现状运行与视觉基线
- [x] 运行类型检查、前端测试和构建，记录改造前基线。
- [x] 启动本地应用并在真实浏览器检查主要页面、空态、加载态、弹窗和移动端。
- [x] 记录现有品牌 token、信息架构、可保留模式、需淘汰模式及设计三旋钮读数。
- **状态：** complete

### 阶段 3：设计系统与实施蓝图
- [x] 明确重构模式、目标用户、设计方向、色彩、字体、间距、圆角、层级和动效原则。
- [x] 决定现有依赖复用与必要新增依赖，避免混用多个设计系统。
- [x] 建立组件分层和逐页迁移顺序，保持接口、表单字段和关键文案兼容。
- **状态：** complete

### 阶段 4：基础壳层与设计系统落地
- [x] 重构全局 token、基础样式、页面容器、导航、按钮、表单、反馈和通用布局。
- [x] 实现桌面与移动端导航、焦点态、键盘交互和 reduced-motion 策略。
- [x] 视需要拆分当前大型组件，建立可维护的前端结构。
- **状态：** complete

### 阶段 5：核心页面与业务流程重构
- [x] 重构首页/今日推荐、衣服库、搭配记录、历史洞察、设置与登录等现有视图。
- [x] 重构导入、编辑、缩略图选择、采集任务等弹窗和异步状态。
- [x] 保留现有数据流、API 合约、分析事件语义和业务测试能力。
- **状态：** complete

### 阶段 6：响应式、状态与可访问性收敛
- [x] 覆盖加载、空、错误、禁用、成功和长文本状态。
- [x] 检查常见桌面与移动视口、触控目标、对比度、语义结构和键盘路径。
- [x] 审计动效动机、性能开销与暗色模式策略。
- **状态：** complete

### 阶段 7：全面验证与交付
- [x] 运行目标测试、完整测试、类型检查和生产构建。
- [x] 使用真实浏览器逐页视觉 QA，并按截图问题迭代到通过。
- [x] 执行设计技能最终预检，检查文案、布局重复、颜色/形状一致性和 AI 模板痕迹。
- [x] 更新规划、发现与进度记录，汇总变更和验证结果。
- **状态：** complete

### 阶段 8：M1 基线恢复、契约审计与 TDD 蓝图
- [x] 完整读取 M1 计划、现有规划记录、Git 状态、数据库 schema/migration、路由/验证、导入、导出、图片与前端相关实现。
- [x] 运行 session catchup 与修改前基线测试，识别并保留既有未提交改动。
- [x] 将 M1 清单映射到具体文件、测试顺序和无冲突并行范围。
- **状态：** complete

### 阶段 9：数据库、手工衣物、资产与软归档（后端 TDD）
- [x] 先写 migration 与手工衣物 API 失败测试，再新增 garment 字段、`garment_assets` 和 `createManualGarment()`。
- [x] 先写图片净化/访问失败测试，再锁定 `sharp` 并实现 raw-body、净化 WebP、原子落盘和认证读取。
- [x] 实现 archive/restore 与旧 DELETE 软归档语义，统一 active/recommendable predicate，确保旧图片不删除。
- **状态：** complete

### 阶段 10：手工建档、图片与归档前端（前端 TDD）
- [x] 实现 `ManualGarmentDialog`、浏览器侧预览/缩小、添加衣物入口与成功刷新。
- [x] 将删除交互改为归档并提供恢复；补齐字段编辑和批量季节/标签/排除动作。
- [x] 验证键盘、对话框、加载/错误/成功状态及响应式样式。
- **状态：** complete

### 阶段 11：数据库感知淘宝导入审阅与幂等提交（TDD）
- [x] 预览不写库并准确区分 create/update/unchanged/refund-sync，归档来源提示恢复并更新。
- [x] 保留退款事件，新增逐项勾选和字段修正的 `ImportReviewTable`。
- [x] 提交时服务端重新归一化/计算 key 与 disposition，严格校验 decision/override，并确保重放幂等。
- **状态：** complete

### 阶段 12：V2 JSON 与显式 ZIP 完整备份（TDD）
- [x] 扩展 `OutfitExportV2` 资产元数据，默认 JSON 不含图片二进制。
- [x] 实现显式 ZIP 备份、敏感内容/预计大小提示、白名单条目名和缺失资产 manifest 警告。
- [x] 验证 ZIP 无绝对路径、无路径穿越且不删除任何源文件。
- **状态：** complete

### 阶段 13：文档、全量验证与验收
- [x] 同步 `docs/api.md`、`docs/schema.md` 及必要用户说明。
- [x] 运行目标测试、`npm run typecheck`、`npm test`、`npm run build`。
- [x] 按七条验收标准进行 API/浏览器端到端与安全边界复核。
- [x] 更新三份规划记录并汇总交付；不执行任何文件删除。
- **状态：** complete

### 阶段 14：M2 上下文恢复、契约审计与测试蓝图
- [x] 运行 session catchup，读取项目约束、M2 计划、Git 差异、现有迁移/schema、推荐候选、历史洞察、导出与前端契约。
- [x] 运行修改前基线，确认 M0 全局 UUID 与 M1 可复用能力的实际落地状态。
- [x] 将每条 M2 实施任务和验收标准映射到具体文件、测试顺序及无冲突并行范围。
- **状态：** complete

### 阶段 15：表迁移、Saved Outfits CRUD 与归档（TDD）
- [x] 先写迁移和 CRUD 失败测试，覆盖 `slot+position` 唯一、派生搭配存在且不可自引用、归档衣物 snapshot 可回看。
- [x] 创建 `server/services/savedOutfits.ts`、`server/routes/outfits.ts` 和 `tests/savedOutfits.test.ts`，实现严格校验、事务 CRUD 与软归档。
- [x] 接入主路由且保留 session、Origin/Sec-Fetch-Site、结构化错误等现有安全边界。
- **状态：** complete

### 阶段 16：推荐一键保存与保存搭配管理（TDD）
- [x] 实现 `/api/recommendation-candidates/:candidateId/save`，使用 M0 全局唯一 UUID，默认名称为日期+场合且支持立即改名。
- [x] 创建 `SavedOutfitsPanel`，在历史洞察页内增加“保存的搭配”二级区域，不增加第六个移动端主导航项。
- [x] 覆盖重新打开、编辑、归档以及来源衣物归档后的历史展示。
- **状态：** complete

### 阶段 17：OutfitBuilder 手工搭配编辑（TDD）
- [x] 创建 `OutfitBuilder`，按 slot 选择衣物并支持配饰拖动或按钮调整顺序。
- [x] 保存前执行完整性和重复位置校验，覆盖键盘、移动端、加载与结构化错误状态。
- **状态：** complete

### 阶段 18：锁定核心与排除衣物的推荐约束（TDD）
- [x] 扩展推荐请求类型、校验与服务，支持 `includeGarmentIds` / `excludeGarmentIds`。
- [x] 对不存在、未确认、已归档、互相冲突或被排除的 ID 返回结构化校验错误；本轮不提前实现 M3 availability。
- [x] 为衣物详情与推荐卡接入“以这件为核心”操作，确保键盘和移动端可完成。
- **状态：** complete

### 阶段 19：结构化替代建议与可追溯新版本（TDD）
- [x] 将 `findAlternatives()` 改为 `OutfitReplacementSuggestion` 结构，包含目标衣物、完整新搭配、分数变化和理由。
- [x] 创建 `ReplacementDialog`；应用替代项时新建 `source=replacement` 且带 `derivedFromOutfitId` 的保存搭配，不覆盖原记录。
- [x] 为推荐卡接入“换这件”，验证旧搭配仍可回看且新旧修改/归档互不影响。
- **状态：** complete

### 阶段 20：V2 导出、文档、全量验证与验收
- [x] 扩展 `OutfitExportV2`，加入 saved outfits、items、snapshot 与 `derivedFromOutfitId`，用归档衣物 fixture 验证完整性。
- [x] 同步 `docs/api.md`、`docs/schema.md` 及必要用户说明。
- [x] 运行目标测试、`npm run typecheck`、`npm test`、`npm run build`，并逐条验证五项验收标准与桌面/移动端交互。
- [x] 更新规划、发现与进度记录；不执行任何未经用户明确确认的文件删除。
- **状态：** complete

### 阶段 21：独立验收基线与计划映射
- [x] 读取两份开发计划、现有规划记录、Git 状态与近期提交，区分已提交 M1 与未提交 M2。
- [x] 将 M1/M2 的实施任务和验收标准逐条映射到当前实现、测试与文档证据。
- [x] 使用独立代码审查与只读子 Agent 交叉检查既有完成声明。
- **状态：** complete

### 阶段 22：实现质量与安全边界审计
- [x] 审查迁移、事务、严格校验、认证/来源保护、图片/ZIP 安全、软归档和幂等边界。
- [x] 审查保存搭配、推荐约束、替代派生、归档快照和导出完整性。
- [x] 按严重度记录缺陷、偏离、证据不足和可维护性风险。
- **状态：** complete

### 阶段 23：独立验证
- [x] 运行 M1/M2 专项测试、类型检查、全量测试和生产构建。
- [x] 运行依赖审计，并核实测试覆盖是否对应计划验收标准。
- [x] 对失败项定位根因，不在未获修复授权时修改产品代码。
- **状态：** complete

### 阶段 24：结论与交付
- [x] 汇总计划符合度、项目质量等级、关键证据与残余风险。
- [x] 明确回答 Codex 是否按两份计划完成开发，并区分“实现存在”“测试覆盖”“人工交互已复验”。
- [x] 更新三份规划记录并完成当前 goal。
- **状态：** complete

### 阶段 25：验收缺陷修复基线与并行实施
- [x] 恢复验收上下文、Git 差异和 active goal，确认不覆盖既有 M1/M2 工作区改动。
- [x] 将修复拆分为 M1 导入审阅、M2 多配饰硬约束、M2 历史搭配交互及主线兼容接口/文档四个无冲突范围。
- [x] 等待三个写入子 Agent 完成并逐项复核其实现与测试证据。
- **状态：** complete

### 阶段 26：M1 可信导入闭环
- [x] 取消候选时清除 overrides，退款同步行禁止字段修正，并补真实交互序列回归测试。
- [x] 禁用旧 `/api/import/taobao-batch` 直接写库路径，返回结构化弃用响应并更新客户端/测试。
- [x] 同步 README/API 关于图片建档、restore 与两阶段导入的说明。
- **状态：** complete

### 阶段 27：M2 推荐约束与历史搭配修复
- [x] 让多个锁定配饰同时出现在每个候选，或在不可满足时返回结构化错误；补双配饰测试。
- [x] 保证含归档/已删除来源衣物的搭配可安全改名/备注，组合编辑不静默丢失 snapshot。
- [x] 为归档 saved outfits 提供明确回看区域，并覆盖键盘/移动端可用性。
- **状态：** complete

### 阶段 28：计划与文档收口
- [x] 将 M1/M2 计划状态、任务勾选和验收说明同步到当前实现。
- [x] 修正文档中过时或与服务端行为不一致的描述。
- [x] 复核 API/schema/README 相互一致。
- **状态：** complete

### 阶段 29：全量验证与最终签收
- [x] 运行目标测试、typecheck、全量 Node/Python 测试、生产构建、依赖审计与 diff 检查。
- [x] 使用隔离 fixture 完成导入取消修正、多配饰硬锁定、历史搭配回看/编辑的组件与 API 回归。
- [x] 更新规划记录并仅在所有验收缺陷均有直接证据时完成 goal。
- **状态：** complete

### 阶段 30：M3 上下文恢复、契约审计与基线验证
- [x] 运行 session catchup，读取 M3 计划、Git 差异、M2 candidate/saved outfit、wear log、推荐评分、洞察、导出与前端契约。
- [x] 保留全部既有未提交 M1/M2 改动，划定无冲突写入范围并记录现有迁移编号与 schemaVersion。
- [x] 运行修改前 typecheck、专项/全量测试并映射十二项任务；生产构建因删除约束延期，最终在用户明确授权后完成。
- **状态：** complete

### 阶段 31：衣物可用状态、事件历史与推荐硬过滤（TDD）
- [x] 先写迁移、状态枚举、原子更新和事件历史失败测试，再新增 `garments.availability_status` 与 `garment_availability_events`。
- [x] 创建 `server/services/garmentAvailability.ts`，实现严格状态校验及 garment/event 同事务更新，并接入认证写路由。
- [x] 推荐硬过滤非 available 衣物；缺槽时在 `missingSlots` 中提示不可用数量；“标记已穿”仅建议待洗，不自动改状态。
- **状态：** complete

### 阶段 32：反馈幂等、pair stats 与透明有界评分（TDD）
- [x] 先写反馈幂等、评分范围、原因枚举、候选归属、重复提交和稳定 candidateId 测试。
- [x] 创建 `recommendation_feedback`、`outfit_pair_stats`、`server/services/recommendationFeedback.ts` 与 `server/routes/feedback.ts`，实现同候选更新而非叠加。
- [x] 按计划公式重算 pair stats：少于 3 条证据不调权，单搭配总 bonus 限制在 -8…+8，并以 `scoreBreakdown.learnedPreference` 单独展示。
- **状态：** complete

### 阶段 33：实际穿着事务与反馈推荐集成（TDD）
- [x] 将 `actuallyWorn=true` 与当前 `wear_logs` 写入放在同一事务，复用 service 边界但不提前依赖 M4 表。
- [x] 验证失败时两侧均不残留写入，重复反馈不会重复穿着记录或重复加权。
- [x] 验证反馈阈值前后排序、解释字段、可用状态过滤与 M2 include/exclude/替代约束兼容。
- **状态：** complete

### 阶段 34：反馈、可用状态与洞察前端（TDD）
- [x] 创建 `FeedbackDialog` 和 `AvailabilityMenu`，为 OutfitStage 接入喜欢、不喜欢、实际穿了及有限拒绝原因。
- [x] 衣服库接入单件和批量状态切换，覆盖加载、错误、键盘、移动端与结构化校验反馈。
- [x] 洞察页显示反馈数量、接受率和最常见拒绝原因，不展示未达阈值的学习结论。
- **状态：** complete

### 阶段 35：反馈清空、导出与一致性（TDD）
- [x] 实现 all/candidate/date-range 清空预览、范围展示、二次确认、严格 scope 校验和结构化审计结果。
- [x] 在同一事务删除目标反馈并重算 pair stats，覆盖越权 scope、空范围、无效日期和重放。
- [x] 扩展 OutfitExportV2，加入 feedback、pair stats 与 availability events，验证状态历史与归档引用不遗漏。
- **状态：** complete

### 阶段 36：文档、全量验证与最终验收
- [x] 同步 `docs/api.md`、`docs/schema.md` 及必要用户说明，并更新 M3 原计划勾选与状态。
- [x] 运行目标测试、`npm run typecheck`、`npm test`、Python 测试、`npm run build`、依赖审计与 `git diff --check`。
- [x] 使用隔离数据完成桌面/移动端真实交互验收，逐条核对五项验收标准并更新三份规划记录。
- [x] 删除前向用户展示目标与影响并取得明确确认；仅由标准构建清理并重建已列明的 6 个 `dist` 生成文件。
- **状态：** complete

### 阶段 37：M1–M3 独立复验基线与证据重建
- [x] 读取三份里程碑计划、当前源码/测试/文档及 Git 状态，不沿用旧验收结论作为通过依据。
- [x] 将 M1、M2、M3 分派给三个只读子 Agent，分别建立“计划条目—实现—测试—缺口”映射。
- [x] 盘点测试命令、运行入口、数据库迁移、依赖与构建边界，确定独立验证矩阵。
- **状态：** complete

### 阶段 38：静态实现、契约与安全质量审计
- [x] 审查关键业务路径、事务/幂等/软归档/鉴权/输入校验、导出完整性与前后端契约。
- [x] 复核计划勾选、文档描述和真实实现是否一致，按严重度记录缺陷及证据。
- [x] 汇总三个子 Agent 的独立审查结果并由主 Agent 交叉验证。
- **状态：** complete

### 阶段 39：独立动态验证与可运行性验收
- [x] 运行类型检查、全量 Node/Python 测试、生产构建、依赖审计与差异检查。
- [x] 运行关键里程碑专项测试；视风险补充隔离 API/浏览器交互复验。
- [x] 对任何失败定位根因；本轮仅验收，不修改产品代码。
- **状态：** complete

### 阶段 40：质量评级与最终结论
- [x] 逐里程碑给出完成度、质量等级、阻断项、残余风险和证据强度。
- [x] 明确回答“是否按计划完成”，区分代码存在、自动化通过和人工交互复验。
- [x] 更新规划记录并在所有验收工作结束后完成当前 goal。
- **状态：** complete

### 阶段 41：验收缺陷修复基线与并行 TDD
- [x] 恢复验收证据、Git 状态和 active goal，确认只保留三份验收记录的既有修改。
- [x] 将缺陷拆为 M1 导入完整性、M1 图片/隐私边界、M2/M3 状态一致性三个无冲突写入范围。
- [x] 先补可复现失败测试，再实施最小完整修复；不删除任何文件、不迁移真实数据库。
- **状态：** complete

### 阶段 42：M1 可信导入完整性修复
- [x] 防止 legacy key 跨订单误合并，并在安全匹配时升级为 v2 key。
- [x] 对 batch/source/pageType/items 字段执行严格运行时校验，所有畸形请求返回结构化 400。
- [x] 修复未选候选仍可编辑及空尺码无法显式清除，并补服务/UI 回归测试。
- **状态：** complete

### 阶段 43：M1 图片引用与隐私清理修复
- [x] 禁止通用 garment PUT 写入 imageUrl，图片只能通过受控资产/缩略图流程改变。
- [x] 将 `data/garment-assets` 纳入 privacy-clean 的预览与显式确认清理计划，不触碰真实资产。
- [x] 补旁路、安全清理和文档错误码/状态码回归。
- **状态：** complete

### 阶段 44：M2/M3 前端与反馈事实一致性修复
- [x] replacement 仅复用与 candidate snapshot 精确一致的父记录，确保弹窗预览与派生落盘一致。
- [x] OutfitBuilder 接收归档来源上下文，正确区分 archived 与 deleted。
- [x] 已写 wear log 的 actuallyWorn 事实不可被后续反馈撤销；反馈可读取、回显并显式清空评分/评论。
- [x] 洞察按真正达到阈值的 pair 数量展示学习结论，而非全局反馈总数。
- **状态：** complete

### 阶段 45：契约、文档与迁移副本演练
- [x] 同步共享类型、前端 API、路由、README、API/schema 文档和三份里程碑验收说明。
- [x] 修正 `IMAGE_PIXEL_LIMIT_EXCEEDED`/413、DELETE 404、`UNAVAILABLE` 等已知文档偏差。
- [x] 使用真实数据库的只读副本演练 v0→v4 迁移与 legacy 导入，不原地修改或删除真实数据。
- **状态：** complete

### 阶段 46：全量回归与真实交互复验
- [x] 运行受影响专项、typecheck、全量 Vitest/Python、npm 审计、diff 检查和非破坏性生产构建。
- [x] 使用隔离数据库复验 M1 导入、M2 replacement 和 M3 实穿→反馈/编辑/阈值流程。
- [x] 汇总修改与残余风险，仅在所有已报告问题均有直接通过证据后完成 goal。
- **状态：** complete

## 关键问题
1. 工作区已有 `src/App.tsx`、`src/styles.css`、`tests/app.test.tsx` 未提交改动，必须先理解并保留。
2. 当前前端可能以大型单文件为主，是否拆分需依据实际耦合和测试边界决定。
3. 本轮不静默改变 URL、主导航语义、表单字段、品牌标识或法律文案。
4. 本轮不删除任何电脑文件；若后续确需删除，必须先明确告知用户。
5. M1 硬依赖 M0；必须先从代码和迁移状态确认 M0 契约已落地，不能凭计划假设。
6. `sharp`、ZIP 依赖、Express body parser 与既有缩略图安全逻辑需要审计后复用，避免双重解析或绕过全局保护。
7. `sourceItemKey`、淘宝归一化和幂等边界必须由服务端掌控；前端 decision 仅表达用户选择。
8. 所有资产都采用软失活；本轮绝不物理删除旧图片或其他电脑文件。

## 已做决策
| 决策 | 理由 |
|------|------|
| 先审计再确定视觉方向 | 重构必须建立在产品定位、现有资产和真实页面问题上 |
| 优先保持信息架构和 API 契约 | 降低全量视觉重构对业务能力的回归风险 |
| 子 Agent 初期只读 | 让架构、体验和验证调查并行，同时避免修改冲突 |
| 真实浏览器作为最终验收环节 | 单靠测试和构建无法发现布局、溢出、层级与触控问题 |
| 采用 Redesign - Overhaul 而非 targeted evolution | 2026-07-07 的 quiet workbench 演进已实施但用户仍明确不满意 |
| 采用“晨间试衣台”视觉方向 | 它让用户衣物图成为主角，并区分日常决策、衣橱管理和低频维护三种密度 |
| 按业务域拆分前端并保留兼容入口 | `App.tsx`/全局 CSS 单体耦合已妨碍视觉一致性和独立状态管理，兼容重导出可降低测试迁移风险 |

## 遇到的错误
| 错误 | 尝试次数 | 解决方案 |
|------|---------|---------|
| 新建 `/goal` 失败，因为已有同名 active goal | 1 | 使用当前 active goal 继续推进 |
| 全仓 `Select-String` 搜索未排除 `logs/output`，扫到本地状态文件 | 1 | 后续搜索明确限定源码/测试/文档路径，避免扫描敏感本地状态目录 |
| 本轮再次请求创建 goal 时提示已有 active goal | 1 | 读取 `get_goal` 并确认其目标正是本次前端重构，直接沿用 |
| PowerShell `foreach` 结果直接接管道导致 EmptyPipeElement | 4 | 后续所有此类命令统一先赋给 `$rows` 再执行 `Format-Table`，不再使用直接管道形式 |
| 浏览器基线标签页在截图前已失效 | 2 | 按浏览器技能要求保留 browser 绑定并新建标签页，重新导航后截图成功 |
| `Select-String` 对混合通配符路径的截图脚本搜索无结果且退出 1 | 1 | 改为先用 `Get-ChildItem -Recurse -File` 收集明确文件列表，再传给 `Select-String` |
| 新架构首次运行 `tests/app.test.tsx` 有 29 项失败 | 1 | 其中多数是旧 class/token/网格断言；真实兼容问题是直接调用含 `useMemo` 的 WardrobeView，已先移除无必要 hook，再迁移视觉测试 |
| 误调用不存在的 `tab.playwright.domcontentloaded()` | 1 | `goto()` 已完成导航，改用 `domSnapshot()` 读取页面就绪结构 |
| 首次全量测试有一个 Vitest worker 异常退出 | 1 | 单独验证 API 文件与单 worker 套件后，在子 Agent 全部结束时重跑默认并发，15 文件 200 项全部通过 |
| 结构化错误测试误给 `toMatchObject` 传类型参数 | 1 | 改为先捕获错误，再分别断言 `ApiClientError` 实例与结构 |
| `AUTH_REQUIRED_EVENT` 首次补丁误插入 Lucide 导入 | 1 | 立即移动到 `../api` 导入并通过类型检查 |
| M1 migration 红灯：缺少 v2 `trusted-ingestion` 及字段/资产表 | 1 | 这是预期的 TDD 失败；下一步仅实现编号迁移 2 后重跑同一测试 |
| M1 手工建档红灯：扩展字段被旧白名单拒绝 | 1 | 预期 TDD 失败；已扩展共享类型、严格验证、插入与行映射并转绿 |
| M1 软归档红灯：旧 DELETE 无弃用标记且仍硬删除 | 1 | 预期 TDD 失败；下一步实现 active scope、archive/restore 与 DELETE 软归档兼容 |
| 软归档测试首次实现后引用了另一测试作用域的 `recommendationRequest` | 2 | 首次补丁命中前一处相同代码；已读取精确行并在本测试上下文定点替换为共享天气请求 |
| 软归档恢复断言用 `toMatchObject({ archivedAt: undefined })` 要求 JSON 存在该键 | 1 | 改为先断言同一 id，再断言响应不含 `archivedAt` 属性 |
| M1 数据库感知导入红灯：`previewTaobaoImportForDb` 尚不存在 | 1 | 预期 TDD 失败；下一步实现只读 preview、严格 decision 对齐与事务 commit |
| active scope 落地后旧退款测试仍用默认 `listGarments()` 查 unavailable 衣物 | 1 | 测试改为显式 `{ scope: "all" }`，默认列表继续遵守 active predicate |
| M1 中段 typecheck：legacy key 的 nullable payment、Fetch Buffer BodyInit、新必填类型夹具未同步 | 1 | 分别归一化 null、改用 ArrayBuffer，并补齐测试 fixture；export fixture 交由其当前写入 Agent 修复 |
| M1 新界面完整组件测试仍有 3 条 M0 旧契约断言 | 1 | 将断言同步为退款事件保留到数据库感知预览、无预览时禁用提交、删除改为可恢复软归档；产品实现无需回退 |
| ZIP API 测试的 Node Buffer 底层类型被推断为 `ArrayBuffer \| SharedArrayBuffer` | 1 | 与既有图片测试保持一致，将限定范围的 slice 显式收窄为 Fetch 接受的 `ArrayBuffer` |
| 审计视觉测试时假定存在独立 `tests/vision.test.ts`，实际视觉集成测试位于 `tests/api.test.ts` | 1 | 改用 `Get-ChildItem` 收集真实测试文件后再按符号检索，不创建或删除文件 |
| 一次 PowerShell UTF-8 初始化多写了 `]` 导致解析失败 | 1 | 立即改回已验证的 `$OutputEncoding = [Console]::OutputEncoding = ...` 固定写法 |
| 文档中两个 `skippedRefunded` 示例首次无上下文替换命中旧立即导入示例 | 1 | 改用包含 totalItems/uniqueItems 的上下文分别定点修正：旧正常项为 0，含退款预览为 1 |
| M1 首次全量回归有 2 条旧断言失败 | 1 | 采集测试改为保留退款并只过滤普通非服饰；推荐集成不再把合法搭配数硬编码为 1，仍验证结构完整与无缺口 |
| 新增 archiver 后生产依赖审计发现 `glob@10.4.5` 高危 CLI 公告 | 1 | 定位为 `archiver-utils` 传递依赖；保持 `archiver@7.0.1`，用精确 override 升至公告修复下界 `glob@10.5.0` 并重新审计 |
| 首次隐藏 QA 服务就绪探测超时 | 1 | Vite 已启动但内存 API 的 `tsx -e` 参数未正确传递；改用独立临时工作目录启动现有 `server/index.ts`，避免触碰真实数据库 |
| 停止 QA 监听进程后的端口复查命令以退出码 1 返回 | 1 | 单独复查确认两个监听端口均为 0，相关父进程也已退出；未删除任何文件 |
| 浏览器归档确认首次点击被原生 confirm 阻塞并使临时标签失效 | 1 | 未重复触发写操作；新标签读取到衣物已归档，随后通过恢复按钮验证 active 恢复，API 测试另覆盖确认语义 |
| 最终清单复核发现 canvas 预处理缺少直接交互模拟测试 | 1 | 新增 4096×2048 本地图经 canvas 缩至 2048×1024 并输出 WebP 的测试；后端净化测试继续作为真正安全边界 |
| 首次补 ZIP 前端测试的组合补丁未命中现有测试标题 | 1 | 读取文件精确上下文后按真实标题定点应用，未产生部分写入 |
| ZIP 路由 TDD 红灯仍返回默认 V2 JSON | 1 | 增加 `format=zip&preview=1` 预览分支、流式 ZIP 分支与非法格式结构化错误后转绿 |
| M2 Saved Outfits 首轮红灯：`server/services/savedOutfits.ts` 尚不存在 | 1 | 这是预期的 TDD 失败；下一步实现共享类型、严格 DTO、事务服务和认证路由后重跑同一目标测试 |
| Saved Outfits 首轮实现后 1 条测试因断言只接受“衣物不存在”，实际沿用既有“衣服不存在”文案 | 1 | 扩展测试正则兼容项目既有结构化 NOT_FOUND 文案，产品实现无需改动；专项 18/18 与 typecheck 随后通过 |
| 推荐保存 UI 转绿时并行 typecheck 暂时看到前端 Agent 已写测试但组件文件尚未落盘 | 1 | 这是明确写入边界内的并行中间态；不修改 Agent 文件，单独验证主线 `savedOutfitsUi` 2/2 通过，等待组件任务完成后再跑 typecheck |
| v3 迁移完成后导出测试仍精确断言 schemaVersion 2 | 1 | 将当前 builder 预期更新为 3；随后在 M2 导出阶段继续加入 saved-outfits feature 与数据字段 |
| 更新 schemaVersion 断言时首次补丁命中前一处 legacy V2 fixture | 1 | 读取精确行后恢复兼容 fixture，并只把当前 builder 断言改为 3 |
| M2 首次全量回归剩 1 条 API 导出断言仍固定为 M1 schemaVersion 2/三项 feature | 1 | 保留实现的 v3 输出，只把真实 API 集成预期迁移为 3、追加 saved-outfits 与 savedOutfits 数组 |
| Playwright 首次命令把 workdir 指向尚未创建的证据目录 | 1 | 先从项目根创建 `output/playwright/m2-final-20260711`，再以该目录运行 CLI |
| Windows PowerShell 首轮 QA seed 未显式发送 UTF-8 bytes，中文 fixture 名变为问号 | 1 | 改用 UTF-8 bytes；为便于视觉辨识，以 ASCII 名更新临时衣物并新建可信 snapshot，旧 fixture 只软归档不删除 |
| 移动端一次 Playwright eval 的 selector 引号被 CLI 参数解析吞掉 | 1 | 不依赖该表达式，使用语义 snapshot 验证 Dialog，并单独复测 clientWidth/scrollWidth |
| 本次独立验收新建 goal 失败，因为用户的 `/goal` 已自动创建 active goal | 1 | 读取 `get_goal`，确认目标与本次验收一致并沿用 |
| code-review 首次读取中文请求时使用系统 GBK，触发 `UnicodeDecodeError` | 1 | 下一次调用设置 `PYTHONUTF8=1`，保持请求文件为 UTF-8 |
| code-review OpenAI provider 无法从 WindowsApps 路径启动 Codex，触发 `WinError 5` | 1 | 不重复调用该 provider；检查并改用技能支持的 GitHub provider，主审查继续独立推进 |
| code-review GitHub provider 检查失败，系统未安装 `gh`/Copilot CLI | 1 | 停止外部 provider 尝试；使用两个独立只读子 Agent 与主线静态/动态审查交叉验证，不阻塞验收 |
| Playwright CLI 直接填充 JSON 时 Windows 参数解析去掉引号，后续 run-code 又依次遇到函数签名、Buffer 与隐藏 textarea 定位问题 | 4 | 按 CLI 函数签名用页面端 Base64 解码，并用可访问名称精确定位“采集 JSON”，最终成功复现导入缺陷 |
| 全量 Vitest 与 Python/依赖审计并行时 1 个 worker 异常退出，完成 22/23 文件、297/320 项 | 1 | 专项均通过且子 Agent 独立全量为 320/320；改为不并发、单独重跑全量确认 |
| M3 首轮迁移/服务红灯：v4 未注册且 feedback/availability service 文件不存在 | 1 | 这是预期的 TDD 失败；下一步仅实现 v4 migration 与两个事务 service 后重跑同一目标测试 |
| M3 v4 实现后迁移测试剩余 2 项失败：演练表清单未同步、pair fixture 缺少第二件衣物 | 1 | 将 3 张新表/默认 available 纳入精确演练，并创建真实第二件衣物后验证 pair FK/顺序约束 |
| M3 推荐红灯：availability 尚未过滤、UNAVAILABLE 未校验、learnedPreference 未计分 | 1 | 这是预期的 TDD 失败；将 availability 加入统一 eligibility/缺槽详情，并在 scoreCandidate 接入有界 pair bonus |
| M3 反馈管理对话框红灯：`FeedbackManagementDialog.tsx` 尚不存在 | 1 | 这是预期的 TDD 失败；实现范围表单、影响预览与二次确认组件后重跑同一测试 |
| 反馈管理 UI 首次实现后 1 条测试把说明中的“确认清空”误判为按钮 | 1 | 将断言收紧为匹配实际 button 标签，保留预览前说明文案与产品行为 |
| M3 实际穿着增强测试发现空 reasonCodes 会清掉既有拒绝原因 | 1 | 将“仅 actuallyWorn=true”的提交识别为增量事实，保留已有 verdict/rating/reasons/comment 并只新增一次 wear log |
| M3 首次统一 typecheck 剩 8 项：1 个生产 draft、3 个 SQLite 类型、4 组测试 fixture | 1 | 保持新字段必填，补默认 available/learnedPreference，并将 SQLite 输出与参数收窄到真实类型，不放宽契约 |
| 一次多文件机械补丁因 recommendationCandidates 分数字段尾部上下文不符而未应用 | 1 | 拆分已确认文件补丁，单独读取候选 fixture 精确上下文后再定点修改，未产生部分写入 |
| M3 浏览器 QA 首次隔离 seed 脚本被 PowerShell 双引号 here-string 吞掉 JS 反引号 | 1 | API/Vite 尚未启动；改用无反引号的单引号脚本模板与路径占位替换，保留失败临时目录且不删除 |
| M3 浏览器 QA 第二次 seed 的 `tsx -e` 字符串引号被 Windows 原生命令参数处理剥离 | 1 | 不再使用 inline TS seed；先启动空隔离 API，再通过自身注册/手工建档 HTTP 接口创建 QA 数据 |
| 浏览器首次用精确 label 定位登录账号失败，账号提示文字被并入可访问名称 | 1 | 读取最新 DOM snapshot 后改用精确 role/name 定位，登录与后续交互均通过 |
| npm 全量审计首次走本机 `npmmirror`，其安全审计端点返回 404 | 1 | 临时显式使用 `https://registry.npmjs.org` 重跑生产及全量审计，均为 0 漏洞 |
| `check-complete.ps1` 在 Windows PowerShell 中直接执行时把无 BOM UTF-8 当作系统代码页，显式读取脚本后又使其内部 `Get-Content` 得到 0/0 | 2 | 用 UTF-8 创建 ScriptBlock，并为内部 `Get-Content` 设置 UTF-8 默认值；最终报告 36/36 阶段完成 |
| 本轮 session catchup 报告中文被系统代码页错误解码 | 1 | 仅使用其“7 条未同步上下文”提示，改以 UTF-8 直接读取规划文件和 Git 状态恢复，不依赖乱码正文 |
| 真实数据库副本第一次 legacy 演练筛选同时要求 orderId/itemId/SKU 与 is_apparel，未找到候选 | 1 | 断言在任何导入前中止；只读统计真实副本字段完整性后放宽为“可重算且已关联 garment” |
| 第二次筛选仍要求非空 SKU，但真实旧关联行使用 itemId-only legacy key | 1 | 再次在导入前中止；按真实空 SKU 身份值演练，同 order 原位升级、不同 order 新建及重放幂等全部通过 |
| 浏览器自动化用 `fill("")` 清空尺码/评论时未产生真实输入变更 | 2 | 改用可见控件的键盘 Backspace 操作并逐次读取 value，最终数据库确认两字段均为空；这是验收工具交互差异，不是产品回退 |
| 浏览器控制台发现 React 对直接 `javascript:` href 的未来兼容警告 | 1 | 改为通过 ref 在真实 DOM 上安装受控书签地址，保留拖拽书签能力；专项 76/76、typecheck、全量 410/410 和热更新浏览器复核均通过 |
| 书签链接首次改用 `useCallback` 后，旧测试直接调用组件触发 Invalid hook call | 1 | 不改变既有测试调用契约，改用无 hook 的 ref callback；专项与全量回归随后全部通过 |

## 备注
- 优先使用 PowerShell 原生命令，不先使用 `rg`。
- PowerShell 命令显式设置 UTF-8。
- 删除电脑上的文件前必须确保用户知晓。
- 当前协作环境最多同时运行 4 个 Agent（含主 Agent）；本轮曾并行开启 3 个写入范围互斥的修复子 Agent，均已返回并由主 Agent 复核。
