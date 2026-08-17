use super::types::{DetectionEvent, MeetingDetectionConfig};
use tokio::sync::mpsc;

/// Monitor Windows microphone usage via CapabilityAccessManager registry key.
/// Detects when Teams/Zoom/browser starts using the mic.
pub struct WindowsMeetingDetector {
    config: MeetingDetectionConfig,
    event_tx: mpsc::UnboundedSender<DetectionEvent>,
    stop_tx: Option<tokio::sync::oneshot::Sender<()>>,
}

impl WindowsMeetingDetector {
    pub fn new(config: MeetingDetectionConfig) -> (Self, mpsc::UnboundedReceiver<DetectionEvent>) {
        let (tx, rx) = mpsc::unbounded_channel();
        (
            Self {
                config,
                event_tx: tx,
                stop_tx: None,
            },
            rx,
        )
    }

    pub fn start(&mut self) {
        let (stop_tx, mut stop_rx) = tokio::sync::oneshot::channel();
        self.stop_tx = Some(stop_tx);

        let config = self.config.clone();
        let tx = self.event_tx.clone();

        tokio::spawn(async move {
            let mut mic_start_time: Option<std::time::Instant> = None;
            let mut grace_start_time: Option<std::time::Instant> = None;
            let mut call_detected = false;

            loop {
                tokio::select! {
                    _ = &mut stop_rx => break,
                    _ = tokio::time::sleep(std::time::Duration::from_secs(2)) => {
                        let mic_in_use = check_mic_usage();

                        if mic_in_use {
                            // Mic is active — cancel any grace period
                            grace_start_time = None;

                            // Record start time on first detection (or after gap)
                            if mic_start_time.is_none() {
                                mic_start_time = Some(std::time::Instant::now());
                                call_detected = false;
                            }

                            // Check if call duration threshold reached
                            if !call_detected {
                                if let Some(start) = mic_start_time {
                                    if start.elapsed().as_secs() >= config.min_call_seconds as u64 {
                                        call_detected = true;
                                        let _ = tx.send(DetectionEvent {
                                            event_type: "meeting_detected".to_string(),
                                            app_name: None,
                                            timestamp: chrono::Utc::now().to_rfc3339(),
                                            confidence: 0.8,
                                        });
                                    }
                                }
                            }
                        } else {
                            // Mic inactive
                            if let Some(grace_start) = grace_start_time {
                                // Grace timer is running — check if it expired
                                if grace_start.elapsed().as_secs() >= config.grace_seconds as u64 {
                                    if call_detected {
                                        let _ = tx.send(DetectionEvent {
                                            event_type: "meeting_ended".to_string(),
                                            app_name: None,
                                            timestamp: chrono::Utc::now().to_rfc3339(),
                                            confidence: 0.8,
                                        });
                                    }
                                    mic_start_time = None;
                                    call_detected = false;
                                    grace_start_time = None;
                                }
                                // Otherwise still within grace, wait
                            } else if mic_start_time.is_some() && config.grace_seconds > 0 {
                                // Mic just went inactive — start grace timer
                                grace_start_time = Some(std::time::Instant::now());
                            } else {
                                // No grace configured (or no session) — end immediately
                                if call_detected {
                                    let _ = tx.send(DetectionEvent {
                                        event_type: "meeting_ended".to_string(),
                                        app_name: None,
                                        timestamp: chrono::Utc::now().to_rfc3339(),
                                        confidence: 0.8,
                                    });
                                }
                                mic_start_time = None;
                                call_detected = false;
                            }
                        }
                    }
                }
            }
        });
    }

    pub fn stop(&mut self) {
        if let Some(tx) = self.stop_tx.take() {
            let _ = tx.send(());
        }
    }
}

/// Check Windows registry for active microphone usage.
/// Enumerates per-app subkeys under CapabilityAccessManager\ConsentStore\microphone.
/// An app is actively capturing audio when its `LastUsedTimeStop` value is 0.
/// Recursively check a registry key and its subkeys for active mic usage.
#[cfg(target_os = "windows")]
fn check_key_recursive(key: &winreg::RegKey) -> bool {
    use winreg::enums::*;
    // Check this key's LastUsedTimeStop
    if let Ok(val) = key.get_value::<u64, _>("LastUsedTimeStop") {
        if val == 0 {
            return true;
        }
    }
    // Recurse into child keys (e.g. NonPackaged\<app-path>)
    for sub_name in key.enum_keys().filter_map(|r| r.ok()) {
        if let Ok(sub) = key.open_subkey_with_flags(&sub_name, KEY_READ) {
            if check_key_recursive(&sub) {
                return true;
            }
        }
    }
    false
}

#[cfg(target_os = "windows")]
fn check_mic_usage() -> bool {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let base_path = r"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone";

    if let Ok(key) = hkcu.open_subkey_with_flags(base_path, KEY_READ) {
        for subkey_name in key.enum_keys().filter_map(|r| r.ok()) {
            if let Ok(subkey) = key.open_subkey_with_flags(&subkey_name, KEY_READ) {
                if check_key_recursive(&subkey) {
                    return true;
                }
            }
        }
    }
    false
}

#[cfg(not(target_os = "windows"))]
fn check_mic_usage() -> bool {
    false
}
