import { createFileRoute, Link } from "@tanstack/react-router";
import { Standings } from "@/components/standings";
import { Button } from "@/components/ui/button";
import type { Kind } from "@/lib/types";
import { Route as MemberRoute } from "./_member";

export const Route = createFileRoute("/_member/leaderboard")({
  validateSearch: (search: Record<string, unknown>): { kind: Kind } => ({
    kind: search.kind === "singles" ? "singles" : "doubles",
  }),
  component: Leaderboard,
});

function Leaderboard() {
  const { user } = MemberRoute.useRouteContext();
  const { kind } = Route.useSearch();
  return (
    <div className="space-y-5">
      <h1 className="page-title">전체 순위</h1>
      <nav aria-label="순위 종목" className="flex gap-2">
        {(["doubles", "singles"] as const).map((k) => (
          <Button
            key={k}
            asChild
            variant={k === kind ? "default" : "outline"}
            className="h-11 min-w-20"
          >
            <Link
              to="/leaderboard"
              search={{ kind: k }}
              aria-current={k === kind ? "page" : undefined}
            >
              {k === "doubles" ? "복식" : "단식"}
            </Link>
          </Button>
        ))}
      </nav>
      <Standings key={kind} kind={kind} signedIn={Boolean(user)} />
    </div>
  );
}
