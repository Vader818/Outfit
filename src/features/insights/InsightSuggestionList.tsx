import { Badge, EmptyState } from "../../components/ui";
import { SUGGESTION_PRIORITY_LABELS } from "../../shared/presentation";
import type { WardrobeSuggestion } from "../../shared/types";

const TONE_BY_PRIORITY = {
  high: "danger",
  medium: "warning",
  low: "info"
} as const;

export function InsightSuggestionList({ items, empty }: { items: WardrobeSuggestion[]; empty: string }) {
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
          </div>
        </li>
      ))}
    </ol>
  );
}
