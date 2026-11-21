import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useArenaQuery } from "@/lib/arena";
import { playerTier } from "@/lib/ranks";
import type { Kind, Standings as StandingsData } from "@/lib/types";
import { parseFilters } from "@/lib/types";
import { RankCrest, TierGuide } from "./rank";
import { Avatar, ErrorBox, Loading } from "./shared";
import { Button } from "./ui/button";

export function Standings({
  kind,
  signedIn,
}: {
  kind: Kind;
  signedIn: boolean;
}) {
  const [friends, setFriends] = useState(false);
  const [page, setPage] = useState(0);
  const { data, error, refresh } = useArenaQuery<StandingsData>(
    `/arena/leaderboard?${new URLSearchParams({ kind, friends: String(friends), page: String(page) })}`,
    true,
  );
  return (
    <section className="panel" aria-labelledby="global-standings">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow mb-2">한 게임씩, 더 높은 곳으로</p>
          <h2 id="global-standings" className="text-xl font-bold">
            전체 {kind === "doubles" ? "복식" : "단식"} 순위
          </h2>
        </div>
        <TierGuide />
      </div>
      {signedIn && (
        <fieldset className="mb-4 flex gap-2" aria-label="순위 범위">
          <Button
            variant={!friends ? "default" : "outline"}
            aria-pressed={!friends}
            className="h-11"
            onClick={() => {
              setFriends(false);
              setPage(0);
            }}
          >
            전체
          </Button>
          <Button
            variant={friends ? "default" : "outline"}
            aria-pressed={friends}
            className="h-11"
            onClick={() => {
              setFriends(true);
              setPage(0);
            }}
          >
            친구와 나
          </Button>
        </fieldset>
      )}
      {error ? (
        <ErrorBox message={error} retry={refresh} />
      ) : !data ? (
        <Loading />
      ) : (
        <>
          <ol aria-label="전체 선수 순위" className="divide-y">
            {data.rankings.map((r) => {
              const p = data.profiles.find((p) => p.id === r.playerId);
              const tier = playerTier(r.rating, r.games);
              return (
                <li key={r.playerId}>
                  <Link
                    to="/players/$playerId"
                    search={parseFilters({})}
                    params={{ playerId: r.playerId }}
                    className="flex min-h-23 items-center gap-3 py-4"
                  >
                    <span className="w-7 shrink-0 text-lg font-semibold tabular-nums text-muted-foreground">
                      {r.rank}
                    </span>
                    <Avatar profile={p} size="small" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{p?.nickname}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        #{p?.handle} · {r.games}경기
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-xs">
                        {tier && (
                          <RankCrest tier={tier.tier} className="size-6" />
                        )}
                        {tier?.tier.name}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-2xl font-semibold tabular-nums">
                        {Math.round(r.rating).toLocaleString()}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        RD {Math.round(r.rd)}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ol>
          {!data.rankings.length && (
            <p className="muted py-8 text-center">
              아직 순위에 오른 선수가 없어요. 확인된 첫 경기부터 집계돼요.
            </p>
          )}
          <div className="mt-5 flex items-center justify-between">
            <Button
              variant="outline"
              className="h-11"
              disabled={!page}
              onClick={() => setPage((p) => p - 1)}
            >
              이전
            </Button>
            <span className="muted">{page + 1}페이지</span>
            <Button
              variant="outline"
              className="h-11"
              disabled={!data.hasMore}
              onClick={() => setPage((p) => p + 1)}
            >
              다음
            </Button>
          </div>
        </>
      )}
      <p className="muted mt-5 leading-relaxed">
        순위는 확인된 경기의 누적 Elo 기준이에요. RD가 높으면 아직 점수를
        알아가는 중이에요. 서로 만나지 않은 선수 집단의 점수는 실력 비교에
        한계가 있어요.
      </p>
    </section>
  );
}
