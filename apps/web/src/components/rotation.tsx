import { doublesPairings, sameDoublesTeams } from "@/lib/rotation";
import type { Profile } from "@/lib/types";
import { Button } from "./ui/button";

export function RotationChoices({
  slots,
  anchor,
  profiles,
  onSelect,
  nextMatch = false,
  showScoreHint = true,
}: {
  slots: string[];
  anchor: string;
  profiles: Profile[];
  onSelect: (slots: string[]) => void;
  nextMatch?: boolean;
  showScoreHint?: boolean;
}) {
  const pairings = doublesPairings(slots, anchor)
    .map((pairing) =>
      slots.slice(0, 2).includes(pairing[0])
        ? pairing
        : [...pairing.slice(2), ...pairing.slice(0, 2)],
    )
    .filter((pairing) => !nextMatch || !sameDoublesTeams(slots, pairing));
  if (pairings.length === 0) return null;
  const names = (ids: string[]) =>
    ids
      .map((id) => profiles.find((p) => p.id === id)?.nickname || "회원")
      .join(" · ");
  return (
    <fieldset className="mt-2 min-w-0 text-left">
      <legend className="mb-1 text-sm font-semibold">
        {nextMatch ? "파트너 바꿔 다음 경기" : "빠른 팀 조합"}
      </legend>
      <div
        className={`grid gap-1.5 ${nextMatch ? "grid-cols-2" : "grid-cols-3"}`}
      >
        {pairings.map((pairing) => {
          const current = sameDoublesTeams(slots, pairing);
          const a = names(pairing.slice(0, 2));
          const b = names(pairing.slice(2));
          return (
            <Button
              key={pairing.join()}
              type="button"
              variant={current ? "default" : "outline"}
              aria-pressed={nextMatch ? undefined : current}
              aria-label={`${nextMatch ? "다음 경기" : "조합"}: ${a} 대 ${b}`}
              className="h-auto min-h-11 min-w-0 px-1 py-1 text-xs leading-tight whitespace-normal sm:px-2 sm:text-sm"
              onClick={() => {
                if (!current) onSelect(pairing);
              }}
            >
              <span className="min-w-0 wrap-anywhere">
                <span className="block">{a}</span>
                <span className="mt-0.5 block opacity-75">{b}</span>
              </span>
            </Button>
          );
        })}
      </div>
      {!nextMatch && showScoreHint && (
        <p className="mt-1 text-xs text-muted-foreground">
          조합을 바꾸면 점수는 비워져요.
        </p>
      )}
    </fieldset>
  );
}
