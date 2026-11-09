import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  getChipsInUse,
  getCurrentLevel,
  getLevelDurationMs,
} from "../../domain/tournament";
import { playTimerAlarm } from "./timerAudio";

export function useTimer({
  activeTab,
  activeTournament,
  timerMessages,
  timerSettings,
  setTimerSettingsError,
  updateTournamentTimer,
}) {
  const [clockNowMs, setClockNowMs] = useState(Date.now);
  const [timerMessageIndex, setTimerMessageIndex] = useState(0);
  const [timerChips, setTimerChips] = useState([]);
  const [timerFullscreenError, setTimerFullscreenError] = useState("");
  const [timerIsFullscreen, setTimerIsFullscreen] = useState(false);
  const timerChipsTargetRef = useRef([]);
  const timerPanelRef = useRef(null);
  const fullscreenExitInProgressRef = useRef(false);
  const fullscreenExitTimerRef = useRef(null);
  const audioContextRef = useRef(null);
  const previousLevelRef = useRef(null);
  const previousWarningLevelRef = useRef(null);
  const completedTimerTournamentRef = useRef(null);

  const elapsedMs = activeTournament?.timerElapsedMs ?? 0;
  const timerIsRunning = activeTournament?.timerIsRunning ?? false;
  const startedAt = timerIsRunning
    ? (activeTournament?.timerStartedAt ?? null)
    : null;

  const activeTournamentKey = activeTournament
    ? JSON.stringify({
        ...activeTournament,
        buyinCount: undefined,
        rebuyCount: undefined,
        addonCount: undefined,
        otherPrizePool: undefined,
        otherChipstack: undefined,
        bustoutCount: undefined,
        payoutPlaces: undefined,
        payouts: undefined,
        maxPlayersPerTable: undefined,
        timerIsRunning: undefined,
        timerStartedAt: undefined,
        timerElapsedMs: undefined,
      })
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
  const nextLevel =
    activeTournament && currentLevel
      ? getCurrentLevel(activeTournament.levels, currentLevel.endMs)
      : null;
  const secondProgress = currentLevel
    ? (currentLevel.remainingMs % 60_000 || 60_000) / 60_000
    : 0;
  const minuteProgress = currentLevel
    ? (Math.floor(currentLevel.remainingMs / 60_000) % 60) / 60
    : 0;
  const hourProgress = currentLevel
    ? (Math.floor(currentLevel.remainingMs / 3_600_000) % 12) / 12
    : 0;
  const progressColor =
    currentLevel?.remainingMs > 60_000
      ? "green"
      : currentLevel?.remainingMs >= 30_000
        ? "yellow"
        : "red";
  const activeTimerMessageIndex = timerMessages.length
    ? timerMessageIndex % timerMessages.length
    : 0;

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
      const previousByKey = new Map(
        previousChips.map((chip) => [chip.key, chip]),
      );
      const nextChips = targetChips.map((chip) => ({
        ...chip,
        isEntering: previousByKey.get(chip.key)?.isEntering ?? true,
        isExiting: false,
      }));
      const targetKeys = new Set(targetChips.map((chip) => chip.key));
      const exitingChips = previousChips
        .filter((chip) => !targetKeys.has(chip.key))
        .map((chip) => ({ ...chip, isEntering: false, isExiting: true }));

      return exitingChips.length > 0
        ? [...nextChips, ...exitingChips]
        : nextChips;
    });
  }, [activeTournament, currentLevel?.index]);

  useEffect(() => {
    setClockNowMs(Date.now());
  }, [activeTournament?.id]);

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
    const levelKey =
      activeTournament?.id && currentLevel
        ? `${activeTournament.id}:${currentLevel.index}`
        : null;
    const previousWarning = previousWarningLevelRef.current;
    const warningThresholdMs =
      timerSettings.countdownWarningSeconds * 1_000;
    const sameLevel = previousWarning?.levelKey === levelKey;
    let armed = sameLevel ? previousWarning.armed : true;

    if (levelKey !== null) {
      if (currentLevel.remainingMs > warningThresholdMs) {
        armed = true;
      } else if (startedAt !== null && armed) {
        playLevelAlarm(
          currentLevel.level,
          timerSettings.countdownWarningSound,
          speakCountdownWarningAfterAlarm,
        );
        armed = false;
      }
    } else {
      armed = true;
    }

    previousWarningLevelRef.current = { levelKey, armed };
  }, [
    activeTournament?.id,
    currentLevel?.index,
    currentLevel?.remainingMs,
    startedAt,
    timerSettings.countdownWarningSeconds,
  ]);

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
    function updateKeepAwake() {
      const enabled =
        activeTab === "Timer" &&
        startedAt !== null &&
        document.visibilityState === "visible";
      invoke("set_keep_awake", { enabled }).catch((error) => {
        console.error("Could not update keep-awake state.", error);
      });
    }

    function releaseKeepAwake() {
      invoke("set_keep_awake", { enabled: false }).catch((error) => {
        console.error("Could not release keep-awake state.", error);
      });
    }

    updateKeepAwake();
    document.addEventListener("visibilitychange", updateKeepAwake);
    window.addEventListener("pagehide", releaseKeepAwake);

    return () => {
      document.removeEventListener("visibilitychange", updateKeepAwake);
      window.removeEventListener("pagehide", releaseKeepAwake);
    };
  }, [activeTab, startedAt]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setTimerMessageIndex((index) =>
        timerMessages.length ? (index + 1) % timerMessages.length : 0,
      );
    }, 10_000);
    return () => window.clearInterval(intervalId);
  }, [timerMessages.length]);

  useEffect(() => {
    if (
      startedAt !== null &&
      totalDurationMs > 0 &&
      currentElapsedMs >= totalDurationMs
    ) {
      if (completedTimerTournamentRef.current !== activeTournament?.id) {
        completedTimerTournamentRef.current = activeTournament?.id ?? null;
        updateTournamentTimer(activeTournament.id, {
          timerElapsedMs: totalDurationMs,
          timerStartedAt: null,
          timerIsRunning: false,
        });
      }
    }
  }, [
    activeTournament?.id,
    currentElapsedMs,
    startedAt,
    totalDurationMs,
    updateTournamentTimer,
  ]);

  useEffect(() => {
    function updateFullscreenState() {
      setTimerIsFullscreen(
        document.fullscreenElement === timerPanelRef.current,
      );
      if (document.fullscreenElement !== timerPanelRef.current) {
        fullscreenExitInProgressRef.current = false;
        window.clearTimeout(fullscreenExitTimerRef.current);
        fullscreenExitTimerRef.current = null;
      }
    }

    document.addEventListener("fullscreenchange", updateFullscreenState);
    return () =>
      document.removeEventListener("fullscreenchange", updateFullscreenState);
  }, []);

  useEffect(() => {
    if (
      activeTab !== "Timer" &&
      document.fullscreenElement === timerPanelRef.current
    ) {
      document.exitFullscreen().catch((error) => {
        console.error("Could not exit timer fullscreen after navigation.", error);
        setTimerFullscreenError("Could not exit fullscreen mode.");
      });
    }
  }, [activeTab]);

  useEffect(() => {
    if (!timerIsFullscreen) {
      return undefined;
    }

    function exitFullscreenAtScreenTop(event) {
      if (event.clientY > 1) {
        window.clearTimeout(fullscreenExitTimerRef.current);
        fullscreenExitTimerRef.current = null;
        return;
      }

      if (
        fullscreenExitTimerRef.current !== null ||
        fullscreenExitInProgressRef.current
      ) {
        return;
      }

      fullscreenExitTimerRef.current = window.setTimeout(() => {
        fullscreenExitTimerRef.current = null;
        if (document.fullscreenElement !== timerPanelRef.current) {
          return;
        }

        fullscreenExitInProgressRef.current = true;
        document.exitFullscreen().catch((error) => {
          fullscreenExitInProgressRef.current = false;
          console.error(
            "Could not exit timer fullscreen at screen edge.",
            error,
          );
          setTimerFullscreenError("Could not exit fullscreen mode.");
        });
      }, 500);
    }

    window.addEventListener("mousemove", exitFullscreenAtScreenTop);
    return () => {
      window.removeEventListener("mousemove", exitFullscreenAtScreenTop);
      window.clearTimeout(fullscreenExitTimerRef.current);
      fullscreenExitTimerRef.current = null;
    };
  }, [timerIsFullscreen]);

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
    announcement.rate = timerSettings.announcementSpeed;
    window.speechSynthesis.speak(announcement);
  }

  function speakCountdownWarning() {
    if (!timerSettings.countdownWarningSpeechEnabled) {
      return;
    }

    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      console.error("Speech synthesis is not available in this browser.");
      return;
    }

    const text = timerSettings.countdownWarningAnnouncement.replace(
      /\{seconds\}/g,
      String(timerSettings.countdownWarningSeconds),
    );
    if (!text.trim()) {
      return;
    }

    const announcement = new window.SpeechSynthesisUtterance(text);
    announcement.volume = timerSettings.volume;
    announcement.rate = timerSettings.announcementSpeed;
    window.speechSynthesis.speak(announcement);
  }

  function speakCountdownWarningAfterAlarm() {
    window.setTimeout(speakCountdownWarning, 1_000);
  }

  function playLevelAlarm(
    level,
    sound = timerSettings.alarmSound,
    onComplete = () =>
      window.setTimeout(() => speakLevelAnnouncement(level), 1_000),
  ) {
    playTimerAlarm(
      audioContextRef.current,
      timerSettings.volume,
      sound,
      onComplete,
    );
  }

  async function previewAlarm(sound, onComplete, errorMessage) {
    if (sound !== "off") {
      prepareTimerAudio();
      const audioContext = audioContextRef.current;
      if (audioContext?.state === "suspended") {
        try {
          await audioContext.resume();
        } catch (error) {
          console.error(errorMessage.log, error);
          setTimerSettingsError(errorMessage.display);
          return;
        }
      }
    }

    playLevelAlarm(
      { smallBlind: 100, bigBlind: 200, ante: 25 },
      sound,
      onComplete,
    );
  }

  function previewLevelAlarm() {
    return previewAlarm(
      timerSettings.alarmSound,
      undefined,
      {
        log: "Could not start timer alarm preview.",
        display: "The alarm preview could not be played.",
      },
    );
  }

  function previewCountdownWarning() {
    return previewAlarm(
      timerSettings.countdownWarningSound,
      speakCountdownWarningAfterAlarm,
      {
        log: "Could not start countdown warning preview.",
        display: "The countdown warning preview could not be played.",
      },
    );
  }

  function finishTimerChipAnimation(key, animationName) {
    if (animationName === "timer-chip-remove") {
      setTimerChips((chips) => {
        const remainingChips = chips.filter((chip) => chip.key !== key);
        if (remainingChips.some((chip) => chip.isExiting)) {
          return remainingChips;
        }

        const remainingByKey = new Map(
          remainingChips.map((chip) => [chip.key, chip]),
        );
        return timerChipsTargetRef.current.map((chip) => ({
          ...chip,
          isEntering: remainingByKey.has(chip.key)
            ? remainingByKey.get(chip.key).isEntering
            : true,
          isExiting: false,
        }));
      });
    } else if (animationName === "timer-chip-add") {
      setTimerChips((chips) =>
        chips.map((chip) =>
          chip.key === key ? { ...chip, isEntering: false } : chip,
        ),
      );
    }
  }

  async function toggleTimerFullscreen() {
    try {
      setTimerFullscreenError("");
      if (document.fullscreenElement === timerPanelRef.current) {
        await document.exitFullscreen();
      } else {
        if (!timerPanelRef.current?.requestFullscreen) {
          setTimerFullscreenError("Fullscreen mode is not available.");
          return;
        }
        await timerPanelRef.current.requestFullscreen();
      }
    } catch (error) {
      console.error("Could not toggle timer fullscreen.", error);
      setTimerFullscreenError("Could not change fullscreen mode.");
    }
  }

  function toggleTimer() {
    if (!activeTournament || totalDurationMs <= 0) {
      return;
    }

    const now = Date.now();
    if (timerIsRunning) {
      const elapsedSinceStart =
        activeTournament.timerStartedAt === null ||
        activeTournament.timerStartedAt === undefined
          ? 0
          : now - activeTournament.timerStartedAt;
      updateTournamentTimer(activeTournament.id, {
        timerElapsedMs: Math.min(
          totalDurationMs,
          elapsedMs + elapsedSinceStart,
        ),
        timerStartedAt: null,
        timerIsRunning: false,
      });
    } else if (elapsedMs < totalDurationMs) {
      prepareTimerAudio();
      completedTimerTournamentRef.current = null;
      updateTournamentTimer(activeTournament.id, {
        timerElapsedMs: elapsedMs,
        timerStartedAt: now,
        timerIsRunning: true,
      });
    }
    setClockNowMs(now);
  }

  function resetTimer() {
    completedTimerTournamentRef.current = null;
    if (activeTournament) {
      updateTournamentTimer(activeTournament.id, {
        timerElapsedMs: 0,
        timerStartedAt: null,
        timerIsRunning: false,
      });
    }
    setClockNowMs(Date.now());
  }

  function setTimerPosition(positionMs, now) {
    completedTimerTournamentRef.current = null;
    if (activeTournament) {
      updateTournamentTimer(activeTournament.id, {
        timerElapsedMs: positionMs,
        timerStartedAt: timerIsRunning ? now : null,
        timerIsRunning,
      });
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

  return {
    activeTimerMessageIndex,
    activeTimerMessage: timerMessages[activeTimerMessageIndex],
    currentLevel,
    elapsedMs,
    finishTimerChipAnimation,
    hourProgress,
    jumpToNextLevel,
    jumpToPreviousLevel,
    minuteProgress,
    nextLevel,
    previewCountdownWarning,
    previewLevelAlarm,
    progressColor,
    resetTimer,
    restartCurrentLevel,
    secondProgress,
    startedAt,
    timerChips,
    timerFullscreenError,
    timerIsFullscreen,
    timerPanelRef,
    toggleTimer,
    toggleTimerFullscreen,
    totalDurationMs,
  };
}
