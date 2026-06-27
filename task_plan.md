# 任务计划：衣橱分析洞察

## 目标
在理解本地 Outfit 项目和 GitHub 项目 `zironglv/clothy` 后，把 clot​​hy 的衣橱分析洞察能力迁移到本地 Web 应用：在现有 `/api/insights` 和“历史洞察”页面基础上，补全品类、颜色、季节、风格、健康度、身材建议、洞察建议和购物建议。

## 当前阶段
阶段 5

## 各阶段

### 阶段 1：需求与发现
- [x] 确认当前 goal 已存在并处于 active 状态。
- [x] 读取项目 `AGENTS.md`、现有计划文件、`package.json`、README、schema 和核心源码结构。
- [x] 通过 GitHub 元数据确认 `zironglv/clothy` 是 public 仓库，默认分支为 `main`。
- [x] 将 clot​​hy 只读克隆到临时目录 `C:\Users\Vader\AppData\Local\Temp\clothy-source-20260627215557`，不放入本仓库。
- [x] 定位 clot​​hy 衣橱分析洞察核心：`src/core/analyzer.py`、`src/core/recommender.py`、`docs/UPGRADE_PLAN.md`、README/SKILL 描述。
- [x] 启动 3 个只读子 Agent，分别复核 clot​​hy 功能口径、本地后端边界、本地前端边界。
- **状态：** complete

### 阶段 2：设计与测试顺序
- [x] 汇总子 Agent 结论，确认迁移范围。
- [x] 设计扩展后的 `WardrobeInsights` 类型，保持现有字段兼容。
- [x] 规划 TDD 顺序：后端 API 测试、前端 API 测试、HistoryInsightsView 渲染测试。
- [x] 明确不迁移 clot​​hy 的 OpenClaw/多人 Skill 命令路由，只迁移可解释本地分析能力。
- **状态：** complete

### 阶段 3：后端 TDD 实现
- [x] 先写 `/api/insights` 失败测试，覆盖季节分布、风格标签、健康度、洞察建议、购物建议和身材建议。
- [x] 扩展 `src/shared/types.ts` 中的 `WardrobeInsights`。
- [x] 扩展 `server/db.ts#getWardrobeInsights()`，复用现有 garments、wear_logs 和 personalProfile。
- [x] 保持 `/api/insights` 路由和既有字段向后兼容。
- **状态：** complete

### 阶段 4：前端 TDD 实现
- [x] 先写前端 API 或 UI 渲染失败测试，确认新洞察字段被展示。
- [x] 扩展 `HistoryInsightsView`，加入健康度、季节分布、风格倾向、洞察建议、购物建议、身材建议。
- [x] 按现有样式系统补充少量 CSS，保持移动端不溢出。
- **状态：** complete

### 阶段 5：验证与交付
- [x] 运行目标测试。
- [x] 运行 `npm run typecheck`。
- [x] 运行 `npm test`。
- [x] 运行 `npm run build`。
- [x] 更新 `findings.md` 和 `progress.md`，总结结果。
- **状态：** complete

## 关键问题
1. 本地已经有简版 `/api/insights`，迁移应以扩展为主，不另建平行 API。
2. clot​​hy 是 Python Skill，输出以文本报告为主；本地是 Web 应用，应该返回结构化 JSON 并在页面中渲染。
3. 本地颜色、季节、品类使用英文枚举；clothy 规则里的中文类别需要映射到本地枚举。
4. 本轮不删除任何文件；临时克隆目录暂不清理，避免隐式删除电脑文件。

## 已做决策
| 决策 | 理由 |
|------|------|
| 扩展 `/api/insights` 而非新增 API | 本地前端和 API 客户端已经接入该端点 |
| 保持现有 `WardrobeInsights` 字段 | 避免破坏已有测试和页面 |
| 洞察逻辑放在后端 `getWardrobeInsights()` | 数据都在 SQLite，本地分析无需浏览器重复计算 |
| 使用可解释规则而非 AI API | clot​​hy 本身支持无 API 的本地分析，本项目也强调本地优先 |
| 不迁移多人衣橱/OpenClaw 命令路由 | 本地项目当前定位为个人本地 Web 应用 |

## 遇到的错误
| 错误 | 尝试次数 | 解决方案 |
|------|---------|---------|
| 新建 `/goal` 失败，因为已有同名 active goal | 1 | 使用当前 active goal 继续推进 |
| 全仓 `Select-String` 搜索未排除 `logs/output`，扫到本地状态文件 | 1 | 后续搜索明确限定源码/测试/文档路径，避免扫描敏感本地状态目录 |

## 备注
- 优先使用 PowerShell 原生命令，不先使用 `rg`。
- PowerShell 命令显式设置 UTF-8。
- 删除电脑上的文件前必须确保用户知晓。
- 最多同时开启 6 个子 Agent；本轮已开启 3 个只读子 Agent。
