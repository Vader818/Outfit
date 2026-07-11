# Outfit GitHub 高价值功能研究与开发计划

> **供后续实现 Agent 使用：** 实施任一子项目时，必须先使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans，把本章拆成逐测试、逐提交的执行计划。不要把本文所有子项目放进同一分支一次完成。

**目标：** 在不破坏 Outfit 单用户、本地优先、隐私敏感边界的前提下，把 GitHub 同类项目中已被源码证实的高价值能力，转化为一条可分阶段交付、可独立验收的开发路线。

**架构：** 保留 React + Express + SQLite 与现有确定性推荐引擎。先补版本化迁移、稳定推荐身份和可信衣物数据，再依次增加已保存搭配、反馈、日历、决策支持与旅行规划；云端 AI、社交和多用户不进入本路线。

**技术栈：** React 18、TypeScript、Vite 8、Express 5、Node 24 内置 SQLite、Vitest、现有 Selenium/Playwright 采集、本地 rembg 与 Transformers.js/CLIP。

## M1–M6 拆分子计划

根据 2026-07-11 的收尾指令，M1–M6 已分别拆成独立文件；本综合计划保留完整原文，不删除或截短：

- [M1：可信建档与导入暂存区](./2026-07-10-outfit-m1-trusted-ingestion-plan.md)
- [M2：保存搭配、指定核心单品与换一件](./2026-07-10-outfit-m2-saved-outfits-plan.md)
- [M3：推荐反馈与衣物可用状态](./2026-07-10-outfit-m3-feedback-availability-plan.md)
- [M4：穿搭日记与周计划](./2026-07-10-outfit-m4-diary-week-plan.md)
- [M5：成本/次、重复购买与购买前检查](./2026-07-10-outfit-m5-decision-support-plan.md)
- [M6：旅行打包与胶囊覆盖](./2026-07-10-outfit-m6-trip-capsule-plan.md)

## 全局约束

- 产品继续是个人本地应用；业务数据、衣物图片和推荐反馈默认不离开本机。
- API 继续只监听 127.0.0.1；不新增云端账号、SaaS、多租户或公开分享能力。
- 新功能必须兼容现有淘宝采集、衣橱、推荐、穿着记录、洞察和 JSON 导出。
- 新写接口继续经过本地 session、Origin/Sec-Fetch-Site 校验、结构化错误和严格输入校验。
- 外部图片不得绕过现有 SSRF、重定向、私网地址、格式、尺寸和大小限制。
- 任何电脑文件的删除都必须先向用户展示目标和影响并取得明确确认；默认流程不自动删除旧图片、采集物或登录态。
- AGPL 或无许可证仓库只借鉴产品思路与公开接口形态，代码必须独立重写。
- 每个子项目必须采用 TDD，更新 docs/api.md、docs/schema.md，并通过 npm run typecheck、npm test、npm run build。

---

## 1. 执行摘要

Outfit 已经拥有同类项目中较难的部分：淘宝订单/详情采集、去重与分类、受控缩略图、本地视觉模型、天气与场合驱动的可解释推荐、穿着记录、衣橱健康度和购物建议。它现在最缺的不是“再接一个更大的 AI”，而是能让现有能力长期积累价值的产品记忆层。

最值得优先增加的能力是：

1. **可信建档与整理**：手动/本地照片建档、数据库感知的导入暂存区、逐项修正和批量整理。
2. **保存搭配与换一件**：把一次性推荐变成可命名、可编辑、可复用的搭配实体，并让替代单品真正可操作。
3. **推荐反馈与可用状态**：记录喜欢/不喜欢/实际穿着/评分，同时过滤待洗、维修、借出等不可用衣物。
4. **穿搭日记与周计划**：区分计划日期与实际穿着时间，支持补录、纠错、改期、周视图和场合化重复提醒。
5. **成本/次、重复购买与购买前检查**：利用已有淘宝金额、穿着记录和本地视觉信息，形成理性购物闭环。
6. **旅行打包与胶囊覆盖**：在上述数据稳定后，用逐日天气/活动覆盖优化最小衣物集合。

推荐先交付 M0–M2。P50 约需 **29–43 个开发日**，按 30% 集成与返工缓冲计算的 P80 预算为 **38–57 个开发日**，能形成第一个可独立使用的产品闭环：

> 多来源建档 → 保存/修改搭配 → 再次打开并复用

M3 才补上“真实选择 → 结构化反馈 → 改善下一次推荐”的学习闭环，M4–M6 再扩展为日历、洞察和旅行规划。全部路线 P50 粗估 **76–119 个开发日**，按各里程碑分别取整后的 P80 预算为 **100–158 个开发日**。口径为一名熟悉本项目的全栈开发者，包含测试和文档；P80 是风险预算而不是交付承诺，不含产品验收等待。

---

## 2. 对当前项目的理解

### 2.1 产品与用户

Outfit 是一个面向单个中文用户的本地穿搭决策工具。真实主链路是：

~~~text
淘宝订单/详情/书签脚本
  → 导入预览、过滤、去重与自动分类
  → 衣橱确认、编辑、图片与本地视觉处理
  → 天气 + 场合 + 画像 + 最近穿着
  → 最多三套可解释搭配
  → 标记已穿
  → 利用率、健康度、分布与购物建议
~~~

代码证据：

- 产品定位与隐私边界：[README.md](../README.md)
- 五个主视图和端到端编排：[src/app/App.tsx](../src/app/App.tsx)
- 共享实体：[src/shared/types.ts](../src/shared/types.ts)
- API 表面：[server/routes.ts](../server/routes.ts)
- 推荐评分：[server/services/recommend.ts](../server/services/recommend.ts)
- 持久化与洞察：[server/db.ts](../server/db.ts)

### 2.2 已有、部分已有和缺失能力

| 领域 | 状态 | 关键事实 |
|---|---|---|
| 淘宝采集与导入 | 已有 | 订单/详情、Selenium/Playwright、书签脚本、预览、过滤、去重、详情合并均已落地 |
| 衣橱管理 | 部分已有 | 列表、筛选、编辑、批量确认、图片与视觉工具已有；无手动新增、上传本地图和软归档 |
| 推荐 | 已有 | 天气、季节、场合、颜色、搭配兼容、近期穿着、偏好、体型与肤色均进入可解释评分 |
| 推荐记忆 | 缺失 | 推荐 run 可读取，但候选没有稳定身份；无收藏、换件、喜欢/不喜欢或学习闭环 |
| 穿着历史 | 部分已有 | 可新增和读取；无编辑、删除、补录日期、单次详情或日历 |
| 洞察 | 已有但浅 | 健康度、分布、常穿/未穿和建议已有；无趋势、成本/次、昂贵错误和动作闭环 |
| 视觉 | 部分已有 | rembg、CLIP 建议、主图选择已有；相似检索、主色提取和独立图片建档缺失 |
| PWA | 部分已有 | 可安装静态壳，不是离线业务应用；API 不可用时不能浏览衣橱 |
| 备份 | 部分已有 | 有敏感 JSON 导出，无恢复、版本验证和选择性恢复 |
| 多用户/云同步 | 明确非目标 | 唯一账号只是本地门禁，业务表没有 user_id |

