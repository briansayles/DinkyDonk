import { getCurrency } from "locale-currency";
import { formatChipNumber } from "./timerDisplay.js";

export {
  formatAmount, formatBlinds, formatChipDenomination, formatChipNumber,
  formatClock, getCurrentLevel, getCurrentOrLastLevel, getLevelDurationMs, sortLevels,
} from "./timerDisplay.js";

const curatedBlindValues = [
  1, 2, 3, 4, 5, 6, 8, 10, 15, 20, 30, 40, 50, 60, 80, 100, 150, 200, 
  300, 400, 500, 600, 800, 1000,
];

export const DEFAULT_EDGE_SPOT_QUANTITY = 6;
export const MIN_EDGE_SPOT_QUANTITY = 2;
export const MAX_EDGE_SPOT_QUANTITY = 12;
export const DEFAULT_PERCENT_PAID = 20;
export const DEFAULT_PAYOUT_MODEL = "Standard";
export const DEFAULT_ALLOW_PAYOUT_OVERRIDE = true;
export const DEFAULT_MAX_PLAYERS_PER_TABLE = 9;
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
  { minPayout: 0, roundTo: 1 },
  { minPayout: 5, roundTo: 1 },
  { minPayout: 10, roundTo: 5 },
  { minPayout: 20, roundTo: 5 },
  { minPayout: 50, roundTo: 10 },
  { minPayout: 100, roundTo: 25 },
  { minPayout: 1000, roundTo: 250 },
  { minPayout: Infinity, roundTo: 500 },
];

function isFourOrSixScaledBlind(smallBlind) {
  let value = Number(smallBlind);
  if (!Number.isFinite(value) || value <= 0) return false;
  while (value >= 10 && value % 10 === 0) value /= 10;
  return value === 4 || value === 6;
}

