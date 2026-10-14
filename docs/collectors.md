# Collectors

## Implemented in Desktop 0.2

Windows interactive-user collection is opt-in. On first launch the master switch is off, with CPU/RAM selected. Settings persist as collection.json in Tauri's application config directory. A malformed file starts collection off and displays a warning. Saving must succeed before a new configuration becomes active.

The worker samples selected sources at a nominal two-second period. CPU calls [GetSystemTimes](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-getsystemtimes); utilization is (delta kernel + delta user - delta idle) / (delta kernel + delta user). Kernel time includes idle. First reads, counter resets and long scheduling gaps establish a new baseline and leave CPU missing. On machines with more than 64 logical processors, this API measures the calling thread's primary processor group; multi-group aggregation is not implemented.

RAM separately calls [GlobalMemoryStatusEx](https://learn.microsoft.com/en-us/windows/win32/api/sysinfoapi/nf-sysinfoapi-globalmemorystatusex), returning physical total and total-minus-available in bytes. Disabling CPU skips its OS call; disabling RAM skips its OS call. Disabling the master switch or selecting neither suspends metric queries entirely. These choices control collection rather than discarding unwanted measurements after querying everything. No process enumeration is performed for metrics.

The latest 1,800 observations remain in memory, about one hour of continuous collection. Pauses retain old history, so this is a count limit rather than a one-hour expiration policy. History can be exported as real JSON from System metrics. Closing the client ends collection and discards readings. Reopening restores collection preferences. SQLite, autostart and an independent background agent are not implemented. Timeline and the website remain demo providers.

## Diagnostics and power tools

Foreground inspection is a one-shot request after a three-second delay to switch to the target window. It reads HWND, PID, window title and executable path via Win32, without elevation. Protected/exited processes may lack paths. PID/HWND are snapshot identifiers, not durable identities. Browser URL extraction requires a later UI Automation adapter and is explicitly unavailable; titles are never treated as URLs. Results remain on the Settings page and are not added to metric history.

In 0.2.1, Prevent automatic sleep uses [SetThreadExecutionState](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-setthreadexecutionstate) on one worker thread with ES_CONTINUOUS | ES_SYSTEM_REQUIRED only. It allows normal display timeout, resets off on restart, releases at exit, does not alter power plans, and does not prevent explicit manual sleep. It is an idle-sleep request, not a guarantee against all hardware, Modern Standby, battery or system policy transitions.

Manual display-off is disabled in 0.2.1 after a user reported repeated blackouts after wake and unexpected sleep. The old code broadcast SC_MONITORPOWER to all windows; it had no repeat timer, but broadcast delivery is not a reliable single-target action. Microsoft [warns against SendMessageTimeout with HWND_BROADCAST](https://learn.microsoft.com/en-us/windows-hardware/drivers/devtest/28602-avoid-calling-sendmessagetimeout-with-hwnd-broadcast). The precise hardware sequence has not been reproduced. The native broadcast implementation and delayed task are removed, the UI button is disabled, and the legacy display_off IPC command immediately rejects without changing power state. No monitor-off request can be replayed on resume. The old requirement to disable sleep prevention before display-off was incorrect for the intended overnight-work use case and has been removed. Future reintroduction requires evidence of reliable one-shot behavior, normal input wake and continued system work; mock IPC checks cannot prove that.

## Deferred scope

GPU, network, disk and audio collectors are not queried. GPU appears disabled in Settings. Future implementations must preserve source, actual sample intervals, quality and gaps; byte totals require measured counters. Per-process metrics remain deferred.

Foreground/context intervals, running-app lifetimes, AFK and playback will be separate collectors. Prefer native UI Automation for browser/editor context without mandatory extensions. Privacy remains local-first: no keylogging, screenshots, raw audio or cloud upload.
