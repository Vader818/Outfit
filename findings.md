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

## 2026-07-10 GitHub 功能调研与开发路线图

### 本轮需求与约束
- 必须先完整理解 Outfit 的功能、目标用户和真实使用场景，再检索 GitHub；不能从外部项目反推本地需求。
- 最终交付物是一份项目内 Markdown 文件，内容包含对 Outfit 有价值的候选功能及可执行开发计划。
- 本轮只做只读项目调查、外部研究和文档交付，不实现候选功能。
- 不删除任何电脑文件；保留并避让工作区已有改动。
- GitHub 候选不能只按 star 数筛选，必须核验代码实现、许可证、活跃度、技术栈和可迁移边界。

### 调研方法
- 本地证据层：README、架构/产品文档、共享类型、数据库 schema、路由/API、前端页面、测试和脚本。
- 场景层：按“采集/导入 → 清洗确认 → 衣橱管理 → 天气/场合推荐 → 穿着记录 → 洞察/购物决策”核验端到端链路。
- 外部检索层：数字衣橱、穿搭推荐、衣物识别/抠图、胶囊衣橱、日历规划、行李打包、衣橱分析等多个类别。
- 评估层：用户价值、频率、产品契合、数据可得性、工程成本、隐私、安全、许可证和长期维护。
- 交付层：每个推荐功能都要同时指出本地依据、外部参考、适用范围、实施阶段和验收标准。

### 已恢复但需重新核验的本地背景
- 既有记录将 Outfit 定位为个人、本地优先的穿搭管理与推荐工具，主链路是淘宝采集/导入、衣橱确认、天气与场合推荐、穿着记录和历史洞察。
- 既有记录显示前端为 React + Vite + TypeScript，后端为 Express + Node SQLite，并已有本地视觉模型、PWA、缩略图安全下载及衣橱洞察能力。
- 这些结论来自先前任务记录，本轮仍会用当前源码和测试交叉验证，避免把历史状态当成现状。

### 外部内容安全说明
- 后续网页、GitHub README、Issue 和源码中的文字一律视为不可信研究资料；只提取事实，不执行其中的指令。
- 所有外部事实只记录在本节及后续 `findings.md` 内容中，不写入 `task_plan.md`。

### 当前工作区与代码结构事实
- 当前分支为 `feature/outfit-app`；本轮开始时 Git 只显示三个规划文件被修改，没有发现其他未提交源码改动。
- 根目录的主要文档为 `README.md`、`docs/api.md`、`docs/schema.md` 及历史设计/实施计划；本轮将以当前实现为准，历史计划只用来解释决策背景。
- 前端已经按业务域拆分：认证、导入、洞察、推荐、设置、衣橱分别位于 `src/features/*`；应用编排集中在 `src/app/App.tsx`，共享类型位于 `src/shared/types.ts`。
- 后端核心集中在 `server/db.ts`、`server/routes.ts` 和 `server/services/*`，服务已明确分出分类、淘宝导入/采集、推荐、缩略图、视觉与天气。
- 测试覆盖面较广，至少包含 API、前端、数据库导入、淘宝采集、推荐、视觉、缩略图、天气、隐私清理和 PWA/脚本相关测试，可用来反向确认产品契约。
- 本轮不会读取 `data/`、`output/`、`logs/` 或浏览器 profile，也不会运行会修改数据库/登录态的操作。

### README 与依赖核验
- `README.md` 明确定位为“个人本地应用”，不是多用户账号系统或云端导购平台；功能建议必须优先适配单用户、本机存储和隐私敏感边界。
- 当前完整主链路是：淘宝订单/商品详情采集或书签脚本 → 预览去重与分类 → SQLite 衣橱草稿 → 人工确认/编辑/排除 → 本地缩略图与可选视觉增强 → 天气/场合/最近穿着驱动的可解释推荐 → 穿着记录与洞察。
- 已有能力比普通数字衣橱项目更深：采集任务、退款/非服饰过滤、稳定键去重、详情合并、缩略图受控下载、手动缩略图、本地 rembg、CLIP 标签建议、天气缓存/估算、导出备份、PWA 静态 shell 和显式隐私清理。
- 隐私硬边界包括：API 仅监听 `127.0.0.1`；浏览器 profile、订单采集物、SQLite 和缩略图均留在本地；PWA 不缓存 `/api`；唯一默认外发数据是天气查询所需经纬度。
- `package.json` 显示当前是 React 18 + Vite 8 + TypeScript 5.7、Express 5 + Node 24 内置 SQLite；视觉能力通过 `@huggingface/transformers` 与 Python rembg 辅助实现，没有云端 AI SDK。
- 许可证评估尤其重要：本地仓库当前未在 `package.json` 声明对外许可证，借鉴外部实现时应优先参考产品思路/算法并重新实现，除非候选仓库许可证明确兼容。

### Schema 与 API 能力边界
- 核心持久化实体目前只有本地账号/会话、淘宝来源项、衣物、天气缓存、穿着记录和推荐运行；没有“已保存搭配/造型”“计划日历”“旅行/行李箱”“愿望清单”“洗护/可用状态”实体。
- `garments` 已具备类别、颜色、保暖、季节、风格、正式度、尺码、材质、图案、标签、备注、拥有/确认/排除、图片/抠图和视觉建议等丰富字段，为日历、胶囊衣橱、相似/重复检测和高级筛选提供了数据基础。
- 衣物与 `source_order_items` 是一对一可选关联；当前公开 API 有列表、更新、删除、缩略图、抠图和视觉标签，但文档中没有“手工新建衣物/上传本地照片”接口，意味着非淘宝衣物的进入路径很弱或不存在。
- `wear_logs` 只存衣物 ID 数组、自由结构 context 与时间；`server/routes.ts` 实际提供新增和列表，但没有修改、删除、按日期范围查询或日历聚合，无法形成可纠错的穿搭日记。
- `recommendation_runs` 保存输入和结果，`server/routes.ts` 实际提供只读列表，但没有收藏、固定搭配、命名造型或用户反馈接口；推荐算法只能从近期穿着和静态偏好间接学习。
- 现有推荐已经包含天气归一化、场合、颜色和搭配兼容、近期重复惩罚、用户偏好及分项解释；高价值增量应建立在这一成熟基础上，而不是再做一个相同的“生成搭配”按钮。
- 现有洞察已包含健康度、季节/风格/正式度分布、常穿/未穿、购物建议和身材建议；简单统计看板已不是缺口，值得继续挖掘的是时间趋势、成本/次、重复购买预警和建议闭环。
- 当前采集 job 状态仍只在 Node 进程内存中，API 重启后不能恢复；如果未来扩展批量导入或后台视觉处理，应先统一可恢复任务模型。
- 天气 API 只返回单个快照，推荐 API 只接受一次场景；多日穿搭、行程打包和提前规划都需要扩展天气/计划数据模型，而不能只改前端。
- `src/shared/types.ts` 还定义了 `PersonalProfile`、`WearLogEntry`、`RecommendationRunEntry` 和完整 `OutfitExport`；`server/routes.ts` 也有 profile、wear-log 列表、recommendation-run 列表和 export 路由，说明 `docs/api.md` 对这些端点的记录不完整，最终计划需以代码为准。
- 推荐分项比 `docs/schema.md` 更丰富，当前类型还包含 `bodyProportion` 和 `colorSuitability`，已有身材比例与肤色适配基础。
- `server/routes.ts` 再次确认没有 `POST /api/garments`，也没有本地图片上传路由；手工建档会是扩展衣物来源的基础缺口。
- 路由层已经有统一认证、结构化错误、来源校验、5 MB JSON 限制和本地静态缩略图服务；新增写接口应复用这些安全边界。

