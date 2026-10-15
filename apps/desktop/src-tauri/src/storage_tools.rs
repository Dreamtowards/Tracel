use std::{io::ErrorKind, path::Path};

/// Logical sizes of the database and its optional SQLite sidecars.
pub fn database_size_bytes(path: &Path) -> Option<u64> {
    let mut total = std::fs::metadata(path).ok()?.len();
    for suffix in ["-wal", "-shm"] {
        let mut sidecar = path.as_os_str().to_owned();
        sidecar.push(suffix);
        match std::fs::metadata(Path::new(&sidecar)) {
            Ok(metadata) => total = total.checked_add(metadata.len())?,
            Err(error) if error.kind() == ErrorKind::NotFound => {}
            Err(_) => return None,
        }
    }
    Some(total)
}

pub fn open_database_folder(path: &Path) -> Result<(), String> {
    let folder = path
        .parent()
        .filter(|folder| folder.is_dir())
        .ok_or("Database folder is unavailable")?;
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::{core::w, Win32::UI::Shell::ShellExecuteW};
        let folder: Vec<u16> = folder.as_os_str().encode_wide().chain(Some(0)).collect();
        // Fixed app-owned directory; no shell command, arguments or frontend-supplied path.
        let result = unsafe {
            ShellExecuteW(
                std::ptr::null_mut(),
                w!("open"),
                folder.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                1,
            )
        };
        if result as isize <= 32 {
            return Err(format!(
                "Could not open database folder: {}",
                result as isize
            ));
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = folder;
        Err("Windows only".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn size_counts_sidecars_and_tracks_removal_without_touching_database_contents() {
        let folder = std::env::temp_dir().join(format!(
            "tracel-size-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&folder).unwrap();
        let db = folder.join("activity.sqlite3");
        let wal = folder.join("activity.sqlite3-wal");
        let shm = folder.join("activity.sqlite3-shm");
        assert_eq!(database_size_bytes(&db), None);
        for (path, size) in [(&db, 100), (&wal, 200), (&shm, 50)] {
            std::fs::File::create(path).unwrap().set_len(size).unwrap();
        }
        assert_eq!(database_size_bytes(&db), Some(350));
        std::fs::remove_file(&wal).unwrap();
        assert_eq!(database_size_bytes(&db), Some(150));
        std::fs::remove_file(&shm).unwrap();
        std::fs::remove_file(&db).unwrap();
        std::fs::remove_dir(&folder).unwrap();
        assert!(open_database_folder(&db).is_err());
    }
}
