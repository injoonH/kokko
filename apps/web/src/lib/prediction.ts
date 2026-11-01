import type { Kind, State } from "./types";

export type Prediction = {
  ratingA: number;
  ratingB: number;
  expectedA: number;
  initialPlayers: number;
};

export function expectedWinProbability(ratingA: number, ratingB: number) {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

export function predictMatch(
  state: Pick<State, "profiles" | "rankings">,
  kind: Kind,
  a: readonly string[],
  b: readonly string[],
): Prediction | null {
  const size = kind === "singles" ? 1 : 2;
  const players = [...a, ...b];
  if (
    a.length !== size ||
    b.length !== size ||
    new Set(players).size !== size * 2 ||
    players.some((id) => !id || !state.profiles.some((p) => p.id === id))
  )
    return null;
  let initialPlayers = 0;
  const rating = (id: string) => {
    const current = state.rankings.find(
      (r) => r.kind === kind && r.playerId === id,
    );
    if (!current || current.games === 0) {
      initialPlayers++;
      return 1000;
    }
    return current.rating;
  };
  const ratingA = a.reduce((sum, id) => sum + rating(id), 0) / size;
  const ratingB = b.reduce((sum, id) => sum + rating(id), 0) / size;
  if (!Number.isFinite(ratingA) || !Number.isFinite(ratingB)) return null;
  return {
    ratingA,
    ratingB,
    expectedA: expectedWinProbability(ratingA, ratingB),
    initialPlayers,
  };
}

export function winChanceLabels(expectedA: number): [string, string] {
  // Round one side once, consistently even when teams swap at a rounding tie.
  const majority = Math.round(Math.max(expectedA, 1 - expectedA) * 100);
  const a = expectedA >= 0.5 ? majority : 100 - majority;
  const label = (percent: number) =>
    percent === 0 ? "1% 미만" : percent === 100 ? "99% 초과" : `${percent}%`;
  return [label(a), label(100 - a)];
}
