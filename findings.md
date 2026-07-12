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
