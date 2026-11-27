import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowLeftRight, Check, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ApiError, api, getState, mutate, rememberPlayer } from "@/lib/api";
import { groupStorageKey } from "@/lib/groups";
import { doublesPairings } from "@/lib/rotation";
import {
  type Kind,
  type Match,
  type Mutation,
  parseFilters,
  type State,
  validScore,
  winningScore,
} from "@/lib/types";
import { ParticipantPicker } from "./participant-picker";
import { MatchPrediction } from "./prediction";
import { RotationChoices } from "./rotation";
import { ErrorBox, Loading } from "./shared";
import { Button } from "./ui/button";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";

type Draft = {
  kind: Kind;
  date: string;
  slots: string[];
  scoreA: string;
  scoreB: string;
  position: string;
  request: Mutation | null;
  baseVersion?: number;
  recoveredFrom?: string;
  requestProtocol?: "arena" | "legacy";
};
export function EntryPage({ matchId }: { matchId?: string }) {
  const [snapshot, setSnapshot] = useState<{
    state: State;
    original?: Match;
  } | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const refresh = () => setRevision((v) => v + 1);
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision refreshes the entry snapshot.
  useEffect(() => {
    let active = true;
    setError("");
    (async () => {
      let original: Match | undefined;
      if (matchId) {
        const detail = await api<{
          match: Match;
          profiles: import("@/lib/types").Profile[];
        }>(`/arena/matches/${matchId}`);
        detail.profiles.forEach(rememberPlayer);
        original = detail.match;
      }
      const state = await getState(
        parseFilters({ period: "all", player: "all" }),
      );
      if (active) setSnapshot({ state, original });
    })().catch((e) => {
      if (active) setError(e.message);
    });
    return () => {
      active = false;
    };
  }, [matchId, revision]);
  const addPlayer = async (player: import("@/lib/types").Profile) => {
    rememberPlayer(player);
    const state = await getState(
      parseFilters({ period: "all", player: "all" }),
    );
    if (state.profiles.find((p) => p.id === player.id)?.selectable === false)
      throw new Error("현재 선택할 수 없는 선수입니다.");
    setSnapshot((v) => v && { ...v, state });
  };
  if (error) return <ErrorBox message={error} retry={refresh} />;
  if (!snapshot) return <Loading />;
  const { state, original } = snapshot;
  if (original && ![...original.a, ...original.b].includes(state.me.id))
    return <p role="alert">참여한 경기만 수정할 수 있어요.</p>;
  return (
    <Entry
      key={matchId || "new"}
      state={state}
      original={original}
      refresh={refresh}
      addPlayer={addPlayer}
    />
  );
}

