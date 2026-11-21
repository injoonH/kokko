import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Flag, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { api, mutate } from "@/lib/api";
import type { Match, Mutation, State } from "@/lib/types";
import { parseFilters } from "@/lib/types";
import { Delta } from "./shared";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
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
  initial = false,
}: {
  state: State;
  refresh: () => void;
  limit?: number;
  initial?: boolean;
}) {
  const [selected, setSelected] = useState<Match | null>(
    initial ? state.matches[0] || null : null,
  );
  const rows = limit ? state.matches.slice(0, limit) : state.matches;
  const names = (ids: string[]) =>
    ids
      .map((id) => state.profiles.find((p) => p.id === id)?.nickname || "회원")
      .join(" · ");
  const player =
    state.filters.player === "all"
      ? state.me.id
      : state.filters.player || state.me.id;
  if (!rows.length)
    return (
      <div className="py-10 text-center">
        <img src="/kokko.svg" alt="" className="mx-auto h-24 w-24" />
        <p className="mt-4 font-semibold">아직 확인된 경기가 없어요</p>
        <p className="muted mt-2">
          상대 팀 한 명이 확인한 경기가 여기에 쌓여요.
        </p>
      </div>
    );
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>경기</TableHead>
            <TableHead className="hidden sm:table-cell">대진</TableHead>
            <TableHead className="text-center">점수</TableHead>
            <TableHead className="text-right">Elo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((m) => {
            const r = state.ratings.find(
              (r) => r.matchId === m.id && r.playerId === player,
            );
            return (
              <TableRow key={m.id}>
                <TableCell>
                  <button
                    type="button"
                    className="min-h-14 py-2 text-left"
                    aria-label={`${m.date} ${m.order}번째 경기 상세`}
                    onClick={() => setSelected(m)}
                  >
                    <span className="text-xs text-muted-foreground">
                      {m.date.slice(5).replace("-", ".")} ·{" "}
                      {m.kind === "doubles" ? "복식" : "단식"}
                    </span>
                    <span className="mt-1 block text-sm font-medium sm:hidden">
                      {names(m.a)}
                      <br />
                      vs {names(m.b)}
                    </span>
                    <span className="hidden items-center gap-1 text-sm font-medium sm:flex">
                      경기 상세
                      <ArrowUpRight size={13} />
                    </span>
                  </button>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <span className="font-medium">{names(m.a)}</span>
                  <span className="mx-3 text-xs text-muted-foreground">vs</span>
                  {names(m.b)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-center text-lg font-semibold">
                  {m.scoreA}
                  <span className="mx-2 font-normal text-muted-foreground">
                    :
                  </span>
                  {m.scoreB}
                </TableCell>
                <TableCell className="text-right">
                  {r ? (
                    <span className="text-xs">
                      <Delta value={r.delta} />
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      반영됨
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
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>경기 상세</SheetTitle>
            <SheetDescription>{selected?.date} · 반영된 경기</SheetDescription>
          </SheetHeader>
          {selected && (
            <div className="px-5 pb-8">
              <Link
                to="/games/$matchId"
                params={{ matchId: selected.id }}
                className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm underline"
              >
                경기 링크 열기
                <ArrowUpRight size={14} />
              </Link>
              <MatchDetails
                key={selected.id}
                state={state}
                match={selected}
                refresh={() => {
                  setSelected(null);
                  refresh();
                }}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
export function MatchDetails({
  state,
  match,
  refresh,
}: {
  state: State;
  match: Match;
  refresh: () => void;
}) {
  const [action, setAction] = useState<
    "delete" | "restore" | "report" | "void" | null
  >(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [request, setRequest] = useState<Mutation | null>(null);
  const names = (ids: string[]) =>
    ids
      .map((id) => state.profiles.find((p) => p.id === id)?.nickname || "회원")
      .join(" · ");
  const participant = [...match.a, ...match.b].includes(state.me.id);
  function open(value: typeof action) {
    setAction(value);
    setReason("");
    setError("");
    setRequest(null);
  }
  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-muted p-6 text-center">
        <p className="text-sm">{names(match.a)}</p>
        <p className="my-4 text-4xl font-bold">
          {match.scoreA} : {match.scoreB}
        </p>
        <p className="text-sm">{names(match.b)}</p>
      </div>
      <ul className="space-y-3">
        {[...match.a, ...match.b].map((id) => {
          const p = state.profiles.find((p) => p.id === id);
          const r = state.ratings.find(
            (r) => r.matchId === match.id && r.playerId === id,
          );
          return (
            <li
              key={id}
              className="flex flex-wrap items-center justify-between gap-2 text-sm"
            >
              <Link
                to="/players/$playerId"
                search={parseFilters({})}
                params={{ playerId: id }}
                className="underline underline-offset-4"
              >
                {p?.nickname || "회원"}
                <span className="ml-1 text-xs text-muted-foreground">
                  #{p?.handle || id.slice(-6)}
                </span>
              </Link>
              {r && (
                <span>
                  {Math.round(r.before)} → {Math.round(r.after)}{" "}
                  <Delta value={r.delta} />
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="muted">
        기록한 사람: {names([match.author])}
        {match.deleted ? " · 통계에서 제외됨" : ""}
      </p>
      {message && (
        <p role="status" className="rounded-xl border p-3 text-sm">
          {message}
        </p>
      )}
      {participant && (
        <div className="flex flex-wrap gap-2">
          {!match.deleted && (
            <Button asChild variant="outline" className="h-11">
              <Link to="/matches/$matchId" params={{ matchId: match.id }}>
                <Pencil />
                수정·순서 변경
              </Link>
            </Button>
          )}
          <Button
            variant="outline"
            className="h-11"
            onClick={() => open(match.deleted ? "restore" : "delete")}
          >
            <Trash2 />
            {match.deleted ? "복구 요청" : "삭제 요청"}
          </Button>
        </div>
      )}
      {participant && (
        <p className="muted">수정·삭제·복구는 상대가 확인한 뒤 반영돼요.</p>
      )}
      {state.me.id && !match.deleted && (
        <Button variant="ghost" className="h-11" onClick={() => open("report")}>
          <Flag size={15} />
          잘못된 경기 신고
        </Button>
      )}
      {state.me.serviceRole === "admin" && !match.deleted && (
        <Button variant="outline" className="h-11" onClick={() => open("void")}>
          관리자: 통계에서 제외
        </Button>
      )}
      <Dialog
        open={action !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setAction(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action === "report"
                ? "경기 신고"
                : action === "void"
                  ? "관리자 조치"
                  : action === "restore"
                    ? "경기 복구를 요청할까요?"
                    : "경기 삭제를 요청할까요?"}
            </DialogTitle>
            <DialogDescription>
              {action === "report"
                ? "사유를 남기면 관리자가 확인해요. 신고만으로 Elo가 바뀌지는 않아요."
                : action === "void"
                  ? "이 경기를 즉시 통계에서 제외하고 이후 Elo를 다시 계산해요. 조치 사유가 기록됩니다."
                  : "상대 팀 한 명의 확인이 필요해요. 확인 전에는 현재 결과와 Elo가 유지돼요."}
            </DialogDescription>
          </DialogHeader>
          {(action === "report" || action === "void") && (
            <div>
              <label htmlFor="match-reason" className="text-sm font-medium">
                사유
              </label>
              <Input
                id="match-reason"
                className="mt-2 h-12"
                value={reason}
                maxLength={300}
                disabled={busy}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          )}
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
              onClick={() => setAction(null)}
            >
              취소
            </Button>
            <Button
              className="h-11"
              disabled={
                busy ||
                ((action === "report" || action === "void") &&
                  reason.trim().length < 3)
              }
              onClick={async () => {
                if (!action) return;
                setBusy(true);
                setError("");
                try {
                  if (action === "report")
                    await api(`/arena/matches/${match.id}/reports`, "POST", {
                      reason,
                    });
                  else if (action === "void")
                    await api(`/arena/matches/${match.id}/void`, "POST", {
                      reason,
                      version: match.version,
                    });
                  else {
                    const q = request || {
                      requestId: crypto.randomUUID(),
                      action,
                      id: match.id,
                      version: match.version,
                    };
                    setRequest(q);
                    await mutate(q);
                  }
                  setMessage(
                    action === "report"
                      ? "신고를 접수했어요."
                      : action === "void"
                        ? "경기를 통계에서 제외했어요."
                        : "상대 확인 요청을 보냈어요. 확인함에서 진행 상황을 볼 수 있어요.",
                  );
                  setAction(null);
                  if (action === "void") refresh();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy
                ? "처리 중…"
                : action === "report"
                  ? "신고하기"
                  : action === "void"
                    ? "통계에서 제외"
                    : "요청 보내기"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
