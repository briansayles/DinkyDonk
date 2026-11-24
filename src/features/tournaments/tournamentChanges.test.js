import { test } from "node:test";
import assert from "node:assert/strict";
import { getTournamentChanges } from "./tournamentChanges.js";

test("sends only changed tournaments, using their saved baselines", () => {
  const first = { id: "first", name: "Original" };
  const second = { id: "second", name: "Unchanged" };
  const persisted = { ...first, chips: ["unsorted"] };
  const changes = getTournamentChanges(
    [first, second],
    [{ ...first, name: "Updated" }, second, { id: "new", name: "New" }],
    (tournament) => tournament === first ? persisted : tournament,
  );
  assert.deepEqual(changes, [
    { kind: "update", expected: persisted, tournament: { id: "first", name: "Updated" } },
    { kind: "create", tournament: { id: "new", name: "New" } },
  ]);
});

test("deletion targets the original record and rejects duplicate IDs", () => {
  const first = { id: "first", name: "Original" };
  const second = { id: "second", name: "Kept" };
  assert.deepEqual(getTournamentChanges([first, second], [second]), [
    { kind: "delete", expected: first },
  ]);
  assert.throws(() => getTournamentChanges([first], [first, first]), /unique/);
});
