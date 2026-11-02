//! Bounded lossless numeric blocks. Only GPU engine detail is intentionally discarded.
//!
//! A small delta selects reference encoding, never whether to discard a reading.
//! XOR residuals retain the exact IEEE-754 bits, including small peaks and zero.
use super::sqlite::StoredObservation;
use flate2::{write::ZlibEncoder, Compression, Decompress, FlushDecompress, Status};
use rusqlite::{params, Connection, OptionalExtension};
use std::{collections::HashMap, io::Write};
use tracel_core::{BatteryObservation, GpuObservation, SystemObservation};

const BLOCK_ROWS: usize = 256;
const MAX_BYTES: usize = 4 * 1024 * 1024;
const MAX_GPUS: usize = 64;
const CLEAR: &str = "UPDATE system_samples SET numeric_encoded=1,cpu_percent=NULL,cpu_frequency_mhz=NULL,memory_used_bytes=NULL,memory_total_bytes=NULL,network_receive=NULL,network_send=NULL,disk_read=NULL,disk_write=NULL,audio_peak=NULL,audio_input_peak=NULL,gpus_json=NULL,battery_json=NULL WHERE id>=?1 AND id<=?2";

#[derive(Clone, Debug, PartialEq)]
struct Gpu {
    adapter: u64,
    values: [Option<u64>; 3],
}
#[derive(Clone, Debug, PartialEq)]
struct Numbers {
    id: u64,
    // CPU %, MHz, RAM used/total, network RX/TX, disk R/W, output/input audio.
    values: [Option<u64>; 10],
    gpus: Option<Vec<Gpu>>,
    battery: Option<u64>,
}
#[derive(Clone, Default)]
pub(crate) struct Block {
    rows: Vec<Numbers>,
}

#[derive(Clone, Copy)]
enum Kind {
    Float(f64),
    Integer(u64),
}
const KINDS: [Kind; 10] = [
    Kind::Float(0.1),
    Kind::Float(0.0),
    Kind::Integer(1048576),
    Kind::Integer(0),
    Kind::Float(0.0),
    Kind::Float(0.0),
    Kind::Float(0.0),
    Kind::Float(0.0),
    Kind::Float(0.0),
    Kind::Float(0.0),
];

fn varint(out: &mut Vec<u8>, mut value: u64) {
    while value >= 128 {
        out.push(value as u8 | 128);
        value >>= 7;
    }
    out.push(value as u8);
}
fn number(
    out: &mut Vec<u8>,
    anchors: &mut HashMap<u64, u64>,
    key: u64,
    value: Option<u64>,
    kind: Kind,
) {
    let Some(value) = value else {
        out.push(0);
        anchors.remove(&key);
        return;
    };
    if let Some(&anchor) = anchors.get(&key) {
        if anchor == value {
            out.push(1);
            return;
        }
        let near = match kind {
            Kind::Float(delta) => (f64::from_bits(value) - f64::from_bits(anchor)).abs() <= delta,
            Kind::Integer(delta) => value.abs_diff(anchor) <= delta,
        };
        if near {
            out.push(2);
            varint(out, anchor ^ value);
            return; // Compare against this fixed baseline, never accumulate drift.
        }
    }
    out.push(3);
    out.extend_from_slice(&value.to_le_bytes());
    anchors.insert(key, value);
}

