# Radar 真实网站统计 MVP 执行计划

状态：MVP 代码已实现，自动验证通过；外部服务配置和预发布真实流量验收待执行。制定于 2026-10-22。本文只规划 Radar；`apps/desktop`、`packages/timeline` 和已有用户改动不在实施范围内。

## 目标与验收场景

站长注册并创建网站后，复制一段脚本到自己的网页。访客打开网页、切换页面或触发自定义事件，站长能在 `/radar` 查看真实统计和某个匿名访客的事件旅程。站长还能复制一段 iframe 代码，把该网站的在线人数和近期访问量展示给自己网站的访客。演示模式继续可用，真实采集故障时不能显示模拟访客冒充真实数据。

MVP 完成时，必须能用两个不同域名的测试网站走通上述流程，并证明站点 A 的后台与公开组件不能读取站点 B 的私有事件。

## 本轮决定

- 保留当前 `apps/web` 的 Next.js 静态导出和 Cloudflare Pages 部署。动态采集与查询使用独立 Cloudflare Worker；不把请求相关的 API Route、Cookie 或 Server Action 塞进静态导出。
- Supabase Auth 管理站长账号；Supabase Postgres 保存网站配置、成员关系、会话和事件。MVP 不引入 D1、ClickHouse 或 Durable Objects。
- Worker 是浏览器采集的唯一入口。采集脚本公开的 `siteKey` 只标识站点，不是秘密或授权凭证；Worker 校验事件和配额，再写入数据库。
- 后台私有查询必须验证 Supabase 登录身份和站点成员关系。若 Worker 使用高权限数据库凭证，所有私有查询必须显式检查 `site_id`；优先使用受 RLS 约束的用户 JWT 查询。公开组件只能访问单独的汇总接口。
- 第一版在线人数定义为最近 60 秒内有活动心跳的会话数。可见页面每 20 秒发一次心跳，隐藏页面停止心跳；关闭页面的通知仅作提示，不能作为唯一离线依据。公开组件每 15–30 秒刷新。计数允许采集与查询带来的短暂延迟，并在界面标明“约”。
- 第一版直接写 Supabase，先测量流量和查询性能。只有实际出现写入压力、丢失风险或明显查询延迟时，才增加 Cloudflare Queues；需要更即时的在线状态时再评估每站点 Durable Object；历史事件分析超出 Postgres 能力时再评估 ClickHouse。这些升级不改变脚本对外的事件协议。

## MVP 范围

| 能力 | 本轮交付 | 本轮不做 |
| --- | --- | --- |
| 站长与网站 | 邮件登录、创建网站、设置允许的域名、查看脚本和 iframe 代码；数据模型支持一个账号拥有多个网站 | 团队邀请、计费、复杂角色体系 |
| 采集 | 首次页面浏览、SPA 导航、20 秒心跳、显式 `track(name, properties)` 自定义事件；可停止采集 | 自动点击录制、表单内容录制、会话回放、跨设备身份合并 |
| 访客身份 | 每站点匿名 `visitorId`、每次访问 `sessionId`，浏览器拒绝持久存储时退化为本次页面会话 | 指纹识别、默认收集姓名或邮箱、站长任意上传用户资料 |
| 后台 | 当前在线数、近 24 小时浏览量与独立访客数、页面和来源排行、国家/城市粗粒度分布、匿名访客事件旅程 | 任意维度报表构建器、漏斗、归因模型 |
| 公开组件 | 可配置明暗主题的 iframe，显示在线人数与近 24 小时浏览量；提供复制代码 | 向公开组件暴露访客 ID、事件、精确位置或后台筛选能力 |
| 数据生命周期 | 原始事件和会话默认保留 30 天，定时清理；后台明确显示可查询时间范围 | 无限期保存、自动归档和付费保留策略 |

