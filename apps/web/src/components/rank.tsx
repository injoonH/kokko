import { useState } from "react";
import { playerTier, RANK_TIERS, type RankTier, tierRange } from "@/lib/ranks";
import type { Kind, Ranking } from "@/lib/types";
import { cn } from "@/lib/utils";
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
  return (
    <img
      src={`/crests/${tier.id}.webp`}
      alt={`${tier.name} 문장`}
      width={320}
      height={320}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className={cn("size-16 shrink-0 object-contain", className)}
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
            <DialogTitle>우리 모임의 여섯 티어</DialogTitle>
            <DialogDescription>
              현재 표시된 Elo로 정해져요. 단식과 복식 티어는 따로 올라가요.
            </DialogDescription>
          </DialogHeader>
          <ol className="grid grid-cols-3 gap-2" aria-label="티어 기준표">
            {RANK_TIERS.map((tier, index) => (
              <li
                key={tier.id}
                className="min-w-0 rounded-xl bg-muted/50 px-1 py-3 text-center"
              >
                <RankCrest tier={tier} className="mx-auto size-20" eager />
                <p className="mt-1 text-sm font-semibold">{tier.name}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {tierRange(index)}
                </p>
              </li>
            ))}
          </ol>
          <div className="space-y-2 text-xs leading-relaxed text-muted-foreground">
            <p>
              첫 경기를 마친 뒤 티어가 정해져요. 기간 필터와 관계없이 누적 Elo를
              사용해요.
            </p>
            <p>
              승급과 강등은 현재 Elo에 따라 반영돼요. 진행 막대는 다음 티어까지
              남은 마지막 100 Elo를 보여줘요.
            </p>
            <p>
              모임 순위는 서버의 현재 Elo 순위예요. 같은 표시 Elo는 공동
              순위이며, 경기 전·이용 중지 선수는 순위에서 제외돼요.
            </p>
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
  kind,
}: {
  ranking?: Ranking;
  kind: Kind;
}) {
  const rank = playerTier(ranking?.rating ?? 1000, ranking?.games ?? 0);
  const discipline = kind === "doubles" ? "복식" : "단식";
  return (
    <section
      aria-label={`${discipline} 티어`}
      className="relative overflow-hidden rounded-2xl border bg-linear-to-br from-[#eeeeeb] via-white to-[#f6f6f3] p-5 md:p-6"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="eyebrow">{discipline} 티어</p>
        <TierGuide />
      </div>
      <div className="flex items-center gap-4 md:gap-6">
        {rank ? (
          <RankCrest
            tier={rank.tier}
            className="size-28 drop-shadow-md md:size-32"
            eager
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex size-24 shrink-0 items-center justify-center rounded-full border border-dashed text-4xl text-muted-foreground"
          >
            —
          </div>
        )}
        <div className="min-w-0 flex-1" aria-live="polite" aria-atomic="true">
          <h2 className="text-2xl font-bold">{rank?.tier.name ?? "미배정"}</h2>
          {rank ? (
            <>
              <p className="muted mt-1">
                {rank.displayedRating.toLocaleString("ko-KR")} Elo ·{" "}
                {ranking?.games}경기
              </p>
              <p className="mt-3 text-sm font-medium">
                {rank.nextTier
                  ? `${rank.nextTier.name}까지 ${rank.remaining.toLocaleString("ko-KR")} Elo`
                  : "최고 티어에 도달했어요"}
              </p>
              <div
                role="progressbar"
                aria-label="다음 티어 진행도"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={rank.progress}
                aria-valuetext={
                  rank.nextTier
                    ? `${rank.nextTier.name}까지 ${rank.remaining} Elo`
                    : "최고 티어"
                }
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10"
              >
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${rank.progress}%` }}
                />
              </div>
            </>
          ) : (
            <p className="muted mt-2">
              {discipline} 첫 경기를 기록하면 문장이 공개돼요.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
