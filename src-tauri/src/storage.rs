use std::collections::HashSet;
use std::path::Path;
use std::time::Duration;

use rusqlite::{Connection, TransactionBehavior, params};
use serde::Deserialize;

use crate::{AppData, TimerSettings, Tournament, TournamentData, apply_bustout_payouts};

pub fn open(path: &Path) -> Result<Connection, String> {
    let mut connection = Connection::open(path)
        .map_err(|error| format!("Could not open database {}: {error}", path.display()))?;
    connection
        .busy_timeout(Duration::from_secs(5))
        .map_err(|error| format!("Could not configure database timeout: {error}"))?;
    let version: i64 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|error| format!("Could not read database version: {error}"))?;
    if version == 0 {
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|error| format!("Could not initialize database: {error}"))?;
        let version: i64 = transaction
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .map_err(|error| format!("Could not read database version: {error}"))?;
        if version == 0 {
            transaction
                .execute_batch(
                    "CREATE TABLE tournaments (
                    id TEXT PRIMARY KEY NOT NULL,
                    position INTEGER NOT NULL,
                    data TEXT NOT NULL
                );
                CREATE TABLE app_state (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    active_tournament_id TEXT,
                    timer_settings TEXT
                );
                INSERT INTO app_state (id) VALUES (1);
                PRAGMA user_version = 1;",
                )
                .map_err(|error| format!("Could not initialize database: {error}"))?;
        } else if version != 1 {
            return Err(format!("Unsupported database version: {version}"));
        }
        transaction
            .commit()
            .map_err(|error| format!("Could not initialize database: {error}"))?;
    } else if version != 1 {
        return Err(format!("Unsupported database version: {version}"));
    }
    Ok(connection)
}

fn decode_timer_settings(settings: Option<String>) -> Result<Option<TimerSettings>, String> {
    settings
        .map(|json| {
            serde_json::from_str(&json)
                .map_err(|error| format!("Could not decode timer settings: {error}"))
        })
        .transpose()
}

fn read_data(connection: &Connection) -> Result<AppData, String> {
    let (active_tournament_id, settings): (Option<String>, Option<String>) = connection
        .query_row(
            "SELECT active_tournament_id, timer_settings FROM app_state WHERE id = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|error| format!("Could not read database settings: {error}"))?;
    let mut statement = connection
        .prepare("SELECT id, data FROM tournaments ORDER BY position")
        .map_err(|error| format!("Could not read tournaments: {error}"))?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|error| format!("Could not read tournaments: {error}"))?;
    let mut tournaments = Vec::new();
    for row in rows {
        let (id, json) = row.map_err(|error| format!("Could not read tournament: {error}"))?;
        let tournament: Tournament = serde_json::from_str(&json)
            .map_err(|error| format!("Could not decode tournament {id}: {error}"))?;
        if tournament.id != id {
            return Err(format!(
                "Tournament ID does not match database record: {id}"
            ));
        }
        tournaments.push(tournament);
    }
    let timer_settings = decode_timer_settings(settings)?;
    Ok(AppData {
        tournaments,
        active_tournament_id,
        timer_settings,
    })
}

pub fn load(connection: &mut Connection) -> Result<AppData, String> {
    let transaction = connection
        .transaction()
        .map_err(|error| format!("Could not read database: {error}"))?;
    let data = read_data(&transaction)?;
    transaction
        .commit()
        .map_err(|error| format!("Could not finish database read: {error}"))?;
    Ok(data)
}

