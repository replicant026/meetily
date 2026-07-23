use serde::{Deserialize, Serialize};
use tauri::Emitter;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex as StdMutex;
// Removed unused import

use crate::diarization::speaker_preferences::SpeakerRecognitionPreferences;

// ── Voice snippet commands ─────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateVoiceReferenceRequest {
    pub speaker_id: String,
    pub meeting_id: String,
    pub segment_ids: Vec<String>,
    pub channel: Option<String>,
}

#[tauri::command]
async fn create_speaker_voice_reference(
    state: tauri::State<'_, crate::state::AppState>,
    request: CreateVoiceReferenceRequest,
) -> Result<String, String> {
    let pool = state.db_manager.pool();
    crate::diarization::voice_references::create_voice_reference_from_segments(
        pool,
        &request.speaker_id,
        &request.meeting_id,
        &request.segment_ids,
        request.channel,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_speaker_voice_reference_audio_path(
    state: tauri::State<'_, crate::state::AppState>,
    reference_id: String,
) -> Result<Option<String>, String> {
    let pool = state.db_manager.pool();
    crate::diarization::voice_references::get_voice_reference_audio_path(pool, &reference_id)
        .await
        .map(|opt| opt.map(|p| p.to_string_lossy().into_owned()))
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_speaker_voice_reference(
    state: tauri::State<'_, crate::state::AppState>,
    reference_id: String,
) -> Result<(), String> {
    let pool = state.db_manager.pool();
    crate::diarization::voice_references::delete_voice_reference(pool, &reference_id)
        .await
        .map_err(|e| e.to_string())
}

// Performance optimization: Conditional logging macros for hot paths
#[cfg(debug_assertions)]
macro_rules! perf_debug {
    ($($arg:tt)*) => {
        log::debug!($($arg)*)
    };
}

#[cfg(not(debug_assertions))]
macro_rules! perf_debug {
    ($($arg:tt)*) => {};
}

#[cfg(debug_assertions)]
macro_rules! perf_trace {
    ($($arg:tt)*) => {
        log::trace!($($arg)*)
    };
}

#[cfg(not(debug_assertions))]
macro_rules! perf_trace {
    ($($arg:tt)*) => {};
}

// Make these macros available to other modules

// Re-export async logging macros for external use (removed due to macro conflicts)

// Declare audio module
pub mod analytics;
pub mod api;
pub mod audio;
pub mod diarization;
pub mod config;
pub mod console_utils;
pub mod database;
pub mod notifications;
pub mod ollama;
pub mod i18n;
pub mod transcription_preferences;
pub mod llm_postprocess;
pub mod hotword_stats;
pub mod onboarding;
pub mod openai;
pub mod anthropic;
pub mod groq;
pub mod openrouter;
pub mod parakeet_engine;
pub mod state;
pub mod summary;
pub mod tray;
pub mod utils;
pub mod whisper_engine;

use audio::{list_audio_devices, AudioDevice, trigger_audio_permission};
use log::{error as log_error, info as log_info};
use notifications::commands::NotificationManagerState;
use std::sync::Arc;
use tauri::{AppHandle, Manager, Runtime};
use tokio::sync::RwLock;

static RECORDING_FLAG: AtomicBool = AtomicBool::new(false);

// Global language preference storage (default to "auto-translate" for automatic translation to English)
static LANGUAGE_PREFERENCE: std::sync::LazyLock<StdMutex<String>> =
    std::sync::LazyLock::new(|| StdMutex::new("auto-translate".to_string()));

#[derive(Debug, Deserialize)]
struct RecordingArgs {
    save_path: String,
}

#[derive(Debug, Serialize, Clone)]
struct TranscriptionStatus {
    chunks_in_queue: usize,
    is_processing: bool,
    last_activity_ms: u64,
}

#[tauri::command]
async fn start_recording<R: Runtime>(
    app: AppHandle<R>,
    mic_device_name: Option<String>,
    system_device_name: Option<String>,
    meeting_name: Option<String>,
) -> Result<(), String> {
    log_info!("馃敟 CALLED start_recording with meeting: {:?}", meeting_name);
    log_info!(
        "馃搵 Backend received parameters - mic: {:?}, system: {:?}, meeting: {:?}",
        mic_device_name,
        system_device_name,
        meeting_name
    );

    if is_recording().await {
        return Err("Recording already in progress".to_string());
    }

    // Call the actual audio recording system with meeting name
    match audio::recording_commands::start_recording_with_devices_and_meeting(
        app.clone(),
        mic_device_name,
        system_device_name,
        meeting_name.clone(),
        false,
    )
    .await
    {
        Ok(_) => {
            RECORDING_FLAG.store(true, Ordering::SeqCst);
            tray::update_tray_menu(&app);

            log_info!("Recording started successfully");

            // Show recording started notification through NotificationManager
            // This respects user's notification preferences
            let notification_manager_state = app.state::<NotificationManagerState<R>>();
            if let Err(e) = notifications::commands::show_recording_started_notification(
                &app,
                &notification_manager_state,
                meeting_name.clone(),
            )
            .await
            {
                log_error!(
                    "Failed to show recording started notification: {}",
                    e
                );
            } else {
                log_info!("Successfully showed recording started notification");
            }

            Ok(())
        }
        Err(e) => {
            log_error!("Failed to start audio recording: {}", e);
            Err(format!("Failed to start recording: {}", e))
        }
    }
}

#[tauri::command]
async fn stop_recording<R: Runtime>(app: AppHandle<R>, args: RecordingArgs) -> Result<(), String> {
    log_info!("Attempting to stop recording...");

    // Check the actual audio recording system state instead of the flag
    if !audio::recording_commands::is_recording().await {
        log_info!("Recording is already stopped");
        return Ok(());
    }

    // Call the actual audio recording system to stop
    match audio::recording_commands::stop_recording(
        app.clone(),
        audio::recording_commands::RecordingArgs {
            save_path: args.save_path.clone(),
        },
    )
    .await
    {
        Ok(_) => {
            RECORDING_FLAG.store(false, Ordering::SeqCst);
            tray::update_tray_menu(&app);

            // Create the save directory if it doesn't exist
            if let Some(parent) = std::path::Path::new(&args.save_path).parent() {
                if !parent.exists() {
                    log_info!("Creating directory: {:?}", parent);
                    if let Err(e) = std::fs::create_dir_all(parent) {
                        let err_msg = format!("Failed to create save directory: {}", e);
                        log_error!("{}", err_msg);
                        return Err(err_msg);
                    }
                }
            }

            // Show recording stopped notification through NotificationManager
            // This respects user's notification preferences
            let notification_manager_state = app.state::<NotificationManagerState<R>>();
            if let Err(e) = notifications::commands::show_recording_stopped_notification(
                &app,
                &notification_manager_state,
            )
            .await
            {
                log_error!(
                    "Failed to show recording stopped notification: {}",
                    e
                );
            } else {
                log_info!("Successfully showed recording stopped notification");
            }

            Ok(())
        }
        Err(e) => {
            log_error!("Failed to stop audio recording: {}", e);
            // Still update the flag even if stopping failed
            RECORDING_FLAG.store(false, Ordering::SeqCst);
            tray::update_tray_menu(&app);
            Err(format!("Failed to stop recording: {}", e))
        }
    }
}

#[tauri::command]
async fn is_recording() -> bool {
    audio::recording_commands::is_recording().await
}

#[tauri::command]
fn get_transcription_status() -> TranscriptionStatus {
    TranscriptionStatus {
        chunks_in_queue: 0,
        is_processing: false,
        last_activity_ms: 0,
    }
}

#[tauri::command]
fn read_audio_file(file_path: String) -> Result<Vec<u8>, String> {
    match std::fs::read(&file_path) {
        Ok(data) => Ok(data),
        Err(e) => Err(format!("Failed to read audio file: {}", e)),
    }
}

#[tauri::command]
async fn save_transcript(file_path: String, content: String) -> Result<(), String> {
    log_info!("Saving transcript to: {}", file_path);

    // Ensure parent directory exists
    if let Some(parent) = std::path::Path::new(&file_path).parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        }
    }

    // Write content to file
    std::fs::write(&file_path, content)
        .map_err(|e| format!("Failed to write transcript: {}", e))?;

    log_info!("Transcript saved successfully");
    Ok(())
}

// Audio level monitoring commands
#[tauri::command]
async fn start_audio_level_monitoring<R: Runtime>(
    app: AppHandle<R>,
    device_names: Vec<String>,
) -> Result<(), String> {
    log_info!(
        "Starting audio level monitoring for devices: {:?}",
        device_names
    );

    audio::simple_level_monitor::start_monitoring(app, device_names)
        .await
        .map_err(|e| format!("Failed to start audio level monitoring: {}", e))
}

#[tauri::command]
async fn stop_audio_level_monitoring() -> Result<(), String> {
    log_info!("Stopping audio level monitoring");

    audio::simple_level_monitor::stop_monitoring()
        .await
        .map_err(|e| format!("Failed to stop audio level monitoring: {}", e))
}

#[tauri::command]
async fn is_audio_level_monitoring() -> bool {
    audio::simple_level_monitor::is_monitoring()
}

// Analytics commands are now handled by analytics::commands module

// Whisper commands are now handled by whisper_engine::commands module

#[tauri::command]
async fn get_audio_devices() -> Result<Vec<AudioDevice>, String> {
    list_audio_devices()
        .await
        .map_err(|e| format!("Failed to list audio devices: {}", e))
}

#[tauri::command]
async fn trigger_microphone_permission() -> Result<bool, String> {
    trigger_audio_permission()
        .map_err(|e| format!("Failed to trigger microphone permission: {}", e))
}

#[tauri::command]
async fn start_recording_with_devices<R: Runtime>(
    app: AppHandle<R>,
    mic_device_name: Option<String>,
    system_device_name: Option<String>,
) -> Result<(), String> {
    start_recording_with_devices_and_meeting(app, mic_device_name, system_device_name, None, None).await
}

#[tauri::command]
async fn start_recording_with_devices_and_meeting<R: Runtime>(
    app: AppHandle<R>,
    mic_device_name: Option<String>,
    system_device_name: Option<String>,
    meeting_name: Option<String>,
    defer_transcription: Option<bool>,
) -> Result<(), String> {
    log_info!("馃殌 CALLED start_recording_with_devices_and_meeting - Mic: {:?}, System: {:?}, Meeting: {:?}, Defer: {:?}",
             mic_device_name, system_device_name, meeting_name, defer_transcription);

    // Clone meeting_name for notification use later
    let meeting_name_for_notification = meeting_name.clone();

    // Call the recording module functions that support meeting names
    let defer = defer_transcription.unwrap_or(false);
    let recording_result = match (mic_device_name.clone(), system_device_name.clone()) {
        (None, None) => {
            log_info!(
                "No devices specified, starting with defaults and meeting: {:?}",
                meeting_name
            );
            audio::recording_commands::start_recording_with_meeting_name(app.clone(), meeting_name, defer)
                .await
        }
        _ => {
            log_info!(
                "Starting with specified devices: mic={:?}, system={:?}, meeting={:?}",
                mic_device_name,
                system_device_name,
                meeting_name
            );
            audio::recording_commands::start_recording_with_devices_and_meeting(
                app.clone(),
                mic_device_name,
                system_device_name,
                meeting_name,
                defer,
            )
            .await
        }
    };

    match recording_result {
        Ok(_) => {
            log_info!("Recording started successfully via tauri command");

            // Show recording started notification through NotificationManager
            // This respects user's notification preferences
            let notification_manager_state = app.state::<NotificationManagerState<R>>();
            if let Err(e) = notifications::commands::show_recording_started_notification(
                &app,
                &notification_manager_state,
                meeting_name_for_notification.clone(),
            )
            .await
            {
                log_error!(
                    "Failed to show recording started notification: {}",
                    e
                );
            }

            Ok(())
        }
        Err(e) => {
            log_error!("Failed to start recording via tauri command: {}", e);
            Err(e)
        }
    }
}

#[tauri::command]
async fn set_language_preference(language: String) -> Result<(), String> {
    let mut lang_pref = LANGUAGE_PREFERENCE
        .lock()
        .map_err(|e| format!("Failed to set language preference: {}", e))?;
    log_info!("Setting language preference to: {}", language);
    *lang_pref = language;
    Ok(())
}

// Internal helper function to get language preference (for use within Rust code)
pub fn get_language_preference_internal() -> Option<String> {
    LANGUAGE_PREFERENCE.lock().ok().map(|lang| lang.clone())
}

pub fn run() {
    log::set_max_level(log::LevelFilter::Info);

    let mut builder = tauri::Builder::default();

    #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            log_info!(
                "Second app instance requested with args: {:?}, cwd: {:?}",
                args,
                cwd
            );

            tray::focus_main_window(app);
        }));
    }

    builder
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(whisper_engine::parallel_commands::ParallelProcessorState::new())
        .manage(Arc::new(RwLock::new(
            None::<notifications::manager::NotificationManager<tauri::Wry>>,
        )) as NotificationManagerState<tauri::Wry>)
        .manage(audio::init_system_audio_state())
        .manage(summary::summary_engine::ModelManagerState(Arc::new(tokio::sync::Mutex::new(None))))
        .setup(|_app| {
            log::info!("Application setup complete");

            // Initialize system tray
            if let Err(e) = tray::create_tray(_app.handle()) {
                log::error!("Failed to create system tray: {}", e);
            }

            // Initialize notification system with proper defaults
            log::info!("Initializing notification system...");
            let app_for_notif = _app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let notif_state = app_for_notif.state::<NotificationManagerState<tauri::Wry>>();
                match notifications::commands::initialize_notification_manager(app_for_notif.clone()).await {
                    Ok(manager) => {
                        // Set default consent and permissions on first launch
                        if let Err(e) = manager.set_consent(true).await {
                            log::error!("Failed to set initial consent: {}", e);
                        }
                        if let Err(e) = manager.request_permission().await {
                            log::error!("Failed to request initial permission: {}", e);
                        }

                        // Store the initialized manager
                        let mut state_lock = notif_state.write().await;
                        *state_lock = Some(manager);
                        log::info!("Notification system initialized with default permissions");
                    }
                    Err(e) => {
                        log::error!("Failed to initialize notification manager: {}", e);
                    }
                }
            });

            // Set models directory to use app_data_dir (unified storage location)
            whisper_engine::commands::set_models_directory(&_app.handle());

            // Initialize Whisper engine on startup
            tauri::async_runtime::spawn(async {
                if let Err(e) = whisper_engine::commands::whisper_init().await {
                    log::error!("Failed to initialize Whisper engine on startup: {}", e);
                }
            });

            // Set Parakeet models directory
            parakeet_engine::commands::set_models_directory(&_app.handle());

            // Initialize Parakeet engine on startup
            tauri::async_runtime::spawn(async {
                if let Err(e) = parakeet_engine::commands::parakeet_init().await {
                    log::error!("Failed to initialize Parakeet engine on startup: {}", e);
                }
            });

            // Initialize speaker diarization models (async download + load)
            tauri::async_runtime::spawn(async {
                diarization::initialize().await;
            });

            // Initialize ModelManager for summary engine (async, non-blocking)
            let app_handle_for_model_manager = _app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match summary::summary_engine::commands::init_model_manager_at_startup(&app_handle_for_model_manager).await {
                    Ok(_) => log::info!("ModelManager initialized successfully at startup"),
                    Err(e) => {
                        log::warn!("Failed to initialize ModelManager at startup: {}", e);
                        log::warn!("ModelManager will be lazy-initialized on first use");
                    }
                }
            });

            // Trigger system audio permission request on startup (similar to microphone permission)
            // #[cfg(target_os = "macos")]
            // {
            //     tauri::async_runtime::spawn(async {
            //         if let Err(e) = audio::permissions::trigger_system_audio_permission() {
            //             log::warn!("Failed to trigger system audio permission: {}", e);
            //         }
            //     });
            // }

            // PR-33: Scan for orphan checkpoints after a short delay (avoid blocking UI startup).
            let app_handle_for_orphans = _app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                let app_data_dir = match app_handle_for_orphans.path().app_data_dir() {
                    Ok(p) => p,
                    Err(e) => {
                        log::warn!("Failed to resolve app_data_dir for orphan scan: {}", e);
                        return;
                    }
                };
                let orphans = database::orphan_checkpoints::scan_orphan_checkpoints(&app_data_dir);
                if !orphans.is_empty() {
                    log::info!("Detected {} orphan checkpoint(s) on startup", orphans.len());
                    if let Err(e) = app_handle_for_orphans.emit("orphan-checkpoints-detected", &orphans) {
                        log::warn!("Failed to emit orphan-checkpoints-detected: {}", e);
                    }
                }
            });
            // Initialize database (handles first launch detection and conditional setup)
            tauri::async_runtime::block_on(async {
                database::setup::initialize_database_on_startup(&_app.handle()).await
            })
            .expect("Failed to initialize database");

            // PR-A: hand the SQLite pool to the hotword hit-rate counter so both
            // streaming and one-shot ASR paths can record per-hotword hits.
            if let Some(state) = _app.try_state::<state::AppState>() {
                hotword_stats::init(state.db_manager.pool().clone());
                llm_postprocess::init_app(_app.handle().clone());
            }

            // Initialize bundled templates directory for dynamic template discovery
            log::info!("Initializing bundled templates directory...");
            if let Ok(resource_path) = _app.handle().path().resource_dir() {
                let templates_dir = resource_path.join("templates");
                log::info!("Setting bundled templates directory to: {:?}", templates_dir);
                summary::templates::set_bundled_templates_dir(templates_dir);
            } else {
                log::warn!("Failed to resolve resource directory for templates");
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    if let Err(e) = window.hide() {
                        log::error!("Failed to hide main window on close request: {}", e);
                    } else {
                        log::info!("Main window hidden to tray on close request");
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            start_recording,
            stop_recording,
            is_recording,
            get_transcription_status,
            read_audio_file,
            save_transcript,
            analytics::commands::init_analytics,
            analytics::commands::disable_analytics,
            analytics::commands::track_event,
            analytics::commands::identify_user,
            analytics::commands::track_meeting_started,
            analytics::commands::track_recording_started,
            analytics::commands::track_recording_stopped,
            analytics::commands::track_meeting_deleted,
            analytics::commands::track_settings_changed,
            analytics::commands::track_feature_used,
            analytics::commands::is_analytics_enabled,
            analytics::commands::start_analytics_session,
            analytics::commands::end_analytics_session,
            analytics::commands::track_daily_active_user,
            analytics::commands::track_user_first_launch,
            analytics::commands::is_analytics_session_active,
            analytics::commands::track_summary_generation_started,
            analytics::commands::track_summary_generation_completed,
            analytics::commands::track_summary_regenerated,
            analytics::commands::track_model_changed,
            analytics::commands::track_custom_prompt_used,
            analytics::commands::track_meeting_ended,
            analytics::commands::track_analytics_enabled,
            analytics::commands::track_analytics_disabled,
            analytics::commands::track_analytics_transparency_viewed,
            whisper_engine::commands::whisper_init,
            whisper_engine::commands::whisper_get_available_models,
            whisper_engine::commands::whisper_load_model,
            whisper_engine::commands::whisper_get_current_model,
            whisper_engine::commands::whisper_is_model_loaded,
            whisper_engine::commands::whisper_has_available_models,
            whisper_engine::commands::whisper_validate_model_ready,
            whisper_engine::commands::whisper_transcribe_audio,
            whisper_engine::commands::whisper_get_models_directory,
            whisper_engine::commands::whisper_download_model,
            whisper_engine::commands::whisper_cancel_download,
            whisper_engine::commands::whisper_delete_corrupted_model,
            // Parakeet engine commands
            parakeet_engine::commands::parakeet_init,
            parakeet_engine::commands::parakeet_get_available_models,
            parakeet_engine::commands::parakeet_load_model,
            parakeet_engine::commands::parakeet_get_current_model,
            parakeet_engine::commands::parakeet_is_model_loaded,
            parakeet_engine::commands::parakeet_has_available_models,
            parakeet_engine::commands::parakeet_validate_model_ready,
            parakeet_engine::commands::parakeet_transcribe_audio,
            parakeet_engine::commands::parakeet_get_models_directory,
            parakeet_engine::commands::parakeet_download_model,
            parakeet_engine::commands::parakeet_retry_download,
            parakeet_engine::commands::parakeet_cancel_download,
            parakeet_engine::commands::parakeet_delete_corrupted_model,
            parakeet_engine::commands::open_parakeet_models_folder,
            // Parallel processing commands
            whisper_engine::parallel_commands::initialize_parallel_processor,
            whisper_engine::parallel_commands::start_parallel_processing,
            whisper_engine::parallel_commands::pause_parallel_processing,
            whisper_engine::parallel_commands::resume_parallel_processing,
            whisper_engine::parallel_commands::stop_parallel_processing,
            whisper_engine::parallel_commands::get_parallel_processing_status,
            whisper_engine::parallel_commands::get_system_resources,
            whisper_engine::parallel_commands::check_resource_constraints,
            whisper_engine::parallel_commands::calculate_optimal_workers,
            whisper_engine::parallel_commands::prepare_audio_chunks,
            whisper_engine::parallel_commands::test_parallel_processing_setup,
            get_audio_devices,
            trigger_microphone_permission,
            start_recording_with_devices,
            start_recording_with_devices_and_meeting,
            start_audio_level_monitoring,
            stop_audio_level_monitoring,
            is_audio_level_monitoring,
            // Recording pause/resume commands
            audio::recording_commands::pause_recording,
            audio::recording_commands::resume_recording,
            audio::recording_commands::is_recording_paused,
            audio::recording_commands::get_recording_state,
            audio::recording_commands::get_meeting_folder_path,
            // Reload sync commands (retrieve transcript history and meeting name)
            audio::recording_commands::get_transcript_history,
            audio::recording_commands::get_recording_meeting_name,
            // Device monitoring commands (AirPods/Bluetooth disconnect/reconnect)
            audio::recording_commands::poll_audio_device_events,
            audio::recording_commands::get_reconnection_status,
            audio::recording_commands::attempt_device_reconnect,
            // Playback device detection (Bluetooth warning)
            audio::recording_commands::get_active_audio_output,
            // Audio recovery commands (for transcript recovery feature)
            audio::incremental_saver::cleanup_checkpoints,
            audio::incremental_saver::has_audio_checkpoints,
            console_utils::show_console,
            console_utils::hide_console,
            console_utils::toggle_console,
            ollama::get_ollama_models,
            ollama::pull_ollama_model,
            ollama::delete_ollama_model,
            ollama::get_ollama_model_context,
            openai::openai::get_openai_models,
            anthropic::anthropic::get_anthropic_models,
            groq::groq::get_groq_models,
            api::api_get_meetings,
            api::api_search_transcripts,
            api::api_get_profile,
            api::api_save_profile,
            api::api_update_profile,
            api::api_get_model_config,
            api::api_save_model_config,
            api::api_get_api_key,
            // api::api_get_auto_generate_setting,
            // api::api_save_auto_generate_setting,
            api::api_get_transcript_config,
            api::api_save_transcript_config,
            api::api_get_transcript_api_key,
            api::api_delete_meeting,
            api::api_get_meeting,
            api::api_get_meeting_metadata,
            api::api_get_meeting_transcripts,
            get_diarization_status,
            set_diarization_config,
            // Speaker profile commands
            update_speaker_person_email,
            update_speaker_person_color,
            list_speaker_profiles,
            delete_speaker_profile,
            rename_speaker_profile,
            enroll_speaker,
            match_speaker,
            list_speaker_names,
            rename_speaker_in_meeting,
            api::api_save_meeting_title,
            api::api_save_transcript,
            api::open_meeting_folder,
            api::test_backend_connection,
            api::debug_backend_connection,
            api::open_external_url,
            // Custom OpenAI commands
            api::api_save_custom_openai_config,
            api::api_get_custom_openai_config,
            api::api_test_custom_openai_connection,
            // Summary commands
            summary::commands::api_process_transcript,
            summary::commands::api_get_summary,
            summary::commands::api_save_meeting_summary,
            summary::commands::api_get_meeting_summary_language,
            summary::commands::api_save_meeting_summary_language,
            summary::commands::api_get_meeting_detected_summary_language,
            summary::commands::api_save_meeting_detected_summary_language,
            summary::commands::api_detect_transcript_summary_language,
            summary::commands::api_cancel_summary,
            // Template commands
            summary::template_commands::api_list_templates,
            summary::template_commands::api_get_template_details,
            summary::template_commands::api_validate_template,
            // Built-in AI commands
            summary::summary_engine::commands::builtin_ai_list_models,
            summary::summary_engine::commands::builtin_ai_get_model_info,
            summary::summary_engine::commands::builtin_ai_download_model,
            summary::summary_engine::commands::builtin_ai_cancel_download,
            summary::summary_engine::commands::builtin_ai_delete_model,
            summary::summary_engine::commands::builtin_ai_is_model_ready,
            summary::summary_engine::commands::builtin_ai_get_available_summary_model,
            summary::summary_engine::commands::builtin_ai_get_recommended_model,
            openrouter::get_openrouter_models,
            audio::recording_preferences::get_recording_preferences,
            audio::recording_preferences::set_recording_preferences,
            audio::recording_preferences::get_default_recordings_folder_path,
            audio::recording_preferences::open_recordings_folder,
            audio::recording_preferences::select_recording_folder,
            audio::recording_preferences::get_available_audio_backends,
            audio::recording_preferences::get_current_audio_backend,
            audio::recording_preferences::set_audio_backend,
            audio::recording_preferences::get_audio_backend_info,
            // Language preference commands
            set_language_preference,
            // Notification system commands
            notifications::commands::get_notification_settings,
            notifications::commands::set_notification_settings,
            notifications::commands::request_notification_permission,
            notifications::commands::show_notification,
            notifications::commands::show_test_notification,
            notifications::commands::is_dnd_active,
            notifications::commands::get_system_dnd_status,
            notifications::commands::set_manual_dnd,
            notifications::commands::set_notification_consent,
            notifications::commands::clear_notifications,
            notifications::commands::is_notification_system_ready,
            notifications::commands::initialize_notification_manager_manual,
            notifications::commands::test_notification_with_auto_consent,
            notifications::commands::get_notification_stats,
            // System audio capture commands
            audio::system_audio_commands::start_system_audio_capture_command,
            audio::system_audio_commands::list_system_audio_devices_command,
            audio::system_audio_commands::check_system_audio_permissions_command,
            audio::system_audio_commands::start_system_audio_monitoring,
            audio::system_audio_commands::stop_system_audio_monitoring,
            audio::system_audio_commands::get_system_audio_monitoring_status,
            // Screen Recording permission commands
            audio::permissions::check_screen_recording_permission_command,
            audio::permissions::request_screen_recording_permission_command,
            audio::permissions::trigger_system_audio_permission_command,
            // Database import commands
            database::commands::check_first_launch,
            database::commands::select_legacy_database_path,
            database::commands::detect_legacy_database,
            database::commands::check_default_legacy_database,
            database::commands::check_homebrew_database,
            database::commands::import_and_initialize_database,
            database::commands::get_meeting_audio_path,
            database::commands::list_home_meetings,
            database::commands::initialize_fresh_database,
            database::commands::scan_orphan_checkpoints_cmd,
            database::commands::discard_orphan_checkpoint_cmd,
            database::commands::recover_orphan_meeting_cmd,
            database::commands::get_failed_recoveries_cmd,
            database::commands::retry_recovery_cmd,
            database::commands::discard_recovery_cmd,
            // Database and Models path commands
            database::commands::get_database_directory,
            database::commands::open_database_folder,
            whisper_engine::commands::open_models_folder,
            // Onboarding commands
            i18n::get_ui_language,
            i18n::set_ui_language,
            i18n::reset_ui_language_cmd,
            transcription_preferences::get_transcription_hotwords,
            transcription_preferences::set_transcription_hotwords,
            transcription_preferences::get_protected_terms,
            hotword_stats::get_hotword_hit_stats,
            onboarding::save_onboarding_status_cmd,
            onboarding::get_onboarding_status,
            onboarding::reset_onboarding_status_cmd,
            onboarding::complete_onboarding,
            // System settings commands
            #[cfg(target_os = "macos")]
            utils::open_system_settings,
            // Retranscription commands
            audio::retranscription::start_retranscription_command,
            audio::retranscription::cancel_retranscription_command,
            audio::retranscription::is_retranscription_in_progress_command,
            // Import audio commands
            audio::import::select_and_validate_audio_command,
            audio::import::validate_audio_file_command,
            audio::import::start_import_audio_command,
            audio::import::cancel_import_command,
            audio::import::is_import_in_progress_command,
            // Post-save diarization command
            audio::recording_commands::run_meeting_diarization,
            // Workspace notes & actions
            database::commands::get_meeting_note,
            database::commands::save_meeting_note,
            database::commands::get_meeting_action_states,
            database::commands::set_meeting_action_completed,
            // Voice snippet commands
            create_speaker_voice_reference,
            get_speaker_voice_reference_audio_path,
            delete_speaker_voice_reference,
            // Speaker recognition preferences
            get_speaker_recognition_preferences,
            set_speaker_recognition_preferences,
            list_speaker_suggestions,
            accept_speaker_suggestion,
            reject_speaker_suggestion,
            assign_meeting_speaker,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            match event {
                #[cfg(target_os = "macos")]
                tauri::RunEvent::Reopen { .. } => {
                    tray::focus_main_window(_app_handle);
                }
                tauri::RunEvent::Exit => {
                    log::info!("Application exiting, cleaning up resources...");
                    tauri::async_runtime::block_on(async {
                        // Clean up database connection and checkpoint WAL
                        if let Some(app_state) = _app_handle.try_state::<state::AppState>() {
                            log::info!("Starting database cleanup...");
                            if let Err(e) = app_state.db_manager.cleanup().await {
                                log::error!("Failed to cleanup database: {}", e);
                            } else {
                                log::info!("Database cleanup completed successfully");
                            }
                        } else {
                            log::warn!("AppState not available for database cleanup (likely first launch)");
                        }

                        // Clean up sidecar
                        log::info!("Cleaning up sidecar...");
                        if let Err(e) = summary::summary_engine::force_shutdown_sidecar().await {
                            log::error!("Failed to force shutdown sidecar: {}", e);
                        }
                    });
                    log::info!("Application cleanup complete");
                }
                _ => {}
            }
        });
}