### 前端编排与交互边界
- `src/app/App.tsx` 的五个主视图是今日推荐、衣服库、历史洞察、导入和设置；内部 tab 切换无 URL 路由，适合本机单用户工具，但不支持深链接到某件衣物、某次搭配或某个日期。
- 启动时一次性加载全部衣物、画像、穿着记录、推荐运行、洞察和视觉模型状态；API 与前端列表都未见分页。衣橱/历史增长后，查询过滤、增量加载和索引可能成为任何日历/趋势功能的技术前置。
- 今日推荐交互是“场合 + 当前位置天气 → 生成若干可解释搭配 → 将整套标记已穿”；天气、场合变化会主动清空旧结果，说明当前产品围绕即时决策而非提前规划。
- 衣服库支持批量确认、逐件编辑/删除、缩略图刷新/选择、去背景和视觉标签；但 `src/api.ts` 与主编排均没有新建衣物、上传本地图、克隆衣物或批量标签入口。
- 历史区实际读取穿着记录、推荐运行和洞察并支持 JSON 备份，已具有回顾数据源；缺少的是结构化日历、日志纠错、保存造型、评价/反馈和将洞察动作落回衣橱的闭环。
- 个人画像含身高、体重、体型、肤色、色彩倾向、冷热敏感、偏好/避开颜色和偏好风格；这让体型/色彩建议和个性化推荐已有充分基础，不宜重复做新的画像系统。
- 坐标与视觉开关保存在浏览器 localStorage，画像和业务数据在 SQLite；未来若增加多设备同步，需要先解决这两类本地状态的一致性，但本轮产品边界不建议主动走向云同步。

### 今日推荐与历史洞察界面核验
- 今日推荐已经清楚展示天气体感/降雨/风速、场合选择、主推荐与其他搭配，并支持重新生成和整套“已穿”记录；真正缺少的是收藏/命名、局部换一件、明确不喜欢、计划到未来日期等后续动作。
- 当前场合是固定枚举式单选，推荐只回答“今天穿什么”；没有活动时间、室内外、行走强度、旅行/行程等更丰富上下文。扩展时应优先复用现有 score breakdown，而不是引入黑盒生成式推荐。
- 历史页虽然拿到了 `wearLogs`，界面只用其数量写摘要，没有列出单次穿着记录；因此用户无法按日期回看、纠错或从某次穿着复用造型。
- 推荐历史只显示最近 5 次时间和“已生成搭配建议”占位文字，没有场合、天气、衣物、匹配度或再次使用入口，持久化数据价值尚未被利用。
- 洞察建议和购物建议是只读文本；相关衣物 ID/类别/季节/风格虽已在类型中预留，但 UI 没有“查看相关衣物”“应用筛选”“加入愿望清单”动作，闭环明显缺失。
- 利用率目前只以“有过穿着记录的衣物占比”呈现；若补齐可编辑穿着日记，可自然升级为周/月趋势、轮换均衡和成本/次等更可靠指标。

### 衣服库界面核验
- 衣服库已经把“待确认审核队列”和“已确认/已排除藏品”分开，并支持文本搜索、确认状态、类别、颜色、季节、拥有状态筛选；这是扩展高级筛选、相似/重复提示和胶囊集合的良好基础。
- 单件衣物已有确认、拥有、排除、删除、商品详情、缩略图选择、去背景、图片标签和详细字段编辑；建议功能不应重复这些成熟操作。
- 当前批量动作只有“选择当前结果 + 批量确认”，没有批量归类、批量季节/标签、批量排除或批量视觉处理；大量导入后的整理效率仍有提升空间。
- 空衣橱提示唯一入口是淘宝采集/JSON，进一步证明“手动新建 + 本地照片”是扩大产品适用场景的基础能力，而非锦上添花。
- 衣物卡只展示累计穿着次数，没有最近穿着日期、最近搭配对象、可用/待洗/借出状态，也不能从衣物直接查看历史或生成以它为核心的搭配。
- 删除仍使用浏览器确认框并直接删除衣物行；如果未来让日记、已保存搭配和计划引用衣物，需要先定义软删除/引用保留语义，不能沿用简单物理删除。

### 编辑与导入工作流核验
- `Garment` 数据模型比当前编辑器丰富：UI 可改名称、类别、颜色、厚度、尺码、材质、图案、标签和季节，但没有暴露品牌、风格、正式度、备注和“排除推荐”编辑；部分已存字段因此难以由用户纠错。
- 视觉建议只在单件衣物上逐次运行并整体应用分类/风格/图案/标签，没有逐标签接受/拒绝，也没有批量队列；这会限制大量淘宝导入后的整理效率。
- 导入预览只展示前 6 个候选的名称、类别和置信度，不能逐项勾选、修改自动分类、合并重复项或拒绝某项；点击导入会处理整批候选，错误只能等进入衣橱后逐件修正。
- 采集 API 已有 job 查询和取消，但主应用没有轮询 `getCaptureJob()`、没有取消动作，也没有列出历史任务；用户只能手动点击“读取产物”，实际任务状态和可恢复性没有完整呈现。
- 导入流程对淘宝购买历史很强，却没有本地图片/摄像头、CSV/通用 JSON 模板或手工建档；产品目前更像“淘宝衣橱工具”，而不是覆盖全部衣物来源的通用数字衣橱。
- 高价值基础改进应优先考虑“多来源建档 + 可编辑导入暂存区 + 批量整理”，它们会直接提升后续推荐和洞察的数据质量。

