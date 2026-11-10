import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeftRight, ArrowUpRight, Shuffle } from "lucide-react";
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
export const Route = createFileRoute("/_member/")({
  validateSearch: parseFilters,
  component: Home,
});
function Home() {
  const filters = Route.useSearch();
  const navigate = Route.useNavigate();
  const { state, error, loading, refresh } = useStateData(filters);
  if (error) return <ErrorBox message={error} retry={refresh} />;
  if (!state) return <Loading />;
  const self = state.profiles.find((p) => p.id === state.me.id);
  return (
    <div className="space-y-7">
      <div className="flex items-end justify-between">
        <div>
          <p className="eyebrow mb-3">우리의 코트, 우리의 기록</p>
          <h1 className="page-title">{self?.nickname}님의 코트</h1>
          <p className="muted mt-3">한 게임 더, 어제보다 한 걸음 더.</p>
        </div>
        <img src="/kokko.svg" alt="" className="hidden h-25 w-25 sm:block" />
      </div>
      <div>
        <FiltersBar
          filters={filters}
          profiles={state.profiles}
          onChange={(f) => navigate({ search: f })}
        />
        {loading ? (
          <Loading />
        ) : (
          <>
            <StatCards state={state} />
            <div className="mb-6">
              <PlayerRank
                kind={filters.kind}
                ranking={state.rankings.find(
                  (r) => r.playerId === state.me.id && r.kind === filters.kind,
                )}
              />
            </div>
            <RatingChart state={state} />
          </>
        )}
      </div>
      <section className="panel">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">최근 경기</h2>
          <Link
            to="/history"
            search={{ ...filters, player: state.me.id }}
            className="flex items-center gap-1 text-xs text-muted-foreground"
          >
            모두 보기
            <ArrowUpRight size={14} />
          </Link>
        </div>
        <MatchList state={state} refresh={refresh} limit={5} />
      </section>
      <nav aria-label="코트 도구" className="grid grid-cols-2 gap-2 sm:flex">
        <Button
          asChild
          variant="outline"
          className="h-11 min-w-0 rounded-xl px-3 text-xs sm:text-sm"
        >
          <Link to="/court">
            <Shuffle />
            다음 경기 추천
          </Link>
        </Button>
        <Button
          asChild
          variant="outline"
          className="h-11 min-w-0 rounded-xl px-3 text-xs sm:text-sm"
        >
          <Link to="/simulate">
            <ArrowLeftRight />
            가상 대결
          </Link>
        </Button>
      </nav>
      <div className="flex items-center justify-between rounded-2xl border border-dashed px-5 py-5">
        <div>
          <p className="font-semibold">오늘도 즐거운 경기였나요?</p>
          <p className="muted mt-1">기억이 생생할 때, 다음 경기도 남겨요.</p>
        </div>
        <Link
          to="/matches/new"
          className="action ml-3 shrink-0 bg-primary text-white text-sm"
        >
          기록하기
        </Link>
      </div>
    </div>
  );
}
