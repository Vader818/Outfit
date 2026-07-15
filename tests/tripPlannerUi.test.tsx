import { readFileSync } from "node:fs";
import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PackingChecklist } from "../src/features/planner/PackingChecklist";
import {
  TripPlannerView,
  tripDurationDays,
  validateTripDraft,
  type TripPlannerViewProps
} from "../src/features/planner/TripPlannerView";
import type {
  Garment,
  Trip,
  TripCreateInput,
  TripOptimizationResult,
  TripPackingItem,
  TripPackingStatus
} from "../src/shared/types";

describe("M6 旅行胶囊 UI", () => {
  it("校验 1-7 天并通过受控回调编辑旅行、约束和活动共用规则", () => {
    const draft = makeDraft();
    const onDraftChange = vi.fn();
    const onSave = vi.fn();
    const tree = TripPlannerView({
      ...baseProps(),
      editorMode: "create",
      draft,
      onDraftChange,
      onSave
    });
    const html = renderToStaticMarkup(tree);

    expect(tripDurationDays("2026-08-01", "2026-08-07")).toBe(7);
    expect(validateTripDraft(draft)).toBeNull();
    expect(validateTripDraft({ ...draft, endDate: "2026-08-08" })).toContain("1-7 天");
    expect(validateTripDraft({ ...draft, destination: { name: "" } })).toContain("目的地");
    expect(validateTripDraft({ ...draft, maxGarments: 0 })).toBeNull();
    expect(validateTripDraft({ ...draft, maxGarments: 101 })).toContain("0 到 100");
    expect(validateTripDraft({ ...draft, maxShoes: 21 })).toContain("0 到 20");
    expect(validateTripDraft({
      ...draft,
      destination: { name: "青岛", latitude: 36.0671 }
    })).toContain("同时填写");
    expect(html).toContain("新建旅行");
    expect(html).toContain("1-7 天");
    expect(html).toContain("青岛");
    expect(html).toContain("允许重复穿");
    expect(html).toContain("与相邻活动共用搭配");
    expect(html).toContain("需要独立搭配");
    expect(html).toContain("新增活动");
    expect(findInput(tree, "trip-max-garments").props).toMatchObject({ min: 0, max: 100 });

    findInput(tree, "trip-name").props.onChange({ target: { value: "海边会议" } });
    expect(onDraftChange).toHaveBeenLastCalledWith({ ...draft, name: "海边会议" });

    findInput(tree, "trip-day-0-activity-0-separate").props.onChange({ target: { checked: true } });
    expect(onDraftChange).toHaveBeenLastCalledWith({
      ...draft,
      days: [{
        ...draft.days[0],
        activities: [{ ...draft.days[0].activities[0], requiresSeparateOutfit: true }]
      }]
    });

    findButton(tree, "新增活动").props.onClick();
    expect(onDraftChange.mock.calls.at(-1)?.[0].days[0].activities).toHaveLength(2);
    findElement(tree, "form").props.onSubmit({ preventDefault: vi.fn() });
    expect(onSave).toHaveBeenCalledWith(draft, "create");
  });

  it("提供旅行列表选择、显式天气刷新、生成及不可行冲突的单项放宽", () => {
    const trip = makeTrip();
    const optimization: TripOptimizationResult = {
      status: "infeasible",
      conflicts: [{ constraint: "maxShoes", message: "最多 1 双鞋无法覆盖全部活动" }],
      relaxations: [{
        constraint: "maxShoes",
        from: 1,
        to: 2,
        message: "把鞋履上限放宽到 2 双",
        guaranteed: true
      }],
      evaluatedCandidates: 24
    };
    const onSelectTrip = vi.fn();
    const onRefreshWeather = vi.fn();
    const onGenerate = vi.fn();
    const onApplyRelaxation = vi.fn();
    const onArchiveTrip = vi.fn();
    const tree = TripPlannerView({
      ...baseProps(),
      trips: [trip],
      selectedTripId: trip.id,
      optimization,
      onSelectTrip,
      onRefreshWeather,
      onGenerate,
      onApplyRelaxation,
      onArchiveTrip
    });
    const html = renderToStaticMarkup(tree);

    expect(html).toContain("青岛出差");
    expect(html).toContain('aria-current="true"');
    expect(html).toContain("刷新天气");
    expect(html).toContain("仅在点击后使用目的地坐标");
    expect(html).toContain("Open-Meteo");
    expect(html).toContain("没有满足全部硬约束的方案");
    expect(html).toContain("最多 1 双鞋无法覆盖全部活动");
    expect(html).toContain("把鞋履上限放宽到 2 双");
    expect(html).toContain("归档旅行");

    findButton(tree, "选择旅行 青岛出差").props.onClick();
    findButton(tree, "刷新天气").props.onClick();
    findButton(tree, "生成胶囊方案").props.onClick();
    findButton(tree, "应用放宽建议：把鞋履上限放宽到 2 双").props.onClick();
    findButton(tree, "归档旅行 青岛出差").props.onClick();
    expect(onSelectTrip).toHaveBeenCalledWith(trip.id);
    expect(onRefreshWeather).toHaveBeenCalledWith(trip);
    expect(onGenerate).toHaveBeenCalledWith(trip);
    expect(onApplyRelaxation).toHaveBeenCalledWith(trip, optimization.relaxations[0]);
    expect(onArchiveTrip).toHaveBeenCalledWith(trip);

    const advisoryHtml = renderToStaticMarkup(
      <TripPlannerView
        {...baseProps()}
        trips={[trip]}
        selectedTripId={trip.id}
        optimization={{
          ...optimization,
          relaxations: [{
            ...optimization.relaxations[0],
            message: "补充满足场合的衣物",
            guaranteed: false
          }]
        }}
      />
    );
    expect(advisoryHtml).toContain("需手动调整后重新检查");
    expect(advisoryHtml).not.toContain("应用放宽建议：补充满足场合的衣物");

    const completedHtml = renderToStaticMarkup(
      <TripPlannerView
        {...baseProps()}
        trips={[{ ...trip, status: "completed" }]}
        selectedTripId={trip.id}
      />
    );
    expect(completedHtml).not.toContain("归档旅行");
    expect(completedHtml).not.toContain("编辑旅行");
    expect(completedHtml).not.toContain("刷新天气");
    expect(completedHtml).not.toContain("生成胶囊方案");
    const completedEmptyHtml = renderToStaticMarkup(
      <TripPlannerView
        {...baseProps()}
        trips={[{ ...trip, status: "completed", selections: [] }]}
        selectedTripId={trip.id}
      />
    );
    expect(completedEmptyHtml).not.toContain("生成胶囊方案");
    expect(completedEmptyHtml).not.toContain("直接添加非衣物必需品");
  });

  it("解释逐日选择，并支持锁定、同类别可用替换与确认实际穿着", () => {
    const trip = makeTrip();
    const onToggleGarmentLock = vi.fn();
    const onReplaceGarment = vi.fn();
    const onToggleWearConfirmation = vi.fn();
    const tree = TripPlannerView({
      ...baseProps(),
      trips: [trip],
      selectedTripId: trip.id,
      availableGarments: [
        ...trip.selections[0].garments,
        garment(4, "浅蓝衬衫", "top")
      ],
      confirmedSelectionIds: [trip.selections[0].id],
      onToggleGarmentLock,
      onReplaceGarment,
      onToggleWearConfirmation
    });
    const html = renderToStaticMarkup(tree);

    expect(html).toContain("2026年8月1日");
    expect(html).toContain("客户会议");
    expect(html).toContain("适合正式场合，且覆盖当日温度");
    expect(html).toContain("锁定 米白衬衫");
    expect(html).toContain("替换为同类别可用衣物");
    expect(html).toContain("浅蓝衬衫");
    expect(html).not.toMatch(/<option value="2">浅蓝衬衫/);
    expect(html).toContain("确认这一天实际穿着");
    expect(html).toContain('aria-checked="true"');

    findInput(tree, "trip-selection-101-lock-1").props.onChange({ target: { checked: true } });
    findSelect(tree, "trip-selection-101-replace-1").props.onChange({ target: { value: "4" } });
    findInput(tree, "trip-selection-101-confirmed").props.onChange({ target: { checked: false } });
    expect(onToggleGarmentLock).toHaveBeenCalledWith(trip.selections[0], 1, true);
    expect(onReplaceGarment).toHaveBeenCalledWith(trip.selections[0], 1, 4);
    expect(onToggleWearConfirmation).toHaveBeenCalledWith(trip.selections[0], false);

    const recordedTree = TripPlannerView({
      ...baseProps(),
      trips: [{
        ...trip,
        status: "completed",
        selections: [{ ...trip.selections[0], actualWearEventId: 501 }]
      }],
      selectedTripId: trip.id,
      confirmedSelectionIds: [],
      optimization: {
        status: "feasible",
        selections: trip.selections,
        packingItems: trip.packingItems,
        objectiveScore: 88,
        evaluatedCandidates: 3,
        maxBeamSize: 1
      }
    });
    expect(renderToStaticMarkup(recordedTree)).toContain("实际穿着已记录");
    expect(findInput(recordedTree, "trip-selection-101-lock-1").props.disabled).toBe(true);
    expect(findInput(recordedTree, "trip-selection-101-confirmed").props).toMatchObject({
      checked: true,
      "aria-checked": true,
      disabled: true
    });
  });

  it("让装箱清单的四种状态、必需品文本与删除都完全受控", () => {
    const items = makePackingItems();
    const onStatusChange = vi.fn();
    const onEssentialDraftChange = vi.fn();
    const onAddEssential = vi.fn();
    const onRemoveEssential = vi.fn();
    const tree = PackingChecklist({
      items,
      essentialDraft: "充电器",
      busy: false,
      onStatusChange,
      onEssentialDraftChange,
      onAddEssential,
      onRemoveEssential
    });
    const html = renderToStaticMarkup(tree);

    expect(html).toContain("装箱清单");
    expect(html).toContain("未装箱");
    expect(html).toContain("已打包");
    expect(html).toContain("穿在身上");
    expect(html).toContain("不带");
    expect(html).toContain("覆盖 8月1日");
    expect(html).toContain("客户会议");
    expect(html).toContain("适合正式场合");
    expect(html).toContain("添加非衣物必需品");

    findSelect(tree, "packing-item-201-status").props.onChange({ target: { value: "on-body" } });
    findInput(tree, "packing-essential-draft").props.onChange({ target: { value: "护照" } });
    findElement(tree, "form").props.onSubmit({ preventDefault: vi.fn() });
    findButton(tree, "移除必需品 充电器").props.onClick();
    expect(onStatusChange).toHaveBeenCalledWith(items[0], "on-body" satisfies TripPackingStatus);
    expect(onEssentialDraftChange).toHaveBeenCalledWith("护照");
    expect(onAddEssential).toHaveBeenCalledWith("充电器");
    expect(onRemoveEssential).toHaveBeenCalledWith(items[1]);
  });

  it("覆盖加载、错误、空态和 390px 触控样式", () => {
    const loading = renderToStaticMarkup(<TripPlannerView {...baseProps()} loading />);
    const empty = renderToStaticMarkup(<TripPlannerView {...baseProps()} />);
    const error = renderToStaticMarkup(<TripPlannerView {...baseProps()} error="旅行读取失败，请重试" />);
    const css = readFileSync(new URL("../src/features/planner/trip-planner.css", import.meta.url), "utf8");

    expect(loading).toContain("正在读取旅行计划");
    expect(loading).toContain('aria-busy="true"');
    expect(empty).toContain("还没有旅行计划");
    expect(error).toContain('role="alert"');
    expect(error).toContain("旅行读取失败，请重试");
    expect(css).toContain("@media (max-width: 390px)");
    expect(css).toMatch(/min-height:\s*2\.75rem/);
    expect(css).toContain("grid-template-columns: 1fr");
  });
});