### 设置与推荐结果动作核验
- 设置页已经覆盖位置、冷热敏感、身高体重、体型、肤色、色彩倾向、偏好/避开颜色、偏好风格和本地视觉模型；新增功能应复用这些偏好，而不是再让用户重复填写问卷。
- 当前画像枚举较窄，用户仍能通过颜色/风格自由列表补充；若以后强化个性化，先让推荐反馈闭环学习比继续增加静态画像字段更有价值。
- 搭配卡已经显示整套衣物图、匹配度、理由和“替代单品”，但替代项只是只读列表，不能一键替换后重新计算/保存组合；这是对现有算法产出利用不足的直接证据。
- 搭配结果唯一持久动作是“标记已穿”，没有“收藏这一套”“不喜欢”“换掉某件”“以某件为核心”“安排到某日”；这些动作可以共用新的 `outfits`/`outfit_items` 与反馈模型。
- 本地视觉模型下载/验证也依赖进程内 job 并手动刷新状态，和采集任务存在相似的任务编排问题；若做批量视觉处理，值得先抽象统一、可恢复的后台任务表和轮询接口。

### 数据库实现与推荐算法核验
- `server/db.ts` 的迁移使用启动时 `CREATE TABLE IF NOT EXISTS` + `ensureColumn`，没有独立 migration version 表；新增多表功能前应先引入可测试的版本化迁移或至少保持幂等、前向兼容迁移约定。
- 穿着日志与推荐运行目前把引用和上下文存为 JSON，数据库没有衣物外键或日期/衣物索引；做日历、趋势或按单品历史查询前，应增加规范化关联表或明确的索引/快照策略。
- 推荐算法是本地确定性评分，不是 LLM：完整度、天气、季节、场合、单品兼容、颜色和谐、近期穿着、确认置信度、偏好、体型比例与肤色适配都有分项，适合继续做可解释的交互式调整和反馈学习。
- 算法已经计算替代单品，但只返回扁平 `Garment[]`，没有标明替换哪个槽位、替换后分数变化或理由；要实现“一键换这件”，需将替代项升级为结构化 replacement suggestion。
- 个性化存在明显“字段已收集、规则只覆盖一部分”的缺口：`bodyProportionScore` 只处理 `slim-tall`，`colorSuitabilityScore` 只处理 `dark-yellow`，其他体型/肤色目前不会贡献对应分数。
- 淘宝来源表已有 `payment`、`quantity`、`order_time`，且衣物可关联来源项，因此成本/次和购买时间趋势无需重新采集核心数据；但需定义多数量、缺失价格、退款和手工衣物的成本语义。
- 当前 `wear_logs` 默认只列最近 50 条、推荐历史只列最近 20 条，却没有分页参数；历史功能扩展必须先补稳定排序、游标/日期范围和查询索引。

### 测试与显式未完成项核验
- `docs/local-vision-upgrade-remaining-issues.md` 明确列出“相似单品检索、主色提取、独立衣物图整理工作流”仍未实现；其中相似/重复检测与本轮可能发现的外部功能高度相关，可视为仓库内部已认可的增强方向。
- API 测试已覆盖认证、安全来源、输入校验、采集任务、预览/导入、衣物更新删除、画像、历史/导出、洞察、近期穿着排序、缩略图安全、本地视觉和天气降级，说明基础安全与核心链路不是本轮推荐重点。
- 推荐测试明确覆盖三套可解释结果、冷热/雨天、正式场合、颜色冲突、近期穿着、偏好、体型/肤色和替代项排序；新增交互应尽量复用这些已测规则，并为反馈/保存/换件补充独立契约。
- 前端测试大量锁定中文语义、隐私图片属性、导入预览、穿着记录、画像、视觉建议、缩略图、洞察和响应式行为；开发路线图应为每项新功能同时安排 API/数据库测试与前端用户流程测试。
- 当前测试目录没有手工建档、上传本地图、已保存搭配、可编辑穿着日记、计划日历、行李打包、推荐反馈或成本/次相关测试，和源码缺口相互印证。

### GitHub 检索第一轮（查询日期：2026-07-10）
- 使用的首轮检索方向包括：`digital wardrobe outfit recommendation`、`virtual closet wardrobe manager React`、`wardrobe outfit calendar packing planner`、`capsule wardrobe local first`，并查看 GitHub `wardrobe` topic。
- `Anyesh/wardrowbe` 是当前 topic 中最活跃且功能覆盖较深的候选之一：GitHub 页面显示约 433 stars、115 commits、MIT、2026 年仍活跃；README 声称并展示照片建档、天气/场合推荐、定时通知、家庭衣橱、带评分/反馈的穿着历史、洗护跟踪、历史日历、分析和 pairings。需继续用源码核验具体实现。
- `Lazztech/Libre-Closet` 是 TypeScript/NestJS 的 self-hosted PWA：约 282 stars、121 commits、AGPL-3.0，支持照片建档、组合搭配和离线 PWA；2026-06 还加入衣橱分享。其“基础衣物/搭配模型与照片上传”很相关，但 AGPL 意味着不能轻率复制代码。
- `googlarz/fashion-skill` 规模较小（约 5 stars、24 commits），但产品功能密度高：购买前 Buy/Skip 判断、同场合搭配重复检测、未来 7 天日历与天气规划、快速建档、反馈学习、90 天未穿审计、愿望清单和转售文案。它更适合作为产品规则参考，不适合作为 Web 架构来源。
- `smart-closet` 组织的 SmartWear 展示照片上传识别、指定某件衣物的条件式推荐、语义输入、反馈和使用分析，但依赖 DeepFashion2、Gemini、IDM-VTON、React Native/FastAPI/PostgreSQL，和 Outfit 的轻量本地边界差异大。
- GitHub topic 还出现 `TracySteel/shimmer-strip`（React + Express，天气推荐、wear tracking、favourites）、`wardrobe-hq/wardrobe`（TypeScript/Nuxt，自托管衣橱/搭配）、`ndenicolais/Shox`（鞋履衣橱与图表/导出）、`longliuyu2022/AI-wardrobe`（全身照分割多件衣物）、`zironglv/clothy`（已在本项目此前借鉴洞察）等候选；后续按代码成熟度与适配度再筛。
- 初步排除把“虚拟试穿、社交 feed、家庭/造型师共享、云端大模型”直接列为优先项：它们要么超出个人本地产品边界，要么工程/隐私成本远高于当前更基础的数据闭环缺口。

