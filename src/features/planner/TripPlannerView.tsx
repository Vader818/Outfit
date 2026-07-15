import {
  CalendarDays,
  CloudSun,
  Edit3,
  LockKeyhole,
  MapPin,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2
} from "lucide-react";
import { Badge, Button, EmptyState, Notice, Skeleton, Surface } from "../../components/ui";
import type {
  Formality,
  Garment,
  GarmentCategory,
  Trip,
  TripActivityInput,
  TripConstraintRelaxation,
  TripCreateInput,
  TripOptimizationResult,
  TripOutfitSelection,
  TripPackingItem,
  TripPackingStatus,
  TripRepeatPolicy
} from "../../shared/types";
import { PackingChecklist } from "./PackingChecklist";
import "./trip-planner.css";

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const FORMALITY_OPTIONS: Array<{ value: Formality; label: string }> = [
  { value: "casual", label: "休闲" },
  { value: "smart-casual", label: "精致休闲" },
  { value: "formal", label: "正式" },
  { value: "sport", label: "运动" }
];

const REPEAT_POLICY_OPTIONS: Array<{ value: TripRepeatPolicy; label: string }> = [
  { value: "allow", label: "允许重复穿" },
  { value: "no-consecutive-core", label: "核心衣物不连续两天重复" },
  { value: "no-repeat-core", label: "核心衣物全程不重复" }
];

const CATEGORY_LABELS: Record<GarmentCategory, string> = {
  top: "上装",
  bottom: "下装",
  dress: "连衣裙",
  outerwear: "外套",
  shoes: "鞋履",
  accessory: "配饰"
};

const STATUS_LABELS: Record<Trip["status"], string> = {
  planning: "规划中",
  ready: "待出发",
  completed: "已完成",
  archived: "已归档"
};

export interface TripPlannerViewProps {
  trips: Trip[];
  selectedTripId: number | null;
  editorMode: "create" | "edit" | null;
  draft: TripCreateInput;
  availableGarments: Garment[];
  optimization?: TripOptimizationResult | null;
  confirmedSelectionIds: number[];
  essentialDraft: string;
  loading?: boolean;
  busy?: boolean;
  error?: string;
  onSelectTrip: (tripId: number) => void;
  onStartCreate: () => void;
  onStartEdit: (trip: Trip) => void;
  onArchiveTrip: (trip: Trip) => void;
  onCancelEdit: () => void;
  onDraftChange: (draft: TripCreateInput) => void;
  onSave: (draft: TripCreateInput, mode: "create" | "edit") => void;
  onRefreshWeather: (trip: Trip) => void;
  onGenerate: (trip: Trip) => void;
  onApplyRelaxation: (trip: Trip, relaxation: TripConstraintRelaxation) => void;
  onToggleGarmentLock: (selection: TripOutfitSelection, garmentId: number, locked: boolean) => void;
  onReplaceGarment: (selection: TripOutfitSelection, fromGarmentId: number, toGarmentId: number) => void;
  onPackingStatus: (item: TripPackingItem, status: TripPackingStatus) => void;
  onEssentialDraftChange: (value: string) => void;
  onAddEssential: (label: string) => void;
  onRemoveEssential: (item: TripPackingItem) => void;
  onToggleWearConfirmation: (selection: TripOutfitSelection, confirmed: boolean) => void;
  onCompleteTrip: (trip: Trip) => void;
}

export function TripPlannerView(props: TripPlannerViewProps) {
  const selectedTrip = props.trips.find((trip) => trip.id === props.selectedTripId) ?? null;

  return (
    <section
      className="trip-planner-view"
      aria-labelledby="trip-planner-title"
      aria-busy={props.loading || props.busy || undefined}
    >
      <header className="trip-planner-view__header">
        <div>
          <h2 id="trip-planner-title">旅行胶囊</h2>
          <p>为 1-7 天旅行生成逐日搭配、最小衣物集合和可勾选装箱清单。</p>
        </div>
        <Button variant="primary" disabled={props.loading || props.busy} onClick={props.onStartCreate}>
          <Plus aria-hidden="true" size={18} />
          新建旅行
        </Button>
      </header>

      {props.error ? <Notice tone="danger" role="alert">{props.error}</Notice> : null}

      {props.loading ? (
        <TripPlannerLoading />
      ) : (
        <div className="trip-planner-layout">
          <TripList
            trips={props.trips}
            selectedTripId={props.selectedTripId}
            busy={props.busy}
            onSelectTrip={props.onSelectTrip}
            onStartCreate={props.onStartCreate}
          />

          <main className="trip-planner-main">
            {props.editorMode ? (
              <TripEditor
                mode={props.editorMode}
                draft={props.draft}
                busy={props.busy}
                onDraftChange={props.onDraftChange}
                onSave={props.onSave}
                onCancel={props.onCancelEdit}
              />
            ) : selectedTrip ? (
              <TripWorkspace trip={selectedTrip} props={props} />
            ) : (
              <EmptyState
                icon={<MapPin aria-hidden="true" />}
                title={props.trips.length ? "请选择一项旅行" : "还没有旅行计划"}
                description={props.trips.length
                  ? "从左侧列表选择旅行，查看逐日搭配和装箱清单。"
                  : "创建一项 1-7 天的旅行，开始规划胶囊衣橱。"}
                action={(
                  <Button variant="primary" disabled={props.busy} onClick={props.onStartCreate}>
                    <Plus aria-hidden="true" size={18} />
                    新建旅行
                  </Button>
                )}
              />
            )}
          </main>
        </div>
      )}
    </section>
  );
}

