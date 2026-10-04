# Tracel Style Guide

**Product:** Tracel  
**Core feature:** Radar  
**Design direction:** Industrial Telemetry Interface  
**Status:** Visual MVP  
**Principle:** Hard-edged, restrained, industrial — not busy, not theatrical.

> Tracel should feel like a real operational telemetry system that happens to look futuristic, not a futuristic concept UI pretending to be operational.

---

## 1. Design Intent

Tracel is a real-time website visitor observability interface.

Its visual identity should sit between:

- industrial control systems
- avionics / mission-control interfaces
- scientific telemetry
- geographic intelligence systems
- modern developer tools

It should **not** look like:

- a generic SaaS dashboard
- Google Analytics / Plausible / Umami
- a cyberpunk HUD
- a game UI
- a military cosplay interface
- a Dribbble concept full of decorative telemetry

The visual system should communicate:

```text
Precise
Operational
Technical
Calm
Dense but readable
Industrial
Hard-edged
Reliable
```

The interface should be something a user is willing to leave open on a 4K secondary monitor for hours.

---

## 2. Current Information Architecture

The current Radar layout is considered correct and should be preserved unless usability testing reveals a clear problem.

```text
┌──────────────────────────────────────────────┬──────────────┐
│                                              │              │
│                    RADAR                     │ LIVE EVENTS  │
│               Map / Globe                   │              │
│                                              │              │
├───────────────────────────────┬──────────────┴──────────────┤
│            TRAFFIC            │           AUDIENCE          │
│          time-series          │           rankings          │
└───────────────────────────────┴─────────────────────────────┘
```

The information hierarchy is:

1. **Radar / spatial activity** — primary visual focus
2. **Live events** — what is happening now
3. **Traffic** — how activity changes over time
4. **Audience** — ranked aggregate context

Do not redesign this into a conventional sidebar + cards dashboard.

---

## 3. Core Visual Principle

### 3.1 Modules, not Cards

Tracel should not be composed of floating SaaS cards.

Avoid:

```text
╭────────────────────╮
│ Traffic            │
│                    │
│ chart              │
╰────────────────────╯
```

Prefer:

```text
TRAFFIC
──────────────────────
telemetry plot
```

A **module** is part of one larger instrument panel.

A module may have:

- a thin structural border
- a clear header zone
- internal alignment
- shared edges with neighboring modules
- restrained separators

A module should not rely on:

- large corner radius
- shadow
- blur
- floating elevation
- ornamental container backgrounds

### 3.2 Rectilinear, not ornamental

Use:

- hard rectangular geometry
- aligned edges
- grid-based layout
- small or zero radius
- precise spacing

Do not overdo:

- cut corners
- fake armored plates
- arbitrary diagonal edges
- decorative brackets around everything

The UI should feel engineered, not decorated.

---

## 4. Restraint

The interface must not fill empty space with decorative telemetry.

> Empty space is allowed.

Do not add visual elements simply because an area looks empty.

Avoid unnecessary:

- long decorative rules
- crosshairs
- corner brackets
- fake coordinate marks
- random dots
- fake serial numbers
- scanlines
- warning stripes
- tiny technical labels with no meaning

Every line should have a purpose:

1. structure
2. data
3. interaction state

If a line does none of these, remove it.

---

## 5. Color System

Tracel uses neutral structure colors and a small number of functional colors.

### 5.1 Role-based palette

```css
:root {
  --tracel-bg: #070b0d;
  --tracel-surface-1: #0b1013;
  --tracel-surface-2: #10161a;
  --tracel-surface-3: #151c21;

  --tracel-border: #263138;
  --tracel-border-subtle: #1b252b;
  --tracel-grid: #182229;

  --tracel-text: #e7ecef;
  --tracel-text-secondary: #9ba9b1;
  --tracel-text-muted: #65747d;

  --tracel-live: #79d8bd;
  --tracel-live-dim: #3e806f;

  --tracel-accent: #e86d32;
  --tracel-accent-dim: #8f4326;

  --tracel-info: #6f9fbe;
  --tracel-danger: #d5584d;
}
```

Exact values may be adjusted after visual testing, but **color roles must stay stable**.

### 5.2 Color meaning

#### Off-white / steel
Used for:

- primary text
- map borders
- ordinary structural information
- neutral values

#### Mint / pale cyan
Used for **live data**:

- online visitors
- live visitor points
- current activity
- page-view line
- live state

Mint is **not the brand color**.

#### Tactical orange
Used for **interaction and focus**:

- selected visitor
- active mode
- selected time range
- current replay cursor
- important system control
- key highlight

Orange should be sparse.

#### Red
Reserved for:

- real errors
- broken state
- critical warnings

Do not use red decoratively.

---

## 6. Typography

Typography is one of the main sources of Tracel's industrial character.

