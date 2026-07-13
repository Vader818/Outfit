import { Save, X } from "lucide-react";
import { useEffect, useId, useState, type FormEvent } from "react";
import { Button, Dialog, Field, IconButton, Notice, SelectField } from "../../components/ui";
import { CATEGORY_LABELS } from "../../shared/presentation";
import type {
  Garment,
  OutfitOccasion,
  SavedOutfit,
  WearEvent,
  WearEventInput as SharedWearEventInput
} from "../../shared/types";

export type WearEventInput = SharedWearEventInput;

export interface WearEventDraft {
  wornAtLocal: string;
  timeZone: string;
  outfitId?: number;
  occasion: string;
  notes: string;
  itemIds: number[];
}

export interface WearEventDialogInitial {
  wornAt?: string;
  timeZone?: string;
  outfitId?: number;
  occasion?: string;
  notes?: string;
  itemIds?: number[];
}

export interface WearEventDialogProps {
  open: boolean;
  event?: WearEvent | null;
  initial?: WearEventDialogInitial;
  outfits: SavedOutfit[];
  garments: Garment[];
  defaultTimeZone?: string;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (input: WearEventInput) => void | Promise<void>;
}

const LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

export function formatZonedDateTimeForInput(value: string, timeZone: string): string {
  assertTimeZone(timeZone);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError("实际穿着时间必须是有效的 UTC ISO timestamp");
  const parts = zonedParts(date.getTime(), timeZone);
  return `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function zonedDateTimeToIso(value: string, timeZone: string): string {
  const normalizedZone = timeZone.trim();
  assertTimeZone(normalizedZone);
  const match = LOCAL_DATE_TIME_PATTERN.exec(value);
  if (!match) throw new RangeError("实际穿着时间必须是 YYYY-MM-DDTHH:mm");
  const requested = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] ?? "0")
  };
  const wallClockAsUtc = Date.UTC(
    requested.year,
    requested.month - 1,
    requested.day,
    requested.hour,
    requested.minute,
    requested.second
  );
  const normalizedWallClock = new Date(wallClockAsUtc);
  if (normalizedWallClock.getUTCFullYear() !== requested.year ||
    normalizedWallClock.getUTCMonth() !== requested.month - 1 ||
    normalizedWallClock.getUTCDate() !== requested.day ||
    normalizedWallClock.getUTCHours() !== requested.hour ||
    normalizedWallClock.getUTCMinutes() !== requested.minute) {
    throw new RangeError("实际穿着时间不是有效的本地日期时间");
  }

  let instant = wallClockAsUtc;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const offset = timeZoneOffsetMilliseconds(instant, normalizedZone);
    const candidate = wallClockAsUtc - offset;
    if (candidate === instant) break;
    instant = candidate;
  }
  const actual = zonedParts(instant, normalizedZone);
  if (actual.year !== requested.year || actual.month !== requested.month || actual.day !== requested.day ||
    actual.hour !== requested.hour || actual.minute !== requested.minute || actual.second !== requested.second) {
    throw new RangeError(`实际穿着时间在 ${normalizedZone} 因夏令时切换而不存在`);
  }
  return new Date(instant).toISOString();
}

export function buildWearEventInput(draft: WearEventDraft): WearEventInput {
  const timeZone = draft.timeZone.trim();
  const occasion = parseOccasion(draft.occasion);
  const notes = draft.notes.trim();
  if (notes.length > 1000) throw new RangeError("备注不能超过 1000 个字符");
  if (draft.outfitId !== undefined && (!Number.isInteger(draft.outfitId) || draft.outfitId <= 0)) {
    throw new RangeError("保存搭配 ID 必须是正整数");
  }
  const itemIds = Array.from(new Set(draft.itemIds));
  if (!itemIds.length) throw new RangeError("请至少选择一件实际穿着的衣物");
  if (itemIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new RangeError("衣物 ID 必须是正整数");
  }
  return {
    wornAt: zonedDateTimeToIso(draft.wornAtLocal, timeZone),
    timeZone,
    outfitId: draft.outfitId ?? null,
    occasion,
    notes: notes || null,
    itemIds
  };
}

export function WearEventDialog(props: WearEventDialogProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const [draft, setDraft] = useState<WearEventDraft>(() => initialDraft(props));
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (!props.open) return;
    setDraft(initialDraft(props));
    setLocalError("");
  }, [props.open, props.event, props.initial, props.defaultTimeZone]);

  const selectedIds = new Set(draft.itemIds);
  const garmentOptions: Array<{
    id: number;
    name: string;
    category?: Garment["category"];
    historical: boolean;
  }> = [
    ...props.garments.map((garment) => ({
      id: garment.id,
      name: garment.name,
      category: garment.category,
      historical: false
    })),
    ...draft.itemIds
      .filter((itemId) => !props.garments.some((garment) => garment.id === itemId))
      .map((itemId) => ({ id: itemId, name: `衣物 #${itemId}`, historical: true }))
  ];

  function update<Key extends keyof WearEventDraft>(key: Key, value: WearEventDraft[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setLocalError("");
  }

  function selectOutfit(value: string) {
    if (!value) {
      update("outfitId", undefined);
      return;
    }
    const outfitId = Number(value);
    const outfit = props.outfits.find((candidate) => candidate.id === outfitId);
    const outfitItemIds = outfit?.items
      .map((item) => item.garmentId)
      .filter((itemId): itemId is number => itemId !== undefined) ?? [];
    setDraft((current) => ({
      ...current,
      outfitId,
      ...(outfitItemIds.length ? { itemIds: Array.from(new Set(outfitItemIds)) } : {})
    }));
    setLocalError("");
  }

  function toggleItem(itemId: number) {
    update("itemIds", selectedIds.has(itemId)
      ? draft.itemIds.filter((candidate) => candidate !== itemId)
      : [...draft.itemIds, itemId]);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const input = buildWearEventInput(draft);
      setLocalError("");
      void props.onSubmit(input);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "穿着记录输入无效");
    }
  }

  return (
    <Dialog
      open={props.open}
      labelledBy={titleId}
      describedBy={descriptionId}
      className="wear-event-dialog"
      onClose={() => {
        if (!props.busy) props.onClose();
      }}
    >
      <form className="wear-event-dialog__panel" aria-busy={props.busy || undefined} onSubmit={submit}>
        <header className="planner-dialog__header">
          <div>
            <span>实际穿着事实</span>
            <h2 id={titleId}>{props.event ? "编辑穿着记录" : "补录穿着"}</h2>
            <p id={descriptionId}>实际时间保存为 UTC，记录时区用于准确还原本地显示。</p>
          </div>
          <IconButton label="关闭穿着记录" disabled={props.busy} onClick={props.onClose}>
            <X aria-hidden="true" size={19} />
          </IconButton>
        </header>

        {localError || props.error ? (
          <Notice tone="danger" role="alert">{localError || props.error}</Notice>
        ) : null}

        <div className="planner-dialog__fields">
          <Field
            label="穿着时间"
            type="datetime-local"
            required
            value={draft.wornAtLocal}
            disabled={props.busy}
            onChange={(event) => update("wornAtLocal", event.target.value)}
          />
          <Field
            label="IANA 时区"
            required
            value={draft.timeZone}
            disabled={props.busy}
            hint="例如 Asia/Shanghai；用于跨午夜和夏令时还原。"
            onChange={(event) => update("timeZone", event.target.value)}
          />
          <SelectField
            label="保存的搭配（可选）"
            value={draft.outfitId === undefined ? "" : String(draft.outfitId)}
            disabled={props.busy}
            options={[
              { value: "", label: "不关联保存搭配" },
              ...props.outfits.map((outfit) => ({ value: String(outfit.id), label: outfit.name }))
            ]}
            onChange={(event) => selectOutfit(event.target.value)}
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

        <fieldset className="wear-event-dialog__items" disabled={props.busy}>
          <legend>实际穿着衣物</legend>
          {garmentOptions.length ? (
            <div className="wear-event-dialog__item-grid">
              {garmentOptions.map((garment) => (
                <label key={garment.id}>
                  <input
                    type="checkbox"
                    value={garment.id}
                    checked={selectedIds.has(garment.id)}
                    onChange={() => toggleItem(garment.id)}
                  />
                  <span>
                    <small>{garment.historical || !garment.category ? "历史衣物" : CATEGORY_LABELS[garment.category]}</small>
                    <strong>{garment.name}</strong>
                  </span>
                </label>
              ))}
            </div>
          ) : <p>衣橱中暂无可选择的衣物。</p>}
        </fieldset>

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
          <Button variant="ghost" disabled={props.busy} onClick={props.onClose}>取消</Button>
          <Button variant="primary" type="submit" disabled={props.busy}>
            <Save aria-hidden="true" size={17} />
            {props.busy ? "保存中" : props.event ? "保存修改" : "保存记录"}
          </Button>
        </footer>
      </form>
    </Dialog>
  );
}