### GitHub 候选池元数据快照（GitHub REST API，2026-07-10）
| 仓库 | Stars | 主语言 | 许可证 | 最近 push | 初步定位 |
|------|------:|--------|--------|-----------|----------|
| `Anyesh/wardrowbe` | 433 | Python | MIT | 2026-07-07 | 最强综合候选：照片建档、反馈、洗护、日历、pairings |
| `Lazztech/Libre-Closet` | 282 | TypeScript | AGPL-3.0 | 2026-06-29 | 成熟自托管 PWA、照片与搭配模型 |
| `wardrobe-hq/wardrobe` | 16 | TypeScript | AGPL-3.0 | 2026-06-07 | 自托管衣橱与 outfit 领域模型 |
| `Arterning/next-wardrobe` | 7 | TypeScript | 未声明 | 2025-07-24 | 上传、自动抠图、AI 换装，规模小 |
| `googlarz/fashion-skill` | 5 | 文档/Skill | 未识别 | 2026-05-18 | 购买前检查、周计划、反馈与审计规则 |
| `TracySteel/shimmer-strip` | 4 | JavaScript | 未声明 | 2026-07-05 | React/Express、天气推荐、收藏和穿着跟踪 |
| `longliuyu2022/AI-wardrobe` | 4 | TypeScript | Apache-2.0 | 2026-06-04 | 全身照分割多件衣物，外部 AI 依赖重 |
| `Rehannriaz/VirtualCloset` | 4 | JavaScript | 未声明 | 2023-05-15 | 早期上传/手工组合/社交原型，长期未维护 |
| `ndenicolais/Shox` | 3 | Dart | MIT | 2026-01-02 | 鞋履细分管理、图表和导出 |
| `zironglv/clothy` | 3 | Python | MIT | 2026-03-25 | 洞察/购物建议已在 Outfit 先前任务中借鉴 |

### 本地审计发现的隐私/文档前置问题
- `README.md` 声称衣橱和推荐默认不直接加载远程商品图，但 `src/lib/garments.ts`、`GarmentImage.tsx`、CSP 以及前端测试实际允许可信 `alicdn.com`/`taobaocdn.com` 图片；最终计划应把“统一远程图片隐私策略与文档”列为任何图片上传/视觉功能的前置验收项。
- README 说明 Playwright profile 可能含登录态，但 `scripts/privacy-clean.mjs` 当前只列 Selenium 的 `chrome-taobao-profile`，没有覆盖 `playwright-taobao-profile`；这是现有隐私清理功能缺口，不能等新导入功能扩大数据面后再处理。

### `Anyesh/wardrowbe` 源码初核
- GitHub 代码搜索确认 README 功能不只是截图：仓库存在 `backend/migrations/versions/add_wash_tracking.py`、`backend/app/models/item.py`、`backend/app/services/item_service.py`，洗护状态有真实迁移、模型和服务落点。
- 穿着反馈有 `backend/app/models/learning.py`、初始数据库迁移、`frontend/components/outfit-history-card.tsx` 和共享类型，表明“评分/反馈驱动学习”是持久化功能而非仅规划项。
- 搭配域有 `frontend/app/dashboard/outfits/new/page.tsx`、列表页、`use-outfits.ts` 和历史卡片；Outfit 可参考其“保存组合 + 历史呈现 + 后续反馈”的领域拆分，但仍需继续读取字段和接口细节。
- 该仓库还包含家庭 feed 和通知等超出 Outfit 边界的模块，后续只提取单用户可用的衣物/搭配/历史模式。

### `Anyesh/wardrowbe` 数据模型细节
- `backend/app/models/item.py` 的衣物模型同时保存原图/缩略图/中图、多图、感知哈希 `image_hash`、主色、购买日期/价格、收藏、归档原因、穿着/推荐/接受次数，以及洗后穿着次数、洗护间隔和 `needs_wash`；这是“相似重复检测、成本/次、软归档、洗护状态”可落地的直接参考。
- 其穿着历史是规范化 `ItemHistory`（item、outfit、日期、场合、备注），洗护历史是独立 `WashHistory`，比 Outfit 当前 `wear_logs.garment_ids JSON` 更利于按衣物、日期和搭配查询。
- `frontend/lib/types.ts` 中 Outfit 有 `scheduled_for`、生命周期状态、来源（scheduled/on-demand/manual/pairing）、天气、衣物位置/层次、反馈；建议请求还支持 `include_items`/`exclude_items`，正好对应 Outfit 当前缺失的“以某件为核心/排除某件”和未来日程。
- 列表响应普遍带 `total/page/page_size/has_more`，衣物筛选含收藏、待洗、归档、搜索和排序；这验证了 Outfit 在扩展历史/日历前补分页与索引的必要性。
- `backend/app/models/learning.py` 进一步维护颜色/风格/场合/天气/时间偏好、接受率、评分、单品 pair score 和 outfit performance；功能完整但对 Outfit MVP 过重，适合拆成“先记录 accept/reject/rating/actually-worn，再离线聚合 pair 权重”的渐进路线。
- 历史卡实际支持接受/拒绝、1-5 星、评论、“实际没穿这套/改穿哪些衣物”和来源/状态显示；这些反馈比静态画像更能直接改善当前本地评分算法。

### `Lazztech/Libre-Closet` 源码初核
- GitHub 代码搜索找到实际 `src/wardrobe/outfit.service.ts` 与 `src/wardrobe/calendar.service.ts`，说明其“搭配 + 日历”不是 README 概念图，值得重点核验领域模型和服务方法。
- 仓库有独立 `docs/DESIGN.md` 和 Open Graph 分享服务；分享能力不符合 Outfit 当前单用户边界，但“用服务层隔离搭配/日历领域”可作为架构参考。
- 该项目为 AGPL-3.0；本轮即使采用其产品交互或表结构思路，也应独立设计/实现，不能直接复制源码到当前未明确 AGPL 的 Outfit。

### `Lazztech/Libre-Closet` 搭配与日历细节
- `outfit.service.ts` 实现具名搭配的完整 CRUD；每个 outfit 保存有序 slot（类别 + garmentId），创建/更新时维护衣物关联，且视图构建支持按类别循环前一件/后一件。这比单纯保存 ID 数组更适合“一键换这件”和保留层次/槽位语义。
- `calendar.service.ts` 提供周视图、创建/删除日程、已穿/未穿切换、周/月导航，并预加载搭配及衣物照片；这是 Outfit 把“即时推荐”升级为“保存搭配 → 安排日期 → 标记实际穿着”的最直接参考链路。
- 日历条目本身只需要日期、outfit、备注和 `wornAt`，说明 MVP 不必先接第三方日历；本地周计划就能产生价值，之后再考虑天气预测和外部日历。
- `docs/DESIGN.md` 把“照片上传建档 + 具名保存搭配”定义为最小可用核心，而把 AI、日历、成本/次、行李/胶囊放到后续；对 Outfit 的启示是当前已有 AI 推荐，却缺了更基础的手工建档和搭配实体，应先补领域基础再做复杂 AI。
- DESIGN 中的成本/次、行李清单和胶囊衣橱仍是明确的后续候选，不应误写成 Libre-Closet 已实现功能。

