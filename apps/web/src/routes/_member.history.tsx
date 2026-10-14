import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { MatchList } from "@/components/matches";
import {
  ErrorBox,
  FiltersBar,
  Loading,
  useStateData,
} from "@/components/shared";
import { parseFilters } from "@/lib/types";
export const Route = createFileRoute("/_member/history")({
  validateSearch: (raw) =>
    parseFilters({ ...raw, player: raw.player || "all" }),
  component: History,
});
function History() {
  const filters = Route.useSearch();
  const navigate = Route.useNavigate();
  const { state, error, loading, refresh } = useStateData(filters);
  const [day, setDay] = useState("");
  if (error) return <ErrorBox message={error} retry={refresh} />;
  if (!state) return <Loading />;
  const daily = state.allMatches.filter((m) => m.date === day);
  const names = (ps: string[]) =>
    ps.map((p) => state.profiles.find((x) => x.id === p)?.nickname).join(" · ");
  return (
    <>
      <p className="eyebrow mb-3">코트 위의 순간들</p>
      <h1 className="page-title mb-3">경기 기록</h1>
      <p className="muted mb-8">승리도 아쉬움도, 함께 쌓아 가는 우리의 기록.</p>
      <FiltersBar
        filters={filters}
        profiles={state.profiles}
        players
        results
        onChange={(f) => navigate({ search: f })}
      />
      <section className="panel">
        {loading ? <Loading /> : <MatchList state={state} refresh={refresh} />}
      </section>
      <section className="panel mt-6">
        <h2 className="mb-2 text-lg font-bold">당일 경기 순서</h2>
        <p className="muted mb-4">
          단식과 복식을 함께 보여드려요. 경기 상세의 수정 화면에서 본인 기록의
          순서를 바꿀 수 있어요.
        </p>
        <label className="text-sm" htmlFor="day">
          확인할 날짜
        </label>
        <input
          id="day"
          type="date"
          className="field mt-2 max-w-56"
          max={state.today}
          value={day}
          onChange={(e) => setDay(e.target.value)}
        />
        {day && (
          <ol className="mt-5 divide-y">
            {daily.map((m) => (
              <li key={m.id} className="flex gap-3 py-4 text-sm">
                <span className="font-bold">{m.order}</span>
                <div>
                  <p>
                    {names(m.a)}{" "}
                    <span className="text-muted-foreground">vs</span>{" "}
                    {names(m.b)}
                  </p>
                  <p className="muted mt-1">
                    {m.kind === "doubles" ? "복식" : "단식"} · {m.scoreA}:
                    {m.scoreB}
                  </p>
                </div>
              </li>
            ))}
            {daily.length === 0 && (
              <li className="muted py-3">이 날짜에는 경기가 없어요.</li>
            )}
          </ol>
        )}
      </section>
    </>
  );
}
