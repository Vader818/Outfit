# 发现与决策

## 2026-07-11 Outfit M2 保存搭配

### 需求
- 严格执行 `docs/2026-07-10-outfit-m2-saved-outfits-plan.md`，不漏掉其中任何实施任务或验收标准。
- 交付保存搭配 CRUD/软归档、推荐候选一键保存、手工搭配编辑、指定核心/排除衣物、结构化替代建议及可追溯派生版本、V2 导出和文档验证。
- 延续单用户、本地优先及现有 session、同源写保护、结构化错误、严格输入校验边界。
- 删除任何电脑文件前必须先展示目标和影响并取得用户明确确认；本轮当前不计划删除文件。

### 初始发现
- 当前分支为 `codex/outfit-m0-foundation`，跟踪同名远端分支。
- 初始 Git 工作区只有 `docs/2026-07-10-outfit-m2-saved-outfits-plan.md` 被修改；该文件是用户指定执行依据，必须保留。
- 该计划文件的初始 Git 差异仅为移除文件开头 BOM，正文没有相对 HEAD 的内容差异；不回退此用户改动。
- M2 硬依赖 M0、不硬依赖 M1；所有可复用契约都必须以当前代码与迁移为准，不能仅依据旧规划记录推断。

### 待审计关键点
- M0 recommendation candidate 的全局唯一 UUID、持久化和回取接口。
- 当前数据库迁移编号、事务 helper、active/confirmed garment predicate 和行映射习惯。
- `findAlternatives()` 当前返回结构及推荐评分/原因生成边界。
- 历史洞察页、衣物详情/卡片动作、推荐舞台和现有对话框状态管理边界。
- `OutfitExportV2` 的版本、JSON/ZIP 生成路径与测试 fixture。

### 已确认的后端基线
- 修改前 `npm run typecheck` 与全量 `npm test` 均通过；基线为 20 个测试文件、274 项测试。
- 当前编号迁移只有 v1 `recommendation-candidates` 和 v2 `trusted-ingestion`，M2 应新增 v3，不能改写冻结 baseline 或既有迁移。
- `recommendation_candidates.candidate_id` 为主键 UUID；候选持久化同时保存 `run_id`、稳定 signature、rank、按 canonical slot 排序的衣物 ID 及 score/reasons snapshot。
- `persistRecommendationSnapshot()` 用 `BEGIN IMMEDIATE` 原子写 recommendation run 与候选，且会校验 candidate UUID、`id === candidateId` 及 signature 与 items 一致。
- 当前源码尚无 saved outfits 专用服务、路由、组件或测试文件，M2 计划列出的创建项均为真实新增边界。

### 推荐与校验契约
- `validateRecommendationRequest()` 当前只返回 weather、occasion、recentlyWornGarmentIds、userProfile；其通用 `normalizeGarmentIds()` 会静默丢弃非法值，因此 M2 的 include/exclude 必须使用更严格、具名且有数量上限的正整数数组校验。
- `/api/recommendations` 当前先取默认 active garments，再合并近期穿着 ID、补用户画像、调用 `recommendOutfits()`，最后用 `persistRecommendationSnapshot()` 原子保存；数据库感知的 include/exclude 状态错误应在持久化前完成。
- `RecommendInput` 尚无 include/exclude；候选生成先调用 `eligibleGarments()`，因此需在过滤后强制保留 include 集合并在生成组合时约束“全部 include 必须出现”，不能只把它们提高分数。
- `OutfitRecommendation.alternatives` 当前为 `Garment[]`；`findAlternatives()` 是私有函数，只返回同类候选 Top 4，虽会计算替换后分数但丢弃目标衣物、完整 nextItems、delta 与理由。
- M2 应把替代建议提升为共享结构类型，并让算法对每个 `targetGarmentId` 生成明确的 replacement、nextItems、matchPercentDelta 与 reasons；旧候选本身保持不变。

### 数据库与路由边界
- `legacyBaseline0()` 明确冻结；M2 新表必须进入 `NUMBERED_MIGRATIONS` v3。SQLite 已开启外键、defensive、5 秒 busy timeout，非内存库使用 WAL。
- 衣物默认 active scope 是 `owned = 1 AND archived_at IS NULL`，但不自动要求 `confirmed = 1` 或 `excluded = 0`；推荐服务的 `eligibleGarments()` 仍是最终 recommendable predicate，include 校验必须显式区分未确认、归档、excluded 和不存在。
- `getGarmentById()` 可读取已归档衣物，适合创建时生成 snapshot；保存搭配回读不应依赖当前 garment JOIN 才能展示，否则归档/历史状态会破坏回看。
- 衣物归档本身是可重复的 `archived_at` 更新，旧 DELETE 也只软归档；saved outfit 应沿用同样的不物理删除语义。
- `createApiApp()` 在所有业务 `/api` 路由前统一应用 5MB JSON、同源写保护和 session 校验；新的 `registerOutfitRoutes()` 应挂在认证 middleware 后，从而自动继承这些边界。
- 当前 DB 模块没有通用事务 helper；推荐候选服务采用显式 `BEGIN IMMEDIATE`/`COMMIT`/保留原错误的 `ROLLBACK` 模式，saved outfits 多表写入可复用这一惯例。

### V2 导出边界
- `buildOutfitExportV2()` 在单个 deferred read transaction 中读取所有表，随后运行严格 envelope/行级 shape 校验；saved outfits 必须在同一事务内读取，不能从 UI 限长列表复用。
- 当前 V2 features 为 versioned-migrations、recommendation-candidates、garment-assets；M2 应追加 saved-outfits，并让生成结果包含全部 active/archived saved outfits 及其 items snapshot/派生关系。
- JSON 与 ZIP 共用 `buildOutfitExportV2()`，因此扩展该 builder 会自动覆盖两种备份，但还需扩展 `validateOutfitExport()` 的 V2 shape 校验和导出损坏数据错误上下文测试。
- 现有导出测试已验证单快照、全历史、损坏 JSON 显式失败、敏感表排除、资产安全与 ZIP 白名单；M2 fixture 应沿用这些安全断言，并新增来源衣物归档后 snapshot 仍完整的断言。

### 前端接线边界
- `MainApp` 集中持有衣物、推荐、历史、全局 busy/error/status；启动时并行刷新衣物、画像、历史和模型。M2 可在此新增 saved outfits、builder/replacement dialog 状态，并把 `getSavedOutfits()` 纳入历史刷新。
- 主导航固定为推荐、衣服库、历史洞察、导入、设置五项；保存搭配应作为历史洞察的二级区域，完全符合“不新增第六个移动端主导航项”。
- `OutfitStage` 当前展示完整 items、理由、只读 alternatives 和“标记已穿”；应新增“保存搭配”以及逐件“以这件为核心/换这件”动作，替代列表改由结构化 suggestion 驱动。
- `RecommendationView` 是纯受控组件，所有 OutfitStage 都共用 handler，适合从 MainApp 注入保存、核心、换件动作及相应 busy 状态。
- `HistoryInsightsView` 目前只接收 insights、wear logs、recommendation runs；`SavedOutfitsPanel` 可作为洞察内容前后的独立二级 section 注入，不需要耦合分析数据为空与否。
- `WardrobeView`/`GarmentItem` 已有明确动作 prop 链，可增加 `onRecommendWithGarment`，从衣物详情区域触发核心推荐并切回推荐页。
- 前端 API 统一经过 same-origin credentials 与结构化错误转换；M2 只需新增 typed client 方法，不另建请求层。

### 测试蓝图基线
- 后端 API 集成测试使用真实内存 SQLite、真实 Express 监听、注册 session cookie 与 same-origin JSON header；新 outfits 路由应继续按此方式验证认证与写保护，而不是只测 service mock。
- `tests/recommendation.test.ts` 已有可复用 garment/weather fixtures、500 件预算测试、hard eligibility 测试和旧 alternatives 排序测试；M2 先把旧 alternatives 断言迁移为结构化 replacements，再补 include/exclude 硬约束与 delta/reasons。
- `tests/app.test.tsx` 主要用服务端静态渲染和直接调用受控组件 props 验证行为，现有 `makeOutfit()` fixture 必须同步新的 replacement 类型；新 Panel/Builder/Dialog 可直接导出并进行组件级键盘/按钮回调测试。
- `tests/frontendApi.test.ts` 用 fetch mock 精确断言 path/method/body，适合集中覆盖 outfits CRUD、candidate save、replacements 与 include/exclude 请求体。
- `tests/dbMigrations.test.ts` 应新增 v3 的表、索引、FK、CHECK/UNIQUE 失败断言；`dbMigrationRehearsal.test.ts` 的生产 legacy 升级预期表清单/schema version 也必须同步。

### 子 Agent 审计合并决策
- 三个只读 Agent 已完成数据库/导出、推荐约束/替代算法、前端接线审计，均未修改文件；其结论与主线审计一致。
- v3 创建 `saved_outfits` 与 `saved_outfit_items`：derived 自外键 RESTRICT、item 到 outfit CASCADE、garment 外键 SET NULL；snapshot JSON 独立保存且回读时绝不被 live garment 覆盖。
- candidate save 从 `recommendation_runs.result_json` 找到同 UUID 候选，并与 candidate 表 canonical item IDs 交叉核对；默认名使用保存请求中的 weather.date + occasion，避免服务器时区漂移。
- 手工 CRUD body 只接受 name/notes/favorite/items（garmentId/slot/position）；服务端读取 garment 生成 snapshot，禁止客户端伪造 source、snapshot、派生关系或时间字段。
- OutfitBuilder 完整性采用现有核心规则：dress，或 top+bottom；dress 不与 top/bottom 混用；slot 匹配 category、同衣物不重复、slot+position 唯一、accessory 顺序连续；不额外强制 shoes。
- 结构化 replacement 每个建议绑定一个 target，使用完整评分口径生成 nextItems、展示匹配度 delta 和 reasons；确认替换时若父 candidate 尚未保存，先保存父记录，再调用 replacement API 创建派生版本。
- `SavedOutfitsPanel` 必须置于历史洞察 `insights === null` 分支之外；历史 snapshot 图片失败时显示占位，不能依赖当前衣物仍 active。

### 阶段 15–16 已落地契约
- migration 3 已通过独立 schema 与生产 legacy rehearsal，saved outfit item snapshot 列名为 `garment_snapshot`；candidate FK 删除时 SET NULL、garment FK 删除时 SET NULL、outfit header 删除才 CASCADE items，而产品路由不提供物理删除。
- 手工搭配 create/update 均使用服务端衣物生成 snapshot；核心规则为 dress 或 top+bottom、互斥，非配饰 position=0，配饰 position 连续，且一件衣物不能重复。
- candidate save 只接受 UUID 路径与 name/notes/favorite；联查 candidate/run，从持久化 `result_json` 提取历史衣物，再与 `item_ids_json` 精确交叉核对，不读取 live 字段覆盖 snapshot。
- candidate 默认名固定使用历史 weather.date + 中文场合；衣物后来改名或归档仍能保存当时推荐，候选快照损坏会整笔回滚。
- 前端已新增 typed CRUD/candidate-save client，所有请求继续复用 same-origin credentials 与结构化错误处理。

### 推荐约束落地决策
- `validateRecommendationRequest()` 只对 M2 include/exclude 严格校验，保留 M0 对 recentlyWorn 与未知字段的净化兼容；结构错误统一返回 `details.issues`。
- 数据库语义校验读取 `listGarments(scope=all)`，按稳定顺序聚合 NOT_FOUND/NOT_OWNED/ARCHIVED/UNCONFIRMED/EXCLUDED，并拒绝单值 slot 多锁定与 dress/top-bottom 冲突；校验失败前不写 recommendation run/candidate。
- include/exclude 在候选池形成前生效：排除先移出 eligible pool；锁定核心直接缩小 top/bottom/dress 池；锁定 outerwear/shoes/accessory 会移除 optional undefined 分支，避免 beam/slice 提前丢失指定衣物。
- API 只把用户实际提供的约束持久化到 sanitized input；省略字段不被无条件写成空数组。

### M2 导出落地决策
- `savedOutfits` 作为 V2 可选字段保留旧 V2 fixture 的向后兼容，但当前 builder 始终输出该字段与 `saved-outfits` feature。
- 导出在既有 deferred read transaction 内调用 saved outfit 全量读取，并按 id 重新排序，避免 UI 排序或限长影响备份确定性；ZIP 与 JSON 继续只有一个可信 builder。
- snapshot 是历史事实：导出不 JOIN 当前 garment 覆盖它；来源衣物后续改名、图片变化或归档均不改变备份中的保存时 name/brand/category/imageUrl。
- snapshot 图片 URL 复用既有可移植引用规则，拒绝盘符路径、反斜杠、file/data/blob、base64、路径穿越和控制字符；损坏 JSON/字段缺失以 `saved_outfit_items` 行级上下文失败。

### M2 文档反查结论
- `docs/api.md` 旧推荐响应仍写 `alternatives`，旧导出示例仍写 schemaVersion 2；现已按实现改为 `replacements`、schemaVersion 3、`saved-outfits` feature 和完整 `savedOutfits`。
- `README.md` 的迁移说明还停留在版本 1，且没有保存搭配的用户路径；现已更新为版本 3，并补齐推荐保存、手工 Builder、核心锁定、确认换件、历史归档与父子版本说明。
- API 文档全部 46 个 JSON 示例均经 `ConvertFrom-Json` 验证，避免新增响应示例出现语法上有效但不可复制的片段。

### M2 真实交互验收结论
- 历史二级区域独立于洞察内容存在；来源衣物已归档后仍使用 snapshot 名称、品牌、类别和占位图渲染，不依赖 active garment JOIN。
- “以这件为核心”从衣服库详情切回推荐页并立即生成约束推荐；锁定衣物确实出现在首选和全部备选，且该 target 的换件按钮禁用，清除动作恢复无约束状态。
- 推荐保存先落可信 candidate snapshot，再立即打开受控 Builder；真实界面默认名来自历史日期和中文场合，用户改名通过普通 update 不改变 recommendation provenance。
- ReplacementDialog 打开本身不写库；确认后 child 为 replacement/source、指向父 ID，完整新套只替换 target。子记录改名/归档不会改变父记录或父 snapshot。
- 1280px 和 390px 两种视口的保存卡、Builder、ReplacementDialog 均无页面级横向溢出；移动端五个主导航项保持文字和可访问按钮，未新增第六项。

### M2 最终交付结论
- 计划中的 v3 数据迁移、保存搭配 CRUD/归档、候选一键保存、手工 Builder、核心/排除硬约束、结构化换件与派生版本、V2 导出、文档和五项验收标准均已完成。
- 全量回归为 23 个测试文件、320 项测试全部通过；类型检查、差异检查和生产构建全部通过。
- 真实浏览器验收使用隔离临时 SQLite，覆盖桌面与移动端完整主流程、父子版本不可变性、导出完整性及无横向溢出；项目真实数据库未被打开或修改。
- 最终审计没有跟踪文件删除，也没有删除源码、用户数据、临时数据库、日志或 QA 证据；生产构建仅按已披露范围重建被忽略的 `dist` 生成物。

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

## 2026-07-11 M1 可信建档与导入暂存区

### 需求与执行边界
- 严格执行 `docs/2026-07-10-outfit-m1-trusted-ingestion-plan.md` 的全部实施任务与验收标准，不缩减手工建档、图片安全、软归档、导入审阅、幂等提交或 ZIP 备份范围。
- 继续保持单用户、本地优先；所有新写接口必须复用 session、来源保护、结构化错误与严格验证。
- 图片安全以服务端字节限制、`sharp` 解码/像素限制/自动旋转/无元数据 WebP 重编码、固定资产根和受控 `storage_key` 为准；前端 canvas 不是安全边界。
- 本轮不删除任何电脑文件；替换图片只把旧资产 `active` 置为 false，物理清理由既有 privacy-clean 的预览/确认流程承担。

### 恢复发现
- session catchup 检测到上一会话有两次未同步工具输出；已按要求查看 Git diff 并完整读取三份规划记录。
- 开始本轮时 Git 仅显示目标计划、`task_plan.md`、`progress.md` 有改动；目标计划的既存差异只是移除文件开头 UTF-8 BOM，没有业务正文变化，必须保留。
- 已完成的前端重构把源码拆分到 `src/app`、`src/features` 等模块；M1 必须基于新结构实现，不能按旧版单体 `src/App.tsx` 假设直接修改。
- 当前依赖没有 `sharp` 或 ZIP 生成库；M1 需要新增并锁定服务端图片处理依赖，同时审计后选择流式 ZIP 实现。
- 现有数据库已拆出 `server/db/migrations.ts`，导出集中于 `server/services/export.ts`；对应测试已包含 migration rehearsal、export、db import 等独立套件，可按域增量扩展。
- M0 已提前提供基础 `ManualGarmentCreate`、`POST /api/garments`、验证器和 `createManualGarment()`；M1 需在其上补 `origin/acquiredAt/purchasePriceCents/currency`，而不是重复创建端点。
- 当前编号迁移只有 v1 `recommendation-candidates`；M1 schema 应作为新的严格递增编号迁移追加，不能修改冻结的 `legacyBaseline0`。
- 当前 `listGarments()` 返回全部衣物、洞察直接使用该列表、推荐也直接传该列表；`deleteGarment()` 仍执行物理 DELETE。M1 必须引入 active/archived 查询语义并系统性更新这些调用点。
- 当前 `express.json({limit: "5mb"})` 在所有 API 路由前执行；图片原始 body 路由必须在 JSON parser 前或通过明确的 parser 条件旁路，否则无法获得原始字节。
- 当前缩略图静态路径位于认证 middleware 之后，但 M1 资产不能继续暴露物理文件名，应由 asset ID 查询、active 校验与受控读取提供。
- 当前导入预览 `previewTaobaoImport(request.body)` 完全不接收数据库；正式写入仍走旧 `/api/import/taobao-batch`，退款在归一化阶段被计入跳过。M1 需要新增数据库感知预览和 decisions commit，同时保留兼容边界。

### 修改前基线（2026-07-11）
- `npm run typecheck`：通过。
- `npm test`：19 个测试文件、244 项测试全部通过。
- `npm run build`：通过；1586 个模块，CSS 67.44 kB（gzip 12.37 kB），JS 244.43 kB（gzip 76.30 kB）。

### 初始 TDD 分段
1. migration/共享类型与手工衣物 JSON 创建。
2. 资产净化、落盘、认证读取、替换软失活。
3. 归档/恢复与 active/recommendable 查询语义。
4. 手工建档、图片上传、归档/恢复及批量编辑前端。
5. 数据库感知淘宝预览、逐项审阅、服务端重算与幂等提交。
6. V2 JSON/ZIP 备份、文档、全量与验收测试。

### 现有实现的精确兼容边界
- 迁移测试将冻结 legacy baseline 与生产 numbered migrations 分开校验；M1 要同时更新 `tests/dbMigrations.test.ts` 的版本清单和 `tests/dbMigrationRehearsal.test.ts` 的生产迁移后表/列/索引断言，但不能改变 legacy-v0 合约。
- 基础手工建档测试已经覆盖拒绝 forged `confirmed`、无 `sourceOrderItemId`、默认 confirmed/owned/excluded/confidence 与可参与推荐；M1 应扩展同一行为测试覆盖 origin、日期、价格、币种及非法负价。
- 淘宝 `normalizeTaobaoBatch()` 已保留退款来源到 `sourceItems`，但不生成 `garmentDrafts`；`previewTaobaoImport()` 又把退款放进 skipped，`filterTaobaoBatchForWardrobe()` 直接删除退款。可在不破坏归一化的情况下让 M1 预览把退款建成 `refund-sync` candidate，并停止 artifact 的提前过滤。
- `externalKey` 已是服务端基于 itemId/sku 或订单字段生成的 SHA-256，可直接作为 `sourceItemKey` 的权威基础；提交必须重新归一化后以该 key 对齐 decisions。
- 现有 import upsert 已用事务和 `source_order_items.external_key UNIQUE`/`garments.source_order_item_id UNIQUE` 提供部分幂等，但它会自动处理全批且无法逐项 include/override；M1 应把可复用 upsert 核心参数化，而不是在路由层先删数组。
- 前端 API 通用 `request()` 强制 JSON content-type 并总是 `response.json()`；原始图片上传和 ZIP 下载需要专用二进制请求/响应处理，不能直接复用当前 JSON 假设。
- 新衣橱 UI 已拆为 `WardrobeView`、`GarmentItem`、`GarmentEditor`；当前只支持批量确认，编辑器缺品牌、风格、正式度、备注和排除推荐。M1 可在这些稳定边界新增手工对话框与批量动作。

### 并行审计与首批实现结论
- 淘宝来源原 key 只使用 itemId+SKU，会错误合并不同订单；原 batchId 在缺 `capturedAt` 时依赖当前时间。导入子任务已用 TDD 实现版本化稳定 key、legacy key 兼容计算、顺序无关 batchId、两阶段详情合并与退款保留，目标测试 24/24 通过。
- 新 key 以 orderId + itemId/规范化 URL + 规范化 SKU 为主；服务端数据库匹配仍必须支持 legacy key 和语义唯一命中，防止现有衣物重复。
- 迁移演练原先用 `SELECT *` 比较冻结 legacy 数据；新增合法列会误报。现已改为只投影 legacy 列做数据不变性比较，并独立断言 v2 新字段默认值与空资产表。
- active garment 的统一定义已落为 `owned=true AND archived_at IS NULL`；推荐在此基础上再要求 `confirmed=true AND excluded=false`。旧 DELETE 只软归档并带弃用标头，重复归档/恢复幂等。
- 图片审计确认旧缩略图服务只做头嗅探并写原字节，不可作为 M1 安全边界；新资产服务必须独立用 sharp 解码/像素限制/rotate/WebP/无元数据输出。
- `sharp@0.34.5` 已作为直接精确依赖锁定；此前仅是 transformers 的传递依赖。
- 前端现有 `WardrobeView`/`ImportView` 被测试直接当普通函数调用，因此二者不能直接新增 Hook；需要状态的对话框、审阅表和批量控件应作为子组件或由 `MainApp` 受控。

### M1 最终实现与验收结论
- migration v2 `trusted-ingestion` 已追加 `origin`、`archived_at`、购入日期/价格/币种与 STRICT `garment_assets`，冻结的 legacy baseline 未改写；迁移和演练测试覆盖空库、旧库升级、重复启动与数据保持。
- 手工建档支持完整字段、无图先保存、浏览器 2048 边 WebP 预处理和图片失败后不重复建档的重试；真正安全边界是服务端 5 MB、40MP、格式匹配、rotate、无 metadata WebP、UUID/根路径/符号链接/哈希校验。
- 默认 active 统一为 `owned=1 AND archived_at IS NULL`，推荐再叠加 confirmed/excluded；归档、弃用 DELETE、恢复与洞察/推荐隔离均通过 API 和真实浏览器验证，旧资产始终只软失活。
- 淘宝 v2 key 纳入订单身份与规范化 SKU，batchId 在缺 capturedAt 时仍稳定且与数组顺序无关；preview 不写库，commit 覆盖严格、事务重算 disposition、归档来源恢复更新、退款保留与重放幂等均通过。
- V2 JSON 导出所有 active/归档衣物和 active/inactive 资产元数据，不暴露 storage key/绝对路径/二进制；显式 ZIP 先预估再确认，流式写固定安全条目，缺失/损坏/穿越资产只产生无路径 warning。
- 真实浏览器桌面 1280px 手工对话框双列且页面无溢出；390px 视口对话框单列，文档宽度与 clientWidth 同为 375px。导入宽表容器可聚焦并独立横向滚动，页面本身无横向溢出。
- 真实浏览器用临时内存/临时 SQLite 完成手工建档、批量动作可见性、两候选预览（新增 + 无历史退款 skip）、只提交选中项、归档后洞察排除、恢复和 ZIP 取消确认；未触碰真实衣橱。
- 最终生产依赖审计发现并修复 archiver 传递的 glob 公告，`npm audit --omit=dev --audit-level=high` 为 0 漏洞。

## 2026-07-11 M1/M2 独立验收

### 验收起点
- 当前分支为 `codex/outfit-m0-foundation`；M1 已形成提交 `7b5ccde feat(wardrobe): complete trusted ingestion workflow`，M2 主要仍处于工作区未提交状态。
- Git 工作区包含 M2 的 31 个已跟踪修改以及新的 outfits/constraint 服务、组件、样式和测试；验收必须基于当前工作区，而不能只看提交历史。
- 两份计划正文的可见差异仅涉及 M2 文件开头 BOM；本次不把该格式差异视为业务实现证据。
- 既有 `task_plan.md`/`findings.md`/`progress.md` 声称 M1/M2 已完成，但这些记录只能作为待验证线索，不能替代当前代码、测试与独立运行结果。
- OpenAI code-review provider CLI 检查通过；后续将用结构化验收请求做额外交叉审查。

### 独立动态验证（第一轮）
- M1 专项：6 个测试文件、79 项测试通过，覆盖迁移/演练、资产、淘宝归一化/数据库导入与导出。
- M2 专项：5 个测试文件、51 项测试通过，覆盖 saved outfits、UI、推荐约束、推荐与候选。
- `npm run typecheck` 通过；`npm run build` 通过，Vite 转换 1592 个模块，JS 293.72 kB（gzip 90.31 kB），CSS 84.19 kB（gzip 14.53 kB）。
- `npm run audit:prod` 返回 0 个已知漏洞。
- 外部 code-review provider 未产出审查结果：OpenAI provider 被 WindowsApps 子进程权限阻止，GitHub provider 缺少 `gh`/Copilot CLI；主线和两个只读子 Agent 的审查不受影响。

### 已确认的实质缺陷
- M1 导入审阅前后端契约不一致：`ImportReviewTable` 修改字段后取消勾选仍保留 `overrides`，而服务端拒绝 `include=false + overrides`。真实浏览器已复现：第二项仍选中时提交整批返回 `decisions[0] 未选择时不能包含 overrides`，因此其他已选项也无法提交。
- M1 `refund-sync` 行仍开放字段编辑，但服务端明确拒绝退款同步项的 overrides，同样可阻断整批提交。
- M1 旧 `/api/import/taobao-batch` 仍可直接写库，绕过 preview/decision 两阶段；文档明确把它标为兼容旧客户端，但这与“可信写库前逐项审阅”目标存在边界偏离。
- M2 多配饰硬锁定错误已由主线脚本复现：`includeGarmentIds=[配饰3, 配饰4]` 返回 `[[1,2,3],[1,2,4]]`，没有候选同时包含两件，违反 include 必须出现在每套候选的语义。
- M2 Builder 编辑含归档或已删除来源衣物的历史搭配时，会把这些 item 判为不可用或直接从 draft 跳过；仅改名/备注也可能无法保存，或在保存时静默丢失非核心历史 snapshot。
- SavedOutfitsPanel 只渲染 active outfits，归档搭配虽已读取到前端状态但没有 UI 回看入口。
- 文档仍有偏差：M2 计划状态仍写“停止实施”且任务全未勾选；README 仍称手工建档接口不接收图片；`docs/api.md` 称 restore 可能保持 `owned=false`，实际实现强制 `owned=1`。

### 最终符合度判断
- M1：核心架构、安全边界、迁移、图片净化、软归档、数据库感知预览/提交、幂等和 ZIP 均真实落地；但导入审阅存在可稳定复现的前后端契约缺陷，旧直接写库 API 仍可绕过两阶段流程，文档有两处过时。结论为“基本按计划实现，但未达到无保留验收”。
- M2：11 项实施任务均能找到实现与测试，保存/编辑/派生/导出主链完整；但多配饰 include 违反硬锁定语义，历史 snapshot 编辑和归档可见性存在中等风险，且全部 M2 代码尚未形成提交。结论为“主体按计划实现，但未达到无保留验收”。
- 项目总体质量：工程基础良好，迁移、事务、安全测试和类型边界明显强于普通原型；当前不应宣称 M1/M2 100% 完成。建议修复两项高优先级契约错误并补回归后再正式签收。

## 2026-07-12 验收缺陷修复边界
- M1 导入前端必须与服务端严格契约对齐：未选择项绝不携带 overrides；refund-sync 只能选择是否同步，不能编辑衣物字段。
- 旧立即导入接口不再保留可写兼容语义；可信两阶段流程必须成为唯一写库入口。
- M2 include 是硬约束而非偏好；多个 accessory include 必须全部出现在每套候选中。
- 历史 saved outfit 的 metadata-only 编辑必须原样保留全部 snapshot；任何组合编辑都不得静默丢弃不可用历史项。
- 归档 saved outfit 需要在 UI 中可回看，即使不提供恢复，也不能成为不可见数据。

