# 发现与决策

## 需求
- 执行用户提供的 `suggestion.md` 中的升级建议。
- 保留 Selenium 的淘宝登录态，尤其是 `output/chrome-taobao-profile`。
- 删除电脑上的文件前必须确保用户知晓。
- 所有沟通使用中文；PowerShell 使用 UTF-8；优先 PowerShell 原生命令。

## 研究发现
- 当前工作目录为项目仓库根目录。
- 当前分支为 `feature/outfit-app`，不是 main/master。
- Git 状态曾存在未跟踪源码归档 ZIP，本次任务不触碰归档文件。
- 项目根目录存在本地状态目录：`data/`、`output/`、`logs/`、`node_modules/`、`dist/`。
- `suggestion.md` 要求优先处理依赖漏洞、缩略图下载安全、前端远程图片隐私、Selenium profile 敏感目录、安全头/CSRF、capture job、输入校验、CI 和文档。
- `package.json` 当前脚本包含 `npm test` 和 `npm run build`；尚无 `lint`、`typecheck`、`privacy:clean`。
- `server/services/thumbnails.ts` 的 `tryDownloadCandidate()` 当前直接 `fetch()` 候选 URL，未做域名 allowlist、私网阻断、超时、Content-Length 上限或 streaming 上限，且失败被 catch 后静默返回 `null`。
- `server/services/importTaobao.ts` 的 `isTrustedProductImage()` 当前直接 `decodeURIComponent(url)`，畸形 percent encoding 会抛异常。
- `server/routes.ts` 的 `sendError()` 对未知错误返回 400 和原始 `error.message`；`/api/recommendations` 保存历史时使用原始 `request.body`。
- `server/routes.ts` 的 `/api/weather` 只校验有限数字，未限制经纬度范围；`/api/garments/:id` 直接 `Number()`，未显式校验正整数。
- `src/App.tsx` 的 `GarmentThumbnail` 当前直接 `<img src={item.imageUrl}>`，远程 `imageUrl` 会进入浏览器请求。
- `server/services/taobaoCapture.ts` 已有 `/api/capture/jobs`，但 job 存在内存 Map 中；stdout/stderr 未写入 `capture.log`；取消只 `child.kill()`；artifact 读取无 20 MB 上限；legacy detached API 仍暴露。

## 技术决策
| 决策 | 理由 |
|------|------|
| 先跑基线测试再改代码 | 区分已有问题和本次引入的问题 |
| TDD 修复行为变更 | 保证建议中的安全边界由测试覆盖 |
| `privacy:clean` 只新增命令，不自动运行 | 用户要求保留淘宝登录态，且删除前必须知晓 |
| `.gitignore` 可加强忽略目录，但不删除现有目录 | 降低误提交风险，同时不破坏本地状态 |
| capture job 持久化优先做服务层可恢复记录和并发限制，legacy API 改为兼容但受控的 job 启动 | 可降低迁移风险，同时消除 detached 不可控路径 |

## 遇到的问题
| 问题 | 解决方案 |
|------|---------|
| `suggestion.md` 首次读取乱码 | 显式使用 UTF-8 读取 |

## 资源
- 建议文件：用户提供的 `suggestion.md`
- 项目说明：仓库内 `AGENTS.md`
- 当前关键脚本：`package.json`

## 视觉/浏览器发现
- 暂无视觉或浏览器检查。

---
*每执行2次查看/浏览器/搜索操作后更新此文件*
*防止视觉信息丢失*

## 2026-06-21 商品缩略图手动选择

### 需求
- 按 `docs/superpowers/specs/2026-06-21-thumbnail-selection-design.md` 实现手动选择衣物主缩略图。
- 候选来源包括当前远程可信图、订单图、详情图和同 `itemId` 采集图。
- 保存后 `garments.image_url` 必须是本地 `/api/garment-thumbnails/...`，并清空旧 `cutout_image_url`。
- 后续导入详情或补缩略图不能覆盖用户已选择的本地缩略图。
- 不删除旧缩略图文件。

### 研究发现
- `server/services/thumbnails.ts` 已有 `rankThumbnailCandidates()` 和 `downloadGarmentThumbnail()`，可以复用排序和下载安全校验。
- `rankThumbnailCandidates()` 本身不限制淘宝域名；候选 API 需要额外过滤外站、私网、本地、data/file URL。
- `server/db.ts` 已有 `readCaptureImageIndex()` 递归读取采集产物，但当前私有候选 helper 不包含当前图、订单图，也不保留 source。
- `src/App.tsx` 的衣服库由 `MainApp` 持有状态，`WardrobeView` 是受控组件，适合新增 `onOpenThumbnailPicker`。
- 当前工作区已有未提交改动，不属于本规格的核心功能；本次实现不回滚这些改动。

