import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  ArrowUpRight,
  Inbox,
  Shuffle,
  Trophy,
} from "lucide-react";
import { MatchList } from "@/components/matches";
import { PlayerRank } from "@/components/rank";
import {
  ErrorBox,
  FiltersBar,
  Loading,
  RatingChart,
  StatCards,
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
    <div className="space-y-7">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-3">어디서 치든, 하나의 기록</p>
          <h1 className="page-title">우리의 전체 코트</h1>
          <p className="muted mt-3 leading-relaxed">
            친구와 만나고, 새로운 상대와 겨루고.
            <br />한 게임씩 나의 레이팅을 만들어 가요.
          </p>
        </div>
        <img src="/kokko.svg" alt="" className="hidden h-28 w-28 sm:block" />
      </div>
      <FiltersBar
        filters={filters}
        profiles={[]}
        onChange={(f) => navigate({ search: f })}
      />
      {user && state && (
        <>
          {!!state.pending && (
            <Link
              to="/inbox"
              className="flex min-h-16 items-center justify-between gap-3 rounded-2xl bg-primary px-5 py-4 text-white"
            >
              <span className="flex items-center gap-3">
                <Inbox size={20} />
                <strong>확인할 경기 {state.pending}개</strong>
              </span>
              <ArrowUpRight size={18} />
            </Link>
          )}
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold">
              {user.profile?.nickname}님의 코트
            </h2>
            <Link
              to="/players/$playerId"
              search={parseFilters({})}
              params={{ playerId: user.id }}
              className="text-sm underline"
            >
              내 프로필
            </Link>
          </div>
          <StatCards state={state} />
          <PlayerRank
            kind={filters.kind}
            ranking={state.rankings.find(
              (r) => r.playerId === user.id && r.kind === filters.kind,
            )}
          />
        </>
      )}
      {error && <ErrorBox message={error} retry={refresh} />}
      <Button asChild variant="outline" className="h-11">
        <Link to="/leaderboard" search={{ kind: filters.kind }}>
          <Trophy />
          전체 순위 보기
          <ArrowUpRight />
        </Link>
      </Button>
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-dashed p-5">
        <div>
          <p className="font-semibold">누구와 함께 뛰어볼까요?</p>
          <p className="muted mt-1">
            친구가 아니어도 모든 선수와 경기할 수 있어요.
          </p>
        </div>
        <Button asChild variant="outline" className="h-12 shrink-0">
          <Link to="/players" search={parseFilters({})}>
            선수 찾기
          </Link>
        </Button>
      </div>
      {user && state && (
        <>
          <RatingChart state={state} />
          <section className="panel">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold">나의 최근 경기</h2>
              <Link
                to="/history"
                search={{ ...filters, player: user.id }}
                className="muted inline-flex items-center gap-1"
              >
                모두 보기
                <ArrowUpRight size={14} />
              </Link>
            </div>
            <MatchList state={state} refresh={refresh} limit={5} />
          </section>
        </>
      )}
      {!state && !error && user && <Loading />}
      <nav aria-label="코트 도구" className="grid grid-cols-2 gap-2 sm:flex">
        <Button
          asChild
          variant="outline"
          className="h-11 rounded-xl text-xs sm:text-sm"
        >
          <Link to="/court">
            <Shuffle />
            다음 경기 추천
          </Link>
        </Button>
        <Button
          asChild
          variant="outline"
          className="h-11 rounded-xl text-xs sm:text-sm"
        >
          <Link to="/simulate">
            <ArrowLeftRight />
            가상 대결
          </Link>
        </Button>
      </nav>
    </div>
  );
}
