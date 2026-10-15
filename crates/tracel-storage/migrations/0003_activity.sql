-- Deduplicate window metadata and desktop application sets independently of idle samples.
CREATE TABLE activity_values (id INTEGER PRIMARY KEY, payload TEXT NOT NULL UNIQUE);
ALTER TABLE observations ADD COLUMN foreground_id INTEGER REFERENCES activity_values(id);
ALTER TABLE observations ADD COLUMN background_id INTEGER REFERENCES activity_values(id);
ALTER TABLE observations ADD COLUMN idle_ms INTEGER CHECK(idle_ms >= 0);
CREATE VIEW archived_observations AS SELECT o.id,o.captured_at_ms,o.interval_start_ms,o.cpu_percent,o.memory_used_bytes,o.memory_total_bytes,o.network_receive,o.network_send,o.disk_read,o.disk_write,o.audio_peak,o.media_json,o.errors_json,
 (SELECT payload FROM activity_values WHERE id=o.foreground_id) AS foreground_json,
 (SELECT payload FROM activity_values WHERE id=o.background_id) AS background_json,
 o.idle_ms FROM observations o;
