# Tracel — Monorepo Migration & Architecture Handoff

> 2026-10-14 · Working directory: C:\dev\Projects\Tracel  
> **Decision: migrate the existing repository to the monorepo layout NOW.**  
> This is a task specification for Codex, not a claim that migration has already happened.

## 0. Immediate Codex assignment — perform the migration

Inspect the current repository, git status/diff, AGENTS.md and relevant code before editing. Then **actually migrate** the repository into the monorepo structure in §2, preserving its working website and new Activity Timeline. Do not merely describe the migration, add Rust crates next to the old root Next project, or defer moving the website until a later phase.

Deliver a working, maintainable base with:
- apps/web: the existing Next.js website, including both Radar (/), Activity Timeline (/timeline), assets, styling, tests and Cloudflare Pages deployment.
- apps/desktop: a lightweight Tauri 2 + React + Vite application scaffold, configured to consume the shared Timeline package. It is not yet a production collector. If SDK/toolchains are missing, create valid configuration/code and state what could not be run.
- packages/timeline: **actual reusable** framework-agnostic-to-Next React Timeline UI/domain logic extracted from the current src/tracel code. Avoid creating an empty placeholder package. Keep the web demo functioning via its mock data; the Desktop shell may also use mock data.
- crates: a Rust workspace with focused boundaries for agent/core/storage/query. Create compilable minimal foundations, not speculative implementations; each crate should have a real purpose. A very small agent binary is fine.
- docs: the architecture, data model, and collectors descriptions aligned with the current implementation and future direction.
- root npm workspace (npm workspaces is adequate; no need to install Nx/Turborepo/pnpm) and root Cargo workspace, with useful root scripts.

**Preserve all existing functionality and user work.** Prioritize safe, verified moves. Do not replace the timeline with a generic UI or rewrite its behavior as part of relocation.

### IMPORTANT: uncommitted work exists

At a previous inspection, git status contained modified src/tracel/Explorer.tsx, Timeline.tsx, model.ts, README.md, tests/tracel.test.ts; new src/app/timeline/page.tsx and src/tracel/overview.ts; and deletion of the old src/app/tracel/page.tsx. These could have changed. Run git status first. They are deliberate user edits; preserve content and behavior. Do not run git reset/clean, forcibly checkout files, delete untracked sources, or overwrite changes. If a migration conflicts, inspect and reconcile it.

## 1. Product contexts — keep the two domains separate

**Tracel** is the umbrella name/visual identity. The current repository contains two independent experiences:

### Radar / website visitor observability
- Website visitor map/3D globe, events, journeys, traffic and audiences.
- URL: /.
- Current source: src/radar, src/components/radar.
- Mock realtime simulation; no production site telemetry backend yet.
- Existing PROJECT.md, STYLE_GUIDE.md and README.md mostly document this original product. Keep their useful content; do not force Radar-specific features onto Activity.

### Activity / personal computer timeline
- Desktop-focused activity and performance explorer; URL /timeline in the website demo.
- Current source: src/tracel/ (Explorer, Timeline, model, analytics, mock data, CSS, display settings, overview, README).
- User goal: high-quality, continuous multi-track Timeline with range selection controlling Analytics.
- **Foreground**: grouped by exe/application, hover window title, URI, editor file/project context; context changes need not fragment the main app color.
- **Background Apps**: thin running-app lifetime track, expandable; not proof of actual background CPU work.
- **AFK**: independent thin idle track; can overlap foreground.
- **System metrics**: CPU, RAM, GPU; network receive/send; disk read/write; audio signal level; separately media playback intervals.
- First native release targets system metrics only. **Per-process/app metrics are deferred.**
- Browser/editor metadata should prefer native OS UI / UI Automation where possible; no mandatory extensions in initial scope.
- Windows first, privacy/local first, no keylogging, screenshots or raw audio capture.

The products may share visual tokens/UI utilities but **not a merged visitor/desktop telemetry data model**.

## 2. TARGET STRUCTURE — implement now

The tree below is the migration destination. Names may vary slightly only for clear technical reasons; explain deviations.

~~~text
Tracel/
├── apps/
│   ├── web/                       # Existing Next.js + Radar + /timeline demo
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── page.tsx       # Radar (/)
│   │   │   │   └── timeline/
│   │   │   │       └── page.tsx   # Activity demo (/timeline)
│   │   │   ├── radar/
│   │   │   └── components/
│   │   ├── public/
│   │   ├── scripts/
│   │   ├── next.config.ts
│   │   ├── package.json
│   │   └── tests/                 # Or redistribute to packages/timeline when sensible
│   │
│   └── desktop/                   # Tauri 2 application shell
│       ├── src/                   # Vite + React UI
│       ├── src-tauri/
│       │   ├── src/
│       │   ├── capabilities/
│       │   ├── Cargo.toml
│       │   └── tauri.conf.json
│       └── package.json
│
├── crates/
│   ├── tracel-agent/              # Background Windows interactive-user collector
│   ├── tracel-core/               # OS-neutral shared models and timestamp conventions
│   ├── tracel-storage/            # SQLite boundary and migrations (incremental)
│   └── tracel-query/              # Range queries, aggregation and LOD (incremental)
│
├── packages/
│   └── timeline/                  # Reusable timeline React UI, math, models, analytics
│       ├── src/
│       └── package.json
│
├── docs/
│   ├── architecture.md
│   ├── data-model.md
│   └── collectors.md
│
├── Cargo.toml                     # Rust workspace
├── package.json                   # npm workspace/root scripts
├── package-lock.json
├── AGENTS.md
├── README.md
├── CODEX_CONTEXT.md
└── .gitignore
~~~

