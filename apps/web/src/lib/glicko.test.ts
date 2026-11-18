import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type Skill, teamWinProbability, updateTeamPlayer } from "./glicko";

type Vector = {
  name: string;
  a: Skill[];
  b: Skill[];
  expectedA: number;
  winA: Skill[];
  lossA: Skill[];
  winB: Skill[];
  lossB: Skill[];
};
const vectors: Vector[] = JSON.parse(
  readFileSync(
    new URL(
      "../../../server/internal/kokko/testdata/glicko-vectors.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

describe("Published Glicko math and Go parity", () => {
  it("matches the author's two-sided pre-game example", () => {
    expect(
      teamWinProbability(
        [{ rating: 1400, rd: 80 }],
        [{ rating: 1500, rd: 150 }],
      ),
    ).toBeCloseTo(0.376, 3);
  });
  for (const v of vectors)
    it(v.name, () => {
      expect(teamWinProbability(v.a, v.b)).toBeCloseTo(v.expectedA, 12);
      for (const [own, opp, win, loss] of [
        [v.a, v.b, v.winA, v.lossA],
        [v.b, v.a, v.winB, v.lossB],
      ]) {
        for (let i = 0; i < own.length; i++)
          for (const [score, want] of [
            [1, win[i]],
            [0, loss[i]],
          ] as const) {
            const got = updateTeamPlayer(own, opp, i, score);
            expect(got.rating).toBeCloseTo(want.rating, 9);
            expect(got.rd).toBeCloseTo(want.rd, 9);
          }
      }
    });
});
