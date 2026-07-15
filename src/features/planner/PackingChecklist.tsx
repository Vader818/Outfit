import { PackageCheck, Plus, Trash2 } from "lucide-react";
import { Button, EmptyState, Notice, Surface } from "../../components/ui";
import type { TripPackingItem, TripPackingStatus } from "../../shared/types";

const PACKING_STATUS_OPTIONS: Array<{ value: TripPackingStatus; label: string }> = [
  { value: "unpacked", label: "未装箱" },
  { value: "packed", label: "已打包" },
  { value: "on-body", label: "穿在身上" },
  { value: "not-taking", label: "不带" }
];

export interface PackingChecklistProps {
  items: TripPackingItem[];
  essentialDraft: string;
  busy?: boolean;
  readOnly?: boolean;
  error?: string;
  onStatusChange: (item: TripPackingItem, status: TripPackingStatus) => void;
  onEssentialDraftChange: (value: string) => void;
  onAddEssential: (label: string) => void;
  onRemoveEssential: (item: TripPackingItem) => void;
}

export function PackingChecklist(props: PackingChecklistProps) {
  const packedCount = props.items.filter((item) => item.status !== "unpacked").length;
  const garmentItems = props.items.filter((item) => item.kind === "garment");
  const essentialItems = props.items.filter((item) => item.kind === "essential");

  return (
    <Surface className="packing-checklist" aria-labelledby="packing-checklist-title">
      <header className="packing-checklist__header">
        <div>
          <h3 id="packing-checklist-title">装箱清单</h3>
          <p>{props.items.length ? `已处理 ${packedCount}/${props.items.length} 项` : "方案生成后会汇总去重衣物"}</p>
        </div>
        <PackageCheck aria-hidden="true" size={22} />
      </header>

      {props.error ? <Notice tone="danger" role="alert">{props.error}</Notice> : null}

      {props.items.length ? (
        <div className="packing-checklist__groups">
          {garmentItems.length ? (
            <PackingGroup
              title="衣物"
              items={garmentItems}
              busy={props.busy || props.readOnly}
              onStatusChange={props.onStatusChange}
            />
          ) : null}
          {essentialItems.length ? (
            <PackingGroup
              title="非衣物必需品"
              items={essentialItems}
              busy={props.busy || props.readOnly}
              onStatusChange={props.onStatusChange}
              onRemoveEssential={props.readOnly ? undefined : props.onRemoveEssential}
            />
          ) : null}
        </div>
      ) : (
        <EmptyState
          compact
          title="清单还是空的"
          description={props.readOnly
            ? "旅行完成时没有保存装箱项。"
            : "可以先生成胶囊方案，也可以直接添加非衣物必需品。"}
        />
      )}

      {!props.readOnly ? <form
        className="packing-essential-form"
        onSubmit={(event) => {
          event.preventDefault();
          const label = props.essentialDraft.trim();
          if (label) props.onAddEssential(label);
        }}
      >
        <label htmlFor="packing-essential-draft">
          <span>添加非衣物必需品</span>
          <input
            id="packing-essential-draft"
            className="ui-input"
            value={props.essentialDraft}
            maxLength={120}
            disabled={props.busy}
            placeholder="例如：充电器"
            onChange={(event) => props.onEssentialDraftChange(event.target.value)}
          />
        </label>
        <Button type="submit" variant="secondary" disabled={props.busy || !props.essentialDraft.trim()}>
          <Plus aria-hidden="true" size={17} />
          添加
        </Button>
      </form> : null}
    </Surface>
  );
}

function PackingGroup({
  title,
  items,
  busy,
  onStatusChange,
  onRemoveEssential
}: {
  title: string;
  items: TripPackingItem[];
  busy?: boolean;
  onStatusChange: PackingChecklistProps["onStatusChange"];
  onRemoveEssential?: PackingChecklistProps["onRemoveEssential"];
}) {
  return (
    <section className="packing-group" aria-labelledby={`packing-${title}-title`}>
      <h4 id={`packing-${title}-title`}>{title}</h4>
      <ul className="packing-group__list" role="list">
        {items.map((item) => (
          <li key={item.id} className="packing-item">
            <div className="packing-item__copy">
              <strong>{item.label}</strong>
              {item.coverage.dates.length ? (
                <small>覆盖 {item.coverage.dates.map(formatShortDate).join("、")}</small>
              ) : (
                <small>自由添加的必需品</small>
              )}
              {item.coverage.activities?.length ? (
                <small>活动 {item.coverage.activities.join("、")}</small>
              ) : null}
              {item.coverage.reasons?.length ? (
                <small>选择原因：{item.coverage.reasons.join("；")}</small>
              ) : null}
            </div>
            <label className="packing-item__status" htmlFor={`packing-item-${item.id}-status`}>
              <span>装箱状态</span>
              <select
                id={`packing-item-${item.id}-status`}
                className="ui-select"
                value={item.status}
                disabled={busy}
                onChange={(event) => onStatusChange(item, event.target.value as TripPackingStatus)}
              >
                {PACKING_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            {item.kind === "essential" && onRemoveEssential ? (
              <Button
                variant="ghost"
                aria-label={`移除必需品 ${item.label}`}
                disabled={busy}
                onClick={() => onRemoveEssential(item)}
              >
                <Trash2 aria-hidden="true" size={17} />
                移除
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatShortDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return match ? `${Number(match[2])}月${Number(match[3])}日` : date;
}
