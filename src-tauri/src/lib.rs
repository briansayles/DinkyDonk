use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use std::sync::{
    Mutex,
    mpsc::{self, Sender},
};
use tauri::{Manager, State};

const DEFAULT_TOURNAMENT_ID: &str = "3bd8977a-a9fb-4b68-a2fb-f4cc8cb199d2";
const LEGACY_DEFAULT_TOURNAMENT_ID: &str = "my-first-dinkydonk-tournament";

#[derive(Default)]
struct PersistenceLock(Mutex<()>);

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
struct TournamentParticipant {
    name: String,
    timestamp: u64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BustoutBlinds {
    small_blind: Option<f64>,
    big_blind: Option<f64>,
    ante: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TournamentBustout {
    name: String,
    timestamp: u64,
    #[serde(default)]
    blinds: Option<BustoutBlinds>,
    #[serde(default)]
    elapsed_seconds: Option<u64>,
    #[serde(default)]
    place: Option<u32>,
    #[serde(default)]
    points_earned: Option<f64>,
    #[serde(default)]
    payout: Option<f64>,
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
    buyins: Vec<TournamentParticipant>,
    #[serde(default)]
    rebuys: Vec<TournamentParticipant>,
    #[serde(default)]
    addons: Vec<TournamentParticipant>,
    #[serde(default)]
    other_prize_pool: f64,
    #[serde(default)]
    other_chipstack: f64,
    #[serde(default)]
    bustouts: Vec<TournamentBustout>,
    #[serde(default = "default_bustouts_newest_first")]
    bustouts_newest_first: bool,
    #[serde(default)]
    payout_places: u32,
    #[serde(default)]
    payouts: Vec<f64>,
    #[serde(default = "default_percent_paid")]
    percent_paid: f64,
    #[serde(default = "default_payout_model")]
    payout_model: String,
    #[serde(default = "default_allow_payout_override")]
    allow_payout_override: bool,
    #[serde(default = "default_max_players_per_table")]
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

fn default_percent_paid() -> f64 {
    20.0
}

fn default_bustouts_newest_first() -> bool {
    true
}

fn default_payout_model() -> String {
    "Standard".to_string()
}

fn default_allow_payout_override() -> bool {
    true
}

fn default_max_players_per_table() -> u32 {
    9
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TournamentData {
    tournaments: Vec<Tournament>,
    active_tournament_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct AppData {
    #[serde(default)]
    tournaments: Vec<Tournament>,
    #[serde(default)]
    active_tournament_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    timer_settings: Option<TimerSettings>,
}

fn default_tournament_structure() -> Tournament {
    let levels = [
        (2.0, 4.0),
        (3.0, 6.0),
        (4.0, 8.0),
        (5.0, 10.0),
        (10.0, 20.0),
        (15.0, 30.0),
        (20.0, 40.0),
        (30.0, 60.0),
        (40.0, 80.0),
        (50.0, 100.0),
        (75.0, 150.0),
        (100.0, 200.0),
    ]
    .into_iter()
    .map(|(small_blind, big_blind)| TournamentLevel {
        duration: Some(15.0),
        small_blind: Some(small_blind),
        big_blind: Some(big_blind),
        ante: Some(0.0),
        is_break: false,
    })
    .collect();
    let chips = vec![
        TournamentChip {
            color: "#ffffff".to_string(),
            text_color: Some("#000000".to_string()),
            edge_spot_color: Some("#000000".to_string()),
            edge_spot_quantity: Some(6),
            denomination: 1.0,
            available_quantity: None,
            quantity_per_player: Some(20),
        },
        TournamentChip {
            color: "#ff0000".to_string(),
            text_color: Some("#ffffff".to_string()),
            edge_spot_color: Some("#ffffff".to_string()),
            edge_spot_quantity: Some(6),
            denomination: 5.0,
            available_quantity: None,
            quantity_per_player: Some(16),
        },
        TournamentChip {
            color: "#008000".to_string(),
            text_color: Some("#ffffff".to_string()),
            edge_spot_color: Some("#ffffff".to_string()),
            edge_spot_quantity: Some(6),
            denomination: 25.0,
            available_quantity: None,
            quantity_per_player: Some(8),
        },
        TournamentChip {
            color: "#000000".to_string(),
            text_color: Some("#ffffff".to_string()),
            edge_spot_color: Some("#ffffff".to_string()),
            edge_spot_quantity: Some(6),
            denomination: 100.0,
            available_quantity: None,
            quantity_per_player: Some(2),
        },
    ];
    Tournament {
        id: DEFAULT_TOURNAMENT_ID.to_string(),
        name: "DinkyDonk Default Tournament".to_string(),
        starting_chipstack: Some(500.0),
        rebuys_allowed: false,
        addons_allowed: false,
        buyin_cost: Some(20.0),
        buyin_description: None,
        rebuy_cost: None,
        rebuy_chipstack: None,
        rebuy_description: None,
        addon_cost: None,
        addon_chipstack: None,
        addon_description: None,
        buyins: Vec::new(),
        rebuys: Vec::new(),
        addons: Vec::new(),
        other_prize_pool: 0.0,
        other_chipstack: 0.0,
        bustouts: Vec::new(),
        bustouts_newest_first: true,
        payout_places: 0,
        payouts: Vec::new(),
        percent_paid: default_percent_paid(),
        payout_model: default_payout_model(),
        allow_payout_override: default_allow_payout_override(),
        max_players_per_table: default_max_players_per_table(),
        chips,
        levels,
        timer_is_running: false,
        timer_started_at: None,
        timer_elapsed_ms: None,
    }
}

fn default_tournament_data() -> TournamentData {
    let tournament = default_tournament_structure();
    TournamentData {
        active_tournament_id: Some(tournament.id.clone()),
        tournaments: vec![tournament],
    }
}

#[tauri::command]
fn get_default_tournament_structure() -> Tournament {
    default_tournament_structure()
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

fn configured_data_file_from_config(config_path: &Path, default_dir: &Path) -> Result<PathBuf, String> {
    if !config_path.exists() {
        return Ok(app_data_file_path(default_dir));
    }

    let contents = fs::read_to_string(config_path)
        .map_err(|error| format!("Could not read settings location: {error}"))?;
    let configured_path: String = serde_json::from_str(&contents)
        .map_err(|error| format!("Could not parse settings location: {error}"))?;
    let path = PathBuf::from(configured_path);
    if path.is_dir() {
        return Ok(app_data_file_path(&path));
    }
    if !path.is_file() || !has_json_extension(&path) {
        return Err(format!(
            "The configured settings file or directory does not exist: {}",
            path.display()
        ));
    }
    Ok(path)
}

fn configured_data_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    configured_data_file_from_config(&settings_directory_config_path(app)?, &default_data_dir(app)?)
}

fn app_data_file_path(data_dir: &Path) -> PathBuf {
    data_dir.join("DinkyDonk.JSON")
}

fn has_json_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("json"))
}

fn parse_app_data(contents: &str) -> Result<(AppData, serde_json::Value, bool), String> {
    let mut json: serde_json::Value = serde_json::from_str(contents)
        .map_err(|error| format!("Could not parse settings file: {error}"))?;
    let mut migrated = migrate_legacy_counts(&mut json)?;
    migrated |= migrate_bustout_order(&mut json)?;
    migrated |= add_missing_bustout_payouts(&mut json);
    let data = AppData::deserialize(&json)
        .map_err(|error| format!("Could not parse settings file: {error}"))?;
    Ok((data, json, migrated))
}

fn read_app_data_from_file(path: &Path) -> Result<AppData, String> {
    if !path.exists() {
        return Ok(AppData::default());
    }

    let contents = fs::read_to_string(path)
        .map_err(|error| format!("Could not read settings file: {error}"))?;
    let (data, json, migrated) = parse_app_data(&contents)?;
    if migrated {
        let contents = serde_json::to_string_pretty(&json)
            .map_err(|error| format!("Could not encode settings file: {error}"))?;
        fs::write(path, contents)
            .map_err(|error| format!("Could not save migrated settings file: {error}"))?;
    }
    Ok(data)
}

fn add_missing_bustout_payouts(data: &mut serde_json::Value) -> bool {
    let Some(tournaments) = data.get_mut("tournaments").and_then(|value| value.as_array_mut()) else {
        return false;
    };
    let mut changed = false;
    for tournament in tournaments {
        if let Some(bustouts) = tournament.get_mut("bustouts").and_then(|value| value.as_array_mut()) {
            for bustout in bustouts {
                if let Some(fields) = bustout.as_object_mut() {
                    if !fields.contains_key("payout") {
                        fields.insert("payout".to_string(), serde_json::Value::Null);
                        changed = true;
                    }
                }
            }
        }
    }
    changed
}

fn migrate_bustout_order(data: &mut serde_json::Value) -> Result<bool, String> {
    let Some(tournaments) = data.get_mut("tournaments").and_then(|value| value.as_array_mut()) else {
        return Ok(false);
    };
    let mut changed = false;
    for tournament in tournaments {
        let Some(fields) = tournament.as_object_mut() else {
            continue;
        };
        match fields.get("bustoutsNewestFirst") {
            Some(serde_json::Value::Bool(true)) => continue,
            Some(serde_json::Value::Bool(false)) | None => {}
            Some(_) => return Err("Invalid bustoutsNewestFirst in DinkyDonk.JSON".to_string()),
        }
        if let Some(bustouts) = fields.get_mut("bustouts") {
            bustouts.as_array_mut()
                .ok_or("Invalid bustouts in DinkyDonk.JSON")?
                .reverse();
        }
        fields.insert("bustoutsNewestFirst".to_string(), serde_json::Value::Bool(true));
        changed = true;
    }
    Ok(changed)
}

fn migrate_legacy_counts(data: &mut serde_json::Value) -> Result<bool, String> {
    let Some(tournaments) = data.get_mut("tournaments").and_then(|value| value.as_array_mut()) else {
        return Ok(false);
    };
    let mut changed = false;
    let mut timestamp = None;
    for tournament in tournaments {
        let Some(fields) = tournament.as_object_mut() else {
            continue;
        };
        for (old, new) in [
            ("buyinCount", "buyins"),
            ("rebuyCount", "rebuys"),
            ("addonCount", "addons"),
            ("bustoutCount", "bustouts"),
        ] {
            if let Some(count) = fields.remove(old) {
                changed = true;
                let count = count.as_u64()
                    .filter(|count| *count <= u32::MAX as u64)
                    .ok_or_else(|| format!("Invalid legacy {old} in DinkyDonk.JSON"))?;
                if !fields.contains_key(new) {
                    if count > 100_000 {
                        return Err(format!("Cannot migrate {old}: count exceeds 100,000"));
                    }
                    let timestamp = match timestamp {
                        Some(timestamp) => timestamp,
                        None => {
                            let now = SystemTime::now().duration_since(UNIX_EPOCH)
                                .map_err(|error| format!("Could not timestamp legacy entries: {error}"))?
                                .as_millis() as u64;
                            timestamp = Some(now);
                            now
                        }
                    };
                    let mut records = Vec::new();
                    records.try_reserve(count as usize)
                        .map_err(|error| format!("Could not migrate {old}: {error}"))?;
                    for _ in 0..count {
                        records.push(serde_json::json!({ "name": "Unnamed", "timestamp": timestamp }));
                    }
                    fields.insert(new.to_string(), serde_json::Value::Array(records));
                }
            }
        }
    }
    Ok(changed)
}

fn write_app_data_to_file(path: &Path, data: &AppData) -> Result<(), String> {
    let contents = serde_json::to_string_pretty(data)
        .map_err(|error| format!("Could not encode settings file: {error}"))?;
    fs::write(path, contents)
        .map_err(|error| format!("Could not save settings file: {error}"))
}

fn read_app_data(app: &tauri::AppHandle) -> Result<AppData, String> {
    read_app_data_from_file(&configured_data_file(app)?)
}

fn write_app_data(app: &tauri::AppHandle, data: &AppData) -> Result<(), String> {
    write_app_data_to_file(&configured_data_file(app)?, data)
}

fn migrate_legacy_default_tournament_id(data: &mut AppData) -> bool {
    let mut changed = false;
    for tournament in &mut data.tournaments {
        if tournament.id == LEGACY_DEFAULT_TOURNAMENT_ID {
            tournament.id = DEFAULT_TOURNAMENT_ID.to_string();
            changed = true;
        }
    }

    if data.active_tournament_id.as_deref() == Some(LEGACY_DEFAULT_TOURNAMENT_ID) {
        data.active_tournament_id = Some(DEFAULT_TOURNAMENT_ID.to_string());
        changed = true;
    }

    changed
}

#[tauri::command]
fn get_settings_file(
    app: tauri::AppHandle,
    persistence: State<'_, PersistenceLock>,
) -> Result<String, String> {
    let _guard = persistence
        .0
        .lock()
        .map_err(|error| format!("Could not lock app data: {error}"))?;
    Ok(configured_data_file(&app)?.to_string_lossy().into_owned())
}

#[derive(Serialize)]
struct SettingsFilePickerResult {
    supported: bool,
    path: Option<String>,
}

#[tauri::command(rename_all = "camelCase")]
async fn pick_settings_file(
    _window: tauri::WebviewWindow,
    default_path: String,
) -> Result<SettingsFilePickerResult, String> {
    #[cfg(windows)]
    {
        let owner = _window.hwnd()
            .map_err(|error| format!("Could not find the settings window: {error}"))?.0 as isize;
        let path = tauri::async_runtime::spawn_blocking(move || {
            pick_settings_file_on_windows(owner, &default_path)
        }).await.map_err(|error| format!("Could not run settings file picker: {error}"))??;
        Ok(SettingsFilePickerResult { supported: true, path })
    }
    #[cfg(not(windows))]
    {
        let _ = default_path;
        Ok(SettingsFilePickerResult { supported: false, path: None })
    }
}

#[cfg(windows)]
fn pick_settings_file_on_windows(owner: isize, default_path: &str) -> Result<Option<String>, String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::{
        core::{PCWSTR, w},
        Win32::{
            Foundation::{ERROR_CANCELLED, HWND},
            System::Com::{CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED},
            UI::Shell::{Common::COMDLG_FILTERSPEC, FileOpenDialog, FOS_FILEMUSTEXIST, FOS_FORCEFILESYSTEM, IFileOpenDialog, IShellItem, SHCreateItemFromParsingName, SIGDN_FILESYSPATH},
        },
    };

    unsafe {
        CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok()
            .map_err(|error| format!("Could not initialize file picker: {error}"))?;
        let result = (|| -> windows::core::Result<Option<String>> {
            let dialog: IFileOpenDialog = CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER)?;
            // The Open dialog normally rejects new filenames before the app can create them.
            dialog.SetOptions((dialog.GetOptions()? & !FOS_FILEMUSTEXIST) | FOS_FORCEFILESYSTEM)?;
            dialog.SetTitle(w!("Choose settings file"))?;
            dialog.SetFileTypes(&[COMDLG_FILTERSPEC {
                pszName: w!("JSON files"),
                pszSpec: w!("*.json"),
            }])?;
            dialog.SetDefaultExtension(w!("json"))?;
            let path = Path::new(default_path);
            if let Some(parent) = path.parent().filter(|parent| parent.is_dir()) {
                let wide_parent: Vec<u16> = parent.as_os_str().encode_wide().chain(Some(0)).collect();
                let folder: IShellItem = SHCreateItemFromParsingName(PCWSTR(wide_parent.as_ptr()), None)?;
                dialog.SetFolder(&folder)?;
            }
            if let Some(name) = path.file_name() {
                let wide_name: Vec<u16> = name.encode_wide().chain(Some(0)).collect();
                dialog.SetFileName(PCWSTR(wide_name.as_ptr()))?;
            }
            match dialog.Show(Some(HWND(owner as *mut std::ffi::c_void))) {
                Ok(()) => {}
                Err(error) if error.code() == ERROR_CANCELLED.to_hresult() => return Ok(None),
                Err(error) => return Err(error),
            }
            let item = dialog.GetResult()?;
            let name = item.GetDisplayName(SIGDN_FILESYSPATH)?;
            let path = name.to_string();
            CoTaskMemFree(Some(name.0.cast()));
            Ok(Some(path?))
        })();
        CoUninitialize();
        result.map_err(|error| format!("Could not choose settings file: {error}"))
    }
}

fn select_settings_file(path: &Path, config_path: &Path) -> Result<PathBuf, String> {
    if !has_json_extension(path) {
        return Err("The settings file must have a .json extension.".to_string());
    }
    if !path.is_file() {
        return Err("The selected settings file does not exist.".to_string());
    }
    let selected_file = path.canonicalize()
        .map_err(|error| format!("Could not resolve the selected settings file: {error}"))?;
    if config_path.exists() && selected_file == config_path.canonicalize()
        .map_err(|error| format!("Could not resolve settings configuration: {error}"))? {
        return Err("The settings configuration cannot be used as a settings file.".to_string());
    }
    let contents = fs::read_to_string(&selected_file)
        .map_err(|error| format!("Could not read the selected settings file: {error}"))?;
    let (_, json, _) = parse_app_data(&contents)?;
    if !json.as_object().is_some_and(|fields| {
        fields.contains_key("tournaments")
            || fields.contains_key("activeTournamentId")
            || fields.contains_key("timerSettings")
    }) {
        return Err("The selected JSON file does not contain DinkyDonk settings.".to_string());
    }
    let config = serde_json::to_string(&selected_file.to_string_lossy().as_ref())
        .map_err(|error| format!("Could not encode settings location: {error}"))?;
    fs::write(config_path, config)
        .map_err(|error| format!("Could not save settings location: {error}"))?;
    Ok(selected_file)
}

#[tauri::command(rename_all = "camelCase")]
fn set_settings_file(
    app: tauri::AppHandle,
    path: String,
    persistence: State<'_, PersistenceLock>,
) -> Result<String, String> {
    let _guard = persistence.0.lock()
        .map_err(|error| format!("Could not lock app data: {error}"))?;
    let selected = select_or_create_settings_file(
        Path::new(&path),
        &configured_data_file(&app)?,
        &settings_directory_config_path(&app)?,
    )?;
    Ok(selected.to_string_lossy().into_owned())
}

fn select_or_create_settings_file(path: &Path, current_file: &Path, config_path: &Path) -> Result<PathBuf, String> {
    use std::io::Write;

    if !has_json_extension(path) {
        return Err("The settings file must have a .json extension.".to_string());
    }
    let parent = path.parent().ok_or("The settings file must have a parent directory.")?
        .canonicalize()
        .map_err(|error| format!("Could not resolve the selected directory: {error}"))?;
    let name = path.file_name().ok_or("The settings file must have a name.")?;
    let selected_file = parent.join(name);
    let config_parent = config_path.parent().ok_or("Settings configuration has no parent directory.")?
        .canonicalize()
        .map_err(|error| format!("Could not resolve settings configuration: {error}"))?;
    let config_name = config_path.file_name().ok_or("Settings configuration has no name.")?;
    if parent == config_parent && name.to_string_lossy().eq_ignore_ascii_case(&config_name.to_string_lossy()) {
        return Err("The settings configuration cannot be used as a settings file.".to_string());
    }
    match fs::metadata(&selected_file) {
        Ok(_) => return select_settings_file(&selected_file, config_path),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(format!("Could not inspect the selected settings file: {error}")),
    }
    let contents = match fs::read(current_file) {
        Ok(contents) => contents,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => serde_json::to_vec(&AppData::default())
            .map_err(|error| format!("Could not encode settings file: {error}"))?,
        Err(error) => return Err(format!("Could not read the current settings file: {error}")),
    };
    let mut destination = match fs::OpenOptions::new().write(true).create_new(true).open(&selected_file) {
        Ok(destination) => destination,
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            return select_settings_file(&selected_file, config_path);
        }
        Err(error) => return Err(format!("Could not create settings file: {error}")),
    };
    if let Err(error) = destination.write_all(&contents) {
        drop(destination);
        return match fs::remove_file(&selected_file) {
            Ok(()) => Err(format!("Could not write settings file: {error}")),
            Err(cleanup_error) => Err(format!("Could not write settings file: {error}; could not remove incomplete file: {cleanup_error}")),
        };
    }
    drop(destination);
    select_settings_file(&selected_file, config_path)
}

