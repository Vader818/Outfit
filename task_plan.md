# 任务计划：Outfit M1–M6 连续交付与 M6 独立验收

## 目标
以 `docs/2026-07-10-outfit-m6-trip-capsule-plan.md` 为本轮 M6 验收基线，独立核对当前未提交实现、测试、文档与真实交互证据；修复所有可复现缺口并完成全量验证，同时保留既有 M1–M5 成果与用户工作区改动。

## 当前阶段
阶段 80：后端、数据与安全边界深审（进行中）

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

## 会话：2026-07-16（全项目独立深度审查与修复）

### 阶段 78：全项目独立审计恢复与基线
- **状态：** complete
- [x] 沿用系统已建立、与用户本次请求完全一致的 active goal，不覆盖或另建目标。
- [x] 完整读取 `planning-with-files-zh` 与 `code-review` 技能，恢复三份规划记录并运行 session catchup。
- [x] 确认仓库仅有 25 个既有 Playwright 证据文件未跟踪，跟踪源码当前无未提交差异；全部按用户资产保留。
- [x] 盘点技术栈、源码/测试/文档规模、入口、构建与运行命令、最近提交和基线风险。
- [x] 检查所有项目级约束并建立“模块—核心不变量—测试—审计方法”矩阵。
- **删除约束：** 本轮不删除任何电脑文件；如后续确有必要，必须先明确告知用户并取得知情后再执行。

### 阶段 79：动态质量门禁与外部交叉审查
- **状态：** complete
- [x] 运行类型检查、lint、全量 Node/Python 测试、生产构建、依赖/供应链审计与 `git diff --check`，保存完整基线。
- [x] 使用代码审查技能检查可用 provider；OpenAI provider 因 WindowsApps `WinError 5` 不可启动，其余 CLI 不存在，已记录并停止重复尝试。
- [x] 检查测试发现、跳过测试、未处理异步错误、资源泄漏、随机性、时区和并发稳定性；修复采集状态顺序依赖、产物锁竞态及全仓 SQLite 测试资源泄漏。

### 阶段 80：后端、数据与安全边界深审
- **状态：** complete
- [x] 审查认证/会话/同源、输入校验、路由—服务契约、事务/幂等、迁移/外键/索引、软归档与数据完整性。
- [x] 审查导入、图片、ZIP/JSON 导出、文件路径、网络访问、隐私边界和错误信息泄露。
- [x] 审查推荐、保存搭配、反馈、可用状态、日记/计划、价值洞察和旅行优化器的业务不变量及极端输入。
- **阶段关口：** 本阶段全部修复后标准 `npm test` 为 47/47 文件、609/609 测试通过；`npm run typecheck` 与 `git diff --check` 通过。

### 阶段 81：前端、状态一致性与可用性深审
- **状态：** complete
- [x] 审查 App 全局状态、请求竞态、错误恢复、缓存/迟到响应、跨实体编辑、只读状态和前后端 DTO 一致性。
  - [x] 已确认“历史刷新慢响应覆盖新周”的真实竞态：新周数据先显示，随后被旧周结果静默清空。
  - [x] 为历史公共数据和周计划数据增加独立最新请求门；自动回归 83/83、类型检查与同一真实浏览器场景均通过。
  - [x] 已确认并发保存两张推荐卡会由晚响应切换 OutfitBuilder 实体并丢失先打开表单的未保存输入。
  - [x] 串行化推荐卡保存/安排/实穿异步动作，所有卡片共享 busy；相邻前端 106/106、类型检查、差异检查与同一真实浏览器场景均通过。
  - [x] 已确认设置输入变化后，在途旧推荐仍会复活：新坐标状态下同屏出现“天气尚未获取”和旧坐标推荐。
  - [x] 为天气/推荐请求增加共享输入版本，并让坐标、场合、画像和约束变化主动失效旧响应；3 秒真实场景不再复活旧推荐。
  - [x] 已确认迟到定位回调会覆盖定位期间更晚的手工坐标输入。
  - [x] 为定位增加请求 token，手工坐标变化使旧回调失效且不能误清其他 busy；2 秒真实场景保留手工输入。
  - [x] 已确认后台衣物数组更新会重新初始化已打开的 OutfitBuilder，并清空同一编辑目标的未保存草稿。
  - [x] 将完整草稿初始化限制为对话框新打开或编辑目标 ID 变化；同目标衣物刷新只更新派生可用信息，9 秒真实场景保留草稿。
  - [x] 已确认衣物设为“排除推荐”后当前推荐不会失效：返回今日推荐仍显示含该衣物的旧卡片。
  - [x] 统一衣物事实变更的推荐失效入口，阻止当前缓存及在途旧响应复活，并完成自动与真实浏览器回归。
