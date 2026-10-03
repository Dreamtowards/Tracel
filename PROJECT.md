# Tracel

**Internal codename:** Radar\
**Stage:** Visual MVP / Prototype\
**Product category:** Real-time website telemetry visualization

> **Watch your website come alive.**

Tracel 是一个面向个人网站、博客、独立开发者和小型产品网站的实时访客观测工具。

它不是另一个传统 Analytics Dashboard。

传统 Analytics 主要回答：

- 今天有多少 PV？
- UV 是多少？
- 哪个页面访问最多？
- 转化率是多少？

Tracel 更关注：

> **此时此刻，我的网站上正在发生什么？**

用户应该能够打开 Tracel，立即看到：

- 世界各地正在访问网站的人；
- 新访客在地球上实时出现；
- 一个访客当前正在看什么页面；
- 他从哪里进入；
- 他之后又访问了哪些页面；
- 浏览器、系统、屏幕等客户端信息；
- 一条持续流动的实时事件流。

第一阶段的核心目标不是完成 Analytics 产品，而是验证：

> **“实时地球 + Visitor + Journey + Event Feed” 是否能够形成足够有吸引力、足够精致的产品体验。**

---

## 1. MVP 目标

本阶段只开发 **Tracel Visual Prototype**。

所有 Visitor / Event 数据均使用本地模拟数据。

### 必须实现

- 3D Globe
- 实时 Visitor / Contact
- Visitor 出现与消失
- Visitor 地理位置
- 实时 Event Feed
- Visitor Detail
- Visitor Journey
- 在线 Visitor 数量
- Event rate
- Mock realtime simulation
- 精致的动画与视觉反馈
- Desktop-first responsive UI

### 明确不实现

本阶段不要实现：

- Supabase
- PostgreSQL
- Authentication
- Login / Signup
- Multi-user
- Multi-site
- tracker.js
- Collector API
- WebSocket server
- Billing
- Settings
- Analytics reports
- Funnels
- Conversion analysis
- Cohort
- A/B testing
- SEO analytics
- AI summaries
- 真实 IP / GeoIP

不要提前搭建这些系统。

本阶段的任务是：

> **先把 Tracel 最重要、最有区别度的体验做到足够好。**

---

## 2. 技术栈

使用：

- Next.js
- React
- TypeScript
- App Router
- Tailwind CSS
- shadcn/ui
- Three.js
- React Three Fiber

必要时可以使用：

- `@react-three/drei`
- Zustand

尽量避免引入重量级依赖。

### shadcn/ui 的用途

shadcn/ui 仅用于：

- Button
- Tooltip
- Popover
- Dropdown
- Sheet
- Dialog
- Tabs
- Select
- Toggle

不要让整个产品看起来像传统 shadcn Dashboard。

核心 Tracel / Radar UI 应自行设计。

---

## 3. 项目原则

### 3.1 Visualization First

优先级：

```text
Globe
→ Realtime presence
→ Contact
→ Journey
→ Detail
→ Supporting metrics
```

而不是：

```text
Charts
→ Metrics
→ Dashboard cards
→ Reports
```

---

### 3.2 Avoid SaaS Dashboard Aesthetic

避免：

- 大量圆角 Card
- 巨大渐变背景
- 五颜六色 KPI
- Dashboard template 风格
- 营销式玻璃拟态
- Neon cyberpunk
- “HACKING...” 类廉价科幻元素

Tracel 应该看起来更接近：

- telemetry console
- spacecraft control system
- observatory
- mission control
- scientific instrument
- intelligence visualization

科技感来自：

> **真实数据结构、空间信息、实时状态和精密排版**

而不是大量装饰。

---

## 4. Visual Language

整体：

```text
Minimal
Dark
Precise
Calm
Technical
Dense but readable
```

推荐：

- 黑色 / 接近黑色背景
- 深灰辅助层
- 极细边界
- 极少量强调色
- 等宽数字字体用于 telemetry 信息
- 普通 Sans Serif 用于正文
- 小号 uppercase system labels
- Coordinates / timestamps
- 微弱 grid
- subtle atmospheric effects

不要过度 Glow。

不要整个页面都是绿色 Hacker Terminal。

---

# 5. 页面结构

MVP 只需要一个核心页面：

```text
/
```

打开项目直接进入 Tracel Live。

不需要：

```text
/login
/signup
/settings
/sites
```

