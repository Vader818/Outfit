# Outfit Quiet Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Outfit frontend into the approved quiet premium workbench direction while preserving all existing local wardrobe, recommendation, import, settings, and privacy behavior.

**Architecture:** Keep the current React/Vite single-tab architecture and avoid backend or data-contract changes. Extend the existing lightweight workbench component layer, then restyle and restructure the key views in place: recommendation, wardrobe, history, import, and settings. Use CSS tokens and existing class hooks to create a colder, more professional workbench, with no liquid-glass filters and no new component library.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind v4, DaisyUI, lucide-react, Vitest, PowerShell, Playwright for visual QA.

---

## File Structure

- Modify `src/components/workbench.tsx`: add small semantic component props and wrappers without moving business logic out of `App.tsx`.
- Modify `src/App.tsx`: update markup class hooks for the recommendation, wardrobe, history, import, settings, and auth/loading surfaces. Preserve all props, callbacks, data transformations, and exported helper functions.
- Modify `src/styles.css`: replace the soft multicolor background and card-heavy styling with the quiet workbench token system, refined surfaces, responsive layout, and clearer state semantics.
- Modify `tests/app.test.tsx`: update CSS and markup assertions to lock the quiet workbench rules instead of the previous background gradients.
- Create screenshots under `output/playwright/` during verification only. This directory is ignored and should not be committed.

Do not modify:

- `server/*`
- `src/api.ts`
- `src/shared/types.ts`
- `data/*`
- `output/taobao-captures/*`
- `output/chrome-taobao-profile/*`
- `output/playwright-taobao-profile/*`

---

### Task 1: Lock Quiet Workbench Expectations In Tests

**Files:**
- Modify: `tests/app.test.tsx`

- [ ] **Step 1: Replace the ordinary background test with quiet workbench token assertions**

In `tests/app.test.tsx`, replace the test named `keeps ordinary background styling without liquid material tokens` with:

```tsx
  it("keeps quiet workbench styling without liquid material tokens", () => {
    const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

    expect(cssRule(styles, ":root")).not.toMatch(/--liquid-/);
    expect(cssRule(styles, ":root")).toMatch(/--app-primary:\s*#0f766e;/);
    expect(cssRule(styles, ":root")).toMatch(/--app-canvas:\s*#eef3f1;/);
    expect(cssRule(styles, "body")).toMatch(/background:\s*var\(--app-canvas\);/);
    expect(cssRule(styles, "body")).not.toMatch(/244,\s*114,\s*182/);
    expect(cssRule(styles, "body")).not.toMatch(/255,\s*247,\s*237/);
    expect(cssRule(styles, ".auth-shell")).toMatch(/background:\s*var\(--app-canvas\);/);
  });
```

- [ ] **Step 2: Add a markup test for the recommendation decision panel**

After the existing test `renders recommendation workbench header stats and weather context`, add:

```tsx
  it("renders recommendation as a decision panel with context and outfit surfaces", () => {
    const weather = makeWeather();
    const recommendations: RecommendationResult = {
      weather,
      occasion: "casual",
      outfits: [makeOutfit()]
    };

    const markup = renderToStaticMarkup(
      <RecommendationView
        weather={weather}
        recommendations={recommendations}
        occasion="casual"
        latitude="39.9042"
        longitude="116.4074"
        busy={false}
        recordingOutfitId={null}
        wearLogFeedback={null}
        onOccasion={vi.fn()}
        onFetchWeather={vi.fn()}
        onGenerate={vi.fn()}
        onRecordWearLog={vi.fn()}
      />
    );

    expect(markup).toContain('class="page-header recommendation-hero"');
    expect(markup).toContain('class="command-bar recommendation-command decision-command"');
    expect(markup).toContain('class="weather-band context-band compact-context"');
    expect(markup).toContain('class="outfit-grid decision-grid"');
    expect(markup).toContain('class="outfit decision-card"');
    expect(markup).not.toContain("liquid-");
  });
```

- [ ] **Step 3: Add a markup test for wardrobe row hierarchy**

After the existing test `renders wardrobe bulk state and row editing inside stable workbench regions`, add:

