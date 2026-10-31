import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, Shuffle, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar, ErrorBox, Loading, useStateData } from "@/components/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  type CourtPlan,
  courtPlayers,
  courtRoster,
  suggestDoubles,
} from "@/lib/court";
import { parseFilters, type State } from "@/lib/types";

export const Route = createFileRoute("/_member/court")({
  component: CourtPage,
});

function CourtPage() {
  const { state, error, refresh } = useStateData(
    parseFilters({ period: "all", player: "all" }),
  );
  if (error) return <ErrorBox message={error} retry={refresh} />;
  if (!state) return <Loading />;
  return <Court key={state.today} state={state} />;
}

function Court({ state }: { state: State }) {
  const navigate = Route.useNavigate();
  const rosterKey = `kokko.court.${state.me.id}.${state.today}`;
  const draftKey = `kokko.draft.${state.me.id}.new`;
  const [roster, setRoster] = useState<string[]>(() => {
    for (const key of [
      rosterKey,
      `kokko.lineup.${state.me.id}.${state.today}`,
    ]) {
      try {
        const raw = sessionStorage.getItem(key);
        if (raw) return courtRoster(JSON.parse(raw), state);
      } catch {}
    }
    return courtRoster([], state);
  });
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState<{
    plan: CourtPlan;
    pending: boolean;
  } | null>(null);
  const players = courtPlayers(state);
  const activeRoster = courtRoster(roster, state);
  const plans = suggestDoubles(state, activeRoster);
  useEffect(() => {
    try {
      sessionStorage.setItem(rosterKey, JSON.stringify(roster));
    } catch {}
  }, [rosterKey, roster]);
  function openEntry(plan: CourtPlan) {
    try {
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({
          kind: "doubles",
          date: state.today,
          slots: plan.slots,
          scoreA: "",
          scoreB: "",
          position: "0",
          request: null,
        }),
      );
      setConflict(null);
      void navigate({ to: "/matches/new" });
    } catch {
      setError("경기 입력을 열지 못했어요. 다시 시도해 주세요.");
    }
  }
  function start(plan: CourtPlan) {
    setError("");
    try {
      const raw = sessionStorage.getItem(draftKey);
      const draft = raw ? JSON.parse(raw) : null;
      if (draft?.request || draft?.scoreA || draft?.scoreB) {
        setConflict({ plan, pending: !!draft.request });
        return;
      }
    } catch {}
    openEntry(plan);
  }
  const person = (id: string) => players.find((p) => p.id === id);
  const todayGames = state.allMatches.filter(
    (m) => !m.deleted && m.date === state.today,
  ).length;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        to="/"
        search={parseFilters({})}
        className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground"
      >
        <ArrowLeft size={16} />내 코트로
      </Link>
      <div>
        <p className="eyebrow mb-3">한 번 고르고, 여러 게임 함께</p>
        <h1 className="page-title">오늘의 코트</h1>
        <p className="muted mt-3">
          누가 함께하나요? 다음 게임의 팀을 같이 골라봐요.
        </p>
      </div>
      <section className="panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">
              함께하는 선수 {activeRoster.length}명
            </h2>
            <p className="muted mt-1">
              {state.today} · 모임 전체 {todayGames}경기 기록
            </p>
          </div>
          <Button
            variant="outline"
            className="h-11"
            onClick={() => setChoosing(true)}
          >
            <Users />
            {activeRoster.length < 4 ? "오늘의 선수 선택" : "참석 선수 바꾸기"}
          </Button>
        </div>
        <ul
          className="mt-5 flex flex-wrap gap-2"
          aria-label="오늘 함께하는 선수"
        >
          {players
            .filter((p) => activeRoster.includes(p.id))
            .map((p) => (
              <li
                key={p.id}
                className="flex max-w-full items-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm"
              >
                <span className="break-all font-medium">
                  {p.nickname}
                  {p.id === state.me.id ? " (나)" : ""}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {p.games}경기
                </span>
              </li>
            ))}
        </ul>
      </section>
      {error && (
        <p role="alert" className="rounded-xl border p-4 text-sm">
          {error}
        </p>
      )}
      {plans.length === 0 ? (
        <section className="panel py-10 text-center">
          <Shuffle className="mx-auto mb-4 size-8" />
          <h2 className="text-xl font-bold">
            친구 {4 - activeRoster.length}명을 더 골라주세요
          </h2>
          <p className="muted mx-auto mt-3 max-w-sm">
            나를 포함해 네 명 이상이면 바로 추천해요. 오늘 덜 뛴 친구를 먼저,
            비슷한 전력이면 새로운 파트너로.
          </p>
          <Button className="mt-6 h-12" onClick={() => setChoosing(true)}>
            함께할 선수 고르기
          </Button>
        </section>
      ) : (
        <section className="space-y-4" aria-label="다음 경기 추천">
          <div>
            <h2 className="text-xl font-bold">다음 게임, 이 조합 어때요?</h2>
            <p className="muted mt-2">
              덜 뛴 친구와 오래 쉰 친구를 먼저, 전력이 비슷하면 새로운 파트너로
              추천해요.
            </p>
          </div>
          {plans.map((plan, index) => {
            const chance = Math.round(plan.expectedA * 100);
            return (
              <article
                key={plan.slots.join()}
                className={`panel ${index === 0 ? "border-primary" : ""}`}
                aria-label={`추천 ${index + 1}`}
              >
                <div className="mb-5 flex items-center justify-between gap-3">
                  <p className="eyebrow">
                    {index === 0
                      ? "지금 추천하는 한 게임"
                      : `또 다른 조합 ${index}`}
                  </p>
                  <Shuffle className="size-4 text-muted-foreground" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[0, 1].map((side) => (
                    <div
                      key={side}
                      className={`min-w-0 rounded-xl p-3 ${side === 0 ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                    >
                      <p className="mb-3 text-xs font-semibold">
                        {side === 0 ? "A팀" : "B팀"} · 평균{" "}
                        {Math.round(side === 0 ? plan.ratingA : plan.ratingB)}{" "}
                        Elo
                      </p>
                      <ul className="space-y-3">
                        {plan.slots.slice(side * 2, side * 2 + 2).map((id) => (
                          <li key={id} className="min-w-0">
                            <p className="break-all text-base font-semibold">
                              {person(id)?.nickname}
                            </p>
                            <p className="mt-1 text-xs opacity-75">
                              오늘 {person(id)?.games}경기
                              {id === state.me.id ? " · 나" : ""}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                <div className="mt-5">
                  <div className="mb-2 flex justify-between text-xs">
                    <span>A팀 예상 {chance}%</span>
                    <span>B팀 예상 {100 - chance}%</span>
                  </div>
                  <div
                    className="h-1.5 overflow-hidden rounded-full bg-muted"
                    aria-hidden="true"
                  >
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${chance}%` }}
                    />
                  </div>
                </div>
                <Button
                  variant={index === 0 ? "default" : "outline"}
                  className="mt-5 h-12 w-full"
                  onClick={() => start(plan)}
                >
                  이 조합으로 경기 기록
                  <ArrowRight />
                </Button>
              </article>
            );
          })}
          <p className="muted">
            예상 승률은 현재 복식 Elo를 바탕으로 한 참고값이에요. 실제 결과와
            다를 수 있어요.
          </p>
        </section>
      )}
      <Dialog open={choosing} onOpenChange={setChoosing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>오늘 함께할 선수</DialogTitle>
            <DialogDescription>
              나와 함께할 친구를 골라주세요. 선택은 오늘 이 탭에 기억해요.
            </DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[55dvh] grid-cols-2 gap-2 overflow-auto p-1">
            {players.map((p) => {
              const selected = activeRoster.includes(p.id);
              return (
                <Button
                  key={p.id}
                  variant={selected ? "secondary" : "outline"}
                  aria-label={`${p.nickname} 참석`}
                  aria-pressed={selected}
                  disabled={p.id === state.me.id}
                  className="h-auto min-h-16 justify-start gap-2 whitespace-normal px-3 py-3 text-left"
                  onClick={() =>
                    setRoster((ids) =>
                      selected
                        ? ids.filter((id) => id !== p.id)
                        : [...ids, p.id],
                    )
                  }
                >
                  <Avatar profile={p} size="small" />
                  <span className="min-w-0 flex-1 break-all">
                    {p.nickname}
                    {p.id === state.me.id ? " (나)" : ""}
                  </span>
                  {selected && <Check className="size-4 shrink-0" />}
                </Button>
              );
            })}
          </div>
          <DialogFooter>
            <Button className="h-12" onClick={() => setChoosing(false)}>
              {activeRoster.length}명 선택 완료
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={conflict !== null}
        onOpenChange={(open) => {
          if (!open) setConflict(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {conflict?.pending
                ? "저장 확인이 필요한 경기가 있어요"
                : "작성 중인 경기가 있어요"}
            </DialogTitle>
            <DialogDescription>
              {conflict?.pending
                ? "앞선 경기의 저장 여부를 먼저 확인해 주세요. 입력 화면에서 같은 요청으로 다시 저장할 수 있어요."
                : "입력한 점수가 남아 있어요. 이어서 기록하거나 새 조합으로 시작할 수 있어요."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              className="h-12"
              onClick={() => {
                setConflict(null);
                void navigate({ to: "/matches/new" });
              }}
            >
              기존 경기 이어가기
            </Button>
            {conflict && !conflict.pending && (
              <Button className="h-12" onClick={() => openEntry(conflict.plan)}>
                새 조합으로 시작
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