---

## 6. Tracel Live Layout

Desktop 优先。

大致结构：

```text
┌─────────────────────────────────────────────────────────────┐
│ TRACEL       ELYTRA.DEV                   21:42:17 UTC      │
├────────────────────────────────────────────┬────────────────┤
│                                            │                │
│                                            │ LIVE SIGNALS   │
│                                            │                │
│                 3D GLOBE                   │ Tokyo          │
│                                            │ Chrome         │
│                                            │ → /blog/ecs    │
│                                            │                │
│                                            │ London         │
│                                            │ Safari         │
│                                            │ → /projects    │
│                                            │                │
├────────────────────────────────────────────┴────────────────┤
│  CONTACTS  14        SIGNALS/MIN  37        STATUS  LIVE    │
└─────────────────────────────────────────────────────────────┘
```

布局可以根据实际视觉效果调整，不必严格遵守示意图。

核心要求：

- Globe 是视觉中心；
- Feed 是辅助信息；
- Metrics 存在但不能抢戏；
- 页面尽可能接近完整实时仪器界面。

---

# 7. Globe

使用 React Three Fiber / Three.js 实现。

## 基础能力

Globe 至少需要：

- Earth sphere
- country / geographic outline 或抽象地理边界
- longitude / latitude grid
- subtle atmosphere
- slow automatic rotation
- manual drag rotation
- zoom
- smooth camera movement

背景保持克制。

可以存在非常淡的：

- Stars
- Noise
- Coordinate grid

但不要变成太空游戏。

---

## 8. Contact Marker

一个 Visitor 在视觉层称为：

> **Contact**

代码层仍然使用：

```ts
Visitor
```

每个 Contact 根据：

```ts
latitude
longitude
```

显示在 Globe 上。

### Active Contact

显示：

- point
- pulse
- subtle glow
- optional label

新 Contact 出现时：

```text
small point
   ↓
pulse ring expands
   ↓
CONTACT DETECTED
   ↓
settles into active state
```

动画必须克制。

不要：

- 爆炸
- 大范围闪光
- 镜头疯狂飞过去

---

## 9. Contact States

Visitor 状态：

```ts
type VisitorStatus =
  | "online"
  | "idle"
  | "offline"
```

视觉表现应有区别。

例如：

```text
online
bright point

idle
dim point

offline
fade out
```

Visitor 离线后可以短暂保留，再逐渐消失。

---

# 10. Mock Visitor System

不要简单随机生成 经纬度。

准备一份真实城市坐标表。

至少包括：

```text
Tokyo
Singapore
Shenzhen
Hong Kong
Seoul
Osaka
San Francisco
Los Angeles
New York
Toronto
London
Paris
Berlin
Amsterdam
Sydney
Melbourne
```

可以继续增加。

---

## 11. Visitor Model

建立统一类型。

例如：

```ts
export interface Visitor {
  id: string

  location: {
    city: string
    country: string
    countryCode: string

    latitude: number
    longitude: number

    timezone: string
  }

  client: {
    browser: string
    browserVersion: string

    os: string
    osVersion?: string

    device: string

    screenWidth: number
    screenHeight: number
    viewportWidth: number
    viewportHeight: number
    devicePixelRatio: number

    language: string
  }

  acquisition: {
    referrer: string | null
    source: string
  }

  currentPage: {
    pathname: string
    title: string
  }

  status: "online" | "idle" | "offline"

  firstSeen: number
  lastSeen: number

  sessionStartedAt: number
}
```

字段可以合理扩展。

---

# 12. Visitor Journey

每个 Visitor 必须具有完整模拟 Journey。

例如：

```text
Google Search
      ↓
/
      ↓
/blog
      ↓
/blog/ecs
      ↓
/blog/render-graph
```

类型：

```ts
export interface JourneyEvent {
  id: string

  visitorId: string

  timestamp: number

  type:
    | "session_start"
    | "page_view"
    | "navigation"
    | "idle"
    | "session_end"

  pathname: string
  title: string

  previousPathname?: string

  referrer?: string
}
```

---

# 13. Visitor Lifecycle Simulation

Mock Visitor 不只是生成出来后静止。

每个 Visitor 应有生命周期。

例如：

```text
spawn
 ↓
session_start
 ↓
page_view
 ↓
wait 5–20s
 ↓
navigate
 ↓
wait
 ↓
navigate
 ↓
idle
 ↓
online
 ↓
session_end
 ↓
offline
```