#[tauri::command]
fn load_timer_settings(
    app: tauri::AppHandle,
    persistence: State<'_, PersistenceLock>,
) -> Result<Option<TimerSettings>, String> {
    let _guard = persistence
        .0
        .lock()
        .map_err(|error| format!("Could not lock app data: {error}"))?;
    Ok(read_app_data(&app)?.timer_settings)
}

#[tauri::command]
fn save_timer_settings(
    app: tauri::AppHandle,
    settings: TimerSettings,
    persistence: State<'_, PersistenceLock>,
) -> Result<(), String> {
    let _guard = persistence
        .0
        .lock()
        .map_err(|error| format!("Could not lock app data: {error}"))?;
    let mut data = read_app_data(&app)?;
    data.timer_settings = Some(settings);
    write_app_data(&app, &data)
}

#[tauri::command]
fn load_tournaments(
    app: tauri::AppHandle,
    persistence: State<'_, PersistenceLock>,
) -> Result<TournamentData, String> {
    let _guard = persistence
        .0
        .lock()
        .map_err(|error| format!("Could not lock app data: {error}"))?;
    let mut data = read_app_data(&app)?;
    let mut changed = false;

    if data.tournaments.is_empty() {
        let defaults = default_tournament_data();
        data.tournaments = defaults.tournaments;
        data.active_tournament_id = defaults.active_tournament_id;
        changed = true;
    }

    changed |= migrate_legacy_default_tournament_id(&mut data);

    if let Some(active_tournament_id) = data.active_tournament_id.as_deref() {
        if !data
            .tournaments
            .iter()
            .any(|tournament| tournament.id == active_tournament_id)
        {
            data.active_tournament_id = None;
            changed = true;
        }
    }

    if changed {
        write_app_data(&app, &data)?;
    }

    Ok(TournamentData {
        tournaments: data.tournaments,
        active_tournament_id: data.active_tournament_id,
    })
}

