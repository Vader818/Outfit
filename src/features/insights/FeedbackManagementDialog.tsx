import { useState } from "react";
import { Button, Dialog, Field, Notice, SelectField } from "../../components/ui";
import type {
  RecommendationFeedbackClearPreview,
  RecommendationFeedbackClearScope
} from "../../shared/types";

type FeedbackClearScopeKind = RecommendationFeedbackClearScope["scope"];

export type FeedbackManagementDialogProps = {
  open: boolean;
  busy: boolean;
  error?: string;
  preview: RecommendationFeedbackClearPreview | null;
  onClose: () => void;
  onPreview: (scope: RecommendationFeedbackClearScope) => void;
  onConfirm: (scope: RecommendationFeedbackClearScope) => void;
  onResetPreview: () => void;
};

export function buildFeedbackClearScope(
  scope: FeedbackClearScopeKind,
  candidateId: string,
  from: string,
  to: string
): RecommendationFeedbackClearScope {
  if (scope === "candidate") {
    const cleaned = candidateId.trim().toLowerCase();
    if (!cleaned) throw new Error("请输入候选 ID");
    return { scope, candidateId: cleaned };
  }
  if (scope === "date-range") {
    if (!from || !to || from > to) throw new Error("请选择有效的日期范围");
    return { scope, from, to };
  }
  return { scope: "all" };
}

export function FeedbackManagementDialog(props: FeedbackManagementDialogProps) {
  const [scope, setScope] = useState<FeedbackClearScopeKind>("all");
  const [candidateId, setCandidateId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [localError, setLocalError] = useState("");

  function updateScope(next: FeedbackClearScopeKind) {
    setScope(next);
    setLocalError("");
    props.onResetPreview();
  }

  function updateValue(setter: (value: string) => void, value: string) {
    setter(value);
    setLocalError("");
    props.onResetPreview();
  }

  function currentScope(): RecommendationFeedbackClearScope | null {
    try {
      return buildFeedbackClearScope(scope, candidateId, from, to);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "反馈范围无效");
      return null;
    }
  }

  function preview() {
    const value = currentScope();
    if (value) props.onPreview(value);
  }

  function confirm() {
    const value = currentScope();
    if (value) props.onConfirm(value);
  }

  return (
    <Dialog
      open={props.open}
      onClose={() => { if (!props.busy) props.onClose(); }}
      labelledBy="feedback-management-title"
      describedBy="feedback-management-description"
      className="feedback-management-dialog"
    >
      <div className="ui-dialog__header">
        <div>
          <h2 id="feedback-management-title">管理反馈数据</h2>
          <p id="feedback-management-description">
            先预览范围和受影响的衣物组合，再确认清空。此操作只影响本机反馈与学习权重。
          </p>
        </div>
      </div>

      <div className="ui-dialog__body feedback-management-dialog__body">
        <SelectField
          label="清空范围"
          value={scope}
          disabled={props.busy}
          options={[
            { value: "all", label: "全部反馈" },
            { value: "candidate", label: "指定候选" },
            { value: "date-range", label: "日期范围" }
          ]}
          onChange={(event) => updateScope(event.target.value as FeedbackClearScopeKind)}
        />

        {scope === "candidate" ? (
          <Field
            label="候选 ID"
            value={candidateId}
            disabled={props.busy}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            onChange={(event) => updateValue(setCandidateId, event.target.value)}
          />
        ) : null}

        {scope === "date-range" ? (
          <div className="feedback-management-dialog__dates">
            <Field label="开始日期" type="date" value={from} disabled={props.busy} onChange={(event) => updateValue(setFrom, event.target.value)} />
            <Field label="结束日期" type="date" value={to} disabled={props.busy} onChange={(event) => updateValue(setTo, event.target.value)} />
          </div>
        ) : null}

        {localError || props.error ? (
          <Notice tone="danger" role="alert">{localError || props.error}</Notice>
        ) : null}

        {props.preview ? (
          <Notice tone={props.preview.feedbackCount ? "warning" : "info"} title="预览结果">
            <p>{scopeDescription(props.preview)}</p>
            <p>
              将清除 <strong>{props.preview.feedbackCount} 条反馈</strong>，并重算
              {" "}<strong>{props.preview.affectedPairCount} 对衣物组合</strong>的学习权重。
            </p>
            {props.preview.feedbackCount === 0 ? <p>当前范围没有反馈，不会改变任何数据。</p> : null}
          </Notice>
        ) : null}
      </div>

      <div className="ui-dialog__footer">
        <Button variant="ghost" disabled={props.busy} onClick={props.onClose}>取消</Button>
        <Button variant="secondary" disabled={props.busy} onClick={preview}>
          {props.busy ? "处理中" : "预览影响范围"}
        </Button>
        {props.preview ? (
          <Button
            variant="danger"
            disabled={props.busy || props.preview.feedbackCount === 0}
            aria-busy={props.busy || undefined}
            onClick={confirm}
          >
            {props.busy ? "清空中" : "确认清空"}
          </Button>
        ) : null}
      </div>
    </Dialog>
  );
}

function scopeDescription(preview: RecommendationFeedbackClearPreview): string {
  if (preview.scope === "candidate") return `候选 ${preview.candidateId ?? ""}`;
  if (preview.scope === "date-range") return `${preview.from ?? ""} 至 ${preview.to ?? ""}`;
  return "全部反馈";
}
