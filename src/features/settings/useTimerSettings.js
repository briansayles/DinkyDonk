import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  defaultTimerSettings,
  normalizeTimerSettings,
  timerSettingsStorageKey,
} from "./timerSettings";

export function useTimerSettings(reloadTournaments) {
  const [timerSettings, setTimerSettings] = useState(defaultTimerSettings);
  const [timerSettingsLoaded, setTimerSettingsLoaded] = useState(false);
  const [timerSettingsError, setTimerSettingsError] = useState("");
  const [settingsDirectory, setSettingsDirectory] = useState("");
  const [changingSettingsDirectory, setChangingSettingsDirectory] =
    useState(false);

  useEffect(() => {
    let active = true;

    invoke("get_settings_directory")
      .then((directory) => {
        if (active) {
          setSettingsDirectory(directory);
        }
      })
      .catch((error) => {
        console.error("Could not load settings directory.", error);
        if (active) {
          setTimerSettingsError("Settings directory could not be loaded.");
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

    invoke("save_timer_settings", { settings: timerSettings })
      .then(() => setTimerSettingsError(""))
      .catch((error) => {
        console.error("Could not save timer settings.", error);
        setTimerSettingsError("Timer settings could not be saved.");
      });
  }, [timerSettings, timerSettingsLoaded]);

  async function changeSettingsDirectory() {
    try {
      const selectedDirectory = await open({
        directory: true,
        multiple: false,
        title: "Choose settings directory",
      });
      if (!selectedDirectory) {
        return;
      }

      setChangingSettingsDirectory(true);
      await invoke("save_timer_settings", { settings: timerSettings });
      const directory = await invoke("set_settings_directory", {
        path: selectedDirectory,
      });
      setSettingsDirectory(directory);
      const [, savedTimerSettings] = await Promise.all([
        reloadTournaments(),
        invoke("load_timer_settings"),
      ]);
      if (savedTimerSettings) {
        setTimerSettings(normalizeTimerSettings(savedTimerSettings));
      }
      setTimerSettingsError("");
    } catch (error) {
      console.error("Could not change settings directory.", error);
      setTimerSettingsError("Settings directory could not be changed.");
    } finally {
      setChangingSettingsDirectory(false);
    }
  }

  return {
    changingSettingsDirectory,
    changeSettingsDirectory,
    setTimerSettings,
    setTimerSettingsError,
    settingsDirectory,
    timerSettings,
    timerSettingsError,
    timerSettingsLoaded,
  };
}
