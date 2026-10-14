import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { api, mutate } from "@/lib/api";
import type { Match, State } from "@/lib/types";
import { Delta, Empty } from "./shared";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
export function MatchList({
  state,
  refresh,
  limit,
}: {
  state: State;
  refresh: () => void;
  limit?: number;
}) {
  const [selected, setSelected] = useState<Match | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [audit, setAudit] = useState<
    | {
        actor: string;
        action: string;
        created: string;
        before: string;
        after: string;
      }[]
    | null
  >(null);
  const names = (ids: string[]) =>
    ids
      .map((id) => state.profiles.find((p) => p.id === id)?.nickname || "회원")
      .join(" · ");
  const player =
    state.filters.player === "all"
      ? state.me.id
      : state.filters.player || state.me.id;
  const rows = limit ? state.matches.slice(0, limit) : state.matches;
  const canEdit =
    selected && (selected.author === state.me.id || state.me.role === "admin");
  const rating = (m: Match) =>
    state.ratings.find((r) => r.matchId === m.id && r.playerId === player);
  if (!rows.length) return <Empty />;
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>경기</TableHead>
            <TableHead className="hidden sm:table-cell">대진</TableHead>
            <TableHead className="text-center">점수</TableHead>
            <TableHead className="text-right">결과 / Elo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((m) => {
            const r = rating(m);
            const win = m.a.includes(player) === m.scoreA > m.scoreB;
            return (
              <TableRow key={m.id}>
                <TableCell>
                  <button
                    type="button"
                    className="py-3 text-left"
                    aria-label={`${m.date} ${m.order}번째 경기 상세`}
                    onClick={() => {
                      setSelected(m);
                      setAudit(null);
                      setError("");
                    }}
                  >
                    <span className="text-xs text-muted-foreground">
                      {m.date.slice(5).replace("-", ".")} · {m.order}번째
                    </span>
                    <span className="mt-1 flex items-center gap-1 text-sm font-medium sm:hidden">
                      {names(m.a)}
                      <br />
                      vs {names(m.b)}
                    </span>
                    <span className="hidden items-center gap-1 text-sm font-medium sm:flex">
                      {m.kind === "doubles" ? "복식" : "단식"}
                      <ArrowUpRight size={13} />
                    </span>
                  </button>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <span className="font-medium">{names(m.a)}</span>
                  <span className="mx-3 text-xs text-muted-foreground">vs</span>
                  {names(m.b)}
                </TableCell>
                <TableCell className="text-center text-lg font-semibold whitespace-nowrap">
                  {m.scoreA}
                  <span className="mx-2 text-muted-foreground font-normal">
                    :
                  </span>
                  {m.scoreB}
                </TableCell>
                <TableCell className="text-right">
                  {r ? (
                    <div className="flex flex-col items-end gap-1">
                      <span
                        className={`rounded px-2 py-0.5 text-xs ${win ? "bg-primary text-white" : "bg-muted"}`}
                      >
                        {win ? "승리" : "패배"}
                      </span>
                      <span className="text-xs">
                        <Delta value={r.delta} />
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      미참가
                    </span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <Sheet
        open={!!selected}
        onOpenChange={(v) => {
          if (!v) setSelected(null);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>경기 상세</SheetTitle>
            <SheetDescription>
              {selected?.date} · {selected?.order}번째 경기
            </SheetDescription>
          </SheetHeader>
          {selected && (
            <div className="space-y-6 px-5 pb-8">
              <div className="rounded-2xl bg-muted p-6 text-center">
                <p className="text-sm">{names(selected.a)}</p>
                <p className="my-4 text-4xl font-bold">
                  {selected.scoreA} : {selected.scoreB}
                </p>
                <p className="text-sm">{names(selected.b)}</p>
              </div>
              <div className="space-y-3">
                {state.ratings
                  .filter((r) => r.matchId === selected.id)
                  .map((r) => (
                    <div
                      key={r.playerId}
                      className="flex justify-between text-sm"
                    >
                      <span>{names([r.playerId])}</span>
                      <span>
                        {Math.round(r.before)} → {Math.round(r.after)}{" "}
                        <Delta value={r.delta} />
                      </span>
                    </div>
                  ))}
              </div>
              <p className="muted">기록한 사람: {names([selected.author])}</p>
              {canEdit && (
                <>
                  <div className="flex gap-2">
                    <Button asChild variant="outline" className="h-11 flex-1">
                      <Link
                        to="/matches/$matchId"
                        params={{ matchId: selected.id }}
                      >
                        <Pencil />
                        수정·순서 변경
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      className="h-11"
                      onClick={() => setConfirm(true)}
                    >
                      <Trash2 />
                      삭제
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      try {
                        setAudit(
                          await api(`/matches/${selected.id}/revisions`),
                        );
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    변경 이력 보기
                  </Button>
                  {audit?.map((a) => (
                    <details
                      key={`${a.created}-${a.action}`}
                      className="rounded-xl border p-3 text-xs"
                    >
                      <summary>
                        {new Date(a.created).toLocaleString("ko-KR")} ·{" "}
                        {
                          (
                            {
                              create: "등록",
                              edit: "수정",
                              move: "이동",
                              delete: "삭제",
                              restore: "복구",
                            } as Record<string, string>
                          )[a.action]
                        }{" "}
                        · {names([a.actor])}
                      </summary>
                      <p className="mt-2 break-all">
                        변경 전: {auditSummary(a.before, names)}
                      </p>
                      <p className="mt-2 break-all">
                        변경 후: {auditSummary(a.after, names)}
                      </p>
                    </details>
                  ))}
                </>
              )}
              {error && (
                <p role="alert" className="text-sm">
                  {error}
                </p>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>이 경기를 삭제할까요?</DialogTitle>
            <DialogDescription>
              경기가 통계에서 제외되고 이후 Elo가 다시 계산됩니다. 관리자가
              복구할 수 있습니다.
            </DialogDescription>
          </DialogHeader>
          {error && <p role="alert">{error}</p>}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirm(false)}
              disabled={busy}
            >
              취소
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                if (!selected) return;
                setBusy(true);
                try {
                  await mutate({
                    requestId: crypto.randomUUID(),
                    action: "delete",
                    id: selected.id,
                    version: selected.version,
                    dayVersions: state.days,
                  });
                  setConfirm(false);
                  setSelected(null);
                  refresh();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "삭제 중…" : "삭제하기"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
function auditSummary(raw: string, names: (ids: string[]) => string) {
  try {
    const m = JSON.parse(raw) as Match;
    if (!m.id) return "없음";
    return `${m.date} ${m.order}번째 · ${names(m.a)} ${m.scoreA}:${m.scoreB} ${names(m.b)}${m.deleted ? " · 삭제됨" : ""}`;
  } catch {
    return "이력을 읽을 수 없습니다.";
  }
}