### 2.3 在新增功能前必须修正的可信度问题

这些不是 GitHub “新功能”，但会直接污染后续反馈、日历和洞察，应作为 M0 发布门槛：

- 默认位置和画像是具体的北京坐标及个人身体数据，不存在真正“未设置”状态。
- UI 表示“确认后进入日常衣橱”，但推荐实际允许未确认衣物参与。
- 常规采集读取使用 wardrobeOnly=true，退款项在进入数据库前被丢弃，已有衣物的退款同步可能不触发。
- 推荐候选是无上限的组合枚举；衣橱扩大、多日规划或指定单品后会放大 CPU/内存风险。
- README 宣称默认不直连远程商品图，但当前实现允许可信淘宝 CDN 直显。
- privacy-clean 未覆盖包含登录态的 Playwright profile。
- schema 迁移只有 CREATE TABLE/ensureColumn，没有 schema version 或迁移记录。
- 推荐结果使用临时 outfit-1…3，穿着日志无法稳定关联到具体推荐候选。

---

## 3. GitHub 调研方法与候选池

### 3.1 方法

查询日期为 **2026-07-10**。检索覆盖：

- digital wardrobe / virtual closet / self-hosted wardrobe
- outfit recommendation / fashion compatibility
- wear calendar / outfit calendar / week planning
- capsule wardrobe / travel packing planner
- wardrobe analytics / cost per wear
- garment tagging / segmentation / local-first wardrobe

筛选时不把 star 数等同于价值。每个核心候选至少核验仓库元数据、许可证、实际源码或规则文件；README 与源码不一致时以源码为准。

### 3.2 候选池