Do not rely on a single font style for everything.

### 6.1 Recommended font stack

#### Interface / module typography

Preferred:

- **IBM Plex Sans Condensed**

Alternatives:

- Roboto Condensed
- Inter Tight
- DIN-style condensed sans
- Geist Sans where condensed text is unnecessary

Use for:

- module labels
- controls
- compact navigation
- short headings

#### Telemetry / data typography

Preferred:

- **IBM Plex Mono**

Alternatives:

- Geist Mono
- JetBrains Mono

Use for:

- timestamps
- visitor IDs
- coordinates
- counts
- percentages
- screen resolution
- browser versions
- numerical axes
- technical metadata

#### Body / readable text

Preferred:

- Geist Sans
- Inter
- IBM Plex Sans

Use for:

- city names
- browser names
- event descriptions
- readable labels
- longer helper text

### 6.2 Uppercase policy

**Do not make the entire interface uppercase.**

Uppercase is reserved for short machine-like labels.

Good:

```text
TRACEL
RADAR
LIVE
STATUS
UTC
PAGE VIEWS
ONLINE
```

Normal case should be used for readable content:

```text
Live events
Traffic
Audience
San Francisco
Visitor arrived
Page view
Google Search
Windows 11
```

### 6.3 Type hierarchy

#### Brand

```text
TRACEL
```

- uppercase
- moderate tracking
- strong but not oversized

#### Module label

```text
RADAR
TRAFFIC
AUDIENCE
EVENTS
```

- compact
- uppercase
- condensed
- small
- visually secondary to data

#### Module title / readable heading

```text
Live events
Visitor activity
Traffic
Audience
```

- normal case
- larger than labels
- readable sans

#### Data

```text
16:35:38
8F3A
35.6762° N
209
17%
```

- mono
- tabular numerals
- tightly aligned

#### Content

```text
San Francisco
Chrome 154
Windows 11
/blog/render-graph
```

- normal case
- readable sans or mono where technical

---

## 7. Spacing

Use a compact but breathable spacing system.

Base unit:

```text
4 px
```

Recommended scale:

```text
4
8
12
16
24
32
48
```

General rules:

- internal telemetry spacing can be tighter
- major module boundaries need more breathing room
- do not compensate for poor hierarchy by adding more borders
- dense information should still have stable columns and consistent rhythm

The target is:

> high information density, low visual clutter

---

## 8. Radius

Tracel should feel square and engineered.

Recommended:

```css
--radius-xs: 2px;
--radius-sm: 3px;
--radius-md: 4px;
```

Use larger radius only where platform conventions strongly benefit usability.

Avoid:

- 8–16 px SaaS card radii
- pill-shaped containers for normal controls
- excessive rounded tabs

Pills are acceptable only for naturally binary/status elements when they improve comprehension.

---

## 9. Borders and Lines

Lines must communicate structure.

### 9.1 Keep

- primary module boundaries
- table row separators
- chart grids
- active-tab underline
- focused/selected object outlines

### 9.2 Avoid

- full-width decorative orange rules
- redundant separators below every title
- nested borders around every sub-element
- corner decoration with no function
- multiple parallel lines for "military" effect

### 9.3 Hierarchy

```text
Primary module boundary    strongest
Data separator             medium
Grid / helper line         subtle
Decorative line            usually none
```

Do not let grid lines compete with content.

---

## 10. Panels

A Tracel panel should feel like an instrument module.

Panel characteristics:

- flat
- hard-edged
- low contrast surface differentiation
- thin border
- strong internal alignment
- compact title region
- no drop shadow

Example:

```text
Traffic                         12 online · 209 page views
──────────────────────────────────────────────────────────

telemetry chart
```

The header separator is optional.

Prefer spacing over separators whenever spacing alone is sufficient.

---

## 11. Controls

Controls should feel operational, not like startup UI.

### 11.1 Avoid

- oversized buttons
- strong pill shapes
- colored filled buttons everywhere
- rounded segmented controls
- glossy or glass-like surfaces

### 11.2 Prefer

Rectangular mode selectors:

```text
Map   Globe
```

or compact system selectors:

```text
VIEW
Map / Globe
```

Active states should use:

- orange underline
- orange border segment
- restrained orange text
- small state indicator

Do not fill the whole control orange unless it is a destructive or very strong action.

### 11.3 shadcn/ui

shadcn/ui may provide behavior and accessibility, but Tracel should override its default visual appearance.

Do not leave default shadcn:

- Card
- Badge
- Tabs
- Button
- Select

styling untouched.

The product must not look like a shadcn template.

---

## 12. Header

The top header is a **system bar**, not a marketing navigation bar.

Recommended information:

```text
TRACEL
elytra.dev

DATA     Simulated
STATUS   ● Live
TIME     16:35:40 UTC
RATE     1×
VIEW     Map / Globe
```

