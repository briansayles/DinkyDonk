import { getCurrency } from "locale-currency";

const curatedBlindValues = [
  1, 2, 3, 4, 5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 150, 200, 250,
  300, 400, 500, 600, 750, 1000,
];

export const DEFAULT_EDGE_SPOT_QUANTITY = 6;
export const MIN_EDGE_SPOT_QUANTITY = 2;
export const MAX_EDGE_SPOT_QUANTITY = 12;
export const DEFAULT_PERCENT_PAID = 20;
export const DEFAULT_PAYOUT_MODEL = "Standard";
export const DEFAULT_ALLOW_PAYOUT_OVERRIDE = true;
export const PAYOUT_MODELS = ["Standard", "Flat", "Steep"];
export const PAYOUT_MODEL_CONSTANTS = {
  Standard: {
    decay: 0.317227,
    taper: 0.331926,
    exponent: 0.464529,
  },
  Flat: {
    decay: 0.163206,
    taper: 0.662261,
    exponent: 2.96558,
  },
  Steep: {
    decay: 0.299224,
    taper: 0.977922,
    exponent: 0.462913,
  },
};
export const PAYOUT_ROUND_TO_TABLE = [
  { minPayout: 5, roundTo: 1 },
  { minPayout: 10, roundTo: 5 },
  { minPayout: 20, roundTo: 5 },
  { minPayout: 50, roundTo: 10 },
  { minPayout: 100, roundTo: 25 },
  { minPayout: 1000, roundTo: 250 },
  { minPayout: Infinity, roundTo: 500 },
];

export function excelSequence(rows, columns = 1, start = 1, step = 1) {
  const rowCount = Math.trunc(rows);
  const columnCount = Math.trunc(columns);
  if (
    !Number.isFinite(rowCount) ||
    rowCount < 1 ||
    !Number.isFinite(columnCount) ||
    columnCount < 1 ||
    !Number.isFinite(start) ||
    !Number.isFinite(step)
  ) {
    throw new RangeError("Excel SEQUENCE requires positive dimensions and finite values.");
  }

  return Array.from({ length: rowCount }, (_, rowIndex) =>
    Array.from({ length: columnCount }, (_, columnIndex) =>
      start + (rowIndex * columnCount + columnIndex) * step,
    ),
  );
}

function calculateRawPayoutValues({
  sequence,
  playersPaid,
  totalPrizePool,
  constants,
}) {
  if (
    sequence.length === 0 ||
    sequence.length !== playersPaid ||
    !Number.isFinite(totalPrizePool) ||
    totalPrizePool < 0 ||
    !constants ||
    !Number.isFinite(constants.decay) ||
    !Number.isFinite(constants.taper) ||
    !Number.isFinite(constants.exponent)
  ) {
    return null;
  }

  const weights = sequence.map((place) => {
    const placeOffset = place - 1;
    const exponentValue =
      -constants.decay * placeOffset -
      constants.taper *
        (placeOffset / playersPaid) ** constants.exponent;
    return Math.exp(exponentValue);
  });
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
    return null;
  }

  return weights.map((weight) => (totalPrizePool * weight) / totalWeight);
}

export function calculateRawPayouts({
  playersPaid,
  totalPrizePool,
  payoutModel,
}) {
  if (
    !Number.isInteger(playersPaid) ||
    playersPaid < 1 ||
    !Number.isFinite(totalPrizePool) ||
    totalPrizePool < 0 ||
    !PAYOUT_MODEL_CONSTANTS[payoutModel]
  ) {
    return null;
  }

  const sequence = excelSequence(playersPaid).map(([place]) => place);
  return calculateRawPayoutValues({
    sequence,
    playersPaid,
    totalPrizePool,
    constants: PAYOUT_MODEL_CONSTANTS[payoutModel],
  });
}

