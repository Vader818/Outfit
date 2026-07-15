# 任务计划：Outfit M1–M6 连续交付与 M6 独立验收

## 目标
以 `docs/2026-07-10-outfit-m6-trip-capsule-plan.md` 为本轮 M6 验收基线，独立核对当前未提交实现、测试、文档与真实交互证据；修复所有可复现缺口并完成全量验证，同时保留既有 M1–M5 成果与用户工作区改动。

## 当前阶段
阶段 77：最终复验与签收（已完成）

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

### 阶段 74：M6 独立验收基线与逐项映射
- [x] 完整读取 M6 开发计划，逐项建立“计划要求—实现文件—自动化测试—运行证据”映射。
- [x] 保护 M1–M6 现有未提交工作区改动，确认本轮不删除任何文件、不重置或覆盖既有成果。
- [x] 并行开展数据/API/导出、优化器/推荐、前端/交互三个只读审查，并由主 Agent 交叉复核。
- **状态：** complete

### 阶段 75：独立动态验证与缺口复现
- [x] 运行 M6 专项、类型检查、全量 Node/Python 测试、lint、构建、依赖与 diff 门禁。
- [x] 对六条验收标准执行隔离 API/组件/必要真实浏览器复验，区分已有实现、测试覆盖与实际可用。
- [x] 将任何失败或证据不足项转化为最小可复现回归测试。
- **状态：** complete

### 阶段 76：缺陷修复与回归
- [x] 只对确认缺口实施最小、完整、向后兼容的修复；先红后绿并保护 M1–M5 行为。
- [x] 同步受影响的共享类型、API、schema、README 与 M6 计划状态。
- [x] 不删除任何电脑文件；本轮没有删除生成物、临时文件或其他电脑文件。
- **状态：** complete

#### 遇到的错误
| 错误 | 尝试次数 | 处理 |
|------|---------:|------|
| 派生状态失效修复后，旧 CRUD 测试仍把“改约束+ready”视为合法 | 1 | 保留新完整性规则；将历史测试改为约束更新回 planning、再单独状态转移 |
| 当前 PowerShell 会话没有全局 `playwright-cli` 别名 | 1 | 使用技能规定的 `npx --package @playwright/cli playwright-cli` 绝对等价入口，复用同一 QA session |
| 技能参考中的旧 `network` 命令不被当前 CLI 接受 | 1 | 按 CLI 帮助改用当前 `requests` 命令并完成同源网络核验 |
| QA 服务停止后，空结果查询让 PowerShell 命令返回非零 | 1 | 用显式数组计数复核，最终 `LISTENING=0`、`PROCESSES=0` |

### 阶段 77：最终复验与签收
- [x] 重跑受影响专项与完整质量门禁，复核工作树差异和残余风险。
- [x] 逐条给出 11 项实施任务与 6 条验收标准的最终结论及直接证据。
- [x] 更新三份规划记录，仅在所有必要修复和验证均完成后结束 active goal。
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

### 阶段 47：M4 上下文恢复、契约审计与 TDD 蓝图
- [x] 读取 M4 计划、三份规划记录、Git 差异、现有迁移/schema、wear logs、saved outfits、天气、推荐、洞察、导出与前端导航实现。
- [x] 运行修改前基线并保留全部既有工作区改动，不修改或删除真实数据。
- [x] 将十二项实施任务与四项验收标准映射到具体文件、失败测试顺序及无冲突并行范围。
- **状态：** complete

### 阶段 48：M4 数据迁移、日期时区与索引（TDD）
- [x] 先写旧 `wear_logs` 迁移失败测试，覆盖 object、array、string、number、boolean、null context、缺失 garment ID 和 legacy snapshot。
- [x] 新增 `wear_events`、`wear_event_items`、`outfit_plan_entries` 与 worn_at、planned_date、item_id 索引。
- [x] 严格分离 plannedDate 本地日历键与 wornAt UTC 时间戳，并验证 IANA 时区、UTC±8、跨午夜、DST 边界。
- **状态：** complete

