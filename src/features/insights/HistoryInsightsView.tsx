import { Activity, Download, RefreshCw, ShoppingBag } from "lucide-react";
import { Badge, Button, EmptyState, PageIntro, Surface } from "../../components/ui";
import {
  CATEGORY_LABELS,
  COLOR_LABELS,
  FEEDBACK_REASON_LABELS,
  HEALTH_LEVEL_LABELS,
  OCCASION_LABELS,
  SEASON_LABELS,
  formatLocalDateTime,
  labelDistribution,
  labelStyleDistribution,
  styleLabel,
  type BusyAction
} from "../../shared/presentation";
import type {
  RecommendationRunEntry,
  SavedOutfit,
  WardrobeInsights,
  WardrobeSuggestion,
  WearLogEntry,
  WornGarmentInsight
} from "../../shared/types";
import { SavedOutfitsPanel } from "../outfits/SavedOutfitsPanel";
import { DistributionBars } from "./DistributionBars";
import { InsightSuggestionList } from "./InsightSuggestionList";

export type HistoryInsightsViewProps = {
  insights: WardrobeInsights | null;
  wearLogs: WearLogEntry[];
  recommendationRuns: RecommendationRunEntry[];
  savedOutfits?: SavedOutfit[];
  savedOutfitsBusy?: boolean;
  allowRemoteTaobaoImages?: boolean;
  busy: boolean;
  busyAction?: BusyAction | null;
  onRefresh: () => void;
  onExport: () => void;
  onExportComplete?: () => void;
  onCreateSavedOutfit?: () => void;
  onOpenSavedOutfit?: (outfit: SavedOutfit) => void;
  onFavoriteSavedOutfit?: (outfit: SavedOutfit, favorite: boolean) => void;
  onArchiveSavedOutfit?: (outfit: SavedOutfit) => void;
  onManageFeedback?: () => void;
};

const PRIORITY_ORDER: Record<WardrobeSuggestion["priority"], number> = {
  high: 0,
  medium: 1,
  low: 2
};

