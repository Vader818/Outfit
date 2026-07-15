import { Badge, Button, EmptyState } from "../../components/ui";
import { SUGGESTION_PRIORITY_LABELS } from "../../shared/presentation";
import type { WardrobeSuggestion } from "../../shared/types";

const TONE_BY_PRIORITY = {
  high: "danger",
  medium: "warning",
  low: "info"
} as const;

export interface InsightSuggestionListProps {
  items: WardrobeSuggestion[];
  empty: string;
  onViewRelated?: (garmentIds: number[]) => void;
  onApplyRelatedFilter?: (garmentIds: number[]) => void;
}

export function InsightSuggestionList({
  items,
  empty,
  onViewRelated,
  onApplyRelatedFilter
}: InsightSuggestionListProps) {
  if (!items.length) {
    return <EmptyState compact title={empty} />;
  }

  return (
    <ol className="insight-suggestion-list">
      {items.map((item) => (
        <li className="insight-suggestion" key={item.id}>
          <Badge tone={TONE_BY_PRIORITY[item.priority]}>{SUGGESTION_PRIORITY_LABELS[item.priority]}</Badge>
          <div className="insight-suggestion__copy">
            <strong>{item.title}</strong>
            <p>{item.detail}</p>
            {item.evidence?.length ? (
              <ul className="insight-suggestion__evidence">
                {item.evidence.map((evidence, index) => <li key={`${index}-${evidence}`}>{evidence}</li>)}
              </ul>
            ) : null}
            {item.relatedGarmentIds?.length && (onViewRelated || onApplyRelatedFilter) ? (
              <div className="insight-suggestion__actions">
                {onViewRelated ? (
                  <Button size="sm" variant="secondary" onClick={() => onViewRelated(item.relatedGarmentIds ?? [])}>
                    查看相关衣物
                  </Button>
                ) : null}
                {onApplyRelatedFilter ? (
                  <Button size="sm" variant="ghost" onClick={() => onApplyRelatedFilter(item.relatedGarmentIds ?? [])}>
                    应用筛选
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
