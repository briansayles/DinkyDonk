import { strict as assert } from "node:assert";
import { test } from "node:test";
import { chipStackMatchesStarting, createGuidedTournamentStructure, formatChipDenomination, formatChipNumber, formatChipStackTotal, getAggressivenessEvaluation, getCurrentLevel, getCurrentOrLastLevel, getEffectivePayouts, getLevelStatistics, getPayoutTimerMessage, getStartingBigBlindMultiple, getStructureSupportedPlayers, hasLargeLevelChange, hasSmallLevelChange, normalizeMaxPlayersPerTable, sortLevels, updateBustoutPayouts } from "./tournament.js";

test("guided setup retains only template chips at or above the selected denomination", () => {
  const chips = [
    { denomination: 1, color: "white", quantityPerPlayer: 10 },
    { denomination: 5, color: "red", quantityPerPlayer: 8 },
    { denomination: 25, color: "green", quantityPerPlayer: 4 },
    { denomination: 100, color: "black", quantityPerPlayer: 2 },
  ];
  const template = {
    chips,
    levels: [
      { smallBlind: 300, bigBlind: 600, duration: 15 },
      { smallBlind: 1000, bigBlind: 2000, duration: 15 },
    ],
  };
  const answers = { smallestChip: 5, players: 10, durationHours: 1 };
  assert.deepEqual(createGuidedTournamentStructure(template, answers).chips, chips.slice(1));
  assert.deepEqual(createGuidedTournamentStructure(template, { ...answers, smallestChip: 6 }).chips, chips.slice(2));
  assert.deepEqual(createGuidedTournamentStructure(template, { ...answers, smallestChip: 125 }).chips, []);
  assert.equal(template.chips.length, 4);
});

test("guided setup extends the template progression across decades up to the big-blind limit", () => {
  const template = {
    levels: [
      { smallBlind: 500, bigBlind: 1000, duration: 15, ante: 0 },
      ...[1000, 1500, 2000, 3000, 4000, 5000, 7500].map((smallBlind) => ({
        smallBlind, bigBlind: smallBlind * 2, duration: 15, ante: 10,
      })),
      { smallBlind: 10000, bigBlind: 20000, duration: 15, ante: 0 },
    ],
  };
  const result = createGuidedTournamentStructure(template, {
    smallestChip: 500, players: 10, durationHours: 4,
  });
  assert.deepEqual(result.levels.map((level) => level.smallBlind), [
    1000, 1500, 2000, 3000, 4000, 5000, 7500,
    10000, 15000, 20000, 30000, 40000, 50000, 75000, 100000,
  ]);
  assert.equal(result.levels.at(-1).bigBlind, 200000);
  assert.equal(result.levels.at(-1).ante, 1000);
  assert.equal(result.levels.filter((level) => level.smallBlind === 10000).length, 1);
  assert.ok(Math.abs(result.levels.reduce((sum, level) => sum + level.duration, 0) - 240) < 1e-10);
  assert.equal(template.levels.length, 9);
});

test("guided setup extends to an exactly matching limit without adding levels above it", () => {
  const template = {
    levels: [1000, 1500, 2000, 3000, 4000, 5000, 7500].map((smallBlind) => ({
      smallBlind, bigBlind: smallBlind * 2, duration: 15, ante: 0,
    })),
  };
  const result = createGuidedTournamentStructure(template, {
    smallestChip: 500, players: 1, durationHours: 2,
  });
  assert.equal(result.levels.at(-1).smallBlind, 10000);
  assert.equal(result.levels.at(-1).bigBlind, 20000);
  assert.equal(result.levels.length, 8);
});

test("guided setup reports a missing progression when a higher schedule is needed", () => {
  const template = { levels: [{ smallBlind: 300, bigBlind: 600, duration: 15 }] };
  assert.throws(
    () => createGuidedTournamentStructure(template, { smallestChip: 125, players: 10, durationHours: 1 }),
    /must include a 1,000\/2,000 level/,
  );
});

