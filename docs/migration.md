# Migration verification — 2026-10-14

Initial checkout: main, synchronized with origin/main, HEAD b8ad554. Git reported no uncommitted changes. The Timeline work described in CODEX_CONTEXT.md was already present in the checkout.

All 55 original tracked files were mapped to their retained or migrated destinations; none were missing. After normalizing line endings, 42 retained identical content. The other 13 have intentional changes to root documentation/ignores/workspaces/lockfile, Next configuration, geography resolution, Tailwind scanning, Timeline route/provider injection, Activity documentation/test import paths and Wrangler schema location. Canvas Timeline, display settings, models, mock data, overview, analytics, Radar implementation/styles and both Radar test files are unchanged. The original Radar README content is also preserved in apps/web/README.md with updated paths.

## Passed checks

- Clean root npm ci using the workspace lockfile.
- TypeScript checks for Web, Desktop and Timeline.
- All 16 existing tests: 9 Radar, 7 Activity.
- Next.js production build and static export, including index.html, timeline.html and matching MapLibre worker/shared assets under apps/web/out.
- Desktop Vite production build, consuming the shared package without Radar/Next dependencies.
- cargo check --workspace --locked and cargo test --workspace --locked, including Tauri. Two native foundation tests pass for half-open clipping and weighted gauge aggregation/missing/zero semantics.
- Tauri Windows release build: target/release/tracel-desktop.exe. Installer bundling is disabled. The native window was not manually exercised; UI interaction checks used the Vite host in Chrome.
- Draft SQLite migration executed against an in-memory SQLite database with a missing-sample round trip. This does not implement a storage runtime.
- Browser checks against the migrated Next dev server: Radar loads, simulation pauses/resumes, MapLibre worker returns HTTP 200, and no page exceptions occur.
- Browser checks against both Next /timeline and Desktop Vite: Canvas rendering, selection-driven analytics, selection persistence through zoom, background expansion and restored heights, display settings, keyboard track resize, shortcuts, week overview and narrow layout. No page exceptions occurred. Screenshots/scripts remain in ignored .tracel-runtime.
- Git diff whitespace check; build/runtime artifacts remain ignored.

The Windows sandbox initially prevented SWC/Rust path canonicalization and dependency downloads. Authorized checks succeeded outside those restrictions; no build blocker remains. Local verification servers were stopped afterward. No production deployment or Git commit was made. The original root .next/out/runtime artifacts were preserved as ignored local files; current output lives in the app workspaces.
