import { createFileRoute } from "@tanstack/react-router";
import { EntryPage } from "@/components/entry";
export const Route = createFileRoute("/_member/matches/new")({
  component: () => <EntryPage />,
});
