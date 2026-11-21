import { createFileRoute } from "@tanstack/react-router";
import { PlayerSearch } from "@/components/player-search";
import { parseFilters } from "@/lib/types";
export const Route = createFileRoute("/_member/players")({
  validateSearch: parseFilters,
  component: Players,
});
function Players() {
  return (
    <div className="mx-auto max-w-2xl">
      <p className="eyebrow mb-3">새로운 상대, 새로운 한 게임</p>
      <h1 className="page-title mb-4">선수 찾기</h1>
      <p className="muted mb-8">
        닉네임이나 선수코드로 찾아보세요. 같은 닉네임이어도 코드는 서로 달라요.
      </p>
      <div className="panel">
        <PlayerSearch />
      </div>
    </div>
  );
}