站长负责按其网站适用的同意规则决定何时启用脚本。SDK 必须提供关闭采集的接口；关闭后不发送心跳或事件。不采集输入值、完整查询字符串、IP 原文或精确坐标。URL 仅保留规范化路径；自定义属性采用允许类型、长度和总大小限制。地理信息可由 Worker 按请求来源生成国家/城市级信息，但不保存原始 IP。不要把这些约束仅留在前端，服务端也要验证。

## 数据流与目录

```text
站长网站 ── radar-tracker ──> radar-worker /v1/collect ──> Supabase Postgres
                                                       │
Radar 后台 <── 私有查询 + Supabase Auth ────────────────┘
公开 iframe <── radar-worker /v1/public/sites/:key/summary
```

```text
apps/
  web/                         # 保留官网、/timeline 和 /radar
    src/radar/data-source/     # DemoSource 与 ApiSource，同一展示模型
    src/app/radar/embed/       # 静态 iframe 页面，按 query 中的 siteKey 取公开数据
  radar-worker/                # 采集、私有查询、公开汇总和清理任务
packages/
  radar-contracts/             # 版本化事件/API 类型及运行时校验
  radar-tracker/               # 无 React/Next 依赖的浏览器脚本
  timeline/                    # 保持 Activity 专用
supabase/
  migrations/                 # 表、索引、RLS、清理函数
```

`apps/web/src/radar/types.ts` 当前是展示模型，不直接作为上报协议。新协议使用 `schemaVersion`、`eventId`、`siteKey`、`visitorId`、`sessionId`、`occurredAt`、`type`、`pathname` 和受限的 `properties`。服务端补上可信的 `receivedAt` 与地域字段。`eventId` 在站点内唯一，重复请求不能重复计数。Postgres 至少包含 `sites`、`site_members`、`events`、`sessions`；事件按 `site_id` 与时间索引，查询必须带站点和有界时间范围。页面浏览量、独立访客数与在线会话数分别定义，不混用。

## 实施任务

### R0：契约和可复现开发环境

新增上述 workspace 与 Supabase migration 目录、环境变量样例、Worker 本地运行脚本。确定事件 schema、错误码、时间单位（UTC 毫秒）、会话/访客去重规则，以及 demo 与真实模式的切换方式。保留现有模拟器，不改视觉组件。提交可重复执行的数据库迁移和本地运行说明；密钥只放环境变量或平台 secret。

**验收：**干净 checkout 可以按文档启动 Web、Worker 和测试数据库；错误的事件版本与超大 payload 会被拒绝；根 TypeScript 检查、测试和构建通过。

### R1：站长登录、建站与数据隔离

接入 Supabase Auth，提供创建网站、域名设置、脚本代码展示。建表并配置 RLS。私有 API 根据登录用户与 `site_members` 判断访问权；公开组件开关和主题设置属于网站配置。为两个账号、两个网站写越权验证。

**验收：**未登录者无法读私有查询；账号 A 无法读取或修改账号 B 的网站与事件；浏览器包内没有 service role 凭证。

### R2：脚本、采集与会话

实现可通过 `<script async ... data-site="...">` 安装的轻量 SDK。初次载入和 SPA 导航发送页面浏览，暴露 `track()`；心跳只在页面可见时发送。优先使用 `sendBeacon` 发送离页缓冲，并提供 `fetch` 兜底。Worker 校验站点状态、域名配置、事件大小、属性和速率；记录事件与会话最新活动时间。加入每天执行的 30 天过期数据清理，并使失败可见。域名/Origin 检查只用于减少误用和滥用，不能当作身份认证。

**验收：**普通静态站和 SPA 各接入一次，能看到正确事件顺序；刷新或重试不双计；禁用采集后不再发送；无本地存储时仍可完成单次会话；错误上报不会影响站长页面运行。

### R3：真实 Radar 后台