- [x] 审查组件可访问性、键盘/触控、响应式、长文本、空/错/加载态、危险操作确认及隐私披露。
  - [x] 已修复桌面推荐分栏中空态正文被长按钮挤成竖列；1440px/390px 真实布局测量、截图和控制台复验全绿。
  - [x] 已确认迟到衣橱刷新会覆盖更晚且已保存的单件编辑；真实浏览器中权威 `excluded=true` 被旧 GET 静默显示为 false。
  - [x] 为 active/archived 衣橱刷新增加最新请求门，并让所有衣橱写操作主动失效旧读取，完成自动与真实浏览器回归。
  - [x] 已确认启动阶段迟到的价值洞察会覆盖更晚手动刷新结果，并可能错误收尾 loading/error。
  - [x] 为价值洞察增加独立最新请求门，统一当前 token 的结果、错误和 busy 收尾，完成自动与真实浏览器回归。
  - [x] 已确认保存画像响应会覆盖保存期间的新输入，并让界面在当前坐标尚未持久化时仍显示保存成功。
  - [x] 仅在 `save-settings` 期间锁定位置/画像快照字段，以同步 ref 拒绝重入和重渲染前输入；App 87/87、类型/差异与真实浏览器回归全绿。
  - [x] 已确认批量确认/更新在首个失败后提前收尾，其他请求可继续成功落库并让 UI 与权威状态分叉。
  - [x] 让批量衣物变更等待全部请求 settle、刷新权威状态并只保留失败项；目标 90/90、相邻 20/20、类型/差异与真实浏览器回归全绿。
  - [x] 已确认保存搭配旧刷新会覆盖更晚收藏更新，最终 UI 与权威 `favorite` 状态分叉。
  - [x] 为保存搭配 active/archived 刷新增最新请求门，并让成功 upsert 统一失效旧读取；App 89/89、相邻 13/13、类型/差异与真实浏览器回归全绿。
  - [x] 已确认较早的视觉模型状态刷新会覆盖较新结果，甚至可用状态会退回未下载。
  - [x] 为模型状态加载增加独立最新请求门，保护成功与错误提交；App 90/90、类型/差异与真实浏览器回归全绿。
  - [x] 已确认启动阶段迟到的个人画像 GET 会覆盖用户更晚输入，并可能越过后续保存。
  - [x] 为画像读取增加最新请求门，用户编辑和保存开始统一失效旧读取；App 91/91、类型/差异与真实浏览器回归全绿。
  - [x] 已确认 availability 完整旧响应会覆盖同一衣物更晚的通用编辑；真实浏览器中权威 `excluded=true` 被静默显示为 false。
  - [x] 同一衣物所有写入口共享串行队列与版本提交；已横向覆盖缩略图、抠图、图片上传、归档/恢复及批量入口，自动与真实浏览器回归全绿。
  - [x] 已确认旧导入预览会在原始 JSON 改变后复活，并让与当前输入不一致的旧候选进入可提交状态。
  - [x] 为导入预览增加输入版本控制，并在不可取消的正式提交期间锁定原始 JSON 与其他导入动作；自动、类型、差异与真实浏览器回归全绿。
  - [x] 已确认跨衣物视觉任务会覆盖单例 busy ID/动作；先完成任务会提前解锁另一条仍 pending 的视觉请求。
  - [x] 将视觉任务 busy 状态改为按衣物 ID 与动作类型跟踪，移出全局页面 busy；自动、类型、差异与真实浏览器回归全绿。
  - [x] 已确认跨衣物 availability 请求只能标记一个 busy ID，第二件开始会提前解锁仍 pending 的第一件。
  - [x] 将 availability busy 改为按衣物 ID 集合跟踪；自动、类型、差异与真实浏览器回归全绿。
  - [x] 已确认全局 BusyAction 入口可重叠，较早任务收尾会提前清空仍 pending 的后续任务。
  - [x] 断点恢复已核对实际工作树、三份规划记录与运行状态：既有修复均在磁盘，隔离 QA 服务仍监听 5174/8788，未执行删除、重置或覆盖。
  - [x] 为全局 BusyAction 增加同步互斥与动作匹配收尾，并让相关页面控件统一尊重全局 busy；目标回归 102/102、相邻前端 129/129、类型检查与差异检查均通过。
  - [x] 使用隔离数据库完成全局 BusyAction 的真实浏览器绿色复验：刷新 pending 时导出请求为 0，导出 pending 时刷新请求为 0；两阶段四个操作均统一禁用并在匹配收尾后恢复，控制台清洁。
  - [x] 修复 History 页头 busy 布局跳变：1037px 下 idle/refresh/export 标题行数由 2/2/1 稳定为 1/1/1，PageIntro 高度统一 79.99px；App 102/102、真实浏览器量化与控制台全绿。
  - [x] 修复缩略图 picker 保存会话 ABA：成功关闭和失败报错均要求原 picker token；App 103/103，真实浏览器中旧保存后新“详情图”会话仍在、控制台清洁且数据库零写入。
- [x] 使用隔离数据库和真实浏览器复验高风险主流程，并记录控制台、网络来源与布局证据。

