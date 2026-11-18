import {
  eloChangeLabel,
  predictMatch,
  winChanceLabels,
} from "@/lib/prediction";
import type { Kind, State } from "@/lib/types";

export function MatchPrediction({
  state,
  kind,
  a,
  b,
}: {
  state: Pick<State, "profiles" | "rankings">;
  kind: Kind;
  a: string[];
  b: string[];
}) {
  const prediction = predictMatch(state, kind, a, b);
  const labels = prediction ? winChanceLabels(prediction.expectedA) : null;
  const changes = prediction ? [prediction.changeA, prediction.changeB] : [];
  return (
    <section
      aria-label="예상 승률"
      aria-live="polite"
      aria-atomic="true"
      className="mt-5 border-t pt-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">예상 승률 · Elo 변화</h3>
        <p className="text-xs text-muted-foreground">
          현재 {kind === "doubles" ? "복식" : "단식"} Elo 기준
        </p>
      </div>
      {prediction && labels ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {[0, 1].map((side) => (
              <div key={side} className={side === 1 ? "text-right" : ""}>
                <p className="text-sm font-semibold tabular-nums">
                  {side === 0 ? "A팀" : "B팀"} 예상 {labels[side]}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {kind === "doubles" ? "평균" : "현재"}{" "}
                  {Math.round(
                    side === 0 ? prediction.ratingA : prediction.ratingB,
                  )}{" "}
                  Elo
                </p>
                <fieldset
                  aria-label={`${side === 0 ? "A" : "B"}팀 예상 Elo 변화`}
                  className="mt-3 min-w-0 space-y-3 rounded-lg bg-muted p-2 text-xs tabular-nums"
                >
                  {changes[side].map((player) => (
                    <fieldset
                      key={player.id}
                      className="min-w-0"
                      aria-label={`${state.profiles.find((p) => p.id === player.id)?.nickname} 예상 변화`}
                    >
                      <p className="truncate font-semibold">
                        {
                          state.profiles.find((p) => p.id === player.id)
                            ?.nickname
                        }
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        RD {Math.round(player.rd)}
                      </p>
                      <dl className="mt-2 space-y-1.5">
                        <div className="flex flex-wrap justify-between gap-x-2">
                          <dt>승리 시</dt>
                          <dd className="font-semibold">
                            {eloChangeLabel(player.win)}
                          </dd>
                        </div>
                        <div className="flex flex-wrap justify-between gap-x-2">
                          <dt>패배 시</dt>
                          <dd className="font-semibold">
                            {eloChangeLabel(player.loss)}
                          </dd>
                        </div>
                      </dl>
                    </fieldset>
                  ))}
                </fieldset>
              </div>
            ))}
          </div>
          <div
            className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
            aria-hidden="true"
          >
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${prediction.expectedA * 100}%` }}
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            지금 이 대결을 할 때의 예상값이에요. 실제 결과와 Elo 변화는 다를 수
            있어요.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Glicko 방식으로 신뢰도(RD)를 반영해요. RD가 낮을수록 더 확실한
            점수예요.
            {kind === "doubles" && " 팀원마다 변화가 다를 수 있어요."}
          </p>
          {prediction.initialPlayers > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              이 종목의 기록이 없는 선수는 Elo 1,000점으로 계산해요.
            </p>
          )}
        </>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          선수를 중복 없이 모두 고르면 예상 승률을 보여드려요.
        </p>
      )}
    </section>
  );
}
