# Outfit

Outfit 是一个本地优先的穿搭管理与推荐工具。它从淘宝订单页或商品详情页采集服饰候选，导入到本地 SQLite 衣橱库，再结合天气、场合、最近穿着记录生成可解释的搭配建议。

项目当前定位是个人本地应用，不是多用户账号系统，也不是云端导购平台。淘宝采集、衣橱数据、推荐历史默认都保存在本机工作目录下。

## 技术栈

- 前端：React + Vite + TypeScript
- 后端：Express + Node 内置 `node:sqlite`
- 数据库：`data/outfit.sqlite`
- 采集：订单页使用 Python + Selenium；商品详情默认 Selenium，可通过 Playwright 切换；采集任务输出 JSON 到 `output/taobao-captures/<jobId>`
- 天气：Open-Meteo API，失败时回退到本地估算天气

## 环境要求

- Node.js 24 或更新版本。后端依赖 `node:sqlite`，旧版 Node 可能无法启动。
- npm
- Python 3.13 或兼容版本
- Chrome 浏览器。运行 Selenium 或 Playwright 淘宝采集时需要。

安装依赖：

```powershell
npm ci
python -m pip install -r requirements.lock.txt
python -m pip install pytest
```

## 启动方式

同时启动 API 与前端：

```powershell
npm run dev
```

默认地址：

- 前端：`http://127.0.0.1:5174`
- API：`http://127.0.0.1:8788`

单独启动：

```powershell
npm run dev:web
npm run dev:api
```

生产式本地启动 API：

```powershell
$env:PORT = "8788"
npm run start
```

前端开发服务器会把 `/api` 代理到 `http://127.0.0.1:8788`。

API 首次打开项目支持的、尚无 `schema_migrations` 的 M0 前数据库时，会先用 legacy baseline 0 将其归一并登记版本 0，再顺序执行编号迁移；已经版本化的数据库会直接校验迁移前缀并继续执行尚未应用的编号迁移。当前编号版本为 4（`recommendation-candidates`、`trusted-ingestion`、`saved-outfits`、`feedback-availability`）。每个迁移独立事务执行，只支持前向修复；重复启动不会重复应用已登记迁移。由更新版本应用迁移过的数据库不能交给更旧版本代码继续写入。

## 测试与构建

Node/TypeScript 测试：

```powershell
npm test
```

类型检查、依赖审计与构建：

```powershell
npm run typecheck
npm run lint
npm run audit:prod
npm run build
```

Python 采集脚本测试：

```powershell
python -m pytest -q
```

GitHub Actions 会执行 Node 测试、类型检查、构建、npm audit、Python pytest 和 Python 依赖审计。

## 淘宝采集与导入流程

### 方式一：应用内启动 Selenium 订单采集

1. 运行 `npm run dev` 并打开前端。
2. 进入「导入淘宝订单」。
3. 点击「采集订单页」。
4. 在弹出的 Chrome 中登录淘宝或处理验证。
5. 应用会创建一个采集任务，任务产物写入 `output/taobao-captures/<jobId>`。
6. 回到应用点击「读取产物」，如果本次会话已有采集任务，应用会按 `jobId` 读取该任务产物；旧版“读取最新 JSON”接口仍保留作兼容。
7. 点击「预览」可先查看候选衣物、退款项、非服饰项、重复项和自动分类置信度。
8. 点击「导入」写入本地 SQLite。

等价 CLI：

```powershell
python scripts/taobao_order_selenium_capture.py --max-pages 3 --login-wait 60
```

### 方式二：应用内启动商品详情采集（默认 Selenium，可切换 Playwright）

1. 在「导入淘宝订单」中粘贴淘宝或天猫商品详情 URL。
2. 在「采集引擎」中选择 `Selenium` 或 `Playwright`，默认是 `Selenium`。
3. 点击「采集商品详情」。
4. 在 Chrome 中登录或处理验证。
5. 应用会创建一个采集任务，任务产物写入 `output/taobao-captures/<jobId>`。
6. 点击「读取产物」「预览」和「导入」。

等价 CLI：

```powershell
python scripts/taobao_selenium_capture.py --url "https://item.taobao.com/item.htm?id=..." --login-wait 60
```

