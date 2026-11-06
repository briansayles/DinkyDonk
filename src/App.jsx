import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

const tabs = ["Timer", "Tournament", "Players", "Settings"];
const timerSettingsStorageKey = "dinky-donk-timer-settings";
const alarmSoundOptions = [
  "single-ding",
  "double-ding",
  "triple-ding",
  "alarm-clock",
  "hockey-horn",
  "train-whistle",
  "ship-horn",
  "off",
];
const defaultTimerSettings = {
  alarmSound: "triple-ding",
  volume: 1,
  spokenAnnouncementEnabled: true,
  announcement:
    "Dinky Dawnk. Dinky to the Donkey. The blinds are up bitches. The blinds are now {smallBlind} and {bigBlind}{antePhrase}.",
};

function createEmptyLevel() {
  return {
    duration: "",
    smallBlind: "",
    bigBlind: "",
    ante: "",
    isBreak: false,
  };
}

function sortChips(chips) {
  return [...chips].sort((first, second) => {
    const firstDenomination =
      first.denomination === "" ? Number.POSITIVE_INFINITY : Number(first.denomination);
    const secondDenomination =
      second.denomination === "" ? Number.POSITIVE_INFINITY : Number(second.denomination);
    return firstDenomination - secondDenomination;
  });
}

function getChipStackSummary(chips) {
  const chipsWithQuantities = chips.filter(
    (chip) => chip.quantityPerPlayer !== "" && chip.quantityPerPlayer != null,
  );

  return {
    total: chipsWithQuantities.reduce(
      (total, chip) =>
        total +
        Number(chip.denomination ?? 0) * Number(chip.quantityPerPlayer),
      0,
    ),
    hasQuantities: chipsWithQuantities.length > 0,
    hasUnspecifiedQuantities: chipsWithQuantities.length < chips.length,
  };
}

function formatChipStackTotal(chips) {
  const summary = getChipStackSummary(chips);
  if (!summary.hasQuantities) {
    return "Not set";
  }
  return summary.total.toLocaleString();
}

function formatChipNumber(value) {
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: 20,
  });
}

function getMaxChipSupportedPlayers(chips) {
  const playerLimits = chips
    .filter(
      (chip) =>
        chip.availableQuantity !== "" &&
        chip.availableQuantity != null &&
        chip.quantityPerPlayer !== "" &&
        chip.quantityPerPlayer != null &&
        Number(chip.quantityPerPlayer) > 0,
    )
    .map((chip) =>
      Math.floor(
        Number(chip.availableQuantity) / Number(chip.quantityPerPlayer),
      ),
    );

  return playerLimits.length > 0 ? Math.min(...playerLimits) : null;
}

function getChipSupportedPlayers(chip) {
  if (
    chip.availableQuantity == null ||
    chip.availableQuantity === "" ||
    chip.quantityPerPlayer == null ||
    chip.quantityPerPlayer === "" ||
    Number(chip.quantityPerPlayer) <= 0
  ) {
    return null;
  }

  return Math.floor(
    Number(chip.availableQuantity) / Number(chip.quantityPerPlayer),
  );
}

function isDivisibleByChip(value, denomination) {
  const chipUnits = value / denomination;
  return Math.abs(chipUnits - Math.round(chipUnits)) < 1e-9;
}

function getChipColorUpsByLevel(chips, levels) {
  const colorUpsByLevel = new Map();
  const regularLevelIndexes = levels
    .map((level, index) => (level.isBreak ? -1 : index))
    .filter((index) => index >= 0);

  for (const chip of chips) {
    const denomination = Number(chip.denomination);
    const higherDenominations = chips
      .map((candidate) => Number(candidate.denomination))
      .filter((candidate) => candidate > denomination && candidate > 0);

    if (higherDenominations.length === 0) {
      continue;
    }

    const levelsRequiringChip = regularLevelIndexes.filter((index) => {
      const level = levels[index];
      const blindValues = [
        level.smallBlind,
        level.bigBlind,
        level.ante,
      ].map(Number).filter((value) => value > 0);

      return blindValues.some(
        (value) =>
          !higherDenominations.some((higherDenomination) =>
            isDivisibleByChip(value, higherDenomination),
          ),
      );
    });
    const lastNeededLevelIndex =
      levelsRequiringChip[levelsRequiringChip.length - 1];

    if (
      lastNeededLevelIndex == null ||
      lastNeededLevelIndex === regularLevelIndexes[regularLevelIndexes.length - 1]
    ) {
      continue;
    }

    colorUpsByLevel.set(lastNeededLevelIndex, [
      ...(colorUpsByLevel.get(lastNeededLevelIndex) ?? []),
      chip,
    ]);
  }

  return colorUpsByLevel;
}

function getChipsInUse(chips, levels, currentLevelIndex) {
  if (currentLevelIndex == null) {
    return [];
  }

  const colorUpsByLevel = getChipColorUpsByLevel(chips, levels);
  const colorUpLevels = new Map();
  for (const [levelIndex, colorUpChips] of colorUpsByLevel) {
    for (const chip of colorUpChips) {
      colorUpLevels.set(chip, levelIndex);
    }
  }

  return [...chips]
    .filter(
      (chip) =>
        Number(chip.denomination) > 0 &&
        (!colorUpLevels.has(chip) ||
          currentLevelIndex <= colorUpLevels.get(chip)),
    )
    .sort((first, second) => Number(first.denomination) - Number(second.denomination))
    .map((chip) => ({
      ...chip,
      isColoringUp: colorUpLevels.get(chip) === currentLevelIndex,
    }))
    .slice(0, 4);
}

function sortLevels(levels) {
  const compareBlindValues = (first, second) =>
    Number(first.smallBlind ?? 0) +
    Number(first.bigBlind ?? 0) +
    Number(first.ante ?? 0) -
    (Number(second.smallBlind ?? 0) +
      Number(second.bigBlind ?? 0) +
      Number(second.ante ?? 0));
  const sortedLevels = [];
  let regularLevels = [];

  for (const level of levels) {
    if (level.isBreak) {
      sortedLevels.push(
        ...regularLevels.sort(compareBlindValues),
        { ...level, isBreak: true },
      );
      regularLevels = [];
    } else {
      regularLevels.push({ ...level, isBreak: false });
    }
  }

  return [...sortedLevels, ...regularLevels.sort(compareBlindValues)];
}

function getLevelDurationMs(level) {
  return Math.max(0, Number(level.duration ?? 0)) * 60_000;
}

function getCurrentLevel(levels, elapsedMs) {
  let levelStartMs = 0;

  for (let index = 0; index < levels.length; index += 1) {
    const levelDurationMs = getLevelDurationMs(levels[index]);
    if (levelDurationMs > 0 && elapsedMs < levelStartMs + levelDurationMs) {
      return {
        level: levels[index],
        index,
        startMs: levelStartMs,
        endMs: levelStartMs + levelDurationMs,
        remainingMs: levelStartMs + levelDurationMs - elapsedMs,
      };
    }
    levelStartMs += levelDurationMs;
  }

  return null;
}

