import { Copy, Database, ExternalLink, Play, Sparkles, Upload } from "lucide-react";
import type { CaptureStartResult, ImportSummary } from "../../api";
import { Badge, Button, EmptyState, Field, Notice, PageIntro, Stat, Surface } from "../../components/ui";
import {
  CATEGORY_LABELS,
  TAOBAO_BOUGHT_ITEMS_URL,
  captureStatusLabel,
  type BusyAction
} from "../../shared/presentation";
import type {
  CaptureEngine,
  CaptureJob,
  ImportDecision,
  TaobaoImportCommitResult,
  TaobaoImportPreview,
  TaobaoWardrobeFilterSummary
} from "../../shared/types";
import { ImportReviewTable } from "./ImportReviewTable";
import {
  PurchaseCheckPanel,
  type PurchaseCheckResultView,
  type SimilarityVerdict
} from "./PurchaseCheckPanel";
import { eligiblePurchaseCheckCandidates } from "./purchaseCheckCandidates";

export type ImportViewMode = "import" | "purchase-check";

export interface ImportViewProps {
  mode?: ImportViewMode;
  bookmarklet: string;
  importText: string;
  importResult: ImportSummary | TaobaoImportCommitResult | null;
  importPreview?: TaobaoImportPreview | null;
  importDecisions?: Readonly<Record<string, ImportDecision | undefined>>;
  filterSummary: TaobaoWardrobeFilterSummary | null;
  captureUrl: string;
  captureEngine: CaptureEngine;
  captureResult: CaptureStartResult | CaptureJob | null;
  busy: boolean;
  busyAction?: BusyAction | null;
  onCopyBookmarklet: () => void;
  onImportText: (value: string) => void;
  onImport: () => void;
  onImportDecision?: (sourceItemKey: string, decision: ImportDecision) => void;
  onPreviewImport?: () => void;
  onCaptureUrl: (value: string) => void;
  onCaptureEngine: (value: CaptureEngine) => void;
  onStartOrdersCapture: () => void;
  onStartItemCapture: () => void;
  onReadLatestCapture: () => void;
  purchaseCheckResult?: PurchaseCheckResultView | null;
  purchaseCheckBusy?: boolean;
  purchaseCheckError?: string;
  purchaseCheckSourceItemKey?: string;
  feedbackBusyGarmentId?: number | null;
  onModeChange?: (mode: ImportViewMode) => void;
  onPurchaseCheckSourceItemKey?: (sourceItemKey: string) => void;
  onPurchaseCheck?: () => void;
  onSimilarityFeedback?: (comparedGarmentId: number, verdict: SimilarityVerdict) => void;
}

