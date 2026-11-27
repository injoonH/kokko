import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ErrorBox, Loading } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { requirePlayer, useArenaQuery } from "@/lib/arena";
import type { Match, Profile } from "@/lib/types";
export const Route = createFileRoute("/_member/withdrawn")({
  beforeLoad: requirePlayer,
  component: Withdrawn,
});
function Withdrawn() {
  const [page, setPage] = useState(0);
  const { data, error, refresh } = useArenaQuery<{
    matches: Match[];
    profiles: Profile[];
    hasMore: boolean;
  }>(`/arena/deleted?page=${page}`);
  if (error) return <ErrorBox message={error} retry={refresh} />;
  if (!data) return <Loading />;
  const names = (ids: string[]) =>
    ids
      .map((id) => data.profiles.find((p) => p.id === id)?.nickname || "회원")
      .join(" · ");
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="page-title">제외된 경기</h1>
      <p className="muted">
        참여했던 경기의 기록을 복구할 수 있어요. 관리자가 제외한 경기는 먼저
        재검토를 요청해 주세요.
      </p>
      <section className="panel divide-y">
        {!data.matches.length && (
          <p className="muted py-8">제외된 경기가 없어요.</p>
        )}
        {data.matches.map((m) => (
          <Link
            key={m.id}
            to="/games/$matchId"
            params={{ matchId: m.id }}
            className="block py-5"
          >
            <span className="muted">
              {m.date} · {m.kind === "doubles" ? "복식" : "단식"}
            </span>
            <p className="my-2 font-bold">
              {m.scoreA} : {m.scoreB}
            </p>
            <p className="text-sm">
              {names(m.a)} vs {names(m.b)}
            </p>
          </Link>
        ))}
      </section>
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          disabled={!page}
          onClick={() => setPage((p) => p - 1)}
        >
          이전
        </Button>
        <span className="muted">{page + 1}페이지</span>
        <Button
          variant="outline"
          disabled={!data.hasMore}
          onClick={() => setPage((p) => p + 1)}
        >
          다음
        </Button>
      </div>
    </div>
  );
}
