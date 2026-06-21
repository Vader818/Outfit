# API 文档

本文档描述当前 `server/routes.ts` 实际暴露的本地 API。默认 Base URL：

```text
http://127.0.0.1:8788
```

请求和响应均使用 JSON。请求体大小限制为 `5mb`。业务错误使用统一结构，校验错误通常返回 HTTP 400：

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "category 必须是以下值之一：top, bottom, dress, outerwear, shoes, accessory",
    "details": {
      "field": "category"
    }
  }
}
```

不存在的采集任务会返回 HTTP 404，错误码为 `NOT_FOUND`。

除 `GET /api/health` 和 `/api/auth/*` 外，其他 `/api/*` 接口都需要本地 session cookie。未登录时返回 HTTP 401，错误码为 `UNAUTHENTICATED`。

## GET /api/health

健康检查。

响应：

```json
{ "ok": true }
```

## GET /api/auth/status

读取本地门禁状态。无需登录。

响应：

```json
{
  "hasAccount": true,
  "user": {
    "id": 1,
    "username": "local_user"
  }
}
```

没有创建账号时返回 `{ "hasAccount": false, "user": null }`。已有账号但未登录时返回 `{ "hasAccount": true, "user": null }`。

## POST /api/auth/register

首次创建本地账号。仅允许在没有账号时调用；成功后自动写入 HTTP-only session cookie。

请求体：

```json
{
  "username": "local_user",
  "password": "correct-password"
}
```

字段规则：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `username` | string | 3-32 位 ASCII 字母、数字或下划线，大小写不敏感唯一 |
| `password` | string | 8-128 个字符 |

响应状态：HTTP 201

```json
{
  "hasAccount": true,
  "user": {
    "id": 1,
    "username": "local_user"
  }
}
```

已存在账号时返回 HTTP 409，错误码为 `ACCOUNT_EXISTS`。

## POST /api/auth/login

登录本地账号。成功后写入 HTTP-only session cookie。

请求体同注册接口。

响应：

```json
{
  "hasAccount": true,
  "user": {
    "id": 1,
    "username": "local_user"
  }
}
```

用户名或密码错误时返回 HTTP 401，错误码为 `INVALID_CREDENTIALS`。

## POST /api/auth/logout

退出当前本地 session。成功后清除 session cookie。

响应：

```json
{ "ok": true }
```

## POST /api/import/taobao-batch

导入淘宝采集批次。接口会归一化采集项、去重、写入 `source_order_items`，并为未退款的服饰、鞋类和配饰候选创建或更新 `garments`。

请求体：`TaobaoCapturedBatch`

```json
{
  "source": "taobao-selenium-order-list",
  "pageType": "order-list",
  "capturedAt": "2026-06-11T08:00:00.000Z",
  "pageUrl": "https://buyertrade.taobao.com/trade/itemlist/list_bought_items.htm",
  "items": [
    {
      "pageType": "order-list",
      "itemId": "808",
      "orderId": "123456789012345678",
      "orderTime": "2026-06-10 20:30:00",
      "title": "示例店铺 订单详情 交易成功 白色短袖T恤",
      "sku": "颜色: 白色; 尺码: M",
      "quantity": 1,
      "payment": 99,
      "status": "交易成功",
      "itemUrl": "https://item.taobao.com/item.htm?id=808",
      "imageUrl": "https://img.alicdn.com/example.jpg"
    }
  ]
}
```

响应：`ImportSummary`

```json
{
  "batchId": "2f9c...",
  "summary": {
    "totalItems": 1,
    "uniqueItems": 1,
    "skippedRefunded": 0,
    "skippedNonApparel": 0,
    "createdGarments": 1
  }
}
```

## POST /api/import/taobao-preview

预览淘宝采集批次，不写入数据库。用于在正式导入前检查候选衣物、退款项、非服饰项、重复项和自动分类置信度。

请求体：`TaobaoCapturedBatch`

响应：`TaobaoImportPreview`

```json
{
  "batchId": "2f9c...",
  "summary": {
    "totalItems": 4,
    "uniqueItems": 3,
    "skippedRefunded": 1,
    "skippedNonApparel": 1,
    "createdGarments": 1
  },
  "duplicateCount": 1,
  "candidates": [
    {
      "sourceItemKey": "c9b7...",
      "brand": "示例品牌",
      "name": "红色针织围巾",
      "rawName": "示例品牌 红色针织围巾",
      "category": "accessory",
      "color": "red",
      "warmth": "warm",
      "seasons": ["autumn", "winter"],
      "confidence": 0.84,
      "imageUrl": "https://img.alicdn.com/example.jpg"
    }
  ],
  "skipped": [
    { "title": "退款成功 黑色长裤", "reason": "refunded" },
    { "title": "手机壳", "reason": "non-apparel" }
  ]
}
```

## POST /api/capture/taobao-orders

旧版 detached 淘宝订单页采集接口已禁用。请使用 `POST /api/capture/jobs` 创建带 `jobId` 的采集任务，避免多个采集产物互相误读。

响应状态：HTTP 410

```json
{
  "error": {
    "code": "LEGACY_CAPTURE_DISABLED",
    "message": "旧版 detached 采集接口已禁用，请使用 /api/capture/jobs。"
  }
}
```

## POST /api/capture/taobao-item

旧版 detached 淘宝/天猫商品详情采集接口已禁用。请使用 `POST /api/capture/jobs` 创建带 `jobId` 的采集任务。

响应状态：HTTP 410

```json
{
  "error": {
    "code": "LEGACY_CAPTURE_DISABLED",
    "message": "旧版 detached 采集接口已禁用，请使用 /api/capture/jobs。"
  }
}
```

## POST /api/capture/jobs

创建一个带 `jobId` 的采集任务。任务产物写入 `output/taobao-captures/<jobId>`，后续通过 job 专属接口读取，避免误读其他采集产物。

默认情况下订单页和商品详情页都使用 Selenium。订单采集始终使用 Selenium。商品详情采集可在请求中传 `engine: "selenium"` 或 `engine: "playwright"`；请求值优先于环境变量。若请求没有传 `engine`，启动 API 前设置 `OUTFIT_TAOBAO_ITEM_CAPTURE_ENGINE=playwright` 可把商品详情默认 runner 改为项目自带 Playwright 脚本。无效环境变量值会以 `CAPTURE_ENGINE_INVALID` 拒绝任务创建，并且不会启动子进程；请求里的无效 `engine` 或订单采集携带 `engine` 会以 `VALIDATION_ERROR` 拒绝。

订单采集请求：

```json
{
  "mode": "orders",
  "maxPages": 3,
  "loginWait": 60
}
```

商品详情采集请求：

```json
{
  "mode": "item-detail",
  "url": "https://item.taobao.com/item.htm?id=808",
  "loginWait": 60,
  "engine": "playwright"
}
```

响应：`CaptureJob`

```json
{
  "id": "cap_m3v7u0qk_a1b2c3d4",
  "mode": "orders",
  "engine": "selenium",
  "status": "running",
  "pid": 12345,
  "outputDir": "output/taobao-captures/cap_m3v7u0qk_a1b2c3d4",
  "logPath": "output/taobao-captures/cap_m3v7u0qk_a1b2c3d4/capture.log",
  "message": "Selenium 采集任务已启动。请在打开的 Chrome 中登录或处理验证。",
  "createdAt": "2026-06-11T08:00:00.000Z",
  "updatedAt": "2026-06-11T08:00:00.000Z"
}
```

字段约束：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `mode` | `"orders"` 或 `"item-detail"` | 是 | 采集模式 |
| `maxPages` | number | 否 | 订单页最大翻页数，范围 `1` 到 `20`，仅订单采集使用 |
| `loginWait` | number | 否 | 等待手动登录或验证的秒数，范围 `1` 到 `600` |
| `url` | string | 商品详情必填 | 仅接受淘宝/天猫商品详情链接 |
| `engine` | `"selenium"` 或 `"playwright"` | 否 | 仅商品详情采集可传；不传时使用 API 默认配置 |

`CaptureJob.engine` 表示实际 runner，取值为 `"selenium"` 或 `"playwright"`。Playwright 商品详情采集使用 `scripts/taobao_playwright_capture.mjs` 和独立 profile `output/playwright-taobao-profile`；该 profile 可能包含淘宝登录态，位于已忽略的 `output/` 目录下。Codex Playwright skill 只作为开发调试辅助，不是应用运行时依赖。

## GET /api/capture/jobs/:id

查询采集任务状态。状态枚举：

```ts
type CaptureJobStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled";
```

如果任务目录已生成 JSON 产物，查询时会把运行中的任务刷新为 `succeeded` 并填充 `artifactPath`。

## POST /api/capture/jobs/:id/cancel

取消仍在运行的采集任务。成功时返回更新后的 `CaptureJob`，已结束任务会原样返回当前状态。

## GET /api/capture/jobs/:id/artifact

读取指定采集任务的 JSON 产物。

查询参数：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `wardrobeOnly` | `1` 或 `true` | 返回前按衣橱导入规则过滤退款和非服饰候选，并附带过滤摘要 |

响应：`CaptureArtifact`

```json
{
  "jobId": "cap_m3v7u0qk_a1b2c3d4",
  "outputDir": "output/taobao-captures/cap_m3v7u0qk_a1b2c3d4",
  "fileName": "taobao-orders-20260611-152934.json",
  "path": "output/taobao-captures/cap_m3v7u0qk_a1b2c3d4/taobao-orders-20260611-152934.json",
  "jsonText": "{ ... }",
  "payload": {
    "source": "taobao-selenium-order-list",
    "pageType": "order-list",
    "items": []
  },
  "filterSummary": {
    "originalItems": 12,
    "keptItems": 5,
    "skippedRefunded": 2,
    "skippedNonApparel": 5
  }
}
```

## GET /api/capture/taobao-latest

读取 `output/taobao-captures` 下最新的 `.json` 采集产物。该接口用于兼容旧流程；应用内任务式采集优先使用 `/api/capture/jobs/:id/artifact`。

查询参数：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `wardrobeOnly` | `1` 或 `true` | 返回前按衣橱导入规则过滤退款和非服饰候选，并附带过滤摘要 |

响应：

```json
{
  "outputDir": "output/taobao-captures",
  "fileName": "taobao-orders-20260611-152934.json",
  "path": "output/taobao-captures/taobao-orders-20260611-152934.json",
  "jsonText": "{ ... }",
  "payload": {
    "source": "taobao-selenium-order-list",
    "pageType": "order-list",
    "items": []
  },
  "filterSummary": {
    "originalItems": 12,
    "keptItems": 5,
    "skippedRefunded": 2,
    "skippedNonApparel": 5
  }
}
```

没有可读 JSON 时返回错误。

## GET /api/garments

返回当前衣橱条目，按未排除、已拥有、较新 ID 优先排序。

响应：`Garment[]`

```json
[
  {
    "id": 1,
    "sourceOrderItemId": 10,
    "brand": "示例品牌",
    "name": "白色短袖T恤",
    "rawName": "示例店铺 订单详情 交易成功 白色短袖T恤",
    "category": "top",
    "color": "white",
    "warmth": "light",
    "seasons": ["spring", "summer"],
    "styles": ["casual"],
    "formality": "casual",
    "imageUrl": "https://img.alicdn.com/example.jpg",
    "owned": true,
    "confirmed": false,
    "excluded": false,
    "confidence": 0.82,
    "notes": "",
    "itemUrl": "https://item.taobao.com/item.htm?id=808",
    "detailUrl": "https://item.taobao.com/item.htm?id=808"
  }
]
```

## POST /api/garments/thumbnails/refresh

从 `source_order_items` 和 `output/taobao-captures` 中收集同一 `itemId` 的图片候选，按 URL 信号和轻量图片头校验选择商品图，低频下载到 `output/garment-thumbnails`，并把成功项的 `garments.image_url` 更新为 `/api/garment-thumbnails/<file>`。

请求体可省略。可选字段：

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `maxDownloads` | number | `8` | 本次刷新最多实际下载尝试次数，范围 `1` 到 `24` |
| `maxDownloadsPerGarment` | number | `4` | 单件衣服最多尝试候选数，范围 `1` 到 `6` |
| `delayMs` | number | `900` | 候选下载间隔毫秒数，范围 `0` 到 `5000` |

响应：`ThumbnailRefreshResult`

```json
{
  "scanned": 31,
  "attemptedDownloads": 4,
  "updated": 4,
  "skipped": 27
}
```

本地缩略图通过 `GET /api/garment-thumbnails/<file>` 读取，供衣服库和推荐卡片中的 `<img>` 直接使用。

## GET /api/vision/models

返回本地视觉模型状态。该接口只检查本机文件和最近一次进程内 job，不下载模型。`rembg-isnet` 会接受 `isnet-general-use`、`u2netp` 或 `silueta` 中任一已存在模型；`clip-vit-base-patch32` 需要配置、分词、预处理文件和至少一个 ONNX 文件都在本机。

响应：`VisionModelsResponse`

```json
{
  "modelRoot": "<repo>\\output\\models",
  "models": [
    {
      "id": "rembg-isnet",
      "label": "rembg isnet-general-use",
      "kind": "background-removal",
      "installed": true,
      "path": "<repo>\\output\\models\\rembg",
      "message": "已可用：u2netp",
      "job": {
        "id": "vision_m3v7u0qk_a1b2c3d4",
        "modelId": "rembg-isnet",
        "action": "verify",
        "status": "succeeded",
        "message": "本地模型验证通过：rembg isnet-general-use",
        "startedAt": "2026-06-18T12:00:00.000Z",
        "updatedAt": "2026-06-18T12:00:03.000Z"
      }
    },
    {
      "id": "clip-vit-base-patch32",
      "label": "Xenova clip-vit-base-patch32",
      "kind": "tagging",
      "installed": false,
      "path": "<repo>\\output\\models\\huggingface\\Xenova\\clip-vit-base-patch32",
      "message": "未下载"
    }
  ],
  "jobs": []
}
```

## POST /api/vision/models/:id/download

显式启动本地模型下载或预热任务。应用启动、状态查询和普通衣橱操作不会自动下载模型。

支持的 `id`：

| id | 说明 |
| --- | --- |
| `rembg-isnet` | `rembg` 的 `isnet-general-use` 去背景模型 |
| `clip-vit-base-patch32` | Transformers.js 可用的 `Xenova/clip-vit-base-patch32` |

下载和验证 job 会继承服务端环境变量：`OUTFIT_MODEL_ROOT` 指定模型根目录，`OUTFIT_VISION_DEVICE` 指定 CLIP 后端（如 `auto`、`dml`、`cpu`），`OUTFIT_REMBG_PROVIDER` 指定 rembg 的 ONNX Runtime provider（如 `auto`、`cpu`、`cuda`、`dml`）。未设置时，网页端默认显式使用 `OUTFIT_VISION_DEVICE=dml` 和 `OUTFIT_REMBG_PROVIDER=cuda`；rembg 使用 `cuda` 前需要安装 GPU 版 Python 依赖。

响应：`VisionModelJob`

```json
{
  "id": "vision_m3v7u0qk_a1b2c3d4",
  "modelId": "rembg-isnet",
  "action": "download",
  "status": "running",
  "message": "本地模型下载已启动：rembg isnet-general-use",
  "startedAt": "2026-06-17T12:00:00.000Z",
  "updatedAt": "2026-06-17T12:00:00.000Z",
  "pid": 12345
}
```

## POST /api/vision/models/:id/verify

显式启动本地模型验证任务。验证任务会调用 `npm run models:verify` 的同一套加载逻辑，对 rembg 和 CLIP 使用临时小图做本地推理加载检查。该接口不会下载模型；缺文件或加载失败时 job 会变为 `failed`。

响应：`VisionModelJob`

```json
{
  "id": "vision_m3v7u0qk_a1b2c3d4",
  "modelId": "clip-vit-base-patch32",
  "action": "verify",
  "status": "running",
  "message": "本地模型验证已启动：Xenova clip-vit-base-patch32",
  "startedAt": "2026-06-18T12:00:00.000Z",
  "updatedAt": "2026-06-18T12:00:00.000Z",
  "pid": 12345
}
```

## POST /api/garments/:id/cutout

对衣物本地缩略图执行本地去背景，并把透明背景 PNG 路径写入 `garments.cutout_image_url`。只接受 `/api/garment-thumbnails/...` 本地缩略图作为输入；没有缩略图时返回 `VISION_INPUT_NOT_FOUND`；未下载去背景模型时返回 HTTP 409，错误码 `VISION_MODEL_MISSING`。实际执行会把 `OUTFIT_REMBG_PROVIDER` 传给 `scripts/vision_rembg.py --provider`，默认 `cuda`。

响应：更新后的 `Garment`。

## POST /api/garments/:id/vision-tags

使用本地 CLIP 模型生成分类、风格、图案和标签建议，并写入 `garments.vision_tags`。该接口不会覆盖 `category`、`styles`、`patterns`、`tags`；前端需要用户点击“应用建议”后才会走 `PUT /api/garments/:id` 更新正式字段。实际执行会把 `OUTFIT_VISION_DEVICE` 传给 `scripts/vision_tags.mjs --device`，默认 `dml`。

响应：`VisionTagSuggestion`

```json
{
  "category": "top",
  "styles": ["smart-casual"],
  "patterns": ["solid"],
  "tags": ["cotton"],
  "scores": [
    { "label": "top", "score": 0.92 }
  ]
}
```

## PUT /api/garments/:id

更新衣橱条目。

路径参数：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `id` | number | `garments.id` |

请求体：`GarmentUpdate`

```json
{
  "brand": "示例品牌",
  "name": "白色短袖T恤",
  "category": "top",
  "color": "white",
  "warmth": "light",
  "seasons": ["spring", "summer"],
  "styles": ["casual"],
  "formality": "casual",
  "owned": true,
  "confirmed": true,
  "excluded": false,
  "notes": "适合通勤"
}
```

响应：更新后的 `Garment`。不存在时返回 `衣服不存在`。

## DELETE /api/garments/:id

删除一个衣橱条目。

响应：

- 成功：HTTP 204，无响应体
- 不存在：HTTP 400，`{ "error": { "code": "BAD_REQUEST", "message": "衣服不存在" } }`

## POST /api/wear-logs

记录一次穿着，用于后续推荐时降低近期重复穿着概率。

请求体：

```json
{
  "garmentIds": [1, 2, 3],
  "context": {
    "occasion": "casual",
    "weather": "小雨"
  }
}
```

规则：

- `garmentIds` 必须是非空正整数数组。
- 重复 ID 会去重。
- `context` 可省略，会以 JSON 存入 `wear_logs.context`。

响应：

```json
{ "ok": true }
```

## GET /api/weather

按经纬度获取天气快照。服务优先读取 30 分钟内缓存；Open-Meteo 请求失败时，若有过期缓存则返回过期缓存，否则返回本地估算天气。

查询参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `latitude` | number | 是 | 纬度 |
| `longitude` | number | 是 | 经度 |

响应：`WeatherSnapshot`

```json
{
  "date": "2026-06-11",
  "temperature": 24,
  "apparentTemperature": 25,
  "precipitationProbability": 30,
  "windSpeed": 11,
  "weatherCode": 3,
  "summary": "多云"
}
```

经纬度不是数字时返回 HTTP 400。

## POST /api/recommendations

生成搭配推荐。服务只使用 `owned = true` 且 `excluded = false` 的衣橱条目，并会合并请求中的 `recentlyWornGarmentIds` 与数据库最近穿着记录。

请求体：

```json
{
  "weather": {
    "date": "2026-06-11",
    "temperature": 24,
    "apparentTemperature": 25,
    "precipitationProbability": 30,
    "windSpeed": 11,
    "weatherCode": 3,
    "summary": "多云"
  },
  "occasion": "smart-casual",
  "recentlyWornGarmentIds": [1, 2],
  "userProfile": {
    "temperatureSensitivity": "runs-cold",
    "preferredColors": ["red", "white"],
    "avoidedColors": ["black"],
    "preferredStyles": ["casual"]
  }
}
```

响应：`RecommendationResult`

```json
{
  "weather": {
    "date": "2026-06-11",
    "temperature": 24,
    "apparentTemperature": 25,
    "precipitationProbability": 30,
    "windSpeed": 11,
    "weatherCode": 3,
    "summary": "多云"
  },
  "weatherScenario": "dry_sunny",
  "occasion": "smart-casual",
  "outfits": [
    {
      "id": "top:1-bottom:2-shoes:3",
      "score": 91,
      "matchPercent": 86,
      "scoreBreakdown": {
        "slotCompleteness": 20,
        "weatherComfort": 24,
        "season": 8,
        "occasion": 6,
        "pairCompatibility": 8,
        "colorHarmony": 6,
        "recentWear": 0,
        "itemConfidence": 7,
        "userPreference": 7
      },
      "items": [],
      "reasons": ["风格和轻商务场合匹配。"],
      "alternatives": []
    }
  ]
}
```

## PowerShell 调用示例

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8788/api/health"

Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8788/api/wear-logs" `
  -ContentType "application/json" `
  -Body '{"garmentIds":[1,2],"context":{"occasion":"casual"}}'
```
