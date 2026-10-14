import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ErrorBox, Loading, useStateData } from "@/components/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api, me, mutate } from "@/lib/api";
import { type Invite, type Match, parseFilters } from "@/lib/types";
export const Route = createFileRoute("/_member/admin")({
  beforeLoad: async () => {
    const u = await me();
    if (u?.role !== "admin" || u.status !== "active")
      throw redirect({ to: "/", search: parseFilters({}) });
  },
  component: Admin,
});
function Admin() {
  const { state, error, refresh } = useStateData(parseFilters({}));
  const [invites, setInvites] = useState<Invite[]>([]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [restore, setRestore] = useState<Match | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    api<Invite[]>("/invitations")
      .then(setInvites)
      .catch((e) => setProblem(e.message));
  }, []);
  async function reload() {
    setInvites(await api<Invite[]>("/invitations"));
    refresh();
  }
  if (error) return <ErrorBox message={error} retry={refresh} />;
  if (!state) return <Loading />;
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <p className="eyebrow">관리자 전용</p>
      <h1 className="page-title">모임 관리</h1>
      {problem && (
        <p role="alert" className="rounded-xl border p-4">
          {problem}
        </p>
      )}
      <section className="panel">
        <h2 className="text-xl font-bold">친구 초대하기</h2>
        <p className="muted my-3">
          한 명만 사용할 수 있고, 7일 후 만료됩니다. 코드는 발급 직후에만
          보여요.
        </p>
        <Button
          disabled={busy}
          className="h-12"
          onClick={async () => {
            setBusy(true);
            setProblem("");
            try {
              const v = await api<{ code: string }>("/invitations", "POST", {});
              setCode(v.code);
              setCopied(false);
              await reload();
            } catch (e) {
              setProblem((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          초대 코드 만들기
        </Button>
        {code && (
          <div className="mt-4 rounded-xl bg-muted p-4">
            <label htmlFor="new-code" className="text-xs">
              새 초대 코드 · 지금 복사해 주세요
            </label>
            <input
              id="new-code"
              readOnly
              value={code}
              className="field mt-2 font-mono text-sm"
            />
            <Button
              variant="outline"
              className="mt-3 h-11"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(code);
                  setCopied(true);
                } catch {
                  setProblem("코드를 직접 선택해 복사해 주세요.");
                }
              }}
            >
              {copied ? "복사했어요" : "코드 복사"}
            </Button>
          </div>
        )}
        <ul className="mt-6 divide-y">
          {invites.map((i) => (
            <li
              key={i.id}
              className="flex items-center justify-between py-4 text-sm"
            >
              <div>
                <p>
                  {i.redeemedBy
                    ? "사용 완료"
                    : i.disabled
                      ? "중지됨"
                      : Date.parse(i.expires) <= Date.now()
                        ? "만료됨"
                        : "사용 가능"}
                </p>
                <p className="muted mt-1">
                  만료 {new Date(i.expires).toLocaleDateString("ko-KR")}
                </p>
                {i.redeemedBy && (
                  <p className="text-xs">
                    참여:{" "}
                    {state.profiles.find((p) => p.id === i.redeemedBy)
                      ?.nickname || "회원"}
                  </p>
                )}
              </div>
              {!i.disabled && !i.redeemedBy && (
                <Button
                  variant="outline"
                  disabled={busy}
                  className="h-11"
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await api(`/invitations/${i.id}`, "DELETE");
                      await reload();
                    } catch (e) {
                      setProblem((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  사용 중지
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section className="panel">
        <h2 className="text-xl font-bold">삭제된 경기</h2>
        <p className="muted my-3">복구하면 Elo와 통계를 다시 계산합니다.</p>
        {state.deleted.length === 0 ? (
          <p className="muted py-3">삭제된 경기가 없어요.</p>
        ) : (
          state.deleted.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between border-t py-4 text-sm"
            >
              <div>
                <p>
                  {m.date} · {m.kind === "doubles" ? "복식" : "단식"} ·{" "}
                  {m.scoreA}:{m.scoreB}
                </p>
                <p className="muted">
                  {[...m.a, ...m.b]
                    .map(
                      (id) => state.profiles.find((p) => p.id === id)?.nickname,
                    )
                    .join(" · ")}
                </p>
              </div>
              <Button
                variant="outline"
                className="h-11"
                onClick={() => setRestore(m)}
              >
                복구
              </Button>
            </div>
          ))
        )}
      </section>
      <Dialog
        open={!!restore}
        onOpenChange={(v) => {
          if (!v) setRestore(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>경기를 복구할까요?</DialogTitle>
            <DialogDescription>
              해당 날짜의 마지막에 복구하고 이후 Elo를 다시 계산합니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setRestore(null)}
            >
              취소
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                if (!restore) return;
                setBusy(true);
                try {
                  await mutate({
                    requestId: crypto.randomUUID(),
                    action: "restore",
                    id: restore.id,
                    version: restore.version,
                    dayVersions: state.days,
                  });
                  setRestore(null);
                  refresh();
                } catch (e) {
                  setProblem((e as Error).message);
                  setRestore(null);
                  refresh();
                } finally {
                  setBusy(false);
                }
              }}
            >
              복구하기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
