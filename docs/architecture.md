# Architecture

## Implemented

The root is an npm and Cargo workspace. `apps/web` owns Next.js routes, Radar, MapLibre/Three.js, Tailwind and static Cloudflare export. `apps/desktop` owns a lean Vite/React entry point and Tauri 2 lifecycle; it imports neither Radar nor Next.js.

Both apps pass `@tracel/timeline/mock` to `Explorer` from `packages/timeline`. This preserves the original Canvas Timeline, selection/analytics, hover/context, collapse/resize, settings and export. The package owns React UI, domain helpers and scoped CSS. Host resets remain in each app. No native API appears in the package or Web bundle. Pure model/analytics and mock subpath exports avoid mixing the demo adapter into the main UI entry point.

`tracel-core` defines UTC millisecond ranges, subjects, metrics and observation quality. `tracel-storage` defines a batch/range interface and draft SQLite migration without a runtime backend. `tracel-query` implements clipped weighted gauge means and rejects byte counters. `tracel-agent` provides a platform-neutral sampler with selective Windows CPU/RAM readers, a one-time foreground reader and a one-shot CLI.

Tauri owns one collector worker, configuration persistence and a bounded 1,800-observation memory ring. A condition variable suspends the worker when collection and power requests are idle. Desktop-specific IPC exposes configuration, status, history, foreground diagnostics and power tools. Settings and System metrics occupy host-provided pages in the shared shell; the original Timeline remains a clearly separate demo. CPU/RAM measurements do not fabricate a full demo Capture. The UI polls status every two seconds and reads bounded history only on the metrics page. Native save-dialog/filesystem plugins export JSON to a user-selected path; window-state restores placement.

Prevent automatic sleep is set and cleared on the collector thread, requesting system activity only and allowing display timeout. Closing the client joins that worker and releases its power request. Collection preferences persist, but sleep prevention is always off at startup. Manual display-off is disabled in both UI and native IPC after a wake-up reliability incident; no monitor command or delayed display task remains. Browser preview disables native features. No collection APIs enter the shared package or Web.

Tauri is an explicit root Cargo member sharing lockfile and target directory. Default Cargo members are the four foundation crates; --workspace adds Tauri SDK dependencies. Native builds default to an EXE without installer packaging. An optional portable ZIP command and explicit NSIS installer command are available; see apps/desktop/README.md for validation limits.

## Future boundaries

Windows collectors belong to the interactive-user agent. SQLite should use WAL, migrations and atomic batched writes. Query work will add range/LOD, coverage and totals, with transport through a Desktop-specific Tauri adapter. Avoid shipping entire histories to React. DataProvider.load remains the prototype API until range reads are implemented.

The agent must eventually outlive UI windows. Process supervision, autostart and shutdown strategy are deferred. Today's shell hosts the collector library in-process and stops collecting at exit; it does not launch an independent agent or Session 0 service.

Radar visitor models and Activity desktop models remain independent. TS/Rust semantic compatibility is documented without premature generated bindings.
