# Outfit “晨间试衣台”实施计划

## 目标

以业务域拆分方式重构整个前端，并按 `2026-07-10-outfit-morning-dressing-table-design.md` 落地新的视觉与交互系统，保持现有后端、API、共享类型、中文业务语义和隐私边界。

## 实施顺序

1. 建立 `shared/labels`、`lib` 和 `components/ui`，让页面共享统一 token 与可访问原语。
2. 建立 `app` 壳层，重做认证、桌面/移动导航、加载与全局反馈。
3. 将五个页面迁入独立 feature 目录，并保留 `src/App.tsx` 兼容导出。
4. 重做今日推荐与衣服库，使真实衣物图成为视觉主角。
5. 重做洞察、导入与设置，按任务频率和渐进披露调整密度。
6. 将 CSS 拆为 tokens/globals/components/responsive，移除 DaisyUI 双重外观控制。
7. 迁移测试：保留行为、语义、API 和隐私断言，替换旧视觉网格断言。
8. 运行类型检查、目标测试、完整测试、生产构建与浏览器视觉 QA。

## 并行边界

- Agent A：只创建 recommendation/insights 业务视图文件，不修改应用壳和全局 CSS。
- Agent B：只创建 wardrobe/thumbnail 业务视图文件，不修改应用壳和全局 CSS。
- Agent C：只创建 import/settings/auth 业务视图文件，不修改应用壳和全局 CSS。
- 主 Agent：共享原语、兼容入口、状态编排、全局样式、测试整合和视觉 QA。

共享文件必须由主 Agent 先建立，子 Agent 才开始写入，避免并发冲突。

## 强制保留契约

- `src/shared/types.ts` 路径与枚举值。
- `src/api.ts` 路径、请求方法、credentials 和 payload。
- 主导航 tab 值与中文标签。
- localStorage 三个键、备份文件名和 PWA `/api` 不缓存策略。
- 图片白名单、本地优先、抠图优先、no-referrer、lazy 和 async decoding。
- 删除确认、视觉建议显式应用、导入预览、穿着记录上下文。

## 验证门槛

- 每次域迁移后运行对应 `tests/app.test.tsx` 子集和 `npm run typecheck`。
- 样式整合后运行完整前端测试和无落盘构建。
- 最终使用隔离的内存数据库或既有无敏感截图夹具进行桌面与移动 QA，不修改用户本地账号或衣橱数据。
