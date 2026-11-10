import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { RankCrest, TierGuide } from "@/components/rank";
import {
  Avatar,
  ErrorBox,
  FiltersBar,
  Loading,
  useStateData,
} from "@/components/shared";
import { playerTier } from "@/lib/ranks";
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
    if ((a.status === "active") !== (b.status === "active"))
      return a.status === "active" ? -1 : 1;
    const rank = (id: string) =>
      state.rankings.find((r) => r.kind === filters.kind && r.playerId === id)
        ?.rank || 999;
    return rank(a.id) - rank(b.id);
  });
  return (
    <>
      <p className="eyebrow mb-3">함께라서 더 즐거운</p>
      <h1 className="page-title mb-3">우리 모임 선수들</h1>
      <p className="muted mb-8">
        우리의 순위와 문장, 다음 티어까지 함께 올라가요.
      </p>
      <FiltersBar
        filters={filters}
        profiles={state.profiles}
        onChange={(f) => navigate({ search: f })}
      />
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-semibold">
          현재 {filters.kind === "doubles" ? "복식" : "단식"} 순위
        </h2>
        <TierGuide />
      </div>
      <ol
        aria-label={`${filters.kind === "doubles" ? "복식" : "단식"} 선수 순위`}
        className="grid gap-3 sm:grid-cols-2"
      >
        {sorted.map((p) => {
          const r = state.rankings.find(
            (r) => r.playerId === p.id && r.kind === filters.kind,
          );
          const tier = playerTier(r?.rating ?? 1000, r?.games ?? 0);
          return (
            <li key={p.id}>
              <Link
                to="/players/$playerId"
                params={{ playerId: p.id }}
                search={{ ...filters, player: p.id }}
                className="panel flex h-full items-center gap-3 transition-shadow hover:shadow-sm"
              >
                <span className="w-5 shrink-0 text-lg font-semibold text-muted-foreground">
                  {p.status === "active" && r?.rank ? (
                    <>
                      <span className="sr-only">{"모임 "}</span>
                      {r.rank}
                      <span className="sr-only">위</span>
                    </>
                  ) : (
                    <>
                      <span aria-hidden="true">—</span>
                      <span className="sr-only">순위 미집계</span>
                    </>
                  )}
                </span>
                {tier ? (
                  <div className="relative size-16 shrink-0">
                    <RankCrest tier={tier.tier} />
                    <span className="absolute -right-1 bottom-0 rounded-full bg-white ring-2 ring-white">
                      <Avatar profile={p} size="small" />
                    </span>
                  </div>
                ) : (
                  <Avatar profile={p} />
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-bold">
                    {p.nickname}
                    {p.id === state.me.id && (
                      <span className="ml-2 text-xs font-normal">나</span>
                    )}
                  </h2>
                  <p className="mt-1 text-xs font-semibold">
                    {tier?.tier.name ?? "미배정"}
                  </p>
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
                    {Math.round(r?.rating ?? 1000).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">Elo</p>
                </div>
                <ArrowUpRight size={16} />
              </Link>
            </li>
          );
        })}
      </ol>
      <p className="muted mt-5">
        순위는 현재 누적 Elo 기준입니다. 경기 전인 선수는 순위에서 제외됩니다.
      </p>
    </>
  );
}
