use std::{
    collections::hash_map::DefaultHasher,
    hash::{Hash, Hasher},
    path::Path,
};

const LIMIT: usize = 512;
const MAX_PNG: u64 = 65_536;

/// Cached resources only: never execute the target or persist icon blobs in SQLite.
pub fn load(executable: &str, folder: &Path) -> Result<Option<Vec<u8>>, String> {
    static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _guard = LOCK.lock().map_err(|_| "Icon cache lock poisoned")?;
    let path = Path::new(executable);
    if !local_executable(path) {
        return Ok(None);
    }
    let metadata = match path.metadata() {
        Ok(value) if value.is_file() => value,
        _ => return Ok(None),
    };
    let mut hash = DefaultHasher::new();
    executable.replace('\\', "/").to_lowercase().hash(&mut hash);
    metadata.len().hash(&mut hash);
    metadata.modified().ok().hash(&mut hash);
    let filename = folder.join(format!("v1-{:016x}.png", hash.finish()));
    if let Ok(metadata) = filename.metadata() {
        if metadata.len() <= MAX_PNG {
            if let Ok(bytes) = std::fs::read(&filename) {
                if valid_png(&bytes) {
                    return Ok(Some(bytes));
                }
            }
        }
    }
    let Some(bytes) = extract(path)? else {
        return Ok(None);
    };
    // A cache write failure must not hide an otherwise readable application icon.
    if std::fs::create_dir_all(folder).is_ok() {
        prune(folder);
        let _ = std::fs::write(filename, &bytes);
    }
    Ok(Some(bytes))
}

fn valid_png(bytes: &[u8]) -> bool {
    let header = bytes.len() >= 24
        && &bytes[..8] == b"\x89PNG\r\n\x1a\n"
        && bytes[16..20] == 32u32.to_be_bytes()
        && bytes[20..24] == 32u32.to_be_bytes();
    if !header {
        return false;
    }
    let Ok(mut reader) = png::Decoder::new(bytes).read_info() else {
        return false;
    };
    if reader.output_buffer_size() > 4096 {
        return false;
    }
    reader.next_frame(&mut [0; 4096]).is_ok()
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::io::Write;
    fn temporary() -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "tracel-icons-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }
    #[test]
    fn native_extraction_cache_reuse_and_executable_update() {
        let root = temporary();
        std::fs::create_dir_all(&root).unwrap();
        let source = root.join("editor.exe");
        let system = std::path::PathBuf::from(std::env::var_os("WINDIR").unwrap())
            .join("System32/notepad.exe");
        std::fs::copy(system, &source).unwrap();
        let cache = root.join("cache");
        let first = load(source.to_str().unwrap(), &cache)
            .unwrap()
            .expect("system executable has an icon");
        assert!(valid_png(&first));
        let mut decoder = png::Decoder::new(first.as_slice()).read_info().unwrap();
        let mut pixels = vec![0; decoder.output_buffer_size()];
        decoder.next_frame(&mut pixels).unwrap();
        assert!(pixels.chunks_exact(4).any(|pixel| pixel[3] > 0));
        assert!(
            pixels.chunks_exact(4).any(|pixel| pixel[3] == 0),
            "transparent icon background"
        );
        let entry = std::fs::read_dir(&cache)
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        let modified = entry.metadata().unwrap().modified().unwrap();
        assert_eq!(
            load(source.to_str().unwrap(), &cache).unwrap().unwrap(),
            first
        );
        assert_eq!(
            entry.metadata().unwrap().modified().unwrap(),
            modified,
            "cache hit does not rewrite the PNG"
        );
        std::fs::write(&entry, &first[..24]).unwrap();
        assert_eq!(
            load(source.to_str().unwrap(), &cache).unwrap().unwrap(),
            first,
            "truncated cache is regenerated"
        );
        assert!(valid_png(&std::fs::read(&entry).unwrap()));
        std::fs::OpenOptions::new()
            .append(true)
            .open(&source)
            .unwrap()
            .write_all(&[0])
            .unwrap();
        assert!(load(source.to_str().unwrap(), &cache).unwrap().is_some());
        assert_eq!(
            std::fs::read_dir(&cache).unwrap().count(),
            2,
            "changed executable receives a new cache key"
        );
        for file in std::fs::read_dir(&cache).unwrap() {
            std::fs::remove_file(file.unwrap().path()).unwrap();
        }
        std::fs::remove_dir(cache).unwrap();
        std::fs::remove_file(source).unwrap();
        std::fs::remove_dir(root).unwrap();
    }
    #[test]
    fn rejects_relative_non_executable_and_network_paths() {
        for path in [
            "Code.exe",
            "C:\\test.txt",
            "\\\\server\\share\\app.exe",
            "\\\\?\\UNC\\server\\share\\app.exe",
            "C:\\bad\0.exe",
        ] {
            assert!(!local_executable(Path::new(path)), "{path:?}");
        }
        assert!(local_executable(Path::new("C:\\Apps\\Editor.exe")));
        assert!(local_executable(Path::new("\\\\?\\C:\\Apps\\Editor.exe")));
        assert!(load("C:\\missing-tracel-app.exe", &temporary())
            .unwrap()
            .is_none());
    }
    #[test]
    fn pruning_is_bounded_and_only_touches_owned_cache_names() {
        let root = temporary();
        std::fs::create_dir_all(&root).unwrap();
        for index in 0..LIMIT + 2 {
            std::fs::write(root.join(format!("v1-{index:016x}.png")), [0]).unwrap();
        }
        let other = root.join("unrelated.png");
        std::fs::write(&other, [0]).unwrap();
        prune(&root);
        assert!(other.exists());
        assert_eq!(std::fs::read_dir(&root).unwrap().count(), LIMIT);
        for file in std::fs::read_dir(&root).unwrap() {
            std::fs::remove_file(file.unwrap().path()).unwrap();
        }
        std::fs::remove_dir(root).unwrap();
    }
}