### 阶段 82：确认缺陷的 TDD 修复与相邻回归
- **状态：** complete
- [x] 每个候选问题先建立静态证据或最小可复现失败测试，排除误报后再修改产品代码。
- [x] 采用最小、完整、向后兼容修复；同步共享类型、测试、API/schema/README 等受影响文档。
- [x] 每批修复运行目标测试、相邻回归、类型检查和差异检查，持续更新 findings/progress。
- **已提前完成的修复批次：**
  - 远程缩略图截断/像素炸弹缺陷已按先红后绿修复；新下载统一为净化 WebP，旧本地缩略图保持可读，专项与相邻 API 验证全绿。
  - Open-Meteo 超时已覆盖响应正文读取与 JSON 解析，流式挂起回归、weather 专项和类型检查全绿。
  - 本地视觉去背景输出已改为每次唯一版本化路径，并在写入数据库前验证普通文件、完整单页 PNG、像素上限和可解码性；损坏输出不再持久化 URL，5 个 API 回归、类型检查与差异检查全绿。
  - 本机唯一账号创建已在密码派生后进入 `BEGIN IMMEDIATE`，并在写锁内二次检查账号数；可控陈旧读取竞态不再创建第二个账号，认证专项、注册 API 与类型检查全绿。
  - API 正式入口已接入幂等 SIGINT/SIGTERM 关闭：停止 HTTP、清理采集/视觉子进程、超时强制断开连接并关闭 SQLite；生命周期与视觉任务回归全绿。
  - 默认 rembg/CLIP 请求进程已增加 120 秒超时与 stdout/stderr 合计 1 MiB 上限；超限会终止进程树并返回稳定错误码，4 个相邻 API 回归与类型检查全绿。
  - 登录失败限流状态已增加全表过期清扫与 1024 项容量上限，保留原 5 次/15 分钟语义；专项、原 API 回归与类型检查全绿。
  - 淘宝采集产物扫描已改用 `lstat`：拒绝符号链接/junction 根目录并跳过链接子项，避免把根外 JSON 当作采集结果；专项、相邻 API、类型与差异检查全绿。
  - 旅行完成记录与通用穿着日记已补齐双向一致性：日记编辑不能把绑定衣物改成旅行方案外衣物；删除会解除 selection 并把 completed 旅行恢复为 ready，可重新确认。旅行/日记联合回归 32/32、类型与差异检查全绿。
  - 结构相似度已把分类器的 `color=unknown` 按缺失证据处理，不再把两个未知颜色误计为颜色完全一致并推到 75% 重复阈值；相似度/购买检查相邻回归 16/16、类型与差异检查全绿。
  - 推荐天气请求已改为严格数字与真实日历日期校验，不再把 `null`、布尔值、空串或数字字符串隐式转换为天气数值，也不接受不存在的日期；推荐相关回归 59 项通过、类型与差异检查全绿。
  - 单日与逐日天气缓存读取已统一执行严格快照校验，并始终拒绝无效或未来的 `fetched_at`；损坏 `{}`、不存在日期、错误时间戳和负缓存年龄不再作为当前或过期缓存复活。新增 5 条 API 回归、weather 13/13 与类型检查全绿。
  - 衣物资产读写已拒绝资产根本身为符号链接/junction，避免内容读取、完整备份或新上传穿过配置根落到外部目录；真实文件系统回归先红后绿，资产 14/14、相邻导出 4/4、类型检查全绿。
  - ZIP 导出在流开始前失败时会移除预设的 ZIP Content-Type、Content-Length 与下载文件名，再返回 JSON 错误；损坏数据库不再让浏览器把错误 JSON 保存成 `.zip`。导出 API 相邻回归 3/3、类型与差异检查全绿。
  - 淘宝同一来源项的重复证据现按完整规范化内容稳定排序后合并，不再由 items/DOM 先后决定数量、付款、状态与最终 batchId；归一化 48/48、数据库导入 27/27、类型检查全绿。
  - 购买检查的搭配兼容评分已把空颜色和分类器占位值 `unknown` 视为无证据，不再按中性色奖励 `+2/+4` 并把负证据搭配误判为兼容；购买检查 6/6、决策支持 API 3/3、类型检查全绿。
  - 推荐反馈请求校验已允许 `comment:""` 作为单独的更新/清空标记，再由服务层与既有信号合并；不再违背公开 API 的显式清空契约，且全新空反馈仍被拒绝。反馈专项 15/15、严格校验 API 1/1、类型检查全绿。
  - 衣物可用状态的幂等判断已移入 `BEGIN IMMEDIATE` 写锁内，避免事务外陈旧读取返回 `changed:false` 但数据库已被另一写入改成其他状态；反馈/可用状态专项 15/15、类型与差异检查全绿。
  - OutfitExportV2 已补回推荐反馈的权威 `wearEventId`，并让链接本身决定 `actuallyWorn=true`；导出校验同时拒绝非正整数链接，旧 V2 缺省字段仍兼容。导出 22/22、相邻 API 3/3、类型检查全绿。
  - Garment 持久化数组字段已从“仅解析 JSON”收紧为严格字符串数组，视觉标签缓存也执行完整 shape 校验；合法 JSON 对象、数字数组、字符串、null、布尔数组或空视觉对象不再突破 DTO，后续编辑会规范化数组为 `[]`。相邻 32/32 与前批 42/42、类型和差异检查全绿。
  - 推荐反馈读取已严格校验持久化原因枚举与唯一性，不再把任意字符串或重复原因断言为 `FeedbackReason[]`；反馈 18/18、导出 22/22、类型检查全绿。
  - 历史刷新与周导航现共享周计划最新请求 gate，旧周慢响应不能覆盖已显示的新周；公共历史读取单独控制，显式周加载 busy 另行按版本收尾。自动回归 83/83、类型检查与真实 Chrome 慢/快响应复验全绿。
  - 推荐卡会打开或改变单一工作区的保存、安排、实穿动作已统一串行化，并把交互 busy 传播到所有候选卡与上下文入口；双保存晚响应不再切换编辑实体或覆盖未保存输入。相邻前端 106/106、类型检查、差异检查及真实 Chrome 3 秒/5.5 秒竞态复验全绿。
  - 推荐/天气现共享可显式失效的输入 gate，定位使用独立 gate；坐标、场合、画像和约束变化会取消旧提交，设置异步按钮也不再与其他全局动作重叠。相邻前端 108/108、类型检查、差异检查以及真实 Chrome 推荐/定位两条慢响应复验全绿。
  - OutfitBuilder 现按“关闭/新建/saved ID”识别编辑会话，不再因同一目标的衣物数组更新重建全部草稿；不可用项仍独立刷新。相邻 96/96、类型检查、差异检查与真实 Chrome 9 秒后台响应复验全绿。
  - 衣橱事实与展示资产变更现统一使推荐 token/结果/反馈失效；导入清空全部约束，资格或类别变化只移除受影响衣物 ID。App 84/84、类型与差异检查、真实 Chrome 当前结果及 1.8 秒迟到响应双场景全绿。
  - 推荐空态在分栏内改为图标+正文两列、操作下置，窄屏显式单列；App 85/85、类型/差异检查及 1440px/390px 真实布局测量全绿。
  - 衣橱 active/archived 刷新现共享最新请求 token，所有衣橱写入口都会失效旧读取；App 85/85、类型/差异检查与真实 Chrome“旧 GET 晚于新 PUT”复验全绿。
  - 价值洞察现由独立最新请求 gate 管理结果、错误和 loading；App 86/86、类型/差异检查与真实 Chrome“启动旧响应晚于手动刷新”复验全绿。
  - 同一衣物的通用编辑、归档/恢复、批量、availability 与视觉/图片写入现共享 keyed serial queue，并由 per-ID 版本决定完整 DTO 是否可提交；App + 队列 94/94、相邻前端 45/45、类型/差异检查及真实 Chrome 跨接口乱序复验全绿。
  - 导入预览现由独立输入版本 gate 管理，编辑 JSON、读取新产物和正式提交会失效旧响应；正式提交锁定全部快照相关控件。相邻 UI 108/108、类型/差异检查及真实 Chrome 旧预览释放复验全绿。
  - 衣物视觉 busy 现按 garment ID 与动作独立跟踪，旧任务收尾不能清除其他衣物任务，也不再借用全局页面 busy。App 96/96、相邻前端 166/166、类型/差异检查及真实 Chrome 双任务释放复验全绿。
  - availability busy 现按 garment ID 集合跟踪，多个并行请求均保持自己的禁用与 `aria-busy`；App 98/98、相邻前端 168/168、类型/差异检查及真实 Chrome 双请求复验全绿。

  - 推荐反馈在创建实际穿着事实前会拒绝损坏的 recommendation run `input_json`，不再静默伪装为 casual；合法 `{}`/无效业务字段容错保持兼容。目标 18/18、相邻 73/73、全仓 641/641、类型与差异检查全绿。

  - 视觉标签推理结果现按 runtime schema 验证对象、分类、字符串数组与 scores，CLI 坏 JSON 和错误结构统一为 `VISION_TAG_OUTPUT_INVALID`，不再持久化垃圾标签或抛裸 TypeError。目标 6/6、相邻 90/90、全仓 643/643、类型与差异检查全绿。

  - 生产与开发依赖实时 audit 从 12 项生产漏洞 + 1 项 dev high 降到双 0：升级 archiver 8、sharp 0.35.3，并 override body-parser 2.3.0、tar 7.5.22、protobufjs 7.6.5、postcss 8.5.23；Archiver 8 改用 ZipArchive ESM 类。相邻 127/127、全仓 643/643、Sharp smoke、模型状态、生产构建、类型与差异检查全绿。

  - Python/辅助脚本门禁已补齐：3 个测试文件共 38/38 通过；`models:verify` 对现有 rembg u2netp 与 CLIP 执行真实推理并通过。测试/验证只创建并清理已提前告知的系统临时目录，未删除项目文件或证据。

  - 模型管理链已修复三项确认缺陷：Web/API download/verify job 采用独立 30 分钟超时、单次结算和进程树终止；模型文件按普通文件/必要非空语义判定并通过同目录 `.part` 原子提交；可信模型根以 lstat/realpath 拒绝 root/子目录 junction 穿透。目标 6/6、单 worker 相邻 117/117、全仓 649/649、类型、真实 models status/verify 与差异检查全绿。

  - 淘宝采集 job 增加独立两小时默认超时与单次结算：无产物挂起会 failed/kill/释放锁，有完整 JSON 则保留 succeeded artifact；取消、clear 与迟到 exit 均不会泄漏 timer 或覆盖结果。目标 2/2、相邻 139/139、类型与差异检查全绿。

  - Windows/Node 24 下 Vitest 默认 forks 两次出现 worker 意外退出；项目现显式使用 threads/4。单 worker 651/651、参数化 threads/4 连续两次 651/651，配置后裸 `npm test` 连续两次 651/651，类型与差异检查全绿。

  - 模型 CLI 的 GitHub/Hugging Face 请求现有统一 30 分钟单请求截止器，覆盖连接和 JSON/arrayBuffer 正文；即使自定义 fetch 忽略 abort 也会稳定拒绝。目标 2/2、模型脚本 13/13、全仓 653/653、真实 models status/verify、类型与差异检查全绿。

  - CLIP 下载现严格校验 Hugging Face metadata schema，并在返回成功前复用可信根 `clipModelReady`；缺项 metadata 不再让 Web job 误报模型准备好。目标 2/2、模型脚本 15/15、全仓 655/655、真实 models status/verify、类型与差异检查全绿。

  - CLIP 可信根内的多级目录创建现逐级先校验普通目录/realpath，再以非递归 mkdir 创建单层；intermediate junction 不再先在根外创建目录后才失败。目标 1/1、模型脚本/文件 16/16、真实 models status/verify、类型与差异检查全绿。

