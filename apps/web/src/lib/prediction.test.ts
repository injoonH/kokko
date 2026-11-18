import { describe, expect, it } from "vitest";
import { teamWinProbability } from "./glicko";
import { eloChangeLabel, predictMatch, winChanceLabels } from "./prediction";
import type { Kind, Ranking, State } from "./types";

function mustPredict(...args: Parameters<typeof predictMatch>) {
  const result = predictMatch(...args);
  if (!result) throw new Error("Expected a valid prediction");
  return result;
}

function fixture(): Pick<State, "profiles" | "rankings"> {
  return {
    profiles: ["a", "b", "c", "d"].map((id) => ({
      id,
      nickname: id,
      avatar: "",
      status: "active",
    })),
    rankings: [],
  };
}
function ranks(
  kind: Kind,
  ratings: number[],
  deviations = [50, 50, 50, 50],
): Ranking[] {
  return ratings.map((rating, i) => ({
    playerId: ["a", "b", "c", "d"][i],
    kind,
    rating,
    rd: deviations[i],
    lastPlayed: "2026-11-18",
    games: 10,
    rank: i + 1,
  }));
}

describe("Glicko predictions", () => {
  it("uses the chosen discipline and reverses odds and individual outcomes on swap", () => {
    const state = fixture();
    state.rankings = [
      ...ranks("singles", [1400, 1000], [50, 300]),
      ...ranks("doubles", [800, 1800]),
    ];
    const before = structuredClone(state);
    const p = mustPredict(state, "singles", ["a"], ["b"]);
    expect(p.ratingA).toBe(1400);
    expect(p.ratingB).toBe(1000);
    expect(p.expectedA).toBeCloseTo(
      teamWinProbability(
        [{ rating: 1400, rd: 50 }],
        [{ rating: 1000, rd: 300 }],
      ),
      12,
    );
    const swap = mustPredict(state, "singles", ["b"], ["a"]);
    expect(swap.expectedA).toBeCloseTo(1 - p.expectedA, 12);
    expect(swap.changeA).toEqual(p.changeB);
    expect(swap.changeB).toEqual(p.changeA);
    expect(p.changeA[0].win + p.changeB[0].loss).not.toBeCloseTo(0);
    expect(state).toEqual(before);
  });
  it("uses unrounded team means and gives uncertain teammates different changes", () => {
    const state = fixture();
    state.rankings = ranks(
      "doubles",
      [1600.4, 1000.2, 1400.8, 1200.6],
      [50, 300, 80, 150],
    );
    const p = mustPredict(state, "doubles", ["a", "b"], ["c", "d"]);
    expect(p.ratingA).toBeCloseTo(1300.3);
    expect(p.ratingB).toBeCloseTo(1300.7);
    expect(p.expectedA).not.toBe(0.5);
    expect(p.changeA[1].win).toBeGreaterThan(p.changeA[0].win);
    const swapped = mustPredict(state, "doubles", ["b", "a"], ["d", "c"]);
    expect(swapped.expectedA).toBeCloseTo(p.expectedA, 12);
    expect(swapped.changeA).toEqual([...p.changeA].reverse());
  });
  it("starts unrated players at 1000 and RD350 separately in each discipline", () => {
    const state = fixture();
    state.rankings = ranks("singles", [1700, 1600, 1500, 1400]);
    const p = mustPredict(state, "doubles", ["a", "b"], ["c", "d"]);
    expect(p.initialPlayers).toBe(4);
    expect(p.expectedA).toBe(0.5);
    for (const player of [...p.changeA, ...p.changeB]) {
      expect(player.rating).toBe(1000);
      expect(player.rd).toBe(350);
      expect(player.win).toBeCloseTo(112.2571878708095, 9);
      expect(player.loss).toBeCloseTo(-112.2571878708095, 9);
    }
    state.rankings = ranks("doubles", [1900, 1900, 1900, 1900]).map((r) => ({
      ...r,
      games: 0,
    }));
    expect(predictMatch(state, "doubles", ["a", "b"], ["c", "d"])).toEqual(p);
    expect(
      predictMatch(fixture(), "singles", ["a"], ["b"])?.changeA[0].win,
    ).toBeCloseTo(162.2120026057648, 9);
  });
  it("rejects incomplete, repeated, unknown or nonfinite participants and invalid RD", () => {
    const state = fixture();
    for (const [a, b] of [
      [
        ["a", ""],
        ["c", "d"],
      ],
      [["a"], ["c", "d"]],
      [
        ["a", "b"],
        ["a", "d"],
      ],
      [
        ["a", "b"],
        ["c", "unknown"],
      ],
    ])
      expect(predictMatch(state, "doubles", a, b)).toBeNull();
    for (const rd of [NaN, 0, 29, 351, Infinity]) {
      state.rankings = ranks("singles", [1400, 1000], [rd, 50]);
      expect(predictMatch(state, "singles", ["a"], ["b"])).toBeNull();
    }
    state.rankings = ranks("singles", [NaN, 1000]);
    expect(predictMatch(state, "singles", ["a"], ["b"])).toBeNull();
  });
  it("allows known suspended players for historical comparisons", () => {
    const state = fixture();
    state.profiles[0].status = "suspended";
    expect(predictMatch(state, "singles", ["a"], ["b"])?.expectedA).toBe(0.5);
  });
  it("formats one decimal and avoids signed zero", () => {
    expect(eloChangeLabel(112.25718787)).toBe("+112.3");
    expect(eloChangeLabel(-162.212)).toBe("-162.2");
    for (const value of [0, -0, 0.001, -0.001])
      expect(eloChangeLabel(value)).toBe("0.0");
  });
  it("rounds complementary odds without claiming certainty", () => {
    expect(winChanceLabels(0.5)).toEqual(["50%", "50%"]);
    expect(winChanceLabels(0.505)).toEqual(["51%", "49%"]);
    expect(winChanceLabels(0.495)).toEqual(["49%", "51%"]);
    expect(winChanceLabels(0.0001)).toEqual(["1% 미만", "99% 초과"]);
    expect(winChanceLabels(0.9999)).toEqual(["99% 초과", "1% 미만"]);
  });
});