前端选择的采集引擎会随任务请求发送给 API。若请求中没有传 `engine`，商品详情采集默认继续使用 Selenium；也可以在启动 API 前设置默认引擎：

```powershell
$env:OUTFIT_TAOBAO_ITEM_CAPTURE_ENGINE = "playwright"
npm run dev
```

Playwright 等价 CLI：

```powershell
node scripts/taobao_playwright_capture.mjs --url "https://item.taobao.com/item.htm?id=..." --login-wait 60
```

Playwright 使用独立 profile：`output/playwright-taobao-profile`。该目录可能包含淘宝登录态，已随 `output/` 被 Git 忽略。Codex 的 Playwright skill 只用于开发调试辅助，不是 Outfit 应用运行时依赖。

### 方式三：书签脚本采集

1. 在应用中复制「Outfit 淘宝采集」书签脚本。
2. 在浏览器中新建书签，把脚本放入书签地址。
3. 打开淘宝订单页或商品详情页后点击该书签。
4. 脚本会把采集 JSON 复制到剪贴板；如果剪贴板不可用，会弹出可复制的文本框。
5. 将 JSON 粘贴到应用的「采集 JSON」文本框，先生成预览，逐项确认或修正后再提交导入。

## 导入规则

- 输入必须是 `TaobaoCapturedBatch`，并包含 `items` 数组；服务端会在预览和提交时分别校验顶层、枚举、数量/金额、文本长度及详情嵌套数组，畸形字段返回结构化 400，不会进入写事务。
- 新来源使用包含规范化 `orderId + itemId/URL + SKU` 的 `v2:<sha256>` 身份键，不同订单的同商品同 SKU 不会合并。历史 legacy key 只有在 `orderId + itemId + SKU` 全部一致时才会原位升级为 v2；legacy/v2 双记录冲突返回 409 并保持事务不落库。
- 退款或售后事件不会在读取采集产物时消失；预览会显示退款同步候选，用户可决定是否同步状态，但不能借此改写衣物字段。
- 当前自动衣橱导入会为 `top`、`bottom`、`dress`、`outerwear`、`shoes`、`accessory` 创建衣橱草稿；配饰在推荐中作为可选增强项，不作为完整搭配的必需核心单品。
- 导入预览不会写入数据库，可用于在正式导入前检查自动分类、置信度、重复项和跳过原因。
- 商品详情采集可以补充品牌、商品名、详情图、参数和描述；后导入的详情会合并到已购 SKU。
- 淘宝导入创建的衣物默认 `confirmed=false`；重复导入不会把用户已经确认的衣物重新设为未确认。导入后的条目可以在应用中确认、编辑、排除或标记为未拥有。
- `POST /api/garments` 先以 JSON 创建不关联淘宝来源的手工衣物，服务端固定写入 `owned=true`、`confirmed=true`、`excluded=false`；随后可用 `PUT /api/garments/:id/image` 上传不超过 5 MB 的 JPEG、PNG 或 WebP，本地服务会净化并统一重编码为无原始元数据的 WebP。通用 `PUT /api/garments/:id` 不接受 `imageUrl`，图片只能走这些受控专用路径。
- 推荐及替代单品只使用同时满足 `owned=true`、未归档、`confirmed=true`、`excluded=false`、`availabilityStatus=available` 的衣物。待洗、维修中、借出或已装箱衣物仍保留在衣服库与历史中，但会被候选硬过滤；无法组成连衣裙或“上装＋下装”核心时，响应会通过 `missingSlots` 和 `missingSlotDetails[].unavailableCount` 说明缺口与不可用数量。
- 衣服库和推荐卡片默认只加载本地 `/api/garment-thumbnails/...` 或 `/api/garment-assets/...` 图片，本地去背景图和缩略图始终优先。用户可在“设置 → 图片隐私”中显式开启本次会话加载淘宝远程图；该选择只保存在 `sessionStorage`，新会话恢复为关闭。开启后浏览器会直接请求通过校验的 HTTPS 淘宝 CDN 图片，可能暴露 IP 与 User-Agent；其他远程域名仍不会加载。

## 推荐边界与稳定身份

