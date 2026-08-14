/// Embedded default templates using compile-time inclusion
///
/// These templates are bundled into the binary and serve as fallbacks
/// when custom templates are not available.

/// Daily standup template for engineering/product teams
pub const DAILY_STANDUP: &str = include_str!("../../../templates/daily_standup.json");

/// Standard meeting notes template
pub const STANDARD_MEETING: &str = include_str!("../../../templates/standard_meeting.json");

/// Manager/employee 1-on-1 meeting template
pub const ONE_ON_ONE: &str = include_str!("../../../templates/1_on_1.json");

/// Sprint/project retrospective template
pub const RETROSPECTIVE: &str = include_str!("../../../templates/retrospective.json");

/// Brainstorming/ideation session template
pub const BRAINSTORM: &str = include_str!("../../../templates/brainstorm.json");

/// Project status review template
pub const PROJECT_REVIEW: &str = include_str!("../../../templates/project_review.json");

/// All-hands/company meeting template
pub const ALL_HANDS: &str = include_str!("../../../templates/all_hands.json");

/// Registry of all built-in templates
///
/// Maps template identifiers to their embedded JSON content
pub fn get_builtin_templates() -> Vec<(&'static str, &'static str)> {
    vec![
        ("daily_standup", DAILY_STANDUP),
        ("standard_meeting", STANDARD_MEETING),
        ("1_on_1", ONE_ON_ONE),
        ("retrospective", RETROSPECTIVE),
        ("brainstorm", BRAINSTORM),
        ("project_review", PROJECT_REVIEW),
        ("all_hands", ALL_HANDS),
    ]
}

/// Get a built-in template by identifier
///
/// # Arguments
/// * `id` - Template identifier (e.g., "daily_standup", "standard_meeting")
///
/// # Returns
/// The template JSON content if found, None otherwise
pub fn get_builtin_template(id: &str) -> Option<&'static str> {
    match id {
        "daily_standup" => Some(DAILY_STANDUP),
        "standard_meeting" => Some(STANDARD_MEETING),
        "1_on_1" => Some(ONE_ON_ONE),
        "retrospective" => Some(RETROSPECTIVE),
        "brainstorm" => Some(BRAINSTORM),
        "project_review" => Some(PROJECT_REVIEW),
        "all_hands" => Some(ALL_HANDS),
        _ => None,
    }
}

/// List all built-in template identifiers
pub fn list_builtin_template_ids() -> Vec<&'static str> {
    vec![
        "daily_standup",
        "standard_meeting",
        "1_on_1",
        "retrospective",
        "brainstorm",
        "project_review",
        "all_hands",
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_builtin_templates_valid_json() {
        for (id, content) in get_builtin_templates() {
            let result = serde_json::from_str::<serde_json::Value>(content);
            assert!(
                result.is_ok(),
                "Built-in template '{}' contains invalid JSON: {:?}",
                id,
                result.err()
            );
        }
    }

    #[test]
    fn test_get_builtin_template() {
        assert!(get_builtin_template("daily_standup").is_some());
        assert!(get_builtin_template("standard_meeting").is_some());
        assert!(get_builtin_template("1_on_1").is_some());
        assert!(get_builtin_template("retrospective").is_some());
        assert!(get_builtin_template("brainstorm").is_some());
        assert!(get_builtin_template("project_review").is_some());
        assert!(get_builtin_template("all_hands").is_some());
        assert!(get_builtin_template("nonexistent").is_none());
    }

    #[test]
    fn test_builtin_template_count() {
        assert_eq!(get_builtin_templates().len(), 7);
        assert_eq!(list_builtin_template_ids().len(), 7);
    }
}
