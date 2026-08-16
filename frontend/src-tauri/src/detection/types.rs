use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingDetectionConfig {
    pub enabled: bool,
    pub auto_record: bool,
    pub browser_titles: Vec<String>,
    pub min_call_seconds: u32,
    pub grace_seconds: u32,
}

impl Default for MeetingDetectionConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            auto_record: true,
            browser_titles: vec![
                "Meet".to_string(),
                "Microsoft Teams".to_string(),
                "Zoom".to_string(),
                "Webex".to_string(),
            ],
            min_call_seconds: 30,
            grace_seconds: 8,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectionEvent {
    pub event_type: String,
    pub app_name: Option<String>,
    pub timestamp: String,
    pub confidence: f32,
}
