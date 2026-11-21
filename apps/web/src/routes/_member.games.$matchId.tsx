import { createFileRoute } from "@tanstack/react-router";
import { MatchDetails } from "@/components/matches";
import { ErrorBox, Loading } from "@/components/shared";
import { useArenaQuery } from "@/lib/arena";
import type { Match, Profile, Rating, State } from "@/lib/types";
import { parseFilters } from "@/lib/types";
import { Route as MemberRoute } from "./_member";
export const Route = createFileRoute("/_member/games/$matchId")({
  component: Game,
});
function Game() {
  const { matchId } = Route.useParams();
  const { user } = MemberRoute.useRouteContext();
  const { data, error, refresh } = useArenaQuery<{
    match: Match;
    profiles: Profile[];
    ratings: Rating[];
    days: Record<string, number>;
  }>(`/arena/matches/${matchId}`);
  if (error) return <ErrorBox message={error} retry={refresh} />;
  if (!data) return <Loading />;
  const state: State = {
    me: {
      id: user?.id || "",
      role: user?.role || "member",
      serviceRole: user?.role || "",
    },
    group: {
      id: "legacy",
      name: "전체 코트",
      visibility: "open",
      role: "member",
    },
    today: data.match.date,
    revision: 0,
    profiles: data.profiles,
    matches: [data.match],
    allMatches: [data.match],
    deleted: [],
    ratings: data.ratings,
    rankings: [],
    days: data.days,
    filters: parseFilters({ player: "all" }),
    stats: {
      games: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      change: 0,
      current: 1000,
      rank: 0,
      points: [],
      partners: [],
      opponents: [],
    },
  };
  return (
    <div className="mx-auto max-w-xl">
      <p className="eyebrow mb-3">함께 남긴 한 게임</p>
      <h1 className="page-title mb-3">경기 상세</h1>
      <p className="muted mb-7">
        {data.match.date} · {data.match.kind === "doubles" ? "복식" : "단식"}
      </p>
      <MatchDetails
        key={data.match.id}
        state={state}
        match={data.match}
        refresh={refresh}
      />
    </div>
  );
}