- 推荐按“核心组合 → 外套 → 鞋履 → 配饰”分层生成。默认一次最多评估 20,000 个中间候选，每层最多保留 120 个 beam 状态；超出预算时使用确定性均匀采样。因此结果是有界、可解释的启发式选择，不宣称全局最优。
- 每次推荐响应包含数据库 `runId`。每套候选的 `candidateId` 是全局唯一 UUID，兼容字段 `id` 当前与 `candidateId` 相同。
- `outfitSignature` 是完整衣物组合的稳定 SHA-256 内容签名；相同组合跨 run 保持一致，但天气、场合、rank 和评分仍属于各自的 run/candidate 快照。
- `includeGarmentIds` 可锁定必须出现的核心单品，`excludeGarmentIds` 可显式排除衣物；失效、未确认、已归档、当前不可用或互相冲突的 ID 会返回逐项结构化错误（不可用 reason 为 `UNAVAILABLE`），不会静默忽略。
- 每套候选的 `replacements` 按目标衣物给出完整新搭配、匹配度变化和理由；被锁定的核心单品不会被建议替换。

## 推荐反馈与可用状态

- 推荐卡的喜欢、不喜欢、评分与“实际穿了”都按稳定 `candidateId` 保存；打开反馈框会读取已有评分、原因和评论，再次提交会更新原反馈并重算组合统计，不会重复加权。`actuallyWorn=true` 首次写入时会与对应穿着记录在同一事务提交；一旦存在关联穿着记录，该事实不能被后续 `actuallyWorn=false` 撤销，并继续与“改穿保存搭配”互斥。评分与评论可以显式清空，但清空后不能留下完全无信号的空反馈。
- 衣物状态为 `available`、`laundry`、`repair`、`loaned`、`packed`。状态更新与 `garment_availability_events` 历史在同一事务写入；重复设置当前状态不追加事件。“标记已穿”不会自动把衣物改为待洗。
- 学习信号是 `likes + 2*wornCount - 2*dislikes`，置信度为 `min(1,totalFeedback/5)`；`totalFeedback` 包含 skipped、仅评分等每条候选反馈。单对衣物少于 3 条证据时只记录、不调权；达到阈值后每对最多贡献 -4…+4，整套通过 `scoreBreakdown.learnedPreference` 单列并限制在 -8…+8。
- 清空反馈支持全部、指定候选和按 `updatedAt` 日期闭区间三种范围。界面必须先调用 `GET /api/recommendation-feedback/clear-preview` 展示反馈条数与受影响组合数，用户二次确认后才发送 DELETE；删除与剩余组合统计重算在同一事务完成。
- 洞察页展示反馈总数、接受率、常见拒绝原因和真实达到阈值的衣物对数量 `weightedPairCount`；接受率按 `verdict=liked` 或 `actuallyWorn=true` 的去重反馈数除以总反馈数，只有至少一对衣物累计 3 条反馈时才显示“已达到排序阈值”。

## 保存与复用搭配

1. 在推荐卡点击「保存搭配」，应用会用推荐候选的历史快照创建记录并立即打开编辑器；可修改名称、备注和收藏状态。
2. 在衣服库展开单品后点击「以这件为核心」，或在推荐卡某件衣物上点击同名动作，可生成包含该衣物的硬约束推荐；推荐页可清除约束。
3. 推荐卡每件可替换衣物都有「换这件」。替换对话框会先展示目标、完整新整套、匹配度变化和理由；只有确认应用后才创建新版本。应用时只复用与候选的 garment ID、快照 ID、slot、position 全部一致的保存记录；同 candidate 的已编辑记录不会成为替换父记录。
4. 进入「历史洞察 → 保存的搭配」可新建手工搭配、重新打开编辑、收藏或归档；已归档搭配仍在独立历史区域按保存时快照回看。手工搭配的核心必须是连衣裙，或上装加下装；配饰可拖动，也可用上移/下移按钮调整顺序。
5. 替换创建的新版本会显示原搭配关系；原记录不会被覆盖。衣物以后改名或归档也不会改变已经保存的名称、品牌、类别和图片快照。

## 隐私边界