### 技术决策
| 决策 | 理由 |
|------|------|
| 候选 source 使用 `current/order/detail/capture` | 前端可清楚展示来源，后端可保留采集图来源 |
| 选择接口按候选集合精确匹配 URL | 防止前端提交任意外部 URL |
| 选择后清空 `cutout_image_url` | 避免旧去背景图与新主图不一致 |
| 旧缩略图文件不删除 | 规格明确交给隐私清理流程 |

### 实现结果
- 新增 `GET /api/garments/:id/thumbnail-candidates`：返回当前图、订单图、详情图、同 `itemId` 采集图，并按现有缩略图评分排序。
- 新增 `POST /api/garments/:id/thumbnail`：仅接受当前衣物候选集合内 URL，下载成功后保存本地缩略图并清空旧去背景图。
- 新增前端 API 方法、衣服行动作按钮和 `ThumbnailPicker` 弹窗。
- 候选弹窗展示后端返回的候选，不在前端复制安全过滤规则；候选图加载失败显示占位。
- 验证通过：`npm run typecheck`、`npm test`、`npm run build`。

## 2026-06-27 衣橱分析洞察

### 需求
- 用户希望把 GitHub 项目 `zironglv/clothy` 的“衣橱分析洞察”功能迁移到本地 Outfit 项目。
- 必须先理解本地项目和 clot​​hy 项目，再在本地完成实现。
- 本轮全程中文；优先 PowerShell 原生命令；PowerShell 使用 UTF-8；删除电脑文件前必须确保用户知晓。

### clot​​hy 研究发现
- `zironglv/clothy` 是 public 仓库，默认分支 `main`，已只读克隆到 `C:\Users\Vader\AppData\Local\Temp\clothy-source-20260627215557`。
- clot​​hy 是 Python/OpenClaw Skill，不是 Web 应用；功能主要通过自然语言命令输出文本报告。
- `src/core/analyzer.py` 的 `WardrobeAnalyzer.generate_report()` 生成衣橱诊断报告，包含基础数据、类别分布、衣橱健康度、颜色分析和搭配建议。
- `src/core/analyzer.py` 的健康度规则包含：上衣少于 30%、下装少于 20%、鞋子少于 3、外套少于 2、缺少核心单品时无法组成完整搭配。
- `src/core/analyzer.py` 的颜色规则关注基础色（黑、白、灰、米、卡其）比例：少于 40% 建议补基础款，高于 80% 建议加入彩色单品。
- `src/core/recommender.py` 有 `analyze_wardrobe_coverage()`，按外套、上衣、下装、鞋子、配饰统计覆盖度，并按缺失/不足/基本/充足给出补充建议。
- `docs/UPGRADE_PLAN.md` 的 `StyleAnalyzer` 设计包含：品类分布、颜色分布、季节分布、风格标签、身材建议、洞察建议和购物建议。
- README/SKILL 对外描述的“衣橱分析洞察”包含配置分析（颜色分布、季节占比、风格偏向）、购物指南（缺什么、多什么）和理性消费（避免重复购买）。

### 本地项目研究发现
- 本地 Outfit 是 React + Vite + TypeScript 前端，Express + Node `node:sqlite` 后端。
- 本地已经存在 `/api/insights`、`getInsights()`、`WardrobeInsights` 和 `HistoryInsightsView`。
- 当前 `WardrobeInsights` 只包含总数、拥有/确认/待确认数量、品类分布、颜色分布、常穿、未穿。
- 当前 `getWardrobeInsights()` 位于 `server/db.ts`，通过 `listGarments()` 和 `listWearLogs()` 计算基础洞察。
- 本地 `Garment` 已有 `category`、`color`、`seasons`、`styles`、`formality`、`materials`、`patterns`、`tags`、`owned`、`confirmed`、`excluded`、`confidence` 等字段，可支撑 clot​​hy 的大部分本地分析。
- 本地已有 `PersonalProfile` 和 `getPersonalProfile()`，可支撑身材/肤色/偏好建议。

