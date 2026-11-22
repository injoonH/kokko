import { describe, expect, it } from "vitest";
import { gameLP, rankLabel } from "./ranks";

describe("season rank labels", () => {
  it("uses the server-awarded division and omits it for an apex badge", () => {
    expect(rankLabel({ tier: "silver", division: 4, lp: 75 })).toBe("실버 IV");
    expect(rankLabel({ tier: "challenger", lp: 820 })).toBe("챌린저");
  });

  it("shows the actual applied LP at placement and demotion floors", () => {
    const game = { matchId: "game", playerId: "player", season: 1, games: 5 };
    expect(gameLP({ ...game, before: 1600, after: 1600 })).toBe("0 LP");
    expect(gameLP({ ...game, before: 1610, after: 1600 })).toBe("-10 LP");
    expect(gameLP({ ...game, before: 1595, after: 1620 })).toBe("+25 LP");
  });
});
