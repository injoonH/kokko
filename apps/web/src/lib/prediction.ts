import {
  INITIAL_RD,
  type Skill,
  teamWinProbability,
  updateTeamPlayer,
} from "./glicko";
import type { Kind, State } from "./types";

export type PlayerChange = Skill & { id: string; win: number; loss: number };

export type Prediction = {
  ratingA: number;
  ratingB: number;
  expectedA: number;
  initialPlayers: number;
  changeA: PlayerChange[];
  changeB: PlayerChange[];
};

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
      return { rating: 1000, rd: INITIAL_RD };
    }
    return { rating: current.rating, rd: current.rd };
  };
  const teamA = a.map(rating),
    teamB = b.map(rating);
  if (
    [...teamA, ...teamB].some(
      (p) =>
        !Number.isFinite(p.rating) ||
        !Number.isFinite(p.rd) ||
        p.rd < 30 ||
        p.rd > INITIAL_RD,
    )
  )
    return null;
  const changes = (ids: readonly string[], own: Skill[], opponents: Skill[]) =>
    own.map((p, i) => ({
      ...p,
      id: ids[i],
      win: updateTeamPlayer(own, opponents, i, 1).rating - p.rating,
      loss: updateTeamPlayer(own, opponents, i, 0).rating - p.rating,
    }));
  return {
    ratingA: teamA.reduce((sum, p) => sum + p.rating, 0) / size,
    ratingB: teamB.reduce((sum, p) => sum + p.rating, 0) / size,
    expectedA: teamWinProbability(teamA, teamB),
    initialPlayers,
    changeA: changes(a, teamA, teamB),
    changeB: changes(b, teamB, teamA),
  };
}

export function eloChangeLabel(change: number) {
  const rounded = Number(change.toFixed(1));
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}`;
}

export function winChanceLabels(expectedA: number): [string, string] {
  // Round one side once, consistently even when teams swap at a rounding tie.
  const majority = Math.round(Math.max(expectedA, 1 - expectedA) * 100);
  const a = expectedA >= 0.5 ? majority : 100 - majority;
  const label = (percent: number) =>
    percent === 0 ? "1% 미만" : percent === 100 ? "99% 초과" : `${percent}%`;
  return [label(a), label(100 - a)];
}