function baseProps(): TripPlannerViewProps {
  return {
    trips: [],
    selectedTripId: null,
    editorMode: null,
    draft: makeDraft(),
    availableGarments: [],
    optimization: null,
    confirmedSelectionIds: [],
    essentialDraft: "",
    loading: false,
    busy: false,
    onSelectTrip: vi.fn(),
    onStartCreate: vi.fn(),
    onStartEdit: vi.fn(),
    onArchiveTrip: vi.fn(),
    onCancelEdit: vi.fn(),
    onDraftChange: vi.fn(),
    onSave: vi.fn(),
    onRefreshWeather: vi.fn(),
    onGenerate: vi.fn(),
    onApplyRelaxation: vi.fn(),
    onToggleGarmentLock: vi.fn(),
    onReplaceGarment: vi.fn(),
    onPackingStatus: vi.fn(),
    onEssentialDraftChange: vi.fn(),
    onAddEssential: vi.fn(),
    onRemoveEssential: vi.fn(),
    onToggleWearConfirmation: vi.fn(),
    onCompleteTrip: vi.fn()
  };
}

function makeDraft(): TripCreateInput {
  return {
    name: "青岛出差",
    startDate: "2026-08-01",
    endDate: "2026-08-01",
    destination: { name: "青岛", latitude: 36.0671, longitude: 120.3826 },
    maxGarments: 8,
    maxShoes: 1,
    repeatPolicy: "allow",
    maxCoreWearsBetweenLaundry: 2,
    days: [{
      date: "2026-08-01",
      activities: [{
        name: "客户会议",
        occasion: "business",
        formality: "formal",
        requiresSeparateOutfit: false
      }]
    }]
  };
}