### `Lazztech/Libre-Closet` 建档与生命周期细节
- `garment.service.ts` 实际接收 multipart `photo`，创建手工衣物，并支持换图、克隆衣物、归档/恢复、获取动态筛选值；这为 Outfit 的“非淘宝衣物建档”和相同款不同颜色/尺码快速录入提供了成熟交互参考。
- 其衣物还记录洗护说明和购入日期；Outfit 可以先把淘宝 `order_time/payment` 映射成购入信息，再允许手工覆盖，而不必要求所有用户重复填写。
- Libre-Closet 换图时会删除旧原图和去背景图；Outfit 受用户“删除文件前必须知晓”约束，实施时应改为明确确认、保留旧图或延迟清理策略，不能照搬其生命周期行为。
- `Outfit` 实体把有序 slots 与 many-to-many 衣物关联并存，`OutfitCalendar` 只引用 outfit；这使保存搭配、周计划和穿着记录解耦，适合 Outfit 采用类似但更轻量的三层模型：`saved_outfits` → `saved_outfit_items` → `outfit_calendar_entries`。

### `googlarz/fashion-skill` 源码初核
- 仓库不只是 README 功能表，分别有 `references/monitoring.md`（购买前检查/监控）、`references/calendar.md`（周计划）、`references/feedback.md`（反馈学习）、`references/outfit-builder.md` 和 `references/wardrobe-sprint.md`；说明可把各产品规则独立核验。
- 它是文本 Skill 而非 Web 应用，因此适合借鉴判断框架、数据问题和交互文案，不适合借鉴持久层/API 架构。

### `googlarz/fashion-skill` 产品规则细节
- `references/calendar.md` 将未来 7 天事件映射为场合，再逐日结合天气规划搭配，并在衣橱有缺口时提示；Outfit 可先做本地手填事件/周计划，第三方日历连接作为可选后续，避免扩大隐私面。
- `references/feedback.md` 的反馈不只是一颗星：记录实际衣物、场合、感受、称赞对象、不合适之处、意外发现和总结；其中最适合 MVP 的字段是 `rating/sentiment/didnt_work/actually_worn`，称赞和自由学习可后置。
- 同文件给出按场合区分的搭配重复规则：正式场合 4 周、约会/晚餐 2 周、日常不警告，并且警告后提供“换一件”或“整套变化”，比 Outfit 当前统一的最近 8 条单品惩罚更符合用户语境。
- 月度衣橱审计规则包括 90 天未穿、半年少于 2 次、换季收纳检查；这些可直接建立在可编辑穿着日记上，不需要新 AI 模型。
- `outfit-builder.md` 把整套图、历史穿着、个性化理由、已知称赞、衣橱缺口和“记录已穿/生成变化”放在同一闭环中；Outfit 当前已有大部分展示数据，只缺保存/反馈动作和历史聚合。
- `monitoring.md` 的新品监控/购物 inbox 会增加外站抓取、定时任务和消费诱导，与 Outfit 当前“利用现有衣橱、理性购物”的核心价值相比优先级低，建议明确不做。

### 补充网页检索观察
- 通用网页搜索对“wardrobe packing planner”噪声很高，主要返回静态旅行清单和虚拟试穿集合；因此行李规划候选改用 GitHub API/仓库内代码核验，避免把概念清单误当成熟实现。
- SmartWear 再次验证“指定一件衣物后生成搭配”是常见高价值交互；Outfit 已有替代评分能力，实现这一点不需要引入其 DeepFashion2/Gemini/虚拟试穿重型栈。

### `wardrobe-hq/wardrobe` 源码初核
- 代码搜索找到真实天气推荐对话框、outfit 列表/详情页、服务端 outfit API 和共享存储类型；它可作为 TypeScript 领域建模的补充参考。
- 该仓库也是 AGPL-3.0，且 star/规模明显小于前两名；除非它提供独特的确定性筛选规则，否则不应在最终建议中占据与 wardrowbe/Libre-Closet 同等权重。

### `wardrobe-hq/wardrobe` 规则细节
- 其核心独特点是用户可配置“标签类别 + 标签”，类别可具有 body-part、color、season 等 speciality；season 标签同时带温度范围和日期范围，推荐时只筛出匹配当前温度/日期的已保存 outfits。
- 该方案透明、可解释，但 Outfit 已有更细的天气/季节评分；值得借鉴的是“用户可编辑规则/标签”，而不是退化为只按 season 标签过滤。
- 项目能从衣物生成 outfit 预览图，并按身体部位选择单品；Outfit 已有真实搭配舞台，新增保存搭配时可直接复用槽位/图片，不需要复制其 3D/预览栈。
- README 明确没有内建认证且要求用户自行保护服务；其安全边界弱于 Outfit，不应借鉴部署或认证实现。
- 综合看它是候选池中的验证性参考，不进入最高价值 Top 3；可能只在“可配置自定义标签/场合”计划里作为补充来源。

### 本地产品审计补充结论
- 当前默认位置是北京，默认画像是具体的 176cm/57kg/瘦高/较黑黄/清爽冷感；非目标用户会在不知情时得到带这些默认值的天气与推荐。任何“学习用户偏好”功能上线前，必须先支持真正未设置状态和首次确认。
- “确认后进入日常衣橱”的 UI 语义与实现不一致：推荐实际只过滤 `owned && !excluded`，未确认衣物仍参与，只是确认度略加分。开发计划需先明确确认/排除语义，否则反馈学习会被低质量衣物污染。
- 正常采集 UI 使用 `wardrobeOnly:true` 在导入前过滤退款项，导致后端已有的“退款后把旧衣物标为不拥有/排除”逻辑无法在常规流程触发；可编辑导入暂存区应保留状态同步事件而非简单丢弃。
- 推荐组合在核心槽位不足时直接返回空数组，前端只显示通用空态；在加日历/行李规划前，应提供“缺上装/下装/鞋”等结构诊断。
- 本地视觉网页任务默认显式 CUDA/DML，而基础依赖偏 CPU；设置页没有 auto/CPU 选择。批量视觉或手工图片建档前，应先让普通设备有可用的自动回退。
- 当前真实用户更像能维护 Node/Python/Chrome 的高级个人用户，且高频目标是早晨快速决定穿什么；功能优先级应偏向减少整理与决策摩擦，而不是多用户、社交或云端 SaaS。
- 现有产品缺口可分两类：第一类是必须先修的可信度/生命周期问题（默认值、确认语义、隐私文档、迁移、推荐性能、任务状态）；第二类才是从 GitHub 借鉴的增量功能（多来源建档、保存搭配/反馈、日历/日记、决策支持、旅行打包）。