### 阶段 49：WearEvent 与 OutfitPlan 服务/API（TDD）
- [x] 创建 WearEvent CRUD，覆盖补录、日期/游标查询、修改衣物、撤销误记、删除后统计回滚。
- [x] 创建 OutfitPlan CRUD 与 mark-worn 原子操作，冻结计划/穿着快照并保持历史事实一致。
- [x] 接入认证、Origin/Sec-Fetch-Site、严格输入校验和结构化错误边界。
- **状态：** complete

### 阶段 50：天气快照、推荐安排与重复提醒（TDD）
- [x] 扩展天气服务为 1–7 天逐日快照，超出七天只保存场合并支持临近更新。
- [x] 推荐结果增加安排日期并冻结天气/场合快照。
- [x] 实现场合化重复提醒：正式 28 天、约会/晚餐 14 天、日常不提醒；提醒可忽略并提供换一件，不作硬阻断。
- **状态：** complete

### 阶段 51：周计划与穿着日记前端（TDD）
- [x] 将历史洞察主区域改为周计划、穿着日记、保存搭配、洞察二级导航，移动主导航保持五项。
- [x] 创建 7 天周视图、上/下周、今日定位、计划卡、已穿状态、空态和安排入口。
- [x] 创建 WearEvent 对话框，支持补录、编辑、撤销和删除，并覆盖键盘、移动端、加载/错误/成功状态。
- **状态：** complete

### 阶段 52：洞察口径与 V2 导出（TDD）
- [x] 将“近期未穿”与“从未穿过”分开，按 active garments 统一计算分布。
- [x] 扩展 OutfitExportV2，加入 wear events、items、legacy snapshots 与 plan entries。
- [x] 用固定跨时区 fixture 验证 JSON 往返不改变 plannedDate，归档/缺失引用仍可回看。
- **状态：** complete

### 阶段 53：文档、全量回归与真实交互验收
- [x] 同步 `docs/api.md`、`docs/schema.md`、README 与 M4 原计划勾选/状态。
- [x] 运行专项测试、`npm run typecheck`、`npm test`、Python 测试、依赖审计、`git diff --check` 与不删除现有文件的生产构建。
- [x] 使用隔离数据库完成桌面/移动端真实交互验收，逐条验证四项验收标准。
- **状态：** complete

### 阶段 54：最终复核与交付
- [x] 汇总代码、测试、文档、交互证据与残余风险，确认十二项任务和四项验收标准无遗漏。
- [x] 更新 `task_plan.md`、`findings.md`、`progress.md`，仅在全部工作真实完成后结束 goal。
- [x] 全程不删除任何未经用户明确确认的电脑文件。
- **状态：** complete

### 阶段 55：M4 独立验收基线与证据映射
- [x] 读取 M4 计划、当前源码、测试、文档与 Git 状态，不沿用旧完成声明作为通过依据。
- [x] 将十二项实施任务和四项验收标准逐条映射到实现、测试和可运行证据。
- [x] 运行 session catchup 并确认不覆盖用户或既有工作区改动。
- **状态：** complete

### 阶段 56：并行静态审查与缺口确认
- [x] 后端审查迁移、日期/时区、事务、幂等、天气冻结、提醒、洞察和导出契约。
- [x] 前端审查周计划、日记、推荐安排入口、响应式、可访问性和五项主导航约束。
- [x] 由主 Agent 交叉核验子 Agent 发现，按严重度确认真实缺口。
- **状态：** complete

### 阶段 57：动态验证与必要修复
- [x] 运行 M4 专项、类型检查、全量 Node/Python 测试、生产构建和差异检查。
- [x] 对可复现缺口先补回归测试，再实施最小完整修复并复验。
- [x] 不删除电脑文件，不原地迁移或写入真实数据库。
- **状态：** complete

### 阶段 58：最终签收
- [x] 汇总代码、测试、文档与交互证据，明确回答是否按计划完成。
- [x] 更新三份规划记录并报告修改文件、验证结果和残余风险。
- [x] 仅在所有已确认缺口关闭后完成 active goal。
- **状态：** complete

