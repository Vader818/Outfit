# 任务计划：Outfit 全前端重构

## 目标
在已完成全前端重构的基础上，严格执行 `docs/2026-07-10-outfit-m1-trusted-ingestion-plan.md`，完整交付 Outfit M1“可信建档与导入暂存区”：安全手工建档、受保护本地图片资产、软归档/恢复、数据库感知的淘宝导入审阅与幂等提交、V2/ZIP 完整备份，以及对应文档和全量验证。

## 当前阶段
已完成：Outfit M1 可信建档与导入暂存区

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

## 备注
- 优先使用 PowerShell 原生命令，不先使用 `rg`。
- PowerShell 命令显式设置 UTF-8。
- 删除电脑上的文件前必须确保用户知晓。
- 当前协作环境最多同时运行 4 个 Agent（含主 Agent），本轮计划并行开启 3 个只读子 Agent。
