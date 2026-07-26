import { ArrowDown, ArrowUp, GripVertical, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Button, Dialog, Field, IconButton, Notice, SelectField } from "../../components/ui";
import { CATEGORY_LABELS } from "../../shared/presentation";
import type {
  Garment,
  OutfitSlot,
  SavedOutfit,
  SavedOutfitCreateInput,
  SavedOutfitItem,
  SavedOutfitItemInput,
  SavedOutfitUpdateInput
} from "../../shared/types";

const SINGLE_SLOTS = ["top", "bottom", "dress", "outerwear", "shoes"] as const;
type SingleSlot = (typeof SINGLE_SLOTS)[number];

export interface OutfitBuilderProps {
  open: boolean;
  outfit?: SavedOutfit | null;
  garments: Garment[];
  busy: boolean;
  error?: string;
  onClose: () => void;
  onSave: (input: SavedOutfitCreateInput | SavedOutfitUpdateInput) => void | Promise<void>;
}

export interface OutfitBuilderValidation {
  name?: string;
  items: string[];
}

export interface UnavailableOutfitItem {
  item: SavedOutfitItem;
  reason: "archived" | "deleted" | "unavailable";
}

export function outfitBuilderDraftIdentity(
  open: boolean,
  outfit: SavedOutfit | null | undefined
): string | null {
  if (!open) return null;
  return outfit ? `saved:${outfit.id}` : "new";
}

export interface OutfitBuilderSubmissionOptions {
  existing: boolean;
  contentEditing: boolean;
  contentDirty: boolean;
  unresolvedItemCount: number;
}

export function validateOutfitBuilderDraft(
  name: string,
  items: SavedOutfitItemInput[],
  garments: Garment[]
): OutfitBuilderValidation {
  const result: OutfitBuilderValidation = { items: [] };
  const garmentById = new Map(garments.map((garment) => [garment.id, garment]));
  const garmentIds = new Set<number>();
  const positions = new Set<string>();
  const slots = new Set<OutfitSlot>();

  if (!name.trim()) result.name = "请输入搭配名称";

  for (const item of items) {
    slots.add(item.slot);
    if (!Number.isSafeInteger(item.garmentId) || item.garmentId <= 0) {
      addIssue(result.items, "衣物编号无效");
    }
    if (garmentIds.has(item.garmentId)) {
      addIssue(result.items, "同一件衣物只能使用一次");
    }
    garmentIds.add(item.garmentId);

    if (!Number.isSafeInteger(item.position) || item.position < 0) {
      addIssue(result.items, "搭配位置必须是非负整数");
    }
    if (item.slot !== "accessory" && item.position !== 0) {
      addIssue(result.items, `${CATEGORY_LABELS[item.slot]}位置必须为 0`);
    }
    const positionKey = `${item.slot}:${item.position}`;
    if (positions.has(positionKey)) {
      addIssue(result.items, `搭配位置 ${positionKey} 重复`);
    }
    positions.add(positionKey);

    const garment = garmentById.get(item.garmentId);
    if (!garment || garment.archivedAt || !garment.confirmed || !garment.owned) {
      addIssue(result.items, `衣物 #${item.garmentId} 不可用于当前搭配`);
    } else if (garment.category !== item.slot) {
      addIssue(result.items, `衣物类别与搭配位置不一致：${garment.name}`);
    }
  }

  const hasDress = slots.has("dress");
  const hasTop = slots.has("top");
  const hasBottom = slots.has("bottom");
  if (hasDress && (hasTop || hasBottom)) {
    addIssue(result.items, "连衣裙不能与上装或下装同时使用");
  } else if (!hasDress && !(hasTop && hasBottom)) {
    addIssue(result.items, "请选择一件连衣裙，或同时选择上装和下装");
  }

  return result;
}