The final layout can be more compact.

The header should communicate:

- current site
- current state
- time
- simulation/replay mode
- current visualization mode

Avoid adding unrelated navigation unless necessary.

---

## 13. Radar / Map

The Radar is the visual center of Tracel.

### 13.1 Base map

The base geography should stay quiet.

Use:

- near-black ocean
- dark graphite land
- subtle steel borders
- restrained administrative outlines

Do not make whole countries bright simply because they contain visitors.

The map is the **instrument surface**.

Data is the **signal**.

### 13.2 Visitor markers

Default visitor:

- pale mint / cyan point
- small glow
- optional restrained pulse

New visitor:

- short pulse
- brief emphasis
- no explosion

Selected visitor:

- tactical orange
- stronger outline
- persistent selected state

Idle visitor:

- dimmed live color

Offline visitor:

- fade and disappear

### 13.3 Labels

Labels should be sparse.

Show only:

- selected visitor
- important cluster
- hovered/focused city
- high-value live event

Avoid labeling every active city at once.

### 13.4 Arcs

Connection arcs are allowed only when they convey real information.

Good examples:

- visitor journey replay
- referrer → destination relation
- highlighted flow
- selected event path

Do not draw random world-spanning arcs simply because they look futuristic.

### 13.5 Coordinate UI

Coordinates can reinforce the telemetry feel, but only when useful.

Use mono typography for:

```text
35.6762° N
139.6503° E
```

Do not flood the map with unnecessary coordinate readouts.

---

## 14. Live Events

The event feed should feel like an operational event log.

Each item should have a clear hierarchy:

```text
Visitor arrived                         16:35:37

Berlin
Safari · iOS
/blog/ecs
```

Optional machine metadata:

```text
DE
2A56
390×844
```

### 14.1 Event types

Prefer readable names:

- Visitor arrived
- Visitor left
- Page view
- Navigation
- Visitor idle

Do not force every event name into uppercase.

A small uppercase machine label may exist above the readable event title if useful.

### 14.2 Event styling

Use:

- hard row separators
- compact spacing
- mono timestamps
- restrained state marker
- predictable columns

Avoid:

- chat-bubble styling
- colored cards
- giant icons
- one color per event type

---

## 15. Traffic

The Traffic module is a telemetry plot, not a marketing analytics chart.

### 15.1 Keep

- time-series lines
- subtle grid
- clear axis ticks
- compact legend
- current time marker
- selected time range

### 15.2 Avoid

- heavy gradient fills
- large soft areas
- oversized markers
- colorful chart palettes
- excessive smoothing

Recommended data colors:

```text
Page views       mint
Online visitors  steel blue
Current cursor   orange
```

Grid and axes should remain subtle.

### 15.3 Chart typography

Use mono for:

- axis values
- timestamps
- exact values

Use readable sans for:

- series names
- module title

---

## 16. Audience

Audience should look like a ranked telemetry table.

Recommended structure:

```text
#    CC   Country         Visitors      %
01   AU   Australia             2      17%
02   BR   Brazil                1       8%
03   DE   Germany               1       8%
```

Bars may be used sparingly.

Use:

- aligned columns
- mono numerical data
- country code
- subtle row separators
- one restrained accent

Avoid:

- striped tables
- card rows
- giant flags
- colorful badges

Tabs such as:

```text
Countries
Cities
Browsers
Sources
Pages
```

should remain compact.

---

## 17. Metrics

Do not turn every number into a KPI card.

Prefer inline telemetry:

```text
12 online
209 page views
8 countries
```

or compact metric slots.

Good:

```text
VISITORS
12
```

Bad:

```text
╭─────────────────────╮
│ Total Visitors      │
│                     │
│ 12                  │
│ +18% vs yesterday   │
╰─────────────────────╯
```

unless such historical comparison becomes genuinely useful later.

---

## 18. Motion

Motion should feel like instrument feedback.

Keywords:

```text
precise
measured
subtle
operational
```

### 18.1 Use

- short fade
- restrained pulse
- controlled slide
- camera interpolation
- small number transition
- subtle line reveal

### 18.2 Avoid

- bounce
- springy overshoot
- elastic motion
- large glow bursts
- continuous decorative animation
- aggressive zooming
- camera movement on every event

### 18.3 Timing

Typical UI transitions:

```text
120–220 ms
```

Spatial/map transitions may be slower:

```text
250–600 ms
```

Use easing that feels controlled rather than playful.

---

## 19. Glow

Glow is allowed only around live spatial data.

Good:

- active visitor
- selected visitor
- radar pulse

Avoid glow on:

- text
- borders
- buttons
- module titles
- every chart line

Glow should help answer:

> Where is live activity happening?

It should not be a general visual effect.

---

## 20. Icons

Use simple geometric icons.

Characteristics:

- thin or medium stroke
- square geometry
- minimal detail
- no cartoon style

Icons are secondary to typography.

Prefer text where the meaning is already clear.

Do not fill the interface with icons simply to make it look technical.

---

## 21. Status Language

Use real product language.

Preferred:

```text
Live
Paused
Simulated
Online
Idle
Offline
Page view
Navigation
Visitor arrived
Visitor left
```

Avoid military cosplay terminology such as:

```text
TARGET LOCKED
THREAT LEVEL
HOSTILE
TACTICAL ACQUISITION
MISSION CRITICAL
```

unless Tracel later gains a feature where those concepts genuinely make sense.

The design may feel tactical.

The copy should remain accurate.

---

## 22. Naming

Public product:

```text
Tracel
```

Core visualization feature/page:

```text
Radar
```

Recommended route:

```text
/radar
```

Radar can support:

```text
Live
History
Replay
Custom range
```

`Live` is a time mode, not the page identity.

Core product terminology:

```text
Visitor
Session
Event
Journey
Traffic
Audience
```

Prefer these over metaphorical replacements such as `Contact` or `Signal` unless used sparingly as stylistic secondary language.

---

## 23. Responsive Behavior

Desktop is the priority.

Primary targets:

- laptop
- 1440p
- 4K
- secondary-monitor use

### Wide layout

Preserve:

```text
Radar + Events
Traffic + Audience
```

### Narrow layout

Possible adaptation:

```text
Radar
Events
Traffic
Audience
```

Visitor detail may become an overlay or sheet.

Do not shrink typography until telemetry becomes unreadable.

---

## 24. 4K Behavior

The interface must not simply scale everything up.

At 4K:

- increase available spatial context
- show more rows where useful
- allow more map detail
- preserve compact typography
- keep line thickness visually restrained
- avoid giant empty cards

Use responsive constraints so the interface still feels like a control surface.

---

## 25. Accessibility

Industrial style does not override usability.

Requirements:

- adequate text contrast
- selected state must not rely only on color
- focus state must be visible
- clickable map markers need accessible alternatives
- reduced-motion support
- controls must work with keyboard
- tooltips cannot contain the only copy of important data

For `prefers-reduced-motion`:

- disable/reduce auto-rotation
- reduce pulses
- reduce camera transitions
- disable decorative motion

---

## 26. Anti-patterns

Do not introduce the following without a strong reason:

### SaaS styling

- rounded cards everywhere
- gradient hero backgrounds
- glassmorphism
- colorful KPI cards
- big soft shadows
- pill-heavy interfaces

### Fake sci-fi styling

- random HUD lines
- fake serial codes
- large crosshair overlays
- constant scanlines
- animated noise
- random world arcs
- excessive orange warning stripes

### Cyberpunk styling

- neon purple
- neon pink
- cyan glow everywhere
- chromatic aberration
- glitch effects

### Military cosplay

- target/hostile terminology
- excessive threat colors
- weapon-system metaphors
- dramatic alert animation

---

## 27. Tracel Visual Formula

The target look can be summarized as:

```text
70% industrial telemetry
20% modern developer tool
10% future-military influence
```

Not:

```text
70% sci-fi HUD
20% cyberpunk
10% usable software
```

---

## 28. Design Review Checklist

Before approving any Tracel UI change, ask:

### Structure

- Does this element have a real information or interaction purpose?
- Could spacing replace this separator line?
- Does this feel like a module or like another SaaS card?

### Typography

- Is uppercase actually necessary?
- Is readable content using normal case?
- Are numeric values aligned and easy to scan?

### Color

- Is mint being used for live data?
- Is orange being reserved for selection/focus?
- Is any color being used decoratively without meaning?

### Motion

- Does this motion communicate state?
- Would the UI still work without the animation?
- Is it calm enough to leave open for hours?

### Density

- Is the interface information-dense but visually calm?
- Did we add visual decoration just to fill empty space?

### Identity

- Does this still look like Tracel?
- Does it look operational rather than theatrical?
- Would this feel credible as a real telemetry system?

---

## 29. Codex Implementation Guidance

When implementing the Visual MVP:

1. Preserve the current major layout.
2. Do not add new product features during the style pass.
3. First update typography and colors.
4. Then update borders, controls, and module styling.
5. Then update map styling.
6. Then refine Traffic and Audience.
7. Finally refine motion.

Do not redesign everything at once.

The style pass should be measurable as:

```text
same product
same information
same interaction
much stronger identity
```

---

## 30. Final Principle

> **Hard-edged, restrained, industrial — not busy, not theatrical.**

The strongest Tracel screen should not look impressive because it contains many decorations.

It should look impressive because:

- the data is real,
- the hierarchy is precise,
- the spatial visualization feels alive,
- the typography feels engineered,
- and every visual element appears intentional.
