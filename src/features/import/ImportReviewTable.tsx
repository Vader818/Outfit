import { Badge, Field, SelectField } from "../../components/ui";
import {
  CATEGORY_OPTIONS,
  COLOR_OPTIONS,
  OCCASIONS,
  OCCASION_LABELS,
  SEASON_OPTIONS,
  WARMTH_OPTIONS,
  formatList,
  parseList,
  withCurrentOption
} from "../../shared/presentation";
import type {
  Formality,
  GarmentCategory,
  GarmentWarmth,
  ImportDecision,
  ImportDisposition,
  ImportGarmentOverrides,
  Season,
  TaobaoImportPreview,
  TaobaoImportPreviewItem
} from "../../shared/types";

const FORMALITY_OPTIONS = OCCASIONS.map((value) => ({ value, label: OCCASION_LABELS[value] }));

export interface ImportReviewTableProps {
  preview: TaobaoImportPreview;
  decisions: Readonly<Record<string, ImportDecision | undefined>>;
  disabled?: boolean;
  onDecision: (sourceItemKey: string, next: ImportDecision) => void;
}

export function ImportReviewTable({ preview, decisions, disabled = false, onDecision }: ImportReviewTableProps) {
  const actionableItems = preview.candidates.filter((item) => item.disposition !== "skip");
  const selectedCount = actionableItems.filter((item) => decisionFor(item, decisions).include).length;
  const batchToken = safeIdToken(preview.batchId);

  return (
    <section className="import-review-table" aria-busy={disabled || undefined}>
      <div className="import-review-table__summary" aria-live="polite">
        已选择 {selectedCount} / {actionableItems.length} 个可处理候选
      </div>
      <div className="import-review-table__scroll" tabIndex={0} aria-label="可横向滚动的导入审阅表">
        <table>
          <caption className="sr-only">淘宝衣物导入逐项审阅</caption>
          <thead>
            <tr>
              <th scope="col">选择</th>
              <th scope="col">候选衣物</th>
              <th scope="col">处理方式</th>
              <th scope="col">置信度</th>
              <th scope="col">字段修正</th>
            </tr>
          </thead>
          <tbody>
            {preview.candidates.length ? preview.candidates.map((item, index) => {
              const decision = decisionFor(item, decisions);
              const skipped = item.disposition === "skip";
              const rowDisabled = disabled || skipped;
              const rowId = `import-review-${batchToken}-${index}`;
              const effectiveName = fieldValue(item, decision, "name");
              const effectiveBrand = fieldValue(item, decision, "brand");
              const overrideCount = Object.keys(decision.overrides ?? {}).length;
              const disposition = dispositionDisplay(item);
              const descriptionId = `${rowId}-description`;

              return (
                <tr key={item.sourceItemKey} className={`import-review-table__row import-review-table__row--${item.disposition}`}>
                  <td className="import-review-table__include">
                    <input
                      id={`${rowId}-include`}
                      type="checkbox"
                      checked={!skipped && decision.include}
                      disabled={rowDisabled}
                      aria-label={`${decision.include ? "取消选择" : "选择"}导入「${effectiveName || item.name}」`}
                      aria-describedby={descriptionId}
                      onChange={(event) => onDecision(item.sourceItemKey, {
                        ...decision,
                        sourceItemKey: item.sourceItemKey,
                        include: event.target.checked
                      })}
                    />
                  </td>
                  <th scope="row" className="import-review-table__identity">
                    <strong>{effectiveName || item.name}</strong>
                    {effectiveBrand ? <span>{effectiveBrand}</span> : null}
                    <small id={descriptionId}>{item.message || disposition.description}</small>
                  </th>
                  <td className="import-review-table__disposition">
                    <Badge tone={disposition.tone}>{disposition.label}</Badge>
                    {item.restoreRequired ? <small>匹配到已归档衣物</small> : null}
                    {overrideCount ? <small>已修正 {overrideCount} 个字段</small> : null}
                  </td>
                  <td className="import-review-table__confidence">
                    {Math.round(item.confidence * 100)}%
                  </td>
                  <td className="import-review-table__editor-cell">
                    <ImportRowEditor
                      item={item}
                      decision={decision}
                      rowId={rowId}
                      disabled={rowDisabled}
                      onDecision={(next) => onDecision(item.sourceItemKey, next)}
                    />
                  </td>
                </tr>
              );
            }) : (
              <tr>
                <td colSpan={5} className="import-review-table__empty">没有可审阅的导入候选。</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ImportRowEditor({
  item,
  decision,
  rowId,
  disabled,
  onDecision
}: {
  item: TaobaoImportPreviewItem;
  decision: ImportDecision;
  rowId: string;
  disabled: boolean;
  onDecision: (next: ImportDecision) => void;
}) {
  const seasons = fieldValue(item, decision, "seasons") ?? [];

  function change<Key extends keyof ImportGarmentOverrides>(
    key: Key,
    value: ImportGarmentOverrides[Key]
  ) {
    onDecision(withImportOverride(item, decision, key, value));
  }

  function toggleSeason(season: Season) {
    const selected = new Set(seasons);
    if (selected.has(season)) selected.delete(season);
    else selected.add(season);
    const next = SEASON_OPTIONS
      .map((option) => option.value as Season)
      .filter((value) => selected.has(value));
    change("seasons", next);
  }

  return (
    <details className="import-review-row-editor">
      <summary aria-label={`修正「${item.name}」的导入字段`} aria-disabled={disabled || undefined}>
        {disabled && item.disposition === "skip" ? "不可修正" : "展开修正"}
      </summary>
      <fieldset disabled={disabled} className="import-review-row-editor__fields">
        <legend className="sr-only">修正「{item.name}」的衣物字段</legend>
        <div className="import-review-row-editor__grid">
          <Field
            id={`${rowId}-brand`}
            label="品牌"
            value={fieldValue(item, decision, "brand") ?? ""}
            onChange={(event) => change("brand", event.target.value)}
          />
          <Field
            id={`${rowId}-name`}
            label="名称"
            value={fieldValue(item, decision, "name") ?? ""}
            required
            onChange={(event) => change("name", event.target.value)}
          />
          <SelectField
            id={`${rowId}-category`}
            label="类别"
            value={fieldValue(item, decision, "category")}
            options={CATEGORY_OPTIONS}
            onChange={(event) => change("category", event.target.value as GarmentCategory)}
          />
          <SelectField
            id={`${rowId}-color`}
            label="颜色"
            value={fieldValue(item, decision, "color") ?? "unknown"}
            options={withCurrentOption(COLOR_OPTIONS, fieldValue(item, decision, "color") ?? "unknown")}
            onChange={(event) => change("color", event.target.value)}
          />
          <SelectField
            id={`${rowId}-warmth`}
            label="厚度"
            value={fieldValue(item, decision, "warmth")}
            options={WARMTH_OPTIONS}
            onChange={(event) => change("warmth", event.target.value as GarmentWarmth)}
          />
          <SelectField
            id={`${rowId}-formality`}
            label="正式度"
            value={fieldValue(item, decision, "formality")}
            options={FORMALITY_OPTIONS}
            onChange={(event) => change("formality", event.target.value as Formality)}
          />
          <Field
            id={`${rowId}-styles`}
            label="风格"
            value={formatList(fieldValue(item, decision, "styles"))}
            hint="多个风格使用逗号分隔"
            onChange={(event) => change("styles", parseList(event.target.value))}
          />
          <Field
            id={`${rowId}-size`}
            label="尺码"
            value={fieldValue(item, decision, "size") ?? ""}
            onChange={(event) => change("size", event.target.value || undefined)}
          />
          <Field
            id={`${rowId}-materials`}
            label="材质"
            value={formatList(fieldValue(item, decision, "materials"))}
            hint="多个材质使用逗号分隔"
            onChange={(event) => change("materials", parseList(event.target.value))}
          />
          <Field
            id={`${rowId}-patterns`}
            label="图案"
            value={formatList(fieldValue(item, decision, "patterns"))}
            hint="多个图案使用逗号分隔"
            onChange={(event) => change("patterns", parseList(event.target.value))}
          />
          <Field
            id={`${rowId}-tags`}
            label="标签"
            value={formatList(fieldValue(item, decision, "tags"))}
            hint="多个标签使用逗号分隔"
            onChange={(event) => change("tags", parseList(event.target.value))}
          />
        </div>

        <fieldset className="import-review-row-editor__seasons">
          <legend>适穿季节</legend>
          <div className="import-review-row-editor__season-options">
            {SEASON_OPTIONS.map((option) => {
              const season = option.value as Season;
              return (
                <label key={season} htmlFor={`${rowId}-season-${season}`}>
                  <input
                    id={`${rowId}-season-${season}`}
                    type="checkbox"
                    checked={seasons.includes(season)}
                    onChange={() => toggleSeason(season)}
                  />
                  <span>{option.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <label className="ui-field import-review-row-editor__notes" htmlFor={`${rowId}-notes`}>
          <span className="ui-field__label">备注</span>
          <textarea
            id={`${rowId}-notes`}
            className="ui-input"
            rows={3}
            value={fieldValue(item, decision, "notes") ?? ""}
            onChange={(event) => change("notes", event.target.value)}
          />
        </label>
      </fieldset>
    </details>
  );
}

export function withImportOverride<Key extends keyof ImportGarmentOverrides>(
  item: TaobaoImportPreviewItem,
  decision: ImportDecision,
  key: Key,
  value: ImportGarmentOverrides[Key]
): ImportDecision {
  const overrides = { ...(decision.overrides ?? {}), [key]: value } as ImportGarmentOverrides;
  if (sameFieldValue(value, item[key] as ImportGarmentOverrides[Key])) {
    delete overrides[key];
  }
  return {
    sourceItemKey: item.sourceItemKey,
    include: decision.include,
    ...(Object.keys(overrides).length ? { overrides } : {})
  };
}

function decisionFor(
  item: TaobaoImportPreviewItem,
  decisions: Readonly<Record<string, ImportDecision | undefined>>
): ImportDecision {
  return decisions[item.sourceItemKey] ?? {
    sourceItemKey: item.sourceItemKey,
    include: false
  };
}

function fieldValue<Key extends keyof ImportGarmentOverrides>(
  item: TaobaoImportPreviewItem,
  decision: ImportDecision,
  key: Key
): ImportGarmentOverrides[Key] {
  if (decision.overrides && Object.prototype.hasOwnProperty.call(decision.overrides, key)) {
    return decision.overrides[key];
  }
  return item[key] as ImportGarmentOverrides[Key];
}

function sameFieldValue(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false;
    const normalizedLeft = [...left].sort();
    const normalizedRight = [...right].sort();
    return normalizedLeft.every((value, index) => value === normalizedRight[index]);
  }
  return (left ?? undefined) === (right ?? undefined);
}

function dispositionDisplay(item: TaobaoImportPreviewItem): {
  label: string;
  description: string;
  tone: "neutral" | "accent" | "success" | "warning" | "danger" | "info";
} {
  if (item.restoreRequired) {
    return { label: "恢复并更新", description: "将恢复已归档的同来源衣物并同步最新字段。", tone: "warning" };
  }
  return DISPOSITION_DISPLAY[item.disposition];
}

const DISPOSITION_DISPLAY: Record<ImportDisposition, {
  label: string;
  description: string;
  tone: "neutral" | "accent" | "success" | "warning" | "danger" | "info";
}> = {
  create: { label: "新增", description: "将创建一件新的衣橱条目。", tone: "success" },
  update: { label: "更新", description: "将同步已有衣物的来源字段。", tone: "info" },
  "refund-sync": { label: "退款同步", description: "将同步退款状态，不会创建重复衣物。", tone: "warning" },
  unchanged: { label: "无变化", description: "已有衣物与本次采集内容一致。", tone: "neutral" },
  skip: { label: "跳过", description: "该候选不能写入衣橱。", tone: "danger" }
};

function safeIdToken(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 48);
  return cleaned || "batch";
}
