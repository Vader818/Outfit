import { Check, Images, ListChecks, RefreshCw, SearchX, Shirt, X } from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Notice,
  PageIntro,
  SelectField,
  Stat,
  Surface
} from "../../components/ui";
import { isRecommendationEligibleGarment, isWardrobeReviewPendingGarment, matchesWardrobeFilters } from "../../lib/garments";
import {
  buildColorFilterOptions,
  CATEGORY_FILTER_OPTIONS,
  DEFAULT_WARDROBE_FILTERS,
  OWNED_FILTER_OPTIONS,
  SEASON_FILTER_OPTIONS,
  STATUS_FILTER_OPTIONS,
  type BusyAction,
  type WardrobeFilters,
  type WardrobeOwnedFilter,
  type WardrobeStatusFilter
} from "../../shared/presentation";
import type { Garment } from "../../shared/types";
import { GarmentItem } from "./GarmentItem";

export interface WardrobeViewProps {
  garments: Garment[];
  selectedIds: number[];
  busy: boolean;
  busyAction?: BusyAction | null;
  filters?: WardrobeFilters;
  onFilters?: (filters: WardrobeFilters) => void;
  onRefresh: () => void;
  onSelect: (ids: number[]) => void;
  onUpdate: (id: number, update: Partial<Garment>) => void;
  onDelete: (id: number) => void;
  onBulkConfirm: () => void;
  onRefreshThumbnails?: () => void;
  onOpenThumbnailPicker?: (garment: Garment) => void;
  onCutoutGarment?: (id: number) => void;
  onAnalyzeGarmentVision?: (id: number) => void;
  visionEnabled?: boolean;
  visionBusyId?: number | null;
  thumbnailRefreshMessage?: string;
  allowRemoteTaobaoImages?: boolean;
}

