# Outfit M4：穿搭日记与周计划

> 恢复说明：本文件正文从 2026-07-11 的本地 Codex 会话存档中按原章节边界恢复，未凭记忆改写。
> 状态（2026-07-13）：M4 已完整交付；十二项实施任务、四项验收标准、文档、全量回归和隔离数据库真实交互验收均已完成。

## 共同执行约束

- 依赖关系：硬依赖 M2。
- 产品继续保持单用户、本地优先；业务数据、衣物图片与反馈默认不离开本机。
- 新写接口继续经过本地 session、Origin/Sec-Fetch-Site、结构化错误与严格输入校验。
- 图片流程必须遵守 SSRF、重定向、私网地址、格式、像素与字节限制。
- 采用 TDD，并同步更新 `docs/api.md`、`docs/schema.md`；完成时运行 `npm run typecheck`、`npm test`、`npm run build`。
- 删除任何电脑文件前，必须先展示目标和影响并取得用户明确确认。

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
  wearEventId?: number;
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
- GET /api/weather/forecast?latitude=...&longitude=...&days=1..7

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

- [x] 写旧 wear_logs 迁移测试：每条旧日志变成 wear_event + item 行；原始 garment_ids/context 写入 legacy_snapshot，缺失衣物 ID 仍保留但不创建无效外键；fixture 覆盖 object、array、string、number、boolean 和 null context。
- [x] 实现日期范围/游标查询，默认当前周；为 worn_at、planned_date 和 item_id 建索引。
- [x] 写 WearEvent CRUD 测试：补录过去日期、修改衣物、撤销误记、删除后计数回滚。
- [x] 实现 outfit plan CRUD 和 mark-worn 原子操作；计划日期与实际时间分别保存。
- [x] 把“历史洞察”主区域改为二级导航：周计划、穿着日记、保存搭配、洞察；移动主导航仍保持五项。
- [x] 实现 7 天周视图、上/下周、今日定位、计划卡、已穿状态和空态。
- [x] 推荐结果增加“安排日期”，保存时冻结天气/场合快照。
- [x] 扩展天气服务返回逐日快照；超出 7 天的计划只保存场合，临近后再更新天气。
- [x] 实现场合化重复提醒：正式类同套 28 天、约会/晚餐类 14 天、日常不拦截；只提醒并提供换一件，不禁止。
- [x] 更新洞察口径，把“近期未穿”和“从未穿过”分开，并统一按 active garments 计算分布。
- [x] 扩展 OutfitExportV2，加入 wear events、legacy snapshots 与 plan entries；固定跨时区 fixture 验证往返 JSON 不改变 plannedDate。
- [x] 更新文档并完成全量验证。API、Schema、README 已同步；独立复验与修复后 `typecheck`、Vitest 32 文件 464/464、Python unittest 25/25、pytest 33/33、npm/Python 依赖审计、`git diff --check` 与非破坏性生产构建全部通过。

### 验收标准

- 用户可补录、编辑、删除和撤销穿着记录，统计立即一致。
- 可把保存搭配安排到未来 7 天，并区分计划与实际穿着。
- 同一正式搭配 28 天内再次计划时收到可忽略提示；日常重复不提示。
- plannedDate 在数据库保存 `YYYY-MM-DD` 本地日历键，wornAt 保存 UTC ISO timestamp 并带 IANA 时区；UTC+8、UTC-8、跨午夜和夏令时边界测试通过。

### 最终验收记录（2026-07-13）

- 隔离数据库真实交互完成周计划创建/编辑、天气冻结、28 天正式搭配提醒、计划与实际穿着差异、日记编辑/显式清空/撤销、统计回滚、保存搭配安排入口及洞察口径验证。
- 390×844 移动端页面无整体横向溢出，周网格仅在自身容器横向滚动，五项移动主导航保持不变；浏览器控制台无 warn/error。
- QA 数据库、日志和两个生产构建证据目录均保留在系统临时目录；未删除任何电脑文件，真实数据库未原地迁移或写入。
- 2026-07-13 独立复验补齐关联计划实际时间同步、午夜 DST/日期线边界、legacy 天气与 wear-log 严格校验、日记分页、切周天气补写、历史计划编辑、跳过/恢复和 worn→日记编辑；隔离浏览器再次验证桌面/390×844 交互，控制台无警告或错误。

---
