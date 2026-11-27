import { createFileRoute, redirect } from "@tanstack/react-router";
import { parseFilters } from "@/lib/types";

export const Route = createFileRoute("/_member/inbox")({
  beforeLoad: () => {
    throw redirect({ to: "/history", search: parseFilters({ player: "all" }) });
  },
});
