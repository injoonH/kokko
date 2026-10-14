import { describe, expect, it } from "vitest";
import { parseFilters, validScore } from "./types";

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
