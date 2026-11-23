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
        className="h-11 shrink-0 px-2 text-xs"
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
          <ol className="grid grid-cols-3 gap-1.5" aria-label="티어 기준표">
            {tierIds.map((tier, index) => (
              <li
                key={tier}
                className="rounded-lg bg-muted/50 px-1 py-1.5 text-center"
              >
                <RankCrest tier={tier} className="mx-auto size-9" eager />
                <p className="mt-1 text-sm font-semibold">{RANK_TIERS[tier]}</p>
                <p className="text-xs text-muted-foreground">
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
      className="panel min-w-0 bg-linear-to-br from-[#eeeeeb] via-white to-[#f6f6f3]"
    >
      <div className="flex items-center gap-2.5">
        {rank ? (
          <RankCrest tier={rank.current.tier} className="size-11" eager />
        ) : (
          <div
            aria-hidden="true"
            className="grid size-11 shrink-0 place-items-center rounded-full border border-dashed text-lg text-muted-foreground"
          >
            —
          </div>
        )}
        <div className="min-w-0 flex-1" aria-live="polite" aria-atomic="true">
          <p className="text-xs font-medium text-muted-foreground">
            {discipline} 랭크{season && ` · 시즌 ${season.number}`}
          </p>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h2 className="text-lg leading-6 font-bold">
              {rank
                ? rankLabel(rank.current)
                : season?.active === false
                  ? "시즌 시작 예정"
                  : "미배정"}
            </h2>
            {rank && season && (
              <p className="text-sm text-muted-foreground">
                {pending
                  ? `배치 중 ${rank.games}/${season.placementGames}`
                  : `${rank.current.lp.toLocaleString("ko-KR")} LP${rank.rank ? ` · 전체 ${rank.rank}위` : ""}`}
              </p>
            )}
          </div>
          {!rank && (
            <p className="text-sm text-muted-foreground">
              {season?.active === false
                ? `${season.startsOn} 배치 시작`
                : `확인된 경기 ${season?.placementGames ?? 5}회로 배치를 마쳐요.`}
            </p>
          )}
        </div>
      </div>
      {rank && season && pending && (
        <RankProgress
          label="배치 경기 진행도"
          value={rank.games}
          max={season.placementGames}
        />
      )}
      {rank?.next && !pending && (
        <RankProgress
          label="다음 디비전 진행도"
          value={rank.current.lp}
          max={100}
        />
      )}
      <div className="flex flex-wrap items-center justify-end gap-x-2">
        {rank && !pending && (
          <div className="mr-auto text-xs text-muted-foreground">
            {rank.next ? (
              <p>
                {rankLabel(rank.next)}까지 {100 - rank.current.lp} LP
              </p>
            ) : (
              <p>상위 티어 순위는 매일 갱신돼요.</p>
            )}
            {rank.peak && (
              <p>
                시즌 최고{" "}
                <strong className="text-foreground">
                  {rankLabel(rank.peak)}
                </strong>
              </p>
            )}
          </div>
        )}
        <div className="flex shrink-0 items-center gap-1">
          <RatingConfidence ranking={ranking} />
          <TierGuide />
        </div>
      </div>
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
      className="mt-1.5 block h-1.5 w-full appearance-none overflow-hidden rounded-full bg-black/10 [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-transparent [&::-webkit-progress-value]:bg-primary"
      aria-label={label}
      value={value}
      max={max}
    />
  );
}
