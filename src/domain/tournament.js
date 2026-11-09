import { getCurrency } from "locale-currency";

const curatedBlindValues = [
  1, 2, 3, 4, 5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 150, 200, 250,
  300, 400, 500, 600, 750, 1000,
];

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
  const sortedLevels = [];
  let regularLevels = [];

  for (const level of levels) {
    if (level.isBreak) {
      sortedLevels.push(
        ...regularLevels.sort(compareBlindValues),
        { ...level, isBreak: true },
      );
      regularLevels = [];
    } else {
      regularLevels.push({ ...level, isBreak: false });
    }
  }

  return [...sortedLevels, ...regularLevels.sort(compareBlindValues)];
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
