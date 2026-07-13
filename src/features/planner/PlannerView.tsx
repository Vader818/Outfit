import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button, Notice } from "../../components/ui";
import type { OutfitPlanEntry, SavedOutfit } from "../../shared/types";
import { WeekGrid, addCalendarDays, formatCalendarDay, type WeekGridProps } from "./WeekGrid";

export interface PlannerViewProps extends Pick<WeekGridProps, "weekStart" | "today" | "plans" | "outfits" | "busyPlanId" | "onEdit" | "onDelete" | "onMarkWorn"> {
  busy: boolean;
  error?: string;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  onCreate: () => void;
}

export function formatWeekRange(weekStart: string): string {
  const start = formatCalendarDay(weekStart).date;
  const end = formatCalendarDay(addCalendarDays(weekStart, 6)).date;
  return `${start} – ${end}`;
}

export function PlannerView(props: PlannerViewProps) {
  const titleId = "planner-view-title";
  const range = formatWeekRange(props.weekStart);

  return (
    <section className="planner-view" aria-labelledby={titleId} aria-busy={props.busy || undefined}>
      <header className="planner-view__header">
        <div>
          <span>未来搭配安排</span>
          <h2 id={titleId}>周计划</h2>
          <p>计划日期始终按本地日历键保存；实际穿着时间会单独记录。</p>
        </div>
        <Button variant="primary" disabled={props.busy} onClick={props.onCreate}>
          <Plus aria-hidden="true" size={18} />
          新建计划
        </Button>
      </header>

      <div className="planner-toolbar" aria-label="周计划导航">
        <div className="planner-toolbar__navigation">
          <Button
            variant="secondary"
            size="sm"
            aria-label="上一周"
            disabled={props.busy}
            onClick={props.onPreviousWeek}
          >
            <ChevronLeft aria-hidden="true" size={17} />
            上一周
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label="回到今天"
            disabled={props.busy}
            onClick={props.onToday}
          >
            <CalendarDays aria-hidden="true" size={17} />
            今日
          </Button>
          <Button
            variant="secondary"
            size="sm"
            aria-label="下一周"
            disabled={props.busy}
            onClick={props.onNextWeek}
          >
            下一周
            <ChevronRight aria-hidden="true" size={17} />
          </Button>
        </div>
        <strong className="planner-toolbar__range" aria-live="polite">{range}</strong>
      </div>

      {props.error ? <Notice tone="danger" role="alert">{props.error}</Notice> : null}

      <WeekGrid
        weekStart={props.weekStart}
        today={props.today}
        plans={props.plans}
        outfits={props.outfits}
        busyPlanId={props.busyPlanId}
        onEdit={props.onEdit}
        onDelete={props.onDelete}
        onMarkWorn={props.onMarkWorn}
      />
    </section>
  );
}

export type { OutfitPlanEntry, SavedOutfit };
