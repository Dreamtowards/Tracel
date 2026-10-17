# Development and deployment

Commands below run from the repository root. For the app introduction and downloads, see the [Tracel README](../README.md).

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

Open the [product website](http://127.0.0.1:3000/), [Radar](http://127.0.0.1:3000/radar) or [Activity](http://127.0.0.1:3000/timeline).

```sh
npm run dev:desktop:ui       # Vite at http://127.0.0.1:1420
npm run dev:desktop          # Native Tauri window; requires platform SDKs
npm run agent                # Collector help; no continuous background service
cargo run -p tracel-agent -- --sample     # One real CPU/RAM observation
cargo run -p tracel-agent -- --foreground # One foreground window snapshot
```

Windows native builds require Rust MSVC, Microsoft C++ Build Tools/Windows SDK and WebView2. The client follows the [Tauri 2 configuration reference](https://v2.tauri.app/reference/config/). Native builds default to an executable without an installer; portable ZIP packaging is available. Closing the window exits the client; independent agent lifetime is future work. See the [Desktop release guide](../apps/desktop/README.md).

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

The product website links to versioned Windows EXEs and SHA-256 files hosted in GitHub Releases. Keep release binaries out of Git and `apps/web/public`; local versioned EXEs remain under ignored `target/portable`. Before updating `apps/web/src/release.json` (version, date, size, asset URL and hash), verify the EXE's PE architecture, embedded icon, size and SHA-256, upload the EXE and matching `.sha256` asset, and verify the uploaded asset. Web tests validate metadata and prevent accidentally bundling release binaries. Releases are currently in the private Dreamtowards/Tracel repository and require authorized GitHub access; public visitors cannot download them. Product screenshots in `apps/web/public/images` show the real Desktop UI with fabricated example data, not personal activity records.

The `/timeline` online demo uses the same `@tracel/timeline/desktop` presentation as the Windows app, with a separately injected, fabricated `DataProvider`. It includes GPU engines/VRAM, CPU frequency, microphone and battery/power tracks. Its switches simulate state only; it never monitors the visitor's computer. See the [Timeline guide](../packages/timeline/README.md) for dataset injection. All five pages stay visible; browser-unsupported controls are disabled. Native hooks and Tauri implementations remain in Desktop behind an injected platform interface.

## Deploy

From root, `npm run deploy` builds Web and runs Wrangler in `apps/web`, publishing its `out` directory to the existing Cloudflare Pages `tracel` project, branch `main`. Authenticate with Wrangler first. Git-based Pages builds should use repository root, `npm ci && npm run build:web`, output `apps/web/out`. Desktop is not deployed to Pages.

## Guides

- [Architecture](architecture.md), [data model](data-model.md), [collectors](collectors.md).
- [Preserved Radar guide](../apps/web/README.md), [PROJECT.md](../PROJECT.md), [STYLE_GUIDE.md](../STYLE_GUIDE.md). Historical root src references in the design documents now refer to apps/web/src.
- [Activity interaction guide](../packages/timeline/README.md).
- [Migration and verification record](migration.md).
- [Original migration specification](../CODEX_CONTEXT.md); its pre-migration paths are historical.
