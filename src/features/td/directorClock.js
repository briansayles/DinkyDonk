export function getHostClockOffset(hostTime, requestStarted, responseReceived) {
  return Math.round(hostTime - (requestStarted + responseReceived) / 2);
}
