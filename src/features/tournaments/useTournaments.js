import { useEffect, useRef, useState } from "react";
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

function normalizeTournaments(tournaments) {
  return tournaments.map((tournament) => ({
    ...tournament,
    chips: sortChips(tournament.chips ?? []),
    levels: sortLevels(tournament.levels),
  }));
}

function getBustoutUpdates(tournament, count) {
  const timestamp = Date.now();
  const completedBustoutCount =
    getTournamentEndBustoutCount(tournament, count) ?? count;
  return {
    bustouts: resizeBustouts(tournament, completedBustoutCount, timestamp),
    ...(getTournamentEndTimerState(tournament, count, timestamp) ?? {}),
  };
}

export function useTournaments() {
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
  const pendingFieldUpdatesRef = useRef(false);
  const fieldUpdateTimeoutRef = useRef(null);
  const saveQueueRef = useRef(Promise.resolve());
  const latestTournamentsRef = useRef(tournaments);
  const latestActiveTournamentIdRef = useRef(activeTournamentId);

  async function loadTournaments() {
    const savedTournaments = await invoke("load_tournaments");
    if (savingRef.current || pendingFieldUpdatesRef.current) {
      return;
    }

    const updatedTournaments = savedTournaments.tournaments.map(updateBustoutPayouts);
    if (updatedTournaments.some((tournament, index) => tournament !== savedTournaments.tournaments[index])) {
      const saved = await invoke("reconcile_bustout_payouts", {
        expectedTournaments: savedTournaments.tournaments,
        bustoutPayouts: updatedTournaments.map((tournament) =>
          (tournament.bustouts ?? []).map((bustout) => bustout.payout),
        ),
      });
      if (!saved || savingRef.current || pendingFieldUpdatesRef.current) {
        return;
      }
    }

    const normalizedTournaments = normalizeTournaments(
      updatedTournaments,
    );
    latestTournamentsRef.current = normalizedTournaments;
    latestActiveTournamentIdRef.current = savedTournaments.activeTournamentId;
    setTournaments((current) =>
      JSON.stringify(current) === JSON.stringify(normalizedTournaments)
        ? current
        : normalizedTournaments,
    );
    setActiveTournamentId((current) =>
      current === savedTournaments.activeTournamentId
        ? current
        : savedTournaments.activeTournamentId,
    );
  }

  useEffect(() => {
    let active = true;

    async function synchronizeTournaments() {
      if (!active || savingRef.current || loadingRef.current) {
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
            "Tournament structures could not be synchronized from the settings file.",
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
  ) {
    nextTournaments = nextTournaments.map(updateBustoutPayouts);
    savingRef.current = true;
    setSaving(true);
    try {
      await invoke("save_tournaments", {
        tournaments: nextTournaments,
        activeTournamentId: nextActiveTournamentId,
      });
      latestTournamentsRef.current = nextTournaments;
      latestActiveTournamentIdRef.current = nextActiveTournamentId;
      setTournaments(nextTournaments);
      setActiveTournamentId(nextActiveTournamentId);
      setStorageError("");
      return true;
    } catch (error) {
      console.error("Could not save tournament structures.", error);
      setStorageError("Tournament changes could not be saved to this device.");
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function flushTournamentFieldUpdates() {
    window.clearTimeout(fieldUpdateTimeoutRef.current);
    fieldUpdateTimeoutRef.current = null;
    if (!pendingFieldUpdatesRef.current) {
      return saveQueueRef.current;
    }

    pendingFieldUpdatesRef.current = false;
    const nextTournaments = latestTournamentsRef.current;
    const nextActiveTournamentId = latestActiveTournamentIdRef.current;
    savingRef.current = true;
    saveQueueRef.current = saveQueueRef.current.then(async () => {
      setSaving(true);
      try {
        await invoke("save_tournaments", {
          tournaments: nextTournaments,
          activeTournamentId: nextActiveTournamentId,
        });
        setStorageError("");
      } catch (error) {
        console.error("Could not save tournament field changes.", error);
        setStorageError("Tournament changes could not be saved to this device.");
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    });

    return saveQueueRef.current;
  }

  function updateTournamentField(
    tournamentId,
    field,
    value,
    payoutIndex,
    payoutPlacesForUpdate,
    calculatedPayouts,
  ) {
    const currentTournament = latestTournamentsRef.current.find(
      (tournament) => tournament.id === tournamentId,
    );
    if (!currentTournament) {
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
          ? getBustoutUpdates(currentTournament, parsedValue)
          : {
              [arrayField]: resizeParticipants(
                currentTournament[arrayField] ?? [],
                parsedValue,
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

  async function updateTournamentTimer(tournamentId, timerState) {
    const nextTournaments = latestTournamentsRef.current.map((tournament) =>
      tournament.id === tournamentId
        ? { ...tournament, ...timerState }
        : tournament,
    );
    if (!nextTournaments.some((tournament) => tournament.id === tournamentId)) {
      return false;
    }

    return persistTournamentData(
      nextTournaments,
      latestActiveTournamentIdRef.current,
    );
  }

  async function saveTournament(tournament, editingId) {
    const nextTournaments = editingId
      ? tournaments.map((item) => (item.id === editingId ? tournament : item))
      : [...tournaments, tournament];

    return persistTournamentData(nextTournaments);
  }

  async function copyTournament(tournamentId) {
    await flushTournamentFieldUpdates();
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
      ))
    ) {
      return false;
    }

    setExpandedTournamentId(copy.id);
    return true;
  }

  async function deleteTournament(id) {
    const nextTournaments = tournaments.filter((item) => item.id !== id);
    const nextActiveTournamentId =
      activeTournamentId === id ? null : activeTournamentId;
    return persistTournamentData(nextTournaments, nextActiveTournamentId);
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
              ? getBustoutUpdates(tournament, parsedCount)
              : {
                  [arrayField]: resizeParticipants(
                    tournament[arrayField] ?? [],
                    parsedCount,
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

    await flushTournamentFieldUpdates();
    const resetFields = {
      buyins: [],
      rebuys: [],
      addons: [],
      otherPrizePool: 0,
      otherChipstack: 0,
      bustouts: [],
    };
    const nextTournaments = latestTournamentsRef.current.map((tournament) =>
      tournament.id === activeTournament.id
        ? { ...tournament, ...resetFields }
        : tournament,
    );

    if (await persistTournamentData(nextTournaments)) {
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

    await flushTournamentFieldUpdates();
    const nextTournaments = latestTournamentsRef.current.map((tournament) =>
      tournament.id === activeTournament.id
        ? { ...tournament, bustouts: [] }
        : tournament,
    );
    if (await persistTournamentData(nextTournaments, latestActiveTournamentIdRef.current)) {
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

    if (await persistTournamentData(nextTournaments)) {
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

    if (await persistTournamentData(nextTournaments)) {
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
    copyTournament,
    deleteTournament,
    entryCountDrafts,
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
