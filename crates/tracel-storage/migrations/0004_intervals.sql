-- Move sampled numeric measurements and state history into distinct storage models.
DROP TABLE system_samples; -- migration 1 reserved this table; Rust verifies it is empty first.
CREATE TABLE system_samples (
 id INTEGER PRIMARY KEY,
 captured_at_ms INTEGER NOT NULL CHECK(captured_at_ms >= 0),
 interval_start_ms INTEGER CHECK(interval_start_ms >= 0 AND interval_start_ms < captured_at_ms),
 cpu_percent REAL, memory_used_bytes INTEGER CHECK(memory_used_bytes >= 0),
 memory_total_bytes INTEGER CHECK(memory_total_bytes >= 0),
 network_receive REAL, network_send REAL, disk_read REAL, disk_write REAL, audio_peak REAL,
 errors_json TEXT NOT NULL,
 activity_present INTEGER NOT NULL CHECK(activity_present IN (0,1)),
 background_observed INTEGER NOT NULL CHECK(background_observed IN (0,1)),
 idle_ms INTEGER CHECK(idle_ms >= 0)
);
CREATE INDEX system_samples_time ON system_samples(captured_at_ms);
CREATE TABLE strings (id INTEGER PRIMARY KEY, value TEXT NOT NULL UNIQUE);
CREATE TABLE applications (
 id INTEGER PRIMARY KEY, identity_key TEXT NOT NULL UNIQUE,
 executable TEXT
);
CREATE TABLE process_instances (
 id INTEGER PRIMARY KEY, application_id INTEGER NOT NULL REFERENCES applications(id),
 instance_key TEXT NOT NULL, process_id INTEGER NOT NULL, name TEXT NOT NULL,
 UNIQUE(application_id,instance_key,process_id,name)
);
CREATE TABLE windows (
 id INTEGER PRIMARY KEY, process_instance_id INTEGER NOT NULL REFERENCES process_instances(id),
 handle TEXT NOT NULL, UNIQUE(process_instance_id,handle)
);
CREATE TABLE media_items (
 id INTEGER PRIMARY KEY, title_id INTEGER NOT NULL REFERENCES strings(id),
 artist_id INTEGER NOT NULL REFERENCES strings(id), source_id INTEGER NOT NULL REFERENCES strings(id),
 UNIQUE(title_id,artist_id,source_id)
);
CREATE TABLE app_presence_intervals (
 id INTEGER PRIMARY KEY, process_instance_id INTEGER NOT NULL REFERENCES process_instances(id),
 start_ms INTEGER NOT NULL, end_ms INTEGER NOT NULL CHECK(end_ms > start_ms),
 first_sample_id INTEGER NOT NULL, last_sample_id INTEGER NOT NULL,
 quality TEXT NOT NULL DEFAULT 'estimated' CHECK(quality='estimated')
);
CREATE INDEX app_presence_time ON app_presence_intervals(start_ms,end_ms);
CREATE INDEX app_presence_end ON app_presence_intervals(end_ms,start_ms);
CREATE INDEX app_presence_process ON app_presence_intervals(process_instance_id,last_sample_id);
CREATE INDEX app_presence_tail ON app_presence_intervals(last_sample_id);
CREATE TABLE foreground_intervals (
 id INTEGER PRIMARY KEY, window_id INTEGER NOT NULL REFERENCES windows(id),
 start_ms INTEGER NOT NULL, end_ms INTEGER NOT NULL CHECK(end_ms > start_ms),
 first_sample_id INTEGER NOT NULL, last_sample_id INTEGER NOT NULL,
 quality TEXT NOT NULL DEFAULT 'estimated' CHECK(quality='estimated')
);
CREATE INDEX foreground_time ON foreground_intervals(start_ms,end_ms);
CREATE INDEX foreground_end ON foreground_intervals(end_ms,start_ms);
CREATE INDEX foreground_tail ON foreground_intervals(last_sample_id);
CREATE TABLE window_title_intervals (
 id INTEGER PRIMARY KEY, window_id INTEGER NOT NULL REFERENCES windows(id),
 title_id INTEGER NOT NULL REFERENCES strings(id),
 start_ms INTEGER NOT NULL, end_ms INTEGER NOT NULL CHECK(end_ms > start_ms),
 first_sample_id INTEGER NOT NULL, last_sample_id INTEGER NOT NULL,
 quality TEXT NOT NULL DEFAULT 'estimated' CHECK(quality='estimated')
);
CREATE INDEX window_titles_time ON window_title_intervals(start_ms,end_ms);
CREATE INDEX window_titles_end ON window_title_intervals(end_ms,start_ms);
CREATE INDEX window_titles_window ON window_title_intervals(window_id,last_sample_id);
CREATE INDEX window_titles_tail ON window_title_intervals(last_sample_id);
CREATE TABLE media_intervals (
 id INTEGER PRIMARY KEY, media_item_id INTEGER NOT NULL REFERENCES media_items(id),
 playback_status TEXT NOT NULL,
 start_ms INTEGER NOT NULL, end_ms INTEGER NOT NULL CHECK(end_ms > start_ms),
 first_sample_id INTEGER NOT NULL, last_sample_id INTEGER NOT NULL,
 quality TEXT NOT NULL DEFAULT 'estimated' CHECK(quality='estimated')
);
CREATE INDEX media_time ON media_intervals(start_ms,end_ms);
CREATE INDEX media_end ON media_intervals(end_ms,start_ms);
CREATE INDEX media_tail ON media_intervals(last_sample_id);
CREATE TABLE idle_intervals (
 id INTEGER PRIMARY KEY,
 start_ms INTEGER NOT NULL, end_ms INTEGER NOT NULL CHECK(end_ms > start_ms),
 first_sample_id INTEGER NOT NULL, last_sample_id INTEGER NOT NULL,
 quality TEXT NOT NULL DEFAULT 'estimated' CHECK(quality='estimated')
);
CREATE INDEX idle_time ON idle_intervals(start_ms,end_ms);
CREATE INDEX idle_end ON idle_intervals(end_ms,start_ms);
CREATE INDEX idle_tail ON idle_intervals(last_sample_id);
-- The existing snapshot reader is retained for restoring the small metrics memory ring only.
-- Timeline queries read numeric samples + interval tables directly instead of this view.
DROP VIEW archived_observations;
CREATE VIEW archived_observations AS SELECT
 s.id,s.captured_at_ms,s.interval_start_ms,s.cpu_percent,s.memory_used_bytes,s.memory_total_bytes,
 s.network_receive,s.network_send,s.disk_read,s.disk_write,s.audio_peak,
 (SELECT json_object('title',t.value,'artist',a.value,'application',src.value,'playbackStatus',i.playback_status)
  FROM media_intervals i JOIN media_items m ON m.id=i.media_item_id
  JOIN strings t ON t.id=m.title_id JOIN strings a ON a.id=m.artist_id JOIN strings src ON src.id=m.source_id
  WHERE i.first_sample_id<=s.id AND i.last_sample_id>=s.id LIMIT 1) AS media_json,
 s.errors_json,
 (SELECT json_object('process',json_object('instanceId',p.instance_key,'processId',p.process_id,'name',p.name,'executable',a.executable),
  'windowId',w.handle,'title',t.value)
  FROM foreground_intervals f JOIN windows w ON w.id=f.window_id JOIN process_instances p ON p.id=w.process_instance_id
  JOIN applications a ON a.id=p.application_id JOIN window_title_intervals ti ON ti.window_id=w.id
  JOIN strings t ON t.id=ti.title_id
  WHERE f.first_sample_id<=s.id AND f.last_sample_id>=s.id AND ti.first_sample_id<=s.id AND ti.last_sample_id>=s.id LIMIT 1) AS foreground_json,
 CASE WHEN s.background_observed=0 THEN NULL ELSE
 (SELECT json_group_array(json(item)) FROM (SELECT json_object('instanceId',p.instance_key,'processId',p.process_id,'name',p.name,'executable',a.executable) AS item
  FROM app_presence_intervals i JOIN process_instances p ON p.id=i.process_instance_id JOIN applications a ON a.id=p.application_id
  WHERE i.first_sample_id<=s.id AND i.last_sample_id>=s.id ORDER BY p.process_id,p.instance_key)) END AS background_json,
 s.idle_ms, s.activity_present
 FROM system_samples s;