- API 只监听 `127.0.0.1`，默认不对局域网开放。
- Express 会发送基础安全响应头，并对 mutating API 做本地 Origin/Sec-Fetch-Site 校验。
- 淘宝账号、密码、Cookie、浏览器凭据不会被应用 API 保存。
- 书签脚本只读取当前页面可见 DOM、页面脚本中的商品字段和图片 URL，不读取 `document.cookie`、`localStorage`、`sessionStorage` 或密码字段。
- Selenium 使用本地 Chrome 用户数据目录 `output/chrome-taobao-profile` 复用登录态；Playwright 商品详情采集使用 `output/playwright-taobao-profile`；这些目录在本机保存。
- 采集 JSON 位于 `output/taobao-captures`，SQLite 位于 `data/outfit.sqlite`，两者可能包含购买商品信息。
- 本地视觉模型只在用户点击下载或显式运行模型脚本时下载到 `output/models`；去背景和图片标签建议只读取本地缩略图，不调用付费 AI API，也不上传衣物图片。
- 新安装的位置和个人画像均为真正未设置状态：经纬度初始为空，个人画像初始为 `{}`，不会静默使用北京坐标或具体身高、体重、体型和肤色。用户设置后，经纬度才会保存在浏览器 `localStorage` 的 `outfit.latitude`、`outfit.longitude`；首次获取天气或生成推荐前必须提供有效经纬度。天气接口会向 Open-Meteo 发送该坐标。
- PWA service worker 只缓存静态 shell，不缓存衣橱、订单、推荐、导出或任何 `/api` 响应。
- `.gitignore` 已忽略 `data/`、`output/`、`logs/`、`node_modules/` 和 `dist/`，不要把本地采集产物、Chrome profile 或数据库提交到仓库。

## 数据删除、导出与备份

- `data/outfit.sqlite*` 包含衣橱、订单摘要、穿着记录、推荐历史、推荐反馈与评论、衣物状态历史、保存搭配及个人画像。
- `data/garment-assets` 包含净化后的本地衣物照片；它与数据库一样属于敏感本地数据。
- `output/chrome-taobao-profile` 可能包含淘宝登录态 Cookie/session；清理它会让 Selenium Chrome 退出淘宝登录态。
- `output/playwright-taobao-profile` 可能包含淘宝登录态 Cookie/session；清理它会让 Playwright Chrome 退出淘宝登录态。
- `output/taobao-captures` 可能包含订单号、付款金额、商品标题、SKU、商品链接和图片 URL。
- `output/garment-thumbnails` 是本地缩略图缓存。
- `GET /api/export` 当前始终返回 `OutfitExportV2`：envelope 保持 `version=2`，当前数据库自动报告 `schemaVersion=4`，并带有 `feedback-availability` 功能标识。除画像、衣物、淘宝来源、穿着记录、全部推荐 run/candidate，以及 active、归档、派生保存搭配和衣物快照外，还导出全部推荐反馈、衣物组合统计和可用状态变更历史。
- 反馈 verdict/评分、拒绝原因、自由文本评论、实际穿着选择与完整状态历史都是敏感本地数据。前端请求 JSON 或完整 ZIP 前会明确提示这些内容；直接调用 API 的人必须自行确认接收方和存放位置可信。
- 导出 JSON 不内嵌图片二进制；图片和资产字段不输出绝对文件系统路径。本地图保留为可移植的 `/api/...` 引用，远程来源仍保存为 URL。当前没有恢复导入接口；内部版本校验器仍能识别旧 V1，以及缺少反馈/状态数组的旧 V2 导出。

查看隐私清理计划但不删除任何文件：

```powershell
npm run privacy:clean
```

清理采集产物、缩略图、本地衣物照片、日志和本地数据库：

```powershell
npm run privacy:clean -- --confirm
```

如需同时清除 Selenium 与 Playwright 淘宝登录态，需要额外显式加入：

```powershell
npm run privacy:clean -- --confirm --include-login-state
```

不带 `--confirm` 时，脚本只打印所有目标的绝对路径和影响，不删除任何文件。只带 `--confirm` 时会清理采集产物、缩略图、`data/garment-assets`、日志和数据库，但保留两个浏览器登录 profile；只有同时提供 `--confirm --include-login-state` 才会清理 Selenium 与 Playwright 登录态。每个清理目标的词法路径和真实路径都必须位于项目根目录内；junction/symlink 指向项目外或 realpath 解析失败时，脚本会拒绝继续清理。模型缓存 `output/models` 不在当前清理范围内。

