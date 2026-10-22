# Radar MVP 开发、验收与部署

## 当前交付

`/radar` 是真实站长后台；`/radar/demo` 保留模拟地图；`/radar/embed?site=<siteKey>&theme=dark` 是公开 iframe。未配置服务时，后台显示配置状态，不连接模拟器。所有网页仍可 Next 静态导出。Worker 接收事件、验证登录、提供私有查询和公开汇总；Supabase Auth 管理登录，Postgres 保存真实事件。Desktop 和 Activity 不连接这些服务。

开发依赖 Node/npm。真实本地 Supabase 另外需要 Docker 和 Supabase CLI；没有 Docker 时，`npm test` 仍会用 PGlite（实际 PostgreSQL WASM）执行同一 SQL migration，验证权限和采集事务。PGlite 不替代真实 Auth、PostgREST、邮件和 Cloudflare 预发布验收。

## 本地启动

1. 在仓库根运行 `npm ci`。
2. 准备 Docker，运行 `npx supabase start`。从 `npx supabase status` 读取本地 API URL、anon key 和 service_role key；不要把输出提交或发到日志。运行 `npx supabase migration up --local` 应用本仓库迁移。这个独立项目的配置在 `supabase/config.toml`。
3. 将 `apps/web/.env.example` 复制为 `apps/web/.env.local`，填入本地 URL 和 anon key。
4. 将 `apps/radar-worker/.env.example` 复制为 `apps/radar-worker/.dev.vars`，填入相同 URL、anon key 和 service_role key。高权限 key 只在 Worker 使用，不能加 `NEXT_PUBLIC_` 前缀。
5. 两个终端分别运行 `npm run dev:radar`（8787）和 `npm run dev`（3000）。打开 `http://127.0.0.1:3000/radar`。
6. 输入测试邮箱，打开本地邮件界面 `http://127.0.0.1:54324`，点击登录链接。生产邮件使用 Supabase Auth 配置的邮件服务；回调地址必须进入允许列表。
7. 创建网站 A，允许域名 `localhost`；网站 B，允许域名 `127.0.0.1`。域名列表是精确匹配，不包含协议、路径、端口或通配符。
8. 运行 `npm run example --workspace @tracel/radar-worker`，用 `http://localhost:4174` 和 `http://127.0.0.1:4174` 分别安装对应站点 key。页面会等待点击“同意并加载脚本”后才采集。

`NEXT_PUBLIC_*` 在构建时写入静态网页，修改后需要重启开发服务或重新构建。Worker 的 `APP_ORIGINS` 是后台允许的 origin（含协议和端口）；它不等于被监控网站的域名列表。

## SDK 和数据语义

后台“安装与公开组件”提供脚本与 iframe 代码。脚本是普通异步 JS，不携带 React、Next 或 Supabase SDK。页面载入、History API 导航和 popstate 会产生 `page_view`；相同 pathname 的查询字符串变化不会重计。`window.radar.track('demo_clicked', {count: 1})` 发送自定义事件，`stop()` 停止后续事件，`start()` 恢复，`destroy()` 释放定时器与监听。需要延迟同意时，在脚本标签增加 `data-consent="denied"`，取得同意后调用 `start()`。

匿名访客 ID 使用每站点的第一方 localStorage，会话 ID 使用 sessionStorage。30 分钟无事件后创建新会话；拒绝存储时仅在本页面内保留身份，不进行指纹识别。首次启用采集前不访问这些存储。每个可见页面每 20 秒心跳；离开可见状态时尽力发送一次最后心跳，之后停止。60 秒无活动后会话不再计入在线。在线会话、独立访客和页面浏览分别计数。

事件 ID 保证同站点重试不会双计，事件与会话更新在同一数据库事务完成。客户端时间只接受最近 24 小时至未来 5 分钟范围，未来值落到接收时刻；历史统计窗口按服务端接收时间过滤，旅程按事件时间排序。原始事件（包括用于去重的心跳）与会话保留 30 天。Worker Cron 每天 03:17 UTC 清理，失败抛错并记录 `radar_cleanup_failed`，应在 Cloudflare 为 Cron 失败配置告警。

只采集路径、不采集查询字符串、输入值、页面标题或 IP 原文；来源仅保留 origin。自定义属性最多 16 项，仅允许有限字符串、有限数值、boolean/null，拒绝常见敏感字段名；这不能替站长判断任意业务字符串是否包含个人信息，接入时只发送允许的业务值。请求体上限 16 KiB。Cloudflare 来源地理信息只保留国家、城市与取整到一度的粗位置；缺失位置不生成坐标标记。本地 Worker 的地域信息不代表真实访客定位。