### 阶段 83：全量复验、残余风险与最终签收
- **状态：** complete
- [x] 重跑全部质量门禁、依赖审计、非破坏性生产构建与真实浏览器验收。
- [x] 复核 Git 差异，区分本轮修改、既有证据文件和未解决但非缺陷的残余风险。
- [x] 只有在所有可确认错误均已修复并有直接验证证据后，更新三份规划记录并完成 active goal。
- **最终门禁：** Node 51 文件 656/656（threads/1 及默认 threads/4 连续复验）、Python 38/38、lint/typecheck、双 audit 0、真实 models status/verify、Vite production build、`git diff --check` 全绿。
- **真实浏览器：** 新隔离数据库完成注册、五项导航、主要空态/禁用语义、模型状态、1280×720 与 390×844 布局；两种视口无横向溢出，远程 HTTP 图片 0，控制台 error/warn 0。
- **Git 边界：** 22 个预期跟踪修改；67 个未跟踪项精确为 65 个既有 Playwright 证据及独占锁源码/测试。dist 与 final-audit 证据均按既有规则忽略，未提交或暂存。
- **残余说明：** 首次阶段 83 裸测试曾无诊断 exit 1，但随后单 worker 656/656、默认 threads/4 连续两次 656/656；外部 code-review CLI 不可用已在阶段 79 记录，不构成当前代码缺陷。既有 LF→CRLF 提示不影响 diff check。
- **删除记录：** 除提前明确告知并由工具自动重建的忽略目录 `dist`、以及 models/pytest 自身系统临时目录清理外，未删除任何项目、数据、模型或证据文件。

### 2026-07-26 暂停恢复检查点
- 用户要求立即暂停；不再运行审查、测试或构建。active goal 保持未完成，阶段 81 仍为 `in_progress`，阶段 82/83 不提前标记完成。
- 最近已收口三项工作：损坏 recommendation run JSON 拒绝写入权威穿着记录；视觉推理输出严格 runtime schema 校验；生产/开发依赖漏洞降至双 0，并完成 Archiver 8 ESM 迁移。
- 最新联合门禁：全仓 51 文件 643/643、目标/相邻测试 18/18、73/73、6/6、90/90、127/127，TypeScript、`git diff --check`、Sharp 内存 smoke、`models:status`、Vite production build 均通过；full/prod audit 均为 0 漏洞。
- 当前 Git 边界：16 个跟踪文件有预期差异，另有既有 Playwright 证据及 `src/lib/exclusiveAction.ts`、`tests/exclusiveAction.test.ts` 未跟踪；未提交、未回退、未清理或删除任何文件。
- 尚未完成：Python/辅助脚本质量门禁、下一批服务端或脚本层缺陷审查，以及阶段 83 最终全量签收。
- 下次恢复第一步：读取三份规划文件和 active goal，核对 Git/5174/8788；然后只读枚举 `tests/*.py` 并检查 `python -m pytest --version`，优先运行 `tests/test_vision_rembg.py`。执行 `models:verify` 前先审查脚本副作用；不得运行会删除文件的 `privacy:clean`。

