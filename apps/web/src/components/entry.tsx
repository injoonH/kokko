import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowLeftRight, Check, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ApiError, mutate } from "@/lib/api";
import {
  type Kind,
  type Match,
  type Mutation,
  parseFilters,
  type State,
  validScore,
} from "@/lib/types";
import { Avatar, ErrorBox, Loading, useStateData } from "./shared";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";

type Draft = {
  kind: Kind;
  date: string;
  slots: string[];
  scoreA: string;
  scoreB: string;
  position: string;
  request: Mutation | null;
};
export function EntryPage({ matchId }: { matchId?: string }) {
  const { state, error, refresh } = useStateData(
    parseFilters({ period: "all", player: "all" }),
  );
  if (error) return <ErrorBox message={error} retry={refresh} />;
  if (!state) return <Loading />;
  const match = state.allMatches.find((m) => m.id === matchId);
  if (matchId && !match)
    return <ErrorBox message="경기를 찾을 수 없습니다." retry={refresh} />;
  if (match && match.author !== state.me.id && state.me.role !== "admin")
    return <p role="alert">이 경기를 수정할 권한이 없습니다.</p>;
  return (
    <Entry
      key={matchId || "new"}
      state={state}
      original={match}
      refresh={refresh}
    />
  );
}
function Entry({
  state,
  original,
  refresh,
}: {
  state: State;
  original?: Match;
  refresh: () => void;
}) {
  const storageKey = `kokko.draft.${state.me.id}.${original?.id || "new"}`;
  const [d, setD] = useState<Draft>(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        const draft = JSON.parse(saved);
        if (Array.isArray(draft.slots) && draft.slots.length === 4)
          return draft;
      }
    } catch {}
    return {
      kind: original?.kind || "doubles",
      date: original?.date || state.today,
      slots: original
        ? original.kind === "singles"
          ? [original.a[0], "", original.b[0], ""]
          : [...original.a, ...original.b]
        : [state.me.id, "", "", ""],
      scoreA: original ? String(original.scoreA) : "",
      scoreB: original ? String(original.scoreB) : "",
      position: original ? String(original.order) : "0",
      request: null,
    };
  });
  const [slot, setSlot] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const submitLock = useRef(false);
  useEffect(() => {
    if (!saved) sessionStorage.setItem(storageKey, JSON.stringify(d));
  }, [d, storageKey, saved]);
  const patch = (p: Partial<Draft>) => setD((v) => ({ ...v, ...p }));
  const visible = d.kind === "doubles" ? [0, 1, 2, 3] : [0, 2];
  const a = visible.filter((i) => i < 2).map((i) => d.slots[i]);
  const b = visible.filter((i) => i >= 2).map((i) => d.slots[i]);
  const day = state.allMatches.filter(
    (m) => m.date === d.date && m.id !== original?.id,
  );
  const valid =
    a.every(Boolean) &&
    b.every(Boolean) &&
    new Set([...a, ...b]).size === a.length + b.length &&
    d.scoreA !== "" &&
    d.scoreB !== "" &&
    validScore(Number(d.scoreA), Number(d.scoreB));
  const profile = (id: string) => state.profiles.find((p) => p.id === id);
  const similar = state.allMatches.some(
    (m) =>
      m.id !== original?.id &&
      m.date === d.date &&
      m.kind === d.kind &&
      ((m.a.join() === a.join() &&
        m.b.join() === b.join() &&
        m.scoreA === Number(d.scoreA) &&
        m.scoreB === Number(d.scoreB)) ||
        (m.a.join() === b.join() &&
          m.b.join() === a.join() &&
          m.scoreA === Number(d.scoreB) &&
          m.scoreB === Number(d.scoreA))),
  );
  if (saved)
    return (
      <div className="mx-auto max-w-lg py-8 text-center">
        <img
          src="/kokko.svg"
          alt="기록을 마친 꼬꼬"
          className="mx-auto h-36 w-36"
        />
        <h1 className="page-title mt-6">한 게임, 잘 남겼어요!</h1>
        <p className="muted mt-3">경기 기록과 Elo가 함께 업데이트되었어요.</p>
        <div className="mt-8 space-y-3">
          {!original && (
            <Button
              className="h-13 w-full rounded-xl"
              onClick={() => {
                setD((v) => ({
                  ...v,
                  scoreA: "",
                  scoreB: "",
                  position: "0",
                  request: null,
                }));
                setSaved(false);
                setError("");
                refresh();
              }}
            >
              <Plus />
              같은 선수로 다음 경기
            </Button>
          )}
          <Button asChild variant="outline" className="h-12 w-full">
            <Link to="/history" search={parseFilters({ player: "all" })}>
              기록 확인하기
            </Link>
          </Button>
        </div>
      </div>
    );
  async function save() {
    if (submitLock.current) return;
    if (!d.request && !valid) {
      setError("선수와 완료된 경기 점수를 확인해 주세요.");
      return;
    }
    submitLock.current = true;
    setBusy(true);
    setError("");
    const q =
      d.request ||
      ({
        requestId: crypto.randomUUID(),
        action: original ? "edit" : "create",
        id: original?.id,
        version: original?.version,
        kind: d.kind,
        date: d.date,
        a,
        b,
        scoreA: Number(d.scoreA),
        scoreB: Number(d.scoreB),
        position: Number(d.position),
        dayVersions: { ...state.days, [d.date]: state.days[d.date] || 0 },
      } satisfies Mutation);
    patch({ request: q });
    try {
      await mutate(q);
      sessionStorage.removeItem(storageKey);
      setSaved(true);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했습니다.");
      if (e instanceof ApiError) {
        patch({ request: null });
        if (e.status === 409) refresh();
      }
    } finally {
      setBusy(false);
      submitLock.current = false;
    }
  }
  return (
    <div className="mx-auto max-w-2xl">
      <Link
        to="/history"
        search={parseFilters({ player: "all" })}
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground"
      >
        <ArrowLeft size={16} />
        경기 기록
      </Link>
      <p className="eyebrow mb-3">오늘의 한 게임</p>
      <h1 className="page-title">{original ? "경기 수정" : "경기 기록하기"}</h1>
      <p className="muted mt-3 mb-7">
        선수를 고르고, 팀을 나누고, 점수를 남겨요.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={busy || !!d.request} className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Tabs
              value={d.kind}
              onValueChange={(v) => patch({ kind: v as Kind })}
            >
              <TabsList className="h-12">
                <TabsTrigger className="min-h-10 min-w-20" value="doubles">
                  복식
                </TabsTrigger>
                <TabsTrigger className="min-h-10 min-w-20" value="singles">
                  단식
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div>
              <label htmlFor="played-date" className="sr-only">
                경기 날짜
              </label>
              <input
                id="played-date"
                type="date"
                value={d.date}
                max={state.today}
                required
                className="field"
                onChange={(e) => patch({ date: e.target.value, position: "0" })}
              />
            </div>
          </div>
          <section className="panel">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold">
                01 <span className="ml-2">선수와 팀</span>
              </h2>
              <Button
                type="button"
                variant="ghost"
                className="min-h-11"
                onClick={() =>
                  patch({
                    slots: [d.slots[2], d.slots[3], d.slots[0], d.slots[1]],
                    scoreA: d.scoreB,
                    scoreB: d.scoreA,
                  })
                }
              >
                <ArrowLeftRight />팀 교환
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[0, 1].map((team) => (
                <div
                  key={team}
                  className={`rounded-2xl p-3 ${team === 0 ? "bg-[#eceee6]" : "bg-[#f3f3f0]"}`}
                >
                  <p className="mb-3 text-center text-xs font-bold tracking-widest">
                    {team === 0 ? "A팀" : "B팀"}
                  </p>
                  <div className="space-y-2">
                    {visible
                      .filter((i) => Math.floor(i / 2) === team)
                      .map((i) => (
                        <button
                          type="button"
                          key={i}
                          aria-label={`${team === 0 ? "A" : "B"}팀 ${(i % 2) + 1}번째 선수 선택`}
                          className="flex min-h-17 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#cccec5] bg-white p-3 md:flex-row"
                          onClick={() => setSlot(i)}
                        >
                          {d.slots[i] ? (
                            <>
                              <Avatar
                                profile={profile(d.slots[i])}
                                size="small"
                              />
                              <span className="text-sm font-medium">
                                {profile(d.slots[i])?.nickname}
                                {d.slots[i] === state.me.id ? " (나)" : ""}
                              </span>
                            </>
                          ) : (
                            <>
                              <Plus size={20} />
                              <span className="text-sm text-muted-foreground">
                                선수 선택
                              </span>
                            </>
                          )}
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              자리를 누른 뒤 이미 선택한 선수를 고르면 서로 바뀌어요.
            </p>
          </section>
          <section className="panel">
            <h2 className="mb-5 text-lg font-bold">
              02 <span className="ml-2">최종 점수</span>
            </h2>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
              {[0, 1].map((team) => (
                <div
                  key={team}
                  className={team === 1 ? "col-start-3 row-start-1" : ""}
                >
                  <label
                    htmlFor={`score-${team}`}
                    className="mb-2 block text-center text-xs font-semibold"
                  >
                    {team === 0 ? "A팀" : "B팀"}
                  </label>
                  <input
                    id={`score-${team}`}
                    aria-label={`${team === 0 ? "A" : "B"}팀 점수`}
                    inputMode="numeric"
                    type="text"
                    pattern="[0-9]*"
                    maxLength={2}
                    value={team === 0 ? d.scoreA : d.scoreB}
                    onChange={(e) => {
                      if (/^\d{0,2}$/.test(e.target.value))
                        patch(
                          team === 0
                            ? { scoreA: e.target.value }
                            : { scoreB: e.target.value },
                        );
                    }}
                    placeholder="0"
                    className="h-24 w-full rounded-2xl border bg-background text-center text-5xl font-semibold outline-offset-4"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-3 h-11 w-full rounded-xl"
                    onClick={() =>
                      patch(team === 0 ? { scoreA: "21" } : { scoreB: "21" })
                    }
                  >
                    21점
                  </Button>
                </div>
              ))}
              <span className="col-start-2 row-start-1 text-3xl text-muted-foreground">
                :
              </span>
            </div>
            <p className="muted mt-5">21점 선승 · 듀스는 2점 차 · 최대 30점</p>
            {d.scoreA !== "" &&
              d.scoreB !== "" &&
              !validScore(Number(d.scoreA), Number(d.scoreB)) && (
                <p className="mt-2 text-sm" role="status">
                  아직 완료된 경기 점수가 아니에요.
                </p>
              )}
          </section>
          <section className="panel">
            <label htmlFor="position" className="block font-semibold">
              당일 경기 순서
            </label>
            <p className="muted my-2">
              과거 경기는 실제 순서에 맞춰 넣어 주세요.
            </p>
            <select
              id="position"
              className="field"
              value={d.position}
              onChange={(e) => patch({ position: e.target.value })}
            >
              <option value="0">
                {original && original.date === d.date
                  ? "기존 순서 유지"
                  : "이 날짜의 마지막에 추가"}
              </option>
              {Array.from({ length: day.length + 1 }, (_, i) => (
                <option key={day[i]?.id || "last"} value={i + 1}>
                  {i + 1}번째
                  {day[i]
                    ? ` · ${profile(day[i].a[0])?.nickname}의 경기 앞`
                    : " · 마지막"}
                </option>
              ))}
            </select>
            {original && (
              <p className="mt-3 text-xs text-muted-foreground">
                수정하면 이후 Elo와 시너지도 다시 계산됩니다.
              </p>
            )}
          </section>
        </fieldset>
        {similar && (
          <p className="mt-4 rounded-xl border p-3 text-sm">
            같은 선수·점수의 기록이 있어요. 실제로 다시 치른 경기라면 그대로
            저장할 수 있어요.
          </p>
        )}
        {error && (
          <div role="alert" className="mt-4 rounded-xl border-2 p-4 text-sm">
            <p>{error}</p>
            {d.request && (
              <p className="mt-2">
                응답을 확인하지 못했어요. 같은 요청으로 재시도하면 중복 저장되지
                않아요.
              </p>
            )}
          </div>
        )}
        <Button
          type="submit"
          className="mt-6 h-14 w-full rounded-xl text-base"
          disabled={busy || (!valid && !d.request)}
        >
          {busy
            ? "기록과 Elo를 저장하는 중…"
            : d.request
              ? "같은 요청으로 다시 저장"
              : original
                ? "수정 저장하기"
                : "경기 저장하기"}
          <Check />
        </Button>
      </form>
      <Dialog
        open={slot !== null}
        onOpenChange={(open) => {
          if (!open) setSlot(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>함께한 선수 선택</DialogTitle>
            <DialogDescription>
              활성 회원만 선택할 수 있어요. 선택한 선수를 누르면 자리를
              바꿉니다.
            </DialogDescription>
          </DialogHeader>
          <div className="grid max-h-80 grid-cols-2 gap-2 overflow-auto">
            {state.profiles
              .filter((p) => p.status === "active")
              .map((p) => (
                <button
                  type="button"
                  key={p.id}
                  className="flex min-h-16 items-center gap-3 rounded-xl border p-3 text-left"
                  onClick={() => {
                    if (slot === null) return;
                    const slots = [...d.slots];
                    const prev = slots.indexOf(p.id);
                    if (prev !== -1) slots[prev] = slots[slot];
                    slots[slot] = p.id;
                    patch({ slots });
                    setSlot(null);
                  }}
                >
                  <Avatar profile={p} size="small" />
                  <span className="text-sm">
                    {p.nickname}
                    {p.id === state.me.id ? " (나)" : ""}
                  </span>
                  {visible.some((i) => d.slots[i] === p.id) && (
                    <Check size={14} />
                  )}
                </button>
              ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
