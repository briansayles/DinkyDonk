import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { sortChips, sortLevels } from "../../domain/tournament";

function normalizeTournaments(tournaments) {
  return tournaments.map((tournament) => ({
    ...tournament,
    chips: sortChips(tournament.chips ?? []),
    levels: sortLevels(tournament.levels),
  }));
}

export function useTournaments() {
  const [tournaments, setTournaments] = useState([]);
  const [activeTournamentId, setActiveTournamentId] = useState(null);
  const [expandedTournaments, setExpandedTournaments] = useState({});
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

    const normalizedTournaments = normalizeTournaments(
      savedTournaments.tournaments,
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
    if (savedTournaments.activeTournamentId) {
      setExpandedTournaments((current) =>
        Object.prototype.hasOwnProperty.call(
          current,
          savedTournaments.activeTournamentId,
        )
          ? current
          : { ...current, [savedTournaments.activeTournamentId]: true },
      );
    }
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
            "Tournament structures could not be synchronized from the settings directory.",
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

  function updateTournamentField(tournamentId, field, value, payoutIndex) {
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
      const payouts = Array.from(
        { length: currentTournament.payoutPlaces ?? 0 },
        (_, index) =>
          index === payoutIndex
            ? amount
            : Number(currentTournament.payouts?.[index] ?? 0),
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
    } else if (
      field === "buyinCount" ||
      field === "rebuyCount" ||
      field === "addonCount" ||
      field === "bustoutCount" ||
      field === "maxPlayersPerTable"
    ) {
      const parsedValue = Number(value);
      updatedFields = {
        [field]: Number.isFinite(parsedValue)
          ? Math.min(4_294_967_295, Math.max(0, Math.floor(parsedValue)))
          : 0,
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
        ? { ...tournament, ...updatedFields }
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
      buyinCount: 0,
      rebuyCount: 0,
      addonCount: 0,
      otherPrizePool: 0,
      otherChipstack: 0,
      bustoutCount: 0,
      payoutPlaces: 0,
      payouts: [],
      maxPlayersPerTable: source.maxPlayersPerTable ?? 0,
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

    setExpandedTournaments((current) => ({ ...current, [copy.id]: true }));
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
    const count = Number.isFinite(parsedCount)
      ? Math.min(4_294_967_295, Math.max(0, Math.floor(parsedCount)))
      : 0;
    const nextTournaments = tournaments.map((tournament) =>
      tournament.id === tournamentId
        ? { ...tournament, [field]: count }
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

    const resetFields = {
      buyinCount: 0,
      rebuyCount: 0,
      addonCount: 0,
      otherPrizePool: 0,
      otherChipstack: 0,
      bustoutCount: 0,
    };
    const nextTournaments = tournaments.map((tournament) =>
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

    await updateEntryCount(activeTournament.id, "bustoutCount", "0");
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

    const parsedValue = Number(value);
    const maxPlayersPerTable = Number.isFinite(parsedValue)
      ? Math.min(4_294_967_295, Math.max(0, Math.floor(parsedValue)))
      : 0;
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

    await updateMaxPlayersPerTable(activeTournament.id, "0");
  }

  return {
    activeTournament: tournaments.find(
      (tournament) => tournament.id === activeTournamentId,
    ),
    activeTournamentId,
    copyTournament,
    deleteTournament,
    entryCountDrafts,
    expandedTournaments,
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
    setExpandedTournaments,
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