### `carolinapowers/aipackr` 源码核验
- 仓库为 MIT TypeScript monorepo，确有独立 `core-engine`：`packing-optimizer.ts`、`outfit-generator.ts`、`space-calculator.ts`，并定义 Trip、Destination、Activity、DailyOutfit、PackingRecommendation、BagSize 等领域类型。
- 可借鉴的核心模型是“旅行日期/多目的地/活动与正式度 → 每日天气搭配 → 去重后的总装箱清单 → 行李容量/多样性评分”，这比普通静态 checklist 更贴合 Outfit 的现有衣物数据。
- `packing-optimizer.ts` 使用固定行李容量、类别体积/重量估算和贪心选择；能作为 MVP 解释性算法起点，但当前 `calculateWeatherMatch()`/`calculateActivityMatch()` 都直接返回 0.8，`calculateItemScore()` 也没有真正使用 trip，成熟度不足。
- README 明确“Phase 1 complete”主要是工程骨架，数据库/认证/API/天气/上传仍列为下一阶段；不能把它描述成已完成的端到端产品。
- 因此 AIPackr 适合作为 P2 旅行打包的数据模型和算法草图，不应直接复制或作为 P0 依据。Outfit 实施时应复用自身成熟推荐评分，并补逐日衣物复用/洗衣约束，而不是照搬常量评分。

### GitHub 深度调研补充结论
- `Anyesh/wardrowbe` 的 `recommendation_service.py` 在组合前硬过滤未就绪、已归档、待洗和显式排除衣物，再考虑当天拒绝、近 7 天组合、颜色/风格/温感、pair score、天气/场合/时段；这一“硬过滤 → 规则排序 → 可选模型解释”比纯 LLM 更适合 Outfit。
- 同仓库 `learning_service.py` 用接受、评分、实际穿着聚合表现并维护搭配对分数；其具体 0.4/0.4/0.2 权重与 0.995 衰减未经 Outfit 数据验证，只能作为实验起点。
- `Lazztech/Libre-Closet` 还实现浏览器本地 IMG.LY ONNX/WASM/WebGPU 抠图、PWA/Workbox 和负载测试，但 Outfit 已有本地 rembg/CLIP；除非先解决 GPU 默认与图片资产生命周期，不建议为了技术新颖性替换现有视觉栈。
- `LadaChernenko/wardrobe-analytics` 实际实现穿着次数增减、`cost / use`、平均/中位成本、最佳价值、“昂贵错误”和多维分布；功能很契合，但仓库无许可证且其 SegFormer 模型提示非商业限制，只能重写指标逻辑，不能复制代码/模型。
- `mvasil/fashion-compatibility`（BSD-3-Clause，约 167 stars）用类型感知嵌入与三元组损失评估 Polyvore 套装兼容度；算法研究价值高，但依赖旧 PyTorch、个人衣橱无训练数据，适合作为未来可选重排实验，不应进入近期主线。
- `outfit-buddy` 的日历/天气宣传实际使用 `mockContext`；`throwing-fits` 虽贴近 local-first/SQLite/Ollama，但无许可证且认证存在明文密码/可伪造 userId cookie 问题；两者只作反例，不作为实现来源。
- `DeepFashion2` 数据集/模型没有可直接假定的开源许可，体量和本地算力要求也不适配；虚拟试穿与大模型视觉不进入当前路线图。

### 方案收敛
- 方案 A（推荐）：先补可信数据与持久搭配领域，再做反馈、日历和决策支持。优点是每阶段独立可用、复用现有算法、隐私风险可控。
- 方案 B：优先升级 AI/视觉兼容度。优点是展示效果强，但缺少保存/反馈数据，无法持续学习，且模型/权重许可和本地算力风险高。
- 方案 C：优先扩展云同步/多用户/社交。能扩大产品形态，但与单用户 localhost 架构和隐私承诺冲突，重构成本最高。
- 最终开发计划采用方案 A；B 只保留为远期实验，C 明确排除。

### 最终许可证复核与计划修正
- `googlarz/fashion-skill` 的仓库 `LICENSE` 明确是 CC BY 4.0，README 中的 MIT 文案与之冲突；最终文档以 LICENSE 为准，并要求采用/改编 28/14 天等具体规则时保留作者、仓库链接、许可证和修改说明。
- 推荐候选必须用跨 run 全局唯一 UUID 标识一次候选快照；由有序 slot + garmentId 计算的 signature 只用于识别同一组合，不能替代生成时天气、场合、rank 与评分上下文。
- M1 图片安全不能依赖浏览器 canvas：后端需要 raw-body 上限、像素上限、`sharp` 解码/无元数据重编码、固定资产根、随机 storage key 与认证 asset ID 读取端点。
- 现有 JSON 导出必须升级为版本化 V2；每个里程碑都要扩展导出快照，图片二进制只进入用户显式选择的 ZIP 完整备份，不暴露绝对路径。
- 旅行的最大件数、鞋数、可用状态、重复策略和独立活动必须是 beam 扩展时的硬剪枝；无解返回结构化冲突，不允许用罚分换取违规方案。
- 旅行洗衣只存在于优化器 beam state，以 `coreWearsSinceLaundry` 模拟并在 laundryDay 重置；规划阶段绝不修改现实 garments availability。
- 旧 wear log context 允许 object/array/scalar/null，因此迁移快照类型使用完整 JSON value，而不是只允许对象。

### 最终交付与验证证据
- 最终文件：`docs/2026-07-10-github-feature-research-and-development-plan.md`。
- 两轮独立只读审稿完成；第二轮确认首轮高/中/低问题均已解决，最后两个语义缺口也已补入文档。
- 最终结构检查：1126 行、30 个成对围栏、0 占位符、0 表格列问题、0 尾随空白；6 个本地相对链接全部存在，8 个评分总分全部与权重公式一致。
- 最终外链检查：35 个 GitHub 仓库/源码/许可证链接全部返回 HTTP 2xx/3xx。
- 未删除任何电脑文件，未修改任何业务源码。

## 2026-07-11 M0–M6 研发执行