function healthTone(level: WardrobeInsights["health"]["level"]): "success" | "warning" | "danger" {
  if (level === "good") return "success";
  if (level === "fair") return "warning";
  return "danger";
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function GarmentInsightList({ items, empty, showWearCount }: {
  items: WornGarmentInsight[];
  empty: string;
  showWearCount?: boolean;
}) {
  if (!items.length) return <EmptyState compact title={empty} />;
  return (
    <ol className="garment-insight-list">
      {items.map((item, index) => (
        <li key={item.id}>
          <span className="garment-insight-list__rank">{index + 1}</span>
          <strong>{item.name}</strong>
          {showWearCount ? <small>{item.wearCount ? `${item.wearCount} 次` : "暂无记录"}</small> : null}
        </li>
      ))}
    </ol>
  );
}

export function HistoryInsightsView(props: HistoryInsightsViewProps) {
  const insights = props.insights;
  const refreshing = props.busyAction === "history";
  const exporting = props.busyAction === "export";
  const exportingComplete = props.busyAction === "export-complete";
  const canManageSavedOutfits = Boolean(
    props.onCreateSavedOutfit &&
    props.onOpenSavedOutfit &&
    props.onFavoriteSavedOutfit &&
    props.onArchiveSavedOutfit
  );

  return (
    <section className="history-insights-view view-shell" aria-labelledby="history-insights-title" aria-busy={props.busy || undefined}>
      <PageIntro
        title={<span id="history-insights-title">历史洞察</span>}
        description={insights ? `${insights.totalGarments} 件衣物，${props.wearLogs.length} 条穿着记录。` : "本地穿着记录和推荐历史。"}
        actions={(
          <>
            <Button variant="secondary" disabled={refreshing} aria-busy={refreshing || undefined} onClick={props.onRefresh}>
              <RefreshCw aria-hidden="true" />
              {refreshing ? "刷新中" : "刷新"}
            </Button>
            {props.onManageFeedback ? (
              <Button variant="secondary" disabled={props.busy} onClick={props.onManageFeedback}>
                管理反馈
              </Button>
            ) : null}
            <Button variant="secondary" disabled={exporting || exportingComplete} aria-busy={exporting || undefined} onClick={props.onExport}>
              <Download aria-hidden="true" />
              {exporting ? "导出中" : "导出 JSON"}
            </Button>
            {props.onExportComplete ? (
              <Button
                variant="primary"
                disabled={exporting || exportingComplete}
                aria-busy={exportingComplete || undefined}
                onClick={props.onExportComplete}
              >
                <Download aria-hidden="true" />
                {exportingComplete ? "生成中" : "完整备份（含图片）"}
              </Button>
            ) : null}
          </>
        )}
      />

      {canManageSavedOutfits ? (
        <SavedOutfitsPanel
          outfits={props.savedOutfits ?? []}
          busy={props.savedOutfitsBusy}
          allowRemoteTaobaoImages={props.allowRemoteTaobaoImages}
          onCreate={props.onCreateSavedOutfit as () => void}
          onOpen={props.onOpenSavedOutfit as (outfit: SavedOutfit) => void}
          onFavorite={props.onFavoriteSavedOutfit as (outfit: SavedOutfit, favorite: boolean) => void}
          onArchive={props.onArchiveSavedOutfit as (outfit: SavedOutfit) => void}
        />
      ) : null}

      {insights ? <InsightsContent insights={insights} recommendationRuns={props.recommendationRuns} /> : (
        <Surface className="history-insights-empty">
          <EmptyState
            icon={<Activity aria-hidden="true" />}
            title="还没有可展示的历史洞察。"
            description="确认衣物并记录穿着后，这里会显示利用率、分布和建议。"
          />
        </Surface>
      )}
    </section>
  );
}

function InsightsContent({ insights, recommendationRuns }: {
  insights: WardrobeInsights;
  recommendationRuns: RecommendationRunEntry[];
}) {
  const utilization = clampPercent(insights.health.components.utilizationRate);
  const bestShopping = [...insights.shoppingSuggestions]
    .sort((left, right) => PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority])[0];
  const healthComponents = {
    核心完整度: insights.health.components.coreCompleteness,
    季节覆盖: insights.health.components.seasonCoverage,
    风格覆盖: insights.health.components.styleCoverage,
    确认率: insights.health.components.confirmationRate,
    利用率: insights.health.components.utilizationRate
  };

  return (
    <div className="insights-content flex flex-col gap-6">
      <dl className="insight-facts">
        <div><dt>衣物总数</dt><dd>{insights.totalGarments}</dd></div>
        <div><dt>已拥有</dt><dd>{insights.ownedGarments}</dd></div>
        <div><dt>已确认</dt><dd>{insights.confirmedGarments}</dd></div>
        <div><dt>待确认</dt><dd>{insights.pendingGarments}</dd></div>
      </dl>

      <FeedbackSummary insights={insights} />

      <div className="insight-lead-grid grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(17rem,0.8fr)]">
        <Surface className="health-focus" aria-labelledby="wardrobe-health-title">
          <header className="health-focus__header">
            <div>
              <span>整体状态</span>
              <h2 id="wardrobe-health-title">衣橱健康度</h2>
            </div>
            <Badge tone={healthTone(insights.health.level)}>{HEALTH_LEVEL_LABELS[insights.health.level]}</Badge>
          </header>
          <div className="health-focus__score">
            <strong>{insights.health.score}</strong>
            <span>满分 100</span>
          </div>
          <DistributionBars data={healthComponents} kind="score" unit="分" includeZero />
          {insights.health.issues.length ? (
            <div className="health-focus__issues">
              <h3>主要扣分项</h3>
              <ul>{insights.health.issues.map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}</ul>
            </div>
          ) : <p className="health-focus__clear">衣橱结构暂未发现明显问题。</p>}
        </Surface>

        <div className="insight-lead-stack grid gap-4">
          <Surface className="utilization-focus" aria-labelledby="utilization-title">
            <header>
              <Activity aria-hidden="true" />
              <h2 id="utilization-title">利用率</h2>
            </header>
            <strong>{utilization}%</strong>
            <meter min={0} max={100} value={utilization} optimum={100} aria-label={`衣橱利用率 ${utilization}%`}>{utilization}%</meter>
            <p>{insights.neverWorn.length ? `${insights.neverWorn.length} 件衣物还没有穿着记录。` : "当前衣物都有穿着记录。"}</p>
          </Surface>

          <Surface className="shopping-focus" aria-labelledby="best-shopping-title">
            <header>
              <ShoppingBag aria-hidden="true" />
              <h2 id="best-shopping-title">最优购物建议</h2>
            </header>
            {bestShopping ? (
              <div>
                <Badge tone={bestShopping.priority === "high" ? "danger" : bestShopping.priority === "medium" ? "warning" : "info"}>
                  {bestShopping.priority === "high" ? "优先" : bestShopping.priority === "medium" ? "建议" : "可选"}
                </Badge>
                <strong>{bestShopping.title}</strong>
                <p>{bestShopping.detail}</p>
              </div>
            ) : <p>当前没有需要优先补充的单品。</p>}
          </Surface>
        </div>
      </div>

      <section className="insight-section style-tendency" aria-labelledby="style-tendency-title">
        <header><h2 id="style-tendency-title">风格倾向</h2></header>
        <DistributionBars data={labelStyleDistribution(insights.styleDistribution)} />
        {insights.styleTendency.dominantStyles.length ? (
          <ol className="dominant-style-list">
            {insights.styleTendency.dominantStyles.map((style) => (
              <li key={style.key}><strong>{styleLabel(style.key)}</strong><span>{style.count} 件，占 {style.ratio}%</span></li>
            ))}
          </ol>
        ) : null}
      </section>

      <div className="wear-insight-grid grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="insight-section" aria-labelledby="most-worn-title">
          <header><h2 id="most-worn-title">常穿单品</h2></header>
          <GarmentInsightList items={insights.mostWorn} empty="还没有穿着统计。" showWearCount />
        </section>
        <section className="insight-section" aria-labelledby="never-worn-title">
          <header><h2 id="never-worn-title">近期未穿</h2></header>
          <GarmentInsightList items={insights.neverWorn} empty="所有衣物都有穿着记录。" />
        </section>
      </div>

      <div className="distribution-grid grid grid-cols-1 gap-5 md:grid-cols-2">
        <section className="insight-section" aria-labelledby="category-distribution-title">
          <header><h2 id="category-distribution-title">类别分布</h2></header>
          <DistributionBars data={labelDistribution(insights.categoryDistribution, CATEGORY_LABELS)} />
        </section>
        <section className="insight-section" aria-labelledby="color-distribution-title">
          <header><h2 id="color-distribution-title">颜色分布</h2></header>
          <DistributionBars data={labelDistribution(insights.colorDistribution, COLOR_LABELS)} />
        </section>
        <section className="insight-section" aria-labelledby="season-distribution-title">
          <header><h2 id="season-distribution-title">季节分布</h2></header>
          <DistributionBars data={labelDistribution(insights.seasonDistribution, SEASON_LABELS)} />
        </section>
        <section className="insight-section" aria-labelledby="formality-distribution-title">
          <header><h2 id="formality-distribution-title">场合分布</h2></header>
          <DistributionBars data={labelDistribution(insights.formalityDistribution, OCCASION_LABELS)} />
        </section>
      </div>

      <div className="suggestion-sections grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="insight-section" aria-labelledby="insight-suggestions-title">
          <header><h2 id="insight-suggestions-title">洞察建议</h2></header>
          <InsightSuggestionList items={insights.insightSuggestions} empty="暂无需要关注的衣橱洞察。" />
        </section>
        <section className="insight-section" aria-labelledby="shopping-suggestions-title">
          <header><h2 id="shopping-suggestions-title">购物建议</h2></header>
          <InsightSuggestionList items={insights.shoppingSuggestions} empty="暂无需要优先补充的单品。" />
        </section>
        <section className="insight-section lg:col-span-2" aria-labelledby="body-suggestions-title">
          <header><h2 id="body-suggestions-title">身材建议</h2></header>
          <InsightSuggestionList items={insights.bodySuggestions} empty="当前个人画像没有额外身材建议。" />
        </section>
      </div>

      <section className="insight-section recommendation-history" aria-labelledby="recommendation-history-title">
        <header><h2 id="recommendation-history-title">推荐历史</h2></header>
        {recommendationRuns.length ? (
          <ol>
            {recommendationRuns.slice(0, 5).map((run) => (
              <li key={run.id}>
                <time dateTime={run.createdAt}>{formatLocalDateTime(run.createdAt)}</time>
                <span>已生成搭配建议</span>
              </li>
            ))}
          </ol>
        ) : <EmptyState compact title="还没有推荐历史。" />}
      </section>
    </div>
  );
}

