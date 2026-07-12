import { BookmarkPlus, Check, RefreshCw, Target, ThumbsDown, ThumbsUp } from "lucide-react";
import { useId } from "react";
import { GarmentImage } from "../../components/garments/GarmentImage";
import { Badge, Button, Notice, Surface, cx } from "../../components/ui";
import { garmentAvailabilityStatus, isGarmentAvailable } from "../../lib/garments";
import {
  CATEGORY_LABELS,
  GARMENT_AVAILABILITY_LABELS,
  type WearLogFeedback
} from "../../shared/presentation";
import type { FeedbackVerdict, Garment, OutfitRecommendation } from "../../shared/types";

export type RecommendationFeedbackAction = Extract<FeedbackVerdict, "liked" | "disliked">;

function garmentName(item: Garment): string {
  return [item.brand, item.name].filter(Boolean).join(" ") || item.name;
}

export function OutfitStage({
  outfit,
  featured = false,
  recordingOutfitId,
  savingOutfitId,
  wearLogFeedback,
  onRecordWearLog,
  onSaveOutfit,
  onUseGarmentAsCore,
  onReplaceGarment,
  onRecommendationFeedback,
  feedbackBusyCandidateId,
  allowRemoteTaobaoImages = false
}: {
  outfit: OutfitRecommendation;
  featured?: boolean;
  recordingOutfitId: string | null;
  savingOutfitId?: string | null;
  wearLogFeedback: WearLogFeedback | null;
  onRecordWearLog: (outfit: OutfitRecommendation) => void;
  onSaveOutfit?: (outfit: OutfitRecommendation) => void;
  onUseGarmentAsCore?: (garment: Garment) => void;
  onReplaceGarment?: (outfit: OutfitRecommendation, garment: Garment) => void;
  onRecommendationFeedback?: (outfit: OutfitRecommendation, verdict: RecommendationFeedbackAction) => void;
  feedbackBusyCandidateId?: string | null;
  allowRemoteTaobaoImages?: boolean;
}) {
  const titleId = useId();
  const matchPercent = outfit.matchPercent ?? Math.round(Math.min(100, outfit.score));
  const extraReasons = outfit.reasons.slice(2);
  const hasMore = extraReasons.length > 0 || outfit.replacements.length > 0;
  const recording = recordingOutfitId === outfit.id;
  const saving = savingOutfitId === outfit.candidateId;
  const feedbackBusy = feedbackBusyCandidateId === outfit.candidateId;

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
              {onUseGarmentAsCore ? (
                <Button
                  className="outfit-piece__core-action"
                  variant="ghost"
                  size="sm"
                  aria-label={`以${garmentName(item)}为核心推荐`}
                  disabled={!isGarmentAvailable(item)}
                  title={!isGarmentAvailable(item)
                    ? `${GARMENT_AVAILABILITY_LABELS[garmentAvailabilityStatus(item)]}衣物不能作为推荐核心`
                    : undefined}
                  onClick={() => onUseGarmentAsCore(item)}
                >
                  <Target aria-hidden="true" size={15} />
                  以这件为核心
                </Button>
              ) : null}
              {onReplaceGarment ? (
                <Button
                  className="outfit-piece__core-action"
                  variant="ghost"
                  size="sm"
                  aria-label={`换${garmentName(item)}`}
                  disabled={!outfit.replacements.some((suggestion) => suggestion.targetGarmentId === item.id)}
                  onClick={() => onReplaceGarment(outfit, item)}
                >
                  <RefreshCw aria-hidden="true" size={15} />
                  换这件
                </Button>
              ) : null}
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
        {typeof outfit.scoreBreakdown?.learnedPreference === "number" ? (
          <div
            className="outfit-stage__learned-preference"
            aria-label={`学习偏好分数贡献 ${formatScoreContribution(outfit.scoreBreakdown.learnedPreference)}`}
          >
            <span>学习偏好</span>
            <strong>{formatScoreContribution(outfit.scoreBreakdown.learnedPreference)}</strong>
            <small>
              {outfit.scoreBreakdown.learnedPreference === 0
                ? "当前没有达到证据门槛的历史反馈加权。"
                : "来自已达到证据门槛的历史反馈，贡献范围受到限制。"}
            </small>
          </div>
        ) : null}
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
          {outfit.replacements.length ? (
            <div className="outfit-stage__alternatives">
              <h3>可替换方案</h3>
              <p>每个建议都会保留完整新搭配和分数变化。</p>
              <ul>
                {outfit.replacements.map((suggestion) => {
                  const item = suggestion.replacement;
                  const target = outfit.items.find((candidate) => candidate.id === suggestion.targetGarmentId);
                  return (
                  <li key={`${suggestion.targetGarmentId}-${item.id}`}>
                    <GarmentImage
                      item={item}
                      variant="thumbnail"
                      allowRemoteTaobaoImages={allowRemoteTaobaoImages}
                    />
                    <span>
                      <small>{CATEGORY_LABELS[item.category]}</small>
                      <strong>{garmentName(item)}</strong>
                      <small>
                        替换{target ? garmentName(target) : "原单品"} · 匹配度
                        {suggestion.matchPercentDelta >= 0 ? "+" : ""}{suggestion.matchPercentDelta}
                      </small>
                    </span>
                  </li>
                );})}
              </ul>
            </div>
          ) : null}
        </details>
      ) : null}

      <footer className="outfit-stage__footer flex flex-wrap items-center gap-3">
        {onSaveOutfit ? (
          <Button
            variant={featured ? "primary" : "secondary"}
            disabled={saving}
            aria-busy={saving || undefined}
            onClick={() => onSaveOutfit(outfit)}
          >
            <BookmarkPlus aria-hidden="true" />
            {saving ? "保存中" : "保存搭配"}
          </Button>
        ) : null}
        {onRecommendationFeedback ? (
          <div
            className="outfit-stage__feedback-actions"
            aria-label="评价这套搭配"
            aria-busy={feedbackBusy || undefined}
          >
            <Button
              variant="ghost"
              size="sm"
              disabled={feedbackBusy}
              onClick={() => onRecommendationFeedback(outfit, "liked")}
            >
              <ThumbsUp aria-hidden="true" size={16} />
              喜欢
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={feedbackBusy}
              onClick={() => onRecommendationFeedback(outfit, "disliked")}
            >
              <ThumbsDown aria-hidden="true" size={16} />
              不喜欢
            </Button>
          </div>
        ) : null}
        <Button
          variant="secondary"
          disabled={recording}
          aria-busy={recording || undefined}
          onClick={() => onRecordWearLog(outfit)}
        >
          <Check aria-hidden="true" />
          {recording ? "记录中" : "实际穿了"}
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

function formatScoreContribution(value: number): string {
  const normalized = Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
  return `${value > 0 ? "+" : ""}${normalized}`;
}