struct Input<'a> {
    bytes: &'a [u8],
    at: usize,
    anchors: HashMap<u64, u64>,
}
impl Input<'_> {
    fn byte(&mut self) -> Result<u8, String> {
        let v = *self.bytes.get(self.at).ok_or("Truncated numeric block")?;
        self.at += 1;
        Ok(v)
    }
    fn varint(&mut self) -> Result<u64, String> {
        let mut value = 0;
        for shift in (0..=63).step_by(7) {
            let v = self.byte()?;
            if shift == 63 && v > 1 {
                return Err("Invalid numeric varint".into());
            }
            value |= ((v & 127) as u64) << shift;
            if v < 128 {
                return Ok(value);
            }
        }
        Err("Invalid numeric varint".into())
    }
    fn number(&mut self, key: u64) -> Result<Option<u64>, String> {
        match self.byte()? {
            0 => {
                self.anchors.remove(&key);
                Ok(None)
            }
            1 => Ok(Some(
                *self.anchors.get(&key).ok_or("Missing numeric baseline")?,
            )),
            2 => {
                let anchor = *self.anchors.get(&key).ok_or("Missing numeric baseline")?;
                Ok(Some(anchor ^ self.varint()?))
            }
            3 => {
                let mut bits = [0; 8];
                for b in &mut bits {
                    *b = self.byte()?;
                }
                let value = u64::from_le_bytes(bits);
                self.anchors.insert(key, value);
                Ok(Some(value))
            }
            _ => Err("Unknown numeric encoding".into()),
        }
    }
}
fn gpu_key(adapter: u64, field: u64) -> Result<u64, String> {
    adapter
        .checked_mul(3)
        .and_then(|n| n.checked_add(16 + field))
        .ok_or("GPU metadata ID overflow".into())
}