### 本轮新增错误
| 错误 | 尝试次数 | 解决方案 |
|------|---------:|---------|
| 采集 job 超时首轮实现把 Node Timeout 句柄留在 InternalCaptureJob，`publicJob` 未剥离它，Express JSON 序列化循环结构后返回 500 | 1 | 将 timeout 与 child/logFd 一并视为私有字段剥离，并在目标测试显式断言启动响应 200；再验证真正 timeout/kill/锁释放路径 |
| 默认 forks worker 先在模型链接 7 文件相邻中意外退出，后在采集超时后的全仓运行再次退出；第二次 50/51 文件、570/651，恰缺完整 API 文件 81 项 | 2 | 不再重复默认命令；先用单 worker threads 全仓证明断言，再检查 Vitest 配置、API 资源收敛与 Windows fork 并发，修复默认 `npm test` 稳定性后才收口 |
| 模型文件首轮相邻回归把 CLIP 的 `merges.txt` 也强制为非空，导致 5 个既有合法空 merges 夹具失败；并行类型/状态输出因 Promise 首项失败未回传 | 1 | 保留 JSON/ONNX/rembg 非空约束，仅允许 `merges.txt` 为空但必须是普通文件；修复后独立重跑相邻、类型与状态，不采用未回传结果 |
| 模型文件红灯组合命令的 `-t "empty model files|partial temporary"` 未匹配中间含 `local vision` 的 API 测试名，导致该文件整组跳过 | 1 | 脚本两项红灯已有效；API 改用完整唯一片段 `does not report empty local vision model files` 单独运行，不重复原过滤器 |
| 恢复时把阶段 78—83、findings/progress 尾部、Git 状态组合到一次输出，443 行结果超过回传上限并被截断 | 1 | 关键的阶段 81—83、暂停断点、最新门禁和 Git 汇总均已返回；后续按单一文件/小区块读取，不再组合回传大段历史记录 |
| 前端异步总表与组件 busy 宽扫并行返回 608 行、超过输出上限，局部组件结果被截断 | 1 | 只读扫描无修改；已保留完整 App 函数清单，不重复宽搜，后续按单一候选函数和组件精确读取小区块 |
| 绿色脚本进入刷新挂起后，以精确名称“刷新”创建的 locator 因 busy 文案变为“刷新中”而在 `isEnabled()` 等待超时 | 1 | 产品互斥已触发但证据不完整；关闭含未决路由的污染会话，改用按钮内部 SVG/稳定容器 locator，并在全新会话完整重跑 |
| 绿色 Playwright 脚本首次用页面 `atob` 直接还原 UTF-8 源码，中文“历史洞察”变成乱码并在首个 click 等待 30 秒超时 | 1 | 尚未安装路由或产生受控请求；runner 改为 `atob` 后用 `Uint8Array + TextDecoder('utf-8')` 还原源码，不修改产品或证据脚本逻辑 |
| Playwright 认证页引用在重渲染/只读 eval 后失效：首轮短引用、同快照密码引用和第三次用户名引用均无效；CLI 错误仍返回退出码 0 | 3 | 页面与数据库未提交；停止逐字段引用方案，改由当前浏览器上下文调用本地注册 API、保留会话 cookie，再重载快照确认登录 |
| `playwright-cli --help` 已完整输出命令语法，但 Windows 退出阶段触发 libuv `UV_HANDLE_CLOSING` 断言并返回 1，使并行认证源码结果未回传 | 1 | 未启动浏览器、无产品文件变化；保留已获得的 CLI 会话语法，不重复 help，认证标签改为独立只读命令 |
| 浏览器账号线索扫描同时检索全部 Playwright YAML/Markdown，命中超长淘宝 bookmarklet 并使输出截断 | 1 | 只读命令无修改；不再宽搜旧证据，改用本缺陷目录中的全新隔离数据库并注册专用 QA 账号，避免依赖未知旧凭据 |
| 续跑恢复的外层工具编排把只读命令结果保存为 `result`，却调用了不存在的变量 `r`，导致首轮结果未回传 | 1 | 内层只读命令无文件或进程变更；第二次使用一致变量名成功恢复，后续工具脚本在发送前核对声明与输出变量 |
| 只读盘点命令把 PowerShell `foreach` 结果直接接入管道，解析器报 `EmptyPipeElement`，对应整条命令未执行 | 3 | 本次组件扫描重犯同一语法错误；确认无文件或进程变化，后续循环输出固定先写入 `$rows` 数组，再单独 `Format-Table` |
| 阶段状态补丁和两次阶段 79 进度补丁因上下文过宽或顺序假设错误而未应用 | 3 | 三次均无部分写入；后续只按单一区块的精确相邻行修改，不再跨区块组合 |
| code-review `check` 仅按路径把 OpenAI provider 判为 ok；直接版本命令及真实 review 均被 WindowsApps 拒绝访问 | 2 | 已完成一次真实验证并确认 `WinError 5`；其他 provider 不存在，停止重试并由主 Agent完成交叉审查 |
| 单 worker 全量 Vitest 在 43/44 文件、508/572 测试后发生 fork worker 意外退出，未给出具体文件 | 1 | 不重复原命令；改用诊断 reporter、文件清单/分片和不同 pool 定位是测试隔离、Node/Vitest 环境还是项目资源泄漏 |
| 默认 forks + 固定种子乱序出现 2 个 API 失败：采集任务接口因前序测试遗留活动任务返回 409，随后 worker 仍异常退出 | 1 | 已确认测试/模块级采集任务状态存在顺序依赖；审查 `taobaoCapture` 生命周期，先补稳定复现，再实现显式隔离与资源收敛 |
| PowerShell 读取单个测试范围时把范围值构造成错误的嵌套对象，`Math.Min` 报参数类型不匹配 | 1 | 命令未写文件；改用明确的 `for($i=500; $i -le 940; ...)` 整数循环成功读取 |
| API 文件关闭自身数据库后，默认 forks 单 worker仍在 43/44 文件、507/573 后退出 | 2 | 全仓确认约 199 次数据库创建仅 4 次关闭；改为共享测试数据库 helper 统一 afterEach 关闭，不再通过调整 pool/顺序规避 |
| 阶段 80 首次并行读取认证、路由、验证器和路由声明时，四路输出总量超过模型上下文而被工具截断 | 1 | 只读命令未修改文件；后续先定位行号，再按单文件、小于约 180 行的区块读取，避免并行返回大段源码 |
| 认证测试全仓关键词扫描命中数过多，返回尾部再次被截断 | 1 | 已保留前段可用命中但不依赖缺失尾部；后续只读取 `tests/api.test.ts` 的精确认证行段，不再跨全测试目录宽搜常见词 |
| “唯一账号”递归检索漏排除 `dist`，命中压缩后的前端 bundle 并产生超大截断输出 | 1 | 只读命令未修改文件；已从截断前获得 README/docs 直接证据，后续递归源码检索显式排除 `dist`、`node_modules`、`output` 和证据目录 |
| 数据库结构探针经 `tsx -e`/`node -e` 传参时被 Windows 参数解析移除脚本内引号，首次还把 SQL `*` 误解析为命令 | 3 | 三次均未写文件；最终改为 here-string 通过标准输入传给 `node --import tsx --input-type=module -`，成功完成内存库探针 |
| 读取缩略图专项测试时假定文件名为 `tests/thumbnails.test.ts`，实际文件不存在 | 1 | 只读命令无写入；先按文件名和源码 import 定位真实测试文件，再做精确读取 |
| 天气正文超时修复后的首次全文件测试虽 13 个断言通过，但新用例晚于拒绝发生才订阅 `rejects`，Vitest 报异步已处理的 unhandled rejection | 1 | 产品代码无需回退；把 rejection 断言移到推进假时钟之前，重跑 13/13 且无未处理错误 |
| 新增认证竞态测试首次遗漏导入 Vitest 的 `describe/it/expect`，测试文件在收集阶段失败 | 1 | 补齐显式导入后重新运行，随后获得旧产品实现的真实竞态红灯 |
| 认证竞态测试首次调用无参数 `createDatabase()`，意外只读打开真实项目数据库并看到既有账号 | 1 | 账号存在使写入在最前置检查即被拒绝，未修改真实数据；立即改为显式 `createDatabase(":memory:")`，后续只使用隔离内存库 |
| 登录限流模块与路由的首次组合补丁猜测了不存在的 `createDatabase` import 上下文，整批未应用 | 1 | 无部分写入；先单独新增模块，再读取路由真实 import 和函数区块后精确接线 |
| 登录限流结果首次跨三份记录文件组合补丁因 `progress.md` 错误日志上下文漂移而整批未应用 | 1 | 无部分写入；再次按单文件、精确相邻内容拆分更新 |
| 淘宝采集符号链接修复首轮运行测试已通过，但类型检查发现抽象 `statSync` 返回类型漏写可选 `isSymbolicLink` | 1 | 补齐统一 stat 形状后，类型检查与差异检查均通过；运行逻辑无需回退 |
| 文档语义检索的排除目录正则末尾反斜杠未转义，PowerShell 对每个输入文件重复报告 `Unrecognized escape sequence \o` | 1 | 只读检索未修改文件；改为只枚举目标源码/文档目录，不再在 `-notmatch` 中拼接带尾反斜杠的模式 |
| 旅行撤销回归误以为 SQLite `INTEGER PRIMARY KEY` 删除后不会复用当前最大 ID | 1 | 产品修复无需回退；测试改为验证重新生成的事件存在并再次绑定 selection，不再依赖 ID 单调递增 |
| 可用状态结果首次跨 API/schema/三份规划记录的组合补丁猜错 API 标题与原文，整批未应用 | 1 | 无部分写入；先定位真实 `POST /api/garments/:id/availability` 段落，再按精确相邻行分块更新 |
| 衣物数组守卫结果首次跨 API/schema/三份规划记录的组合补丁猜错 GET garments 原文，整批未应用 | 1 | 无部分写入；定位真实 `docs/api.md:525` 段落后按精确句子更新 |
| 衣物数组守卫首次返回通用 `string[]`，类型检查拒绝赋给枚举 `Season[]` | 1 | 行为测试已绿；将守卫改为带可选枚举白名单的泛型，季节只接受四个合法值后类型检查通过 |
| Playwright 动态路由脚本首次使用 CLI 回调沙箱中不存在的全局 `URL` 和 `setTimeout`，两次会话留下未决请求 | 2 | 改为正则解析 URL 与 `page.waitForTimeout()`；丢弃受污染会话，重新登录全新会话并等待启动请求结束后获得稳定红灯 |
| 两次内联 `run-code` 中的字符串引号被 PowerShell/npx 参数层剥离，分别把中文文本和 `networkidle` 当成变量 | 2 | 不再用内联字符串参数承载复杂代码；复杂浏览器步骤统一写入 output 下 `--filename` 证据脚本 |
| 修复后截图存在，但 PowerShell 用 `Get-ChildItem -LiteralPath 'fixed-*.png'` 检查时把通配符当字面路径并使组合命令返回 1 | 1 | 浏览器断言与截图写入均已先成功；改用目录 `-Path` 配合 `-Filter 'fixed-*.png'`，确认两张 PNG 存在并完成视觉核验 |
| 推荐卡绿色复验直接把完整证据脚本传给 `run-code` 时，Windows 参数层使脚本报 `Unexpected token ')'`；CLI 沙箱也不提供 `Buffer` | 2 | 产品与会话均未被修改；改为 PowerShell 读取脚本后 Base64 编码，再由 `page.evaluate()` 在页面环境解码，回调沙箱只负责执行已还原函数 |
| 推荐卡互斥修复首次相邻回归发现：只传旧 `savingOutfitId` 的调用方仍显示“保存中”，但按钮因只判断新全局 busy 而未禁用 | 1 | 将保存、安排、实穿按钮的禁用条件改为“全局 busy 或原候选级 busy”；相邻 4 文件 106/106 与类型检查转绿 |
| 定位 token 修复后的首次浏览器复验仍表现为旧行为，但控制台无异常 | 1 | 判断为 Vite HMR 保留新增 gate 的旧 hook 实例；整页 reload 后用同一脚本复验，手工坐标稳定保留，结论只采用重载后的干净实例 |
| 查找通用 `Field` 组件时猜测了不存在的 `Field.tsx` 与 `index.ts` | 1 | 只读失败、无写入；用 `Get-ChildItem` 定位真实文件为 `src/components/ui/index.tsx` 后继续审查 |
| OutfitBuilder 浏览器红灯前两次超时：首次把 availability combobox 的动态辅助文本当作 exact label；第二次前一请求已清空推荐，脚本等待不存在的推荐卡 | 2 | 两次都未修改产品文件或真实数据库；改用前缀角色定位，并让脚本每次 reload 后自行生成推荐，再启动 9 秒延迟衣物更新，稳定得到 `draftPreserved=false` |
| 查找 availability 客户端函数时猜测了不存在的 `src/lib/api.ts` | 1 | 只读失败、无写入；递归定位真实文件为 `src/api.ts` 后核对响应 DTO |
| Vite 证据进程意外退出后，旧 Playwright 会话页面变为 `about:blank`，首次衣橱推荐红灯脚本无法连接 | 2 | API 未受影响；重启隐藏 Vite，并新建干净会话重新登录后获得稳定产品红灯 |
| 衣橱推荐红灯的通用 mock 路由未覆盖 `PUT /api/garments/:id`，控制台出现一个 404 | 1 | UI 乐观更新已独立确认旧推荐缓存缺陷；绿色脚本会补齐特定 PUT 路由并把 0 error/0 warning 纳入验收 |
| 监听端口盘点首次把 PowerShell `foreach` 结果直接接入管道，解析器报 `EmptyPipeElement` | 1 | 命令未执行且无状态变化；改为先收集到 `$rows` 再单独输出，随后确认 5174/8788 均正常监听 |
| 绿色证据脚本继续使用 `**/api/garments*` 时，Playwright glob 不跨路径分隔符，两个 `PUT /api/garments/101` 仍落到真实 API 并返回 404 | 1 | 新增 `**/api/garments/*` 路由并复用同一状态化 handler；重跑两条场景均通过且本次监听到的 error/warning 数为 0 |
| 衣橱刷新竞态首个脚本用路由 handler 内 `page.waitForTimeout()` 延迟 GET，操作时序没有稳定保证，首次得到未复现的 `finalExcluded=true` | 1 | 改为保存未完成的 GET route，等待 PUT 成功和乐观状态可见后由脚本显式释放旧快照；随后稳定得到 `staleRefreshWon=true` |
| 修复后首次复用同一衣橱竞态脚本，截图仍写到 `old-refresh-overwrote-edit.png`，覆盖了该路径下的修复前 PNG | 1 | 未删除任何文件；立即把红灯布尔结果固化为 `red-result.json`，后续截图改写到 `fixed-refresh-preserved-edit.png`，文档不再把被覆盖路径作为修复前视觉证据 |
| 价值洞察首个浏览器脚本停留在默认“周计划”分区，却等待仅在“洞察”分区渲染的 `.value-insights__facts`，30 秒超时 | 1 | 产品未修改；脚本显式点击“洞察”后重跑，稳定得到旧响应覆盖新结果的红灯 |
| 保存搭配竞态首个脚本误把客户端端点写成 `/api/saved-outfits`，实际 API 为 `/api/outfits`，因此等待卡片 30 秒超时 | 1 | 产品未修改；核对 `src/api.ts` 后修正 GET/PUT 路由模式，同一脚本稳定得到旧刷新覆盖收藏更新的红灯 |
| 跨接口衣物竞态脚本首次把 availability combobox 当成 exact label，随后又沿用不跨 `/` 的 `**/api/garments/*` 路由模式 | 2 | 两次均未修改产品代码；读取真实可访问树后改为前缀角色定位，并用 `**/api/garments/**` 覆盖嵌套专用端点，最终稳定得到权威/UI 分叉红灯 |
| 视觉 busy 浏览器脚本首次假定当前账号至少有两件 active 衣物 | 1 | 在发起任何视觉请求前主动中止；改用拦截 active GET 的只读合成衣物夹具，不创建或删除数据库记录 |
| 视觉 busy 浏览器脚本用会随状态从“去背景”变为“处理中”的可访问名称持续定位按钮，进入竞态后等待超时 | 1 | 页面重载中止拦截请求；改用稳定的剪刀图标结构定位，同一释放顺序随后稳定得到红灯 |
| 视觉 busy 红灯的三文档组合补丁引用了一行措辞漂移的旧错误记录，整批校验失败 | 1 | 无部分写入；拆成证据/findings/progress 与 task_plan 两个精确补丁后完成记录 |
| availability 修复后的只读检索尝试给当前 PowerShell `Select-String` 传 `-Recurse` | 1 | 参数解析失败、命令未执行；改用 `Get-ChildItem -Recurse -File | Select-String`，确认旧单例名称仅作为新复数名称子串出现 |
| 历史/导出浏览器脚本先后因动态“刷新中”名称、遗留拦截路由和原生确认弹窗中断结构化结果 | 3 | 三次均未修改数据库；改用稳定图标定位、先清路由再重载，并在测试页临时将 `window.confirm` 替换为返回 true，最终稳定得到双请求红灯 |
| 全局 busy 首轮实现后目标测试剩 2 项：对象参数类型使 `namedFunctionSource` 截断；读取新产物被错误一律禁用 | 1 | 对推荐函数改用明确边界提取；保留“读取产物取消预览”的既有能力，并以同步释放 preview 锁后再取得 read 锁实现安全交接 |
| 续跑首次并行恢复使用技能示例中的 `$HOME/.claude/.../session-catchup.py`，本机实际技能安装在 `.agents`，缺失路径令整组只读命令返回 1 | 1 | 工作树和端口结果已返回、无写入副作用；改用已读取 SKILL.md 的实际目录 `C:/Users/Vader/.agents/skills/planning-with-files-zh/scripts/session-catchup.py`，其余规划文件分开读取 |
| 旅行组件扫描用 `Get-ChildItem -LiteralPath ... -Recurse -Include '*Trip*'`，该路径形式下 Include 未限制结果，返回 421 行全 features 命中并截断 | 1 | 只读命令无文件变化；停止依赖 `-Include` 过滤，后续先用 `Where-Object Name -like '*Trip*'` 定位准确文件，再对单文件精确读取 |
| 依赖补丁探针猜测存在 `glob@10.5.1`，registry 返回 E404；组合命令因后续 echo 仍以 0 退出 | 1 | 未修改依赖或锁文件；确认 10.5.0 后无同主补丁，不再尝试虚构版本，改由 archiver 8 的新依赖链移除旧 glob/minimatch/brace 链 |
| Archiver 8 安装后首次相邻测试有 3 个 ZIP 用例失败：ESM default 导入不再可调用，返回 `TypeError: default is not a function` | 1 | 其余 124 项通过、失败集中；不退回有漏洞的 v7，读取 v8 本地入口/官方 API 后迁移到正式 named create，并保留 export/API 专项复验 |
| 读取 Archiver 8 源码已知无 default 后，运行时形状探针仍尝试 `import default, * as namespace`，Node 在实例化时报“不提供 default export” | 1 | 探针未执行且无文件变化；不再引用 default，改为 namespace-only 检查 `ZipArchive`，类型声明独立读取避免 Promise 结果丢失 |
| Archiver 8 适配首个组合补丁猜测 export.ts 存在 `ApiError` import 上下文，校验失败而整批未应用 | 1 | 无部分写入；已读取真实文件头，后续只按 archiver import 行和 archive 构造行两个精确上下文修改，构造器桥接放在完整 imports 之后 |
| 模型脚本 intermediate junction 红灯确认安全检查发生过晚，根外 `Xenova` 已被递归 mkdir 创建 | 1 | 测试仅使用隔离系统临时目录且不访问网络；不做失败后删除，改为逐级先校验再单层创建，从源头阻止根外写入 |
| 阶段 83 首次裸 `npm test` 只打印 `RUN` 后 exit 1，无断言、文件或 worker 诊断 | 1 | 不重复无信息命令；先用 threads/1 verbose 获取稳定可定位证据，再回到标准 threads/4 命令复验 |
| 最终浏览器首次导航被连接层外部遥测超时中断，未得到页面 snapshot | 1 | 错误未报告断连；按 browser troubleshooting 保留当前 binding，改为检查现有标签并使用 fresh tab，不切换自动化后端 |
| 最终浏览器注册首次用 exact `getByLabel("用户名/密码")` 得到 0 个元素 | 1 | 计数检查发生在填值前、数据库零写入；fresh snapshot 显示帮助文本属于可访问名称，改用 snapshot 中完整名称 |