function initialDraft(props: WearEventDialogProps): WearEventDraft {
  const timeZone = props.event?.timeZone ?? props.initial?.timeZone ?? props.defaultTimeZone ?? browserTimeZone();
  const wornAt = props.event?.wornAt ?? props.initial?.wornAt ?? new Date().toISOString();
  return {
    wornAtLocal: safeFormatForInput(wornAt, timeZone),
    timeZone,
    outfitId: props.event?.outfitId ?? props.initial?.outfitId,
    occasion: props.event?.occasion ?? props.initial?.occasion ?? "casual",
    notes: props.event?.notes ?? props.initial?.notes ?? "",
    itemIds: props.event
      ? [...props.event.items]
          .sort((left, right) => left.position - right.position || left.id - right.id)
          .map((item) => item.itemId)
      : [...(props.initial?.itemIds ?? [])]
  };
}

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function safeFormatForInput(value: string, timeZone: string): string {
  try {
    return formatZonedDateTimeForInput(value, timeZone);
  } catch {
    return value.slice(0, 16);
  }
}

function assertTimeZone(timeZone: string): void {
  if (!timeZone.trim()) throw new RangeError("请输入 IANA 时区");
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format(0);
  } catch {
    throw new RangeError("请输入有效的 IANA 时区");
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

function timeZoneOffsetMilliseconds(instant: number, timeZone: string): number {
  const rounded = Math.trunc(instant / 1000) * 1000;
  const parts = zonedParts(rounded, timeZone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - rounded;
}

function zonedParts(instant: number, timeZone: string) {
  const values = new Map(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).formatToParts(new Date(instant)).map((part) => [part.type, part.value])
  );
  return {
    year: Number(values.get("year")),
    month: Number(values.get("month")),
    day: Number(values.get("day")),
    hour: Number(values.get("hour")),
    minute: Number(values.get("minute")),
    second: Number(values.get("second"))
  };
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}
