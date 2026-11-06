use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

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
    chips: Vec<TournamentChip>,
    levels: Vec<TournamentLevel>,
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
    announcement: String,
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

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
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
