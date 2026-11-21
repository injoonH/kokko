import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Clock3, X } from "lucide-react";
import { useState } from "react";
import { ErrorBox, Loading } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { decide } from "@/lib/api";
import { requirePlayer, useArenaQuery } from "@/lib/arena";
import type { Profile, Proposal } from "@/lib/types";
export const Route = createFileRoute("/_member/inbox")({
  beforeLoad: requirePlayer,
  component: Inbox,
});
type InboxData = {
  proposals: Proposal[];
  profiles: Profile[];
  hasMore: boolean;
};
function Inbox() {
  const { user } = Route.useRouteContext();
  const [page, setPage] = useState(0);
  const { data, error, refresh } = useArenaQuery<InboxData>(
    `/arena/inbox?page=${page}`,
    true,
  );
  if (error) return <ErrorBox message={error} retry={refresh} />;
  if (!data) return <Loading />;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="eyebrow mb-3">한 번 더 확인하고, 함께 남겨요</p>
        <h1 className="page-title">경기 확인함</h1>
        <p className="muted mt-3 leading-relaxed">
          상대 팀 한 명이 확인하면 Elo에 반영돼요. 수정·삭제 요청은 확인 전까지
          기존 결과를 유지해요.
        </p>
      </div>
      {!data.proposals.length && (
        <div className="panel py-12 text-center">
          <Clock3 className="mx-auto mb-4 size-8" />
          <p className="font-bold">아직 받은 경기 요청이 없어요</p>
          <p className="muted mt-2">
            경기를 기록하거나 상대의 요청을 기다려 주세요.
          </p>
        </div>
      )}
      {data.proposals.map((p) => (
        <ProposalCard
          key={`${p.id}.${p.status}`}
          proposal={p}
          profiles={data.profiles}
          meId={user.id}
          refresh={refresh}
        />
      ))}
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
    </div>
  );
}
function ProposalCard({
  proposal: p,
  profiles,
  meId,
  refresh,
}: {
  proposal: Proposal;
  profiles: Profile[];
  meId: string;
  refresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const m = p.match;
  const name = (ids: string[]) =>
    ids
      .map((id) => profiles.find((p) => p.id === id)?.nickname || "회원")
      .join(" · ");
  const opposite =
    [...m.a, ...m.b].includes(meId) &&
    m.a.includes(meId) !== m.a.includes(p.actor);
  const status = {
    pending: "상대 확인 대기",
    confirmed: "반영 완료",
    rejected: "상대가 확인하지 않음",
    cancelled: "작성자가 취소함",
    superseded: "관리자 조치로 종료됨",
  }[p.status];
  const action = {
    create: "새 경기",
    edit: "경기 수정",
    move: "순서 변경",
    delete: "경기 삭제",
    restore: "경기 복구",
  }[p.action];
  async function act(decision: "confirm" | "reject" | "cancel") {
    setBusy(true);
    setError("");
    try {
      await decide(p, decision);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article
      data-proposal-id={p.id}
      className={`panel ${p.status === "pending" && opposite ? "border-primary" : ""}`}
      aria-label={`${m.date} ${action}`}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold">
          {action} · {m.kind === "doubles" ? "복식" : "단식"}
        </span>
        <span className="rounded-full bg-muted px-3 py-1 text-xs">
          {status}
        </span>
      </div>
      <p className="muted">
        {m.date} · 요청한 사람 {name([p.actor])}
      </p>
      <p className="muted mt-2">순서: {p.intent || "기존 순서 유지"}</p>
      <div className="my-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl bg-muted p-4">
        <p className="min-w-0 break-words text-sm">{name(m.a)}</p>
        <p className="whitespace-nowrap text-2xl font-bold">
          {m.scoreA} : {m.scoreB}
        </p>
        <p className="min-w-0 break-words text-right text-sm">{name(m.b)}</p>
      </div>
      {p.before && (
        <div className="mb-4 rounded-xl border p-3 text-sm leading-relaxed">
          <p className="font-semibold">현재 반영된 결과</p>
          <p>
            {p.before.date} · {p.before.scoreA} : {p.before.scoreB}
          </p>
          <p className="muted mt-2">
            위의 요청 내용을 확인하면 기존 결과를 바꿔요.{" "}
            {p.action === "delete"
              ? "경기와 Elo 반영을 취소합니다."
              : p.action === "restore"
                ? "경기와 Elo 반영을 복구합니다."
                : "날짜와 점수를 함께 확인해 주세요."}
          </p>
          <Link
            to="/games/$matchId"
            params={{ matchId: p.matchId }}
            className="inline-flex min-h-11 items-center underline"
          >
            기존 경기 상세 보기
          </Link>
        </div>
      )}
      {error && (
        <p role="alert" className="mb-4 rounded-xl border p-3 text-sm">
          {error}
        </p>
      )}
      {p.status === "pending" && opposite && (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="h-12"
            disabled={busy}
            onClick={() => act("reject")}
          >
            <X size={17} />
            아니에요
          </Button>
          <Button
            className="h-12"
            disabled={busy}
            onClick={() => act("confirm")}
          >
            <Check size={17} />
            {busy ? "반영 중…" : "맞아요 · 반영"}
          </Button>
        </div>
      )}
      {p.status === "pending" && p.actor === meId && (
        <Button
          variant="outline"
          className="h-11 w-full"
          disabled={busy}
          onClick={() => act("cancel")}
        >
          요청 취소
        </Button>
      )}
      {p.status === "pending" && !opposite && p.actor !== meId && (
        <p className="muted">
          같은 팀은 확인할 수 없어요. 상대 팀의 확인을 기다려요.
        </p>
      )}
      {p.status === "confirmed" && (
        <Link
          to="/games/$matchId"
          params={{ matchId: p.matchId }}
          className="inline-flex min-h-11 items-center text-sm underline"
        >
          반영된 경기 보기
        </Link>
      )}
    </article>
  );
}
