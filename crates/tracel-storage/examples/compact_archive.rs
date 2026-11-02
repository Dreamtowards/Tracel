//! Offline upgrade/compaction. SqliteStore makes a pre-v7 backup automatically.
use std::path::PathBuf;
fn main() -> Result<(), String> {
    let mut args = std::env::args_os().skip(1);
    let path = PathBuf::from(
        args.next()
            .ok_or("Usage: compact_archive <database> [--vacuum]")?,
    );
    let mut vacuum = false;
    let mut verify = None;
    while let Some(arg) = args.next() {
        if arg == "--vacuum" {
            vacuum = true;
        } else if arg == "--verify-against" {
            verify = Some(PathBuf::from(args.next().ok_or("Missing backup path")?));
        } else {
            return Err("Unknown maintenance option".into());
        }
    }
    if !path.is_file() {
        return Err("Archive does not exist".into());
    }
    let before = std::fs::metadata(&path).map_err(|e| e.to_string())?.len();
    eprintln!("Opening archive (pre-upgrade backup is created before migration)...");
    let store = tracel_storage::SqliteStore::open(&path)?;
    let count = store.count()?;
    store.recent()?;
    if let Some(backup) = verify {
        eprintln!("Verifying every measurement and state row against the backup...");
        store.verify_legacy_archive(&backup)?;
        eprintln!("All measurements and state rows match (GPU engine detail excluded).");
    }
    if vacuum {
        eprintln!("Reclaiming space and verifying integrity...");
        store.reclaim_space()?;
    }
    drop(store);
    let after = std::fs::metadata(&path).map_err(|e| e.to_string())?.len();
    println!("Observations: {count}; database bytes: {before} -> {after}");
    Ok(())
}
