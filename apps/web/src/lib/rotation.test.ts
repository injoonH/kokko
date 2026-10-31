import { describe, expect, it } from "vitest";
import { doublesPairings, sameDoublesTeams } from "./rotation";

describe("복식 빠른 팀 조합", () => {
  it("선수 네 명을 한 번씩 포함하는 세 가지 조합을 만든다", () => {
    const pairings = doublesPairings(["a", "b", "c", "d"], "a");
    expect(pairings).toHaveLength(3);
    expect(pairings.map((p) => p[1])).toEqual(["b", "c", "d"]);
    for (const pairing of pairings) {
      expect([...pairing].sort()).toEqual(["a", "b", "c", "d"]);
    }
    for (let i = 0; i < pairings.length; i++) {
      for (let j = i + 1; j < pairings.length; j++)
        expect(sameDoublesTeams(pairings[i], pairings[j])).toBe(false);
    }
  });

  it("팀과 선수 자리를 바꿔도 조합 순서와 선택된 팀을 유지한다", () => {
    const expected = doublesPairings(["a", "b", "c", "d"], "a");
    for (const slots of [
      ["b", "a", "d", "c"],
      ["c", "d", "a", "b"],
      ["d", "c", "b", "a"],
    ]) {
      expect(doublesPairings(slots, "a")).toEqual(expected);
      expect(sameDoublesTeams(slots, expected[0])).toBe(true);
    }
    expect(doublesPairings(["d", "c", "b", "a"], "spectator")).toEqual(
      expected,
    );
  });

  it("중복되거나 아직 선택하지 않은 선수로 조합을 만들지 않는다", () => {
    for (const slots of [
      [],
      ["a", "b"],
      ["a", "", "c", "d"],
      ["a", "a", "c", "d"],
    ])
      expect(doublesPairings(slots, "a")).toEqual([]);
    expect(sameDoublesTeams(["a", "b"], ["a", "b", "c", "d"])).toBe(false);
  });
});
