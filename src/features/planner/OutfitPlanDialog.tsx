import { CalendarPlus, RefreshCw, X } from "lucide-react";
import { useEffect, useId, useState, type FormEvent } from "react";
import { Button, Dialog, Field, IconButton, Notice, SelectField } from "../../components/ui";
import type {
  OutfitOccasion,
  OutfitPlanInput as SharedOutfitPlanInput,
  SavedOutfit,
  WeatherSnapshot
} from "../../shared/types";
import { isCalendarDateKey } from "./WeekGrid";

export type OutfitPlanInput = SharedOutfitPlanInput;

export interface OutfitPlanDraft {
  plannedDate: string;
  timeZone: string;
  outfitId?: number;
  occasion: string;
  notes: string;
}

export interface OutfitPlanDialogProps {
  open: boolean;
  mode?: "create" | "edit";
  initial?: Partial<OutfitPlanDraft> & { weatherSnapshot?: WeatherSnapshot };
  outfits: SavedOutfit[];
  forecasts: WeatherSnapshot[];
  minDate?: string;
  maxDate?: string;
  busy: boolean;
  error?: string;
  repeatWarning?: string;
  onClose: () => void;
  onSubmit: (input: OutfitPlanInput) => void | Promise<void>;
  onReplace?: () => void;
}

export function buildOutfitPlanInput(
  draft: OutfitPlanDraft,
  forecasts: WeatherSnapshot[],
  editContext?: {
    originalPlannedDate?: string;
    originalWeatherSnapshot?: WeatherSnapshot;
  }
): OutfitPlanInput {
  if (!isCalendarDateKey(draft.plannedDate)) {
    throw new RangeError("计划日期必须是有效的 YYYY-MM-DD 本地日历键");
  }
  const timeZone = draft.timeZone.trim();
  if (!validTimeZone(timeZone)) throw new RangeError("请输入有效的 IANA 时区");
  if (!Number.isInteger(draft.outfitId) || Number(draft.outfitId) <= 0) {
    throw new RangeError("请选择保存的搭配");
  }
  const occasion = parseOccasion(draft.occasion);
  const notes = draft.notes.trim();
  if (notes.length > 1000) throw new RangeError("备注不能超过 1000 个字符");
  const weatherSnapshot = editContext && draft.plannedDate === editContext.originalPlannedDate
    ? editContext.originalWeatherSnapshot
    : forecasts.find((forecast) => forecast.date === draft.plannedDate);
  return {
    plannedDate: draft.plannedDate,
    timeZone,
    outfitId: draft.outfitId as number,
    occasion,
    notes,
    ...(weatherSnapshot ? { weatherSnapshot } : {})
  };
}