## 2026-07-12 修复后结论
- M1 导入审阅前后端契约已对齐：未选择项永不携带 overrides，refund-sync 不允许字段修正，且旧直写公共 API 已禁用。
- M2 include 硬约束已覆盖多个配饰同时锁定；候选生成仍遵守预算、确定性和无重复约束。
- 历史搭配的元数据更新不会发送 items；组合编辑对不可用快照采用“显式替换或显式移除”，不会再静默丢失。
- 归档搭配在 UI 中可按保存时快照回看，并展示父子派生关系。
- 全量 Node/Python 测试、类型检查、生产构建和依赖审计均通过；此前阻止无保留验收的已确认缺陷均有直接回归证据。

## 2026-07-12 M3 实施启动发现
- 指定计划硬依赖 M2；当前工作区保留了 M1/M2 的 33 个已修改路径及多个未跟踪新增路径，必须在其上增量实施，不能回退或覆盖。
- session catchup 没有报告未同步上下文；最近提交仍停在 M1，M2 及其修复主要存在于当前未提交工作区。
- M3 明确要求四张/列数据能力：`garments.availability_status`、`recommendation_feedback`、`outfit_pair_stats`、`garment_availability_events`；反馈写入、实际穿着、状态事件和清空重算均有事务一致性要求。
- 推荐学习信号必须是可解释且有界的：证据少于 3 条只记录不改排序，单套 pair bonus 合计限制在 -8…+8，并单列 `scoreBreakdown.learnedPreference`。
- 反馈清空不是直接危险按钮：必须先预览影响范围，由 UI 展示后二次确认；服务端严格验证 all/candidate/date-range，并在同一事务重算 pair stats。
- 本轮不删除任何文件；所有现有 M1/M2 修改均视为用户应保留成果。
- 当前推荐候选已使用全局 UUID `candidateId` 并持久化在 `recommendation_candidates`；M3 反馈应以该表外键和现有用户/候选归属边界为基础，不能使用页面序号。
- 当前穿着写入由 `server/db.ts` 的 `saveWearLog()` 完成，前端从 `OutfitStage` 经 `src/app/App.tsx` 调用独立 `/api/wear-logs`；M3 需要把这条路径收敛到反馈 service 的事务内，同时保留现有显式穿着日志能力。
- 推荐评分在 `server/services/recommend.ts` 统一构造 `RecommendationScoreBreakdown` 并求和，候选身份由 `recommendationCandidates.ts` 最后附加；learnedPreference 必须在持久化候选之前进入 breakdown，且不能破坏现有 M2 约束。
- 洞察数据当前由 `getWardrobeInsights()` 和 `/api/insights` 聚合；M3 反馈数量、接受率和拒绝原因应在该共享响应中扩展，前端无需新增第六个主导航。
- 衣服库已有选中集合与 `bulkUpdate` 框架，可复用为批量 availability 状态切换；现有 API 更新与 Garment 类型需先增加状态字段。
- 导出响应使用数据库当前 migration 版本作为 `schemaVersion`，并已有推荐候选、穿着日志、saved outfits 的严格解析/验证模式；M3 应沿用同一 builder 与 feature 清单扩展。
- M3 修改前基线通过：`npm run typecheck` 成功，全量 Vitest 为 24 个文件、330 项全部通过。
- `dist` 已存在 6 个生成文件；标准 Vite 构建默认会清空该目录。依据“删除前明确确认”约束，修改前基线暂不运行 `npm run build`，实现与测试不受影响，最终构建需在明确处理该生成目录后执行。
- 当前编号迁移到 v3；M3 应作为 v4 单一迁移加入，不能修改 frozen legacy baseline，也不能改写既有 v1–v3。
- `recommendation_candidates` 已保存 candidate UUID、run、signature、排序、衣物 ID 和 score snapshot；反馈可用外键核验候选存在并从 item_ids_json 计算无序衣物 pair。项目是单用户模型，现有业务表没有 user_id，因此“候选归属”在首版等价于当前本地数据库中候选存在。
- `wear_logs` 目前没有 candidateId 唯一键；为了让同一候选重复提交 `actuallyWorn=true` 不产生重复日志，事务 service 需要在反馈状态从非 true 变为 true 时写一次，后续更新不再追加，并在 true→false 时保留历史穿着事实。
- M3 计划接口的 `woreInsteadOutfitId?: number` 可关联现有 `saved_outfits.id`；应在服务端校验存在，避免只做形状校验。
- Garment 当前推荐 eligibility 只处理 owned/confirmed/excluded/archive 与显式 exclude；availability 必须成为统一硬过滤条件，并同步到 M2 constraint 校验，使被锁定的非 available 衣物返回结构化不可满足错误。
- `RecommendationResult.missingSlots` 当前仅是类别数组，无法承载“不可用数量”；要严格完成计划需升级为兼容的结构化缺槽提示或新增并列详情字段，前端和旧测试需同步迁移。
- 前端“标记已穿”现在直接写 `/api/wear-logs`；M3 实施后推荐卡上的该动作应通过 feedback API 原子写入反馈与 wear log，独立穿着日志 API可保留给非候选场景。
- 现有迁移测试多处精确断言 v0–v3 和 schemaVersion=3；新增 v4 后必须同步 `dbMigrations`、`dbMigrationRehearsal`、API/export fixture，而不是为了少改测试隐藏新版本。
- 项目测试 helper 的 Garment fixture 普遍省略新字段；`availabilityStatus` 应在共享类型中先设为必填、再机械补 fixture，或在映射边界提供默认。为保证业务不把缺省误判为不可用，推荐 fixture helper 应显式设 `available`。
- 推荐测试当前把 `missingSlots` 精确断言为类别数组。为兼容现有消费者且新增不可用数量，首选保留 `missingSlots` 数组并新增 `missingSlotDetails`，其中每项包含 slot 与 unavailableCount；这满足提示要求且避免破坏已有 M2 API。
- API 测试已有注册/session、Origin、结构化错误和推荐候选持久化 helper，可在同一测试风格中覆盖反馈 route、清空预览/确认、availability route 与跨候选错误。
- `tests/app.test.tsx` 以静态渲染/组件树遍历为主，不是完整浏览器交互；M3 需要新增组件级纯 helper/标记测试，并在最后补真实浏览器桌面与移动验收。
- Garment 写路由已拆在 `server/routes/garments.ts`，反馈应同样创建独立 `server/routes/feedback.ts`；availability route 可注册在 garments 模块但业务事务必须位于新 service。
- 现有 `updateGarment()` 是通用字段覆盖且不写事件，不能把 availability 混入普通 PUT；必须只允许 `POST /api/garments/:id/availability` 经专用 service，避免绕过历史。
- 前后端都有 eligibility helper：服务端 `recommend.ts`/`recommendationConstraints.ts` 与前端 `src/lib/garments.ts`。三处都要纳入 `availabilityStatus === "available"`，避免 UI 把不可用衣物仍显示为可推荐。
- 推荐 API 在认证中间件之后统一读取 `listGarments({scope:"all"})` 并做约束验证，新增 feedback/availability 路由只要在相同认证 middleware 之后注册，即自动继承 session 与 Origin/Sec-Fetch-Site 保护。
- 只读审计确认真实 `data/outfit.sqlite` 仍是没有 `schema_migrations` 的 8 表 legacy 数据库；绝不能为验证直接用新代码打开它。本轮只使用内存库与临时副本迁移演练，未来真实启动将一次执行 baseline 0 与 v1–v4。
- 导出 envelope 必须继续保持 `version: 2`，只把数据库 `schemaVersion` 升为 4；M3 feature 采用 `feedback-availability`，旧 V2 缺少新可选数组仍需兼容。
- 日期范围清空按反馈 `updated_at` 解释，以符合“同候选更新而非叠加”的模型；空范围和重放都是成功的 no-op。
- `actuallyWorn=true` 与 `woreInsteadOutfitId` 被定义为冲突输入；推荐穿着只信任服务端 candidate 的 item_ids_json，不再信任客户端 garmentIds。
- 推荐学习公式已由纯函数和推荐排序测试锁定：2 条证据为 0，3 条全喜欢为 +2.4，5 条全喜欢单 pair 为 +4；三 pair 的整套贡献会从 +12 截断为 +8，负向同理截断为 -8。
- availability 缺省仅作为旧内存 fixture/旧快照兼容解释为 available；数据库 v4、API 与新 Garment 响应始终显式提供五态之一。
- 根 `MainApp` 已有单一对话框挂载区、候选级 recording ID、衣物级更新队列和统一历史刷新；M3 接线应只新增一个 FeedbackDialog 状态、一个 availability busy ID，并复用 `refreshHistoryData()` 更新反馈洞察。
- 反馈清空不能只用原生 confirm：洞察页需要范围表单 → 只读预览 → 明示反馈数/pair 数 → 第二次确认的对话框状态机，清空成功后刷新洞察并清空当前 recommendations，防止页面继续展示已失效权重。
- 反馈摘要应作为独立 Surface 放在四格 `.insight-facts` 之后，不能把第五项塞进写死四列及 nth-child 的现有事实条。
- 现有新增 API 测试已覆盖反馈/availability 的认证、Origin、严格校验、幂等、三种清空范围和重放；主线仍需补一条“3 个持久化候选反馈→下一次推荐 learnedPreference 生效→洞察同步”的端到端证据，以及推荐 actualWorn 路由只写一次 wear log。
- 浏览器 QA 必须通过应用内浏览器运行时完成；会使用推断的本地 URL 选择浏览器、读取其完整文档，并保持一个浏览器绑定贯穿桌面/移动检查。

## 2026-07-12 M3 最终验收发现
- 稳定 candidateId、同候选幂等更新、实际穿着单次写入、pair stats 阈值/有界公式与清空后重算均有 service、API 和端到端测试证据；3 条正向反馈端到端产生 `learnedPreference=7.2`，清空后恢复为 0。
- 五态 availability 由专用事务路由更新并保留事件；四种非 available 状态在统一 eligibility 与 M2 include 约束中均被硬过滤，缺槽详情保留兼容 `missingSlots` 并补充 unavailable 数量。
- 桌面真实交互确认 availability 变化会刷新衣橱可穿计数并失效旧推荐；重新生成的候选不含待洗衣物。
- 反馈清理 UI 符合“范围表单 → 影响预览 → 二次确认”：预览前没有最终确认按钮，零影响不会开放危险确认；隔离数据实测清空后洞察同步归零。
- 390×844 移动视口无文档级横向溢出，反馈弹层采用可滚动窄屏布局且保存操作可达；默认桌面视口已恢复。
- 浏览器控制台在业务验收期间无新增应用 warning/error；唯一旧错误是应用内浏览器初开时的扩展消息接收端不存在，不来自仓库业务代码。
- 最终自动化复验全部通过：TypeScript 类型检查、365 项 Vitest、25 项 unittest、33 项 pytest、两种 npm 审计及差异检查。
- 用户已明确授权标准构建清理并重建列明的 6 个 `dist` 生成文件；`npm run build` 成功，旧哈希 JS/CSS 已由新哈希产物替换，源码与数据库未受影响。

## 2026-07-12 M1–M3 独立复验（本轮）
- 当前 Git 工作区在复验开始时为空；因此本轮可按已提交仓库状态验收，不需要区分未提交实现。
- 既有记录声称 M1–M3 已完成且曾通过自动化与浏览器验收，但本轮不把旧声明作为通过依据，将重新核对计划、源码、测试、文档和动态结果。
- 当前活动 goal 已与用户本轮目标一致；重复创建失败后已改为沿用，不影响复验。
- 当前协作环境共 4 个并发槽位（含主 Agent）；已并行启动 3 个只读子 Agent，分别审计 M1、M2、M3，均禁止修改或删除文件。
- 本轮只做验收与报告，不修复产品代码；若发现缺陷，将提供复现证据和严重度。
- M1 计划共 16 项实施任务、7 条验收标准，重点风险集中在图片净化/路径边界、两阶段导入的服务端重算与重放幂等、软归档去重、ZIP 路径安全；计划文本自身已全部勾选，但需用当前代码重证。
- M2 计划共 11 项实施任务、5 条验收标准，重点风险集中在 snapshot 历史可回看、include 多配饰硬约束、replacement 新版本派生关系、归档记录隔离；计划文本自身已全部勾选，但需用当前代码重证。
- M3 计划共 12 项实施任务、5 条验收标准，重点风险集中在稳定 candidateId、反馈更新幂等、wear log 同事务、pair bonus 阈值与总上限、availability 硬过滤、清空后同事务重算。
- 仓库包含三份计划对应的服务、路由、前端组件及专项测试文件；提交历史显示 M1 单独提交，M2/M3 合并在 `41cf75a`。文件存在只能证明结构落地，不能替代行为验收。
- `npm test` 仅运行 Vitest；Python 三组测试需要独立运行。构建会执行 TypeScript 后调用 Vite，可能清理并重建 `dist`，必须遵守用户的删除知情约束后再决定是否执行。
- 当前运行时 Node v24.15.0 满足项目 `>=24.14 <27` 约束；Python 为 3.13.9。TypeScript 使用 strict/noEmit，覆盖 src/server/tests/scripts。
- 本轮首次独立 `npm run typecheck` 通过；`git diff --check` 仅报告三份规划记录的 LF→CRLF 提示，无空白错误。
- 本轮全量 Vitest 独立复验为 27 个文件、365/365 项通过，耗时 5.73 秒。
- Python `unittest discover` 为 25/25 项通过；`pytest -q` 为 33/33 项通过。运行中的淘宝登录重试文字来自预期测试场景，不是失败。
- 当前 `node_modules` 顶层解析成功但含若干 extraneous WASM 辅助包，属于本机安装树漂移信号；仓库锁文件是否可由干净 `npm ci` 重建本轮不验证，因为该命令会删除并重建 `node_modules`。
- npm 生产依赖与含开发依赖的全量审计均报告 0 vulnerabilities。系统未安装 `pip-audit`，本轮没有擅自安装工具，因此 Python 锁定依赖缺少同等级的当前漏洞数据库复验。
- 非破坏性生产构建成功：TypeScript + Vite 8.0.16 转换 1595 模块，生成 JS 316.33 kB（gzip 96.63 kB）与 CSS 90.96 kB（gzip 15.32 kB）；产物保留在系统临时目录，现有 `dist` 未删除或改写。
- 路由装配顺序正确：Helmet、5 MB JSON 限制和全局 mutating-origin 检查在认证之前，新 M1/M2/M3 路由注册在 `/api` session 认证之后；新增写接口统一继承来源与会话保护。
- 图片 raw-body 路由虽然注册在全局 `express.json` 之后，但图片 MIME 不会被 JSON parser 消费，路由自身对全部类型启用 5 MB raw 限制；asset content 仅按数值 ID 读取并设置 private/no-sniff/ETag。
- M1 旧直写导入固定返回 410；M2 CRUD/replacement/save 和 M3 feedback/availability/clear 都通过严格 validator 进入 service。当前静态路由层未发现绕过认证或绕过新 service 的平行写路径。
- 数据库迁移运行器对 baseline、严格递增版本、已应用前缀和并发写锁均有防护；每个 numbered migration 使用 `BEGIN IMMEDIATE` 并在异常时回滚。
- M1 trusted commit 在获得写锁后重新归一化批次、重建数据库感知上下文、严格核对 decisions，再在单事务内逐项落库；退款 override 被服务端拒绝，取消项不写，异常统一回滚。该实现符合“客户端只表达选择、服务端掌控 identity/disposition”的计划边界。
- 关键服务静态索引显示 M1 资产、M2 candidate/saved outfit、M3 feedback/availability/export 都显式使用事务；下一步需逐段确认事务内部的更新顺序和失败回滚语义。
- 版本化 schema 与里程碑对应清晰：v1 candidate UUID、v2 trusted ingestion/asset、v3 saved outfits/snapshot、v4 feedback/pair stats/availability。数据库层同时施加 enum、JSON、唯一性、自引用、pair 顺序和 FK 约束。
- M3 feedback upsert 在同一 `BEGIN IMMEDIATE` 中写一次 wear log（由唯一 wear_log_id 防重）、按 candidate unique upsert 反馈、全量重算 pair stats 后提交；重复实际穿着不会重复写日志。
- pair bonus 实现逐 pair 跳过 `<3` 证据，按计划公式计算并将整套总和 clamp 到 -8…+8；clear 在同一事务内先预览、删除目标 feedback、全量重算 stats，再返回结构化结果。
- feedback clear 不持久化单独的“审计日志”表，只在响应中返回 scope、影响数、删除数、剩余 stats 数和时间。计划的实施任务与验收标准没有要求独立审计表，因此暂不判定为偏离，但文案“记录结构化审计结果”存在解释空间。
- M1 图片服务按 MIME 与真实解码格式双重核对，限制 5 MB/4000 万像素/单页，旋转后重新编码 WebP 且未调用 metadata 保留 API；UUID 文件名、root descendant、lstat/realpath、symlink 和 sha256/长度校验构成读写边界。数据库失败时有意保留孤儿文件供 privacy-clean 预览，符合“不静默删除”约束。
- M2 saved outfit 的 create/save/replacement/update 均使用 `BEGIN IMMEDIATE`；snapshot 与可空 live garment link 分离，归档或删除来源后仍能读取历史。replacement 总是新建 source=replacement 且 derived_from 指向原记录，不覆盖原搭配。
- saved outfit 完整性同时在 validator/service/schema 三层约束 slot、position、重复衣物、裙装与上下装互斥；metadata-only 更新不会重写历史 items。
- M0/M3 candidate identity 由 UUID 生成，`id===candidateId`，搭配内容另有 canonical SHA-256 signature；推荐 run、完整 result 和 candidate rows 在同一事务持久化，因此反馈关联的是稳定数据库主键而非列表序号。
- M2 include/exclude 冲突在请求 validator 中返回 `INCLUDE_EXCLUDE_CONFLICT`；服务端再核对存在性、owned/archived/confirmed/excluded/availability 和不可满足的同 slot/裙装冲突。
- 多个锁定配饰由 `appendRequiredItems` 作为整体追加到每个保留候选；replacement 只从统一 eligible/available 集合选择，并跳过所有锁定目标，因而不会移除 locked item 或引入非 available 衣物。
- availability 更新以 compare-and-swap 条件和事件插入放在同一写事务；同状态请求是无事件的幂等 no-op。推荐统一 eligibility 硬过滤四种非 available 状态，并为真正缺失的核心 slot 返回 unavailableCount。
- 专项测试标题与计划风险高度对应：迁移原子性/演练、EXIF/ICC/XMP、路径穿越/symlink、trusted import replay、历史 snapshot、派生 replacement、多配饰/冲突约束、feedback replay/rollback/clear、availability rollback、V2/ZIP 完整性均有直接用例，而不只是间接 UI 快照。
- README、`docs/api.md`、`docs/schema.md` 均已覆盖 M1 两阶段导入/图片、M2 saved outfits/约束/replacement、M3 feedback/availability/learnedPreference/clear 事务；抽查的路由名、enum、阈值和 schemaVersion 与代码一致。
- 隔离浏览器与数据库联合复验通过：M1 同来源重复导入仅保留 1 条 v2 source/1 件 garment，尺码可从 `M` 显式清为空；M2 同 candidate 的编辑父记录与干净父记录同时保留，replacement 精确派生自白衬衫+黑裤的干净父记录；M3 共有 3 条不同 pair 反馈、1 条 wear log、3 条 pair stats，`weightedPairCount=0`，评分和评论可清空且 actuallyWorn 仍为 1。
- 归档灰色长裤后，隔离库保持 5 件总衣物、4 件 active、1 件 archived；历史编辑器显示“来源衣物已归档”，未误判为删除，也未把归档衣物带回可选集合。
- 浏览器控制台暴露并已修复 React 直接渲染 `javascript:` 书签 href 的未来兼容警告。修复后 DOM 仍呈现可拖拽的 javascript 书签 URL，重新进入导入页不再产生该警告；残留的 “Receiving end does not exist” 来自浏览器扩展通信，不是应用日志。
- 自动化仍不是所有验收标准的充分证据：M1“60 秒内建档”、键盘/真实移动端、以及 M3 清空前实际用户可见范围属于交互/可用性要求，需要本轮浏览器复验或沿用可审计的旧浏览器证据时明确降低证据等级。

### 子 Agent 初步缺陷（待主 Agent 复现）
- M1：`privacy-clean` 当前未扫描 `data/garment-assets`，与计划中“失活旧图片后续由 privacy-clean 预览/确认处理”的勾选声明不一致；数据库清理后可能遗留手工照片与失活资产。
- M1：Taobao batch 顶层/条目字段可能未被严格校验，畸形 `source/pageType` 可通过 preview，commit 在 SQLite 绑定处变为非结构化 500；需主线复现并检查 validator 边界。
- M1：导入审阅把空尺码映射为 `undefined`，JSON 后丢失清空 override；未选行仍可编辑可能形成 include=false+overrides 并被服务端拒绝。需浏览器/组件路径复核。
- M2：替换弹窗展示 candidate suggestion，但应用时复用任意相同 `sourceCandidateId` 的已保存搭配作为父记录；若父记录后来被 OutfitBuilder 改过，最终新版本可能与弹窗展示不同或 target 不存在而失败。
- M2：API 文档遗漏运行时约束原因 `UNAVAILABLE`，README 同样未明确该错误枚举。
- M3：先“实际穿了”再提交喜欢/不喜欢时，反馈弹层疑似显式发送 `actuallyWorn:false`，服务端会把 feedback 的 worn 标志清零但保留 wear_log_id，导致穿着事实、pair stats 与洞察矛盾。
- M3：洞察 UI 以全局 feedback 总数达到 3 条宣称“已达到排序阈值”，但阈值实际按每个 garment pair 计算；互不重叠的反馈会造成误导。

### 主 Agent 静态复核结果
- **已确认 M1 计划偏离：** `scripts/privacy-clean.mjs` 的目标只有登录态、采集 JSON、缩略图、日志和 `data/outfit.sqlite*`，完全没有 `data/garment-assets`。计划已勾选“后续由 privacy-clean 预览和明确确认处理”，当前实现无法做到；清数据库反而会失去资产关联而留下照片。
- **已确认 M1 严格校验缺口：** `assertBatch()` 只保证 payload/items 是对象/数组，不验证 batch.source/pageType/pageUrl/capturedAt 或 item 字段类型；source/pageType 被原样传入 SQLite bind，存在 preview 成功而 commit 500 的路径。
- **已确认 M1 UI 缺口：** 取消勾选会清 overrides，但 editor 的 disabled 条件不含 `!decision.include`，取消后仍能重新编辑并构造服务端拒绝的 include=false+overrides；size 清空写 `undefined`，无法表达“覆盖为空”。
- **已确认 M2 数据源漂移：** replacement 弹窗展示 `suggestion.nextItems`，应用函数却只按 `sourceCandidateId` 找首个 saved outfit 并基于其当前 items 调 replacement API，未比较 candidate snapshot；保存后编辑或重复保存均可能导致展示与实际新版本不一致。
- **已确认 M3 worn 状态回退：** `FeedbackDialog` 总是输出 boolean `actuallyWorn`，App 未传 initialFeedback，所以喜欢/不喜欢路径发送 false；service 将 false 覆盖既有 true、却保留 wear_log_id，随后重算移除 worn 信号。
- **已确认 M3 阈值文案错误：** UI 直接以全局 `summary.totalCount >= 3` 判定“已达到排序阈值”，而真实算法按每个衣物 pair 的 `totalFeedback >= 3` 生效。
- **动态确认 M1 500：** 内存 DB 中 `{source:{unexpected:true}, pageType:'order-list', items:[合法衬衫]}` 能 preview 出 1 个候选；commit 随后抛原生 `TypeError: Provided value cannot be bound to SQLite parameter 2.`。API 会将其包装为 500 `INTERNAL_ERROR`，不是计划要求的结构化 400。
- **动态确认 M3 事实分裂：** 内存 DB 先提交 `actuallyWorn:true`，再模拟 UI 提交 `verdict:'liked', actuallyWorn:false`；最终 feedback 为 false、`wearLogId=1` 且 wear_logs 仍为 1 条，pair stats 变为 likes=1/wornCount=0/signal=1。缺陷可确定复现。
- **M3 反馈编辑契约缺口：** App 不回存/传入 initialFeedback；用户重新打开看到空评分/评论，而构造器省略空值、服务端又保留旧值，因此界面无法忠实回显或显式清除既有评分/评论。
- **M2 低严重度 UX：** OutfitBuilder 能区分 archived/deleted，但 App 只传 active garments、未传已经加载的 archivedGarments，导致归档来源在编辑器中被误报为“已删除”；不破坏 snapshot，但文案误导且生产接线未被组件测试覆盖。
- **浏览器再次确认 M3：** 隔离页面对同一首选搭配依次执行“实际穿了 → 喜欢 → 保存反馈”；页面先显示“已记录实际穿着”，最终 QA DB 却为 `actually_worn=0, wear_log_id=1`，wear_logs 保留一条，pair stats `worn_count=0`。这是生产 UI 的真实可达路径，不只是 service 人工输入。
- **浏览器确认 M2 预览/落盘不一致：** 原候选为“蓝衬衫+灰长裤”，保存后在 OutfitBuilder 改为“蓝衬衫+黑长裤”；从原推荐打开“换蓝衬衫”时弹窗明确预览“白衬衫+灰长裤”，点击应用后数据库派生记录实际为“白衬衫+黑长裤”，页面仍展示旧预览并提示成功。
- 隔离浏览器同时验证了账号创建、4 件手工衣物快速建档、推荐生成、保存/编辑和替换入口均可正常操作；缺陷集中在状态一致性而非页面不可用。
- **动态确认 M1 legacy 碰撞：** 内存 DB 先放入 `order-001` 的 legacy key，再预览同商品同 SKU 的 `order-002`，错误 disposition 为 update；commit 后 created=0/updated=1、衣物仍 1 条，原来源记录的 order_id 被覆盖为 order-002，external_key 仍是 legacy。
- **动态确认 M1 图片旁路：** `validateGarmentUpdate()` 接受绝对 Windows 路径 imageUrl，`updateGarment()` 原样落库并返回；专用净化 asset 路由并非唯一图片写入口，绝对路径/任意 URL/data URL 边界可被绕过。
- 只读检查真实 `data/outfit.sqlite`：当前没有 `schema_migrations`，627 条来源记录的 v2 key 数量为 0；读取前后 LastWriteTime/Length 均未变化。未迁移本身是尚未启动新版应用的部署状态，但说明 legacy 碰撞会直接影响现有数据的下一次导入，不是理论边缘情况。

### 本轮最终验收结论
- **总体结论：NO-GO / 不通过。** M1–M3 的主体架构和绝大多数功能真实存在，自动化与构建基线优秀，但三份计划的“已完成并通过验收”声明不成立；每个里程碑至少有一个已动态复现的阻断缺陷。
- **M1 不通过：** 高风险为 legacy key 跨订单误合并、通用 garment PUT 绕过图片引用边界、privacy-clean 未覆盖 garment assets；中风险为畸形 batch preview→commit 500 与导入审阅状态缺陷；API 文档另有错误码/状态码不一致。
- **M2 不通过：** 替换弹窗预览基于 candidate snapshot，实际派生却基于任意同 candidate 的可编辑 saved outfit，已在真实浏览器复现“预览白+灰、落盘白+黑”；另有 archived 被误报 deleted 和 UNAVAILABLE 文档遗漏。
- **M3 不通过：** 真实浏览器复现“实际穿了→喜欢”使 feedback 的 actually_worn 归零但 wear log 保留；洞察把全局 3 条误当 pair 阈值，反馈重新编辑也无法忠实回显/清除旧评分与评论。
- **通过证据：** `npm run typecheck`；Vitest 27 文件 365/365；unittest 25/25；pytest 33/33；npm 生产/全量审计 0 漏洞；临时目录生产构建 1595 模块成功；390×844 无页面横向溢出。
- **证据缺口/环境风险：** 未安装 pip-audit，Python 依赖未做同等级漏洞数据库复验；本机 node_modules 有少量 extraneous 包；标准 build 因删除约束未清理现有 dist，而使用临时 outDir 完成等价构建。
- 文档抽查确认三处低风险不一致：图片像素错误应为 `IMAGE_PIXEL_LIMIT_EXCEEDED`/413 而非 `IMAGE_PIXEL_LIMIT`/400；DELETE 不存在应为 404 `NOT_FOUND` 而非 400；约束 reason 列表遗漏 `UNAVAILABLE`。
- 修复优先级：先处理 M1 数据误合并与图片旁路、M3 穿着事实一致性、M1 资产隐私清理、M2 replacement snapshot 一致性；再处理反馈编辑/阈值文案、严格 batch 校验、导入审阅与文档。