后台完整汇总是近 24 小时；地图和最近列表最多 200 条事件 / 会话，并明确标为样本。访客旅程单独查询 30 天内最早 500 条，超限提示。来源排行统计页面浏览来源；国家和城市排行统计会话。公开接口仅返回在线数、24 小时浏览量与更新时间，不返回访客 ID、事件或独立访客 ID。

## API 与权限

| API | 权限 |
| --- | --- |
| `POST /v1/collect` | 公开 siteKey；必须有匹配站点域名的 Origin；限速与协议校验 |
| `GET/POST /v1/sites` | Supabase 用户 Bearer JWT，列出/创建自己的站点 |
| `PATCH /v1/sites/:id` | 本站点成员，可改域名、公开开关和主题 |
| `GET /v1/sites/:id/snapshot` | 本站点成员，24 小时汇总与有界列表 |
| `GET /v1/sites/:id/journey?visitorId=...` | 本站点成员，匿名访客有界历史 |
| `GET /v1/public/sites/:siteKey/summary` | 站长开启公开组件后可匿名读取汇总 |

Worker 每次私有请求先用 Supabase `/auth/v1/user` 验证用户，再透传其 JWT 到受 RLS 限制的查询。service_role 仅用于受校验的采集、公开汇总和清理。SQL 函数权限逐项收紧；匿名浏览器无权直接写事件或调用高权限函数。每账号最多创建 10 个网站。Origin 是防误用措施，不能阻止服务端伪造上报；MVP 统计为尽力采集数据，不是可审计计费依据。

Wrangler 配置包含每来源 IP 每分钟 120 次、每 siteKey 每分钟 3000 次的近似限速，各 Cloudflare 节点独立计数；上线前根据真实预算调整。IP 只瞬时用于限速，不进入数据库或应用日志。公开汇总在 Worker 实例内缓存 10 秒，但每次请求都重新验证公开开关，关闭后立即停止返回数据。HTTP 响应不允许浏览器持久缓存。

## 验证与发布

根目录执行 `npm run typecheck`、`npm test`、`npm run build`。构建包括静态网站、Desktop 前端、独立 Worker ESM 与采集脚本；它不会发布或生成 Desktop EXE。协议/SDK 单测覆盖 URL 清理、拒绝敏感字段、同意状态、SPA 和存储失败；数据库测试执行真实 SQL migration，覆盖两用户越权、事务冲突回滚、重复事件、在线过期和清理；Worker 测试通过 PostgREST 测试适配层调用相同 PostgreSQL，覆盖完整 HTTP 链路和公开开关。

发布前必须在预发布环境完成：两站点跨域脚本实际加载、邮件登录与刷新登录恢复、网络失败/恢复、SPA、自定义事件旅程、心跳离线、iframe 明暗主题与窄屏、关闭公开数据、两账号隔离。记录实际脚本 gzip、请求成功率、写入速率和查询延迟。不要将自动化模拟 Auth/HTTP 测试等同于这些检查。

部署步骤：

1. 创建专用 Supabase 项目，先用 `supabase db push` 预览/应用迁移；配置邮件服务、站点 URL 和精确登录回调允许列表。
2. 在 Worker 配置生产 `SUPABASE_URL` 和 `APP_ORIGINS`；用 `wrangler secret put SUPABASE_ANON_KEY` 与 `wrangler secret put SUPABASE_SERVICE_ROLE_KEY` 写入 key。确认 `wrangler.jsonc` 的 ratelimits namespace_id 不与同账号其他项目意外共用。
3. 显式运行 `npm run deploy --workspace @tracel/radar-worker` 部署 API。
4. 为网站构建环境配置三个 `NEXT_PUBLIC_*` 变量，再显式运行现有网站部署命令；生产仅使用 HTTPS URL。
5. 在被监控网站 CSP 中允许 Radar 脚本域、API 的 `connect-src` 和 iframe 的 `frame-src`。确认 Radar 所在域的响应没有禁止本站嵌入的 `X-Frame-Options` / `frame-ancestors`；iframe 页面本身无需登录。

回滚：先停止采集脚本或隐藏新入口，再回滚 Worker 与静态网站版本；保留数据库表与数据，不通过 drop 表回滚。变更现有公开事件协议必须递增 schemaVersion 并明确兼容策略。新服务未经过真实流量基线前，不承诺吞吐或延迟指标。尚未使用 Queues、Durable Objects、ClickHouse、计费或团队邀请。
