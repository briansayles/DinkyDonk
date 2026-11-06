import { useEffect, useState } from "react";
import {
  createEmptyLevel,
  createNextLevel,
  formatAmount,
  sortChips,
  sortLevels,
} from "./domain/tournament";
import TimerPanel, { TimerIcon } from "./features/timer/TimerPanel";
import { useTimer } from "./features/timer/useTimer";
import { useTournaments } from "./features/tournaments/useTournaments";
import SettingsPanel from "./features/settings/SettingsPanel";
import { useTimerSettings } from "./features/settings/useTimerSettings";
import TournamentEditor from "./features/tournaments/TournamentEditor";
import TournamentList from "./features/tournaments/TournamentList";
import "./App.css";

const tabs = ["Timer", "Tournament", "Players", "Settings"];

function App() {
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [editingId, setEditingId] = useState(null);
  const [editSectionToActivate, setEditSectionToActivate] = useState(null);
  const [draft, setDraft] = useState(null);
  const [entriesCollapsed, setEntriesCollapsed] = useState(false);
  const [bustoutsCollapsed, setBustoutsCollapsed] = useState(false);
  const [payoutsCollapsed, setPayoutsCollapsed] = useState(false);
  const [tablesCollapsed, setTablesCollapsed] = useState(false);
  const tournamentState = useTournaments();
  const {
    activeTournament,
    activeTournamentId,
    deleteTournament: removeTournament,
    entryCountDrafts,
    expandedTournaments,
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
    setExpandedTournaments,
    setPayoutDrafts,
    setPayoutPlaceDrafts,
    setTableMaxDrafts,
    storageError,
    tableMaxDrafts,
    tournaments,
    updateEntryCount,
    updateMaxPlayersPerTable,
    updateOtherValue,
    updatePayout,
    updatePayoutPlaces,
  } = tournamentState;
  const {
    changingSettingsDirectory,
    changeSettingsDirectory,
    setTimerSettings,
    setTimerSettingsError,
    settingsDirectory,
    timerSettings,
    timerSettingsError,
    timerSettingsLoaded,
  } = useTimerSettings(loadTournaments);

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
      rebuyChipstack: "",
      rebuyDescription: "",
      addonCost: "",
      addonChipstack: "",
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
      rebuyChipstack: tournament.rebuyChipstack ?? "",
      rebuyDescription: tournament.rebuyDescription ?? "",
      addonCost: tournament.addonCost ?? "",
      addonChipstack: tournament.addonChipstack ?? "",
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

  function editTournamentSection(tournamentId, sectionId) {
    const tournament = tournaments.find((item) => item.id === tournamentId);
    if (!tournament) {
      return;
    }

    editTournament(tournament);
    setEditSectionToActivate(sectionId);
    setActiveTab("Tournament");
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
      buyinCount: existingTournament?.buyinCount ?? 0,
      rebuyCount: existingTournament?.rebuyCount ?? 0,
      addonCount: existingTournament?.addonCount ?? 0,
      otherPrizePool: existingTournament?.otherPrizePool ?? 0,
      otherChipstack: existingTournament?.otherChipstack ?? 0,
      bustoutCount: existingTournament?.bustoutCount ?? 0,
      payoutPlaces: existingTournament?.payoutPlaces ?? 0,
      payouts: existingTournament?.payouts ?? [],
      maxPlayersPerTable: existingTournament?.maxPlayersPerTable ?? 0,
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
        .map((entry) => ({
          ...entry,
          count:
            activeEntryCountDrafts[entry.countField] ??
            activeTournament[entry.countField] ??
            0,
          contribution:
            Number(
              activeEntryCountDrafts[entry.countField] ??
                activeTournament[entry.countField] ??
                0,
            ) * Number(entry.cost ?? 0),
          chipsInPlay:
            Number(
              activeEntryCountDrafts[entry.countField] ??
                activeTournament[entry.countField] ??
                0,
            ) * Number(entry.chipstack ?? 0),
        }))
    : [];
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
  const bustoutCount = Number(
    activeEntryCountDrafts.bustoutCount ??
      activeTournament?.bustoutCount ??
      0,
  );
  const remainingPlayers = Math.max(
    0,
    Number(
      activeEntryCountDrafts.buyinCount ??
        activeTournament?.buyinCount ??
        0,
    ) - bustoutCount,
  );
  const parsedMaxPlayersPerTable = activeTournament
    ? Number(
        tableMaxDrafts[activeTournament.id] ??
          activeTournament.maxPlayersPerTable ??
          0,
      )
    : 0;
  const maxPlayersPerTable = Number.isFinite(parsedMaxPlayersPerTable)
    ? Math.min(4_294_967_295, Math.max(0, Math.floor(parsedMaxPlayersPerTable)))
    : 0;
  const requiredTableCount =
    maxPlayersPerTable > 0
      ? Math.ceil(remainingPlayers / maxPlayersPerTable)
      : 0;
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
  const startingPlayers = Number(
    activeEntryCountDrafts.buyinCount ?? activeTournament?.buyinCount ?? 0,
  );
  const timerMessages = [
    activeTournament?.name,
    startingPlayers > 0
      ? `Starting Players: ${startingPlayers.toLocaleString()}`
      : "",
    remainingPlayers > 0
      ? `Remaining Players: ${remainingPlayers.toLocaleString()}`
      : "",
    totalPrizePool > 0
      ? `Total Prize Pool: ${formatAmount(totalPrizePool)}`
      : "",
    averageChipstack > 0
      ? `Average Stack: ${averageChipstack.toLocaleString()}`
      : "",
    payoutPlaces > 0 ? `Top ${payoutPlaces.toLocaleString()} Players Paid` : "",
  ].filter(Boolean);
  const timer = useTimer({
    activeTab,
    activeTournament,
    timerMessages,
    timerSettings,
    setTimerSettingsError,
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
  const payouts = activeTournament
    ? Array.from({ length: payoutPlaces }, (_, index) =>
        Number(
          payoutDrafts[activeTournament.id]?.[index] ??
            activeTournament.payouts?.[index] ??
            0,
        ),
      )
    : [];
  const payoutTotal = payouts.reduce((total, payout) => total + payout, 0);
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
                  timerPanelRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
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
        ref={timerPanelRef}
        id="active-panel"
        className={`tab-panel${activeTab === "Timer" ? ` timer-tab-panel${startedAt !== null ? " timer-tab-panel-active" : ""}` : ""}`}
        role="tabpanel"
        aria-labelledby={`tab-${activeTab.toLowerCase()}`}
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
        {activeTab === "Settings" ? (
          <SettingsPanel
            changingSettingsDirectory={changingSettingsDirectory}
            onChangeSettingsDirectory={changeSettingsDirectory}
            previewCountdownWarning={previewCountdownWarning}
            previewLevelAlarm={previewLevelAlarm}
            setTimerSettings={setTimerSettings}
            settingsDirectory={settingsDirectory}
            timerSettings={timerSettings}
            timerSettingsError={timerSettingsError}
            timerSettingsLoaded={timerSettingsLoaded}
          />
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

            <TournamentList
              activeTournamentId={activeTournamentId}
              draft={draft}
              editTournament={editTournament}
              expandedTournaments={expandedTournaments}
              loadingTournaments={loadingTournaments}
              persistTournamentData={persistTournamentData}
              saving={saving}
              setExpandedTournaments={setExpandedTournaments}
              tournaments={tournaments}
            />
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
                    <table className="timer-entry-table" id="timer-entry-table">
                      <thead>
                        <tr>
                          <th scope="col">Type</th>
                          <th scope="col">Count</th>
                          <th scope="col">Prize Pool</th>
                          <th scope="col">Chips</th>
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
                                step="1"
                                value={entry.count}
                                disabled={saving}
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
                                onBlur={(event) =>
                                  updateEntryCount(
                                    activeTournament.id,
                                    entry.countField,
                                    event.target.value,
                                  )
                                }
                              />
                            </td>
                            <td>
                              {formatAmount(entry.contribution)}
                            </td>
                            <td>{entry.chipsInPlay.toLocaleString()}</td>
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
                                activeEntryCountDrafts.otherPrizePool ??
                                activeTournament.otherPrizePool ??
                                0
                              }
                              disabled={saving}
                              aria-label="Other prize-pool contribution"
                              onChange={(event) => {
                                const value = event.target.value;
                                setEntryCountDrafts((drafts) => ({
                                  ...drafts,
                                  [activeTournament.id]: {
                                    ...drafts[activeTournament.id],
                                    otherPrizePool: value,
                                  },
                                }));
                              }}
                              onBlur={(event) =>
                                updateOtherValue(
                                  activeTournament.id,
                                  "otherPrizePool",
                                  event.target.value,
                                )
                              }
                            />
                          </td>
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
                              disabled={saving}
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
                              }}
                              onBlur={(event) =>
                                updateOtherValue(
                                  activeTournament.id,
                                  "otherChipstack",
                                  event.target.value,
                                )
                              }
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
                          <td>{formatAmount(totalPrizePool)}</td>
                          <td>{totalChipsInPlay.toLocaleString()}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <div className="timer-bustout-controls timer-bustout-section">
                    <div className="timer-entry-heading">
                      <h3>Bustouts</h3>
                      <div className="timer-entry-heading-actions">
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
                            <input
                              type="number"
                              min="0"
                              max={Math.max(
                                0,
                                Number(
                                  activeEntryCountDrafts.buyinCount ??
                                    activeTournament.buyinCount ??
                                    0,
                                ) - 1,
                              )}
                              step="1"
                              value={
                                activeEntryCountDrafts.bustoutCount ??
                                activeTournament.bustoutCount ??
                                0
                              }
                              disabled={saving}
                              aria-label="Bustouts count"
                              onChange={(event) => {
                                const value = event.target.value;
                                setEntryCountDrafts((drafts) => ({
                                  ...drafts,
                                  [activeTournament.id]: {
                                    ...drafts[activeTournament.id],
                                    bustoutCount: value,
                                  },
                                }));
                              }}
                              onBlur={(event) =>
                                updateEntryCount(
                                  activeTournament.id,
                                  "bustoutCount",
                                  event.target.value,
                                )
                              }
                            />
                          </th>
                          <td>{remainingPlayers.toLocaleString()}</td>
                          <td>{averageChipstack.toLocaleString()}</td>
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
                            value={
                              payoutPlaceDrafts[activeTournament.id] ??
                              activeTournament.payoutPlaces ??
                              0
                            }
                            disabled={saving}
                            aria-label="Number of players paid"
                            onChange={(event) =>
                              setPayoutPlaceDrafts((drafts) => ({
                                ...drafts,
                                [activeTournament.id]: event.target.value,
                              }))
                            }
                            onBlur={(event) =>
                              updatePayoutPlaces(
                                activeTournament.id,
                                event.target.value,
                              )
                            }
                          />
                        </label>
                        <button
                          className="timer-entry-reset"
                          type="button"
                          onClick={() => resetPayouts(activeTournament)}
                          disabled={saving}
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
                    <table className="timer-payout-table" id="timer-payout-table">
                      {!payoutsCollapsed && <thead>
                        <tr>
                          <th scope="col">Place</th>
                          <th scope="col">Payout</th>
                        </tr>
                      </thead>}
                      {!payoutsCollapsed && <tbody>
                        {payouts.map((payout, index) => (
                          <tr key={index}>
                            <th scope="row">{index + 1}</th>
                            <td>
                              <input
                                type="number"
                                min="0"
                                step={payoutIncrement}
                                value={
                                  payoutDrafts[activeTournament.id]?.[index] ??
                                  activeTournament.payouts?.[index] ??
                                  0
                                }
                                disabled={saving}
                                aria-label={`Payout for place ${index + 1}`}
                                onChange={(event) => {
                                  const nextDrafts = [
                                    ...(payoutDrafts[activeTournament.id] ?? []),
                                  ];
                                  nextDrafts[index] = event.target.value;
                                  setPayoutDrafts((drafts) => ({
                                    ...drafts,
                                    [activeTournament.id]: nextDrafts,
                                  }));
                                }}
                                onBlur={(event) =>
                                  updatePayout(
                                    activeTournament.id,
                                    index,
                                    event.target.value,
                                  )
                                }
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
                            {formatAmount(payoutTotal)}
                          </td>
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
                            type="number"
                            min="0"
                            step="1"
                            value={
                              tableMaxDrafts[activeTournament.id] ??
                              activeTournament.maxPlayersPerTable ??
                              0
                            }
                            disabled={saving}
                            aria-label="Maximum players per table"
                            onChange={(event) =>
                              setTableMaxDrafts((drafts) => ({
                                ...drafts,
                                [activeTournament.id]: event.target.value,
                              }))
                            }
                            onBlur={(event) =>
                              updateMaxPlayersPerTable(
                                activeTournament.id,
                                event.target.value,
                              )
                            }
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
