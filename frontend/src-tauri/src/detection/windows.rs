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
            let mut last_mic_state = false;
            let mut mic_start_time: Option<std::time::Instant> = None;
            let mut call_detected = false;

            loop {
                tokio::select! {
                    _ = &mut stop_rx => break,
                    _ = tokio::time::sleep(std::time::Duration::from_secs(2)) => {
                        let mic_in_use = check_mic_usage();

                        if mic_in_use && !last_mic_state {
                            // Mic just started
                            mic_start_time = Some(std::time::Instant::now());
                            call_detected = false;
                            last_mic_state = true;
                        } else if !mic_in_use && last_mic_state {
                            // Mic just stopped
                            mic_start_time = None;
                            call_detected = false;
                            last_mic_state = false;
                        } else if mic_in_use && last_mic_state {
                            // Mic still in use — check duration
                            if let Some(start) = mic_start_time {
                                let elapsed = start.elapsed().as_secs();
                                if elapsed >= config.min_call_seconds as u64 && !call_detected {
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

/// Check Windows registry for microphone usage.
/// Looks at CapabilityAccessManager consent store.
#[cfg(target_os = "windows")]
fn check_mic_usage() -> bool {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let path = r"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone";

    if let Ok(key) = hkcu.open_subkey_with_flags(path, KEY_READ) {
        if let Ok(value) = key.get_value::<String, _>("Value") {
            return value == "Allow";
        }
    }
    false
}

#[cfg(not(target_os = "windows"))]
fn check_mic_usage() -> bool {
    false
}