A working desktop scaffold is preferred over an empty directory; however, **do not invent a fully operational collector, SQLite backend or Tauri IPC integration** merely to fill the structure. If a crate cannot usefully implement its eventual role in this pass, keep the code small, compiling and honest about placeholders. Don't introduce four crates with dozens of empty modules.

### Package boundaries

- **apps/web** owns Next.js App Router, Radar, current static Cloudflare export and a mock-data-driven preview. Do not import Node/Win32/native APIs into the web.
- **apps/desktop** owns Tauri lifecycle and desktop-specific interfaces, with a separate lean Vite/React bundle. Do **not** bundle Radar/MapLibre/Three.js into Desktop by default.
- **packages/timeline** owns reusable React visualization (Timeline, Explorer or reusable shell where appropriate), time-range math, data models and statistical helpers. It must not import Next.js app/router APIs, Cloudflare/MapLibre/Radar runtime, Windows APIs or Tauri IPC. App-specific data adapters belong near the application or in a clearly separated mock adapter.
- **tracel-core** owns native OS-neutral entities/observations and metric semantics; no Tauri/UI/SQLite/Win32 coupling.
- **tracel-agent** owns collectors, scheduling and interval construction; later uses storage. Runs in logged-in user session, not initially as Session 0 Windows Service.
- **tracel-storage** owns SQLite schema/migrations/write/read abstractions as implemented; prefer SQLite WAL and efficient batched writes in production.
- **tracel-query** owns native time-range access, resolution reduction and analytics; eventually invoked through Tauri IPC.
- Separate process lifetime from Tauri window lifetime: collector must eventually keep tracking when UI closes. Choose an explicit strategy later, not a pretend always-running service now.

The TS/Rust domain models need compatible **semantics**, not necessarily a generated shared source of truth on day one. Avoid premature code generation tooling.

## 3. Current repository facts (inspected before migration)

- Next.js ^16, React ^19, TypeScript ^5.9, Tailwind 4, Zustand 5, Lucide; Radar uses MapLibre and React Three Fiber.
- next.config.ts uses output: "export". Deployment runs npm build + Wrangler Cloudflare Pages publish from out/.
- Root npm scripts include predev/prebuild worker prep, dev, build, deploy, typecheck and test.
- README.md / PROJECT.md are Radar-biased; STYLE_GUIDE.md contains useful common visual values but much Radar-specific UX.
- src/tracel/model.ts defines Range, Subject (system/process/application/device), Capture, ActivityInterval, MetricSample, Context and Media.
- src/tracel/data.ts offers reproducible Oct 8–14 2026 mock data; 30-second sample period and ~20,160 system metric observations.
- src/tracel/Timeline.tsx is already a shared-DPR Canvas-based, interactive multi-track timeline with zoom, selection, hover, collapsible tracks and resize.
- src/tracel/Explorer.tsx includes controls, analysis tabs and display settings; analytics.ts implements time-range statistics.
- Existing tests: tests/analytics.test.ts, tests/simulation.test.ts (Radar), tests/tracel.test.ts (Activity).
- Root AGENTS.md currently contains a Next-generated requirement to check the installed version's docs before using nontrivial Next APIs. Preserve this requirement in the apps/web context if relocating root agent guidance.

**These are descriptions of the pre-migration code; verify current contents rather than assuming unchanged state.**

## 4. Migration approach and integration details

Execute as a coherent migration, avoiding partial broken states:

1. Inspect Git status and identify changed/new files. Snapshot the initial state in your response; do not use destructive Git commands.
2. Move Next app and website-only scripts/config/asset sources to apps/web. Update TS aliases, Next setup, Tailwind styles, generated Next docs location, test import paths, maplibre worker preparation paths, and static output assumptions.
3. Create root **npm workspaces** for apps/web, apps/desktop, packages/timeline. Keep dependency versions compatible and prefer one root package-lock.json. Provide clear root commands for web dev/build/test and desktop dev/build. Don't introduce a heavyweight task orchestrator.
4. Extract a **real reusable timeline package** from existing Activity sources. Do this incrementally, preserving Canvas interactions, styling and test coverage. The web /timeline route should render from the new shared package via its mock provider. Desktop may show the same component/experience using demo data; never couple the shared package to Next APIs.
5. Set up apps/desktop as a minimal Tauri 2 + React/Vite shell; avoid Radar assets and Next.js runtimes. Ensure desktop uses local mock data initially, with future native-provider interface.
6. Set up root Cargo workspace with meaningful small crate scaffolds and relevant compile/test checks. Choose a workspace membership approach for apps/desktop/src-tauri; avoid accidental duplication, inconsistent dependency resolution or recursive workspace mistakes.
7. Update root .gitignore for root and nested node_modules, .next, out, dist, target, src-tauri/target, generated map worker, test assets and local runtime. Never accidentally track a local telemetry database.
8. Fix Cloudflare deploy command/workdir after move. Verify Next static export still goes to the intended apps/web/out; ensure deployment script points to this exact location (or runs from apps/web).
9. Write docs/architecture.md, docs/data-model.md and docs/collectors.md concise and accurate: explicitly distinguish current implementation vs future proposals. Update README with working commands and both URLs. Keep AGENTS.md short and route Codex to docs; preserve Next generated agent note appropriately.
10. Test the migrated site and scaffolds. Fix regressions. When something cannot run due to missing SDK/tooling, report it explicitly and do not claim success.