impl Block {
    fn encode(&self) -> Result<Vec<u8>, String> {
        let mut raw = b"TRN1".to_vec();
        varint(&mut raw, self.rows.len() as u64);
        let mut anchors = HashMap::new();
        let mut prior_id = 0;
        for row in &self.rows {
            varint(&mut raw, row.id - prior_id);
            prior_id = row.id;
            for (i, &value) in row.values.iter().enumerate() {
                number(&mut raw, &mut anchors, i as u64, value, KINDS[i]);
            }
            number(&mut raw, &mut anchors, 10, row.battery, Kind::Integer(0));
            match &row.gpus {
                None => varint(&mut raw, 0),
                Some(gpus) => {
                    varint(&mut raw, gpus.len() as u64 + 1);
                    for gpu in gpus {
                        varint(&mut raw, gpu.adapter);
                        for (i, &value) in gpu.values.iter().enumerate() {
                            number(
                                &mut raw,
                                &mut anchors,
                                gpu_key(gpu.adapter, i as u64)?,
                                value,
                                if i == 0 {
                                    Kind::Float(0.1)
                                } else {
                                    Kind::Integer(1048576)
                                },
                            );
                        }
                    }
                }
            }
        }
        if raw.len() > MAX_BYTES {
            return Err("Numeric block exceeds size limit".into());
        }
        let mut encoder = ZlibEncoder::new(Vec::new(), Compression::fast());
        encoder.write_all(&raw).map_err(|e| e.to_string())?;
        let compressed = encoder.finish().map_err(|e| e.to_string())?;
        let mut payload = (raw.len() as u32).to_le_bytes().to_vec();
        payload.extend_from_slice(&compressed);
        Ok(payload)
    }
    fn decode(payload: &[u8]) -> Result<Self, String> {
        if payload.len() > MAX_BYTES {
            return Err("Numeric block exceeds size limit".into());
        }
        let size = u32::from_le_bytes(
            payload
                .get(..4)
                .ok_or("Truncated numeric block")?
                .try_into()
                .unwrap(),
        ) as usize;
        if size > MAX_BYTES {
            return Err("Numeric block exceeds size limit".into());
        }
        let mut bytes = vec![0; size + 1];
        let mut decoder = Decompress::new(true);
        let status = decoder
            .decompress(&payload[4..], &mut bytes, FlushDecompress::Finish)
            .map_err(|e| e.to_string())?;
        if status != Status::StreamEnd
            || decoder.total_in() != payload.len() as u64 - 4
            || decoder.total_out() != size as u64
        {
            return Err("Truncated or corrupt numeric block".into());
        }
        bytes.truncate(size);
        if bytes.len() > MAX_BYTES || !bytes.starts_with(b"TRN1") {
            return Err("Invalid numeric block header/size".into());
        }
        let mut input = Input {
            bytes: &bytes,
            at: 4,
            anchors: HashMap::new(),
        };
        let count = input.varint()?;
        if count == 0 || count > BLOCK_ROWS as u64 {
            return Err("Invalid numeric block row count".into());
        }
        let mut rows = Vec::with_capacity(count as usize);
        let mut prior_id: u64 = 0;
        for _ in 0..count {
            let delta = input.varint()?;
            if delta == 0 && !rows.is_empty() {
                return Err("Unordered numeric block IDs".into());
            }
            let id = prior_id.checked_add(delta).ok_or("Numeric ID overflow")?;
            prior_id = id;
            let mut values = [None; 10];
            for (i, value) in values.iter_mut().enumerate() {
                *value = input.number(i as u64)?;
            }
            let battery = input.number(10)?;
            let gpu_count = input.varint()?;
            if gpu_count > MAX_GPUS as u64 + 1 {
                return Err("Invalid GPU count".into());
            }
            let gpus = if gpu_count == 0 {
                None
            } else {
                let mut gpus = Vec::new();
                for _ in 0..gpu_count - 1 {
                    let adapter = input.varint()?;
                    let mut values = [None; 3];
                    for (i, value) in values.iter_mut().enumerate() {
                        *value = input.number(gpu_key(adapter, i as u64)?)?;
                    }
                    gpus.push(Gpu { adapter, values });
                }
                Some(gpus)
            };
            rows.push(Numbers {
                id,
                values,
                gpus,
                battery,
            });
        }
        if input.at != bytes.len() {
            return Err("Trailing numeric block data".into());
        }
        Ok(Self { rows })
    }
    pub(crate) fn flush(&self, db: &Connection) -> Result<(), String> {
        if let (Some(first), Some(last)) = (self.rows.first(), self.rows.last()) {
            db.execute("INSERT INTO numeric_blocks(first_id,last_id,payload) VALUES(?1,?2,?3) ON CONFLICT(first_id) DO UPDATE SET last_id=excluded.last_id,payload=excluded.payload",
                params![first.id as i64,last.id as i64,self.encode()?]).map_err(|e|e.to_string())?;
            db.execute(CLEAR, params![first.id as i64, last.id as i64])
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }
    pub(crate) fn push(
        &mut self,
        db: &Connection,
        id: u64,
        sample: &SystemObservation,
    ) -> Result<(), String> {
        if self.rows.len() == BLOCK_ROWS {
            self.flush(db)?;
            self.rows.clear();
        }
        let gpus=sample.gpus.as_ref().map(|gpus| -> Result<Vec<Gpu>,String> {
            if gpus.len()>MAX_GPUS {return Err("Too many GPU adapters".into());}
            gpus.iter().map(|g| {
                db.execute("INSERT INTO gpu_adapters(identity,name) VALUES(?1,?2) ON CONFLICT DO NOTHING",params![g.id,g.name]).map_err(|e|e.to_string())?;
                let adapter: i64=db.query_row("SELECT id FROM gpu_adapters WHERE identity=?1 AND name=?2",params![g.id,g.name],|r|r.get(0)).map_err(|e|e.to_string())?;
                Ok(Gpu {adapter:adapter as u64,values:[g.utilization_percent.map(f64::to_bits),g.dedicated_used_bytes,g.shared_used_bytes]})
            }).collect()
        }).transpose()?;
        self.rows.push(Numbers {
            id,
            values: [
                sample.cpu_percent.map(f64::to_bits),
                sample.cpu_frequency_mhz.map(f64::to_bits),
                sample.memory_used_bytes,
                sample.memory_total_bytes,
                sample.network_receive_bytes_per_second.map(f64::to_bits),
                sample.network_send_bytes_per_second.map(f64::to_bits),
                sample.disk_read_bytes_per_second.map(f64::to_bits),
                sample.disk_write_bytes_per_second.map(f64::to_bits),
                sample.audio_peak_percent.map(f64::to_bits),
                sample.audio_input_peak_percent.map(f64::to_bits),
            ],
            gpus,
            battery: sample.battery.as_ref().map(pack_battery),
        });
        Ok(())
    }
}
fn pack_bool(b: Option<bool>) -> u64 {
    b.map_or(0, |b| if b { 2 } else { 1 })
}
fn unpack_bool(b: u64) -> Result<Option<bool>, String> {
    match b & 3 {
        0 => Ok(None),
        1 => Ok(Some(false)),
        2 => Ok(Some(true)),
        _ => Err("Invalid battery boolean".into()),
    }
}
fn pack_battery(b: &BatteryObservation) -> u64 {
    pack_bool(b.present)
        | (pack_bool(b.plugged_in) << 2)
        | (pack_bool(b.charging) << 4)
        | (b.percent.map_or(0, |p| p as u64 + 1) << 6)
}
fn unpack_battery(b: u64) -> Result<BatteryObservation, String> {
    let percent = b >> 6;
    if percent > 256 {
        return Err("Invalid battery percentage".into());
    }
    Ok(BatteryObservation {
        present: unpack_bool(b)?,
        plugged_in: unpack_bool(b >> 2)?,
        charging: unpack_bool(b >> 4)?,
        percent: if percent == 0 {
            None
        } else {
            Some((percent - 1) as u8)
        },
    })
}

/// One decoded block at a time, shared by bounded Timeline, startup and streaming overview reads.
pub(crate) struct Reader<'a> {
    db: &'a Connection,
    block: Block,
    adapters: HashMap<u64, (String, String)>,
}
impl<'a> Reader<'a> {
    pub(crate) fn new(db: &'a Connection) -> Self {
        Self {
            db,
            block: Block::default(),
            adapters: HashMap::new(),
        }
    }
    fn row(&mut self, id: u64) -> Result<Option<Numbers>, String> {
        if !self
            .block
            .rows
            .first()
            .zip(self.block.rows.last())
            .is_some_and(|(f, l)| f.id <= id && id <= l.id)
        {
            let payload: Option<(i64,i64,Vec<u8>)>=self.db.query_row("SELECT first_id,last_id,payload FROM numeric_blocks WHERE first_id<=?1 ORDER BY first_id DESC LIMIT 1",[id as i64],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).optional().map_err(|e|e.to_string())?;
            let Some((first, last, payload)) = payload.filter(|(_, last, _)| *last >= id as i64)
            else {
                let encoded: bool = self
                    .db
                    .query_row(
                        "SELECT numeric_encoded FROM system_samples WHERE id=?1",
                        [id as i64],
                        |r| r.get(0),
                    )
                    .map_err(|e| e.to_string())?;
                if encoded {
                    return Err("Missing numeric block for archived observation".into());
                }
                return Ok(None);
            };
            self.block = Block::decode(&payload)?;
            if self.block.rows.first().map(|r| r.id) != Some(first as u64)
                || self.block.rows.last().map(|r| r.id) != Some(last as u64)
            {
                return Err("Numeric block ID bounds mismatch".into());
            }
        }
        let index = self
            .block
            .rows
            .binary_search_by_key(&id, |r| r.id)
            .map_err(|_| "Observation missing from numeric block")?;
        Ok(Some(self.block.rows[index].clone()))
    }
    pub(crate) fn cpu(&mut self, id: u64, legacy: Option<f64>) -> Result<Option<f64>, String> {
        Ok(self
            .row(id)?
            .map_or(legacy, |r| r.values[0].map(f64::from_bits)))
    }
    pub(crate) fn restore(&mut self, row: &mut StoredObservation) -> Result<(), String> {
        let Some(numbers) = self.row(row.id)? else {
            return Ok(());
        };
        let s = &mut row.sample;
        let v = numbers.values;
        s.cpu_percent = v[0].map(f64::from_bits);
        s.cpu_frequency_mhz = v[1].map(f64::from_bits);
        s.memory_used_bytes = v[2];
        s.memory_total_bytes = v[3];
        s.network_receive_bytes_per_second = v[4].map(f64::from_bits);
        s.network_send_bytes_per_second = v[5].map(f64::from_bits);
        s.disk_read_bytes_per_second = v[6].map(f64::from_bits);
        s.disk_write_bytes_per_second = v[7].map(f64::from_bits);
        s.audio_peak_percent = v[8].map(f64::from_bits);
        s.audio_input_peak_percent = v[9].map(f64::from_bits);
        s.battery = numbers.battery.map(unpack_battery).transpose()?;
        s.gpus = numbers
            .gpus
            .map(|gpus| -> Result<Vec<GpuObservation>, String> {
                gpus.into_iter()
                    .map(|g| {
                        if !self.adapters.contains_key(&g.adapter) {
                            let metadata = self
                                .db
                                .query_row(
                                    "SELECT identity,name FROM gpu_adapters WHERE id=?1",
                                    [g.adapter as i64],
                                    |r| Ok((r.get(0)?, r.get(1)?)),
                                )
                                .map_err(|e| e.to_string())?;
                            self.adapters.insert(g.adapter, metadata);
                        }
                        let (id, name) = &self.adapters[&g.adapter];
                        Ok(GpuObservation {
                            id: id.clone(),
                            name: name.clone(),
                            utilization_percent: g.values[0].map(f64::from_bits),
                            dedicated_used_bytes: g.values[1],
                            shared_used_bytes: g.values[2],
                            engines: Vec::new(),
                        })
                    })
                    .collect()
            })
            .transpose()?;
        Ok(())
    }
}