每个 Visitor 的行为略有不同。

---

## 14. Simulation Engine

建立独立的 Mock simulation layer。

例如：

```text
mock/
├─ cities.ts
├─ visitors.ts
├─ pages.ts
├─ referrers.ts
├─ browsers.ts
├─ generator.ts
└─ simulation.ts
```

UI 不应该知道数据是真是假。

保持接口类似：

```ts
interface VisitorStream {
  subscribe(callback: (event: RadarEvent) => void): () => void
}
```

当前实现：

```text
MockVisitorStream
```

未来可以替换：

```text
SupabaseVisitorStream
```

而不需要重写 Globe UI。

---

# 15. Radar Event

统一实时事件模型。

例如：

```ts
export type RadarEvent =
  | {
      type: "visitor_joined"
      visitor: Visitor
    }
  | {
      type: "visitor_updated"
      visitor: Visitor
    }
  | {
      type: "visitor_left"
      visitorId: string
    }
  | {
      type: "page_view"
      visitorId: string
      event: JourneyEvent
    }
```

---

# 16. Simulation Controls

开发期间提供简单控制。

可以放在不抢眼的位置。

至少支持：

```text
Pause
Resume

Speed
1×
5×
20×
```

另外可以支持：

```text
Reset Simulation
Spawn Contact
```

这些主要用于开发和视觉测试。

---

# 17. Live Signal Feed

右侧或其他适当区域显示实时事件。

例如：

```text
21:42:13

JP / TOKYO

Chrome 154 · Windows
Google Search

→ /blog/render-graph
```

下一个：

```text
21:42:09

US / SAN FRANCISCO

Safari · macOS
Direct

→ /projects/aether-effect
```

要求：

- 新事件平滑进入；
- 最新事件在顶部；
- 列表限制最大数量；
- 不要无限增长 DOM；
- 能明显感受到系统一直在运行。

Feed 中不同事件可以略有差异：

```text
CONTACT DETECTED

PAGE VIEW

NAVIGATION

CONTACT LOST
```

但不要过度使用告警语言。

---

# 18. Visitor Selection

点击 Globe 上 Contact：

```text
Contact Marker
      ↓
Selected Visitor
      ↓
Visitor Detail Panel
```

选中以后：

- Marker 保持 selected state；
- Globe 可以轻微调整镜头；
- 打开 Detail Panel；
- Feed 不停止。

---

# 19. Visitor Detail Panel

至少展示：

## Identity

```text
CONTACT
8F3A91
```

以及：

```text
ONLINE
SESSION 03:42
FIRST SEEN 21:38:12
```

---

## Location

```text
Tokyo
Japan

35.6762 N
139.6503 E

Asia/Tokyo
```

---

## Client

```text
Chrome 154
Windows 11

Desktop
2560 × 1440
DPR 1.5
```

---

## Acquisition

```text
Google Search
```

或者：

```text
Direct
GitHub
Reddit
Bing
X
```

---

## Current Page

```text
/blog/render-graph
```

---

# 20. Journey Timeline

Detail Panel 中最重要的部分之一。

例如：

```text
21:38:12
SESSION START

↓

21:38:14
/
Home

↓ 18s

21:38:32
/blog

↓ 27s

21:38:59
/blog/ecs

↓ 1m 12s

21:40:11
/blog/render-graph
CURRENT
```

视觉应该像：

- telemetry timeline
- event trace
- flight log

而不是普通 Bootstrap Timeline。

---

# 21. Global Metrics

只放少量实时指标。

第一版：

```text
CONTACTS
14

SIGNALS / MIN
37

COUNTRIES
8

STATUS
LIVE
```

可选：

```text
SESSIONS
AVG SESSION
```

避免添加太多 Analytics KPI。

---

# 22. Header

简洁即可。

例如：

```text
TRACEL
ELYTRA.DEV

LIVE

21:42:17 UTC
```

可以包含非常克制的：

```text
● LIVE
```

---

# 23. Motion Design

Motion 是 MVP 的重点。

必须认真处理。

需要：

### Globe

- slow rotation
- inertia
- smooth zoom
- smooth camera transitions

### Contact

- spawn pulse
- fade
- selected state
- idle state

### Feed

- enter
- shift
- disappear