### 技术决策
| 决策 | 理由 |
|------|------|
| 复用并扩展 `/api/insights` | 已有 API 客户端和历史洞察页面接入 |
| 结构化返回而不是文本报告 | 本地是 Web UI，需要稳定字段渲染和测试 |
| 保留现有字段并追加新字段 | 保持兼容，降低回归风险 |
| 后端负责分析规则 | 数据在 SQLite，避免前端重复实现业务规则 |
| 不迁移 clot​​hy 的多人衣橱和命令路由 | 与本地当前产品边界不一致 |

### 需要实现的洞察维度
- 季节分布：按 `Garment.seasons` 统计 spring/summer/autumn/winter。
- 风格倾向：按 `Garment.styles`、`tags`、`patterns`、`materials` 和名称关键词统计。
- 衣橱健康度：输出分数、状态和问题列表。
- 洞察建议：多/少、季节不足、颜色结构、确认率、未穿率等。
- 购物建议：优先补核心缺口，再补季节和风格缺口。
- 身材建议：结合 `PersonalProfile.bodyType`、`heightCm`、`skinTone`、`colorDisposition`。

### 实现结果
- 扩展 `src/shared/types.ts`：新增 `WardrobeDistributionEntry`、`WardrobeHealth`、`WardrobeSuggestion`，并在 `WardrobeInsights` 上追加季节分布、风格分布、场合分布、风格倾向、健康度和三类建议。
- 扩展 `server/db.ts#getWardrobeInsights()`：保留原有总数、品类/颜色分布、常穿/未穿字段；新增基于活跃单品的季节/风格/场合统计、健康评分、洞察建议、购物建议和身材建议。
- 扩展 `src/App.tsx#HistoryInsightsView`：展示衣橱健康度、风格倾向、季节/场合分布、洞察建议、购物建议和身材建议。
- 扩展 `src/styles.css`：新增健康度块和纵向建议列表样式，避免长建议文本挤入 chip。
- 同步 `docs/schema.md` 和 `docs/api.md` 的 `WardrobeInsights` / `/api/insights` 文档。
- 新增 API 集成测试和前端渲染测试，覆盖 clot​​hy 风格分析字段与页面展示。

### 验证结果
- `npm test -- tests/api.test.ts -t "clot"`：通过。
- `npm test -- tests/app.test.tsx -t "history insights"`：通过。
- `npm run typecheck`：通过。
- `npm test -- tests/api.test.ts`：50 个测试通过。
- `npm test -- tests/app.test.tsx`：54 个测试通过。
- `npm test`：15 个测试文件、194 个测试通过。
- `npm run build`：通过。

### 风险
- 本地颜色是英文枚举，clothy 的中文基础色规则需要映射。
- 本地品类有 `dress` 和 `outerwear`，clothy 使用 `outer`；规则需要适配。
- `src/App.tsx` 较大，前端修改应集中在 `HistoryInsightsView` 附近，避免无关重构。

## 2026-07-10 全前端重构

### 当前目标
- 在完整理解 Outfit 后重构整个前端，重点提升视觉品质、信息层级、交互体验、响应式与可维护性。
- 用户明确允许开启多个子 Agent；初始调查按架构、体验、验证三个只读方向并行。

### 已知上下文
- 当前分支为 `feature/outfit-app`。
- 工作区已有未提交修改：`src/App.tsx`、`src/styles.css`、`tests/app.test.tsx`，这些属于已有工作，必须保留并在其基础上继续。
- 项目根目录已有前几轮目标的规划记录；本次保留历史日志并把 `task_plan.md` 切换到新目标。
- 本轮不删除任何文件；若后续确需删除，先明确告知用户。

### 待审计
- 前端技术栈与依赖适配程度。
- 页面树、主任务流、组件耦合、现有样式 token 与静态资源。
- 浏览器中的桌面/移动真实表现、空态/加载态/错误态和可访问性。
- 当前测试和构建基线。

### 初始架构事实
- 前端为 React 18 + Vite 8 + TypeScript，已安装 Tailwind CSS 4、daisyUI 5 和 `lucide-react`；不应在未评估现有约束前再叠加另一套组件系统。
- `src/App.tsx` 约 92 KB、`src/styles.css` 约 34 KB，是明显的单文件集中结构；`src/components` 目前只有一个约 2.6 KB 的 workbench 组件，`src/views/index.ts` 几乎为空。
- `src/api.ts` 约 8 KB，`src/shared/types.ts` 约 8.8 KB，说明 API/类型已有一定边界，可作为重构时保持业务契约的稳定层。
- 测试覆盖较重：`tests/app.test.tsx` 约 69 KB，`tests/frontendApi.test.ts` 约 17 KB；视觉重构必须同步维护可见文案、角色和交互契约。
- 当前业务代码既有改动规模为 App `+151/-99`、CSS `+148/-7`、前端测试 `+71/-4`，与上一轮洞察功能记录一致，不能回滚。

