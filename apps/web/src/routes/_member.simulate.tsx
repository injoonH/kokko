import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowLeftRight } from "lucide-react";
import { useState } from "react";
import { MatchPrediction } from "@/components/prediction";
import { RotationChoices } from "@/components/rotation";
import { ErrorBox, Loading, useStateData } from "@/components/shared";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type Kind, parseFilters, type State } from "@/lib/types";

export const Route = createFileRoute("/_member/simulate")({
  component: SimulatorPage,
});

function SimulatorPage() {
  const { state, error, refresh } = useStateData(
    parseFilters({ period: "all", player: "all" }),
  );
  if (error) return <ErrorBox message={error} retry={refresh} />;
  if (!state) return <Loading />;
  return <Simulator key={state.me.id} state={state} />;
}

function Simulator({ state }: { state: State }) {
  const [kind, setKind] = useState<Kind>("doubles");
  const [selected, setSelected] = useState([state.me.id, "", "", ""]);
  const players = state.profiles.filter((p) => p.status === "active");
  const slots = selected.map((id) =>
    players.some((p) => p.id === id) ? id : "",
  );
  const visible = kind === "doubles" ? [0, 1, 2, 3] : [0, 2];
  const a = visible.filter((i) => i < 2).map((i) => slots[i]);
  const b = visible.filter((i) => i >= 2).map((i) => slots[i]);
  function choose(slot: number, value: string) {
    const id = value === "none" ? "" : value;
    const next = [...slots];
    const previous = id ? next.indexOf(id) : -1;
    if (previous !== -1) next[previous] = next[slot];
    next[slot] = id;
    setSelected(next);
  }
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        to="/"
        search={parseFilters({})}
        className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground"
      >
        <ArrowLeft size={16} />내 코트로
      </Link>
      <div>
        <p className="eyebrow mb-3">이 팀으로 만난다면?</p>
        <h1 className="page-title">가상 대결</h1>
        <p className="muted mt-3">
          선수를 골라 승률과 승리·패배 시 Elo 변화를 미리 확인해요.
        </p>
        <p className="muted mt-2">
          자유롭게 팀을 바꿔보세요. 경기 기록과 Elo는 바뀌지 않아요.
        </p>
      </div>
      <section className="panel">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Tabs value={kind} onValueChange={(value) => setKind(value as Kind)}>
            <TabsList className="h-12">
              <TabsTrigger value="doubles" className="min-h-10 min-w-20">
                복식
              </TabsTrigger>
              <TabsTrigger value="singles" className="min-h-10 min-w-20">
                단식
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            variant="ghost"
            className="min-h-11"
            onClick={() =>
              setSelected([slots[2], slots[3], slots[0], slots[1]])
            }
          >
            <ArrowLeftRight />팀 교환
          </Button>
        </div>
        <h2 className="sr-only">가상 대결 선수 선택</h2>
        <div className="grid grid-cols-2 gap-3">
          {[0, 1].map((team) => (
            <div key={team} className="min-w-0 rounded-xl bg-muted p-3">
              <p className="mb-3 text-center text-xs font-bold">
                {team === 0 ? "A팀" : "B팀"}
              </p>
              <div className="space-y-2">
                {visible
                  .filter((i) => Math.floor(i / 2) === team)
                  .map((i) => (
                    <Select
                      key={i}
                      value={slots[i] || "none"}
                      onValueChange={(value) => choose(i, value)}
                    >
                      <SelectTrigger
                        aria-label={`${team === 0 ? "A" : "B"}팀 ${(i % 2) + 1}번째 선수 선택`}
                        className="min-h-12 w-full min-w-0 bg-background text-left *:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:truncate"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none" className="min-h-11">
                          선수 선택
                        </SelectItem>
                        {players.map((p) => (
                          <SelectItem
                            key={p.id}
                            value={p.id}
                            className="min-h-11"
                          >
                            {p.nickname}
                            {p.id === state.me.id ? " (나)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          이미 고른 선수를 선택하면 자리가 서로 바뀌어요. 나 없이도 대결을
          비교할 수 있어요.
        </p>
        <MatchPrediction state={state} kind={kind} a={a} b={b} />
        {kind === "doubles" && (
          <RotationChoices
            slots={slots}
            anchor={state.me.id}
            profiles={state.profiles}
            onSelect={setSelected}
            showScoreHint={false}
          />
        )}
      </section>
    </div>
  );
}
