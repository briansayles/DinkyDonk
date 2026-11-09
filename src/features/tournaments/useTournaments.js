import { useEffect, useState } from "react";
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

  async function loadTournaments() {
    const savedTournaments = await invoke("load_tournaments");
    const normalizedTournaments = normalizeTournaments(
      savedTournaments.tournaments,
    );
    setTournaments(normalizedTournaments);
    setActiveTournamentId(savedTournaments.activeTournamentId);
    setExpandedTournaments(
      savedTournaments.activeTournamentId
        ? { [savedTournaments.activeTournamentId]: true }
        : {},
    );
  }

  useEffect(() => {
    let active = true;

    invoke("load_tournaments")
      .then((savedTournaments) => {
        if (active) {
          setTournaments(normalizeTournaments(savedTournaments.tournaments));
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

  async function updateTournamentTimer(tournamentId, timerState) {
    const nextTournaments = tournaments.map((tournament) =>
      tournament.id === tournamentId
        ? { ...tournament, ...timerState }
        : tournament,
    );
    if (!nextTournaments.some((tournament) => tournament.id === tournamentId)) {
      return false;
    }

    return persistTournamentData(nextTournaments);
  }

  async function saveTournament(tournament, editingId) {
    const nextTournaments = editingId
      ? tournaments.map((item) => (item.id === editingId ? tournament : item))
      : [...tournaments, tournament];

    return persistTournamentData(nextTournaments);
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
    updateTournamentTimer,
  };
}
