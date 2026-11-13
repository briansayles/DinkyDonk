import { strict as assert } from "node:assert";
import { test } from "node:test";
import { chipStackMatchesStarting, formatChipStackTotal, getAggressivenessEvaluation, getCurrentLevel, getCurrentOrLastLevel, getEffectivePayouts, getLevelStatistics, getPayoutTimerMessage, getStartingBigBlindMultiple, getStructureSupportedPlayers, hasLargeLevelChange, hasSmallLevelChange, normalizeMaxPlayersPerTable, sortLevels, updateBustoutPayouts } from "./tournament.js";

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
