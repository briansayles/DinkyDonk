export function getTournamentChanges(previous, next, getExpected = (tournament) => tournament) {
  const previousById = new Map(previous.map((tournament) => [tournament.id, tournament]));
  const nextById = new Map(next.map((tournament) => [tournament.id, tournament]));
  if (previousById.size !== previous.length || nextById.size !== next.length) {
    throw new Error("Tournament IDs must be unique.");
  }

  const changes = [];
  for (const tournament of previous) {
    const updated = nextById.get(tournament.id);
    if (!updated) {
      changes.push({ kind: "delete", expected: getExpected(tournament) });
    } else if (JSON.stringify(tournament) !== JSON.stringify(updated)) {
      changes.push({ kind: "update", expected: getExpected(tournament), tournament: updated });
    }
  }
  for (const tournament of next) {
    if (!previousById.has(tournament.id)) {
      changes.push({ kind: "create", tournament });
    }
  }
  return changes;
}
