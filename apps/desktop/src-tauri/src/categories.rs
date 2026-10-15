use std::io::{Read, Write};

pub fn read(path: &std::path::Path) -> Result<serde_json::Value, String> {
    static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _guard = LOCK
        .lock()
        .map_err(|_| "Category configuration lock poisoned")?;
    std::fs::create_dir_all(path.parent().ok_or("Missing configuration directory")?)
        .map_err(|e| e.to_string())?;
    match std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
    {
        Ok(mut file) => {
            file.write_all(include_bytes!(
                "../../../../packages/timeline/src/categories.default.json"
            ))
            .and_then(|_| file.sync_all())
            .map_err(|e| e.to_string())?;
        }
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
        Err(error) => return Err(error.to_string()),
    }
    let mut bytes = Vec::new();
    std::fs::File::open(path)
        .map_err(|e| e.to_string())?
        .take(1_048_577)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > 1_048_576 {
        return Err("categories.json exceeds 1 MiB".into());
    }
    serde_json::from_slice(bytes.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(&bytes))
        .map_err(|e| format!("categories.json: {e}"))
}

#[cfg(test)]
mod tests {
    #[test]
    fn initializes_defaults_but_never_overwrites_user_edits_or_invalid_json() {
        let folder = std::env::temp_dir().join(format!(
            "tracel-categories-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let path = folder.join("categories.json");
        assert_eq!(super::read(&path).unwrap()["version"], 1);
        let edited = br#"{"version":1,"categories":[],"rules":[]}"#;
        std::fs::write(&path, edited).unwrap();
        assert_eq!(
            super::read(&path).unwrap()["categories"],
            serde_json::json!([])
        );
        assert_eq!(std::fs::read(&path).unwrap(), edited);
        std::fs::write(&path, b"invalid json").unwrap();
        assert!(super::read(&path).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), b"invalid json");
        std::fs::remove_file(path).unwrap();
        std::fs::remove_dir(folder).unwrap();
    }
}
