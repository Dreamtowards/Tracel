# Repository guidance

Read `docs/architecture.md`, `docs/data-model.md` and `docs/collectors.md` before changing boundaries. `CODEX_CONTEXT.md` preserves the original migration handoff. Web lives in `apps/web`; reusable Activity UI lives in `packages/timeline`; Desktop must stay free of Radar and Next.js. Preserve both experiences and user work.

Run root `npm run typecheck`, `npm test`, `npm run build`; use `npm run check:rust` and `npm run test:rust` for native changes. Read `apps/web/AGENTS.md` for Next-specific guidance; dependencies and Next docs are normally hoisted to root node_modules.

Desktop release rule: after several commits since the previous EXE, bump at least the patch version before building unless the user specifies otherwise. Keep all Desktop version declarations/lockfiles in sync. Preserve previous versioned EXEs and save the new EXE under `target/portable/Tracel-<version>-windows-x64/Tracel.exe`. Default to EXE only; ZIP/installers need an explicit request.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