```tsx
  it("renders wardrobe rows with quiet hierarchy hooks", () => {
    const markup = renderToStaticMarkup(
      <WardrobeView
        garments={[makeGarment(1, "white shirt", "top"), makeGarment(2, "black pants", "bottom", { excluded: true })]}
        selectedIds={[1]}
        busy={false}
        onRefresh={vi.fn()}
        onSelect={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onBulkConfirm={vi.fn()}
      />
    );

    expect(markup).toContain('class="filter-bar quiet-filter-bar"');
    expect(markup).toContain('class="batch-strip selection-strip"');
    expect(markup).toContain('class="garment-row quiet-garment-row"');
    expect(markup).toContain('class="garment-row quiet-garment-row muted"');
    expect(markup).toContain('class="garment-editor garment-attribute-grid"');
    expect(markup).toContain('class="garment-actions-row compact-action-grid"');
  });
```

- [ ] **Step 4: Update dense layout CSS assertions**

Replace the existing test `defines expanded workbench tokens and dense layout utilities` with:

```tsx
  it("defines quiet workbench tokens and dense layout utilities", () => {
    const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

    expect(cssRule(styles, ":root")).toMatch(/--app-surface-solid:\s*#ffffff;/);
    expect(cssRule(styles, ":root")).toMatch(/--app-surface-muted:\s*#f7faf9;/);
    expect(cssRule(styles, ":root")).toMatch(/--space-3:\s*12px;/);
    expect(cssRule(styles, ".command-bar")).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto;/);
    expect(cssRule(styles, ".batch-strip")).toMatch(/position:\s*sticky;/);
    expect(cssRule(styles, ".quiet-garment-row")).toMatch(/box-shadow:\s*none;/);
    expect(cssRule(styles, ".decision-card")).toMatch(/box-shadow:\s*var\(--app-shadow\);/);
    expect(cssRule(styles, ".vision-model-table")).toMatch(/display:\s*grid;/);
  });
```

- [ ] **Step 5: Run the targeted tests and verify they fail**

Run:

```powershell
npm test -- tests/app.test.tsx
```

Expected: FAIL because CSS tokens and new class hooks have not been implemented yet.

- [ ] **Step 6: Commit the failing tests**

Run:

```powershell
git add tests/app.test.tsx
git commit -m "test: lock quiet workbench frontend expectations"
```

---

### Task 2: Extend Workbench Component Hooks

**Files:**
- Modify: `src/components/workbench.tsx`
- Test: `tests/app.test.tsx`

- [ ] **Step 1: Update `PageHeader` to support variants**

Replace the current `PageHeader` function in `src/components/workbench.tsx` with:

```tsx
export function PageHeader({
  title,
  description,
  children,
  className,
  variant = "default"
}: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
  variant?: "default" | "hero";
}) {
  return (
    <header className={cx("page-header", variant === "hero" && "page-header-hero", className)}>
      <div className="page-header-copy">
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {children ? <div className="page-header-aside">{children}</div> : null}
    </header>
  );
}
```

- [ ] **Step 2: Update `WorkbenchPanel` to support visual level hooks**

Replace the current `WorkbenchPanel` function with:

```tsx
export function WorkbenchPanel({
  children,
  className,
  level = "default"
}: {
  children: ReactNode;
  className?: string;
  level?: "default" | "quiet" | "strong";
}) {
  return <div className={cx("panel workbench-panel", `workbench-panel-${level}`, className)}>{children}</div>;
}
```

- [ ] **Step 3: Add two small semantic wrappers**

Add these exports after `WorkbenchPanel`:

```tsx
export function SurfaceSection({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("surface-section", className)}>{children}</section>;
}

export function SummaryStrip({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("summary-strip", className)}>{children}</div>;
}
```

- [ ] **Step 4: Run workbench-related tests**

Run:

```powershell
npm test -- tests/app.test.tsx
```

Expected: still FAIL because `App.tsx` and CSS hooks are not yet implemented, but no TypeScript error from `workbench.tsx`.

- [ ] **Step 5: Commit the component hook changes**