export function moveAccessoryItem(
  items: SavedOutfitItemInput[],
  garmentId: number,
  direction: -1 | 1
): SavedOutfitItemInput[] {
  const ordered = [...items].sort((left, right) => left.position - right.position);
  const index = ordered.findIndex((item) => item.garmentId === garmentId);
  const destination = index + direction;
  if (index < 0 || destination < 0 || destination >= ordered.length) return items;
  [ordered[index], ordered[destination]] = [ordered[destination], ordered[index]];
  return ordered.map((item, position) => ({ ...item, slot: "accessory", position }));
}

export function findUnavailableOutfitItems(
  outfit: SavedOutfit | null | undefined,
  garments: Garment[]
): UnavailableOutfitItem[] {
  if (!outfit) return [];
  const garmentById = new Map(garments.map((garment) => [garment.id, garment]));
  const unavailable: UnavailableOutfitItem[] = [];
  for (const item of outfit.items) {
    if (!item.garmentId) {
      unavailable.push({ item, reason: "deleted" });
      continue;
    }
    const garment = garmentById.get(item.garmentId);
    if (!garment) unavailable.push({ item, reason: "deleted" });
    else if (garment.archivedAt) unavailable.push({ item, reason: "archived" });
    else if (!garment.owned || !garment.confirmed) unavailable.push({ item, reason: "unavailable" });
  }
  return unavailable;
}

export function buildOutfitBuilderSubmission(
  name: string,
  notes: string,
  favorite: boolean,
  items: SavedOutfitItemInput[],
  garments: Garment[],
  options: OutfitBuilderSubmissionOptions
): { input?: SavedOutfitCreateInput | SavedOutfitUpdateInput; validation: OutfitBuilderValidation } {
  const trimmedName = name.trim();
  if (options.existing && !options.contentEditing) {
    return {
      input: trimmedName
        ? { name: trimmedName, notes: notes.trim(), favorite }
        : undefined,
      validation: { name: trimmedName ? undefined : "请输入搭配名称", items: [] }
    };
  }

  if (options.existing && options.unresolvedItemCount > 0) {
    return {
      validation: {
        name: trimmedName ? undefined : "请输入搭配名称",
        items: ["请先逐项替换或移除不可用的历史衣物"]
      }
    };
  }

  if (options.existing && !options.contentDirty) {
    return {
      input: trimmedName
        ? { name: trimmedName, notes: notes.trim(), favorite }
        : undefined,
      validation: { name: trimmedName ? undefined : "请输入搭配名称", items: [] }
    };
  }

  const validation = validateOutfitBuilderDraft(name, items, garments);
  return {
    input: validation.name || validation.items.length
      ? undefined
      : { name: trimmedName, notes: notes.trim(), favorite, items },
    validation
  };
}

