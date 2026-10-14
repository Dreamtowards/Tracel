# Activity & Performance Explorer

Shared React UI consumed by the Next.js `/timeline` demo and the Vite/Tauri Desktop shell. All styles are scoped to `tx-*`. The package imports no Next.js, Radar, Node or Tauri APIs. Consumers compile its TypeScript source directly.

Use `import { Explorer } from "@tracel/timeline"` and pass a stable `DataProvider` as `provider`. The deterministic demo adapter is a separate `@tracel/timeline/mock` entry point. Set `homeHref="/"` in Desktop. Explorer imports its scoped CSS; each host provides a box-sizing/body/button/link reset. Core models and analytics are also available as `@tracel/timeline/model` and `@tracel/timeline/analytics` without a React client boundary.

## Host integration

Explorer also accepts optional framework-neutral `railExtra`, `pageContent`, `onShowTimeline` and `captureLabel` host props. Desktop uses these for Settings and System metrics without importing native APIs into this package. Its native readings remain separate from the mock Capture.

## Structure

- `model.ts`: interval types, subject abstraction, relative-second time coordinates and viewport math.
- `data.ts`: asynchronous `DataProvider` with a deterministic in-memory capture, October 8–14, 2026 (UTC+08:00). Replace `demoProvider` with a backend adapter later.
- `analytics.ts`: clipped foreground/AFK/media durations, app transitions, time-weighted metrics and throughput integrals. Metric samples use a 30-second sample-and-hold model; null means missing, zero means observed zero.
- `Timeline.tsx`: one DPR-aware Canvas for all tracks, DOM labels/resizers and a portal tooltip. Shared viewport, selection and cursor; visible sample slicing and per-pixel min/max envelopes preserve performance peaks. Hover updates DOM refs without rerendering the page.
- `Explorer.tsx`: overview navigation, date/range controls, Inspector, app focus and JSON export.

## Interaction

Scroll zooms around the pointer. Shift-scroll, Alt-drag, middle-button drag or the Hand tool pans. The default drag selects a range; a click focuses an application. Selection persists across viewport changes. The Inspector can clear or zoom to a selection. Arrow keys pan the focused canvas; `+` / `-` zoom; Escape clears selection.

Foreground context is expanded by default. Expand Background apps for compact individual running lifetimes excluding foreground slices; the collapsed view shows one colored stripe per application. Display settings control lane padding, background row height, context brightness and duration labels for the current session. Track groups collapse; drag the bottom edge of a label to resize a track (or focus its separator and use Up/Down). The overview strip supports click/drag navigation and arrow keys. App rankings focus the same application's timeline intervals.

## Validation and limits

Run `npm run typecheck`, `npm test`, `npm run build`. `tests/tracel.test.ts` covers overlap clipping, AFK, weighted integration, missing-vs-zero samples, media and anchored viewport math.

The prototype has seven days, 210 foreground intervals and 20,160 metric samples, covering early morning, work, evening and late-night sessions. Day defaults to 06:00–24:00; roughly 01:15–06:30 remains genuine sleep. It supports continuous week-to-two-second viewport zoom; zooming beyond the 30-second sample resolution does not invent higher-resolution measurements. Week view aggregates tiny app intervals. Context labels appear whenever their interval has enough pixel width. Sleep and capture gaps have no metric data. Only system metrics are generated. No OS collector, per-process measurements, persistent storage or month-sized capture is implemented.

The repository did not have an ESLint script/toolchain. The new TypeScript files were checked with temporary ESLint + typescript-eslint recommended rules, without modifying package dependencies. Browser interaction checks and desktop/narrow screenshots are local artifacts in the ignored `.tracel-runtime` directory.