Run:

```powershell
git add src/components/workbench.tsx
git commit -m "feat: add quiet workbench component hooks"
```

---

### Task 3: Apply Quiet Workbench Markup Hooks

**Files:**
- Modify: `src/App.tsx`
- Test: `tests/app.test.tsx`

- [ ] **Step 1: Update the workbench component import**

At the top of `src/App.tsx`, replace:

```tsx
import { ActionCluster, CommandBar, PageHeader, SettingsSection, StatTile, StatusPill, WorkbenchPanel } from "./components/workbench";
```

with:

```tsx
import { ActionCluster, CommandBar, PageHeader, SettingsSection, StatTile, StatusPill, SummaryStrip, WorkbenchPanel } from "./components/workbench";
```

- [ ] **Step 2: Update recommendation page header and command hooks**

In `RecommendationView`, replace:

```tsx
    <section className="view">
      <PageHeader title="今日推荐" description="默认工作台首页，按天气、场合和本地衣橱生成今日搭配。">
```

with:

```tsx
    <section className="view recommendation-view">
      <PageHeader
        className="recommendation-hero"
        variant="hero"
        title="今日推荐"
        description="按天气、场合和本地衣橱生成今日搭配。"
      >
```

Then replace:

```tsx
      <CommandBar className="recommendation-command">
```

with:

```tsx
      <CommandBar className="recommendation-command decision-command">
```

- [ ] **Step 3: Update recommendation weather, grid, and card hooks**

In `RecommendationView`, replace:

```tsx
        <div className="weather-band context-band">
```

with:

```tsx
        <div className="weather-band context-band compact-context">
```

Replace:

```tsx
        <div className="outfit-grid">
```

with:

```tsx
        <div className="outfit-grid decision-grid">
```

Replace:

```tsx
          <article className="outfit" key={outfit.id}>
```

with:

```tsx
          <article className="outfit decision-card" key={outfit.id}>
```

- [ ] **Step 4: Update wardrobe filter, batch, row, and action hooks**

In `WardrobeView`, replace:

```tsx
      <div className="filter-bar">
```

with:

```tsx
      <div className="filter-bar quiet-filter-bar">
```

Replace:

```tsx
      <div className="batch-strip">
```

with:

```tsx
      <SummaryStrip className="batch-strip selection-strip">
```

and replace the matching closing `</div>` immediately after the batch actions with:

```tsx
      </SummaryStrip>
```

Replace:

```tsx
          <article className={item.excluded ? "garment-row muted" : "garment-row"} key={item.id} title={garmentMeta(item).rawName || undefined}>
```

with:

```tsx
          <article className={item.excluded ? "garment-row quiet-garment-row muted" : "garment-row quiet-garment-row"} key={item.id} title={garmentMeta(item).rawName || undefined}>
```

Replace:

```tsx
            <div className="garment-editor">
```

with:

```tsx
            <div className="garment-editor garment-attribute-grid">
```

Replace:

```tsx
            <div className="garment-actions-row">
```

with:

```tsx
            <div className="garment-actions-row compact-action-grid">
```

- [ ] **Step 5: Update history page hooks**

In `HistoryInsightsView`, replace:

```tsx
    <section className="view">
```

with:

```tsx
    <section className="view history-view">
```

Replace the first metrics block:

```tsx
          <div className="metric-strip">
```

with:

```tsx
          <div className="metric-strip insight-summary-strip">
```

Replace the health panel opening:

```tsx
            <div className="panel card insight-health-panel">
```

with:

```tsx
            <div className="panel card insight-health-panel diagnostic-panel">
```

- [ ] **Step 6: Update import and settings panel levels**

In `ImportView`, replace:

```tsx
      <WorkbenchPanel className="selenium-panel capture-step">
```

with:

```tsx
      <WorkbenchPanel className="selenium-panel capture-step" level="strong">
```

Replace:

```tsx
        <WorkbenchPanel className="bookmarklet-step">
```

with:

```tsx
        <WorkbenchPanel className="bookmarklet-step" level="quiet">
```

In `SettingsView`, replace:

```tsx
      <WorkbenchPanel className="settings-panel">
```

with:

```tsx
      <WorkbenchPanel className="settings-panel" level="quiet">
```

- [ ] **Step 7: Run targeted tests and verify class-hook failures are resolved**

Run:

```powershell
npm test -- tests/app.test.tsx
```

Expected: FAIL only on CSS assertions that still require the new token and style implementation.

- [ ] **Step 8: Commit markup hooks**

Run:

```powershell
git add src/App.tsx
git commit -m "feat: add quiet workbench view hooks"
```

---

### Task 4: Rebuild Core CSS Tokens And Global Surfaces

**Files:**
- Modify: `src/styles.css`
- Test: `tests/app.test.tsx`

- [ ] **Step 1: Replace root token block**

In `src/styles.css`, replace the current `:root` block with:

```css
:root {
  color: #111827;
  background: #eef3f1;
  font-family: Inter, "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  --app-ink: #111827;
  --app-ink-soft: #2f3a48;
  --app-muted: #64748b;
  --app-subtle: #8a98aa;
  --app-canvas: #eef3f1;
  --app-line: #d7e0dc;
  --app-border: rgba(190, 202, 199, 0.92);
  --app-border-strong: rgba(92, 112, 108, 0.34);
  --app-surface: rgba(255, 255, 255, 0.94);
  --app-surface-solid: #ffffff;
  --app-surface-muted: #f7faf9;
  --app-surface-raised: #fbfdfc;
  --app-soft: #edf4f1;
  --app-primary: #0f766e;
  --app-primary-strong: #115e59;
  --app-primary-soft: #d7f3ec;
  --app-accent: #2563eb;
  --app-accent-soft: #e6eefc;
  --app-success: #15803d;
  --app-success-soft: #e7f5eb;
  --app-warn: #a16207;
  --app-warn-soft: #fff7df;
  --app-danger: #b91c1c;
  --app-danger-soft: #fee7e7;
  --app-focus: rgba(15, 118, 110, 0.24);
  --app-shadow: 0 18px 48px rgba(17, 24, 39, 0.1);
  --app-shadow-soft: 0 8px 24px rgba(17, 24, 39, 0.055);
  --app-shadow-strong: 0 28px 80px rgba(17, 24, 39, 0.22);
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --radius-control: 8px;
  --radius-surface: 10px;
}
```

- [ ] **Step 2: Replace global body background**

Replace the current `body` rule with:

```css
body {
  margin: 0;
  min-width: 320px;
  min-height: 100dvh;
  color: var(--app-ink);
  background: var(--app-canvas);
}
```

- [ ] **Step 3: Update app shell and sidebar viewport units**

In `.app-shell`, replace `min-height: 100vh;` with:

```css
  min-height: 100dvh;
```

In `.sidebar`, replace `height: 100vh;` with:

```css
  height: 100dvh;
```

Replace the `.sidebar` background with:

```css
  background:
    linear-gradient(180deg, rgba(15, 118, 110, 0.2), transparent 44%),
    #101820;
```

- [ ] **Step 4: Update auth shell background**

Replace the current `.auth-shell` background declarations with:

```css
  background: var(--app-canvas);
```

Keep the rest of `.auth-shell` unchanged.

- [ ] **Step 5: Update base page surfaces**

In `.view-header, .page-header`, replace the radius and shadow declarations with:

```css
  border-radius: var(--radius-surface);
  background: var(--app-surface-solid);
  box-shadow: var(--app-shadow-soft);
```

In `.panel`, replace the radius, background, and shadow declarations with:

```css
  border-radius: var(--radius-surface);
  background: var(--app-surface);
  box-shadow: none;
```

- [ ] **Step 6: Add workbench panel levels and surface utilities**

Add after `.workbench-panel`:

```css
.workbench-panel-default {
  background: var(--app-surface-solid);
}

.workbench-panel-quiet {
  background: var(--app-surface-muted);
  box-shadow: none;
}

.workbench-panel-strong {
  background: var(--app-surface-solid);
  box-shadow: var(--app-shadow-soft);
}

.surface-section,
.summary-strip {
  border: 1px solid var(--app-border);
  border-radius: var(--radius-surface);
  background: var(--app-surface-solid);
}
```