test("guided setup filters blind boundaries and assigns equal durations to levels and breaks", () => {
  const template = {
    name: "Template",
    startingChipstack: 500,
    levels: [
      { smallBlind: 9, bigBlind: 18, duration: 10 },
      { smallBlind: 10, bigBlind: 20, duration: 10 },
      { isBreak: true, duration: 20 },
      { smallBlind: 20, bigBlind: 400, duration: 30 },
      { smallBlind: 30, bigBlind: 401, duration: 10 },
    ],
  };
  const result = createGuidedTournamentStructure(template, {
    smallestChip: 5, players: 2, durationHours: 1.5,
  });
  assert.equal(result.startingChipstack, 2000);
  assert.equal(result.name, "Template");
  assert.deepEqual(result.levels.map((level) => [level.smallBlind, level.bigBlind, level.duration]), [
    [10, 20, 30],
    [undefined, undefined, 30],
    [20, 400, 30],
  ]);
  assert.equal(template.levels.length, 5);
  assert.equal(template.startingChipstack, 500);
});

test("guided durations round to equal whole minutes including the final level", () => {
  const template = {
    levels: [10, 20, 30].map((smallBlind) => ({
      smallBlind, bigBlind: smallBlind * 2, duration: 15,
    })),
  };
  const result = createGuidedTournamentStructure(template, {
    smallestChip: 1, players: 10, durationHours: 100 / 60,
  });
  assert.deepEqual(result.levels.map((level) => level.duration), [33, 33, 33]);
  const roundedUp = createGuidedTournamentStructure(template, {
    smallestChip: 1, players: 10, durationHours: 101 / 60,
  });
  assert.deepEqual(roundedUp.levels.map((level) => level.duration), [34, 34, 34]);
});

test("guided setup removes 4 and 6 blind levels before recalculating short durations", () => {
  const template = {
    levels: [2, 3, 4, 5, 10, 15, 20].map((smallBlind) => ({
      smallBlind, bigBlind: smallBlind * 2, duration: 15,
    })),
  };
  const answers = { smallestChip: 1, players: 1, durationHours: 63 / 60 };
  const shortened = createGuidedTournamentStructure(template, answers);
  assert.equal(shortened.startingChipstack, 400);
  assert.deepEqual(shortened.levels.map((level) => level.smallBlind), [2, 3, 5, 10, 15, 20]);
  assert.ok(shortened.levels.every((level) => level.duration === 11));

  const tenMinutes = createGuidedTournamentStructure(template, {
    ...answers, durationHours: 66.5 / 60,
  });
  assert.equal(tenMinutes.startingChipstack, 400);
  assert.equal(tenMinutes.levels.length, 7);
  assert.ok(tenMinutes.levels.every((level) => level.duration === 10));

  const scaledBlindLevels = createGuidedTournamentStructure({
    levels: [4, 6, 10, 40, 60, 100, 400, 600].map((smallBlind) => ({
      smallBlind, bigBlind: smallBlind * 2, duration: 15,
    })),
  }, {
    smallestChip: 1, players: 30, durationHours: 64 / 60,
  });
  assert.deepEqual(
    scaledBlindLevels.levels.map((level) => level.smallBlind),
    [10, 100],
  );
  assert.ok(scaledBlindLevels.levels.every((level) => level.duration === 32));

  const veryShort = createGuidedTournamentStructure(template, {
    ...answers, durationHours: 2 / 60,
  });
  assert.equal(veryShort.startingChipstack, 200);
  assert.ok(veryShort.levels.every((level) => level.duration === 1));
});

test("guided setup calculates a remaining short duration without the last level", () => {
  const template = {
    levels: [2, 3, 5, 7, 8, 9].map((smallBlind) => ({
      smallBlind, bigBlind: smallBlind * 2, duration: 15,
    })),
  };
  const result = createGuidedTournamentStructure(template, {
    smallestChip: 1, players: 1, durationHours: 50 / 60,
  });
  assert.equal(result.startingChipstack, 200);
  assert.equal(result.levels.length, 6);
  assert.ok(result.levels.every((level) => level.duration === 10));
});

