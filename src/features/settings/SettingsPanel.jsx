import { useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

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

export default function SettingsPanel({
  changingSettingsDirectory,
  onChangeSettingsFile,
  previewCountdownWarning,
  previewLevelAlarm,
  setTimerSettings,
  settingsDirectory,
  timerSettings,
  timerSettingsError,
  timerSettingsLoaded,
}) {
  const fileDialogRef = useRef(null);
  const [filePath, setFilePath] = useState("");
  const [fileDialogError, setFileDialogError] = useState("");

  async function showFileDialog() {
    const defaultPath = formatSettingsDirectory(settingsDirectory);
    try {
      const selection = await invoke("pick_settings_file", { defaultPath });
      if (selection.supported) {
        if (selection.path) await onChangeSettingsFile(selection.path);
      } else {
        setFilePath(defaultPath);
        setFileDialogError("");
        fileDialogRef.current.showModal();
      }
    } catch (error) {
      console.error("Could not open settings file picker.", error);
      setFileDialogError(`Could not open settings file picker: ${error}`);
      setFilePath(defaultPath);
      fileDialogRef.current.showModal();
    }
  }

  async function browseSettingsFile() {
    try {
      const selected = await open({
        title: "Open settings file",
        defaultPath: filePath || undefined,
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (selected) {
        setFilePath(selected);
      }
      setFileDialogError("");
    } catch (error) {
      console.error("Could not open settings file picker.", error);
      setFileDialogError(`Could not open settings file picker: ${error}`);
    }
  }

  async function submitSettingsFile(event) {
    event.preventDefault();
    if (await onChangeSettingsFile(filePath)) {
      fileDialogRef.current?.close();
    }
  }

  return (
    <div className="settings-panel">
      {timerSettingsError && (
        <p className="storage-error" role="alert">
          {timerSettingsError}
        </p>
      )}
      <section className="settings-section settings-directory-section" aria-labelledby="settings-directory-heading">
        <h3 id="settings-directory-heading">Settings file</h3>
        <p>Choose an existing JSON settings file or enter a new filename to copy the current settings.</p>
        <button
          type="button"
          onClick={showFileDialog}
          disabled={!timerSettingsLoaded || changingSettingsDirectory}
        >
          {changingSettingsDirectory ? "Changing..." : "Choose file"}
        </button>
        <div className="settings-directory-controls">
          <div>
            <p className="settings-directory-path">
              {settingsDirectory
                ? formatSettingsDirectory(settingsDirectory)
                : "Loading settings file..."}
            </p>
          </div>
        </div>
        <dialog
          ref={fileDialogRef}
          className="settings-file-dialog"
          aria-labelledby="settings-file-dialog-heading"
          onCancel={(event) => {
            if (changingSettingsDirectory) event.preventDefault();
          }}
        >
          <form onSubmit={submitSettingsFile}>
            <h3 id="settings-file-dialog-heading">Choose settings file</h3>
            <p>Browse for an existing file or edit the path to create a new JSON file.</p>
            {(fileDialogError || timerSettingsError) && (
              <p className="storage-error" role="alert">{fileDialogError || timerSettingsError}</p>
            )}
            <label className="form-field">
              File path
              <input
                type="text"
                value={filePath}
                onChange={(event) => setFilePath(event.target.value)}
                required
                disabled={changingSettingsDirectory}
              />
            </label>
            <div className="settings-file-dialog-actions">
              <button type="button" onClick={browseSettingsFile} disabled={changingSettingsDirectory}>Browse existing file</button>
              <button type="button" onClick={() => fileDialogRef.current.close()} disabled={changingSettingsDirectory}>Cancel</button>
              <button type="submit" disabled={changingSettingsDirectory}>Use file</button>
            </div>
          </form>
        </dialog>
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
