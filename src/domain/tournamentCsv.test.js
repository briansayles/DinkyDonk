import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  createTournamentCsvExports,
  sanitizeTournamentCsvFilename,
} from "./tournamentCsv.js";
import { updateBustoutPayouts } from "./tournament.js";
import { resizeBustouts } from "./participants.js";

test("tournament CSV exports include the structure and recorded results", () => {
  const tournament = {
    id: "tournament-1",
    name: 'Championship, "Final"',
    startingChipstack: 500,
    buyinCost: 20,
    buyins: [
      { name: "Player One", timestamp: 1_000 },
      { name: "Player Two", timestamp: 1_000 },
    ],
    rebuys: [],
    addons: [],
    bustouts: [
      {
        name: "Player One",
        timestamp: 2_000,
        place: 1,
        elapsedSeconds: 60,
        blinds: { smallBlind: 2, bigBlind: 4, ante: 0 },
        pointsEarned: 3,
        payout: 20,
      },
    ],
    payouts: [20],
    chips: [
      {
        color: "#ffffff",
        denomination: 1,
        quantityPerPlayer: 20,
        availableQuantity: 100,
      },
    ],
    levels: [{ duration: 15, smallBlind: 2, bigBlind: 4, ante: 0 }],
  };

  const exports = createTournamentCsvExports(tournament);

  assert.ok(exports.structure.startsWith("\uFEFF"));
  assert.ok(exports.structure.includes('"Championship, ""Final"""'));
  assert.ok(exports.structure.includes('"Chip","1"'));
  assert.ok(exports.structure.includes('"Blind Level","1"'));
  assert.ok(exports.results.includes('"Buy-in","1","Player One"'));
  assert.ok(exports.results.includes('"Bustout","1","Player One"'));
  assert.ok(exports.results.includes('"Payout","1"'));
  assert.ok(exports.results.includes('"Remaining Players","1"'));
});

test("CSV export filenames are safe for local filesystems", () => {
  assert.equal(
    sanitizeTournamentCsvFilename('Championship/Final: "A"'),
    "Championship_Final_ _A_",
  );
  assert.equal(sanitizeTournamentCsvFilename("CON"), "_CON");
});

test("CSV exports neutralize formula-like user text", () => {
  const { structure } = createTournamentCsvExports({
    name: "=1+1",
    chips: [],
    levels: [],
  });

  assert.ok(structure.includes(`"'=1+1"`));
});

test("the winner's place-one payout is associated with the final bustout and exported", () => {
  const tournament = {
    name: "Final Table",
    buyins: Array.from({ length: 5 }, () => ({})),
    buyinCost: 20,
    bustouts: [],
    levels: [],
    payoutPlaces: 1,
    payouts: [100],
  };
  const completedTournament = updateBustoutPayouts({
    ...tournament,
    bustouts: resizeBustouts(tournament, 5, 123),
  });
  const exports = createTournamentCsvExports(completedTournament);

  assert.deepEqual(
    completedTournament.bustouts.map(({ place, payout }) => [place, payout]),
    [[1, 100], [2, 0], [3, 0], [4, 0], [5, 0]],
  );
  const winnerRow = exports.results
    .split("\r\n")
    .find((row) => row.startsWith('"Bustout","1","Winner"'));
  assert.ok(winnerRow);
  assert.equal(winnerRow.split(",")[4], '"1"');
  assert.equal(winnerRow.split(",")[10], '"100"');
});