| 仓库 | Stars | 最近 push | 许可证 | 结论 |
|---|---:|---|---|---|
| [Anyesh/wardrowbe](https://github.com/Anyesh/wardrowbe) | 433 | 2026-07-07 | MIT | 综合价值最高；照片建档、保存搭配、反馈学习、洗护、日历均有真实模型/服务 |
| [Lazztech/Libre-Closet](https://github.com/Lazztech/Libre-Closet) | 282 | 2026-06-29 | AGPL-3.0 | 与 Outfit 形态最接近；手工建档、具名搭配、周计划、软归档、PWA |
| [mvasil/fashion-compatibility](https://github.com/mvasil/fashion-compatibility) | 167 | 2025-12-30 | BSD-3-Clause | 类型感知兼容度研究有价值；工程与模型过旧，只作远期重排实验 |
| [athelia/unfold-wardrobe-manager](https://github.com/athelia/unfold-wardrobe-manager) | 18 | 2022-12-08 | 未声明 | 天气、事件、穿着统计思路可参考；依赖和维护状态过旧 |
| [wardrobe-hq/wardrobe](https://github.com/wardrobe-hq/wardrobe) | 16 | 2026-06-07 | AGPL-3.0 | 可配置标签、身体槽位和温度/日期规则值得参考 |
| [Arterning/next-wardrobe](https://github.com/Arterning/next-wardrobe) | 7 | 2025-07-24 | 未声明 | 上传、抠图、换装；云端依赖和许可不适合 |
| [googlarz/fashion-skill](https://github.com/googlarz/fashion-skill) | 5 | 2026-05-18 | [CC BY 4.0](https://github.com/googlarz/fashion-skill/blob/main/LICENSE) | 购买前检查、场合化重复检测、周计划和反馈规则密度高；README 的 MIT 文案与 LICENSE 冲突，以 LICENSE 为准 |
| [hongfetti/in-my-closet](https://github.com/hongfetti/in-my-closet) | 4 | 2025-03-20 | MIT | 搭配画板有参考价值；Cloudinary/MongoDB 增加云依赖 |
| [longliuyu2022/AI-wardrobe](https://github.com/longliuyu2022/AI-wardrobe) | 4 | 2026-06-04 | Apache-2.0 | 全身照分割多件衣物；依赖外部 AI，暂不采用 |
| [ndenicolais/Shox](https://github.com/ndenicolais/Shox) | 3 | 2026-01-02 | MIT | 鞋履细分、图表和导出；范围过窄 |
| [zironglv/clothy](https://github.com/zironglv/clothy) | 3 | 2026-03-25 | MIT | 洞察/购物建议已在 Outfit 先前版本中借鉴 |
| [TechLabs-Berlin/wt21-fash-un-capsule-wardrobe](https://github.com/TechLabs-Berlin/wt21-fash-un-capsule-wardrobe) | 2 | 2022-02-06 | 未声明 | 主要为 UX/Notebook，缺少可复用产品实现 |
| [iosifidis/outfit-buddy](https://github.com/iosifidis/outfit-buddy) | 1 | 2026-04-30 | MIT | README 声称日历/天气，源码实际使用 mockContext |
| [chenweidu666/WEB-Smart-Wardrobe-System](https://github.com/chenweidu666/WEB-Smart-Wardrobe-System) | 1 | 2026-03-23 | 未声明 | React/Express/SQLite 栈相近，但主要是 CRUD/价格统计 |
| [LadaChernenko/wardrobe-analytics](https://github.com/LadaChernenko/wardrobe-analytics) | 0 | 2026-06-06 | 未声明 | 成本/次和昂贵错误很有价值；只能独立重写 |
| [carolinapowers/aipackr](https://github.com/carolinapowers/aipackr) | 0 | 2025-07-13 | MIT | 旅行领域模型和算法雏形可用；产品未完成、部分评分是常量 |
| [tupperd/throwing-fits](https://github.com/tupperd/throwing-fits) | 0 | 2026-07-02 | 未声明 | local-first 方向接近，但认证不安全，不作实现来源 |

---

## 4. 最有价值的项目与可借鉴内容

### 4.1 Anyesh/wardrowbe：反馈学习与衣物生命周期

源码证据：

- [衣物模型](https://github.com/Anyesh/wardrowbe/blob/main/backend/app/models/item.py)：pHash、多图、购买价格、收藏、软归档、穿着/建议/接受次数、洗护状态。
- [学习模型](https://github.com/Anyesh/wardrowbe/blob/main/backend/app/models/learning.py)：颜色/风格/场合/天气/时间偏好、搭配对分数和 outfit performance。
- [推荐服务](https://github.com/Anyesh/wardrowbe/blob/main/backend/app/services/recommendation_service.py)：待洗/归档/拒绝硬过滤，近期组合、场合、天气、时段和 pair score。
- [历史反馈卡](https://github.com/Anyesh/wardrowbe/blob/main/frontend/components/outfit-history-card.tsx)：接受、拒绝、评分、评论、实际没穿及改穿衣物。

适合 Outfit：

- 稳定 recommendation candidate 身份。
- 喜欢/不喜欢/实际穿着/评分的结构化反馈。
- 搭配对分数作为确定性推荐的有限加权。
- available/laundry/repair/loaned/packed 可用状态。
- pHash/视觉相似度用于重复单品预警。

不照搬：

- PostgreSQL、Redis、后台 Worker 和家庭多用户。
- 具体 0.4/0.4/0.2 权重和 0.995 衰减；这些需用 Outfit 数据校准。
- 默认外部 AI、邮件和通知；本地应用中必须显式可选。

### 4.2 Lazztech/Libre-Closet：手工建档、具名搭配与日历

源码证据：

- [衣物服务](https://github.com/Lazztech/Libre-Closet/blob/main/src/wardrobe/garment.service.ts)：照片上传、克隆、归档、尺寸规范化和动态筛选。
- [搭配服务](https://github.com/Lazztech/Libre-Closet/blob/main/src/wardrobe/outfit.service.ts)：具名搭配 CRUD、有序类别 slot、前一件/后一件换装。
- [搭配实体](https://github.com/Lazztech/Libre-Closet/blob/main/src/dal/entity/outfit.entity.ts)：slots 与衣物关联。
- [日历服务](https://github.com/Lazztech/Libre-Closet/blob/main/src/wardrobe/calendar.service.ts)：周视图、添加/删除、计划穿着、已穿切换。
- [日历实体](https://github.com/Lazztech/Libre-Closet/blob/main/src/dal/entity/outfit-calendar.entity.ts)：计划 date 与实际 wornAt 分离。

适合 Outfit：

- 非淘宝衣物的本地照片建档。
- 保存推荐或手工组合为具名 outfit。
- 以 slot 表达上装、下装、外套、鞋与配饰，支持“换一件”。
- planned date 与 actual worn time 分离的周计划。
- 归档替代物理删除。

许可证边界：

Libre-Closet 是 AGPL-3.0。本文只采用领域思路，Outfit 必须独立设计和重写；不得复制服务、实体或前端源码，除非项目明确接受 AGPL 义务。

### 4.3 googlarz/fashion-skill：场合化规则与购买前检查

源码证据：

- [日历规则](https://github.com/googlarz/fashion-skill/blob/main/references/calendar.md)
- [反馈、重复检测和月度审计](https://github.com/googlarz/fashion-skill/blob/main/references/feedback.md)
- [视觉搭配构建器](https://github.com/googlarz/fashion-skill/blob/main/references/outfit-builder.md)

适合 Outfit：

- 正式场合 4 周、约会/晚餐 2 周、日常不警告的上下文重复规则。
- “换一件”与“整套变化”两种自然修正路径。
- 90 天未穿、半年低轮换、换季检查的月度审计。
- 商品详情候选进入衣橱前的重复度、可搭配性和缺口判断。

不采用：

- 新品监控和购物 inbox；它增加外站抓取与消费诱导，和 Outfit 的理性使用现有衣橱目标冲突。
- 文本 Skill 的文件存储或 Agent 指令结构；Outfit 需要 SQLite/API/Web UI 的独立实现。

许可证边界：

仓库 LICENSE 是 CC BY 4.0，README 中的 MIT 说明与之冲突，应以 LICENSE 为准。若采用其 28/14 天等具体规则或改编文字，需在 `THIRD_PARTY_NOTICES.md` 标注作者、仓库链接、CC BY 4.0 和修改说明；本文已通过上面的源码链接给出归属。

### 4.4 LadaChernenko/wardrobe-analytics：成本与利用率指标

源码证据：

- [穿着记录与 cost/use](https://github.com/LadaChernenko/wardrobe-analytics/blob/dev/src/api/wear_log_router.py)
- [分析接口](https://github.com/LadaChernenko/wardrobe-analytics/blob/dev/src/api/analytics_router.py)

适合 Outfit：

- 成本/次。
- 最佳价值单品。
- 价格高、购入时间长、穿着少的“昂贵但低利用”提示。
- 平均/中位成本与品类/季节/风格交叉分析。

许可证边界：

仓库无许可证，且其分割模型存在非商业限制提示。仅重写指标定义，不复制代码、模型或权重。

### 4.5 carolinapowers/aipackr：旅行打包领域模型

源码证据：

- [旅行与打包类型](https://github.com/carolinapowers/aipackr/blob/main/packages/types/src/index.ts)
- [逐日搭配生成](https://github.com/carolinapowers/aipackr/blob/main/packages/core-engine/src/algorithms/outfit-generator.ts)
- [装箱优化](https://github.com/carolinapowers/aipackr/blob/main/packages/core-engine/src/algorithms/packing-optimizer.ts)

适合 Outfit：

- Trip → Destination → Day → Activity → DailyOutfit → PackingList 的领域层次。
- 用“覆盖多天/多场合的通用度”减少总衣物数。
- 雨、UV、正式活动等条件触发配饰或鞋履要求。

局限：

- weatherMatch/activityMatch 当前是常量。
- maxWeight/maxItems 没有完整参与优化。
- 去重规则过粗。
- README 明确产品仍处工程骨架阶段。

因此它只进入 P2；算法应基于 Outfit 现有评分重写。

### 4.6 补充参考

- [wardrobe-hq/wardrobe](https://github.com/wardrobe-hq/wardrobe)：可配置标签类别、身体槽位和温度/日期区间透明规则；AGPL，仅借鉴交互。
- [mvasil/fashion-compatibility](https://github.com/mvasil/fashion-compatibility)：类型感知视觉兼容空间；BSD-3-Clause，但旧 PyTorch/Polyvore 模型不进入近期产品。

---

## 5. 功能价值评分

权重：用户价值 30%、产品契合 20%、现有数据就绪度 15%、工程可行性 15%、隐私适配 10%、外部证据成熟度 10%。各维度按 1–5 分，换算公式为 `Σ(维度分 ÷ 5 × 权重)`。这些分数是用于排序的当前假设，每个里程碑立项时需用真实使用数据复核。

| 功能 | 用户价值 | 产品契合 | 数据就绪 | 工程可行 | 隐私适配 | 外部证据 | 总分 | 优先级 |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| 保存搭配 + 换一件 + 指定核心单品 | 5 | 5 | 5 | 4 | 5 | 5 | 97 | P0 |
| 手工/照片建档 + 可编辑导入暂存区 | 5 | 5 | 4 | 5 | 5 | 4 | 95 | P0 |
| 推荐反馈与轻量学习 | 5 | 5 | 4 | 4 | 5 | 5 | 94 | P0 |
| 穿搭日记 + 周计划 | 5 | 5 | 4 | 3 | 5 | 5 | 91 | P1 |
| 成本/次 + 重复购买 + 购买前检查 | 5 | 4 | 3 | 4 | 4 | 4 | 83 | P1 |
| 可用/待洗/维修/借出状态 | 4 | 5 | 3 | 4 | 4 | 4 | 81 | P1 |
| 旅行打包 + 胶囊覆盖 | 4 | 4 | 2 | 2 | 5 | 2 | 66 | P2 |
| 视觉兼容度深度模型 | 3 | 2 | 2 | 1 | 3 | 2 | 45 | 暂缓 |

依赖关系如下。实线表示技术硬依赖，虚线只表示建议的发布/验证顺序：

~~~mermaid
flowchart LR
  M0["M0 可信基础"] --> M1["M1 可信建档"]
  M0 --> M2["M2 保存搭配"]
  M2 --> M3["M3 反馈与可用状态"]
  M2 --> M4["M4 日记与周计划"]
  M1 --> M5["M5 决策支持"]
  M4 --> M5
  M2 --> M6["M6 旅行与胶囊"]
  M3 --> M6["M6 旅行与胶囊"]
  M4 --> M6
  M5 -. "先验证覆盖指标" .-> M6
~~~

M2 不硬依赖 M1：已有淘宝衣物足以实现保存搭配；但二者合并发布能避免“能保存搭配却仍不能录入线下衣物”的体验缺口。M5 不是 M6 的技术前置，只建议先验证相似度/覆盖指标，再把相同指标用于旅行优化。

---

## 6. 总体开发路线

| 里程碑 | 可独立交付的结果 | P50 | P80（约 +30%） |
|---|---|---:|---:|
| M0 可信基础 | 迁移版本、导出版本、真实未设置状态、确认语义、全局唯一推荐身份、组合预算、隐私一致性 | 7–10 日 | 9–13 日 |
| M1 可信建档 | 手工/照片衣物、安全资产读取、数据库感知导入暂存区、逐项修正与批量整理 | 10–15 日 | 13–20 日 |
| M2 保存搭配 | 具名搭配、手工构建、保存推荐、指定核心单品、换一件 | 12–18 日 | 16–24 日 |
| M3 反馈与可用状态 | 喜欢/不喜欢/实际穿着/评分、pair bonus、待洗/维修/借出过滤 | 10–15 日 | 13–20 日 |
| M4 日记与周计划 | 穿着 CRUD、计划/实际分离、周视图、天气和场合重复提醒 | 12–18 日 | 16–24 日 |
| M5 决策支持 | 成本/次、最佳价值、低利用高成本、重复候选、购买前检查 | 10–18 日 | 13–24 日 |
| M6 旅行与胶囊 | 逐活动天气/场合、硬约束覆盖优化、最小衣物集合、可勾选打包清单 | 15–25 日 | 20–33 日 |

P50 用于正常排期，P80 用于预算和承诺；图片净化、旧库迁移、真实性能基线或跨时区测试一旦出现未知问题，应消耗 P80 缓冲而不是压缩验收范围。

---

## 7. 子项目 M0：可信基础

**目标：** 让后续反馈、日历和分析建立在全局唯一身份、可迁移 schema、可演进导出、可信位置/画像和有界推荐计算上。

### 文件结构

创建：

- server/db/migrations.ts：Migration 接口、schema_migrations、事务执行与版本查询。
- server/services/recommendationCandidates.ts：全局唯一 candidateId、内容 signature 与候选持久化。
- server/services/export.ts：OutfitExportV2 构建、版本校验和里程碑扩展点。
- tests/dbMigrations.test.ts：旧库、重复启动、失败回滚和版本顺序。
- tests/export.test.ts：V1 fixture 识别、V2 快照、敏感字段与新增表覆盖。

修改：

- server/db.ts：调用 runMigrations；让 saveRecommendationRun 返回 runId；导出委托给 export service。
- server/services/recommend.ts：分层 beam/Top-K 组合预算、稳定 signature。
- server/routes.ts、server/validation.ts：返回稳定 run/candidate 标识。
- src/shared/types.ts、src/api.ts：RecommendationResult 增加 runId，每个 OutfitRecommendation 增加 candidateId/outfitSignature；新增 OutfitExportV2。
- src/shared/presentation.ts、src/features/settings/SettingsView.tsx：真正未设置的位置/画像。
- src/lib/garments.ts、src/components/garments/GarmentImage.tsx：远程图默认策略。
- scripts/privacy-clean.mjs：把 Playwright profile 纳入独立登录态确认。
- docs/api.md、docs/schema.md、README.md：同步真实行为。

### 核心接口

~~~ts
interface Migration {
  version: number;
  name: string;
  up(db: AppDatabase): void;
}

function runMigrations(db: AppDatabase): void;

interface RecommendationCandidateIdentity {
  runId: number;
  candidateId: string; // crypto.randomUUID() 生成，全局唯一
  outfitSignature: string;
  rank: number;
}
~~~

`candidateId` 是一次候选快照的全局唯一 UUID，不从 rank 或衣物组合推导；`outfitSignature` 才是由有序 slot + garmentId 计算的内容哈希，可跨 run 判断“同一组合”。`recommendation_candidates.candidate_id` 建全局 UNIQUE，`run_id` 外键指向 recommendation_runs。天气、场合、分数和 rank 仍通过 candidate 关联到生成时 run，不能只靠 signature 回溯。

### 迁移与导出基线

- 把当前 `migrate()` 冻结为 legacy baseline 0：只负责让任意历史数据库达到“本计划开始前”的既有 schema，之后不得再向它追加表或列。
- 启动顺序固定为 `legacyBaseline0(db) → ensureSchemaMigrations(db) → runNumberedMigrations(db)`；首次升级时在同一事务中登记 baseline 0，再依版本逐个执行。
- 每个编号迁移独立事务、只能前向修复；校验迁移文件版本唯一、严格递增，生产环境不提供 down migration。
- `OutfitExportV2` 保留 V1 的全部顶层业务数据，并增加 `schemaVersion`、`exportedAt`、`features` 和各里程碑的数据段。旧 V1 fixture 仍能被版本校验器识别；当前路线不假定已经具备恢复导入。
- JSON 导出中的资产只记录 `assetId/storageKey 的可移植别名/mime/byteSize/sha256`，不暴露绝对路径也不内嵌二进制。M1 再提供用户显式选择的 ZIP 完整备份：`outfit-export.json + assets/<assetId>.<ext>`。

各里程碑必须同时扩展 V2 导出和快照测试：

| 里程碑 | 新增导出数据 |
|---|---|
| M0 | migration version、recommendation candidates 与稳定身份 |
| M1 | garment origin/archive/price、asset 元数据；可选 ZIP 携带图片二进制 |
| M2 | saved outfits、items 与派生关系 |
| M3 | feedback、pair stats、当前 availability status 与 events |
| M4 | wear events、legacy snapshots、plan entries |
| M5 | similarity feedback；成本/次等派生指标不重复持久化 |
| M6 | trips、activities、selections 与 packing states |

### 实施任务

- [ ] 先在 tests/dbMigrations.test.ts 写失败测试：legacy baseline 0 可登记、旧 schema 可升级、同一迁移只执行一次、失败迁移整体回滚且不记录版本。
- [ ] 冻结现有 migrate() 为 legacyBaseline0，实现 schema_migrations 与 runNumberedMigrations，并用测试约束“以后不得把新字段继续塞回 baseline”。
- [ ] 在 tests/recommendation.test.ts 写大衣橱候选预算测试；使用明确保证至少三套合法核心组合的 500 件 fixture，断言 evaluatedCandidates 不超过 20,000 且仍返回三套不同核心组合。
- [ ] 把候选生成改成“核心组合 → 加鞋/外套 → 配饰”的分层 beam，每层最多保留 120 个中间结果。
- [ ] 在 tests/api.test.ts 写稳定身份测试；candidateId 跨 run 全局唯一，outfitSignature 对同一有序 slot 组合稳定，rank/天气/场合变化不改变 signature。
- [ ] 新增 recommendation_candidates 表，保存 run_id、全局 UNIQUE candidate_id、signature、rank、item_ids_json、score_snapshot，并给 run_id 建外键和索引。
- [ ] 实现 OutfitExportV2 构建与版本校验；保留 V1 字段，加入 M0 数据段，并用固定 fixture 验证敏感确认和 JSON 稳定性。
- [ ] 把位置和画像默认值改为 null/空；首次推荐前要求用户确认位置，手工衣物默认 confirmed=true，淘宝导入仍为 false。
- [ ] 统一确认语义：推荐只使用 owned=true、confirmed=true、excluded=false 的衣物；空结果返回 missingSlots。
- [ ] 远程图片采用“本地缩略图优先、远程淘宝图默认关闭、用户显式开启后本会话可加载”的策略。
- [ ] privacy-clean 预览中列出 playwright-taobao-profile；只有 --confirm 与 --include-login-state 同时存在时才允许清理。
- [ ] 更新文档并运行目标测试、全量测试、类型检查和生产构建。

### 验收标准

- 旧数据库可无损启动，迁移重复运行不改变结果。
- 500 件合成衣橱不会触发无界笛卡尔积；候选评估数受预算约束。
- 推荐响应中的每一套都有稳定 candidateId 和 outfitSignature。
- candidateId 可在全部 run 中唯一定位候选快照；相同衣物组合可用 outfitSignature 识别，但不会丢失各次天气、场合和评分上下文。
- 当前旧库能导出 V2 JSON，旧 V1 fixture 能被版本校验器识别；每个后续里程碑都有导出覆盖测试。
- 未确认衣物不再参与推荐，空结果明确指出缺失槽位。
- 新用户不会静默使用北京和具体身体画像。
- privacy-clean 默认仍不删除任何文件，Playwright 登录态得到与 Selenium 相同的双重确认保护。

---

## 8. 子项目 M1：可信建档与导入暂存区

**目标：** 让非淘宝衣物也能安全进入衣橱，并让淘宝批次在写库前逐项选择、修正和判断“新增/更新/退款同步/无变化”。

### 数据与 API

新增 garments 字段：

~~~ts
type GarmentOrigin = "taobao" | "manual" | "backup";

interface ManualGarmentCreate {
  name: string;
  category: GarmentCategory;
  color: string;
  warmth: GarmentWarmth;
  seasons: Season[];
  styles: string[];
  formality: Formality;
  brand?: string;
  size?: string;
  materials?: string[];
  patterns?: string[];
  tags?: string[];
  notes?: string;
  acquiredAt?: string;
  purchasePriceCents?: number;
  currency?: "CNY";
}
~~~

新增表：

- garment_assets(id, garment_id, kind, storage_key, mime_type, byte_size, width, height, sha256, active, created_at)

新增端点：

- POST /api/garments：JSON 新建手工衣物。
- PUT /api/garments/:id/image：最大 5 MB 的 image/jpeg、image/png 或 image/webp 原始 body，服务端统一净化为 WebP。
- GET /api/garment-assets/:id/content：认证后按 asset ID 返回图片，不接收文件路径。
- POST /api/garments/:id/archive 与 POST /api/garments/:id/restore：软归档与恢复；旧 DELETE 路由改为相同的软归档语义并标记弃用。
- POST /api/import/taobao-preview：改为数据库感知，返回 disposition。
- POST /api/import/taobao-commit：接收原 batch 与逐项 decisions，服务端重新归一化并校验。
- GET /api/export?format=zip：用户显式选择时生成 V2 JSON + 本地资产的完整备份；默认 JSON 导出不含图片二进制。

图片安全边界：

- 浏览器 `canvas` 重编码只用于预览和减小上传，不作为安全控制；直接调用 API 也必须得到同样结果。
- 后端为该路由单独启用 raw-body 中间件，先限制 5 MB 字节数，再用 `sharp` 的 `limitInputPixels` 解码、自动旋转并重新编码为 WebP；不调用 `withMetadata()`，因此 EXIF/ICC/XMP 不进入落盘文件。
- 资产根固定为 `data/garment-assets`，文件名由 UUID 生成；数据库只保存不可由用户控制的 `storage_key`。每次读写都解析并断言目标仍位于该根目录内。
- `Garment.imageUrl` 只指向 `/api/garment-assets/:id/content`；API 经过现有 session/来源保护并设置正确的 MIME、缓存和 `X-Content-Type-Options`，物理路径永不返回客户端。
- ZIP 条目使用 asset ID 与白名单扩展名，拒绝绝对路径和 `..`；生成前展示将包含的敏感数据与预计大小，不自动删除任何源文件。

导入决定：

~~~ts
type ImportDisposition = "create" | "update" | "refund-sync" | "unchanged" | "skip";

interface ImportDecision {
  sourceItemKey: string;
  include: boolean;
  overrides?: Partial<Pick<Garment,
    "brand" | "name" | "category" | "color" | "warmth" |
    "seasons" | "styles" | "formality" | "size" |
    "materials" | "patterns" | "tags" | "notes"
  >>;
}
~~~

### 文件结构

创建：

- server/services/garmentAssets.ts
- server/routes/garments.ts
- src/features/wardrobe/ManualGarmentDialog.tsx
- src/features/import/ImportReviewTable.tsx
- src/lib/imageSanitization.ts
- tests/garmentAssets.test.ts

修改：

- package.json、server/db.ts、server/services/importTaobao.ts、server/routes.ts、server/validation.ts
- src/shared/types.ts、src/api.ts、src/app/App.tsx
- src/features/wardrobe/WardrobeView.tsx、GarmentEditor.tsx
- src/features/import/ImportView.tsx
- tests/api.test.ts、tests/app.test.tsx、tests/importTaobao.test.ts

### 实施任务

- [ ] 写 migration 测试并新增 origin、archived_at、acquired_at、purchase_price_cents、currency 与 garment_assets；availability_status 留到 M3，避免重复归属。
- [ ] 写 POST /api/garments 失败测试：手工衣物无 sourceOrderItemId、默认 confirmed=true/origin=manual、非法枚举和负价格被拒绝。
- [ ] 实现 createManualGarment() 和 JSON 路由，不要求图片即可保存。
- [ ] 写后端图片净化失败测试：带 EXIF 的 JPEG、PNG/WebP、伪造 MIME、像素炸弹、解码失败、超字节上限和路径穿越；浏览器 canvas 只补交互测试。
- [ ] 加入并锁定 `sharp`，实现 PUT image 专用 raw body、服务器端解码/旋转/无元数据 WebP 重编码、UUID storage_key、sha256 和原子落盘。
- [ ] 实现认证 GET asset content；验证不存在/非 active/越界 storage_key 均不泄露物理路径，Garment.imageUrl 指向该端点。
- [ ] 旧图片不自动删除；只将 active 置为 false，后续由 privacy-clean 预览和明确确认处理。
- [ ] 在衣服库增加“添加衣物”入口和 ManualGarmentDialog；保存成功后直接进入已确认藏品。
- [ ] 把衣物删除 UI 改为“归档”，实现 archive/restore；统一 active predicate 为 `owned=true AND archived_at IS NULL`，推荐再叠加 `confirmed=true AND excluded=false`。
- [ ] 列表、洞察默认只计算 active garments；导入去重必须命中已归档来源并提示“恢复并更新”，不能静默创建重复衣物。
- [ ] 写数据库感知预览测试：同一来源区分 create/update/unchanged/refund-sync，且预览不写库。
- [ ] 读取采集产物时不再提前丢弃退款事件；在 ImportReviewTable 中逐项勾选和修正字段。
- [ ] 提交时服务端重新计算 sourceItemKey/disposition，拒绝不存在的 decision 或非法 override。
- [ ] 补齐品牌、风格、正式度、备注和“排除推荐”的编辑入口；新增批量季节/标签/排除动作。
- [ ] 扩展 OutfitExportV2 资产元数据并实现显式 ZIP 完整备份；验证 ZIP 无绝对路径、无路径穿越、缺失资产有 manifest 警告。
- [ ] 更新文档并完成全量验证。

### 验收标准

- 一件线下或非淘宝衣物可在 60 秒内用本地照片建档并进入推荐。
- 即使绕过前端直接调用 API，落盘图片也不含原文件 EXIF/ICC/XMP，且不会被发送到外部域名。
- 图片只能经认证 asset ID 端点读取，响应和导出不暴露电脑上的绝对路径。
- 归档衣物不进入推荐或默认洞察，仍可恢复；同来源再次导入不会生成重复 active 记录。
- 预览中的每个候选可选择、修正，并明确显示新增/更新/退款同步/无变化。
- 取消某项不会写入；退款同步不会因 wardrobeOnly 过滤而消失。
- 同批提交重放保持幂等。

---

## 9. 子项目 M2：保存搭配、指定核心单品与“换一件”

**目标：** 把一次性推荐升级为可命名、可编辑、可复用的搭配，并把已有替代单品从只读列表变成操作。

### 数据模型

~~~ts
type SavedOutfitSource = "recommendation" | "manual" | "replacement";
type OutfitSlot = "top" | "bottom" | "dress" | "outerwear" | "shoes" | "accessory";

interface SavedOutfit {
  id: number;
  name: string;
  notes: string;
  source: SavedOutfitSource;
  sourceCandidateId?: string;
  derivedFromOutfitId?: number;
  favorite: boolean;
  archivedAt?: string;
  items: SavedOutfitItem[];
  createdAt: string;
  updatedAt: string;
}

interface SavedOutfitItem {
  id: number;
  outfitId: number;
  garmentId?: number;
  slot: OutfitSlot;
  position: number;
  garmentSnapshot: Pick<Garment, "id" | "name" | "brand" | "category" | "imageUrl">;
}
~~~

表：

- saved_outfits
- saved_outfit_items

`saved_outfits.derived_from_outfit_id` 是可空自外键。应用替代项时创建一个新的 saved outfit，`source=replacement` 且指向原搭配；旧记录不变，因此“新版本”不是一句 UI 文案，而是可查询的派生关系。

API：

- GET/POST /api/outfits
- GET/PUT /api/outfits/:id
- POST /api/outfits/:id/archive
- POST /api/recommendation-candidates/:candidateId/save（candidateId 使用 M0 的全局唯一 UUID）
- POST /api/outfits/:id/replacements
- 推荐请求新增 includeGarmentIds/excludeGarmentIds

结构化替代项：

~~~ts
interface OutfitReplacementSuggestion {
  targetGarmentId: number;
  replacement: Garment;
  nextItems: Garment[];
  matchPercentDelta: number;
  reasons: string[];
}
~~~

### 文件结构

创建：

- server/services/savedOutfits.ts
- server/routes/outfits.ts
- src/features/outfits/OutfitBuilder.tsx
- src/features/outfits/SavedOutfitsPanel.tsx
- src/features/outfits/ReplacementDialog.tsx
- tests/savedOutfits.test.ts

修改：

- server/services/recommend.ts、server/routes.ts、server/validation.ts
- src/shared/types.ts、src/api.ts、src/app/App.tsx
- src/features/recommendations/OutfitStage.tsx、RecommendationView.tsx
- src/features/insights/HistoryInsightsView.tsx
- tests/api.test.ts、tests/app.test.tsx、tests/recommendation.test.ts

### 实施任务

- [ ] 先写表迁移与 CRUD 失败测试；同一 outfit 中 slot+position 唯一，derived_from_outfit_id 必须存在且不能自引用，衣物归档后 snapshot 仍可回看。
- [ ] 实现 savedOutfits 服务与路由；删除按钮实际执行 archive，不物理删除。
- [ ] 推荐候选卡增加“保存搭配”；默认名称由日期+场合生成，用户可立即改名。
- [ ] 在现有“历史洞察”页内增加二级区域“保存的搭配”，不增加第六个移动端主导航项。
- [ ] 实现 OutfitBuilder：按 slot 选择衣物、拖动/按钮调整配饰顺序、保存前做完整性校验。
- [ ] 扩展推荐请求校验，支持锁定 includeGarmentIds 和排除 excludeGarmentIds；不存在、未确认、已归档或 excluded ID 返回结构化校验错误，M3 上线后再叠加 availability 校验。
- [ ] 把 findAlternatives() 改为结构化 replacements；每个建议标明替换目标、分数变化和理由。
- [ ] ReplacementDialog 应用替代后生成带 derivedFromOutfitId 的新 saved outfit，不静默覆盖旧版本。
- [ ] 为推荐卡增加“以这件为核心”和“换这件”动作；键盘和移动端均可完成。
- [ ] 扩展 OutfitExportV2，加入 saved outfits、items、snapshot 与 derivedFromOutfitId，并用归档衣物 fixture 验证导出完整。
- [ ] 更新文档并完成全量验证。

### 验收标准

- 任一推荐可一键保存、命名、重新打开和归档。
- 用户可从衣物详情发起“以这件为核心”推荐。
- 点击某件衣物的替代项后，界面显示新整套、分数变化与理由；旧搭配仍可回看。
- 已归档/删除来源衣物不会使历史搭配页面崩溃。
- 替换产生的新搭配可以追溯到原搭配，归档或修改新搭配不会改变原记录。

---

## 10. 子项目 M3：推荐反馈与衣物可用状态

**目标：** 让用户的真实选择改变后续排序，同时确保待洗、维修、借出或已装箱的衣物不会被推荐。

### 数据与评分

新增：

- garments.availability_status，默认 available，枚举 available/laundry/repair/loaned/packed
- recommendation_feedback
- outfit_pair_stats
- garment_availability_events

API 增加：

- POST /api/recommendation-feedback：按 candidateId 幂等新增或更新反馈。
- DELETE /api/recommendation-feedback?scope=all|candidate|date-range：清空前由 UI 展示范围并二次确认；服务端记录结构化审计结果并重算 pair stats。
- POST /api/garments/:id/availability：校验状态并写 garment 与事件历史的同一事务。

反馈：

~~~ts
type FeedbackVerdict = "liked" | "disliked" | "skipped";
type FeedbackReason =
  | "too-warm" | "too-cold" | "too-formal" | "too-casual"
  | "color" | "fit" | "repeat" | "unavailable" | "other";

interface RecommendationFeedback {
  candidateId: string;
  verdict?: FeedbackVerdict;
  rating?: 1 | 2 | 3 | 4 | 5;
  actuallyWorn?: boolean;
  reasonCodes: FeedbackReason[];
  comment?: string;
  woreInsteadOutfitId?: number;
}
~~~

首版 pair bonus 使用透明、有界公式：

~~~text
signal = likes + 2*worn - 2*dislikes
confidence = min(1, totalFeedback / 5)
pairBonus = clamp(signal / max(1,totalFeedback), -1, 1) × 4 × confidence
~~~

每个 outfit 的全部 pairBonus 总和限制在 -8…+8，并作为 scoreBreakdown.learnedPreference 单独展示。少于 3 条证据时仍记录，但不改变排序。

### 文件结构

创建：

- server/services/recommendationFeedback.ts
- server/services/garmentAvailability.ts
- server/routes/feedback.ts
- src/features/recommendations/FeedbackDialog.tsx
- src/features/wardrobe/AvailabilityMenu.tsx
- tests/recommendationFeedback.test.ts

修改：

- server/services/recommend.ts、server/db.ts、server/routes.ts
- src/shared/types.ts、src/api.ts
- src/features/recommendations/OutfitStage.tsx
- src/features/wardrobe/GarmentItem.tsx、WardrobeView.tsx
- tests/api.test.ts、tests/app.test.tsx、tests/recommendation.test.ts

### 实施任务

- [ ] 写反馈幂等、评分范围、原因枚举、候选归属和重复提交测试。
- [ ] 实现反馈写入与 pair stats 重算；同一候选的后续提交更新而不是叠加。
- [ ] 写推荐排序测试：证据不足不调权，达到阈值后只产生 -8…+8 的可解释 bonus。
- [ ] OutfitStage 增加喜欢、不喜欢和“实际穿了”入口；不喜欢时提供有限原因而非强制长文本。
- [ ] 穿着成功后把 actuallyWorn=true 与当前 wear_logs 写入放在同一事务；M4 迁移后复用同一 service 改写为 wear_event，避免提前依赖尚不存在的表。
- [ ] 为 garment 迁移 availability_status，并增加 available/laundry/repair/loaned/packed 状态校验和变更历史。
- [ ] 推荐硬过滤非 available 衣物；若过滤后缺槽位，missingSlots 同时提示不可用数量。
- [ ] 衣服库增加单件和批量状态切换；“标记已穿”后只建议而不自动把衣物设为待洗。
- [ ] 洞察页显示反馈数量、接受率和最常见拒绝原因，不展示未经阈值验证的“学习结论”。
- [ ] 实现按全部/候选/日期范围清空反馈的预览、确认和 pair stats 重算；API 集成测试覆盖越权 scope、空范围和重放。
- [ ] 扩展 OutfitExportV2，加入 feedback、pair stats 与 availability events，并验证导出不漏状态历史。
- [ ] 更新文档并完成全量验证。

### 验收标准

- 反馈永远关联到稳定 candidateId，而不是临时序号。
- 同一反馈重复提交不会重复加权。
- 待洗/维修/借出/已装箱衣物不进入推荐。
- 用户能看到“学习偏好”对分数的有限贡献，并可清空反馈；清空前必须展示将影响的数据范围。
- 清空后 pair stats 与推荐 bonus 在同一事务结果中一致，不残留由已删除反馈计算出的权重。

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

## 12. 子项目 M5：成本/次、重复购买与购买前检查

**目标：** 把已有淘宝金额、穿着记录、衣橱缺口和本地相似度转成可操作的理性购物建议。

### 指标定义

- 成本/次：purchasePriceCents / wearCount；wearCount=0 时显示“尚无穿着”，不制造无穷值。
- 最佳价值：价格已知且 wearCount≥3 的衣物中成本/次最低。
- 低利用高成本：购入≥90 天、wearCount≤1，且价格处于当前衣橱已知价格的最高四分位。
- 沉睡单品：活跃衣物中 90 天无穿着；新购未满 30 天不提示。
- 结构相似度首版：

~~~text
同类别为必要条件
颜色 25% + 风格 20% + 材质 15% + 图案 15% +
品牌/规范化名称 15% + 可选本地视觉相似度 10%
总分 ≥ 75% 才标记“可能重复”
~~~

没有 CLIP 模型时只按前五项归一化，不下载模型、不外发图片。

### API

- GET /api/insights/value
- POST /api/purchase-checks/taobao-candidate
- GET /api/garments/:id/similar
- POST /api/similarity-feedback

新增 `garment_similarity_feedback`：`subject_key` 是现有 garment ID 或未入库候选的稳定 fingerprint，`compared_garment_id` 指向被比较衣物，`verdict` 为 duplicate/not-duplicate，二者组合唯一。反馈只用于校准阈值和隐藏已否定配对，不自动修改衣物字段。

购买前返回：

~~~ts
interface PurchaseCheckResult {
  verdict: "fills-gap" | "likely-duplicate" | "mixed" | "insufficient-data";
  possibleDuplicates: Array<{ garment: Garment; similarity: number; reasons: string[] }>;
  worksWith: SavedOutfit[];
  coverageDelta: {
    categories: string[];
    seasons: string[];
    occasions: string[];
    compatibleOutfitCount: number;
  };
  explanation: string[];
}
~~~

### 文件结构

创建：

- server/services/wardrobeValue.ts
- server/services/garmentSimilarity.ts
- server/services/purchaseCheck.ts
- server/routes/decisionSupport.ts
- src/features/insights/ValueInsights.tsx
- src/features/import/PurchaseCheckPanel.tsx
- tests/decisionSupport.test.ts

修改：

- server/db.ts、server/services/importTaobao.ts、server/routes.ts
- src/shared/types.ts、src/api.ts
- src/features/insights/HistoryInsightsView.tsx
- src/features/import/ImportView.tsx
- tests/api.test.ts、tests/app.test.tsx

### 实施任务

- [ ] 写价格迁移测试：只在 payment/quantity 明确时回填单件价格，保留 costSource=taobao；手工值优先且不被重导入覆盖。
- [ ] 实现成本/次、四分位、沉睡单品和最佳价值纯函数，并覆盖缺价格、退款、多数量和零穿着。
- [ ] 在洞察页增加“价值与利用”区域；文案使用中性“低利用高成本”，避免羞辱或诱导消费。
- [ ] 写结构相似度表驱动测试，确保不同类别永不判重复，缺字段时权重重新归一化。
- [ ] 如果本地 CLIP 已安装，可把归一化 embedding 存入 garment_embeddings(model_id, garment_id, vector_blob)；它是可重建缓存、不进入导出，模型缺失时功能仍完整可用。
- [ ] 商品详情采集增加“购买前检查”模式：只预览，不写 source_order_items/garments。
- [ ] 计算 possibleDuplicates、worksWith 和 coverageDelta；结果只给“补缺口/可能重复/信息不足”，不替用户做购买决定。
- [ ] 写 similarity feedback migration/API 失败测试并实现幂等 upsert；候选 fingerprint 必须由服务端规范化输入生成，不能接受客户端伪造的任意路径或超长键。
- [ ] 在重复建议上提供“确实重复/不是重复”，后者立即隐藏该 pair，并为后续离线阈值评估保留证据。
- [ ] 洞察建议的 relatedGarmentIds 增加“查看相关衣物”与“应用筛选”动作。
- [ ] 扩展 OutfitExportV2，加入 similarity feedback；派生成本/次和排行在导入后重算，不重复持久化。
- [ ] 更新文档并完成全量验证。

### 验收标准

- 价格缺失不会被当作 0；退款项不进入价值排行。
- 任何“昂贵但低利用”提示都能展开看到价格、购入时间和穿着次数证据。
- 生成购买前检查结果本身不写数据库、不调用云端 AI、不自动下载模型；只有用户显式提交“确实重复/不是重复”时才写 similarity feedback。
- 相似建议可解释，并允许用户标记“不是重复”作为后续阈值校准数据。
- 同一配对重复反馈保持幂等；标记“不是重复”后不会在下一次检查中再次提示该配对。

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

## 14. 测试与发布策略

### 14.1 测试层次

1. **纯函数单元测试**
   - 推荐预算、stable signature、反馈 bonus、成本/次、相似度、重复规则、trip 优化。
2. **SQLite 迁移测试**
   - 当前 schema、历史 schema、重复启动、失败回滚、旧 wear_logs 迁移和导出兼容。
3. **API 集成测试**
   - 认证、Origin、输入上限、幂等、事务、归档/引用语义、隐私错误。
4. **React 交互测试**
   - 手工建档、导入逐项修正、保存/换件、反馈、周计划、购买前检查、打包清单。
5. **真实浏览器 E2E**
   - 新增 @playwright/test，只使用临时 SQLite/临时 output，不访问真实淘宝或用户 profile。
   - 桌面 1280px、移动 390px、键盘操作和 dialog 焦点路径。
6. **性能与性质测试**
   - 组合预算用操作数做稳定断言；墙钟 benchmark 只记录趋势，不作为易抖动的唯一 CI 门槛。
7. **隐私测试**
   - 上传图 EXIF 不保留、无外站请求、PWA 不缓存 API、清理脚本默认无删除、敏感导出有确认。

### 14.2 每个子项目的统一完成命令

~~~powershell
npm run typecheck
npm test
npm run build
python -m pytest -q
~~~

若子项目没有修改 Python，pytest 仍在最终发布门执行，保证采集与视觉脚本未被间接破坏。

### 14.3 发布门

- schema 迁移必须在一份现有数据库副本上演练；只读备份先于迁移。
- 任何新图片流程必须通过路径穿越、格式欺骗、超大像素、超大字节和 EXIF 测试。
- 新推荐权重必须能在 UI 中单独解释，并能通过设置关闭。
- 每个里程碑均可单独回滚 UI 入口，但不能回滚已执行的数据迁移；迁移必须前向修复。

---

## 15. 明确不采用或暂缓

- **纯 LLM 推荐**：现有确定性引擎更可解释，也更符合隐私边界。
- **虚拟试穿/生成式换装**：模型、算力、权重许可和人物照片隐私成本过高。
- **DeepFashion2/外部 SegFormer 直接接入**：仓库或模型许可不明确/非商业，且本地资源要求高。
- **多用户、家庭共享、造型师协作、社交 feed**：与当前单用户数据模型冲突。
- **云同步和真正离线双向同步**：需要所有权、冲突、加密与敏感浏览器缓存的独立架构项目。
- **新品监控与购物提醒**：会扩大抓取和通知面，也偏离“使用现有衣橱、减少重复购买”。
- **精确箱包体积/重量优化**：AIPackr 的估算尚不成熟，先交付逐日覆盖和件数/鞋数约束。
- **直接复制 AGPL 或无许可证源码**：仅做 clean-room 设计。

---

## 16. 许可证与隐私实施清单

- MIT/BSD 代码若确需复用，保留版权和许可证文本，并在 THIRD_PARTY_NOTICES.md 记录文件来源与修改。
- AGPL 仓库只参考公开产品行为、领域概念和接口形态；实现过程不复制源码。
- CC BY 4.0 资料若采用或改编具体规则，必须注明作者、仓库链接、许可证和修改说明；`googlarz/fashion-skill` 以仓库 LICENSE 的 CC BY 4.0 为准，不采用 README 的冲突 MIT 文案。
- 无 LICENSE 仓库按默认版权处理，不复制、改编或分发代码。
- 模型权重、数据集与代码许可证分别核验；代码是 MIT 不代表权重可商用。
- 任何云 AI、邮件、通知、日历连接或 IP 定位必须是独立、默认关闭的可选模块。
- 敏感字段包括坐标、身高体重、肤色、淘宝来源、价格、穿着记录和反馈；导出、清理和备份 UI 必须明确列出。

---

## 17. 最终建议

建议按以下顺序立项：

1. **先批准 M0**：它修复会污染所有后续数据的基础问题。
2. **把 M1 与 M2 作为首个产品版本**：二者在技术上都只硬依赖 M0，可并行开发；合并发布后用户能完整建档，并真正保存、修改和复用搭配。
3. **M3 上线后观察至少 4 周真实反馈**：再决定 pair bonus 的阈值和权重，不提前引入 ML。
4. **M4 把历史数据变成日历和计划**：这是成本/次、重复规则和旅行规划的可信数据源。
5. **M5 用证据帮助少买、买对**：优先结构相似与成本/次，视觉 embedding 仅为可选增强。
6. **M6 作为独立实验版本**：先验证 1–7 天旅行是否真能减少打包决策时间，再考虑胶囊衣橱长期优化。

如果在完成 M0 的迁移与全局候选身份前置切片后，只选择一个增量功能，推荐 **M2“保存搭配 + 换一件 + 指定核心单品”**；它不硬依赖 M1，可直接复用现有淘宝衣物与推荐能力，并为反馈、日历和旅行规划建立共同的 outfit 领域基础。面向用户正式发布时，仍建议与 M1 一起交付。
