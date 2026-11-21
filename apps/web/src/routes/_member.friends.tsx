import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { FriendActions } from "@/components/friend-actions";
import { PlayerSearch } from "@/components/player-search";
import { Avatar, ErrorBox, Loading } from "@/components/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { requirePlayer, useArenaQuery } from "@/lib/arena";
import type { Profile, Social } from "@/lib/types";
import { parseFilters } from "@/lib/types";
export const Route = createFileRoute("/_member/friends")({
  beforeLoad: requirePlayer,
  component: Friends,
});
function Friends() {
  const { user } = Route.useRouteContext();
  const [page, setPage] = useState(0);
  const { data, error, refresh } = useArenaQuery<Social>(
    `/arena/social?page=${page}`,
    true,
  );
  const [picked, setPicked] = useState<Profile | null>(null);
  if (error) return <ErrorBox message={error} retry={refresh} />;
  if (!data) return <Loading />;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="eyebrow mb-3">다음 코트에서 또 만나요</p>
        <h1 className="page-title">친구</h1>
        <p className="muted mt-3">
          친구는 경기 입력과 오늘의 코트에서 먼저 보여요.
        </p>
      </div>
      {!!data.incoming.length && (
        <section className="panel">
          <h2 className="mb-4 text-xl font-bold">
            받은 친구 요청 {data.incoming.length}개
          </h2>
          <ul className="divide-y">
            {data.incoming.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <Person p={p} />
                <FriendActions
                  player={p}
                  meId={user.id}
                  social={data}
                  refresh={refresh}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="panel">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold">
            나의 친구 {data.friends.length}명
          </h2>
          <Button asChild variant="outline" className="h-11">
            <Link to="/court">오늘의 코트</Link>
          </Button>
        </div>
        {!data.friends.length && (
          <p className="muted py-5">
            함께 뛰는 선수를 찾아 첫 친구 요청을 보내보세요.
          </p>
        )}
        <ul className="divide-y">
          {data.friends.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 py-4"
            >
              <Person p={p} />
              <Button
                variant="outline"
                className="h-11"
                onClick={() => setPicked(p)}
              >
                친구 관리
              </Button>
            </li>
          ))}
        </ul>
      </section>
      <section className="panel">
        <h2 className="mb-5 text-xl font-bold">친구 찾기</h2>
        <PlayerSearch onSelect={setPicked} />
      </section>
      {!!data.outgoing.length && (
        <section className="panel">
          <h2 className="mb-4 text-lg font-bold">보낸 요청</h2>
          <ul className="divide-y">
            {data.outgoing.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <Person p={p} />
                <FriendActions
                  player={p}
                  meId={user.id}
                  social={data}
                  refresh={refresh}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
      {!!data.blocked.length && (
        <details className="panel">
          <summary className="min-h-11 cursor-pointer font-medium">
            차단한 선수
          </summary>
          <ul className="divide-y">
            {data.blocked.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <Person p={p} />
                <FriendActions
                  player={p}
                  meId={user.id}
                  social={data}
                  refresh={refresh}
                />
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          className="h-11"
          disabled={!page}
          onClick={() => setPage((p) => p - 1)}
        >
          이전
        </Button>
        <span className="muted">{page + 1}페이지</span>
        <Button
          variant="outline"
          className="h-11"
          disabled={!data.hasMore}
          onClick={() => setPage((p) => p + 1)}
        >
          다음
        </Button>
      </div>
      <Dialog
        open={!!picked}
        onOpenChange={(open) => {
          if (!open) setPicked(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>친구 관리</DialogTitle>
          </DialogHeader>
          {picked && (
            <>
              <Person p={picked} />
              <PickedActions
                key={picked.id}
                player={picked}
                meId={user.id}
                refresh={refresh}
              />
              <Link
                to="/players/$playerId"
                search={parseFilters({})}
                params={{ playerId: picked.id }}
                className="inline-flex min-h-11 items-center text-sm underline"
              >
                선수 프로필 보기
              </Link>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
function Person({ p }: { p: Profile }) {
  return (
    <Link
      to="/players/$playerId"
      search={parseFilters({})}
      params={{ playerId: p.id }}
      className="flex min-h-11 min-w-0 items-center gap-3"
    >
      <Avatar profile={p} size="small" />
      <span className="min-w-0">
        <span className="block truncate font-semibold">{p.nickname}</span>
        <span className="muted mt-1 block">#{p.handle}</span>
      </span>
    </Link>
  );
}

function PickedActions({
  player,
  meId,
  refresh,
}: {
  player: Profile;
  meId: string;
  refresh: () => void;
}) {
  const q = useArenaQuery<Social>(`/arena/social?target=${player.id}`, true);
  if (q.error) return <ErrorBox message={q.error} retry={q.refresh} />;
  if (!q.data) return <Loading />;
  return (
    <FriendActions
      player={player}
      meId={meId}
      social={q.data}
      refresh={() => {
        q.refresh();
        refresh();
      }}
    />
  );
}