本项目不会在安装、测试、构建、启动或 CI 中自动运行 `privacy:clean`。

## 本地视觉模型

本地视觉能力是可选增强，不影响导入、衣橱、推荐和备份等核心功能。应用不会在启动时自动下载模型。

安装 Python 依赖：

```powershell
python -m pip install -r requirements.lock.txt
```

如果要让 `rembg` 尝试 NVIDIA CUDA 加速，可在确认本机 CUDA/驱动环境可用后改装可选 GPU 依赖：

```powershell
python -m pip install -r requirements.gpu.txt
```

查看模型状态：

```powershell
npm run models:status
```

显式下载或预热模型：

```powershell
npm run models:download:rembg
npm run models:download:clip
npm run models:verify
```

说明：

- `rembg` 去背景模型默认使用 `isnet-general-use`，模型目录为 `output/models/rembg`；低配置或网络较慢时可以运行 `npm run models:download:rembg -- --model u2netp` 或 `npm run models:download:rembg -- --model silueta`，运行时会按 `isnet-general-use`、`u2netp`、`silueta` 顺序选择本地已存在模型。
- CLIP 标签建议模型使用 `Xenova/clip-vit-base-patch32`，缓存目录在 `output/models/huggingface` 下。
- 网页端的本地视觉下载、验证、去背景和标签建议默认显式走 GPU：`rembg` 使用 `OUTFIT_REMBG_PROVIDER=cuda`，CLIP 使用 `OUTFIT_VISION_DEVICE=dml`。如需临时回退，可在启动服务前把它们改成 `cpu` 或 `auto`。
- 命令行脚本仍可用 `scripts/models.mjs ... --provider cuda`、`scripts/vision_tags.mjs ... --device dml` 显式指定后端；`rembg` 使用 CUDA 需要安装 `requirements.gpu.txt`。
- `npm run models:verify` 会用临时小图实际加载 rembg 和 CLIP，而不只是检查文件是否存在。
- 设置页提供本地视觉启用开关、模型下载按钮和验证按钮；开关只控制本地视觉增强入口，不会触发自动下载。
- 如果当前环境设置了 `HTTP_PROXY` 或 `HTTPS_PROXY`，模型脚本会在下载时自动为 Node 启用环境代理。
- `output/models` 位于已忽略的 `output/` 目录内，不会进入 Git；如以后清理模型缓存，需要在删除前明确确认。

## 文档

- [API 文档](docs/api.md)
- [数据库与类型 Schema](docs/schema.md)

## 故障排查

- `Cannot find module 'node:sqlite'` 或 API 无法启动：升级到 Node.js 24 或更新版本。
- 前端能打开但接口失败：确认 `npm run dev:api` 正在运行，且 API 地址是 `http://127.0.0.1:8788`。
- 端口占用：修改 API 端口可使用 `$env:PORT = "8789"; npm run start`。开发模式下还需要同步调整 Vite 代理配置。
- `python` 命令不可用：安装 Python，或在启动 Node API 前设置 `$env:PYTHON = "python3"` 指向可用解释器。
- Selenium 没有打开 Chrome：确认已安装 Chrome，并重新安装 `selenium` 依赖。
- Playwright 商品详情采集没有打开 Chrome：确认已安装 Chrome，并检查 `OUTFIT_PLAYWRIGHT_CHANNEL` 是否指向可用 channel；默认使用 `chrome`。
- 淘宝页面停在登录、滑块或风险验证：在打开的 Chrome 中手动完成验证后等待采集继续；必要时再次运行采集。
- 「读取产物」提示找不到 JSON：先确认对应采集任务已生成产物；旧版最新产物读取则检查 `output/taobao-captures` 或其子目录中是否有 `.json` 文件。
- 导入后没有新增衣服：检查 JSON 是否包含 `items`，以及候选是否被退款、非服饰或无有效标题过滤。
- 天气接口失败：服务会优先使用缓存，缓存也不可用时返回估算天气。
- SQLite 被占用：关闭其他正在访问 `data/outfit.sqlite` 的进程后重试。
