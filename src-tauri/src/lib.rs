use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Sender};
use tauri::{Manager, State};

struct KeepAwakeRequest {
    enabled: bool,
    response: Sender<Result<(), String>>,
}

struct KeepAwakeController {
    sender: Sender<KeepAwakeRequest>,
}

#[tauri::command]
fn set_keep_awake(
    enabled: bool,
    controller: State<'_, KeepAwakeController>,
) -> Result<(), String> {
    let (response_sender, response_receiver) = mpsc::channel();
    controller
        .sender
        .send(KeepAwakeRequest {
            enabled,
            response: response_sender,
        })
        .map_err(|error| format!("Could not update keep-awake state: {error}"))?;

    response_receiver
        .recv()
        .map_err(|error| format!("Could not receive keep-awake result: {error}"))?
}

#[cfg(windows)]
fn set_execution_state(enabled: bool) -> Result<(), String> {
    const ES_CONTINUOUS: u32 = 0x80000000;
    const ES_DISPLAY_REQUIRED: u32 = 0x00000002;
    const ES_SYSTEM_REQUIRED: u32 = 0x00000001;

    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn SetThreadExecutionState(execution_state: u32) -> u32;
    }

    let execution_state = if enabled {
        ES_CONTINUOUS | ES_DISPLAY_REQUIRED | ES_SYSTEM_REQUIRED
    } else {
        ES_CONTINUOUS
    };
    let result = unsafe { SetThreadExecutionState(execution_state) };

    if result == 0 {
        Err(format!(
            "Could not update Windows execution state: {}",
            std::io::Error::last_os_error()
        ))
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]
fn set_execution_state(_enabled: bool) -> Result<(), String> {
    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TournamentLevel {
    duration: Option<f64>,
    small_blind: Option<f64>,
    big_blind: Option<f64>,
    ante: Option<f64>,
    #[serde(default)]
    is_break: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TournamentChip {
    color: String,
    denomination: f64,
    #[serde(default)]
    available_quantity: Option<u32>,
    #[serde(default)]
    quantity_per_player: Option<u32>,
    #[serde(default)]
    edge_spot_color: Option<String>,
    #[serde(default)]
    edge_spot_quantity: Option<u32>,
    #[serde(default)]
    text_color: Option<String>
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Tournament {
    id: String,
    name: String,
    #[serde(default)]
    starting_chipstack: Option<f64>,
    #[serde(default)]
    rebuys_allowed: bool,
    #[serde(default)]
    addons_allowed: bool,
    #[serde(default)]
    buyin_cost: Option<f64>,
    #[serde(default)]
    buyin_description: Option<String>,
    #[serde(default)]
    rebuy_cost: Option<f64>,
    #[serde(default)]
    rebuy_chipstack: Option<f64>,
    #[serde(default)]
    rebuy_description: Option<String>,
    #[serde(default)]
    addon_cost: Option<f64>,
    #[serde(default)]
    addon_chipstack: Option<f64>,
    #[serde(default)]
    addon_description: Option<String>,
    #[serde(default)]
    buyin_count: u32,
    #[serde(default)]
    rebuy_count: u32,
    #[serde(default)]
    addon_count: u32,
    #[serde(default)]
    other_prize_pool: f64,
    #[serde(default)]
    other_chipstack: f64,
    #[serde(default)]
    bustout_count: u32,
    #[serde(default)]
    payout_places: u32,
    #[serde(default)]
    payouts: Vec<f64>,
    #[serde(default)]
    max_players_per_table: u32,
    #[serde(default)]
    chips: Vec<TournamentChip>,
    levels: Vec<TournamentLevel>,
    #[serde(default)]
    timer_is_running: bool,
    #[serde(default)]
    timer_started_at: Option<f64>,
    #[serde(default)]
    timer_elapsed_ms: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TournamentData {
    tournaments: Vec<Tournament>,
    active_tournament_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TimerSettings {
    alarm_sound: String,
    volume: f64,
    spoken_announcement_enabled: bool,
    #[serde(default = "default_announcement_speed")]
    announcement_speed: f64,
    announcement: String,
    #[serde(default = "default_countdown_warning_seconds")]
    countdown_warning_seconds: u32,
    #[serde(default = "default_countdown_warning_sound")]
    countdown_warning_sound: String,
    #[serde(default)]
    countdown_warning_speech_enabled: bool,
    #[serde(default = "default_countdown_warning_announcement")]
    countdown_warning_announcement: String,
}

fn default_announcement_speed() -> f64 {
    1.0
}

fn default_countdown_warning_seconds() -> u32 {
    10
}

fn default_countdown_warning_sound() -> String {
    "single-ding".to_string()
}

fn default_countdown_warning_announcement() -> String {
    "{seconds} seconds remaining.".to_string()
}

#[derive(Deserialize)]
#[serde(untagged)]
enum SavedTournamentData {
    Current(TournamentData),
    Legacy(Vec<Tournament>),
}

fn default_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not find app data directory: {error}"))?;

    fs::create_dir_all(&data_dir)
        .map_err(|error| format!("Could not create app data directory: {error}"))?;

    Ok(data_dir)
}

fn settings_directory_config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(default_data_dir(app)?.join("settings-directory.json"))
}

fn configured_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let config_path = settings_directory_config_path(app)?;
    if !config_path.exists() {
        return default_data_dir(app);
    }

    let contents = fs::read_to_string(config_path)
        .map_err(|error| format!("Could not read settings directory: {error}"))?;
    let configured_path: String = serde_json::from_str(&contents)
        .map_err(|error| format!("Could not parse settings directory: {error}"))?;
    let path = PathBuf::from(configured_path);
    if !path.is_dir() {
        return Err(format!(
            "The configured settings directory does not exist: {}",
            path.display()
        ));
    }

    Ok(path)
}

fn tournament_file_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(configured_data_dir(app)?.join("tournament-structures.json"))
}

fn timer_settings_file_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(configured_data_dir(app)?.join("timer-settings.json"))
}

