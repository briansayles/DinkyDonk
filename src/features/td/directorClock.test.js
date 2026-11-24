import test from "node:test";
import assert from "node:assert/strict";
import { resizeBustouts, resizeParticipants } from "../../domain/participants.js";
import { getHostClockOffset } from "./directorClock.js";

test("host clock offsets produce integer timestamps for entries and bustouts", () => {
  for (const responseReceived of [1_002, 1_003]) {
    const offset = getHostClockOffset(2_000, 1_000, responseReceived);
    const timestamp = 1_010 + offset;
    const buyins = resizeParticipants([], 3, timestamp);
    const bustouts = resizeBustouts({
      buyins, bustouts: [], levels: [],
      timerElapsedMs: 0, timerIsRunning: false,
    }, 1, timestamp);

    assert.ok(Number.isInteger(buyins[0].timestamp));
    assert.ok(Number.isInteger(bustouts[0].timestamp));
    assert.ok(Math.abs(timestamp - (2_000 + 1_010 - (1_000 + responseReceived) / 2)) <= 0.5);
  }
});
