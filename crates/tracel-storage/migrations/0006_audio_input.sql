-- Existing rows remain NULL: microphone history cannot be reconstructed.
ALTER TABLE system_samples ADD COLUMN audio_input_peak REAL CHECK(audio_input_peak >= 0 AND audio_input_peak <= 100);
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
 s.idle_ms, s.activity_present, s.cpu_frequency_mhz, s.gpus_json, s.battery_json, s.audio_input_peak
 FROM system_samples s;
