import {
  getEffectivePayouts,
  getEntryContributions,
  normalizeMaxPlayersPerTable,
} from "../../domain/tournament.js";

export function getViewerSummary(tournament) {
  const entries = [
    { count: tournament.buyinCount, cost: tournament.buyinCost, chips: tournament.startingChipstack },
    ...(tournament.rebuysAllowed
      ? [{ count: tournament.rebuyCount, cost: tournament.rebuyCost, chips: tournament.rebuyChipstack }]
      : []),
    ...(tournament.addonsAllowed
      ? [{ count: tournament.addonCount, cost: tournament.addonCost, chips: tournament.addonChipstack }]
      : []),
  ];
  const totalEntries = entries.reduce((sum, entry) => sum + entry.count, 0);
  const totals = entries.reduce((sum, entry) => {
    const contribution = getEntryContributions(entry.count, entry.cost, entry.chips);
    return {
      prizePool: sum.prizePool + contribution.contribution,
      chips: sum.chips + contribution.chipsInPlay,
    };
  }, { prizePool: tournament.otherPrizePool, chips: tournament.otherChipstack });
  const remainingPlayers = Math.max(0, tournament.buyinCount - tournament.bustoutCount);
  const averageChipstack = remainingPlayers > 0 ? Math.round(totals.chips / remainingPlayers) : 0;
  const payout = getEffectivePayouts({
    playerCount: tournament.buyinCount,
    totalPrizePool: totals.prizePool,
    percentPaid: tournament.percentPaid,
    payoutModel: tournament.payoutModel,
    allowPayoutOverride: tournament.allowPayoutOverride,
    payoutPlaces: tournament.payoutPlaces,
    payouts: tournament.payouts,
  });
  return {
    totalEntries,
    totalPrizePool: totals.prizePool,
    totalChipsInPlay: totals.chips,
    remainingPlayers,
    averageChipstack,
    tableCount: Math.ceil(remainingPlayers / normalizeMaxPlayersPerTable(tournament.maxPlayersPerTable)),
    ...payout,
  };
}