export function WardrobeView(props: WardrobeViewProps) {
  const filters = props.filters ?? DEFAULT_WARDROBE_FILTERS;
  const colorFilterOptions = buildColorFilterOptions(props.garments);
  const filteredGarments = props.garments.filter((item) => matchesWardrobeFilters(item, filters));
  const selectedSet = new Set(props.selectedIds);
  const reviewGarments = filteredGarments.filter(isWardrobeReviewPendingGarment);
  const libraryGarments = filteredGarments.filter((item) => item.confirmed || item.excluded);
  const filteredIds = filteredGarments.map((item) => item.id);
  const pendingCount = props.garments.filter(isWardrobeReviewPendingGarment).length;
  const activeCount = props.garments.filter(isRecommendationEligibleGarment).length;

  function updateFilter<K extends keyof WardrobeFilters>(key: K, value: WardrobeFilters[K]) {
    props.onFilters?.({ ...filters, [key]: value });
  }

  function updateSelection(id: number, selected: boolean) {
    if (selected) {
      props.onSelect(Array.from(new Set([...props.selectedIds, id])));
      return;
    }
    props.onSelect(props.selectedIds.filter((selectedId) => selectedId !== id));
  }

  return (
    <section className="wardrobe-page" aria-busy={props.busy || undefined}>
      <PageIntro
        title="衣服库"
        description={`${props.garments.length} 件衣物，${pendingCount} 件等待确认。当前显示 ${filteredGarments.length} 件。`}
        meta={(
          <div className="wardrobe-page__stats">
            <Stat label="可穿" value={`${activeCount} 件`} />
            <Stat label="待确认" value={`${pendingCount} 件`} />
            <Stat label="已选择" value={`${props.selectedIds.length} 件`} />
          </div>
        )}
        actions={(
          <div className="wardrobe-page__actions">
            <Button variant="secondary" onClick={props.onRefresh}>
              <RefreshCw aria-hidden="true" size={18} />
              刷新衣橱
            </Button>
            {props.onRefreshThumbnails ? (
              <Button
                variant="secondary"
                disabled={props.busyAction === "refresh-thumbnails"}
                onClick={props.onRefreshThumbnails}
              >
                <Images aria-hidden="true" size={18} />
                {props.busyAction === "refresh-thumbnails" ? "处理中" : "补全图片"}
              </Button>
            ) : null}
          </div>
        )}
      />

      {props.thumbnailRefreshMessage ? (
        <Notice tone="success" role="status">{props.thumbnailRefreshMessage}</Notice>
      ) : null}

      <Surface as="div" className="wardrobe-filter-panel" aria-labelledby="wardrobe-filter-title">
        <div className="wardrobe-filter-panel__heading">
          <div>
            <h2 id="wardrobe-filter-title">查找衣物</h2>
            <p>按状态和属性缩小范围，或直接搜索名称、品牌、材质与标签。</p>
          </div>
          <Button variant="ghost" size="sm" disabled={!filteredIds.length} onClick={() => props.onSelect(filteredIds)}>
            <ListChecks aria-hidden="true" size={17} />
            选择当前结果
          </Button>
        </div>
        <div className="wardrobe-filter-panel__fields">
          <Field
            label="搜索衣物"
            type="search"
            autoComplete="off"
            value={filters.query}
            placeholder="名称、品牌、材质或标签"
            onChange={(event) => updateFilter("query", event.target.value)}
          />
          <SelectField
            label="确认状态"
            value={filters.status}
            options={STATUS_FILTER_OPTIONS}
            onChange={(event) => updateFilter("status", event.target.value as WardrobeStatusFilter)}
          />
          <SelectField
            label="衣物类别"
            value={filters.category}
            options={CATEGORY_FILTER_OPTIONS}
            onChange={(event) => updateFilter("category", event.target.value as WardrobeFilters["category"])}
          />
          <SelectField
            label="颜色"
            value={filters.color}
            options={colorFilterOptions}
            onChange={(event) => updateFilter("color", event.target.value)}
          />
          <SelectField
            label="适穿季节"
            value={filters.season}
            options={SEASON_FILTER_OPTIONS}
            onChange={(event) => updateFilter("season", event.target.value as WardrobeFilters["season"])}
          />
          <SelectField
            label="拥有状态"
            value={filters.owned}
            options={OWNED_FILTER_OPTIONS}
            onChange={(event) => updateFilter("owned", event.target.value as WardrobeOwnedFilter)}
          />
        </div>
      </Surface>

      {props.selectedIds.length ? (
        <Surface as="div" className="wardrobe-batch-bar" aria-live="polite">
          <div className="wardrobe-batch-bar__summary">
            <Badge tone="accent">已选择 {props.selectedIds.length} 件</Badge>
            <span>批量确认不会改变衣物的拥有或排除状态。</span>
          </div>
          <div className="wardrobe-batch-bar__actions">
            <Button variant="ghost" size="sm" onClick={() => props.onSelect([])}>
              <X aria-hidden="true" size={16} />
              清空选择
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={props.busyAction === "bulk-confirm"}
              onClick={props.onBulkConfirm}
            >
              <Check aria-hidden="true" size={16} />
              {props.busyAction === "bulk-confirm" ? "确认中" : "批量确认"}
            </Button>
          </div>
        </Surface>
      ) : null}

      {!props.garments.length ? (
        <EmptyState
          icon={<Shirt aria-hidden="true" />}
          title="衣橱还是空的"
          description="先从淘宝采集订单或粘贴 JSON，导入后即可整理衣物。"
        />
      ) : !filteredGarments.length ? (
        <EmptyState
          icon={<SearchX aria-hidden="true" />}
          title="没有符合条件的衣物"
          description="调整搜索词或筛选条件后再试。"
        />
      ) : (
        <div className="wardrobe-page__collections">
          {reviewGarments.length ? (
            <section className="wardrobe-collection wardrobe-collection--review" aria-labelledby="wardrobe-review-title">
              <div className="wardrobe-collection__heading">
                <div>
                  <h2 id="wardrobe-review-title">等待确认</h2>
                  <p>这些衣物仍在审核队列中，先核对关键信息。</p>
                </div>
                <Badge tone="warning">{reviewGarments.length} 件</Badge>
              </div>
              <div className="wardrobe-review-list">
                {reviewGarments.map((item) => (
                  <GarmentItem
                    key={item.id}
                    item={item}
                    presentation="review"
                    selected={selectedSet.has(item.id)}
                    busyAction={props.busyAction}
                    visionEnabled={props.visionEnabled}
                    visionBusyId={props.visionBusyId}
                    allowRemoteTaobaoImages={props.allowRemoteTaobaoImages}
                    onSelect={(selected) => updateSelection(item.id, selected)}
                    onUpdate={props.onUpdate}
                    onDelete={props.onDelete}
                    onOpenThumbnailPicker={props.onOpenThumbnailPicker}
                    onCutoutGarment={props.onCutoutGarment}
                    onAnalyzeGarmentVision={props.onAnalyzeGarmentVision}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {libraryGarments.length ? (
            <section className="wardrobe-collection wardrobe-collection--gallery" aria-labelledby="wardrobe-gallery-title">
              <div className="wardrobe-collection__heading">
                <div>
                  <h2 id="wardrobe-gallery-title">衣橱藏品</h2>
                  <p>图片优先浏览，展开单品后可编辑字段与使用视觉工具。</p>
                </div>
                <Badge>{libraryGarments.length} 件</Badge>
              </div>
              <div className="wardrobe-gallery">
                {libraryGarments.map((item) => (
                  <GarmentItem
                    key={item.id}
                    item={item}
                    presentation="card"
                    selected={selectedSet.has(item.id)}
                    busyAction={props.busyAction}
                    visionEnabled={props.visionEnabled}
                    visionBusyId={props.visionBusyId}
                    allowRemoteTaobaoImages={props.allowRemoteTaobaoImages}
                    onSelect={(selected) => updateSelection(item.id, selected)}
                    onUpdate={props.onUpdate}
                    onDelete={props.onDelete}
                    onOpenThumbnailPicker={props.onOpenThumbnailPicker}
                    onCutoutGarment={props.onCutoutGarment}
                    onAnalyzeGarmentVision={props.onAnalyzeGarmentVision}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </section>
  );
}
