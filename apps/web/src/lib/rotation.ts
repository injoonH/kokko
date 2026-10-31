export function doublesPairings(slots: readonly string[], anchor: string) {
  if (
    slots.length !== 4 ||
    slots.some((id) => !id) ||
    new Set(slots).size !== 4
  )
    return [];
  const players = [...slots].sort();
  const first = players.includes(anchor) ? anchor : players[0];
  const others = players.filter((id) => id !== first);
  return others.map((partner) => [
    first,
    partner,
    ...others.filter((id) => id !== partner),
  ]);
}

export function sameDoublesTeams(a: readonly string[], b: readonly string[]) {
  if (a.length !== 4 || b.length !== 4) return false;
  const teams = (slots: readonly string[]) =>
    [slots.slice(0, 2).sort(), slots.slice(2).sort()]
      .map((team) => JSON.stringify(team))
      .sort();
  return JSON.stringify(teams(a)) === JSON.stringify(teams(b));
}