#[tauri::command]
fn get_diarization_status() -> crate::diarization::DiarizationStatus {
    crate::diarization::status()
}

#[tauri::command]
fn set_diarization_config(
    config: crate::diarization::DiarizationStatus,
) -> crate::diarization::DiarizationStatus {
    crate::diarization::update_status(config);
    crate::diarization::status()
}

// ── Speaker recognition preferences commands ──────────────────────────────

#[tauri::command]
async fn get_speaker_recognition_preferences() -> Result<SpeakerRecognitionPreferences, String> {
    Ok(crate::diarization::speaker_preferences::get_preferences())
}

#[tauri::command]
async fn set_speaker_recognition_preferences(
    prefs: SpeakerRecognitionPreferences,
) -> Result<(), String> {
    crate::diarization::speaker_preferences::set_preferences(prefs);
    Ok(())
}

#[tauri::command]
async fn list_speaker_suggestions(
    state: tauri::State<'_, crate::state::AppState>,
    meeting_id: String,
) -> Result<Vec<crate::database::repositories::voice_reference::SpeakerSuggestionDto>, String> {
    let pool = state.db_manager.pool();
    crate::database::repositories::voice_reference::VoiceReferenceRepository::list_suggestions(
        pool,
        &meeting_id,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn accept_speaker_suggestion(
    state: tauri::State<'_, crate::state::AppState>,
    suggestion_id: String,
) -> Result<(), String> {
    use crate::database::repositories::voice_reference::VoiceReferenceRepository;

    let pool = state.db_manager.pool();

    // Fetch the suggestion to get segment IDs and speaker ID
    let suggestions = sqlx::query_as::<_, (String, String, String, String, f32, Option<String>, String, String, String, Option<String>)>(
        "SELECT id, meeting_id, source_label, speaker_id, confidence, reference_id, segment_ids_json, status, created_at, resolved_at FROM speaker_match_suggestions WHERE id = ?",
    )
    .bind(&suggestion_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    let (_id, _meeting_id, _source_label, speaker_id, _confidence, _ref_id, segment_ids_json, _status, _created, _resolved) = suggestions.ok_or_else(|| format!("suggestion {} not found", suggestion_id))?;

    let seg_ids: Vec<String> =
        serde_json::from_str(&segment_ids_json).unwrap_or_default();

    // Update transcript labels for the affected segments using the person's display name
    // (speaker_id in the suggestion stores the matched display name from find_match)
    if !seg_ids.is_empty() {
        let mapping: Vec<(String, String)> = seg_ids
            .iter()
            .map(|sid| (sid.clone(), speaker_id.clone()))
            .collect();
        crate::database::repositories::transcript::TranscriptsRepository::update_segment_speakers(
            pool,
            &mapping,
        )
        .await
        .map_err(|e| e.to_string())?;
    }

    // Mark suggestion as accepted
    VoiceReferenceRepository::resolve_suggestion(pool, &suggestion_id, "accepted", None)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn reject_speaker_suggestion(
    state: tauri::State<'_, crate::state::AppState>,
    suggestion_id: String,
) -> Result<(), String> {
    use crate::database::repositories::voice_reference::VoiceReferenceRepository;

    let pool = state.db_manager.pool();
    VoiceReferenceRepository::resolve_suggestion(pool, &suggestion_id, "rejected", None)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn assign_meeting_speaker(
    state: tauri::State<'_, crate::state::AppState>,
    meeting_id: String,
    speaker_id: String,
    segment_ids: Vec<String>,
) -> Result<(), String> {
    use crate::database::repositories::speaker::SpeakerRepository;

    let pool = state.db_manager.pool();

    // Look up the speaker's display name
    let person = SpeakerRepository::get_person(pool, &speaker_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("speaker {} not found", speaker_id))?;

    // Update transcript labels for the selected segments
    let mapping: Vec<(String, String)> = segment_ids
        .iter()
        .map(|sid| (sid.clone(), person.display_name.clone()))
        .collect();
    crate::database::repositories::transcript::TranscriptsRepository::update_segment_speakers(
        pool,
        &mapping,
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

// ── Speaker profile commands ──────────────────────────────────────────────

#[tauri::command]
async fn update_speaker_person_email(
    state: tauri::State<'_, crate::state::AppState>,
    id: String,
    email: String,
) -> Result<(), String> {
    let pool = state.db_manager.pool();
    crate::database::repositories::speaker::SpeakerRepository::update_email(pool, &id, &email)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn update_speaker_person_color(
    state: tauri::State<'_, crate::state::AppState>,
    id: String,
    color: String,
) -> Result<(), String> {
    let pool = state.db_manager.pool();
    crate::database::repositories::speaker::SpeakerRepository::update_color(pool, &id, &color)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn list_speaker_profiles(
    state: tauri::State<'_, crate::state::AppState>,
) -> Result<Vec<crate::database::repositories::speaker::SpeakerPersonDto>, String> {
    let pool = state.db_manager.pool();
    crate::database::repositories::speaker::SpeakerRepository::list_people(pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_speaker_profile(
    state: tauri::State<'_, crate::state::AppState>,
    display_name: String,
) -> Result<u64, String> {
    let pool = state.db_manager.pool();
    match crate::database::repositories::speaker::SpeakerRepository::find_person_by_name(pool, &display_name)
        .await
        .map_err(|e| e.to_string())?
    {
        Some((id, _)) => crate::database::repositories::speaker::SpeakerRepository::delete_person(pool, &id)
            .await
            .map_err(|e| e.to_string()),
        None => Ok(0),
    }
}

#[tauri::command]
async fn rename_speaker_profile(
    state: tauri::State<'_, crate::state::AppState>,
    old_name: String,
    new_name: String,
) -> Result<u64, String> {
    let pool = state.db_manager.pool();
    match crate::database::repositories::speaker::SpeakerRepository::find_person_by_name(pool, &old_name)
        .await
        .map_err(|e| e.to_string())?
    {
        Some((id, _)) => {
            let renamed = crate::database::repositories::speaker::SpeakerRepository::rename_person(pool, &id, &new_name)
                .await
                .map_err(|e| e.to_string())?;
            Ok(if renamed { 1 } else { 0 })
        }
        None => Ok(0),
    }
}

#[tauri::command]
async fn enroll_speaker(
    state: tauri::State<'_, crate::state::AppState>,
    display_name: String,
    embedding: Vec<f32>,
) -> Result<String, String> {
    let pool = state.db_manager.pool();
    // Ensure person exists, then create a voice reference
    let person_id = crate::database::repositories::speaker::SpeakerRepository::get_or_create_person(pool, &display_name)
        .await
        .map_err(|e| e.to_string())?;
    crate::database::repositories::voice_reference::VoiceReferenceRepository::create(
        pool,
        &person_id,
        &crate::database::repositories::voice_reference::CreateReferenceParams {
            meeting_id: None,
            embedding,
            audio_relative_path: None,
            waveform_peaks: None,
            source_start_ms: 0,
            source_end_ms: 0,
            duration_ms: 0,
            channel: "unknown".into(),
            quality_score: 0.0,
            status: "confirmed".into(),
            origin: "manual".into(),
        },
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn match_speaker(
    state: tauri::State<'_, crate::state::AppState>,
    embedding: Vec<f32>,
    threshold: f32,
) -> Result<Option<(String, f32)>, String> {
    let pool = state.db_manager.pool();
    crate::database::repositories::speaker::SpeakerRepository::find_match(
        pool,
        &embedding,
        threshold,
    )
    .await
    .map(|opt| opt.map(|(name, sim, _ref_id)| (name, sim)))
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_speaker_names(
    state: tauri::State<'_, crate::state::AppState>,
) -> Result<Vec<String>, String> {
    let pool = state.db_manager.pool();
    let people = crate::database::repositories::speaker::SpeakerRepository::list_people(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(people.into_iter().map(|p| p.display_name).collect())
}

#[tauri::command]
async fn rename_speaker_in_meeting(
    state: tauri::State<'_, crate::state::AppState>,
    meeting_id: String,
    old_speaker: String,
    new_name: String,
) -> Result<u64, String> {
    let pool = state.db_manager.pool();
    // 1. Update transcript speaker field in this meeting
    let rows = crate::database::repositories::transcript::TranscriptsRepository::rename_speaker_in_meeting(
        pool, &meeting_id, &old_speaker, &new_name,
    )
    .await
    .map_err(|e| e.to_string())?;
    // 2. Ensure person exists (voice references added later by diarization)
    let _ = crate::database::repositories::speaker::SpeakerRepository::get_or_create_person(
        pool, &new_name,
    )
    .await;
    Ok(rows)
}