function makeTrip(): Trip {
  const draft = makeDraft();
  const garments = [
    garment(1, "米白衬衫", "top"),
    garment(2, "深蓝长裤", "bottom"),
    garment(3, "黑色乐福鞋", "shoes")
  ];
  const packingItems = makePackingItems();
  return {
    id: 7,
    ...draft,
    status: "planning",
    days: [{
      id: 11,
      tripId: 7,
      date: "2026-08-01",
      weather: {
        date: "2026-08-01",
        temperature: 27,
        apparentTemperature: 29,
        precipitationProbability: 0.2,
        windSpeed: 12,
        weatherCode: 1,
        summary: "多云"
      },
      activities: [{
        id: 31,
        tripDayId: 11,
        position: 0,
        ...draft.days[0].activities[0]
      }]
    }],
    selections: [{
      id: 101,
      tripDayId: 11,
      slotIndex: 0,
      activityIds: [31],
      garments,
      score: 88,
      reasons: ["适合正式场合，且覆盖当日温度"],
      activityEvaluations: [{
        activityId: 31,
        score: 88,
        weatherComfort: 90,
        occasion: 86,
        hardEligible: true
      }],
      lockedGarmentIds: []
    }],
    packingItems,
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z"
  };
}

function makePackingItems(): TripPackingItem[] {
  return [{
    id: 201,
    tripId: 7,
    kind: "garment",
    garmentId: 1,
    label: "米白衬衫",
    status: "unpacked",
    coverage: {
      dates: ["2026-08-01"],
      activityIds: [31],
      activities: ["客户会议"],
      occasions: ["business"],
      reasons: ["适合正式场合"]
    }
  }, {
    id: 202,
    tripId: 7,
    kind: "essential",
    label: "充电器",
    status: "packed",
    coverage: { dates: [], activityIds: [] }
  }];
}

