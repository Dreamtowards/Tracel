# Collectors

## Current state

No native Windows collector exists. Web and Desktop display the same deterministic mock Capture. tracel-agent reports status and exits. There is no SQLite runtime, native IPC provider, background process manager, autostart or Windows Service.

## First native scope

Target Windows interactive-user sessions and system metrics only: CPU, RAM, GPU where available, network receive/send, disk read/write and audio signal level. Preserve measured bytes and actual sample intervals when possible. Missing/unsupported readings stay missing; sleep and capture interruptions must not turn into zero-valued observations. Retain source and quality. Per-process/application metrics are deferred.

Later foreground/context, running-app lifetime, AFK and playback collectors remain separate. Group foreground by executable/application while retaining title/URI/file/project context without splitting app color for every context change. Prefer native UI/UI Automation for browser/editor metadata; no mandatory extensions initially.

Privacy/local first: no keylogging, screenshots, raw audio capture or cloud upload. Production retention/storage need concrete implementations and tests. Agent/window lifetime needs an explicit later strategy; this scaffold does not keep collecting when the window closes.