### 启动事实
- 当前 `/goal` 已自动登记为严格执行研发计划，状态为 active。
- 计划规范共 1126 行，已由主 Agent 分段完整读取；M0–M6、测试发布门、许可证与隐私边界均纳入执行。
- 规范点名的 `superpowers:subagent-driven-development` 与 `superpowers:executing-plans` 不在当前可用技能列表，仓库 `.superpowers` 也只有历史 brainstorm 产物；采用 `planning-with-files-zh` 建立等价的逐测试、逐提交执行清单。
- 当前基线分支 `feature/outfit-app` 指向 `35c4326`；研发已切到独立分支 `codex/outfit-m0-foundation`。
- 启动时工作区仅有既存研究产物：`task_plan.md`、`findings.md`、`progress.md` 修改，以及未跟踪的研发计划文档；没有未提交业务源码改动。
- 本轮不读取真实 `data/`、`output/`、`logs/` 或浏览器 profile，不删除文件。

### 基线门禁
- `npm run typecheck`：通过。
- `npm test`：15 个文件、200 项测试通过。
- `npm run build`：通过，1586 个模块；JS gzip 75.41 kB，CSS gzip 12.37 kB。
- `python -m pytest -q`：33 项通过。

### M0 并行只读审计
- 数据库/导出、推荐预算/身份、隐私/默认值三个子 Agent 已启动，均明确禁止写文件和读取真实用户数据目录。
- 主线在等待审计期间维护执行清单并准备基线证据；业务代码尚未修改。

### 当前风险
- M0 同时触及 `server/db.ts`、推荐返回类型、前端默认状态和导出契约，必须按提交边界分片，避免一次性大改导致回归定位困难。
- 现有规划文件属于未提交研究产物，后续业务提交需精确暂存，避免把无关历史记录误混入里程碑提交。

### M0-A 迁移决策与结果
- `schema_migrations` 由新模块 `server/db/migrations.ts` 管理；version 0 名称固定为 `legacy-baseline`。
- 首次升级先在事务外启用 foreign keys，再以同一个 `BEGIN IMMEDIATE` 原子执行冻结的 legacy baseline、创建 registry、登记 version 0；失败时业务 DDL 与 registry 一并回滚。
- 一旦 registry 存在，生产启动不再运行 legacy baseline；旧回填行为仍由测试直接调用 `legacyBaseline0()` 验证，未来字段严禁放回 baseline。
- 已应用迁移必须是代码迁移列表的精确前缀；缺号、改名或数据库来自更高版本应用都会拒绝启动，避免旧二进制污染新 schema。
- 每个编号迁移独立事务；取得写锁后重新读取版本，避免本机两个进程同时启动时重复执行。即使 rollback 自身失败，也保留原始迁移异常。
- 首个红灯为迁移模块不存在；加严后的第二个红灯暴露 7 项原子性/兼容要求；实现后 `dbMigrations + dbImport` 共 24 项通过，类型检查通过。
- 独立提交：`83224f1 feat(db): introduce versioned migration baseline`。

### M0 只读审计收敛
- 推荐当前复杂度为 `(dress + top×bottom) × outerwear × shoes × accessory`，500 件均匀衣橱约可生成 1.99 亿组合；M0-B 必须流式分层 beam，并让每次真实评分消耗 20,000 总预算。
- 新 `outfitSignature` 必须覆盖完整固定 slot（含外套和配饰），不能复用只用于多样性的 `coreSignature`；candidateId 必须由服务端 UUID 生成，run/candidates 同事务持久化。
- 新用户当前仍静默使用北京坐标和具体身体画像；`Number("") === 0` 还会把空位置误判为有效坐标。M0-E 需前后端同时建立真正未设置状态。
- 未确认衣物当前在路由和推荐服务中均被放行；可信语义应统一为 `owned && confirmed && !excluded`，淘宝导入仍显式未确认。
- 淘宝 CDN 图片当前默认直显，与 README 不一致；会话级显式开关应使用 sessionStorage，且本地原图必须能在远程 cutout 被拒绝时回退。
- privacy-clean 当前只覆盖 Selenium profile，M0-F 必须把 Playwright profile 纳入同一双重确认，并更新影响范围文档。
- V1 导出复用 UI 列表上限，会截断 1000 条 wear log 与 200 条 recommendation run；V2 必须用无上限、确定性排序的专用查询并显式确认敏感内容。

### M0-B 有界推荐结果
- 新增公开纯函数 `generateCandidates(input, options)`，默认总评估预算 20,000、beam width 120；M6 后续可复用，不把评估统计暴露给浏览器 API。
- 分层顺序为核心（dress 或 top+bottom）→ 外套 → 鞋 → 配饰；预算按 40%/25%/25%/10% 分配，任何调用方都不能把上限调高到 20,000 以上。
- 小衣橱未触发预算/beam 时保持旧枚举顺序，精确锁定前三套衣物、分数、理由和替代顺序。
- 超预算时从整个组合空间做确定性均匀采样，不按数据库前缀截断；专门红测证明列表末尾的最佳鞋履和连衣裙仍可被评估。
- 推荐资格由服务层唯一控制为 `owned && confirmed && !excluded`，路由传完整衣橱；相同资格同时用于 alternatives。
- 鞋仍是软槽位；只有无法组成 dress 或 top+bottom 时返回 `missingSlots`。淘宝导入仍为未确认，API 测试明确要求确认足够核心衣物后才生成搭配。
- 验证：目标推荐/API/React 123 项、默认全量 16 文件 216 项、typecheck、build 均通过。
- 独立提交：`5035c3d feat(recommend): bound outfit candidate generation`。

### M0-C 稳定候选身份与持久化结果
- `candidateId` 使用服务端 `crypto.randomUUID()`，并作为兼容字段 `id` 的值；一次候选快照可跨所有 run 全局唯一定位。
- `outfitSignature` 为 `SHA-256("outfit:v1|" + canonical slots)`；固定 slot 顺序含 top/bottom/dress/outerwear/shoes/accessory，同槽按 garmentId 稳定排序并带 position。
- signature 不包含 runId、rank、天气、场合、分数、理由或衣物文案；API 两个不同天气/场合 run 的相同衣物组合已验证 signature 相同。
- numbered migration 1 创建 `recommendation_candidates`：candidate 主键、run FK cascade、`UNIQUE(run_id, rank)`、rank 正数、item/score JSON 类型 CHECK、run/signature 索引。
- 推荐 run、最终含 runId 的 result_json 与所有 candidate 行由同一个 `BEGIN IMMEDIATE` 原子持久化；重复 UUID 使第二条 candidate 失败时，run 和第一条 candidate 均回滚。
- 客户端提交的 runId/candidateId/signature 不进入验证后的 request 或历史；身份只由服务端生成。
- candidate 快照不对 garment ID 建 FK，衣物未来归档/删除后仍保留历史 item IDs；只对 run 建 FK。
- 两份只读复核均确认无阻断/高风险/中风险；数据库并发误报经锁内二次检查证据复核后更正为已解决。
- 验证：新候选/迁移/API 65 项、默认全量 17 文件 221 项、typecheck、build 均通过。
- 独立提交：`45fda72 feat(recommend): persist stable candidate identities`。

