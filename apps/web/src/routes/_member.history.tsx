import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { MatchList } from "@/components/matches";
import {
  ErrorBox,
  FiltersBar,
  Loading,
  useStateData,
} from "@/components/shared";
import { Button } from "@/components/ui/button";
import { parseFilters } from "@/lib/types";
export const Route = createFileRoute("/_member/history")({
  validateSearch: (raw) =>
    parseFilters({ ...raw, player: raw.player || "all" }),
  component: History,
});
function History() {
  const filters = Route.useSearch();
  const navigate = Route.useNavigate();
  const [page, setPage] = useState(0);
  const { state, error, loading, refresh } = useStateData(filters, page);
  if (error)
    return (
      <ErrorBox
        message={error}
        retry={() => {
          setPage(0);
          refresh();
        }}
      />
    );
  if (!state) return <Loading />;
  return (
    <>
      <p className="eyebrow mb-3">코트 위의 순간들</p>
      <h1 className="page-title mb-3">전체 경기 기록</h1>
      <p className="muted mb-8">
        기존 기록과 상대가 확인한 새 경기를 모두 볼 수 있어요. 확인 대기 중인
        경기는 확인함에 있어요.
      </p>
      <FiltersBar
        filters={filters}
        profiles={state.profiles}
        players
        results
        onChange={(f) => {
          setPage(0);
          void navigate({ search: f });
        }}
      />
      <section className="panel" aria-busy={loading}>
        <MatchList state={state} refresh={refresh} />
        <div className="mt-6 flex items-center justify-between">
          <Button
            variant="outline"
            className="h-11"
            disabled={!page || loading}
            onClick={() => setPage((p) => p - 1)}
          >
            이전
          </Button>
          <span className="muted">{page + 1}페이지</span>
          <Button
            variant="outline"
            className="h-11"
            disabled={!state.hasMore || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            다음
          </Button>
        </div>
      </section>
    </>
  );
}
