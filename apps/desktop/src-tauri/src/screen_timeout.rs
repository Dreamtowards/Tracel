//! Explicit edits to the active plan's DISPLAY timeout only. Never sends monitor commands.
use serde::{Deserialize, Serialize};
static POWER_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Timeout {
    pub scheme_id: String,
    pub ac_seconds: u32,
    pub dc_seconds: u32,
}

trait Policy {
    fn read(&self) -> Result<Timeout, String>;
    fn write(&mut self, value: &Timeout, ac: bool) -> Result<(), String>;
    fn apply(&mut self, value: &Timeout) -> Result<(), String>;
}
fn save(
    policy: &mut impl Policy,
    expected: &Timeout,
    ac_seconds: u32,
    dc_seconds: u32,
) -> Result<Timeout, String> {
    let original = policy.read()?;
    if &original != expected {
        return Err("Windows power settings changed. Refresh before saving.".into());
    }
    // Preserve unusual existing values, but do not create very short accidental timeouts.
    // Zero is Windows' "Never".
    for (seconds, previous) in [
        (ac_seconds, original.ac_seconds),
        (dc_seconds, original.dc_seconds),
    ] {
        if seconds != previous && seconds != 0 && !(60..=86400).contains(&seconds) {
            return Err("Display timeout must be 0 or 60–86400 seconds.".into());
        }
    }
    let updated = Timeout {
        ac_seconds,
        dc_seconds,
        ..original.clone()
    };
    if updated == original {
        return Ok(original);
    }
    let mut wrote_ac = false;
    let mut wrote_dc = false;
    let change = (|| {
        if updated.ac_seconds != original.ac_seconds {
            policy.write(&updated, true)?;
            wrote_ac = true;
        }
        if updated.dc_seconds != original.dc_seconds {
            policy.write(&updated, false)?;
            wrote_dc = true;
        }
        // Refuse to reactivate a plan that the user switched away from meanwhile.
        if policy.read()?.scheme_id != original.scheme_id {
            return Err("Active power plan changed during save.".into());
        }
        policy.apply(&updated)?;
        let actual = policy.read()?;
        if actual != updated {
            return Err("Windows did not retain the requested timeout.".into());
        }
        Ok(actual)
    })();
    match change {
        Ok(value) => Ok(value),
        Err(error) => {
            // Best effort rollback, surface failures rather than claiming atomic OS writes.
            let ac = if wrote_ac {
                policy.write(&original, true)
            } else {
                Ok(())
            };
            let dc = if wrote_dc {
                policy.write(&original, false)
            } else {
                Ok(())
            };
            let apply = match policy.read() {
                Ok(now) if (wrote_ac || wrote_dc) && now.scheme_id == original.scheme_id => {
                    policy.apply(&original)
                }
                _ => Ok(()),
            };
            if ac.is_err() || dc.is_err() || apply.is_err() {
                Err(format!(
                    "{error} Rollback was incomplete; check Windows power settings."
                ))
            } else {
                Err(error)
            }
        }
    }
}