### 产品与组件事实
- Outfit 是个人本地优先的穿搭管理与推荐工具，主链路为“淘宝采集/导入 -> 衣橱确认与修订 -> 结合天气/场合生成推荐 -> 标记已穿 -> 查看历史洞察”，不是营销站或多用户云产品。
- 认证是单机门禁账号；登录后无 URL 路由，由 `MainApp` 内部 `tab` 状态切换“今日推荐、衣服库、历史洞察、导入、设置”五个视图。
- `MainApp` 同时管理衣物、导入、采集、天气、推荐、画像、历史、模型、缩略图弹窗和全局错误，状态/副作用高度集中，但 API 调用函数与纯 helper 已有可抽离边界。
- 当前已有可复用 workbench 原语：`PageHeader`、`CommandBar`、`StatTile`、`StatusPill`、`WorkbenchPanel`、`SummaryStrip`、`SettingsSection`，但仍以字符串类名和全局 CSS 为主。
- 衣服库是高密度生产力界面：筛选、批量选择、内联编辑、图片操作、视觉标签、拥有/确认/排除/删除均在列表行完成；重构不能把它误做成低密度营销卡片。
- 今日推荐是核心首页，包含场合选择、天气上下文、推荐搭配、解释、替代单品和穿着记录；目前空态同时给出多条同层级动作，需重新梳理主次。
- 导入页同时承载浏览器采集、书签脚本、高级 JSON、预览与结果统计；当前信息量大但已存在“采集/检查/导入”三段心智模型，可作为重构骨架。
- 历史洞察目前由连续的双列同形卡片堆叠，信息齐全但缺乏数据层级与图形表达，是视觉重构价值最大的页面之一。
- 设置页含位置、个人画像、本地视觉模型三组复杂表单；应使用产品型表单/状态模式，不套用落地页设计规则。
- 缩略图选择弹窗已有 `role=dialog` 和 `aria-modal`，但未见焦点锁定、Escape 关闭或点击遮罩关闭；是可访问性补强点。

### 现有视觉系统审计
- 当前页面是浅色企业工作台：冷灰绿画布、白色面板、深色侧栏、青绿色主色；`data-theme="corporate"` 固定在认证和应用根节点，虽然 daisyUI 声明 night 偏好主题，实际自定义 token 没有暗色切换。
- 字体直接使用 `Inter, Segoe UI, Microsoft YaHei`，中文主要落到微软雅黑，视觉辨识度较低；应改为更适合中文产品界面的系统字体栈并重做字号/字重层级，不需要远程字体依赖。
- token 已有间距、圆角和语义色雏形，但同时存在青绿主色、蓝色 accent、cyan info、琥珀/红等大量组件内硬编码，颜色和形状没有完全锁定。
- 页面几乎每个区块都使用白卡、边框、8px 圆角和小标签，历史页尤其是重复的 `grid two + panel card`；主要问题不是单一颜色，而是层级同质化、组件过度装盒和信息节奏机械。
- 按钮同时混用自定义类与 daisyUI `btn` 类，导致设计权归属不清；重构应选定一套项目自有语义类并减少对 daisyUI 默认外观的依赖，Tailwind 可继续作为构建基础。
- 当前阴影、悬停与 reduced-motion 已有基础，但动效只覆盖导航/按钮反馈，缺少有意义的页面状态过渡；作为高密度本地工具，目标动效应克制。
- 920px 以下切为固定底部图标导航，并让 workspace 成为独立滚动容器；这能维持导航可达性，但图标全隐藏文字、额外退出图标和固定高度滚动会增加识别与移动浏览复杂度。
- 560px 下大部分按钮强制 100% 宽、衣物主行退化为单列，会造成垂直高度过长；移动端需要重新定义高频动作和渐进展开层级。
- 衣服缩略图是真实本地/可信图片，满足产品视觉资产需要；本项目是工具型 UI，不应为了“高级感”额外生成无关营销图片。

