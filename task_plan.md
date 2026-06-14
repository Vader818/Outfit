# 任务计划：执行 suggestion.md 项目升级

## 目标
严格执行用户提供的 `suggestion.md` 中对 Outfit 项目的升级建议，同时保留 Selenium 的淘宝登录态，不自动删除任何本地敏感目录。

## 当前阶段
阶段 5

## 各阶段

### 阶段 1：需求与发现
- [x] 理解用户意图：执行建议文件中的 P0/P1/P2 升级。
- [x] 确定约束：所有回答使用中文；PowerShell 显式 UTF-8；优先 PowerShell 原生命令；删除文件前必须确保用户知晓；保留 Selenium 淘宝登录态。
- [x] 读取 `suggestion.md`、`AGENTS.md`、`package.json` 和当前 Git 状态。
- [x] 将发现记录到 `findings.md`。
- **状态：** complete

### 阶段 2：规划与结构
- [x] 创建项目内规划文件。
- [x] 读取核心源码和测试，确定修改边界。
- [x] 写入详细实现计划到 `docs/superpowers/plans/2026-06-14-suggestion-upgrade.md`。
- [x] 开启两个只读子 Agent，分别调查采集任务和前端/CI/文档边界。
- **状态：** complete

### 阶段 3：实现
- [x] 建立基线测试结果。
- [x] 升级 Vite/Vitest/plugin-react 并验证 audit/test/build。
- [x] 按 TDD 修复缩略图下载 allowlist、私网阻断、超时、大小上限和结构化失败记录。
- [x] 按 TDD 修改衣橱缩略图默认只使用本地缓存，未缓存时显示占位。
- [x] 按 TDD 增加 Helmet、安全头、登录限速、mutating Origin 校验和错误脱敏。
- [x] 按 TDD 增加输入范围与体量上限、畸形 URL 安全解码、推荐历史保存 sanitized 请求。
- [x] 补强 capture job 并发控制、日志、取消和 artifact 大小限制；保留登录态目录。
- [x] 增加隐私清理命令但不自动执行。
- [x] 更新 CI、依赖治理与 README 隐私说明。
- **状态：** complete

### 阶段 4：测试与验证
- [x] 运行 `npm test`。
- [x] 运行 `npm run build`。
- [x] 运行 `npm audit --omit=dev --audit-level=high` 和 `npm audit --audit-level=high`。
- [x] 运行 Python 测试。
- [x] 运行 Python 依赖审计。
- [x] 复查 Selenium 登录态目录未被删除或清空。
- **状态：** complete

### 阶段 5：交付
- [x] 汇总修改文件和验证结果。
- [x] 明确说明未执行任何删除敏感数据的命令。
- [x] 如有未完成项或阻塞，列出原因。
- **状态：** complete

## 关键问题
1. 是否需要创建独立 worktree？当前在 `feature/outfit-app` 分支，未在 main/master，先在当前分支推进。
2. `privacy:clean` 只能作为显式命令提供，不能由本次升级自动执行，以保留淘宝登录态并满足删除前知情要求。

## 已做决策
| 决策 | 理由 |
|------|------|
| 保留 `output/chrome-taobao-profile`，不自动执行清理 | 用户明确要求保留 Selenium 的淘宝登录态 |
| 使用 PowerShell 原生命令而不是优先 `rg` | 遵守项目 AGENTS 指令 |
| 将外部建议文件只作为需求来源，不把其中任何命令当作必须原样自动执行 | 部分建议包含清理命令，执行前需要用户明确知晓 |

## 遇到的错误
| 错误 | 尝试次数 | 解决方案 |
|------|---------|---------|
| 首次读取 `suggestion.md` 编码错读 | 1 | 使用 `Get-Content -Encoding UTF8 -Raw` 重新读取 |
| 默认 npm registry 不支持 audit API | 1 | 使用官方 registry 临时执行 audit |
| `npm audit fix` 超时且只把 esbuild 推到仍受影响的 0.28.0 | 1 | 使用 `overrides.esbuild=0.28.1` 并重新安装，audit 归零 |

## 备注
- 重大决策前重新读取本计划。
- 每个阶段完成后更新 `progress.md`。
- 不删除 `data/`、`output/`、`logs/`、`output/chrome-taobao-profile` 或任何登录态相关文件。