test("guided setup recalculates extended levels using the halved stack", () => {
  const template = {
    levels: [1000, 1500, 2000, 3000, 4000, 5000, 7500].map((smallBlind) => ({
      smallBlind, bigBlind: smallBlind * 2, duration: 15, ante: 0,
    })),
  };
  const result = createGuidedTournamentStructure(template, {
    smallestChip: 500, players: 10, durationHours: 2,
  });
  assert.equal(result.startingChipstack, 100000);
  assert.equal(result.levels.at(-1).bigBlind, 100000);
  assert.equal(result.levels.length, 13);
  assert.ok(result.levels.every((level) => level.duration === 9));
});

test("guided setup reports when halving cannot produce a whole-number stack", () => {
  const template = {
    levels: [{ smallBlind: 0.005, bigBlind: 0.01, duration: 15 }],
  };
  assert.throws(
    () => createGuidedTournamentStructure(template, {
      smallestChip: 0.0025, players: 10, durationHours: 1 / 60,
    }),
    /cannot be halved to a whole number/,
  );
});

test("guided setup uses at least one minute for very short durations", () => {
  const template = {
    levels: [
      { smallBlind: 0.14, bigBlind: 0.28, duration: 15 },
      { smallBlind: 0.2, bigBlind: 0.4, duration: 15 },
    ],
  };
  const result = createGuidedTournamentStructure(template, {
    smallestChip: 0.07, players: 2, durationHours: 1e-8,
  });
  assert.equal(result.startingChipstack, 14);
  assert.equal(result.levels.length, 2);
  assert.deepEqual(result.levels.map((level) => level.duration), [1, 1]);
});

test("guided setup reports impossible selections and invalid template durations", () => {
  const template = { levels: [{ smallBlind: 2, bigBlind: 4, duration: 15 }] };
  const answers = { smallestChip: 1, players: 10, durationHours: 1 };
  assert.throws(() => createGuidedTournamentStructure(template, { ...answers, smallestChip: 100, players: 1 }), /No starter-template blind levels/);
  assert.throws(() => createGuidedTournamentStructure(template, { ...answers, smallestChip: 0.001 }), /whole-number starting chipstack/);
  assert.throws(() => createGuidedTournamentStructure(template, { ...answers, players: 0 }), /player count/);
  assert.throws(() => createGuidedTournamentStructure({ levels: [{ smallBlind: 2, bigBlind: 4, duration: 0 }] }, answers), /positive duration/);
});

test("zero and missing table limits use nine while explicit limits are retained", () => {
  assert.equal(normalizeMaxPlayersPerTable(0), 9);
  assert.equal(normalizeMaxPlayersPerTable("0"), 9);
  assert.equal(normalizeMaxPlayersPerTable(undefined), 9);
  assert.equal(normalizeMaxPlayersPerTable(6), 6);
  assert.equal(normalizeMaxPlayersPerTable("12"), 12);
});

test("paid-player timer message requires entries or an edited paytable", () => {
  const empty = {
    totalEntries: 0,
    effectivePayoutPlaces: 1,
    allowPayoutOverride: true,
    payoutPlaces: 0,
    payouts: [],
  };
  assert.equal(getPayoutTimerMessage(empty), "");
  assert.equal(getPayoutTimerMessage({ ...empty, totalEntries: 1 }), "Top 1 Players Paid");
  assert.equal(getPayoutTimerMessage({ ...empty, payoutPlaces: 1 }), "Top 1 Players Paid");
  assert.equal(getPayoutTimerMessage({ ...empty, payouts: [0] }), "Top 1 Players Paid");
  assert.equal(getPayoutTimerMessage({ ...empty, payouts: [25] }), "Top 1 Players Paid");
  assert.equal(getPayoutTimerMessage({
    ...empty, allowPayoutOverride: false, payoutPlaces: 1, payouts: [25],
  }), "");
  assert.equal(getPayoutTimerMessage({
    ...empty, totalEntries: 1, effectivePayoutPlaces: 0,
  }), "");
});

