import { Check } from "lucide-react";
import { useId } from "react";
import { GarmentImage } from "../../components/garments/GarmentImage";
import { Badge, Button, Notice, Surface, cx } from "../../components/ui";
import { CATEGORY_LABELS, type WearLogFeedback } from "../../shared/presentation";
import type { Garment, OutfitRecommendation } from "../../shared/types";

function garmentName(item: Garment): string {
  return [item.brand, item.name].filter(Boolean).join(" ") || item.name;
}

export function OutfitStage({
  outfit,
  featured = false,
  recordingOutfitId,
  wearLogFeedback,
  onRecordWearLog,
  allowRemoteTaobaoImages = false
}: {
  outfit: OutfitRecommendation;
  featured?: boolean;
  recordingOutfitId: string | null;
  wearLogFeedback: WearLogFeedback | null;
  onRecordWearLog: (outfit: OutfitRecommendation) => void;
  allowRemoteTaobaoImages?: boolean;
}) {
  const titleId = useId();
  const matchPercent = outfit.matchPercent ?? Math.round(Math.min(100, outfit.score));
  const extraReasons = outfit.reasons.slice(2);
  const hasMore = extraReasons.length > 0 || outfit.alternatives.length > 0;
  const recording = recordingOutfitId === outfit.id;

  return (
    <Surface
      as="article"
      className={cx(
        "outfit-stage flex min-w-0 flex-col gap-5",
        featured ? "outfit-stage--featured" : "outfit-stage--compact"
      )}
      aria-labelledby={titleId}
    >
      <header className="outfit-stage__header flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="outfit-stage__label">{featured ? "首选搭配" : "备选搭配"}</span>
          <h2 id={titleId}>{featured ? "今天先穿这一套" : "另一种搭配"}</h2>
        </div>
        <div className="outfit-stage__match" aria-label={`匹配度 ${matchPercent}%`}>
          <strong>{matchPercent}%</strong>
          <span>匹配度</span>
        </div>
      </header>

      <div
        className={cx(
          "outfit-stage__garments grid min-w-0 gap-3",
          featured ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2"
        )}
      >
        {outfit.items.map((item, index) => (
          <figure className="outfit-piece m-0 min-w-0" key={item.id}>
            <GarmentImage
              item={item}
              variant={featured ? "stage" : "card"}
              eager={featured && index < 3}
              allowRemoteTaobaoImages={allowRemoteTaobaoImages}
            />
            <figcaption>
              <span>{CATEGORY_LABELS[item.category]}</span>
              <strong>{garmentName(item)}</strong>
            </figcaption>
          </figure>
        ))}
      </div>

      <div className="outfit-stage__explanation">
        <Badge tone="success">搭配 {outfit.items.length} 件</Badge>
        {outfit.reasons.length ? (
          <ul className="outfit-stage__reasons">
            {outfit.reasons.slice(0, 2).map((reason, index) => (
              <li key={`${index}-${reason}`}>{reason}</li>
            ))}
          </ul>
        ) : (
          <p className="outfit-stage__no-reason">这套搭配符合当前天气和场合。</p>
        )}
      </div>

      {hasMore ? (
        <details className="outfit-stage__more">
          <summary>更多理由和替代单品</summary>
          {extraReasons.length ? (
            <ul>
              {extraReasons.map((reason, index) => (
                <li key={`${index}-${reason}`}>{reason}</li>
              ))}
            </ul>
          ) : null}
          {outfit.alternatives.length ? (
            <div className="outfit-stage__alternatives">
              <h3>替代单品</h3>
              <p>可替换为以下单品。</p>
              <ul>
                {outfit.alternatives.map((item) => (
                  <li key={item.id}>
                    <GarmentImage
                      item={item}
                      variant="thumbnail"
                      allowRemoteTaobaoImages={allowRemoteTaobaoImages}
                    />
                    <span>
                      <small>{CATEGORY_LABELS[item.category]}</small>
                      <strong>{garmentName(item)}</strong>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </details>
      ) : null}

      <footer className="outfit-stage__footer flex flex-wrap items-center gap-3">
        <Button
          variant={featured ? "primary" : "secondary"}
          disabled={recording}
          aria-busy={recording || undefined}
          onClick={() => onRecordWearLog(outfit)}
        >
          <Check aria-hidden="true" />
          {recording ? "标记中" : "标记已穿"}
        </Button>
        {wearLogFeedback?.outfitId === outfit.id ? (
          <Notice className="outfit-stage__feedback" tone="success" role="status">
            {wearLogFeedback.message}
          </Notice>
        ) : null}
      </footer>
    </Surface>
  );
}
