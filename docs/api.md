# API 文档

本文档描述当前 `server/routes.ts` 实际暴露的本地 API。默认 Base URL：

```text
http://127.0.0.1:8788
```

除衣物图片上传、图片内容读取和 ZIP 完整备份外，请求和响应均使用 JSON。JSON 与图片原始 body 上限均为 5 MB。业务错误使用统一结构，校验错误通常返回 HTTP 400：

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

兼容旧客户端的立即导入接口。接口会归一化采集项、去重并直接写库；新 UI 不再调用它，而是使用数据库感知的 preview/commit 两阶段流程。

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

数据库感知地预览淘宝采集批次，全程不写数据库。服务端会重新归一化来源、计算 `v2:<sha256>` 身份键，并结合现有 active/归档衣物判定 `create`、`update`、`refund-sync`、`unchanged` 或 `skip`。退款事件不会在采集读取阶段被提前丢弃。

请求体：`TaobaoCapturedBatch`

响应：`TaobaoImportPreview`

```json
{
  "batchId": "2f9c...",
  "summary": {
    "totalItems": 2,
    "uniqueItems": 2,
    "skippedRefunded": 1,
    "skippedNonApparel": 0,
    "createdGarments": 1
  },
  "duplicateCount": 0,
  "candidates": [
    {
      "sourceItemKey": "v2:c9b7...",
      "brand": "示例品牌",
      "name": "红色针织围巾",
      "rawName": "示例品牌 红色针织围巾",
      "category": "accessory",
      "color": "red",
      "warmth": "warm",
      "seasons": ["autumn", "winter"],
      "styles": ["casual"],
      "formality": "casual",
      "materials": [],
      "patterns": [],
      "tags": [],
      "notes": "",
      "confidence": 0.84,
      "imageUrl": "https://img.alicdn.com/example.jpg",
      "disposition": "create"
    },
    {
      "sourceItemKey": "v2:6ae1...",
      "brand": "",
      "name": "黑色长裤",
      "rawName": "退款成功 黑色长裤",
      "category": "bottom",
      "color": "black",
      "warmth": "medium",
      "seasons": ["spring", "autumn"],
      "styles": ["casual"],
      "formality": "casual",
      "materials": [],
      "patterns": [],
      "tags": [],
      "notes": "",
      "confidence": 0.8,
      "imageUrl": "",
      "disposition": "refund-sync",
      "existingGarmentId": 7,
      "message": "将同步退款状态并停止用于默认衣橱与推荐"
    }
  ],
  "skipped": []
}
```

匹配到归档衣物时，候选返回 `restoreRequired: true`，处理方式显示为“恢复并更新”，不会新建重复 active 记录。无法分类且没有历史衣物的非服饰项进入 `skipped`；未找到历史衣物的退款项保留为 disposition=`skip` 候选，以便用户看到事件没有消失。

## POST /api/import/taobao-commit

提交原始 batch 与逐项 decisions。服务端不会信任预览响应或前端 disposition，而是在 `BEGIN IMMEDIATE` 事务内重新归一化、计算身份键和 disposition；decision 必须与本次所有可审阅候选一一对应，不能重复、缺失或引用不存在的 key。

```json
{
  "batch": {
    "source": "taobao-selenium-order-list",
    "items": []
  },
  "decisions": [
    {
      "sourceItemKey": "v2:c9b7...",
      "include": true,
      "overrides": {
        "name": "酒红色羊毛围巾",
        "tags": ["通勤"]
      }
    },
    {
      "sourceItemKey": "v2:6ae1...",
      "include": false
    }
  ]
}
```

`overrides` 只允许 `brand`、`name`、`category`、`color`、`warmth`、`seasons`、`styles`、`formality`、`size`、`materials`、`patterns`、`tags`、`notes`。退款同步项不允许覆盖衣物字段。

响应：

```json
{
  "batchId": "2f9c...",
  "summary": {
    "totalDecisions": 2,
    "included": 1,
    "created": 1,
    "updated": 0,
    "refundSynced": 0,
    "unchanged": 0,
    "skipped": 1
  },
  "items": [
    { "sourceItemKey": "v2:c9b7...", "disposition": "create", "garmentId": 12 },
    { "sourceItemKey": "v2:6ae1...", "disposition": "skip" }
  ]
}
```