export function lookupPayoutRoundTo(
  minimumPayout,
  table = PAYOUT_ROUND_TO_TABLE,
) {
  if (!Number.isFinite(minimumPayout) || minimumPayout < 0) {
    return null;
  }

  const isValidRoundToRow = (row) =>
    row &&
    (Number.isFinite(row.minPayout) || row.minPayout === Infinity) &&
    Number.isFinite(row.roundTo) &&
    row.roundTo > 0;
  const infinityFallback = table.find(
    (row) => isValidRoundToRow(row) && row.minPayout === Infinity,
  );
  const finiteRows = table.filter(
    (row) => isValidRoundToRow(row) && Number.isFinite(row.minPayout),
  );
  const highestFiniteMinPayout = finiteRows.reduce(
    (highest, row) => Math.max(highest, row.minPayout),
    -Infinity,
  );
  if (
    infinityFallback &&
    highestFiniteMinPayout > -Infinity &&
    minimumPayout > highestFiniteMinPayout
  ) {
    return infinityFallback.roundTo;
  }

  const matchingRow = finiteRows.reduce((bestMatch, row) => {
    if (
      row.minPayout > minimumPayout ||
      (bestMatch && row.minPayout <= bestMatch.minPayout)
    ) {
      return bestMatch;
    }

    return row;
  }, null);

  return matchingRow?.roundTo ?? null;
}

function roundAndBalancePayouts(rawPayouts, totalPrizePool) {
  if (
    !Array.isArray(rawPayouts) ||
    rawPayouts.length === 0 ||
    rawPayouts.some((payout) => !Number.isFinite(payout) || payout < 0) ||
    !Number.isFinite(totalPrizePool) ||
    totalPrizePool < 0
  ) {
    return null;
  }

  const positivePayouts = rawPayouts.filter((payout) => payout > 0);
  if (positivePayouts.length === 0) {
    return null;
  }

  const minimumPayout = Math.min(...positivePayouts);
  const roundTo = lookupPayoutRoundTo(minimumPayout);
  if (!Number.isFinite(roundTo) || roundTo <= 0) {
    return null;
  }

  const roundedPayouts = rawPayouts.map((payout) =>
    payout > 0 ? Math.round(payout / roundTo) * roundTo : 0,
  );
  const calculatedTotal = roundedPayouts.reduce(
    (total, payout) => total + payout,
    0,
  );
  const difference = totalPrizePool - calculatedTotal;
  roundedPayouts[0] += difference;

  return roundedPayouts;
}

export function calculateDefaultPayouts({
  playersPaid,
  totalPrizePool,
  payoutModel,
}) {
  if (
    !Number.isInteger(playersPaid) ||
    playersPaid < 1 ||
    !Number.isFinite(totalPrizePool) ||
    totalPrizePool < 0 ||
    !PAYOUT_MODELS.includes(payoutModel)
  ) {
    return [];
  }

  const rawPayouts = calculateRawPayouts({
    playersPaid,
    totalPrizePool,
    payoutModel,
  });
  const calculatedPayouts =
    rawPayouts && roundAndBalancePayouts(rawPayouts, totalPrizePool);

  return (
    calculatedPayouts ?? Array.from({ length: playersPaid }, () => null)
  );
}

export function getEffectivePayouts({
  totalEntries,
  totalPrizePool,
  percentPaid = DEFAULT_PERCENT_PAID,
  payoutModel = DEFAULT_PAYOUT_MODEL,
  allowPayoutOverride = DEFAULT_ALLOW_PAYOUT_OVERRIDE,
  payoutPlaces = 0,
  payouts = [],
}) {
  const defaultPayoutPlaces = Math.max(
    1,
    Math.round((totalEntries * Number(percentPaid)) / 100),
  );
  const parsedPlaces = Number(payoutPlaces);
  const overridePlaces = Number.isFinite(parsedPlaces)
    ? Math.min(1_000, Math.max(0, Math.floor(parsedPlaces)))
    : 0;
  const effectivePayoutPlaces = allowPayoutOverride && overridePlaces > 0
    ? overridePlaces
    : defaultPayoutPlaces;
  const defaultPayouts = calculateDefaultPayouts({
    playersPaid: effectivePayoutPlaces,
    totalPrizePool,
    payoutModel,
  });
  const manualPayouts = Array.from({ length: effectivePayoutPlaces }, (_, index) =>
    Number(payouts[index] ?? 0),
  );
  const useCalculatedPayouts =
    !allowPayoutOverride || !manualPayouts.some((payout) => payout !== 0);
  return {
    defaultPayoutPlaces,
    effectivePayoutPlaces,
    defaultPayouts,
    payouts: useCalculatedPayouts
      ? defaultPayouts.map((payout) => Number(payout ?? 0))
      : manualPayouts,
  };
}

