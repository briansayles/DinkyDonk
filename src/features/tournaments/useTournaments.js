import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_MAX_PLAYERS_PER_TABLE, normalizeMaxPlayersPerTable, sortChips, sortLevels, updateBustoutPayouts } from "../../domain/tournament";
import {
  getTournamentEndBustoutCount,
  getTournamentEndTimerState,
  MAX_PARTICIPANT_COUNT,
  participantFields,
  resizeBustouts,
  resizeParticipants,
} from "../../domain/participants";
import { getTournamentChanges } from "./tournamentChanges";

function normalizeTournaments(tournaments) {
  return tournaments.map((tournament) => ({
    ...tournament,
    chips: sortChips(tournament.chips ?? []),
    levels: sortLevels(tournament.levels),
  }));
}

function getBustoutUpdates(tournament, count, timestamp = Date.now()) {
  const completedBustoutCount =
    getTournamentEndBustoutCount(tournament, count) ?? count;
  return {
    bustouts: resizeBustouts(tournament, completedBustoutCount, timestamp),
    ...(getTournamentEndTimerState(tournament, count, timestamp) ?? {}),
  };
}

export function useTournaments({ invokeCommand = invoke, now = Date.now, reconcilePayouts = true } = {}) {
  const [tournaments, setTournaments] = useState([]);
  const [activeTournamentId, setActiveTournamentId] = useState(null);
  const [expandedTournamentId, setExpandedTournamentId] = useState(null);
  const [storageError, setStorageError] = useState("");
  const [loadingTournaments, setLoadingTournaments] = useState(true);
  const [saving, setSaving] = useState(false);
  const [entryCountDrafts, setEntryCountDrafts] = useState({});
  const [payoutPlaceDrafts, setPayoutPlaceDrafts] = useState({});
  const [payoutDrafts, setPayoutDrafts] = useState({});
  const [tableMaxDrafts, setTableMaxDrafts] = useState({});
  const savingRef = useRef(false);
  const loadingRef = useRef(false);
  const loadedSuccessfullyRef = useRef(false);
  const pendingFieldUpdatesRef = useRef(false);
  const pendingFieldBaseRef = useRef(null);
  const fieldUpdateTimeoutRef = useRef(null);
  const saveQueueRef = useRef(Promise.resolve());
  const queuedWritesRef = useRef(0);
  const failureSequenceRef = useRef(0);
  const expectedTournamentRef = useRef(new WeakMap());
  const fieldDraftsRef = useRef(new Map());
  const latestTournamentsRef = useRef(tournaments);
  const latestActiveTournamentIdRef = useRef(activeTournamentId);

  function applyTournamentData(savedTournaments) {
    const normalized = normalizeTournaments(savedTournaments.tournaments);
    const normalizedTournaments = JSON.stringify(latestTournamentsRef.current) === JSON.stringify(normalized)
      ? latestTournamentsRef.current
      : normalized;
    normalizedTournaments.forEach((tournament, index) => {
      expectedTournamentRef.current.set(tournament, savedTournaments.tournaments[index]);
    });
    loadedSuccessfullyRef.current = true;
    latestTournamentsRef.current = normalizedTournaments;
    latestActiveTournamentIdRef.current = savedTournaments.activeTournamentId;
    setTournaments(normalizedTournaments);
    setActiveTournamentId((current) =>
      current === savedTournaments.activeTournamentId
        ? current
        : savedTournaments.activeTournamentId,
    );
  }

  async function loadTournaments() {
    const savedTournaments = await invokeCommand("load_tournaments");
    if (savingRef.current || pendingFieldUpdatesRef.current || fieldDraftsRef.current.size) {
      return;
    }

    const updatedTournaments = reconcilePayouts
      ? savedTournaments.tournaments.map(updateBustoutPayouts)
      : savedTournaments.tournaments;
    if (reconcilePayouts && updatedTournaments.some((tournament, index) => tournament !== savedTournaments.tournaments[index])) {
      const saved = await invokeCommand("reconcile_bustout_payouts", {
        expectedTournaments: savedTournaments.tournaments,
        bustoutPayouts: updatedTournaments.map((tournament) =>
          (tournament.bustouts ?? []).map((bustout) => bustout.payout),
        ),
      });
      if (!saved || savingRef.current || pendingFieldUpdatesRef.current || fieldDraftsRef.current.size) {
        return;
      }
    }

    applyTournamentData({ ...savedTournaments, tournaments: updatedTournaments });
  }

  useEffect(() => {
    let active = true;

    async function synchronizeTournaments() {
      if (!active || savingRef.current || loadingRef.current || fieldDraftsRef.current.size) {
        return;
      }

      loadingRef.current = true;
      try {
        await loadTournaments();
        if (active) {
          setLoadingTournaments(false);
        }
      } catch (error) {
        console.error("Could not load tournament structures.", error);
        if (active) {
          setStorageError(
            "Tournament structures could not be synchronized from the database.",
          );
          setLoadingTournaments(false);
        }
      } finally {
        loadingRef.current = false;
      }
    }

    synchronizeTournaments();
    const intervalId = window.setInterval(synchronizeTournaments, 1_000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  async function reloadTournaments() {
    try {
      await loadTournaments();
    } catch (error) {
      console.error("Could not reload tournament structures.", error);
      setStorageError(
        "Tournament structures could not be loaded from this device.",
      );
      throw error;
    }
  }

  async function persistTournamentData(
    nextTournaments,
    nextActiveTournamentId = activeTournamentId,
    baseTournaments = tournaments,
    baseActiveTournamentId = activeTournamentId,
    verifyActive = false,
  ) {
    if (!loadedSuccessfullyRef.current) {
      setStorageError("Tournament changes cannot be saved until the database has been loaded.");
      return false;
    }
    nextTournaments = nextTournaments.map(updateBustoutPayouts);
    let changes;
    try {
      changes = getTournamentChanges(
        baseTournaments,
        nextTournaments,
        (tournament) => expectedTournamentRef.current.get(tournament) ?? tournament,
      );
    } catch (error) {
      console.error("Could not prepare tournament changes.", error);
      setStorageError(`Tournament changes could not be prepared: ${error}`);
      return false;
    }
    const activeChange = !verifyActive && baseActiveTournamentId === nextActiveTournamentId
      ? null
      : { expected: baseActiveTournamentId, value: nextActiveTournamentId };
    if (!changes.length && !activeChange) return true;

    const failureSequence = failureSequenceRef.current;
    queuedWritesRef.current += 1;
    savingRef.current = true;
    setSaving(true);
    const operation = saveQueueRef.current.then(async () => {
      try {
        const saved = await invokeCommand("apply_tournament_changes", { changes, activeChange });
        if (!pendingFieldUpdatesRef.current && queuedWritesRef.current === 1) {
          applyTournamentData(saved);
        }
        if (failureSequenceRef.current === failureSequence) setStorageError("");
        return true;
      } catch (error) {
        failureSequenceRef.current += 1;
        console.error("Could not save tournament changes.", error);
        setStorageError(String(error).includes("Conflict:")
          ? "Tournament changes were not saved because the data changed elsewhere. Review the latest data and try again."
          : `Tournament changes could not be saved: ${error}`);
        return false;
      } finally {
        queuedWritesRef.current -= 1;
        if (queuedWritesRef.current === 0) {
          savingRef.current = false;
          setSaving(false);
        }
      }
    });
    saveQueueRef.current = operation;
    return operation;
  }

  function flushTournamentFieldUpdates() {
    window.clearTimeout(fieldUpdateTimeoutRef.current);
    fieldUpdateTimeoutRef.current = null;
    if (!pendingFieldUpdatesRef.current) {
      return saveQueueRef.current.then(() => true);
    }
    if (!loadedSuccessfullyRef.current) {
      setStorageError("Tournament changes cannot be saved until the database has been loaded.");
      return Promise.resolve(false);
    }

    pendingFieldUpdatesRef.current = false;
    const base = pendingFieldBaseRef.current;
    pendingFieldBaseRef.current = null;
    const nextTournaments = latestTournamentsRef.current;
    return persistTournamentData(
      nextTournaments, base.activeTournamentId, base.tournaments, base.activeTournamentId, true,
    );
  }

  function updateTournamentField(
    tournamentId,
    field,
    value,
    payoutIndex,
    payoutPlacesForUpdate,
    calculatedPayouts,
    expectedTournament,
  ) {
    const currentTournament = latestTournamentsRef.current.find(
      (tournament) => tournament.id === tournamentId,
    );
    if (!currentTournament) {
      return;
    }
    if (expectedTournament && JSON.stringify(currentTournament) !== JSON.stringify(expectedTournament)) {
      setStorageError("The tournament changed while this field was being edited. Review the latest data and try again.");
      return;
    }

    let updatedFields;
    if (field === "payout") {
      const parsedPayout = Number(value);
      const amount =
        value.trim() !== "" && Number.isFinite(parsedPayout)
          ? Math.max(0, parsedPayout)
          : 0;
      const payoutPlaces =
        Number.isInteger(payoutPlacesForUpdate) && payoutPlacesForUpdate > 0
          ? payoutPlacesForUpdate
          : currentTournament.payoutPlaces ?? 0;
      const currentPayouts = currentTournament.payouts ?? [];
      const payoutBaseline = currentPayouts.some(
        (payout) => Number(payout) !== 0,
      )
        ? currentPayouts
        : calculatedPayouts ?? currentPayouts;
      const payouts = Array.from(
        { length: payoutPlaces },
        (_, index) =>
          index === payoutIndex
            ? amount
            : Number(payoutBaseline[index] ?? 0),
      );
      updatedFields = { payouts };
    } else if (field === "payoutPlaces") {
      const parsedPlaces = Number(value);
      const payoutPlaces = Number.isFinite(parsedPlaces)
        ? Math.min(1_000, Math.max(0, Math.floor(parsedPlaces)))
        : 0;
      updatedFields = {
        payoutPlaces,
        payouts: Array.from({ length: payoutPlaces }, (_, index) =>
          Number(currentTournament.payouts?.[index] ?? 0),
        ),
      };
    } else if (Object.hasOwn(participantFields, field)) {
      const parsedValue = Number(value);
      if (!Number.isFinite(parsedValue) || parsedValue < 0 || !Number.isInteger(parsedValue) || parsedValue > MAX_PARTICIPANT_COUNT) {
        setStorageError(`Participant counts must be whole numbers between 0 and ${MAX_PARTICIPANT_COUNT.toLocaleString()}.`);
        return;
      }
      const arrayField = participantFields[field];
      if (field === "bustoutCount" && parsedValue > (currentTournament.bustouts?.length ?? 0) &&
          parsedValue > (currentTournament.buyins?.length ?? 0)) {
        setStorageError("Bustouts cannot exceed the number of players.");
        return;
      }
      updatedFields = {
        ...(field === "bustoutCount"
          ? getBustoutUpdates(currentTournament, parsedValue, now())
          : {
              [arrayField]: resizeParticipants(
                currentTournament[arrayField] ?? [],
                parsedValue,
                now(),
              ),
            }),
      };
    } else if (field === "maxPlayersPerTable") {
      updatedFields = {
        [field]: normalizeMaxPlayersPerTable(value),
      };
    } else if (field === "otherPrizePool" || field === "otherChipstack") {
      const parsedValue = Number(value);
      updatedFields = {
        [field]: Number.isFinite(parsedValue) ? Math.max(0, parsedValue) : 0,
      };
    } else {
      return;
    }

    if (!pendingFieldUpdatesRef.current) {
      pendingFieldBaseRef.current = {
        tournaments: latestTournamentsRef.current,
        activeTournamentId: tournamentId,
      };
    }
    const nextTournaments = latestTournamentsRef.current.map((tournament) =>
      tournament.id === tournamentId
        ? updateBustoutPayouts({ ...tournament, ...updatedFields })
        : tournament,
    );
    latestTournamentsRef.current = nextTournaments;
    setTournaments(nextTournaments);
    pendingFieldUpdatesRef.current = true;
    window.clearTimeout(fieldUpdateTimeoutRef.current);
    fieldUpdateTimeoutRef.current = window.setTimeout(
      flushTournamentFieldUpdates,
      200,
    );
  }

  function beginTournamentFieldEdit(tournament, field) {
    const key = `${tournament.id}\0${field}`;
    if (!fieldDraftsRef.current.has(key)) fieldDraftsRef.current.set(key, tournament);
  }

  function endTournamentFieldEdit(tournamentId, field) {
    const key = `${tournamentId}\0${field}`;
    const expected = fieldDraftsRef.current.get(key);
    fieldDraftsRef.current.delete(key);
    return expected;
  }

  const clearTournamentFieldEdits = useCallback(() => {
    fieldDraftsRef.current.clear();
  }, []);

  async function updateTournamentTimer(tournamentId, timerState, expectedTournament) {
    if (pendingFieldUpdatesRef.current && !(await flushTournamentFieldUpdates())) return false;
    const baseTournaments = latestTournamentsRef.current.map((tournament) =>
      tournament.id === tournamentId ? expectedTournament : tournament,
    );
    const baseActiveId = tournamentId;
    const nextTournaments = baseTournaments.map((tournament) =>
      tournament.id === tournamentId
        ? { ...tournament, ...timerState }
        : tournament,
    );
    if (!nextTournaments.some((tournament) => tournament.id === tournamentId)) {
      return false;
    }

    return persistTournamentData(
      nextTournaments,
      baseActiveId,
      baseTournaments,
      baseActiveId,
      true,
    );
  }

  async function saveTournament(tournament, editingId, editingBase) {
    const baseTournaments = editingId && editingBase
      ? tournaments.map((item) => item.id === editingId ? editingBase : item)
      : tournaments;
    if (editingId && !baseTournaments.some((item) => item.id === editingId)) {
      setStorageError("The tournament was deleted. Your changes were not saved.");
      return false;
    }
    const nextTournaments = editingId
      ? tournaments.map((item) => (item.id === editingId ? tournament : item))
      : [...tournaments, tournament];

    return persistTournamentData(nextTournaments, activeTournamentId, baseTournaments, activeTournamentId);
  }

  async function copyTournament(tournamentId) {
    if (!(await flushTournamentFieldUpdates())) return false;
    const source = latestTournamentsRef.current.find(
      (tournament) => tournament.id === tournamentId,
    );
    if (!source) {
      return false;
    }

    const copy = {
      id: crypto.randomUUID(),
      name: `Copy of ${source.name}`,
      startingChipstack: source.startingChipstack ?? null,
      rebuysAllowed: source.rebuysAllowed ?? false,
      addonsAllowed: source.addonsAllowed ?? false,
      buyinCost: source.buyinCost ?? null,
      buyinDescription: source.buyinDescription ?? null,
      rebuyCost: source.rebuyCost ?? null,
      rebuyChipstack: source.rebuyChipstack ?? null,
      rebuyDescription: source.rebuyDescription ?? null,
      addonCost: source.addonCost ?? null,
      addonChipstack: source.addonChipstack ?? null,
      addonDescription: source.addonDescription ?? null,
      buyins: [],
      rebuys: [],
      addons: [],
      otherPrizePool: 0,
      otherChipstack: 0,
      bustouts: [],
      payoutPlaces: 0,
      payouts: [],
      maxPlayersPerTable: normalizeMaxPlayersPerTable(source.maxPlayersPerTable),
      timerIsRunning: false,
      timerStartedAt: null,
      timerElapsedMs: 0,
      chips: (source.chips ?? []).map((chip) => ({ ...chip })),
      levels: source.levels.map((level) => ({ ...level })),
    };
    const nextTournaments = [...latestTournamentsRef.current, copy];
    if (
      !(await persistTournamentData(
        nextTournaments,
        latestActiveTournamentIdRef.current,
        latestTournamentsRef.current,
        latestActiveTournamentIdRef.current,
      ))
    ) {
      return false;
    }

    setExpandedTournamentId(copy.id);
    return true;
  }

  async function deleteTournament(id, expectedTournament) {
    if (!(await flushTournamentFieldUpdates())) return false;
    if (!latestTournamentsRef.current.some((item) => item.id === id)) {
      setStorageError("The tournament was already deleted.");
      return false;
    }
    const baseTournaments = latestTournamentsRef.current.map((item) =>
      item.id === id ? expectedTournament : item,
    );
    const baseActiveId = latestActiveTournamentIdRef.current;
    const nextTournaments = baseTournaments.filter((item) => item.id !== id);
    const nextActiveTournamentId =
      baseActiveId === id ? null : baseActiveId;
    return persistTournamentData(nextTournaments, nextActiveTournamentId, baseTournaments, baseActiveId);
  }

  async function updateEntryCount(tournamentId, field, value) {
    if (saving) {
      return;
    }

    const parsedCount = Number(value);
    if (!Object.hasOwn(participantFields, field) || !Number.isInteger(parsedCount) || parsedCount < 0 || parsedCount > MAX_PARTICIPANT_COUNT) {
      setStorageError(`Participant counts must be whole numbers between 0 and ${MAX_PARTICIPANT_COUNT.toLocaleString()}.`);
      return;
    }
    const arrayField = participantFields[field];
    const tournament = tournaments.find((item) => item.id === tournamentId);
    if (field === "bustoutCount" && tournament &&
        parsedCount > (tournament.bustouts?.length ?? 0) &&
        parsedCount > (tournament.buyins?.length ?? 0)) {
      setStorageError("Bustouts cannot exceed the number of players.");
      return;
    }
    const nextTournaments = tournaments.map((tournament) =>
      tournament.id === tournamentId
        ? {
            ...tournament,
            ...(field === "bustoutCount"
              ? getBustoutUpdates(tournament, parsedCount, now())
              : {
                  [arrayField]: resizeParticipants(
                    tournament[arrayField] ?? [],
                    parsedCount,
                    now(),
                  ),
                }),
          }
        : tournament,
    );
    if (await persistTournamentData(nextTournaments)) {
      setEntryCountDrafts((drafts) => {
        const tournamentDrafts = { ...drafts[tournamentId] };
        delete tournamentDrafts[field];
        return { ...drafts, [tournamentId]: tournamentDrafts };
      });
    }
  }

  async function updateOtherValue(tournamentId, field, value) {
    if (saving) {
      return;
    }

    const parsedValue = Number(value);
    const amount = Number.isFinite(parsedValue) ? Math.max(0, parsedValue) : 0;
    const nextTournaments = tournaments.map((tournament) =>
      tournament.id === tournamentId
        ? { ...tournament, [field]: amount }
        : tournament,
    );
    if (await persistTournamentData(nextTournaments)) {
      setEntryCountDrafts((drafts) => {
        const tournamentDrafts = { ...drafts[tournamentId] };
        delete tournamentDrafts[field];
        return { ...drafts, [tournamentId]: tournamentDrafts };
      });
    }
  }

  async function updatePayoutPlaces(tournamentId, value) {
    if (saving) {
      return;
    }

    const parsedPlaces = Number(value);
    const tournament = tournaments.find((item) => item.id === tournamentId);
    if (!tournament) {
      return;
    }

    const places = Number.isFinite(parsedPlaces)
      ? Math.min(1_000, Math.max(0, Math.floor(parsedPlaces)))
      : 0;
    const payouts = Array.from({ length: places }, (_, index) =>
      Number(tournament.payouts?.[index] ?? 0),
    );
    const nextTournaments = tournaments.map((item) =>
      item.id === tournamentId
        ? { ...item, payoutPlaces: places, payouts }
        : item,
    );

    if (await persistTournamentData(nextTournaments)) {
      setPayoutPlaceDrafts((drafts) => {
        const nextDrafts = { ...drafts };
        delete nextDrafts[tournamentId];
        return nextDrafts;
      });
      setPayoutDrafts((drafts) => ({
        ...drafts,
        [tournamentId]: payouts.map(String),
      }));
    }
  }

  async function updatePayout(tournamentId, index, value) {
    if (saving) {
      return;
    }

    const parsedPayout = Number(value);
    const amount =
      value.trim() !== "" && Number.isFinite(parsedPayout)
        ? Math.max(0, parsedPayout)
        : 0;
    const tournament = tournaments.find((item) => item.id === tournamentId);
    if (!tournament) {
      return;
    }

    const payouts = Array.from(
      { length: tournament.payoutPlaces ?? 0 },
      (_, payoutIndex) =>
        payoutIndex === index
          ? amount
          : Number(tournament.payouts?.[payoutIndex] ?? 0),
    );
    const nextTournaments = tournaments.map((item) =>
      item.id === tournamentId ? { ...item, payouts } : item,
    );

    if (await persistTournamentData(nextTournaments)) {
      setPayoutDrafts((drafts) => {
        const nextDrafts = [...(drafts[tournamentId] ?? [])];
        nextDrafts[index] = String(amount);
        return { ...drafts, [tournamentId]: nextDrafts };
      });
    }
  }

  async function resetEntryCounts(activeTournament) {
    if (!activeTournament || saving) {
      return;
    }

    if (!(await flushTournamentFieldUpdates())) return;
    const resetFields = {
      buyins: [],
      rebuys: [],
      addons: [],
      otherPrizePool: 0,
      otherChipstack: 0,
      bustouts: [],
    };
    const baseTournaments = latestTournamentsRef.current.map((tournament) =>
      tournament.id === activeTournament.id ? activeTournament : tournament,
    );
    if (!baseTournaments.some((tournament) => tournament.id === activeTournament.id)) {
      setStorageError("The tournament was deleted. Your changes were not saved.");
      return;
    }
    const baseActiveId = activeTournament.id;
    const nextTournaments = baseTournaments.map((tournament) =>
      tournament.id === activeTournament.id
        ? { ...tournament, ...resetFields }
        : tournament,
    );

    if (await persistTournamentData(nextTournaments, baseActiveId, baseTournaments, baseActiveId, true)) {
      setEntryCountDrafts((drafts) => ({
        ...drafts,
        [activeTournament.id]: {},
      }));
    }
  }

  async function resetBustoutCount(activeTournament) {
    if (!activeTournament || saving) {
      return;
    }

    if (!(await flushTournamentFieldUpdates())) return;
    const baseTournaments = latestTournamentsRef.current.map((tournament) =>
      tournament.id === activeTournament.id ? activeTournament : tournament,
    );
    if (!baseTournaments.some((tournament) => tournament.id === activeTournament.id)) {
      setStorageError("The tournament was deleted. Your changes were not saved.");
      return;
    }
    const baseActiveId = activeTournament.id;
    const nextTournaments = baseTournaments.map((tournament) =>
      tournament.id === activeTournament.id
        ? { ...tournament, bustouts: [] }
        : tournament,
    );
    if (await persistTournamentData(nextTournaments, baseActiveId, baseTournaments, baseActiveId, true)) {
      setEntryCountDrafts((drafts) => {
        const nextDrafts = { ...drafts[activeTournament.id] };
        delete nextDrafts.bustoutCount;
        return { ...drafts, [activeTournament.id]: nextDrafts };
      });
    }
  }

  async function resetPayouts(activeTournament) {
    if (!activeTournament || saving) {
      return;
    }

    const nextTournaments = tournaments.map((tournament) =>
      tournament.id === activeTournament.id
        ? { ...tournament, payoutPlaces: 0, payouts: [] }
        : tournament,
    );

    if (await persistTournamentData(nextTournaments, activeTournament.id, tournaments, activeTournament.id, true)) {
      setPayoutPlaceDrafts((drafts) => {
        const nextDrafts = { ...drafts };
        delete nextDrafts[activeTournament.id];
        return nextDrafts;
      });
      setPayoutDrafts((drafts) => ({
        ...drafts,
        [activeTournament.id]: [],
      }));
    }
  }

  async function updateMaxPlayersPerTable(tournamentId, value) {
    if (saving) {
      return;
    }

    const maxPlayersPerTable = normalizeMaxPlayersPerTable(value);
    const nextTournaments = tournaments.map((tournament) =>
      tournament.id === tournamentId
        ? { ...tournament, maxPlayersPerTable }
        : tournament,
    );

    if (await persistTournamentData(nextTournaments, tournamentId, tournaments, tournamentId, true)) {
      setTableMaxDrafts((drafts) => {
        const nextDrafts = { ...drafts };
        delete nextDrafts[tournamentId];
        return nextDrafts;
      });
    }
  }

  async function resetTables(activeTournament) {
    if (!activeTournament || saving) {
      return;
    }

    await updateMaxPlayersPerTable(activeTournament.id, DEFAULT_MAX_PLAYERS_PER_TABLE);
  }

  return {
    activeTournament: tournaments.find(
      (tournament) => tournament.id === activeTournamentId,
    ),
    activeTournamentId,
    beginTournamentFieldEdit,
    clearTournamentFieldEdits,
    copyTournament,
    deleteTournament,
    entryCountDrafts,
    endTournamentFieldEdit,
    expandedTournamentId,
    loadingTournaments,
    loadTournaments: reloadTournaments,
    persistTournamentData,
    payoutDrafts,
    payoutPlaceDrafts,
    resetBustoutCount,
    resetEntryCounts,
    resetPayouts,
    resetTables,
    saveTournament,
    saving,
    setActiveTournamentId,
    setEntryCountDrafts,
    setExpandedTournamentId,
    setPayoutDrafts,
    setPayoutPlaceDrafts,
    setStorageError,
    setTableMaxDrafts,
    storageError,
    tableMaxDrafts,
    tournaments,
    updateEntryCount,
    updateMaxPlayersPerTable,
    updateOtherValue,
    updatePayout,
    updatePayoutPlaces,
    flushTournamentFieldUpdates,
    updateTournamentField,
    updateTournamentTimer,
  };
}