### 阶段 59：M5 上下文恢复、基线与 TDD 蓝图
- [x] 完整读取 M5 计划、三份规划记录、Git 状态、现有迁移/schema、淘宝导入、WearEvent、洞察、Saved Outfit、导出与前端契约。
- [x] 运行 session catchup 与修改前基线，识别并保留全部既有未提交改动，不原地写入真实数据库。
- [x] 将十二项实施任务和五项验收标准映射到具体文件、失败测试顺序及互不冲突的子 Agent 范围。
- **状态：** complete

### 阶段 60：价格迁移、价值与利用洞察（TDD）
- [x] 先写价格迁移失败测试：仅在 payment/quantity 明确时回填单件价格，记录 `costSource=taobao`，手工值不被重导入覆盖。
- [x] 实现并测试成本/次、已知价格最高四分位、低利用高成本、沉睡单品与最佳价值纯函数，覆盖缺价、退款、多数量和零穿着。
- [x] 在历史洞察页接入“价值与利用”区域，提供中性文案、证据展开、相关衣物查看与筛选动作。
- **状态：** complete

### 阶段 61：结构相似度、购买前检查与反馈（TDD）
- [x] 先写类别硬约束、缺字段权重归一化、75% 阈值与可解释 reasons 的表驱动失败测试；仅在本地已有 CLIP 时把 embedding 作为可重建且不导出的缓存。
- [x] 实现只读淘宝候选购买前检查，计算 possibleDuplicates、worksWith、coverageDelta 与中性 verdict；不得写入来源/衣物数据、调用云端 AI 或自动下载模型。
- [x] 先写 migration/API 失败测试，再实现服务端候选 fingerprint、幂等 similarity feedback upsert，以及 not-duplicate 配对立即隐藏。
- **状态：** complete

### 阶段 62：M5 前端闭环与契约接线
- [x] 接入 ValueInsights、PurchaseCheckPanel、重复反馈动作和购买前检查模式，覆盖加载、空、错误、键盘与移动端状态。
- [x] 接入 GET `/api/insights/value`、POST `/api/purchase-checks/taobao-candidate`、GET `/api/garments/:id/similar`、POST `/api/similarity-feedback`，继续继承 session、同源保护与结构化错误。
- [x] 扩展 OutfitExportV2，仅导出 similarity feedback；派生成本/次、排行和 embedding 均不持久化到导出。
- **状态：** complete

### 阶段 63：文档、全量验证与验收
- [x] 同步 `docs/api.md`、`docs/schema.md`、必要用户说明与 M5 原计划勾选/状态。
- [x] 运行 M5 专项、`npm run typecheck`、`npm test`、Python 测试、`npm run build`、依赖/差异检查。
- [x] 使用隔离数据库和真实浏览器逐条验证五项验收标准、桌面/移动端交互及无云端/无隐式写入边界。
- [x] 更新三份规划记录；不删除任何电脑文件，若标准构建会清理生成目录则先向用户展示目标和影响并取得明确确认。
- **状态：** complete

### 阶段 64：M5 独立验收基线与证据映射
- [x] 完整读取 M5 计划、项目约束、三份规划记录与 Git 差异，不直接采信既有完成声明。
- [x] 将 12 项实施任务与 5 条验收标准逐项映射到生产代码、自动化测试、文档和运行证据。
- [x] 将迁移/价格与价值、相似度/购买检查、前端/导出/文档拆分为互斥只读审查范围并等待子 Agent 返回。
- **状态：** complete

### 阶段 65：静态审查与独立动态验证
- [x] 审查迁移、金额显式性、退款/手工价格优先、价值统计口径、相似度归一化、指纹、反馈幂等和只读边界。
- [x] 审查前端闭环、固定 API 契约、导出排除项、鉴权/同源保护、文档一致性和桌面/移动端可用性。
- [x] 运行 M5 专项、类型检查、全量 Node/Python 测试、非破坏性构建、依赖与差异检查。
- **状态：** complete

### 阶段 66：验收缺陷修复与回归
- [x] 对确认缺口先补可复现回归测试，再实施最小完整修复；不覆盖既有工作区成果。
- [x] 对修复范围运行专项、相邻回归与全量复验，并使用隔离数据库/浏览器验证五条验收标准。
- [x] 不原地迁移或写入真实数据库；未删除任何电脑文件。
- **状态：** complete