export function getEntryContributions(count, cost, chipstack) {
  return {
    contribution: count * Number(cost ?? 0),
    chipsInPlay: count * Number(chipstack ?? 0),
  };
}

export function updateBustoutPayouts(tournament) {
  if (!tournament.bustouts?.length) {
    return tournament;
  }
  const counts = [
    { count: tournament.buyins?.length ?? 0, cost: tournament.buyinCost },
    ...(tournament.rebuysAllowed
      ? [{ count: tournament.rebuys?.length ?? 0, cost: tournament.rebuyCost }]
      : []),
    ...(tournament.addonsAllowed
      ? [{ count: tournament.addons?.length ?? 0, cost: tournament.addonCost }]
      : []),
  ];
  const totalEntries = counts.reduce((total, entry) => total + entry.count, 0);
  const totalPrizePool = counts.reduce(
    (total, entry) => total + entry.count * Number(entry.cost ?? 0),
    Number(tournament.otherPrizePool ?? 0),
  );
  const { payouts } = getEffectivePayouts({ ...tournament, totalEntries, totalPrizePool });
  let changed = false;
  const bustouts = tournament.bustouts.map((bustout) => {
    const payout = Number.isInteger(bustout.place) && bustout.place > 0
      ? (payouts[bustout.place - 1] ?? 0)
      : null;
    if (bustout.payout === payout) {
      return bustout;
    }
    changed = true;
    return { ...bustout, payout };
  });
  return changed ? { ...tournament, bustouts } : tournament;
}

export function normalizeEdgeSpotQuantity(quantity) {
  const parsedQuantity = Number(quantity);
  if (!Number.isFinite(parsedQuantity) || parsedQuantity === 0) {
    return DEFAULT_EDGE_SPOT_QUANTITY;
  }

  return Math.min(
    MAX_EDGE_SPOT_QUANTITY,
    Math.max(MIN_EDGE_SPOT_QUANTITY, Math.floor(parsedQuantity)),
  );
}

export function createEmptyLevel() {
  return {
    duration: "",
    smallBlind: "",
    bigBlind: "",
    ante: "",
    isBreak: false,
  };
}

export function getNextBlindValue(previousValue, scale = 1) {
  const previousBlind = Number(previousValue);
  const threshold = Number.isFinite(previousBlind)
    ? previousBlind / scale
    : 0;
  const nextBlind = curatedBlindValues.find((blind) => blind > threshold);
  return nextBlind === undefined ? "" : nextBlind * scale;
}

export function createNextLevel(previousLevel, duration = "") {
  const previousSmallBlind = Number(previousLevel?.smallBlind);
  const blindScale =
    previousSmallBlind >= 10_000 && previousSmallBlind < 100_000
      ? 100
      : previousSmallBlind >= 1_000 && previousSmallBlind < 10_000
        ? 10
        : 1;
  const smallBlind = getNextBlindValue(
    previousLevel?.smallBlind,
    blindScale,
  );
  const previousAnte = Number(previousLevel?.ante);
  const ante =
    Number.isFinite(previousAnte) && previousAnte > 0
      ? getNextBlindValue(previousAnte, blindScale)
      : "";

  return {
    ...createEmptyLevel(),
    duration,
    smallBlind,
    bigBlind: smallBlind === "" ? "" : smallBlind * 2,
    ante,
  };
}

export function sortChips(chips) {
  return [...chips].sort((first, second) => {
    const firstDenomination =
      first.denomination === "" ? Number.POSITIVE_INFINITY : Number(first.denomination);
    const secondDenomination =
      second.denomination === "" ? Number.POSITIVE_INFINITY : Number(second.denomination);
    return firstDenomination - secondDenomination;
  });
}

export function getChipStackSummary(chips) {
  const chipsWithQuantities = chips.filter(
    (chip) => chip.quantityPerPlayer !== "" && chip.quantityPerPlayer != null,
  );

  return {
    total: chipsWithQuantities.reduce(
      (total, chip) =>
        total +
        Number(chip.denomination ?? 0) * Number(chip.quantityPerPlayer),
      0,
    ),
    hasQuantities: chipsWithQuantities.length > 0,
    hasUnspecifiedQuantities: chipsWithQuantities.length < chips.length,
  };
}

export function formatChipStackTotal(chips) {
  const summary = getChipStackSummary(chips);
  if (!summary.hasQuantities) {
    return "Not set";
  }
  return summary.total.toLocaleString();
}