#[cfg(windows)]
mod native {
    use super::*;
    use windows_sys::{
        core::GUID,
        Win32::{Foundation::LocalFree, System::Power::*},
    };
    // SDK GUID_VIDEO_SUBGROUP and GUID_VIDEO_POWERDOWN_TIMEOUT (seconds).
    const VIDEO: GUID = GUID::from_u128(0x7516b95f_f776_4464_8c53_06167f40cc99);
    const TIMEOUT: GUID = GUID::from_u128(0x3c0bc021_c8a8_4e07_a973_6b14cbcb2b7e);
    fn check(code: u32) -> Result<(), String> {
        if code == 0 {
            Ok(())
        } else {
            Err(format!(
                "Windows power settings: {}",
                std::io::Error::from_raw_os_error(code as i32)
            ))
        }
    }
    fn id(g: &GUID) -> String {
        format!(
            "{:08x}-{:04x}-{:04x}-{}",
            g.data1,
            g.data2,
            g.data3,
            g.data4
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect::<String>()
        )
    }
    pub struct WindowsPolicy {
        scheme: GUID,
    }
    impl WindowsPolicy {
        pub fn new() -> Result<Self, String> {
            unsafe {
                let mut pointer = std::ptr::null_mut();
                check(PowerGetActiveScheme(std::ptr::null_mut(), &mut pointer))?;
                if pointer.is_null() {
                    return Err("Windows returned no active power scheme.".into());
                }
                let scheme = *pointer;
                LocalFree(pointer.cast());
                Ok(Self { scheme })
            }
        }
    }
    impl Policy for WindowsPolicy {
        fn read(&self) -> Result<Timeout, String> {
            unsafe {
                let active = Self::new()?;
                let mut ac_seconds = 0;
                let mut dc_seconds = 0;
                check(PowerReadACValueIndex(
                    std::ptr::null_mut(),
                    &active.scheme,
                    &VIDEO,
                    &TIMEOUT,
                    &mut ac_seconds,
                ))?;
                check(PowerReadDCValueIndex(
                    std::ptr::null_mut(),
                    &active.scheme,
                    &VIDEO,
                    &TIMEOUT,
                    &mut dc_seconds,
                ))?;
                Ok(Timeout {
                    scheme_id: id(&active.scheme),
                    ac_seconds,
                    dc_seconds,
                })
            }
        }
        fn write(&mut self, value: &Timeout, ac: bool) -> Result<(), String> {
            unsafe {
                if value.scheme_id != id(&self.scheme) {
                    return Err("Active power plan changed. Refresh before saving.".into());
                }
                check(if ac {
                    PowerWriteACValueIndex(
                        std::ptr::null_mut(),
                        &self.scheme,
                        &VIDEO,
                        &TIMEOUT,
                        value.ac_seconds,
                    )
                } else {
                    PowerWriteDCValueIndex(
                        std::ptr::null_mut(),
                        &self.scheme,
                        &VIDEO,
                        &TIMEOUT,
                        value.dc_seconds,
                    )
                })
            }
        }
        fn apply(&mut self, _value: &Timeout) -> Result<(), String> {
            unsafe { check(PowerSetActiveScheme(std::ptr::null_mut(), &self.scheme)) }
        }
    }
}
pub fn read() -> Result<Timeout, String> {
    let _guard = POWER_LOCK.lock().map_err(|_| "Power settings are busy")?;
    #[cfg(windows)]
    {
        native::WindowsPolicy::new()?.read()
    }
    #[cfg(not(windows))]
    {
        Err("Windows only".into())
    }
}
pub fn update(expected: Timeout, ac_seconds: u32, dc_seconds: u32) -> Result<Timeout, String> {
    let _guard = POWER_LOCK.lock().map_err(|_| "Power settings are busy")?;
    #[cfg(windows)]
    {
        save(
            &mut native::WindowsPolicy::new()?,
            &expected,
            ac_seconds,
            dc_seconds,
        )
    }
    #[cfg(not(windows))]
    {
        let _ = (expected, ac_seconds, dc_seconds);
        Err("Windows only".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Fake {
        value: Timeout,
        fail_dc_once: bool,
        fail_apply_once: bool,
        fail_all_writes: bool,
        fail_rollback: bool,
        writes: usize,
    }
    impl Policy for Fake {
        fn read(&self) -> Result<Timeout, String> {
            Ok(self.value.clone())
        }
        fn write(&mut self, v: &Timeout, ac: bool) -> Result<(), String> {
            self.writes += 1;
            if self.fail_all_writes {
                return Err("Denied".into());
            }
            if !ac && self.fail_dc_once {
                self.fail_dc_once = false;
                return Err("Denied".into());
            }
            if ac {
                self.value.ac_seconds = v.ac_seconds
            } else {
                self.value.dc_seconds = v.dc_seconds
            }
            Ok(())
        }
        fn apply(&mut self, _: &Timeout) -> Result<(), String> {
            if self.fail_apply_once {
                self.fail_apply_once = false;
                self.fail_all_writes = self.fail_rollback;
                return Err("Could not apply".into());
            }
            Ok(())
        }
    }
    #[test]
    fn save_validates_detects_conflicts_and_rolls_back_partial_writes() {
        let original = Timeout {
            scheme_id: "test".into(),
            ac_seconds: 900,
            dc_seconds: 300,
        };
        let mut p = Fake {
            value: original.clone(),
            fail_dc_once: true,
            fail_apply_once: false,
            fail_all_writes: false,
            fail_rollback: false,
            writes: 0,
        };
        assert!(save(&mut p, &original, 1, 300).is_err());
        assert_eq!(p.writes, 0);
        assert!(save(
            &mut p,
            &Timeout {
                ac_seconds: 100,
                ..original.clone()
            },
            600,
            120
        )
        .is_err());
        assert_eq!(p.writes, 0);
        assert!(save(&mut p, &original, 600, 120).is_err());
        assert_eq!(p.value, original);
        assert_eq!(save(&mut p, &original, 0, 120).unwrap().ac_seconds, 0);
    }
    #[test]
    fn apply_failure_rolls_back_and_rollback_failure_is_visible() {
        let original = Timeout {
            scheme_id: "test".into(),
            ac_seconds: 900,
            dc_seconds: 300,
        };
        let mut p = Fake {
            value: original.clone(),
            fail_dc_once: false,
            fail_apply_once: true,
            fail_all_writes: false,
            fail_rollback: false,
            writes: 0,
        };
        assert!(save(&mut p, &original, 600, 120).is_err());
        assert_eq!(p.value, original);
        p.fail_apply_once = true;
        p.fail_rollback = true;
        assert!(save(&mut p, &original, 600, 120)
            .unwrap_err()
            .contains("Rollback was incomplete"));
    }
    #[test]
    #[cfg(windows)]
    fn native_read_only_never_modifies_power_settings() {
        let value = read().unwrap();
        assert!(!value.scheme_id.is_empty());
    }
}
