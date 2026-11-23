import { createFileRoute, Link } from "@tanstack/react-router";
import { Standings } from "@/components/standings";
import { Button } from "@/components/ui/button";
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
        <nav
          aria-label="순위 종목"
          className="flex gap-1 rounded-lg bg-muted p-0.5"
        >
          {(["doubles", "singles"] as const).map((k) => (
            <Button
              key={k}
              asChild
              variant={k === kind ? "default" : "ghost"}
              className="h-11 px-3"
            >
              <Link
                to="/leaderboard"
                search={{ kind: k, view }}
                activeOptions={{ exact: true }}
              >
                {k === "doubles" ? "복식" : "단식"}
              </Link>
            </Button>
          ))}
        </nav>
        <nav
          aria-label="순위 기준"
          className="flex gap-1 rounded-lg bg-muted p-0.5"
        >
          {([undefined, "elo"] as const).map((mode) => (
            <Button
              key={mode ?? "ranked"}
              asChild
              variant={mode === view ? "default" : "ghost"}
              className="h-11 px-3"
            >
              <Link
                to="/leaderboard"
                search={{ kind, view: mode }}
                activeOptions={{ exact: true }}
              >
                {mode === "elo" ? "Elo" : "시즌 랭크"}
              </Link>
            </Button>
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