#[tauri::command(rename_all = "camelCase")]
fn save_tournaments(
    app: tauri::AppHandle,
    tournaments: Vec<Tournament>,
    active_tournament_id: Option<String>,
    persistence: State<'_, PersistenceLock>,
) -> Result<(), String> {
    let _guard = persistence
        .0
        .lock()
        .map_err(|error| format!("Could not lock app data: {error}"))?;
    let active_tournament_id = active_tournament_id.filter(|active_id| {
        tournaments.iter().any(|tournament| tournament.id == *active_id)
    });
    let mut data = read_app_data(&app)?;
    data.tournaments = tournaments;
    data.active_tournament_id = active_tournament_id;
    write_app_data(&app, &data)
}

fn apply_bustout_payouts(
    data: &mut AppData,
    expected_tournaments: &[Tournament],
    bustout_payouts: &[Vec<Option<f64>>],
) -> Result<bool, String> {
    if bustout_payouts.len() != expected_tournaments.len()
        || expected_tournaments.iter().zip(bustout_payouts).any(|(tournament, payouts)| {
            tournament.bustouts.len() != payouts.len()
                || payouts.iter().flatten().any(|payout| !payout.is_finite())
        })
    {
        return Err("Invalid bustout payouts.".to_string());
    }
    let current = serde_json::to_value(&data.tournaments)
        .map_err(|error| format!("Could not compare tournament data: {error}"))?;
    let expected = serde_json::to_value(expected_tournaments)
        .map_err(|error| format!("Could not compare tournament data: {error}"))?;
    if current != expected {
        return Ok(false);
    }
    for (tournament, payouts) in data.tournaments.iter_mut().zip(bustout_payouts) {
        for (bustout, payout) in tournament.bustouts.iter_mut().zip(payouts) {
            bustout.payout = *payout;
        }
    }
    Ok(true)
}