### Panels

- subtle slide / fade
- avoid exaggerated easing

### Numbers

Active Contacts 等数字变化时：

- subtle transition
- 不需要老虎机式动画

---

# 24. Performance

目标桌面环境：

```text
60 FPS
```

即使：

```text
100+
```

Contact 同时存在，也应该保持流畅。

注意：

- 不要给每个 marker 创建大量 React DOM；
- Globe 内对象尽可能批量处理；
- 限制 pulse 数量；
- 已结束动画及时销毁；
- 避免每帧触发 React state update。

---

# 25. Suggested Component Structure

例如：

```text
components/
└─ radar/
   ├─ RadarView.tsx

   ├─ globe/
   │  ├─ Globe.tsx
   │  ├─ Earth.tsx
   │  ├─ Atmosphere.tsx
   │  ├─ ContactLayer.tsx
   │  ├─ ContactMarker.tsx
   │  └─ GlobeCamera.tsx

   ├─ feed/
   │  ├─ SignalFeed.tsx
   │  └─ SignalItem.tsx

   ├─ visitor/
   │  ├─ VisitorPanel.tsx
   │  ├─ VisitorOverview.tsx
   │  ├─ VisitorClient.tsx
   │  └─ VisitorJourney.tsx

   ├─ telemetry/
   │  ├─ TelemetryMetric.tsx
   │  └─ StatusIndicator.tsx

   └─ controls/
      └─ SimulationControls.tsx
```

---

# 26. Suggested Core Structure

```text
src/
├─ app/
│  ├─ layout.tsx
│  ├─ page.tsx
│  └─ globals.css
│
├─ components/
│  ├─ ui/
│  └─ radar/
│
├─ radar/
│  ├─ types.ts
│  ├─ store.ts
│  ├─ stream.ts
│  └─ simulation/
│
├─ lib/
└─ styles/
```

具体目录可以根据框架默认结构合理调整。

不要为了严格遵守目录而牺牲代码质量。

---

# 27. State Management

第一版可以使用 Zustand 管理 Radar realtime state。

例如：

```ts
interface RadarState {
  visitors: Map<string, Visitor>

  events: RadarEvent[]

  selectedVisitorId: string | null

  paused: boolean
  speed: number
}
```

负责：

```text
visitor joined
visitor updated
visitor left
event added
selection
simulation state
```

Three.js animation state 不应全部塞进 React state。

---

# 28. Mock Data Quality

模拟数据必须让 Demo 看起来像真实网站。

不要生成：

```text
Visitor 1
Visitor 2
Visitor 3
```

使用类似：

```text
CONTACT A8F2
CONTACT 73D1
CONTACT C912
```

页面路径使用真实感较强的数据：

```text
/
/blog
/blog/ecs
/blog/render-graph
/blog/rendering-equation
/projects
/projects/aether-effect
/about
```

Referrer：

```text
Direct
Google
Bing
GitHub
Reddit
X
Discord
```

Browser：

```text
Chrome
Safari
Firefox
Edge
```

OS：

```text
Windows 11
macOS
iOS
Android
Linux
```

---

# 29. Demo Scenario

启动应用后：

初始存在大约：

```text
8–15
```

个在线 Visitor。

随后平均每几秒发生一个事件。

可能是：

```text
new visitor

existing visitor navigation

visitor idle

visitor reactivated

visitor left
```

不要让整个地球持续疯狂闪烁。

体验应像：

> 一个真实的小型网站当前正有十几个人活动。

---

# 30. Empty / Quiet Moments

系统不能只有事件发生时才好看。

即便暂时没有新事件：

- Globe 仍然缓慢转动；
- Active Contact 仍然存在；
- Clock 在运行；
- Existing visitors 可以偶尔 navigation；
- UI 有 subtle living state。

避免：

> 没有事件时整个页面像死掉了。

---

# 31. Responsiveness

MVP Desktop-first。

目标：

```text
1440p
4K
Laptop
```

尤其要适合：

> 长期挂在副显示器。

较窄屏幕时：

- Detail panel 可以 overlay；
- Feed 可以收缩；
- Globe 始终是核心。

手机端只要求基本可用，不需要第一阶段专门优化。

---

# 32. Accessibility

即使视觉高度定制，也需要：

