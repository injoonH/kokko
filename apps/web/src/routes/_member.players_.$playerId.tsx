import { createFileRoute, Link } from "@tanstack/react-router";
import { PlayerActivity } from "@/components/activity";
import { FriendActions } from "@/components/friend-actions";
import { MatchList } from "@/components/matches";
import { PlayerRank } from "@/components/rank";
import {
  Avatar,
  ErrorBox,
  FiltersBar,
  Loading,
  RatingChart,
  RatingSummary,
  useStateData,
} from "@/components/shared";
import { useArenaQuery } from "@/lib/arena";
import type { Social } from "@/lib/types";
import { parseFilters } from "@/lib/types";
import { signed } from "@/lib/utils";
import { Route as MemberRoute } from "./_member";
export const Route = createFileRoute("/_member/players_/$playerId")({
  validateSearch: parseFilters,
  component: Player,
});
function Player() {
  const { playerId } = Route.useParams();
  const { user } = MemberRoute.useRouteContext();
  return (
    <PlayerView key={playerId} playerId={playerId} userId={user?.id || ""} />
  );
}
function PlayerView({
  playerId,
  userId,
}: {
  playerId: string;
  userId: string;
}) {
  const social = useArenaQuery<Social>(
    userId && userId !== playerId ? `/arena/social?target=${playerId}` : null,
  );
  const filters = { ...Route.useSearch(), player: playerId };
  const navigate = Route.useNavigate();
  const { state, error, refresh } = useStateData(filters);
  if (error) return <ErrorBox message={error} retry={refresh} />;
  if (!state) return <Loading />;
  const p = state.profiles.find((p) => p.id === playerId);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5">
        <Avatar profile={p} />
        <div className="min-w-0">
          <h1 className="page-title wrap-anywhere">{p?.nickname}</h1>
          <p className="muted truncate">
            #{p?.handle} {p?.status === "suspended" ? "· 활동 중지" : ""}
          </p>
        </div>
      </div>
      {userId && social.data && p && (
        <FriendActions
          player={p}
          meId={userId}
          social={social.data}
          refresh={social.refresh}
        />
      )}
      {!userId && (
        <Link
          to="/login"
          className="inline-flex min-h-11 items-center text-sm underline"
        >
          로그인하고 친구로 추가
        </Link>
      )}
      <FiltersBar filters={filters} onChange={(f) => navigate({ search: f })} />
      <div className="grid gap-3 lg:grid-cols-2">
        <RatingSummary state={state} />
        <PlayerRank
          season={state.season}
          kind={filters.kind}
          ranking={state.rankings.find(
            (r) => r.playerId === playerId && r.kind === filters.kind,
          )}
        />
      </div>
      <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
        <RatingChart state={state} />
        <section className="panel min-w-0">
          <h2 className="mb-1 text-lg font-bold">최근 경기</h2>
          <MatchList state={state} refresh={refresh} limit={10} />
        </section>
      </div>
      <PlayerActivity
        key={playerId}
        matches={state.allMatches}
        playerId={playerId}
        today={state.today}
        summary={state.activity}
      />
      {filters.kind === "doubles" && (
        <section className="panel">
          <h2 className="mb-1 text-lg font-bold">파트너와의 호흡</h2>
          {state.stats.partners.length === 0 ? (
            <p className="muted py-5">함께한 복식 경기가 아직 없어요.</p>
          ) : (
            state.stats.partners.map((pair) => (
              <div
                key={pair.playerId}
                className="flex items-center justify-between gap-2 border-t py-2"
              >
                <div className="flex items-center gap-3">
                  <Avatar
                    profile={state.profiles.find((p) => p.id === pair.playerId)}
                    size="small"
                  />
                  <div>
                    <p className="font-medium">
                      {
                        state.profiles.find((p) => p.id === pair.playerId)
                          ?.nickname
                      }
                    </p>
                    <p className="muted">
                      {pair.games}경기 · {pair.wins}승 {pair.losses}패 · 승률{" "}
                      {pair.winRate.toFixed(0)}%
                    </p>
                  </div>
                </div>
                <span className="shrink-0 text-sm font-semibold">
                  {pair.synergy === null
                    ? "데이터 부족"
                    : `${signed(pair.synergy)} pp`}
                </span>
              </div>
            ))
          )}
          <details className="text-sm text-muted-foreground">
            <summary className="min-h-11 cursor-pointer content-center">
              시너지 계산 기준
            </summary>
            <p>
              시너지 = 100 × 평균(실제 승패 − 경기 전 예상 승률). 상대와 Elo를
              고려한 기대 대비 성과예요. 선택 기간에 5경기 이상 함께한 파트너의
              시너지를 표시해요.
            </p>
            <p className="mt-1">
              파트너와 상대는 경기 수가 많은 순서로 최대 50명씩 보여요.
            </p>
          </details>
        </section>
      )}
      <section className="panel">
        <h2 className="mb-1 text-lg font-bold">상대 전적</h2>
        {state.stats.opponents.length === 0 ? (
          <p className="muted">상대 기록이 아직 없어요.</p>
        ) : (
          state.stats.opponents.map((p) => (
            <div
              key={p.playerId}
              className="flex justify-between gap-2 border-t py-2 text-sm"
            >
              <span className="min-w-0 wrap-anywhere">
                {state.profiles.find((x) => x.id === p.playerId)?.nickname}
              </span>
              <span className="shrink-0">
                {p.wins}승 {p.losses}패 · {p.winRate.toFixed(0)}%
              </span>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