/// Stream legacy rows in bounded batches. Called inside the schema transaction.
pub(crate) fn migrate(db: &Connection) -> Result<(), String> {
    let mut cursor = i64::MIN;
    loop {
        let mut statement=db.prepare("SELECT id,captured_at_ms,interval_start_ms,cpu_percent,memory_used_bytes,memory_total_bytes,network_receive,network_send,disk_read,disk_write,audio_peak,NULL,errors_json,NULL,NULL,NULL,0,cpu_frequency_mhz,gpus_json,battery_json,audio_input_peak FROM system_samples WHERE id>?1 ORDER BY id LIMIT 256").map_err(|e|e.to_string())?;
        let rows = statement
            .query_map([cursor], super::sqlite::decode)
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        if rows.is_empty() {
            break;
        }
        let mut block = Block::default();
        for row in rows {
            cursor = row.id as i64;
            block.push(db, row.id, &row.sample)?;
        }
        block.flush(db)?;
    }
    Ok(())
}

/// Offline verification against an untouched schema-6 backup. Compare every
/// measurement and state-table row; the only permitted difference is engines.
pub(crate) fn verify_legacy(db: &Connection, path: &std::path::Path) -> Result<(), String> {
    let old = Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| e.to_string())?;
    let version: u32 = old
        .pragma_query_value(None, "user_version", |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if version != 6 {
        return Err("Verification source must be a schema-6 archive".into());
    }
    let sql="SELECT id,captured_at_ms,interval_start_ms,cpu_percent,memory_used_bytes,memory_total_bytes,network_receive,network_send,disk_read,disk_write,audio_peak,NULL,errors_json,NULL,NULL,NULL,0,cpu_frequency_mhz,gpus_json,battery_json,audio_input_peak FROM system_samples ORDER BY id";
    let mut source = old.prepare(sql).map_err(|e| e.to_string())?;
    let mut target = db.prepare(sql).map_err(|e| e.to_string())?;
    let mut originals = source
        .query_map([], super::sqlite::decode)
        .map_err(|e| e.to_string())?;
    let mut actuals = target
        .query_map([], super::sqlite::decode)
        .map_err(|e| e.to_string())?;
    let mut reader = Reader::new(db);
    loop {
        match (originals.next(), actuals.next()) {
            (None, None) => break,
            (Some(a), Some(b)) => {
                let mut a = a.map_err(|e| e.to_string())?;
                let mut b = b.map_err(|e| e.to_string())?;
                reader.restore(&mut b)?;
                if let Some(gpus) = &mut a.sample.gpus {
                    for gpu in gpus {
                        gpu.engines.clear();
                    }
                }
                if a.id != b.id || a.sample != b.sample {
                    return Err(format!(
                        "Measurement verification failed at observation {}",
                        a.id
                    ));
                }
            }
            _ => return Err("Observation count mismatch".into()),
        }
    }
    for table in [
        "applications",
        "process_instances",
        "windows",
        "strings",
        "media_items",
        "app_presence_intervals",
        "foreground_intervals",
        "window_title_intervals",
        "media_intervals",
        "idle_intervals",
    ] {
        let sql = format!("SELECT * FROM {table} ORDER BY id");
        let mut source = old.prepare(&sql).map_err(|e| e.to_string())?;
        let mut target = db.prepare(&sql).map_err(|e| e.to_string())?;
        let columns = source.column_count();
        let decode = |r: &rusqlite::Row<'_>| {
            (0..columns)
                .map(|i| r.get::<_, rusqlite::types::Value>(i))
                .collect::<rusqlite::Result<Vec<_>>>()
        };
        let mut originals = source.query_map([], decode).map_err(|e| e.to_string())?;
        let mut actuals = target.query_map([], decode).map_err(|e| e.to_string())?;
        loop {
            match (originals.next(), actuals.next()) {
                (None, None) => break,
                (Some(a), Some(b))
                    if a.as_ref().map_err(|e| e.to_string())?
                        == b.as_ref().map_err(|e| e.to_string())? => {}
                _ => return Err(format!("State verification failed in {table}")),
            }
        }
    }
    // Fields intentionally outside the numeric codec must also remain identical.
    for sql in ["SELECT id,captured_at_ms,interval_start_ms,activity_present,background_observed,idle_ms,errors_json FROM system_samples ORDER BY id"] {
        let mut source=old.prepare(sql).map_err(|e|e.to_string())?;
        let mut target=db.prepare(sql).map_err(|e|e.to_string())?;
        let decode=|r:&rusqlite::Row<'_>|(0..7).map(|i|r.get::<_,rusqlite::types::Value>(i)).collect::<rusqlite::Result<Vec<_>>>();
        let mut originals=source.query_map([],decode).map_err(|e|e.to_string())?;
        let mut actuals=target.query_map([],decode).map_err(|e|e.to_string())?;
        loop {
            match (originals.next(),actuals.next()) {
                (None,None)=>break,
                (Some(a),Some(b)) if a.as_ref().map_err(|e|e.to_string())?==b.as_ref().map_err(|e|e.to_string())?=>{},
                _=>return Err("Observation metadata verification failed".into()),
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{SqliteStore, MIGRATIONS};
    use tracel_core::GpuEngineObservation;

    struct Fixture(std::path::PathBuf);
    impl Fixture {
        fn new() -> Self {
            let dir = std::env::temp_dir().join(format!(
                "tracel-compact-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            std::fs::create_dir(&dir).unwrap();
            Self(dir)
        }
        fn path(&self) -> std::path::PathBuf {
            self.0.join("activity.sqlite3")
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }
    fn sample(i: u64) -> SystemObservation {
        SystemObservation {
            captured_at_ms: 10000 + i * 2000,
            interval_start_ms: if i % 113 == 0 {
                None
            } else {
                Some(8000 + i * 2000)
            },
            cpu_percent: if i % 29 == 0 {
                None
            } else {
                Some(10.0 + i as f64 * 0.00011)
            },
            cpu_frequency_mhz: Some(3200.0),
            memory_used_bytes: Some(8000000000 + i * 411),
            memory_total_bytes: Some(16000000000),
            network_receive_bytes_per_second: Some(i as f64 * 0.00003),
            network_send_bytes_per_second: Some(0.0),
            disk_read_bytes_per_second: Some(i as f64 * 10.123456789),
            disk_write_bytes_per_second: None,
            audio_peak_percent: Some(0.0),
            audio_input_peak_percent: if i % 13 == 0 { None } else { Some(0.0000001) },
            gpus: if i % 71 == 0 {
                None
            } else {
                Some(vec![GpuObservation {
                    id: "GPU-1".into(),
                    name: if i < 300 {
                        "显卡".into()
                    } else {
                        "Resolved GPU".into()
                    },
                    utilization_percent: Some(0.01 + i as f64 * 0.00001),
                    dedicated_used_bytes: Some(1024 + i),
                    shared_used_bytes: Some(0),
                    engines: (0..40)
                        .map(|j| GpuEngineObservation {
                            id: j.to_string(),
                            name: format!("Copy #{j}"),
                            utilization_percent: 0.0,
                        })
                        .collect(),
                }])
            },
            battery: if i % 37 == 0 {
                None
            } else {
                Some(BatteryObservation {
                    present: Some(true),
                    percent: Some(99),
                    plugged_in: Some(i < 400),
                    charging: None,
                })
            },
            ..Default::default()
        }
    }
    fn archived(mut s: SystemObservation) -> SystemObservation {
        if let Some(gpus) = &mut s.gpus {
            for g in gpus {
                g.engines.clear();
            }
        }
        s
    }
    #[test]
    fn small_deltas_round_trip_exactly_across_blocks_restart_gaps_and_cursors() {
        let fixture = Fixture::new();
        let rows: Vec<_> = (0..700).map(sample).collect();
        let mut store = SqliteStore::open(&fixture.path()).unwrap();
        for chunk in rows[..350].chunks(17) {
            store.append(chunk).unwrap();
        }
        drop(store);
        let mut store = SqliteStore::open(&fixture.path()).unwrap();
        store.append(&rows[350..]).unwrap();
        let page = SqliteStore::query(&fixture.path(), 0, 2000000, 0).unwrap();
        assert_eq!(
            page.observations
                .iter()
                .map(|r| r.sample.clone())
                .collect::<Vec<_>>(),
            rows.iter().cloned().map(archived).collect::<Vec<_>>()
        );
        assert_eq!(
            store.recent().unwrap(),
            rows.iter().cloned().map(archived).collect::<Vec<_>>()
        );
        let page = SqliteStore::query(&fixture.path(), 0, 2000000, 257).unwrap();
        assert_eq!(page.observations[0].sample, archived(rows[257].clone()));
        assert_eq!(page.observations.len(), 443);
        let db = Connection::open(fixture.path()).unwrap();
        let text:i64=db.query_row("SELECT COUNT(*) FROM system_samples WHERE gpus_json IS NOT NULL OR battery_json IS NOT NULL OR cpu_percent IS NOT NULL",[],|r|r.get(0)).unwrap();
        assert_eq!(text, 0);
        let metadata: i64 = db
            .query_row("SELECT COUNT(*) FROM gpu_adapters", [], |r| r.get(0))
            .unwrap();
        assert_eq!(metadata, 2);
        let bytes: i64 = db
            .query_row("SELECT SUM(length(payload)) FROM numeric_blocks", [], |r| {
                r.get(0)
            })
            .unwrap();
        let original = serde_json::to_vec(&rows).unwrap().len();
        assert!(
            (bytes as usize) * 10 < original,
            "compact {bytes}, original {original}"
        );
    }
    #[test]
    fn migration_backs_up_and_preserves_numeric_bits_and_sparse_ids_but_retires_engines() {
        let fixture = Fixture::new();
        let db = Connection::open(fixture.path()).unwrap();
        for m in MIGRATIONS.iter().take(6) {
            db.execute_batch(m.sql).unwrap();
        }
        db.pragma_update(None, "user_version", 6).unwrap();
        let rows: Vec<_> = (1..600).map(sample).collect();
        db.execute_batch("BEGIN").unwrap();
        for (i, s) in rows.iter().enumerate() {
            crate::intervals::write(&db, s, Some(i as i64 * 2 + 1), i > 0).unwrap();
        }
        db.execute_batch("COMMIT").unwrap();
        drop(db);
        let store = SqliteStore::open(&fixture.path()).unwrap();
        let actual = store.recent().unwrap();
        assert_eq!(actual.len(), rows.len());
        for (i, (actual, expected)) in actual
            .into_iter()
            .zip(rows.iter().cloned().map(archived))
            .enumerate()
        {
            assert_eq!(actual, expected, "observation {i}");
        }
        let backup = std::fs::read_dir(&fixture.0)
            .unwrap()
            .map(|e| e.unwrap().path())
            .find(|p| p.to_string_lossy().contains(".backup.sqlite3"))
            .unwrap();
        let old = Connection::open(&backup).unwrap();
        assert_eq!(
            old.pragma_query_value(None, "user_version", |r| r.get::<_, u32>(0))
                .unwrap(),
            6
        );
        let g: String = old
            .query_row(
                "SELECT gpus_json FROM system_samples WHERE gpus_json IS NOT NULL LIMIT 1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!(g.contains("Copy #39"));
        store.verify_legacy_archive(&backup).unwrap();
        store.reclaim_space().unwrap();
        let page = SqliteStore::query(&fixture.path(), 0, 2000000, 0).unwrap();
        assert_eq!(page.observations[200].id, 401);
        assert_eq!(page.observations[200].sample, archived(rows[200].clone()));
    }
    #[test]
    fn corrupt_legacy_json_rolls_back_the_entire_upgrade() {
        let fixture = Fixture::new();
        let db = Connection::open(fixture.path()).unwrap();
        for m in MIGRATIONS.iter().take(6) {
            db.execute_batch(m.sql).unwrap();
        }
        db.pragma_update(None, "user_version", 6).unwrap();
        db.execute_batch("BEGIN").unwrap();
        for i in 0..260 {
            crate::intervals::write(&db, &sample(i), None, i > 0).unwrap();
        }
        db.execute(
            "UPDATE system_samples SET gpus_json='broken' WHERE id=260",
            [],
        )
        .unwrap();
        db.execute_batch("COMMIT").unwrap();
        drop(db);
        assert!(SqliteStore::open(&fixture.path()).is_err());
        let db = Connection::open(fixture.path()).unwrap();
        assert_eq!(
            db.pragma_query_value(None, "user_version", |r| r.get::<_, u32>(0))
                .unwrap(),
            6
        );
        assert!(db
            .query_row("SELECT gpus_json FROM system_samples WHERE id=2", [], |r| r
                .get::<_, String>(0))
            .unwrap()
            .contains("Copy #39"));
        assert!(db.prepare("SELECT * FROM numeric_blocks").is_err());
    }
    #[test]
    fn bounded_codec_rejects_corruption_and_retains_null_zero_and_signed_zero() {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch(
            MIGRATIONS[6]
                .sql
                .split("CREATE TABLE gpu_adapters")
                .nth(1)
                .map(|s| format!("CREATE TABLE gpu_adapters{s}"))
                .unwrap()
                .as_str(),
        )
        .unwrap();
        let mut block = Block::default();
        for i in 0..10 {
            let mut s = sample(i);
            s.cpu_percent = match i % 3 {
                0 => None,
                1 => Some(-0.0),
                _ => Some(0.0),
            };
            s.gpus = Some(Vec::new());
            block.push(&db, i, &s).unwrap();
        }
        let payload = block.encode().unwrap();
        assert_eq!(Block::decode(&payload).unwrap().rows, block.rows);
        assert!(Block::decode(&payload[..payload.len() / 2]).is_err());
        assert!(Block::decode(&payload[..payload.len() - 1]).is_err());
        assert!(Block::decode(&vec![0; MAX_BYTES + 1]).is_err());
    }
}
