import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  ArrowUpRight,
  Inbox,
  Shuffle,
  Trophy,
  Users,
} from "lucide-react";
import { MatchList } from "@/components/matches";
import { PlayerRank } from "@/components/rank";
import {
  ErrorBox,
  FiltersBar,
  Loading,
  RatingChart,
  RatingSummary,
  useStateData,
} from "@/components/shared";
import { Button } from "@/components/ui/button";
import { parseFilters } from "@/lib/types";
import { Route as MemberRoute } from "./_member";
export const Route = createFileRoute("/_member/")({
  validateSearch: parseFilters,
  component: Home,
});
function Home() {
  const { user } = MemberRoute.useRouteContext();
  const filters = Route.useSearch();
  const navigate = Route.useNavigate();
  const { state, error, refresh } = useStateData(filters);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="page-title min-w-0 wrap-anywhere">
          {user?.profile
            ? `${user.profile.nickname}님의 코트`
            : "우리의 전체 코트"}
        </h1>
        {user && (
          <Button asChild variant="ghost" className="h-11 px-2">
            <Link
              to="/players/$playerId"
              search={{ ...filters, player: user.id }}
              params={{ playerId: user.id }}
            >
              내 프로필
            </Link>
          </Button>
        )}
      </div>
      {user && (
        <FiltersBar
          filters={filters}
          onChange={(f) => navigate({ search: f })}
        />
      )}
      {user && state && (
        <>
          {!!state.pending && (
            <Link
              to="/inbox"
              className="flex min-h-11 items-center justify-between gap-2 rounded-lg border bg-muted px-3 text-sm"
            >
              <span className="flex items-center gap-2">
                <Inbox size={16} />
                <strong>확인할 경기 {state.pending}개</strong>
              </span>
              <ArrowUpRight size={15} />
            </Link>
          )}
          <div className="grid gap-3 lg:grid-cols-2">
            <RatingSummary state={state} />
            <PlayerRank
              season={state.season}
              kind={filters.kind}
              ranking={state.rankings.find(
                (r) => r.playerId === user.id && r.kind === filters.kind,
              )}
            />
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <section className="panel min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-bold">나의 최근 경기</h2>
                <Button asChild variant="ghost" className="h-11">
                  <Link to="/history" search={{ ...filters, player: user.id }}>
                    모두 보기
                    <ArrowUpRight size={14} />
                  </Link>
                </Button>
              </div>
              <MatchList state={state} refresh={refresh} limit={5} />
            </section>
            <RatingChart state={state} />
          </div>
        </>
      )}
      {error && <ErrorBox message={error} retry={refresh} />}
      {!state && !error && user && <Loading />}
      <nav aria-label="코트 도구" className="grid grid-cols-2 gap-2 sm:flex">
        <Button asChild variant="outline" className="h-11">
          <Link to="/leaderboard" search={{ kind: filters.kind }}>
            <Trophy />
            전체 순위 보기
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-11">
          <Link to="/players" search={parseFilters({})}>
            <Users />
            선수 찾기
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-11">
          <Link to="/court">
            <Shuffle />
            다음 경기 추천
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-11">
          <Link to="/simulate">
            <ArrowLeftRight />
            가상 대결
          </Link>
        </Button>
      </nav>
    </div>
  );
}
