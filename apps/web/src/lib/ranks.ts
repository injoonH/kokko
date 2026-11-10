export const RANK_TIERS = [
  { id: "bronze", name: "브론즈", minimum: null },
  { id: "silver", name: "실버", minimum: 900 },
  { id: "gold", name: "골드", minimum: 1000 },
  { id: "platinum", name: "플래티넘", minimum: 1100 },
  { id: "diamond", name: "다이아몬드", minimum: 1200 },
  { id: "master", name: "마스터", minimum: 1300 },
] as const;

export type RankTier = (typeof RANK_TIERS)[number];

export function playerTier(rating: number, games: number) {
  if (!Number.isFinite(rating) || !Number.isFinite(games) || games <= 0)
    return null;
  const displayedRating = Math.round(rating);
  let index = 0;
  for (const [i, tier] of RANK_TIERS.entries()) {
    if (tier.minimum === null || displayedRating >= tier.minimum) index = i;
  }
  const tier = RANK_TIERS[index];
  const nextTier = RANK_TIERS[index + 1] ?? null;
  const remaining = nextTier ? (nextTier.minimum ?? 0) - displayedRating : 0;
  return {
    tier,
    nextTier,
    displayedRating,
    remaining,
    // All promotion steps are 100 Elo; Bronze fills over its final 100 Elo.
    progress: nextTier ? Math.max(0, Math.min(100, 100 - remaining)) : 100,
  };
}

export function tierRange(index: number) {
  const tier = RANK_TIERS[index];
  const next = RANK_TIERS[index + 1];
  if (tier.minimum === null) return "900 Elo 미만";
  if (!next) return `${tier.minimum.toLocaleString("ko-KR")} Elo 이상`;
  return `${tier.minimum.toLocaleString("ko-KR")}–${((next.minimum ?? 0) - 1).toLocaleString("ko-KR")} Elo`;
}