- [ ] **Step 7: Run tests for CSS tokens**

Run:

```powershell
npm test -- tests/app.test.tsx
```

Expected: CSS token tests from Task 1 pass. Some later visual CSS assertions may still fail until Task 5 and Task 6 are implemented.

- [ ] **Step 8: Commit CSS token rebuild**

Run:

```powershell
git add src/styles.css tests/app.test.tsx
git commit -m "feat: rebuild quiet workbench design tokens"
```

---

### Task 5: Refine Recommendation And Navigation Styling

**Files:**
- Modify: `src/styles.css`
- Test: `tests/app.test.tsx`

- [ ] **Step 1: Add recommendation hero and decision command styles**

Add after `.page-header-aside`:

```css
.page-header-hero {
  min-height: 210px;
  align-items: stretch;
  background:
    linear-gradient(135deg, rgba(15, 118, 110, 0.08), rgba(255, 255, 255, 0) 38%),
    var(--app-surface-solid);
}

.recommendation-hero .page-header-copy {
  align-content: start;
  padding: 4px 0;
}

.recommendation-hero h1 {
  font-size: clamp(32px, 4vw, 52px);
  letter-spacing: 0;
}

.decision-command {
  border-color: rgba(15, 118, 110, 0.18);
  background: var(--app-surface-solid);
}

.compact-context {
  min-height: 52px;
  background: var(--app-surface-muted);
}
```

- [ ] **Step 2: Add decision grid and card styles**

Replace the existing `.outfit-grid`, `.outfit`, `.outfit-card-head`, `.score`, `.mini-item`, `.outfit-reasons`, `.outfit-more`, and `.outfit-actions` rules with:

```css
.outfit-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr));
  align-items: start;
  gap: 16px;
}

.decision-grid {
  gap: 18px;
}

.outfit {
  position: relative;
  display: grid;
  align-content: start;
  gap: 14px;
  padding: 18px;
  border: 1px solid rgba(190, 202, 199, 0.9);
  border-radius: var(--radius-surface);
  background: var(--app-surface-solid);
  box-shadow: var(--app-shadow);
}

.decision-card {
  overflow: hidden;
}

.decision-card::before {
  position: absolute;
  inset: 0 0 auto;
  height: 4px;
  background: var(--app-primary);
  content: "";
}

.outfit-card-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding-top: 2px;
}

.score {
  justify-self: start;
  align-self: start;
  width: max-content;
  max-width: 100%;
  padding: 7px 10px;
  border-radius: 8px;
  color: #ffffff;
  background: #101820;
  font-weight: 850;
  text-align: center;
}

.mini-item {
  display: grid;
  grid-template-columns: 50px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 10px;
  border: 1px solid rgba(215, 224, 220, 0.8);
  border-radius: 8px;
  background: var(--app-surface-muted);
}

.mini-item .thumb {
  width: 50px;
  border-radius: 8px;
}

.mini-item span {
  display: block;
  color: var(--app-muted);
  font-size: 12px;
  font-weight: 700;
}

.mini-item strong {
  display: block;
  color: #172033;
  font-size: 14px;
  overflow-wrap: anywhere;
}

.outfit-reasons {
  margin: 0;
  padding: 12px 12px 12px 28px;
  border-radius: 8px;
  background: var(--app-surface-muted);
}

.outfit-more {
  display: grid;
  gap: 8px;
}

.outfit-more summary {
  cursor: pointer;
  color: var(--app-primary);
  font-weight: 800;
}

.outfit-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
```

- [ ] **Step 3: Refine nav and mobile viewport units**

In the mobile media query `@media (max-width: 920px)`, replace:

```css
    height: calc(100vh - 92px);
```

with:

```css
    height: calc(100dvh - 92px);
```

In `.sidebar` under the same media query, keep the pill layout but replace the background with:

```css
    background:
      linear-gradient(135deg, rgba(15, 118, 110, 0.22), transparent 42%),
      #101820;
```

