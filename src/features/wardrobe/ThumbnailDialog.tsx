import { ImageOff, Save, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Button, Dialog, IconButton, Notice, Skeleton, cx } from "../../components/ui";
import { thumbnailSourceLabel } from "../../shared/presentation";
import type { Garment, ThumbnailCandidate } from "../../shared/types";

export interface ThumbnailDialogProps {
  garment: Garment;
  candidates: ThumbnailCandidate[];
  selectedUrl: string;
  loading: boolean;
  saving: boolean;
  error: string;
  onSelect: (imageUrl: string) => void;
  onSave: () => void;
  onClose: () => void;
}

export function ThumbnailDialog(props: ThumbnailDialogProps) {
  const titleId = `thumbnail-dialog-title-${props.garment.id}`;
  const descriptionId = `thumbnail-dialog-description-${props.garment.id}`;

  return (
    <Dialog
      open
      onClose={props.onClose}
      labelledBy={titleId}
      describedBy={descriptionId}
      className="thumbnail-dialog"
    >
      <div className="thumbnail-dialog__panel">
        <header className="thumbnail-dialog__header">
          <div>
            <span className="thumbnail-dialog__eyebrow">衣物主图</span>
            <h2 id={titleId}>选择缩略图</h2>
            <p id={descriptionId}>{props.garment.name}</p>
          </div>
          <IconButton label="关闭缩略图选择" onClick={props.onClose}>
            <X aria-hidden="true" size={19} />
          </IconButton>
        </header>

        {props.loading ? (
          <div className="thumbnail-dialog__loading" role="status" aria-live="polite">
            <span>候选图加载中</span>
            <div className="thumbnail-dialog__skeletons" aria-hidden="true">
              <Skeleton />
              <Skeleton />
              <Skeleton />
            </div>
          </div>
        ) : props.candidates.length ? (
          <div className="thumbnail-dialog__candidates" aria-label="缩略图候选">
            {props.candidates.map((candidate) => {
              const selected = candidate.url === props.selectedUrl;
              const sourceLabel = thumbnailSourceLabel(candidate.source);
              return (
                <Button
                  key={`${candidate.source}-${candidate.url}`}
                  className={cx("thumbnail-candidate", selected && "thumbnail-candidate--selected")}
                  variant="ghost"
                  title={`选择候选图：${sourceLabel}`}
                  aria-label={`选择${sourceLabel}，评分 ${candidate.score}`}
                  aria-pressed={selected}
                  onClick={() => props.onSelect(candidate.url)}
                >
                  <CandidateImage candidate={candidate} />
                  <span className="thumbnail-candidate__meta">
                    <span>
                      <strong>{sourceLabel}</strong>
                      {selected ? <Badge tone="accent">当前选择</Badge> : null}
                    </span>
                    <small>评分 {candidate.score}</small>
                  </span>
                </Button>
              );
            })}
          </div>
        ) : (
          <div className="thumbnail-dialog__empty" role="status">
            <ImageOff aria-hidden="true" size={28} />
            <strong>没有可选择的商品图</strong>
            <p>可以关闭窗口，稍后尝试补全图片。</p>
          </div>
        )}

        {props.error ? (
          <Notice tone="danger" role="alert" title="候选图处理失败">{props.error}</Notice>
        ) : null}

        <footer className="thumbnail-dialog__footer">
          <Button variant="ghost" onClick={props.onClose}>
            <X aria-hidden="true" size={16} />
            关闭
          </Button>
          <Button
            variant="primary"
            disabled={props.loading || props.saving || !props.selectedUrl}
            onClick={props.onSave}
          >
            <Save aria-hidden="true" size={16} />
            {props.saving ? "保存中" : "保存为主图"}
          </Button>
        </footer>
      </div>
    </Dialog>
  );
}

function CandidateImage({ candidate }: { candidate: ThumbnailCandidate }) {
  const [failed, setFailed] = useState(false);
  const sourceLabel = thumbnailSourceLabel(candidate.source);

  useEffect(() => {
    setFailed(false);
  }, [candidate.url]);

  return (
    <span className="thumbnail-candidate__image">
      {failed ? (
        <span className="thumbnail-candidate__fallback" role="img" aria-label={`${sourceLabel}加载失败`}>
          <ImageOff aria-hidden="true" size={25} />
        </span>
      ) : (
        <img
          src={candidate.url}
          alt={sourceLabel}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

export { ThumbnailDialog as ThumbnailPicker };
