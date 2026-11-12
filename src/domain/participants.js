import { getCurrentLevel, getLevelDurationMs } from "./tournament.js";

export const MAX_PARTICIPANT_COUNT = 100_000;

export const participantFields = {
  buyinCount: "buyins",
  rebuyCount: "rebuys",
  addonCount: "addons",
  bustoutCount: "bustouts",
};

export function previewParticipantCount(draft, currentCount, maxCount = MAX_PARTICIPANT_COUNT) {
  if (draft == null || String(draft).trim() === "") {
    return currentCount;
  }
  const count = Number(draft);
  return Number.isInteger(count) && count >= 0 && count <= maxCount
    ? count
    : currentCount;
}

export function resizeParticipants(participants, count, timestamp = Date.now()) {
  if (!Number.isInteger(count) || count < 0 || count > MAX_PARTICIPANT_COUNT) {
    throw new RangeError(`Count must be between 0 and ${MAX_PARTICIPANT_COUNT}.`);
  }
  if (count <= participants.length) {
    return participants.slice(0, count);
  }
  return [
    ...participants,
    ...Array.from({ length: count - participants.length }, () => ({
      name: "Unnamed",
      timestamp,
    })),
  ];
}

function getElapsedMs(tournament, timestamp) {
  return Math.max(
    0,
    (tournament.timerElapsedMs ?? 0) +
      (tournament.timerIsRunning && tournament.timerStartedAt != null
        ? Math.max(0, timestamp - tournament.timerStartedAt)
        : 0),
  );
}

export function getTournamentEndTimerState(
  tournament,
  bustoutCount,
  timestamp = Date.now(),
) {
  if (
    !tournament.timerIsRunning ||
    getTournamentEndBustoutCount(tournament, bustoutCount) == null
  ) {
    return null;
  }

  return {
    timerElapsedMs: getElapsedMs(tournament, timestamp),
    timerStartedAt: null,
    timerIsRunning: false,
  };
}

export function getTournamentEndBustoutCount(tournament, bustoutCount) {
  const startingPlayers = tournament.buyins?.length ?? 0;
  const previousBustoutCount = tournament.bustouts?.length ?? 0;
  if (
    startingPlayers <= 1 ||
    !Number.isInteger(bustoutCount) ||
    bustoutCount <= previousBustoutCount ||
    bustoutCount < startingPlayers - 1 ||
    bustoutCount > startingPlayers
  ) {
    return null;
  }

  return startingPlayers;
}

export function resizeBustouts(tournament, count, timestamp = Date.now()) {
  const bustouts = tournament.bustouts ?? [];
  const startingPlayers = tournament.buyins?.length ?? 0;
  if (count > bustouts.length && count > startingPlayers) {
    throw new RangeError("Bustouts cannot exceed the number of players.");
  }
  const resized = resizeParticipants(bustouts, count, timestamp);
  if (count <= bustouts.length) {
    return bustouts.slice(bustouts.length - count);
  }

  const levels = tournament.levels ?? [];
  const elapsed = getElapsedMs(tournament, timestamp);
  let remaining = elapsed;
  let playingMs = 0;
  let totalDuration = 0;
  for (const level of levels) {
    const levelDuration = getLevelDurationMs(level);
    totalDuration += levelDuration;
    const duration = Math.min(remaining, levelDuration);
    if (!level.isBreak) {
      playingMs += duration;
    }
    remaining -= duration;
  }
  if (totalDuration > 0) {
    playingMs += remaining;
  }
  const currentLevel = getCurrentLevel(levels, elapsed);
  const level = currentLevel && !currentLevel.level.isBreak
    ? currentLevel.level
    : totalDuration > 0
      ? levels.slice(0, currentLevel?.index ?? levels.length).reverse().find(
        (candidate) => !candidate.isBreak && getLevelDurationMs(candidate) > 0,
      )
      : null;
  const blinds = level && !level.isBreak
    ? {
        smallBlind: level.smallBlind ?? null,
        bigBlind: level.bigBlind ?? null,
        ante: level.ante ?? null,
      }
    : null;
  const newBustouts = resized.slice(bustouts.length).map((record, index) => ({
    ...record,
    blinds,
    elapsedSeconds: Math.floor(playingMs / 1000),
    place: startingPlayers - bustouts.length - index,
    pointsEarned: null,
  }));
  return [...newBustouts.reverse(), ...bustouts];
}
