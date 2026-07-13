import { BookOpen, Pencil, Plus, RotateCcw } from "lucide-react";
import { Badge, Button, EmptyState, Notice, Surface } from "../../components/ui";
import { CATEGORY_LABELS } from "../../shared/presentation";
import type { Garment, SavedOutfit, WearEvent } from "../../shared/types";
import { formatWearEventDateTime, plannerOccasionLabel } from "./WeekGrid";

export interface WearDiaryPanelProps {
  events: WearEvent[];
  outfits: SavedOutfit[];
  garments: Garment[];
  busy: boolean;
  busyEventId?: number | null;
  error?: string;
  onCreate: () => void;
  onEdit: (event: WearEvent) => void;
  onDelete: (event: WearEvent) => void;
}

export function WearDiaryPanel(props: WearDiaryPanelProps) {
  const titleId = "wear-diary-title";
  const outfitById = new Map(props.outfits.map((outfit) => [outfit.id, outfit]));
  const garmentById = new Map(props.garments.map((garment) => [garment.id, garment]));
  const sortedEvents = [...props.events].sort((left, right) =>
    Date.parse(right.wornAt) - Date.parse(left.wornAt) || right.id - left.id
  );
  const anyBusy = props.busy || (props.busyEventId !== null && props.busyEventId !== undefined);

  return (
    <section className="wear-diary" aria-labelledby={titleId} aria-busy={props.busy || undefined}>
      <header className="wear-diary__header">
        <div>
          <span>真实穿着历史</span>
          <h2 id={titleId}>穿着日记</h2>
          <p>补录、纠正或撤销实际穿着；时间按记录时的时区还原。</p>
        </div>
        <Button variant="primary" disabled={anyBusy} onClick={props.onCreate}>
          <Plus aria-hidden="true" size={18} />
          补录穿着
        </Button>
      </header>

      {props.error ? <Notice tone="danger" role="alert">{props.error}</Notice> : null}

      {sortedEvents.length ? (
        <ol className="wear-diary__list">
          {sortedEvents.map((event) => {
            const displayTime = formatWearEventDateTime(event.wornAt, event.timeZone);
            const outfitName = event.outfitId ? outfitById.get(event.outfitId)?.name : undefined;
            const busy = props.busyEventId === event.id;
            const eventTitleId = `wear-event-title-${event.id}`;
            return (
              <li key={event.id}>
                <Surface
                  as="article"
                  className="wear-event-card"
                  aria-labelledby={eventTitleId}
                  aria-busy={busy || undefined}
                >
                  <header className="wear-event-card__header">
                    <div>
                      <time id={eventTitleId} dateTime={event.wornAt}>{displayTime}</time>
                      <span>{event.timeZone}</span>
                    </div>
                    <Badge tone="accent">{plannerOccasionLabel(event.occasion)}</Badge>
                  </header>

                  {outfitName ? <strong className="wear-event-card__outfit">{outfitName}</strong> : null}

                  {event.items.length ? (
                    <ul className="wear-event-card__items" aria-label="实际穿着衣物">
                      {[...event.items]
                        .sort((left, right) => left.position - right.position || left.id - right.id)
                        .map((item) => {
                          const garment = garmentById.get(item.itemId);
                          return (
                            <li key={item.id}>
                              <span>{garment ? CATEGORY_LABELS[garment.category] : "历史衣物"}</span>
                              <strong>{garment?.name ?? `衣物 #${item.itemId}`}</strong>
                            </li>
                          );
                        })}
                    </ul>
                  ) : <p className="wear-event-card__empty">这条记录没有关联衣物。</p>}

                  {event.weatherSnapshot ? (
                    <p className="wear-event-card__weather">
                      {event.weatherSnapshot.summary} · 体感 {event.weatherSnapshot.apparentTemperature}°C
                    </p>
                  ) : null}
                  {event.notes ? <p className="wear-event-card__notes">{event.notes}</p> : null}

                  <footer className="wear-event-card__actions">
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-label={`编辑 ${displayTime} 的穿着记录`}
                      disabled={anyBusy}
                      onClick={() => props.onEdit(event)}
                    >
                      <Pencil aria-hidden="true" size={15} />
                      编辑
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`撤销 ${displayTime} 的穿着记录`}
                      disabled={anyBusy}
                      aria-busy={busy || undefined}
                      onClick={() => props.onDelete(event)}
                    >
                      <RotateCcw aria-hidden="true" size={15} />
                      撤销记录
                    </Button>
                  </footer>
                </Surface>
              </li>
            );
          })}
        </ol>
      ) : (
        <EmptyState
          icon={<BookOpen aria-hidden="true" />}
          title="还没有穿着记录"
          description="实际穿过后可以从计划标记，也可以补录过去的日期。"
          action={(
            <Button variant="primary" disabled={anyBusy} onClick={props.onCreate}>
              <Plus aria-hidden="true" size={18} />
              补录穿着
            </Button>
          )}
        />
      )}
    </section>
  );
}