#[tauri::command(rename_all = "camelCase")]
fn reconcile_bustout_payouts(
    app: tauri::AppHandle,
    expected_tournaments: Vec<Tournament>,
    bustout_payouts: Vec<Vec<Option<f64>>>,
    persistence: State<'_, PersistenceLock>,
) -> Result<bool, String> {
    let _guard = persistence
        .0
        .lock()
        .map_err(|error| format!("Could not lock app data: {error}"))?;
    let mut data = read_app_data(&app)?;
    if !apply_bustout_payouts(&mut data, &expected_tournaments, &bustout_payouts)? {
        return Ok(false);
    }
    write_app_data(&app, &data)?;
    Ok(true)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let (keep_awake_sender, keep_awake_receiver) = mpsc::channel::<KeepAwakeRequest>();

    tauri::Builder::default()
        .manage(PersistenceLock::default())
        .manage(KeepAwakeController {
            sender: keep_awake_sender,
        })
        .setup(move |app| {
            #[cfg(desktop)]
            {
                let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/icon.png"))?;
                let window = app.get_webview_window("main").ok_or_else(|| {
                    std::io::Error::new(
                        std::io::ErrorKind::NotFound,
                        "Could not find the main window to set its icon",
                    )
                })?;
                window.set_icon(icon)?;
            }

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
            get_settings_file,
            pick_settings_file,
            set_settings_file,
            get_default_tournament_structure,
            load_tournaments,
            save_tournaments,
            reconcile_bustout_payouts,
            load_timer_settings,
            save_timer_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{
        AppData, DEFAULT_TOURNAMENT_ID, LEGACY_DEFAULT_TOURNAMENT_ID, TimerSettings,
        default_tournament_data, migrate_legacy_default_tournament_id,
    };

    #[test]
    fn choosing_settings_file_creates_a_copy_or_opens_existing_data() {
        let directory = std::env::temp_dir().join(format!(
            "dinkydonk-create-settings-{}-{}",
            std::process::id(),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ));
        std::fs::create_dir(&directory).unwrap();
        let config = directory.join("settings-directory.json");
        let current = directory.join("current.json");
        let new_file = directory.join("new.json");
        let contents = serde_json::to_string(&super::default_tournament_data()).unwrap();
        std::fs::write(&current, &contents).unwrap();

        assert!(super::select_or_create_settings_file(&directory.join("wrong.txt"), &current, &config).is_err());
        assert!(super::select_or_create_settings_file(&config, &current, &config).is_err());
        assert!(!config.exists());
        super::select_or_create_settings_file(&new_file, &current, &config).unwrap();
        assert_eq!(std::fs::read_to_string(&new_file).unwrap(), contents);
        assert_eq!(super::configured_data_file_from_config(&config, &directory).unwrap(), new_file.canonicalize().unwrap());
        std::fs::write(&current, r#"{"tournaments":[]}"#).unwrap();
        super::select_or_create_settings_file(&new_file, &current, &config).unwrap();
        assert_eq!(std::fs::read_to_string(&new_file).unwrap(), contents);

        std::fs::remove_file(current).unwrap();
        std::fs::remove_file(new_file).unwrap();
        std::fs::remove_file(config).unwrap();
        std::fs::remove_dir(directory).unwrap();
    }

    #[test]
    fn selected_json_file_is_preserved_and_used_for_subsequent_io() {
        let directory = std::env::temp_dir().join(format!(
            "dinkydonk-settings-{}-{}",
            std::process::id(),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ));
        std::fs::create_dir(&directory).unwrap();
        let config = directory.join("settings-directory.json");
        let file = directory.join("other.JSON");
        let original = serde_json::to_string(&super::default_tournament_data()).unwrap();
        std::fs::write(&file, &original).unwrap();

        super::select_settings_file(&file, &config).unwrap();
        assert_eq!(std::fs::read_to_string(&file).unwrap(), original);
        let configured = super::configured_data_file_from_config(&config, &directory).unwrap();
        assert_eq!(configured, file.canonicalize().unwrap());
        let mut data = super::read_app_data_from_file(&configured).unwrap();
        data.tournaments[0].name = "Selected file".to_string();
        super::write_app_data_to_file(&configured, &data).unwrap();
        assert_eq!(super::read_app_data_from_file(&file).unwrap().tournaments[0].name, "Selected file");
        assert!(!super::app_data_file_path(&directory).exists());

        let wrong_extension = directory.join("wrong.txt");
        std::fs::write(&wrong_extension, &original).unwrap();
        assert!(super::select_settings_file(&wrong_extension, &config).is_err());
        let invalid = directory.join("invalid.json");
        std::fs::write(&invalid, "not json").unwrap();
        assert!(super::select_settings_file(&invalid, &config).is_err());
        std::fs::write(&invalid, r#"{"unrelated": true}"#).unwrap();
        assert!(super::select_settings_file(&invalid, &config).is_err());
        assert!(super::select_settings_file(&directory.join("missing.json"), &config).is_err());
        assert!(super::select_settings_file(&config, &config).is_err());
        assert_eq!(super::configured_data_file_from_config(&config, &directory).unwrap(), configured);

        std::fs::remove_file(wrong_extension).unwrap();
        std::fs::remove_file(invalid).unwrap();
        std::fs::remove_file(file).unwrap();
        std::fs::remove_file(config).unwrap();
        std::fs::remove_dir(directory).unwrap();
    }

    #[test]
    fn legacy_directory_configuration_resolves_to_default_filename() {
        let directory = std::env::temp_dir().join(format!(
            "dinkydonk-legacy-location-{}-{}",
            std::process::id(),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ));
        std::fs::create_dir(&directory).unwrap();
        let config = directory.join("settings-directory.json");
        assert_eq!(
            super::configured_data_file_from_config(&config, &directory).unwrap(),
            super::app_data_file_path(&directory)
        );
        std::fs::write(&config, serde_json::to_string(&directory.to_string_lossy().as_ref()).unwrap()).unwrap();
        assert_eq!(
            super::configured_data_file_from_config(&config, &directory).unwrap(),
            super::app_data_file_path(&directory)
        );
        std::fs::remove_file(config).unwrap();
        std::fs::remove_dir(directory).unwrap();
    }

    #[test]
    fn legacy_counts_migrate_to_timestamped_arrays_once() {
        let mut data = serde_json::json!({
            "tournaments": [{
                "buyinCount": 2, "rebuyCount": 1, "addonCount": 0, "bustoutCount": 1
            }]
        });
        assert!(super::migrate_legacy_counts(&mut data).unwrap());
        let tournament = &data["tournaments"][0];
        for (field, count) in [("buyins", 2), ("rebuys", 1), ("addons", 0), ("bustouts", 1)] {
            let records = tournament[field].as_array().unwrap();
            assert_eq!(records.len(), count);
            for record in records {
                assert_eq!(record["name"], "Unnamed");
                assert!(record["timestamp"].as_u64().unwrap() > 0);
            }
        }
        assert!(tournament.get("buyinCount").is_none());
        let migrated = data.clone();
        assert!(!super::migrate_legacy_counts(&mut data).unwrap());
        assert_eq!(data, migrated);
    }

    #[test]
    fn existing_arrays_take_precedence_and_invalid_legacy_counts_fail() {
        let mut data = serde_json::json!({
            "tournaments": [{ "buyinCount": 5, "buyins": [{ "name": "A", "timestamp": 1 }] }]
        });
        assert!(super::migrate_legacy_counts(&mut data).unwrap());
        assert_eq!(data["tournaments"][0]["buyins"].as_array().unwrap().len(), 1);
        let mut invalid = serde_json::json!({ "tournaments": [{ "buyinCount": -1 }] });
        assert!(super::migrate_legacy_counts(&mut invalid).is_err());
    }

    #[test]
    fn bustout_details_round_trip_and_old_records_load() {
        let json = serde_json::json!({
            "name": "Unnamed",
            "timestamp": 12345,
            "blinds": { "smallBlind": 50.0, "bigBlind": 100.0, "ante": 10.0 },
            "elapsedSeconds": 90,
            "place": 4,
            "pointsEarned": null,
            "payout": 35.0
        });
        let bustout: super::TournamentBustout = serde_json::from_value(json.clone()).unwrap();
        assert_eq!(serde_json::to_value(bustout).unwrap(), json);

        let old: super::TournamentBustout = serde_json::from_value(serde_json::json!({
            "name": "Unnamed", "timestamp": 100
        })).unwrap();
        let saved = serde_json::to_value(old).unwrap();
        assert!(saved["blinds"].is_null());
        assert!(saved["elapsedSeconds"].is_null());
        assert!(saved["place"].is_null());
        assert!(saved["pointsEarned"].is_null());
        assert!(saved["payout"].is_null());
    }

    #[test]
    fn payout_reconciliation_checks_saved_data_before_updating() {
        let mut data = AppData {
            tournaments: vec![super::default_tournament_structure()],
            active_tournament_id: Some(DEFAULT_TOURNAMENT_ID.to_string()),
            timer_settings: None,
        };
        data.tournaments[0].bustouts.push(serde_json::from_value(serde_json::json!({
            "name": "Unnamed", "timestamp": 1, "place": 2
        })).unwrap());
        let expected: Vec<super::Tournament> = serde_json::from_value(
            serde_json::to_value(&data.tournaments).unwrap()
        ).unwrap();
        assert!(super::apply_bustout_payouts(&mut data, &expected, &[vec![Some(25.0)]]).unwrap());
        assert_eq!(data.tournaments[0].bustouts[0].payout, Some(25.0));
        assert!(!super::apply_bustout_payouts(&mut data, &expected, &[vec![Some(50.0)]]).unwrap());
        assert_eq!(data.tournaments[0].bustouts[0].payout, Some(25.0));
        assert!(super::apply_bustout_payouts(&mut data, &expected, &[vec![]]).is_err());
    }

    #[test]
    fn legacy_bustout_order_is_reversed_only_once() {
        let mut data = serde_json::json!({
            "tournaments": [
                { "bustouts": [
                    { "name": "First", "timestamp": 1, "place": 5 },
                    { "name": "Second", "timestamp": 2, "place": 4 }
                ] },
                { "bustoutsNewestFirst": true, "bustouts": [
                    { "name": "Newest", "timestamp": 4 },
                    { "name": "Older", "timestamp": 3 }
                ] }
            ]
        });
        assert!(super::migrate_bustout_order(&mut data).unwrap());
        assert_eq!(data["tournaments"][0]["bustouts"][0]["name"], "Second");
        assert_eq!(data["tournaments"][0]["bustouts"][1]["place"], 5);
        assert_eq!(data["tournaments"][1]["bustouts"][0]["name"], "Newest");
        let migrated = data.clone();
        assert!(!super::migrate_bustout_order(&mut data).unwrap());
        assert_eq!(data, migrated);
    }

    #[test]
    fn loading_legacy_counts_persists_migration_and_timestamps() {
        let directory = std::env::temp_dir().join(format!(
            "dinkydonk-migration-{}-{}",
            std::process::id(),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ));
        std::fs::create_dir(&directory).unwrap();
        let mut json = serde_json::to_value(super::default_tournament_data()).unwrap();
        json["futureSetting"] = serde_json::json!("preserved");
        let tournament = json["tournaments"][0].as_object_mut().unwrap();
        tournament.remove("buyins");
        tournament.remove("bustoutsNewestFirst");
        tournament.insert("buyinCount".to_string(), serde_json::json!(2));
        tournament.insert("bustouts".to_string(), serde_json::json!([
            { "name": "First", "timestamp": 1 },
            { "name": "Second", "timestamp": 2 }
        ]));
        let path = super::app_data_file_path(&directory);
        std::fs::write(&path, serde_json::to_string(&json).unwrap()).unwrap();

        let first = super::read_app_data_from_file(&path).unwrap();
        assert_eq!(first.tournaments[0].buyins.len(), 2);
        let timestamp = first.tournaments[0].buyins[0].timestamp;
        let saved: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert!(saved["tournaments"][0].get("buyinCount").is_none());
        assert_eq!(saved["futureSetting"], "preserved");
        assert_eq!(saved["tournaments"][0]["bustoutsNewestFirst"], true);
        assert_eq!(saved["tournaments"][0]["bustouts"][0]["name"], "Second");
        assert!(saved["tournaments"][0]["bustouts"][0].get("payout").unwrap().is_null());
        assert_eq!(saved["tournaments"][0]["buyins"][0]["timestamp"], timestamp);
        let second = super::read_app_data_from_file(&path).unwrap();
        assert_eq!(second.tournaments[0].buyins[0].timestamp, timestamp);
        assert_eq!(second.tournaments[0].bustouts[0].name, "Second");

        std::fs::remove_file(path).unwrap();
        std::fs::remove_dir(directory).unwrap();
    }

    #[test]
    fn legacy_default_tournament_id_is_replaced_with_a_guid() {
        let mut data = AppData {
            tournaments: vec![super::default_tournament_structure()],
            active_tournament_id: Some(LEGACY_DEFAULT_TOURNAMENT_ID.to_string()),
            timer_settings: None,
        };
        data.tournaments[0].id = LEGACY_DEFAULT_TOURNAMENT_ID.to_string();

        assert!(migrate_legacy_default_tournament_id(&mut data));
        assert_eq!(data.tournaments[0].id, DEFAULT_TOURNAMENT_ID);
        assert_eq!(
            data.active_tournament_id.as_deref(),
            Some(DEFAULT_TOURNAMENT_ID)
        );
    }

    #[test]
    fn app_data_round_trips_tournament_and_timer_settings_together() {
        let tournament_data = default_tournament_data();
        let data = AppData {
            tournaments: tournament_data.tournaments,
            active_tournament_id: tournament_data.active_tournament_id,
            timer_settings: Some(TimerSettings {
                alarm_sound: "triple-ding".to_string(),
                volume: 0.5,
                spoken_announcement_enabled: true,
                announcement_speed: 1.0,
                announcement: "Level changed.".to_string(),
                countdown_warning_seconds: 10,
                countdown_warning_sound: "single-ding".to_string(),
                countdown_warning_speech_enabled: false,
                countdown_warning_announcement: "{seconds} seconds remaining.".to_string(),
            }),
        };

        let json = serde_json::to_value(&data).unwrap();
        assert!(json["tournaments"].is_array());
        assert!(json["timerSettings"].is_object());
        assert_eq!(
            json["activeTournamentId"],
            DEFAULT_TOURNAMENT_ID
        );

        let loaded: AppData = serde_json::from_value(json).unwrap();
        assert_eq!(loaded.tournaments.len(), 1);
        assert_eq!(
            loaded.active_tournament_id.as_deref(),
            Some(DEFAULT_TOURNAMENT_ID)
        );
        assert_eq!(loaded.timer_settings.unwrap().volume, 0.5);
    }

    #[test]
    fn default_tournament_data_contains_the_starter_structure() {
        let data = default_tournament_data();
        let tournament = &data.tournaments[0];

        assert_eq!(
            data.active_tournament_id.as_deref(),
            Some(DEFAULT_TOURNAMENT_ID)
        );
        assert_eq!(tournament.name, "DinkyDonk Default Tournament");
        assert_eq!(tournament.starting_chipstack, Some(500.0));
        assert_eq!(tournament.buyin_cost, Some(20.0));
        assert!(!tournament.rebuys_allowed);
        assert!(!tournament.addons_allowed);
        assert_eq!(tournament.percent_paid, 20.0);
        assert_eq!(tournament.payout_model, "Standard");
        assert_eq!(tournament.max_players_per_table, 9);
        assert_eq!(
            tournament
                .chips
                .iter()
                .map(|chip| chip.denomination)
                .collect::<Vec<_>>(),
            vec![1.0, 5.0, 25.0, 100.0]
        );
        assert_eq!(
            tournament
                .chips
                .iter()
                .map(|chip| (chip.denomination, chip.quantity_per_player))
                .collect::<Vec<_>>(),
            vec![
                (1.0, Some(20)),
                (5.0, Some(16)),
                (25.0, Some(8)),
                (100.0, Some(2)),
            ]
        );
        assert_eq!(
            tournament
                .chips
                .iter()
                .map(|chip| (
                    chip.color.as_str(),
                    chip.text_color.as_deref(),
                    chip.edge_spot_color.as_deref(),
                ))
                .collect::<Vec<_>>(),
            vec![
                ("#ffffff", Some("#000000"), Some("#000000")),
                ("#ff0000", Some("#ffffff"), Some("#ffffff")),
                ("#008000", Some("#ffffff"), Some("#ffffff")),
                ("#000000", Some("#ffffff"), Some("#ffffff")),
            ]
        );
        assert_eq!(
            tournament
                .levels
                .iter()
                .map(|level| (
                    level.duration,
                    level.small_blind,
                    level.big_blind,
                    level.ante
                ))
                .collect::<Vec<_>>(),
            vec![
                (Some(15.0), Some(2.0), Some(4.0), Some(0.0)),
                (Some(15.0), Some(3.0), Some(6.0), Some(0.0)),
                (Some(15.0), Some(4.0), Some(8.0), Some(0.0)),
                (Some(15.0), Some(5.0), Some(10.0), Some(0.0)),
                (Some(15.0), Some(10.0), Some(20.0), Some(0.0)),
                (Some(15.0), Some(15.0), Some(30.0), Some(0.0)),
                (Some(15.0), Some(20.0), Some(40.0), Some(0.0)),
                (Some(15.0), Some(30.0), Some(60.0), Some(0.0)),
                (Some(15.0), Some(40.0), Some(80.0), Some(0.0)),
                (Some(15.0), Some(50.0), Some(100.0), Some(0.0)),
                (Some(15.0), Some(75.0), Some(150.0), Some(0.0)),
                (Some(15.0), Some(100.0), Some(200.0), Some(0.0)),
            ]
        );
    }

    #[test]
    fn missing_table_limit_defaults_to_nine() {
        let tournament = super::default_tournament_structure();
        let mut json = serde_json::to_value(tournament).unwrap();
        json.as_object_mut().unwrap().remove("maxPlayersPerTable");
        let loaded: super::Tournament = serde_json::from_value(json).unwrap();
        assert_eq!(loaded.max_players_per_table, 9);
    }
}
