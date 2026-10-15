-- Point observations with explicit support intervals for rate measurements.
CREATE TABLE observations (
    id INTEGER PRIMARY KEY,
    captured_at_ms INTEGER NOT NULL CHECK(captured_at_ms >= 0),
    interval_start_ms INTEGER CHECK(interval_start_ms >= 0 AND interval_start_ms < captured_at_ms),
    cpu_percent REAL,
    memory_used_bytes INTEGER CHECK(memory_used_bytes >= 0),
    memory_total_bytes INTEGER CHECK(memory_total_bytes >= 0),
    network_receive REAL,
    network_send REAL,
    disk_read REAL,
    disk_write REAL,
    audio_peak REAL,
    media_json TEXT,
    errors_json TEXT NOT NULL
);
CREATE INDEX observations_time ON observations(captured_at_ms);