## 2026-07-12 M1–M3 验收缺陷修复
- 本轮目标覆盖上一轮报告的全部高、中、低风险，不把“测试转绿”缩减为只修阻断项。
- 当前产品源码基线无改动；工作区仅含 `task_plan.md`、`findings.md`、`progress.md` 三份验收记录的既有差异。
- 真实 `data/outfit.sqlite` 继续只读保护；迁移与导入修复必须在内存或副本上验证。
- 三个并行写入域已划定：M1 导入、M1 图片/隐私、M2/M3 状态一致性；共享文档由主 Agent 最后统一更新，避免冲突。
- 前端通用 `updateGarment(id, Partial<Garment>)` 的类型仍允许 imageUrl；即使路由拒绝，也应在集成阶段收窄客户端公开更新类型，形成编译期和运行时双重边界。
- 可信图片变化已有独立路径：`selectGarmentThumbnail()`、手工图片 raw 上传及内部 DB 服务，因此公开 PUT 禁止 imageUrl 不会阻断合法图片工作流。
- 文档需统一修正四类内容：privacy-clean 现状说明、图片像素错误码/状态、DELETE 不存在状态、推荐约束 `UNAVAILABLE`；反馈 GET/显式清空与 weightedPairCount 属于新增契约，也必须同步。
- README 当前对反馈、replacement 和 privacy-clean 的用户承诺都需要在修复后补充不变量：actuallyWorn 不可逆、替换父快照精确匹配、asset root 随显式隐私清理删除。
- 真实数据库旁存在约 1 MB WAL 与 32 KB SHM；迁移演练不能只 `Copy-Item outfit.sqlite`，必须使用 SQLite 在线 backup/一致性快照方式，否则可能遗漏 WAL 中的已提交数据。
- 现有 migration rehearsal 仅对冻结 fixture 做 copy+迁移，不覆盖当前真实 WAL 数据库；最终需增加一次独立在线副本验证，但不得修改源库。
- 当前 Node v24 的 `node:sqlite` 明确导出异步 `backup(sourceDb, path, options)`，类型说明基于 SQLite backup API 并会处理其他连接写入导致的重启；最终演练将用只读 `DatabaseSync` 源连接和该 API 生成一致性副本。
- 子 Agent 实现结果：M1 导入专项 71/71、M1 图片/隐私专项 10/10、M2/M3 专项 58/58；三者均通过 typecheck，最新串行全量 Vitest 为 29 文件 409/409。
- M1 导入新增安全迁移语义：legacy 仅在 orderId+itemId+SKU 一致时匹配，同订单原位升级 v2，不同订单新建；legacy/v2 并存冲突返回 `IMPORT_SOURCE_CONFLICT` 409 并回滚。
- M1 图片边界新增公开路由错误 `GARMENT_IMAGE_UPDATE_FORBIDDEN` 400；privacy-clean 计划新增敏感目录 `data/garment-assets`，测试删除仅发生在系统临时夹具。
- M2/M3 新契约包括 candidate feedback GET、rating:null/comment:"" 显式清空、wear_log 不可逆、weightedPairCount 与精确 candidate 父快照匹配；主线仍需审查实现细节和并行兼容性。
- 主审 M1 导入实现确认：普通导入与可信审阅提交两条写路径都在落盘前执行 orderId+itemId+SKU 的 legacy 身份核验；安全同源会原位升级 external_key，legacy/v2 双记录则用 409 终止事务，避免跨订单覆盖。
- 严格 batch 校验已覆盖顶层类型、pageType 枚举、数量/金额、URL/文本长度、detailProps 与 detailImages 嵌套结构；空金额字符串仍兼容既有采集器。审阅表未勾选行现在禁用编辑器，尺码空字符串会作为显式 override 保留。
- 本轮代码主审暂未发现新的 M1 阻断项；仍需结合测试与真实 legacy 数据库在线副本验证升级行为。
- M1 导入回归不是表面断言：测试分别固定了跨订单 create、同订单 legacy 原 ID 升级、内部批量导入幂等、显式空尺码、触发器制造的 UNIQUE 冲突与事务回滚、预存双 key 冲突，以及 preview/commit 两阶段畸形输入均不落库。
- M1 图片路由在参数校验后、通用更新前检查请求体自身 `imageUrl` 字段，任何值都返回专用 400，避免同一请求其余字段部分写入；privacy-clean 新增 `data/garment-assets` 且仍保持默认仅预览、显式 `--confirm` 才执行。
- privacy-clean 的删除回归只操作 `os.tmpdir()` 下动态夹具；不会触碰工作区真实资产。测试本身会留下临时父目录，但不构成隐私清理生产路径风险。
- 新图片边界测试通过真实 Express 路由逐一覆盖绝对路径、data URL、任意 HTTPS 与伪造本地 asset URL，并断言同请求中的名称不被部分更新；正常字段更新仍返回 200。
- M3 前端契约已从“每次空白表单”改为打开时 GET 既有 feedback：对话框加载期间禁止提交，requestId 防止异步串候选，返回后重新水合评分/原因/评论；提交总是发送 `rating:null` 与 `comment:""` 表达显式清除，actuallyWorn 未知时不再默认 false。
- 洞察阈值展示改用服务端 `weightedPairCount`，不再把全局 totalCount>=3 当成组合已参与排序；客户端公开 garment 更新类型也已排除 imageUrl、availability 与服务端状态字段。
- M2 replacement 精确父记录匹配会比较 candidateId、garmentId、snapshot id、slot 与 position；仍需继续核对生产调用和同 slot 多件衣物的 position 生成是否与服务端一致。
- M2 replacement 的生产调用已改为先 `resolveSavedRecommendationParent`：仅复用精确快照，否则调用候选快照保存接口创建干净 parent，再从该 parent 派生替换版本；已编辑的同 candidate 记录不会再污染弹窗预览对应的落盘结果。
- 前端 position 计算与服务端 `canonicalizeOutfitSlots` 使用同一规则（slot 固定顺序、同 slot 按 garment id、从 0 递增），因此多配饰也能精确匹配；新增测试固定了编辑后不复用、错 position 不复用、干净 parent 重放复用。
- OutfitBuilder 现在接收 active+archived 衣物用于历史状态解析，但现有可选列表仍由组件内部按 active 条件过滤；归档快照可显示“已归档”而不会重新成为可选衣物。
- M3 服务端把 `wear_log_id IS NOT NULL` 视为不可逆穿着事实：即使后续显式传 `actuallyWorn:false`，持久化映射和 pair 重算都会保持 worn=true；对应服务与认证 API 测试复现了原“实际穿了→喜欢”顺序并断言 wear log 仅一条、wornCount 仍为 1。
- feedback GET 路由注册在静态 `clear-preview` 之后，避免动态 candidateId 抢占；未知候选仍 404，已知无反馈返回 JSON null。rating 的 undefined=保留、null=清空，comment 的 undefined=保留、空字符串=清空。
- `weightedPairCount` 来自当前 `outfit_pair_stats.total_feedback >= 3` 的真实行数；测试用三个 candidate 证明只有共同出现三次的那一对计入，而不是按全局反馈数推断。
- 发现一个新增契约边缘待处理：当前校验把仅 `rating:null` 也视为“有效反馈”，因此对尚无反馈的合法候选可能创建一条完全空白记录。显式清空既有反馈需要保留，但首次空清除应在服务层拒绝或定义清晰。
- 上述空反馈边缘已修复：服务在合并旧值与清空标记后检查最终持久化信号；若 verdict/rating/worn/reasons/comment/woreInstead 全为空则事务内抛出 ValidationError。既有 verdict 或穿着事实仍允许只清空 rating/comment。
- 新回归按 TDD 先失败后通过；`recommendationFeedback`、认证 feedback API、M3 前端三文件合计 22/22 通过。
- 文档定位确认既有差异仍在：图片像素错误写成 `IMAGE_PIXEL_LIMIT`/400，DELETE 不存在写成 BAD_REQUEST/400，约束 reason 缺 `UNAVAILABLE`；feedback 尚无单候选 GET、null/clear 与 wear 不可逆说明。
- README 的隐私清理清单仍漏 `data/garment-assets`，replacement 说明也未声明只复用精确候选快照；这些均需与已落地行为同步。
- import API 文档当前只说 v2 key，尚未定义 orderId+itemId+SKU 的安全 legacy 升级、双 key 409 冲突与严格 runtime batch 校验。
- schema 的 privacy-clean 尾注仍明确声称 garment-assets 不在范围，已与代码相反；garments 更新行为也需要声明公共 PUT 禁止 imageUrl，feedback 表需记录 wear_log_id 对 actually_worn 的事实优先级。
- 三份里程碑计划的旧验收记录保留了当时的测试数量；本轮应追加“缺陷修复复验记录”，不能覆盖历史证据，也不能在最终全量测试完成前预写新数字。
- README/API/schema 与三份计划已完成契约同步；反向搜索确认旧图片错误码、DELETE 400、garment-assets 不清理、缺 UNAVAILABLE、旧 itemId+sku 去重说法均为 0 命中，六份文档 `git diff --check` 通过。
- API 洞察示例已加入 `weightedPairCount`，三份计划以新增复验段保留原历史记录，未伪造尚未完成的最终全量测试数字。
- 使用 `node:sqlite.backup()` 从只读真实连接生成 WAL 一致性副本，并仅在副本上执行 baseline 0 与迁移 1–4；`schema_migrations` 最终精确为 0/legacy-baseline、1/recommendation-candidates、2/trusted-ingestion、3/saved-outfits、4/feedback-availability。
- 真实旧数据比预想更稀疏：627 条来源中没有同时具备 orderId+itemId+SKU 的行；第一次筛选还叠加 is_apparel，第二次要求非空 SKU，均在选中/导入前中止。最终使用可重算且已关联 garment 的真实 legacy 行 443（有 orderId+itemId、空 SKU）完成演练。
- 副本结果：来源 443 preview=update，commit 原 ID 升级为 `v2:` 且总数仍 627/37；同 item/空 SKU 换成不同 orderId 时 preview=create、总数变 628/38；同批重放 preview=unchanged，commit unchanged=1，数量不再增长。
- 真实源 `outfit.sqlite`、WAL、SHM 前后 size/mtimeNs 完全相同（1081344/1009432/32768 字节），确认未被迁移或写入。
- 含真实敏感数据的演练副本按不擅自删除约束保留在 `C:\Users\Vader\AppData\Local\Temp\outfit-realdb-rehearsal-wyUfH7\outfit-rehearsal.sqlite`；没有删除任何文件。
- 最终代码回归当前结果：Vitest 29 文件 410/410；TypeScript `tsc --noEmit` 通过；Python unittest 25/25、pytest 33/33。主审新增的空反馈保护使总数从子 Agent 阶段的 409 增至 410。
- 依赖安全：npm 生产与全量审计均为 0 漏洞；`pip-audit -r requirements.lock.txt` 为 0 已知漏洞，`pip check` 无破损依赖。`npm ls --depth=0` 成功但列出若干 extraneous WASM/tslib 辅助包，属于本机 node_modules 卫生项；本轮不通过删除清理。
- 非破坏性生产构建成功：Vite 8 转换 1595 模块，在 `C:\Users\Vader\AppData\Local\Temp\outfit-build-a2fb6e15f6154222a720d0e2b44eec0f` 生成 6 个文件；使用 `--emptyOutDir false`，现有 dist 未被清理或改写。

## 2026-07-13 Outfit M4 穿搭日记与周计划

### 需求与硬约束
- 严格执行 `docs/2026-07-10-outfit-m4-diary-week-plan.md` 的全部十二项实施任务和四项验收标准。
- M4 硬依赖 M2，并必须兼容已完成的 M1–M3 数据、saved outfits、反馈/可用状态和现有五项移动主导航。
- 采用 TDD；新增写接口继续经过 session、Origin/Sec-Fetch-Site、严格输入校验和结构化错误。
- `planned_date` 是用户时区下的 `YYYY-MM-DD` 日历键，`worn_at` 是 UTC ISO timestamp，IANA `time_zone` 单独保存；API 必须拒绝带时间的 plannedDate 和未知时区。
- 旧 `wear_logs` 迁移必须保留全部 context JSON 类型及缺失衣物 ID 的 legacy snapshot，但不能创建无效外键。
- 删除任何电脑文件前必须先告知目标与影响并取得明确确认；本轮默认不删除，真实数据库不得原地迁移。

### 初始实现审计
- 本轮开始时 Git 工作区除三份规划记录外无产品源码改动；必须继续保留历史规划差异。
- 当前编号迁移为 1–4，M4 应新增 migration 5；旧 `wear_logs` 位于冻结 baseline 0，`recommendation_feedback.wear_log_id` 仍外键引用它，迁移方案必须兼容 M3 的不可逆实穿事实。
- `server/services/weather.ts` 当前只返回单个 `WeatherSnapshot`，Open-Meteo 请求硬编码 `forecast_days=4`，尚无逐日 1–7 天列表契约。
- 目前没有 planner 路由、service、feature 或 `tests/planner.test.ts`；历史页已集中承载 wear logs、saved outfits 与 insights，适合在该主导航项内增加四个二级页签。
- `server/db.ts` 仍包含 `saveWearLog()` 与旧日志查询；M4 必须决定兼容写路径或原子镜像，不能让 M3 feedback 继续写旧表而新日记只读新表。
- 修改前自动化基线为 TypeScript 类型检查通过、Vitest 29/29 文件与 410/410 测试通过；后续测试数量变化可据此核对。
- M3 `submitRecommendationFeedback()` 在 `BEGIN IMMEDIATE` 内调用 `saveWearLog()`，并把旧日志 ID 存入 `recommendation_feedback.wear_log_id`；M4 迁移不能简单停止旧表写入，需保留 ID 兼容并在同一事务生成/关联新 WearEvent。
- `server/routes.ts` 在所有业务路由之前统一执行同源写保护和 `/api` session 鉴权；新增 planner router 只要在该鉴权中间件之后注册即可继承安全边界。
- 当前洞察的衣物分布已经基于 `listGarments(db)` 默认 active 范围，但穿着计数仍扫描旧 `wear_logs`；M4 需改用 wear event items，并新增“近期未穿”字段/口径而非把它与 neverWorn 混为一谈。
- V2 导出当前 feature 终止于 `feedback-availability`，包含旧 wearLogs 但没有 wear events/plan entries；M4 需要保持旧字段兼容并新增导出数组、shape 校验与 `diary-week-planner` feature。

### 冻结实施决策
- migration 5 固定命名 `diary-week-planner`；旧 wear event ID 沿用 wear log ID，旧时间按 SQLite UTC 语义正规化为 ISO Z，时区记为 `UTC`。
- 新增 `recommendation_feedback.wear_event_id` 并回填旧关联；旧 `wear_logs` 表为兼容保留，但迁移后旧端点和 M3 feedback 都改由 WearEvent service 写入，避免双事实源。
- 默认周查询显式接收 IANA `timeZone`；forecast 路径保持 `/api/weather/forecast`，同时接收现有位置来源所必需的 latitude/longitude 与 1–7 days。
- “近期未穿”固定为 30 天；重复同套按规范化 item ID 组合签名而不是 saved outfit ID，formal 28 天、date/dinner 14 天，其余场合不提醒。
- V2 `version` 保持 2，schemaVersion 升 5；旧 V2 新字段可缺，当前 builder 始终输出 wearEvents 与 outfitPlanEntries。

### 天气实现结果
- `fetchWeatherForecast`、`mapOpenMeteoForecastDays`、`buildEstimatedWeatherForecast` 已实现，days 仅允许 1–7 整数，默认 7；单日 API 保持兼容。
- daily 温度/体感取最高最低均值，逐日降雨概率、天气码、最大风速按索引映射；服务专项 12/12 通过。

### 前端组件契约
- PlannerView/WeekGrid 为受控周视图；WearDiaryPanel 为受控事件列表；WearEventDialog 与 OutfitPlanDialog 负责浏览器侧日期、IANA 时区、衣物/搭配和天气快照表单校验。
- 组件不直接调用 API，App 可统一刷新计划、日记和洞察，避免局部状态导致统计滞后；planner UI 专项 9/9 通过。

### 核心实现与兼容结果
- migration 5 使用旧 wear_log ID 回填 WearEvent，缺失衣物仅留 legacy snapshot；三张 STRICT 表和计划/事件关联已落地。
- mark-worn 原子创建事件并更新计划，重复调用幂等；删除事件会同事务重置计划、撤销新旧反馈实穿关联、删除空反馈并重建 pair stats。
- 新推荐反馈首次 actuallyWorn 在原反馈事务内调用 `insertWearEvent`，后续反馈复用同一事件；旧 wearLogId 与新 wearEventId 同时兼容。
- 旧 `/api/wear-logs` 已成为新 WearEvent 模型适配器，不再新增旧表行；缺失衣物遵循 legacy-only 语义。

### 真实浏览器与终检发现
- 真实 `type=date` 自动化输入会发出 input，但原实现只监听 React change，造成控件显示 2026-07-14、草稿提交仍为 2026-07-13；同时监听 `onInput` 后，日期、天气预览和最终卡片一致。
- 新建计划传入默认日期不能用于推断编辑模式；已把 create/edit 作为显式 prop，避免新建流程标题误写为“编辑计划”。
- 28 天正式搭配提醒真实触发且不禁止保存；当前服务在返回提醒时条目已落库，UI 必须明确“已保存/保留”语义，避免关闭或换一件被误解为撤销。
- 最终只读复核发现原重复查询只看目标日期之前，导致先建晚日期、再补早日期时漏报；正确契约是按目标日期前后对称 14/28 天窗口查计划与实穿，更新时排除自身。
- 穿着/计划更新的可选字段必须区分“省略=保留”与 `null`/空值=清空；mark-worn 对话框允许编辑的衣物、场合、搭配必须被服务完整尊重，不能静默回退到原计划搭配。
- 冻结天气快照属于历史事实：编辑同一天的备注等字段应保留原快照；只有日期改变且新日期存在逐日 forecast 时才替换。

### M4 最终证据与结论
- API/事务最终契约区分“省略=保留”和 `null`/空值=清空；mark-worn 写入对话框中的实际 outfit、occasion、itemIds、notes，并保留计划自身的原始计划快照。
- 重复提醒按目标日前后对称窗口查询计划与 WearEvent，formal 为 ±28 天、date/dinner 为 ±14 天；更新排除自身，多个冲突选择最近日期，同距选择较早日期。
- 真实交互中 7 月 13 日正式计划与 7 月 14 日正式计划触发 28 天提醒，提示明确计划已经保存；计划天气分别冻结为雷雨 35°C 与小雨 37°C。
- 计划实穿记录被改为晚餐、无保存搭配关联、单件实际衣物后仍正确落库；日记再关联整套、清空关联与备注、最终撤销均成功，撤销后计划恢复 planned 且穿着计数归零。
- 移动端页面本身没有横向溢出；2344px 的七日网格被约束在 375px 的 `overflow-x:auto` 容器内，五项移动主导航未发生 M4 信息架构膨胀。
- 最终回归为 Vitest 455/455、Python 25/25 与 33/33、typecheck/构建/diff check 全通过；npm 和 Python 依赖均无已知漏洞。最终浏览器控制台无 warn/error。
- M4 当前无已知阻断项；仅保留本机 `node_modules` 的既有 extraneous 辅助包卫生提示，不执行删除清理。

## 2026-07-13 Outfit M4 独立验收与修复

### 验收原则
- 本轮针对 `docs/2026-07-10-outfit-m4-diary-week-plan.md` 重新建立计划条目—实现—测试证据链，不把上一轮“已完成”记录直接视为通过。
- 对彼此独立的后端与前端区域使用只读子 Agent 并行审查；修复仅在主线确认可复现后进行，避免多个 Agent 修改同一逻辑。
- 不删除任何电脑文件，不原地迁移或写入真实数据库；现有未提交改动一律先识别来源并保留。

### 待验证问题
- 十二项实施任务是否全部进入生产路径，而非只存在类型或孤立测试。
- 四项验收标准是否同时具备自动化和关键真实交互证据。
- 上一轮 455 项 Vitest 通过后，当前工作区是否仍保持相同契约且没有新回归。

### 恢复与工作区基线
- session catchup 仅提示 1 条未同步工具调用；Git 实际状态确认产品源码干净，只有本轮新增的三份规划记录差异（60 行新增、1 行替换）。
- M4 计划正文已勾选十二项任务并记录 455/455 测试与真实交互，但这些仍属于待独立核验的完成声明。
- 项目内唯一 `AGENTS.md` 只补充中文计划/回答要求；用户消息中的 PowerShell、删除与子 Agent 约束继续适用。
- 当前 HEAD 为 `bcd5ab4 feat(planner): complete M4 diary and weekly planning`，M4 产品代码已提交；工作树产品代码干净。
- M4 相关生产文件、专项测试和 API/Schema 文档均存在；项目标准验证入口是 `npm run typecheck`、`npm test`、`npm run build`。
- 当前独立基线：`npm run typecheck` 通过；M4 五个核心专项文件共 54/54 通过。
- M4 提交实际覆盖 46 个文件、约 7568 行新增/170 行删除，包含生产接线、测试和文档，不是仅更新计划勾选。

### 主线静态审查（进行中）
- `outfitPlanner` 对 create/update/mark-worn 使用 `BEGIN IMMEDIATE`，计划日期、UTC 实穿时间、IANA 时区、天气日期匹配与对称重复窗口均进入生产路径。
- 重复提醒按衣物组合签名而非 outfit ID，检查目标日前后窗口并在更新时排除自身；formal=28 天、date/dinner=14 天、其他=0。
- 待交叉确认一项边界：服务端 `assertOutfitCanBePlanned()` 当前只验证 saved outfit 存在和有有效衣物，未显式排除已归档保存搭配；UI 是否足以封闭该路径不能替代 API 校验。
- `wearEvents` 的创建、更新、删除都在即时事务中；删除会把关联计划恢复为 planned、撤销反馈实穿事实并重建 pair stats，统计回滚进入生产路径。
- 迁移 5 创建三张 STRICT 表、所需索引，并保留全部 legacy context JSON 与缺失衣物 ID；M3 feedback 的 `wear_event_id` 也被回填。
- 已复现并修复一个一致性缺口：关联计划的 WearEvent 修改 `wornAt` 后，旧实现只更新 `wear_events.worn_at`，计划 API 继续返回旧时间。新增回归先稳定失败（12/13），随后在同一 WearEvent 更新事务内同步 `outfit_plan_entries.worn_at/updated_at`。
- 修复后 `tests/planner.test.ts` 13/13、`npm run typecheck` 与 `git diff --check` 通过。
- 天气 forecast 路由对经纬度与 1–7 days 做结构化校验，缓存 key 含坐标和天数，缓存 payload 会重新验证数组长度/shape，失败时按新鲜→陈旧→估算顺序回退。
- 子 Agent 复现 DST 午夜跳转缺口：`America/Sao_Paulo` 的 2018-11-04 与 `America/Santiago` 的 2019-09-08 当日从 01:00 开始，旧日界算法强制要求本地 00:00 存在，导致合法日期查询失败；计划的“夏令时边界”验收并未覆盖该类区域。
- 修复 DST 后继续覆盖国际日期线极端边界：`Pacific/Apia` 跳过 2011-12-30 时，查询有效的 12-29 不能因 exclusive end 日期不存在而失败；结束边界现允许取目标日期之后的第一个有效 instant，起始日期仍必须真实存在。
- 子 Agent 确认天气补全接线缺口：首次历史刷新会为已进入 7 天预报的当前周计划补天气，但切换周的 `refreshPlannerWeek()` 只 GET 计划，不执行相同 hydration，因此周中/周末查看下一周时仍可能保留空快照。
- 子 Agent 确认已穿计划 UX 缺口：周卡对 `worn` 状态仍显示“编辑”，但服务固定返回 409 并要求修改日记，当前按钮是必失败操作。
- 后端审查发现旧 `/api/wear-logs` 兼容写入口会静默过滤非法 garment ID、接受未知字段，甚至可持久化非安全整数，随后新 WearEvent 读取器报错；已新增 API 回归并收紧为仅允许 garmentIds/context、1–24 项不重复正安全整数、合法 JsonValue。
- 迁移天气提升原先只检查字段类型，非法日期、空 summary、额外字段仍会进入权威 weather_snapshot 并导致读取失败；新增三类 fixture 后改为与新读取契约完全一致的严格 shape，畸形原值继续保留在 legacySnapshot。
- `docs/api.md` 的反馈段仍沿用 M3 `wear_logs`/不可逆口径；已同步为 M4 WearEvent、兼容双 ID 和显式删除日记撤销事实的真实行为。
- 新旧 `wornAt` 校验都曾依赖 JavaScript `Date`，会把不存在的 `2026-02-30` 静默归一到 3 月；现已在 Date 解析前严格验证日历日期、时间和 UTC offset，迁移与新 API 口径一致。

### 前端缺口修复结果
- 历史计划编辑会把原 plannedDate 纳入有效最小日期；已穿计划改为打开关联日记事件，不再发必然 409 的计划 PUT。
- planned/skipped 卡片现提供“跳过/恢复计划”，恢复触发的非阻断重复提醒复用既有提醒弹窗。
- `hydratePlannerPlansWeather()` 被启动刷新和切周刷新共用；进入七天 forecast 的计划可在切换周时补写冻结快照。
- `loadAllWearEvents()` 会逐页消费 nextCursor 并检测游标循环，日记不再静默截断第 101 条之后的记录。
- plannerToday 改为可更新状态，每 30 秒检测本地日历日；若仍在原当前周，跨周会推进周起点并刷新，否则保留用户正在查看的历史/未来周。
- 不完整的 ARIA grid/gridcell 声明改为 list/listitem；横向滚动容器和原生按钮键盘路径保留。
- 主线逐段复核上述生产接线；前端专项 4 文件 105/105、统一 typecheck 与 diff check 通过。

### 边界决策
- “超出 7 天只保存场合、临近后补天气”由 forecast 获取和前端 hydration 流程保证；不新增服务端按当前时钟拒绝 `weatherSnapshot` 的规则，因为 API 接受的是可选冻结事实，现有契约没有声明服务端可判断其来源/时效。主线短暂实现后经后端交叉审查撤回，避免破坏离线旧快照或既有客户端编辑。
- 已归档保存搭配仍是存在且可长期引用的历史实体；生产 UI 不给它新建计划入口，API 保持“存在即可引用”的当前契约，本轮不擅自扩展为新的 409 产品规则。

### 最终真实浏览器复验
- 使用隔离数据库与本地 QA 服务完成真实交互；未写入真实数据库，未删除任何文件。
- 历史 2026-07-12 计划编辑时 date input 的 `min=value=2026-07-12`、`checkValidity=true`、`rangeUnderflow=false`，备注可成功改为“历史计划编辑已验证”。
- 2026-07-13 计划可从 planned→skipped→planned，UI 分别显示“恢复计划”和成功状态反馈。
- 正式计划 mark-worn 后卡片不再提供计划编辑，只显示“编辑穿着”；实际时间从 11:28 改为 12:15 后，计划卡同步显示 12:15，验证前后端时间副本一致。
- 390×844 视口下 document 为 375/375 无横向溢出；周网格容器为 375/2344、`overflow-x:auto`；移动导航精确 5 项。
- 浏览器控制台 0 warning、0 error。QA 浏览器已关闭，8788/5174 服务进程已停止；临时数据库、日志与快照保留。

## 2026-07-13 Outfit M5 成本、重复购买与购买前检查

