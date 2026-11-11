import { strict as assert } from "node:assert";
import { test } from "node:test";
import { chipStackMatchesStarting, formatChipStackTotal, getEffectivePayouts, updateBustoutPayouts } from "./tournament.js";

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
    ...tournament, totalEntries: 12, totalPrizePool: 250,
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