export function FeedbackSummary({ insights }: { insights: WardrobeInsights }) {
  const summary = insights.feedbackSummary ?? {
    totalCount: 0,
    acceptedCount: 0,
    acceptanceRate: 0,
    weightedPairCount: 0,
    rejectionReasons: []
  };
  const weightedPairCount = summary.weightedPairCount ?? 0;
  const commonReason = summary.mostCommonRejectionReason
    ? summary.rejectionReasons.find((entry) => entry.reason === summary.mostCommonRejectionReason)
    : undefined;
  return (
    <Surface className="feedback-summary" aria-labelledby="feedback-summary-title">
      <header>
        <div>
          <span>推荐反馈</span>
          <h2 id="feedback-summary-title">选择记录</h2>
        </div>
        <Badge tone={weightedPairCount > 0 ? "accent" : "neutral"}>
          {weightedPairCount > 0 ? "已达到排序阈值" : "样本积累中"}
        </Badge>
      </header>
      <dl>
        <div><dt>反馈数量</dt><dd>{summary.totalCount}</dd></div>
        <div><dt>接受次数</dt><dd>{summary.acceptedCount}</dd></div>
        <div><dt>接受率</dt><dd>{summary.acceptanceRate}%</dd></div>
        <div>
          <dt>常见拒绝原因</dt>
          <dd>
            {commonReason
              ? `${FEEDBACK_REASON_LABELS[commonReason.reason]} · ${commonReason.count} 次`
              : "暂无"}
          </dd>
        </div>
      </dl>
      <p>
        {weightedPairCount === 0
          ? "尚无单个衣物组合累计到 3 条反馈，当前只记录事实，不改变推荐排序。"
          : `${weightedPairCount} 对衣物组合已累计至少 3 条反馈；学习偏好只以有限分值影响排序，可随时预览范围并清空。`}
      </p>
    </Surface>
  );
}