fn prune(folder: &Path) {
    let Ok(entries) = std::fs::read_dir(folder) else {
        return;
    };
    let mut entries: Vec<_> = entries
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            let metadata = entry.metadata().ok()?;
            (name.len() == 23
                && name.starts_with("v1-")
                && name.ends_with(".png")
                && name.as_bytes()[3..19]
                    .iter()
                    .all(|byte| byte.is_ascii_hexdigit())
                && metadata.is_file())
            .then_some((metadata.modified().ok(), entry.path()))
        })
        .collect();
    entries.sort_by_key(|entry| entry.0);
    let remove = entries.len().saturating_sub(LIMIT - 1);
    for (_, path) in entries.into_iter().take(remove) {
        let _ = std::fs::remove_file(path);
    }
}

#[cfg(windows)]
fn local_executable(path: &Path) -> bool {
    use std::path::{Component, Prefix};
    path.is_absolute()
        && path
            .extension()
            .is_some_and(|extension| extension.eq_ignore_ascii_case("exe"))
        && matches!(path.components().next(), Some(Component::Prefix(prefix)) if matches!(prefix.kind(), Prefix::Disk(_) | Prefix::VerbatimDisk(_)))
        && !path.as_os_str().to_string_lossy().contains('\0')
}
#[cfg(not(windows))]
fn local_executable(_: &Path) -> bool {
    false
}

#[cfg(not(windows))]
fn extract(_: &Path) -> Result<Option<Vec<u8>>, String> {
    Ok(None)
}

