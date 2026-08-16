use super::*;

#[test]
fn tray_label_reflects_actual_recording_state() {
    assert_eq!(tray_label_for_state("recording"), "Meetily — Recording");
    assert_eq!(tray_label_for_state("processing"), "Meetily — Processing meeting");
    assert_eq!(tray_label_for_state("stopping"), "Meetily — Processing meeting");
    assert_eq!(tray_label_for_state("saving"), "Meetily — Processing meeting");
    assert_eq!(tray_label_for_state("idle"), "Meetily");
    assert_eq!(tray_label_for_state("error"), "Meetily — Attention needed");
    assert_eq!(tray_label_for_state("unknown"), "Meetily");
}

#[test]
fn tray_actions_never_offer_start_when_recording_is_already_active() {
    let actions = tray_actions_for_state("recording");
    assert!(!actions.iter().any(|action| action.id == "start_recording"));
    assert!(actions.iter().any(|action| action.id == "show_meetily"));
}

#[test]
fn tray_actions_offer_stop_only_while_recording() {
    let actions = tray_actions_for_state("recording");
    assert!(actions.iter().any(|action| action.id == "stop_recording"));

    let idle_actions = tray_actions_for_state("idle");
    assert!(!idle_actions.iter().any(|action| action.id == "stop_recording"));
}
