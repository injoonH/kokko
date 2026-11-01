import { describe, expect, it } from "vitest";
import {
  expectedWinProbability,
  predictMatch,
  winChanceLabels,
} from "./prediction";
import type { Kind, Ranking, State } from "./types";

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
function ranks(kind: Kind, ratings: number[]): Ranking[] {
  return ratings.map((rating, i) => ({
    playerId: ["a", "b", "c", "d"][i],
    kind,
    rating,
    games: 10,
    rank: i + 1,
  }));
}

describe("예상 승률", () => {
  it("서버의 Elo 기대값과 같은 기준으로 계산한다", () => {
    expect(expectedWinProbability(1000, 1000)).toBe(0.5);
    expect(expectedWinProbability(1400, 1000)).toBeCloseTo(10 / 11);
    expect(expectedWinProbability(1000, 1400)).toBeCloseTo(1 / 11);
  });

  it("단식은 단식 Elo만 사용하고 팀 교환은 확률을 뒤집는다", () => {
    const state = fixture();
    state.rankings = [
      ...ranks("singles", [1400, 1000]),
      ...ranks("doubles", [800, 1800]),
    ];
    const prediction = predictMatch(state, "singles", ["a"], ["b"]);
    expect(prediction).toMatchObject({ ratingA: 1400, ratingB: 1000 });
    expect(prediction?.expectedA).toBeCloseTo(10 / 11);
    expect(predictMatch(state, "singles", ["b"], ["a"])?.expectedA).toBeCloseTo(
      1 / 11,
    );
  });

  it("복식은 팀원의 평균을 쓰고 표시 전에 Elo를 반올림하지 않는다", () => {
    const state = fixture();
    state.rankings = [
      ...ranks("doubles", [1600.4, 1000.2, 1400.8, 1200.6]),
      ...ranks("singles", [2000, 2000, 500, 500]),
    ];
    const prediction = predictMatch(state, "doubles", ["a", "b"], ["c", "d"]);
    expect(prediction?.ratingA).toBeCloseTo(1300.3);
    expect(prediction?.ratingB).toBeCloseTo(1300.7);
    expect(prediction?.expectedA).toBeCloseTo(
      expectedWinProbability(1300.3, 1300.7),
      12,
    );
    expect(prediction?.expectedA).not.toBe(0.5);
    expect(predictMatch(state, "doubles", ["b", "a"], ["d", "c"])).toEqual(
      prediction,
    );
  });

  it("신규 선수는 종목별 1000점으로 계산하고 초기값 사용을 알린다", () => {
    const state = fixture();
    state.rankings = [
      ...ranks("doubles", [1400]),
      ...ranks("singles", [1700, 1600, 1500, 1400]),
    ];
    const before = structuredClone(state);
    expect(predictMatch(state, "doubles", ["a", "b"], ["c", "d"])).toEqual({
      ratingA: 1200,
      ratingB: 1000,
      expectedA: expectedWinProbability(1200, 1000),
      initialPlayers: 3,
    });
    expect(state).toEqual(before);
    state.rankings = ranks("doubles", [1000, 1000, 1000, 1000]).map((r) => ({
      ...r,
      games: 0,
    }));
    expect(predictMatch(state, "doubles", ["a", "b"], ["c", "d"])).toEqual({
      ratingA: 1000,
      ratingB: 1000,
      expectedA: 0.5,
      initialPlayers: 4,
    });
  });

  it("미완성·중복·알 수 없는 선수 조합에는 확률을 표시하지 않는다", () => {
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
    expect(predictMatch(state, "singles", ["a", "b"], ["c", "d"])).toBeNull();
    state.rankings = ranks("singles", [NaN, 1000]);
    expect(predictMatch(state, "singles", ["a"], ["b"])).toBeNull();
  });

  it("과거 경기의 정지된 선수도 알려진 프로필이면 비교할 수 있다", () => {
    const state = fixture();
    state.profiles[0].status = "suspended";
    expect(predictMatch(state, "singles", ["a"], ["b"])?.expectedA).toBe(0.5);
  });

  it("백분율은 보완해서 반올림하고 극단적인 값도 확정적으로 표현하지 않는다", () => {
    expect(winChanceLabels(0.5)).toEqual(["50%", "50%"]);
    expect(winChanceLabels(10 / 11)).toEqual(["91%", "9%"]);
    expect(winChanceLabels(0.505)).toEqual(["51%", "49%"]);
    expect(winChanceLabels(0.495)).toEqual(["49%", "51%"]);
    expect(winChanceLabels(0.0001)).toEqual(["1% 미만", "99% 초과"]);
    expect(winChanceLabels(0.9999)).toEqual(["99% 초과", "1% 미만"]);
  });
});
