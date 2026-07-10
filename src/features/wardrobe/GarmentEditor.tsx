import { Check } from "lucide-react";
import { Badge, Button, Field, SelectField } from "../../components/ui";
import { isVisionSuggestionApplied } from "../../lib/garments";
import {
  CATEGORY_LABELS,
  CATEGORY_OPTIONS,
  COLOR_OPTIONS,
  formatList,
  parseList,
  SEASON_OPTIONS,
  withCurrentOption,
  WARMTH_OPTIONS
} from "../../shared/presentation";
import type { Garment, VisionTagSuggestion } from "../../shared/types";

export function GarmentEditor({
  item,
  onUpdate
}: {
  item: Garment;
  onUpdate: (update: Partial<Garment>) => void;
}) {
  return (
    <div className="garment-editor-panel">
      <div className="garment-editor-panel__grid">
        <Field
          key={`name-${item.name}`}
          label="衣物名称"
          defaultValue={item.name}
          title={item.rawName || item.name}
          onBlur={(event) => onUpdate({ name: event.target.value })}
        />
        <SelectField
          label="类别"
          value={item.category}
          options={CATEGORY_OPTIONS}
          onChange={(event) => onUpdate({ category: event.target.value as Garment["category"] })}
        />
        <SelectField
          label="颜色"
          value={item.color}
          options={withCurrentOption(COLOR_OPTIONS, item.color)}
          onChange={(event) => onUpdate({ color: event.target.value })}
        />
        <SelectField
          label="厚度"
          value={item.warmth}
          options={WARMTH_OPTIONS}
          onChange={(event) => onUpdate({ warmth: event.target.value as Garment["warmth"] })}
        />
        <Field
          key={`size-${item.size ?? ""}`}
          label="尺码"
          defaultValue={item.size ?? ""}
          onBlur={(event) => onUpdate({ size: event.target.value })}
        />
        <Field
          key={`materials-${formatList(item.materials)}`}
          label="材质"
          defaultValue={formatList(item.materials)}
          hint="使用逗号分隔多个材质"
          onBlur={(event) => onUpdate({ materials: parseList(event.target.value) })}
        />
        <Field
          key={`patterns-${formatList(item.patterns)}`}
          label="图案"
          defaultValue={formatList(item.patterns)}
          hint="使用逗号分隔多个图案"
          onBlur={(event) => onUpdate({ patterns: parseList(event.target.value) })}
        />
        <Field
          key={`tags-${formatList(item.tags)}`}
          label="标签"
          defaultValue={formatList(item.tags)}
          hint="使用逗号分隔多个标签"
          onBlur={(event) => onUpdate({ tags: parseList(event.target.value) })}
        />
      </div>

      <SeasonPicker seasons={item.seasons} onChange={(seasons) => onUpdate({ seasons })} />
      <VisionSuggestion item={item} onApply={onUpdate} />
    </div>
  );
}

function SeasonPicker({
  seasons,
  onChange
}: {
  seasons: Garment["seasons"];
  onChange: (seasons: Garment["seasons"]) => void;
}) {
  function toggle(value: Garment["seasons"][number]) {
    onChange(seasons.includes(value) ? seasons.filter((season) => season !== value) : [...seasons, value]);
  }

  return (
    <fieldset className="garment-season-field">
      <legend>适穿季节</legend>
      <div className="garment-season-field__options">
        {SEASON_OPTIONS.map((option) => {
          const value = option.value as Garment["seasons"][number];
          const selected = seasons.includes(value);
          return (
            <Button
              key={option.value}
              className="garment-season-field__option"
              variant={selected ? "primary" : "secondary"}
              size="sm"
              aria-pressed={selected}
              onClick={() => toggle(value)}
            >
              {option.label}
            </Button>
          );
        })}
      </div>
    </fieldset>
  );
}

function VisionSuggestion({
  item,
  onApply
}: {
  item: Garment;
  onApply: (update: Partial<Garment>) => void;
}) {
  const suggestion = item.visionTags;
  if (!suggestion) return null;

  const chips = [
    suggestion.category ? CATEGORY_LABELS[suggestion.category] : "",
    ...suggestion.styles,
    ...suggestion.patterns,
    ...suggestion.tags
  ].filter(Boolean);
  const applied = isVisionSuggestionApplied(item, suggestion);

  return (
    <section className="garment-vision-suggestion" aria-label="视觉分析建议">
      <div className="garment-vision-suggestion__heading">
        <strong>视觉建议</strong>
        <Badge tone={applied ? "success" : "info"}>{applied ? "已应用" : "等待确认"}</Badge>
      </div>
      <div className="garment-vision-suggestion__tags">
        {chips.length ? chips.map((chip) => <Badge key={chip}>{chip}</Badge>) : <span>暂无标签建议</span>}
      </div>
      {suggestion.scores.length ? (
        <p className="garment-vision-suggestion__scores">
          {suggestion.scores.slice(0, 3).map((score) => `${score.label} ${Math.round(score.score * 100)}%`).join(" / ")}
        </p>
      ) : null}
      <Button
        variant="secondary"
        size="sm"
        disabled={applied}
        onClick={() => onApply(visionSuggestionPatch(suggestion))}
      >
        <Check aria-hidden="true" size={16} />
        {applied ? "已应用" : "应用建议"}
      </Button>
    </section>
  );
}

function visionSuggestionPatch(suggestion: VisionTagSuggestion): Partial<Garment> {
  return {
    ...(suggestion.category ? { category: suggestion.category } : {}),
    styles: suggestion.styles,
    patterns: suggestion.patterns,
    tags: suggestion.tags
  };
}
