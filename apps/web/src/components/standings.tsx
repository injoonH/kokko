import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useArenaQuery } from "@/lib/arena";
import { rankLabel } from "@/lib/ranks";
import type { Kind, Standings as StandingsData } from "@/lib/types";
import { parseFilters } from "@/lib/types";
import { RankCrest, TierGuide } from "./rank";
import { Avatar, ErrorBox, Loading } from "./shared";
import { Button } from "./ui/button";

export function Standings({
  kind,
  view,
  signedIn,
}: {
  kind: Kind;
  view: "ranked" | "elo";
  signedIn: boolean;
}) {
  const [friends, setFriends] = useState(false);
  const [page, setPage] = useState(0);
  const { data, error, refresh } = useArenaQuery<StandingsData>(
    `/arena/leaderboard?${new URLSearchParams({ kind, view, friends: String(friends), page: String(page) })}`,
    true,
  );
  const season = view === "ranked" ? data?.season : undefined;
  return (
    <section className="panel" aria-labelledby="global-standings">
      {(signedIn || view === "ranked") && (
        <div className="mb-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b pb-1">
          {signedIn && (
            <fieldset className="flex gap-1" aria-label="순위 범위">
              <Button
                variant={!friends ? "secondary" : "ghost"}
                aria-pressed={!friends}
                className="h-11 px-2"
                onClick={() => {
                  setFriends(false);
                  setPage(0);
                }}
              >
                전체
              </Button>
              <Button
                variant={friends ? "secondary" : "ghost"}
                aria-pressed={friends}
                className="h-11 px-2"
                onClick={() => {
                  setFriends(true);
                  setPage(0);
                }}
              >
                친구와 나
              </Button>
            </fieldset>
          )}
          {view === "ranked" && (
            <div className="ml-auto flex items-center gap-1">
              {season && <p className="muted">시즌 {season.number}</p>}
              <TierGuide />
            </div>
          )}
        </div>
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
              const rank = season && r.seasonRank;
              const place = view === "ranked" ? rank?.rank : r.rank;
              return (
                <li key={r.playerId}>
                  <Link
                    to="/players/$playerId"
                    search={parseFilters({ kind })}
                    params={{ playerId: r.playerId }}
                    className="flex min-h-14 items-center gap-2 rounded-sm py-1.5 hover:bg-muted/50 sm:gap-3"
                  >
                    <span className="w-6 shrink-0 text-center text-sm font-semibold tabular-nums text-muted-foreground">
                      {place || "—"}
                    </span>
                    <Avatar profile={p} size="small" />
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-sm font-bold"
                        title={p?.nickname}
                      >
                        {p?.nickname}
                      </p>
                      <p className="flex gap-1 text-xs text-muted-foreground">
                        <span className="min-w-0 truncate">#{p?.handle}</span>
                        <span className="shrink-0">
                          · {rank?.games ?? r.games}경기
                        </span>
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      {rank && season ? (
                        <>
                          <p className="flex items-center justify-end gap-1 text-sm font-semibold">
                            <RankCrest
                              tier={rank.current.tier}
                              className="size-5"
                            />
                            {rankLabel(rank.current)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {rank.games < season.placementGames &&
                              `배치 중 ${rank.games}/${season.placementGames} · `}
                            {rank.current.lp.toLocaleString("ko-KR")} LP
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-lg leading-6 font-semibold tabular-nums">
                            {Math.round(r.rating).toLocaleString("ko-KR")}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            RD {Math.round(r.rd)}
                          </p>
                        </>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ol>
          {!data.rankings.length && (
            <p className="muted py-5 text-center">
              {season?.active === false
                ? `${season.startsOn}부터 시즌 랭크를 시작해요.`
                : "아직 순위에 오른 선수가 없어요. 확인된 첫 경기부터 집계돼요."}
            </p>
          )}
          {(page > 0 || data.hasMore) && (
            <div className="mt-2 flex items-center justify-between border-t pt-2">
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
          )}
        </>
      )}
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {view === "ranked"
          ? "배치를 마친 선수의 티어와 LP로 순위를 정해요. 배치 중인 선수에게는 순위가 표시되지 않아요."
          : "순위는 확인된 경기의 누적 Elo 기준이에요. 서로 만나지 않은 집단의 점수는 실력 비교에 한계가 있어요."}
      </p>
    </section>
  );
}
