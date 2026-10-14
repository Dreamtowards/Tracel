# Architecture

## Implemented

The root is an npm and Cargo workspace. `apps/web` owns Next.js routes, Radar, MapLibre/Three.js, Tailwind and static Cloudflare export. `apps/desktop` owns a lean Vite/React entry point and Tauri 2 lifecycle; it imports neither Radar nor Next.js.

Both apps pass `@tracel/timeline/mock` to `Explorer` from `packages/timeline`. This preserves the original Canvas Timeline, selection/analytics, hover/context, collapse/resize, settings and export. The package owns React UI, domain helpers and scoped CSS. Host resets remain in each app. No native API appears in the package or Web bundle. Pure model/analytics and mock subpath exports avoid mixing the demo adapter into the main UI entry point.

`tracel-core` defines UTC millisecond ranges, subjects, metrics and observation quality. `tracel-storage` defines a batch/range interface and draft SQLite migration without a runtime backend. `tracel-query` implements clipped weighted gauge means and rejects byte counters. `tracel-agent` reports scaffold status and exits. Tauri uses mock timeline data; its native command supplies device/platform/version metadata only. Native save-dialog/filesystem plugins export JSON to a user-selected path, and window-state restores the shell's placement. No collection or telemetry query IPC is implemented.

Tauri is an explicit root Cargo member sharing lockfile and target directory. Default Cargo members are the four foundation crates; --workspace adds Tauri SDK dependencies. The Windows client builds a per-user NSIS installer; see apps/desktop/README.md for features and validation limits.

## Future boundaries

Windows collectors belong to the interactive-user agent. SQLite should use WAL, migrations and atomic batched writes. Query work will add range/LOD, coverage and totals, with transport through a Desktop-specific Tauri adapter. Avoid shipping entire histories to React. DataProvider.load remains the prototype API until range reads are implemented.

The agent must eventually outlive UI windows. Process supervision, autostart and shutdown strategy are deferred. Today's shell does not launch or manage an agent, and no Session 0 service exists.

Radar visitor models and Activity desktop models remain independent. TS/Rust semantic compatibility is documented without premature generated bindings.