export function OutfitBuilder(props: OutfitBuilderProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const activeGarments = useMemo(
    () => props.garments.filter((garment) => garment.owned && garment.confirmed && !garment.archivedAt),
    [props.garments]
  );
  const initial = createBuilderDraft(props.outfit, activeGarments);
  const [name, setName] = useState(initial.name);
  const [notes, setNotes] = useState(initial.notes);
  const [favorite, setFavorite] = useState(initial.favorite);
  const [slotGarments, setSlotGarments] = useState(initial.slotGarments);
  const [accessoryIds, setAccessoryIds] = useState(initial.accessoryIds);
  const [accessoryToAdd, setAccessoryToAdd] = useState("");
  const [draggedAccessoryId, setDraggedAccessoryId] = useState<number | null>(null);
  const [contentEditing, setContentEditing] = useState(!props.outfit);
  const [contentDirty, setContentDirty] = useState(false);
  const [unresolvedItems, setUnresolvedItems] = useState<UnavailableOutfitItem[]>(
    findUnavailableOutfitItems(props.outfit, props.garments)
  );
  const [replacementIds, setReplacementIds] = useState<Record<number, string>>({});
  const [validation, setValidation] = useState<OutfitBuilderValidation>({ items: [] });
  const draftIdentity = outfitBuilderDraftIdentity(props.open, props.outfit);
  const initializedDraftIdentity = useRef<string | null>(null);

  useEffect(() => {
    if (!draftIdentity) {
      initializedDraftIdentity.current = null;
      return;
    }
    if (initializedDraftIdentity.current === draftIdentity) return;
    initializedDraftIdentity.current = draftIdentity;
    const next = createBuilderDraft(props.outfit, activeGarments);
    setName(next.name);
    setNotes(next.notes);
    setFavorite(next.favorite);
    setSlotGarments(next.slotGarments);
    setAccessoryIds(next.accessoryIds);
    setAccessoryToAdd("");
    setDraggedAccessoryId(null);
    setContentEditing(!props.outfit);
    setContentDirty(false);
    setUnresolvedItems(findUnavailableOutfitItems(props.outfit, props.garments));
    setReplacementIds({});
    setValidation({ items: [] });
  }, [activeGarments, draftIdentity, props.garments, props.outfit]);

  useEffect(() => {
    if (!props.open || !props.outfit || contentDirty) return;
    setUnresolvedItems(findUnavailableOutfitItems(props.outfit, props.garments));
  }, [contentDirty, props.garments, props.open, props.outfit]);
  const garmentById = useMemo(
    () => new Map(activeGarments.map((garment) => [garment.id, garment])),
    [activeGarments]
  );
  const accessories = activeGarments.filter((garment) => garment.category === "accessory");

  function requestClose() {
    if (!props.busy) props.onClose();
  }

  function updateSlot(slot: SingleSlot, value: string) {
    setSlotGarments((current) => {
      const next = { ...current };
      if (value) next[slot] = Number(value);
      else delete next[slot];
      return next;
    });
    setContentDirty(true);
    setValidation((current) => ({ ...current, items: [] }));
  }

  function addAccessory() {
    const garmentId = Number(accessoryToAdd);
    if (!garmentId || accessoryIds.includes(garmentId)) return;
    setAccessoryIds((current) => [...current, garmentId]);
    setContentDirty(true);
    setAccessoryToAdd("");
    setValidation((current) => ({ ...current, items: [] }));
  }

  function moveAccessory(garmentId: number, direction: -1 | 1) {
    setAccessoryIds((current) => moveAccessoryItem(
      current.map((idValue, position) => ({ garmentId: idValue, slot: "accessory", position })),
      garmentId,
      direction
    ).map((item) => item.garmentId));
    setContentDirty(true);
  }

  function dropAccessory(targetId: number) {
    if (draggedAccessoryId === null || draggedAccessoryId === targetId) return;
    setAccessoryIds((current) => {
      const next = [...current];
      const sourceIndex = next.indexOf(draggedAccessoryId);
      const targetIndex = next.indexOf(targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, draggedAccessoryId);
      return next;
    });
    setDraggedAccessoryId(null);
    setContentDirty(true);
  }

  function removeUnavailableItem(itemId: number) {
    setUnresolvedItems((current) => current.filter((entry) => entry.item.id !== itemId));
    setReplacementIds((current) => {
      const next = { ...current };
      delete next[itemId];
      return next;
    });
    setContentDirty(true);
    setValidation((current) => ({ ...current, items: [] }));
  }

  function replaceUnavailableItem(entry: UnavailableOutfitItem) {
    const garmentId = Number(replacementIds[entry.item.id]);
    const replacement = activeGarments.find((garment) => garment.id === garmentId);
    if (!replacement || replacement.category !== entry.item.slot) return;

    if (entry.item.slot === "accessory") {
      setAccessoryIds((current) => {
        if (current.includes(garmentId)) return current;
        const next = [...current];
        next.splice(Math.min(entry.item.position, next.length), 0, garmentId);
        return next;
      });
    } else {
      setSlotGarments((current) => ({ ...current, [entry.item.slot]: garmentId }));
    }
    removeUnavailableItem(entry.item.id);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const items = buildItemInputs(slotGarments, accessoryIds);
    const result = buildOutfitBuilderSubmission(name, notes, favorite, items, activeGarments, {
      existing: Boolean(props.outfit),
      contentEditing,
      contentDirty,
      unresolvedItemCount: unresolvedItems.length
    });
    setValidation(result.validation);
    if (result.input) void props.onSave(result.input);
  }

  return (
    <Dialog
      open={props.open}
      onClose={requestClose}
      labelledBy={titleId}
      describedBy={descriptionId}
      className="outfit-builder"
    >
      <form className="outfit-builder__panel" aria-busy={props.busy || undefined} onSubmit={submit}>
        <header className="outfit-builder__header">
          <div>
            <span>{props.outfit ? "保存搭配编辑器" : "手工组合衣橱"}</span>
            <h2 id={titleId}>{props.outfit ? "编辑保存的搭配" : "新建保存的搭配"}</h2>
            <p id={descriptionId}>选择一件连衣裙，或同时选择上装和下装；其他位置可以按需添加。</p>
          </div>
          <IconButton label="关闭搭配编辑器" disabled={props.busy} onClick={requestClose}>
            <X aria-hidden="true" size={19} />
          </IconButton>
        </header>

        {props.error ? <Notice tone="danger" role="alert">{props.error}</Notice> : null}

        <div className="outfit-builder__metadata">
          <Field
            id={`${id}-name`}
            label="搭配名称"
            value={name}
            required
            autoFocus
            disabled={props.busy}
            error={validation.name}
            onChange={(event) => {
              setName(event.target.value);
              setValidation((current) => ({ ...current, name: undefined }));
            }}
          />
          <label className="ui-field outfit-builder__notes" htmlFor={`${id}-notes`}>
            <span className="ui-field__label">备注</span>
            <textarea
              id={`${id}-notes`}
              className="ui-input"
              rows={3}
              value={notes}
              disabled={props.busy}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          <label className="outfit-builder__favorite" htmlFor={`${id}-favorite`}>
            <input
              id={`${id}-favorite`}
              type="checkbox"
              checked={favorite}
              disabled={props.busy}
              onChange={(event) => setFavorite(event.target.checked)}
            />
            <span>收藏这套搭配</span>
          </label>
        </div>

        {props.outfit ? (
          <section className="outfit-builder__content-mode" aria-labelledby={`${id}-content-mode-title`}>
            <div>
              <h3 id={`${id}-content-mode-title`}>搭配内容</h3>
              <p>
                {contentEditing
                  ? "正在调整衣物组合；保存时会用下面的选择更新搭配内容。"
                  : "当前只编辑名称、备注和收藏状态，保存时不会发送衣物列表，历史快照将原样保留。"}
              </p>
            </div>
            {!contentEditing ? (
              <Button
                variant="secondary"
                disabled={props.busy}
                onClick={() => {
                  setContentEditing(true);
                  setValidation((current) => ({ ...current, items: [] }));
                }}
              >
                <Pencil aria-hidden="true" size={16} />
                调整搭配内容
              </Button>
            ) : null}
          </section>
        ) : null}

        {unresolvedItems.length ? (
          <Notice
            tone="warning"
            role={contentEditing ? "alert" : "status"}
            title={`有 ${unresolvedItems.length} 件历史衣物当前不可用`}
          >
            <p>
              {contentEditing
                ? "为了避免历史快照被静默丢弃，请逐项选择替换衣物或明确移除。"
                : "只修改资料可以安全保存；如需调整组合，必须逐项替换或移除这些历史衣物。"}
            </p>
            <ul className="outfit-builder__unavailable-list">
              {unresolvedItems.map((entry) => {
                const item = entry.item;
                const snapshotName = [item.garmentSnapshot.brand, item.garmentSnapshot.name]
                  .filter(Boolean)
                  .join(" ");
                const unavailableReason = entry.reason === "archived"
                  ? "来源衣物已归档"
                  : entry.reason === "deleted"
                    ? "来源衣物已删除"
                    : "来源衣物当前不可用于搭配";
                const selectedIds = new Set([
                  ...Object.values(slotGarments).filter((value): value is number => typeof value === "number"),
                  ...accessoryIds
                ]);
                const replacementOptions = activeGarments
                  .filter((garment) => garment.category === item.slot && !selectedIds.has(garment.id))
                  .map(garmentOption);
                return (
                  <li key={item.id}>
                    <div className="outfit-builder__unavailable-summary">
                      <strong>{snapshotName || item.garmentSnapshot.name}</strong>
                      <span>{CATEGORY_LABELS[item.slot]} · {unavailableReason}</span>
                    </div>
                    {contentEditing ? (
                      <div className="outfit-builder__unavailable-actions">
                        <SelectField
                          id={`${id}-replacement-${item.id}`}
                          label={`替换 ${snapshotName || item.garmentSnapshot.name}`}
                          value={replacementIds[item.id] ?? ""}
                          disabled={props.busy || !replacementOptions.length}
                          options={[
                            {
                              value: "",
                              label: replacementOptions.length ? "选择可用衣物" : "没有同类可用衣物"
                            },
                            ...replacementOptions
                          ]}
                          onChange={(event) => setReplacementIds((current) => ({
                            ...current,
                            [item.id]: event.target.value
                          }))}
                        />
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={props.busy || !replacementIds[item.id]}
                          aria-label={`确认替换 ${snapshotName || item.garmentSnapshot.name}`}
                          onClick={() => replaceUnavailableItem(entry)}
                        >
                          替换
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={props.busy}
                          aria-label={`明确移除历史衣物 ${snapshotName || item.garmentSnapshot.name}`}
                          onClick={() => removeUnavailableItem(item.id)}
                        >
                          <Trash2 aria-hidden="true" size={15} />
                          移除
                        </Button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Notice>
        ) : null}

        <fieldset className="outfit-builder__slots" disabled={props.busy || !contentEditing}>
          <legend>搭配位置</legend>
          <div className="outfit-builder__slot-grid">
            {SINGLE_SLOTS.map((slot) => (
              <SelectField
                id={`${id}-slot-${slot}`}
                key={slot}
                label={CATEGORY_LABELS[slot]}
                value={slotGarments[slot] ? String(slotGarments[slot]) : ""}
                options={buildGarmentOptions(activeGarments, slot)}
                onChange={(event) => updateSlot(slot, event.target.value)}
              />
            ))}
          </div>
        </fieldset>

        <section className="outfit-builder__accessories" aria-labelledby={`${id}-accessories-title`}>
          <div className="outfit-builder__section-heading">
            <div>
              <h3 id={`${id}-accessories-title`}>配饰顺序</h3>
              <p>拖动可以快速排序；键盘或触屏请使用上移、下移按钮。</p>
            </div>
            <div className="outfit-builder__accessory-add">
              <SelectField
                id={`${id}-accessory-add`}
                label="添加配饰"
                value={accessoryToAdd}
                disabled={props.busy || !contentEditing || !accessories.length}
                options={[
                  { value: "", label: accessories.length ? "选择配饰" : "没有可用配饰" },
                  ...accessories
                    .filter((garment) => !accessoryIds.includes(garment.id))
                    .map(garmentOption)
                ]}
                onChange={(event) => setAccessoryToAdd(event.target.value)}
              />
              <Button
                variant="secondary"
                size="sm"
                disabled={props.busy || !contentEditing || !accessoryToAdd}
                onClick={addAccessory}
              >
                <Plus aria-hidden="true" size={16} />
                添加
              </Button>
            </div>
          </div>

          {accessoryIds.length ? (
            <ol className="outfit-builder__accessory-list">
              {accessoryIds.map((garmentId, index) => {
                const garment = garmentById.get(garmentId);
                const nameValue = garment?.name ?? `衣物 #${garmentId}`;
                return (
                  <li
                    key={garmentId}
                    draggable={contentEditing && !props.busy}
                    onDragStart={() => setDraggedAccessoryId(garmentId)}
                    onDragEnd={() => setDraggedAccessoryId(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => dropAccessory(garmentId)}
                  >
                    <GripVertical aria-hidden="true" className="outfit-builder__drag-handle" />
                    <span><strong>{nameValue}</strong><small>第 {index + 1} 位</small></span>
                    <div className="outfit-builder__accessory-actions">
                      <IconButton
                        label={`上移 ${nameValue}`}
                        aria-label={`上移 ${nameValue}`}
                        disabled={props.busy || !contentEditing || index === 0}
                        onClick={() => moveAccessory(garmentId, -1)}
                      >
                        <ArrowUp aria-hidden="true" size={17} />
                      </IconButton>
                      <IconButton
                        label={`下移 ${nameValue}`}
                        aria-label={`下移 ${nameValue}`}
                        disabled={props.busy || !contentEditing || index === accessoryIds.length - 1}
                        onClick={() => moveAccessory(garmentId, 1)}
                      >
                        <ArrowDown aria-hidden="true" size={17} />
                      </IconButton>
                      <IconButton
                        label={`移除 ${nameValue}`}
                        disabled={props.busy || !contentEditing}
                        onClick={() => {
                          setAccessoryIds((current) => current.filter((idValue) => idValue !== garmentId));
                          setContentDirty(true);
                        }}
                      >
                        <Trash2 aria-hidden="true" size={17} />
                      </IconButton>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : <p className="outfit-builder__accessory-empty">尚未添加配饰。</p>}
        </section>

        {validation.items.length ? (
          <Notice tone="danger" role="alert" title="请检查搭配内容">
            <ul>{validation.items.map((issue) => <li key={issue}>{issue}</li>)}</ul>
          </Notice>
        ) : null}

        <footer className="outfit-builder__footer">
          <Button variant="ghost" disabled={props.busy} onClick={requestClose}>
            <X aria-hidden="true" size={17} />
            取消
          </Button>
          <Button variant="primary" type="submit" disabled={props.busy}>
            <Save aria-hidden="true" size={17} />
            {props.busy ? "保存中" : "保存搭配"}
          </Button>
        </footer>
      </form>
    </Dialog>
  );
}

function createBuilderDraft(outfit: SavedOutfit | null | undefined, activeGarments: Garment[]) {
  const slotGarments: Partial<Record<SingleSlot, number>> = {};
  const accessoryIds: number[] = [];
  const activeGarmentIds = new Set(activeGarments.map((garment) => garment.id));
  for (const item of [...(outfit?.items ?? [])].sort((left, right) => left.position - right.position)) {
    if (!item.garmentId || !activeGarmentIds.has(item.garmentId)) continue;
    if (item.slot === "accessory") accessoryIds.push(item.garmentId);
    else slotGarments[item.slot] = item.garmentId;
  }
  return {
    name: outfit?.name ?? "",
    notes: outfit?.notes ?? "",
    favorite: outfit?.favorite ?? false,
    slotGarments,
    accessoryIds
  };
}

function buildItemInputs(
  slotGarments: Partial<Record<SingleSlot, number>>,
  accessoryIds: number[]
): SavedOutfitItemInput[] {
  return [
    ...SINGLE_SLOTS.flatMap((slot) => slotGarments[slot]
      ? [{ garmentId: slotGarments[slot] as number, slot, position: 0 }]
      : []),
    ...accessoryIds.map((garmentId, position) => ({ garmentId, slot: "accessory" as const, position }))
  ];
}

function buildGarmentOptions(garments: Garment[], slot: SingleSlot) {
  return [
    { value: "", label: `未选择${CATEGORY_LABELS[slot]}` },
    ...garments.filter((garment) => garment.category === slot).map(garmentOption)
  ];
}

function garmentOption(garment: Garment) {
  return {
    value: String(garment.id),
    label: [garment.brand, garment.name].filter(Boolean).join(" ") || garment.name
  };
}

function addIssue(issues: string[], issue: string) {
  if (!issues.includes(issue)) issues.push(issue);
}