function formatClock(milliseconds) {
  const totalSeconds = Math.ceil(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function TimerIcon({ name }) {
  return (
    <svg
      className="timer-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {name === "play" && (
        <path d="M8 5v14l11-7z" fill="currentColor" />
      )}
      {name === "pause" && (
        <>
          <path d="M7 5h4v14H7z" fill="currentColor" />
          <path d="M15 5h4v14h-4z" fill="currentColor" />
        </>
      )}
      {name === "reset" && (
        <>
          <path d="M5 5v6h6" fill="none" stroke="currentColor" strokeWidth="2" />
          <path
            d="M5.5 11a7 7 0 1 1 .8 5.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </>
      )}
      {name === "rewind" && (
        <>
          <path d="M4 5h2v14H4z" fill="currentColor" />
          <path d="m19 5-10 7 10 7z" fill="currentColor" />
        </>
      )}
      {name === "previous" && (
        <>
          <path d="M4 5h2v14H4z" fill="currentColor" />
          <path d="M8 5h2v14H8z" fill="currentColor" />
          <path d="m20 5-9 7 9 7z" fill="currentColor" />
        </>
      )}
      {name === "next" && (
        <>
          <path d="M18 5v14" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="m6 6 8 6-8 6z" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [tournaments, setTournaments] = useState([]);
  const [activeTournamentId, setActiveTournamentId] = useState(null);
  const [expandedTournaments, setExpandedTournaments] = useState({});
  const [storageError, setStorageError] = useState("");
  const [loadingTournaments, setLoadingTournaments] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [startedAt, setStartedAt] = useState(null);
  const [clockNowMs, setClockNowMs] = useState(0);
  const [timerChips, setTimerChips] = useState([]);
  const timerChipsTargetRef = useRef([]);
  const [timerSettings, setTimerSettings] = useState(defaultTimerSettings);
  const [timerSettingsLoaded, setTimerSettingsLoaded] = useState(false);
  const [timerSettingsError, setTimerSettingsError] = useState("");
  const audioContextRef = useRef(null);
  const previousLevelRef = useRef(null);

  useEffect(() => {
    let active = true;

    invoke("load_tournaments")
      .then((savedTournaments) => {
        if (active) {
          setTournaments(
            savedTournaments.tournaments.map((tournament) => ({
              ...tournament,
              chips: sortChips(tournament.chips ?? []),
              levels: sortLevels(tournament.levels),
            })),
          );
          setActiveTournamentId(savedTournaments.activeTournamentId);
          setExpandedTournaments(
            savedTournaments.activeTournamentId
              ? { [savedTournaments.activeTournamentId]: true }
              : {},
          );
          setLoadingTournaments(false);
        }
      })
      .catch((error) => {
        console.error("Could not load tournament structures.", error);
        if (active) {
          setStorageError(
            "Tournament structures could not be loaded from this device.",
          );
          setLoadingTournaments(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    try {
      const savedSettings = localStorage.getItem(timerSettingsStorageKey);
      if (savedSettings) {
        const parsedSettings = JSON.parse(savedSettings);
        setTimerSettings({
          alarmSound: alarmSoundOptions.includes(parsedSettings.alarmSound)
            ? parsedSettings.alarmSound
            : defaultTimerSettings.alarmSound,
          volume:
            typeof parsedSettings.volume === "number" &&
            Number.isFinite(parsedSettings.volume)
              ? Math.max(0, Math.min(1, parsedSettings.volume))
              : defaultTimerSettings.volume,
          spokenAnnouncementEnabled:
            typeof parsedSettings.spokenAnnouncementEnabled === "boolean"
              ? parsedSettings.spokenAnnouncementEnabled
              : defaultTimerSettings.spokenAnnouncementEnabled,
          announcement:
            typeof parsedSettings.announcement === "string"
              ? parsedSettings.announcement
              : defaultTimerSettings.announcement,
        });
      }
    } catch (error) {
      console.error("Could not load timer settings.", error);
      setTimerSettingsError("Timer settings could not be loaded.");
    } finally {
      setTimerSettingsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!timerSettingsLoaded) {
      return;
    }

    try {
      localStorage.setItem(
        timerSettingsStorageKey,
        JSON.stringify(timerSettings),
      );
      setTimerSettingsError("");
    } catch (error) {
      console.error("Could not save timer settings.", error);
      setTimerSettingsError("Timer settings could not be saved.");
    }
  }, [timerSettings, timerSettingsLoaded]);

  function startNewTournament() {
    setEditingId(null);
    setDraft({
      name: "",
      startingChipstack: "",
      rebuysAllowed: false,
      addonsAllowed: false,
      buyinCost: "",
      buyinDescription: "",
      rebuyCost: "",
      rebuyDescription: "",
      addonCost: "",
      addonDescription: "",
      chips: [],
      levels: [createEmptyLevel()],
    });
  }

  function editTournament(tournament) {
    setEditingId(tournament.id);
    setDraft({
      name: tournament.name,
      startingChipstack: tournament.startingChipstack ?? "",
      rebuysAllowed: tournament.rebuysAllowed ?? false,
      addonsAllowed: tournament.addonsAllowed ?? false,
      buyinCost: tournament.buyinCost ?? "",
      buyinDescription: tournament.buyinDescription ?? "",
      rebuyCost: tournament.rebuyCost ?? "",
      rebuyDescription: tournament.rebuyDescription ?? "",
      addonCost: tournament.addonCost ?? "",
      addonDescription: tournament.addonDescription ?? "",
      chips: sortChips(
        (tournament.chips ?? []).map((chip) => ({
          ...chip,
          denomination: String(chip.denomination ?? ""),
          availableQuantity: chip.availableQuantity ?? "",
          quantityPerPlayer: chip.quantityPerPlayer ?? "",
        })),
      ),
      levels: sortLevels(tournament.levels).map((level) => ({ ...level })),
    });
  }

  function updateLevel(index, field, value) {
    setDraft((current) => ({
      ...current,
      levels: current.levels.map((level, levelIndex) =>
        levelIndex === index
          ? {
              ...level,
              [field]: value,
              ...(field === "smallBlind" && {
                bigBlind: value === "" ? "" : Number(value) * 2,
              }),
            }
          : level,
      ),
    }));
  }

  function insertLevelAfter(index) {
    setDraft((current) => {
      const level = current.levels[index];
      if (!level || level.isBreak) {
        return current;
      }

      const previousLevel =
        index > 0 && !current.levels[index - 1].isBreak
          ? current.levels[index - 1]
          : null;
      const nextLevel =
        index < current.levels.length - 1 &&
        !current.levels[index + 1].isBreak
          ? current.levels[index + 1]
          : null;
      const fields = ["smallBlind", "bigBlind", "ante"];
      const values = Object.fromEntries(
        fields.map((field) => {
          const currentValue = Number(level[field] ?? 0) || 0;
          if (nextLevel) {
            const nextValue = Number(nextLevel[field] ?? 0) || 0;
            return [field, (currentValue + nextValue) / 2];
          }

          if (previousLevel) {
            const previousValue = Number(previousLevel[field] ?? 0) || 0;
            return [
              field,
              Math.max(0, currentValue + (currentValue - previousValue)),
            ];
          }

          return [
            field,
            currentValue > 0
              ? currentValue + Math.max(1, Math.round(currentValue / 2))
              : 0,
          ];
        }),
      );

      if (!nextLevel && !previousLevel && Object.values(values).every((value) => value === 0)) {
        values.smallBlind = 1;
        values.bigBlind = 2;
      } else if (
        !nextLevel &&
        previousLevel &&
        fields.reduce((total, field) => total + values[field], 0) <=
          fields.reduce(
            (total, field) => total + (Number(level[field] ?? 0) || 0),
            0,
          )
      ) {
        values.bigBlind += Math.max(
          1,
          Math.round((Number(level.bigBlind ?? 0) || 0) / 2),
        );
      }

      const insertedLevel = {
        ...createEmptyLevel(),
        duration: level.duration ?? "",
        ...values,
      };

      return {
        ...current,
        levels: [
          ...current.levels.slice(0, index + 1),
          insertedLevel,
          ...current.levels.slice(index + 1),
        ],
      };
    });
  }

  async function persistTournamentData(nextTournaments, nextActiveTournamentId) {
    setSaving(true);
    try {
      await invoke("save_tournaments", {
        tournaments: nextTournaments,
        activeTournamentId: nextActiveTournamentId,
      });
      setTournaments(nextTournaments);
      setActiveTournamentId(nextActiveTournamentId);
      if (nextActiveTournamentId) {
        setExpandedTournaments((current) => ({
          ...current,
          [nextActiveTournamentId]: true,
        }));
      }
      setStorageError("");
      return true;
    } catch (error) {
      console.error("Could not save tournament structures.", error);
      setStorageError("Tournament changes could not be saved to this device.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveTournament(event) {
    event.preventDefault();
    const tournament = {
      id: editingId ?? crypto.randomUUID(),
      name: draft.name.trim(),
      startingChipstack:
        draft.startingChipstack === "" ? null : Number(draft.startingChipstack),
      rebuysAllowed: draft.rebuysAllowed,
      addonsAllowed: draft.addonsAllowed,
      buyinCost: draft.buyinCost === "" ? null : Number(draft.buyinCost),
      buyinDescription: draft.buyinDescription.trim() || null,
      rebuyCost: draft.rebuyCost === "" ? null : Number(draft.rebuyCost),
      rebuyDescription: draft.rebuyDescription.trim() || null,
      addonCost: draft.addonCost === "" ? null : Number(draft.addonCost),
      addonDescription: draft.addonDescription.trim() || null,
      chips: sortChips(
        draft.chips.map((chip) => ({
          color: chip.color,
          denomination: Number(chip.denomination),
          availableQuantity:
            chip.availableQuantity === ""
              ? null
              : Number(chip.availableQuantity),
          quantityPerPlayer:
            chip.quantityPerPlayer === ""
              ? null
              : Number(chip.quantityPerPlayer),
        })),
      ),
      levels: sortLevels(
        draft.levels.map((level) => ({
          duration: level.duration === "" ? null : Number(level.duration),
          smallBlind: level.isBreak
            ? null
            : level.smallBlind === ""
              ? null
              : Number(level.smallBlind),
          bigBlind: level.isBreak
            ? null
            : level.bigBlind === ""
              ? null
              : Number(level.bigBlind),
          ante: level.isBreak
            ? null
            : level.ante === ""
              ? null
              : Number(level.ante),
          isBreak: Boolean(level.isBreak),
        })),
      ),
    };

    const nextTournaments = editingId
      ? tournaments.map((item) => (item.id === editingId ? tournament : item))
      : [...tournaments, tournament];

    if (await persistTournamentData(nextTournaments, activeTournamentId)) {
      setDraft(null);
      setEditingId(null);
    }
  }

  async function deleteTournament(id) {
    const nextTournaments = tournaments.filter((item) => item.id !== id);
    const nextActiveTournamentId =
      activeTournamentId === id ? null : activeTournamentId;
    if (await persistTournamentData(nextTournaments, nextActiveTournamentId)) {
      if (editingId === id) {
        setDraft(null);
        setEditingId(null);
      }
    }
  }

  const activeTournament = tournaments.find(
    (tournament) => tournament.id === activeTournamentId,
  );
  const activeTournamentKey = activeTournament
    ? JSON.stringify(activeTournament)
    : "";
  const totalDurationMs =
    activeTournament?.levels.reduce(
      (total, level) => total + getLevelDurationMs(level),
      0,
    ) ?? 0;
  const currentElapsedMs =
    startedAt === null
      ? elapsedMs
      : Math.min(totalDurationMs, elapsedMs + clockNowMs - startedAt);
  const currentLevel = activeTournament
    ? getCurrentLevel(activeTournament.levels, currentElapsedMs)
    : null;
  const levelProgress = currentLevel
    ? Math.max(
        0,
        Math.min(
          1,
          currentLevel.remainingMs /
            (currentLevel.endMs - currentLevel.startMs),
        ),
      )
    : 0;
  const progressColor =
    currentLevel?.remainingMs > 60_000
      ? "green"
      : currentLevel?.remainingMs >= 30_000
        ? "yellow"
        : "red";
  const nextLevel =
    activeTournament && currentLevel
      ? getCurrentLevel(activeTournament.levels, currentLevel.endMs)
      : null;
  useEffect(() => {
    const chipsInUse = activeTournament
      ? getChipsInUse(
          activeTournament.chips ?? [],
          activeTournament.levels,
          currentLevel?.index,
        )
      : [];
    const targetChips = chipsInUse.map((chip, index) => ({
      ...chip,
      key: `${chip.color}-${chip.denomination}-${index}`,
    }));
    timerChipsTargetRef.current = targetChips;

    setTimerChips((previousChips) => {
      const targetByKey = new Map(
        targetChips.map((chip) => [chip.key, chip]),
      );
      const nextChips = previousChips
        .filter((chip) => targetByKey.has(chip.key))
        .map((chip) => ({
          ...targetByKey.get(chip.key),
          isEntering: chip.isEntering,
          isExiting: false,
        }));
      const existingKeys = new Set(nextChips.map((chip) => chip.key));
      const exitingChips = previousChips
        .filter((chip) => !targetByKey.has(chip.key))
        .map((chip) => ({ ...chip, isEntering: false, isExiting: true }));

      if (exitingChips.length > 0) {
        return [...nextChips, ...exitingChips];
      }

      return [
        ...nextChips,
        ...targetChips
          .filter((chip) => !existingKeys.has(chip.key))
          .map((chip) => ({ ...chip, isEntering: true, isExiting: false })),
      ];
    });
  }, [activeTournament, currentLevel?.index]);

  function finishTimerChipAnimation(key, animationName) {
    if (animationName === "timer-chip-remove") {
      setTimerChips((chips) => {
        const remainingChips = chips.filter((chip) => chip.key !== key);
        if (remainingChips.some((chip) => chip.isExiting)) {
          return remainingChips;
        }

        const existingKeys = new Set(
          remainingChips.map((chip) => chip.key),
        );
        return [
          ...remainingChips,
          ...timerChipsTargetRef.current
            .filter((chip) => !existingKeys.has(chip.key))
            .map((chip) => ({ ...chip, isEntering: true, isExiting: false })),
        ];
      });
    } else if (animationName === "timer-chip-add") {
      setTimerChips((chips) =>
        chips.map((chip) =>
          chip.key === key ? { ...chip, isEntering: false } : chip,
        ),
      );
    }
  }

  function prepareTimerAudio() {
    try {
      const AudioContextConstructor = window.AudioContext;
      if (!AudioContextConstructor) {
        console.error("The Web Audio API is not available in this browser.");
        return;
      }

      const audioContext =
        audioContextRef.current ?? new AudioContextConstructor();
      audioContextRef.current = audioContext;
      if (audioContext.state === "suspended") {
        audioContext.resume().catch((error) => {
          console.error("Could not resume timer audio.", error);
        });
      }
    } catch (error) {
      console.error("Could not initialize timer audio.", error);
    }
  }

  function speakLevelAnnouncement(level) {
    if (!timerSettings.spokenAnnouncementEnabled) {
      return;
    }

    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      console.error("Speech synthesis is not available in this browser.");
      return;
    }

    if (level.isBreak) {
      window.speechSynthesis.speak(
        new window.SpeechSynthesisUtterance("Break."),
      );
      return;
    }

    const ante = Number(level.ante ?? 0);
    const text = timerSettings.announcement.replace(
      /\{(smallBlind|bigBlind|ante|antePhrase)\}/g,
      (match, token) => {
        if (token === "antePhrase") {
          return ante > 0 ? `, with an ante of ${ante}` : "";
        }
        if (token === "smallBlind") {
          return String(level.smallBlind ?? 0);
        }
        if (token === "bigBlind") {
          return String(level.bigBlind ?? 0);
        }
        return String(ante);
      },
    );
    if (!text.trim()) {
      return;
    }

    const announcement = new window.SpeechSynthesisUtterance(text);
    announcement.volume = timerSettings.volume;
    window.speechSynthesis.speak(announcement);
  }

  function playLevelAlarm(level) {
    if (timerSettings.alarmSound === "off") {
      speakLevelAnnouncement(level);
      return;
    }

    const audioContext = audioContextRef.current;
    if (!audioContext || audioContext.state !== "running") {
      console.error("Timer alarm audio is not available.");
      speakLevelAnnouncement(level);
      return;
    }

    const now = audioContext.currentTime;
    const masterVolume = audioContext.createGain();
    masterVolume.gain.setValueAtTime(timerSettings.volume, now);
    masterVolume.connect(audioContext.destination);
    const patterns = {
      "single-ding": [
        { frequency: 880, start: 0, duration: 0.6, type: "sine", volume: 0.25 },
      ],
      "double-ding": [0, 0.62].map((start) => ({
        frequency: 880,
        start,
        duration: 0.6,
        type: "sine",
        volume: 0.25,
      })),
      "triple-ding": [0, 0.62, 1.24].map((start) => ({
        frequency: 880,
        start,
        duration: 0.6,
        type: "sine",
        volume: 0.25,
      })),
      "alarm-clock": [0, 0.28, 0.56].map((start) => ({
        frequency: 1000,
        start,
        duration: 0.18,
        type: "square",
        volume: 0.12,
      })),
      "hockey-horn": [
        { frequency: 231, start: 0, duration: 1.7, type: "sawtooth", volume: 0.1 },
        { frequency: 295, start: 0, duration: 1.7, type: "sawtooth", volume: 0.1 },
        { frequency: 335, start: 0, duration: 1.7, type: "triangle", volume: 0.12 },
      ],
      "train-whistle": [0, 0.82].flatMap((start) => [
        {
          frequency: 880,
          endFrequency: 740,
          start,
          duration: 0.68,
          type: "sine",
          volume: 0.18,
        },
        {
          frequency: 1175,
          endFrequency: 988,
          start,
          duration: 0.68,
          type: "sine",
          volume: 0.16,
        },
      ]),
      "ship-horn": [
        { frequency: 131, start: 0, duration: 1.8, type: "sawtooth", volume: 0.18 },
        { frequency: 175, start: 0, duration: 1.8, type: "triangle", volume: 0.16 },
      ],
    };
    const notes = patterns[timerSettings.alarmSound];
    if (!notes) {
      console.error("Unknown timer alarm sound.", timerSettings.alarmSound);
      speakLevelAnnouncement(level);
      return;
    }

    let finalOscillator = null;
    let finalEndTime = 0;
    for (const note of notes) {
      const startTime = now + note.start;
      const endTime = startTime + note.duration;
      const oscillator = audioContext.createOscillator();
      const volume = audioContext.createGain();
      oscillator.type = note.type;
      oscillator.frequency.setValueAtTime(note.frequency, startTime);
      if (note.endFrequency) {
        oscillator.frequency.linearRampToValueAtTime(
          note.endFrequency,
          endTime,
        );
      }
      volume.gain.setValueAtTime(0.0001, startTime);
      volume.gain.exponentialRampToValueAtTime(note.volume, startTime + 0.025);
      volume.gain.setValueAtTime(note.volume, endTime - 0.08);
      volume.gain.exponentialRampToValueAtTime(0.0001, endTime);
      oscillator.connect(volume);
      volume.connect(masterVolume);
      oscillator.start(startTime);
      oscillator.stop(endTime);
      if (endTime > finalEndTime) {
        finalEndTime = endTime;
        finalOscillator = oscillator;
      }
    }

    finalOscillator?.addEventListener("ended", () => {
      speakLevelAnnouncement(level);
    });
  }

  async function previewLevelAlarm() {
    const sampleLevel = {
      smallBlind: 100,
      bigBlind: 200,
      ante: 25,
    };

    if (timerSettings.alarmSound !== "off") {
      prepareTimerAudio();
      const audioContext = audioContextRef.current;
      if (audioContext?.state === "suspended") {
        try {
          await audioContext.resume();
        } catch (error) {
          console.error("Could not start timer alarm preview.", error);
          setTimerSettingsError("The alarm preview could not be played.");
          return;
        }
      }
    }

    playLevelAlarm(sampleLevel);
  }

  useEffect(() => {
    setElapsedMs(0);
    setStartedAt(null);
    setClockNowMs(0);
  }, [activeTournamentKey]);

  useEffect(() => {
    const previousLevel = previousLevelRef.current;
    const nextLevelIndex = currentLevel?.index ?? null;

    if (
      startedAt !== null &&
      previousLevel?.tournamentKey === activeTournamentKey &&
      previousLevel.levelIndex !== null &&
      nextLevelIndex !== null &&
      nextLevelIndex > previousLevel.levelIndex
    ) {
      playLevelAlarm(currentLevel.level);
    }

    previousLevelRef.current = {
      tournamentKey: activeTournamentKey,
      levelIndex: nextLevelIndex,
    };
  }, [activeTournamentKey, currentLevel?.index, startedAt, timerSettings]);

  useEffect(() => {
    if (startedAt === null) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setClockNowMs(Date.now());
    }, 250);
    return () => window.clearInterval(intervalId);
  }, [startedAt]);

  useEffect(() => {
    if (
      startedAt !== null &&
      totalDurationMs > 0 &&
      currentElapsedMs >= totalDurationMs
    ) {
      setElapsedMs(totalDurationMs);
      setStartedAt(null);
    }
  }, [currentElapsedMs, startedAt, totalDurationMs]);

  function toggleTimer() {
    if (!activeTournament || totalDurationMs <= 0) {
      return;
    }

    const now = Date.now();
    if (startedAt !== null) {
      setElapsedMs(
        Math.min(totalDurationMs, elapsedMs + now - startedAt),
      );
      setStartedAt(null);
    } else if (elapsedMs < totalDurationMs) {
      prepareTimerAudio();
      setStartedAt(now);
    }
    setClockNowMs(now);
  }

  function resetTimer() {
    setElapsedMs(0);
    setStartedAt(null);
    setClockNowMs(Date.now());
  }

  function setTimerPosition(positionMs, now) {
    setElapsedMs(positionMs);
    if (startedAt !== null) {
      setStartedAt(now);
    }
    setClockNowMs(now);
  }

  function restartCurrentLevel() {
    if (!activeTournament) {
      return;
    }

    const now = Date.now();
    const elapsedAtAction =
      startedAt === null
        ? elapsedMs
        : Math.min(totalDurationMs, elapsedMs + now - startedAt);
    const levelAtAction = getCurrentLevel(
      activeTournament.levels,
      elapsedAtAction,
    );
    if (levelAtAction) {
      setTimerPosition(levelAtAction.startMs, now);
    }
  }

  function jumpToNextLevel() {
    if (!activeTournament) {
      return;
    }

    const now = Date.now();
    const elapsedAtAction =
      startedAt === null
        ? elapsedMs
        : Math.min(totalDurationMs, elapsedMs + now - startedAt);
    const levelAtAction = getCurrentLevel(
      activeTournament.levels,
      elapsedAtAction,
    );
    if (
      levelAtAction &&
      getCurrentLevel(activeTournament.levels, levelAtAction.endMs)
    ) {
      setTimerPosition(levelAtAction.endMs, now);
    }
  }

  function jumpToPreviousLevel() {
    if (!activeTournament) {
      return;
    }

    const now = Date.now();
    const elapsedAtAction =
      startedAt === null
        ? elapsedMs
        : Math.min(totalDurationMs, elapsedMs + now - startedAt);
    const levelAtAction = getCurrentLevel(
      activeTournament.levels,
      elapsedAtAction,
    );
    if (levelAtAction?.index > 0) {
      const previousLevel = getCurrentLevel(
        activeTournament.levels,
        Math.max(0, levelAtAction.startMs - 1),
      );
      if (previousLevel) {
        setTimerPosition(previousLevel.startMs, now);
      }
    }
  }

  return (
    <main className="container">
      <h1>Dinky Donk Tournament Timer</h1>

      <nav
        className="tab-navigation"
        role="tablist"
        aria-label="Main navigation"
      >
        {tabs.map((tab) => (
          <button
            key={tab}
            id={`tab-${tab.toLowerCase()}`}
            className={`tab-button${activeTab === tab ? " active" : ""}`}
            type="button"
            role="tab"
            aria-controls="active-panel"
            aria-selected={activeTab === tab}
            onClick={() => {
              setActiveTab(tab);
              if (tab === "Timer") {
                window.requestAnimationFrame(() => {
                  window.scrollTo({
                    top: document.documentElement.scrollHeight,
                    behavior: "smooth",
                  });
                });
              }
            }}
          >
            {tab}
          </button>
        ))}
      </nav>

      <section
        id="active-panel"
        className={`tab-panel${activeTab === "Timer" ? " timer-tab-panel" : ""}`}
        role="tabpanel"
        aria-labelledby={`tab-${activeTab.toLowerCase()}`}
      >
        {activeTab !== "Timer" && <h2>{activeTab}</h2>}
        {activeTab === "Settings" ? (
          <div className="settings-panel">
            {timerSettingsError && (
              <p className="storage-error" role="alert">
                {timerSettingsError}
              </p>
            )}
            <label className="form-field">
              Level-change alarm
              <select
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
            </div>
            <p className="settings-save-status">
              Settings save automatically on this device.
            </p>
          </div>
        ) : activeTab === "Tournament" ? (
          <div className="tournament-manager">
            {storageError && (
              <p className="storage-error" role="alert">
                {storageError}
              </p>
            )}
            {!draft && (
              <div className="tournament-heading">
                <p>Manage tournament structures and their blind levels.</p>
                <button
                  type="button"
                  onClick={startNewTournament}
                  disabled={loadingTournaments || saving}
                >
                  Create structure
                </button>
              </div>
            )}

            {loadingTournaments && <p>Loading saved structures...</p>}

            {draft && (
              <form className="tournament-form" onSubmit={saveTournament}>
                <h3>{editingId ? "Edit structure" : "New structure"}</h3>
                <label className="form-field">
                  Structure name
                  <input
                    type="text"
                    value={draft.name}
                    disabled={saving}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    required
                  />
                </label>

                <div className="tournament-details-fields">
                  <div className="tournament-cost-field">
                    <span
                      className="tournament-flag-spacer"
                      aria-hidden="true"
                    />
                    <label className="form-field">
                      Starting Chipstack
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={draft.startingChipstack}
                        disabled={saving}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            startingChipstack: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                  <div className="tournament-cost-field">
                    <span
                      className="tournament-flag-spacer"
                      aria-hidden="true"
                    />
                    <label className="form-field">
                      Buyin Cost
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={draft.buyinCost}
                        disabled={saving}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            buyinCost: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="form-field">
                      Buyin description (optional)
                      <textarea
                        rows="2"
                        value={draft.buyinDescription}
                        disabled={saving}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            buyinDescription: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                  <div className="tournament-cost-field">
                    <label className="tournament-flag form-field">
                      <span>Rebuys Allowed?</span>
                      <input
                        type="checkbox"
                        checked={draft.rebuysAllowed}
                        disabled={saving}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            rebuysAllowed: event.target.checked,
                          }))
                        }
                      />
                      </label>
                    <label className="form-field">
                      Rebuy Cost
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={draft.rebuyCost}
                        disabled={saving || !draft.rebuysAllowed}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            rebuyCost: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="form-field">
                      Rebuy description (optional)
                      <textarea
                        rows="2"
                        value={draft.rebuyDescription}
                        disabled={saving || !draft.rebuysAllowed}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            rebuyDescription: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                  <div className="tournament-cost-field">
                    <label className="tournament-flag form-field">
                      <span>Addons Allowed?</span>
                      <input
                        type="checkbox"
                        checked={draft.addonsAllowed}
                        disabled={saving}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            addonsAllowed: event.target.checked,
                          }))
                        }
                      />
                    </label>
                    <label className="form-field">
                      Addon Cost
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={draft.addonCost}
                        disabled={saving || !draft.addonsAllowed}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            addonCost: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="form-field">
                      Addon description (optional)
                      <textarea
                        rows="2"
                        value={draft.addonDescription}
                        disabled={saving || !draft.addonsAllowed}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            addonDescription: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                </div>

                <hr className="tournament-details-divider" />

                <div className="levels-heading">
                  <h4>Available Chips</h4>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        chips: [
                          ...current.chips,
                          {
                            color: "#ffffff",
                            denomination: "",
                            availableQuantity: "",
                            quantityPerPlayer: "",
                          },
                        ],
                      }))
                    }
                  >
                    Add chip
                  </button>
                </div>
                {draft.chips.length > 0 ? (
                  <div className="tournament-chip-table-wrapper">
                    <table className="tournament-chip-table tournament-chip-editor-table">
                      <thead>
                        <tr>
                          <th scope="col">Color</th>
                          <th className="numeric-column" scope="col">Denomination</th>
                          <th className="numeric-column" scope="col">Available</th>
                          <th className="numeric-column" scope="col">Per player</th>
                          <th className="numeric-column" scope="col">Per-player stack</th>
                          <th className="numeric-column" scope="col">Players supported</th>
                          <th scope="col">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {draft.chips.map((chip, index) => (
                          <tr key={index}>
                            <td>
                              <input
                                type="color"
                                value={chip.color}
                                disabled={saving}
                                aria-label={`Chip ${index + 1} color`}
                                onChange={(event) =>
                                  setDraft((current) => ({
                                    ...current,
                                    chips: current.chips.map((item, chipIndex) =>
                                      chipIndex === index
                                        ? { ...item, color: event.target.value }
                                        : item,
                                    ),
                                  }))
                                }
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={chip.denomination}
                                disabled={saving}
                                aria-label={`Chip ${index + 1} denomination`}
                                onChange={(event) =>
                                  setDraft((current) => ({
                                    ...current,
                                    chips: current.chips.map((item, chipIndex) =>
                                      chipIndex === index
                                        ? {
                                            ...item,
                                            denomination: event.target.value,
                                          }
                                        : item,
                                    ),
                                  }))
                                }
                                required
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={chip.availableQuantity}
                                disabled={saving}
                                aria-label={`Chip ${index + 1} available quantity`}
                                onChange={(event) =>
                                  setDraft((current) => ({
                                    ...current,
                                    chips: current.chips.map((item, chipIndex) =>
                                      chipIndex === index
                                        ? {
                                            ...item,
                                            availableQuantity: event.target.value,
                                          }
                                        : item,
                                    ),
                                  }))
                                }
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={chip.quantityPerPlayer}
                                disabled={saving}
                                aria-label={`Chip ${index + 1} quantity per player`}
                                onChange={(event) =>
                                  setDraft((current) => ({
                                    ...current,
                                    chips: current.chips.map((item, chipIndex) =>
                                      chipIndex === index
                                        ? {
                                            ...item,
                                            quantityPerPlayer: event.target.value,
                                          }
                                        : item,
                                    ),
                                  }))
                                }
                              />
                            </td>
                            <td>
                              <output className="chip-stack-value">
                                {chip.quantityPerPlayer === ""
                                  ? "Not set"
                                  : (
                                      Number(chip.denomination || 0) *
                                      Number(chip.quantityPerPlayer)
                                    ).toLocaleString()}
                              </output>
                            </td>
                            <td>
                              <output className="chip-stack-value chip-supported-value">
                                {getChipSupportedPlayers(chip) == null
                                  ? "∞"
                                  : formatChipNumber(
                                      getChipSupportedPlayers(chip),
                                    )}
                              </output>
                            </td>
                            <td>
                              <button
                                className="danger-button"
                                type="button"
                                disabled={saving}
                                onClick={() =>
                                  setDraft((current) => ({
                                    ...current,
                                    chips: current.chips.filter(
                                      (_, chipIndex) => chipIndex !== index,
                                    ),
                                  }))
                                }
                                aria-label={`Remove chip ${index + 1}`}
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <th colSpan="4" scope="row">Totals</th>
                          <td className="numeric-column">
                            {formatChipStackTotal(draft.chips)}
                          </td>
                          <td className="numeric-column">
                            {getMaxChipSupportedPlayers(draft.chips) == null
                              ? "∞"
                              : formatChipNumber(
                                  getMaxChipSupportedPlayers(draft.chips),
                                )}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <p className="empty-state">No chips defined.</p>
                )}
                <hr className="tournament-details-divider" />

                <div className="levels-heading">
                  <h4>Levels</h4>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        levels: [...current.levels, createEmptyLevel()],
                      }))
                    }
                  >
                    Add level
                  </button>
                </div>

                <div className="tournament-level-table-wrapper">
                  <table className="tournament-level-table tournament-level-editor-table">
                    <thead>
                      <tr>
                        <th scope="col">Level</th>
                        <th className="numeric-column" scope="col">
                          Duration (min)
                        </th>
                        <th className="numeric-column" scope="col">
                          Small Blind
                        </th>
                        <th className="numeric-column" scope="col">
                          Big Blind
                        </th>
                        <th className="numeric-column" scope="col">Ante</th>
                        <th scope="col">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {draft.levels.map((level, index) => (
                        <tr key={index}>
                          <th scope="row">
                            {level.isBreak
                              ? "Break"
                              : draft.levels
                                  .slice(0, index + 1)
                                  .filter((item) => !item.isBreak).length}
                          </th>
                          <td>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={level.duration ?? ""}
                              disabled={saving}
                              aria-label={`${
                                level.isBreak
                                  ? "Break"
                                  : `Level ${draft.levels
                                      .slice(0, index + 1)
                                      .filter((item) => !item.isBreak).length}`
                              } duration in minutes`}
                              onChange={(event) =>
                                updateLevel(index, "duration", event.target.value)
                              }
                            />
                          </td>
                          <td>
                            {!level.isBreak && (
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={level.smallBlind ?? ""}
                                disabled={saving}
                                aria-label={`Level ${draft.levels
                                  .slice(0, index + 1)
                                  .filter((item) => !item.isBreak).length} Small Blind`}
                                onChange={(event) =>
                                  updateLevel(
                                    index,
                                    "smallBlind",
                                    event.target.value,
                                  )
                                }
                              />
                            )}
                          </td>
                          <td>
                            {!level.isBreak && (
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={level.bigBlind ?? ""}
                                disabled={saving}
                                aria-label={`Level ${draft.levels
                                  .slice(0, index + 1)
                                  .filter((item) => !item.isBreak).length} Big Blind`}
                                onChange={(event) =>
                                  updateLevel(
                                    index,
                                    "bigBlind",
                                    event.target.value,
                                  )
                                }
                              />
                            )}
                          </td>
                          <td>
                            {!level.isBreak && (
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={level.ante ?? ""}
                                disabled={saving}
                                aria-label={`Level ${draft.levels
                                  .slice(0, index + 1)
                                  .filter((item) => !item.isBreak).length} ante`}
                                onChange={(event) =>
                                  updateLevel(index, "ante", event.target.value)
                                }
                              />
                            )}
                          </td>
                          <td>
                            <div className="level-action-buttons">
                              <button
                                className="danger-button"
                                type="button"
                                disabled={saving || draft.levels.length === 1}
                                onClick={() =>
                                  setDraft((current) => ({
                                    ...current,
                                    levels: current.levels.filter(
                                      (_, levelIndex) => levelIndex !== index,
                                    ),
                                  }))
                                }
                                aria-label={`Remove ${
                                  level.isBreak
                                    ? "break"
                                    : `level ${draft.levels
                                        .slice(0, index + 1)
                                        .filter((item) => !item.isBreak).length}`
                                }`}
                              >
                                Remove
                              </button>
                              {!level.isBreak && index === 0 && (
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() =>
                                    setDraft((current) => ({
                                      ...current,
                                      levels: [
                                        {
                                          duration: "",
                                          smallBlind: 0,
                                          bigBlind: 0,
                                          ante: 0,
                                          isBreak: true,
                                        },
                                        ...current.levels,
                                      ],
                                    }))
                                  }
                                >
                                  Break before
                                </button>
                              )}
                              {!level.isBreak &&
                                index < draft.levels.length - 1 &&
                                !draft.levels[index + 1].isBreak && (
                                  <button
                                    type="button"
                                    disabled={saving}
                                    onClick={() =>
                                      setDraft((current) => ({
                                        ...current,
                                        levels: [
                                          ...current.levels.slice(0, index + 1),
                                          {
                                            duration: "",
                                            smallBlind: 0,
                                            bigBlind: 0,
                                            ante: 0,
                                            isBreak: true,
                                          },
                                          ...current.levels.slice(index + 1),
                                        ],
                                      }))
                                    }
                                    aria-label={`Insert break after level ${draft.levels
                                      .slice(0, index + 1)
                                      .filter((item) => !item.isBreak).length}`}
                                  >
                                    Break after
                                  </button>
                                )}
                              {!level.isBreak && (
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() => insertLevelAfter(index)}
                                  aria-label={`Insert level after level ${draft.levels
                                    .slice(0, index + 1)
                                    .filter((item) => !item.isBreak).length}`}
                                >
                                  Insert level
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="tournament-form-actions">
                  {editingId && (
                    <button
                      className="danger-button"
                      type="button"
                      disabled={saving}
                      onClick={() => deleteTournament(editingId)}
                    >
                      Delete structure
                    </button>
                  )}
                  <div className="form-actions">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        setDraft(null);
                        setEditingId(null);
                      }}
                    >
                      Cancel
                    </button>
                    <button type="submit" disabled={saving}>
                      {saving ? "Saving…" : "Save structure"}
                    </button>
                  </div>
                </div>
              </form>
            )}

            {!draft &&
              (!loadingTournaments && tournaments.length === 0 ? (
                <p className="empty-state">No tournament structures yet.</p>
              ) : tournaments.length > 0 ? (
                <ul className="tournament-list">
                  {tournaments.map((tournament) => {
                    const colorUpsByLevel = getChipColorUpsByLevel(
                      tournament.chips ?? [],
                      tournament.levels,
                    );

                    return (
                    <li className="tournament-card" key={tournament.id}>
                      <div className="tournament-card-heading">
                        <h3>{tournament.name}</h3>
                        <button
                          className={
                            activeTournamentId === tournament.id
                              ? "active-tournament-button"
                              : ""
                          }
                          type="button"
                          disabled={
                            saving || activeTournamentId === tournament.id
                          }
                          aria-pressed={activeTournamentId === tournament.id}
                          onClick={() =>
                            persistTournamentData(tournaments, tournament.id)
                          }
                        >
                          {activeTournamentId === tournament.id
                            ? "Active structure"
                            : "Set as active"}
                        </button>
                        <div className="tournament-card-heading-spacer" />
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => editTournament(tournament)}
                        >
                          Edit
                        </button>
                        <button
                          className="tournament-card-toggle"
                          type="button"
                          aria-label={`${
                            (expandedTournaments[tournament.id] ??
                              activeTournamentId === tournament.id)
                              ? "Collapse"
                              : "Expand"
                          } ${tournament.name}`}
                          aria-expanded={
                            expandedTournaments[tournament.id] ??
                            activeTournamentId === tournament.id
                          }
                          onClick={() =>
                            setExpandedTournaments((current) => ({
                              ...current,
                              [tournament.id]: !(
                                current[tournament.id] ??
                                activeTournamentId === tournament.id
                              ),
                            }))
                          }
                        >
                          <span
                            className={`tournament-card-chevron${
                              (expandedTournaments[tournament.id] ??
                                activeTournamentId === tournament.id)
                                ? " expanded"
                                : ""
                            }`}
                            aria-hidden="true"
                          />
                        </button>
                      </div>
                      {(expandedTournaments[tournament.id] ??
                        activeTournamentId === tournament.id) && (
                        <div className="tournament-card-content">
                      <h4 className="tournament-card-section-title">Costs</h4>
                      <dl className="tournament-details">
                        <div>
                          <dt>Starting Chipstack</dt>
                          <dd>{tournament.startingChipstack ?? "Not set"}</dd>
                        </div>
                        <div>
                          <dt>Rebuys Allowed?</dt>
                          <dd>{tournament.rebuysAllowed ? "Yes" : "No"}</dd>
                        </div>
                        <div>
                          <dt>Addons Allowed?</dt>
                          <dd>{tournament.addonsAllowed ? "Yes" : "No"}</dd>
                        </div>
                        <div>
                          <dt>Buyin Cost</dt>
                          <dd>
                            {tournament.buyinCost ?? "Not set"}
                            {tournament.buyinDescription && (
                              <span className="tournament-cost-description">
                                {tournament.buyinDescription}
                              </span>
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Rebuy Cost</dt>
                          <dd>
                            {tournament.rebuyCost ?? "Not set"}
                            {tournament.rebuyDescription && (
                              <span className="tournament-cost-description">
                                {tournament.rebuyDescription}
                              </span>
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Addon Cost</dt>
                          <dd>
                            {tournament.addonCost ?? "Not set"}
                            {tournament.addonDescription && (
                              <span className="tournament-cost-description">
                                {tournament.addonDescription}
                              </span>
                            )}
                          </dd>
                        </div>
                      </dl>
                      <div className="tournament-chips">
                        <h4 className="tournament-card-section-title">
                          Available Chips
                        </h4>
                        {tournament.chips?.length ? (
                          <div className="tournament-chip-table-wrapper">
                            <table className="tournament-chip-table">
                              <thead>
                                <tr>
                                  <th scope="col">Color</th>
                                  <th className="numeric-column" scope="col">Denomination</th>
                                  <th className="numeric-column" scope="col">Available</th>
                                  <th className="numeric-column" scope="col">Per player</th>
                                  <th className="numeric-column" scope="col">Per-player stack</th>
                                  <th className="numeric-column" scope="col">Players supported</th>
                                </tr>
                              </thead>
                              <tbody>
                                {tournament.chips.map((chip, index) => (
                                  <tr key={index}>
                                    <td>
                                      <span
                                        className="chip-color-swatch"
                                        style={{ backgroundColor: chip.color }}
                                        aria-label={chip.color}
                                      />
                                    </td>
                                    <td className="numeric-column">{formatChipNumber(chip.denomination)}</td>
                                    <td className="numeric-column">
                                      {chip.availableQuantity == null
                                        ? "—"
                                        : formatChipNumber(chip.availableQuantity)}
                                    </td>
                                    <td className="numeric-column">
                                      {chip.quantityPerPlayer == null
                                        ? "—"
                                        : formatChipNumber(chip.quantityPerPlayer)}
                                    </td>
                                    <td className="numeric-column">
                                      {chip.quantityPerPlayer == null
                                        ? "—"
                                        : formatChipNumber(
                                            Number(chip.denomination) *
                                              Number(chip.quantityPerPlayer),
                                          )}
                                    </td>
                                    <td className="numeric-column">
                                      {getChipSupportedPlayers(chip) != null
                                        ? formatChipNumber(
                                            getChipSupportedPlayers(chip),
                                          )
                                        :
                                        "∞"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr>
                                  <th colSpan="4" scope="row">
                                    Totals
                                  </th>
                                  <td className="numeric-column">
                                    {formatChipStackTotal(tournament.chips)}
                                  </td>
                                  <td className="numeric-column">
                                    {getMaxChipSupportedPlayers(tournament.chips) != null
                                      ? formatChipNumber(
                                          getMaxChipSupportedPlayers(
                                            tournament.chips,
                                          ),
                                        )
                                      : "∞"}
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        ) : (
                          <p className="empty-state">No chips defined.</p>
                        )}
                      </div>
                      <div className="tournament-level-table-wrapper">
                        <h4 className="tournament-card-section-title">
                          Blinds Schedule
                        </h4>
                        <table className="tournament-level-table">
                          <thead>
                            <tr>
                              <th scope="col">Level</th>
                              <th className="numeric-column" scope="col">
                                Duration (min)
                              </th>
                              <th className="numeric-column" scope="col">
                                Small Blind
                              </th>
                              <th className="numeric-column" scope="col">
                                Big Blind
                              </th>
                              <th className="numeric-column" scope="col">
                                Ante
                              </th>
                              <th scope="col">Color up</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tournament.levels.map((level, index) => (
                              <tr key={index}>
                                <th scope="row">
                                  {level.isBreak
                                    ? "Break"
                                    : tournament.levels
                                        .slice(0, index + 1)
                                        .filter((item) => !item.isBreak)
                                        .length}
                                </th>
                                <td className="numeric-column level-numeric-value">
                                  {formatChipNumber(level.duration ?? 0)}
                                </td>
                                <td className="numeric-column level-numeric-value">
                                  {level.isBreak
                                    ? "—"
                                    : formatChipNumber(level.smallBlind ?? 0)}
                                </td>
                                <td className="numeric-column level-numeric-value">
                                  {level.isBreak
                                    ? "—"
                                    : formatChipNumber(level.bigBlind ?? 0)}
                                </td>
                                <td className="numeric-column level-numeric-value">
                                  {level.isBreak
                                    ? "—"
                                    : formatChipNumber(level.ante ?? 0)}
                                </td>
                                <td>
                                  {(colorUpsByLevel.get(index) ?? []).map(
                                    (chip, chipIndex) => (
                                      <span
                                        className="chip-color-up"
                                        key={`${chip.color}-${chipIndex}`}
                                      >
                                        <span
                                          className="chip-color-swatch"
                                          style={{
                                            backgroundColor: chip.color,
                                          }}
                                          aria-hidden="true"
                                        />
                                        Color up{" "}
                                        {formatChipNumber(chip.denomination)}{" "}
                                        chips
                                      </span>
                                    ),
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                        </div>
                      )}
                    </li>
                    );
                  })}
                </ul>
              ) : null)}
          </div>
        ) : (
          <div
            className={`active-structure-panel${activeTab === "Timer" ? " timer-panel-content" : ""}`}
          >
            {activeTournament ? (
              activeTab === "Timer" ? (
                <div className="timer-display">
                  <div className="timer-current-blinds-row">
                    <div className="timer-blinds-group">
                      <p className="timer-blinds" aria-hidden={!currentLevel}>
                        {!currentLevel
                          ? "\u00a0"
                          : currentLevel.level.isBreak
                            ? "BREAK"
                            : `${formatChipNumber(currentLevel.level.smallBlind ?? 0)}/${formatChipNumber(currentLevel.level.bigBlind ?? 0)}${
                                Number(currentLevel.level.ante ?? 0) > 0
                                  ? ` + ${formatChipNumber(currentLevel.level.ante)}`
                                  : ""
                              }`}
                      </p>
                      <p className="timer-blinds-label">Current Blinds</p>
                    </div>
                    {currentLevel && (
                      <div className="timer-next-blinds-group">
                        <p className="timer-next-blinds">
                          {!nextLevel
                            ? "Last Level"
                            : nextLevel.level.isBreak
                              ? "BREAK"
                              : `${
                                  formatChipNumber(nextLevel.level.smallBlind ?? 0)
                                }/${formatChipNumber(nextLevel.level.bigBlind ?? 0)}${
                                  Number(nextLevel.level.ante ?? 0) > 0
                                    ? ` + ${formatChipNumber(nextLevel.level.ante)}`
                                    : ""
                                }`}
                        </p>
                        <p className="timer-next-blinds-label">Next Blinds</p>
                      </div>
                    )}
                  </div>
                  <div className="timer-left-chips" aria-label="Chips in use">
                    {timerChips.map((chip) => (
                      <div
                        className={[
                          "timer-chip",
                          chip.isColoringUp && !chip.isExiting
                            ? "timer-chip-coloring-up"
                            : "",
                          chip.isEntering ? "timer-chip-entering" : "",
                          chip.isExiting ? "timer-chip-removing" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        key={chip.key}
                        style={{ "--chip-color": chip.color }}
                        onAnimationEnd={(event) =>
                          finishTimerChipAnimation(
                            chip.key,
                            event.animationName,
                          )
                        }
                        role="img"
                        aria-hidden={chip.isExiting}
                        aria-label={`${formatChipNumber(chip.denomination)} chip`}
                      >
                        {formatChipNumber(chip.denomination)}
                      </div>
                    ))}
                  </div>
                  <div className="timer-clock-area">
                    {currentLevel ? (
                      <div className={`timer-countdown timer-progress-${progressColor}`}>
                        <svg
                          className="timer-progress-ring"
                          viewBox="0 0 100 100"
                          aria-hidden="true"
                        >
                          <circle
                            className="timer-progress-track"
                            cx="50"
                            cy="50"
                            r="46"
                          />
                          <circle
                            className="timer-progress-value"
                            cx="50"
                            cy="50"
                            r="46"
                            style={{
                              strokeDashoffset:
                                289.03 * (1 - levelProgress),
                            }}
                          />
                        </svg>
                        <p className="timer-clock" aria-live="off">
                          {formatClock(currentLevel.remainingMs)}
                        </p>
                      </div>
                    ) : (
                      <p className="timer-complete">
                        {totalDurationMs === 0
                          ? "This structure has no timed levels."
                          : "Tournament complete"}
                      </p>
                    )}
                  </div>
                  <div
                    className="timer-grid-spacer timer-right-middle"
                    aria-hidden="true"
                  />
                  <div className="timer-bottom-center">
                    <div className="timer-controls">
                    <button
                      className="timer-control-button"
                      type="button"
                      onClick={resetTimer}
                      disabled={elapsedMs === 0 && startedAt === null}
                      aria-label="Reset timer"
                      title="Reset timer"
                    >
                      <TimerIcon name="reset" />
                    </button>
                    <button
                      className="timer-control-button"
                      type="button"
                      onClick={jumpToPreviousLevel}
                      disabled={!currentLevel || currentLevel.index === 0}
                      aria-label="Rewind to previous level"
                      title="Rewind to previous level"
                    >
                      <TimerIcon name="previous" />
                    </button>
                    <button
                      className="timer-control-button"
                      type="button"
                      onClick={restartCurrentLevel}
                      disabled={!currentLevel}
                      aria-label="Reset this level"
                      title="Reset this level"
                    >
                      <TimerIcon name="rewind" />
                    </button>
                    <button
                      className="timer-toggle"
                      type="button"
                      onClick={toggleTimer}
                      disabled={
                        totalDurationMs === 0 ||
                        (startedAt === null && elapsedMs >= totalDurationMs)
                      }
                      aria-label={
                        startedAt === null ? "Play timer" : "Pause timer"
                      }
                      title={startedAt === null ? "Play timer" : "Pause timer"}
                    >
                      <TimerIcon
                        name={startedAt === null ? "play" : "pause"}
                      />
                    </button>
                    <button
                      className="timer-control-button"
                      type="button"
                      onClick={jumpToNextLevel}
                      disabled={
                        !currentLevel ||
                        !getCurrentLevel(
                          activeTournament.levels,
                          currentLevel.endMs,
                        )
                      }
                      aria-label="Jump to next level"
                      title="Jump to next level"
                    >
                      <TimerIcon name="next" />
                    </button>
                    <label className="timer-volume-control">
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
                    </div>
                  </div>
                  <div
                    className="timer-grid-spacer timer-right-bottom"
                    aria-hidden="true"
                  />
                </div>
              ) : (
                <div>
                  <h3>Active structure: {activeTournament.name}</h3>
                  <p>This structure will be used by the tournament timer.</p>
                  <p>
                    Placeholder content for the {activeTab.toLowerCase()} tab.
                  </p>
                </div>
              )
            ) : (
              <>
                <p>No active structure selected.</p>
                <button
                  type="button"
                  onClick={() => setActiveTab("Tournament")}
                >
                  Choose a tournament structure
                </button>
              </>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

export default App;
