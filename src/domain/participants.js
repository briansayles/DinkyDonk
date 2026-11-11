import { getCurrentLevel, getLevelDurationMs } from "./tournament.js";

export const MAX_PARTICIPANT_COUNT = 100_000;

export const participantFields = {
  buyinCount: "buyins",
  rebuyCount: "rebuys",
  addonCount: "addons",
  bustoutCount: "bustouts",
};

export function previewParticipantCount(draft, currentCount, maxCount = MAX_PARTICIPANT_COUNT) {
  if (draft == null || draft.trim() === "") {
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

export function resizeBustouts(tournament, count, timestamp = Date.now()) {
  const bustouts = tournament.bustouts ?? [];
  if (
    count > bustouts.length &&
    count > Math.max(0, (tournament.buyins?.length ?? 0) - 1)
  ) {
    throw new RangeError("Bustouts must leave at least one player remaining.");
  }
  const resized = resizeParticipants(bustouts, count, timestamp);
  if (count <= bustouts.length) {
    return bustouts.slice(bustouts.length - count);
  }

  const levels = tournament.levels ?? [];
  const totalDuration = levels.reduce(
    (total, level) => total + getLevelDurationMs(level),
    0,
  );
  const elapsed = Math.min(
    totalDuration,
    Math.max(
      0,
      (tournament.timerElapsedMs ?? 0) +
        (tournament.timerIsRunning && tournament.timerStartedAt != null
          ? Math.max(0, timestamp - tournament.timerStartedAt)
          : 0),
    ),
  );
  let remaining = elapsed;
  let playingMs = 0;
  for (const level of levels) {
    const duration = Math.min(remaining, getLevelDurationMs(level));
    if (!level.isBreak) {
      playingMs += duration;
    }
    remaining -= duration;
  }
  const level = getCurrentLevel(levels, elapsed)?.level;
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
    place: tournament.buyins.length - bustouts.length - index,
    pointsEarned: null,
  }));
  return [...newBustouts.reverse(), ...bustouts];
}
