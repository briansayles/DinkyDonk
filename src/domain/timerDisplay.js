export function formatAmount(value) {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 20 });
}

export function formatChipNumber(value) {
  return formatAmount(value);
}

export function formatChipDenomination(value) {
  const numericValue = Number(value);
  if (numericValue < 1_000) {
    return formatChipNumber(value);
  }
  if (numericValue < 1_000_000) {
    return `${formatChipNumber(numericValue / 1_000).trimEnd()}k`;
  }
  return `${formatChipNumber(numericValue / 1_000_000).trimEnd()}M`;
}

export function formatBlinds(smallBlind, bigBlind, ante) {
  const small = Number(smallBlind ?? 0);
  const big = Number(bigBlind ?? 0);
  const anteValue = Number(ante ?? 0);
  const blindText = `${formatChipDenomination(small)}/${formatChipDenomination(big)}`;
  return anteValue > 0
    ? `${blindText} + ${formatChipDenomination(anteValue)}`
    : blindText;
}

export function sortLevels(levels) {
  const compareBlindValues = (first, second) =>
    Number(first.smallBlind ?? 0) +
    Number(first.bigBlind ?? 0) +
    Number(first.ante ?? 0) -
    (Number(second.smallBlind ?? 0) +
      Number(second.bigBlind ?? 0) +
      Number(second.ante ?? 0));
  const regularLevels = levels
    .filter((level) => !level.isBreak)
    .map((level) => ({ ...level, isBreak: false }))
    .sort(compareBlindValues);
  let regularIndex = 0;
  return levels.map((level) =>
    level.isBreak ? { ...level, isBreak: true } : regularLevels[regularIndex++],
  );
}

export function getLevelDurationMs(level) {
  return Math.max(0, Number(level.duration ?? 0)) * 60_000;
}

export function getCurrentLevel(levels, elapsedMs) {
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

export function getCurrentOrLastLevel(levels, elapsedMs) {
  const currentLevel = getCurrentLevel(levels, elapsedMs);
  if (currentLevel) return currentLevel;

  let endMs = 0;
  let lastLevel = null;
  for (let index = 0; index < levels.length; index += 1) {
    const startMs = endMs;
    endMs += getLevelDurationMs(levels[index]);
    if (endMs > startMs) {
      lastLevel = { level: levels[index], index, startMs, endMs, remainingMs: 0 };
    }
  }
  return elapsedMs >= endMs ? lastLevel : null;
}

export function formatClock(milliseconds) {
  const totalSeconds = Math.ceil(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