同一 batch 与 decisions 重放保持幂等；`include=false` 的项不写入来源表或衣物表。

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
| `wardrobeOnly` | `1` 或 `true` | 返回前过滤普通非服饰项并附带摘要；退款事件始终保留给数据库感知预览 |

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
    "keptItems": 7,
    "skippedRefunded": 0,
    "skippedNonApparel": 5
  }
}
```

## GET /api/capture/taobao-latest

读取 `output/taobao-captures` 下最新的 `.json` 采集产物。该接口用于兼容旧流程；应用内任务式采集优先使用 `/api/capture/jobs/:id/artifact`。

查询参数：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `wardrobeOnly` | `1` 或 `true` | 返回前过滤普通非服饰项并附带摘要；退款事件始终保留给数据库感知预览 |

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
    "keptItems": 7,
    "skippedRefunded": 0,
    "skippedNonApparel": 5
  }
}
```

没有可读 JSON 时返回错误。

## GET /api/garments

默认返回 active 衣橱条目：`owned=true AND archivedAt` 不存在。`excluded` 只控制推荐资格，不会让衣物从 active 列表消失。传 `?archived=1` 时只返回已归档衣物，供恢复操作使用。

响应：`Garment[]`

```json
[
  {
    "id": 1,
    "sourceOrderItemId": 10,
    "origin": "taobao",
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

`imageUrl` 可能包含淘宝来源 URL，但这不表示前端会直接请求它。UI 默认只显示本地图；只有用户在本次会话显式开启远程淘宝图片后，才会加载通过校验的 HTTPS 淘宝 CDN 图片。

## POST /api/garments

创建一件不关联淘宝来源的手工衣物。成功时返回 HTTP 201 和创建后的 `Garment`。

请求体：`ManualGarmentCreate`

```json
{
  "name": "海军蓝针织衫",
  "category": "top",
  "color": "blue",
  "warmth": "medium",
  "seasons": ["spring", "autumn"],
  "styles": ["casual", "smart-casual"],
  "formality": "smart-casual",
  "brand": "",
  "size": "M",
  "materials": ["wool"],
  "patterns": ["solid"],
  "tags": ["针织"],
  "notes": "手工录入",
  "acquiredAt": "2026-07-01",
  "purchasePriceCents": 29900,
  "currency": "CNY"
}
```

规则：

- 必填字段为 `name`、`category`、`color`、`warmth`、`seasons`、`styles`、`formality`。
- 可选字段为 `brand`、`size`、`materials`、`patterns`、`tags`、`notes`、`acquiredAt`、`purchasePriceCents`、`currency`。
- `acquiredAt` 使用有效的 `YYYY-MM-DD`；价格使用非负整数“分”，传价格时币种只能是 `CNY`。
- 不接受 `sourceOrderItemId`、`rawName`、`imageUrl`、`owned`、`confirmed`、`excluded`、`confidence` 等服务端状态字段；传入未知字段返回 HTTP 400。
- 服务端固定写入 `source_order_item_id=NULL`、`origin=manual`、`raw_name=name`、空图片、`owned=true`、`confirmed=true`、`excluded=false`、`confidence=1`。

照片使用下一个独立端点上传，因此不选照片也能先完成建档。

## PUT /api/garments/:id/image

为已有衣物上传本地照片。请求体是原始图片字节，不是 JSON 或 multipart；`Content-Type` 只允许 `image/jpeg`、`image/png`、`image/webp`，上限 5 MB。

浏览器 canvas 预处理只负责预览和减小体积，不是安全边界。服务端仍会先限制字节数，再用 `sharp` 的像素上限解码、自动旋转并重新编码为无 EXIF/ICC/XMP 的 WebP。文件使用服务端 UUID 名称原子落盘到 `data/garment-assets`；替换图片只把旧资产置为 inactive，不删除旧文件。

成功响应是更新后的 `Garment`，其 `imageUrl` 形如：

```json
{
  "id": 12,
  "origin": "manual",
  "imageUrl": "/api/garment-assets/3/content"
}
```

常见错误：`UNSUPPORTED_IMAGE_TYPE`（415）、`INVALID_IMAGE`（400）、`IMAGE_TOO_LARGE`（413）、`IMAGE_PIXEL_LIMIT`（400）。

## GET /api/garment-assets/:id/content

认证后按正整数 asset ID 读取当前 active 图片；不接收路径。响应为 `image/webp`，并设置 `Cache-Control: private, max-age=0, must-revalidate`、基于内容 SHA-256 的 `ETag` 和 `X-Content-Type-Options: nosniff`。不存在、inactive、损坏、越界或符号链接资产统一返回不泄露物理路径的 404。

## POST /api/garments/:id/archive

软归档衣物并返回更新后的 `Garment`。归档只写 `archived_at`，不会删除来源记录、图片资产或其他本机文件；重复调用保持同一结果。

## POST /api/garments/:id/restore

清除 `archived_at` 并返回更新后的 `Garment`。若衣物仍为 `owned=false`，恢复后仍不属于默认 active 集合，需另行更新拥有状态。

## GET /api/profile

返回本地个人画像。所有字段都可省略；从未保存画像时返回 `{}`，不会注入具体身高、体重、体型、肤色或偏好默认值。

响应：`PersonalProfile`

```json
{}
```

## PUT /api/profile

用已校验的请求对象替换当前本地个人画像，而不是对旧对象做字段级 patch。提交 `{}` 可保存真正未设置的画像。

允许字段：

- `heightCm`：`120..230`
- `weightKg`：`30..200`
- `bodyType`、`skinTone`、`colorDisposition`、`temperatureSensitivity`
- `preferredColors`、`avoidedColors`、`preferredStyles`

响应：保存后的 `PersonalProfile`。

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

## GET /api/garments/:id/thumbnail-candidates

返回指定衣物可选择的商品图候选。候选只来自该衣物当前图片、关联淘宝订单/详情和本地采集产物，并经过淘宝图片域名、协议及 URL 归一化校验；接口本身不下载图片，也不修改数据库。

响应：`GarmentThumbnailCandidatesResponse`

```json
{
  "garmentId": 7,
  "currentImageUrl": "/api/garment-thumbnails/7-current.webp",
  "candidates": [
    {
      "url": "https://img.alicdn.com/imgextra/example.jpg",
      "source": "detail",
      "score": 86,
      "selected": false
    }
  ]
}
```

`source` 取值为 `current`、`order`、`detail` 或 `capture`。返回远程候选 URL 不表示浏览器会直接展示它；选择后仍由后端受控下载并落为本地缩略图。

## POST /api/garments/:id/thumbnail

从上一个接口为同一件衣物重新计算出的候选集合中选择一张图，由后端执行受控下载并保存本地缩略图。客户端不能提交任意外站 URL 绕过候选集合。

请求体：

```json
{
  "imageUrl": "https://img.alicdn.com/imgextra/example.jpg"
}
```

成功时返回更新后的 `Garment`，其 `imageUrl` 指向本地 `/api/garment-thumbnails/...`，旧去背景图引用会被清空。候选不属于该衣物时返回 HTTP 400；下载失败返回 HTTP 502。

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

兼容旧客户端的弃用端点，语义与 `POST /api/garments/:id/archive` 相同，不再物理删除记录。成功响应带 `Deprecation: true` 与指向 archive 端点的 `Link`。

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

## GET /api/wear-logs

返回最近的穿着记录，按 `worn_at`、`id` 从新到旧排序。当前接口不接收分页参数，默认最多返回 50 条。

响应：`WearLogEntry[]`

```json
[
  {
    "id": 1,
    "garmentIds": [1, 2, 3],
    "context": { "occasion": "casual" },
    "wornAt": "2026-07-11 08:00:00"
  }
]
```

## GET /api/recommendation-runs

返回最近的推荐 run，按创建时间和 ID 从新到旧排序。当前接口不接收分页参数，默认最多返回 20 条。

响应：`RecommendationRunEntry[]`

```json
[
  {
    "id": 12,
    "input": {},
    "result": {
      "runId": 12,
      "weather": {
        "date": "2026-07-11",
        "temperature": 24,
        "apparentTemperature": 25,
        "precipitationProbability": 10,
        "windSpeed": 8,
        "weatherCode": 1,
        "summary": "晴"
      },
      "occasion": "casual",
      "outfits": [],
      "missingSlots": ["top", "bottom", "dress"]
    },
    "createdAt": "2026-07-11 08:00:00"
  }
]
```

## GET /api/export

不传格式（或传 `format=json`）时构建敏感本地 V2 JSON 备份。该接口不采用列表接口的默认条数限制，包含 active 与归档衣物，但不内嵌图片二进制。

```json
{
  "version": 2,
  "schemaVersion": 2,
  "exportedAt": "2026-07-11T08:00:00.000Z",
  "features": [
    "versioned-migrations",
    "recommendation-candidates",
    "garment-assets"
  ],
  "profile": {},
  "garments": [],
  "sourceOrderItems": [],
  "wearLogs": [],
  "recommendationRuns": [],
  "recommendationCandidates": [
    {
      "candidateId": "11111111-1111-4111-8111-111111111111",
      "runId": 12,
      "outfitSignature": "07cf119e738366b94cfc2c55d75db97badd85675afd57241f0bfe02425af2130",
      "rank": 1,
      "itemIds": [3],
      "scoreSnapshot": {
        "score": 91,
        "matchPercent": 86,
        "scoreBreakdown": {},
        "reasons": ["风格和轻商务场合匹配。"]
      },
      "createdAt": "2026-07-11 08:00:00"
    }
  ],
  "garmentAssets": [
    {
      "id": 3,
      "garmentId": 12,
      "kind": "primary",
      "mimeType": "image/webp",
      "byteSize": 182304,
      "width": 1200,
      "height": 1600,
      "sha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      "active": true,
      "createdAt": "2026-07-11 08:00:00",
      "archivePath": "assets/3.webp"
    }
  ]
}
```

说明：

- 前端在请求前会显示敏感备份确认；直接调用 API 不会触发这层 UI 确认，但仍要求有效本地 session。调用方必须自行确认备份的接收方和存放位置可信。
- JSON 不内嵌图片二进制；`garmentAssets` 包含 active 与 inactive 资产的可移植元数据，但不含 `storage_key`、绝对路径或原始文件名。图片和来源字段不允许绝对文件系统路径、`data:`、`blob:` 或 `file:` 引用。
- 内部版本校验器仍能识别旧 V1 envelope，但当前没有恢复导入 API。

### GET /api/export?format=zip&preview=1

在生成完整备份前检查可包含的本地资产和预计大小，不创建 ZIP、临时归档或删除文件。

```json
{
  "assetCount": 4,
  "includedAssetCount": 3,
  "assetBytes": 5000000,
  "includedAssetBytes": 4000000,
  "estimatedBytes": 4500000,
  "warnings": [
    {
      "code": "ASSET_UNAVAILABLE",
      "assetId": 17,
      "message": "资产不可用，已跳过"
    }
  ]
}
```

前端会把个人画像、淘宝来源与价格、穿着/推荐历史、本地图片、预计大小和警告明确展示给用户；只有再次确认才请求正式 ZIP。

### GET /api/export?format=zip

流式返回 `application/zip`，文件名为 `outfit-complete-backup-YYYY-MM-DD.zip`。固定允许的条目只有：

- `outfit-export-v2.json`
- `manifest.json`
- `assets/<numeric-asset-id>.webp`

每个资产在写入前都会重新校验 UUID storage key、根目录边界、符号链接、字节数和 SHA-256。缺失、损坏或路径异常的资产不会中止其余备份，而是跳过并在 manifest 中仅按 asset ID 记录警告。ZIP 不含绝对路径、反斜杠、`..`、storage UUID 或临时 ZIP；生成过程不会删除源文件。非法 `format` 返回 400 `INVALID_EXPORT_FORMAT`。`schemaVersion` 是数据库迁移版本，不等同于导出 envelope 的 `version`。

## GET /api/insights

读取本地衣橱分析洞察。基础统计、常穿/未穿列表、季节/风格分布、健康度和建议都只基于 `owned=true` 且未归档的 active 衣物；归档衣物不会进入默认洞察。`excluded` 仍属于衣橱分析，但不会进入推荐。

响应：`WardrobeInsights`

```json
{
  "totalGarments": 5,
  "ownedGarments": 5,
  "confirmedGarments": 3,
  "pendingGarments": 2,
  "categoryDistribution": { "top": 3, "bottom": 1, "shoes": 1 },
  "colorDistribution": { "white": 2, "blue": 2, "black": 1 },
  "seasonDistribution": { "spring": 4, "summer": 3, "autumn": 2, "winter": 1 },
  "styleDistribution": { "casual": 3, "smart-casual": 1 },
  "formalityDistribution": { "casual": 3, "smart-casual": 1, "sport": 1 },
  "styleTendency": {
    "dominantStyles": [{ "key": "casual", "count": 3, "ratio": 50 }],
    "dominantFormalities": [{ "key": "casual", "count": 3, "ratio": 60 }]
  },
  "health": {
    "score": 64,
    "level": "needs-attention",
    "components": {
      "coreCompleteness": 60,
      "seasonCoverage": 75,
      "styleCoverage": 100,
      "confirmationRate": 60,
      "utilizationRate": 20
    },
    "issues": ["外套不足，换季层次会受限。"]
  },
  "insightSuggestions": [
    {
      "id": "top-heavy",
      "priority": "medium",
      "title": "上装占比偏高",
      "detail": "上装超过衣橱 40%，后续购买可优先考虑下装、鞋履或外套。"
    }
  ],
  "shoppingSuggestions": [
    {
      "id": "shop-outerwear",
      "priority": "high",
      "title": "补充一件经典外套",
      "detail": "外套不足会影响换季和通勤层次，优先考虑风衣、夹克或轻薄大衣。"
    }
  ],
  "bodySuggestions": [
    {
      "id": "body-slim-tall",
      "priority": "low",
      "title": "瘦高体型适合增加层次",
      "detail": "基于当前个人画像，挺括外套、直筒下装和有结构感的层次能减少单薄感。"
    }
  ],
  "mostWorn": [],
  "neverWorn": []
}
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