### 截图基线观察（2026-07-07 至 2026-07-08）
- 登录后桌面主要内容都挤在页面顶部，左侧 260px 深色栏贯穿全高；当内容较少时形成大面积无意义空白，侧栏视觉重量明显大于业务内容。
- 今日推荐头部占用约 250px 高度，但关键信息只有标题、坐标、衣物数和场合；坐标作为大号首屏指标噪声过高，场合选择与天气/生成操作又在第二层重复出现。
- 推荐空态同时出现“天气、生成、先导入衣物、设置位置”四个按钮，主路径不清；有结果后服装只呈纵向小行列表，缺少“整套穿搭”视觉组合感。
- 衣服库桌面扫描效率比旧版有所提高，但单行右侧固定六宫格操作抢占近三分之一宽度；相同按钮在每件衣物上重复，视觉噪声和误触风险较高。
- 衣服库筛选、批量栏、衣物行都是相同边框白卡，层级主要靠背景色轻微变化；用户很难在第一眼区分“筛选条件、批处理状态、单件内容、危险操作”。
- 导入页的三阶段结构可理解，但顶部三块同色步骤、下方采集大卡和两个并排入口仍像后台配置台；JSON 文本域成为最大视觉资产，掩盖了普通用户应优先走的浏览器采集路径。
- 历史洞察是十余个边框框体连续堆叠，健康分数、分布和建议都以 chip/小卡表达，缺乏图表、趋势和主次；英文 style 值与 ISO 时间直接暴露，完成度感较低。
- 设置页呈超长单列大表单，数据库路径直接成为副标题；个人画像每项全宽导致浏览距离过长，本地视觉模型区的技术路径和状态又与普通偏好混在同一层。
- 当前移动衣服库的页头、筛选、批量操作依次各占一个完整卡片，第一件衣物在首屏下方才开始；三个批量按钮全部全宽堆叠，移动效率反而降低。
- 移动底部导航采用仅图标的悬浮胶囊，虽有 aria-label，但用户需要记忆图标；退出与主导航并列也放大误触风险。固定导航同时遮挡了可滚动内容的底部区域。

### 历史重构结论
- 仓库中的 `docs/superpowers/specs/2026-07-07-outfit-quiet-workbench-design.md` 证明当前界面已经在两天前按“安静高级工作台”做过一次针对性演进，并明确选择了 `5 / 3 / 6` 的设计拨盘。
- 2026-07-08 的最新版截图仍然表现为边框卡片、后台工具条和小型 chip 的组合；用户当前再次明确评价“真的很丑”，说明上一轮以 token、卡片层级和局部布局为主的 targeted evolution 没有达成目标。
- 本轮因此判定为 **Redesign - Overhaul**：业务信息架构和内容契约保持，视觉语言、页面构图、状态层级与组件组织全面重做；不再沿用“quiet workbench”作为产品总隐喻。

### 设计读取与目标拨盘
- Reading this as: 面向单个高频用户的本地优先衣橱决策产品，以图像优先、冷静克制的“晨间试衣台”为语言，基于现有 React + Tailwind v4 + 项目自有无样式组件重构。
- `DESIGN_VARIANCE: 6`：今日推荐和洞察页使用有目的的非对称，维护型页面保持秩序。
- `MOTION_INTENSITY: 4`：仅增加结果出现、抽屉、选中和反馈过渡，并完整支持 reduced motion。
- `VISUAL_DENSITY: 5`：日常页面减少同时可见信息，待确认队列和技术维护区可局部保持 6。

### “晨间试衣台”核心原则
- 真实本地衣物图成为首要视觉资产；抠图使用 contain，商品原图才使用 cover。
- 保留青绿色品牌记忆，但使用单一实色强调，移除主按钮渐变与竞争性的蓝色装饰焦点。
- 默认通过留白、分组和稀疏分隔线组织内容，仅推荐结果、弹窗和可选择项目使用明显表面。
- 形状规则：表面 14px、控件 10px，只有状态与分段选择允许全圆角。
- 字体改为本机可靠的 `Segoe UI Variable`、苹方、微软雅黑 UI、system-ui 栈，数字使用 tabular numerals，不再把 Inter 作为中文界面首选。
- 桌面今日页采用约 38/62 的决策区与穿搭舞台；衣橱分离“待确认审核”和“我的衣橱浏览”；洞察首屏只回答健康、利用与下一步三个问题。
- 导入以浏览器采集为单一主入口，JSON/PID/路径下沉高级详情；设置按位置、个人偏好、本地能力分区，技术路径下沉。
- 移动导航保留可见文字；不再使用仅图标的五项胶囊，也不使用内部固定高度滚动容器。

