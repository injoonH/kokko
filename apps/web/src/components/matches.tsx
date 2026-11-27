import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Flag, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { api, mutate } from "@/lib/api";
import { gameLP } from "@/lib/ranks";
import type { Match, Mutation, State } from "@/lib/types";
import { fromSide, parseFilters } from "@/lib/types";
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
      <div className="py-5 text-center">
        <p className="font-semibold">아직 기록된 경기가 없어요</p>
      </div>
    );
  return (
    <>
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="h-8 text-xs text-muted-foreground">
              경기
            </TableHead>
            <TableHead className="h-8 w-16 text-center text-xs text-muted-foreground sm:w-20">
              점수
            </TableHead>
            <TableHead className="h-8 w-16 text-right text-xs text-muted-foreground sm:w-20">
              Elo · LP
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((m) => {
            const r = state.ratings.find(
              (r) => r.matchId === m.id && r.playerId === player,
            );
            const lp = state.rankedGames?.find(
              (r) => r.matchId === m.id && r.playerId === player,
            );
            const side = fromSide(m, player);
            const teamA = names(side.mine);
            const teamB = names(side.theirs);
            const won = side.played ? side.myScore > side.theirScore : null;
            return (
              <TableRow key={m.id}>
                <TableCell className="p-0">
                  <button
                    type="button"
                    className="@container grid min-h-14 w-full content-center gap-0.5 px-2 py-1.5 text-left leading-tight focus-visible:-outline-offset-2"
                    aria-label={`${m.date} ${m.order}번째 경기 상세`}
                    aria-description={`${won === null ? "" : won ? "승리 · " : "패배 · "}${teamA} 대 ${teamB}`}
                    title={`${teamA} vs ${teamB}`}
                    onClick={() => setSelected(m)}
                  >
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {won !== null && (
                        <span
                          aria-hidden="true"
                          className={`inline-grid size-5 shrink-0 place-items-center rounded-sm text-[11px] font-bold ${won ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                        >
                          {won ? "승" : "패"}
                        </span>
                      )}
                      {m.date.slice(5).replace("-", ".")} ·{" "}
                      {m.kind === "doubles" ? "복식" : "단식"}
                    </span>
                    <span className="grid min-w-0 gap-0.5 text-sm @min-[10rem]:flex @min-[10rem]:gap-1.5">
                      <span className="min-w-0 truncate font-medium">
                        {teamA}
                      </span>
                      <span className="flex min-w-0 gap-1">
                        <span className="shrink-0 text-muted-foreground">
                          vs
                        </span>
                        <span className="min-w-0 truncate">{teamB}</span>
                      </span>
                    </span>
                  </button>
                </TableCell>
                <TableCell className="px-0 text-center text-base font-semibold">
                  {side.myScore}
                  <span className="mx-0.5 font-normal text-muted-foreground">
                    :
                  </span>
                  {side.theirScore}
                </TableCell>
                <TableCell className="text-right leading-tight">
                  {r ? (
                    <span className="text-xs">
                      <Delta value={r.delta} />
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      반영됨
                    </span>
                  )}
                  {lp && (
                    <span className="mt-0.5 block text-xs font-medium whitespace-nowrap">
                      {gameLP(lp)}
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
  const side = fromSide(match, state.me.id);
  const participant = side.played;
  function open(value: typeof action) {
    setAction(value);
    setReason("");
    setError("");
    setRequest(null);
  }
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-lg bg-muted p-3">
        <p className="wrap-anywhere text-sm">{names(side.mine)}</p>
        <p className="text-2xl font-bold whitespace-nowrap">
          {side.myScore} : {side.theirScore}
        </p>
        <p className="text-right wrap-anywhere text-sm">{names(side.theirs)}</p>
      </div>
      <ul className="space-y-3">
        {[...side.mine, ...side.theirs].map((id) => {
          const p = state.profiles.find((p) => p.id === id);
          const r = state.ratings.find(
            (r) => r.matchId === match.id && r.playerId === id,
          );
          const lp = state.rankedGames?.find(
            (entry) => entry.matchId === match.id && entry.playerId === id,
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
                  {lp && (
                    <span className="mt-1 block text-right text-xs font-medium text-muted-foreground">
                      시즌 {lp.season} · {gameLP(lp)}
                    </span>
                  )}
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
        <p role="status" className="rounded-lg border p-3 text-sm">
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
            {match.deleted ? "경기 복구" : "경기 삭제"}
          </Button>
        </div>
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
                    ? "이 경기를 복구할까요?"
                    : "이 경기를 삭제할까요?"}
            </DialogTitle>
            <DialogDescription>
              {action === "report"
                ? "사유를 남기면 관리자가 확인해요. 신고만으로 Elo가 바뀌지는 않아요."
                : action === "void"
                  ? "이 경기를 즉시 통계에서 제외하고 이후 Elo를 다시 계산해요. 조치 사유가 기록됩니다."
                  : action === "restore"
                    ? "경기를 기록에 되돌리고 Elo와 시즌 랭크를 다시 계산해요."
                    : "경기를 통계에서 제외하고 Elo와 시즌 랭크를 다시 계산해요. 설정에서 복구할 수 있어요."}
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
                        : action === "restore"
                          ? "경기를 복구했어요."
                          : "경기를 삭제했어요.",
                  );
                  setAction(null);
                  if (action !== "report") refresh();
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
                    : action === "restore"
                      ? "복구하기"
                      : "삭제하기"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
