import { strict as assert } from "node:assert";
import { test } from "node:test";
import { getViewerSummary } from "./viewerSummary.js";
import { getDisplayedTimerMessage, getTimerMessages } from "../timer/timerMessages.js";

test("viewer totals use aggregate records and exclude disabled entry types", () => {
  const summary = getViewerSummary({
    buyinCount: 10, buyinCost: 20, startingChipstack: 1000,
    rebuyCount: 2, rebuyCost: 10, rebuyChipstack: 500, rebuysAllowed: true,
    addonCount: 4, addonCost: 100, addonChipstack: 1000, addonsAllowed: false,
    otherPrizePool: 30, otherChipstack: 1000, bustoutCount: 3,
    percentPaid: 20, payoutModel: "Standard", allowPayoutOverride: false,
    payoutPlaces: 0, payouts: [], maxPlayersPerTable: 3,
  });
  assert.equal(summary.totalEntries, 12);
  assert.equal(summary.totalPrizePool, 250);
  assert.equal(summary.totalChipsInPlay, 12000);
  assert.equal(summary.remainingPlayers, 7);
  assert.equal(summary.averageChipstack, 1714);
  assert.equal(summary.tableCount, 3);
  assert.equal(summary.effectivePayoutPlaces, 2);
});

test("shared timer messages show the average in big blinds and suppress it on breaks", () => {
  const { messages, averageChipstackMessage } = getTimerMessages({
    name: "Example", startingPlayers: 10, totalEntries: 12, totalPrizePool: 250,
    effectivePayoutPlaces: 2, allowPayoutOverride: false, payoutPlaces: 0,
    payouts: [], remainingPlayers: 7, averageChipstack: 1000,
  });
  const index = messages.length - 1;
  assert.equal(
    getDisplayedTimerMessage(messages[index], index, messages, averageChipstackMessage, 1000, { level: { bigBlind: 100 } }),
    `${averageChipstackMessage} (10xBB)`,
  );
  assert.equal(
    getDisplayedTimerMessage(messages[index], index, messages, averageChipstackMessage, 1000, { level: { isBreak: true, bigBlind: 100 } }),
    averageChipstackMessage,
  );
});