export function createGuidedTournamentStructure(tournament, answers) {
  const { smallestChip, players, durationHours } = answers;
  const rawStartingStack = smallestChip * 400;
  let startingChipstack = Math.round(rawStartingStack);
  if (
    !Number.isFinite(smallestChip) || smallestChip <= 0 ||
    !Number.isSafeInteger(startingChipstack) || startingChipstack <= 0 ||
    Math.abs(rawStartingStack - startingChipstack) >
      Math.max(1, rawStartingStack) * 4
  ) {
    throw new Error("The smallest chip must produce a positive whole-number starting chipstack when multiplied by 400.");
  }
  if (!Number.isSafeInteger(players) || players <= 0) {
    throw new Error("The approximate player count must be a positive whole number.");
  }
  const totalChips = startingChipstack * players;
  const totalMinutes = durationHours * 60;
  if (
    !Number.isFinite(totalChips) || !Number.isFinite(totalMinutes) ||
    !Number.isFinite(totalMinutes * 60_000) || totalMinutes <= 0
  ) {
    throw new Error("The requested player count or duration is too large.");
  }

  function getLevels(stack) {
    const maximumBigBlind = stack * players * 0.1;
    const levels = tournament.levels.filter((level) => {
      if (level.isBreak) return true;
      if (
        level.smallBlind == null || level.bigBlind == null ||
        !Number.isFinite(Number(level.smallBlind)) ||
        !Number.isFinite(Number(level.bigBlind))
      ) {
        throw new Error("The starter template contains a level without valid blinds.");
      }
      return Number(level.smallBlind) >= smallestChip * 2 &&
        Number(level.bigBlind) <= maximumBigBlind;
    });
    const templateBlindLevels = tournament.levels.filter((level) => !level.isBreak);
    const highestTemplateBigBlind = Math.max(...templateBlindLevels.map((level) => Number(level.bigBlind)));
    if (maximumBigBlind >= 20_000 && highestTemplateBigBlind < maximumBigBlind) {
      const progression = templateBlindLevels
        .filter((level) => Number(level.smallBlind) >= 1_000 && Number(level.smallBlind) < 10_000)
        .sort((first, second) => Number(first.smallBlind) - Number(second.smallBlind));
      if (!progression.some((level) => Number(level.smallBlind) === 1_000 && Number(level.bigBlind) === 2_000)) {
        throw new Error("The starter template must include a 1,000/2,000 level to extend the blind schedule.");
      }

      const highestTemplateSmallBlind = Math.max(...templateBlindLevels.map((level) => Number(level.smallBlind)));
      const lowestProgressionBigBlind = Math.min(...progression.map((level) => Number(level.bigBlind)));
      if (lowestProgressionBigBlind <= 0) {
        throw new Error("The starter template contains an invalid blind progression.");
      }
      for (let multiplier = 10; lowestProgressionBigBlind * multiplier <= maximumBigBlind; multiplier *= 10) {
        for (const level of progression) {
          const smallBlind = Number(level.smallBlind) * multiplier;
          const bigBlind = Number(level.bigBlind) * multiplier;
          if (
            smallBlind <= highestTemplateSmallBlind ||
            smallBlind < smallestChip * 2 || bigBlind > maximumBigBlind
          ) continue;
          const ante = level.ante == null ? level.ante : Number(level.ante) * multiplier;
          if (ante != null && !Number.isFinite(ante)) {
            throw new Error("The starter template contains an invalid ante in the blind progression.");
          }
          levels.push({ ...level, smallBlind, bigBlind, ante });
        }
      }
    }
    if (!levels.some((level) => !level.isBreak)) {
      throw new Error("No starter-template blind levels match the selected chip denomination and player count.");
    }
    if (levels.some((level) => !Number.isFinite(Number(level.duration)) || Number(level.duration) <= 0)) {
      throw new Error("The starter template contains a level without a positive duration.");
    }
    return levels;
  }

  let levels = getLevels(startingChipstack);
  let levelDuration = Math.max(1, Math.round(totalMinutes / levels.length));
  if (levelDuration < 10) {
    const shortenedLevels = levels.filter(
      (level) => level.isBreak || !isFourOrSixScaledBlind(level.smallBlind),
    );
    if (shortenedLevels.some((level) => !level.isBreak)) {
      levels = shortenedLevels;
      levelDuration = Math.max(1, Math.round(totalMinutes / levels.length));
    }
  }
  if (levelDuration < 10) {
    if (!Number.isSafeInteger(startingChipstack / 2)) {
      throw new Error("The starting chipstack cannot be halved to a whole number. Choose a different smallest chip.");
    }
    startingChipstack /= 2;
    levels = getLevels(startingChipstack);
    const shortenedLevels = levels.filter(
      (level) => level.isBreak || !isFourOrSixScaledBlind(level.smallBlind),
    );
    if (shortenedLevels.some((level) => !level.isBreak)) {
      levels = shortenedLevels;
    }
    levelDuration = Math.max(1, Math.round(totalMinutes / levels.length));
  }
  if (levelDuration < 10 && levels.length > 1) {
    levelDuration = Math.max(8, Math.round(totalMinutes / (levels.length - 1)));
  }

  return {
    ...tournament,
    name: "T-" + formatChipNumber(startingChipstack).trimEnd() +  " Tournament " + new Date().toLocaleDateString(),
    startingChipstack,
    chips: (tournament.chips ?? []).filter((chip) =>
      chip.denomination >= smallestChip,
    ),
    levels: levels.map((level) => ({
      ...level,
      duration: levelDuration,
    })),
  };
}

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
  playerCount,
  totalPrizePool,
  percentPaid = DEFAULT_PERCENT_PAID,
  payoutModel = DEFAULT_PAYOUT_MODEL,
  allowPayoutOverride = DEFAULT_ALLOW_PAYOUT_OVERRIDE,
  payoutPlaces = 0,
  payouts = [],
}) {
  const defaultPayoutPlaces = Math.max(
    1,
    Math.round((playerCount * Number(percentPaid)) / 100),
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

export function getPayoutTimerMessage({
  totalEntries,
  effectivePayoutPlaces,
  allowPayoutOverride,
  payoutPlaces,
  payouts,
}) {
  const paytableEdited =
    allowPayoutOverride && (payoutPlaces > 0 || payouts.length > 0);
  return effectivePayoutPlaces > 0 && (totalEntries > 0 || paytableEdited)
    ? `Top ${effectivePayoutPlaces.toLocaleString()} Players Paid`
    : "";
}

export function getEntryContributions(count, cost, chipstack) {
  return {
    contribution: count * Number(cost ?? 0),
    chipsInPlay: count * Number(chipstack ?? 0),
  };
}

export function normalizeMaxPlayersPerTable(value) {
  const parsedValue = Number(value);
  const count = Number.isFinite(parsedValue)
    ? Math.min(4_294_967_295, Math.max(0, Math.floor(parsedValue)))
    : 0;
  return count || DEFAULT_MAX_PLAYERS_PER_TABLE;
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
  const playerCount = tournament.buyins?.length ?? 0;
  const totalPrizePool = counts.reduce(
    (total, entry) => total + entry.count * Number(entry.cost ?? 0),
    Number(tournament.otherPrizePool ?? 0),
  );
  const { payouts } = getEffectivePayouts({ ...tournament, playerCount, totalPrizePool });
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

export function getStructureSupportedPlayers(startingChipstack, levels) {
  const finalBigBlind = [...levels].reverse().find((level) => !level.isBreak)?.bigBlind;
  if (
    startingChipstack == null || String(startingChipstack).trim() === "" ||
    finalBigBlind == null || String(finalBigBlind).trim() === ""
  ) {
    return null;
  }
  const stack = Number(startingChipstack);
  const bigBlind = Number(finalBigBlind);
  if (!Number.isFinite(stack) || stack <= 0 || !Number.isFinite(bigBlind) || bigBlind <= 0) {
    return null;
  }
  const players = Math.ceil((10 * bigBlind) / stack);
  return Number.isFinite(players) ? players : null;
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
      ? ratio > 1.5 
      : ratio >= 1 && ratio < 1.25;
  });
}

export function hasSmallLevelChange(levels, index) {
  return hasLevelChange(levels, index, false);
}

export function hasLargeLevelChange(levels, index) {
  return hasLevelChange(levels, index, true);
}
