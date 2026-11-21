import { Check, Plus } from "lucide-react";
import { useState } from "react";
import type { Kind, Profile } from "@/lib/types";
import { PlayerSearch } from "./player-search";
import { Avatar } from "./shared";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

export function ParticipantPicker({
  kind,
  slots,
  profiles,
  meId,
  onChange,
  disabled = false,
  addPlayer,
  friends = [],
}: {
  kind: Kind;
  slots: string[];
  profiles: Profile[];
  meId: string;
  onChange: (slots: string[]) => void;
  disabled?: boolean;
  addPlayer?: (player: Profile) => Promise<void>;
  friends?: string[];
}) {
  const [slot, setSlot] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const visible = kind === "doubles" ? [0, 1, 2, 3] : [0, 2];
  function choose(id: string) {
    if (slot === null || disabled) return;
    const next = [...slots];
    const previous = id ? next.indexOf(id) : -1;
    if (previous !== -1) next[previous] = next[slot];
    next[slot] = id;
    onChange(next);
    setSlot(null);
  }
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        {[0, 1].map((team) => (
          <div key={team} className="min-w-0 rounded-2xl bg-muted p-3">
            <p className="mb-3 text-center text-xs font-bold tracking-widest">
              {team === 0 ? "A팀" : "B팀"}
            </p>
            <div className="space-y-2">
              {visible
                .filter((i) => Math.floor(i / 2) === team)
                .map((i) => {
                  const profile = profiles.find((p) => p.id === slots[i]);
                  return (
                    <button
                      type="button"
                      key={i}
                      aria-label={`${team === 0 ? "A" : "B"}팀 ${(i % 2) + 1}번째 선수 선택`}
                      disabled={disabled || busy}
                      className="flex min-h-17 w-full min-w-0 flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-background p-3 disabled:opacity-50 md:flex-row"
                      onClick={() => {
                        setError("");
                        setSlot(i);
                      }}
                    >
                      {slots[i] ? (
                        <>
                          <Avatar profile={profile} size="small" />
                          <span className="min-w-0 break-words text-sm font-medium">
                            {profile?.nickname ?? "알 수 없는 선수"}
                            {slots[i] === meId ? " (나)" : ""}
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
                  );
                })}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        자리를 누른 뒤 이미 선택한 선수를 고르면 서로 바뀌어요.
      </p>
      <Dialog
        open={slot !== null && !disabled}
        onOpenChange={(open) => {
          if (!open && !busy) setSlot(null);
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>함께한 선수 선택</DialogTitle>
            <DialogDescription>
              친구와 최근 선수를 먼저 골라보세요. 선택한 선수를 누르면 자리를
              바꿉니다.
            </DialogDescription>
          </DialogHeader>
          <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto">
            {profiles
              .filter((p) => p.status === "active" && p.selectable !== false)
              .slice(0, 100)
              .map((p) => {
                const selected = visible.some((i) => slots[i] === p.id);
                return (
                  <Button
                    type="button"
                    variant="outline"
                    key={p.id}
                    aria-pressed={selected}
                    disabled={disabled || busy}
                    className="h-auto min-h-16 min-w-0 justify-start gap-2 rounded-xl p-3 text-left"
                    onClick={() => choose(p.id)}
                  >
                    <Avatar profile={p} size="small" />
                    <span className="min-w-0 whitespace-normal break-words">
                      {p.nickname}
                      {p.id === meId ? " (나)" : ""}
                      <span className="mt-1 block text-[10px] text-muted-foreground">
                        {friends.includes(p.id) ? "친구 · " : ""}#
                        {p.handle || p.id.slice(-6)}
                      </span>
                    </span>
                    {selected && (
                      <Check size={14} className="ml-auto shrink-0" />
                    )}
                  </Button>
                );
              })}
          </div>
          {error && (
            <p role="alert" className="text-sm">
              {error}
            </p>
          )}
          {addPlayer && (
            <details className="rounded-xl border p-3">
              <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
                다른 선수 찾기
              </summary>
              <PlayerSearch
                disabled={disabled || busy}
                selected={slots}
                onSelect={async (player) => {
                  setBusy(true);
                  setError("");
                  try {
                    await addPlayer(player);
                    choose(player.id);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </details>
          )}
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full"
            disabled={disabled || busy || slot === null || !slots[slot]}
            onClick={() => choose("")}
          >
            선택 해제
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