fn write_tournaments(connection: &Connection, data: &TournamentData) -> Result<(), String> {
    let mut ids = HashSet::new();
    for (position, tournament) in data.tournaments.iter().enumerate() {
        if !ids.insert(&tournament.id) {
            return Err(format!("Duplicate tournament ID: {}", tournament.id));
        }
        let json = serde_json::to_string(tournament)
            .map_err(|error| format!("Could not encode tournament: {error}"))?;
        connection
            .execute(
                "INSERT INTO tournaments (id, position, data) VALUES (?1, ?2, ?3)
             ON CONFLICT(id) DO UPDATE SET position = excluded.position, data = excluded.data
             WHERE position != excluded.position OR data != excluded.data",
                params![tournament.id, position as i64, json],
            )
            .map_err(|error| format!("Could not update tournament: {error}"))?;
    }
    let stored_ids = {
        let mut statement = connection
            .prepare("SELECT id FROM tournaments")
            .map_err(|error| format!("Could not inspect tournaments: {error}"))?;
        statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|error| format!("Could not inspect tournaments: {error}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("Could not inspect tournament: {error}"))?
    };
    for id in stored_ids {
        if !ids.contains(&id) {
            connection
                .execute("DELETE FROM tournaments WHERE id = ?1", params![id])
                .map_err(|error| format!("Could not delete tournament: {error}"))?;
        }
    }
    let active = data.active_tournament_id.as_ref().filter(|id| {
        data.tournaments
            .iter()
            .any(|tournament| &tournament.id == *id)
    });
    let updated = connection
        .execute(
            "UPDATE app_state SET active_tournament_id = ?1 WHERE id = 1",
            params![active],
        )
        .map_err(|error| format!("Could not update active tournament: {error}"))?;
    if updated != 1 {
        return Err("Database app state is missing.".to_string());
    }
    Ok(())
}

#[cfg(test)]
fn save_tournaments(connection: &mut Connection, data: &TournamentData) -> Result<(), String> {
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("Could not start tournament update: {error}"))?;
    write_tournaments(&transaction, data)?;
    transaction
        .commit()
        .map_err(|error| format!("Could not save tournaments: {error}"))
}

