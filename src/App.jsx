import { useEffect, useMemo, useRef, useState } from "react";
import { Joyride, STATUS } from "react-joyride";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { downloadDir } from "@tauri-apps/api/path";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  createNextLevel,
  DEFAULT_ALLOW_PAYOUT_OVERRIDE,
  DEFAULT_PAYOUT_MODEL,
  DEFAULT_PERCENT_PAID,
  formatCurrency,
  getEntryContributions,
  getEffectivePayouts,
  getPayoutTimerMessage,
  normalizeEdgeSpotQuantity,
  normalizeMaxPlayersPerTable,
  sortChips,
  sortLevels,
} from "./domain/tournament";
import {
  createTournamentCsvExports,
  sanitizeTournamentCsvFilename,
} from "./domain/tournamentCsv";
import {
  MAX_PARTICIPANT_COUNT,
  participantFields,
  previewParticipantCount,
} from "./domain/participants";
import TimerPanel, { TimerIcon } from "./features/timer/TimerPanel";
import { useTimer } from "./features/timer/useTimer";
import { useTournaments } from "./features/tournaments/useTournaments";
import AboutPanel from "./features/about/AboutPanel";
import { checkForNewRelease, releasesPageUrl } from "./features/about/releaseCheck";
import CurrencyInput from "./components/CurrencyInput";
import SettingsPanel from "./features/settings/SettingsPanel";
import { useTimerSettings } from "./features/settings/useTimerSettings";
import TournamentEditor from "./features/tournaments/TournamentEditor";
import TournamentList from "./features/tournaments/TournamentList";
import "./App.css";

const tabs = ["Tournaments", "Settings", "About"];
const userTourStorageKey = "dinkydonk-user-tour-seen";

function createTournamentDraft(tournament) {
  return {
    name: tournament.name,
    startingChipstack: tournament.startingChipstack ?? "",
    rebuysAllowed: tournament.rebuysAllowed ?? false,
    addonsAllowed: tournament.addonsAllowed ?? false,
    buyinCost: tournament.buyinCost ?? "",
    buyinDescription: tournament.buyinDescription ?? "",
    rebuyCost: tournament.rebuyCost ?? "",
    rebuyChipstack: tournament.rebuyChipstack ?? "",
    rebuyDescription: tournament.rebuyDescription ?? "",
    addonCost: tournament.addonCost ?? "",
    addonChipstack: tournament.addonChipstack ?? "",
    addonDescription: tournament.addonDescription ?? "",
    percentPaid: tournament.percentPaid ?? DEFAULT_PERCENT_PAID,
    payoutModel: tournament.payoutModel ?? DEFAULT_PAYOUT_MODEL,
    allowPayoutOverride:
      tournament.allowPayoutOverride ?? DEFAULT_ALLOW_PAYOUT_OVERRIDE,
    chips: sortChips(
      (tournament.chips ?? []).map((chip) => ({
        ...chip,
        denomination: String(chip.denomination ?? ""),
        availableQuantity: chip.availableQuantity ?? "",
        quantityPerPlayer: chip.quantityPerPlayer ?? "",
        edgeSpotQuantity: normalizeEdgeSpotQuantity(
          chip.edgeSpotQuantity,
        ),
      })),
    ),
    levels: sortLevels(tournament.levels).map((level) => ({ ...level })),
  };
}