test("structure support counts buy-ins needed to reach ten final big blinds", () => {
  const levels = [
    { bigBlind: 500 },
    { isBreak: true },
    { bigBlind: "10000" },
    { isBreak: true, bigBlind: 0 },
  ];
  assert.equal(getStructureSupportedPlayers("10000", levels), 10);
  assert.equal(getStructureSupportedPlayers(9000, levels), 12);
  assert.equal(getStructureSupportedPlayers(200000, levels), 1);
  assert.equal(getStructureSupportedPlayers(10000, [{ bigBlind: 10001 }]), 11);
});

test("structure support is unavailable without a valid stack and final blind", () => {
  const levels = [{ bigBlind: 100 }];
  for (const stack of ["", " ", null, 0, -1, "invalid", Infinity]) {
    assert.equal(getStructureSupportedPlayers(stack, levels), null);
  }
  for (const bigBlind of ["", null, 0, -1, "invalid", Infinity]) {
    assert.equal(getStructureSupportedPlayers(1000, [{ bigBlind: 100 }, { bigBlind }]), null);
  }
  assert.equal(getStructureSupportedPlayers(1000, [{ isBreak: true }]), null);
});

test("aggressiveness evaluation uses percentage-per-minute thresholds", () => {
  assert.equal(getAggressivenessEvaluation(0), "Slow");
  assert.equal(getAggressivenessEvaluation(0.02), "Slow");
  assert.equal(getAggressivenessEvaluation(0.020001), "Balanced");
  assert.equal(getAggressivenessEvaluation(0.039999), "Balanced");
  assert.equal(getAggressivenessEvaluation(0.04), "Fast");
  assert.equal(getAggressivenessEvaluation(null), null);
  for (const [bigBlind, expected] of [[120, "Slow"], [130, "Balanced"], [140, "Fast"]]) {
    const levels = [
      { duration: 10, bigBlind: 100 },
      { duration: 10, bigBlind },
    ];
    assert.equal(getAggressivenessEvaluation(getLevelStatistics(levels).aggressiveness), expected);
  }
});

test("level statistics average consecutive growth and level time without breaks", () => {
  const levels = [
    { duration: "10", bigBlind: "20" },
    { duration: 100, isBreak: true },
    { duration: 20, bigBlind: 30 },
    { duration: 30, bigBlind: 60 },
  ];
  assert.deepEqual(getLevelStatistics(levels), {
    averageGrowth: 0.75,
    averageTime: 20,
    aggressiveness: 0.0375,
  });
  assert.deepEqual(getLevelStatistics([{ duration: 20, bigBlind: 10 }]), {
    averageGrowth: null,
    averageTime: 20,
    aggressiveness: null,
  });
  assert.deepEqual(getLevelStatistics([{ isBreak: true }]), {
    averageGrowth: null,
    averageTime: null,
    aggressiveness: null,
  });
});

test("level statistics report unavailable inputs without skipping levels", () => {
  const levels = [
    { duration: 10, bigBlind: 20 },
    { duration: 20, bigBlind: "" },
    { duration: 30, bigBlind: 40 },
  ];
  assert.deepEqual(getLevelStatistics(levels), {
    averageGrowth: null,
    averageTime: 20,
    aggressiveness: null,
  });
  assert.deepEqual(getLevelStatistics([
    { duration: "", bigBlind: 20 }, { duration: 10, bigBlind: 30 },
  ]), { averageGrowth: 0.5, averageTime: null, aggressiveness: null });
  assert.deepEqual(getLevelStatistics([
    { duration: 0, bigBlind: 0 }, { duration: 0, bigBlind: 30 },
  ]), { averageGrowth: null, averageTime: 0, aggressiveness: null });
  assert.deepEqual(getLevelStatistics([
    { duration: 0, bigBlind: 20 }, { duration: 0, bigBlind: 0 },
  ]), { averageGrowth: -1, averageTime: 0, aggressiveness: null });
  assert.deepEqual(getLevelStatistics([
    { duration: -1, bigBlind: 20 }, { duration: 20, bigBlind: -1 },
  ]), { averageGrowth: null, averageTime: null, aggressiveness: null });
});