#[cfg(test)]
fn save_timer_settings(connection: &Connection, settings: &TimerSettings) -> Result<(), String> {
    let json = serde_json::to_string(settings)
        .map_err(|error| format!("Could not encode timer settings: {error}"))?;
    let updated = connection
        .execute(
            "UPDATE app_state SET timer_settings = ?1 WHERE id = 1",
            params![json],
        )
        .map_err(|error| format!("Could not save timer settings: {error}"))?;
    if updated != 1 {
        return Err("Database app state is missing.".to_string());
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum TournamentChange {
    Create {
        tournament: Tournament,
    },
    Update {
        expected: Tournament,
        tournament: Tournament,
    },
    Delete {
        expected: Tournament,
    },
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveTournamentChange {
    pub(crate) expected: Option<String>,
    pub(crate) value: Option<String>,
}

fn same_value<T: serde::Serialize>(left: &T, right: &T) -> Result<bool, String> {
    let left = serde_json::to_value(left)
        .map_err(|error| format!("Could not compare saved data: {error}"))?;
    let right = serde_json::to_value(right)
        .map_err(|error| format!("Could not compare saved data: {error}"))?;
    Ok(left == right)
}

pub fn apply_changes(
    connection: &mut Connection,
    changes: &[TournamentChange],
    active_change: Option<&ActiveTournamentChange>,
) -> Result<TournamentData, String> {
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("Could not start tournament update: {error}"))?;
    let data = read_data(&transaction)?;
    if let Some(active) = active_change {
        if active.expected != data.active_tournament_id {
            return Err("Conflict: the active tournament changed elsewhere.".to_string());
        }
    }

    let mut ids = HashSet::new();
    for change in changes {
        let id = match change {
            TournamentChange::Create { tournament } => &tournament.id,
            TournamentChange::Update {
                expected,
                tournament,
            } => {
                if expected.id != tournament.id {
                    return Err("A tournament update cannot change its ID.".to_string());
                }
                &expected.id
            }
            TournamentChange::Delete { expected } => &expected.id,
        };
        if !ids.insert(id) {
            return Err(format!("Duplicate tournament change: {id}"));
        }
        let current = data
            .tournaments
            .iter()
            .find(|tournament| &tournament.id == id);
        match change {
            TournamentChange::Create { tournament } => {
                if current.is_some() {
                    return Err(format!("Conflict: tournament {id} already exists."));
                }
                let json = serde_json::to_string(tournament)
                    .map_err(|error| format!("Could not encode tournament: {error}"))?;
                transaction
                    .execute(
                        "INSERT INTO tournaments (id, position, data)
                     VALUES (?1, (SELECT COALESCE(MAX(position), -1) + 1 FROM tournaments), ?2)",
                        params![id, json],
                    )
                    .map_err(|error| format!("Could not create tournament: {error}"))?;
            }
            TournamentChange::Update {
                expected,
                tournament,
            } => {
                if !current
                    .map(|current| same_value(current, expected))
                    .transpose()?
                    .unwrap_or(false)
                {
                    return Err(format!("Conflict: tournament {id} changed or was deleted."));
                }
                let json = serde_json::to_string(tournament)
                    .map_err(|error| format!("Could not encode tournament: {error}"))?;
                transaction
                    .execute(
                        "UPDATE tournaments SET data = ?1 WHERE id = ?2",
                        params![json, id],
                    )
                    .map_err(|error| format!("Could not update tournament: {error}"))?;
            }
            TournamentChange::Delete { expected } => {
                if !current
                    .map(|current| same_value(current, expected))
                    .transpose()?
                    .unwrap_or(false)
                {
                    return Err(format!("Conflict: tournament {id} changed or was deleted."));
                }
                transaction
                    .execute("DELETE FROM tournaments WHERE id = ?1", params![id])
                    .map_err(|error| format!("Could not delete tournament: {error}"))?;
                transaction.execute(
                    "UPDATE app_state SET active_tournament_id = NULL WHERE id = 1 AND active_tournament_id = ?1",
                    params![id],
                ).map_err(|error| format!("Could not clear active tournament: {error}"))?;
            }
        }
    }

    if let Some(active) = active_change {
        if let Some(id) = &active.value {
            let exists: bool = transaction
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM tournaments WHERE id = ?1)",
                    params![id],
                    |row| row.get(0),
                )
                .map_err(|error| format!("Could not check active tournament: {error}"))?;
            if !exists {
                return Err("Conflict: the selected tournament no longer exists.".to_string());
            }
        }
        let updated = transaction
            .execute(
                "UPDATE app_state SET active_tournament_id = ?1 WHERE id = 1",
                params![active.value],
            )
            .map_err(|error| format!("Could not update active tournament: {error}"))?;
        if updated != 1 {
            return Err("Database app state is missing.".to_string());
        }
    }
    let saved = read_data(&transaction)?;
    transaction
        .commit()
        .map_err(|error| format!("Could not save tournament changes: {error}"))?;
    Ok(TournamentData {
        tournaments: saved.tournaments,
        active_tournament_id: saved.active_tournament_id,
    })
}

pub fn update_timer_settings(
    connection: &mut Connection,
    expected: &Option<TimerSettings>,
    settings: &TimerSettings,
) -> Result<(), String> {
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("Could not start timer settings update: {error}"))?;
    let current = transaction
        .query_row(
            "SELECT timer_settings FROM app_state WHERE id = 1",
            [],
            |row| row.get::<_, Option<String>>(0),
        )
        .map_err(|error| format!("Could not read timer settings: {error}"))?;
    let current = decode_timer_settings(current)?;
    if !same_value(&current, expected)? {
        return Err("Conflict: timer settings changed elsewhere.".to_string());
    }
    let json = serde_json::to_string(settings)
        .map_err(|error| format!("Could not encode timer settings: {error}"))?;
    let updated = transaction
        .execute(
            "UPDATE app_state SET timer_settings = ?1 WHERE id = 1",
            params![json],
        )
        .map_err(|error| format!("Could not save timer settings: {error}"))?;
    if updated != 1 {
        return Err("Database app state is missing.".to_string());
    }
    transaction
        .commit()
        .map_err(|error| format!("Could not save timer settings: {error}"))
}

