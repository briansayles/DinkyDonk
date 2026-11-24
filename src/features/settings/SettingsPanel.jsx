import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

function formatSettingsDirectory(directory) {
  const uncPrefix = "\\\\?\\UNC\\";
  if (directory.startsWith(uncPrefix)) {
    return `\\\\${directory.slice(uncPrefix.length)}`;
  }

  const extendedPrefix = "\\\\?\\";
  return directory.startsWith(extendedPrefix)
    ? directory.slice(extendedPrefix.length)
    : directory;
}

function NetworkViewerSettings() {
  const [connection, setConnection] = useState(null);
  const [error, setError] = useState("");

  async function refresh() {
    try {
      const result = await invoke("get_network_viewer_status");
      setConnection(result);
      setError(result.error ?? "");
    } catch (failure) {
      console.error("Could not check network viewer status.", failure);
      setError(`Could not check network viewer status: ${failure}`);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <section className="settings-section" aria-labelledby="network-viewer-heading">
      <h3 id="network-viewer-heading">Local network timer viewer</h3>
      <p>The read-only timer viewer starts automatically while DinkyDonk is open.
        Anyone who can reach this computer can view the active tournament's timer,
        chips, and aggregate entry and payout information; there is no password or encryption.</p>
      {error ? <p className="storage-error" role="alert">{error}</p> : !connection ? (
        <p>Loading network addresses...</p>
      ) : connection.urls.length ? (
        <>
          <p>Open one of these addresses on another device on the same network:</p>
          <ul>{connection.urls.map((url) => <li key={url}><code>{url}</code></li>)}</ul>
          <p>Tournament director (anyone who can reach it can control the tournament and read participant records):</p>
          <ul>{connection.urls.map((url) => <li key={url}><code>{url}td</code></li>)}</ul>
        </>
      ) : (
        <p>No IPv4 network address found. Connect to a network and refresh.</p>
      )}
      <p>A firewall may need to allow incoming connections. The address and port may change when the app or network restarts.</p>
      <button type="button" onClick={refresh}>Refresh addresses</button>
    </section>
  );
}

export default function SettingsPanel({
  databasePath,
  reloadTimerSettings,
  settingsConflict,
  settingsReloading,
  previewCountdownWarning,
  previewLevelAlarm,
  setTimerSettings,
  timerSettings,
  timerSettingsError,
  timerSettingsLoaded,
}) {
  return (
    <div className="settings-panel">
      {timerSettingsError && (
        <p className="storage-error" role="alert">
          {timerSettingsError}
        </p>
      )}
      {settingsConflict && (
        <button type="button" onClick={reloadTimerSettings} disabled={settingsReloading}>
          Reload saved settings (discard unsaved changes)
        </button>
      )}
      <NetworkViewerSettings />
      <section className="settings-section settings-directory-section" aria-labelledby="settings-directory-heading">
        <h3 id="settings-directory-heading">Local database</h3>
        <p>Tournaments and settings are stored on this device.</p>
        <div className="settings-directory-controls">
          <div>
            <p className="settings-directory-path">
              {databasePath
                ? formatSettingsDirectory(databasePath)
                : "Loading database location..."}
            </p>
          </div>
        </div>
      </section>
      <section className="settings-audio-controls" aria-labelledby="settings-audio-heading">
        <h3 id="settings-audio-heading">Audio settings</h3>
        <p>Set the playback volume and spoken-announcement speed.</p>
        <label className="settings-volume-control">
          <span>Volume</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={timerSettings.volume}
            onChange={(event) =>
              setTimerSettings((current) => ({
                ...current,
                volume: Number(event.target.value),
              }))
            }
            aria-label="Timer volume"
          />
        </label>
        <label className="settings-volume-control">
          <span>Announcement Speed</span>
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.05"
            value={timerSettings.announcementSpeed}
            onChange={(event) =>
              setTimerSettings((current) => ({
                ...current,
                announcementSpeed: Number(event.target.value),
              }))
            }
            aria-label="Announcement speed"
          />
          <output>{timerSettings.announcementSpeed.toFixed(2)}×</output>
        </label>
      </section>
      <section className="settings-level-change" aria-labelledby="settings-level-change-heading">
        <h3 id="settings-level-change-heading">Level changes</h3>
        <p>Choose the alarm and spoken announcement used when a new level begins.</p>
      <label className="form-field">
        Level-change alarm
        <select
          className="settings-sound-select"
          value={timerSettings.alarmSound}
          onChange={(event) =>
            setTimerSettings((current) => ({
              ...current,
              alarmSound: event.target.value,
            }))
          }
        >
          <option value="single-ding">Single ding</option>
          <option value="double-ding">Ding ding</option>
          <option value="triple-ding">Ding ding ding</option>
          <option value="alarm-clock">Alarm clock (beep beep beep)</option>
          <option value="hockey-horn">Hockey goal horn</option>
          <option value="train-whistle">Train whistle</option>
          <option value="ship-horn">Ship horn</option>
          <option value="off">Off (announcement only)</option>
        </select>
      </label>
      <label className="settings-switch">
        <span>Spoken announcement</span>
        <input
          type="checkbox"
          role="switch"
          checked={timerSettings.spokenAnnouncementEnabled}
          onChange={(event) =>
            setTimerSettings((current) => ({
              ...current,
              spokenAnnouncementEnabled: event.target.checked,
            }))
          }
          aria-label="Enable spoken announcement"
        />
        <span className="settings-switch-track" aria-hidden="true" />
      </label>
      <label className="form-field">
        Announcement text
        <textarea
          rows="5"
          value={timerSettings.announcement}
          disabled={!(timerSettings.spokenAnnouncementEnabled)}
          title="Use {smallBlind}, {bigBlind}, or {ante} to insert level values. Use {antePhrase} to include “with an ante of [ante]” only when the ante is greater than zero."
          onChange={(event) =>
            setTimerSettings((current) => ({
              ...current,
              announcement: event.target.value,
            }))
          }
        />
      </label>
      <div className="settings-test-controls">
        <button type="button" onClick={previewLevelAlarm}>
          Test alarm
          {timerSettings.spokenAnnouncementEnabled &&
            " and announcement"}{" "}
          (100/200, ante 25)
        </button>
      </div>
      </section>
      <div className="settings-countdown-warning">
        <h3>Level countdown warning</h3>
        <p>Choose an optional alarm and announcement before a level ends.</p>
        <label className="form-field">
          Seconds remaining
          <input
            className="settings-countdown-warning-seconds"
            type="number"
            min="1"
            max="3600"
            step="1"
            value={timerSettings.countdownWarningSeconds}
            onChange={(event) =>
              setTimerSettings((current) => ({
                ...current,
                countdownWarningSeconds: Math.max(
                  1,
                  Math.min(3600, Math.floor(Number(event.target.value) || 1)),
                ),
              }))
            }
          />
        </label>
        <label className="form-field">
          Warning alarm
          <select
            className="settings-sound-select"
            value={timerSettings.countdownWarningSound}
            onChange={(event) =>
              setTimerSettings((current) => ({
                ...current,
                countdownWarningSound: event.target.value,
              }))
            }
          >
            <option value="single-ding">Single ding</option>
            <option value="double-ding">Ding ding</option>
            <option value="triple-ding">Ding ding ding</option>
            <option value="alarm-clock">Alarm clock (beep beep beep)</option>
            <option value="hockey-horn">Hockey goal horn</option>
            <option value="train-whistle">Train whistle</option>
            <option value="ship-horn">Ship horn</option>
            <option value="off">Off</option>
          </select>
        </label>
        <label className="settings-switch">
          <span>Spoken countdown message</span>
          <input
            type="checkbox"
            role="switch"
            checked={timerSettings.countdownWarningSpeechEnabled}
            onChange={(event) =>
              setTimerSettings((current) => ({
                ...current,
                countdownWarningSpeechEnabled: event.target.checked,
              }))
            }
            aria-label="Enable spoken countdown message"
          />
          <span className="settings-switch-track" aria-hidden="true" />
        </label>
        <label className="form-field">
          Countdown message
          <textarea
            rows="2"
            value={timerSettings.countdownWarningAnnouncement}
            disabled={!timerSettings.countdownWarningSpeechEnabled}
            title="Use {seconds} to insert the configured countdown."
            onChange={(event) =>
              setTimerSettings((current) => ({
                ...current,
                countdownWarningAnnouncement: event.target.value,
              }))
            }
          />
        </label>
        <button type="button" onClick={previewCountdownWarning}>
          Test countdown warning
        </button>
      </div>
      <p className="settings-save-status">
        Settings save automatically in the selected file.
      </p>
    </div>
  );
}