- [ ] **Step 4: Run recommendation tests**

Run:

```powershell
npm test -- tests/app.test.tsx
```

Expected: recommendation markup and score layout tests pass.

- [ ] **Step 5: Commit recommendation styling**

Run:

```powershell
git add src/styles.css
git commit -m "feat: refine recommendation workbench styling"
```

---

### Task 6: Refine Wardrobe, History, Import, And Settings Styling

**Files:**
- Modify: `src/styles.css`
- Test: `tests/app.test.tsx`

- [ ] **Step 1: Replace filter and batch strip styles**

Replace the existing `.filter-bar` and `.batch-strip` rules with:

```css
.filter-bar {
  position: sticky;
  top: 14px;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-surface);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: none;
}

.quiet-filter-bar {
  background: var(--app-surface-solid);
}

.batch-strip {
  position: sticky;
  top: 88px;
  z-index: 2;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 12px;
  border: 1px solid rgba(15, 118, 110, 0.2);
  border-radius: var(--radius-surface);
  color: #115e59;
  background: rgba(237, 250, 246, 0.98);
  box-shadow: none;
  font-weight: 800;
}

.selection-strip {
  border-color: rgba(15, 118, 110, 0.22);
}
```

- [ ] **Step 2: Replace wardrobe row styles**

Replace the existing `.garment-row`, `.garment-row-main`, `.garment-editor`, and `.garment-actions-row` rules with:

```css
.garment-row {
  display: grid;
  grid-template-columns: minmax(320px, 0.82fr) minmax(0, 1.4fr) minmax(0, auto);
  gap: 14px;
  align-items: start;
  padding: 14px;
  border: 1px solid rgba(190, 202, 199, 0.9);
  border-radius: var(--radius-surface);
  background: var(--app-surface-solid);
  box-shadow: none;
}

.quiet-garment-row {
  box-shadow: none;
}

.garment-row-main {
  display: grid;
  grid-template-columns: 24px 74px minmax(0, 1fr);
  gap: 14px;
  align-items: center;
  min-width: 0;
}

.garment-editor {
  display: grid;
  gap: 9px;
  min-width: 0;
  padding: 2px 0;
}

.garment-attribute-grid {
  align-content: start;
}

.garment-actions-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(6rem, 1fr));
  gap: 8px;
  min-width: 0;
  width: min(100%, 360px);
  max-width: 360px;
  align-self: stretch;
  align-content: start;
  justify-self: end;
}

.compact-action-grid {
  align-content: start;
}
```

- [ ] **Step 3: Prevent passive status controls from looking over-animated**

Replace the hover group:

```css
.primary:hover,
.secondary:hover,
.icon-button:hover,
.status:hover,
.chip:hover,
.season-chip:hover {
  transform: translateY(-1px);
}
```

with:

```css
.primary:hover,
.secondary:hover,
.icon-button:hover,
.chip:hover,
.season-chip:hover {
  transform: translateY(-1px);
}
```

Then add:

```css
.status:hover {
  background: #dbe4ef;
}
```

- [ ] **Step 4: Add history diagnostic styles**

Add after `.health-score.needs-attention`:

```css
.history-view .grid.two {
  align-items: start;
}

.insight-summary-strip {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 10rem), 1fr));
}

.diagnostic-panel {
  box-shadow: var(--app-shadow-soft);
}
```

- [ ] **Step 5: Update import, settings, and model surfaces**

Replace `.advanced-import` background and radius declarations with:

```css
  border-radius: var(--radius-surface);
  background: var(--app-surface-solid);
  box-shadow: none;
```

Replace `.settings-section` radius and background declarations with:

```css
  border-radius: var(--radius-surface);
  background: var(--app-surface-solid);
```

Replace `.vision-model-row` radius and background declarations with:

```css
  border-radius: var(--radius-surface);
  background: var(--app-surface-solid);
```

- [ ] **Step 6: Run the app test suite**

Run:

```powershell
npm test -- tests/app.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit page styling refinements**

Run:

```powershell
git add src/styles.css
git commit -m "feat: refine wardrobe and insight styling"
```

---

### Task 7: Full Verification And Visual QA

**Files:**
- Modify only if verification reveals defects: `src/App.tsx`, `src/styles.css`, `tests/app.test.tsx`
- Generated but ignored: `output/playwright/*.png`

- [ ] **Step 1: Run all automated checks**

Run:

```powershell
npm test
npm run typecheck
npm run build
```

Expected: all commands complete successfully.

- [ ] **Step 2: Start the app if it is not already running**

Check ports:

```powershell
Get-NetTCPConnection -LocalPort 5174 -ErrorAction SilentlyContinue
Get-NetTCPConnection -LocalPort 8788 -ErrorAction SilentlyContinue
```

If either command returns no listener, start the app:

```powershell
npm run dev
```

Expected: web app responds at `http://127.0.0.1:5174` and API responds at `http://127.0.0.1:8788/api/auth/status`.

- [ ] **Step 3: Capture desktop and mobile visual QA screenshots**

Use Playwright or the in-app browser to capture these pages at minimum:

```text
output/playwright/quiet-desktop-recommend.png
output/playwright/quiet-mobile-recommend.png
output/playwright/quiet-desktop-wardrobe.png
output/playwright/quiet-mobile-wardrobe.png
output/playwright/quiet-desktop-settings.png
output/playwright/quiet-mobile-thumbnail-modal.png
```

Expected: screenshots show the quiet workbench direction with no obvious overlap, clipped controls, unreadable buttons, or mobile nav obstruction.

- [ ] **Step 4: Inspect the generated screenshots**

Open each screenshot and check:

- The body background is cold grey-green, not pink, warm beige, or blue glow.
- Sidebar is dark and stable.
- Recommendation page has a strong decision panel and readable cards.
- Wardrobe rows are scannable and not visually dominated by button blocks.
- History page has a clear diagnostic hierarchy.
- Mobile bottom nav does not cover primary content.
- Button text stays on one line where practical.

- [ ] **Step 5: Fix any visual regression with the smallest focused patch**

If a screenshot shows overlap or low contrast, patch only the affected CSS rule. Example for mobile nav overlap:

```css
@media (max-width: 920px) {
  .workspace {
    padding-bottom: 118px;
  }
}
```

Then rerun:

```powershell
npm test -- tests/app.test.tsx
npm run build
```

Expected: checks still pass.

- [ ] **Step 6: Final design pre-flight**

Search current frontend code for banned regressions:

```powershell
Select-String -Path 'src\\App.tsx','src\\components\\workbench.tsx','src\\styles.css' -Pattern 'liquid-|backdrop-filter|Scroll to|BETA|INVITE|V0\\.|v0\\.|244, 114, 182|255, 247, 237' -Encoding UTF8
```

Expected: no matches that indicate liquid glass, decorative scroll cues, version labels, pink background, or warm beige background.

- [ ] **Step 7: Commit final fixes**

Run:

```powershell
git status --short
git add src/App.tsx src/components/workbench.tsx src/styles.css tests/app.test.tsx
git commit -m "feat: ship quiet workbench redesign"
```

Expected: commit succeeds. `output/playwright/` screenshots remain ignored.

---

## Plan Self-Review

Spec coverage:

- Quiet A direction is implemented through Task 4, Task 5, and Task 6.
- Recommendation page hierarchy is covered by Task 3 and Task 5.
- Wardrobe hierarchy is covered by Task 3 and Task 6.
- History diagnostics are covered by Task 3 and Task 6.
- Import and settings alignment are covered by Task 3 and Task 6.
- No backend, API, schema, or data behavior changes are included.
- Automatic and visual verification are covered by Task 7.

Placeholder scan:

- No placeholder markers or undefined vague task remains.
- Every code-edit step includes the exact code or exact replacement.
- Every verification step includes exact commands and expected results.

Type consistency:

- `PageHeader` uses `variant?: "default" | "hero"`.
- `WorkbenchPanel` uses `level?: "default" | "quiet" | "strong"`.
- `SummaryStrip` is imported and used only as a light wrapper.
- New class hooks used in tests match the markup plan and CSS plan.