test("starting big blind multiples use the first blind level, skipping breaks", () => {
  const levels = [
    { isBreak: true },
    { isBreak: true },
    { bigBlind: "20" },
    { bigBlind: 40 },
  ];
  assert.equal(getStartingBigBlindMultiple("1000", levels), 50);
  assert.equal(getStartingBigBlindMultiple(0, levels), 0);
  assert.equal(getStartingBigBlindMultiple(25, levels), 1.25);
  assert.equal(getStartingBigBlindMultiple("", levels), null);
  assert.equal(getStartingBigBlindMultiple(-1, levels), null);
  assert.equal(getStartingBigBlindMultiple(1000, [{ isBreak: true }]), null);
  for (const bigBlind of ["", 0, -1, "invalid", null]) {
    assert.equal(getStartingBigBlindMultiple(1000, [{ bigBlind }, { bigBlind: 20 }]), null);
  }
});

test("sorts blind levels across breaks without moving the breaks", () => {
  const levels = [
    { isBreak: true, duration: 5 },
    { smallBlind: 200, bigBlind: 400, duration: 20 },
    { isBreak: true, duration: 10 },
    { isBreak: true, duration: 15 },
    { smallBlind: 50, bigBlind: 100, duration: 30 },
    { smallBlind: 100, bigBlind: 200, duration: 25 },
    { isBreak: true, duration: 20 },
  ];
  const original = structuredClone(levels);
  const sorted = sortLevels(levels);
  assert.deepEqual(sorted.map((level) => level.isBreak), [true, false, true, true, false, false, true]);
  assert.deepEqual(sorted.filter((level) => !level.isBreak).map((level) => [level.smallBlind, level.duration]), [
    [50, 30], [100, 25], [200, 20],
  ]);
  assert.deepEqual(sorted.filter((level) => level.isBreak).map((level) => level.duration), [5, 10, 15, 20]);
  assert.deepEqual(levels, original);
});

test("small level changes compare each blind with the previous blind level", () => {
  const levels = [
    { smallBlind: 100, bigBlind: 200 },
    { isBreak: true },
    { smallBlind: "125", bigBlind: "250" },
    { smallBlind: "155", bigBlind: "313" },
    { smallBlind: "200", bigBlind: "390" },
  ];
  assert.equal(hasSmallLevelChange(levels, 0), false);
  assert.equal(hasSmallLevelChange(levels, 1), false);
  assert.equal(hasSmallLevelChange(levels, 2), false);
  assert.equal(hasSmallLevelChange(levels, 3), true);
  assert.equal(hasSmallLevelChange(levels, 4), true);
  assert.equal(hasSmallLevelChange([{ smallBlind: 0, bigBlind: 0 }, { smallBlind: 0, bigBlind: 0 }], 1), false);
  assert.equal(hasSmallLevelChange([{ smallBlind: 0.04, bigBlind: 0.08 }, { smallBlind: 0.05, bigBlind: 0.1 }], 1), false);
  assert.equal(hasSmallLevelChange([{ smallBlind: 0.04, bigBlind: 0.08 }, { smallBlind: 0.049, bigBlind: 0.1 }], 1), true);
  assert.equal(hasSmallLevelChange([{ smallBlind: 100, bigBlind: 200 }, { smallBlind: 120, bigBlind: 240 }], 1), true);
  assert.equal(hasSmallLevelChange([{ smallBlind: 100, bigBlind: 200 }, { smallBlind: 90, bigBlind: 180 }], 1), false);
  assert.equal(hasSmallLevelChange([{ smallBlind: 100, bigBlind: 200 }, { smallBlind: 100, bigBlind: 200 }], 1), true);
  assert.equal(hasSmallLevelChange([{ smallBlind: 100, bigBlind: 200 }, { smallBlind: "", bigBlind: "250" }], 1), false);
  assert.equal(hasSmallLevelChange([{ smallBlind: 100, bigBlind: 200 }, { smallBlind: "125", bigBlind: "invalid" }], 1), false);
});

