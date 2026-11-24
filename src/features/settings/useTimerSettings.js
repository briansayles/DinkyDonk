import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  defaultTimerSettings,
  normalizeTimerSettings,
} from "./timerSettings";

export function useTimerSettings() {
  const [timerSettings, setTimerSettingsState] = useState(defaultTimerSettings);
  const [timerSettingsLoaded, setTimerSettingsLoaded] = useState(false);
  const [timerSettingsError, setTimerSettingsError] = useState("");
  const [databasePath, setDatabasePath] = useState("");
  const timerSettingsSave = useRef(Promise.resolve(true));
  const timerSettingsLoadSucceeded = useRef(false);
  const savedSettingsRef = useRef(null);
  const skipNextSaveRef = useRef(defaultTimerSettings);
  const settingsConflictRef = useRef(false);
  const [settingsConflict, setSettingsConflict] = useState(false);
  const [settingsReloading, setSettingsReloading] = useState(false);
  const settingsReloadingRef = useRef(false);
  const settingsEditSequenceRef = useRef(0);

  function setTimerSettings(update) {
    settingsEditSequenceRef.current += 1;
    setTimerSettingsState(update);
  }

  useEffect(() => {
    let active = true;

    invoke("get_database_path")
      .then((path) => {
        if (active) {
          setDatabasePath(path);
        }
      })
      .catch((error) => {
        console.error("Could not load database location.", error);
        if (active) {
          setTimerSettingsError("Database location could not be loaded.");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    invoke("load_timer_settings")
      .then((savedSettings) => {
        if (!active) {
          return;
        }

        timerSettingsLoadSucceeded.current = true;
        savedSettingsRef.current = savedSettings;
        if (savedSettings) {
          const normalized = normalizeTimerSettings(savedSettings);
          skipNextSaveRef.current = normalized;
          setTimerSettingsState(normalized);
        }
      })
      .catch((error) => {
        console.error("Could not load timer settings.", error);
        if (active) {
          setTimerSettingsError("Timer settings could not be loaded.");
        }
      })
      .finally(() => {
        if (active) {
          setTimerSettingsLoaded(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!timerSettingsLoaded || !timerSettingsLoadSucceeded.current) {
      return;
    }
    if (skipNextSaveRef.current !== null) {
      const skip = timerSettings === skipNextSaveRef.current;
      skipNextSaveRef.current = null;
      if (skip) return;
    }
    timerSettingsSave.current = timerSettingsSave.current
      .then(() => {
        if (settingsConflictRef.current) return false;
        return invoke("save_timer_settings", { expected: savedSettingsRef.current, settings: timerSettings })
          .then(() => {
            savedSettingsRef.current = timerSettings;
            return true;
          });
      })
      .then((saved) => {
        if (saved) setTimerSettingsError("");
        return saved;
      })
      .catch((error) => {
        console.error("Could not save timer settings.", error);
        if (String(error).includes("Conflict:")) {
          settingsConflictRef.current = true;
          setSettingsConflict(true);
          setTimerSettingsError("Timer settings changed elsewhere. Reload saved settings to discard your unsaved changes.");
        } else {
          setTimerSettingsError(`Timer settings could not be saved: ${error}`);
        }
        return false;
      });
  }, [timerSettings, timerSettingsLoaded]);

  useEffect(() => {
    if (!timerSettingsLoaded) return undefined;
    let active = true;
    let loading = false;
    async function synchronizeSettings() {
      if (loading || !timerSettingsLoadSucceeded.current || settingsConflictRef.current || settingsReloadingRef.current) return;
      loading = true;
      const sequence = settingsEditSequenceRef.current;
      try {
        if (!(await timerSettingsSave.current)) return;
        const saved = await invoke("load_timer_settings");
        if (!active || sequence !== settingsEditSequenceRef.current || settingsConflictRef.current || settingsReloadingRef.current) return;
        if (JSON.stringify(saved) !== JSON.stringify(savedSettingsRef.current)) {
          savedSettingsRef.current = saved;
          const normalized = saved ? normalizeTimerSettings(saved) : { ...defaultTimerSettings };
          skipNextSaveRef.current = normalized;
          setTimerSettingsState(normalized);
        }
        setTimerSettingsError((current) =>
          current === "Timer settings could not be synchronized from the database." ? "" : current,
        );
      } catch (error) {
        console.error("Could not synchronize timer settings.", error);
        if (active) setTimerSettingsError("Timer settings could not be synchronized from the database.");
      } finally {
        loading = false;
      }
    }
    const interval = window.setInterval(synchronizeSettings, 1000);
    return () => { active = false; window.clearInterval(interval); };
  }, [timerSettingsLoaded]);

  async function reloadTimerSettings() {
    if (settingsReloadingRef.current) return;
    settingsReloadingRef.current = true;
    setSettingsReloading(true);
    const sequence = settingsEditSequenceRef.current;
    try {
      await timerSettingsSave.current;
      const saved = await invoke("load_timer_settings");
      if (sequence !== settingsEditSequenceRef.current) {
        setTimerSettingsError("Timer settings changed while reloading. Reload again to discard those changes.");
        return;
      }
      savedSettingsRef.current = saved;
      settingsConflictRef.current = false;
      setSettingsConflict(false);
      const normalized = saved ? normalizeTimerSettings(saved) : { ...defaultTimerSettings };
      skipNextSaveRef.current = normalized;
      setTimerSettingsState(normalized);
      setTimerSettingsError("");
    } catch (error) {
      console.error("Could not reload timer settings.", error);
      setTimerSettingsError(`Timer settings could not be reloaded: ${error}`);
    } finally {
      settingsReloadingRef.current = false;
      setSettingsReloading(false);
    }
  }

  return {
    databasePath,
    reloadTimerSettings,
    settingsConflict,
    settingsReloading,
    setTimerSettings,
    setTimerSettingsError,
    timerSettings,
    timerSettingsError,
    timerSettingsLoaded,
  };
}
