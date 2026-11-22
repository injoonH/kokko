import { useState } from "react";
import { RANK_TIERS, type RankTier, rankLabel, tierIds } from "@/lib/ranks";
import type { Kind, RankedYear, Ranking } from "@/lib/types";
import { cn } from "@/lib/utils";
import { RatingConfidence } from "./rating-confidence";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

export function RankCrest({
  tier,
  className,
  eager = false,
}: {
  tier: RankTier;
  className?: string;
  eager?: boolean;
}) {
  const asset = tier === "platinum" ? "platinum-season" : tier;
  return (
    <img
      src={`/crests/${asset}.webp`}
      alt=""
      width={384}
      height={384}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className={cn("size-10 shrink-0 object-contain", className)}
    />
  );
}

export function TierGuide() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        className="min-h-11 shrink-0 text-xs"
        onClick={() => setOpen(true)}
      >
        티어 기준
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>시즌 랭크 티어</DialogTitle>
            <DialogDescription>
              단식과 복식에서 각각 배치 경기 5회를 치러요. 상대가 확인한 경기만
              집계해요.
            </DialogDescription>
          </DialogHeader>
          <ol
            className="grid grid-cols-2 gap-2 sm:grid-cols-3"
            aria-label="티어 기준표"
          >
            {tierIds.map((tier, index) => (
              <li
                key={tier}
                className="rounded-xl bg-muted/50 px-2 py-2.5 text-center"
              >
                <RankCrest tier={tier} className="mx-auto size-14" eager />
                <p className="mt-1 text-sm font-semibold">{RANK_TIERS[tier]}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {index < 7
                    ? "IV → I"
                    : ["다이아몬드 I 승급", "400 LP · 2자리", "800 LP · 1자리"][
                        index - 7
                      ]}
                </p>
              </li>
            ))}
          </ol>
          <div className="space-y-2 text-xs leading-relaxed text-muted-foreground">
            <p>
              한 디비전마다 100 LP가 필요해요. 티어가 내려갈 때 한 번은 현재
              티어의 0 LP에서 버틸 수 있어요.
            </p>
            <p>
              마스터부터 LP가 누적돼요. 한국 날짜가 바뀌면 확정된 결과로 상위
              티어의 자리를 다시 정해요.
            </p>
            <p>시즌 랭크는 새 시즌의 배치부터 시작하고, 누적 Elo는 이어져요.</p>
          </div>
          <Button
            variant="outline"
            className="h-11 w-full"
            onClick={() => setOpen(false)}
          >
            확인
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function PlayerRank({
  ranking,
  season,
  kind,
}: {
  ranking?: Ranking;
  season?: RankedYear;
  kind: Kind;
}) {
  const rank = ranking?.seasonRank;
  const pending = rank && season && rank.games < season.placementGames;
  const discipline = kind === "doubles" ? "복식" : "단식";
  return (
    <section
      aria-label={`${discipline} 시즌 랭크`}
      className="relative overflow-hidden rounded-2xl border bg-linear-to-br from-[#eeeeeb] via-white to-[#f6f6f3] p-4 md:p-5"
    >
      <div className="mb-1 flex items-center justify-between gap-3">
        <p className="eyebrow">
          {discipline} 랭크{season && ` · 시즌 ${season.number}`}
        </p>
        <TierGuide />
      </div>
      <div className="flex items-center gap-3 md:gap-4">
        {rank ? (
          <RankCrest tier={rank.current.tier} className="size-16" eager />
        ) : (
          <div
            aria-hidden="true"
            className="flex size-16 shrink-0 items-center justify-center rounded-full border border-dashed text-2xl text-muted-foreground"
          >
            —
          </div>
        )}
        <div className="min-w-0 flex-1" aria-live="polite" aria-atomic="true">
          <h2 className="text-xl font-bold">
            {rank
              ? rankLabel(rank.current)
              : season?.active === false
                ? "시즌 시작 예정"
                : "미배정"}
          </h2>
          {rank && season ? (
            <>
              <p className="muted mt-1">
                {pending
                  ? `배치 중 ${rank.games}/${season.placementGames}`
                  : `${rank.current.lp.toLocaleString("ko-KR")} LP${rank.rank ? ` · 전체 ${rank.rank}위` : ""}`}
              </p>
              {pending ? (
                <RankProgress
                  label="배치 경기 진행도"
                  value={rank.games}
                  max={season.placementGames}
                />
              ) : rank.next ? (
                <>
                  <p className="mt-2 text-sm font-medium">
                    {rankLabel(rank.next)}까지 {100 - rank.current.lp} LP
                  </p>
                  <RankProgress
                    label="다음 디비전 진행도"
                    value={rank.current.lp}
                    max={100}
                  />
                </>
              ) : (
                <p className="mt-2 text-sm font-medium">
                  상위 티어 순위는 매일 갱신돼요.
                </p>
              )}
            </>
          ) : (
            <p className="muted mt-2">
              {season?.active === false
                ? `${season.startsOn}부터 배치 경기를 시작해요.`
                : `확인된 ${discipline} 경기 ${season?.placementGames ?? 5}회로 배치를 마쳐요.`}
            </p>
          )}
        </div>
      </div>
      {rank?.peak && (
        <p className="mt-3 text-sm text-muted-foreground">
          시즌 최고{" "}
          <strong className="text-foreground">{rankLabel(rank.peak)}</strong>
        </p>
      )}
      <RatingConfidence ranking={ranking} />
    </section>
  );
}

function RankProgress({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  return (
    <progress
      className="mt-2 block h-1.5 w-full appearance-none overflow-hidden rounded-full bg-black/10 [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-transparent [&::-webkit-progress-value]:bg-primary"
      aria-label={label}
      value={value}
      max={max}
    />
  );
}