### 需求与硬约束
- 严格执行 `docs/2026-07-10-outfit-m5-decision-support-plan.md` 的全部 12 项实施任务与 5 条验收标准；M5 硬依赖已经落地的 M1 与 M4。
- 成本/次只对已知价格计算，零穿着显示“尚无穿着”；最佳价值要求至少穿着 3 次；低利用高成本要求购入至少 90 天、穿着不超过 1 次且价格位于已知价格最高四分位；沉睡单品排除购入未满 30 天的新衣。
- 结构相似度以同类别为硬条件，首版使用颜色、风格、材质、图案、品牌/规范化名称，缺字段时重新归一化；总分达到 75% 才提示可能重复。
- 本地 CLIP 只在已安装时作为可选 10% 特征，禁止自动下载模型、禁止外发图片；embedding 是可重建缓存且不进入导出。
- 购买前检查必须只预览，不写 `source_order_items` 或 `garments`；只有用户显式提交 duplicate/not-duplicate 反馈时允许写数据库。
- 候选 `subject_key` 必须由服务端根据规范化输入生成稳定 fingerprint，不接受客户端提供的任意路径或超长键；同配对反馈使用幂等 upsert，not-duplicate 后立即隐藏。
- 新写接口继续继承本地 session、Origin/Sec-Fetch-Site、结构化错误和严格输入校验；本轮不原地迁移真实数据库，不删除任何电脑文件。

### 恢复基线
- 当前 HEAD 为 `4120491 fix(planner): harden diary integrity and interactions`。
- session catchup 检出上一轮续接消息，但 Git 实际差异只包含本轮 `task_plan.md` 的 M5 规划追加；产品源码尚未修改。
- 规划文件将继续保留 M1–M4 历史证据，M5 只追加新章节和阶段，不覆盖旧完成记录。

### 本轮恢复补记
- 主 Agent 再次完整读取文件规划技能并确认承接现有 M5 阶段 59–63，不另起或覆盖历史阶段。
- 三份规划记录当前规模为：`task_plan.md` 522 行、`findings.md` 796 行、`progress.md` 842 行；首次合并读取因输出过长被截断，后续按区段恢复。
- `session-catchup.py` 成功执行且未报告未同步上下文；尚未修改产品代码，尚未删除任何文件。
- Git 复核确认当前 HEAD 为 `4120491`，分支为 `codex/outfit-m0-foundation`；产品源码干净，仅 `task_plan.md`、`findings.md`、`progress.md` 包含 M5 规划增量。
- 当前 M5 计划列出的三个后端 service、decisionSupport 路由、两个前端组件与 `tests/decisionSupport.test.ts` 均尚未存在，符合从 TDD 红灯开始实施的预期。
- 修改前基线为 `npm run typecheck` 通过、Vitest 32 个文件 464/464 通过；该数字作为 M5 回归比较基线。
- 现有 migration 2 已提供 `garments.acquired_at/purchase_price_cents/currency`，但没有 `cost_source`；可信淘宝 commit 只更新来源和衣物描述字段，不回填价格，因此 M5 必须新增编号迁移，不能改写冻结的旧迁移。
- 当前价值洞察的穿着事实已来自 `wear_event_items + wear_events`，活跃范围来自默认 `listGarments()`；这可直接复用，但 M5 的 90 天/30 天口径、价格四分位和退款排除需要独立纯函数与查询证据。
- 本机 `clip-vit-base-patch32` 已安装在 `output/models/huggingface/Xenova/clip-vit-base-patch32`；现有 `scripts/vision_tags.mjs` 已通过 `env.allowRemoteModels=false` 强制本地模型，可复用同类离线边界，绝不能触发 `models:download:clip`。
- 三个只读审计一致建议 M5 只新增 migration 6 `decision-support`，统一承载 `cost_source`、来源金额/数量显式性、`garment_similarity_feedback` 与可选 `garment_embeddings` 缓存表。
- `normalizeItem()`、`sourceItemToCapturedItem()`、重复项合并和 Python Selenium 采集器都会把缺失 quantity 固化为 1；M5 必须保留 `quantityExplicit/paymentExplicit`，且历史 quantity=1 默认不得回填价格。
- 价值服务不能复用 UI 截断列表；应一次查询 active、非退款衣物和全量 WearEvent 聚合，零穿着用 `costPerWearCents=null`，最高四分位按降序 `ceil(n/4)` 边界并纳入阈值并列项。
- 相似度固定为同类别硬门槛；文本做 NFKC/空白/大小写/列表规范化，缺字段时按参与字段权重重算，总分至少 75 才提示；已有本地 embedding 只作为 10% 可选特征。
- 候选 subject 使用服务端规范化输入的 SHA-256 fingerprint；API 不接收任意 subjectKey。衣物对按 ID 规范化为对称配对，`not-duplicate` upsert 后立即从查询结果隐藏。
- `worksWith` 必须使用活动 Saved Outfit 的 live garment 解析；丢失关联时跳过，不能把历史 snapshot 当成当前兼容字段。购买检查前后须以数据库计数证明无来源/衣物/反馈/缓存写入。
- 洞察 relatedGarmentIds 的精确筛选需要扩展 `WardrobeFilters`，并显示可清除的筛选摘要；跳转前要清除冲突旧筛选与批量选择。
- relatedGarmentIds UI 红灯准确复现为筛选仍返回全部 3 件、建议列表无动作；实现后精确返回目标 2 件，并通过真实 Button 回调传递稳定 ID 列表。
- 历史洞察接线红灯显示底层动作不会自动进入生产页面；补 props 透传后，洞察/购物/身材建议都可调用相关衣物动作。App 跳转时会去重/校验 ID、清空旧批量选择并重置冲突筛选。
- `ValueInsights` 与 `PurchaseCheckPanel` 的首次专项因文件不存在而 0 项加载失败；创建受控组件后 5/5 通过，覆盖零穿着“尚无穿着”、原生 details 证据、87% 相似理由和 duplicate/not-duplicate 明确动作。
- 页面级红灯进一步显示 History 未嵌入价值区域、ImportView 检查模式仍会显示写入流程；补受控 mode 后，检查模式保留采集/预览能力但完全隐藏“提交选择”，只显示“运行购买前检查”和受控结果面板。
- DB/导入 Agent 已完成 migration 6：显式 payment/quantity、cost_source、similarity feedback、embedding 缓存、保守历史回填与双导入链保护；专项 90/90、Python 11/11。
- 价值 Agent 完成 `buildWardrobeValueInsights/getWardrobeValueInsights`，纯函数与 DB 集成 9/9；相似度 Agent 完成三项 service/route 专项 13/13，主线已把四个 API 注册到认证与同源中间件之后。
- 迁移 6 使旧测试中的 schemaVersion=5、feature 列表及 planner 最小 v4 fixture 成为预期跨范围失败；现已统一为 schemaVersion 6、`decision-support` feature，并让最小 v4 fixture 具备迁移 6 依赖表。
- OutfitExportV2 只读取并稳定排序 `garment_similarity_feedback`；测试向 embedding 缓存写入哨兵向量后确认导出完全不含向量、成本/次或排行，旧 V2 无新 feature 时继续兼容。
- 前端四个 API 客户端使用固定路径与 `{ batch, sourceItemKey }`/显式 feedback DTO；主应用不接受/生成客户端 fingerprint，购买检查后由服务端返回 `subjectKey`。
- 价值洞察刷新具有独立 busy/error 边界：失败不会使既有历史、日记、计划与保存搭配刷新整体失败。
- 主应用安全集成测试证明未登录价值 API 返回 401、登录后返回 200、跨站购买检查写请求返回 403；决策支持路由继承既有 session 与同源保护。
- 阶段 60–62 合并专项最终为 Vitest 14 文件 323/323、Python 采集 11/11、`tests/app.test.tsx` 80/80、typecheck 通过。

### 最终实现与验收结论
- 最终只读审查发现初版只有 embedding 读取路径、没有生产写入入口；现已复用受鉴权与同源保护的显式 `POST /api/garments/:id/vision-tags`：本地 CLIP 同次推理输出 512 维 `image_embeds`，服务端校验、单位归一化并编码为 Float32 小端 BLOB，标签与缓存原子幂等 upsert。模型缺失或无效向量不会留下部分数据；相似查询和购买检查仍纯读、不下载、不联网。
- embedding 生产路径 TDD 从 3 失败/1 通过转为 4/4；相关回归 15/15，导出排除 1/1；真实本地离线 CLIP 烟测输出 512 维，范数约 1.0。
- 隔离浏览器先验证价值洞察：3 件已知价格、0 件未知价格、最高四分位 ¥1299；最佳价值衣物穿着 4 次、¥74.75/次；低利用高成本衣物展开后可见 ¥1299、购入日 2025-01-01、穿着 0 次与“尚无穿着”。相关衣物动作精确跳到 1 件衣物并可清除筛选。
- 购买前检查运行前后数据库保持 `garments=3`、`source_order_items=0`、`feedback=0`、`embeddings=0`，结果给出 1 件 100% 可解释重复项、1 套兼容搭配与类别缺口。只有点击“不是重复”后反馈变为 1；UI 立即隐藏该配对，复跑仍为 0 件重复，衣物和来源项未变化。
- 390×844 移动端与 1440×900 桌面端均无横向溢出；移动/桌面导航按断点互斥显示，浏览器页面控制台 0 warning/error。浏览器会话已结束。
- 最终自动化：Vitest 38 文件 508/508、Pytest 34/34、typecheck、视觉脚本语法、`git diff --check`、生产构建均通过。npm 官方生产审计 0 漏洞；`python -m pip_audit -r requirements.lock.txt` 为 0 已知漏洞，`pip check` 无破损依赖。无参数全局 pip 审计只反映宿主 Anaconda 环境，未作为项目结论。
- 非破坏性构建输出保留于 `output/build-m5-final2-20260713`；隔离 QA 数据库与日志全部保留，真实数据库未触碰，本轮未删除任何电脑文件。

## 2026-07-14 Outfit M5 独立验收与修复

### 验收基线
- 本轮以 `docs/2026-07-10-outfit-m5-decision-support-plan.md` 的 12 项实施任务、5 条验收标准和共同执行约束为准，不直接继承 2026-07-13 的完成结论。
- 当前 HEAD 为 `4120491`；M5 产品代码、测试和文档均位于未提交工作树，必须保留并逐项审查，不能用重置或覆盖方式回退。
- `session-catchup.py` 本轮无未同步报告；真实数据库、现有 `dist`、QA 证据和构建产物均不删除。
- 当前独立验收将重点重建四类证据：价格/退款/手工优先的数据事实；价值洞察统计口径；相似度、指纹、反馈幂等与纯读购买检查；前端、导出、安全和文档闭环。
- Git 差异包含 36 个已跟踪文件和 12 个新增文件；产品实现约新增 2,475 行，全部仍未提交。`git diff --check` 通过，仅有 Git 的 LF→CRLF 工作区提示，不属于内容缺陷。
- 修改前独立基线可复现：`npm run typecheck` 通过；10 个 M5/迁移/导入/导出专项文件 141/141 通过；淘宝 Selenium 采集脚本测试 11/11 通过。

### 主线静态审查（进行中）
- 决策支持路由注册位于全局 `/api` session 鉴权之后，所有 POST 同时受既有 Origin/Sec-Fetch-Site 中间件保护；前端 API 使用四个固定路径，不允许调用方拼任意 subject 路径。
- V2 导出新增 `decision-support` feature 和稳定排序的 `similarityFeedback`，shape 校验接受规范候选指纹或规范衣物对；embedding 与派生价值排行不在导出 DTO 中。
- 购买检查 UI 已把导入提交按钮从 `purchase-check` 模式移除，并在运行前/后通过同一原始 batch 与服务端候选 key 调用；原始 JSON 或候选变化会清空旧结果，避免对过期候选反馈。
- 待复现的前端错误态缺口：`PurchaseCheckPanel` 仅在“没有旧结果”时展示 `error`。若显式反馈或复查失败而旧结果仍在，App 只写 `purchaseCheckError`，页面当前不会显示该错误，可能违反计划要求的错误状态闭环。
- 该错误态缺口已由新增回归稳定复现；修复后页面保留上一次成功结果，并同时用 `role=alert` 展示失败原因。`decisionSupportUi` 7/7 与 typecheck 通过。
- `purchaseCheck` 对顶层、batch、item、detailProps 执行 exact-key 校验，并通过既有正规化/预览双重解析要求 `sourceItemKey` 唯一命中未退款服饰；服务只读取衣物、保存搭配、feedback 和 embedding 缓存，没有写语句。
- 相似度实现固定同类别硬门槛、75 分阈值、25/20/15/15/15/10 权重；缺失双方字段时不计入 availableWeight，数组字段用 Jaccard、品牌/名称组合归一化，视觉向量仅在两侧缓存都存在时加入并限制到 0–1。
- garment feedback 对称规范为 `garment:minId + maxId`；candidate subject 仅接受服务端生成的 64 位 SHA-256 格式。`not-duplicate` 读取时在评分前隐藏，upsert 保留 createdAt、更新 verdict/updatedAt，结构上满足幂等。

### 独立审查收口与确认缺口
- 三个只读审查均已返回。价格/价值范围确认价值聚合口径正确，但采集器曾漏认英文退款、误取单价、把型号当数量、截断千分位、丢弃更完整重复快照并合并同单多商品；这些问题均已由对抗回归复现并修复为保守证据策略。
- 相似度/购买检查范围确认核心权重、同类别门槛、反馈幂等与纯读边界正确，但发现 74.96 被展示舍入到 75 后误收录、候选指纹受详情补全影响，以及本机不同端口被宽松当作同源。阈值现使用未舍入得分；指纹仅绑定规范商品身份与 SKU；Origin 必须完整匹配 Host 的主机和端口。
- 前端/导出/文档范围确认 V2 只导出 similarity feedback，不含 embedding 或派生排行；同时发现旧价值结果会掩盖刷新失败、检查/反馈请求缺少归属校验、反馈已保存但复查失败会误报保存失败、退款候选可能成为默认检查对象。上述前端缺口均已补回归并修复。
- 购买检查预览 DTO 现在显式返回 `purchaseCheckEligible` 与不可用原因；前端只列出合格候选，运行检查或保存反馈期间锁定候选、原始 JSON 与所有反馈按钮。App 使用请求版本号丢弃过期响应；`not-duplicate` 保存成功后先本地移除配对，复查失败会明确提示“已保存但重新检查失败”。
- 原有手工价格优先只存在存储层，没有导入衣物可达的公开编辑路径。现有 PUT 严格接受非负安全整数分，服务端强制 `CNY/manual`，衣物编辑器提供元金额控件，淘宝重导入不会覆盖；专项 TDD 15 项全部转绿。
- 当前聚焦验证：typecheck 通过；UI 10/10；按单 worker 重跑 App 80/80、API/DB 92/92、UI/导入 61/61，共 233/233。一次默认并发 worker 异常退出未计为通过，并已用分组结果替代。

### 最终独立验收结论
- 真实浏览器补充发现一个静态/API 专项无法暴露的集成缺口：Vite 的字符串形式代理会隐式改写 `Host`，导致严格 Origin 校验把同一页面发出的正常请求拒绝为 403。对象代理显式 `changeOrigin: false` 后，浏览器登录与所有写接口恢复，同时仍拒绝跨端口 Origin。
- 五条验收标准均有独立证据：未知价格不作为 0、退款不入排行；低利用高成本可展开证据；购买检查本身零写入且只访问本地；重复结果包含理由且反馈可用；not-duplicate 幂等保存后立即及复查时隐藏。
- 最终工作树为 42 个已跟踪文件修改、16 个新增文件；`git diff --check` 无内容错误，仅有 Windows 下预期的 LF→CRLF 提示。所有改动仍未提交，未覆盖用户已有成果。
- 最终自动化基线提升为 Vitest 41 文件 532/532、Pytest 38/38、typecheck 与生产构建全部通过；非破坏性构建位于 `output/build-m5-accept-final-20260714-0134`。
- 无残余已知 M5 功能缺口。真实淘宝页面结构仍属于外部变化风险，但采集器现采用保守证据策略，并由多商品、千分位、显式总额、退款状态和重复快照对抗测试覆盖。
- 本轮未删除文件、未触碰真实数据库；隔离服务和浏览器已关闭，所有 QA 证据均保留。

## 2026-07-15 Outfit M6 Trip Capsule

### 恢复基线
- 当前系统已存在与用户请求完全一致的 active goal，无需重复创建。
- 既有阶段 1–67 均已记录完成；M5 最终工作树包含大量尚未提交的用户成果，M6 必须在保留这些改动的前提下增量实施。
- 文件规划技能的 session catchup 本轮未报告需恢复的未同步内容；项目仅发现根目录 `AGENTS.md`。
- 用户要求严格执行 `docs/2026-07-10-outfit-m6-trip-capsule-plan.md`；尚未读取计划正文前不冻结实现方案。
- 本轮不删除任何电脑文件；若后续确需删除，必须先让用户知晓。
- M6 MVP 固定为 1–7 天旅行、每天一个或多个活动、最多 7 天天气、胶囊硬约束、逐日搭配、去重衣物清单、覆盖解释和本地装箱状态；不扩张到第三方行程、体积重量、签证药品或 7 天以上优化。
- 计划要求五张新表、beam width=100、每个 activity slot Top 12、全程遵守 M0 候选预算；maxGarments/maxShoes/repeatPolicy/availability/槽位完整/天气与场合阈值全部是硬约束，无解不得输出违规方案。
- 洗衣只重置优化器内存中的核心件计数，绝不改变 garments availability；只有逐日确认后才可通过既有 wear/availability 服务改变现实数据。
- 旅行入口必须位于“计划与洞察”二级区域，不新增主导航项；非衣物必需品使用自由文本 checklist。
- 当前 HEAD 为 `4120491`，M5 留有 42 个已跟踪文件修改和 16 个新增文件，约 2999 行新增；M6 必须逐文件避让并保留这些用户工作区成果。
- M6 修改前基线稳定：`npm run typecheck` 通过；全量 Vitest 41 文件、532/532 通过（单 worker），可将后续失败归因于 M6 增量。
- 当前协作并发上限只允许额外两个只读 Agent；数据库/API/天气/wear 与推荐/优化器已并行审计，前端/导出/文档由主线审计。
- `server/services/recommend.ts` 已导出 `generateCandidates(input, options)`，支持 `maxEvaluatedCandidates`、内部 beam width、include/exclude、confirmed/active/available 过滤与 `evaluatedCandidates/truncated` 结果；M6 应扩展/适配这个现成入口，不另写推荐规则。
- 当前推荐默认候选预算为 20,000，并按 core/outerwear/shoes/accessories 分层分配；M6 每个 activity slot 的 Top 12 必须仍把总评估数约束在该预算下，并显式传递预算而非绕过。
- 数据库已有编号迁移 1–6：recommendation candidates、garment assets、saved outfits、feedback/pair stats/availability events、wear events/outfit plans、M5 similarity/embeddings；M6 新表必须加入 `NUMBERED_MIGRATIONS`，不得修改 frozen baseline。
- 现有 planner 客户端已覆盖 wear events、outfit plans、mark-worn 与天气 forecast；M6 可以复用日期范围查询、天气 DTO 和逐日 wear service，但需要新增固定 trip API，而不是让前端拼路径。
- 当前 OutfitExportV2 已可选包含 wearEvents/outfitPlanEntries 等里程碑数据；M6 应延续可选字段与 feature 标记的向后兼容模式，不能把 embedding、图片二进制或派生排行混入 JSON。
- `HistoryInsightsView` 当前二级分区精确为 `planner | diary | saved | insights`，由 `activeSection/onSectionChange` 驱动并接收内容节点；M6 可新增 `trips` 二级分区及 `tripContent`，无需触碰五项主导航结构。
- 旅行 UI 可沿用现有 `PlannerView`/`OutfitPlanDialog`/`WeekGrid` 的表单、状态与响应式模式，但计划要求创建独立 `TripPlannerView.tsx` 和 `PackingChecklist.tsx`，不能把旅行逻辑塞进周计划组件。
- `exportOutfitDataV2()` 在单一只读事务中收集所有表并调用严格 `validateOutfitExport()`；M6 trips/activities/selections/packing states 应在同一快照内稳定排序并纳入 shape 校验与 `features`。
- `OutfitExportV2` 的新增里程碑字段目前均为可选，以保持旧 V2 兼容；M6 应保持这一约定，并让新导出始终实际填充旅行数组。
- `MainApp` 已集中维护 history section、周计划、日记、天气和保存搭配状态，启动时通过 `Promise.allSettled` 恢复；旅行状态可采用独立加载/错误/忙碌状态并只在 `trips` 二级分区渲染，避免把旅行失败变成整页启动阻断。
- 五项主导航是单一 `NAV_ITEMS` 数组，同时驱动桌面和移动导航；只修改 History 二级分区即可精确保持五项主导航。
- 导出 feature 目前严格要求对应字段存在：`diary-week-planner` → wearEvents/outfitPlanEntries，`decision-support` → similarityFeedback。M6 应新增 `trip-capsule` feature，并让 trips、tripDays、activities、selections、packingItems 全部成为 feature 存在时的必填数组。
- 完整 ZIP 直接把同一 V2 JSON 流式写入归档并只读取 M1 garment assets；因此扩展 JSON DTO 即可自然进入显式 ZIP，无需也不应增加旅行图片处理或临时文件。
- `NUMBERED_MIGRATIONS` 最新为 version 6 `decision-support`，M6 应新增 version 7；现有 STRICT 表、CHECK、外键、索引和迁移前缀校验模式可直接复用。
- 所有子路由都在全局 `/api` session 鉴权和 `rejectUntrustedMutatingRequests` 之后注册；新增 `registerTripRoutes()` 必须放在同一位置，沿用 `ApiError` 与结构化 `{error:{code,message,details?}}`。
- planner 路由当前仅做薄适配，服务层负责严格验证与事务；M6 也应保持 route thin/service strict，尤其是生成、局部重算、packing 状态和逐日确认等写操作。
- wear event 表要求真实时间、时区、至少一件衣物且与 saved outfit/plan 保持一致；旅行批量实穿应调用可复用服务函数并包裹外层事务/逐日确认，而不是直接拼 SQL 或写旧 wear_logs。
- 前端测试大量使用纯函数/SSR 静态标记/直接触发受控回调，M6 可建立独立 `tests/tripPlannerUi.test.tsx` 覆盖可访问表单、活动共用/独立、清单状态、锁定替换和响应式 CSS，并在 `app.test.tsx` 只验证二级入口及五项主导航不变。
- API 集成测试已有内存数据库、真实 Express 监听、session cookie、Origin 头与完整安全路径；M6 应在独立 `tests/tripPlanner.test.ts` 覆盖服务/优化器，并在 `tests/api.test.ts` 仅覆盖认证、同源、严格 DTO 与关键事务端点。
- 导出测试明确保留 V1/旧 V2 兼容，并对每个新 feature 的字段缺失/畸形/稳定排序做回归；M6 需要在 schemaVersion 7 上新增同型测试，不能把旧 V2 强制要求旅行数组。
- 现有推荐中的 `weatherComfortScore` 与 `occasionScore` 只是可加减的软评分，完整度缺鞋也只是减分；M6 不能直接取 Top 12 就算满足计划，必须在 optimizer 扩展前额外硬过滤：核心+鞋槽完整，并让共享活动的每个活动天气/场合适配均达到明确阈值。
- `generateCandidates` 已把上限夹在 4–20,000、内部 beam 3–120；M6 每个 activity slot 应显式传预算并只取排序后的 Top 12，跨日 beam 单独固定 100，二者不能混为一个无限搜索。
- 天气应采用显式 `POST /api/trips/:id/weather/refresh` opt-in：Trip CRUD、读取与优化均不得联网；刷新依赖需可注入，测试断言非刷新路径调用次数为 0，失败时不能清空既有冻结快照。
- 现有 forecast GET 只按“从今天起的天数”缓存，不能可靠覆盖任意旅行起止日期；M6 TripDay 应持久化与 date 精确对齐的冻结 WeatherSnapshot，默认无坐标调用时使用本地估算或保持未设置。
- `insertWearEvent()` 可安全嵌入 M6 `BEGIN IMMEDIATE` 外层事务；`createWearEvent()` 和 `setGarmentAvailability()` 都自行开事务，不能在旅行批量确认中调用。selection 应用唯一 `actual_wear_event_id` 链接实现重放幂等与冲突检测。
- 五张 M6 表建议通过 trip→days→selections/activities 与 trip→packing 级联，selection→wear event、packing garment→garments 使用受保护外键；自由文本 checklist 与 garment_id 必须 XOR，不能扩张 GarmentCategory。
- Trip 天气、活动、坐标、清单和实际穿着均属敏感本地数据；JSON V2 可以按显式导出携带，weather cache 不导出，图片仍只在显式 ZIP 中携带。
- 已冻结共享 Trip DTO：嵌套 days/activities、selection 的活动评估与锁定项、packing coverage、可行/不可行判别联合、显式天气刷新、局部重算和逐日确认；新增类型后统一 typecheck 仍通过。
- 硬阈值冻结为：核心槽 `dress` 或 `top+bottom` 且必须有鞋；`weatherComfort >= 0`；`occasion / items.length >= 2`。极冷天气额外要求 outerwear，避免件数补偿掩盖结构缺口。
- `TripActivity.occasion` 保持自由文本用于覆盖解释，`formality` 才进入既有 scorer；共享活动每个分别评估，排序取最低总分，任一未过硬阈值则整套剪枝。
- maxGarments 包含鞋；M6 core 仅 top/bottom/dress。共享 slot 只计一次 core wear，独立 slot 每次计数；no-consecutive 只跨日期比较，no-repeat 即使洗衣后仍禁止。
- 优化器实现已独立复验：推荐/约束/Trip 三文件 59/59 通过；`recommend.ts` 仅新增统一候选评分导出和 scoringContexts 最低分路径，原单场景输入不走新分支，保护既有精确排名。
- `tripOptimizer.ts` 明确区分 generation beam≤120 与 Trip beam=100，并按约束状态去重；infeasible 文案限定在 Top12/beam100/当前预算内，避免宣称穷举最优。
- 前端组件采用完全受控 props，不直接调用 API；归档只对 planning/ready 可见，装箱、锁定/替换、天气刷新、无解放宽和逐套实穿确认均由 App 显式接线。
- 三个实施子任务均已返回。优化器复用统一推荐评分并通过 59/59；前端新增四个限定文件并通过组件 5/5、Planner 联合 16/16；Trip 后端的 5 表 migration 7、认证 CRUD、显式天气、生成/重算、装箱与幂等实际穿着事务通过 25 项服务/迁移专项和类型检查。
- 后端联合回归 89 项通过、2 项失败的根因已交叉确认：`server/services/export.ts` 已声明 `trip-capsule` feature 且校验五数组必填，但 `buildOutfitExportV2` 对象仍只构建到 `similarityFeedback`，因此 `/api/export` 在自身验证阶段失败。其余 Trip 路由不受影响。
- M6 当前无并发写入剩余；下一步由主线按 migration 7 的真实列名补五组单事务稳定查询，并验证不导出图片二进制、embedding 或任何新隐私数据。
- `buildOutfitExportV2` 现在在既有 deferred read transaction 内调用 Trip 读取映射，合并 active/archived 并按 startDate/id、day date、activity position、selection slot、packing kind/id 保持稳定顺序；selection 仅导出 `garmentIds`，不重复嵌入 Garment，也不新增天气缓存、embedding 或图片二进制。
- 新增真实关系回归后，export/API 87/87、M6 跨层专项 11 文件 281/281、全项目 typecheck 均通过；阶段 69–72 已完成，只剩文档、全量自动化、安全审计、非破坏性构建和真实浏览器验收。
- 真实浏览器隔离验收使用新数据库 `output/qa-m6-final-20260715-100357/outfit-qa.sqlite`：主导航保持五项，旅行入口位于历史洞察二级区；3 天旅行按“健身共享标志 + 正式晚宴独立”生成 4 套选择，去重清单为 6 件，替换末日上装后局部重算为 7 件，均满足衣物上限 8、鞋履上限 2。
- 浏览器内锁定、同类别替换、`unpacked/packed/on-body/not-taking` 四态、自由文本充电器、覆盖日期/活动解释均可见且持久化；逐套确认后 `/api/trips/1/complete` 一次返回 4 个 WearEvent 和 4 个唯一 actualWearEventId，全部 selection 中的 garment availability 仍为 available。
- 第二个极限旅行将 maxGarments 设为 2，UI 未输出违规搭配，明确显示“继续规划会超过最大衣物数”并建议至少放宽到 3。整个浏览器会话的 Performance resource origin 只有 `http://127.0.0.1:5174`，创建/生成/锁定/替换/装箱/完成均未访问第三方；天气保持“暂无天气”，说明非显式刷新路径不发送坐标。
- 390×844 与 1440×900 均满足 document scrollWidth=clientWidth；checkbox 原生框虽为 18px，但其可点击 label 目标全部不小于 44×44；控制台 0 error/0 warning。隔离浏览器和 5174/8788 服务已关闭，QA 数据与日志保留，未删除文件。
- 最终全量签收：typecheck、lint 通过；Vitest 44 文件 562/562；Pytest 38/38；npm 生产与全量官方审计均 0 漏洞；`pip-audit -r requirements.lock.txt` 为 0 已知漏洞，`pip check` 无破损。
- `npm run build -- --outDir output/build-m6-final-20260715-1017 --emptyOutDir=false` 成功，保留既有 dist/构建产物且没有删除；最终 `git diff --check` 无内容错误，仅输出 Windows LF→CRLF 提示。
- M6 原计划 11/11 实施任务、6/6 验收标准全部满足；未发现剩余已知功能缺口，阶段 68–73 均可完成。

