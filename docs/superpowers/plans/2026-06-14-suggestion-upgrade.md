# Suggestion Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 执行 `suggestion.md` 的安全、隐私、任务控制、依赖治理和文档升级，同时保留 Selenium 淘宝登录态。

**Architecture:** 保持本地单用户应用边界：Express 继续绑定本地，缩略图只能由后端受控下载到本地缓存，前端默认只渲染本地缩略图。采集任务统一到 job 模型，保留旧接口兼容但不再 detached。隐私清理只作为显式命令提供，不自动运行。

**Tech Stack:** React 18、Vite/Vitest、Express 5、Node `node:sqlite`、Python Selenium、Vitest、pytest、GitHub Actions。

---

### Task 1: 依赖升级与脚本治理

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: 建立基线**

Run: `npm test`
Expected: 当前测试通过或记录已有失败。

- [ ] **Step 2: 升级建议指定链路**

Run: `npm install -D vite@8.0.16 vitest@4.1.8 @vitejs/plugin-react@6.0.2`
Expected: `package.json` 和 `package-lock.json` 更新。

- [ ] **Step 3: 增加显式脚本**

在 `package.json` 中加入：

```json
"typecheck": "tsc -p tsconfig.json --noEmit",
"lint": "npm run typecheck",
"privacy:clean": "node scripts/privacy-clean.mjs"
```

`privacy:clean` 只在用户主动执行时删除敏感本地数据；本次升级不运行该命令。

- [ ] **Step 4: 验证**

Run: `npm audit --package-lock-only --audit-level=high`
Expected: high/critical 漏洞为 0。

### Task 2: 缩略图下载安全边界

**Files:**
- Modify: `server/services/thumbnails.ts`
- Modify: `tests/thumbnail.test.ts`

- [ ] **Step 1: 写红灯测试**

新增测试覆盖：

```ts
it("rejects private and non-Taobao thumbnail URLs before fetching", async () => {
  const fetchMock = vi.fn();
  const result = await downloadGarmentThumbnail({
    garmentId: 1,
    category: "top",
    title: "白色衬衫",
    candidates: ["http://127.0.0.1/private.jpg", "https://example.com/not-allowed.jpg"],
    outputDir,
    delayMs: 0,
    fetcher: fetchMock
  });
  expect(result).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});
```

Expected before implementation: FAIL，因为当前会请求非 allowlist URL。

- [ ] **Step 2: 实现 allowlist、私网阻断、超时、Content-Length 和 streaming 上限**

核心接口：

```ts
const DEFAULT_ALLOWED_IMAGE_HOST_SUFFIXES = [".alicdn.com", ".taobaocdn.com"];
const DEFAULT_MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;
const DEFAULT_THUMBNAIL_TIMEOUT_MS = 5000;
```

下载前解析 `URL`，只允许 `http/https` 且 hostname 属于 allowlist，阻断 `localhost`、loopback、私网、链路本地和 `fc00::/7`。使用 `AbortController` 和 `ReadableStream` 累计读取。

- [ ] **Step 3: 验证**

Run: `npm test -- tests/thumbnail.test.ts`
Expected: 新旧缩略图测试通过。

### Task 3: 前端远程图隐私

**Files:**
- Modify: `src/App.tsx`
- Modify: `tests/app.test.tsx`

- [ ] **Step 1: 写红灯测试**

新增测试确认远程 `imageUrl` 不作为默认 `img src`：

```ts
const markup = renderToStaticMarkup(<>{WardrobeView?.({ garments: [makeGarment(1, "衬衫", "top", { imageUrl: "https://img.alicdn.com/remote.jpg" })], ...props })}</>);
expect(markup).not.toContain("https://img.alicdn.com/remote.jpg");
```

Expected before implementation: FAIL。

- [ ] **Step 2: 实现本地缩略图白名单**

`GarmentThumbnail` 只在 `item.imageUrl.startsWith("/api/garment-thumbnails/")` 时渲染 `<img>`，同时设置 `loading="lazy"`、`decoding="async"`、`referrerPolicy="no-referrer"`；否则显示占位图。

- [ ] **Step 3: 验证**

Run: `npm test -- tests/app.test.tsx`
Expected: 前端渲染测试通过。

### Task 4: Express 安全中间件、限速和错误脱敏

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `server/routes.ts`
- Modify: `tests/api.test.ts`

- [ ] **Step 1: 写红灯测试**

覆盖 Helmet 安全头、登录失败限速、mutating Origin 拒绝、未知错误返回 500。

- [ ] **Step 2: 安装 Helmet**

Run: `npm install helmet`

- [ ] **Step 3: 实现中间件**

在 `createApiApp()` 初始化时加入 Helmet CSP/referrer-policy；登录失败使用内存窗口按用户名+IP 限速；`POST/PUT/PATCH/DELETE` 校验 `Origin` 或 `Sec-Fetch-Site`；未知错误统一 `{ code: "INTERNAL_ERROR", message: "服务器错误" }`。