function TripPlannerLoading() {
  return (
    <div className="trip-planner-loading" role="status">
      <span className="sr-only">正在读取旅行计划</span>
      <Skeleton className="trip-planner-loading__rail" />
      <div>
        <Skeleton className="trip-planner-loading__title" />
        <Skeleton className="trip-planner-loading__line" />
        <Skeleton className="trip-planner-loading__panel" />
      </div>
    </div>
  );
}

function TripList({
  trips,
  selectedTripId,
  busy,
  onSelectTrip,
  onStartCreate
}: Pick<TripPlannerViewProps, "trips" | "selectedTripId" | "busy" | "onSelectTrip" | "onStartCreate">) {
  return (
    <aside className="trip-list" aria-labelledby="trip-list-title">
      <h3 id="trip-list-title">我的旅行</h3>
      {trips.length ? (
        <ul role="list">
          {trips.map((trip) => {
            const selected = trip.id === selectedTripId;
            return (
              <li key={trip.id}>
                <button
                  type="button"
                  className="trip-list__item"
                  aria-label={`选择旅行 ${trip.name}`}
                  aria-current={selected ? "true" : undefined}
                  disabled={busy}
                  onClick={() => onSelectTrip(trip.id)}
                >
                  <strong>{trip.name}</strong>
                  <span>{trip.destination.name}</span>
                  <small>{formatDateRange(trip.startDate, trip.endDate)} · {STATUS_LABELS[trip.status]}</small>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="trip-list__empty">
          <p>还没有旅行计划</p>
          <Button variant="secondary" disabled={busy} onClick={onStartCreate}>新建旅行</Button>
        </div>
      )}
    </aside>
  );
}

function TripEditor({
  mode,
  draft,
  busy,
  onDraftChange,
  onSave,
  onCancel
}: {
  mode: "create" | "edit";
  draft: TripCreateInput;
  busy?: boolean;
  onDraftChange: TripPlannerViewProps["onDraftChange"];
  onSave: TripPlannerViewProps["onSave"];
  onCancel: TripPlannerViewProps["onCancelEdit"];
}) {
  const issue = validateTripDraft(draft);

  return (
    <Surface
      as="section"
      className="trip-editor"
      aria-labelledby="trip-editor-title"
      aria-describedby="trip-editor-description"
    >
      <header className="trip-editor__header">
        <div>
          <h3 id="trip-editor-title">{mode === "create" ? "新建旅行" : "编辑旅行"}</h3>
          <p id="trip-editor-description">日期跨度限制为 1-7 天。每一天至少设置一个活动。</p>
        </div>
        <CalendarDays aria-hidden="true" size={22} />
      </header>

      <form
        className="trip-editor__form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!issue) onSave(draft, mode);
        }}
      >
        <div className="trip-editor__grid">
          <label className="trip-field" htmlFor="trip-name">
            <span>旅行名称</span>
            <input
              id="trip-name"
              className="ui-input"
              value={draft.name}
              maxLength={80}
              disabled={busy}
              onChange={(event) => onDraftChange({ ...draft, name: event.target.value })}
            />
          </label>
          <label className="trip-field" htmlFor="trip-destination-name">
            <span>目的地</span>
            <input
              id="trip-destination-name"
              className="ui-input"
              value={draft.destination.name}
              maxLength={120}
              disabled={busy}
              onChange={(event) => onDraftChange({
                ...draft,
                destination: { ...draft.destination, name: event.target.value }
              })}
            />
          </label>
          <label className="trip-field" htmlFor="trip-start-date">
            <span>开始日期</span>
            <input
              id="trip-start-date"
              className="ui-input"
              type="date"
              value={draft.startDate}
              disabled={busy}
              onChange={(event) => onDraftChange(updateDraftDateRange(draft, "startDate", event.target.value))}
            />
          </label>
          <label className="trip-field" htmlFor="trip-end-date">
            <span>结束日期</span>
            <input
              id="trip-end-date"
              className="ui-input"
              type="date"
              min={draft.startDate}
              value={draft.endDate}
              disabled={busy}
              onChange={(event) => onDraftChange(updateDraftDateRange(draft, "endDate", event.target.value))}
            />
            <small>{durationDescription(draft.startDate, draft.endDate)}</small>
          </label>
          <label className="trip-field" htmlFor="trip-destination-latitude">
            <span>纬度（可选）</span>
            <input
              id="trip-destination-latitude"
              className="ui-input"
              type="number"
              min={-90}
              max={90}
              step="any"
              value={draft.destination.latitude ?? ""}
              disabled={busy}
              onChange={(event) => onDraftChange({
                ...draft,
                destination: {
                  ...draft.destination,
                  latitude: optionalNumber(event.target.value)
                }
              })}
            />
          </label>
          <label className="trip-field" htmlFor="trip-destination-longitude">
            <span>经度（可选）</span>
            <input
              id="trip-destination-longitude"
              className="ui-input"
              type="number"
              min={-180}
              max={180}
              step="any"
              value={draft.destination.longitude ?? ""}
              disabled={busy}
              onChange={(event) => onDraftChange({
                ...draft,
                destination: {
                  ...draft.destination,
                  longitude: optionalNumber(event.target.value)
                }
              })}
            />
          </label>
        </div>

        <fieldset className="trip-constraints">
          <legend>硬约束</legend>
          <div className="trip-editor__grid trip-editor__grid--constraints">
            <label className="trip-field" htmlFor="trip-max-garments">
              <span>最多衣物数</span>
              <input
                id="trip-max-garments"
                className="ui-input"
                type="number"
                min={0}
                max={100}
                value={draft.maxGarments}
                disabled={busy}
                onChange={(event) => onDraftChange({ ...draft, maxGarments: numericValue(event.target.value) })}
              />
            </label>
            <label className="trip-field" htmlFor="trip-max-shoes">
              <span>最多鞋履数</span>
              <input
                id="trip-max-shoes"
                className="ui-input"
                type="number"
                min={0}
                max={20}
                value={draft.maxShoes}
                disabled={busy}
                onChange={(event) => onDraftChange({ ...draft, maxShoes: numericValue(event.target.value) })}
              />
            </label>
            <label className="trip-field" htmlFor="trip-repeat-policy">
              <span>重复穿规则</span>
              <select
                id="trip-repeat-policy"
                className="ui-select"
                value={draft.repeatPolicy}
                disabled={busy}
                onChange={(event) => onDraftChange({ ...draft, repeatPolicy: event.target.value as TripRepeatPolicy })}
              >
                {REPEAT_POLICY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="trip-field" htmlFor="trip-core-wears">
              <span>每次洗衣前核心衣物可穿次数</span>
              <select
                id="trip-core-wears"
                className="ui-select"
                value={draft.maxCoreWearsBetweenLaundry}
                disabled={busy}
                onChange={(event) => onDraftChange({
                  ...draft,
                  maxCoreWearsBetweenLaundry: Number(event.target.value) as 1 | 2 | 3
                })}
              >
                <option value={1}>1 次</option>
                <option value={2}>2 次</option>
                <option value={3}>3 次</option>
              </select>
            </label>
            <label className="trip-field" htmlFor="trip-laundry-day">
              <span>洗衣日（可选）</span>
              <select
                id="trip-laundry-day"
                className="ui-select"
                value={draft.laundryDay ?? ""}
                disabled={busy}
                onChange={(event) => onDraftChange({
                  ...draft,
                  laundryDay: event.target.value || undefined
                })}
              >
                <option value="">没有洗衣机会</option>
                {draft.days.map((day) => (
                  <option key={day.date} value={day.date}>{formatLongDate(day.date)}</option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>

        <section className="trip-days-editor" aria-labelledby="trip-days-editor-title">
          <header>
            <h4 id="trip-days-editor-title">逐日活动</h4>
            <p>活动可与相邻活动共用搭配，也可明确要求独立搭配。</p>
          </header>
          <div className="trip-days-editor__list">
            {draft.days.map((day, dayIndex) => (
              <fieldset key={`${day.date}-${dayIndex}`} className="trip-day-editor">
                <legend>{formatLongDate(day.date)}</legend>
                <div className="trip-day-editor__activities">
                  {day.activities.map((activity, activityIndex) => (
                    <ActivityEditor
                      key={`${day.date}-${activityIndex}`}
                      dayIndex={dayIndex}
                      activityIndex={activityIndex}
                      activity={activity}
                      canRemove={day.activities.length > 1}
                      busy={busy}
                      onChange={(next) => onDraftChange(updateActivity(draft, dayIndex, activityIndex, next))}
                      onRemove={() => onDraftChange(removeActivity(draft, dayIndex, activityIndex))}
                    />
                  ))}
                </div>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => onDraftChange(addActivity(draft, dayIndex))}
                >
                  <Plus aria-hidden="true" size={17} />
                  新增活动
                </Button>
              </fieldset>
            ))}
          </div>
        </section>

        {issue ? <Notice tone="warning" role="status">{issue}</Notice> : null}

        <footer className="trip-editor__actions">
          <Button variant="ghost" disabled={busy} onClick={onCancel}>取消</Button>
          <Button type="submit" variant="primary" disabled={busy || Boolean(issue)}>
            {busy ? "保存中" : mode === "create" ? "创建旅行" : "保存修改"}
          </Button>
        </footer>
      </form>
    </Surface>
  );
}

function ActivityEditor({
  dayIndex,
  activityIndex,
  activity,
  canRemove,
  busy,
  onChange,
  onRemove
}: {
  dayIndex: number;
  activityIndex: number;
  activity: TripActivityInput;
  canRemove: boolean;
  busy?: boolean;
  onChange: (activity: TripActivityInput) => void;
  onRemove: () => void;
}) {
  const prefix = `trip-day-${dayIndex}-activity-${activityIndex}`;
  return (
    <div className="trip-activity-editor">
      <div className="trip-activity-editor__grid">
        <label className="trip-field" htmlFor={`${prefix}-name`}>
          <span>活动名称</span>
          <input
            id={`${prefix}-name`}
            className="ui-input"
            value={activity.name}
            maxLength={80}
            disabled={busy}
            onChange={(event) => onChange({ ...activity, name: event.target.value })}
          />
        </label>
        <label className="trip-field" htmlFor={`${prefix}-occasion`}>
          <span>场合</span>
          <input
            id={`${prefix}-occasion`}
            className="ui-input"
            value={activity.occasion}
            maxLength={80}
            disabled={busy}
            onChange={(event) => onChange({ ...activity, occasion: event.target.value })}
          />
        </label>
        <label className="trip-field" htmlFor={`${prefix}-formality`}>
          <span>正式度</span>
          <select
            id={`${prefix}-formality`}
            className="ui-select"
            value={activity.formality}
            disabled={busy}
            onChange={(event) => onChange({ ...activity, formality: event.target.value as Formality })}
          >
            {FORMALITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="trip-activity-editor__separate" htmlFor={`${prefix}-separate`}>
        <input
          id={`${prefix}-separate`}
          type="checkbox"
          checked={activity.requiresSeparateOutfit}
          disabled={busy}
          onChange={(event) => onChange({ ...activity, requiresSeparateOutfit: event.target.checked })}
        />
        <span>
          <strong>{activity.requiresSeparateOutfit ? "需要独立搭配" : "与相邻活动共用搭配"}</strong>
          <small>关闭时与相邻活动共用搭配，打开时需要独立搭配。</small>
        </span>
      </label>
      {canRemove ? (
        <Button variant="ghost" disabled={busy} onClick={onRemove}>
          <Trash2 aria-hidden="true" size={17} />
          移除活动
        </Button>
      ) : null}
    </div>
  );
}

function TripWorkspace({ trip, props }: { trip: Trip; props: TripPlannerViewProps }) {
  const readOnly = trip.status === "completed" || trip.status === "archived";
  const selections = !readOnly && props.optimization?.status === "feasible"
    ? props.optimization.selections
    : trip.selections;
  const allSelectionsConfirmed = selections.length > 0
    && selections.every((selection) => props.confirmedSelectionIds.includes(selection.id));

  return (
    <div className="trip-workspace">
      <Surface className="trip-summary" aria-labelledby={`trip-${trip.id}-title`}>
        <header className="trip-summary__header">
          <div>
            <div className="trip-summary__status">
              <Badge tone={trip.status === "completed" ? "success" : "accent"}>{STATUS_LABELS[trip.status]}</Badge>
              <span>{formatDateRange(trip.startDate, trip.endDate)}</span>
            </div>
            <h3 id={`trip-${trip.id}-title`}>{trip.name}</h3>
            <p><MapPin aria-hidden="true" size={16} />{trip.destination.name}</p>
          </div>
          {!readOnly ? <Button variant="secondary" disabled={props.busy} onClick={() => props.onStartEdit(trip)}>
            <Edit3 aria-hidden="true" size={17} />
            编辑旅行
          </Button> : null}
        </header>

        <dl className="trip-summary__constraints">
          <div><dt>衣物上限</dt><dd>{trip.maxGarments} 件</dd></div>
          <div><dt>鞋履上限</dt><dd>{trip.maxShoes} 双</dd></div>
          <div><dt>重复规则</dt><dd>{repeatPolicyLabel(trip.repeatPolicy)}</dd></div>
          <div><dt>洗衣机会</dt><dd>{trip.laundryDay ? formatLongDate(trip.laundryDay) : "无"}</dd></div>
        </dl>

        {!readOnly ? <div className="trip-summary__actions">
          <div>
            <Button variant="secondary" disabled={props.busy} onClick={() => props.onRefreshWeather(trip)}>
              <RefreshCw aria-hidden="true" size={17} />
              刷新天气
            </Button>
            <small>仅在点击后使用目的地坐标，并发送给 Open-Meteo 获取天气</small>
          </div>
          <Button variant="primary" disabled={props.busy} onClick={() => props.onGenerate(trip)}>
            <Sparkles aria-hidden="true" size={17} />
            生成胶囊方案
          </Button>
          {trip.status === "planning" || trip.status === "ready" ? (
            <Button
              variant="ghost"
              aria-label={`归档旅行 ${trip.name}`}
              disabled={props.busy}
              onClick={() => props.onArchiveTrip(trip)}
            >
              归档旅行
            </Button>
          ) : null}
        </div> : null}
      </Surface>

      <TripItinerary trip={trip} />

      {!readOnly && props.optimization?.status === "infeasible" ? (
        <InfeasibleResult
          trip={trip}
          result={props.optimization}
          busy={props.busy || readOnly}
          onApplyRelaxation={props.onApplyRelaxation}
        />
      ) : (
        <TripSelections
          trip={trip}
          selections={selections}
          availableGarments={props.availableGarments}
          confirmedSelectionIds={props.confirmedSelectionIds}
          busy={props.busy || readOnly}
          readOnly={readOnly}
          onToggleGarmentLock={props.onToggleGarmentLock}
          onReplaceGarment={props.onReplaceGarment}
          onToggleWearConfirmation={props.onToggleWearConfirmation}
          onGenerate={props.onGenerate}
        />
      )}

      <PackingChecklist
        items={trip.packingItems}
        essentialDraft={props.essentialDraft}
        busy={props.busy}
        readOnly={readOnly}
        onStatusChange={props.onPackingStatus}
        onEssentialDraftChange={props.onEssentialDraftChange}
        onAddEssential={props.onAddEssential}
        onRemoveEssential={props.onRemoveEssential}
      />

      {!readOnly ? (
        <Surface className="trip-complete-panel">
          <div>
            <h3>完成旅行</h3>
            <p>逐项确认每天的实际穿着后，才会写入穿着记录。</p>
          </div>
          <Button
            variant="primary"
            disabled={props.busy || !allSelectionsConfirmed}
            onClick={() => props.onCompleteTrip(trip)}
          >
            完成并写入穿着记录
          </Button>
        </Surface>
      ) : null}
    </div>
  );
}

function TripItinerary({ trip }: { trip: Trip }) {
  return (
    <section className="trip-itinerary" aria-labelledby="trip-itinerary-title">
      <header>
        <h3 id="trip-itinerary-title">逐日行程与天气</h3>
        <p>天气是旅行计划内的快照，不会自动刷新。</p>
      </header>
      <div className="trip-itinerary__days">
        {trip.days.map((day) => (
          <article key={day.id} className="trip-itinerary-day">
            <header>
              <time dateTime={day.date}>{formatLongDate(day.date)}</time>
              {day.weather ? (
                <span><CloudSun aria-hidden="true" size={16} />{day.weather.summary} {Math.round(day.weather.temperature)}°C</span>
              ) : (
                <span>暂无天气</span>
              )}
            </header>
            <ul>
              {day.activities.map((activity) => (
                <li key={activity.id}>
                  <strong>{activity.name}</strong>
                  <span>{activity.occasion} · {formalityLabel(activity.formality)}</span>
                  <small>{activity.requiresSeparateOutfit ? "独立搭配" : "可与相邻活动共用"}</small>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

function InfeasibleResult({
  trip,
  result,
  busy,
  onApplyRelaxation
}: {
  trip: Trip;
  result: Extract<TripOptimizationResult, { status: "infeasible" }>;
  busy?: boolean;
  onApplyRelaxation: TripPlannerViewProps["onApplyRelaxation"];
}) {
  return (
    <Notice tone="warning" className="trip-infeasible" role="status" title="没有满足全部硬约束的方案">
      <div className="trip-infeasible__content">
        <section>
          <h4>冲突约束</h4>
          <ul>{result.conflicts.map((conflict, index) => <li key={`${conflict.constraint}-${index}`}>{conflict.message}</li>)}</ul>
        </section>
        {result.relaxations.length ? (
          <section>
            <h4>最小放宽建议</h4>
            <div className="trip-infeasible__relaxations">
              {result.relaxations.map((relaxation, index) => (
                <div key={`${relaxation.constraint}-${index}`}>
                  <span>{relaxation.message}{relaxation.guaranteed ? "" : "（需手动调整后重新检查）"}</span>
                  {relaxation.guaranteed ? (
                    <Button
                      variant="secondary"
                      disabled={busy}
                      aria-label={`应用放宽建议：${relaxation.message}`}
                      onClick={() => onApplyRelaxation(trip, relaxation)}
                    >
                      应用建议
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </Notice>
  );
}

function TripSelections({
  trip,
  selections,
  availableGarments,
  confirmedSelectionIds,
  busy,
  readOnly,
  onToggleGarmentLock,
  onReplaceGarment,
  onToggleWearConfirmation,
  onGenerate
}: {
  trip: Trip;
  selections: TripOutfitSelection[];
  availableGarments: Garment[];
  confirmedSelectionIds: number[];
  busy?: boolean;
  readOnly?: boolean;
  onToggleGarmentLock: TripPlannerViewProps["onToggleGarmentLock"];
  onReplaceGarment: TripPlannerViewProps["onReplaceGarment"];
  onToggleWearConfirmation: TripPlannerViewProps["onToggleWearConfirmation"];
  onGenerate: TripPlannerViewProps["onGenerate"];
}) {
  return (
    <section className="trip-selections" aria-labelledby="trip-selections-title">
      <header>
        <h3 id="trip-selections-title">逐日搭配</h3>
        <p>{readOnly ? "这是旅行完成时冻结的只读方案记录。" : "锁定喜欢的单品，或从同类别的可用衣物中手工替换。"}</p>
      </header>
      {selections.length ? (
        <div className="trip-selections__list">
          {selections.map((selection) => (
            <TripSelectionCard
              key={selection.id}
              trip={trip}
              selection={selection}
              availableGarments={availableGarments}
              confirmed={confirmedSelectionIds.includes(selection.id)}
              busy={busy}
              onToggleGarmentLock={onToggleGarmentLock}
              onReplaceGarment={onReplaceGarment}
              onToggleWearConfirmation={onToggleWearConfirmation}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          compact
          title="还没有生成搭配"
          description="生成后会显示每套搭配覆盖的日期、活动和选择理由。"
          action={readOnly ? undefined : (
            <Button variant="primary" disabled={busy} onClick={() => onGenerate(trip)}>生成胶囊方案</Button>
          )}
        />
      )}
    </section>
  );
}

function TripSelectionCard({
  trip,
  selection,
  availableGarments,
  confirmed,
  busy,
  onToggleGarmentLock,
  onReplaceGarment,
  onToggleWearConfirmation
}: {
  trip: Trip;
  selection: TripOutfitSelection;
  availableGarments: Garment[];
  confirmed: boolean;
  busy?: boolean;
  onToggleGarmentLock: TripPlannerViewProps["onToggleGarmentLock"];
  onReplaceGarment: TripPlannerViewProps["onReplaceGarment"];
  onToggleWearConfirmation: TripPlannerViewProps["onToggleWearConfirmation"];
}) {
  const wearRecorded = Boolean(selection.actualWearEventId);
  const day = trip.days.find((candidate) => candidate.id === selection.tripDayId);
  const activities = day?.activities.filter((activity) => selection.activityIds.includes(activity.id)) ?? [];

  return (
    <Surface as="article" className="trip-selection-card">
      <header className="trip-selection-card__header">
        <div>
          <time dateTime={day?.date}>{day ? formatLongDate(day.date) : "未知日期"}</time>
          <h4>{activities.map((activity) => activity.name).join(" + ") || `搭配 ${selection.slotIndex + 1}`}</h4>
        </div>
        <Badge tone="neutral">评分 {Math.round(selection.score)}</Badge>
      </header>

      <ul className="trip-selection-card__reasons" aria-label="选择理由">
        {selection.reasons.map((reason, index) => <li key={`${index}-${reason}`}>{reason}</li>)}
      </ul>

      <div className="trip-selection-card__garments">
        {selection.garments.map((garment) => {
          const locked = selection.lockedGarmentIds.includes(garment.id);
          const replacements = availableGarments.filter((candidate) =>
            candidate.id !== garment.id
            && candidate.category === garment.category
            && candidate.confirmed
            && !candidate.excluded
            && !candidate.archivedAt
            && candidate.availabilityStatus === "available"
          );
          return (
            <article key={garment.id} className="trip-selection-garment">
              <div>
                <span>{CATEGORY_LABELS[garment.category]}</span>
                <strong>{garmentName(garment)}</strong>
              </div>
              <label className="trip-selection-garment__lock" htmlFor={`trip-selection-${selection.id}-lock-${garment.id}`}>
                <input
                  id={`trip-selection-${selection.id}-lock-${garment.id}`}
                  type="checkbox"
                  checked={locked}
                  disabled={busy}
                  onChange={(event) => onToggleGarmentLock(selection, garment.id, event.target.checked)}
                />
                <LockKeyhole aria-hidden="true" size={16} />
                <span>锁定 {garment.name}</span>
              </label>
              <label className="trip-selection-garment__replacement" htmlFor={`trip-selection-${selection.id}-replace-${garment.id}`}>
                <span>替换为同类别可用衣物</span>
                <select
                  id={`trip-selection-${selection.id}-replace-${garment.id}`}
                  className="ui-select"
                  value=""
                  disabled={busy || !replacements.length}
                  onChange={(event) => {
                    const replacementId = Number(event.target.value);
                    if (replacementId) onReplaceGarment(selection, garment.id, replacementId);
                  }}
                >
                  <option value="">{replacements.length ? "选择替代衣物" : "没有可用替代"}</option>
                  {replacements.map((replacement) => (
                    <option key={replacement.id} value={replacement.id}>{garmentName(replacement)}</option>
                  ))}
                </select>
              </label>
            </article>
          );
        })}
      </div>

      <label className="trip-selection-card__confirmation" htmlFor={`trip-selection-${selection.id}-confirmed`}>
        <input
          id={`trip-selection-${selection.id}-confirmed`}
          type="checkbox"
          checked={confirmed || wearRecorded}
          aria-checked={confirmed || wearRecorded}
          disabled={busy || wearRecorded}
          onChange={(event) => onToggleWearConfirmation(selection, event.target.checked)}
        />
        <span>
          <strong>{selection.actualWearEventId ? "实际穿着已记录" : "确认这一天实际穿着"}</strong>
          <small>只有确认后，完成旅行时才会写入穿着记录。</small>
        </span>
      </label>
    </Surface>
  );
}

export function tripDurationDays(startDate: string, endDate: string): number {
  const start = dateKeyToUtc(startDate);
  const end = dateKeyToUtc(endDate);
  if (start === null || end === null) return 0;
  return Math.floor((end - start) / 86_400_000) + 1;
}

export function validateTripDraft(draft: TripCreateInput): string | null {
  if (!draft.name.trim()) return "请填写旅行名称。";
  if (!draft.destination.name.trim()) return "请填写目的地。";
  const duration = tripDurationDays(draft.startDate, draft.endDate);
  if (duration < 1 || duration > 7) return "旅行日期必须覆盖 1-7 天，且结束日期不能早于开始日期。";
  if (!Number.isInteger(draft.maxGarments) || draft.maxGarments < 0 || draft.maxGarments > 100) {
    return "最多衣物数必须是 0 到 100 之间的整数。";
  }
  if (!Number.isInteger(draft.maxShoes) || draft.maxShoes < 0 || draft.maxShoes > 20) {
    return "最多鞋履数必须是 0 到 20 之间的整数。";
  }
  const hasLatitude = draft.destination.latitude !== undefined;
  const hasLongitude = draft.destination.longitude !== undefined;
  if (hasLatitude !== hasLongitude) return "纬度和经度必须同时填写或同时留空。";
  if (draft.destination.latitude !== undefined && (!Number.isFinite(draft.destination.latitude) || draft.destination.latitude < -90 || draft.destination.latitude > 90)) {
    return "纬度必须在 -90 到 90 之间。";
  }
  if (draft.destination.longitude !== undefined && (!Number.isFinite(draft.destination.longitude) || draft.destination.longitude < -180 || draft.destination.longitude > 180)) {
    return "经度必须在 -180 到 180 之间。";
  }
  if (draft.days.length !== duration) return "逐日活动必须与旅行日期一一对应。";
  for (const day of draft.days) {
    if (!day.activities.length) return `${formatLongDate(day.date)} 至少需要一个活动。`;
    if (day.activities.some((activity) => !activity.name.trim() || !activity.occasion.trim())) {
      return `${formatLongDate(day.date)} 的活动名称和场合不能为空。`;
    }
  }
  return null;
}

function updateDraftDateRange(draft: TripCreateInput, field: "startDate" | "endDate", value: string): TripCreateInput {
  const next = { ...draft, [field]: value };
  const keys = dateKeysBetween(next.startDate, next.endDate);
  if (!keys.length || keys.length > 7) return next;
  const daysByDate = new Map(draft.days.map((day) => [day.date, day]));
  const days = keys.map((date) => daysByDate.get(date) ?? {
    date,
    activities: [emptyActivity()]
  });
  return {
    ...next,
    days,
    laundryDay: next.laundryDay && keys.includes(next.laundryDay) ? next.laundryDay : undefined
  };
}

function updateActivity(draft: TripCreateInput, dayIndex: number, activityIndex: number, activity: TripActivityInput): TripCreateInput {
  return {
    ...draft,
    days: draft.days.map((day, index) => index === dayIndex ? {
      ...day,
      activities: day.activities.map((candidate, candidateIndex) => candidateIndex === activityIndex ? activity : candidate)
    } : day)
  };
}

function addActivity(draft: TripCreateInput, dayIndex: number): TripCreateInput {
  return {
    ...draft,
    days: draft.days.map((day, index) => index === dayIndex ? {
      ...day,
      activities: [...day.activities, emptyActivity()]
    } : day)
  };
}

function removeActivity(draft: TripCreateInput, dayIndex: number, activityIndex: number): TripCreateInput {
  return {
    ...draft,
    days: draft.days.map((day, index) => index === dayIndex ? {
      ...day,
      activities: day.activities.filter((_, candidateIndex) => candidateIndex !== activityIndex)
    } : day)
  };
}

function emptyActivity(): TripActivityInput {
  return {
    name: "",
    occasion: "casual",
    formality: "casual",
    requiresSeparateOutfit: false
  };
}

function dateKeysBetween(startDate: string, endDate: string): string[] {
  const start = dateKeyToUtc(startDate);
  const end = dateKeyToUtc(endDate);
  if (start === null || end === null || end < start) return [];
  const count = Math.floor((end - start) / 86_400_000) + 1;
  if (count > 7) return [];
  return Array.from({ length: count }, (_, index) => new Date(start + index * 86_400_000).toISOString().slice(0, 10));
}

function dateKeyToUtc(value: string): number | null {
  const match = DATE_KEY_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const time = Date.UTC(year, month - 1, day);
  const date = new Date(time);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? time : null;
}

function formatLongDate(date: string): string {
  const match = DATE_KEY_PATTERN.exec(date);
  return match ? `${Number(match[1])}年${Number(match[2])}月${Number(match[3])}日` : date;
}

function formatDateRange(startDate: string, endDate: string): string {
  if (startDate === endDate) return formatLongDate(startDate);
  return `${formatLongDate(startDate)} 至 ${formatLongDate(endDate)}`;
}

function durationDescription(startDate: string, endDate: string): string {
  const duration = tripDurationDays(startDate, endDate);
  return duration >= 1 && duration <= 7 ? `共 ${duration} 天` : "请选择 1-7 天的日期范围";
}

function optionalNumber(value: string): number | undefined {
  return value.trim() ? Number(value) : undefined;
}

function numericValue(value: string): number {
  return value.trim() ? Number(value) : 0;
}

function garmentName(garment: Garment): string {
  return [garment.brand, garment.name].filter(Boolean).join(" ") || garment.name;
}

function formalityLabel(formality: Formality): string {
  return FORMALITY_OPTIONS.find((option) => option.value === formality)?.label ?? formality;
}

function repeatPolicyLabel(policy: TripRepeatPolicy): string {
  return REPEAT_POLICY_OPTIONS.find((option) => option.value === policy)?.label ?? policy;
}
