import { formatCurrency, getPayoutTimerMessage } from "../../domain/tournament.js";

export function getTimerMessages({
  name,
  startingPlayers,
  totalEntries,
  totalPrizePool,
  effectivePayoutPlaces,
  allowPayoutOverride,
  payoutPlaces,
  payouts,
  remainingPlayers,
  averageChipstack,
}) {
  const averageChipstackMessage = averageChipstack > 0
    ? `Average ChipStack: ${averageChipstack.toLocaleString()}`
    : "";
  return {
    averageChipstackMessage,
    messages: [
      name,
      startingPlayers > 0 ? ` ${startingPlayers.toLocaleString()} Starting Players` : "",
      totalPrizePool > 0 ? `Total Prize Pool: ${formatCurrency(totalPrizePool)}` : "",
      getPayoutTimerMessage({
        totalEntries, effectivePayoutPlaces, allowPayoutOverride, payoutPlaces, payouts,
      }),
      remainingPlayers > 0 ? ` ${remainingPlayers.toLocaleString()} Players Remaining` : "",
      averageChipstackMessage,
    ].filter(Boolean),
  };
}

export function getDisplayedTimerMessage(message, index, messages, averageChipstackMessage, averageChipstack, currentLevel) {
  const currentBigBlind = currentLevel?.level.isBreak ? 0 : Number(currentLevel?.level.bigBlind);
  return averageChipstackMessage &&
    index === messages.length - 1 &&
    Number.isFinite(currentBigBlind) &&
    currentBigBlind > 0
    ? `${averageChipstackMessage} (${Math.round(averageChipstack / currentBigBlind).toLocaleString()}xBB)`
    : message;
}