### 验证基线
- `npm run typecheck` 通过，约 9.6 秒。
- `tests/app.test.tsx` 与 `tests/frontendApi.test.ts` 共 72 项通过，无警告。
- 无落盘生产构建通过，转换 1568 个模块；JS 约 209 KiB（gzip 65.5 KiB），CSS 约 84 KiB（gzip 15.6 KiB）。
- 现有测试值得保留的是中文业务语义、真实按钮/输入类型、aria 状态、图片隐私属性、API 路径/方法/凭证与关键回调；精确旧类名、网格列数、颜色值和按钮宽度应随新设计有意识更新。

### 架构审计结论
- `App.tsx` 实际约 2301 行，集中认证、导航、约 30 个状态、全部 API 编排、五页视图、弹窗和纯函数；`styles.css` 约 2037 行且存在全局标签泄漏。
- 当前 `busyAction` 与 `error` 跨域共享，容易产生并发状态竞争和跨页错误；首次并行加载也没有区分 loading 与真实空态。
- Tailwind/DaisyUI 与 `.primary/.secondary/.panel` 自定义系统同时控制同一组件，是视觉漂移的直接工程原因。
- `src/shared/types.ts` 被后端直接引用，路径必须保持；`src/api.ts` 和 `src/App.tsx` 可作为短期兼容重导出层。
- 安全拆分顺序：中文标签/默认值 -> 纯函数 -> UI 原语 -> 视图组件 -> 业务域 hooks -> 页面懒加载。
- 必须保留的关键契约包括认证规则、捕获参数、衣物三个独立状态、图片白名单与隐私属性、推荐 payload、localStorage 键、导出文件名和 PWA 不缓存 `/api`。
- 本轮没有改变采集轮询或后端数据契约；终检确认逐键 PUT 会造成真实数据乱序风险后，在前端范围内收敛为失焦提交与单衣物串行更新。

### 新实现首轮浏览器观察
- 登录后的真实本地会话可直接用于只读视觉 QA，无需创建或修改用户账号/衣橱数据。
- 初始化阶段现在渲染与最终布局同形的骨架，API 返回后正常切换到内容，解决了旧版先闪“空衣橱/无洞察”的假空态。
- 桌面壳层实际测得视口 1280px、侧栏 220px、主区 1060px，文档宽度等于视口宽度，没有横向溢出。
- 新今日页已去掉经纬度大指标，采用条件面板与穿搭舞台的 38/62 构图；空态只显示“生成今日搭配”一个下一步。
- 新衣服库首屏能在标题、三项关键统计、筛选和图像网格之间形成明确层级；37 件真实数据下首屏无重叠，筛选字段都有可访问名称，图片成为卡片主要面积。
- 衣物网格使用自然页面滚动，旧版移动/桌面独立 workspace 滚动容器已移除。
- 历史洞察首屏现在先回答健康度、利用率与下一步购物建议，再展开分布和历史列表；1280px 实页中主次明确且没有同形卡片墙。
- 导入页按“订单列表、商品详情、检查并加入衣橱”三段组织，高级 JSON 默认折叠；普通路径不再被技术输入框抢占首屏。
- 设置页将位置、个人画像和本地视觉模型分区，技术路径下沉，所有输入继续具备可见标签和语义名称。
- 390px 下五项移动导航均保持图标与文字，主内容预留底部安全区；320px 下也能容纳全部标签。
- Windows 有宽滚动条时，`html/body min-width: 320px` 会让 320px 视口的布局可用宽度只剩 305px，却仍强制 320px 内容宽；移除硬下限后横向溢出消失。

### 最终终检结论
- 桌面、移动、明暗 token、键盘焦点、原生 Dialog、加载/空/错误/成功状态和长文本布局均通过终检；焦点环和主要文字对比度达到 WCAG 要求。
- 场合或天气变化现在会使旧推荐失效，穿着记录使用推荐生成时保存的 occasion/weather，避免上下文漂移。
- 首次四组数据请求若有接口长期 pending，10 秒后会进入可恢复的部分加载界面，不再永久停留骨架。
- 画像读取失败时不会把具体默认画像当成真实值保存；本地存储被拒绝时会给出部分成功提示。
- `ApiClientError` 保留 `status/code/details`，会话过期会清理已登录应用壳并返回认证界面。
- PWA 离线回退只用于导航请求；图片白名单、lazy/async/no-referrer 与 `/api` 不缓存约束继续保留。
- 最终产物为 15 个测试文件、200 项测试全过；生产构建 1586 个模块，JS gzip 75.41 kB、CSS gzip 12.37 kB。