#[cfg(windows)]
fn extract(path: &Path) -> Result<Option<Vec<u8>>, String> {
    use std::{os::windows::ffi::OsStrExt, ptr};
    use windows_sys::Win32::{
        Graphics::Gdi::*,
        UI::{Shell::ExtractIconExW, WindowsAndMessaging::*},
    };
    struct Surface {
        dc: HDC,
        bitmap: HBITMAP,
        previous: HGDIOBJ,
        icon: HICON,
    }
    impl Drop for Surface {
        fn drop(&mut self) {
            unsafe {
                if !self.previous.is_null() {
                    SelectObject(self.dc, self.previous);
                }
                if !self.bitmap.is_null() {
                    DeleteObject(self.bitmap);
                }
                if !self.dc.is_null() {
                    DeleteDC(self.dc);
                }
                if !self.icon.is_null() {
                    DestroyIcon(self.icon);
                }
            }
        }
    }
    let wide: Vec<_> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    let mut surface = Surface {
        dc: ptr::null_mut(),
        bitmap: ptr::null_mut(),
        previous: ptr::null_mut(),
        icon: ptr::null_mut(),
    };
    unsafe {
        if ExtractIconExW(wide.as_ptr(), 0, &mut surface.icon, ptr::null_mut(), 1) == 0
            || surface.icon.is_null()
        {
            return Ok(None);
        }
        surface.dc = CreateCompatibleDC(ptr::null_mut());
        if surface.dc.is_null() {
            return Err("Could not create icon drawing context".into());
        }
        let info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: 32,
                biHeight: -32,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB,
                ..std::mem::zeroed()
            },
            ..std::mem::zeroed()
        };
        let mut bits = ptr::null_mut();
        surface.bitmap = CreateDIBSection(
            surface.dc,
            &info,
            DIB_RGB_COLORS,
            &mut bits,
            ptr::null_mut(),
            0,
        );
        if surface.bitmap.is_null() || bits.is_null() {
            return Err("Could not create icon bitmap".into());
        }
        let previous = SelectObject(surface.dc, surface.bitmap);
        if previous.is_null() || previous as isize == -1 {
            return Err("Could not select icon bitmap".into());
        }
        surface.previous = previous;
        // Two backgrounds recover transparency for both modern alpha and legacy mask icons.
        ptr::write_bytes(bits.cast::<u8>(), 0, 32 * 32 * 4);
        if DrawIconEx(
            surface.dc,
            0,
            0,
            surface.icon,
            32,
            32,
            0,
            ptr::null_mut(),
            DI_NORMAL,
        ) == 0
        {
            return Err("Could not draw application icon".into());
        }
        GdiFlush();
        let black = std::slice::from_raw_parts(bits.cast::<u8>(), 32 * 32 * 4).to_vec();
        ptr::write_bytes(bits.cast::<u8>(), 255, 32 * 32 * 4);
        if DrawIconEx(
            surface.dc,
            0,
            0,
            surface.icon,
            32,
            32,
            0,
            ptr::null_mut(),
            DI_NORMAL,
        ) == 0
        {
            return Err("Could not draw application icon".into());
        }
        GdiFlush();
        let pixels = std::slice::from_raw_parts(bits.cast::<u8>(), 32 * 32 * 4);
        let mut rgba = vec![0; pixels.len()];
        for ((black, white), output) in black
            .chunks_exact(4)
            .zip(pixels.chunks_exact(4))
            .zip(rgba.chunks_exact_mut(4))
        {
            let difference = (0..3)
                .map(|channel| white[channel].saturating_sub(black[channel]) as u32)
                .sum::<u32>()
                / 3;
            let alpha = 255 - difference;
            output[3] = alpha as u8;
            if alpha > 0 {
                for (target, source) in [2, 1, 0].into_iter().enumerate() {
                    output[target] =
                        ((black[source] as u32 * 255 + alpha / 2) / alpha).min(255) as u8;
                }
            }
        }
        let mut bytes = Vec::new();
        let mut encoder = png::Encoder::new(&mut bytes, 32, 32);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().map_err(|e| e.to_string())?;
        writer.write_image_data(&rgba).map_err(|e| e.to_string())?;
        writer.finish().map_err(|e| e.to_string())?;
        Ok(Some(bytes))
    }
}