pub fn reconcile(
    connection: &mut Connection,
    expected: &[Tournament],
    payouts: &[Vec<Option<f64>>],
) -> Result<bool, String> {
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("Could not start payout update: {error}"))?;
    let mut data = read_data(&transaction)?;
    if !apply_bustout_payouts(&mut data, expected, payouts)? {
        return Ok(false);
    }
    write_tournaments(
        &transaction,
        &TournamentData {
            tournaments: data.tournaments,
            active_tournament_id: data.active_tournament_id,
        },
    )?;
    transaction
        .commit()
        .map_err(|error| format!("Could not save payout update: {error}"))?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{DEFAULT_TOURNAMENT_ID, default_tournament_data};

    fn settings() -> TimerSettings {
        TimerSettings {
            alarm_sound: "single-ding".to_string(),
            volume: 0.5,
            spoken_announcement_enabled: false,
            announcement_speed: 1.0,
            announcement: "Level changed.".to_string(),
            countdown_warning_seconds: 10,
            countdown_warning_sound: "single-ding".to_string(),
            countdown_warning_speech_enabled: false,
            countdown_warning_announcement: "{seconds} seconds remaining.".to_string(),
        }
    }

    fn copy<T: serde::Serialize + serde::de::DeserializeOwned>(value: &T) -> T {
        serde_json::from_value(serde_json::to_value(value).unwrap()).unwrap()
    }

    #[test]
    fn independent_changes_preserve_other_tournaments_and_new_records() {
        let mut connection = open(Path::new(":memory:")).unwrap();
        let mut first = default_tournament_data();
        let mut second: Tournament = copy(&first.tournaments[0]);
        second.id = "second".to_string();
        first.tournaments.push(second);
        save_tournaments(&mut connection, &first).unwrap();
        let stale = load(&mut connection).unwrap();
        let mut updated_first: Tournament = copy(&stale.tournaments[0]);
        updated_first.name = "Changed first".to_string();
        apply_changes(
            &mut connection,
            &[TournamentChange::Update {
                expected: copy(&stale.tournaments[0]),
                tournament: updated_first,
            }],
            None,
        )
        .unwrap();
        let mut updated_second: Tournament = copy(&stale.tournaments[1]);
        updated_second.name = "Changed second".to_string();
        let mut created: Tournament = copy(&stale.tournaments[0]);
        created.id = "created".to_string();
        apply_changes(
            &mut connection,
            &[
                TournamentChange::Update {
                    expected: copy(&stale.tournaments[1]),
                    tournament: updated_second,
                },
                TournamentChange::Create {
                    tournament: created,
                },
            ],
            None,
        )
        .unwrap();
        let saved = load(&mut connection).unwrap();
        assert_eq!(
            saved
                .tournaments
                .iter()
                .map(|t| t.name.as_str())
                .collect::<Vec<_>>(),
            vec![
                "Changed first",
                "Changed second",
                stale.tournaments[0].name.as_str()
            ]
        );
        assert_eq!(saved.tournaments[2].id, "created");
    }

    #[test]
    fn frontend_change_payload_updates_only_the_selected_record() {
        let mut connection = open(Path::new(":memory:")).unwrap();
        let initial = default_tournament_data();
        save_tournaments(&mut connection, &initial).unwrap();
        let mut edited = serde_json::to_value(&initial.tournaments[0]).unwrap();
        edited["name"] = serde_json::json!("Updated from frontend");
        let change: TournamentChange = serde_json::from_value(serde_json::json!({
            "kind": "update",
            "expected": initial.tournaments[0],
            "tournament": edited
        }))
        .unwrap();
        let saved = apply_changes(&mut connection, &[change], None).unwrap();
        assert_eq!(saved.tournaments[0].name, "Updated from frontend");
    }

    #[test]
    fn stale_delete_rolls_back_other_changes_and_active_selection() {
        let mut connection = open(Path::new(":memory:")).unwrap();
        let mut initial = default_tournament_data();
        let mut second: Tournament = copy(&initial.tournaments[0]);
        second.id = "second".to_string();
        initial.tournaments.push(second);
        save_tournaments(&mut connection, &initial).unwrap();
        let stale = load(&mut connection).unwrap();
        let mut changed: Tournament = copy(&stale.tournaments[0]);
        changed.name = "Concurrent change".to_string();
        apply_changes(
            &mut connection,
            &[TournamentChange::Update {
                expected: copy(&stale.tournaments[0]),
                tournament: changed,
            }],
            None,
        )
        .unwrap();
        let mut other: Tournament = copy(&stale.tournaments[1]);
        other.name = "Must roll back".to_string();
        let result = apply_changes(
            &mut connection,
            &[
                TournamentChange::Update {
                    expected: copy(&stale.tournaments[1]),
                    tournament: other,
                },
                TournamentChange::Delete {
                    expected: copy(&stale.tournaments[0]),
                },
            ],
            Some(&ActiveTournamentChange {
                expected: Some(DEFAULT_TOURNAMENT_ID.to_string()),
                value: Some("second".to_string()),
            }),
        );
        assert!(result.unwrap_err().contains("Conflict:"));
        let saved = load(&mut connection).unwrap();
        assert_eq!(saved.tournaments[0].name, "Concurrent change");
        assert_eq!(saved.tournaments[1].name, stale.tournaments[1].name);
        assert_eq!(
            saved.active_tournament_id.as_deref(),
            Some(DEFAULT_TOURNAMENT_ID)
        );
    }

    #[test]
    fn selection_and_deletion_validate_the_latest_state() {
        let mut connection = open(Path::new(":memory:")).unwrap();
        let initial = default_tournament_data();
        save_tournaments(&mut connection, &initial).unwrap();
        let invalid = apply_changes(
            &mut connection,
            &[TournamentChange::Delete {
                expected: copy(&initial.tournaments[0]),
            }],
            Some(&ActiveTournamentChange {
                expected: initial.active_tournament_id.clone(),
                value: Some("missing".to_string()),
            }),
        );
        assert!(invalid.unwrap_err().contains("Conflict:"));
        assert_eq!(load(&mut connection).unwrap().tournaments.len(), 1);
        apply_changes(
            &mut connection,
            &[TournamentChange::Delete {
                expected: copy(&initial.tournaments[0]),
            }],
            None,
        )
        .unwrap();
        let saved = load(&mut connection).unwrap();
        assert!(saved.tournaments.is_empty());
        assert!(saved.active_tournament_id.is_none());
    }

    #[test]
    fn timer_update_rejects_a_changed_active_tournament() {
        let mut connection = open(Path::new(":memory:")).unwrap();
        let mut initial = default_tournament_data();
        let mut other: Tournament = copy(&initial.tournaments[0]);
        other.id = "other".to_string();
        initial.tournaments.push(other);
        save_tournaments(&mut connection, &initial).unwrap();
        apply_changes(
            &mut connection,
            &[],
            Some(&ActiveTournamentChange {
                expected: initial.active_tournament_id.clone(),
                value: Some("other".to_string()),
            }),
        )
        .unwrap();
        let mut started: Tournament = copy(&initial.tournaments[0]);
        started.timer_is_running = true;
        started.timer_started_at = Some(1234.0);
        let result = apply_changes(
            &mut connection,
            &[TournamentChange::Update {
                expected: copy(&initial.tournaments[0]),
                tournament: started,
            }],
            Some(&ActiveTournamentChange {
                expected: initial.active_tournament_id.clone(),
                value: initial.active_tournament_id.clone(),
            }),
        );
        assert!(result.unwrap_err().contains("Conflict:"));
        let saved = load(&mut connection).unwrap();
        assert!(!saved.tournaments[0].timer_is_running);
        assert_eq!(saved.active_tournament_id.as_deref(), Some("other"));
    }

    #[test]
    fn stale_timer_settings_do_not_replace_newer_settings() {
        let mut connection = open(Path::new(":memory:")).unwrap();
        let first = settings();
        update_timer_settings(&mut connection, &None, &first).unwrap();
        let mut changed = settings();
        changed.volume = 0.8;
        assert!(
            update_timer_settings(&mut connection, &None, &changed)
                .unwrap_err()
                .contains("Conflict:")
        );
        assert_eq!(
            load(&mut connection)
                .unwrap()
                .timer_settings
                .unwrap()
                .volume,
            0.5
        );
        update_timer_settings(&mut connection, &Some(first), &changed).unwrap();
        assert_eq!(
            load(&mut connection)
                .unwrap()
                .timer_settings
                .unwrap()
                .volume,
            0.8
        );
    }

    #[test]
    fn simultaneous_edits_of_the_same_tournament_cannot_overwrite_each_other() {
        let directory = std::env::temp_dir().join(format!(
            "dinkydonk-crud-race-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&directory).unwrap();
        let path = directory.join("DinkyDonk.sqlite3");
        let mut connection = open(&path).unwrap();
        let initial = default_tournament_data();
        save_tournaments(&mut connection, &initial).unwrap();
        drop(connection);
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
        let handles: Vec<_> = ["First", "Second"]
            .into_iter()
            .map(|name| {
                let path = path.clone();
                let barrier = barrier.clone();
                let expected: Tournament = copy(&initial.tournaments[0]);
                let mut tournament: Tournament = copy(&expected);
                tournament.name = name.to_string();
                std::thread::spawn(move || {
                    let mut connection = open(&path).unwrap();
                    barrier.wait();
                    apply_changes(
                        &mut connection,
                        &[TournamentChange::Update {
                            expected,
                            tournament,
                        }],
                        None,
                    )
                    .map(|_| ())
                })
            })
            .collect();
        let results: Vec<_> = handles
            .into_iter()
            .map(|handle| handle.join().unwrap())
            .collect();
        assert_eq!(results.iter().filter(|result| result.is_ok()).count(), 1);
        assert!(
            results
                .iter()
                .any(|result| matches!(result, Err(error) if error.contains("Conflict:")))
        );
        let mut connection = open(&path).unwrap();
        let name = load(&mut connection).unwrap().tournaments.remove(0).name;
        assert!(name == "First" || name == "Second");
        drop(connection);
        std::fs::remove_file(path).unwrap();
        std::fs::remove_dir(directory).unwrap();
    }

    #[test]
    fn database_starts_fresh_and_persists_without_touching_json() {
        let directory = std::env::temp_dir().join(format!(
            "dinkydonk-sqlite-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&directory).unwrap();
        let legacy = directory.join("DinkyDonk.JSON");
        let path = directory.join("DinkyDonk.sqlite3");
        std::fs::write(&legacy, "existing JSON").unwrap();

        let mut connection = open(&path).unwrap();
        let empty = load(&mut connection).unwrap();
        assert!(empty.tournaments.is_empty());
        assert!(empty.active_tournament_id.is_none());
        assert!(empty.timer_settings.is_none());
        save_tournaments(&mut connection, &default_tournament_data()).unwrap();
        save_timer_settings(&connection, &settings()).unwrap();
        drop(connection);

        let mut connection = open(&path).unwrap();
        let saved = load(&mut connection).unwrap();
        assert_eq!(saved.tournaments.len(), 1);
        assert_eq!(
            saved.active_tournament_id.as_deref(),
            Some(DEFAULT_TOURNAMENT_ID)
        );
        assert_eq!(saved.timer_settings.unwrap().volume, 0.5);
        assert_eq!(std::fs::read_to_string(&legacy).unwrap(), "existing JSON");
        drop(connection);
        std::fs::remove_file(path).unwrap();
        std::fs::remove_file(legacy).unwrap();
        std::fs::remove_dir(directory).unwrap();
    }

    #[test]
    fn failed_tournament_transaction_does_not_change_existing_data() {
        let mut connection = open(Path::new(":memory:")).unwrap();
        let original = default_tournament_data();
        save_tournaments(&mut connection, &original).unwrap();
        save_timer_settings(&connection, &settings()).unwrap();
        let mut duplicate: Tournament =
            serde_json::from_value(serde_json::to_value(&original.tournaments[0]).unwrap())
                .unwrap();
        duplicate.name = "Should be rolled back".to_string();
        let invalid = TournamentData {
            tournaments: vec![
                duplicate,
                serde_json::from_value(serde_json::to_value(&original.tournaments[0]).unwrap())
                    .unwrap(),
            ],
            active_tournament_id: None,
        };
        assert!(save_tournaments(&mut connection, &invalid).is_err());
        let saved = load(&mut connection).unwrap();
        assert_eq!(saved.tournaments.len(), 1);
        assert_eq!(saved.tournaments[0].name, original.tournaments[0].name);
        assert_eq!(
            saved.active_tournament_id.as_deref(),
            Some(DEFAULT_TOURNAMENT_ID)
        );
        assert_eq!(saved.timer_settings.unwrap().volume, 0.5);
    }

    #[test]
    fn tournament_reordering_and_deletion_are_persisted_together() {
        let mut connection = open(Path::new(":memory:")).unwrap();
        let mut data = default_tournament_data();
        let mut second: Tournament =
            serde_json::from_value(serde_json::to_value(&data.tournaments[0]).unwrap()).unwrap();
        second.id = "second".to_string();
        data.tournaments.push(second);
        save_tournaments(&mut connection, &data).unwrap();
        data.tournaments.reverse();
        save_tournaments(&mut connection, &data).unwrap();
        let saved = load(&mut connection).unwrap();
        assert_eq!(saved.tournaments[0].id, "second");
        assert_eq!(saved.tournaments[1].id, DEFAULT_TOURNAMENT_ID);
        data.tournaments.pop();
        save_tournaments(&mut connection, &data).unwrap();
        let saved = load(&mut connection).unwrap();
        assert_eq!(saved.tournaments.len(), 1);
        assert_eq!(saved.tournaments[0].id, "second");
        assert!(saved.active_tournament_id.is_none());
    }

    #[test]
    fn tournament_and_settings_writes_from_separate_connections_do_not_clobber_each_other() {
        let directory = std::env::temp_dir().join(format!(
            "dinkydonk-sqlite-concurrent-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&directory).unwrap();
        let path = directory.join("DinkyDonk.sqlite3");
        drop(open(&path).unwrap());
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
        let tournament_path = path.clone();
        let tournament_barrier = barrier.clone();
        let tournaments = std::thread::spawn(move || {
            let mut connection = open(&tournament_path).unwrap();
            let mut data = default_tournament_data();
            tournament_barrier.wait();
            for index in 0..20 {
                data.tournaments[0].name = format!("Tournament {index}");
                save_tournaments(&mut connection, &data).unwrap();
            }
        });
        let settings_path = path.clone();
        let settings_thread = std::thread::spawn(move || {
            let connection = open(&settings_path).unwrap();
            let mut value = settings();
            barrier.wait();
            for index in 0..20 {
                value.volume = f64::from(index) / 20.0;
                save_timer_settings(&connection, &value).unwrap();
            }
        });
        tournaments.join().unwrap();
        settings_thread.join().unwrap();
        let mut connection = open(&path).unwrap();
        let saved = load(&mut connection).unwrap();
        assert_eq!(saved.tournaments[0].name, "Tournament 19");
        assert_eq!(saved.timer_settings.unwrap().volume, 0.95);
        drop(connection);
        std::fs::remove_file(path).unwrap();
        std::fs::remove_dir(directory).unwrap();
    }

    #[test]
    fn reconciliation_rejects_stale_data_without_changing_the_database() {
        let mut connection = open(Path::new(":memory:")).unwrap();
        let mut data = default_tournament_data();
        data.tournaments[0].bustouts.push(
            serde_json::from_value(serde_json::json!({
                "name": "Unnamed", "timestamp": 1, "place": 2
            }))
            .unwrap(),
        );
        save_tournaments(&mut connection, &data).unwrap();
        assert!(reconcile(&mut connection, &data.tournaments, &[vec![Some(25.0)]]).unwrap());
        assert!(!reconcile(&mut connection, &data.tournaments, &[vec![Some(50.0)]]).unwrap());
        assert_eq!(
            load(&mut connection).unwrap().tournaments[0].bustouts[0].payout,
            Some(25.0)
        );
    }
}
