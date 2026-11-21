import { createFileRoute } from "@tanstack/react-router";
import { EntryPage } from "@/components/entry";
import { requirePlayer } from "@/lib/arena";
export const Route = createFileRoute("/_member/matches/$matchId")({
  beforeLoad: requirePlayer,
  component: () => {
    const { matchId } = Route.useParams();
    return <EntryPage matchId={matchId} />;
  },
});