fn copy_if_missing(source_dir: &Path, target_dir: &Path, file_name: &str) -> Result<(), String> {
    let source = source_dir.join(file_name);
    let target = target_dir.join(file_name);
    if source.exists() && !target.exists() {
        fs::copy(source, target).map_err(|error| {
            format!("Could not copy {file_name} to the selected directory: {error}")
        })?;
    }
    Ok(())
}

#[tauri::command]
fn get_settings_directory(app: tauri::AppHandle) -> Result<String, String> {
    Ok(configured_data_dir(&app)?.to_string_lossy().into_owned())
}

#[tauri::command(rename_all = "camelCase")]
fn set_settings_directory(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let selected_dir = PathBuf::from(path);
    if !selected_dir.is_dir() {
        return Err("The selected settings directory does not exist.".to_string());
    }

    let current_dir = configured_data_dir(&app)?;
    let selected_dir = selected_dir
        .canonicalize()
        .map_err(|error| format!("Could not resolve the selected directory: {error}"))?;
    let current_dir = current_dir
        .canonicalize()
        .map_err(|error| format!("Could not resolve the current settings directory: {error}"))?;

    if selected_dir != current_dir {
        copy_if_missing(&current_dir, &selected_dir, "tournament-structures.json")?;
        copy_if_missing(&current_dir, &selected_dir, "timer-settings.json")?;
        let config_path = settings_directory_config_path(&app)?;
        let contents = serde_json::to_string(&selected_dir.to_string_lossy().as_ref())
            .map_err(|error| format!("Could not encode settings directory: {error}"))?;
        fs::write(config_path, contents)
            .map_err(|error| format!("Could not save settings directory: {error}"))?;
    }

    Ok(selected_dir.to_string_lossy().into_owned())
}

#[tauri::command]
fn load_timer_settings(app: tauri::AppHandle) -> Result<Option<TimerSettings>, String> {
    let path = timer_settings_file_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }

    let contents = fs::read_to_string(path)
        .map_err(|error| format!("Could not read timer settings: {error}"))?;
    serde_json::from_str(&contents)
        .map(Some)
        .map_err(|error| format!("Could not parse timer settings: {error}"))
}

#[tauri::command]
fn save_timer_settings(app: tauri::AppHandle, settings: TimerSettings) -> Result<(), String> {
    let contents = serde_json::to_string_pretty(&settings)
        .map_err(|error| format!("Could not encode timer settings: {error}"))?;
    fs::write(timer_settings_file_path(&app)?, contents)
        .map_err(|error| format!("Could not save timer settings: {error}"))
}

#[tauri::command]
fn load_tournaments(app: tauri::AppHandle) -> Result<TournamentData, String> {
    let path = tournament_file_path(&app)?;
    if !path.exists() {
        return Ok(TournamentData {
            tournaments: Vec::new(),
            active_tournament_id: None,
        });
    }

    let contents = fs::read_to_string(path)
        .map_err(|error| format!("Could not read tournament structures: {error}"))?;
    let saved: SavedTournamentData = serde_json::from_str(&contents)
        .map_err(|error| format!("Could not parse tournament structures: {error}"))?;

    let mut data = match saved {
        SavedTournamentData::Current(data) => data,
        SavedTournamentData::Legacy(tournaments) => TournamentData {
            tournaments,
            active_tournament_id: None,
        },
    };

    if !data.tournaments.iter().any(|tournament| {
        Some(tournament.id.as_str()) == data.active_tournament_id.as_deref()
    }) {
        data.active_tournament_id = None;
    }

    Ok(data)
}

#[tauri::command(rename_all = "camelCase")]
fn save_tournaments(
    app: tauri::AppHandle,
    tournaments: Vec<Tournament>,
    active_tournament_id: Option<String>,
) -> Result<(), String> {
    let path = tournament_file_path(&app)?;
    let active_tournament_id = active_tournament_id.filter(|active_id| {
        tournaments.iter().any(|tournament| tournament.id == *active_id)
    });
    let data = TournamentData {
        tournaments,
        active_tournament_id,
    };
    let contents = serde_json::to_string_pretty(&data)
        .map_err(|error| format!("Could not encode tournament structures: {error}"))?;
    fs::write(path, contents)
        .map_err(|error| format!("Could not save tournament structures: {error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let (keep_awake_sender, keep_awake_receiver) = mpsc::channel::<KeepAwakeRequest>();

    tauri::Builder::default()
        .manage(KeepAwakeController {
            sender: keep_awake_sender,
        })
        .setup(move |_app| {
            std::thread::Builder::new()
                .name("keep-awake-controller".to_string())
                .spawn(move || {
                    while let Ok(request) = keep_awake_receiver.recv() {
                        let result = set_execution_state(request.enabled);
                        let _ = request.response.send(result);
                    }
                    let _ = set_execution_state(false);
                })
                .map_err(Box::<dyn std::error::Error>::from)?;
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            set_keep_awake,
            get_settings_directory,
            set_settings_directory,
            load_tournaments,
            save_tournaments,
            load_timer_settings,
            save_timer_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