## 2026-07-15：M6 Trip Capsule 独立验收

### 恢复与基线
- 系统 active goal 与用户本次请求完全一致，继续沿用；重复创建 goal 被系统拒绝，不影响任务。
- 旧规划记录声称 M6 已完成 11/11 实施任务与 6/6 验收标准，但本轮将其视为待验证声明，不直接作为通过依据。
- `session-catchup.py` 无未同步报告。当前 HEAD 为 `4120491 fix(planner): harden diary integrity and interactions`。
- 工作区包含 M5/M6 大量既有未提交成果：44 个已跟踪文件产生约 5087 行新增、178 行删除，另有 M5/M6 新源码、测试和 Playwright QA 证据；这些均按用户既有工作保护。
- 当前已看到 M6 主要新增文件：`server/routes/trips.ts`、`server/services/tripPlanner.ts`、`server/services/tripOptimizer.ts`、`src/features/planner/TripPlannerView.tsx`、`PackingChecklist.tsx` 及对应测试；存在不等同于验收通过，后续逐条检查。
- 本轮不删除文件、不修改真实数据库；任何修复必须先有可复现缺口并避免覆盖 M1–M5 改动。

### 独立验证矩阵
- `package.json` 的正式门禁为 `npm run typecheck`、`npm test`、`npm run build`；`lint` 当前等价于 typecheck，另有 `audit:prod`。
- M6 核心实现体量较大：`tripPlanner.ts` 1648 行、`tripOptimizer.ts` 875 行、`TripPlannerView.tsx` 1043 行，不能只依赖少量 happy-path 测试，需要结合源码边界审查。
- 直接命中 Trip 契约的现有测试至少包括 `api`、`dbMigrationRehearsal`、`dbMigrations`、`export`、`frontendApi`、`planner`、`tripOptimizer`、`tripPlanner`、`tripPlannerUi` 九个文件；还需核对 recommendation/app 回归是否通过跨层接线间接覆盖。
- 本轮独立重跑 M6 11 文件跨层专项为 281/281，通过；`npm run typecheck` 通过；Python 全量为 38/38。后续仍需源码边界审查、全量 Vitest、非破坏性构建和必要交互复验。

### 前端源码审查（进行中）
- `TripPlannerView` 暴露受控 CRUD、显式天气、生成/放宽、锁定/替换、装箱、必需品、逐套确认和完成回调；组件本身不直接联网或写库。
- 编辑器包含 1–7 天日期提示、经纬度可选输入、衣物/鞋履上限、三种 repeat policy、洗衣前核心穿着次数、洗衣日和逐日多活动/独立搭配开关；仍需核对客户端日期辅助函数与服务端严格校验一致。
- 天气按钮旁明确写明“仅在点击后使用目的地坐标”；装箱组件提供 `unpacked/packed/on-body/not-taking` 四态和非衣物自由文本清单，并展示覆盖日期。
- 当前未从已读前 650 行发现可确认阻断缺陷；下一步继续检查完成条件、方案卡、替换候选、日期辅助函数及 App 的异步状态接线。
- 后半组件明确显示不可行冲突/最小放宽、逐日活动与天气快照、选择理由、同类别且 confirmed/active/available/not-excluded 的替换候选，以及逐套实际穿着确认；完成按钮只有在当前全部 selection 被确认时启用。
- 日期辅助函数用严格 UTC 日期往返校验，客户端拒绝无效日期、倒序、超过 7 天、负/非整数上限、天数不一致、空活动；服务端仍是最终信任边界。
- App 为 Trip 使用固定 API 客户端和全局 `tripBusy` 串行化写操作；归档后从活动列表移除。待继续检查保存两步原子性、局部重算确认状态、完成请求 payload 及错误恢复。
- App 的实际完成 payload 从当前服务端 selection 组装日期、时区、场合和全部 garment IDs；客户端先检查每个 selection ID 都在本地确认集合，服务端应再次校验不可只信客户端。
- **待复现假设：** 局部锁定/替换成功后，App 只过滤“仍存在的 selection ID”，若服务保持目标 selection ID 不变，先确认再替换可能保留旧确认并允许对新搭配直接完成，弱化“逐套确认实际穿着”。现有测试未命中 `confirmedTripSelectionIds` 与替换交互；需读服务实现并补失败测试判断是否为真实缺口。
- 上述“确认后替换仍保留确认”假设经服务实现排除：`persistOptimization()` 在事务中删除并重建全部 selections，新 ID 会使 App 的过滤结果清空，用户必须重新逐套确认。
- **新的高风险假设：** `completeTrip()` 读取 selection 归属，却把客户端提交的 `itemIds` 原样交给 `insertWearEvent()`；当前专项只使用正确 garmentId，未见“确认内容必须等于该 selection 的存储 garment IDs”测试。如果服务未比较两者，任意同会话客户端可把不属于旅行方案的衣物写成实际穿着，违反逐套确认的事实完整性。下一步读取 helper 并用隔离数据库红灯复现。
- **已静态确认的 P1/P2 边界缺陷：** `getSelectionForCompletion()` 只查询 selection id/day/已有 wear link/weather，不读取 `garment_ids_json`；`parseCompleteInput()` 只校验 `itemIds` 是合法 WearEvent ID 数组；首次完成时 `completeTrip()` 直接把客户端数组传给 `insertWearEvent()`。因此服务端没有把“确认的实际穿着”绑定到持久化旅行方案。应拒绝集合不完全一致的 itemIds，且在任何写入前失败；重放仍沿用原幂等冲突语义。
- 新增隔离数据库回归 `binds actual-wear confirmations to the garments stored in each trip selection` 后，旧实现稳定为 1/8 失败：`completeTrip()` 未抛错并接受 unrelated garment。缺陷已从静态怀疑转为可复现事实。
- itemIds 绑定已修复：completion 查询增加 `garment_ids_json`，首次写入前用严格持久化数组校验；不一致抛结构化验证错误且事务无残留，既有重放冲突语义不变。`tripPlanner` 8/8、typecheck 通过。

### 后端并行审查新增缺口
- **Trip 日期编辑死锁：** `updateTrip()` 合并新 start/end 后仍用旧 `current.days` 做完整覆盖校验；`replaceTripDays()` 又要求新 days 服从旧 start/end。当前前端依次调用两个接口，因此从单日扩成两日或反向缩短，无论先改哪一侧都会被拒绝，实施任务“Day/Activity 编辑”未完整达成。需提供单事务更新 Trip 字段+days 的服务/API 路径，或调整现有 update 契约为可原子携带 days。
- **导出约束漂移：** Trip 创建允许 `maxGarments=1,maxShoes=2`（计划也只规定各自合法上限），但 `isTripExportRecordShape()` 额外要求 `maxShoes <= maxGarments`，导致合法 Trip 让整个 V2 导出失败。应移除导出层未在写入域模型中建立的额外关系，并补真实 builder 回归。
- 日期编辑的最小兼容方案：扩展现有 `PUT /api/trips/:id`/`TripUpdateInput` 允许可选 `days`，当提供时在同一个 `inImmediateTransaction` 内校验合并后的日期+days、更新 Trip、清除旧 selection/garment packing、重建 days，并重置为 planning；前端编辑改为一次提交完整 draft。保留 `PUT /days` 供仅替换活动的旧客户端使用。
- 现有 `tripPlanner` CRUD 测试只分别覆盖“非日期字段 update”和“相同日期范围 replace days”，因此没有暴露跨日期编辑死锁；将在同文件新增单请求缩短/扩展日期回归。导出真实 builder 测试已有 Trip 建档，可直接加入 `maxShoes > maxGarments` 的合法 Trip 以防 shape 校验漂移。
- 两项红灯稳定复现：`tripPlanner` 原子日期更新报“旅行更新不允许字段 days”；`export` builder 报“trips contains an invalid entry”。两文件合计 2/31 失败，其余通过。
- 同时发现日期编辑相关的契约缺口：后端虽接受 `laundryDay:null`，共享 `TripUpdateInput` 不允许 null；当前 App 从 draft 省略已清空的 laundryDay，导致旧值无法清除。原子更新修复需一并允许显式 null 并由 App 转换。
- 日期/导出首轮修复转绿：现有 update 端点可选携带 days，前端一次提交完整 draft 并显式发送 `laundryDay:null`；服务在单事务重建 days、清旧派生选择/garment packing 并回 planning。独立上限导出校验已与计划对齐。两文件 31/31、typecheck 通过。
- 关于 `maxShoes > maxGarments`：后生成文档曾额外写“拒绝”，但 M6 计划将两者定义为独立硬上限，算法也分别判断“总唯一衣物数”和“唯一鞋履数”；鞋上限更宽只是冗余，不会产生违规方案。验收以用户指定开发计划为基线，保留创建合法性、移除导出层漂移，并同步修正文档。
- **派生状态失效缺口：** 直接 `updateTrip` 修改约束后仍可保留旧 ready selections/garment packing；修改目的地后仍保留旧坐标对应天气快照。任何影响优化上下文的更新都应清除相关派生状态并回 planning；名称/纯状态更新才可保留。
- **受保护状态夹带更新：** completed 请求 `{status:'archived', name:...}`、archived 请求 `{status:'planning', name:...}` 当前可借合法状态转移同时修改其他字段。受保护状态应只接受唯一 status 字段，修改必须恢复后另发请求。
- **装箱生成项可误删：** `deleteTripPackingItem()` 未限制 kind，客户端可删除 optimizer 生成的 garment 项；API 文档只允许删除 essential。应在事务内拒绝非 essential，并保证行/coverage/status 原样保留。
- 派生失效首轮实现后 11/12 新旧服务用例通过；唯一旧失败同时提交 `{maxShoes:1,status:'ready'}`。为避免改变约束后仍声明旧方案 ready，确定规则为：优化上下文更新只能回 planning；若确需状态转换，必须在无夹带字段的后续请求完成。
- 派生清理/受保护状态/packing 删除保护已全部转绿：目的地变化清天气+选择+garment packing，约束变化清选择+garment packing，essential 保留，availability 不变；completed/archived 只能单字段状态转移；garment packing 删除返回结构化冲突。`tripPlanner` 12/12、typecheck 通过。
- **中间态回归（交付前需修）：** App 编辑提交完整 draft，当前服务按字段“是否出现”判定上下文变化，因此只改 name 也会因 days/destination/constraints 出现而重建 days、清天气/selection/packing。失效判断必须比较规范化后的实际值；相同完整 draft 只更新非派生字段并保留 IDs/天气/方案/装箱。
- 中间态回归已用完整 draft 红灯稳定复现后修复：服务现在比较规范化日期/活动、目的地、日期范围和各约束的实际值；等值完整 payload 只改 name 时保留 ready、weather、selection IDs 与 packing，真实上下文变化才失效。`tripPlanner` 12/12、typecheck 通过。

### 独立验收最终结论
- 初始实现不能直接签收：独立审查和红灯回归确认了实际穿着 itemIds 未绑定持久化方案、日期与 days 无法原子变更、派生状态失效不完整、受保护状态可夹带修改、生成型 packing 可误删、局部重算固定前缀绕过硬约束且前缀 ID 被重建、放宽建议可能并不让全程可行，以及多项前端竞态/只读/解释性缺口。
- 所有确认缺口已按 TDD 修复：完成接口在任何 WearEvent 写入前要求 itemIds 集合与 selection garmentIds 完全一致；Trip header+days 单事务更新并按实际值决定天气/方案失效；completed/archived 只允许受控单字段状态转移；生成 packing 受保护。
- 优化器现在重新硬验证固定前缀的资格、槽位、天气和场合，局部持久化只重建目标及后缀；仅由同一优化器证明全程可行的 relaxation 标为 guaranteed，advisory 不提供一键应用。
- App 将编辑目标绑定到发起旅行，使用请求版本阻止迟到 GET 覆盖写结果，重算仅保留目标之前的确认，完成/归档全界面只读；packing 覆盖可持久化并展示日期、活动、场合和原因。
- migration 7 的五张表均已独立断言 STRICT、FK 删除策略、复合 FK、显式/唯一部分索引与 `foreign_key_check`，并单独覆盖合法格式下的反向日期拒绝。
- 当前唯一记录的非阻断残差是 `idx_trips_status_updated_at` 不服务现有按 `start_date,id` 排序的列表查询；功能与本次 M6 计划验收均不受影响，未为此改写已发布 migration 7 或引入无计划的新 migration。
- 最终自动化：Vitest 44 文件 572/572、Pytest 38/38、lint/typecheck、生产构建、npm 双审计、pip-audit、pip check 与 diff check 全部通过。
- 最终浏览器：隔离 QA 库验证跨旅行编辑不会串写、completed 旅行没有写入口、packing 状态只读；390×844 的 document/body scrollWidth 均为 390，控制台 0 error/0 warning，网络仅本机同源。
- 未删除任何文件、未写真实 `data/outfit.sqlite`；QA 数据、日志、快照和截图全部保留。

### 优化器并行审查待修缺口
- **局部重算前缀绕过硬资格：** `recalculateTripSelection()` 将目标之前的旧 selections 转为 prefix；optimizer 对 prefix 只执行容量/repeat/laundry 的 `extendState`，不重新验证 active/confirmed/available/not-excluded、必需槽、天气、场合。已由 Agent 用内存 DB 复现：首日上衣改为 `laundry` 后重算第二日，仍返回 feasible 并持久化该不合格首日前缀。
- **放宽建议不保证可行且可能方向错误：** optimizer 在首个失败 slot 即返回，只基于当步 rejection；`no-repeat-core` 固定建议为 `no-consecutive-core`，单件 dress 连续两天应用后仍无解；多日 garment/shoe/laundry 也可能只够通过当前槽。共享活动场合失败的 observedValue 取 max，可产生“当前阈值 2，建议降低到 7”。需用纯函数红灯明确“建议应用后可行”或在不能保证时不宣称最小/可直接应用，并修正阈值聚合方向。
- 源码复核确认 prefix 入口位于 `optimizeTrip` 搜索前，直接 `extendState`；`extendState` 只实现总数/鞋数/repeat/laundry/目标函数，不具备候选 pool 的资格、必需槽和活动阈值判断。修复应在接纳 prefix 前对它相对当前 garment source 与对应历史 slot 进行完整验证，或服务局部重算时从全行程重新优化并用锁定保持前缀；后者更能避免陈旧评分/上下文。
- relaxation 当前 DTO 没有“保证可行”标记，而 UI 会提供“应用建议”按钮。可自动应用的数值/策略建议必须经过同一 optimizer 试跑验证；无法证明的 required/weather/occasion/locked/search 建议只能作为人工建议，不应伪装成可直接更改的约束。
- 现有 optimizer 测试只断言首槽的 maxGarments/maxShoes 建议值，且 prefix 用例只把 suffix slots 传入，因此无法重验 prefix；将改为全 slots + prefix，新增 unavailable prefix、三日 maxGarments、repeat 二级放宽与共享活动阈值方向回归。
- 公共 DTO 当前把内部 `currentValue/suggestedValue` 映射为 `from/to`，没有可应用性标记；需新增 `guaranteed`（或等价）并让 UI 仅对经过全程试跑的单约束建议显示“一键应用”。
- Prefix 修复已转绿：optimizer 现在要求 prefix 对应完整 slots，重验当前 garment source 的 owned/archived/confirmed/excluded/availability、必需槽、逐活动天气和场合阈值，再跳过固定 slot 搜索 suffix；服务局部重算传入完整 slots 并使用已有天气快照。相关两文件从 4 项红灯降为仅 relaxation 2 项失败，planner unavailable-prefix 回归通过且数据库原 selection IDs/内容不变。
- `mapInfeasibleOptimization()` 是内部建议到公共 `from/to` 的唯一转换点；在此透传 `guaranteed`，UI 对 false 仅显示说明、不渲染应用按钮，可避免无法证明的建议被当作单击修复。
- 放宽建议修复已转绿：maxGarments/maxShoes 递增试跑、repeat 逐级试跑、核心穿着次数递增试跑，只有单项应用后完整行程 feasible 才标 `guaranteed:true`；其余建议为 advisory，UI 不显示应用按钮。已修共享活动 observedValue 取最低活动值，避免反向“降低”。optimizer/planner/UI 34/34、typecheck 通过。
- **局部持久化 ID 红灯：** 添加另一旅行的 sentinel selection 后，旧 recalc 把未变化前缀 ID 从 1 改成 4，证明“删除全部再插入”会破坏前缀身份。应仅删除目标及后续 selection rows，保留 prefix 行和 activity 关联；前端确认集合只保留目标之前的 ID，不能依赖重插是否复用 ID。
- 局部行级持久化已转绿：target 之前 slot 的 selection row/activity 关联原样保留，只清除并重建 target+suffix；sentinel 回归中前缀 ID 保持 1。`tripPlanner` 13/13、typecheck 通过。

### 前端并行审查新增缺口
- **跨旅行误保存：** editorMode=edit 时左侧列表仍可切换，选择 B 只改 selectedTripId、不关闭编辑；`saveTripDraft` 用当前 selectedTrip，因此 A 草稿会 PUT 到 B。选择旅行必须退出编辑并丢弃旧 draft，或保存时绑定显式 editingTripId。
- **历史刷新竞态：** `refreshHistoryData` 并发 `refreshTrips`，Trip UI 只看 `tripBusy` 不看全局 refresh busy；旧 GET 可能在写操作后覆盖 `upsertTrip`，且成功刷新未清旧 tripError。需把刷新纳入 Trip busy/loading 或使用 request version 防迟到覆盖。
- **已记录状态显示错误：** selection 有 `actualWearEventId` 时 checkbox 被禁用，但 checked 仍只看临时 confirmed 集合；重载后显示“实际穿着已记录”却未勾选。渲染应使用 `confirmed || actualWearEventId`。
- **天气披露不足：** 按钮只写“点击后使用坐标”，未在操作现场明确“发送给 Open-Meteo”；README 有说明但交互缺少知情提示。
- **每件衣物解释未落地：** Packing coverage/API 只有 dates/activityIds，UI 只显示日期，没有活动名称/场合与选择原因；直接违反任务 5/验收 5，需扩展持久化 JSON、共享 DTO、导出兼容和 UI。
- Coverage 存储是 JSON 文本，无需新增 migration；可向后兼容地加入 `activities/occasions/reasons`，解析旧 `{dates,activityIds}` 时补空数组。export shape 应接受旧字段缺省并校验新数组，builder 新输出完整字段。
- **完成态仍可操作：** completed Trip 仍显示编辑/刷新天气/生成，PackingChecklist 也可改状态/增删必需品；服务必然返回 409。完成态应统一只读/隐藏无效动作，测试不能只断言“归档按钮消失”。
- `refreshTrips()` 当前既没有 request version，也不在成功时清 tripError；`refreshHistory()` 的 busyAction 值为 `history`，但 Trip 只接收 `tripBusy`。最小安全修复是引入递增请求版本/写入时使旧读取失效，并把 `busyAction === 'history'` 合并到 Trip busy。
- Relaxation 还有两步一致性：非 guaranteed 防御分支先设错误再调用会清错的 `startTripEdit`；guaranteed 分支先 PUT 后 generate，若第二步失败 UI 不接收已持久化的新 planning Trip。应调整提示顺序，并在 PUT 成功后立即 upsert/update draft，再尝试生成。
- Packing 解释链路已补齐：优化器原有 `dates/activityIds/occasions/reasons` 现完整写入 coverage JSON，并由活动 ID 解析去重后的活动名；共享 DTO、导出 shape 与 UI 均向后兼容旧 `{dates,activityIds}` 数据。生成项展示覆盖日期、活动与选择原因。
- 已记录 WearEvent 的 selection 现在以 `confirmed || actualWearEventId` 呈现勾选，避免重载后“文字显示已记录、复选框却未勾选”的矛盾。
- completed/archived Trip 已统一为只读：隐藏编辑、显式天气、重新生成和完成动作，锁定/替换/确认及装箱状态禁用，且不显示必需品增删表单。
- 操作现场天气文案已明确：坐标只在用户点击后发送给 Open-Meteo 获取天气；无自动刷新路径。
- 本批专项 `tripPlanner + tripPlannerUi` 为 18/18，`npm run typecheck` 通过；尚需修 App 竞态与状态绑定后再做全量验收。
- App 已用独立 `editingTripId` 绑定编辑目标；切换旅行或取消会同时退出编辑，从根源上避免 A 草稿写入 B。所有 Trip mutation 开始时递增读取版本，迟到 GET 不再覆盖新写入；history refresh 同时进入 Trip busy，成功读取会清旧错误。
- 局部重算确认集合按“旧 selections 中目标之前的 ID”保留；可行重算会清目标与后缀，即使 SQLite 复用数值 ID 也不会误继承确认。不可行且未落库时保留现有确认。
- guaranteed relaxation 的 PUT 成功后立即 upsert planning Trip、更新 draft、清旧 optimization/确认，再调用 generate；第二步失败时 UI 与服务端不再分叉。advisory 分支先打开编辑器再显示提示，避免提示被 `startTripEdit` 清掉。
- 前端约束已与服务端对齐：`maxGarments=0..100`、`maxShoes=0..20`，经纬度要求同时填写；按 M6 原计划保留两上限独立，不新增 `maxShoes<=maxGarments` 关系。
- Trip 初始读取有独立 `tripLoading`，10 秒全局骨架超时后若 Trip GET 仍未完成会显示真实加载态，而不是错误空态。
- Migration 7 专项现明确断言五表 `STRICT`、显式索引、packing 唯一部分索引、CASCADE/RESTRICT FK、`foreign_key_check=[]`、孤儿 day 拒绝，并独立覆盖合法日期形状下的反向范围；`tripPlanner` 13/13。
- API/schema/README 已同步原子 update+days、`laundryDay:null`、派生失效、独立上限、guaranteed relaxation、完整 packing coverage 和局部重算确认语义。

## 会话：2026-07-16（全项目独立深度审查）

### 恢复与资产保护基线
- 系统中已有 active goal，目标文本与用户本次“深入审查整个项目、发现错误即修复、持续写文档”请求一致；重复创建被拒绝后已通过 `get_goal` 确认并沿用。
- 已完整读取文件化规划与多 provider 代码审查技能。旧阶段 1–77 和旧签收结论只作为历史线索，本轮会独立重建证据，不以“过去通过”替代当前审查。
- `session-catchup.py` 本次无输出，未发现需要补同步的会话片段。
- 当前分支为 `codex/outfit-m0-foundation`；跟踪文件没有未提交差异，只有 `.playwright-cli` 下 25 个 2026-07-15 的既有日志/页面快照未跟踪。它们是用户工作区资产，本轮保留且不清理。
- 项目仅发现根目录一个 `AGENTS.md`；其要求所有回答使用中文。用户级约束另外要求优先 PowerShell 原生命令、PowerShell UTF-8、删除文件前确保用户知晓，以及有独立并行任务时主动使用最多 6 个子 Agent。
- 当前工具集中没有可直接创建子 Agent 的接口；本轮会使用代码审查技能提供的独立 provider（若本机可用）作为交叉审查，并由主 Agent继续完成所有静态、动态和修复工作。
- 根目录已有大型持久化记录：`task_plan.md` 约 6.4 万字节、`findings.md` 约 15.9 万字节、`progress.md` 约 10.6 万字节。已新增阶段 78–83，后续任何重要发现、错误、修复和测试结果继续写入这三份文件。

### 初始工作树事实
- `git status --short --branch` 未显示已跟踪源码修改；因此后续新增的产品代码差异可较清楚地归因于本轮，但仍需保留 25 个未跟踪 Playwright 证据。
- 根目录主要区域包括 `src`、`server`、`tests`、`scripts`、`docs`、`public`、`data`、`output`、`dist`；还存在 Node 与 Python 依赖文件，表明本轮需要同时覆盖 TypeScript/React/Express/SQLite 与 Python 辅助链路。
- 旧记录显示项目此前已有 572 项 Vitest、38 项 Pytest 及 M1–M6 多轮浏览器验收，但这些数字需要在当前提交上重新运行确认。

### 本轮错误记录
- 一条只读盘点命令把 PowerShell `foreach` 直接接入管道，解析阶段报 `EmptyPipeElement`；因此该命令中的 package/提交/行数读取均未执行，也没有产生任何项目状态变化。后续改用 `$rows` 数组再格式化，避免重复既知失败。

### 项目规模、技术栈与高风险文件
- 当前统计的代码规模为：`src` 61 个文件/20,299 行，`server` 33 个文件/19,105 行，`tests` 44 个代码测试文件/24,886 行，`scripts` 3 个主要代码文件/1,429 行；合计约 65,719 行，产品源码约 39,404 行。
- 技术栈为 React 18 + TypeScript 5.7 + Vite 8，Express 5 + SQLite/Node 内置数据库接口，本地图片用 Sharp，备份用 Archiver，可选视觉能力使用 Transformers/rembg/onnxruntime，浏览器采集同时存在 Playwright 与 Selenium 路径。
- `tsconfig.json` 开启 `strict`、`isolatedModules`、`forceConsistentCasingInFileNames`，但启用 `skipLibCheck`；`lint` 脚本目前只是再次运行 typecheck，没有独立 ESLint、格式化或覆盖率阈值。
- Node 引擎声明为 `>=24.14 <27`。依赖包含 `express@^5.1.0`、`helmet@^8.2.0`、`vite@^8.0.16`、`vitest@^4.1.8`，并对 `esbuild=0.28.1`、`glob=10.5.0` 做精确 override。
- Python 的日常安装入口是范围依赖 `requirements.txt`，验证/供应链基线另有精确 `requirements.lock.txt`；需检查文档与脚本是否始终明确使用 lock 做可复现验证。
- Vite `/api` 代理显式 `changeOrigin:false`，与旧记录中的严格 Origin/Host:port 安全修复一致；这需要在后续动态门禁中重新验证。
- 最近提交显示 M0–M6 与文档均已提交到当前分支，HEAD 为 `a1b938a docs: add visual project guide`，前一功能提交为 `f52b919 feat: complete decision support and trip planning`。
- 最大产品文件为 `server/db.ts` 3,402 行、`src/app/App.tsx` 2,779 行、`server/services/export.ts` 1,995 行、`server/services/tripPlanner.ts` 1,786 行、`src/shared/types.ts` 1,147 行、`server/services/tripOptimizer.ts` 1,062 行。这些文件承担多领域不变量，是静态深审优先级最高区域。
- 最大测试文件为 `tests/api.test.ts` 4,086 行、`tests/app.test.tsx` 2,884 行、`tests/export.test.ts` 1,674 行等；测试量很大，但超大集成文件也可能掩盖共享状态、顺序依赖或覆盖盲点，需要检查隔离与重复运行稳定性。
- README 已覆盖运行、能力、安全/网络、隐私清理、测试、架构和已知边界；`docs/api.md`、`docs/schema.md` 体量较大，并有 M1–M6 六份开发计划。后续会以代码为事实源，抽查文档契约漂移。

### Provider 探测状态
- 首次 provider 可执行文件探测仍因同类 `foreach | Format-Table` 写法在解析阶段失败，未实际执行，也不能据此判断 provider 是否可用。
- 这是本轮第二次命中已知 PowerShell 语法陷阱；后续所有循环输出必须先收集到 `$rows`，再在循环结束后单独格式化。

