# Outfit M4：穿搭日记与周计划

> 本文件由[原始综合计划](./2026-07-10-github-feature-research-and-development-plan.md)对应里程碑章节机械拆分而来；章节正文未改写。
> 执行时仍须遵守父计划中的全局约束、M0 前置、统一测试/发布策略及许可证与隐私清单。
> 状态：按用户指令停止本轮实施，仅保留为后续独立子计划。

---
## 11. 子项目 M4：穿搭日记与周计划

**目标：** 让用户能计划未来搭配、记录实际穿着、纠错历史，并将场合和天气用于更合理的重复提醒。

### 数据模型

~~~ts
type JsonValue = null | boolean | number | string | JsonValue[] | {
  [key: string]: JsonValue;
};

interface WearEvent {
  id: number;
  wornAt: string; // UTC ISO timestamp
  timeZone: string; // 记录时的 IANA 时区
  outfitId?: number;
  occasion: string;
  weatherSnapshot?: WeatherSnapshot;
  notes?: string;
  items: WearEventItem[];
  legacySnapshot?: {
    originalGarmentIds: number[];
    originalContext: JsonValue;
  };
}

interface OutfitPlanEntry {
  id: number;
  plannedDate: string; // 用户时区下的 YYYY-MM-DD 日历键，不是时间戳
  timeZone: string; // IANA 时区
  outfitId: number;
  occasion: string;
  weatherSnapshot?: WeatherSnapshot;
  status: "planned" | "worn" | "skipped";
  wornAt?: string;
  notes?: string;
}
~~~

日期语义必须分离：`planned_date` 保存本地日历键 `YYYY-MM-DD`，不会因 UTC 转换移动到前一天；`worn_at` 保存 UTC ISO timestamp，另存事件发生时的 IANA `time_zone` 用于还原显示。API 拒绝带时间部分的 plannedDate，并对非法/未知时区返回结构化错误。

表：

- wear_events
- wear_event_items
- outfit_plan_entries

API：

- GET/POST /api/wear-events
- PUT/DELETE /api/wear-events/:id
- GET/POST /api/outfit-plans
- PUT/DELETE /api/outfit-plans/:id
- POST /api/outfit-plans/:id/mark-worn
- GET /api/weather/forecast?days=1..7

### 文件结构

创建：

- server/services/wearEvents.ts
- server/services/outfitPlanner.ts
- server/routes/planner.ts
- src/features/planner/PlannerView.tsx
- src/features/planner/WeekGrid.tsx
- src/features/planner/WearEventDialog.tsx
- tests/planner.test.ts

修改：

- server/db.ts、server/services/weather.ts、server/services/recommend.ts
- src/shared/types.ts、src/api.ts、src/app/App.tsx
- src/features/insights/HistoryInsightsView.tsx
- tests/api.test.ts、tests/app.test.tsx、tests/weather.test.ts

### 实施任务

- [ ] 写旧 wear_logs 迁移测试：每条旧日志变成 wear_event + item 行；原始 garment_ids/context 写入 legacy_snapshot，缺失衣物 ID 仍保留但不创建无效外键；fixture 覆盖 object、array、string、number、boolean 和 null context。
- [ ] 实现日期范围/游标查询，默认当前周；为 worn_at、planned_date 和 item_id 建索引。
- [ ] 写 WearEvent CRUD 测试：补录过去日期、修改衣物、撤销误记、删除后计数回滚。
- [ ] 实现 outfit plan CRUD 和 mark-worn 原子操作；计划日期与实际时间分别保存。
- [ ] 把“历史洞察”主区域改为二级导航：周计划、穿着日记、保存搭配、洞察；移动主导航仍保持五项。
- [ ] 实现 7 天周视图、上/下周、今日定位、计划卡、已穿状态和空态。
- [ ] 推荐结果增加“安排日期”，保存时冻结天气/场合快照。
- [ ] 扩展天气服务返回逐日快照；超出 7 天的计划只保存场合，临近后再更新天气。
- [ ] 实现场合化重复提醒：正式类同套 28 天、约会/晚餐类 14 天、日常不拦截；只提醒并提供换一件，不禁止。
- [ ] 更新洞察口径，把“近期未穿”和“从未穿过”分开，并统一按 active garments 计算分布。
- [ ] 扩展 OutfitExportV2，加入 wear events、legacy snapshots 与 plan entries；固定跨时区 fixture 验证往返 JSON 不改变 plannedDate。
- [ ] 更新文档并完成全量验证。

### 验收标准

- 用户可补录、编辑、删除和撤销穿着记录，统计立即一致。
- 可把保存搭配安排到未来 7 天，并区分计划与实际穿着。
- 同一正式搭配 28 天内再次计划时收到可忽略提示；日常重复不提示。
- plannedDate 在数据库保存 `YYYY-MM-DD` 本地日历键，wornAt 保存 UTC ISO timestamp 并带 IANA 时区；UTC+8、UTC-8、跨午夜和夏令时边界测试通过。

---
