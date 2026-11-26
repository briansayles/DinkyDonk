use std::net::Ipv4Addr;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{Manager, State};
use tiny_http::{Header, Method, Response, Server, StatusCode};

use crate::{
    AppData, PersistenceLock, TimerSettings, Tournament, TournamentChip, TournamentData,
    database_path, read_app_data, storage,
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewerStatus {
    port: Option<u16>,
    error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewerConnection {
    urls: Vec<String>,
    error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ViewerLevel {
    duration: Option<f64>,
    small_blind: Option<f64>,
    big_blind: Option<f64>,
    ante: Option<f64>,
    is_break: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ViewerTournament {
    id: String,
    name: String,
    levels: Vec<ViewerLevel>,
    chips: Vec<TournamentChip>,
    running: bool,
    elapsed_ms: f64,
    buyin_count: usize,
    rebuy_count: usize,
    addon_count: usize,
    bustout_count: usize,
    rebuys_allowed: bool,
    addons_allowed: bool,
    buyin_cost: Option<f64>,
    rebuy_cost: Option<f64>,
    addon_cost: Option<f64>,
    starting_chipstack: Option<f64>,
    rebuy_chipstack: Option<f64>,
    addon_chipstack: Option<f64>,
    other_prize_pool: f64,
    other_chipstack: f64,
    percent_paid: f64,
    payout_model: String,
    allow_payout_override: bool,
    payout_places: u32,
    payouts: Vec<f64>,
    max_players_per_table: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ViewerSnapshot {
    tournament: Option<ViewerTournament>,
    show_network_viewer_qr: bool,
}

#[tauri::command]
pub fn get_network_viewer_status(status: State<'_, ViewerStatus>) -> ViewerConnection {
    let Some(port) = status.port else {
        return ViewerConnection {
            urls: Vec::new(),
            error: status.error.clone(),
        };
    };
    match if_addrs::get_if_addrs() {
        Ok(interfaces) => {
            let mut urls: Vec<_> = interfaces
                .into_iter()
                .filter_map(|interface| match interface.ip() {
                    std::net::IpAddr::V4(ip) if !ip.is_loopback() && !ip.is_unspecified() => {
                        Some(format!("http://{ip}:{port}/"))
                    }
                    _ => None,
                })
                .collect();
            urls.sort();
            urls.dedup();
            ViewerConnection { urls, error: None }
        }
        Err(error) => ViewerConnection {
            urls: Vec::new(),
            error: Some(format!("Could not find network addresses: {error}")),
        },
    }
}

fn snapshot(app: &tauri::AppHandle) -> Result<ViewerSnapshot, String> {
    let persistence = app.state::<PersistenceLock>();
    let _guard = persistence
        .0
        .lock()
        .map_err(|error| format!("Could not lock app data: {error}"))?;
    let data = read_app_data(app)?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("Could not read system clock: {error}"))?
        .as_millis() as f64;
    Ok(viewer_response(data, now))
}

fn viewer_response(data: AppData, now: f64) -> ViewerSnapshot {
    let show_network_viewer_qr = data
        .timer_settings
        .as_ref()
        .map(|settings| settings.show_network_viewer_qr)
        .unwrap_or(true);
    let tournament = viewer_snapshot(data, now);
    ViewerSnapshot {
        tournament,
        show_network_viewer_qr,
    }
}

fn viewer_snapshot(data: AppData, now: f64) -> Option<ViewerTournament> {
    let Some(tournament) = data
        .tournaments
        .into_iter()
        .find(|tournament| Some(&tournament.id) == data.active_tournament_id.as_ref())
    else {
        return None;
    };
    let running = tournament.timer_is_running && tournament.timer_started_at.is_some();
    let elapsed_ms = (tournament.timer_elapsed_ms.unwrap_or(0.0)
        + if running {
            now - tournament.timer_started_at.unwrap_or(now)
        } else {
            0.0
        })
    .max(0.0);
    Some(ViewerTournament {
        id: tournament.id,
        name: tournament.name,
        levels: tournament
            .levels
            .into_iter()
            .map(|level| ViewerLevel {
                duration: level.duration,
                small_blind: level.small_blind,
                big_blind: level.big_blind,
                ante: level.ante,
                is_break: level.is_break,
            })
            .collect(),
        chips: tournament.chips,
        running,
        elapsed_ms,
        buyin_count: tournament.buyins.len(),
        rebuy_count: tournament.rebuys.len(),
        addon_count: tournament.addons.len(),
        bustout_count: tournament.bustouts.len(),
        rebuys_allowed: tournament.rebuys_allowed,
        addons_allowed: tournament.addons_allowed,
        buyin_cost: tournament.buyin_cost,
        rebuy_cost: tournament.rebuy_cost,
        addon_cost: tournament.addon_cost,
        starting_chipstack: tournament.starting_chipstack,
        rebuy_chipstack: tournament.rebuy_chipstack,
        addon_chipstack: tournament.addon_chipstack,
        other_prize_pool: tournament.other_prize_pool,
        other_chipstack: tournament.other_chipstack,
        percent_paid: tournament.percent_paid,
        payout_model: tournament.payout_model,
        allow_payout_override: tournament.allow_payout_override,
        payout_places: tournament.payout_places,
        payouts: tournament.payouts,
        max_players_per_table: tournament.max_players_per_table,
    })
}

fn response(status: u16, content_type: &str, body: Vec<u8>) -> Response<std::io::Cursor<Vec<u8>>> {
    Response::from_data(body)
        .with_status_code(StatusCode(status))
        .with_header(Header::from_bytes("Content-Type", content_type).expect("valid content type"))
        .with_header(Header::from_bytes("Cache-Control", "no-store").expect("valid cache header"))
        .with_header(Header::from_bytes("X-Content-Type-Options", "nosniff").expect("valid header"))
        .with_header(Header::from_bytes(
            "Content-Security-Policy",
            "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
        ).expect("valid security policy"))
}

#[derive(Deserialize)]
struct DirectorUpdate {
    expected: Tournament,
    tournament: Tournament,
}

#[derive(Deserialize)]
struct DirectorVolume {
    expected: Option<TimerSettings>,
    volume: f64,
}

fn director_settings(
    app: &tauri::AppHandle,
    method: &Method,
    body: &[u8],
) -> Result<Vec<u8>, (u16, String)> {
    let persistence = app.state::<PersistenceLock>();
    let _guard = persistence
        .0
        .lock()
        .map_err(|e| (500, format!("Could not lock app data: {e}")))?;
    let mut connection =
        storage::open(&database_path(app).map_err(|e| (500, e))?).map_err(|e| (500, e))?;
    execute_director_settings(&mut connection, method, body)
}

fn execute_director_settings(
    connection: &mut rusqlite::Connection,
    method: &Method,
    body: &[u8],
) -> Result<Vec<u8>, (u16, String)> {
    let current = storage::load(connection)
        .map_err(|e| (500, e))?
        .timer_settings;
    if method == &Method::Get {
        return serde_json::to_vec(&current).map_err(|e| (500, e.to_string()));
    }
    let update: DirectorVolume =
        serde_json::from_slice(body).map_err(|e| (400, format!("Invalid request: {e}")))?;
    if !update.volume.is_finite() || !(0.0..=1.0).contains(&update.volume) {
        return Err((400, "Invalid volume.".into()));
    }
    let mut settings: TimerSettings = match &update.expected {
        Some(settings) => serde_json::from_value(
            serde_json::to_value(settings).map_err(|e| (500, e.to_string()))?,
        )
        .map_err(|e| (500, e.to_string()))?,
        None => serde_json::from_value(serde_json::json!({
            "alarmSound": "triple-ding", "volume": 0.5,
            "spokenAnnouncementEnabled": true, "announcementSpeed": 1.0,
            "countdownWarningSeconds": 10, "countdownWarningSound": "single-ding",
            "countdownWarningSpeechEnabled": false,
            "countdownWarningAnnouncement": "{seconds} seconds remaining.",
            "announcement": "The blinds are now {smallBlind} and {bigBlind}{antePhrase}."
        }))
        .map_err(|e| (500, e.to_string()))?,
    };
    settings.volume = update.volume;
    storage::update_timer_settings(connection, &update.expected, &settings)
        .map_err(|e| (if e.starts_with("Conflict:") { 409 } else { 500 }, e))?;
    serde_json::to_vec(&settings).map_err(|e| (500, e.to_string()))
}

fn director_data(data: AppData) -> TournamentData {
    let active = data.active_tournament_id;
    let tournaments: Vec<_> = data
        .tournaments
        .into_iter()
        .filter(|t| Some(&t.id) == active.as_ref())
        .collect();
    TournamentData {
        active_tournament_id: if tournaments.is_empty() { None } else { active },
        tournaments,
    }
}

fn validate_director_update(update: &DirectorUpdate) -> Result<(), String> {
    let mut before = serde_json::to_value(&update.expected).map_err(|e| e.to_string())?;
    let mut after = serde_json::to_value(&update.tournament).map_err(|e| e.to_string())?;
    for field in [
        "buyins",
        "rebuys",
        "addons",
        "otherPrizePool",
        "otherChipstack",
        "bustouts",
        "payoutPlaces",
        "payouts",
        "maxPlayersPerTable",
        "timerIsRunning",
        "timerStartedAt",
        "timerElapsedMs",
    ] {
        before.as_object_mut().unwrap().remove(field);
        after.as_object_mut().unwrap().remove(field);
    }
    if before != after {
        return Err("Only tournament controls can be changed.".into());
    }
    let t = &update.tournament;
    if [
        t.buyins.len(),
        t.rebuys.len(),
        t.addons.len(),
        t.bustouts.len(),
    ]
    .iter()
    .any(|n| *n > 100_000)
        || (t.bustouts.len() > update.expected.bustouts.len() && t.bustouts.len() > t.buyins.len())
        || t.payout_places > 1000
        || t.payouts.len() > 1000
        || [t.other_prize_pool, t.other_chipstack]
            .iter()
            .any(|n| !n.is_finite() || *n < 0.0)
        || t.payouts.iter().any(|n| !n.is_finite() || *n < 0.0)
        || t.timer_elapsed_ms
            .is_some_and(|n| !n.is_finite() || n < 0.0)
        || t.timer_started_at
            .is_some_and(|n| !n.is_finite() || n < 0.0)
        || t.timer_is_running != t.timer_started_at.is_some()
    {
        return Err("Invalid tournament control values.".into());
    }
    if !t.allow_payout_override
        && (t.payout_places != update.expected.payout_places
            || t.payouts != update.expected.payouts)
    {
        return Err("Payout overrides are disabled.".into());
    }
    Ok(())
}

fn director_response(
    app: &tauri::AppHandle,
    method: &Method,
    body: &[u8],
) -> Result<Vec<u8>, (u16, String)> {
    let persistence = app.state::<PersistenceLock>();
    let _guard = persistence
        .0
        .lock()
        .map_err(|e| (500, format!("Could not lock app data: {e}")))?;
    let mut connection =
        storage::open(&database_path(app).map_err(|e| (500, e))?).map_err(|e| (500, e))?;
    execute_director(&mut connection, method, body)
}

fn execute_director(
    connection: &mut rusqlite::Connection,
    method: &Method,
    body: &[u8],
) -> Result<Vec<u8>, (u16, String)> {
    let data = if method == &Method::Get {
        director_data(storage::load(connection).map_err(|e| (500, e))?)
    } else {
        let update: DirectorUpdate =
            serde_json::from_slice(body).map_err(|e| (400, format!("Invalid request: {e}")))?;
        validate_director_update(&update).map_err(|e| (400, e))?;
        let id = update.expected.id.clone();
        let active = storage::ActiveTournamentChange {
            expected: Some(id.clone()),
            value: Some(id),
        };
        let saved = storage::apply_changes(
            connection,
            &[storage::TournamentChange::Update {
                expected: update.expected,
                tournament: update.tournament,
            }],
            Some(&active),
        )
        .map_err(|e| (if e.starts_with("Conflict:") { 409 } else { 500 }, e))?;
        director_data(AppData {
            tournaments: saved.tournaments,
            active_tournament_id: saved.active_tournament_id,
            timer_settings: None,
        })
    };
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| (500, e.to_string()))?
        .as_millis() as u64;
    serde_json::to_vec(&serde_json::json!({ "data": data, "hostTime": now }))
        .map_err(|e| (500, e.to_string()))
}

fn director_host_allowed(host: &str, port: u16) -> bool {
    let Some((name, port_text)) = host.rsplit_once(':') else {
        return false;
    };
    if port_text.parse::<u16>().ok() != Some(port) {
        return false;
    }
    if name == "localhost" {
        return true;
    }
    let Ok(ip) = name.parse::<Ipv4Addr>() else {
        return false;
    };
    if ip.is_loopback() {
        return true;
    }
    if_addrs::get_if_addrs()
        .map(|interfaces| {
            interfaces
                .iter()
                .any(|i| i.ip() == std::net::IpAddr::V4(ip))
        })
        .unwrap_or(false)
}

fn handle_director_request(
    mut request: tiny_http::Request,
    port: u16,
    run: impl FnOnce(&Method, &[u8]) -> Result<Vec<u8>, (u16, String)>,
) {
    let header = |name: &'static str| {
        request
            .headers()
            .iter()
            .find(|h| h.field.equiv(name))
            .map(|h| h.value.as_str().to_string())
    };
    let host = header("Host").unwrap_or_default();
    let origin = header("Origin");
    let content_type = header("Content-Type").unwrap_or_default();
    let method = request.method().clone();
    let result = if !director_host_allowed(&host, port) {
        response(403, "text/plain; charset=utf-8", b"Invalid host".to_vec())
    } else if method != Method::Get && method != Method::Post {
        response(
            405,
            "text/plain; charset=utf-8",
            b"Method not allowed".to_vec(),
        )
    } else if method == Method::Post
        && (origin.as_deref() != Some(format!("http://{host}").as_str())
            || !content_type
                .split(';')
                .next()
                .unwrap_or("")
                .trim()
                .eq_ignore_ascii_case("application/json"))
    {
        response(
            403,
            "text/plain; charset=utf-8",
            b"Invalid request origin or content type".to_vec(),
        )
    } else {
        use std::io::Read;
        const MAX_BODY: u64 = 32 * 1024 * 1024;
        let mut body = Vec::new();
        let read = request
            .as_reader()
            .take(MAX_BODY + 1)
            .read_to_end(&mut body);
        if read.is_err() || body.len() as u64 > MAX_BODY {
            response(
                413,
                "text/plain; charset=utf-8",
                b"Request is too large or could not be read".to_vec(),
            )
        } else {
            match run(&method, &body) {
                Ok(body) => response(200, "application/json; charset=utf-8", body),
                Err((status, error)) => {
                    if status >= 500 {
                        eprintln!("Tournament director: {error}");
                    }
                    let message = if status >= 500 {
                        "Could not update tournament"
                    } else {
                        &error
                    };
                    response(
                        status,
                        "text/plain; charset=utf-8",
                        message.as_bytes().to_vec(),
                    )
                }
            }
        }
    };
    if let Err(error) = request.respond(result) {
        eprintln!("Tournament director: could not send response: {error}");
    }
}

fn handle_request(
    request: tiny_http::Request,
    load_snapshot: impl FnOnce() -> Result<ViewerSnapshot, String>,
    load_asset: impl FnOnce(&str) -> Option<Vec<u8>>,
) {
    let result = if request.method() != &Method::Get {
        response(
            405,
            "text/plain; charset=utf-8",
            b"Method not allowed".to_vec(),
        )
    } else {
        match request.url().split('?').next().unwrap_or("") {
            "/api/timer" => match load_snapshot().and_then(|value| {
                serde_json::to_vec(&value)
                    .map_err(|error| format!("Could not encode timer: {error}"))
            }) {
                Ok(body) => response(200, "application/json; charset=utf-8", body),
                Err(error) => {
                    eprintln!("Network viewer: {error}");
                    response(
                        500,
                        "text/plain; charset=utf-8",
                        b"Could not load the timer".to_vec(),
                    )
                }
            },
            path => match viewer_asset(path).and_then(|(asset, content_type)| {
                load_asset(asset).map(|body| response(200, content_type, body))
            }) {
                Some(response) => response,
                None => response(404, "text/plain; charset=utf-8", b"Not found".to_vec()),
            },
        }
    };
    if let Err(error) = request.respond(result) {
        eprintln!("Network viewer: could not send response: {error}");
    }
}

fn viewer_asset(path: &str) -> Option<(&str, &'static str)> {
    match path {
        "/" => Some(("network-viewer.html", "text/html; charset=utf-8")),
        "/td" | "/td/" => Some(("td.html", "text/html; charset=utf-8")),
        "/dinkydonk_logo_transparent_edges.png" | "/DinkyDonk_QR_Code.png" | "/qr-code.png" => {
            Some((&path[1..], "image/png"))
        }
        _ => {
            let filename = path.strip_prefix("/assets/")?;
            if filename.is_empty()
                || !filename
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
            {
                return None;
            }
            let content_type = if filename.ends_with(".js") {
                "text/javascript; charset=utf-8"
            } else if filename.ends_with(".css") {
                "text/css; charset=utf-8"
            } else {
                return None;
            };
            Some((&path[1..], content_type))
        }
    }
}

pub fn start(app: tauri::AppHandle) -> ViewerStatus {
    let server = match Server::http((Ipv4Addr::UNSPECIFIED, 60884)) {
        Ok(server) => server,
        Err(error) => {
            return ViewerStatus {
                port: None,
                error: Some(format!("Could not start network viewer: {error}")),
            };
        }
    };
    let Some(address) = server.server_addr().to_ip() else {
        return ViewerStatus {
            port: None,
            error: Some("Could not determine network viewer port.".to_string()),
        };
    };
    let port = address.port();
    match std::thread::Builder::new()
        .name("network-viewer".to_string())
        .spawn(move || {
            for request in server.incoming_requests() {
                let path = request.url().split('?').next().unwrap_or("").to_string();
                if path == "/api/td" || path == "/api/td/settings" {
                    handle_director_request(request, port, |method, body| {
                        if path == "/api/td" {
                            director_response(&app, method, body)
                        } else {
                            director_settings(&app, method, body)
                        }
                    });
                    continue;
                }
                handle_request(
                    request,
                    || snapshot(&app),
                    |path| {
                        let resolver = app.asset_resolver();
                        #[cfg(not(dev))]
                        if !resolver
                            .iter()
                            .any(|(key, _)| key.trim_start_matches('/') == path)
                        {
                            return None;
                        }
                        resolver.get(path.to_string()).map(|asset| asset.bytes)
                    },
                );
            }
            eprintln!("Network viewer stopped unexpectedly.");
        }) {
        Ok(_) => ViewerStatus {
            port: Some(port),
            error: None,
        },
        Err(error) => ViewerStatus {
            port: None,
            error: Some(format!("Could not start network viewer: {error}")),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpStream;

    fn fixture_data() -> AppData {
        let tournament_data = crate::default_tournament_data();
        AppData {
            tournaments: tournament_data.tournaments,
            active_tournament_id: tournament_data.active_tournament_id,
            timer_settings: None,
        }
    }

    #[test]
    fn director_updates_are_conflict_checked_and_limited_to_controls() {
        let mut connection = storage::open(std::path::Path::new(":memory:")).unwrap();
        let initial = fixture_data();
        let expected = serde_json::to_value(&initial.tournaments[0]).unwrap();
        let tournament: Tournament = serde_json::from_value(expected.clone()).unwrap();
        let id = tournament.id.clone();
        storage::apply_changes(
            &mut connection,
            &[storage::TournamentChange::Create { tournament }],
            Some(&storage::ActiveTournamentChange {
                expected: None,
                value: Some(id),
            }),
        )
        .unwrap();

        let mut updated = expected.clone();
        updated["otherChipstack"] = 500.into();
        let body =
            serde_json::to_vec(&serde_json::json!({ "expected": expected, "tournament": updated }))
                .unwrap();
        let result = execute_director(&mut connection, &Method::Post, &body).unwrap();
        let saved: serde_json::Value = serde_json::from_slice(&result).unwrap();
        assert_eq!(saved["data"]["tournaments"][0]["otherChipstack"], 500.0);
        assert_eq!(
            execute_director(&mut connection, &Method::Post, &body)
                .unwrap_err()
                .0,
            409
        );

        let current = saved["data"]["tournaments"][0].clone();
        let mut changed_name = current.clone();
        changed_name["name"] = "Not a control".into();
        let body = serde_json::to_vec(
            &serde_json::json!({ "expected": current, "tournament": changed_name }),
        )
        .unwrap();
        assert_eq!(
            execute_director(&mut connection, &Method::Post, &body)
                .unwrap_err()
                .0,
            400
        );
        assert_eq!(
            storage::load(&mut connection).unwrap().tournaments[0].name,
            initial.tournaments[0].name
        );
        let current = saved["data"]["tournaments"][0].clone();
        let id = current["id"].as_str().unwrap().to_string();
        storage::apply_changes(
            &mut connection,
            &[],
            Some(&storage::ActiveTournamentChange {
                expected: Some(id),
                value: None,
            }),
        )
        .unwrap();
        let mut next = current.clone();
        next["otherChipstack"] = 600.into();
        let body =
            serde_json::to_vec(&serde_json::json!({ "expected": current, "tournament": next }))
                .unwrap();
        assert_eq!(
            execute_director(&mut connection, &Method::Post, &body)
                .unwrap_err()
                .0,
            409
        );
        assert_eq!(
            storage::load(&mut connection).unwrap().tournaments[0].other_chipstack,
            500.0
        );
    }

    #[test]
    fn director_accepts_integer_participant_and_bustout_timestamps() {
        let mut connection = storage::open(std::path::Path::new(":memory:")).unwrap();
        let initial = fixture_data();
        let expected = serde_json::to_value(&initial.tournaments[0]).unwrap();
        let id = initial.tournaments[0].id.clone();
        let tournament: Tournament = serde_json::from_value(expected.clone()).unwrap();
        storage::apply_changes(
            &mut connection,
            &[storage::TournamentChange::Create { tournament }],
            Some(&storage::ActiveTournamentChange {
                expected: None,
                value: Some(id),
            }),
        )
        .unwrap();

        let mut next = expected.clone();
        next["buyins"] = serde_json::json!([
            { "name": "Unnamed", "timestamp": 1234.5 },
            { "name": "Unnamed", "timestamp": 1234.5 },
            { "name": "Unnamed", "timestamp": 1234.5 }
        ]);
        let request = |expected: &serde_json::Value, tournament: &serde_json::Value| {
            serde_json::to_vec(
                &serde_json::json!({ "expected": expected, "tournament": tournament }),
            )
            .unwrap()
        };
        assert_eq!(
            execute_director(&mut connection, &Method::Post, &request(&expected, &next))
                .unwrap_err()
                .0,
            400
        );
        for participant in next["buyins"].as_array_mut().unwrap() {
            participant["timestamp"] = 1235.into();
        }
        let saved =
            execute_director(&mut connection, &Method::Post, &request(&expected, &next)).unwrap();
        let saved: serde_json::Value = serde_json::from_slice(&saved).unwrap();
        let expected = &saved["data"]["tournaments"][0];
        let mut next = expected.clone();
        next["bustouts"] = serde_json::json!([{
            "name": "Unnamed", "timestamp": 1236, "blinds": null,
            "elapsedSeconds": 0, "place": 3, "pointsEarned": null, "payout": null
        }]);
        execute_director(&mut connection, &Method::Post, &request(expected, &next)).unwrap();
        let stored = storage::load(&mut connection).unwrap();
        assert_eq!(stored.tournaments[0].buyins.len(), 3);
        assert_eq!(stored.tournaments[0].bustouts.len(), 1);
        assert_eq!(stored.tournaments[0].bustouts[0].timestamp, 1236);
    }

    #[test]
    fn director_requests_require_a_local_host_and_same_origin_json() {
        let server = Server::http((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let address = server.server_addr().to_ip().unwrap();
        let worker = std::thread::spawn(move || {
            for _ in 0..5 {
                let request = server.recv().unwrap();
                handle_director_request(request, address.port(), |_, _| Ok(b"{}".to_vec()));
            }
        });
        fn request(address: std::net::SocketAddr, method: &str, host: &str, extra: &str) -> String {
            let mut stream = TcpStream::connect(address).unwrap();
            stream
                .set_read_timeout(Some(std::time::Duration::from_secs(5)))
                .unwrap();
            write!(stream, "{method} /api/td HTTP/1.1\r\nHost: {host}\r\n{extra}Connection: close\r\nContent-Length: 0\r\n\r\n").unwrap();
            let mut response = String::new();
            stream.read_to_string(&mut response).unwrap();
            response
        }
        let host = format!("127.0.0.1:{}", address.port());
        assert!(request(address, "GET", &host, "").starts_with("HTTP/1.1 200"));
        assert!(
            request(
                address,
                "GET",
                &format!("attacker.test:{}", address.port()),
                ""
            )
            .starts_with("HTTP/1.1 403")
        );
        assert!(
            request(
                address,
                "POST",
                &host,
                "Origin: http://attacker.test\r\nContent-Type: application/json\r\n"
            )
            .starts_with("HTTP/1.1 403")
        );
        assert!(
            request(
                address,
                "POST",
                &host,
                &format!("Origin: http://{host}\r\nContent-Type: text/plain\r\n")
            )
            .starts_with("HTTP/1.1 403")
        );
        assert!(
            request(
                address,
                "POST",
                &host,
                &format!("Origin: http://{host}\r\nContent-Type: application/json\r\n")
            )
            .starts_with("HTTP/1.1 200")
        );
        worker.join().unwrap();
    }

    #[test]
    fn director_page_is_routable() {
        assert_eq!(viewer_asset("/td").unwrap().0, "td.html");
        assert_eq!(viewer_asset("/td/").unwrap().0, "td.html");
    }

    #[test]
    fn director_volume_checks_saved_settings_and_preserves_other_fields() {
        let mut connection = storage::open(std::path::Path::new(":memory:")).unwrap();
        let body = br#"{"expected":null,"volume":0.8}"#;
        let saved = execute_director_settings(&mut connection, &Method::Post, body).unwrap();
        let settings: serde_json::Value = serde_json::from_slice(&saved).unwrap();
        assert_eq!(settings["volume"], 0.8);
        assert_eq!(settings["alarmSound"], "triple-ding");
        assert_eq!(
            execute_director_settings(&mut connection, &Method::Post, body)
                .unwrap_err()
                .0,
            409
        );
        let bad =
            serde_json::to_vec(&serde_json::json!({ "expected": settings, "volume": 2 })).unwrap();
        assert_eq!(
            execute_director_settings(&mut connection, &Method::Post, &bad)
                .unwrap_err()
                .0,
            400
        );
        assert_eq!(
            storage::load(&mut connection)
                .unwrap()
                .timer_settings
                .unwrap()
                .volume,
            0.8
        );
    }

    #[test]
    fn snapshot_exposes_only_active_timer_and_uses_host_clock() {
        let mut data = fixture_data();
        data.tournaments[0].timer_elapsed_ms = Some(2_000.0);
        data.tournaments[0].timer_started_at = Some(10_000.0);
        data.tournaments[0].timer_is_running = true;
        data.tournaments[0]
            .buyins
            .push(crate::TournamentParticipant {
                name: "private participant".to_string(),
                timestamp: 123,
            });
        let snapshot = viewer_snapshot(data, 13_000.0).unwrap();
        assert_eq!(snapshot.elapsed_ms, 5_000.0);
        assert!(snapshot.running);
        let json = serde_json::to_value(snapshot).unwrap();
        let fields = json.as_object().unwrap();
        assert_eq!(fields["buyinCount"], 1);
        assert!(!fields["chips"].as_array().unwrap().is_empty());
        assert!(!fields.contains_key("buyins"));
        assert!(!json.to_string().contains("private participant"));
        assert!(!json.to_string().contains("timestamp"));

        let mut data = fixture_data();
        data.tournaments[0].timer_elapsed_ms = Some(2_000.0);
        data.tournaments[0].timer_started_at = Some(10_000.0);
        data.tournaments[0].timer_is_running = false;
        let snapshot = viewer_snapshot(data, 13_000.0).unwrap();
        assert_eq!(snapshot.elapsed_ms, 2_000.0);
        assert!(!snapshot.running);

        let mut data = fixture_data();
        data.active_tournament_id = None;
        assert!(viewer_snapshot(data, 13_000.0).is_none());
    }

    #[test]
    fn http_server_only_serves_read_only_viewer_routes() {
        let server = Server::http((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let address = server.server_addr().to_ip().unwrap();
        let worker = std::thread::spawn(move || {
            for index in 0..9 {
                let request = server.recv().unwrap();
                handle_request(
                    request,
                    || match index {
                        6 => Ok(viewer_response(fixture_data(), 13_000.0)),
                        7 => {
                            let mut data = fixture_data();
                            data.active_tournament_id = None;
                            data.timer_settings = Some(
                                serde_json::from_value(serde_json::json!({
                                    "showNetworkViewerQr": false
                                }))
                                .unwrap(),
                            );
                            Ok(viewer_response(data, 13_000.0))
                        }
                        _ => Err("private file path".to_string()),
                    },
                    |path| match path {
                        "network-viewer.html" => Some(b"viewer entry".to_vec()),
                        "assets/viewer-abc.js" | "assets/viewer-abc.css" | "qr-code.png" => {
                            Some(Vec::new())
                        }
                        _ => None,
                    },
                );
            }
        });
        fn request(address: std::net::SocketAddr, method: &str, path: &str) -> String {
            let mut stream = TcpStream::connect(address).unwrap();
            stream
                .set_read_timeout(Some(std::time::Duration::from_secs(5)))
                .unwrap();
            write!(
                stream,
                "{method} {path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n"
            )
            .unwrap();
            let mut response = String::new();
            stream.read_to_string(&mut response).unwrap();
            response
        }
        let html = request(address, "GET", "/");
        assert!(html.starts_with("HTTP/1.1 200"));
        assert!(html.contains("viewer entry"));
        assert!(
            html.to_ascii_lowercase()
                .contains("cache-control: no-store")
        );
        assert!(request(address, "GET", "/assets/viewer-abc.js").starts_with("HTTP/1.1 200"));
        assert!(request(address, "GET", "/assets/viewer-abc.css").starts_with("HTTP/1.1 200"));
        assert!(request(address, "GET", "/qr-code.png").starts_with("HTTP/1.1 200"));
        assert!(request(address, "POST", "/api/timer").starts_with("HTTP/1.1 405"));
        assert!(request(address, "GET", "/assets/../settings.json").starts_with("HTTP/1.1 404"));
        let success = request(address, "GET", "/api/timer");
        assert!(success.starts_with("HTTP/1.1 200"));
        assert!(success.contains("\"name\":\"DinkyDonk Default Tournament\""));
        assert!(success.contains("\"showNetworkViewerQr\":true"));
        assert!(!success.contains("buyins"));
        let empty = request(address, "GET", "/api/timer");
        assert!(empty.starts_with("HTTP/1.1 200"));
        assert!(empty.contains("\"tournament\":null"));
        assert!(empty.contains("\"showNetworkViewerQr\":false"));
        let error = request(address, "GET", "/api/timer");
        assert!(error.starts_with("HTTP/1.1 500"));
        assert!(!error.contains("private file path"));
        worker.join().unwrap();
    }

    #[cfg(not(dev))]
    #[test]
    fn packaged_viewer_and_its_referenced_assets_are_embedded() {
        let context: tauri::Context<tauri::Wry> = tauri::generate_context!();
        let assets = context.assets();
        for page in ["network-viewer.html", "td.html"] {
            let html = assets
                .get(&page.into())
                .expect("network HTML must be embedded");
            let html = std::str::from_utf8(&html).unwrap();
            let paths: Vec<_> = html
                .split('"')
                .filter(|part| part.starts_with("/assets/"))
                .collect();
            assert!(paths.iter().any(|path| path.ends_with(".js")));
            assert!(paths.iter().any(|path| path.ends_with(".css")));
            for path in paths {
                let (asset, _) = viewer_asset(path).expect("network asset must be routable");
                assert!(assets.get(&asset.into()).is_some(), "missing {asset}");
            }
        }
        for path in [
            "/dinkydonk_logo_transparent_edges.png",
            "/DinkyDonk_QR_Code.png",
            "/qr-code.png",
        ] {
            let (asset, _) = viewer_asset(path).expect("viewer asset must be routable");
            assert!(assets.get(&asset.into()).is_some(), "missing {asset}");
            assert!(
                assets
                    .iter()
                    .any(|(key, _)| key.trim_start_matches('/') == asset)
            );
        }
    }
}