### 阶段 67：最终签收
- [x] 汇总代码、测试、文档与交互证据，明确回答当前是否按 M5 计划完成。
- [x] 报告本轮修复、验证结果和残余风险，并更新三份规划记录。
- [x] 所有确认缺口均已关闭，验收证据完整，可以完成 active goal。
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
| M5 统一使用 migration 6 `decision-support` | 价格来源、显式性证据、相似反馈与可选 embedding 同属一个里程碑，避免并发迁移争抢版本或意外拆成 6/7 |
| 淘宝金额回填要求 payment/quantity 显式性标记 | 现有 normalizer 与采集器会把缺失数量伪装为 1，不能据此生成价格事实 |
| 购买检查只读且只消费已有本地 embedding | 满足不写业务库、不下载模型、不外发图片；embedding 是可重建缓存且不进入导出 |
| 价值洞察采用独立失败边界 | `/api/insights/value` 失败只影响价值区，不阻断既有历史、日记、计划与保存搭配刷新 |
| 购买检查复用服务端导入预览的 `sourceItemKey` | 客户端只提交原始 batch 与已解析候选键；稳定 fingerprint 始终由服务端重新计算 |

## 遇到的错误
| 错误 | 尝试次数 | 解决方案 |
|------|---------|---------|
| 本次 `/goal` 已由系统自动建立，重复 `create_goal` 被拒绝 | 1 | 读取 `get_goal` 确认现有 active goal 与用户请求完全一致并沿用 |
| 关联 WearEvent 修改实际时间后，计划仍返回旧 `wornAt` | 1 | 新增失败回归后，在同一 WearEvent 更新事务同步 `outfit_plan_entries.worn_at/updated_at` |
| DST 午夜跳转回归的首次补丁上下文引用了不存在的后续测试标题 | 1 | 读取测试真实行后，改在现有默认周测试与校验测试之间精确插入 |
| 旧兼容校验与迁移修复补丁末尾包含空文档 hunk，整批未应用 | 1 | 移除空 hunk 后重放已确认的 validation/db 修改，避免任何部分写入假设 |
| API/schema/规划记录组合补丁漏写 schema 条目前导 `- ` | 1 | 读取文档真实行后按完整 bullet 精确替换，并重放其余未应用 hunk |
| 整理 Playwright 证据时首次把 `.playwright-cli` 内 17 个既有跟踪文件也一并移动 | 1 | 立即用 `git ls-files` 精确识别并原样移回；仅本轮 13 个新证据保留在 `output/playwright/m4-accept-20260713`，跟踪状态恢复为 0 |
| 追加 M4 阶段的首次补丁因旧文件状态行带列表前缀而未匹配 | 1 | 用 `Select-String -Context` 精确定位实际格式，改用匹配 `- **状态：**` 的补丁 |
| 只读审计误查不存在的 `server/routes/index.ts` | 1 | 从 `server/index.ts` 的 `./routes` 解析规则与根目录清单定位真实 `server/routes.ts`，不重复错误路径 |
| 推荐/保存搭配安排入口组合补丁未匹配 `SavedOutfitsPanel` 实际 import | 1 | 拆分补丁：先应用已精确定位的推荐入口，再读取保存搭配真实头部单独修改 |
| 并行 typecheck 命中天气子 Agent TDD 红灯期的临时测试类型错误 | 1 | 不越界修改其独占文件；先验证本次 3 个前端文件，待天气 Agent 完成后统一 typecheck |
| 历史页二级导航使 2 条旧同屏/旧标题断言失败 | 1 | 按 M4 新 IA 更新为“穿搭历史”与四分区，并让保存搭配测试显式选择 saved 分区；98/98 回归通过 |
| 阶段 48–52 状态补丁末尾使用了错误的原始勾选上下文 | 1 | 拆分并按真实未勾选原文更新，避免整批补丁失败 |
| 兼容/UI 补丁在文件切换前包含空 hunk 标记 | 1 | 删除多余 `@@` 后原样重放；解析失败时无文件变化 |
| 联合回归旧导出 feature 断言缺 M4，且测试 worker 异常退出 | 1 | 补 `diary-week-planner`；移除新增 API 测试在监听服务器关闭前的两次 `db.close()` |
| 首次隔离 QA 启动命令超时且 API 内联脚本未监听 | 1 | 保留已启动 Vite；为正式入口增加 `OUTFIT_DATABASE_PATH`，用继承环境变量启动隔离 API |
| 浏览器进入后 WearEvent `limit=100` 被 service 拒绝 | 1 | Express query 是字符串；仅将十进制字符串转为整数后再执行原 1–100 严格边界，并补真实 API GET 测试 |
| forecast API 测试首次按文件尾部闭合位置插入未匹配 | 1 | 定位 `api.test.ts` 主 describe 的真实结束行，在 helper 区之前精确插入 |
| forecast/API 联测命中旧 schemaVersion=4 断言 | 1 | migration 5 已落地，更新里程碑版本断言为 5；不回退正确 schema |
| 读取并发核心实现时 `outfitPlanner.ts` 尚未创建 | 1 | 不重复读取中间态；先接已稳定的 WearEvent/前端组件，等待核心 Agent 明确 planner service 签名 |
| 新建 `/goal` 失败，因为已有同名 active goal | 1 | 使用当前 active goal 继续推进 |
| 浏览器注册页首次按简短 label 定位账号/密码均为 0 | 1 | 读取最新 DOM snapshot 后改用页面实际可访问名称和精确 role 定位，登录成功 |
| 周计划日期用自动化 `fill()` 后 DOM 显示新值但 React 草稿仍保留旧日期 | 2 | 为受控日期输入补 `onInput` 同步并增加 create/edit 显式模式；热更新后天气预览与落库日期均正确 |
| 浏览器限定 Locator 不提供 `inputValue()` 与 `focus()` | 2 | 不再调用未公开方法，改用 DOM snapshot 读取值、`click()` 获取焦点 |
| 原生日期选择器打开时两次保存按钮定位超时，随后热更新标签页失效 | 3 | 先用 `Escape` 关闭原生选择器；标签失效后复用既有 browser 绑定新建标签并恢复登录会话 |
| M4 最终只读复核发现可选字段清空、mark-worn 改动丢失、天气冻结和对称重复窗口四项缺口 | 1 | 分离前端/服务与 planner 窗口写入范围并行修复，补专项回归后再继续真实交互 |
| 前端热更新后隔离 API 仍是旧进程，mark-worn 拒绝新增 `outfitId` 字段 | 1 | 仅重启 8788 隔离 QA API，复用同一临时数据库；原样重试后完整实际衣物/场合/搭配落库 |
| 浏览器 `fill("")` 没有清空 textarea，计划备注快捷键首次只删掉末尾字符 | 2 | 日记改用真实键盘选择/退格并验证 null 清空；计划清空由 108 项定向/API 测试覆盖，不把自动化输入差异误判为服务回归 |
| 移动端页面截图 CDP 超时 | 1 | 不重复截图；改用只读 DOM 指标确认页面 375/375 无溢出、planner 容器 375/2344 且 overflow-x=auto |
| 重复提醒关闭按钮两次超时并触发浏览器控制会话重置 | 3 | 重新连接既有内置浏览器会话，读取最新 snapshot 后用 dialog 作用域和 force click 关闭；最终控制台为 0 warn/error |
| Node 会话重置后直接使用 `agent` 失败 | 1 | 按浏览器技能用插件绝对路径重新初始化 browser runtime，再复用标签页 3 完成最小复核和清理 |
| 最终 Vitest 首次带入 Jest 的 `--runInBand` 参数而失败 | 1 | Vitest 不支持该参数；改为项目标准 `npm test`，最终 32 文件 455/455 通过 |
| PowerShell 找不到 `pip-audit` 可执行命令且同一行后续 `pip check` 掩盖退出码 | 1 | 单独执行 `python -m pip_audit -r requirements.lock.txt`，确认 0 已知漏洞；`pip check` 也无破损依赖 |
| 全仓 `Select-String` 搜索未排除 `logs/output`，扫到本地状态文件 | 1 | 后续搜索明确限定源码/测试/文档路径，避免扫描敏感本地状态目录 |
| 本轮再次请求创建 goal 时提示已有 active goal | 1 | 读取 `get_goal` 并确认其目标正是本次前端重构，直接沿用 |
| PowerShell `foreach` 结果直接接管道导致 EmptyPipeElement | 4 | 后续所有此类命令统一先赋给 `$rows` 再执行 `Format-Table`，不再使用直接管道形式 |
| 浏览器基线标签页在截图前已失效 | 2 | 按浏览器技能要求保留 browser 绑定并新建标签页，重新导航后截图成功 |
| M5 UI 统一 typecheck 同时命中 PurchaseCheck 场合标签类型与 DB Agent 的显式性 TDD 红灯 | 1 | 主线改用包含 date/dinner 的 `PLANNER_OCCASION_LABELS`；不越界修复 Agent 的预期红灯，等待其实现转绿后统一复验 |
| 主应用安全测试首次注册账号使用连字符，先触发用户名格式 400 | 1 | 改用符合现有认证契约的 `decisionowner`，随后稳定复现决策支持路由未注册的 404 红灯并完成注册 |
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
| 本轮首次向 `findings.md`/`progress.md` 追加恢复记录时使用了并不存在于 findings 尾部的共同上下文 | 1 | 补丁整体未应用；读取三个文件的精确尾部后，改用各自真实上下文分别追加 |
| M5 浏览器标签在热更新期间反复失效，且误调用了未公开的 `domcontentloaded()`/`isDisabled()` | 2 | 保留 browser runtime，新建同会话标签并只使用已验证的 `goto()`、语义 locator 与 DOM snapshot；反馈验收最终通过 |
| M5 QA 候选首次经 PowerShell 默认编码发送后中文变为问号 | 1 | 在任何业务写入前中止，改用显式 UTF-8 byte 数组发送；隔离数据与页面中文均正确 |
| 最终 npm 审计首次走本机 `npmmirror`，其安全审计端点不受支持 | 1 | 显式切换 npm 官方审计端点重跑，生产依赖为 0 漏洞 |
| 无参数 `pip-audit` 扫描整套 Anaconda 宿主环境并报告无关全局包 | 1 | 按项目锁定依赖 `requirements.lock.txt` 重跑，结果为 0 已知漏洞；同时保留宿主环境报告，不把它误计为项目依赖 |
| 本轮首次组合读取跨层差异时误把 PowerShell 数组语法写入 JavaScript 编排脚本 | 1 | 不重复该脚本；改为 JavaScript 文件数组逐个调用 PowerShell/Git，并继续保持 UTF-8 输出 |
| 购买检查已有结果时，显式反馈失败只更新状态但页面不显示错误 | 1 | 新增保留旧结果同时显示反馈错误的 UI 回归；确认红灯后在结果区域加入 `role=alert` 的错误 Notice |
| Selenium 产出的英文 `Refund successful` 未被 TypeScript 导入层识别 | 1 | 增加采集器英文退款状态回归，并让导入退款模式与采集器支持的中英文状态对齐 |
| Selenium 金额提取在“单价 ¥100 ×2、实付款 ¥200”中先取单价 | 1 | 先匹配带明确总额/实付标签的金额；仅在恰有一个无标签货币金额时使用保守回退 |
| 74.96% 相似度先舍入为 75.0% 后被误判为达到阈值 | 1 | 保持公开展示分数一位小数，但列表筛选改用未舍入内部得分，并补真实 embedding 边界回归 |
| 同一淘宝 itemId+SKU 在详情字段补全后候选指纹变化，导致 not-duplicate 隐藏失效 | 1 | 候选 v1 指纹改为只哈希规范商品身份与 SKU；结构字段继续只参与相似度，不参与稳定身份 |
| Selenium 把型号 `X100`/商品名 `X2` 当数量、千分位金额截断、重复快照丢完整证据、同单多商品合并 | 1 | 收紧数量证据、支持千分位、显式总额优先且多件无标签金额不采信；重复快照补全缺字段；多商品逐件保留但不猜共享 SKU/数量/金额 |
| 价格编辑路径调查误查不存在的 `src/features/wardrobe/GarmentCard.tsx` | 1 | 保留已返回的服务端证据；改用 PowerShell 列出 wardrobe 真实文件，再读取实际卡片组件，不重复错误路径 |
| 价值旧数据错误态测试首次补丁使用了不准确的测试标题上下文 | 1 | 用 PowerShell 精确定位现有 ValueInsights 测试标题和闭合位置后定点插入，不重复错误 hunk |
| 价值旧数据回归第二次插入仍误用了不存在的末尾断言 | 1 | 读取 97–144 行真实内容后，以 `<details` 断言和下一测试标题为精确锚点插入；随后确认红灯并转绿 |
| 更新规划文件时组合补丁包含空 `findings.md` hunk，整批未应用 | 1 | 移除空 hunk 后只提交有实际上下文的规划补丁，避免部分应用假设 |
| 购买检查聚焦回归并发运行时 Vitest worker 异常退出，未出现断言失败 | 1 | 保留该次为不通过证据，改用 `--maxWorkers=1` 分三组重跑；6 文件 233/233 全部通过 |
| 隔离 QA 首次登录被严格 Origin 校验返回 403 | 1 | 真实浏览器定位到 Vite 字符串代理隐式启用 `changeOrigin`；改为对象代理并显式 `changeOrigin: false`，新增代理配置回归后正常登录 |
| Playwright 直接填充 JSON 与一次资源查询表达式被 Windows 参数解析去掉引号 | 2 | JSON 改用页面端 Base64 解码和原生 setter；资源查询改用不含字符串字面量的表达式，最终只观察到本地 `127.0.0.1:5176` |
| 最终并行验证误调用不存在的旧视觉脚本路径，使同批构建/pytest 编排提前结束 | 1 | 确认未生成构建目录且无残留验证进程；改用仓库真实 `pytest` 入口并单独重跑构建，分别 38/38 与成功 |
| M6 浏览器 QA 端口预检把 PowerShell `foreach` 直接接入管道，触发空管道元素解析错误 | 1 | 服务启动前即中止；改为先收集数组再格式化，确认 8788/5174 空闲 |
| M6 QA 注册用 Windows PowerShell `Invoke-WebRequest` 在服务端成功 201 后抛 NullReferenceException | 1 | session 与账号实际已创建，9 个后续鉴权写请求和浏览器登录均成功；按本机 IWR 客户端异常记录，不改产品 |
| Playwright `check` 在受控锁定复选框异步重渲染后报告“状态未改变”，但快照显示 checked 且重算 API 200 | 1 | 以新快照、网络请求和持久化结果为准；后续逐套确认使用 click 并逐次获得成功响应 |
| M6 最终全量 Vitest 1/562 失败：M4 迁移测试精确数组仍止于版本 6 | 1 | 生产 migration 7 正确；历史测试追加 `trip-capsule-planner` 后重跑完整门禁 |

