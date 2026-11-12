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

test("results summarize entry costs, contributions, and totals", () => {
  const tournament = {
    buyins: Array.from({ length: 3 }, () => ({ name: "Unnamed" })),
    rebuys: Array.from({ length: 2 }, () => ({ name: "Unnamed" })),
    addons: [{ name: "Unnamed" }],
    rebuysAllowed: true,
    addonsAllowed: true,
    buyinCost: 20.5,
    rebuyCost: 7.25,
    addonCost: 15.75,
    startingChipstack: 1000,
    rebuyChipstack: 1500,
    addonChipstack: 250,
    otherPrizePool: 4,
    otherChipstack: 125,
  };
  const summaries = (input) => Object.fromEntries(
    createTournamentCsvExports(input).results.split("\r\n")
      .filter((line) => line.startsWith('"Summary",'))
      .map((line) => {
        const cells = line.split(",");
        return [cells[13].slice(1, -1), cells[14].slice(1, -1)];
      }),
  );
  const enabled = summaries(tournament);
  assert.deepEqual(
    Object.fromEntries([
      "Buy-in Cost", "Rebuy Cost", "Add-on Cost",
      "Buy-in Prize Pool Contribution", "Rebuy Prize Pool Contribution",
      "Add-on Prize Pool Contribution", "Other Prize Pool", "Total Prize Pool",
      "Starting Chipstack", "Rebuy Chipstack", "Add-on Chipstack",
      "Buy-in Chips in Play", "Rebuy Chips in Play", "Add-on Chips in Play",
      "Other Chipstack", "Total Chips in Play",
    ].map((key) => [key, enabled[key]])),
    {
      "Buy-in Cost": "20.5", "Rebuy Cost": "7.25", "Add-on Cost": "15.75",
      "Buy-in Prize Pool Contribution": "61.5", "Rebuy Prize Pool Contribution": "14.5",
      "Add-on Prize Pool Contribution": "15.75", "Other Prize Pool": "4", "Total Prize Pool": "95.75",
      "Starting Chipstack": "1000", "Rebuy Chipstack": "1500", "Add-on Chipstack": "250",
      "Buy-in Chips in Play": "3000", "Rebuy Chips in Play": "3000", "Add-on Chips in Play": "250",
      "Other Chipstack": "125", "Total Chips in Play": "6375",
    },
  );
  const disabledTournament = { ...tournament, rebuysAllowed: false, addonsAllowed: false };
  const disabled = summaries(disabledTournament);
  assert.equal(disabled["Rebuy Prize Pool Contribution"], "0");
  assert.equal(disabled["Add-on Chips in Play"], "0");
  assert.equal(disabled["Total Prize Pool"], "65.5");
  assert.equal(disabled["Total Chips in Play"], "3125");
  assert.ok(createTournamentCsvExports(disabledTournament).results.includes('"Rebuy","1","Unnamed"'));

  const empty = summaries({ buyins: [{}], rebuysAllowed: true, rebuys: [{}] });
  assert.equal(empty["Buy-in Cost"], "");
  assert.equal(empty["Total Prize Pool"], "0");
  assert.equal(empty["Total Chips in Play"], "0");
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
    .find((row) => row.startsWith('"Bustout","1","Unnamed"'));
  assert.ok(winnerRow);
  assert.equal(winnerRow.split(",")[4], '"1"');
  assert.equal(winnerRow.split(",")[10], '"100"');
});
