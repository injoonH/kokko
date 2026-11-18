// Published Glicko-1 equations. Keep in sync with server/internal/kokko/glicko.go
// and the shared golden vectors. State supplies RD aged to the Korean today.
export type Skill = { rating: number; rd: number };
export const INITIAL_RD = 350;
const q = Math.log(10) / 400;
const g = (rd: number) =>
  1 / Math.sqrt(1 + (3 * q * q * rd * rd) / Math.PI ** 2);
const expectation = (rating: number, opponent: number, rd: number) =>
  1 / (1 + 10 ** ((-g(rd) * (rating - opponent)) / 400));

export function updateTeamPlayer(
  own: readonly Skill[],
  opponents: readonly Skill[],
  index: number,
  score: number,
): Skill {
  const n = own.length;
  const others = [...opponents, ...own.filter((_, i) => i !== index)];
  const opponent =
    (opponents.reduce((sum, p) => sum + p.rating, 0) -
      own.reduce((sum, p, i) => sum + (i === index ? 0 : p.rating), 0)) /
    n;
  const opponentRD =
    Math.sqrt(others.reduce((sum, p) => sum + p.rd ** 2, 0)) / n;
  const player = own[index];
  const rd = player.rd / n;
  const weight = g(opponentRD);
  const expected = expectation(player.rating / n, opponent, opponentRD);
  const precision =
    1 / rd ** 2 + q * q * weight ** 2 * expected * (1 - expected);
  return {
    rating: player.rating + (n * q * weight * (score - expected)) / precision,
    rd: Math.max(30, n * Math.sqrt(1 / precision)),
  };
}

export function teamWinProbability(a: readonly Skill[], b: readonly Skill[]) {
  const n = a.length;
  const mean = (team: readonly Skill[]) =>
    team.reduce((sum, p) => sum + p.rating, 0) / n;
  const rd = Math.sqrt([...a, ...b].reduce((sum, p) => sum + p.rd ** 2, 0)) / n;
  return expectation(mean(a), mean(b), rd);
}