生成搭配推荐。服务只使用同时满足 `owned=true`、`confirmed=true`、`excluded=false` 的衣橱条目，替代单品也遵循同一资格规则。请求中的 `recentlyWornGarmentIds` 会与数据库最近穿着记录合并。

候选按“核心组合 → 外套 → 鞋履 → 配饰”分层生成。默认一次最多评估 20,000 个中间候选，每层最多保留 120 个 beam 状态；超出预算时使用确定性均匀采样。这是有界启发式计算，不保证遍历大衣橱的全部笛卡尔积。预算计数属于服务内部诊断，不作为响应字段返回。

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
  "runId": 12,
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
      "id": "11111111-1111-4111-8111-111111111111",
      "candidateId": "11111111-1111-4111-8111-111111111111",
      "outfitSignature": "07cf119e738366b94cfc2c55d75db97badd85675afd57241f0bfe02425af2130",
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
        "userPreference": 7,
        "bodyProportion": 0,
        "colorSuitability": 0
      },
      "items": [
        {
          "id": 3,
          "brand": "",
          "name": "海军蓝连衣裙",
          "rawName": "海军蓝连衣裙",
          "category": "dress",
          "color": "blue",
          "warmth": "light",
          "seasons": ["spring", "summer"],
          "styles": ["smart-casual"],
          "formality": "smart-casual",
          "imageUrl": "",
          "owned": true,
          "confirmed": true,
          "excluded": false,
          "confidence": 1
        }
      ],
      "reasons": ["风格和轻商务场合匹配。"],
      "alternatives": []
    }
  ],
  "missingSlots": []
}
```

身份与空结果语义：

- `runId` 是 `recommendation_runs.id`。
- `candidateId` 是候选快照的全局唯一 UUID；兼容字段 `id` 当前与它相同。
- `outfitSignature` 是完整已选衣物组合的稳定 SHA-256 内容签名。相同组合跨 run 可得到相同 signature，但天气、场合、rank 和评分仍属于各自的 run/candidate 快照。
- 客户端请求体中的 `runId`、`candidateId`、`outfitSignature` 等未知字段不会进入已保存的推荐输入，也不能影响服务端生成的身份。
- 无法组成一件连衣裙或“上装＋下装”核心时，返回 `outfits=[]` 和结构化 `missingSlots`。鞋履仍是软缺口，不会单独导致空结果。

## PowerShell 调用示例

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8788/api/health"

Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8788/api/wear-logs" `
  -ContentType "application/json" `
  -Body '{"garmentIds":[1,2],"context":{"occasion":"casual"}}'
```