function App() {
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [runUserTour, setRunUserTour] = useState(false);
  const [splashVisible, setSplashVisible] = useState(true);
  const [splashExiting, setSplashExiting] = useState(false);
  const [minimumSplashTimeElapsed, setMinimumSplashTimeElapsed] =
    useState(false);
  const [editingId, setEditingId] = useState(null);
  const [creatingStructure, setCreatingStructure] = useState(false);
  const [structureCreationError, setStructureCreationError] = useState("");
  const [editSectionToActivate, setEditSectionToActivate] = useState(null);
  const [draft, setDraft] = useState(null);
  const [entriesCollapsed, setEntriesCollapsed] = useState(false);
  const [bustoutsCollapsed, setBustoutsCollapsed] = useState(false);
  const [payoutsCollapsed, setPayoutsCollapsed] = useState(false);
  const [tablesCollapsed, setTablesCollapsed] = useState(false);
  const [tournamentExportError, setTournamentExportError] = useState("");
  const [tournamentExportNotice, setTournamentExportNotice] = useState("");
  const [newRelease, setNewRelease] = useState(null);
  const [releaseLinkError, setReleaseLinkError] = useState("");
  const tournamentState = useTournaments();
  const {
    activeTournament,
    activeTournamentId,
    copyTournament,
    deleteTournament: removeTournament,
    entryCountDrafts,
    expandedTournamentId,
    loadingTournaments,
    loadTournaments,
    persistTournamentData,
    payoutDrafts,
    payoutPlaceDrafts,
    resetBustoutCount,
    resetEntryCounts,
    resetPayouts,
    resetTables,
    saveTournament: saveTournamentData,
    saving,
    setEntryCountDrafts,
    setExpandedTournamentId,
    setPayoutDrafts,
    setPayoutPlaceDrafts,
    setTableMaxDrafts,
    storageError,
    tableMaxDrafts,
    tournaments,
    flushTournamentFieldUpdates,
    updateTournamentField,
    updateTournamentTimer,
  } = tournamentState;
  const {
    changingSettingsDirectory,
    changeSettingsFile,
    setTimerSettings,
    setTimerSettingsError,
    settingsDirectory,
    timerSettings,
    timerSettingsError,
    timerSettingsLoaded,
  } = useTimerSettings(loadTournaments, flushTournamentFieldUpdates);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeoutId = window.setTimeout(() => controller.abort(), 10_000);
    checkForNewRelease(APP_VERSION, controller.signal)
      .then((version) => {
        if (active) setNewRelease(version);
      })
      .catch((error) => {
        if (active) console.error("Could not check for a new version.", error);
      })
      .finally(() => window.clearTimeout(timeoutId));
    return () => {
      active = false;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(
      () => setMinimumSplashTimeElapsed(true),
      5_000,
    );
    return () => window.clearTimeout(timeoutId);
  }, []);

  const startupReady =
    !loadingTournaments && timerSettingsLoaded && minimumSplashTimeElapsed;

  useEffect(() => {
    if (!startupReady) {
      return undefined;
    }

    setSplashExiting(true);
    const timeoutId = window.setTimeout(() => setSplashVisible(false), 450);
    return () => window.clearTimeout(timeoutId);
  }, [startupReady]);

  useEffect(() => {
    if (!loadingTournaments && localStorage.getItem(userTourStorageKey) !== "true") {
      setRunUserTour(true);
    }
  }, [loadingTournaments]);

  const userTourSteps = useMemo(() => [
    {
      target: '[data-tour="app-title"]',
      content:
        "Welcome to Dinky Donk, a tournament timer for managing your structure, entries, and payouts.",
      placement: "bottom",
      skipBeacon: true,
    },
    {
      target: "#tab-tournaments",
      content:
        "Manage your tournament structures here. The Settings and About tabs are available from this navigation.",
      placement: "bottom",
    },
    ...(!draft
      ? [
          {
            target: '[data-tour="create-structure"]',
            content:
              "Create a structure prefilled with the starter stack, chips, and blind schedule, then customize it.",
            placement: "bottom",
          },
          {
            target:
              tournaments.length > 0
                ? '[data-tour="saved-structures"]'
                : '[data-tour="empty-structures"]',
            content:
              "Saved structures appear here. Choose Go to Timer on a structure to open its fullscreen tournament timer.",
            placement: "top",
            before: async () => {
              if (document.fullscreenElement === timer.timerPanelRef.current) {
                await timer.toggleTimerFullscreen();
              }
              setActiveTab("Tournaments");
              await new Promise((resolve) => requestAnimationFrame(resolve));
            },
          },
        ]
      : []),
    ...(activeTournament && !draft
      ? [
          {
            target: '[data-tour="timer-clock-area"]',
            content:
              "The timer displays the time remaining in the current blind level. The timer screen's background and text colors change as the level progresses.",
            placement: "top",
            before: async () => {
              setActiveTab("Timer");
              await new Promise((resolve) => requestAnimationFrame(resolve));
              await timer.enterTimerFullscreen();
              await new Promise((resolve) => requestAnimationFrame(resolve));
            },
          },
          {
            target: '[data-tour="timer-blinds"]',
            content: "See the current and next blind level's small blind, big blind, and ante. Double-click to edit the blinds schedule.",
            placement: "top",
          },
          {
            target: '[data-tour="timer-chips"]',
            content: "See the chips in play for the current level. Chips that aren't in use are removed from this area. " +
              "Chips that won't be in use in the next level fade in and out.",
            placement: "top",
          },
          {
            target: '[data-tour="timer-transport-controls"]',
            content: "Control the tournament clock: play, pause, reset, and navigate between levels. Adjust the alarms volume using the slider.",
            placement: "top",
          },
          // {
          //   target: '[data-tour="timer-reset"]',
          //   content:
          //     "Reset the whole timer back to the start of the tournament.",
          //   placement: "top",
          // },
          // {
          //   target: '[data-tour="timer-previous-level"]',
          //   content: "Rewind to the previous blind level.",
          //   placement: "top",
          // },
          // {
          //   target: '[data-tour="timer-reset-level"]',
          //   content: "Restart the current level's clock without changing levels.",
          //   placement: "top",
          // },

          // {
          //   target: '[data-tour="timer-next-level"]',
          //   content: "Skip ahead to the next blind level.",
          //   placement: "top",
          // },
          // {
          //   target: '[data-tour="timer-volume"]',
          //   content: "Adjust the volume of the alarms and spoken timer announcements.",
          //   placement: "top",
          // },
          {
            target: '[data-tour="timer-entries"]',
            content:
              "Track buy-ins, rebuys, and add-ons here. Only enabled buy types are shown. Use the 'Other' category for any miscellaneous entries. Change a count to update chips in play and the prize pool.",
            placement: "left",
          },
          {
            target: '[data-tour="timer-paid-places"]',
            content:
              "Set how many players get paid. The calculated number is used unless you override it.",
            placement: "left",
          },
          {
            target: '[data-tour="timer-payouts"]',
            content:
              "Review or adjust each payout. Hover over an amount to see its calculated value based on the current settings. Manual editing is allowed if overrides are enabled.",
            placement: "left",
          },
          {
            target: '[data-tour="timer-bustouts"]',
            content:
              "Track or adjust bustouts here. Bustouts are used to calculate the remaining players and average stack.",
            placement: "left",
          },
          {
            target: '[data-tour="timer-tables-max"]',
            content:
              "Set the maximum number of players per table for the tournament. This helps in calculating the distribution of players across tables.",
            placement: "left",
          },
          {
            target: '[data-tour="timer-fullscreen"]',
            content:
              "Click here to exit the timer. Alternately, move your mouse to the top edge of the screen and hold it there to exit.",
            placement: "bottom",
          },
          {
            target: '[data-tour="timer-support"]',
            content:
              "Scan or click to buy the developer a coffee. The timer runs on caffeine!",
            placement: "bottom",
          },
        ]
      : []),
    {
      target: "#tab-settings",
      content:
        "Adjust timer behavior and other app preferences in Settings.",
      placement: "bottom",
      before: async () => {
        if (document.fullscreenElement === timer.timerPanelRef.current) {
          await timer.toggleTimerFullscreen();
        }
        setActiveTab("Settings");
        await new Promise((resolve) => requestAnimationFrame(resolve));
      },
    },
    {
      target: '[data-tour="tour-launcher"]',
      content: "You can restart this tour any time with this button.",
      placement: "bottom",
    },
  ], [activeTournament, draft, tournaments.length]);

  function startUserTour() {
    setActiveTab("Tournaments");
    setRunUserTour(true);
  }

  function handleUserTourCallback({ status }) {
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      localStorage.setItem(userTourStorageKey, "true");
      setRunUserTour(false);
      setActiveTab("Tournaments");
    }
  }

  useEffect(() => {
    if (!draft || !editingId || !editSectionToActivate) {
      return;
    }

    const section = document.getElementById(editSectionToActivate);
    if (!section) {
      return;
    }

    section.scrollIntoView({ behavior: "smooth", block: "center" });
    section.querySelector("input, textarea, button")?.focus({ preventScroll: true });
    setEditSectionToActivate(null);
  }, [draft, editSectionToActivate, editingId]);

  async function startNewTournament() {
    setStructureCreationError("");
    setCreatingStructure(true);
    setEditingId(null);
    try {
      const defaultTournament = await invoke(
        "get_default_tournament_structure",
      );
      setDraft(createTournamentDraft(defaultTournament));
    } catch (error) {
      console.error("Could not load the default tournament structure.", error);
      setStructureCreationError(
        "The default tournament structure could not be loaded.",
      );
    } finally {
      setCreatingStructure(false);
    }
  }

  async function exportTournament(tournament) {
    try {
      setTournamentExportError("");
      setTournamentExportNotice("");
      const csvFiles = createTournamentCsvExports(tournament);
      const filename = sanitizeTournamentCsvFilename(tournament.name);
      const files = Object.entries(csvFiles).map(([type, contents]) => ({
        filename: `${filename}-${type}.csv`,
        contents,
      }));
      const filenames = files.map((file) => file.filename);
      const downloadDirectory = await downloadDir();

      for (const file of files) {
        const url = URL.createObjectURL(
          new Blob([file.contents], { type: "text/csv;charset=utf-8" }),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = file.filename;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      }
      setTournamentExportNotice(
        `Exported ${filenames.join(" and ")} to ${downloadDirectory}.`,
      );
    } catch (error) {
      console.error("Could not export tournament CSV files.", error);
      setTournamentExportNotice("");
      setTournamentExportError(
        "One or more tournament CSV files could not be exported.",
      );
    }
  }

  function editTournament(tournament) {
    setStructureCreationError("");
    setEditingId(tournament.id);
    setDraft(createTournamentDraft(tournament));
  }

  function editTournamentSection(tournamentId, sectionId) {
    const tournament = tournaments.find((item) => item.id === tournamentId);
    if (!tournament) {
      return;
    }

    editTournament(tournament);
    setEditSectionToActivate(sectionId);
    setActiveTab("Tournaments");
  }

  async function activateTournament(tournamentId) {
    timer.enterTimerFullscreen();
    if (await persistTournamentData(tournaments, tournamentId)) {
      setActiveTab("Timer");
    }
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

      const insertedLevel = createNextLevel(level, level.duration ?? "");

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

  async function saveTournament(event) {
    event.preventDefault();
    const existingTournament = editingId
      ? tournaments.find((item) => item.id === editingId)
      : null;
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
      rebuyChipstack:
        draft.rebuyChipstack === "" ? null : Number(draft.rebuyChipstack),
      rebuyDescription: draft.rebuyDescription.trim() || null,
      addonCost: draft.addonCost === "" ? null : Number(draft.addonCost),
      addonChipstack:
        draft.addonChipstack === "" ? null : Number(draft.addonChipstack),
      addonDescription: draft.addonDescription.trim() || null,
      percentPaid: Number(draft.percentPaid ?? DEFAULT_PERCENT_PAID),
      payoutModel: draft.payoutModel ?? DEFAULT_PAYOUT_MODEL,
      allowPayoutOverride:
        draft.allowPayoutOverride ?? DEFAULT_ALLOW_PAYOUT_OVERRIDE,
      buyins: existingTournament?.buyins ?? [],
      rebuys: existingTournament?.rebuys ?? [],
      addons: existingTournament?.addons ?? [],
      otherPrizePool: existingTournament?.otherPrizePool ?? 0,
      otherChipstack: existingTournament?.otherChipstack ?? 0,
      bustouts: existingTournament?.bustouts ?? [],
      payoutPlaces: existingTournament?.payoutPlaces ?? 0,
      payouts: existingTournament?.payouts ?? [],
      maxPlayersPerTable: normalizeMaxPlayersPerTable(existingTournament?.maxPlayersPerTable),
      timerIsRunning: existingTournament?.timerIsRunning ?? false,
      timerStartedAt: existingTournament?.timerStartedAt ?? null,
      timerElapsedMs: existingTournament?.timerElapsedMs ?? 0,
      chips: sortChips(
        draft.chips.map((chip) => ({
          color: chip.color,
          edgeSpotColor: chip.edgeSpotColor ?? "#000000",
          textColor: chip.textColor ?? "#ffffff",
          edgeSpotQuantity: normalizeEdgeSpotQuantity(
            chip.edgeSpotQuantity,
          ),
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

    if (await saveTournamentData(tournament, editingId)) {
      setDraft(null);
      setEditingId(null);
    }
  }

  async function deleteTournament(id) {
    if (await removeTournament(id)) {
      if (editingId === id) {
        setDraft(null);
        setEditingId(null);
      }
    }
  }
  const activeEntryCountDrafts = activeTournament
    ? entryCountDrafts[activeTournament.id] ?? {}
    : {};
  const entryRows = activeTournament
    ? [
        {
          label: "Buy-ins",
          countField: "buyinCount",
          cost: activeTournament.buyinCost,
          chipstack: activeTournament.startingChipstack,
          enabled: true,
        },
        {
          label: "Rebuys",
          countField: "rebuyCount",
          cost: activeTournament.rebuyCost,
          chipstack: activeTournament.rebuyChipstack,
          enabled: activeTournament.rebuysAllowed,
        },
        {
          label: "Addons",
          countField: "addonCount",
          cost: activeTournament.addonCost,
          chipstack: activeTournament.addonChipstack,
          enabled: activeTournament.addonsAllowed,
        },
      ]
        .filter((entry) => entry.enabled)
        .map((entry) => {
          const count = previewParticipantCount(
            activeEntryCountDrafts[entry.countField],
            (activeTournament[participantFields[entry.countField]] ?? []).length,
          );
          return {
            ...entry,
            count,
            ...getEntryContributions(count, entry.cost, entry.chipstack),
          };
        })
    : [];
  const totalEntries = entryRows.reduce(
    (total, entry) => total + Number(entry.count ?? 0),
    0,
  );
  const totalPrizePool = entryRows.reduce(
    (total, entry) => total + entry.contribution,
    0,
  ) +
    Number(
      activeEntryCountDrafts.otherPrizePool ??
        activeTournament?.otherPrizePool ??
        0,
    );
  const totalChipsInPlay = entryRows.reduce(
    (total, entry) => total + entry.chipsInPlay,
    0,
  ) +
    Number(
      activeEntryCountDrafts.otherChipstack ??
        activeTournament?.otherChipstack ??
        0,
    );
  const storedBustoutCount = activeTournament?.bustouts?.length ?? 0;
  const startingPlayers = previewParticipantCount(
    activeEntryCountDrafts.buyinCount,
    activeTournament?.buyins?.length ?? 0,
  );
  const bustoutCount = previewParticipantCount(
    activeEntryCountDrafts.bustoutCount,
    storedBustoutCount,
    Math.min(MAX_PARTICIPANT_COUNT, Math.max(storedBustoutCount, startingPlayers)),
  );
  const remainingPlayers = Math.max(
    0,
    startingPlayers - bustoutCount,
  );
  const maxPlayersPerTable = normalizeMaxPlayersPerTable(
    tableMaxDrafts[activeTournament?.id] ?? activeTournament?.maxPlayersPerTable,
  );
  const requiredTableCount = Math.ceil(remainingPlayers / maxPlayersPerTable);
  const largerTableSize =
    requiredTableCount > 0
      ? Math.ceil(remainingPlayers / requiredTableCount)
      : null;
  const smallerTableSize =
    requiredTableCount > 0
      ? Math.floor(remainingPlayers / requiredTableCount)
      : null;
  const largerTableCount =
    requiredTableCount > 0
      ? remainingPlayers % requiredTableCount || requiredTableCount
      : 0;
  const smallerTableCount = requiredTableCount - largerTableCount;
  const tableRows = [
    {
      playersPerTable: largerTableCount > 0 ? largerTableSize : null,
      count: largerTableCount,
      total: (largerTableSize ?? 0) * largerTableCount,
    },
    {
      playersPerTable: smallerTableCount > 0 ? smallerTableSize : null,
      count: smallerTableCount,
      total: (smallerTableSize ?? 0) * smallerTableCount,
    },
  ];
  const totalPlayersAtTables = tableRows.reduce(
    (total, row) => total + row.total,
    0,
  );
  const totalTableCount = tableRows.reduce(
    (total, row) => total + row.count,
    0,
  );
  const averageChipstack =
    remainingPlayers > 0
      ? Math.round(totalChipsInPlay / remainingPlayers)
      : 0;
  const parsedPayoutPlaces = activeTournament
    ? Number(
        payoutPlaceDrafts[activeTournament.id] ??
          activeTournament.payoutPlaces ??
          0,
      )
    : 0;
  const payoutPlaces = Number.isFinite(parsedPayoutPlaces)
    ? Math.min(1_000, Math.max(0, Math.floor(parsedPayoutPlaces)))
    : 0;
  const percentPaid = Number(
    activeTournament?.percentPaid ?? DEFAULT_PERCENT_PAID,
  );
  const allowPayoutOverride =
    activeTournament?.allowPayoutOverride ?? DEFAULT_ALLOW_PAYOUT_OVERRIDE;
  const payoutValues = [...(activeTournament?.payouts ?? [])];
  if (activeTournament) {
    for (const [index, value] of Object.entries(payoutDrafts[activeTournament.id] ?? [])) {
      if (value != null) {
        payoutValues[index] = value;
      }
    }
  }
  const {
    defaultPayoutPlaces,
    effectivePayoutPlaces,
    defaultPayouts,
    payouts,
  } = getEffectivePayouts({
    playerCount: startingPlayers,
    totalPrizePool,
    percentPaid,
    payoutModel: activeTournament?.payoutModel ?? DEFAULT_PAYOUT_MODEL,
    allowPayoutOverride,
    payoutPlaces,
    payouts: payoutValues,
  });
  const timerMessages = [
    activeTournament?.name,
    totalPrizePool > 0
      ? `Total Prize Pool: ${formatCurrency(totalPrizePool)}`
      : "",
    getPayoutTimerMessage({
      totalEntries,
      effectivePayoutPlaces,
      allowPayoutOverride,
      payoutPlaces,
      payouts: payoutValues,
    }),
    startingPlayers > 0
      ? ` ${startingPlayers.toLocaleString()} Starting Players`
      : "",
    remainingPlayers > 0
      ? ` ${remainingPlayers.toLocaleString()} Players Remaining`
      : "",
    averageChipstack > 0
      ? `Average ChipStack: ${averageChipstack.toLocaleString()}`
      : "",

  ].filter(Boolean);
  const timer = useTimer({
    activeTab,
    activeTournament,
    timerMessages,
    timerSettings,
    setTimerSettingsError,
    updateTournamentTimer,
  });
  const {
    activeTimerMessage,
    activeTimerMessageIndex,
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
  } = timer;
  const previousTimerFullscreenRef = useRef(false);

  useEffect(() => {
    if (
      previousTimerFullscreenRef.current &&
      !timerIsFullscreen &&
      activeTab === "Timer"
    ) {
      setActiveTab("Tournaments");
    }
    previousTimerFullscreenRef.current = timerIsFullscreen;
  }, [activeTab, timerIsFullscreen]);

  const payoutTotal = activeTournament
    ? payouts.reduce((total, payout) => total + payout, 0)
    : 0;
  const payoutIncrement =
    totalPrizePool <= 10
      ? 1
      : totalPrizePool <= 100
        ? 5
        : totalPrizePool <= 200
          ? 10
          : totalPrizePool <= 1_000
            ? 25
            : 50;
  const payoutsMatchPrizePool =
    Math.round(payoutTotal * 100) === Math.round(totalPrizePool * 100);
  return (
    <main className="container">
      <header className="app-heading">
        <img
          className="app-heading-logo"
          src="/dinkydonk-logo.png"
          alt="DinkyDonk logo"
        />
        <div className="app-heading-copy">
          <h1 data-tour="app-title">
            DinkyDonk v{APP_VERSION} Poker Tournament Manager and Timer
          </h1>
          <p className="app-heading-tagline">
            DinkyDonk is Free and Open-Source
          </p>
        </div>
        <button
          className="app-tour-button"
          data-tour="tour-launcher"
          type="button"
          onClick={startUserTour}
        >
          Take a tour
        </button>
      </header>

      {newRelease && (
        <div className="release-notice" role="status">
          <span>
            DinkyDonk v{newRelease} is available.{" "}
            <a
              href={releasesPageUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => {
                if (!isTauri()) return;
                event.preventDefault();
                openUrl(releasesPageUrl).catch((error) => {
                  console.error("Could not open the releases page.", error);
                  setReleaseLinkError("Could not open the releases page. Visit github.com/briansayles/DinkyDonk/releases in your browser.");
                });
              }}
            >
              View downloads
            </a>
            {releaseLinkError && <span role="alert"> {releaseLinkError}</span>}
          </span>
          <button type="button" onClick={() => setNewRelease(null)} aria-label="Dismiss update notification">
            Dismiss
          </button>
        </div>
      )}

      <Joyride
        onEvent={handleUserTourCallback}
        continuous
        portalElement={
          timer.timerIsFullscreen ? timer.timerPanelRef.current : undefined
        }
        run={runUserTour}
        steps={userTourSteps}
        options={{
          buttons: ["back", "primary", "skip"],
          primaryColor: "#396cd8",
          showProgress: true,
          zIndex: 10000,
        }}
        locale={{
          back: "Back",
          close: "Close",
          last: "Finish",
          next: "Next",
          skip: "Skip tour",
        }}
      />

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
                timer.enterTimerFullscreen();
              }
            }}
          >
            {tab}
          </button>
        ))}
      </nav>

      <section
        ref={timerPanelRef}
        id="active-panel"
        className={`tab-panel${activeTab === "Timer" ? ` timer-tab-panel${startedAt !== null ? " timer-tab-panel-active" : ""}` : ""}`}
        role={activeTab === "Timer" ? "region" : "tabpanel"}
        aria-label={activeTab === "Timer" ? "Tournament timer" : undefined}
        aria-labelledby={
          activeTab === "Timer"
            ? undefined
            : `tab-${activeTab.toLowerCase()}`
        }
      >
        {activeTab !== "Timer" && <h2>{activeTab}</h2>}
        {activeTab === "Timer" && timerFullscreenError && (
          <p className="timer-fullscreen-error" role="alert">
            {timerFullscreenError}
          </p>
        )}
        {activeTab === "Timer" && storageError && (
          <p className="timer-fullscreen-error" role="alert">
            {storageError}
          </p>
        )}
        {activeTab === "About" ? (
          <AboutPanel />
        ) : activeTab === "Settings" ? (
          <SettingsPanel
            changingSettingsDirectory={changingSettingsDirectory}
            onChangeSettingsFile={changeSettingsFile}
            previewCountdownWarning={previewCountdownWarning}
            previewLevelAlarm={previewLevelAlarm}
            setTimerSettings={setTimerSettings}
            settingsDirectory={settingsDirectory}
            timerSettings={timerSettings}
            timerSettingsError={timerSettingsError}
            timerSettingsLoaded={timerSettingsLoaded}
          />
        ) : activeTab === "Tournaments" ? (
          <div className="tournament-manager">
            {storageError && (
              <p className="storage-error" role="alert">
                {storageError}
              </p>
            )}
            {tournamentExportError && (
              <p className="storage-error" role="alert">
                {tournamentExportError}
              </p>
            )}
            {tournamentExportNotice && (
              <div className="storage-success">
                <p role="status" aria-live="polite">
                  {tournamentExportNotice}
                </p>
                <button
                  type="button"
                  className="storage-success-dismiss"
                  onClick={() => setTournamentExportNotice("")}
                  aria-label="Dismiss CSV export notification"
                >
                  Dismiss
                </button>
              </div>
            )}
            {structureCreationError && (
              <p className="storage-error" role="alert">
                {structureCreationError}
              </p>
            )}
            {!draft && (
              <div className="tournament-heading">
                <p>Manage tournament structures and their blind levels.</p>
                <button
                  data-tour="create-structure"
                  type="button"
                  onClick={startNewTournament}
                  disabled={loadingTournaments || saving || creatingStructure}
                >
                  {creatingStructure ? "Loading template..." : "Create structure"}
                </button>
              </div>
            )}

            {loadingTournaments && <p>Loading saved structures...</p>}

            <TournamentEditor
              deleteTournament={deleteTournament}
              draft={draft}
              editingId={editingId}
              insertLevelAfter={insertLevelAfter}
              saveTournament={saveTournament}
              saving={saving}
              setDraft={setDraft}
              setEditingId={setEditingId}
              updateLevel={updateLevel}
            />

            <div data-tour="tournament-structures">
              <TournamentList
                activeTournamentId={activeTournamentId}
                copyTournament={copyTournament}
                draft={draft}
                editTournament={editTournament}
                expandedTournamentId={expandedTournamentId}
                loadingTournaments={loadingTournaments}
                onExportTournament={exportTournament}
                onSetActive={activateTournament}
                saving={saving}
                setExpandedTournamentId={setExpandedTournamentId}
                tournaments={tournaments}
              />
            </div>
          </div>
        ) : (
          <div
            className={`active-structure-panel${activeTab === "Timer" ? " timer-panel-content" : ""}`}
          >
            {activeTournament ? (
              activeTab === "Timer" ? (
                <TimerPanel
                  activeTimerMessage={activeTimerMessage}
                  activeTimerMessageIndex={activeTimerMessageIndex}
                  timerMessageCount={timerMessages.length}
                  currentLevel={currentLevel}
                  elapsedMs={elapsedMs}
                  hourProgress={hourProgress}
                  minuteProgress={minuteProgress}
                  nextLevel={nextLevel}
                  onEditSection={(sectionId) =>
                    editTournamentSection(activeTournament.id, sectionId)
                  }
                  onFinishChipAnimation={finishTimerChipAnimation}
                  onJumpToNextLevel={jumpToNextLevel}
                  onJumpToPreviousLevel={jumpToPreviousLevel}
                  onResetTimer={resetTimer}
                  onRestartCurrentLevel={restartCurrentLevel}
                  onSetTimerSettings={setTimerSettings}
                  onToggleFullscreen={toggleTimerFullscreen}
                  onToggleTimer={toggleTimer}
                  progressColor={progressColor}
                  secondProgress={secondProgress}
                  startedAt={startedAt}
                  timerChips={timerChips}
                  timerIsFullscreen={timerIsFullscreen}
                  timerSettings={timerSettings}
                  totalDurationMs={totalDurationMs}
                >
                  <div className="timer-right-middle timer-entry-column">
                  <div className="timer-entry-controls">
                    <div className="timer-entry-heading">
                      <h3>Entries</h3>
                      <div className="timer-entry-heading-actions">
                        <button
                          className="timer-entry-reset"
                          type="button"
                          onClick={() => resetEntryCounts(activeTournament)}
                          disabled={saving}
                          aria-label="Reset entries"
                          title="Reset entries"
                        >
                          <TimerIcon name="reset" />
                        </button>
                        <button
                          className="timer-entry-reset"
                          type="button"
                          onClick={() =>
                            setEntriesCollapsed((collapsed) => !collapsed)
                          }
                          aria-expanded={!entriesCollapsed}
                          aria-controls="timer-entry-table"
                          aria-label={
                            entriesCollapsed
                              ? "Expand entries"
                              : "Collapse entries"
                          }
                          title={
                            entriesCollapsed
                              ? "Expand entries"
                              : "Collapse entries"
                          }
                        >
                          <TimerIcon
                            name={entriesCollapsed ? "expand" : "collapse"}
                          />
                        </button>
                      </div>
                    </div>
                    <table
                      className="timer-entry-table"
                      id="timer-entry-table"
                      data-tour="timer-entries"
                    >
                      <thead>
                        <tr>
                          <th scope="col">Type</th>
                          <th scope="col">Count</th>
                          <th scope="col">Chips</th>
                          <th scope="col">Prize Pool</th>
                        </tr>
                      </thead>
                      {!entriesCollapsed && (
                      <tbody>
                        {entryRows.map((entry) => (
                          <tr key={entry.countField}>
                            <th
                              scope="row"
                              onDoubleClick={() =>
                                editTournamentSection(
                                  activeTournament.id,
                                  entry.countField === "buyinCount"
                                    ? "edit-entry-buyin"
                                    : entry.countField === "rebuyCount"
                                      ? "edit-entry-rebuy"
                                      : "edit-entry-addon",
                                )
                              }
                              title={`Double-click to edit ${entry.label.toLowerCase()} settings`}
                            >
                              {entry.label}
                            </th>
                            <td>
                              <input
                                type="number"
                                min="0"
                                max={MAX_PARTICIPANT_COUNT}
                                step="1"
                                value={activeEntryCountDrafts[entry.countField] ?? entry.count}
                                aria-label={`${entry.label} count`}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  setEntryCountDrafts((drafts) => ({
                                    ...drafts,
                                    [activeTournament.id]: {
                                      ...drafts[activeTournament.id],
                                      [entry.countField]: value,
                                    },
                                  }));
                                }}
                                onBlur={(event) => {
                                  updateTournamentField(
                                    activeTournament.id,
                                    entry.countField,
                                    event.target.value,
                                  );
                                  flushTournamentFieldUpdates();
                                  setEntryCountDrafts((drafts) => {
                                    const nextDrafts = {
                                      ...drafts[activeTournament.id],
                                    };
                                    delete nextDrafts[entry.countField];
                                    return {
                                      ...drafts,
                                      [activeTournament.id]: nextDrafts,
                                    };
                                  });
                                }}
                              />
                            </td>
                            <td>{entry.chipsInPlay.toLocaleString()}</td>
                            <td>{formatCurrency(entry.contribution)}</td>
                          </tr>
                        ))}
                        <tr>
                          <th scope="row">Other</th>
                          <td aria-label="Other entry count" />
                          <td>
                            <input
                              className="timer-other-input"
                              type="number"
                              min="0"
                              step="any"
                              value={
                                activeEntryCountDrafts.otherChipstack ??
                                activeTournament.otherChipstack ??
                                0
                              }
                              aria-label="Other chips-in-play contribution"
                              onChange={(event) => {
                                const value = event.target.value;
                                setEntryCountDrafts((drafts) => ({
                                  ...drafts,
                                  [activeTournament.id]: {
                                    ...drafts[activeTournament.id],
                                    otherChipstack: value,
                                  },
                                }));
                                updateTournamentField(
                                  activeTournament.id,
                                  "otherChipstack",
                                  value,
                                );
                              }}
                              onBlur={() => {
                                flushTournamentFieldUpdates();
                                setEntryCountDrafts((drafts) => {
                                  const nextDrafts = {
                                    ...drafts[activeTournament.id],
                                  };
                                  delete nextDrafts.otherChipstack;
                                  return {
                                    ...drafts,
                                    [activeTournament.id]: nextDrafts,
                                  };
                                });
                              }}
                            />
                          </td>
                          <td>
                            <CurrencyInput
                              className="timer-other-input"
                              min="0"
                              step="any"
                              value={
                                activeEntryCountDrafts.otherPrizePool ??
                                activeTournament.otherPrizePool ??
                                0
                              }
                              aria-label="Other prize-pool contribution"
                              onChange={(value) => {
                                setEntryCountDrafts((drafts) => ({
                                  ...drafts,
                                  [activeTournament.id]: {
                                    ...drafts[activeTournament.id],
                                    otherPrizePool: value,
                                  },
                                }));
                                updateTournamentField(
                                  activeTournament.id,
                                  "otherPrizePool",
                                  value,
                                );
                              }}
                              onBlur={() => {
                                flushTournamentFieldUpdates();
                                setEntryCountDrafts((drafts) => {
                                  const nextDrafts = {
                                    ...drafts[activeTournament.id],
                                  };
                                  delete nextDrafts.otherPrizePool;
                                  return {
                                    ...drafts,
                                    [activeTournament.id]: nextDrafts,
                                  };
                                });
                              }}
                            />
                          </td>
                        </tr>
                      </tbody>
                      )}
                      <tfoot>
                        <tr>
                          <th colSpan="2" scope="row">
                            Total
                          </th>
                          <td>{totalChipsInPlay.toLocaleString()}</td>
                          <td>{formatCurrency(totalPrizePool)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <div className="timer-bustout-controls timer-bustout-section">
                    <div className="timer-entry-heading">
                      <h3>Bustouts</h3>
                      <div className="timer-entry-heading-actions">
                        <label className="timer-payout-places">
                          <span>Busted</span>
                          <input
                            type="number"
                            data-tour="timer-bustouts"
                            min="0"
                            max={Math.min(MAX_PARTICIPANT_COUNT, startingPlayers)}
                            step="1"
                            value={bustoutCount}
                            aria-label="Bustouts count"
                            aria-description="Use the spinner or arrow keys to adjust the count."
                            onKeyDown={(event) => {
                              const navigationKeys = [
                                "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
                                "Home", "End", "Tab", "Shift", "Control", "Meta",
                                "Alt", "Escape",
                              ];
                              const copyOrSelect =
                                (event.ctrlKey || event.metaKey) &&
                                ["a", "c"].includes(event.key.toLowerCase());
                              if (!navigationKeys.includes(event.key) && !copyOrSelect) {
                                event.preventDefault();
                              }
                            }}
                            onBeforeInput={(event) => event.preventDefault()}
                            onPaste={(event) => event.preventDefault()}
                            onCut={(event) => event.preventDefault()}
                            onDrop={(event) => event.preventDefault()}
                            onChange={(event) =>
                              updateTournamentField(
                                activeTournament.id,
                                "bustoutCount",
                                event.target.value,
                              )
                            }
                            onBlur={flushTournamentFieldUpdates}
                          />
                        </label>
                        <button
                          className="timer-entry-reset"
                          type="button"
                          onClick={() => resetBustoutCount(activeTournament)}
                          disabled={saving}
                          aria-label="Reset bustouts"
                          title="Reset bustouts"
                        >
                          <TimerIcon name="reset" />
                        </button>
                        <button
                          className="timer-entry-reset"
                          type="button"
                          onClick={() =>
                            setBustoutsCollapsed((collapsed) => !collapsed)
                          }
                          aria-expanded={!bustoutsCollapsed}
                          aria-controls="timer-bustout-table"
                          aria-label={
                            bustoutsCollapsed
                              ? "Expand bustouts"
                              : "Collapse bustouts"
                          }
                          title={
                            bustoutsCollapsed
                              ? "Expand bustouts"
                              : "Collapse bustouts"
                          }
                        >
                          <TimerIcon
                            name={bustoutsCollapsed ? "expand" : "collapse"}
                          />
                        </button>
                      </div>
                    </div>
                    <table
                      className="timer-bustout-table"
                      id="timer-bustout-table"
                    >
                      <thead>
                        <tr>
                          <th scope="col">Busted</th>
                          <th scope="col">Remaining</th>
                          <th scope="col">Average Chipstack</th>
                        </tr>
                      </thead>
                      <tfoot>
                        <tr>
                          <th scope="row">
                            {bustoutCount.toLocaleString()}
                          </th>
                          <td>{remainingPlayers.toLocaleString()}</td>
                          <td>{averageChipstack.toLocaleString()}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <div className="timer-tables-controls">
                    <div className="timer-entry-heading">
                      <h3>Tables</h3>
                      <div className="timer-entry-heading-actions">
                        <label className="timer-payout-places">
                          <span>Max/Table</span>
                          <input
                            data-tour="timer-tables-max"
                            type="number"
                            min="0"
                            step="1"
                            value={
                              tableMaxDrafts[activeTournament.id] ??
                              normalizeMaxPlayersPerTable(activeTournament.maxPlayersPerTable)
                            }
                            aria-label="Maximum players per table"
                            onChange={(event) => {
                              setTableMaxDrafts((drafts) => ({
                                ...drafts,
                                [activeTournament.id]: event.target.value,
                              }));
                              updateTournamentField(
                                activeTournament.id,
                                "maxPlayersPerTable",
                                event.target.value,
                              );
                            }}
                            onBlur={() => {
                              flushTournamentFieldUpdates();
                              setTableMaxDrafts((drafts) => {
                                const nextDrafts = { ...drafts };
                                delete nextDrafts[activeTournament.id];
                                return nextDrafts;
                              });
                            }}
                          />
                        </label>
                        <button
                          className="timer-entry-reset"
                          type="button"
                          onClick={() => resetTables(activeTournament)}
                          disabled={saving}
                          aria-label="Reset tables"
                          title="Reset tables"
                        >
                          <TimerIcon name="reset" />
                        </button>
                        <button
                          className="timer-entry-reset"
                          type="button"
                          onClick={() =>
                            setTablesCollapsed((collapsed) => !collapsed)
                          }
                          aria-expanded={!tablesCollapsed}
                          aria-controls="timer-tables-table"
                          aria-label={
                            tablesCollapsed ? "Expand tables" : "Collapse tables"
                          }
                          title={
                            tablesCollapsed ? "Expand tables" : "Collapse tables"
                          }
                        >
                          <TimerIcon
                            name={tablesCollapsed ? "expand" : "collapse"}
                          />
                        </button>
                      </div>
                    </div>
                    <table className="timer-tables-table" id="timer-tables-table">
                      {!tablesCollapsed && <tbody>
                        {tableRows.map((row, index) => (
                          <tr key={index}>
                            <td className="timer-tables-description">
                              {row.count > 0
                                ? `${row.count.toLocaleString()} ${
                                    row.count === 1 ? "Table" : "Tables"
                                  } of ${row.playersPerTable?.toLocaleString()}`
                                : "—"}
                            </td>
                            <td>{row.total.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>}
                      <tfoot>
                        <tr>
                          <th scope="row">
                            {totalTableCount.toLocaleString()}{" "}
                            {totalTableCount === 1 ? "Table" : "Tables"}
                          </th>
                          <td>{totalPlayersAtTables.toLocaleString()}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <div className="timer-payout-controls timer-payout-section">
                    <div className="timer-entry-heading">
                      <h3>Payouts</h3>
                      <div className="timer-entry-heading-actions">
                        <label className="timer-payout-places">
                          <span>Players paid</span>
                          <input
                            type="number"
                            min="0"
                            max="1000"
                            step="1"
                            title={`Calculated: ${defaultPayoutPlaces} players to be paid`}
                            disabled={!allowPayoutOverride}
                            value={
                              !allowPayoutOverride
                                ? defaultPayoutPlaces
                                : payoutPlaceDrafts[activeTournament.id] !==
                                    undefined
                                  ? payoutPlaceDrafts[activeTournament.id]
                                  : payoutPlaces > 0
                                    ? payoutPlaces
                                    : defaultPayoutPlaces
                            }
                            aria-label="Number of players paid"
                            data-tour="timer-paid-places"
                            onChange={(event) => {
                              setPayoutPlaceDrafts((drafts) => ({
                                ...drafts,
                                [activeTournament.id]: event.target.value,
                              }));
                              updateTournamentField(
                                activeTournament.id,
                                "payoutPlaces",
                                event.target.value,
                              );
                            }}
                            onBlur={() => {
                              flushTournamentFieldUpdates();
                              setPayoutPlaceDrafts((drafts) => {
                                const nextDrafts = { ...drafts };
                                delete nextDrafts[activeTournament.id];
                                return nextDrafts;
                              });
                            }}
                          />
                        </label>
                        <button
                          className="timer-entry-reset"
                          type="button"
                          onClick={() => resetPayouts(activeTournament)}
                          disabled={saving || !allowPayoutOverride}
                          aria-label="Reset payouts"
                          title="Reset payouts"
                        >
                          <TimerIcon name="reset" />
                        </button>
                        <button
                          className="timer-entry-reset"
                          type="button"
                          onClick={() =>
                            setPayoutsCollapsed((collapsed) => !collapsed)
                          }
                          aria-expanded={!payoutsCollapsed}
                          aria-controls="timer-payout-table"
                          aria-label={
                            payoutsCollapsed
                              ? "Expand payouts"
                              : "Collapse payouts"
                          }
                          title={
                            payoutsCollapsed
                              ? "Expand payouts"
                              : "Collapse payouts"
                          }
                        >
                          <TimerIcon
                            name={payoutsCollapsed ? "expand" : "collapse"}
                          />
                        </button>
                      </div>
                    </div>
                    <div
                      className="timer-payout-table-scroll"
                      role="region"
                      aria-label="Payout table"
                    >
                    <table
                      className="timer-payout-table"
                      id="timer-payout-table"
                      data-tour="timer-payouts"
                      title="Double-click to edit payout settings"
                      onDoubleClick={(event) => {
                        if (
                          event.target instanceof Element &&
                          event.target.closest("input, textarea, select")
                        ) {
                          return;
                        }

                        editTournamentSection(
                          activeTournament.id,
                          "edit-entry-payout",
                        );
                      }}
                    >
                      {!payoutsCollapsed && <thead>
                        <tr>
                          <th scope="col">Place</th>
                          <th scope="col">Payout</th>
                        </tr>
                      </thead>}
                      {!payoutsCollapsed && <tbody tabIndex={0}>
                        {payouts.map((payout, index) => (
                          <tr key={index}>
                            <th scope="row">{index + 1}</th>
                            <td>
                              <CurrencyInput
                                step={payoutIncrement}
                                value={payouts[index] ?? 0}
                                disabled={!allowPayoutOverride}
                                aria-label={`Payout for place ${index + 1}`}
                                title={
                                  defaultPayouts?.[index] === null ||
                                  defaultPayouts?.[index] === undefined
                                    ? "Calculated: pending"
                                    : `Calculated: ${formatCurrency(defaultPayouts[index])}`
                                }
                                onChange={(value) => {
                                  const nextDrafts = [
                                    ...(payoutDrafts[activeTournament.id] ?? []),
                                  ];
                                  nextDrafts[index] = value;
                                  setPayoutDrafts((drafts) => ({
                                    ...drafts,
                                    [activeTournament.id]: nextDrafts,
                                  }));
                                  updateTournamentField(
                                    activeTournament.id,
                                    "payout",
                                    value,
                                    index,
                                    effectivePayoutPlaces,
                                    defaultPayouts,
                                  );
                                }}
                                onBlur={() => {
                                  flushTournamentFieldUpdates();
                                  setPayoutDrafts((drafts) => {
                                    const nextPayoutDrafts = [
                                      ...(drafts[activeTournament.id] ?? []),
                                    ];
                                    delete nextPayoutDrafts[index];
                                    return {
                                      ...drafts,
                                      [activeTournament.id]: nextPayoutDrafts,
                                    };
                                  });
                                }}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>}
                      <tfoot>
                        <tr>
                          <th scope="row">Total</th>
                          <td className="timer-payout-total">
                            {payoutsMatchPrizePool && (
                              <span
                                className="timer-payout-match"
                                role="img"
                                aria-label="Payouts match the prize pool"
                                title="Payouts match the prize pool"
                              >
                                ✓
                              </span>
                            )}
                            {formatCurrency(payoutTotal)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                    </div>
                  </div>
                  </div>
                </TimerPanel>
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
                  onClick={() => setActiveTab("Tournaments")}
                >
                  Choose a tournament structure
                </button>
              </>
            )}
          </div>
        )}
      </section>
      {splashVisible && (
        <div
          className={`app-splash${splashExiting ? " app-splash-exiting" : ""}`}
          role="status"
          aria-live="polite"
          aria-hidden={splashExiting}
        >
          <div className="app-splash-content">
            <img
              className="app-splash-logo"
              src="/dinkydonk-logo.png"
              alt="DinkyDonk"
            />
            <h1>DinkyDonk</h1>
            <h2>Version {APP_VERSION}</h2>
            <p>DinkyDonk is Free and Open-Source software distributed under the GNU AGPL-3.0-or-later license.</p>
            <p>Copyright © 2026 Brian Sayles</p>
            <div className="app-splash-loader" aria-hidden="true">
              <span />
            </div>
            <span className="app-splash-status">Getting the table ready...</span>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