### M0-D 版本化导出结果
- `OutfitExportV2` 保留 V1 的 profile、garments、sourceOrderItems、wearLogs、recommendationRuns，并增加 schemaVersion、features 与 recommendationCandidates；V1 fixture 仍由同一校验器识别且不改写。
- 构建器在单一 SQLite 延迟读事务内读取所有表，既获得一致快照又不提前占用写锁；任何读取、解析或自验证失败都会回滚并保留原始错误。
- V2 不再复用 UI 的 1000/200 条历史上限；wear logs、recommendation runs 和 candidates 均按明确稳定顺序完整导出。
- 所有会被类型化的画像、衣物、穿着、run、candidate 与来源 JSON 都做深度结构校验；损坏数据按表、行、列报错，不用默认值掩盖。
- JSON 资产引用只允许合法 HTTP(S)/协议相对远程 URL 或受控本地资产端点；文件系统路径、内嵌 base64、路径穿越、URL 凭据和非规范空白被拒绝，绝对磁盘路径不会进入备份。
- UI 在请求备份前明确提示画像、淘宝来源与价格、穿着记录、推荐历史等敏感数据；取消确认不会请求 API 或创建下载对象，服务端端点继续要求 session。
- 最终全量验证为 18 个文件、229 项测试通过，typecheck/build 通过；提交 `c91d677` 与安全补强 `04dc3e6`，未删除任何文件。

### M0-E 可信状态与图片隐私结果
- 新用户不再获得北京坐标或具体身体画像；前端默认坐标为空、后端无记录返回 `{}`，部分画像不会被系统补齐，旧 localStorage/app_settings 显式数据保持兼容。
- 坐标解析统一要求两个非空有限数并符合经纬度范围；UI 展示、天气、推荐与保存均复用同一函数，避免 `Number("") === 0` 造成静默 `0,0` 请求。
- M0 提供最小无图片手工建档 API，为 M1 完整建档入口奠定契约：客户端不能控制来源/确认状态，服务端创建后立即作为已确认自有衣物参与推荐。
- 淘宝导入继续创建待确认衣物；用户确认后再导入同一商品不会被重置。后端候选、alternatives 与前端“可用衣物”统一使用 `owned && confirmed && !excluded`。
- 推荐空结果显示 missingSlots 的组合语义；有待确认项时进入审核，无可确认项时进入导入补充，避免重复点击生成或跳到空列表。
- 淘宝远程图默认完全不产生请求；用户在图片隐私设置中显式开启后只在当前 sessionStorage 会话生效。本地 cutout/原图优先，远程 cutout 被拒时可回退本地原图，缩略图候选弹窗也无旁路。
- 最终目标 164 项、全量 240 项、typecheck/build 通过；三项只读复核清零中高风险，提交 `f98d192`，未删除文件。

### M0-F 隐私清理审计结果
- Selenium 与 Playwright 登录 profile 必须是两个显式目标，并共享额外确认语义；只保护 Selenium 会让同一类敏感登录态出现策略旁路。
- `--include-login-state` 单独存在不构成删除授权；`--confirm` 单独存在也只清理普通目标并保留两个 profile。只有两项参数同时存在时，两个登录态目标才允许进入清理集合。
- 默认命令的真实输出已确认列出所有目标绝对路径和影响，两个登录态均为“仅提示”，且没有执行删除。
- 仅用 `path.resolve/path.relative` 的词法边界不足以覆盖 Windows junction 或 symlink：glob 父目录可能在字符串上位于项目内，真实数据却在项目外。安全边界必须在枚举前校验容器 realpath，并在删除前再次校验每个实际目标；任何 realpath 失败均应停止而不是降级为词法判断。

### M0-F 迁移演练结果
- 发布门不读取真实 `data/outfit.sqlite`，而是用冻结 SQL 构造含八张 pre-M0 表与合成数据的磁盘 source；先复制 backup/rehearsal，再只迁移 rehearsal，既覆盖真实文件型 SQLite 行为，也保证用户数据库零接触。
- 仅比较数据或运行时哈希不足以锁定 fixture 的“现有 schema”含义；演练还必须精确断言迁移前八表、全部列/FK/索引和迁移后十表，并直接验证 candidate 表的 cascade FK、`UNIQUE(run_id, rank)`、命名索引、JSON/rank CHECK 与 STRICT。
- source 与 backup 的数据、SHA-256 和 sidecar 状态在迁移前后保持一致；rehearsal 重开并再次调用生产迁移后，迁移记录时间与旧数据完全不变。
- 仅对已有 fixture 表执行 baseline 会被 `CREATE TABLE IF NOT EXISTS` 掩盖未来 CREATE DDL 漂移；因此另用空内存库直接调用生产 `legacyBaseline0()`，再复用同一精确八表契约，才能同时锁住历史升级和新库基线两条路径。
- M0 最终门为 13 文件/219 项定向测试、19 文件/244 项全量测试、typecheck、生产 build 和 Python 33 项全绿；交叉复核无剩余中高风险。

## 2026-07-11 用户终止 M1–M6 与计划拆分
- 用户明确把当前目标改为：停止 M1–M6 研发，把六个里程碑分别拆成独立 Markdown 文件，并标记 goal 完成。
- M0 已完整提交到 `1453838`；M1-A 尚无提交，当前业务源码/测试改动只是未完成红绿循环，不能作为可交付状态保留。
- 安全收尾应只手工撤回本轮已知的五个 M1-A 业务文件，不触碰三份规划记录或用户提供的原计划；原计划保留，六个子文件作为新增旁路文档。
- 三个 M1 子 Agent 均在收到新指令后立即中止；它们此前是只读调查，不产生文件变更。
- 拆分应以原计划章节边界为准：M1 从 `## 8.` 到 M2 前，依次到 M6 从 `## 13.` 到测试策略前；每个子文件保留章节主体并补来源/全局约束链接，避免内容改写或遗漏。
- 六份子计划已按上述边界生成；去掉统一的 8 行前言后，正文与父计划逐行完全一致，未发生重写或删节。
- 父计划新增子计划索引但保留 M1–M6 原章节，因此既能继续阅读综合路线，也能把每个里程碑独立交给后续 Agent。
- M1-A 局部源码/测试全部撤回并通过 Git 精确比较确认无业务差异；目标收尾只留下规划记录、父计划和六个新子计划。
