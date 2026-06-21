# 商品缩略图手动选择 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在衣服库为单件衣物提供安全的候选图选择，并把用户选择保存成本地缩略图。

**Architecture:** 后端负责候选收集、排序、安全过滤和最终选择校验；前端只展示后端候选并提交选择。保存后继续复用现有 `GarmentThumbnail`、衣服列表和推荐卡片数据结构。

**Tech Stack:** TypeScript, Express, SQLite/better-sqlite3, React, Vitest, Vite.

---

### Task 1: 后端候选 API

**Files:**
- Modify: `server/db.ts`
- Modify: `server/routes.ts`
- Modify: `src/shared/types.ts`
- Test: `tests/api.test.ts`

- [ ] **Step 1: Write failing tests**
  - Add a test for `GET /api/garments/:id/thumbnail-candidates`.
  - Seed one garment linked to one `source_order_items` row.
  - Create a temporary `taobao-captures` JSON file with matching and non-matching `itemId`.
  - Assert response includes current remote image, order image, detail images, matching capture images, sorted by descending score.
  - Assert response excludes external, private, data, file, and non-matching capture URLs.

- [ ] **Step 2: Run red test**
  - Run: `npm test -- tests/api.test.ts -t "returns selectable thumbnail candidates"`
  - Expected: FAIL because the route does not exist.

- [ ] **Step 3: Implement minimal API**
  - Add shared `ThumbnailCandidate` and `GarmentThumbnailCandidatesResponse` types.
  - Add `listGarmentThumbnailCandidates(db, id, options)` in `server/db.ts`.
  - Reuse `rankThumbnailCandidates()` for scoring.
  - Filter candidates to trusted Taobao image hosts and HTTP(S), then return `{ garmentId, currentImageUrl, candidates }`.
  - Add `GET /api/garments/:id/thumbnail-candidates` in `server/routes.ts`.

- [ ] **Step 4: Run green test**
  - Run: `npm test -- tests/api.test.ts -t "returns selectable thumbnail candidates"`
  - Expected: PASS.

### Task 2: 后端选择保存 API

**Files:**
- Modify: `server/db.ts`
- Modify: `server/routes.ts`
- Test: `tests/api.test.ts`

- [ ] **Step 1: Write failing tests**
  - Add a rejection test for `POST /api/garments/:id/thumbnail` when `imageUrl` is not in that garment's candidate set.
  - Add a success test where the selected URL downloads with test PNG bytes, `image_url` becomes local, and `cutout_image_url` is cleared.
  - Add a download failure test returning `THUMBNAIL_DOWNLOAD_FAILED` without changing DB values.

- [ ] **Step 2: Run red tests**
  - Run: `npm test -- tests/api.test.ts -t "selects a garment thumbnail"`
  - Expected: FAIL because the route does not exist.

- [ ] **Step 3: Implement minimal save path**
  - Add request body validation for `imageUrl` string length <= 2048.
  - Add `selectGarmentThumbnail(db, id, imageUrl, options)`.
  - Rebuild the candidate set server-side and require exact normalized candidate membership.
  - Call `downloadGarmentThumbnail()` with the selected URL.
  - On success, update `garments.image_url`, set `cutout_image_url = NULL`, and return `getGarmentById()`.
  - On no download, throw `ApiError("THUMBNAIL_DOWNLOAD_FAILED", ...)`.

- [ ] **Step 4: Run green tests**
  - Run: `npm test -- tests/api.test.ts -t "garment thumbnail"`
  - Expected: PASS.

### Task 3: Frontend API and UI

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/api.ts`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Test: `tests/app.test.tsx`

- [ ] **Step 1: Write failing tests**
  - Test `WardrobeView` renders a "选择缩略图" action when callback is provided.
  - Test the action calls `onOpenThumbnailPicker(item)`.
  - Test `ThumbnailPicker` renders candidates, selected state, error text, and disabled save state.
  - Test `styles.css` contains modal and candidate grid classes.

- [ ] **Step 2: Run red tests**
  - Run: `npm test -- tests/app.test.tsx -t "缩略图"`
  - Expected: FAIL because UI is not implemented.

- [ ] **Step 3: Implement minimal frontend**
  - Add `getGarmentThumbnailCandidates(id)` and `selectGarmentThumbnail(id, imageUrl)` to `src/api.ts`.
  - Add App-level picker state and handlers.
  - Pass `onOpenThumbnailPicker` into `WardrobeView`.
  - Add an icon button in `garment-actions-row`.
  - Add exported `ThumbnailPicker` component.
  - Add responsive modal/grid styles.

- [ ] **Step 4: Run green tests**
  - Run: `npm test -- tests/app.test.tsx -t "缩略图"`
  - Expected: PASS.

### Task 4: Final Verification

**Files:**
- Modify: `progress.md`
- Modify: `findings.md`

- [ ] **Step 1: Run typecheck**
  - Run: `npm run typecheck`
  - Expected: PASS.

- [ ] **Step 2: Run full test suite**
  - Run: `npm test`
  - Expected: PASS.

- [ ] **Step 3: Update planning files**
  - Mark stages complete in `task_plan.md`.
  - Append verification results to `progress.md`.
  - Record final implementation decisions in `findings.md`.
