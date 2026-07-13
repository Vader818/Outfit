import { CalendarCheck, Check, Pencil, Trash2 } from "lucide-react";
import { Badge, Button, EmptyState, Surface } from "../../components/ui";
import type { OutfitPlanEntry, SavedOutfit } from "../../shared/types";

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const STATUS_LABELS: Record<OutfitPlanEntry["status"], string> = {
  planned: "已安排",
  worn: "已穿",
  skipped: "已跳过"
};

const OCCASION_LABELS: Record<string, string> = {
  casual: "休闲",
  "smart-casual": "商务休闲",
  formal: "正式",
  sport: "运动",
  date: "约会",
  dinner: "晚餐"
};

export interface WeekGridProps {
  weekStart: string;
  today: string;
  plans: OutfitPlanEntry[];
  outfits: SavedOutfit[];
  busyPlanId?: number | null;
  onEdit: (plan: OutfitPlanEntry) => void;
  onDelete: (plan: OutfitPlanEntry) => void;
  onMarkWorn: (plan: OutfitPlanEntry) => void;
}

export function isCalendarDateKey(value: string): boolean {
  const match = DATE_KEY_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

export function addCalendarDays(dateKey: string, amount: number): string {
  if (!isCalendarDateKey(dateKey)) {
    throw new RangeError("计划日期必须是有效的 YYYY-MM-DD 本地日历键");
  }
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}

export function buildWeekDateKeys(weekStart: string): string[] {
  if (!isCalendarDateKey(weekStart)) {
    throw new RangeError("周开始日期必须是有效的 YYYY-MM-DD 本地日历键");
  }
  return Array.from({ length: 7 }, (_, index) => addCalendarDays(weekStart, index));
}

export function formatCalendarDay(dateKey: string): { weekday: string; date: string } {
  if (!isCalendarDateKey(dateKey)) return { weekday: "日期", date: dateKey };
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return {
    weekday: new Intl.DateTimeFormat("zh-CN", { weekday: "short", timeZone: "UTC" }).format(date),
    date: `${month}月${day}日`
  };
}

export function plannerOccasionLabel(value: string): string {
  return OCCASION_LABELS[value] ?? value;
}

export function formatWearEventDateTime(value: string, timeZone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    const parts = new Intl.DateTimeFormat("zh-CN", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((entry) => entry.type === type)?.value ?? "";
    return `${part("year")}年${part("month")}月${part("day")}日 ${part("hour")}:${part("minute")}`;
  } catch {
    return value;
  }
}

export function WeekGrid(props: WeekGridProps) {
  const days = buildWeekDateKeys(props.weekStart);
  const outfitById = new Map(props.outfits.map((outfit) => [outfit.id, outfit]));
  const anyBusy = props.busyPlanId !== null && props.busyPlanId !== undefined;

  return (
    <div className="week-grid-scroll" tabIndex={0} aria-label="可横向滚动的一周穿搭计划">
      <div className="week-grid" role="grid" aria-label="一周穿搭计划">
        {days.map((dateKey) => {
          const label = formatCalendarDay(dateKey);
          const dayPlans = props.plans.filter((plan) => plan.plannedDate === dateKey);
          const dayId = `planner-day-${dateKey}`;
          return (
            <section
              className={`week-day${dateKey === props.today ? " is-today" : ""}`}
              data-today={dateKey === props.today || undefined}
              aria-labelledby={dayId}
              role="gridcell"
              key={dateKey}
            >
              <header className="week-day__header">
                <div>
                  <span>{label.weekday}</span>
                  <strong id={dayId}>{label.date}</strong>
                </div>
                {dateKey === props.today ? <Badge tone="accent">今天</Badge> : null}
              </header>

              {dayPlans.length ? (
                <div className="week-day__plans">
                  {dayPlans.map((plan) => {
                    const outfitName = outfitById.get(plan.outfitId)?.name ?? `搭配 #${plan.outfitId}`;
                    const busy = props.busyPlanId === plan.id;
                    return (
                      <Surface
                        as="article"
                        className="plan-card"
                        aria-busy={busy || undefined}
                        key={plan.id}
                      >
                        <header className="plan-card__header">
                          <Badge tone={statusTone(plan.status)}>{STATUS_LABELS[plan.status]}</Badge>
                          <span>{plannerOccasionLabel(plan.occasion)}</span>
                        </header>
                        <strong className="plan-card__title">{outfitName}</strong>
                        {plan.weatherSnapshot ? (
                          <div className="plan-card__weather" aria-label={`${plan.weatherSnapshot.summary}，体感 ${plan.weatherSnapshot.apparentTemperature} 摄氏度`}>
                            <span>{plan.weatherSnapshot.summary}</span>
                            <strong>{plan.weatherSnapshot.apparentTemperature}°C</strong>
                          </div>
                        ) : <span className="plan-card__weather-empty">天气临近后更新</span>}
                        {plan.notes ? <p className="plan-card__notes">{plan.notes}</p> : null}
                        {plan.status === "worn" && plan.wornAt ? (
                          <time className="plan-card__worn-time" dateTime={plan.wornAt}>
                            {formatWearEventDateTime(plan.wornAt, plan.timeZone)}
                          </time>
                        ) : null}
                        <footer className="plan-card__actions">
                          {plan.status === "planned" ? (
                            <Button
                              variant="primary"
                              size="sm"
                              aria-label={`标记已穿 ${outfitName} ${dateKey}`}
                              disabled={anyBusy}
                              aria-busy={busy || undefined}
                              onClick={() => props.onMarkWorn(plan)}
                            >
                              <Check aria-hidden="true" size={15} />
                              标记已穿
                            </Button>
                          ) : null}
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`编辑 ${outfitName} ${dateKey}`}
                            disabled={anyBusy}
                            onClick={() => props.onEdit(plan)}
                          >
                            <Pencil aria-hidden="true" size={15} />
                            编辑
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`删除 ${outfitName} ${dateKey}`}
                            disabled={anyBusy}
                            onClick={() => props.onDelete(plan)}
                          >
                            <Trash2 aria-hidden="true" size={15} />
                            删除
                          </Button>
                        </footer>
                      </Surface>
                    );
                  })}
                </div>
              ) : (
                <EmptyState compact icon={<CalendarCheck aria-hidden="true" />} title="暂无安排" />
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function statusTone(status: OutfitPlanEntry["status"]): "accent" | "success" | "neutral" {
  if (status === "worn") return "success";
  if (status === "skipped") return "neutral";
  return "accent";
}