为现有 `RadarView` 增加 `DemoSource` 和 `ApiSource`，将真实查询映射到现有访客、地图、曲线和事件面板。保留 demo 的重置、加速与生成控件，但只在明确的演示模式显示。真实模式支持网站切换、有界时间查询、加载/空数据/错误状态；当前在线与历史统计使用各自定义。

**验收：**站长能找到某匿名访客的浏览与自定义事件旅程；地图位置只表示粗粒度城市；后端失败时显示错误而不是模拟数据；原 `/radar` 演示体验仍可进入。

### R4：公开嵌入组件

在 Web 添加可被 iframe 加载的页面，调用 Worker 公开汇总接口。只允许站长明确开启的站点发布汇总；返回在线人数与近 24 小时浏览量，设置短缓存和请求限速。iframe 隔离站长网站 CSS，支持明暗主题、窄宽度和数据暂不可用状态。后台提供复制代码与预览。

**验收：**在与 Radar 不同域名的测试站点嵌入成功；访客无需登录即可看汇总；网络面板中没有私有事件或访客 ID；禁用公开组件后接口不再返回数据。

### R5：端到端验收与发布准备

增加一个最小测试网站和自动化流程，覆盖首次访问、SPA 导航、自定义事件、匿名旅程、心跳过期、公开计数、跨站隔离、重复上报和清理。记录脚本 gzip 体积、采集成功率、写入量、后台查询延迟和公开接口命中率作为后续扩容基线。更新 Radar 使用说明和部署/回滚步骤；在预发布环境用真实浏览器复验。生产部署作为单独发布步骤。

**验收：**根 `npm run typecheck`、`npm test`、`npm run build` 全部通过；预发布测试网站完整闭环通过；现有 `/`、`/timeline` 和 Desktop 前端构建不回归。只在修改 Rust/原生边界时运行 `npm run check:rust` 与 `npm run test:rust`。

## 实施约束

按 R0→R5 顺序，每项交付可运行、可审查的改动。开始任何代码任务前读取根和 Web 的 `AGENTS.md`、`docs/architecture.md`、`docs/data-model.md`、`docs/collectors.md`，检查并保护已有工作区改动；改动 Next 代码前读取安装版 `node_modules/next/dist/docs/` 对应指南。不要让 `apps/desktop` 或 `packages/timeline` 引入 Radar、Next 或 Supabase。不要把已有的 Desktop 重构计划当作 Radar MVP 的前置条件。

本计划不包含购买服务、创建生产 Supabase/Cloudflare 资源、上线或迁移真实用户数据。执行 R0 时可先使用本地和预发布资源；生产资源与域名配置在发布前确定。

## 2026-10-22 实施记录

- R0–R4：代码已交付。新增独立协议包、轻量 SDK、Worker、Postgres migration/RLS、站长后台、API 地图适配层、公开 iframe；演示移至 `/radar/demo`。
- R5：自动化部分完成。根 typecheck/test/build 通过；SQL migration 在 PGlite 的真实 PostgreSQL 中执行，验证两账号隔离、权限拒绝、事务回滚、去重、会话过期和清理；Worker HTTP 集成覆盖两网站域名、私有查询与公开组件撤销。浏览器检查后台未配置状态、模拟演示和 iframe 不可用状态通过。
- Wrangler deploy dry-run 的绑定与打包检查通过，未部署。受限环境需要将 XDG_CONFIG_HOME 和 WRANGLER_LOG_PATH 指向工作区的 `.wrangler`，避免写全局配置目录；常规根 build 直接用 esbuild 打包 Worker，不依赖全局 Wrangler 配置。
- 采集脚本当前为 1808 bytes gzip。真实请求成功率、数据库负载、线上查询延迟和公开汇总缓存命中率尚无测量，不能从单测推断。
- 本机没有 Docker/Supabase CLI，也未提供真实 Supabase 项目配置；未执行真实邮件、PostgREST、Cloudflare 地域数据和预发布跨域全流程验收。MVP 尚未上线。启动与部署步骤见 [radar-development.md](radar-development.md)。