export function ImportView(props: ImportViewProps) {
  const mode = props.mode ?? "import";
  const attachBookmarkletHref = (element: HTMLAnchorElement | null) => {
    if (element) element.setAttribute("href", props.bookmarklet);
  };
  const captureStatus = props.captureResult && "status" in props.captureResult
    ? captureStatusLabel(props.captureResult.status)
    : "已启动";
  const captureTone = props.captureResult && "status" in props.captureResult
    ? props.captureResult.status === "failed"
      ? "danger"
      : props.captureResult.status === "succeeded"
        ? "success"
        : "info"
    : "info";
  const importDecisions = props.importDecisions ?? {};
  const purchaseCandidates = eligiblePurchaseCheckCandidates(props.importPreview);
  const purchaseInteractionBusy = Boolean(props.purchaseCheckBusy || props.feedbackBusyGarmentId != null);
  const hasIncludedDecision = Boolean(props.importPreview?.candidates.some((item) => {
    const decision = importDecisions[item.sourceItemKey];
    if (decision) return decision.include;
    return item.disposition === "create" || item.disposition === "update" || item.disposition === "refund-sync";
  }));
  const reviewedResult = props.importResult && "totalDecisions" in props.importResult.summary
    ? props.importResult as TaobaoImportCommitResult
    : null;

  return (
    <section className="view import-view" aria-busy={props.busy || purchaseInteractionBusy || undefined}>
      <PageIntro
        title={mode === "import" ? "从淘宝收进衣橱" : "购买前检查"}
        description={mode === "import"
          ? "在浏览器里完成采集，检查候选后再写入本地衣橱。"
          : "先与本地衣橱和保存搭配比较；检查不会把候选加入衣橱。"}
        actions={(
          <a className="ui-button ui-button--secondary ui-button--md" href={TAOBAO_BOUGHT_ITEMS_URL} target="_blank" rel="noreferrer">
            <ExternalLink aria-hidden="true" size={18} />
            打开已买到的宝贝
          </a>
        )}
      />

      <Surface className="import-mode" aria-labelledby="import-mode-title">
        <div>
          <h2 id="import-mode-title">处理方式</h2>
          <p>{mode === "import" ? "导入模式会在逐项确认后写入本地衣橱。" : "购买前检查模式只读取本地数据，不会加入衣橱。"}</p>
        </div>
        <div className="import-mode__actions" role="group" aria-label="选择处理方式">
          <Button
            variant={mode === "import" ? "primary" : "ghost"}
            aria-pressed={mode === "import"}
            disabled={props.busy || purchaseInteractionBusy}
            onClick={() => props.onModeChange?.("import")}
          >导入衣橱</Button>
          <Button
            variant={mode === "purchase-check" ? "primary" : "ghost"}
            aria-pressed={mode === "purchase-check"}
            disabled={props.busy || purchaseInteractionBusy}
            onClick={() => props.onModeChange?.("purchase-check")}
          >购买前检查</Button>
        </div>
      </Surface>

      <div className="capture-choice-grid">
        <Surface className="capture-choice capture-choice--orders">
          <div className="capture-choice__heading">
            <Badge tone="accent">订单列表</Badge>
            <div>
              <h2>批量收取已购买衣物</h2>
              <p>适合第一次建立衣橱，或补充最近购买的衣物。</p>
            </div>
          </div>
          <ol className="capture-choice__steps">
            <li>打开淘宝订单列表并完成登录。</li>
            <li>启动采集，浏览器会按页读取订单。</li>
            <li>返回这里读取产物并检查候选。</li>
          </ol>
          <Button
            disabled={props.busy}
            onClick={props.onStartOrdersCapture}
            variant="primary"
          >
            <Play aria-hidden="true" size={18} />
            {props.busyAction === "capture-orders" ? "采集中" : "采集订单页"}
          </Button>
        </Surface>

        <Surface className="capture-choice capture-choice--item">
          <div className="capture-choice__heading">
            <Badge tone="neutral">商品详情</Badge>
            <div>
              <h2>补充单件商品信息</h2>
              <p>粘贴商品链接，读取尺码、材质和详情图等信息。</p>
            </div>
          </div>
          <Field
            id="capture-item-url"
            label="商品链接"
            value={props.captureUrl}
            type="url"
            placeholder="https://item.taobao.com/item.htm?id=..."
            onChange={(event) => props.onCaptureUrl(event.target.value)}
          />
          <fieldset className="capture-engine-picker">
            <legend>采集引擎</legend>
            <div className="capture-engine-options">
              <label className={props.captureEngine === "selenium" ? "is-active" : undefined} htmlFor="capture-engine-selenium">
                <input
                  id="capture-engine-selenium"
                  type="radio"
                  name="item-capture-engine"
                  value="selenium"
                  checked={props.captureEngine === "selenium"}
                  onChange={() => props.onCaptureEngine("selenium")}
                />
                <span><strong>Selenium</strong><small>兼容现有采集流程</small></span>
              </label>
              <label className={props.captureEngine === "playwright" ? "is-active" : undefined} htmlFor="capture-engine-playwright">
                <input
                  id="capture-engine-playwright"
                  type="radio"
                  name="item-capture-engine"
                  value="playwright"
                  checked={props.captureEngine === "playwright"}
                  onChange={() => props.onCaptureEngine("playwright")}
                />
                <span><strong>Playwright</strong><small>适合交互式详情页</small></span>
              </label>
            </div>
          </fieldset>
          <Button
            disabled={props.busy || !props.captureUrl.trim()}
            onClick={props.onStartItemCapture}
            variant="primary"
          >
            <Play aria-hidden="true" size={18} />
            {props.busyAction === "capture-item" ? "采集中" : "采集商品详情"}
          </Button>
        </Surface>
      </div>

      {props.captureResult ? (
        <Notice tone={captureTone} role="status" title={props.captureResult.mode === "orders" ? "订单页采集" : "商品详情采集"}>
          <p>采集任务{captureStatus === "已启动" ? "已经启动" : `当前${captureStatus}`}。完成后读取最近产物，继续检查候选。</p>
          <details className="technical-details">
            <summary>技术详情</summary>
            <dl>
              <div><dt>PID</dt><dd>{props.captureResult.pid}</dd></div>
              <div><dt>输出目录</dt><dd>{props.captureResult.outputDir}</dd></div>
              {"logPath" in props.captureResult && props.captureResult.logPath ? <div><dt>日志</dt><dd>{props.captureResult.logPath}</dd></div> : null}
              {"artifactPath" in props.captureResult && props.captureResult.artifactPath ? <div><dt>产物</dt><dd>{props.captureResult.artifactPath}</dd></div> : null}
              {"error" in props.captureResult && props.captureResult.error ? <div><dt>错误</dt><dd>{props.captureResult.error}</dd></div> : null}
            </dl>
          </details>
        </Notice>
      ) : null}

      <Surface className="import-review-panel">
        <div className="import-review-panel__heading">
          <div>
            <h2>检查并加入衣橱</h2>
            <p>先读取最近一次采集产物，再预览候选。只有点击导入后才会写入本地衣橱。</p>
          </div>
          <div className="import-review-actions">
            <Button
              disabled={props.busy && props.busyAction !== "preview-import"}
              onClick={props.onReadLatestCapture}
            >
              <Database aria-hidden="true" size={18} />
              {props.busyAction === "read-capture" ? "读取中" : "读取产物"}
            </Button>
            <Button
              disabled={props.busy || !props.importText.trim() || !props.onPreviewImport}
              onClick={props.onPreviewImport}
            >
              <Sparkles aria-hidden="true" size={18} />
              {props.busyAction === "preview-import" ? "预览中" : "预览"}
            </Button>
            {mode === "import" ? (
              <Button
                disabled={props.busy || !props.importText.trim() || !props.importPreview || !hasIncludedDecision}
                onClick={props.onImport}
                variant="primary"
              >
                <Upload aria-hidden="true" size={18} />
                {props.busyAction === "import" ? "提交中" : "提交选择"}
              </Button>
            ) : (
              <Button
                disabled={props.busy || purchaseInteractionBusy || !props.importText.trim() || !props.onPurchaseCheck || Boolean(props.importPreview && !purchaseCandidates.length)}
                onClick={props.onPurchaseCheck}
                variant="primary"
              >
                <Sparkles aria-hidden="true" size={18} />
                {props.purchaseCheckBusy ? "检查中" : "运行购买前检查"}
              </Button>
            )}
          </div>
        </div>

        {props.filterSummary ? (
          <Notice tone="success" role="status" title="候选已筛选">
            已从 {props.filterSummary.originalItems} 条订单中保留 {props.filterSummary.keptItems} 条可审阅记录，退款事件保留 {props.filterSummary.skippedRefunded === 0 ? "完整" : "可能不完整"}，非服饰过滤 {props.filterSummary.skippedNonApparel} 条。
          </Notice>
        ) : null}

        <details className="advanced-import">
          <summary>高级方式与原始 JSON</summary>
          <div className="advanced-import__grid">
            <section aria-labelledby="bookmarklet-title">
              <h3 id="bookmarklet-title">书签脚本</h3>
              <p>浏览器自动采集不可用时，可以将脚本保存为书签后手动运行。</p>
              <label htmlFor="bookmarklet-script">脚本内容</label>
              <textarea id="bookmarklet-script" className="code-box" readOnly value={props.bookmarklet} />
              <div className="advanced-import__actions">
                <a ref={attachBookmarkletHref} className="ui-button ui-button--secondary ui-button--md">Outfit 淘宝采集</a>
                <Button onClick={props.onCopyBookmarklet}>
                  <Copy aria-hidden="true" size={18} />
                  复制脚本
                </Button>
              </div>
            </section>
            <section aria-labelledby="raw-json-title">
              <h3 id="raw-json-title">原始 JSON</h3>
              <p>用于检查采集内容，或粘贴其他受信任的本地采集结果。</p>
              <label htmlFor="import-json">采集 JSON</label>
              <textarea
                id="import-json"
                className="import-box"
                disabled={purchaseInteractionBusy || props.busyAction === "import"}
                value={props.importText}
                onChange={(event) => props.onImportText(event.target.value)}
                placeholder={'{"source":"taobao-bookmarklet","items":[]}'}
              />
            </section>
          </div>
        </details>
      </Surface>

      {mode === "import" && props.importResult ? (
        <Surface className="import-result" aria-live="polite">
          <div className="section-heading">
            <h2>导入完成</h2>
            <Badge tone="success">已写入本地衣橱</Badge>
          </div>
          {reviewedResult ? (
            <div className="stat-grid import-stat-grid">
              <Stat label="已选择" value={reviewedResult.summary.included} />
              <Stat label="新增" value={reviewedResult.summary.created} />
              <Stat label="更新" value={reviewedResult.summary.updated} />
              <Stat label="退款同步" value={reviewedResult.summary.refundSynced} />
              <Stat label="无变化" value={reviewedResult.summary.unchanged} />
              <Stat label="跳过" value={reviewedResult.summary.skipped} />
            </div>
          ) : (
            <div className="stat-grid import-stat-grid">
              <Stat label="订单项" value={(props.importResult as ImportSummary).summary.totalItems} />
              <Stat label="唯一项" value={(props.importResult as ImportSummary).summary.uniqueItems} />
              <Stat label="退款过滤" value={(props.importResult as ImportSummary).summary.skippedRefunded} />
              <Stat label="非服饰过滤" value={(props.importResult as ImportSummary).summary.skippedNonApparel} />
              <Stat label="新衣服" value={(props.importResult as ImportSummary).summary.createdGarments} />
            </div>
          )}
        </Surface>
      ) : null}

      {mode === "import" && props.importPreview ? (
        <Surface className="preview-panel">
          <div className="section-heading">
            <div>
              <h2>导入预览</h2>
              <p>核对名称、类别和置信度，再决定是否导入。</p>
            </div>
            <Badge tone="info">{props.importPreview.candidates.length} 个候选</Badge>
          </div>
          <div className="stat-grid preview-stat-grid">
            <Stat label="候选" value={props.importPreview.candidates.length} />
            <Stat label="重复" value={props.importPreview.duplicateCount} />
            <Stat label="退款事件" value={props.importPreview.summary.skippedRefunded} />
            <Stat label="非服饰过滤" value={props.importPreview.summary.skippedNonApparel} />
            <Stat label="唯一项" value={props.importPreview.summary.uniqueItems} />
          </div>
          {props.importPreview.candidates.length > 0 ? (
            <ImportReviewTable
              preview={props.importPreview}
              decisions={importDecisions}
              disabled={props.busy}
              onDecision={(sourceItemKey, decision) => props.onImportDecision?.(sourceItemKey, decision)}
            />
          ) : (
            <EmptyState
              compact
              title="没有可导入的衣物候选"
              description="当前产物可能只有退款订单、重复项或非服饰商品。可以返回淘宝重新采集。"
            />
          )}
        </Surface>
      ) : null}

      {mode === "purchase-check" ? (
        <Surface className="purchase-check-panel-shell">
          {purchaseCandidates.length && props.onPurchaseCheckSourceItemKey ? (
            <label className="purchase-check-candidate" htmlFor="purchase-check-candidate">
              <span>待检查候选</span>
              <select
                id="purchase-check-candidate"
                className="ui-select"
                disabled={props.busy || purchaseInteractionBusy}
                value={props.purchaseCheckSourceItemKey ?? purchaseCandidates[0]?.sourceItemKey ?? ""}
                onChange={(event) => props.onPurchaseCheckSourceItemKey?.(event.target.value)}
              >
                {purchaseCandidates.map((candidate) => (
                  <option key={candidate.sourceItemKey} value={candidate.sourceItemKey}>{candidate.name}</option>
                ))}
              </select>
            </label>
          ) : null}
          {props.importPreview && props.importPreview.candidates.length > purchaseCandidates.length ? (
            <Notice tone="info" role="status" title="已排除不可检查候选">
              {props.importPreview.candidates.length - purchaseCandidates.length} 个退款、非服饰或待人工处理候选不会进入购买前检查。
            </Notice>
          ) : null}
          <PurchaseCheckPanel
            result={props.purchaseCheckResult ?? null}
            busy={props.purchaseCheckBusy}
            error={props.purchaseCheckError}
            feedbackBusyGarmentId={props.feedbackBusyGarmentId}
            onFeedback={props.onSimilarityFeedback}
          />
        </Surface>
      ) : null}
    </section>
  );
}
