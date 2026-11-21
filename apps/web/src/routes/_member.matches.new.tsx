import { createFileRoute } from "@tanstack/react-router";
import { EntryPage } from "@/components/entry";
import { requirePlayer } from "@/lib/arena";
export const Route = createFileRoute("/_member/matches/new")({
  beforeLoad: requirePlayer,
  component: () => <EntryPage />,
});
