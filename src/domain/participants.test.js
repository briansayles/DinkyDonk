import { strict as assert } from "node:assert";
import { test } from "node:test";
import { MAX_PARTICIPANT_COUNT, previewParticipantCount, resizeBustouts, resizeParticipants } from "./participants.js";

test("valid count drafts update previews without accepting incomplete or invalid values", () => {
  assert.equal(previewParticipantCount("3", 1), 3);
  assert.equal(previewParticipantCount("0", 3), 0);
  for (const draft of [undefined, "", "-", "1.5", "-1", "100001", "Infinity"]) {
    assert.equal(previewParticipantCount(draft, 2), 2);
  }
  assert.equal(previewParticipantCount("4", 2, 3), 2);
  assert.equal(previewParticipantCount("3", 2, 3), 3);
});

test("increasing counts retains existing records and timestamps new records", () => {
  const existing = [{ name: "Player", timestamp: 123 }];
  const result = resizeParticipants(existing, 3, 456);
  assert.deepEqual(result, [
    existing[0],
    { name: "Unnamed", timestamp: 456 },
    { name: "Unnamed", timestamp: 456 },
  ]);
  assert.equal(existing.length, 1);
});

test("decreasing or resetting counts removes the newest records", () => {
  const records = [
    { name: "First", timestamp: 1 },
    { name: "Second", timestamp: 2 },
  ];
  assert.deepEqual(resizeParticipants(records, 1), [records[0]]);
  assert.deepEqual(resizeParticipants(records, 0), []);
});

test("invalid or excessive counts are rejected", () => {
  for (const count of [-1, 1.5, NaN, MAX_PARTICIPANT_COUNT + 1]) {
    assert.throws(() => resizeParticipants([], count), RangeError);
  }
});

const tournament = {
  buyins: Array.from({ length: 5 }, () => ({})),
  bustouts: [],
  levels: [
    { duration: 1, smallBlind: 10, bigBlind: 20, ante: 2 },
    { duration: 0.5, isBreak: true },
    { duration: 1, smallBlind: 20, bigBlind: 40, ante: 4 },
  ],
  timerElapsedMs: 100_000,
  timerStartedAt: 1_000,
  timerIsRunning: true,
};

test("bustouts capture current level, playing time and sequential places", () => {
  const bustouts = resizeBustouts(tournament, 2, 6_500);
  assert.deepEqual(bustouts, [4, 5].map((place) => ({
    name: "Unnamed",
    timestamp: 6_500,
    blinds: { smallBlind: 20, bigBlind: 40, ante: 4 },
    elapsedSeconds: 75,
    place,
    pointsEarned: null,
  })));
  const extended = resizeBustouts({ ...tournament, bustouts }, 3, 10_000);
  assert.deepEqual(extended.slice(1), bustouts);
  assert.equal(extended[0].place, 3);
  assert.equal(extended[0].elapsedSeconds, 79);
  assert.deepEqual(resizeBustouts({ ...tournament, bustouts: extended }, 1), [bustouts[1]]);
  assert.deepEqual(resizeBustouts({ ...tournament, bustouts: extended }, 0), []);
});

test("breaks, pauses, timer boundaries and completion are captured correctly", () => {
  const record = (timerElapsedMs, overrides = {}) =>
    resizeBustouts({ ...tournament, timerIsRunning: false, timerElapsedMs, ...overrides }, 1, 200_000)[0];
  assert.equal(record(0).elapsedSeconds, 0);
  assert.deepEqual(record(59_999).blinds, { smallBlind: 10, bigBlind: 20, ante: 2 });
  assert.equal(record(60_000).blinds, null);
  assert.equal(record(75_000).elapsedSeconds, 60);
  assert.deepEqual(record(90_000).blinds, { smallBlind: 20, bigBlind: 40, ante: 4 });
  assert.equal(record(200_000).elapsedSeconds, 120);
  assert.equal(record(200_000).blinds, null);
  assert.equal(record(15_000, { timerIsRunning: true, timerStartedAt: 201_000 }).elapsedSeconds, 15);
});

test("bustouts cannot eliminate the last player", () => {
  assert.throws(() => resizeBustouts(tournament, 5), RangeError);
  assert.throws(() => resizeBustouts({ ...tournament, buyins: [] }, 1), RangeError);
  const legacy = { ...tournament, bustouts: Array.from({ length: 5 }, () => ({})) };
  assert.equal(resizeBustouts(legacy, 4).length, 4);
});
