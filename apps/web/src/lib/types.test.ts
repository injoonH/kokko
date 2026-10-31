import { describe, expect, it } from "vitest";
import { parseFilters, validScore, winningScore } from "./types";

describe("경기 입력", () => {
  it("듀스와 상한을 양쪽에서 검사한다", () => {
    for (const [a, b] of [
      [21, 0],
      [21, 19],
      [22, 20],
      [29, 27],
      [30, 28],
      [30, 29],
    ]) {
      expect(validScore(a, b)).toBe(true);
      expect(validScore(b, a)).toBe(true);
    }
    for (const [a, b] of [
      [21, 20],
      [22, 19],
      [30, 27],
      [31, 29],
      [21.5, 10],
      [-1, 21],
      [21, 21],
    ])
      expect(validScore(a, b)).toBe(false);
  });
  it("모든 패배 점수에서 유효한 승리 점수를 채운다", () => {
    for (let opponent = 0; opponent < 30; opponent++) {
      const score = winningScore(opponent);
      expect(score).not.toBeNull();
      expect(score).toBeGreaterThan(opponent);
      expect(validScore(score as number, opponent)).toBe(true);
      expect(validScore(opponent, score as number)).toBe(true);
    }
    expect(winningScore(0)).toBe(21);
    expect(winningScore(19)).toBe(21);
    expect(winningScore(20)).toBe(22);
    expect(winningScore(27)).toBe(29);
    expect(winningScore(28)).toBe(30);
    expect(winningScore(29)).toBe(30);
  });
  it("상대가 30점이거나 잘못된 점수면 승리 점수를 제안하지 않는다", () => {
    for (const opponent of [-1, 0.5, 30, 31, NaN, Infinity])
      expect(winningScore(opponent)).toBeNull();
  });
  it("URL의 잘못된 필터를 안전한 기본값으로 바꾼다", () => {
    expect(
      parseFilters({
        kind: "triples",
        period: "-1",
        player: [],
        result: "draw",
      }),
    ).toEqual({ kind: "doubles", period: "30", player: "", result: "" });
    expect(
      parseFilters({
        kind: "singles",
        period: "all",
        player: "member",
        result: "loss",
      }),
    ).toEqual({
      kind: "singles",
      period: "all",
      player: "member",
      result: "loss",
    });
  });
});

it("URL에서 숫자로 해석한 기간도 문자열로 정규화한다", () => {
  expect(parseFilters({ period: 7 }).period).toBe("7");
});
