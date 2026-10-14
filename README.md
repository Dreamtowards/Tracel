# Tracel

Tracel contains two independent experiences: **Radar**, a simulated website visitor map/globe at `/`, and **Activity**, a personal computer activity/performance Timeline at `/timeline`. Neither currently collects real telemetry.

## Layout

- `apps/web`: Next.js static website, Radar, assets, web tests and Cloudflare Pages.
- `apps/desktop`: Tauri 2 + Vite + React shell showing the shared Activity demo; no Radar or native collector.
- `packages/timeline`: original Canvas Timeline, Explorer, display settings, models, analytics, isolated mock provider and Activity tests.
- `crates/tracel-core`: OS-neutral observations and UTC timestamp conventions.
- `crates/tracel-agent`: status-reporting entry point; exits without collecting.
- `crates/tracel-storage`: store interface and draft SQLite migration; no database backend.
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
npm run agent                # Rust scaffold; does not collect
```

Windows native builds require Rust MSVC, Microsoft C++ Build Tools/Windows SDK and WebView2. The client follows the [Tauri 2 configuration reference](https://v2.tauri.app/reference/config/). Native builds produce an executable and per-user NSIS installer. Closing the window exits the client; independent agent lifetime is future work. See the [Desktop release guide](apps/desktop/README.md).

## Verify and build

```sh
npm run typecheck           # Web, Desktop and shared Timeline
npm test                    # Radar, Activity and Desktop export tests
npm run build               # Web static export + Desktop Vite bundle
npm run check:rust          # Entire Cargo workspace, including Tauri
npm run test:rust
npm run build:desktop:native # Native executable + unsigned Windows setup
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

Demo telemetry stays local. The flat map fetches external basemap tiles without sending visitor telemetry to that service. Native collection, persistent storage, per-process metrics and agent management remain future work.
