import { Badge, Button, EmptyState, Notice, Surface } from "../../components/ui";
import { CATEGORY_LABELS, PLANNER_OCCASION_LABELS, SEASON_LABELS } from "../../shared/presentation";
import type {
  GarmentSimilarityMatch,
  PurchaseCheckResult,
  PurchaseCheckVerdict,
  SimilarityFeedbackVerdict
} from "../../shared/types";

export type SimilarityVerdict = SimilarityFeedbackVerdict;
export type PurchaseCheckMatchView = GarmentSimilarityMatch;
export type PurchaseCheckResultView = PurchaseCheckResult;

export interface PurchaseCheckPanelProps {
  result: PurchaseCheckResultView | null;
  busy?: boolean;
  error?: string;
  feedbackBusyGarmentId?: number | null;
  onFeedback?: (comparedGarmentId: number, verdict: SimilarityVerdict) => void;
}

const VERDICT_LABELS: Record<PurchaseCheckVerdict, string> = {
  "fills-gap": "补充缺口",
  "likely-duplicate": "可能重复",
  mixed: "同时有补缺与重复信号",
  "insufficient-data": "信息不足"
};

export function PurchaseCheckPanel(props: PurchaseCheckPanelProps) {
  if (props.busy && !props.result) {
    return <Notice tone="info" role="status" title="正在进行购买前检查">只读取本地衣橱、保存搭配和已有相似度缓存。</Notice>;
  }
  if (props.error && !props.result) {
    return <Notice tone="danger" role="alert" title="购买前检查失败">{props.error}</Notice>;
  }
  if (!props.result) {
    return <EmptyState compact title="尚未生成购买前检查" description="读取商品详情后运行检查；检查本身不会写入衣橱。" />;
  }

  const result = props.result;
  const feedbackDisabled = Boolean(props.busy || props.feedbackBusyGarmentId != null);
  return (
    <section className="purchase-check" aria-labelledby="purchase-check-result-title" aria-busy={props.busy || undefined}>
      <Surface className="purchase-check__summary">
        <header>
          <div><span>本地只读结果</span><h2 id="purchase-check-result-title">购买前检查</h2></div>
          <Badge tone={result.verdict === "likely-duplicate" ? "warning" : result.verdict === "fills-gap" ? "success" : "neutral"}>
            {VERDICT_LABELS[result.verdict]}
          </Badge>
        </header>
        <ul>{result.explanation.map((line) => <li key={line}>{line}</li>)}</ul>
      </Surface>

      {props.error ? (
        <Notice tone="danger" role="alert" title="购买前检查更新失败">
          {props.error}
        </Notice>
      ) : null}

      <div className="purchase-check__grid">
        <Surface className="purchase-check__section">
          <header><h3>可能重复</h3><Badge tone="neutral">{result.possibleDuplicates.length} 件</Badge></header>
          {result.possibleDuplicates.length ? (
            <ol className="purchase-check__duplicates">
              {result.possibleDuplicates.map((match) => (
                <li key={match.garment.id}>
                  <div className="purchase-check__match-heading">
                    <div><strong>{match.garment.name}</strong><small>{CATEGORY_LABELS[match.garment.category]}</small></div>
                    <span>{similarityPercent(match.similarity)}%</span>
                  </div>
                  <ul>{match.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
                  {props.onFeedback ? (
                    <div className="purchase-check__feedback">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={feedbackDisabled}
                        onClick={() => props.onFeedback?.(match.garment.id, "duplicate")}
                      >确实重复</Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={feedbackDisabled}
                        onClick={() => props.onFeedback?.(match.garment.id, "not-duplicate")}
                      >不是重复</Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : <EmptyState compact title="没有达到 75% 的相似项" />}
        </Surface>

        <Surface className="purchase-check__section">
          <header><h3>可复用搭配</h3><Badge tone="neutral">{result.worksWith.length} 套</Badge></header>
          {result.worksWith.length ? <ul>{result.worksWith.map((outfit) => <li key={outfit.id}>{outfit.name}</li>)}</ul> : <EmptyState compact title="暂无可确认的兼容搭配" />}
        </Surface>

        <Surface className="purchase-check__section purchase-check__coverage">
          <header><h3>覆盖变化</h3><Badge tone="neutral">{result.coverageDelta.compatibleOutfitCount} 套兼容</Badge></header>
          <dl>
            <div><dt>类别</dt><dd>{labels(result.coverageDelta.categories, CATEGORY_LABELS)}</dd></div>
            <div><dt>季节</dt><dd>{labels(result.coverageDelta.seasons, SEASON_LABELS)}</dd></div>
            <div><dt>场合</dt><dd>{labels(result.coverageDelta.occasions, PLANNER_OCCASION_LABELS)}</dd></div>
          </dl>
        </Surface>
      </div>
    </section>
  );
}

function similarityPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value <= 1 ? value * 100 : value)));
}

function labels(values: readonly string[], mapping: Readonly<Record<string, string>>): string {
  return values.length ? values.map((value) => mapping[value] ?? value).join("、") : "无新增";
}
