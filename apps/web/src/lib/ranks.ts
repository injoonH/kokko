import type { RankedGame, RankMark } from "./types";

export const RANK_TIERS = {
  iron: "아이언",
  bronze: "브론즈",
  silver: "실버",
  gold: "골드",
  platinum: "플래티넘",
  emerald: "에메랄드",
  diamond: "다이아몬드",
  master: "마스터",
  grandmaster: "그랜드마스터",
  challenger: "챌린저",
} as const;

export type RankTier = keyof typeof RANK_TIERS;
export const tierIds = Object.keys(RANK_TIERS) as RankTier[];

export function rankLabel(mark: RankMark) {
  const division = mark.division
    ? ["I", "II", "III", "IV"][mark.division - 1]
    : "";
  return [RANK_TIERS[mark.tier], division].filter(Boolean).join(" ");
}

export function gameLP(game: RankedGame) {
  const change = game.after - game.before;
  return `${change > 0 ? "+" : ""}${change} LP`;
}