function Entry({
  state,
  original,
  refresh,
  addPlayer,
}: {
  state: State;
  original?: Match;
  refresh: () => void;
  addPlayer: (player: import("@/lib/types").Profile) => Promise<void>;
}) {
  const storageKey = groupStorageKey(
    "draft",
    state.me.id,
    state.group.id,
    original?.id || "new",
  );
  const [d, setD] = useState<Draft>(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        const draft = JSON.parse(saved);
        if (Array.isArray(draft.slots) && draft.slots.length === 4)
          return {
            ...draft,
            baseVersion: draft.baseVersion ?? original?.version,
            requestProtocol:
              draft.requestProtocol || (draft.request ? "legacy" : "arena"),
          };
      }
    } catch {}
    let lineup = [state.me.id, "", "", ""];
    if (!original) {
      try {
        const stored = JSON.parse(
          sessionStorage.getItem(
            groupStorageKey("lineup", state.me.id, state.group.id, state.today),
          ) || "null",
        );
        if (
          Array.isArray(stored) &&
          doublesPairings(stored, state.me.id).length === 3 &&
          stored.includes(state.me.id) &&
          stored.every((id) =>
            state.profiles.some((p) => p.id === id && p.status === "active"),
          )
        )
          lineup = stored;
      } catch {}
    }
    return {
      kind: original?.kind || "doubles",
      date: original?.date || state.today,
      slots: original
        ? original.kind === "singles"
          ? [original.a[0], "", original.b[0], ""]
          : [...original.a, ...original.b]
        : lineup,
      scoreA: original ? String(original.scoreA) : "",
      scoreB: original ? String(original.scoreB) : "",
      position: "0",
      request: null,
      baseVersion: original?.version,
    };
  });
  const olderDrafts = Object.keys(sessionStorage).filter((key) => {
    const parts = key.split(".");
    return (
      parts[0] === "kokko" &&
      parts[1] === "draft" &&
      parts[2] === state.me.id &&
      parts.length === 5 &&
      parts[4] === (original?.id || "new")
    );
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [daySnapshot, setDaySnapshot] = useState<{
    matches: Match[];
    profiles: import("@/lib/types").Profile[];
    version: number;
    truncated: boolean;
  } | null>(null);
  const [dayError, setDayError] = useState("");
  const [error, setError] = useState("");
  const submitLock = useRef(false);
  useEffect(() => {
    if (!saved) sessionStorage.setItem(storageKey, JSON.stringify(d));
  }, [d, storageKey, saved]);
  useEffect(() => {
    if (
      !original &&
      d.kind === "doubles" &&
      doublesPairings(d.slots, state.me.id).length === 3
    )
      sessionStorage.setItem(
        groupStorageKey("lineup", state.me.id, state.group.id, d.date),
        JSON.stringify(d.slots),
      );
  }, [d.slots, d.kind, d.date, original, state.me.id, state.group.id]);
  const patch = (p: Partial<Draft>) => setD((v) => ({ ...v, ...p }));
  const visible = d.kind === "doubles" ? [0, 1, 2, 3] : [0, 2];
  const a = visible.filter((i) => i < 2).map((i) => d.slots[i]);
  const b = visible.filter((i) => i >= 2).map((i) => d.slots[i]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a refreshed snapshot invalidates day-order versions.
  useEffect(() => {
    let active = true;
    setDaySnapshot(null);
    setDayError("");
    api<{
      matches: Match[];
      profiles: import("@/lib/types").Profile[];
      version: number;
      truncated: boolean;
    }>(`/arena/day?${new URLSearchParams({ date: d.date })}`)
      .then((data) => {
        if (active) setDaySnapshot(data);
      })
      .catch((e) => {
        if (active) setDayError(e.message);
      });
    return () => {
      active = false;
    };
  }, [d.date, state]);
  const day = (daySnapshot?.matches || []).filter((m) => m.id !== original?.id);
  const valid =
    a.every(Boolean) &&
    b.every(Boolean) &&
    new Set([...a, ...b]).size === a.length + b.length &&
    d.scoreA !== "" &&
    d.scoreB !== "" &&
    validScore(Number(d.scoreA), Number(d.scoreB));
  const profile = (id: string) =>
    state.profiles.find((p) => p.id === id) ||
    daySnapshot?.profiles.find((p) => p.id === id);
  const winScores = [
    winningScore(Number(d.scoreB)),
    winningScore(Number(d.scoreA)),
  ];
  function nextMatch(slots = d.slots) {
    setD((v) => ({
      ...v,
      slots,
      scoreA: "",
      scoreB: "",
      position: "0",
      request: null,
    }));
    setSaved(null);
    setError("");
    refresh();
  }
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
      <div className="mx-auto max-w-lg py-4 text-center">
        <img
          src="/kokko.svg"
          alt="기록을 마친 꼬꼬"
          className="mx-auto size-16"
        />
        <h1 className="page-title mt-2">
          {original ? "경기 수정을 저장했어요" : "경기를 기록했어요"}
        </h1>
        <p className="muted mt-2">경기 기록과 Elo에 반영됐어요.</p>
        <div className="mt-4 space-y-2">
          {!original && (
            <Button className="h-11 w-full" onClick={() => nextMatch()}>
              <Plus />
              같은 선수로 다음 경기
            </Button>
          )}
          {!original && d.kind === "doubles" && (
            <RotationChoices
              slots={d.slots}
              anchor={state.me.id}
              profiles={state.profiles}
              onSelect={nextMatch}
              nextMatch
            />
          )}
          {!original && (
            <Button asChild variant="outline" className="h-11 w-full">
              <Link to="/court">다음 경기 추천받기</Link>
            </Button>
          )}
          <Button asChild variant="outline" className="h-11 w-full">
            <Link to="/games/$matchId" params={{ matchId: saved }}>
              경기 상세 보기
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
        version: d.baseVersion ?? original?.version,
        kind: d.kind,
        date: d.date,
        a,
        b,
        scoreA: Number(d.scoreA),
        scoreB: Number(d.scoreB),
        position: Number(d.position),
        dayVersions: { [d.date]: daySnapshot?.version || 0 },
      } satisfies Mutation);
    const legacyRequest = !!d.request && d.requestProtocol !== "arena";
    patch({ request: q, requestProtocol: legacyRequest ? "legacy" : "arena" });
    try {
      const result = await mutate(q, legacyRequest);
      const id = result.match.id;
      sessionStorage.removeItem(storageKey);
      if (d.recoveredFrom) sessionStorage.removeItem(d.recoveredFrom);
      setSaved(id);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했습니다.");
      if (e instanceof ApiError && e.status < 500 && e.status !== 429) {
        patch({ request: null, requestProtocol: "arena" });
        if (e.status === 409) refresh();
      }
    } finally {
      setBusy(false);
      submitLock.current = false;
    }
  }
  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" className="size-11">
          <Link
            to="/history"
            search={parseFilters({ player: "all" })}
            aria-label="경기 기록 목록"
          >
            <ArrowLeft size={16} />
          </Link>
        </Button>
        <h1 className="page-title min-w-0 flex-1">
          {original ? "경기 수정" : "경기 기록하기"}
        </h1>
        <Button asChild variant="ghost" className="h-11 px-2">
          <Link to="/simulate">가상 대결</Link>
        </Button>
      </div>
      {!!olderDrafts.length && !d.recoveredFrom && (
        <details className="rounded-lg border px-3 open:pb-3">
          <summary className="min-h-11 cursor-pointer content-center text-sm font-medium">
            이전 모임의 입력 초안 {olderDrafts.length}개
          </summary>
          <p className="muted my-3">
            이 기기에 남은 초안을 불러올 수 있어요. 현재 입력 대신 불러오며,
            저장되기 전까지 원본도 보관해요.
          </p>
          {olderDrafts.map((key, i) => (
            <Button
              key={key}
              type="button"
              variant="outline"
              className="mb-2 min-h-11"
              disabled={busy || !!d.request}
              onClick={() => {
                try {
                  const draft = JSON.parse(
                    sessionStorage.getItem(key) || "null",
                  );
                  if (!Array.isArray(draft?.slots) || draft.slots.length !== 4)
                    throw new Error("초안을 읽을 수 없어요.");
                  setD({
                    ...draft,
                    recoveredFrom: key,
                    requestProtocol:
                      draft.requestProtocol ||
                      (draft.request ? "legacy" : "arena"),
                    baseVersion: draft.baseVersion ?? original?.version,
                  });
                  setError("");
                } catch {
                  setError("초안을 읽을 수 없어요. 기존 초안은 보관했어요.");
                }
              }}
            >
              이전 초안 {i + 1} 불러오기
            </Button>
          ))}
        </details>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={busy || !!d.request} className="min-w-0 space-y-3">
          <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:justify-between">
            <Tabs
              value={d.kind}
              onValueChange={(v) => patch({ kind: v as Kind })}
            >
              <TabsList className="min-h-12 w-full p-0.5 sm:w-fit">
                <TabsTrigger
                  disabled={!!original}
                  className="min-h-11 sm:min-w-16"
                  value="doubles"
                >
                  복식
                </TabsTrigger>
                <TabsTrigger
                  disabled={!!original}
                  className="min-h-11 sm:min-w-16"
                  value="singles"
                >
                  단식
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="min-w-0">
              <label htmlFor="played-date" className="sr-only">
                경기 날짜
              </label>
              <input
                id="played-date"
                type="date"
                value={d.date}
                max={state.today}
                required
                className="field min-w-0 px-2"
                onChange={(e) => patch({ date: e.target.value, position: "0" })}
              />
            </div>
          </div>
          <section className="panel">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-lg font-bold">선수와 팀</h2>
              <Button
                type="button"
                variant="ghost"
                className="h-11"
                disabled={!!original}
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
            <ParticipantPicker
              kind={d.kind}
              slots={d.slots}
              profiles={state.profiles}
              meId={state.me.id}
              onChange={(slots) => patch({ slots })}
              disabled={busy || !!d.request || !!original}
              addPlayer={addPlayer}
              friends={state.friends}
            />
            {!original && d.kind === "doubles" && (
              <RotationChoices
                slots={d.slots}
                anchor={state.me.id}
                profiles={state.profiles}
                onSelect={(slots) => patch({ slots, scoreA: "", scoreB: "" })}
              />
            )}
          </section>
          <section className="panel">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2">
              <h2 className="text-lg font-bold">최종 점수</h2>
              <p className="text-xs text-muted-foreground">
                21점 · 듀스 2점 차 · 최대 30점
              </p>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
              {[0, 1].map((team) => (
                <div
                  key={team}
                  className={team === 1 ? "col-start-3 row-start-1" : ""}
                >
                  <label
                    htmlFor={`score-${team}`}
                    className="mb-1 block text-center text-xs font-semibold"
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
                    className="h-13 w-full rounded-md border bg-background text-center text-2xl font-semibold"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-1.5 h-11 w-full px-1.5"
                    aria-label={`${team === 0 ? "A" : "B"}팀 ${winScores[team] === null ? "승리 점수 없음" : `${winScores[team]}점 승리`}`}
                    disabled={winScores[team] === null}
                    onClick={() => {
                      const score = winScores[team];
                      if (score !== null)
                        patch(
                          team === 0
                            ? { scoreA: String(score) }
                            : { scoreB: String(score) },
                        );
                    }}
                  >
                    {winScores[team] === null
                      ? "승리 점수 없음"
                      : `${winScores[team]}점 승리`}
                  </Button>
                </div>
              ))}
              <span
                aria-hidden="true"
                className="col-start-2 row-start-1 self-start pt-8 text-lg text-muted-foreground"
              >
                :
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              진 팀 점수를 입력하면 승리 점수를 자동으로 채울 수 있어요.
            </p>
            {d.scoreA !== "" &&
              d.scoreB !== "" &&
              !validScore(Number(d.scoreA), Number(d.scoreB)) && (
                <p className="mt-2 text-sm" role="status">
                  아직 완료된 경기 점수가 아니에요.
                </p>
              )}
          </section>
          <details className="rounded-lg border bg-card px-3 open:pb-3 sm:px-4">
            <summary className="min-h-11 cursor-pointer content-center text-sm font-medium">
              예상 승률 미리보기
            </summary>
            <MatchPrediction state={state} kind={d.kind} a={a} b={b} />
          </details>
          <section className="panel">
            <label
              htmlFor="position"
              className="mb-1 block text-sm font-semibold"
            >
              당일 경기 순서
            </label>
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
              {!daySnapshot?.truncated && daySnapshot
                ? Array.from({ length: day.length + 1 }, (_, i) => (
                    <option key={day[i]?.id || "last"} value={i + 1}>
                      {i + 1}번째
                      {day[i]
                        ? ` · ${profile(day[i].a[0])?.nickname}의 경기 앞`
                        : " · 마지막"}
                    </option>
                  ))
                : []}
            </select>
            {d.date !== state.today && (
              <p className="mt-1 text-xs text-muted-foreground">
                과거 경기는 실제 순서에 맞춰 넣어 주세요.
              </p>
            )}
            {original && (
              <p className="mt-3 text-xs text-muted-foreground">
                수정 내용을 저장하면 이후 Elo와 통계가 다시 계산돼요. 선수나
                팀이 잘못됐다면 경기 상세에서 신고해 주세요.
              </p>
            )}
          </section>
        </fieldset>
        {dayError && (
          <p role="alert" className="my-3 text-sm">
            {dayError}
          </p>
        )}
        {original &&
          d.baseVersion !== undefined &&
          d.baseVersion !== original.version &&
          !d.request && (
            <Button
              type="button"
              variant="outline"
              onClick={() => patch({ baseVersion: original.version })}
            >
              최신 경기 기준으로 수정
            </Button>
          )}
        {similar && (
          <p className="mt-4 rounded-lg border p-3 text-sm">
            같은 선수·점수의 기록이 있어요. 실제로 다시 치른 경기라면 그대로
            저장할 수 있어요.
          </p>
        )}
        {error && (
          <div role="alert" className="mt-4 rounded-lg border-2 p-4 text-sm">
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
          className="mt-3 h-12 w-full text-base"
          disabled={
            busy || (!valid && !d.request) || (!daySnapshot && !d.request)
          }
        >
          {busy
            ? "경기를 저장하는 중…"
            : d.request
              ? "같은 요청으로 다시 저장"
              : original
                ? "수정 저장하기"
                : "경기 저장하기"}
          <Check />
        </Button>
      </form>
    </div>
  );
}
