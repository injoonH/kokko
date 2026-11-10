import { describe, expect, it } from "vitest";
import { playerTier } from "./ranks";

describe("Elo 티어", () => {
  it("종목에서 경기한 선수만 티어를 받는다", () => {
    expect(playerTier(1500, 0)).toBeNull();
    expect(playerTier(1000, -1)).toBeNull();
    expect(playerTier(NaN, 10)).toBeNull();
    expect(playerTier(Infinity, 10)).toBeNull();
    expect(playerTier(1000, NaN)).toBeNull();
    expect(playerTier(1000, 1)?.tier.id).toBe("gold");
  });

  it("표시 Elo와 같은 반올림으로 여섯 승급 경계를 정한다", () => {
    for (const [rating, expected] of [
      [-200, "bronze"],
      [899.49, "bronze"],
      [899.5, "silver"],
      [999.49, "silver"],
      [999.5, "gold"],
      [1099.49, "gold"],
      [1099.5, "platinum"],
      [1199.49, "platinum"],
      [1199.5, "diamond"],
      [1299.49, "diamond"],
      [1299.5, "master"],
    ] as const) {
      expect(playerTier(rating, 10)?.tier.id).toBe(expected);
    }
  });

  it("다음 승급까지 남은 Elo와 마지막 100점의 진행도를 보여준다", () => {
    const gold = playerTier(1034.8, 12);
    expect(gold?.displayedRating).toBe(1035);
    expect(gold?.nextTier?.id).toBe("platinum");
    expect(gold?.remaining).toBe(65);
    expect(gold?.progress).toBe(35);
    expect(playerTier(899, 10)?.remaining).toBe(1);
    expect(playerTier(899, 10)?.progress).toBe(99);
    expect(playerTier(700, 10)?.remaining).toBe(200);
    expect(playerTier(700, 10)?.progress).toBe(0);
    expect(playerTier(900, 10)?.progress).toBe(0);
  });

  it("최고 티어는 다음 티어나 가짜 승급 목표를 만들지 않는다", () => {
    const master = playerTier(1800.2, 25);
    expect(master?.tier.id).toBe("master");
    expect(master?.nextTier).toBeNull();
    expect(master?.remaining).toBe(0);
    expect(master?.progress).toBe(100);
  });
});