## 备注
- 优先使用 PowerShell 原生命令，不先使用 `rg`。
- PowerShell 命令显式设置 UTF-8。
- 删除电脑上的文件前必须确保用户知晓。
- 当前协作环境最多同时运行 4 个 Agent（含主 Agent）；本轮曾并行开启 3 个写入范围互斥的修复子 Agent，均已返回并由主 Agent 复核。

## 会话：2026-07-15（Outfit M6 Trip Capsule）

### 阶段 68：上下文恢复、M6 计划映射与基线
- **状态：** complete
- [x] 确认并沿用与本次请求完全一致的 active goal。
- [x] 完整读取文件规划技能，并恢复既有 `task_plan.md`、`findings.md`、`progress.md` 与 session catchup 状态。
- [x] 完整读取 M6 Trip Capsule 计划、项目约束、Git 工作树与现有实现，建立任务—文件—测试映射。
- [x] 运行修改前基线并划定可并行且互不冲突的 TDD 范围。
- **删除约束：** 本轮尚未删除任何文件；如计划执行需要删除电脑文件，将先明确告知用户。

### 阶段 69：Trip 数据模型、CRUD、天气与严格校验（TDD）
- **状态：** complete
- [x] 先写 migration、日期/活动/约束、Trip CRUD、Day/Activity 编辑和状态转换失败测试。
- [x] 新增 `trips`、`trip_days`、`trip_day_activities`、`trip_outfit_selections`、`trip_packing_items`，拒绝反向日期、超过 7 天、负上限及未知字段。
- [x] 实现最多 7 天天气快照；只有用户明确启用天气时才发送坐标，取消/保存均不改变全局衣物可用状态。
- **当前记录：** 主线固定 Trip 客户端契约先红于 `getTrips is not a function`，实现 13 个固定路径后 `frontendApi` 25/25 转绿；统一 typecheck 暂被优化器 Agent 的预期红灯测试阻断，未越界修改其文件。