test("large level changes compare both blinds across breaks and exclude exactly 50%", () => {
  const levels = [
    { smallBlind: 100, bigBlind: 200 },
    { isBreak: true },
    { smallBlind: "150", bigBlind: "300" },
  ];
  assert.equal(hasLargeLevelChange(levels, 0), false);
  assert.equal(hasLargeLevelChange(levels, 1), false);
  assert.equal(hasLargeLevelChange(levels, 2), false);
  assert.equal(hasLargeLevelChange([levels[0], { smallBlind: 151, bigBlind: 300 }], 1), true);
  assert.equal(hasLargeLevelChange([levels[0], { smallBlind: 150, bigBlind: 301 }], 1), true);
  assert.equal(hasLargeLevelChange([{ smallBlind: 0.1, bigBlind: 0.2 }, { smallBlind: 0.15, bigBlind: 0.3 }], 1), false);
  assert.equal(hasLargeLevelChange([{ smallBlind: 0, bigBlind: 0 }, { smallBlind: 1, bigBlind: 0 }], 1), true);
  assert.equal(hasLargeLevelChange([levels[0], { smallBlind: "", bigBlind: "invalid" }], 1), false);
  const mixed = [levels[0], { smallBlind: 120, bigBlind: 301 }];
  assert.equal(hasSmallLevelChange(mixed, 1), true);
  assert.equal(hasLargeLevelChange(mixed, 1), true);
});

test("the last timed level remains visible at zero after the schedule", () => {
  const levels = [
    { duration: 1, smallBlind: 10, bigBlind: 20 },
    { duration: 0.5, isBreak: true },
    { duration: 0, smallBlind: 100, bigBlind: 200 },
  ];
  assert.equal(getCurrentOrLastLevel(levels, 59_999).index, 0);
  assert.equal(getCurrentOrLastLevel(levels, 60_000).index, 1);
  assert.deepEqual(getCurrentOrLastLevel(levels, 90_000), {
    level: levels[1],
    index: 1,
    startMs: 60_000,
    endMs: 90_000,
    remainingMs: 0,
  });
  assert.equal(getCurrentOrLastLevel(levels, 150_000).remainingMs, 0);
  assert.equal(getCurrentLevel(levels, 90_000), null);
  assert.equal(getCurrentOrLastLevel([{ duration: 0 }], 1_000), null);
});

test("per-player stack matches the displayed total even with unused chips", () => {
  const chips = [
    { denomination: 25, quantityPerPlayer: 20 },
    { denomination: 100, quantityPerPlayer: "" },
  ];
  assert.equal(formatChipStackTotal(chips), "500");
  assert.equal(chipStackMatchesStarting(chips, "500"), true);
  assert.equal(chipStackMatchesStarting(chips, "501"), false);
  assert.equal(chipStackMatchesStarting(chips, ""), false);
  assert.equal(chipStackMatchesStarting(chips, null), false);
  assert.equal(chipStackMatchesStarting(chips, "invalid"), false);
  assert.equal(chipStackMatchesStarting([{ denomination: 25, quantityPerPlayer: "" }], "0"), false);
  assert.equal(chipStackMatchesStarting([{ denomination: 25, quantityPerPlayer: 0 }], "0"), true);
});