### 2026-07-25 暂停检查点
- 用户要求暂停，阶段 81 保持 `in_progress`，阶段 83 不得提前开始或把 active goal 标记完成。
- 已完成并留证：全局 BusyAction 双向互斥、History 动态文案布局稳定、缩略图保存关闭/重开同衣物的 ABA 会话隔离；最新完整 App 回归为 103/103。
- 当前未提交产品/测试/文档差异全部保留；未删除、回退或清理任何证据文件。
- 暂停收尾已关闭 `outfit-globalbusy-fixed-2` 浏览器会话及本轮隔离 API/Vite；5174/8788 均无监听。
- 恢复后的第一步：核对工作树与端口，补跑缩略图批次相邻 5 文件、`npm run typecheck`、`git diff --check`；通过后继续逐个审查反馈/替换/购买检查等异步入口。
- 恢复后上述门禁已完成：相邻 5 文件 131/131、类型检查与差异检查通过；当前续作入口更新为反馈/替换/购买检查等异步会话的精确审查。

### 2026-07-26 01:32 暂停检查点
- 用户明确要求暂停并保存进度；当前 goal 保持 `active`，不标记 `complete` 或 `blocked`，本轮不再继续阶段 81/82/83 审查。
- 本轮新增并已验证的修复：视觉模型后台任务超时与迟到退出隔离、模型零字节/部分写入与 junction 越界防护、淘宝采集任务超时、Vitest 固定 threads/4 稳定配置、模型 CLI 请求级超时、CLIP metadata schema 与下载完成性门禁。
- 最新关键门禁：Python 38/38；模型脚本/文件 15/15；真实 `models:status` 与 `models:verify` 通过；裸 `npm test` 51 文件 655/655；`npm run typecheck` 与 `git diff --check` 通过。
- 当前工作树完整保留：22 个跟踪修改、67 个未跟踪文件；未提交、未暂存、未删除、未回退或清理任何项目/证据文件。
- 当前 5174/8788 均无监听，无需额外关闭服务；`dist` 未进入 Git 状态。
- 恢复入口：先读取 `task_plan.md`、`findings.md`、`progress.md` 本检查点并核对 Git/端口；随后进入完成性审计，逐项对齐阶段 81/82 未勾选项，再执行阶段 83 的最终测试、双 audit、生产构建、浏览器证据与 Git 边界验收。
- 暂停核对中的一次只读统计误差：PowerShell `-like '??*'` 将问号解释为通配符，错误显示 0/89；完整 `git status --short` 清单与既有边界确认实际仍为 22/67，未产生写入副作用。
