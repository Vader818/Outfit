import { ArrowRight, RefreshCw, Shirt, X } from "lucide-react";
import { useId } from "react";
import { GarmentImage } from "../../components/garments/GarmentImage";
import { Button, Dialog, EmptyState, IconButton, Notice, Surface } from "../../components/ui";
import { CATEGORY_LABELS } from "../../shared/presentation";
import type {
  Garment,
  OutfitRecommendation,
  OutfitReplacementSuggestion,
  SavedOutfit
} from "../../shared/types";

export interface ReplacementDialogProps {
  open: boolean;
  outfit: OutfitRecommendation | null;
  targetGarment: Garment | null;
  suggestions: OutfitReplacementSuggestion[];
  busy: boolean;
  applyingReplacementId?: number | null;
  error?: string;
  appliedOutfit?: SavedOutfit | null;
  allowRemoteTaobaoImages?: boolean;
  onClose: () => void;
  onApply: (suggestion: OutfitReplacementSuggestion) => void | Promise<void>;
}

export function ReplacementDialog(props: ReplacementDialogProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const targetName = props.targetGarment ? garmentName(props.targetGarment) : "所选单品";

  return (
    <Dialog
      open={props.open}
      onClose={() => {
        if (!props.busy) props.onClose();
      }}
      labelledBy={titleId}
      describedBy={descriptionId}
      className="replacement-dialog"
    >
      <section className="replacement-dialog__panel" aria-busy={props.busy || undefined}>
        <header className="replacement-dialog__header">
          <div>
            <span>保留原搭配，生成可追溯版本</span>
            <h2 id={titleId}>换一件</h2>
            <p id={descriptionId}>为「{targetName}」选择替代项；应用后会创建新版本，不会覆盖原搭配。</p>
          </div>
          <IconButton label="关闭换一件" disabled={props.busy} onClick={props.onClose}>
            <X aria-hidden="true" size={19} />
          </IconButton>
        </header>

        {props.error ? <Notice tone="danger" role="alert">{props.error}</Notice> : null}
        {props.appliedOutfit ? (
          <Notice tone="success" role="status">
            已生成「{props.appliedOutfit.name}」新版本；原搭配仍保留在保存的搭配中。
          </Notice>
        ) : null}

        {props.suggestions.length ? (
          <div className="replacement-dialog__suggestions">
            {props.suggestions.map((suggestion) => {
              const applying = props.applyingReplacementId === suggestion.replacement.id;
              return (
                <Surface
                  as="article"
                  className="replacement-suggestion"
                  key={`${suggestion.targetGarmentId}-${suggestion.replacement.id}`}
                >
                  <header className="replacement-suggestion__header">
                    <div className="replacement-suggestion__swap">
                      <span>{targetName}</span>
                      <ArrowRight aria-hidden="true" size={17} />
                      <strong>{garmentName(suggestion.replacement)}</strong>
                    </div>
                    <span
                      className="replacement-suggestion__delta"
                      data-tone={suggestion.matchPercentDelta >= 0 ? "positive" : "negative"}
                    >
                      匹配度 {formatDelta(suggestion.matchPercentDelta)}
                    </span>
                  </header>

                  <div className="replacement-suggestion__outfit" aria-label="替换后的完整搭配">
                    {suggestion.nextItems.map((item) => (
                      <figure key={item.id}>
                        <GarmentImage
                          item={item}
                          variant="thumbnail"
                          allowRemoteTaobaoImages={props.allowRemoteTaobaoImages}
                        />
                        <figcaption>
                          <small>{CATEGORY_LABELS[item.category]}</small>
                          <strong>{garmentName(item)}</strong>
                        </figcaption>
                      </figure>
                    ))}
                  </div>

                  <div className="replacement-suggestion__reasons">
                    <h3>为什么这样换</h3>
                    <ul>
                      {suggestion.reasons.map((reason, index) => (
                        <li key={`${index}-${reason}`}>{reason}</li>
                      ))}
                    </ul>
                  </div>

                  <Button
                    variant="primary"
                    disabled={props.busy || Boolean(props.appliedOutfit)}
                    aria-busy={applying || undefined}
                    onClick={() => props.onApply(suggestion)}
                  >
                    <RefreshCw aria-hidden="true" size={17} />
                    {applying ? "生成中" : props.appliedOutfit ? "已生成新版本" : "应用为新版本"}
                  </Button>
                </Surface>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={<Shirt aria-hidden="true" />}
            title="暂时没有合适的替代项"
            description="可以返回并更换天气、场合或衣橱状态后重新生成。"
          />
        )}

        <footer className="replacement-dialog__footer">
          <Button variant="ghost" disabled={props.busy} onClick={props.onClose}>关闭</Button>
        </footer>
      </section>
    </Dialog>
  );
}

function garmentName(item: Garment): string {
  return [item.brand, item.name].filter(Boolean).join(" ") || item.name;
}

function formatDelta(delta: number): string {
  return `${delta >= 0 ? "+" : ""}${delta}`;
}
