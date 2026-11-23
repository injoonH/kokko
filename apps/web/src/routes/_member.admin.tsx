import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { MemberNicknameDialog } from "@/components/member-nickname";
import { Avatar, ErrorBox, Loading } from "@/components/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { requirePlayer, useArenaQuery } from "@/lib/arena";
import { type Profile, parseFilters } from "@/lib/types";
export const Route = createFileRoute("/_member/admin")({
  beforeLoad: async () => {
    const ctx = await requirePlayer();
    if (ctx.user.role !== "admin")
      throw redirect({ to: "/", search: parseFilters({}) });
    return ctx;
  },
  component: Admin,
});
type Report = {
  id: string;
  matchId: string;
  actor: string;
  reason: string;
  created: string;
};
type Voided = { matchId: string; reason: string; version: number };
function Admin() {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [reportPage, setReportPage] = useState(0);
  const users = useArenaQuery<{ players: Profile[]; hasMore: boolean }>(
    `/arena/admin/players?${new URLSearchParams({ q: query, page: String(page) })}`,
  );
  const moderation = useArenaQuery<{
    reports: Report[];
    voids: Voided[];
    hasMore: boolean;
  }>(`/arena/reports?page=${reportPage}`);
  const [renaming, setRenaming] = useState<Profile | null>(null);
  const [review, setReview] = useState<{
    type: "dismiss" | "reopen";
    id: string;
    version?: number;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  if (users.error || moderation.error)
    return (
      <ErrorBox
        message={users.error || moderation.error}
        retry={() => {
          users.refresh();
          moderation.refresh();
        }}
      />
    );
  if (!moderation.data) return <Loading />;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="eyebrow mb-3">서비스 관리자</p>
        <h1 className="page-title">서비스 관리</h1>
        <p className="muted mt-3">
          신고와 회원 닉네임을 관리해요. 관리자도 자기 경기의 상대 확인을 대신할
          수 없어요.
        </p>
      </div>
      {notice && (
        <p role="status" className="rounded-lg border p-4 text-sm">
          {notice}
        </p>
      )}
      <section className="panel">
        <h2 className="mb-5 text-xl font-bold">접수된 신고</h2>
        {!moderation.data.reports.length && (
          <p className="muted py-5">검토할 신고가 없어요.</p>
        )}
        <ul className="divide-y">
          {moderation.data.reports.map((r) => (
            <li key={r.id} className="space-y-3 py-4">
              <p className="break-keep text-sm">{r.reason}</p>
              <p className="muted">
                {new Date(r.created).toLocaleString("ko-KR")}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" className="h-11">
                  <Link to="/games/$matchId" params={{ matchId: r.matchId }}>
                    경기 검토·제외
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  className="h-11"
                  onClick={() => {
                    setReason("");
                    setReview({ type: "dismiss", id: r.id });
                  }}
                >
                  문제없음으로 처리
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="panel">
        <h2 className="mb-4 text-lg font-bold">관리자가 제외한 경기</h2>
        <p className="muted mb-3">
          재검토 후 복구 요청을 허용할 수 있어요. 실제 복구에는 상대 확인이 다시
          필요해요.
        </p>
        <ul className="divide-y">
          {moderation.data.voids.map((v) => (
            <li key={v.matchId} className="space-y-3 py-4">
              <p className="text-sm">{v.reason}</p>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" className="h-11">
                  <Link to="/games/$matchId" params={{ matchId: v.matchId }}>
                    제외된 경기 보기
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  className="h-11"
                  onClick={() => {
                    setReason("");
                    setReview({
                      type: "reopen",
                      id: v.matchId,
                      version: v.version,
                    });
                  }}
                >
                  복구 요청 허용
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex justify-between">
          <Button
            variant="outline"
            className="h-11"
            disabled={!reportPage}
            onClick={() => setReportPage((v) => v - 1)}
          >
            이전 신고
          </Button>
          <Button
            variant="outline"
            className="h-11"
            disabled={!moderation.data.hasMore}
            onClick={() => setReportPage((v) => v + 1)}
          >
            다음 신고
          </Button>
        </div>
      </section>
      <section className="panel">
        <h2 className="mb-5 text-xl font-bold">회원 닉네임</h2>
        <label htmlFor="admin-player-search" className="text-sm font-medium">
          회원 검색
        </label>
        <Input
          id="admin-player-search"
          className="my-3 h-12"
          value={query}
          maxLength={80}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
        {!users.data && (
          <p role="status" className="muted py-4">
            회원을 찾는 중…
          </p>
        )}
        <ul className="divide-y">
          {(users.data?.players || []).map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-4">
              <Avatar profile={p} size="small" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{p.nickname}</p>
                <p className="muted mt-1">
                  #{p.handle}
                  {p.status === "suspended" ? " · 활동 중지" : ""}
                </p>
              </div>
              <Button
                variant="outline"
                className="h-11"
                aria-label={`${p.nickname} 닉네임 변경`}
                onClick={() => setRenaming(p)}
              >
                닉네임 변경
              </Button>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex justify-between">
          <Button
            variant="outline"
            className="h-11"
            disabled={!page}
            onClick={() => setPage((v) => v - 1)}
          >
            이전 회원
          </Button>
          <Button
            variant="outline"
            className="h-11"
            disabled={!users.data?.hasMore}
            onClick={() => setPage((v) => v + 1)}
          >
            다음 회원
          </Button>
        </div>
      </section>
      {renaming && (
        <MemberNicknameDialog
          profile={renaming}
          onClose={() => setRenaming(null)}
          onSaved={() => {
            setRenaming(null);
            setNotice("닉네임을 저장했어요.");
            users.refresh();
          }}
        />
      )}
      <Dialog
        open={review !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setReview(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>검토 결과 기록</DialogTitle>
            <DialogDescription>
              처리 사유를 남겨 주세요. 이 동작만으로 경기나 Elo가 바뀌지는
              않아요.
            </DialogDescription>
          </DialogHeader>
          <label htmlFor="review-reason" className="text-sm font-medium">
            검토 사유
          </label>
          <Input
            id="review-reason"
            value={reason}
            maxLength={300}
            onChange={(e) => setReason(e.target.value)}
          />
          {error && (
            <p role="alert" className="text-sm">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              className="h-11"
              disabled={busy}
              onClick={() => setReview(null)}
            >
              취소
            </Button>
            <Button
              className="h-11"
              disabled={busy || reason.trim().length < 3}
              onClick={async () => {
                if (!review) return;
                setBusy(true);
                setError("");
                try {
                  await api(
                    review.type === "dismiss"
                      ? `/arena/reports/${review.id}`
                      : `/arena/matches/${review.id}/reopen`,
                    "POST",
                    {
                      reason,
                      ...(review.type === "reopen"
                        ? { version: review.version }
                        : {}),
                    },
                  );
                  setReview(null);
                  moderation.refresh();
                  setNotice("검토 결과를 저장했어요.");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "처리 중…" : "검토 저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