export function OutfitPlanDialog(props: OutfitPlanDialogProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const [draft, setDraft] = useState<OutfitPlanDraft>(() => initialDraft(props));
  const [localError, setLocalError] = useState("");
  const effectiveMinDate = props.mode === "edit" && props.initial?.plannedDate && props.minDate &&
    props.initial.plannedDate < props.minDate
    ? props.initial.plannedDate
    : props.minDate;

  useEffect(() => {
    if (!props.open) return;
    setDraft(initialDraft(props));
    setLocalError("");
  }, [props.open, props.initial]);

  const selectedForecast = props.mode === "edit" && draft.plannedDate === props.initial?.plannedDate
    ? props.initial.weatherSnapshot
    : props.forecasts.find((forecast) => forecast.date === draft.plannedDate);
  const selectedOutfit = props.outfits.find((outfit) => outfit.id === draft.outfitId);

  function update<Key extends keyof OutfitPlanDraft>(key: Key, value: OutfitPlanDraft[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setLocalError("");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const input = buildOutfitPlanInput(
        draft,
        props.forecasts,
        props.mode === "edit"
          ? {
              originalPlannedDate: props.initial?.plannedDate,
              originalWeatherSnapshot: props.initial?.weatherSnapshot
            }
          : undefined
      );
      setLocalError("");
      void props.onSubmit(input);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "计划输入无效");
    }
  }

  return (
    <Dialog
      open={props.open}
      labelledBy={titleId}
      describedBy={descriptionId}
      className="outfit-plan-dialog"
      onClose={() => {
        if (!props.busy) props.onClose();
      }}
    >
      <form className="outfit-plan-dialog__panel" aria-busy={props.busy || undefined} onSubmit={submit}>
        <header className="planner-dialog__header">
          <div>
            <span>未来穿搭安排</span>
            <h2 id={titleId}>{props.mode === "edit" ? "编辑计划" : "安排日期"}</h2>
            <p id={descriptionId}>日期按本地日历键保存，不会因 UTC 转换移动到前一天。</p>
          </div>
          <IconButton label="关闭计划" disabled={props.busy} onClick={props.onClose}>
            <X aria-hidden="true" size={19} />
          </IconButton>
        </header>

        {localError || props.error ? (
          <Notice tone="danger" role="alert">{localError || props.error}</Notice>
        ) : null}
        {props.repeatWarning ? (
          <Notice tone="warning" role="status" title="近期有相同搭配">
            <p>{props.repeatWarning}</p>
            <p>计划已经保存。关闭提醒或去换一件都不会撤销当前计划。</p>
          </Notice>
        ) : null}

        <div className="planner-dialog__fields">
          <Field
            label="计划日期"
            type="date"
            required
            min={effectiveMinDate}
            max={props.maxDate}
            value={draft.plannedDate}
            disabled={props.busy}
            onInput={(event) => update("plannedDate", event.currentTarget.value)}
            onChange={(event) => update("plannedDate", event.target.value)}
          />
          <Field
            label="IANA 时区"
            required
            value={draft.timeZone}
            disabled={props.busy}
            hint="计划日期保持本地日历语义。"
            onChange={(event) => update("timeZone", event.target.value)}
          />
          <SelectField
            label="保存的搭配"
            required
            value={draft.outfitId === undefined ? "" : String(draft.outfitId)}
            disabled={props.busy}
            options={[
              { value: "", label: "请选择搭配" },
              ...props.outfits
                .filter((outfit) => !outfit.archivedAt || outfit.id === draft.outfitId)
                .map((outfit) => ({
                  value: String(outfit.id),
                  label: outfit.archivedAt ? `${outfit.name}（已归档）` : outfit.name
                }))
            ]}
            onChange={(event) => update("outfitId", event.target.value ? Number(event.target.value) : undefined)}
          />
          <SelectField
            label="场合"
            required
            value={draft.occasion}
            disabled={props.busy}
            options={OCCASION_OPTIONS}
            onChange={(event) => update("occasion", event.target.value)}
          />
        </div>

        <div className="outfit-plan-dialog__snapshot" aria-live="polite">
          <div>
            <span>搭配</span>
            <strong>{selectedOutfit?.name ?? "尚未选择"}</strong>
          </div>
          <div>
            <span>天气快照</span>
            <strong>{selectedForecast
              ? `${selectedForecast.summary} · 体感 ${selectedForecast.apparentTemperature}°C`
              : "暂无；临近日期后再更新"}</strong>
          </div>
        </div>

        <label className="ui-field planner-dialog__notes">
          <span className="ui-field__label">备注（可选）</span>
          <textarea
            className="ui-input"
            rows={4}
            maxLength={1000}
            value={draft.notes}
            disabled={props.busy}
            onChange={(event) => update("notes", event.target.value)}
          />
          <small className="ui-field__hint">最多 1000 字。</small>
        </label>

        <footer className="planner-dialog__footer">
          {props.repeatWarning && props.onReplace ? (
            <Button variant="secondary" disabled={props.busy} onClick={props.onReplace}>
              <RefreshCw aria-hidden="true" size={17} />
              换一件（保留当前计划）
            </Button>
          ) : null}
          <Button variant="ghost" disabled={props.busy} onClick={props.onClose}>
            {props.repeatWarning ? "关闭" : "取消"}
          </Button>
          <Button variant="primary" type="submit" disabled={props.busy}>
            <CalendarPlus aria-hidden="true" size={17} />
            {props.busy ? "保存中" : props.repeatWarning ? "保留计划" : "保存计划"}
          </Button>
        </footer>
      </form>
    </Dialog>
  );
}

function initialDraft(props: OutfitPlanDialogProps): OutfitPlanDraft {
  return {
    plannedDate: props.initial?.plannedDate ?? props.minDate ?? "",
    timeZone: props.initial?.timeZone ?? browserTimeZone(),
    outfitId: props.initial?.outfitId,
    occasion: props.initial?.occasion ?? "casual",
    notes: props.initial?.notes ?? ""
  };
}

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function validTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

const OCCASION_OPTIONS: Array<{ value: OutfitOccasion; label: string }> = [
  { value: "casual", label: "休闲" },
  { value: "smart-casual", label: "商务休闲" },
  { value: "formal", label: "正式" },
  { value: "sport", label: "运动" },
  { value: "date", label: "约会" },
  { value: "dinner", label: "晚餐" }
];

function parseOccasion(value: string): OutfitOccasion {
  const normalized = value.trim();
  const option = OCCASION_OPTIONS.find((candidate) => candidate.value === normalized);
  if (!option) throw new RangeError("请选择有效场合");
  return option.value;
}