### Web / Desktop reusability caution

Shared React components should depend on standard web APIs only. Desktop queries later go through a separate adapter, such as Tauri IPC. Do **not** make the browser build import native modules. CSS tokens and icons can be shared where useful, but Radar's global CSS must not contaminate the Desktop bundle.

### Next static export caution

Watch Next 16 behavior, its generated agent instructions, App Router module resolution for symlinked workspace packages, Tailwind scanning after package moves, MapLibre worker generation, public assets, and Cloudflare Wrangler paths. Review the installed Next documentation if required by the existing AGENTS file.

## 5. Data model: design intent (do not overbuild today)

Core dimensions:
- **Identity**: Application / Process instance / Window instance. PID and HWND can be reused; IDs must be durable and distinct.
- **Intervals**: foreground, background run state, AFK, context, playback. Use half-open [start,end) and correct clipping. AFK overlaps foreground legitimately.
- **Metrics**: sampled quantities with Subject + unit + sampling interval, null/missing data and source/quality. Initial collectors target system only.
- **Events**: discrete markers like process start, window switch, sleep/wake and capture interruption.
- **Rollups**: time-weighted mean support, min/max, coverage and byte totals, with LOD to avoid shipping whole history to UI.

System is **not** an App. Share a metric Subject abstraction with kinds system/process/application/device, but allow separate efficient SQLite tables (system_samples vs future process_samples). Default network/disk capture should preserve measured bytes per interval if possible (so totals are meaningful); audio activity vs media metadata should remain separate. Process I/O ≠ physical disk throughput; CPU use ≠ power draw.

A real database should use UTC timestamps; the current demo's epoch-relative seconds are acceptable for UI math but should have an explicit conversion boundary.

### Data provider direction

The prototype currently has load(): Promise<Capture> and loads the whole mock Capture. Eventually support on-demand range/LOD APIs for large histories, e.g.:

~~~ts
interface TracelDataProvider {
  getActivities(range: TimeRange): Promise<ActivityInterval[]>;
  getMetrics(query: {
    range: TimeRange;
    subject: Subject;
    maxPoints?: number;
  }): Promise<MetricSeries[]>;
  getAnalytics(range: TimeRange): Promise<RangeAnalytics>;
}
~~~

Treat this as a design example, not an instruction to break the existing demo APIs needlessly during migration. A MockDataProvider and eventual LocalDataProvider should fulfill the same contract; don't ship millions of historical points to React.

## 6. Verification and non-goals

**Checks to attempt after migration:**
- root install from a clean npm workspace lockfile.
- npm web dev path and both / and /timeline pages (manual/browser inspection if available).
- web TypeScript check, current Radar/Activity unit tests, static Next build and Cloudflare-export artifact.
- shared timeline package compile/consumption from both apps.
- desktop Vite build, cargo check/test on Rust workspace and (if available) Tauri build/dev.
- npm deployment command correctness (do not perform a live Cloudflare production deployment without explicit user request).
- git diff/status to confirm all user changes survived.

**Do not do in this phase:**
- Full Windows API collector, process-wide sampling, browser extensions, data upload, server backend, authentication/billing.
- Rewriting Radar, replacing Canvas Timeline, redesigning its UX, or modifying arbitrary marketing pages.
- Implementing a finished database/data-retention system or Windows Service before its contract is validated.
- Clearing git state, deleting legacy docs, or moving code without fixing consumers.

## 7. Prompt to execute (if Codex needs a short instruction)

> Read CODEX_CONTEXT.md and AGENTS.md, inspect the existing repo and git status, then **perform the monorepo migration now** as specified in §§0–4. Move the Next.js Radar + Timeline website to apps/web, create the Tauri/Vite desktop scaffold, extract a genuinely reusable packages/timeline, set up the root npm and Cargo workspaces with Rust crates, and write concise docs. Preserve the entire existing user worktree and both UI experiences. Fix moved imports, tests, Tailwind, Next build/export, and Cloudflare paths; run relevant checks. Do not implement full native data collection yet. Report precise changes, validations and any environment blockers.