### 架构与审计矩阵
| 模块 | 主要实现 | 核心不变量/风险 | 主要现有测试 | 本轮审计方法 |
|------|----------|---------------|-------------|-------------|
| 认证与 HTTP 安全 | `server/auth.ts`、`server/routes.ts`、`server/validation.ts` | 首个账号创建、会话 TTL/cookie、登录限流、Origin/Host/Sec-Fetch-Site、认证边界、错误脱敏 | `api.test.ts`、`garmentUpdateSecurity.test.ts`、`viteProxyOrigin.test.ts` | 路由顺序与中间件静审、恶意请求矩阵、代理真实复验 |
| 数据库与迁移 | `server/db.ts`、`server/db/migrations.ts` | 迁移原子性、STRICT/FK/index、幂等、历史库升级、事务嵌套、软归档 | `dbMigrations`、`dbMigrationRehearsal`、`dbImport` | schema/pragma 检查、旧 fixture 演练、失败回滚与约束测试 |
| 可信导入与资产 | `importTaobao`、`garmentAssets`、`thumbnails`、`taobaoCapture`、`vision` | 服务端重算身份、退款/非服饰过滤、路径穿越、SSRF、图片净化、子进程与临时产物、网络知情 | import/assets/thumbnail/capture/vision 系列 | 污染输入、路径/URL、超时/取消、并发与隐私边界 |
| 推荐、保存搭配与反馈 | `recommend*`、`savedOutfits`、`garmentAvailability`、`recommendationFeedback` | active/confirmed/available 一致、include/exclude、稳定候选、反馈幂等、有界学习、历史 snapshot | recommendation/savedOutfits/feedback 系列 | 组合不变量、跨用户/归档、重复提交、边界分值与排序稳定性 |
| 日记、周计划与天气 | `wearEvents`、`outfitPlanner`、`weather`、planner routes/UI | 时区/DST、计划—实际穿着一致、重复窗口、天气冻结、更新事务、分页 | planner/weather/insightsM4 系列 | 多时区与 DST、事务回滚、并发更新、旧兼容适配器 |
| 价值与购买前检查 | `wardrobeValue`、`purchaseCheck`、`garmentSimilarity`、decisionSupport routes/UI | 只读保证、价格事实来源、稳定指纹、候选资格、显式反馈与缓存隔离 | decisionSupport/purchaseCheck/similarity 系列 | DB 前后计数、竞态、错误边界、缓存/业务数据隔离 |
| 旅行胶囊 | `tripPlanner`、`tripOptimizer`、trip routes/UI | 日期/活动原子更新、硬约束、prefix 重算、放宽保证、完成事实绑定、只读完成态 | tripPlanner/tripOptimizer/tripPlannerUi | 极端/不可行组合、局部重算身份、状态机、幂等完成 |
| 导出、备份与隐私清理 | `export.ts`、`privacy-clean.mjs` | 单事务快照、shape 兼容、ZIP 白名单/路径、缺失资产、默认不含二进制、清理范围 | export/privacyClean | 恶意路径、并发快照、旧 V2、资产缺失、dry-run/边界 |
| 前端编排与 API | `src/app/App.tsx`、`src/api.ts`、各 feature | 请求竞态、跨实体状态、认证失效、错误恢复、只读/危险操作、DTO 漂移 | app/frontendApi/各 UI 测试 | 状态机静审、迟到响应、真实浏览器桌面/移动/键盘 |

### 结构扫描结果
- 前端 feature 文件没有检测到 `../../features/...` 形式的横向直接依赖；跨域编排主要集中在 2,779 行的 `src/app/App.tsx`，有利于定位全局竞态，但该文件本身是高耦合风险。
- 后端入口只绑定 `127.0.0.1`；统一 `helmet`、5 MB JSON 限制、变更请求来源校验与认证中间件在分域路由注册前生效。
- 未发现 TODO/FIXME/HACK/XXX，也未发现 `.only` 或显式固定跳过；`tests/garmentAssets.test.ts` 有一处运行时 `context.skip()`，需检查它是否只针对不支持符号链接/权限的环境，以及 CI 是否仍覆盖对应安全测试。
- `src/main.tsx` 对 Service Worker 注册/注销错误使用 `.catch(() => undefined)` 静默忽略；这可能是合理的非关键渐进增强，但会在前端深审时检查是否会留下开发态旧缓存且无诊断。
- 简单忽略错误扫描被单行超长 bookmarklet 放大，不能据此得出其它空 catch 结论；后续要限定模式和文件，避免噪声。

### Provider 可用性
- PowerShell `Get-Command` 结果：`python` 可用；`codex` 可见于 Codex Windows 应用目录；`gh`、`copilot`、`claude`、`gemini` 均不可用。
- 旧审计记录曾显示 code-review OpenAI provider 从 WindowsApps 路径启动时出现 `WinError 5`。本轮将先用 `codex --version` 与技能 `check --provider openai` 做一次当前环境验证；若仍失败，不重复尝试，也不阻塞主审查。

### 新增执行错误
- 阶段状态组合补丁因使用了无法唯一匹配的宽泛 `- **状态：** in_progress` 上下文而验证失败；`apply_patch` 没有产生部分写入。随后通过 `Select-String` 精确定位阶段 78/79 行并成功定点更新。

### 阶段 79：首批动态门禁
- 当前运行时为 Node `v24.15.0`、npm `11.12.1`、Python `3.13.9`，Node 满足 package 声明的 `>=24.14 <27`。
- `npm run typecheck` 成功；`python -m pytest -q` 为 38/38 通过。
- `git diff --check` 没有内容错误；仅提示三份 Markdown 在 Git 下未来可能从 LF 转为 CRLF，这是 Windows 行尾提示，不是当前内容失败。
- `tests/garmentAssets.test.ts` 的唯一 `context.skip()` 只在系统创建 symlink/junction 返回 `EPERM`、`EACCES` 或 `ENOTSUP` 时触发；它用于避免环境能力缺失导致假失败。当前 Windows 路径使用 junction，后续完整 Vitest 输出需确认该测试实际执行且没有 skipped。
- code-review 技能的 `check --provider openai` 仅根据文件存在性返回 `status:"ok"`；同一命令中直接执行 `codex --version` 明确报 `Access is denied`。因此 provider check 是可启动性假阳性，真实 review 很可能仍会命中既有 WindowsApps 权限问题。
- 将按技能工作流创建一份只读全项目审查请求并尝试一次实际 OpenAI provider 调用；若失败，记录后停止，不将外部 provider 缺失误判为项目缺陷。

### 阶段 79：完整动态门禁结果
- `npm test`：44/44 个测试文件、572/572 项通过，Vitest 输出没有 skipped、todo 或未处理异常；这也证明当前 Windows 环境实际执行了 symlink/junction 安全用例。
- 非破坏性生产构建写入全新目录 `output/build-project-audit-20260716-1807`，没有清空或删除现有 `dist`/output/Playwright 证据。Vite 8.0.16 成功转换 1,606 个模块。
- 构建产物：`index.html` 0.68 kB，CSS 118.77 kB（gzip 18.78 kB），JS 403.03 kB（gzip 119.13 kB）。构建仅提示 `@tailwindcss/vite:generate:build` 占用较多时间，无 chunk size 或失败告警。
- `npm audit --omit=dev --audit-level=high` 与全依赖 `npm audit --audit-level=high` 均为 0 漏洞。
- `python -m pip_audit -r requirements.lock.txt` 为 0 已知漏洞；`python -m pip check` 报告无破损依赖。
- 截至当前，自动化门禁没有直接暴露功能错误；后续重点转向“测试可能未覆盖的跨层不变量、静态边界和真实交互”。

### 外部代码审查技能最终状态
- 已按 code-review 技能创建只读请求 `output/code-review-project-audit-20260716.md`，未使用会创建并清理临时副本的 `--workspace`，因此没有隐式文件删除。
- 实际执行 `review --provider openai --add-dir D:\JavaWork\Outfit --reasoning high --raw` 在创建 Codex 子进程时稳定失败：`PermissionError: [WinError 5] 拒绝访问`。
- GitHub Copilot、Claude、Gemini CLI 均不存在；OpenAI CLI 又不可由子进程启动，因此本机没有可用的外部 provider。按三次失败/不重复失败原则，本轮不再尝试外部 provider。
- 该失败属于本机工具权限，不是 Outfit 项目缺陷。后续交叉验证改为：主 Agent分模块独立静审、串行/乱序动态测试、针对性回归与真实浏览器证据。

### 测试稳定性与副作用扫描
- 当前 Vitest 4.1.8 支持 `--sequence.shuffle`、文件/测试分别乱序以及固定 `--sequence.seed`；可用于暴露测试顺序依赖。
- 生产代码中的 `Math.random()` 只出现在视觉任务的非安全展示 ID；认证 session/password salt 使用 `randomBytes`，资产与候选 ID 使用 `randomUUID`。后续仍需确认视觉任务 ID 碰撞是否仅影响内存任务表且有额外随机/时间熵。
- 测试中的环境变量写入集中在 `tests/api.test.ts`，其全局 `afterEach` 会删除 `OUTFIT_TAOBAO_ITEM_CAPTURE_ENGINE`；需用乱序/单 worker 动态验证清理是否充分。
- fake timers 集中在导入和天气测试；后续检查每处是否在 `finally/afterEach` 恢复真实计时器，避免影响同文件后续用例。
- 子进程调用集中在淘宝采集、视觉、开发脚本和模型脚本，均使用 `spawn`/`execFileSync` 而不是 shell 拼接；深审重点是参数来源、取消/超时、环境继承和任务状态收敛。
- 直接网络调用集中在 Open-Meteo、Hugging Face/GitHub 模型下载及受限淘宝资源路径。深审重点是 URL 白名单、重定向、响应体上限、超时和是否只在用户显式动作后联网。
- `scripts/models.mjs` 会删除它自己创建的临时验证目录；这是产品脚本的正常自清理，但根据用户“删除前知晓”约束，本轮不会在未额外说明时运行 `models:verify`。
- 简单文本扫描被单行 bookmarklet 产生大量噪声；后续静审将排除该生成字符串并直接读取具体服务函数。

### 单 worker 稳定性缺口候选
- `npx vitest run --maxWorkers=1` 未完成：43/44 文件、508/572 测试通过后，Vitest 报 `[vitest-pool]: Worker forks emitted error` / `Worker exited unexpectedly`。
- 没有普通 assertion failure，也没有标明缺失文件；默认并发完整套件刚刚 572/572 通过，因此当前证据可能指向单 worker 模式下的资源/进程隔离、Node 24/Vitest fork 兼容或某测试导致 worker 进程异常退出。
- 下一步不重复同一命令，而是使用 verbose/JSON 诊断、测试文件计数与分片定位缺失文件，并尝试 threads pool 区分项目问题和 fork 运行时问题。
- 在定位前，不把该现象归类为产品缺陷，也不把 572/572 默认并发结果视为足以消除稳定性风险。

### 已确认：采集任务测试存在顺序依赖
- `npx vitest run --maxWorkers=1 --pool=threads` 为 572/572 通过，说明单执行线程本身可行，异常特定于 forks 生命周期/状态组合。
- 默认 forks 下用 `--sequence.shuffle --sequence.seed=20260716` 稳定出现两个 `tests/api.test.ts` 失败：
  - “客户端请求 Playwright 采集”预期 200，实际 409；
  - “非法 item-detail engine”预期先做输入校验返回 400，实际因已有活动任务先返回 409。
- 两个 409 共同证明某个前序测试启动的模块级采集任务没有在测试结束时复位；默认顺序只是偶然让相关用例通过。
- `api.test.ts` 的 `afterEach` 会关闭 server、恢复 mocks/globals、清环境变量，但没有关闭每个内存数据库，也没有清理 `taobaoCapture` 服务的全局任务/活动任务状态。
- 单独运行 `api.test.ts` 66/66 通过；`--detectAsyncLeaks` 报 130 个 Promise，主要是已 await 的 Node fetch 调用，暂不作为泄漏证据。更直接的缺陷是乱序下可观察的 409 状态污染。
- 下一步审查 `server/services/taobaoCapture.ts` 的模块级状态和任务完成/取消路径，设计不暴露给生产客户端的显式测试/进程关闭清理边界；同时跟踪并关闭测试创建的数据库，验证 forks 单 worker 与乱序都转绿。

### 已确认：采集产物可过早释放单任务锁
- `readTaobaoCaptureJobArtifact()` 在只要读到 JSON 时就无条件把 `job.status` 改为 `succeeded`；`refreshJobFromArtifact()` 也有同样行为。
- 两个函数都不会终止子进程，也不会删除 `job.child`。真正的 `exit/error` handler 才会关闭并删除 child。
- `findActiveCaptureJob()` 先调用 artifact refresh，随后只检查 `status` 是否为 running/pending；因此“脚本已写出 JSON、但浏览器/采集进程尚未退出”的窗口中，第二个采集任务可绕过全局单任务约束并与第一个并发运行。
- 正确语义应是：产物可以提前读取并记录 `artifactPath`，但只要 child 仍存在，任务就保持 running；只有 exit/error/cancel 才进入终态并释放并发锁。
- 还需要一个统一生命周期清理函数，在 API 进程关闭或测试结束时终止仍运行的 child、关闭日志句柄并清空内存任务表，避免孤儿进程和测试污染。
- `tests/api.test.ts` 另创建约 65 个 `:memory:` SQLite 数据库且没有任何 `close()`；将通过局部 wrapper 自动登记并在 server 关闭后统一 close，作为 forks 单 worker 稳定性修复。

### 已确认：全测试库普遍泄漏 SQLite 实例
- 修复 API 文件自身的 67 个数据库关闭后，固定乱序 forks 已 573/573 通过，但默认顺序 forks 单 worker仍在 43/44 文件、507/573 后退出；差值 66 表明重型 API 文件刚开始时 worker 已处于资源压力状态。
- 全仓统计显示 20 个测试文件约调用 `createDatabase()` 199 次，只找到 4 次显式 close。高占用文件包括 `dbImport` 24、`export` 22、`recommendationFeedback` 14、`planner` 13、`tripPlanner` 13、`garmentAssets` 10、`savedOutfits` 9 等。
- 默认并发测试能通过，是因为多个 worker 分摊并在进程退出时回收原生 SQLite 资源；单 fork worker按默认历史顺序累积全部未关闭实例，最终在 API 文件阶段异常退出。
- 这是测试基础设施的真实资源生命周期错误。计划新增共享 `tests/helpers/testDatabase.ts`：包装生产 `createDatabase`、按测试文件登记实例、在 `afterEach` 中仅关闭仍 `isOpen` 的数据库；所有测试文件改为从 helper 导入 createDatabase，其余数据库函数仍从生产模块导入。
- `devScript.test.mjs` 只读取脚本文本，不执行进程终止逻辑；目前没有证据表明 worker 退出由该测试触发。

### 阶段 79 修复结果
- 新增回归“产物已存在但 child 未退出时仍保持采集锁”，旧实现稳定失败于 `succeeded !== running`；修复后该回归通过。
- `readTaobaoCaptureJobArtifact()` 与后台 artifact refresh 现在只记录产物路径；只要 child 仍存在，任务保持 running 并提示等待进程结束。exit/error/cancel 才释放单任务锁。
- 新增内部 `clearTaobaoCaptureJobs()`：终止仍挂载的 child、关闭日志句柄并清空内存任务表；API 测试在每例后调用，且不删除任何采集产物。
- 修正两个 API 测试自身的任务生命周期：读取产物后显式取消仍运行任务；“取消后允许新任务”用例也取消它启动的第二个任务。
- 新增 `tests/helpers/testDatabase.ts`，同时跟踪生产 `createDatabase()` 和受跟踪的 `TestDatabaseSync`；每个测试文件 `afterAll` 关闭所有仍 `isOpen` 的实例。
- 17 个此前泄漏数据库的测试文件迁移到 helper；API 文件保留更严格的 afterEach 本地 wrapper，迁移演练与视觉缓存文件保留其已有显式 close。
- 修复验证：
  - API 专项 67/67；
  - 原始默认 forks 单 worker 44/44、573/573；
  - 固定种子 `20260716` 乱序 forks 单 worker 44/44、573/573；
  - 项目标准 `npm test` 44/44、573/573；
  - typecheck 与 `git diff --check` 通过。
- `clearTaobaoCaptureJobs()` 当前用于测试隔离；是否还应接入正式 API 进程的 SIGINT/SIGTERM 优雅关闭，将在阶段 80 的进程/子进程边界审查中决定。

### 新增工具错误
- 读取 `tests/api.test.ts` 500–940 行的首次 PowerShell 命令把单个范围错误构造成嵌套对象，`Math.Min` 报参数类型不匹配；命令未修改文件。随后改用直接整数循环成功读取。
- 阶段 80 首次把 `server/auth.ts`、`server/routes.ts` 后半段、`server/validation.ts` 两段和全路由声明并行读取，四路返回均因总输出过大被截断，未形成可依赖的审查证据，也没有修改文件。后续改为先用 `Select-String` 定位安全关键函数，再逐个读取不超过约 180 行的小区块。
- 随后的全测试目录认证关键词扫描因为 `cookie`、`origin` 等词过于常见，返回尾部再次截断；前段认证测试行号仍可用，但不把缺失部分当作已审。测试证据改为按已定位的 `tests/api.test.ts:127-380` 分块读取。
- 检索“本机唯一账号”时漏排除 `dist`，压缩 bundle 造成一次超大输出截断。截断前的 README、API/schema 文档已明确产品承诺是“本机唯一账号”；后续所有递归源码检索都显式排除构建产物。

### 阶段 80：认证、会话与进程边界
- `server/index.ts` 只监听 `127.0.0.1`；Vite 代理保持浏览器侧 Host，严格同源校验会同时比较协议可解析性与完整 `host:port`。跨站和同站不同端口均有 API 回归，当前未发现 Host/Origin 绕过。
- session token 使用 32 字节 CSPRNG，数据库只保存 SHA-256；密码使用随机 16 字节 salt + scrypt，并以 `timingSafeEqual` 比较。Cookie 为 HttpOnly、SameSite=Lax、Path=/；由于正式启动仍是本机 HTTP，未设置 Secure 是当前运行模型下的兼容取舍。
- `/api` 认证中间件注册在 `/api/garment-thumbnails` 静态服务之前，因此旧淘宝缩略图同样需要有效 session；本地净化资产另经认证的 `/api/garment-assets/:id/content` 读取。最初怀疑的“静态图片绕过认证”已排除。
- 高置信缺陷候选：`createFirstUser()` 用“先查账号数、再做 scrypt、再 INSERT”的非事务检查实现“本机唯一账号”。README、API 和 schema 都明确承诺唯一账号，但两个同时连接同一 SQLite 文件的 API 进程可以在窗口内各自看到 0，随后插入不同用户名；`users` 只有 `username_normalized` 唯一约束，无法阻止第二个不同用户名。需用可控竞态回归先红，再以 `BEGIN IMMEDIATE` 内二次检查修复。
- 低风险资源缺口：登录限流 Map 只在再次访问同一个 key 时删除过期项，持续尝试不同合法用户名会让已过期 key 常驻进程；需在阶段 82 决定采用全表过期清扫和容量上限，避免把单机本地攻击面夸大为远程漏洞。
- 高置信生命周期缺口：`server/index.ts` 未保存 HTTP server，也没有 SIGINT/SIGTERM 清理；正式采集任务是非 detached 子进程，但在 Windows/强制终止场景仍可能留下浏览器进程树，数据库也未显式关闭。阶段 79 已有 `clearTaobaoCaptureJobs()`，应通过可测试的幂等 shutdown 路径接入 server 与 DB。
- 数据库 schema 探针前两种 `-e` 传参方式被 Windows 参数解析移除脚本内引号，首次还将 SQL 的 `COUNT(*)` 中 `*` 误当成命令；三次失败均未写文件。最终改用 here-string 经标准输入传给 `node --import tsx --input-type=module -` 后成功。

### 阶段 80：数据库、迁移与事务
- 新建内存库共有 26 张业务/迁移表；`PRAGMA foreign_keys=1`、`integrity_check=ok`、`foreign_key_check=[]`。版本化新增表均为 STRICT，旧 baseline 表为兼容历史数据库继续保持非 STRICT。
- migration runner 在 baseline 和每个编号迁移上都使用 `BEGIN IMMEDIATE`，拿到写锁后重读版本前缀，并在失败时尽力回滚且保留原始错误；并发迁移、重复版本、未来版本、改名、baseline 与迁移回滚均有专项测试。
- 所有检测到的动态 SQL 插值来源都为代码内固定片段：scope 三选一、布尔 active 条件、受控清空谓词、按数组长度生成的 `?` 占位符、固定迁移列名或兼容列存在性表达式；用户数据仍通过绑定参数传入，未发现 SQL 注入路径。
- 多表业务写入（可信导入、图片资产元数据、推荐候选/反馈、可用状态、保存搭配、周计划、穿着事件、Trip）均可定位到 `BEGIN IMMEDIATE` 事务与原错优先回滚；新建内存库及现有回归没有外键破坏。
- 五组外键没有以自身列作为索引首列：`outfit_pair_stats.garment_b_id`、`recommendation_feedback.wore_instead_outfit_id`、`saved_outfit_items.garment_id`、Trip activity 的复合选择外键、`trip_packing_items.garment_id`。当前都是本地小数据、软归档为主，且关键常用查询另有索引，因此先归类为删除/外键检查的性能余量，不是正确性缺陷。
- migration 6/7 没有在 `dbMigrations.test.ts` 尾部各自独立成完整 schema 用例，但成本回填在该文件前部覆盖，实际迁移演练与 decision-support/Trip 专项测试会创建并使用相关表、索引和外键。属于测试组织缺口，不是当前迁移失败证据。
- 缩略图专项测试首次按猜测文件名 `tests/thumbnails.test.ts` 读取失败；该路径不存在，命令没有写入。后续先定位真实文件名。

### 已确认并修复：远程缩略图只验图片头，可接受损坏文件和像素炸弹
- 旧实现下载后只调用 `readImageInfo()` 读取 JPEG/PNG/WebP 头部尺寸，随后直接把原始字节写盘。新增回归用一个只有 33 字节、缺少 PNG IDAT/IEND 的伪图片；旧实现稳定返回成功并写出 `.png`，证明完整图片从未解码。
- 同一缺口允许极小响应头声明 `100000 × 100000` 像素；旧逻辑只检查最小边长和宽高比，没有最大像素限制。淘宝 CDN 承载商家内容，不能把域名白名单等同于图片本体可信。
- 修复后每个候选仍先经过协议、淘宝 CDN 域名、逐跳手动重定向、超时、Content-Length 和流式 5 MB 上限；随后由 Sharp 在 4000 万像素上限下完整解码、拒绝多页/非 JPEG-PNG-WebP、自动旋转、移除元数据并统一重编码为 WebP。净化后的输出再次检查类别尺寸比例和 5 MB 上限后才写盘。
- 对 HTTP 错误、非图片 Content-Type 和过大 Content-Length 的早退路径现在会主动取消响应体，避免未消费 body 长时间占用连接/资源。
- 兼容性：已有 `.png/.jpg/.webp` 本地缩略图 URL 仍可由静态路由读取；只有新下载结果统一使用 `.webp`。视觉去背景继续接受通用 `/api/garment-thumbnails/<file>`，其输出仍为 `-cutout.png`。
- 验证：新增的截断图片回归先红后绿；像素炸弹回归通过；thumbnail 专项 9/9、三个相关 API 流程 3/3、typecheck 和 `git diff --check` 均通过。

### 已确认并修复：天气超时只覆盖响应头，不覆盖正文
- `requestOpenMeteo()` 原先在 `await fetch()` 返回后立即进入 `finally` 清除计时器，再调用 `response.json()`；如果 Open-Meteo 只发送响应头或正文流中途停住，请求会无限等待。
- 新增可控流回归：fetch 立即返回 200 和未结束 JSON 流，旧实现推进 10 ms 后 `AbortSignal.aborted` 仍为 false，稳定失败。
- 修复将状态检查与正文 JSON 读取都放在同一 `try` 内，计时器只在完整读取/解析结束后清除；正文读取因 AbortError 或 signal 已终止时统一映射为“Open-Meteo 请求超时”。非 2xx 早退也会取消响应体。
- 首次修复后 13 个断言均通过但测试晚订阅 rejection，Vitest 报一次异步已处理拒绝；调整测试订阅时序后 weather 13/13、typecheck 全绿且无未处理错误。

### 已确认并修复：视觉去背景只检查输出路径存在，可持久化损坏或陈旧文件
- `createGarmentCutout()` 原先在本地 `rembg` 返回后只检查固定 `*-cutout.png` 路径是否存在，随后立即把 URL 写入数据库。既有成功用例甚至只写入 4 字节 PNG 签名仍得到 200，证明输出从未完整解码。
- 固定输出名还允许本次模型进程没有真正写文件时误接纳上一次遗留的同名结果；直接覆盖同名文件也会让已有 URL 在后台悄然指向不同内容。
- 修复后每次运行使用随机 UUID 生成独立 `*-cutout-<uuid>.png`，因此不会把陈旧文件误判为本次结果，也不会覆盖历史 URL。旧版去背景文件继续可读，本轮未删除任何文件。
- 在持久化 URL 前，服务会通过 `lstat` 拒绝符号链接和非普通文件，再由 Sharp 验证完整单页 PNG、宽高和 4000 万像素上限，执行完整解码、补齐 alpha 并重新编码为规范 PNG；任一步失败都返回 `VISION_OUTPUT_INVALID`，且数据库保持原状。
- 新增损坏 PNG 回归，并把三个既有成功 fixture 改为真实可解码 PNG。验证结果：5 个视觉 API 用例通过，`npm run typecheck` 与 `git diff --check` 通过。

### 已确认并修复：唯一账号创建存在检查—写入竞态
- `createFirstUser()` 原先先在事务外读取 `COUNT(*)`，随后执行同步 scrypt，最后直接插入。两个连接可同时读到 0，再以不同用户名各插入一行；用户名唯一索引无法维护“整库只能有一行用户”的产品承诺。
- 新增可控陈旧读取回归：首次账号计数返回旧的 0 后，模拟另一个进程抢先创建账号；旧实现没有抛错并继续插入第二行，稳定证明 TOCTOU。
- 修复保留快速前置检查和耗时密码派生在事务外，随后使用 `BEGIN IMMEDIATE` 取得写锁，在锁内再次检查账号数并执行插入；若竞争者已创建账号则回滚并返回原有 `ACCOUNT_EXISTS` 409。
- 验证结果：认证竞态专项 1/1、首次注册/登录 API 1/1、`npm run typecheck` 通过。
- 测试装配期间曾因无参数 `createDatabase()` 只读打开真实项目数据库；既有账号使函数在写入前立即拒绝，未发生真实数据修改。测试已固定为 `:memory:`。

### 已确认并修复：正式 API 进程没有统一关闭后台任务、HTTP 与数据库
- `server/index.ts` 原先丢弃 `app.listen()` 返回的 server，未注册 SIGINT/SIGTERM，也未显式关闭 SQLite。阶段 79 新增的采集任务清理仅用于测试；视觉模型下载任务还只保存公开状态和 PID，没有保存可终止的 child 引用。
- 视觉模型下载/验证脚本还会继续派生 Python/Node 子进程。仅依赖父进程自然退出，在 Windows 或连接长期挂起时可能留下浏览器/模型进程树，并让数据库依赖进程强制回收。
- 新增 `createServerShutdown()`：第一次调用立即停止 HTTP 接入并关闭空闲连接，依次执行后台清理；等待中的连接超过 5 秒会调用 `closeAllConnections()`，随后才关闭仍打开的数据库。重复信号共享同一个 Promise，所有清理只执行一次；各阶段错误会在尽量完成其余清理后汇总抛出。
- 视觉服务现跟踪模型任务及请求内 rembg/标签推理的全部 child；error/close 会移除句柄，统一 `clearVisionJobs()` 会终止仍运行的进程树并清空内存任务，不删除任何模型、缩略图或采集产物。
- `server/index.ts` 现在保存 HTTP server，并在 SIGINT/SIGTERM 上调用统一关闭入口；失败只设置非零 `exitCode`，不会在资源清理完成前直接 `process.exit()`。
- 验证结果：生命周期专项 2/2、视觉模型任务 API 3/3、`npm run typecheck` 通过。

