import { readFileSync } from "node:fs";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  OutfitPlanDialog,
  buildOutfitPlanInput
} from "../src/features/planner/OutfitPlanDialog";
import { PlannerView } from "../src/features/planner/PlannerView";
import {
  WeekGrid,
  buildWeekDateKeys,
  formatWearEventDateTime,
  isCalendarDateKey
} from "../src/features/planner/WeekGrid";
import { WearDiaryPanel } from "../src/features/planner/WearDiaryPanel";
import {
  WearEventDialog,
  buildWearEventInput,
  formatZonedDateTimeForInput,
  zonedDateTimeToIso
} from "../src/features/planner/WearEventDialog";
import type {
  Garment,
  OutfitPlanEntry,
  SavedOutfit,
  WearEvent,
  WeatherSnapshot
} from "../src/shared/types";

describe("M4 周计划", () => {
  it("从本地日历键生成固定七天，跨月时不经过 UTC 时间戳语义", () => {
    expect(buildWeekDateKeys("2026-07-27")).toEqual([
      "2026-07-27",
      "2026-07-28",
      "2026-07-29",
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
      "2026-08-02"
    ]);
    expect(isCalendarDateKey("2026-02-29")).toBe(false);
    expect(isCalendarDateKey("2028-02-29")).toBe(true);
    expect(() => buildWeekDateKeys("2026-07-27T00:00:00Z")).toThrow("YYYY-MM-DD");
  });

  it("展示七天、计划状态、冻结天气和完整受控操作", () => {
    const outfit = makeSavedOutfit();
    const plans = [
      makePlan(1, "2026-07-13", "planned"),
      makePlan(2, "2026-07-14", "worn"),
      makePlan(3, "2026-07-15", "skipped")
    ];
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const onMarkWorn = vi.fn();
    const tree = WeekGrid({
      weekStart: "2026-07-13",
      today: "2026-07-14",
      plans,
      outfits: [outfit],
      busyPlanId: null,
      onEdit,
      onDelete,
      onMarkWorn
    });
    const markup = renderToStaticMarkup(<>{tree}</>);

    expect(markup.match(/class="week-day(?:\s|\")/g)).toHaveLength(7);
    expect(markup).toContain("周一通勤");
    expect(markup).toContain("已安排");
    expect(markup).toContain("已穿");
    expect(markup).toContain("已跳过");
    expect(markup).toContain("晴");
    expect(markup).toContain('data-today="true"');
    expect(markup).toContain("暂无安排");

    findButtonsByText(tree, "编辑 周一通勤 2026-07-13")[0].props.onClick();
    findButtonsByText(tree, "删除 周一通勤 2026-07-13")[0].props.onClick();
    findButtonsByText(tree, "标记已穿 周一通勤 2026-07-13")[0].props.onClick();
    expect(onEdit).toHaveBeenCalledWith(plans[0]);
    expect(onDelete).toHaveBeenCalledWith(plans[0]);
    expect(onMarkWorn).toHaveBeenCalledWith(plans[0]);
  });

  it("周视图提供上周、下周、今日和新建入口且不私自维护导航状态", () => {
    const onPreviousWeek = vi.fn();
    const onNextWeek = vi.fn();
    const onToday = vi.fn();
    const onCreate = vi.fn();
    const tree = PlannerView({
      weekStart: "2026-07-13",
      today: "2026-07-14",
      plans: [],
      outfits: [],
      busy: false,
      onPreviousWeek,
      onNextWeek,
      onToday,
      onCreate,
      onEdit: vi.fn(),
      onDelete: vi.fn(),
      onMarkWorn: vi.fn()
    });
    const markup = renderToStaticMarkup(<>{tree}</>);

    expect(markup).toContain("周计划");
    expect(markup).toContain("7月13日 – 7月19日");
    findButtonsByText(tree, "上一周")[0].props.onClick();
    findButtonsByText(tree, "下一周")[0].props.onClick();
    findButtonsByText(tree, "回到今天")[0].props.onClick();
    findButtonsByText(tree, "新建计划")[0].props.onClick();
    expect(onPreviousWeek).toHaveBeenCalledOnce();
    expect(onNextWeek).toHaveBeenCalledOnce();
    expect(onToday).toHaveBeenCalledOnce();
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it("计划提交保持 plannedDate 原样并按所选日期冻结天气", () => {
    const forecast = makeWeather("2026-07-16");
    expect(buildOutfitPlanInput({
      plannedDate: "2026-07-16",
      timeZone: "Asia/Shanghai",
      outfitId: 9,
      occasion: " formal ",
      notes: "  客户会议  "
    }, [forecast])).toEqual({
      plannedDate: "2026-07-16",
      timeZone: "Asia/Shanghai",
      outfitId: 9,
      occasion: "formal",
      notes: "客户会议",
      weatherSnapshot: forecast
    });

    const markup = renderToStaticMarkup(
      <OutfitPlanDialog
        open
        outfits={[makeSavedOutfit()]}
        forecasts={[forecast]}
        initial={{
          plannedDate: "2026-07-16",
          timeZone: "Asia/Shanghai",
          outfitId: 9,
          occasion: "formal",
          notes: ""
        }}
        busy={false}
        repeatWarning="这套正式搭配 28 天内已经安排过。"
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        onReplace={vi.fn()}
      />
    );
    expect(markup).toContain('type="date"');
    expect(markup).toContain('value="2026-07-16"');
    expect(markup).toContain("这套正式搭配 28 天内已经安排过");
    expect(markup).toContain("计划已经保存");
    expect(markup).toContain("保留计划");
    expect(markup).toContain("换一件（保留当前计划）");
    expect(markup).toContain(">关闭<");
  });

  it("编辑仅改备注时保留冻结天气，只有日期变化才采用对应 forecast", () => {
    const frozen = makeWeather("2026-07-16");
    const refreshedSameDay = { ...frozen, apparentTemperature: 40, summary: "新预报" };
    const nextDay = makeWeather("2026-07-17");
    const sameDate = buildOutfitPlanInput({
      plannedDate: "2026-07-16",
      timeZone: "Asia/Shanghai",
      outfitId: 9,
      occasion: "formal",
      notes: ""
    }, [refreshedSameDay, nextDay], {
      originalPlannedDate: "2026-07-16",
      originalWeatherSnapshot: frozen
    });
    expect(sameDate).toMatchObject({ notes: "", weatherSnapshot: frozen });

    const changedDate = buildOutfitPlanInput({
      plannedDate: "2026-07-17",
      timeZone: "Asia/Shanghai",
      outfitId: 9,
      occasion: "formal",
      notes: "改期"
    }, [refreshedSameDay, nextDay], {
      originalPlannedDate: "2026-07-16",
      originalWeatherSnapshot: frozen
    });
    expect(changedDate.weatherSnapshot).toEqual(nextDay);

    const changedWithoutForecast = buildOutfitPlanInput({
      plannedDate: "2026-07-18",
      timeZone: "Asia/Shanghai",
      outfitId: 9,
      occasion: "formal",
      notes: "改期"
    }, [refreshedSameDay, nextDay], {
      originalPlannedDate: "2026-07-16",
      originalWeatherSnapshot: frozen
    });
    expect(changedWithoutForecast).not.toHaveProperty("weatherSnapshot");
  });
});

describe("M4 穿着日记", () => {
  it("按事件时区显示记录，并提供补录、编辑和撤销入口", () => {
    const event = makeWearEvent();
    const onCreate = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const tree = WearDiaryPanel({
      events: [event],
      outfits: [makeSavedOutfit()],
      garments: [makeGarment(101, "白衬衫"), makeGarment(202, "黑长裤", "bottom")],
      busy: false,
      onCreate,
      onEdit,
      onDelete
    });
    const markup = renderToStaticMarkup(<>{tree}</>);

    expect(markup).toContain("穿着日记");
    expect(markup).toContain("2026年7月13日 08:30");
    expect(markup).toContain("Asia/Shanghai");
    expect(markup).toContain("白衬衫");
    expect(markup).toContain("客户会议");
    findButtonsByText(tree, "补录穿着")[0].props.onClick();
    findButtonsByText(tree, "编辑 2026年7月13日 08:30 的穿着记录")[0].props.onClick();
    findButtonsByText(tree, "撤销 2026年7月13日 08:30 的穿着记录")[0].props.onClick();
    expect(onCreate).toHaveBeenCalledOnce();
    expect(onEdit).toHaveBeenCalledWith(event);
    expect(onDelete).toHaveBeenCalledWith(event);
  });

  it("日记空态仍保留唯一的补录行动", () => {
    const markup = renderToStaticMarkup(
      <WearDiaryPanel
        events={[]}
        outfits={[]}
        garments={[]}
        busy={false}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(markup).toContain("还没有穿着记录");
    expect(markup.match(/补录穿着/g)?.length).toBeGreaterThanOrEqual(1);
  });

  it("明确转换 UTC+8、UTC-8、跨午夜与夏令时边界", () => {
    expect(zonedDateTimeToIso("2026-07-13T08:30", "Asia/Shanghai"))
      .toBe("2026-07-13T00:30:00.000Z");
    expect(zonedDateTimeToIso("2026-07-13T08:30", "America/Los_Angeles"))
      .toBe("2026-07-13T15:30:00.000Z");
    expect(formatZonedDateTimeForInput("2026-07-13T00:30:00.000Z", "America/Los_Angeles"))
      .toBe("2026-07-12T17:30");
    expect(() => zonedDateTimeToIso("2026-03-08T02:30", "America/Los_Angeles"))
      .toThrow("不存在");
  });

  it("构造去重后的事件输入并渲染可访问的新建/编辑对话框", () => {
    expect(buildWearEventInput({
      wornAtLocal: "2026-07-13T08:30",
      timeZone: "Asia/Shanghai",
      outfitId: 9,
      occasion: " formal ",
      notes: "  客户会议  ",
      itemIds: [101, 202, 101]
    })).toEqual({
      wornAt: "2026-07-13T00:30:00.000Z",
      timeZone: "Asia/Shanghai",
      outfitId: 9,
      occasion: "formal",
      notes: "客户会议",
      itemIds: [101, 202]
    });
    expect(buildWearEventInput({
      wornAtLocal: "2026-07-13T08:30",
      timeZone: "Asia/Shanghai",
      occasion: "casual",
      notes: "   ",
      itemIds: [101]
    })).toMatchObject({ outfitId: null, notes: null });

    const markup = renderToStaticMarkup(
      <WearEventDialog
        open
        event={makeWearEvent()}
        outfits={[makeSavedOutfit()]}
        garments={[makeGarment(101, "白衬衫"), makeGarment(202, "黑长裤", "bottom")]}
        busy={false}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );
    expect(markup).toContain("编辑穿着记录");
    expect(markup).toContain('aria-labelledby="');
    expect(markup).toContain('aria-describedby="');
    expect(markup).toContain('type="datetime-local"');
    expect(markup).toContain("IANA 时区");
    expect(markup).toContain("白衬衫");
    expect(markup).toContain("保存修改");
  });
});

describe("M4 planner 响应式样式", () => {
  it("桌面保持七列，窄屏改为可滚动的单日卡片且保留触控目标", () => {
    const css = readFileSync("src/features/planner/planner.css", "utf8");
    expect(css).toContain("grid-template-columns: repeat(7, minmax(0, 1fr))");
    expect(css).toContain("overflow-x: auto");
    expect(css).toContain("scroll-snap-type: x mandatory");
    expect(css).toContain("min-height: 2.75rem");
    expect(css).toContain("@media (max-width: 760px)");
  });
});

function makeWeather(date = "2026-07-13"): WeatherSnapshot {
  return {
    date,
    temperature: 29,
    apparentTemperature: 31,
    precipitationProbability: 10,
    windSpeed: 8,
    weatherCode: 1,
    summary: "晴"
  };
}

function makeSavedOutfit(): SavedOutfit {
  return {
    id: 9,
    name: "周一通勤",
    notes: "",
    source: "manual",
    favorite: false,
    items: [],
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z"
  };
}

function makePlan(id: number, plannedDate: string, status: OutfitPlanEntry["status"]): OutfitPlanEntry {
  return {
    id,
    plannedDate,
    timeZone: "Asia/Shanghai",
    outfitId: 9,
    occasion: "formal",
    weatherSnapshot: makeWeather(plannedDate),
    status,
    ...(status === "worn" ? { wornAt: "2026-07-14T00:30:00.000Z", wearEventId: 21 } : {}),
    notes: "客户会议"
  };
}

function makeWearEvent(): WearEvent {
  return {
    id: 21,
    wornAt: "2026-07-13T00:30:00.000Z",
    timeZone: "Asia/Shanghai",
    outfitId: 9,
    occasion: "formal",
    weatherSnapshot: makeWeather(),
    notes: "客户会议",
    items: [
      { id: 1, wearEventId: 21, itemId: 101, position: 0 },
      { id: 2, wearEventId: 21, itemId: 202, position: 1 }
    ]
  };
}

function makeGarment(id: number, name: string, category: Garment["category"] = "top"): Garment {
  return {
    id,
    origin: "manual",
    brand: "",
    name,
    rawName: name,
    category,
    color: "black",
    warmth: "medium",
    seasons: ["spring", "summer", "autumn", "winter"],
    styles: ["minimal"],
    formality: "formal",
    imageUrl: "",
    owned: true,
    confirmed: true,
    excluded: false,
    availabilityStatus: "available",
    confidence: 1
  };
}

function findButtonsByText(node: ReactNode, text: string): ReactElement[] {
  const buttons: ReactElement[] = [];
  function visit(current: ReactNode) {
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    if (!isValidElement(current)) return;
    const props = current.props as {
      "aria-label"?: string;
      children?: ReactNode;
      onClick?: () => void;
    };
    const label = String(props["aria-label"] ?? "");
    if (typeof props.onClick === "function" &&
      (label === text || textContent(props.children).includes(text))) {
      buttons.push(current);
    }
    visit(props.children);
  }
  visit(node);
  return buttons;
}

function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join("");
  if (!isValidElement(node)) return "";
  return textContent((node.props as { children?: ReactNode }).children);
}
