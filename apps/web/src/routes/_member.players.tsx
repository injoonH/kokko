import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import {
  Avatar,
  ErrorBox,
  FiltersBar,
  Loading,
  useStateData,
} from "@/components/shared";
import { parseFilters } from "@/lib/types";
export const Route = createFileRoute("/_member/players")({
  validateSearch: parseFilters,
  component: Players,
});
function Players() {
  const filters = Route.useSearch();
  const navigate = Route.useNavigate();
  const { state, error, refresh } = useStateData(filters);
  if (error) return <ErrorBox message={error} retry={refresh} />;
  if (!state) return <Loading />;
  const sorted = [...state.profiles].sort((a, b) => {
    const rank = (id: string) =>
      state.rankings.find((r) => r.kind === filters.kind && r.playerId === id)
        ?.rank || 999;
    return rank(a.id) - rank(b.id);
  });
  return (
    <>
      <p className="eyebrow mb-3">함께라서 더 즐거운</p>
      <h1 className="page-title mb-3">우리 모임 선수들</h1>
      <p className="muted mb-8">현재 Elo 순위와 파트너별 기록을 살펴보세요.</p>
      <FiltersBar
        filters={filters}
        profiles={state.profiles}
        onChange={(f) => navigate({ search: f })}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {sorted.map((p) => {
          const r = state.rankings.find(
            (r) => r.playerId === p.id && r.kind === filters.kind,
          );
          return (
            <Link
              key={p.id}
              to="/players/$playerId"
              params={{ playerId: p.id }}
              search={{ ...filters, player: p.id }}
              className="panel flex items-center gap-4 transition-shadow hover:shadow-sm"
            >
              <span className="w-5 text-lg font-semibold text-muted-foreground">
                {p.status === "active" && r?.rank ? r.rank : "—"}
              </span>
              <Avatar profile={p} />
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-bold">
                  {p.nickname}
                  {p.id === state.me.id && (
                    <span className="ml-2 text-xs font-normal">나</span>
                  )}
                </h2>
                <p className="muted mt-1">
                  {p.status !== "active"
                    ? "이용 중지"
                    : r
                      ? `${r.games}경기`
                      : "아직 경기 전"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xl font-semibold">
                  {Math.round(r?.rating || 1000).toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">Elo</p>
              </div>
              <ArrowUpRight size={16} />
            </Link>
          );
        })}
      </div>
      <p className="muted mt-5">
        순위는 현재 누적 Elo 기준입니다. 경기 전인 선수는 순위에서 제외됩니다.
      </p>
    </>
  );
}