### 阶段 70：推荐复用与胶囊优化器（TDD）
- **状态：** complete
- [x] 将既有推荐引擎暴露为受 M0 预算约束的 `generateCandidates(context, constraints, budget)`，不复制搭配规则。
- [x] 以纯函数测试覆盖天气/场合硬阈值、maxShoes、maxGarments、三种 repeatPolicy、洗衣前核心穿着次数、洗衣日重置、同日共用/独立搭配及不可行结果。
- [x] 实现 beam width=100 的硬剪枝搜索、目标函数和解释输出；输出覆盖日期/活动、选择原因、冲突约束与最小放宽建议。
- [x] 确保锁定/替换某日单品后只局部重算后续日，且规划前后 garment availability 完全不变。

### 阶段 71：旅行 API、装箱状态、实际穿着与导出（TDD）
- **状态：** complete
- [x] 创建 `server/routes/trips.ts` 并接入 session、Origin/Sec-Fetch-Site、严格输入与结构化错误边界。
- [x] 持久化“已打包/穿在身上/不带”和自由文本非衣物 checklist，不扩张 GarmentCategory。
- [x] 旅行完成后提供逐日确认的 wear events 批量写入，重用 M4/M3 服务且绝不自动假设计划已执行。
- [x] 扩展 OutfitExportV2 纳入 trips、activities、selections、packing states；图片二进制仍只进入显式 ZIP。
- **当前记录：** M6 feature/五数组验证先红于缺失字段未报错；增加严格 shape/必填数组和旧 V2 兼容后定向 export 测试转绿，待 migration 7 落地后接入单事务稳定查询。
- **集成记录：** Trip 认证路由、装箱四态、自由文本必需品、完成行程的幂等 wear event 外层事务均已通过；联合回归仅剩 builder 未填五个 Trip 数组导致 2 项导出 API 失败，现由主线补齐。
- **完成证据：** builder 已在同一读事务中稳定导出 active/archived Trip 关系记录，只用 garment IDs 表示 selection；导出/API 87/87、M6 跨层专项 281/281、typecheck 全绿。