### 已确认并修复：请求内视觉模型进程可无限运行并无限累积输出
- 默认 rembg 与 CLIP 包装器原先没有超时；只要 Python/Node 模型进程不退出，对应 HTTP 请求、child handle 和内存状态就会无限挂起。
- `runProcess()` 还会把 stdout/stderr 无上限拼接为 JavaScript 字符串。异常模型、依赖日志风暴或被破坏的本地运行环境可以持续扩大服务内存；非零退出时还会把原始 stderr 作为 API 错误消息返回。
- 新增两个 API 回归：输出 24 字节但配置上限 8 字节时，旧实现继续运行并最终报 `VISION_OUTPUT_MISSING`；不触发 close/error 时，旧实现 75 ms 后请求仍为 pending。两者均稳定红灯。
- 修复为默认 120 秒超时、stdout+stderr 合计 1 MiB 上限；测试和嵌入调用可通过内部 options 收紧。超时返回 504 `VISION_PROCESS_TIMEOUT`，输出超限返回 500 `VISION_PROCESS_OUTPUT_LIMIT`，两者都会终止进程树并从统一跟踪集合移除 child。
- spawn 失败和非零退出现在返回稳定、去除原始 stderr 的 `VISION_PROCESS_FAILED`，避免把本机路径或依赖内部日志直接暴露给 API 客户端。
- 验证结果：默认 rembg、默认 CLIP、输出超限、执行超时共 4/4 API 回归通过，`npm run typecheck` 通过。

### 已确认并修复：登录失败限流 Map 可被不同用户名无界增长
- 原实现只在再次查询同一个 `username|remoteAddress` 时删除该键的过期记录。持续提交不同的合法用户名会让所有旧键常驻当前 API 进程；虽然服务只绑定本机，这仍是可避免的资源生命周期错误。
- 限流逻辑现抽为独立可测试模块：每次检查、记录或统计都会清扫窗口外记录；不同失败键默认最多 1024 个，新增时若已满则淘汰 `firstFailureAt` 最早的记录。
- 原有安全语义保持不变：同一规范化用户名和远端地址在 15 分钟内失败 5 次后返回 429 `LOGIN_RATE_LIMITED`，成功登录会重置该键。
- 验证结果：限流专项 2/2、既有重复失败登录 API 1/1、`npm run typecheck` 通过。

### 已确认并修复：采集产物扫描会跟随符号链接读取根目录外 JSON
- `collectJsonArtifacts()` 原先对每个条目使用 `statSync`。在 POSIX 符号链接和 Windows junction 上，`statSync` 返回目标类型，因此链接到外部目录会被递归，链接到外部 JSON 也会被当作普通文件。
- 真实文件系统回归把采集目录下的 `linked` junction 指向另一个临时目录；旧实现选择并返回外部 `secret.json`，而不是根内 `safe.json`。把整个采集根设为 junction 时旧实现同样直接读取外部文件。
- `CaptureFileSystem` 现支持可选 `lstatSync`；真实 fs 扫描首先拒绝自身为符号链接/junction 或非目录的根，再对每个子项使用 `lstat` 并跳过所有链接。测试替身仍可保留原 stat 语义。
- 后台采集进程退出时若根目录被替换为不安全链接，会把它视为没有可信产物并令任务失败，而不会让事件回调抛出未处理异常。读取接口返回结构化 `CAPTURE_ARTIFACT_UNSAFE`。
- 验证结果：采集专项 8/8、job 产物与锁相邻 API 2/2、`npm run typecheck`、`git diff --check` 通过。

### 已确认并修复：删除或改写旅行穿着日记会破坏完成态一致性
- `completeTrip()` 会把新 `WearEvent` 的 ID 保存到 `trip_outfit_selections.actual_wear_event_id`，并要求确认时 `itemIds` 与 selection 的 `garment_ids_json` 完全一致；但通用 `updateWearEvent()` 原先允许之后把该事件的衣物改成任意现存衣物。
- 通用 `deleteWearEvent()` 原先只恢复关联周计划、撤销推荐反馈并删除事件。数据库外键随后把 `actual_wear_event_id` 自动设为 NULL，但 `trips.status` 仍保持 `completed`，形成“已完成旅行却有未确认 selection”的可达状态。
- 两个最小回归在旧实现上稳定红灯：旅行绑定事件改成方案外衣物不会抛错；删除唯一旅行事件后读取旅行仍返回 `completed`。
- 修复后，穿着事件更新会查询旅行绑定；只有显式修改 `itemIds` 时才要求与原 selection 数组完全一致，时间、时区、场合、天气和备注仍可正常纠正。偏离时返回 409 `TRIP_WEAR_EVENT_ITEMS_MISMATCH`。
- 删除绑定事件时，事务会显式清空 selection 链接并更新其时间戳；若旅行仍为 `completed`，同时恢复为 `ready`，从而允许用户重新确认。归档旅行保持归档，不会因日记删除而静默解归档。
- 验证结果：旅行与日记联合专项 2 文件、32/32 通过，`npm run typecheck` 与 `git diff --check` 通过。

### 行程优化器与保存搭配/反馈审查结论
- `completeTrip()` 的 selection 总数与剩余未确认数判断正确；空 selection 不会被误标完成。`storedSelectionAsOptimizerPrefix()` 的 `limitingActivityId` 兜底 0 在正常路径不可达，因为优化 slot 必须至少有一项活动，导出校验也要求非空正整数活动数组。
- 优化器对共享活动取最低分、同日独立时段分别计穿着、洗衣日前清零、重复规则优先级、Top 12/beam/search budget 和不可变前缀均有直接测试；本轮未确认新的优化错误。
- 保存搭配的推荐快照 ID 顺序与 `canonicalizeOutfitSlots()` 一致，候选损坏会事务回滚；反馈实际穿着不可逆、删除日记后的统计回退和清空范围均有专项覆盖。本批除旅行—日记链接外未确认新的数据错误。

### 已确认并修复：未知颜色被当作相同颜色，制造 75% 重复误报
- 淘宝分类器与手工录入都明确使用 `color=unknown` 表示没有颜色证据；相似度规范又要求缺失成分不进入分母。但旧实现只检查颜色字符串非空，因此两个 `unknown` 会获得完整 25 权重的“颜色一致”。
- 分类器还会给服饰附加常见 `casual` 风格。构造两件同类别、名称完全不相似、颜色均未知、风格均为 casual 的衣物时，旧实现得到 `(颜色25 + 风格20) / (颜色25 + 风格20 + 名称15) = 75%`，刚好被标记为可能重复。
- 新回归在旧实现上稳定得到 `similarity=75`、`availableWeight=60` 和“颜色一致：unknown”；修复后任一侧颜色为 `unknown` 时整个颜色成分按缺失处理，结果降为 57.1%，不再越过重复阈值。
- 验证结果：相似度、购买检查和决策支持 API 相邻测试共 3 文件 16/16，`npm run typecheck`、`git diff --check` 通过；API/schema 文档已明确占位值语义。

### 已确认并修复：推荐天气校验会把非数字隐式转换并接受不存在日期
- `validateWeather()` 原先通过 `Number(value)` 验证数值，所以 JSON `null`、布尔值、空字符串和数字字符串会分别被转换为 0、1 或对应数字，违反 `WeatherSnapshot` 的 number 契约；日期只检查是字符串，`2026-02-30` 也会进入推荐评分并在季节判断中产生错误语义。
- 新增表驱动回归后，旧实现对 `temperature=null`、`apparentTemperature="29"`、`precipitationProbability=true`、`windSpeed=""` 均不抛错；不存在日期同样被接受，稳定证明问题。
- 修复将天气数值改为严格“原值必须是有限 number”，并复用真实 `YYYY-MM-DD` 日历日期校验。没有扩大到未约定的物理范围限制，保持现有合法客户端兼容。
- 验证结果：推荐约束、推荐算法及 API 相关筛选测试共 3 文件 59 项通过（其余 62 项因 `-t recommend` 正常跳过），`npm run typecheck`、`git diff --check` 通过；API/schema 文档已同步。

### 已确认并修复：损坏天气缓存可绕过响应契约，错误时间戳可在降级分支复活
- 单日 `getCachedWeather()` 原先只对 `payload` 做 `JSON.parse` 等价操作并以 TypeScript 类型断言返回；数据库中合法 JSON `{}` 会直接作为 HTTP 200 天气响应，既不访问 Open-Meteo，也不生成估算值。
- 逐日缓存虽有浅层类型检查，但只确认 `date` 是字符串、其他字段是 number；`2026-02-30` 仍会作为有效预报返回，也不拒绝多余字段、非有限数值或空摘要。
- 逐日过期缓存分支在 `maxAgeMs=Infinity` 时把“时间戳是否合法”和“是否过期”一起跳过，因此 `fetched_at="not-a-timestamp"` 的行会在 Open-Meteo 失败后被重新启用。
- 两条相邻 TTL 回归还确认：单日和逐日都把未来 `fetched_at` 产生的负年龄当成“未超过 30 分钟”，例如 2099 年缓存会一直覆盖当前天气，直到系统时钟追上。
- 五条 API 红灯分别稳定返回 `{}`、三项 `2026-02-30`、摘要“不应复活”以及两类“未来缓存”。修复后复用数据库迁移已有的严格 `WeatherSnapshot` 守卫：真实日期、精确字段集、有限数值和非空摘要必须全部成立；缓存时间先无条件验证可解析性和非负年龄，再按有限 TTL 判断新鲜度。
- 验证结果：天气相关 API 筛选 7/7（其中新增缓存回归 5 条）、既有 weather 专项 13/13、`npm run typecheck` 与 `git diff --check` 通过；API/schema 已明确损坏与未来缓存会被忽略。

### 已确认并修复：衣物资产根为 junction 时可读写配置目录外文件
- 资产文件名本身已有 UUID 白名单，读取也会拒绝链接文件并验证真实目标位于 `realpath(assetRoot)` 下；但资产根只调用 `realpath`，没有要求根路径本身是普通目录。
- 当配置的 `assetRoot` 是指向外部目录的 Windows junction/POSIX 目录链接时，旧实现会把链接目标当成合法根：认证内容读取可返回外部 WebP，完整 ZIP 备份也会走同一路径；上传则会在外部目录新建 WebP、写入资产行并更新衣物 URL。
- 两个真实文件系统回归均稳定红灯：通过 linked root 读取成功返回 Buffer，通过 linked root 写入成功生成外部文件和数据库资产。
- 修复后写入在建目录后、打开临时文件前检查根为非链接普通目录，并在关键落盘阶段复核根的真实路径未变化；不安全根返回 409 `GARMENT_ASSET_STORAGE_CONFLICT`。读取/备份在解析目标前执行同一根检查，并继续折叠为不泄露物理路径的 404/备份警告。
- 验证结果：garment asset 专项 14/14、ZIP/资产相邻导出 4/4、`npm run typecheck` 通过；未删除任何外部或本地资产文件。

### 已确认并修复：ZIP 预流失败仍把 JSON 错误标成下载归档
- `/api/export?format=zip` 在调用流式服务前就设置 `Content-Type: application/zip` 和 `.zip` 的 `Content-Disposition`。若 `buildOutfitExportV2()` 因损坏 JSON 在写出第一个 ZIP entry 前失败，catch 会调用通用 `sendError()`，但 Express 不会覆盖已显式设置的内容类型。
- 最小 API 回归插入 `seasons='not-json'` 后请求 ZIP：旧实现虽返回 500 和 JSON body，响应仍为 `application/zip; charset=utf-8` 且携带下载文件名，浏览器会把错误说明保存成看似有效的备份。
- 修复只作用于 `headersSent=false` 的预流失败：先移除 Content-Disposition、Content-Type 和可能的 Content-Length，再交给统一 JSON 错误边界。已经开始传输的 ZIP 仍销毁连接，避免拼接 JSON 污染归档。
- 验证结果：JSON/ZIP 正常导出、非法格式和预流失败筛选 3/3、`npm run typecheck`、`git diff --check` 通过。

### 已确认并修复：重复淘宝来源证据的合并与 batchId 依赖数组顺序
- 文档与既有测试承诺缺省 `capturedAt` 时，同一规范化批次的 `batchId` 不依赖 `items` 顺序。但旧实现对相同 `externalKey` 的重复项边遍历边合并；数量、付款、状态等字段在双方都显式提供时由先出现者获胜。
- 构造同一订单、商品、SKU 的两条重复记录，分别携带数量 1/2、付款 99/198 和不同状态；仅反转数组后，旧实现生成两个不同 SHA-256 batchId，归一化 source item 也不同。DOM 抓取顺序变化因此会破坏预览—提交身份与幂等重放。
- 修复先按 `externalKey`/独立详情 itemId 分组，再在每组内按完整、固定字段顺序的规范化 JSON 稳定排序，最后沿用既有字段优先规则合并。不同来源项的展示顺序仍保持首次出现顺序；只消除组内冲突的偶然先后差异。
- 验证结果：新增顺序反转回归先红后绿；`importTaobao` 48/48、`dbImport` 27/27、`npm run typecheck` 通过。

### 已确认并修复：购买检查把未知颜色当作中性色，虚构保存搭配兼容性
- 分类器以 `color=unknown` 表示没有颜色证据；但购买检查的 `NEUTRALS` 包含 `unknown`，所以一侧未知会获得 `+2`，两侧未知会获得 `+4` 的中性色兼容奖励。这与相似度已明确采用的“未知即缺失”语义冲突。
- 最小集成回归构造一个未知颜色、`smart-casual` 的上装候选，以及未知颜色、无风格重合、正式程度相差 2 级的运动下装。除颜色外证据总分为 `-3`，旧实现因未知颜色额外 `+4` 得到 `+1`，错误返回该保存搭配为 `worksWith`。
- 修复新增明确的缺失颜色集合：规范化后的空字符串或 `unknown` 任一侧出现时，颜色配对得分固定为 0；真实黑、白、灰、米、棕、蓝等中性色奖励和真实撞色惩罚保持不变。
- 验证结果：新增回归先红后绿；购买检查 6/6、决策支持 API 3/3、`npm run typecheck` 通过，API/schema 文档已同步。

### 已确认并修复：推荐反馈校验阻止按契约单独清空评论
- API 文档明确约定省略 `comment` 表示保留，空字符串表示显式清空；清空标记应先与既有反馈合并，只有最终完全无信号才拒绝。
- 服务层已经正确实现该合并规则，但路由校验用 `Boolean(input.comment)` 判断更新是否有意义。因此 `{ candidateId, reasonCodes: [], comment: "" }` 即使已有 verdict、rating 或实穿事实，也会在读取旧反馈前直接返回 400。
- 新增认证 API 回归：先建立含 verdict/rating/实穿/评论的反馈，再只提交空原因和空评论；旧实现稳定返回 400。修复改为按“comment 字段是否出现”识别更新意图，服务层负责最终状态校验。全新候选提交同样的空标记仍返回 400，不会创建空行。
- 验证结果：推荐反馈服务/API 2 文件 15/15、原严格请求校验筛选 1/1、`npm run typecheck` 通过；API/schema 文档已同步。

### 已确认并修复：衣物可用状态在事务外判断幂等，可返回与数据库事实相反的成功结果
- `setGarmentAvailability()` 原先先读取当前衣物，再在发现目标状态相同时直接返回；只有需要改变时才启动 `BEGIN IMMEDIATE`。因此另一写入可在读取与返回之间把状态改走，本请求仍返回 `changed:false` 和陈旧衣物，违反“把状态设置为目标值”的接口语义。
- 可控回归在 `getGarmentById()` 返回 `available` 后、服务尚未进入事务时注入一次 `repair` 写入；旧实现返回“已是 available”，但随后数据库实际为 `repair`，稳定证明 no-op 路径存在 TOCTOU。
- 修复把事务存在性检查和 `BEGIN IMMEDIATE` 移到首次读取之前；取得写锁后才判断目标是否已满足。真正幂等时提交空事务且不写历史，变更时继续把状态更新与事件插入原子提交。
- 验证结果：推荐反馈/可用状态专项 15/15、`npm run typecheck`、`git diff --check` 通过。

### 已确认并修复：完整导出丢失推荐反馈的权威 WearEvent 链接
- 版本 5 已在 `recommendation_feedback` 增加 `wear_event_id`，运行时 `RecommendationFeedback` DTO 也公开 `wearEventId`；但 `listRecommendationFeedbackForExport()` 的 SELECT、行类型和映射仍停留在旧 `wear_log_id`，所以 JSON/ZIP 完整备份静默丢失新链接。
- 同一导出 shape 校验器也没有检查可选 `wearEventId`，因此 `wearEventId:0` 会被接受为合法 V2。更隐蔽的是，导出只读取 `actually_worn` 标志，没有像运行时 DTO 那样把现存 wear link 视为权威实穿事实。
- 回归新增一条带真实 WearEvent 和候选衣物明细的反馈，并把旧布尔标志故意保持为 0；旧导出同时漏掉链接并返回 `actuallyWorn:false`。另一个校验回归证明非法 0 未被拒绝。
- 修复后查询、映射和校验均包含可选正整数 `wearEventId`；`wear_event_id`、兼容 `wear_log_id` 或布尔标志任一成立都会导出 `actuallyWorn:true`。字段仍为可选，旧 V2 不受影响。
- 验证结果：导出专项 22/22、导出 API 相邻筛选 3/3、`npm run typecheck` 通过；API/schema 文档已同步。

### 已确认并修复：语法合法但形状错误的衣物 JSON 可突破共享 DTO
- `rowToGarment()` 与 `updateGarment()` 使用泛型 `safeJson<T>`；它只在 `JSON.parse` 抛错时回退，却把任何语法合法结果直接断言成目标类型。于是 `seasons='{}'`、`styles='[1]'`、`materials='"cotton"'`、`patterns='null'`、`tags='[true]'` 会分别作为对象、数字数组、字符串、null 和布尔数组返回给声明为字符串数组的字段；`vision_tags='{}'` 也会被当成完整 `VisionTagSuggestion`。
- 这不仅使 `/api/garments` 违反共享类型，后续推荐代码调用 `.includes()` 等数组方法时也可能崩溃；一次只改备注的更新还会把错误形状重新序列化回库，而不是恢复契约。
- 新回归先直接读取五种错误数组形状和空视觉对象，再执行无关字段更新并检查底层列。旧实现稳定返回错误运行时类型且原样写回。修复增加严格字符串数组守卫；季节额外只允许四个 `Season` 枚举，视觉建议要求可选合法类别、三个字符串数组以及 label/有限 score 数组。异常数组读取为 `[]`，无效视觉缓存读取为缺失，后续更新写回规范数组；完整导出仍会对原始损坏数据明确失败，不掩盖备份审计。
- 首次守卫返回通用 `string[]` 导致类型检查指出不能赋给 `Season[]`；改为可选枚举白名单的泛型后解决。
- 验证结果：衣物更新/价格、数据库导入与价值洞察相邻 3 文件 42/42；视觉缓存与导出追加联合回归 3 文件 32/32；`npm run typecheck`、`git diff --check` 通过，API/schema 文档已同步。

### 已确认并修复：持久化推荐原因只验字符串，可返回非法 FeedbackReason
- `recommendation_feedback.reason_codes_json` 的表约束只保证是 JSON 数组。请求写入会验证九个枚举和去重，但运行时 `parseReasonCodes()` 只确认每个元素是字符串，随后直接断言为 `FeedbackReason[]`。
- 因此合法 JSON `["invented"]` 或 `["fit","fit"]` 会从读取 API、反馈洞察和统计重算路径流出，分别违反枚举与不重复契约；完整导出已经更严格，运行时语义不一致。
- 两条持久化层回归在旧实现上均不抛错。修复复用公开 `FEEDBACK_REASONS` 建立集合，同时要求所有值受支持且数组无重复；损坏行返回稳定 500 `CORRUPT_FEEDBACK`。
- 验证结果：推荐反馈服务/API 18/18、导出 22/22、`npm run typecheck` 通过；API/schema 文档已同步。

### 已确认并修复：历史刷新慢响应可覆盖用户已切换到的新周
- `refreshHistoryData()` 与 `refreshPlannerWeek()` 都会写入 `outfitPlans`/`plannerForecasts`，但二者没有共享请求版本。顶部“刷新”只设置 `busyAction="history"`，不会设置 `plannerBusy`，所以刷新未完成时“下一周”仍可点击。
- 使用独立数据库、真实 Chrome 和 Playwright 路由构造“当前周刷新延迟 1800 ms、下一周请求立即返回”：切到 7 月 20–26 日后，250 ms 时界面正确显示新周的 `搭配 #222`；旧周响应到达后，周标题仍是 7 月 20–26 日，但 `搭配 #222` 消失并恢复为空周。
- 旧响应中的 `搭配 #111` 因日期属于上一周而被 WeekGrid 过滤，所以最终表现不是直接显示旧卡片，而是把已经成功加载的新周数据静默清空。
- 新增通用 `createLatestRequestGate()`；历史公共数据与周计划数据使用独立 gate，`refreshHistoryData()` 将两组并发读取分开 settle，因此一组失败不会再阻止另一组当前结果落地。历史刷新与显式周加载共享周计划 gate，只有最新 token 能提交 plans、forecast 或 planner error。
- `plannerBusy` 另用只覆盖显式周加载的版本号收尾：历史刷新可以使旧周数据 token 失效，但不会导致旧显式请求无法清除 busy；多个显式周请求重叠时也只有最后一个能清除。
- 自动回归先红于缺少 gate 模块，修复后 `latestRequest + app` 共 83/83、`npm run typecheck` 和定向 `git diff --check` 通过。
- 全新 Chrome 会话重复相同 1800 ms 场景：中间态和旧响应到达后的最终态都保持 7 月 20–26 日与 `搭配 #222`，控制台 0 error/0 warning。截图、隔离数据库、日志和复现脚本保存在 `output/playwright/planner-race-20260716/`。

### 已确认并修复：并发保存两张推荐卡会让晚响应劫持已打开的搭配编辑器
- `saveRecommendationOutfit()` 只用单个 `savingOutfitId` 标记当前卡片；`OutfitStage` 也只禁用 ID 相等的按钮，所以 A 保存未完成时 B 的“保存搭配”仍可点击。两个请求都会在完成后无条件 `setOutfitBuilderOutfit(saved)`。
- 真实 Chrome 通过两张模拟推荐卡和 3 秒/5.5 秒保存响应稳定复现：A 点击 80 ms 后 B 按钮仍为 enabled；A 返回时编辑器名称为“已保存 A”，用户改成“用户正在编辑 A”；B 晚到后同一输入框变成“已保存 B”，`userEditPreserved=false`。
- 这不只影响视觉 busy：两个保存都已提交，晚响应会切换编辑目标并触发 `OutfitBuilder` 初始化 effect，静默丢弃用户对先返回实体的未保存修改。保存与“安排日期”“实际穿了”还使用相互独立的单 ID 状态，理论上也可形成不同动作的重叠。
- 修复将保存、安排和实穿统一收敛为单个 `RecommendationCardAction`，并用同步 ref 在 React 重渲染前就拒绝第二次进入；完成时只允许持有同一 action token 的请求释放状态。
- `RecommendationView` 把生成/天气 busy 与卡片动作 busy 合并成 `interactionBusy`，传给所有 `OutfitStage`；所有候选卡的保存、安排、反馈、实穿、设为核心、替换，以及场合/天气/重新生成/清除核心入口都会同步禁用。App 处理函数另有 ref guard，避免脚本或陈旧 DOM 绕过 UI。
- 自动回归先在旧实现上得到两张卡 `actionBusy=[undefined, undefined]`，修复后目标测试 1/1、`tests/app.test.tsx + tests/latestRequest.test.ts` 相邻回归、`npm run typecheck` 与定向差异检查通过。
- 全新 Chrome 重放同一 3 秒/5.5 秒场景：A 保存后 80 ms，B 的保存按钮 `secondEnabled=false`；A 返回后用户输入“用户正在编辑 A”，等待所有延迟响应后仍保持该值，`userEditPreserved=true`、仅一个对话框，控制台 0 error/0 warning。脚本与修复前后截图保存在 `output/playwright/recommend-action-race-20260716/`。

### 已确认并修复：设置输入变化后旧推荐响应会复活已失效结果
- `requestRecommendations()` 没有请求版本或输入快照校验。推荐进行中时主导航仍可进入设置；`SettingsView` 的纬度、经度和保存按钮只针对自身动作局部禁用，用户可以修改推荐输入。
- 坐标输入会立即执行 `setWeather(null)` 与 `setRecommendations(null)`，但不会使在途推荐失效。旧请求先取得旧位置天气，再等待推荐响应；输入变更清空天气后，迟到的推荐结果仍会无条件写回。
- 真实 Chrome 将推荐响应延迟 3 秒：点击生成后进入设置，把坐标改为 `10.0000, 20.0000`；返回推荐页时 `staleReasonVisible=true`，界面同时显示“天气尚未获取”和“旧坐标推荐仍被写回”，形成内部自相矛盾状态。
- `createLatestRequestGate()` 新增显式 `invalidate()`；天气与推荐共享 gate。坐标、场合、画像、核心约束、availability 和反馈清空会使旧 token 失效，旧响应/错误均不能提交。
- 每个天气/推荐请求只在自身 token 仍为最新时提交状态，并以函数式更新仅清除与自己相同的 `busyAction`；输入变化可以立即取消界面 busy，而旧请求收尾不会把后续保存或定位动作误设为空闲。
- 设置页的定位和保存按钮在任一全局动作期间禁用，避免无输入变化时启动第二个互相覆盖 `busyAction` 的操作；文本输入仍可用于主动改变输入并使旧推荐失效。
- 红灯脚本、隔离会话和截图保存在 `output/playwright/recommend-input-race-20260716/`。同一 3 秒场景绿色复验得到 `staleReasonVisible=false`，页面保持“天气尚未获取 / 还没有推荐”；控制台 0 error/0 warning。

### 已确认并修复：迟到定位回调会覆盖定位期间的手工坐标
- `locate()` 调用 `navigator.geolocation.getCurrentPosition()` 后只禁用“定位”按钮，两个坐标输入仍可编辑；成功回调不检查用户是否在等待期间改变过输入。
- 真实 Chrome 将定位成功延迟 2 秒：定位后立即输入 `10.0000, 20.0000`，回调到达后字段被静默改为 `39.1234, 116.5678`，`manualInputPreserved=false`，并显示“位置已更新”。
- 定位使用独立 gate；任一手工坐标变化都会显式使当前定位 token 失效并只清除 `locate` busy。成功/失败回调提交前都检查 token，成功时也只清除自己的 busy。
- 同一 2 秒场景在整页重载后的干净实例中得到最终坐标 `10.0000, 20.0000`、`manualInputPreserved=true`；旧回调未写字段、本地存储或成功提示，控制台无 warning/error。
- 通用 gate 红测先失败于 `invalidate is not a function`，设置页全局动作红测先确认定位按钮仍 enabled；修复后相邻前端 4 文件 108/108、`npm run typecheck` 与定向差异检查通过。

### 已确认并修复：后台衣物更新会重置已打开的搭配编辑器草稿
- `OutfitBuilder` 的初始化 effect 依赖 `[activeGarments, props.garments, props.open, props.outfit]`。父组件任何衣物数组更新都会重新执行 `createBuilderDraft()`，覆盖名称、备注、收藏、slot、配饰、编辑模式、dirty 状态和校验。
- 这不是仅在切换编辑实体时发生：衣物状态、普通字段保存、刷新或启动阶段迟到读取都可能生成新数组。对话框仍打开、编辑目标 ID 未变时，用户草稿也会被当成“重新初始化”。
- 真实 Chrome 先发起 9 秒延迟的衣物 availability 更新，再保存推荐 A 打开编辑器并输入“用户正在编辑，等待衣物响应”；后台响应到达后名称恢复为“已保存 A”，`draftPreserved=false`、对话框仍为 1 个，控制台 0 error/0 warning。
- 新增纯函数 `outfitBuilderDraftIdentity()`，身份仅由对话框打开状态与 `SavedOutfit.id` 决定：关闭为 `null`、手工新建为 `new`、保存搭配为 `saved:<id>`。同 ID 即使对象或衣物数组换新也仍是同一编辑会话。
- 完整初始化 effect 用 ref 记录已初始化身份，只在首次打开、关闭后重开、手工/保存模式切换或目标 ID 变化时重建草稿；衣物数组更新仍可通过独立 effect 刷新未解决的不可用项，但不会覆盖名称、备注、收藏、slot 或 dirty。
- 身份 helper 红测先失败于函数不存在；修复后 `savedOutfitsUi + app` 96/96、`npm run typecheck` 与差异检查通过。
- 同一真实 Chrome 9 秒 availability 场景绿色复验：响应前后输入都保持“用户正在编辑，等待衣物响应”，`draftPreserved=true`、单一对话框，控制台 0 error/0 warning。证据脚本与修复前后截图保存在 `output/playwright/outfit-builder-reset-20260716/`。

