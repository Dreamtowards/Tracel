# Compact Activity archive (Desktop 0.2.24 / schema 7)

GPU engine history is intentionally retired. Per-adapter utilization and dedicated/shared used bytes remain recorded. Live diagnostics can still read engines; the archive reader returns an empty engine list. Adapter identity/name pairs are interned in `gpu_adapters`, preserving historical names and session-specific identities without guessing across reboots.

All numeric samples (including CPU, RAM, network/disk, audio, frequency, GPU and battery) move from repeated columns/JSON into `numeric_blocks`, each holding at most 256 observations. `system_samples` retains every original ID, timestamp, interval start, error and activity flag. Existing activity/entity tables are unchanged. The old numeric columns remain NULL as migration/decoder compatibility scaffolding; they are not a second stored copy. `numeric_encoded` distinguishes encoded rows from legacy test/import rows and makes a missing block an explicit error.

Within a block, identical values reference a baseline. CPU/GPU utilization within 0.1 percentage points and RAM/VRAM within 1 MiB of a fixed baseline use XOR residuals; larger changes reset the baseline. These are encoding thresholds, **not lossy tolerances**: residuals preserve every original float bit/integer, with no rounding or drift. Network/disk, audio and CPU frequency remain exact as well. Battery optional flags/percentage are bit-packed and repeated states reference their baseline. Missing values and empty GPU lists remain distinct. The resulting byte stream uses zlib compression through the already-used `flate2` dependency. Versioned headers, row-count and 4 MiB expansion limits, ID validation and zlib integrity checks reject corrupt blocks.

Small variations need not be discarded to gain most of the storage savings. The archive still contains all measured numeric values and their original coverage, so peaks, time-weighted averages, partial selections and byte integrals retain the existing semantics. Blocks are storage containers; they do not merge time coverage across missing readings, pauses or restarts. Bounded queries decode only needed blocks. The overview streams CPU readings one block at a time; it does not keep a whole archive in memory.

Migration streams 256 rows at a time inside the schema transaction. Invalid legacy data rolls back the entire migration. Before any existing pre-7 archive is upgraded, SQLite's backup API creates a consistent `activity.sqlite3.schema-<version>-<timestamp>.backup.sqlite3` beside it, including committed WAL contents. Backup failure aborts migration. The backup retains the old GPU engine history and supports rollback to the old EXE. Backups are retained, so reclaiming the active archive does not automatically reclaim their disk space. An older EXE rejects schema 7; use 0.2.24 or later with the upgraded database.

Migration frees reusable pages but does not run VACUUM during normal startup. To upgrade and reclaim physical space, **close all Tracel clients first**, then run from the repository root:

```powershell
cargo run --release --package tracel-storage --example compact_archive -- "C:\Users\Dreamtowards\AppData\Local\com.tracel.activity\activity.sqlite3" --vacuum
```

For a full read-only comparison with a schema-6 backup after migration:

```powershell
cargo run --release --package tracel-storage --example compact_archive -- "<upgraded.sqlite3>" --verify-against "<schema-6-backup.sqlite3>"
```

The comparison checks every numeric observation, timestamp, error/activity flag and every row of all prior state/entity tables. The only accepted difference is removed GPU engines. VACUUM runs separately after migration and finishes with SQLite integrity and foreign-key checks. Leave enough free disk space for a full backup, migration WAL and the VACUUM temporary database. No automatic deletion, retention limit or lossy approximation is introduced.