export function chipStackMatchesStarting(chips, startingChipstack) {
  const summary = getChipStackSummary(chips);
  return startingChipstack !== "" &&
    startingChipstack != null &&
    Number.isFinite(Number(startingChipstack)) &&
    summary.hasQuantities &&
    summary.total === Number(startingChipstack);
}

export function getStartingBigBlindMultiple(startingChipstack, levels) {
  const firstBigBlind = levels.find((level) => !level.isBreak)?.bigBlind;
  if (
    startingChipstack == null || String(startingChipstack).trim() === "" ||
    firstBigBlind == null || String(firstBigBlind).trim() === ""
  ) {
    return null;
  }
  const stack = Number(startingChipstack);
  const bigBlind = Number(firstBigBlind);
  if (!Number.isFinite(stack) || stack < 0 || !Number.isFinite(bigBlind) || bigBlind <= 0) {
    return null;
  }
  const multiple = stack / bigBlind;
  return Number.isFinite(multiple) ? multiple : null;
}

export function getLevelStatistics(levels) {
  const blindLevels = levels.filter((level) => !level.isBreak);
  const parseNonNegative = (value) => {
    if (value == null || String(value).trim() === "") {
      return null;
    }
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  };
  const durations = blindLevels.map((level) => parseNonNegative(level.duration));
  const blinds = blindLevels.map((level) => parseNonNegative(level.bigBlind));
  const averageTime = durations.length > 0 && durations.every((value) => value !== null)
    ? durations.reduce((total, value) => total + value, 0) / durations.length
    : null;
  let averageGrowth = null;
  if (blinds.length > 1 && blinds.every((value) => value !== null)) {
    let totalGrowth = 0;
    for (let index = 1; index < blinds.length; index += 1) {
      if (blinds[index - 1] === 0) {
        totalGrowth = null;
        break;
      }
      totalGrowth += (blinds[index] - blinds[index - 1]) / blinds[index - 1];
    }
    if (totalGrowth !== null && Number.isFinite(totalGrowth)) {
      averageGrowth = totalGrowth / (blinds.length - 1);
    }
  }
  const aggressiveness = averageGrowth !== null && Number.isFinite(averageTime) && averageTime > 0
    ? averageGrowth / averageTime
    : null;
  return {
    averageGrowth,
    averageTime: Number.isFinite(averageTime) ? averageTime : null,
    aggressiveness: Number.isFinite(aggressiveness) ? aggressiveness : null,
  };
}

export function getAggressivenessEvaluation(aggressiveness) {
  if (!Number.isFinite(aggressiveness)) {
    return null;
  }
  if (aggressiveness <= 0.02) {
    return "Slow";
  }
  return aggressiveness < 0.04 ? "Balanced" : "Fast";
}

export function formatAmount(value) {
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: 20,
  });
}

export function formatCurrency(value) {
  const locale = Intl.NumberFormat().resolvedOptions().locale;
  const region = new Intl.Locale(locale).maximize().region;
  const currency = getCurrency(locale) ?? getCurrency(region) ?? "USD";

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
  }).format(Number(value));
}

export function formatChipNumber(value) {
  return formatAmount(value);
}

export function formatBlinds(smallBlind, bigBlind, ante) {
  const small = Number(smallBlind ?? 0);
  const big = Number(bigBlind ?? 0);
  const anteValue = Number(ante ?? 0);
  const formatBlindValue = (value) => {
    if (value < 1_000) {
      return formatChipNumber(value);
    }

    return `${formatChipNumber(value / 1_000).trimEnd()}k`;
  };
  const blindText = `${formatBlindValue(small)}/${formatBlindValue(big)}`;

  return anteValue > 0
    ? `${blindText} + ${formatBlindValue(anteValue)}`
    : blindText;
}

export function getMaxChipSupportedPlayers(chips) {
  const playerLimits = chips
    .filter(
      (chip) =>
        chip.availableQuantity !== "" &&
        chip.availableQuantity != null &&
        chip.quantityPerPlayer !== "" &&
        chip.quantityPerPlayer != null &&
        Number(chip.quantityPerPlayer) > 0,
    )
    .map((chip) =>
      Math.floor(
        Number(chip.availableQuantity) / Number(chip.quantityPerPlayer),
      ),
    );

  return playerLimits.length > 0 ? Math.min(...playerLimits) : null;
}

