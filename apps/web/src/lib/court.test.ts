import { describe, expect, it } from "vitest";
import {
  type CourtState,
  courtPlayers,
  courtRoster,
  suggestDoubles,
} from "./court";
import type { Match } from "./types";

function fixture(): CourtState {
  return {
    me: { id: "me", role: "member" },
    today: "2026-10-31",
    profiles: ["me", "a", "b", "c", "d", "e", "f"].map((id) => ({
      id,
      nickname: id,
      avatar: "",
      status: "active",
    })),
    rankings: [],
    allMatches: [],
  };
}
function match(
  order: number,
  a: string[],
  b: string[],
  overrides: Partial<Match> = {},
): Match {
  return {
    id: `match${order}`,
    kind: "doubles",
    date: "2026-10-31",
    order,
    a,
    b,
    scoreA: 21,
    scoreB: 18,
    author: a[0],
    version: 1,
    deleted: false,
    created: "",
    updated: "",
    ...overrides,
  };
}

describe("오늘의 코트 추천", () => {
  it("활성 참석 선수만 사용하고 기록할 본인을 항상 포함한다", () => {
    const state = fixture();
    state.profiles = state.profiles.map((p) =>
      p.id === "f" ? { ...p, status: "suspended" } : p,
    );
    expect(courtRoster(["a", "a", "b", "c", "f", "unknown"], state)).toEqual([
      "a",
      "b",
      "c",
      "me",
    ]);
    expect(courtRoster(null, state)).toEqual(["me"]);
    expect(suggestDoubles(state, ["a", "b", "c", "d"])).toEqual([]);
    expect(suggestDoubles(state, ["me", "a", "b", "f"])).toEqual([]);
    const plans = suggestDoubles(state, [
      "me",
      "a",
      "a",
      "b",
      "c",
      "f",
      "unknown",
    ]);
    expect(plans).toHaveLength(3);
    for (const plan of plans) {
      expect([...plan.slots].sort()).toEqual(["a", "b", "c", "me"]);
      expect(plan.slots[0]).toBe("me");
    }
  });

  it("전력보다 먼저 덜 뛴 친구들에게 출전 기회를 준다", () => {
    const state = fixture();
    state.allMatches = [
      match(1, ["me", "a"], ["b", "c"]),
      match(2, ["me", "b"], ["a", "c"]),
    ];
    state.rankings = [
      { playerId: "f", kind: "doubles", rating: 2000, games: 1, rank: 1 },
    ];
    const plans = suggestDoubles(
      state,
      state.profiles.map((p) => p.id),
    );
    for (const plan of plans)
      expect([...plan.slots].sort()).toEqual(["d", "e", "f", "me"]);
  });

  it("경기 수가 같으면 더 오래 쉰 친구들을 먼저 고른다", () => {
    const state = fixture();
    state.allMatches = [
      match(1, ["me", "a"], ["b", "c"]),
      match(2, ["me", "d"], ["e", "f"]),
    ];
    const plan = suggestDoubles(
      state,
      state.profiles.map((p) => p.id),
    )[0];
    expect([...plan.slots].sort()).toEqual(["a", "b", "c", "me"]);
  });

  it("누적 복식 Elo로 균형을 맞추고 새 선수는 1000점부터 계산한다", () => {
    const state = fixture();
    state.rankings = [
      ...[1600, 1400, 1200, 1000].map((rating, i) => ({
        playerId: ["me", "a", "b", "c"][i],
        kind: "doubles" as const,
        rating,
        games: 10,
        rank: i + 1,
      })),
      { playerId: "a", kind: "singles", rating: 3000, games: 20, rank: 1 },
    ];
    const plan = suggestDoubles(state, ["me", "a", "b", "c"])[0];
    expect(plan.slots.slice(0, 2)).toEqual(["me", "c"]);
    expect(plan.ratingA).toBe(1300);
    expect(plan.ratingB).toBe(1300);
    expect(plan.expectedA).toBeCloseTo(0.5);
    expect(courtPlayers(state).find((p) => p.id === "d")?.rating).toBe(1000);
  });

  it("전력이 비슷하면 오늘 아직 함께하지 않은 파트너를 우선한다", () => {
    const state = fixture();
    state.allMatches = [match(1, ["me", "a"], ["b", "c"])];
    const plans = suggestDoubles(state, ["me", "a", "b", "c"]);
    expect(plans.slice(0, 2).every((p) => p.slots[1] !== "a")).toBe(true);
    expect(plans[2].slots[1]).toBe("a");
    state.allMatches[0].date = "2026-10-30";
    expect(suggestDoubles(state, ["me", "a", "b", "c"])[0].slots[1]).toBe("a");
  });

  it("당일 단식도 출전 횟수에 포함하고 과거·삭제 경기는 제외한다", () => {
    const state = fixture();
    state.allMatches = [
      match(1, ["a"], ["b"], { kind: "singles" }),
      match(2, ["me", "c"], ["d", "e"], { date: "2026-10-30" }),
      match(3, ["me", "c"], ["d", "e"], { deleted: true }),
    ];
    const players = courtPlayers(state);
    expect(players.find((p) => p.id === "a")?.games).toBe(1);
    expect(players.find((p) => p.id === "b")?.lastOrder).toBe(1);
    expect(players.find((p) => p.id === "c")?.games).toBe(0);
    expect(players.find((p) => p.id === "me")?.games).toBe(0);
  });

  it("선택 순서와 관계없이 같은 추천을 만들고 원래 기록을 보존한다", () => {
    const state = fixture();
    const before = structuredClone(state);
    const roster = state.profiles.map((p) => p.id);
    const expected = suggestDoubles(state, roster);
    expect(suggestDoubles(state, [...roster].reverse())).toEqual(expected);
    expect(state).toEqual(before);
  });
});
