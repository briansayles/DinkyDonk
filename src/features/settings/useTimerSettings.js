import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  defaultTimerSettings,
  normalizeTimerSettings,
  timerSettingsStorageKey,
} from "./timerSettings";

export function useTimerSettings(reloadTournaments, flushTournamentFieldUpdates) {
  const [timerSettings, setTimerSettings] = useState(defaultTimerSettings);
  const [timerSettingsLoaded, setTimerSettingsLoaded] = useState(false);
  const [timerSettingsError, setTimerSettingsError] = useState("");
  const [settingsDirectory, setSettingsDirectory] = useState("");
  const [changingSettingsDirectory, setChangingSettingsDirectory] =
    useState(false);
  const skipNextTimerSettingsSave = useRef(false);
  const timerSettingsSave = useRef(Promise.resolve(true));

  useEffect(() => {
    let active = true;

    invoke("get_settings_file")
      .then((directory) => {
        if (active) {
          setSettingsDirectory(directory);
        }
      })
      .catch((error) => {
        console.error("Could not load settings file location.", error);
        if (active) {
          setTimerSettingsError("Settings file location could not be loaded.");
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

        if (savedSettings) {
          setTimerSettings(normalizeTimerSettings(savedSettings));
          return;
        }

        const legacySettings = localStorage.getItem(timerSettingsStorageKey);
        if (legacySettings) {
          setTimerSettings(normalizeTimerSettings(JSON.parse(legacySettings)));
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
    if (!timerSettingsLoaded) {
      return;
    }
    if (skipNextTimerSettingsSave.current) {
      skipNextTimerSettingsSave.current = false;
      return;
    }

    timerSettingsSave.current = timerSettingsSave.current
      .then(() => invoke("save_timer_settings", { settings: timerSettings }))
      .then(() => {
        setTimerSettingsError("");
        return true;
      })
      .catch((error) => {
        console.error("Could not save timer settings.", error);
        setTimerSettingsError("Timer settings could not be saved.");
        return false;
      });
  }, [timerSettings, timerSettingsLoaded]);

  async function changeSettingsFile(selectedPath) {
    try {
      setChangingSettingsDirectory(true);
      await flushTournamentFieldUpdates();
      if (!(await timerSettingsSave.current)) {
        throw new Error("Current timer settings could not be saved.");
      }
      const file = await invoke("set_settings_file", {
        path: selectedPath,
      });
      setSettingsDirectory(file);
      const [, savedTimerSettings] = await Promise.all([
        reloadTournaments(),
        invoke("load_timer_settings"),
      ]);
      skipNextTimerSettingsSave.current = true;
      setTimerSettings(savedTimerSettings
        ? normalizeTimerSettings(savedTimerSettings)
        : { ...defaultTimerSettings });
      setTimerSettingsError("");
      return true;
    } catch (error) {
      console.error("Could not change settings location.", error);
      setTimerSettingsError(`Settings location could not be changed: ${error}`);
      return false;
    } finally {
      setChangingSettingsDirectory(false);
    }
  }

  return {
    changingSettingsDirectory,
    changeSettingsFile,
    setTimerSettings,
    setTimerSettingsError,
    settingsDirectory,
    timerSettings,
    timerSettingsError,
    timerSettingsLoaded,
  };
}
