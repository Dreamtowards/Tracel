# Tracel

Tracel contains two independent experiences: **Radar**, a simulated website visitor map/globe at `/`, and **Activity**, a personal computer activity/performance explorer. The website `/timeline` and Desktop browser preview use demo data; native Desktop Timeline displays real observations persisted in SQLite. The Windows client also offers opt-in real CPU/RAM/network/disk/audio/media collection, Settings and power tools (including AC/DC Windows display timeouts).

## Layout

- `apps/web`: Next.js static website, Radar, assets, web tests and Cloudflare Pages.
- `apps/desktop`: Tauri 2 + Vite + React client with the shared Activity Timeline, persistent native system metrics, Settings and diagnostics; no Radar.
- `packages/timeline`: original Canvas Timeline, Explorer, display settings, models, analytics, isolated mock provider and Activity tests.
- `crates/tracel-core`: OS-neutral observations and UTC timestamp conventions.
- `crates/tracel-agent`: selective Windows system collectors and foreground snapshot library; optional one-shot CLI.
- `crates/tracel-storage`: SQLite archive, transactional migrations, atomic writes and bounded range queries.
- `crates/tracel-query`: clipped time-weighted gauge aggregation; range/LOD transport deferred.

## Develop

Use Node.js 22.12+ and npm workspaces with one root lockfile:

```sh
npm ci
npm run dev
```

Open [Radar](http://127.0.0.1:3000/) or [Activity](http://127.0.0.1:3000/timeline).

```sh
npm run dev:desktop:ui       # Vite at http://127.0.0.1:1420
npm run dev:desktop          # Native Tauri window; requires platform SDKs
npm run agent                # Collector help; no continuous background service
cargo run -p tracel-agent -- --sample     # One real CPU/RAM observation
cargo run -p tracel-agent -- --foreground # One foreground window snapshot
```

Windows native builds require Rust MSVC, Microsoft C++ Build Tools/Windows SDK and WebView2. The client follows the [Tauri 2 configuration reference](https://v2.tauri.app/reference/config/). Native builds default to an executable without an installer; portable ZIP packaging is available. Closing the window exits the client; independent agent lifetime is future work. See the [Desktop release guide](apps/desktop/README.md).

## Verify and build

```sh
npm run typecheck           # Web, Desktop and shared Timeline
npm test                    # Radar, Activity and Desktop export tests
npm run build               # Web static export + Desktop Vite bundle
npm run check:rust          # Entire Cargo workspace, including Tauri
npm run test:rust
npm run build:desktop:native # Native executable only; no installer
npm run build:desktop:portable # Windows executable + extract-and-run ZIP
npm run build:desktop:installer # Optional NSIS installer; explicit request only
```

`npm run verify` combines TypeScript, unit tests, frontend builds and Rust checks/tests. `check:core` and `test:core` target the four foundation crates without UI SDKs. Bare `cargo check`/`cargo test` default to those four crates. All five packages share root Cargo.lock and target output.

`build:web` writes `apps/web/out/`; `build:desktop` writes `apps/desktop/dist/`. Preview the web export with a static HTTP server. Web predev/prebuild prepares matching MapLibre worker/shared modules in ignored `apps/web/public/maplibre/`.

## Deploy

From root, `npm run deploy` builds Web and runs Wrangler in `apps/web`, publishing its `out` directory to the existing Cloudflare Pages `tracel` project, branch `main`. Authenticate with Wrangler first. Git-based Pages builds should use repository root, `npm ci && npm run build:web`, output `apps/web/out`. Desktop is not deployed to Pages.

## Guides

- [Architecture](docs/architecture.md), [data model](docs/data-model.md), [collectors](docs/collectors.md).
- [Preserved Radar guide](apps/web/README.md), [PROJECT.md](PROJECT.md), [STYLE_GUIDE.md](STYLE_GUIDE.md). Historical root src references in the design documents now refer to apps/web/src.
- [Activity interaction guide](packages/timeline/README.md).
- [Migration and verification record](docs/migration.md).
- [Original migration specification](CODEX_CONTEXT.md); its pre-migration paths are historical.

Desktop collection starts disabled on first launch. CPU, RAM, network, disk, audio and media have independent native queries; the master switch stops all. Additional sources default off on upgrade. Preferences and measured observations persist locally. SQLite history appears in the native Timeline with date navigation, live following, selection analytics and JSON range export; the latest 1,800 readings are restored to System metrics on restart. Settings shows the database path and committed row count. No automatic retention limit is applied yet. GPU, browser URLs, per-process metrics and independent agent lifetime remain future work. The flat Radar map fetches external basemap tiles without sending visitor telemetry to that service.

Desktop 0.2.1 disables manual display-off after a wake-up reliability incident. Prevent automatic sleep now requests system activity only and allows normal display timeout. See [collector limitations](docs/collectors.md). Portable releases require WebView2; preferences still use the Windows user application-data directory.