function garment(id: number, name: string, category: Garment["category"]): Garment {
  return {
    id,
    origin: "manual",
    brand: "",
    name,
    rawName: name,
    category,
    color: "black",
    warmth: "medium",
    seasons: ["summer"],
    styles: ["business"],
    formality: category === "shoes" ? "smart-casual" : "formal",
    imageUrl: "",
    owned: true,
    confirmed: true,
    excluded: false,
    availabilityStatus: "available",
    confidence: 1
  };
}

function findButton(node: ReactNode, label: string): ReactElement<any> {
  const button = findElements(node, (element) =>
    (element.type === "button" || element.props.onClick)
    && (element.props["aria-label"] === label || textContent(element.props.children) === label)
  )[0];
  if (!button) throw new Error(`未找到按钮：${label}`);
  return button;
}

function findInput(node: ReactNode, id: string): ReactElement<any> {
  const input = findElements(node, (element) => element.type === "input" && element.props.id === id)[0];
  if (!input) throw new Error(`未找到输入框：${id}`);
  return input;
}

function findSelect(node: ReactNode, id: string): ReactElement<any> {
  const select = findElements(node, (element) => element.type === "select" && element.props.id === id)[0];
  if (!select) throw new Error(`未找到选择框：${id}`);
  return select;
}

function findElement(node: ReactNode, type: string): ReactElement<any> {
  const element = findElements(node, (candidate) => candidate.type === type)[0];
  if (!element) throw new Error(`未找到元素：${type}`);
  return element;
}

function findElements(node: ReactNode, predicate: (element: ReactElement<any>) => boolean): ReactElement<any>[] {
  if (node === null || node === undefined || typeof node === "boolean") return [];
  if (typeof node === "string" || typeof node === "number") return [];
  if (Array.isArray(node)) return node.flatMap((item) => findElements(item, predicate));
  const element = node as ReactElement<any>;
  const renderedChildren = typeof element.type === "function"
    ? (element.type as (props: any) => ReactNode)(element.props)
    : element.props?.children;
  return [
    ...(predicate(element) ? [element] : []),
    ...findElements(renderedChildren, predicate)
  ];
}

function textContent(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join("");
  return textContent((node as ReactElement<{ children?: ReactNode }>).props.children);
}