export function getChipSupportedPlayers(chip) {
  if (
    chip.availableQuantity == null ||
    chip.availableQuantity === "" ||
    chip.quantityPerPlayer == null ||
    chip.quantityPerPlayer === "" ||
    Number(chip.quantityPerPlayer) <= 0
  ) {
    return null;
  }

  return Math.floor(
    Number(chip.availableQuantity) / Number(chip.quantityPerPlayer),
  );
}

export function isDivisibleByChip(value, denomination) {
  const chipUnits = value / denomination;
  return Math.abs(chipUnits - Math.round(chipUnits)) < 1e-9;
}

export function getChipColorUpsByLevel(chips, levels) {
  const colorUpsByLevel = new Map();
  const regularLevelIndexes = levels
    .map((level, index) => (level.isBreak ? -1 : index))
    .filter((index) => index >= 0);

  for (const chip of chips) {
    const denomination = Number(chip.denomination);
    const higherDenominations = chips
      .map((candidate) => Number(candidate.denomination))
      .filter((candidate) => candidate > denomination && candidate > 0);

    if (higherDenominations.length === 0) {
      continue;
    }

    const levelsRequiringChip = regularLevelIndexes.filter((index) => {
      const level = levels[index];
      const blindValues = [
        level.smallBlind,
        level.bigBlind,
        level.ante,
      ].map(Number).filter((value) => value > 0);

      return blindValues.some(
        (value) =>
          !higherDenominations.some((higherDenomination) =>
            isDivisibleByChip(value, higherDenomination),
          ),
      );
    });
    const lastNeededLevelIndex =
      levelsRequiringChip[levelsRequiringChip.length - 1];

    if (
      lastNeededLevelIndex == null ||
      lastNeededLevelIndex === regularLevelIndexes[regularLevelIndexes.length - 1]
    ) {
      continue;
    }

    colorUpsByLevel.set(lastNeededLevelIndex, [
      ...(colorUpsByLevel.get(lastNeededLevelIndex) ?? []),
      chip,
    ]);
  }

  return colorUpsByLevel;
}

export function getChipsInUse(chips, levels, currentLevelIndex) {
  if (currentLevelIndex == null) {
    return [];
  }

  const colorUpsByLevel = getChipColorUpsByLevel(chips, levels);
  const colorUpLevels = new Map();
  for (const [levelIndex, colorUpChips] of colorUpsByLevel) {
    for (const chip of colorUpChips) {
      colorUpLevels.set(chip, levelIndex);
    }
  }

  return [...chips]
    .filter(
      (chip) =>
        Number(chip.denomination) > 0 &&
        (!colorUpLevels.has(chip) ||
          currentLevelIndex <= colorUpLevels.get(chip)),
    )
    .sort((first, second) => Number(first.denomination) - Number(second.denomination))
    .map((chip) => ({
      ...chip,
      isColoringUp: colorUpLevels.get(chip) === currentLevelIndex,
    }))
    .slice(0, 5);
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

function hasLevelChange(levels, index, isLargeChange) {
  const level = levels[index];
  if (!level || level.isBreak) {
    return false;
  }
  const previousLevel = levels.slice(0, index).reverse().find((item) => !item.isBreak);
  if (!previousLevel) {
    return false;
  }

  return ["smallBlind", "bigBlind"].some((field) => {
    const current = level[field];
    const previous = previousLevel[field];
    if (
      current == null || previous == null ||
      String(current).trim() === "" || String(previous).trim() === ""
    ) {
      return false;
    }
    const currentValue = Number(current);
    const previousValue = Number(previous);
    if (
      !Number.isFinite(currentValue) || currentValue < 0 ||
      !Number.isFinite(previousValue) || previousValue < 0
    ) {
      return false;
    }
    if (previousValue === 0) {
      return isLargeChange && currentValue > 0;
    }
    const ratio = currentValue / previousValue;
    return isLargeChange
      ? ratio > 1.5 + Number.EPSILON * 4
      : ratio < 1.25 - Number.EPSILON * 4;
  });
}

export function hasSmallLevelChange(levels, index) {
  return hasLevelChange(levels, index, false);
}

export function hasLargeLevelChange(levels, index) {
  return hasLevelChange(levels, index, true);
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
  if (currentLevel) {
    return currentLevel;
  }

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
