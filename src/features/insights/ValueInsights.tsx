import { Badge, Button, EmptyState, Notice, Surface } from "../../components/ui";
import { CATEGORY_LABELS } from "../../shared/presentation";
import type { ValueGarmentEvidence, WardrobeValueInsights } from "../../shared/types";
import { InsightSuggestionList } from "./InsightSuggestionList";

export type ValueGarmentEvidenceView = ValueGarmentEvidence;
export type WardrobeValueInsightsView = WardrobeValueInsights;

export interface ValueInsightsProps {
  insights: WardrobeValueInsightsView | null;
  busy?: boolean;
  error?: string;
  onViewRelated?: (garmentIds: number[]) => void;
  onApplyRelatedFilter?: (garmentIds: number[]) => void;
}

const CNY = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

export function ValueInsights(props: ValueInsightsProps) {
  if (props.busy && !props.insights) {
    return <Surface className="value-insights" aria-busy="true"><p>正在计算价值与利用数据…</p></Surface>;
  }
  if (props.error && !props.insights) {
    return <Surface className="value-insights"><EmptyState compact title="价值与利用暂时不可用" description={props.error} /></Surface>;
  }
  if (!props.insights) {
    return <Surface className="value-insights"><EmptyState compact title="暂无价值与利用数据" description="刷新洞察后会在本机重新计算。" /></Surface>;
  }

  const insights = props.insights;
  return (
    <section className="value-insights" aria-labelledby="value-insights-title" aria-busy={props.busy || undefined}>
      <header className="value-insights__header">
        <div>
          <span>本地决策支持</span>
          <h2 id="value-insights-title">价值与利用</h2>
        </div>
        <Badge tone="neutral">只计算已知价格</Badge>
      </header>

      {props.error ? (
        <Notice tone="danger" role="alert" title="价值与利用更新失败">
          {props.error}
        </Notice>
      ) : null}

      <dl className="value-insights__facts">
        <div><dt>价格已知</dt><dd>{insights.knownPriceCount} 件</dd></div>
        <div><dt>价格未知</dt><dd>{insights.unknownPriceCount} 件</dd></div>
        <div>
          <dt>最高四分位起点</dt>
          <dd>{insights.upperQuartilePriceCents === undefined ? "样本不足" : formatMoney(insights.upperQuartilePriceCents)}</dd>
        </div>
      </dl>

      <div className="value-insights__grid">
        <ValueList
          title="最佳价值"
          description="仅比较价格已知且至少穿着 3 次的衣物。"
          items={insights.bestValue}
          empty="尚无达到 3 次穿着的已知价格衣物。"
          tone="success"
          onViewRelated={props.onViewRelated}
          onApplyRelatedFilter={props.onApplyRelatedFilter}
        />
        <ValueList
          title="低利用高成本"
          description="中性呈现购入时间、价格和穿着证据，不代替你的判断。"
          items={insights.lowUtilizationHighCost}
          empty="当前没有符合这组条件的衣物。"
          tone="warning"
          onViewRelated={props.onViewRelated}
          onApplyRelatedFilter={props.onApplyRelatedFilter}
        />
        <ValueList
          title="沉睡单品"
          description="90 天没有穿着记录；购入未满 30 天的新衣不会出现在这里。"
          items={insights.dormantGarments}
          empty="当前没有沉睡单品。"
          tone="neutral"
          onViewRelated={props.onViewRelated}
          onApplyRelatedFilter={props.onApplyRelatedFilter}
        />
      </div>

      {insights.suggestions.length ? (
        <div className="value-insights__suggestions">
          <InsightSuggestionList
            items={insights.suggestions}
            empty="暂无价值建议。"
            onViewRelated={props.onViewRelated}
            onApplyRelatedFilter={props.onApplyRelatedFilter}
          />
        </div>
      ) : null}
    </section>
  );
}

function ValueList(props: {
  title: string;
  description: string;
  items: ValueGarmentEvidenceView[];
  empty: string;
  tone: "success" | "warning" | "neutral";
  onViewRelated?: (garmentIds: number[]) => void;
  onApplyRelatedFilter?: (garmentIds: number[]) => void;
}) {
  return (
    <Surface className="value-insights__section">
      <header>
        <div><h3>{props.title}</h3><p>{props.description}</p></div>
        <Badge tone={props.tone}>{props.items.length} 件</Badge>
      </header>
      {props.items.length ? (
        <div className="value-evidence-list">
          {props.items.map((item) => (
            <details className="value-evidence" key={item.garmentId}>
              <summary>
                <span><strong>{item.name}</strong><small>{CATEGORY_LABELS[item.category]}</small></span>
                <span>{item.costPerWearCents === null ? "尚无穿着" : `${formatMoney(item.costPerWearCents)} / 次`}</span>
              </summary>
              <dl>
                <div><dt>购入价格</dt><dd>{item.purchasePriceCents === undefined ? "未知" : formatMoney(item.purchasePriceCents)}</dd></div>
                <div><dt>购入时间</dt><dd>{item.acquiredAt ? <time dateTime={item.acquiredAt}>{item.acquiredAt}</time> : "未知"}</dd></div>
                <div><dt>穿着次数</dt><dd>{item.wearCount} 次</dd></div>
                <div><dt>成本 / 次</dt><dd>{item.costPerWearCents === null ? "尚无穿着" : formatMoney(item.costPerWearCents)}</dd></div>
              </dl>
              {item.evidence.length ? <ul>{item.evidence.map((evidence) => <li key={evidence}>{evidence}</li>)}</ul> : null}
              {props.onViewRelated || props.onApplyRelatedFilter ? (
                <div className="value-evidence__actions">
                  {props.onViewRelated ? <Button size="sm" variant="secondary" onClick={() => props.onViewRelated?.([item.garmentId])}>查看相关衣物</Button> : null}
                  {props.onApplyRelatedFilter ? <Button size="sm" variant="ghost" onClick={() => props.onApplyRelatedFilter?.([item.garmentId])}>应用筛选</Button> : null}
                </div>
              ) : null}
            </details>
          ))}
        </div>
      ) : <EmptyState compact title={props.empty} />}
    </Surface>
  );
}

function formatMoney(cents: number): string {
  return CNY.format(cents / 100);
}
