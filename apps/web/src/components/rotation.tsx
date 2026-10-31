import { ArrowRight, Check } from "lucide-react";
import { doublesPairings, sameDoublesTeams } from "@/lib/rotation";
import type { Profile } from "@/lib/types";
import { Button } from "./ui/button";

export function RotationChoices({
  slots,
  anchor,
  profiles,
  onSelect,
  nextMatch = false,
}: {
  slots: string[];
  anchor: string;
  profiles: Profile[];
  onSelect: (slots: string[]) => void;
  nextMatch?: boolean;
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
    <fieldset className="mt-5 space-y-2 text-left">
      <legend className="mb-2 text-sm font-semibold">
        {nextMatch ? "파트너 바꿔 다음 경기" : "빠른 팀 조합"}
      </legend>
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
            className="h-auto min-h-14 w-full justify-between gap-3 rounded-xl px-4 py-3 text-left whitespace-normal"
            onClick={() => {
              if (!current) onSelect(pairing);
            }}
          >
            <span className="min-w-0 space-y-1 break-words">
              <span className="block">A팀 · {a}</span>
              <span className="block">B팀 · {b}</span>
            </span>
            {current ? (
              <Check className="shrink-0" />
            ) : (
              <ArrowRight className="shrink-0" />
            )}
          </Button>
        );
      })}
      {!nextMatch && (
        <p className="pt-1 text-xs text-muted-foreground">
          조합을 바꾸면 점수는 비워져요.
        </p>
      )}
    </fieldset>
  );
}
