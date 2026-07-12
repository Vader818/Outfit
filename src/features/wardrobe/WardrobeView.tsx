import { ArchiveRestore, Check, Images, ListChecks, Plus, RefreshCw, SearchX, Shirt, Tags, X } from "lucide-react";
import { useState } from "react";
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
import type { Garment, GarmentAvailabilityStatus, Season } from "../../shared/types";
import { AvailabilityMenu } from "./AvailabilityMenu";
import { GarmentItem } from "./GarmentItem";

export interface WardrobeViewProps {
  garments: Garment[];
  archivedGarments?: Garment[];
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
  onAddGarment?: () => void;
  onRestore?: (id: number) => void;
  onBulkSeasons?: (seasons: Season[]) => void;
  onBulkTags?: (tags: string[]) => void;
  onBulkExcluded?: (excluded: boolean) => void;
  onRefreshThumbnails?: () => void;
  onOpenThumbnailPicker?: (garment: Garment) => void;
  onUseGarmentAsCore?: (garment: Garment) => void;
  availabilityBusyGarmentId?: number | null;
  onAvailabilityChange?: (id: number, status: GarmentAvailabilityStatus) => void;
  onBulkAvailability?: (status: GarmentAvailabilityStatus) => void;
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
            {props.onAddGarment ? (
              <Button variant="primary" onClick={props.onAddGarment}>
                <Plus aria-hidden="true" size={18} />
                添加衣物
              </Button>
            ) : null}
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
          {props.onBulkSeasons || props.onBulkTags || props.onBulkExcluded || props.onBulkAvailability ? (
            <WardrobeBatchControls
              disabled={props.busyAction === "bulk-update" || props.busyAction === "bulk-availability"}
              onSeasons={props.onBulkSeasons}
              onTags={props.onBulkTags}
              onExcluded={props.onBulkExcluded}
              onAvailability={props.onBulkAvailability}
            />
          ) : null}
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
                    onUseGarmentAsCore={props.onUseGarmentAsCore}
                    availabilityBusyGarmentId={props.availabilityBusyGarmentId}
                    onAvailabilityChange={props.onAvailabilityChange}
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
                    onUseGarmentAsCore={props.onUseGarmentAsCore}
                    availabilityBusyGarmentId={props.availabilityBusyGarmentId}
                    onAvailabilityChange={props.onAvailabilityChange}
                    onCutoutGarment={props.onCutoutGarment}
                    onAnalyzeGarmentVision={props.onAnalyzeGarmentVision}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}

      {props.archivedGarments?.length ? (
        <Surface as="section" className="wardrobe-archive" aria-labelledby="wardrobe-archive-title">
          <div className="wardrobe-collection__heading">
            <div>
              <h2 id="wardrobe-archive-title">已归档</h2>
              <p>归档衣物不会进入默认衣橱、洞察或推荐，恢复后沿用原记录与图片。</p>
            </div>
            <Badge tone="neutral">{props.archivedGarments.length} 件</Badge>
          </div>
          <div className="wardrobe-archive__list">
            {props.archivedGarments.map((item) => (
              <article key={item.id} className="wardrobe-archive__item">
                <div>
                  <strong>{item.name}</strong>
                  <span>{CATEGORY_FILTER_OPTIONS.find((option) => option.value === item.category)?.label ?? item.category}</span>
                </div>
                <Button variant="secondary" size="sm" disabled={!props.onRestore} onClick={() => props.onRestore?.(item.id)}>
                  <ArchiveRestore aria-hidden="true" size={16} />
                  恢复
                </Button>
              </article>
            ))}
          </div>
        </Surface>
      ) : null}
    </section>
  );
}

function WardrobeBatchControls({
  disabled,
  onSeasons,
  onTags,
  onExcluded,
  onAvailability
}: {
  disabled: boolean;
  onSeasons?: (seasons: Season[]) => void;
  onTags?: (tags: string[]) => void;
  onExcluded?: (excluded: boolean) => void;
  onAvailability?: (status: GarmentAvailabilityStatus) => void;
}) {
  const [season, setSeason] = useState<Season | "all">("all");
  const [tags, setTags] = useState("");
  const [availability, setAvailability] = useState<GarmentAvailabilityStatus>("available");
  const parsedTags = tags.split(/[，,]/).map((value) => value.trim()).filter(Boolean);
  return (
    <div className="wardrobe-batch-controls">
      {onSeasons ? (
        <div className="wardrobe-batch-controls__group">
          <label htmlFor="wardrobe-bulk-season">批量季节</label>
          <select id="wardrobe-bulk-season" className="ui-select" value={season} disabled={disabled} onChange={(event) => setSeason(event.target.value as Season | "all")}>
            <option value="all">全年</option>
            {SEASON_FILTER_OPTIONS.filter((option) => option.value !== "all").map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <Button size="sm" variant="secondary" disabled={disabled} onClick={() => onSeasons(season === "all" ? ["spring", "summer", "autumn", "winter"] : [season])}>应用</Button>
        </div>
      ) : null}
      {onTags ? (
        <div className="wardrobe-batch-controls__group">
          <label htmlFor="wardrobe-bulk-tags">批量添加标签</label>
          <input id="wardrobe-bulk-tags" className="ui-input" value={tags} disabled={disabled} onChange={(event) => setTags(event.target.value)} />
          <Button size="sm" variant="secondary" disabled={disabled || !parsedTags.length} onClick={() => onTags(parsedTags)}>
            <Tags aria-hidden="true" size={15} />应用
          </Button>
        </div>
      ) : null}
      {onExcluded ? (
        <div className="wardrobe-batch-controls__group wardrobe-batch-controls__group--actions">
          <Button size="sm" variant="secondary" disabled={disabled} onClick={() => onExcluded(true)}>批量排除推荐</Button>
          <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onExcluded(false)}>取消批量排除</Button>
        </div>
      ) : null}
      {onAvailability ? (
        <div className="wardrobe-batch-controls__group wardrobe-batch-controls__group--availability">
          <AvailabilityMenu
            id="wardrobe-bulk-availability"
            label="批量可用状态"
            value={availability}
            disabled={disabled}
            onChange={setAvailability}
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled}
            onClick={() => onAvailability(availability)}
          >
            应用状态
          </Button>
        </div>
      ) : null}
    </div>
  );
}