- [ ] **Step 4: 验证**

Run: `npm test -- tests/api.test.ts`
Expected: API 安全测试通过。

### Task 5: 输入校验和导入健壮性

**Files:**
- Modify: `server/validation.ts`
- Modify: `server/services/importTaobao.ts`
- Modify: `server/routes.ts`
- Modify: `tests/api.test.ts`
- Modify: `tests/importTaobao.test.ts`

- [ ] **Step 1: 写红灯测试**

覆盖 `/api/weather` 经纬度越界、`/api/garments/NaN`、import `items > 1000`、`rawText` 超长、畸形 percent URL 不抛异常、recommendation history 只保存 sanitized request。

- [ ] **Step 2: 实现限制**

上限按建议：`items <= 1000`、`rawText/detailRawText <= 8000`、`detailDescription <= 4000`、`detailImages <= 24`、`detailProps <= 80`、`URL <= 2048`、数组长度 <= 32、数组项 <= 64、`notes <= 1000`、`name/brand/size/color <= 120`。

- [ ] **Step 3: 验证**

Run: `npm test -- tests/api.test.ts tests/importTaobao.test.ts`
Expected: 输入边界测试通过。

### Task 6: Capture job 受控化

**Files:**
- Modify: `server/services/taobaoCapture.ts`
- Modify: `server/routes.ts`
- Modify: `tests/api.test.ts`
- Modify: `tests/taobaoCapture.test.ts`

- [ ] **Step 1: 写红灯测试**

覆盖第二个并发 job 返回 409、job stdout/stderr 写入 `capture.log`、artifact 超过 20 MB 拒绝、Windows cancel 使用进程树终止。

- [ ] **Step 2: 实现最小迁移**

`/api/capture/jobs` 默认只允许一个 running/pending job；legacy `/api/capture/taobao-orders` 和 `/api/capture/taobao-item` 改为调用 job 启动并返回兼容字段，不再 detached/unref；spawn stdout/stderr append 到 `capture.log`；取消时 Windows 使用 `taskkill /T /F /PID <pid>`，其他平台 kill 进程；artifact 读取前检查文件大小。

- [ ] **Step 3: 验证**

Run: `npm test -- tests/api.test.ts tests/taobaoCapture.test.ts`
Expected: capture 测试通过。

### Task 7: 数据库运行时和隐私清理命令

**Files:**
- Modify: `server/db.ts`
- Modify: `package.json`
- Create: `scripts/privacy-clean.mjs`
- Modify: `.gitignore`
- Modify: `README.md`

- [ ] **Step 1: 写红灯测试或脚本静态测试**

确认 `.gitignore` 包含 `data/`、`output/`、`logs/`；确认 `privacy:clean` 默认打印将删除的路径并需要显式 `--confirm` 才执行。

- [ ] **Step 2: 实现 DB 选项**

`createDatabase()` 使用 `DatabaseSync(databasePath, { timeout: 5000, allowExtension: false, enableForeignKeyConstraints: true, defensive: true, limits: { length: 10 * 1024 * 1024, variableNumber: 1000 } })`，并执行 `PRAGMA journal_mode = WAL`、`PRAGMA busy_timeout = 5000`。

- [ ] **Step 3: 实现隐私清理脚本**

脚本列出 `output/chrome-taobao-profile`、`output/taobao-captures`、`output/garment-thumbnails`、`logs`、`data/outfit.sqlite*`。没有 `--confirm` 时只提示，不删除。

### Task 8: CI 与文档

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Create: `requirements.lock.txt`

- [ ] **Step 1: CI 增补**

增加 `npm run lint`、`npm run typecheck`、`npm audit --omit=dev --audit-level=high`、`npm audit --audit-level=high`、Python `pip-audit`。

- [ ] **Step 2: Python lock**

生成或写入当前 Selenium 4.x 锁定版本，CI 优先安装 `requirements.lock.txt`。

- [ ] **Step 3: README 隐私说明**

增加“数据删除/导出/备份”和 PWA 缓存边界，明确 Selenium profile 可能包含淘宝登录态，`privacy:clean --confirm` 会删除登录态。

### Task 9: 完整验证

**Files:**
- Test only

- [ ] **Step 1: Node 测试**

Run: `npm test`
Expected: 全部通过。

- [ ] **Step 2: 构建**

Run: `npm run build`
Expected: exit 0。

- [ ] **Step 3: 审计**

Run: `npm audit --package-lock-only --audit-level=high`
Expected: high/critical 漏洞为 0。

- [ ] **Step 4: Python 测试**

Run: `python -m pytest tests`
Expected: 全部通过。

- [ ] **Step 5: 登录态复查**

Run: `Test-Path output/chrome-taobao-profile`
Expected: 目录存在性不因本次升级被改变；本次不执行清理命令。
