import { Heart, Send, ThumbsDown, X } from "lucide-react";
import { useEffect, useId, useState, type FormEvent } from "react";
import { Button, Dialog, IconButton, Notice } from "../../components/ui";
import { FEEDBACK_REASON_OPTIONS } from "../../shared/presentation";
import type {
  FeedbackReason,
  FeedbackVerdict,
  RecommendationFeedbackInput
} from "../../shared/types";

type FeedbackRatingValue = "" | "1" | "2" | "3" | "4" | "5";

export interface RecommendationFeedbackDraft {
  candidateId: string;
  verdict?: FeedbackVerdict;
  rating: FeedbackRatingValue | number;
  actuallyWorn: boolean;
  reasonCodes: FeedbackReason[];
  comment: string;
}

export interface FeedbackDialogProps {
  open: boolean;
  candidateId: string;
  verdict: FeedbackVerdict;
  initialFeedback?: Partial<RecommendationFeedbackInput>;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (feedback: RecommendationFeedbackInput) => void | Promise<void>;
}

export function buildRecommendationFeedbackInput(
  draft: RecommendationFeedbackDraft
): RecommendationFeedbackInput {
  const rating = draft.rating === "" || draft.rating === undefined
    ? undefined
    : Number(draft.rating);
  if (rating !== undefined && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
    throw new RangeError("反馈评分必须是 1 到 5 的整数");
  }
  const comment = draft.comment.trim();

  return {
    candidateId: draft.candidateId,
    ...(draft.verdict ? { verdict: draft.verdict } : {}),
    ...(rating === undefined ? {} : { rating: rating as 1 | 2 | 3 | 4 | 5 }),
    actuallyWorn: draft.actuallyWorn,
    reasonCodes: draft.reasonCodes,
    ...(comment ? { comment } : {})
  };
}

export function FeedbackDialog(props: FeedbackDialogProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const [rating, setRating] = useState<FeedbackRatingValue>(() => initialRating(props.initialFeedback?.rating));
  const [reasonCodes, setReasonCodes] = useState<FeedbackReason[]>(() => props.initialFeedback?.reasonCodes ?? []);
  const [comment, setComment] = useState(props.initialFeedback?.comment ?? "");

  useEffect(() => {
    if (!props.open) return;
    setRating(initialRating(props.initialFeedback?.rating));
    setReasonCodes(props.initialFeedback?.reasonCodes ?? []);
    setComment(props.initialFeedback?.comment ?? "");
  }, [props.candidateId, props.open, props.verdict]);

  function toggleReason(reason: FeedbackReason) {
    setReasonCodes((current) => current.includes(reason)
      ? current.filter((value) => value !== reason)
      : [...current, reason]);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void props.onSubmit(buildRecommendationFeedbackInput({
      candidateId: props.candidateId,
      verdict: props.verdict,
      rating,
      actuallyWorn: props.initialFeedback?.actuallyWorn ?? false,
      reasonCodes: props.verdict === "disliked" ? reasonCodes : [],
      comment
    }));
  }

  const disliked = props.verdict === "disliked";
  const liked = props.verdict === "liked";

  return (
    <Dialog
      open={props.open}
      onClose={() => {
        if (!props.busy) props.onClose();
      }}
      labelledBy={titleId}
      describedBy={descriptionId}
      className="feedback-dialog"
    >
      <form className="feedback-dialog__panel" aria-busy={props.busy || undefined} onSubmit={submit}>
        <header className="feedback-dialog__header">
          <div>
            <span className="feedback-dialog__eyebrow">帮助后续推荐更贴合你</span>
            <h2 id={titleId}>{feedbackTitle(props.verdict)}</h2>
            <p id={descriptionId}>
              {disliked
                ? "选择符合的原因即可；评分和补充说明都不是必填项。"
                : "评分和补充说明均可留空，提交后仍可再次修改。"}
            </p>
          </div>
          <IconButton label="关闭推荐反馈" disabled={props.busy} onClick={props.onClose}>
            <X aria-hidden="true" size={19} />
          </IconButton>
        </header>

        {props.error ? <Notice tone="danger" role="alert">{props.error}</Notice> : null}

        {disliked ? (
          <fieldset className="feedback-dialog__reasons" disabled={props.busy}>
            <legend>哪里不合适（可多选）</legend>
            <div className="feedback-dialog__reason-grid">
              {FEEDBACK_REASON_OPTIONS.map((option) => {
                const reason = option.value as FeedbackReason;
                return (
                  <label key={reason}>
                    <input
                      type="checkbox"
                      name="feedback-reason"
                      value={reason}
                      checked={reasonCodes.includes(reason)}
                      onChange={() => toggleReason(reason)}
                    />
                    <span>{option.label}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        <div className="feedback-dialog__fields">
          <label className="ui-field" htmlFor={`${id}-rating`}>
            <span className="ui-field__label">评分（可选）</span>
            <select
              id={`${id}-rating`}
              className="ui-select"
              value={rating}
              disabled={props.busy}
              onChange={(event) => setRating(event.target.value as FeedbackRatingValue)}
            >
              <option value="">不评分</option>
              <option value="5">5 分</option>
              <option value="4">4 分</option>
              <option value="3">3 分</option>
              <option value="2">2 分</option>
              <option value="1">1 分</option>
            </select>
          </label>

          <label className="ui-field feedback-dialog__comment" htmlFor={`${id}-comment`}>
            <span className="ui-field__label">补充说明（可选）</span>
            <textarea
              id={`${id}-comment`}
              className="ui-input"
              rows={4}
              maxLength={500}
              value={comment}
              disabled={props.busy}
              placeholder="一句话也可以，例如：裤型不适合今天走路"
              onChange={(event) => setComment(event.target.value)}
            />
            <small className="ui-field__hint">最多 500 字，无需填写长文本。</small>
          </label>
        </div>

        <footer className="feedback-dialog__footer">
          <Button variant="ghost" disabled={props.busy} onClick={props.onClose}>取消</Button>
          <Button variant="primary" type="submit" disabled={props.busy}>
            {liked ? <Heart aria-hidden="true" size={17} /> : disliked ? <ThumbsDown aria-hidden="true" size={17} /> : <Send aria-hidden="true" size={17} />}
            {props.busy ? "保存中" : "保存反馈"}
          </Button>
        </footer>
      </form>
    </Dialog>
  );
}

function initialRating(rating: RecommendationFeedbackInput["rating"]): FeedbackRatingValue {
  return rating ? String(rating) as FeedbackRatingValue : "";
}

function feedbackTitle(verdict: FeedbackVerdict): string {
  if (verdict === "liked") return "喜欢这套搭配";
  if (verdict === "disliked") return "不喜欢这套搭配";
  return "记录这次推荐";
}
