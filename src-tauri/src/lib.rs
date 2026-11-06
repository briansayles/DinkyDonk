use serde::{Deserialize, Serialize};
use std::fs;
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
    rebuy_description: Option<String>,
    #[serde(default)]
    addon_cost: Option<f64>,
    #[serde(default)]
    addon_description: Option<String>,
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

#[derive(Deserialize)]
#[serde(untagged)]
enum SavedTournamentData {
    Current(TournamentData),
    Legacy(Vec<Tournament>),
}

fn tournament_file_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not find app data directory: {error}"))?;

    fs::create_dir_all(&data_dir)
        .map_err(|error| format!("Could not create app data directory: {error}"))?;

    Ok(data_dir.join("tournament-structures.json"))
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
        .invoke_handler(tauri::generate_handler![
            greet,
            load_tournaments,
            save_tournaments
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
