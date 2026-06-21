# 商品缩略图手动选择设计

## 背景

Outfit 当前会在淘宝导入和补缩略图流程中自动选择商品图片。候选来源包括订单页 `imageUrl`、详情页 `detailImages`、以及 `output/taobao-captures` 中的采集图片。自动排序逻辑集中在 `server/services/thumbnails.ts` 的 `rankThumbnailCandidates()`，最终展示图写入 `garments.image_url`。

这个自动选择对多数商品可用，但用户更了解哪张图最适合作为衣橱缩略图。因此本功能允许用户在衣服库里为单件衣物从该商品候选图中手动挑选缩略图，并把选择持久化为本地缩略图。

## 目标

- 在衣服库每件衣服行提供“选择缩略图”入口。
- 用户能看到该衣物的候选商品图，并选择其中一张作为主缩略图。
- 保存后 `garments.image_url` 指向本地 `/api/garment-thumbnails/...` 文件，衣服库和推荐卡片继续复用现有缩略图组件。
- 后续重新导入详情或执行“补缩略图”时不覆盖用户已选择的本地缩略图。
- 更换主缩略图时清空旧的 `cutout_image_url`，避免继续展示与新主图不一致的去背景图。
- 保持本地优先和安全边界：不接受外站、私网、本地文件、data URL 或不属于该商品候选集合的 URL。

## 非目标

- 不在第一版支持用户上传本地图片文件。
- 不在第一版改造导入预览阶段的图片选择。
- 不迁移现有数据库结构；继续使用 `garments.image_url` 和 `garments.cutout_image_url`。
- 不删除旧缩略图文件。旧文件属于本地缓存，清理由现有隐私清理流程负责。

## 用户流程

1. 用户进入“衣服库”。
2. 在某件衣服行点击图片按钮“选择缩略图”。
3. 前端请求该衣物的候选图列表。
4. 弹出候选图网格，展示当前图、订单图、详情图和采集产物图；加载失败的候选显示占位。
5. 用户点击候选图后确认保存。
6. 后端校验该 URL 来自该衣物候选集合，下载并保存为本地缩略图，然后更新衣物。
7. 前端用返回的 `Garment` 更新该行，弹窗关闭；推荐卡片也会在下次数据刷新后使用同一主图。

## API 设计

### `GET /api/garments/:id/thumbnail-candidates`

返回指定衣物可选择的缩略图候选。

响应：

```json
{
  "garmentId": 1,
  "currentImageUrl": "/api/garment-thumbnails/garment-1-current.jpg",
  "candidates": [
    {
      "url": "https://img.alicdn.com/imgextra/i1/123/O1CN01shirt.jpg",
      "source": "detail",
      "score": 158,
      "selected": false
    }
  ]
}
```

候选图收集规则：

- 当前 `garments.image_url` 如果是远程可信商品图，则纳入候选。
- `source_order_items.image_url` 作为订单图纳入候选。
- `source_order_items.detail_images` 作为详情图纳入候选。
- `output/taobao-captures` 中同 `itemId` 的 `imageUrl` 和 `detailImages` 纳入候选。
- 使用 `rankThumbnailCandidates()` 过滤与排序，限制返回数量，去重后返回。

### `POST /api/garments/:id/thumbnail`

请求体：

```json
{
  "imageUrl": "https://img.alicdn.com/imgextra/i1/123/O1CN01shirt.jpg"
}
```

行为：

- 校验 `id` 是正整数。
- 校验 `imageUrl` 是字符串且长度不超过现有衣物 `imageUrl` 限制。
- 重建该衣物候选集合，确认请求 URL 在候选集合内。
- 调用现有下载校验逻辑保存本地缩略图。
- 成功后更新：
  - `garments.image_url = downloaded.localUrl`
  - `garments.cutout_image_url = NULL`
  - `garments.updated_at = CURRENT_TIMESTAMP`
- 返回更新后的 `Garment`。

错误处理：

- 衣物不存在返回 `NOT_FOUND`。
- URL 不在候选集合中返回 `VALIDATION_ERROR`。
- 下载失败返回 `THUMBNAIL_DOWNLOAD_FAILED`，提示用户换一张候选图或稍后重试。

## 后端结构

在 `server/db.ts` 增加小型数据访问函数：

- `listGarmentThumbnailCandidates(db, id, options)`：读取衣物、来源记录和采集产物，返回排序候选。
- `selectGarmentThumbnail(db, id, imageUrl, options)`：校验候选、下载本地文件、更新衣物主图并清空去背景图。

在 `server/services/thumbnails.ts` 复用现有能力：

- 继续使用 `rankThumbnailCandidates()` 做 URL 排序。
- 继续使用 `downloadGarmentThumbnail()` 做域名、重定向、大小、类型和图片头校验。
- 候选归一化、去重和安全判断保留在后端；前端只展示后端返回的候选，不复制安全规则。

在 `server/routes.ts` 增加两个路由，并把测试可注入的缩略图选项沿用现有 `ApiAppOptions`。

## 前端结构

在 `src/shared/types.ts` 增加：

- `ThumbnailCandidate`
- `GarmentThumbnailCandidatesResponse`

在 `src/api.ts` 增加：

- `getGarmentThumbnailCandidates(id)`
- `selectGarmentThumbnail(id, imageUrl)`

在 `src/App.tsx` 中：

- `WardrobeView` 增加 `onOpenThumbnailPicker` 属性。
- 每个商品行操作区增加图片按钮，使用现有 lucide 图标。
- App 级状态保存当前打开的衣物、候选列表、加载状态和保存状态。
- 增加 `ThumbnailPicker` 组件，负责展示候选图网格、当前选中态、保存按钮和错误状态。
- 保存成功后用返回的 `Garment` 更新 `garments` state。

在 `src/styles.css` 中：

- 增加轻量弹窗、候选图网格、选中态和加载失败占位样式。
- 移动端候选图网格保持两列或单列，避免文字和按钮重叠。

## 数据与覆盖规则

- 用户选择的最终值是本地缩略图 URL，因此已有 `chooseImageForUpdate()` 会保留它，不会被后续详情导入覆盖。
- `refreshGarmentThumbnails()` 已跳过本地缩略图，因此不会覆盖用户选择。
- 选择新主图时清空 `cutout_image_url`，因为旧去背景图是基于旧主图生成的。
- 不删除旧本地缩略图文件，避免误删仍被其他记录或历史数据引用的缓存。

## 安全与隐私

- 候选接口只返回当前衣物关联来源和同 `itemId` 采集产物中的图片。
- 选择接口必须重新在后端构建候选集合，不能信任前端传回的任意 URL。
- 下载仍只允许淘宝图片域名，拒绝私网、localhost、非 HTTP(S)、data URL、文件 URL 和外站。
- 不把远程图片永久作为用户选择结果；选择成功后保存为本地缩略图路径。

## 测试计划

后端测试：

- 候选接口返回当前衣物的订单图、详情图和采集图，并按现有排序分数排序。
- 候选接口不返回其他 `itemId` 的采集图片。
- 选择接口拒绝不在候选集合内的 URL。
- 选择接口拒绝外站或私网 URL。
- 选择接口成功后下载文件，更新 `garments.image_url` 为本地 URL，并清空 `cutout_image_url`。

前端测试：

- 衣服库商品行渲染“选择缩略图”入口。
- 点击入口会加载候选图并展示候选网格。
- 选择候选并保存会调用 API，成功后更新该商品缩略图。
- 候选加载失败或保存失败时显示错误，不破坏衣服列表。

验证命令：

```powershell
npm test
npm run typecheck
```