### 阶段 72：旅行规划与装箱前端（TDD）
- **状态：** complete
- [x] 创建 `TripPlannerView.tsx`、`PackingChecklist.tsx` 及必要样式/客户端契约。
- [x] 在“计划与洞察”二级区域新增旅行入口，不增加第六个主导航项。
- [x] 覆盖创建/编辑、活动共用或独立、生成结果、无解解释、锁定/替换、逐日确认、装箱状态及桌面/移动端/键盘/错误状态。
- **当前记录：** History 二级入口先红于缺少“旅行计划”，新增 `trips` section 与受控 `tripContent` 后定向 App 测试转绿；五项主导航未修改。
- **完成证据：** 组件专项 5/5、新旧 Planner 联合 16/16、主线跨层前端组 110/110；390px 单列和不低于 44px 交互目标已有回归覆盖。

### 阶段 73：文档、全量验证与最终验收
- **状态：** complete
- [x] 同步 README、`docs/api.md`、`docs/schema.md` 与 M6 原计划状态/勾选。
- [x] 运行专项测试、`npm run typecheck`、`npm test`、Python 测试、非破坏性 `npm run build`、审计与 `git diff --check`。
- [x] 使用隔离数据库和真实浏览器逐条核验 6 条验收标准、桌面/移动端、控制台与隐私边界。
- [x] 更新三份规划记录；全部条目均已有直接证据，可完成 active goal。
