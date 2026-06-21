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
5. 将 JSON 粘贴到应用的「采集 JSON」文本框并导入。

## 导入规则

- 输入必须是 `TaobaoCapturedBatch`，并包含 `items` 数组。
- 同一商品会按 `itemId + sku` 等稳定键去重。
- 退款或售后候选会被标记并跳过衣橱草稿创建。
- 当前自动衣橱导入会为 `top`、`bottom`、`dress`、`outerwear`、`shoes`、`accessory` 创建衣橱草稿；配饰在推荐中作为可选增强项，不作为完整搭配的必需核心单品。
- 导入预览不会写入数据库，可用于在正式导入前检查自动分类、置信度、重复项和跳过原因。
- 商品详情采集可以补充品牌、商品名、详情图、参数和描述；后导入的详情会合并到已购 SKU。
- 导入后的条目可以在应用中手动确认、编辑、排除或标记为未拥有。
- 衣橱和推荐卡片默认只显示本地缓存缩略图 `/api/garment-thumbnails/...`；没有本地缩略图时显示占位图，不直接加载远程商品图片。需要本地化图片时，先使用应用内“刷新缩略图”让后端受控下载。

## 隐私边界

- API 只监听 `127.0.0.1`，默认不对局域网开放。
- Express 会发送基础安全响应头，并对 mutating API 做本地 Origin/Sec-Fetch-Site 校验。
- 淘宝账号、密码、Cookie、浏览器凭据不会被应用 API 保存。
- 书签脚本只读取当前页面可见 DOM、页面脚本中的商品字段和图片 URL，不读取 `document.cookie`、`localStorage`、`sessionStorage` 或密码字段。
- Selenium 使用本地 Chrome 用户数据目录 `output/chrome-taobao-profile` 复用登录态；Playwright 商品详情采集使用 `output/playwright-taobao-profile`；这些目录在本机保存。
- 采集 JSON 位于 `output/taobao-captures`，SQLite 位于 `data/outfit.sqlite`，两者可能包含购买商品信息。
- 本地视觉模型只在用户点击下载或显式运行模型脚本时下载到 `output/models`；去背景和图片标签建议只读取本地缩略图，不调用付费 AI API，也不上传衣物图片。
- 天气接口会向 Open-Meteo 发送经纬度。前端会把经纬度保存在浏览器 `localStorage` 的 `outfit.latitude`、`outfit.longitude`。
- PWA service worker 只缓存静态 shell，不缓存衣橱、订单、推荐、导出或任何 `/api` 响应。
- `.gitignore` 已忽略 `data/`、`output/`、`logs/`、`node_modules/` 和 `dist/`，不要把本地采集产物、Chrome profile 或数据库提交到仓库。

## 数据删除、导出与备份

- `data/outfit.sqlite*` 包含衣橱、订单摘要、穿着记录、推荐历史和个人画像。
- `output/chrome-taobao-profile` 可能包含淘宝登录态 Cookie/session；清理它会让 Selenium Chrome 退出淘宝登录态。
- `output/playwright-taobao-profile` 可能包含淘宝登录态 Cookie/session；清理它会让 Playwright Chrome 退出淘宝登录态。
- `output/taobao-captures` 可能包含订单号、付款金额、商品标题、SKU、商品链接和图片 URL。
- `output/garment-thumbnails` 是本地缩略图缓存。
- `GET /api/export` 导出的是敏感备份，分享或同步前请确认接收方和存放位置可信。

查看隐私清理计划但不删除任何文件：

```powershell
npm run privacy:clean
```

清理采集产物、缩略图、日志和本地数据库：

```powershell
npm run privacy:clean -- --confirm
```

如需同时清除 Selenium 淘宝登录态，需要额外显式加入：

```powershell
npm run privacy:clean -- --confirm --include-login-state
```

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