### 已确认并修复：衣物事实变化后旧推荐仍继续显示
- `updateOne()`、`archiveOne()`、`restoreOne()`、`bulkConfirm()` 与 `bulkUpdate()` 会改变推荐的权威衣物集合或展示事实，但它们既不使在途推荐请求失效，也不清空当前 `recommendations`。
- 真实 Chrome 先生成含“白衬衫”的“推荐 A”，再到衣服库点击该衣物的“排除推荐”，返回今日推荐后旧卡片仍显示且仍包含“白衬衫”：`staleRecommendationVisible=true`、`excludedGarmentVisible=true`。
- 缺陷不仅影响 `excluded`：归档、恢复、确认、季节、标签、名称、分类、颜色、保暖度、风格、正式度等通用更新都可能让当前推荐与权威衣橱冲突；迟到的在途推荐还可能在清空后重新写回。
- 推荐请求失效入口现同时取消最新请求 token、清空当前结果与实穿反馈；衣物事实变更统一复用该入口。导入会清空全部核心/排除约束，单件和批量的资格/类别变更只移除受影响衣物 ID，名称与标签等不影响约束合法性的编辑不会误删核心选择。
- 覆盖入口包括导入、通用编辑、归档/恢复、批量确认/更新、单件/批量可用状态、手工建档、缩略图刷新/选择和去背景；更新失败不会把未成功的资格变更当作已提交。
- 自动回归先红于 `garmentPatchAffectsRecommendationConstraints is not a function`，修复后 `tests/app.test.tsx` 84/84、`npm run typecheck` 与定向差异检查通过。
- 真实 Chrome 绿色复验覆盖两条路径：已显示的“推荐 A”在排除“白衬衫”后立即清空；推荐响应延迟 1.8 秒时，排除动作使迟到结果无法复活。两者都显示“还没有推荐”，控制台 0 error/0 warning。红绿脚本与截图保存在 `output/playwright/wardrobe-recommendation-stale-20260716/`。

### 已确认并修复：桌面分栏把推荐空态正文挤成竖列
- 通用 `.ui-empty` 使用“图标 / `minmax(0,1fr)` 正文 / 操作”三列。推荐页进入 38%/62% 分栏后，右侧空态还要同时容纳长按钮，正文轨道可被压到约百余像素；真实桌面截图中标题断成“还没有推 / 荐”，说明几乎每 4 个汉字换行。
- 推荐空态现局部改为“图标 + 正文”两列，操作按钮放到正文下方第二行；不改变衣橱等其他通用空态。
- 640px 以下显式恢复单列，并沿用通用规则让操作区和按钮占满可用宽度，避免更高优先级的推荐页选择器覆盖移动端响应式。
- CSS 回归先红于推荐空态没有 `grid-template-columns`；修复后 App 85/85、类型检查与差异检查通过。
- 真实 Chrome 在 1440px 下测得正文宽 489.9px、操作位于正文下方；390px 下为单列，正文/操作/按钮宽均 278.3px。桌面与移动截图均无异常换行，控制台 0 error/0 warning，证据保存在 `output/playwright/wardrobe-recommendation-stale-20260716/fixed-empty-layout-*.png`。

### 已确认并修复：迟到的衣橱刷新会覆盖更晚且已保存的单件编辑
- `refreshGarments()` 对 active/archived 两个 GET 没有请求版本；`updateOne()` 虽然对同一衣物的 PUT 串行并用版本保护响应，却不会使已经在途的衣橱 GET 失效。
- “刷新衣橱”按钮也不会在单件更新期间禁用，因此用户可先启动刷新，再点击确认/拥有/排除或编辑字段。
- 真实 Chrome 将刷新 GET 固定在编辑前的 `excluded=false` 快照，随后 PUT 成功且权威状态为 `true`；乐观 UI 先显示“已排除推荐”，释放旧 GET 后又回到“排除推荐”：`optimisticExcluded=true`、`finalExcluded=false`、`staleRefreshWon=true`，而 mock 权威值仍为 `true`。
- 增加独立 `garmentRequestGate`：每次 active/archived 成对读取取得同一 token，只有最新请求能同时提交两组列表或读取错误，避免新旧 active/archived 混合。
- 统一衣橱变更入口现在也使旧读取 token 失效，因此单件编辑、归档/恢复、导入、批量更新、可用状态、建档和图片变更都不会被先前刷新覆盖。
- 自动回归先红于 `invalidateWardrobeRecommendations()` 未调用 `garmentRequestGate.invalidate()`；修复后 App 85/85、类型检查与差异检查通过。
- 同一真实 Chrome 控制释放顺序后，旧 GET 到达时 UI 仍保持“已排除推荐”：`finalExcluded=true`、`staleRefreshWon=false`、权威值为 true，控制台 0 error/0 warning。红灯结构化结果、复现脚本和绿色截图保存在 `output/playwright/garment-refresh-race-20260716/`。

### 已确认并修复：启动阶段的旧价值洞察会覆盖更晚刷新结果
- `refreshHistoryData()` 以 `void refreshValueInsights()` 启动价值洞察，因此外层历史刷新和启动 bootstrap 不等待它；`refreshValueInsights()` 自身也没有请求 token，任意响应、错误和 finally 都会直接提交。
- 开发环境 StrictMode 下启动 effect 可产生多个价值洞察请求；即使不考虑 StrictMode，启动请求未被 bootstrap 等待也允许用户在它完成前手动刷新。
- 真实 Chrome 挂起启动阶段旧响应（`knownPriceCount=1`），随后刷新显示新响应（`knownPriceCount=2`）；释放旧请求后界面退回 1 件：`staleValueVisible=true`、`newerStillVisible=false`，控制台无 warning/error。
- 新增独立 `valueInsightsRequestGate`；成功结果、错误和 finally 都先检查 token，旧请求不能改写数据、错误或 loading。价值洞察仍保持独立 loading，不阻塞其余历史和启动数据可用。
- 自动回归先红于 `refreshValueInsights()` 未调用 gate；修复后 App 86/86、类型检查与差异检查通过。
- 同一真实 Chrome 释放启动旧响应后仍显示“价格已知 2 件”，`staleValueVisible=false`、`newerStillVisible=true`；旧请求挂起时和最终 `aria-busy` 都为 null，控制台 0 error/0 warning。红绿结构化结果与截图保存在 `output/playwright/value-insights-race-20260716/`。

### 已确认并修复：保存设置的迟到响应会覆盖保存期间的新画像输入
- `saveSettings()` 把当前画像发往 `PUT /api/profile`，响应完成后无条件 `setProfile()`；但设置页仅禁用定位和保存按钮，纬度、经度及 9 个画像字段仍可编辑。
- 真实 Chrome 将画像保存响应挂起：请求快照为身高 176，等待期间把仍启用的身高输入改为 180，释放响应后字段回退到 176，同时页面仍显示“设置已保存在本机”。结果为 `inputEnabledDuringSave=true`、`userEditPreserved=false`，控制台无 warning/error。
- 这会同时造成两种误导：画像新输入被静默丢失；坐标虽然不会被响应覆盖，但保存开始时已写入本地存储，等待期间的新坐标会留在界面却未持久化，成功提示仍宣称当前设置已保存。
- 设置页现只在 `busyAction === "save-settings"` 时禁用两项位置和九项画像字段；天气、推荐、定位等其他动作期间仍可编辑，因此不会破坏“改输入即取消旧异步结果”的既有交互。
- 父组件增加同步 `settingsSaveInProgress`：保存入口拒绝重入，三个位置/画像更新处理函数也拒绝渲染间隙中的直接回调；finally 只清除仍属于自身的 `save-settings` busy。
- 自动回归先红于字段未锁定，修复后 App 87/87、类型检查与差异检查通过。相同 Chrome 场景下 11/11 字段均禁用，填值尝试被阻止，保存结束后恢复可编辑，控制台 0 error/0 warning。红绿结果、脚本和截图保存在 `output/playwright/settings-save-race-20260716/`。

### 已确认并修复：批量衣物部分成功后前端保留错误的旧状态
- `bulkConfirm()` 与 `bulkUpdate()` 使用 `Promise.all()`；任一请求先失败就立即进入 catch，但同批其他请求不会被取消，仍可能随后成功落库。
- `bulkConfirm()` 的 catch 完全不刷新衣橱；`bulkUpdate()` 虽刷新，却可能在其余 PUT 尚未 settle 时过早读取，因此两者都不能可靠恢复权威状态，也不会只保留失败项供重试。
- 真实 Chrome 同时确认“白衬衫”和“黑长裤”：第二件立即返回 500，第一件 450 ms 后成功。最终 mock 权威状态中白衬衫已确认，界面仍显示“确认衣物”，且批量栏继续显示“已选择 2 件”：`uiMatchesAuthority=false`。
- 新增 `settleMutations()`：把同步异常也转换为单项 rejection，等待所有异步变更完成后按原输入顺序返回成功项、失败项和失败原因。
- 批量确认与通用批量更新现在都在全部请求 settle 后刷新衣橱；成功项从选择中移除，失败项保留以便重试，部分成功同时显示成功数量与失败原因。推荐约束只按真正成功的更新清理。
- 通用 settle 与 App 接线测试先红后绿，目标 2 文件 90/90；相邻 Wardrobe 前端 20/20、类型检查与差异检查通过。
- 同一 Chrome 场景中白衬衫刷新为“已确认”且取消选择，失败的黑长裤保持待确认和选中，批量栏为“已选择 1 件”，`uiMatchesAuthority=true`，除预期 500 网络消息外无控制台异常。红绿证据位于 `output/playwright/bulk-garment-partial-failure-20260716/`。

### 已确认并修复：迟到的保存搭配刷新会覆盖更晚的收藏更新
- `refreshSavedOutfits()` 并发读取 active/archived 后无版本检查直接 `setSavedOutfits()`；收藏、编辑、创建、归档和替换版本则通过局部 `upsertSavedOutfit()` 更新同一数组。
- 历史页顶部刷新只设置全局 `busyAction=history`，保存搭配面板却只接收 `savedOutfitBusy`，因此刷新过程中收藏按钮仍可操作；这让旧 GET 与新 PUT 可以合法并发。
- 真实 Chrome 固定刷新前的 `favorite=false` 快照，随后收藏 PUT 成功并让权威状态变成 true；释放旧 GET 后按钮又从“取消收藏”退回“收藏”：`staleRefreshWon=true`、`uiMatchesAuthority=false`，控制台无 warning/error。
- 保存搭配现使用独立最新请求 gate；active/archived 成对读取只有当前 token 能提交结果或错误。所有创建、编辑、收藏、归档和替换成功最终都经过 `upsertSavedOutfit()`，该入口先失效旧读取再提交局部权威响应。
- App 自动回归先红后绿至 89/89，相邻保存搭配 UI 13/13、类型与差异检查通过。
- 同一 Chrome 场景中释放旧 GET 后仍保持“取消收藏”，`staleRefreshWon=false`、`uiMatchesAuthority=true`，控制台 0 error/0 warning。红绿证据位于 `output/playwright/saved-outfit-refresh-race-20260716/`。

### 已确认并修复：较早的模型状态刷新会覆盖较新的刷新结果
- `refreshVisionModels()` 对每次 `GET /api/vision/models` 都直接提交结果或把状态置空，没有请求版本；设置页“刷新模型”按钮也不会进入 busy，可连续发起请求。
- 真实 Chrome 将第一次手动刷新挂起，第二次刷新先返回“新状态已可用”；释放较早响应后页面退回“旧状态未下载”：`staleStateVisible=true`、`newerStatePreserved=false`，控制台无 warning/error。
- 同一写入点还被启动加载、模型下载后刷新和验证后刷新共享，因此乱序不只来自双击；旧错误也可能把新状态清空。
- 模型状态读取现使用独立最新请求 gate；成功结果和 catch 置空都只由当前 token 提交，启动、手动刷新、下载后刷新与验证后刷新共享同一顺序。
- App 回归先红后绿至 90/90，类型与差异检查通过；同一 Chrome 双刷新场景释放旧响应后仍显示“新状态已可用”，`staleStateVisible=false`、`newerStatePreserved=true`，控制台 0 error/0 warning。红绿证据位于 `output/playwright/vision-model-refresh-race-20260716/`。

### 已确认并修复：启动阶段迟到的个人画像读取会覆盖用户编辑
- `refreshProfile()` 无请求版本，成功、失败都会直接修改 `profile/profileLoaded`。开发 StrictMode 会并发两次启动读取；生产环境的 10 秒启动降级也允许单个慢请求未完成时先进入应用。
- 真实 Chrome 将第一次启动 GET 挂起，第二次先返回身高 176 并放行界面；用户改成 180 后释放旧响应 170，输入框被静默改回 170：`userEditPreserved=false`，控制台无 warning/error。
- 该竞态还可能与设置保存交叉：旧 GET 若晚于保存响应完成，同样能覆盖刚保存的画像并错误改变 `profileLoaded`。
- 画像读取现使用独立最新请求 gate，成功画像、`profileLoaded` 和错误都只由当前 token 提交；画像编辑及通过校验后的保存开始会显式失效所有旧读取。
- App 回归先红后绿至 91/91，类型与差异检查通过；同一 Chrome 双启动请求场景中释放旧 170 响应后输入仍为 180，`userEditPreserved=true`，控制台 0 error/0 warning。红绿证据位于 `output/playwright/profile-refresh-race-20260716/`。

### 已确认并修复：可用状态旧响应会覆盖同一衣物更晚的通用编辑
- `POST /api/garments/:id/availability` 的服务端事务只更新 `availability_status` 和更新时间，但响应返回完整 `Garment`；前端 `changeGarmentAvailability()` 又把该完整快照合并回 active/archived 数组。
- 衣物卡片只禁用正在提交的 availability 下拉框，确认、拥有、排除推荐和编辑器仍可操作；这些通用更新经 `updateOne()` 使用另一套 per-ID 队列/版本，无法约束 availability 响应。
- 真实 Chrome 先让 availability 请求在权威状态已变为 `repair` 后挂起其 `excluded=false` 响应快照，再成功提交更晚的“排除推荐”，权威状态成为 `{ availabilityStatus:"repair", excluded:true }`。释放旧 availability 响应后，页面从“已排除推荐”退回“排除推荐”，但状态仍显示维修中。
- 结构化结果为 `editEnabledDuringAvailability=true`、`authoritativeExcluded=true`、`finalExcluded=false`、`staleAvailabilityResponseWon=true`、`uiMatchesAuthority=false`，控制台 0 error/0 warning。
- 新增 `createKeyedSerialQueue()`：同一键严格串行，不同衣物仍可并行；前一项失败会被队列尾吸收而不阻塞后续操作，队列空闲后自动释放键。
- `updateOne`、归档/恢复、批量确认/更新、单件/批量 availability、手工图片上传、缩略图选择、抠图和视觉标签现在全部共享 per-garment 队列。每次调用还递增该衣物版本；通用或专用接口返回的完整 DTO 只有在仍为当前版本时才能同时提交 active/archived 数组。
- 若当前最新写入失败，会重新读取 active/archived 权威状态再展示错误；较旧失败不会回滚或覆盖后续写入。`updateOne` 也会同步更新归档数组，覆盖“编辑在途时被归档”的交叉路径。
- 自动回归先在旧实现上失败于 `updateOne` 未使用公共队列；修复后 App 与队列专项 94/94，相邻前端 45/45、`npm run typecheck` 与 `git diff --check` 通过。
- 同一真实 Chrome 释放顺序下，旧 availability 响应不再提交，后续通用 PUT 才开始并返回包含两项权威变化的 DTO；最终 `finalExcluded=true`、`finalAvailability="repair"`、`staleAvailabilityResponseWon=false`、`uiMatchesAuthority=true`，控制台 0 error/0 warning。红绿结果与截图保存在 `output/playwright/garment-cross-endpoint-race-20260716/`。

### 已确认并修复：旧导入预览会在原始 JSON 改变后复活并允许提交
- `previewImport()` 对 `importText` 做一次 `JSON.parse` 后发起异步预览，但没有输入版本或请求 token；`updateImportText()` 虽会清空当前预览和决策，却不能阻止在途旧响应重新写回。
- 原始 JSON 文本框只在购买检查期间禁用，预览请求挂起时仍可编辑。这本身是合理的取消式交互，但当前实现没有把编辑视为旧预览失效信号。
- 真实 Chrome 挂起旧 JSON 预览，随后把文本改成完全不同的新 JSON；旧响应释放后页面重新显示“旧预览衬衫”，并启用“提交选择”，而文本框仍是新 JSON。
- 结构化结果为 `inputEnabledDuringPreview=true`、`finalTextMatchesNew=true`、`stalePreviewVisible=true`、`submitEnabled=true`、`stalePreviewMatchesCurrentInput=false`，控制台 0 error/0 warning。
- 服务端会重新归一化并校验来源键，明显不匹配通常会被拒绝，但前端已向用户展示并允许提交与当前输入不一致的审核结果；若新旧内容保留相同稳定键，错误审核还可能更隐蔽。红灯证据位于 `output/playwright/import-preview-race-20260716/`。
- 导入预览现使用独立 latest-request gate；原始 JSON 编辑、读取新采集产物以及正式导入开始都会失效在途旧预览。预览结果、错误和 busy 收尾均只允许当前 token 提交，旧请求无法复活候选或错误状态。
- 正式导入期间会锁定原始 JSON、模式切换、候选决策和其他导入动作，保证不可取消的提交使用稳定快照；预览期间仍允许编辑 JSON 或读取新产物，以显式取消旧预览。
- TDD 回归先在旧实现上失败；修复后 App、导入审阅和决策支持 UI 共 108/108，`npm run typecheck` 与 `git diff --check` 通过。
- 同一真实 Chrome 释放旧预览响应后，页面仍保留新 JSON，未显示“旧预览衬衫”，且“提交选择”保持禁用；结构化结果为 `stalePreviewVisible=false`、`submitEnabled=false`、`stalePreviewMatchesCurrentInput=true`，控制台 0 error/0 warning。红绿结果、脚本与截图保存在 `output/playwright/import-preview-race-20260716/`。

### 已确认并修复：跨衣物视觉任务互相覆盖 busy 状态并提前解锁
- `cutoutGarment()` 与 `analyzeVisionTags()` 共用单例 `visionBusyId` 和全局单例 `busyAction`。不同衣物可以并行进入 keyed queue，但后启动任务会覆盖前一件衣物的 ID/动作；任一任务完成又会无条件把两个单例清空。
- `GarmentItem` 只在 `visionBusyId === item.id` 时禁用视觉按钮；因此第二件衣物开始后，第一件仍在途的按钮立即恢复可用。第一件先完成时，第二件仍挂起的按钮也恢复为普通文案并可再次触发。
- 真实 Chrome 使用只读 GET 夹具临时展示第二件衣物，并拦截两条 `POST /api/garments/:id/cutout`，未写真实数据库。两条请求均挂起时得到 `firstEnabledAfterSecondStart=true`；只释放第一条后，第二条仍 pending，但 `secondEnabledAfterFirstSettles=true`、文案为“去背景”。
- 该竞态不会绕过同一衣物写队列，但会错误表达任务状态、允许重复排队昂贵的本地视觉进程，并让全局 `busyAction` 在不同页面上产生与实际任务不一致的锁定/解锁。控制台 0 error/0 warning；红灯脚本、结构化结果和截图位于 `output/playwright/vision-busy-race-20260716/`。
- 新增 `GarmentVisionAction`，并以 `ReadonlyMap<garmentId, action>` 记录每件衣物的视觉任务；开始和收尾只设置或删除自己的键，动作不匹配的旧收尾不能清除后来任务。
- 衣物视觉操作不再占用全局 `busyAction`。`WardrobeView` 将每件衣物自己的动作传给 `GarmentItem`，同一衣物的去背景与分析按钮共同禁用，并分别显示“处理中”或“分析中”。
- TDD 先以源代码约束和双衣物组件行为得到 2 个红灯；修复后 App 96/96，相邻 6 个前端文件共 166/166、`npm run typecheck` 与 `git diff --check` 通过。
- 同一真实 Chrome 释放顺序下，两条请求挂起时第一件不会被第二件解锁；只释放第一条后，第二条仍为“处理中”且不可点击。结构化结果为 `firstEnabledAfterSecondStart=false`、`secondEnabledAfterFirstSettles=false`、`busyStateMatchesPendingRequests=true`，控制台 0 error/0 warning；绿色结果与截图保存在同一证据目录。

### 已确认并修复：跨衣物可用状态请求只能标记一个 busy ID
- `changeGarmentAvailability()` 使用单例 `availabilityBusyGarmentId`。第二件衣物开始更新时会覆盖第一件 ID，导致第一件请求仍在途但下拉框立即恢复可操作。
- 该函数的 finally 使用 `current === id ? null : current`，所以较早请求完成不会误清较新的第二件；缺陷集中在多个并行 ID 无法同时表达，而不是收尾顺序。
- 真实 Chrome 使用只读双衣物夹具并拦截两条 `POST /api/garments/:id/availability`。两条请求均 pending 时，`firstBusyAfterStart=true` 但 `firstEnabledAfterSecondStart=true`；第二件仍正确保持禁用，控制台 0 error/0 warning。
- 同一衣物写队列保证数据顺序，但提前解锁会允许用户在旧状态尚未确认时继续排队修改，且 UI 的 `aria-busy` 与真实网络状态不一致。红灯脚本、结果和截图位于 `output/playwright/availability-busy-race-20260716/`。
- availability busy 现改为 `ReadonlySet<garmentId>`；开始操作复制集合并添加自身 ID，finally 只删除自身 ID，不会覆盖或清除其他衣物的在途状态。
- `WardrobeView` 按 ID membership 向每个 `GarmentItem` 传递布尔 busy，`AvailabilityMenu` 因而能同时禁用任意数量的在途下拉框并维持正确 `aria-busy`。
- TDD 先以处理函数约束和双衣物组件行为得到 2 个红灯；修复后 App 98/98，相邻 6 个前端文件共 168/168、`npm run typecheck` 与 `git diff --check` 通过。
- 同一真实 Chrome 释放顺序下，两条请求同时 pending 时第一件不再被第二件解锁；只释放第一条后，第二件仍禁用。结构化结果为 `firstEnabledAfterSecondStart=false`、`secondEnabledAfterFirstSettles=false`、`busyStateMatchesPendingRequests=true`，控制台 0 error/0 warning；绿色结果与截图保存在同一证据目录。

### 已确认、待修复：全局 BusyAction 可重叠并由较早任务提前清空
- `busyAction` 是全应用单例，但多个入口直接 `setBusyAction(action)`，且采集、读取产物、批量 availability、缩略图、模型任务、历史刷新和导出等 finally 仍无条件 `setBusyAction(null)`。组件也不总是以 `props.busy` 禁用同页其他全局动作。
- 穿搭历史页的刷新按钮只在 `busyAction === "history"` 时禁用，两个导出按钮只在导出类型时禁用；因此刷新 pending 时仍可启动导出。导出覆盖 action 后，刷新按钮又恢复可用；刷新先结束则无条件清空导出 busy。
- 真实 Chrome 拦截 `/api/insights` 与 `/api/export`：得到 `exportEnabledDuringRefresh=true`、`refreshEnabledDuringExport=true`、`bothRequestsPending=true`；只释放刷新后，导出请求仍 pending，但按钮已恢复“导出 JSON”且可点击。
- 该问题会允许重复启动昂贵操作、让 `aria-busy` 与网络状态分叉，并可能让不可重入的提交/下载在错误的“空闲”界面中再次触发。控制台 0 error/0 warning；红灯脚本、结果和截图位于 `output/playwright/global-busy-race-20260716/`。

### 2026-07-16 断点恢复确认
- session catchup 报告 37 条未同步消息；逐项核对后，内容属于暂停问答、技能恢复和只读检查，没有遗漏的产品代码编辑。
- 当前 Git 差异为 59 个跟踪文件、3822 行新增与 392 行删除，另有既有 Playwright 证据和本轮新增 helper/测试；未执行 reset、checkout、clean 或文件删除。
- 隔离 QA 的 Vite/API 仍分别监听 5174/8788，可直接用于全局 BusyAction 修复后的同场景复验；真实项目数据库仍不在本轮浏览器证据范围内。
- 精确续作点是：先为全局动作建立同步互斥与动作匹配释放，再统一 History/导出等入口对全局 busy 的禁用语义。

### 全局 BusyAction 暂停前静态盘点
- `src/app/App.tsx` 的单例状态位于约 630 行；`import`、批量确认/更新、定位、天气、推荐和设置保存已有部分“动作匹配后释放”，但采集订单、采集商品、读取产物、批量 availability、补图、视觉模型下载/验证、历史刷新及两种导出仍无条件清空。
- 单纯把所有 `finally` 改成动作匹配不足以阻止同一 React render 间隙内的同步双进入；修复需要同步 ref/helper 在设置 state 前原子取得全局动作锁。
- `HistoryInsightsView` 目前分别以 `busyAction === "history" | "export" | "export-complete"` 判断按钮，只禁用自身动作；应让刷新与两种导出在任一全局动作存在时互斥，同时保留当前动作的文案。
- `WardrobeView`、`ImportView`、`SettingsView` 也有只检查特定 action 的按钮；恢复后应先建立统一锁语义，再逐入口审查是否应该尊重 `props.busy`，避免过度锁定本来按实体并行的视觉/availability 操作。
- 暂停前没有对这些产品文件或测试文件实施编辑。
- 暂停时已核对 PID 1724/29876 为本项目 `tsx server/index.ts` 进程链、PID 43356 为本项目 Vite 5174；关闭后 5174/8788 监听数和三个目标进程数均为 0。

### 全局 BusyAction 修复设计（恢复后确认）
- `BusyAction` 枚举覆盖导入、采集、批量衣橱、模型、设置、历史、导出、天气和推荐，且父组件把 `Boolean(busyAction)` 作为多个页面的全局 busy 传递；其既有架构语义就是“同一时刻至多一个全局动作”，不是允许覆盖的最近动作标签。
- `HistoryInsightsView` 的根节点已经以 `props.busy` 设置 `aria-busy`，但刷新只看 `history`，两个导出按钮只看两个导出 action，因此视觉语义与可操作性发生分叉。
- 采用一个同步、可测试的独占动作锁：`tryAcquire(action)` 只有空闲时成功，`release(action)` 只有持有者匹配时成功；React state 只作为渲染镜像。这样可同时阻止同一渲染间隙的双进入，并阻止旧任务 finally 释放后来动作。
- App 层统一通过 `tryStartBusyAction()` / `finishBusyAction()` 操作锁与 state；输入变化对可取消动作也必须调用匹配释放 helper，不能只清 React state 而留下锁。
- 第一批验收测试应覆盖：锁拒绝第二动作、错误动作不能释放、正确释放后可重新取得；History 在任一全局 busy 下同时禁用刷新、JSON、完整备份及管理反馈。
- 现有 `tests/app.test.tsx` 已通过 `namedFunctionSource()` 对请求 gate、队列和 busy 接线做结构约束，适合增加“每个全局动作入口调用 `tryStartBusyAction`，不再直接写 `setBusyAction`”的防回归检查。
- 需要迁移的直接入口至少包括导入提交/预览、两种采集、读取产物、批量确认/更新/availability、补全缩略图、模型下载/验证、定位、天气、推荐、设置保存、历史刷新及两种导出。
- `invalidateImportPreviewRequest()`、`invalidateRecommendationRequest()`、`invalidateLocationRequest()` 是合法的主动取消路径；它们必须通过匹配释放 helper 同步清锁。请求 finally 即使因 request token 失效而跳过，也不能留下锁。
- 纯实体级并行状态（每件衣物视觉、单件 availability、手工建档、保存搭配等）不属于 `BusyAction`，不应被错误收敛进全局锁。
