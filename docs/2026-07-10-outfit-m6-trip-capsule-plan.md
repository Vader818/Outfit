# Outfit M6：旅行打包与胶囊覆盖

> 本文件由[原始综合计划](./2026-07-10-github-feature-research-and-development-plan.md)对应里程碑章节机械拆分而来；章节正文未改写。
> 执行时仍须遵守父计划中的全局约束、M0 前置、统一测试/发布策略及许可证与隐私清单。
> 状态：按用户指令停止本轮实施，仅保留为后续独立子计划。

---
## 13. 子项目 M6：旅行打包与胶囊覆盖

**目标：** 用现有衣橱为未来 1–7 天生成逐日搭配和最小衣物集合，并提供可勾选装箱清单。

### MVP 范围

包含：

- 旅行名称、日期、目的地坐标/名称。
- 每日一个或多个活动、场合和正式度。
- 最多 7 天逐日天气。
- 最多鞋履数、最大衣物数、允许重复穿、是否有洗衣机会。
- 每日搭配、总衣物清单、每件覆盖日期、打包状态。
- 非衣物必需品用自由文本 checklist，不扩张 GarmentCategory。

不包含：

- 航班/酒店/第三方行程 API。
- 箱包物理体积与重量精确计算。
- 海关、签证、药品或通用旅行助手。
- 超过 7 天的自动天气优化。

### 数据模型

~~~ts
interface Trip {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  destination: { name: string; latitude?: number; longitude?: number };
  maxGarments: number;
  maxShoes: number;
  repeatPolicy: "allow" | "no-consecutive-core" | "no-repeat-core";
  maxCoreWearsBetweenLaundry: 1 | 2 | 3;
  laundryDay?: string;
  status: "planning" | "ready" | "completed" | "archived";
}

interface TripDay {
  date: string;
  activities: TripActivity[];
  weather?: WeatherSnapshot;
}

interface TripActivity {
  id: number;
  name: string;
  occasion: string;
  formality: Formality;
  requiresSeparateOutfit: boolean;
}

interface TripBeamState {
  coreWearsSinceLaundry: Map<number, number>;
  selectedGarmentIds: Set<number>;
  selectedShoeIds: Set<number>;
}
~~~

同一天多个活动不是隐式合并：`requiresSeparateOutfit=false` 时优化器可用一套同时覆盖相邻活动，并按所有活动上下文取最低适配分；为 true 时必须为该活动选择独立搭配。例如“白天步行 + 正式晚宴”可明确需要两套，普通“通勤 + 晚餐”则可尝试共用。

洗衣机会只影响优化器内存中的 `TripBeamState`，绝不修改 garments 的全局 availability。每使用一次 top/bottom/dress 就增加 `coreWearsSinceLaundry`；超过 `maxCoreWearsBetweenLaundry` 的扩展被剪枝，`laundryDay` 当天开始前把计数清零。repeatPolicy 优先级更高：例如 `no-repeat-core` 不会因为洗衣而允许重复；鞋、外套和配饰首版不计入洗衣次数。只有用户逐日确认实际穿着后，M4/M3 的 wear/availability service 才能改变现实数据。

表：

- trips
- trip_days
- trip_day_activities
- trip_outfit_selections
- trip_packing_items

算法：

1. 对每个需要独立搭配的 activity slot 调用现有推荐引擎生成 Top 12；允许共用的相邻活动同时进入一个 context。
2. 用 beam search 按日期和 activity slot 选择，beam width=100。
3. 每次扩展先做硬可行性剪枝，任何一项不满足都不进入 beam：

   - 只使用 active、confirmed、available 且未 excluded 的衣物；
   - 全程唯一衣物数 `<= maxGarments`，唯一鞋履数 `<= maxShoes`；
   - 满足 repeatPolicy；core 指 top/bottom/dress，鞋、外套和配饰允许跨日复用；
   - 每个 activity slot 的必需槽位完整，并满足天气/场合硬阈值；
   - laundryDay 只重置 beam state 中的 coreWearsSinceLaundry，不修改全局 availability，也不把计划视为已执行。

4. 只在可行解之间使用目标函数排序：

~~~text
总推荐分
- 3 × 新增唯一衣物数
+ 4 × 一件衣物覆盖不同场合
- 2 × 同日需要更换的额外核心件数
~~~

5. 每一步仍受 M0 的候选预算限制。
6. 如果没有可行解，返回 `status=infeasible`、冲突约束（如 maxGarments/maxShoes/repeatPolicy）和最小放宽建议；绝不靠罚分输出违反硬限制的“最佳”结果。
7. 输出不是黑盒最优声明，而是“在给定硬约束下，高覆盖、较少件数”的可解释方案。

### 文件结构

创建：

- server/services/tripPlanner.ts
- server/services/tripOptimizer.ts
- server/routes/trips.ts
- src/features/planner/TripPlannerView.tsx
- src/features/planner/PackingChecklist.tsx
- tests/tripPlanner.test.ts

修改：

- server/db.ts、server/services/recommend.ts、server/services/weather.ts
- src/shared/types.ts、src/api.ts、src/app/App.tsx
- src/features/insights/HistoryInsightsView.tsx
- tests/api.test.ts、tests/app.test.tsx、tests/recommendation.test.ts

### 实施任务

- [ ] 写 trip/date/activity/约束校验和迁移测试；结束日期早于开始日期、超过 7 天和负上限必须被拒绝。
- [ ] 实现 Trip CRUD、Day/Activity 编辑和 7 天天气快照。
- [ ] 把推荐引擎暴露为可复用 generateCandidates(context, constraints, budget)，不复制另一套搭配规则。
- [ ] 写优化器纯函数测试：天气/场合适配、maxShoes、maxGarments、三种 repeatPolicy、每次洗衣前核心单品可穿次数、洗衣日重置、同日一套/多套和不可行结果；断言规划前后全局 garment availability 完全不变。
- [ ] 实现 beam search 与 explainOptimization()；输出每件衣物覆盖日期和被选择原因。
- [ ] 在“计划与洞察”二级区域增加旅行入口，不增加主导航项。
- [ ] 生成逐日搭配后允许用户锁定/替换某日单品，再局部重算后续日。
- [ ] PackingChecklist 支持“已打包/穿在身上/不带”，状态保存在本地数据库。
- [ ] 旅行完成后可把实际穿着批量写入 wear events；必须逐日确认，不自动假设计划已执行。
- [ ] 扩展 OutfitExportV2，加入 trips、activities、selections 与 packing states；图片仍只由 M1 的显式 ZIP 备份携带。
- [ ] 更新文档并完成全量验证。

### 验收标准

- 1–7 天旅行可生成逐日搭配和去重后的衣物清单。
- 算法把最大鞋数、最大衣物数、不可用状态、重复规则和独立活动搭配当作硬约束；无解时返回冲突而不是违规方案。
- 同一天多个活动能明确共用或分别选择搭配，“健身 + 正式晚宴”等冲突场景测试通过。
- 洗衣日只改变方案搜索中的模拟计数；取消或保存旅行计划都不会把现实衣物擅自设为干净/待洗。
- 用户能看到每件衣物服务哪些日期/活动，并可手工替换。
- 旅行计划和衣物图片不发送给第三方；只有用户明确启用天气时发送坐标。

---