- clickable marker 有可访问替代；
- Button 有 keyboard state；
- Tooltip 不承载唯一重要信息；
- Panel 有合理语义；
- 尊重 `prefers-reduced-motion`。

Reduced motion 时降低：

- globe auto rotation
- pulse
- camera transitions

---

# 33. Branding

产品名称始终：

```text
Tracel
```

内部实时可视化模块：

```text
Radar
```

代码可以使用：

```text
RadarView
RadarEvent
RadarStore
RadarSimulation
```

不要在面向用户的主品牌位置显示：

```text
Radar
```

---

# 34. Copy Style

文案简洁。

推荐：

```text
TRACEL

LIVE

CONTACTS
SIGNALS
JOURNEY
LOCATION
CLIENT
SESSION

CONTACT DETECTED
CONTACT LOST
```

避免：

```text
Welcome to Tracel!
Here you can see all your amazing analytics!
```

---

# 35. First Implementation Order

严格按照以下顺序推进。

## Phase 1 — Foundation

完成：

- Next.js project
- Tailwind
- shadcn
- base typography
- dark visual system
- Radar page shell

此时不要做其它 SaaS 页面。

---

## Phase 2 — Globe

完成：

- Three.js / R3F Globe
- Earth
- geographic lines
- atmosphere
- camera
- rotate
- drag
- zoom

优先把 Globe 本身做到视觉上成立。

---

## Phase 3 — Contacts

完成：

- mock city coordinates
- visitor generation
- contact marker
- spawn animation
- active state
- remove animation
- marker selection

---

## Phase 4 — Simulation

完成：

- Visitor lifecycle
- page navigation
- session timeline
- event stream
- pause/resume
- speed control

---

## Phase 5 — Interface

完成：

- header
- realtime metrics
- Signal Feed
- Visitor Detail
- Journey Timeline

---

## Phase 6 — Polish

重点处理：

- spacing
- hierarchy
- typography
- subtle animation
- transitions
- performance
- 4K appearance
- reduced motion
- responsive behavior

不要在这个阶段增加新产品功能。

---

# 36. MVP Acceptance Criteria

MVP 完成时应该满足：

### Visual

打开 `/` 后第一印象明显区别于：

```text
Google Analytics
Plausible
Umami
Admin Dashboard Template
```

Globe 必须成为明确视觉焦点。

---

### Realtime

不操作页面，也能持续看到：

```text
visitor appears
visitor navigates
visitor becomes idle
visitor leaves
```

---

### Interaction

用户能够：

1. 看到 Globe 上的 Contact；
2. 点击一个 Contact；
3. 查看 Location；
4. 查看 Client；
5. 查看 Current Page；
6. 查看完整 Journey；
7. 返回继续观察实时 Globe。

---

### Simulation

Mock 数据必须具有：

- realistic cities
- realistic browsers
- realistic OS
- realistic pages
- realistic referrers
- believable timing

---

### Performance

正常 Demo：

```text
10–50 active contacts
```

必须保持流畅。

目标：

```text
≈60 FPS
```

---

# 37. Most Important Requirement

如果实现过程中出现选择：

```text
增加一个功能
```

和：

```text
让 Globe / Contact / Journey 更漂亮
```

优先选择后者。

第一阶段的成功标准不是：

> “已经实现多少 Analytics 功能。”

而是：

> **“我是否愿意把 Tracel 全屏放在自己的 4K 副屏上一直开着看？”**

如果答案还是“不够想看”，就继续打磨 Radar，而不是开始接数据库。

---

# 38. After MVP

只有 Visual MVP 达到满意程度以后，再进入下一阶段。

下一阶段计划：

```text
Tracel MVP 1 — Real Website Telemetry
```

再实现：

```text
tracker.js
        ↓
collector
        ↓
Supabase PostgreSQL
        ↓
Supabase Realtime
        ↓
Radar VisitorStream
```

届时当前：

```text
MockVisitorStream
```

只需要替换为：

```text
RealtimeVisitorStream
```

核心 Radar UI 不应该重新设计。

---

# 39. Current Scope Summary

当前只做：

```text
TRACEL
   │
   └── RADAR
        │
        ├── Globe
        ├── Contacts
        ├── Signals
        ├── Visitor Detail
        ├── Journey
        └── Mock Realtime Simulation
```

当前不要做：

```text
Database
Auth
Real Tracking
Analytics
Billing
SaaS infrastructure
```

**Build the experience first.**