test("chip denominations use k and M suffixes", () => {
  assert.equal(formatChipDenomination(999), formatChipNumber(999));
  assert.equal(formatChipDenomination(1_000), "1k");
  assert.equal(
    formatChipDenomination(1_500),
    `${formatChipNumber(1.5).trimEnd()}k`,
  );
  assert.equal(formatChipDenomination(1_000_000), "1M");
  assert.equal(
    formatChipDenomination(1_500_000),
    `${formatChipNumber(1.5).trimEnd()}M`,
  );
});

test("calculated payouts use the player count while preserving manual overrides", () => {
  const options = {
    playerCount: 38,
    totalPrizePool: 1010,
    percentPaid: 20,
    payoutModel: "Standard",
  };
  const calculated = getEffectivePayouts(options);
  assert.equal(calculated.defaultPayoutPlaces, 8);
  assert.equal(calculated.effectivePayoutPlaces, 8);
  assert.deepEqual(calculated.payouts, [340, 220, 150, 105, 75, 55, 40, 25]);
  const overridden = getEffectivePayouts({ ...options, payoutPlaces: 2, payouts: [600, 410] });
  assert.equal(overridden.defaultPayoutPlaces, 8);
  assert.equal(overridden.effectivePayoutPlaces, 2);
  assert.deepEqual(overridden.payouts, [600, 410]);
});

test("small minimum payouts do not invalidate the entire calculated paytable", () => {
  const { payouts } = getEffectivePayouts({
    playerCount: 100,
    totalPrizePool: 2000,
    percentPaid: 20,
    payoutModel: "Standard",
  });
  assert.equal(payouts.length, 20);
  assert.ok(payouts[0] > 0);
  assert.equal(payouts.reduce((sum, amount) => sum + amount, 0), 2000);
});

test("bustout payouts count buy-ins as players and add-ons toward the pool", () => {
  const tournament = {
    buyins: Array.from({ length: 38 }, () => ({})),
    addons: Array.from({ length: 50 }, () => ({})),
    rebuys: [],
    addonsAllowed: true,
    rebuysAllowed: false,
    buyinCost: 20,
    addonCost: 5,
    percentPaid: 20,
    payoutModel: "Standard",
    allowPayoutOverride: false,
    bustouts: [{ place: 8 }, { place: 9 }],
  };
  assert.deepEqual(updateBustoutPayouts(tournament).bustouts.map((item) => item.payout), [25, 0]);
});

test("bustout payouts follow the effective calculated and overridden paytable", () => {
  const tournament = {
    buyins: Array.from({ length: 10 }, () => ({})),
    rebuys: [{}, {}],
    addons: [{}],
    rebuysAllowed: true,
    addonsAllowed: false,
    buyinCost: 20,
    rebuyCost: 10,
    addonCost: 100,
    otherPrizePool: 30,
    percentPaid: 25,
    payoutModel: "Standard",
    allowPayoutOverride: true,
    payoutPlaces: 3,
    payouts: [],
    bustouts: [{ place: 2 }, { place: 4 }, { place: null }],
  };
  const calculated = getEffectivePayouts({
    ...tournament, playerCount: 10, totalPrizePool: 250,
  }).payouts;
  const initial = updateBustoutPayouts(tournament);
  assert.deepEqual(initial.bustouts.map((item) => item.payout), [calculated[1], 0, null]);
  assert.equal(updateBustoutPayouts(initial), initial);
  const manual = updateBustoutPayouts({ ...initial, payouts: [150, 70, 30] });
  assert.deepEqual(manual.bustouts.map((item) => item.payout), [70, 0, null]);
  const restricted = updateBustoutPayouts({ ...manual, payoutPlaces: 1 });
  assert.equal(restricted.bustouts[0].payout, 0);
  const automatic = updateBustoutPayouts({ ...manual, allowPayoutOverride: false });
  assert.equal(automatic.bustouts[0].payout, calculated[1]);
  const changedPool = updateBustoutPayouts({ ...automatic, otherPrizePool: 130 });
  assert.notEqual(changedPool.bustouts[0].payout, automatic.bustouts[0].payout);
});
