import { createFileRoute, Link } from "@tanstack/react-router";
import { Standings } from "@/components/standings";
import type { Kind } from "@/lib/types";
import { Route as MemberRoute } from "./_member";

export type LeaderboardView = "ranked" | "elo";

export const Route = createFileRoute("/_member/leaderboard")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { kind: Kind; view?: LeaderboardView } => ({
    kind: search.kind === "singles" ? "singles" : "doubles",
    view: search.view === "elo" ? "elo" : undefined,
  }),
  component: Leaderboard,
});

function Leaderboard() {
  const { user } = MemberRoute.useRouteContext();
  const { kind, view } = Route.useSearch();
  const activeView = view ?? "ranked";
  return (
    <div className="space-y-3">
      <h1 id="global-standings" className="page-title">
        전체 {kind === "doubles" ? "복식" : "단식"} 순위
      </h1>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav aria-label="순위 종목" className="segmented">
          {(["doubles", "singles"] as const).map((k) => (
            <Link
              key={k}
              to="/leaderboard"
              search={{ kind: k, view }}
              aria-current={k === kind ? "page" : undefined}
              className="segment"
            >
              {k === "doubles" ? "복식" : "단식"}
            </Link>
          ))}
        </nav>
        <nav aria-label="순위 기준" className="segmented">
          {([undefined, "elo"] as const).map((mode) => (
            <Link
              key={mode ?? "ranked"}
              to="/leaderboard"
              search={{ kind, view: mode }}
              aria-current={mode === view ? "page" : undefined}
              className="segment"
            >
              {mode === "elo" ? "Elo" : "시즌 랭크"}
            </Link>
          ))}
        </nav>
      </div>
      <Standings
        key={`${kind}:${activeView}`}
        kind={kind}
        view={activeView}
        signedIn={Boolean(user)}
      />
    </div>
  );
}
