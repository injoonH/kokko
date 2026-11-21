import { Link } from "@tanstack/react-router";
import { Check, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Profile } from "@/lib/types";
import { parseFilters } from "@/lib/types";
import { Avatar } from "./shared";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function PlayerSearch({
  onSelect,
  selected = [],
  disabled = false,
}: {
  onSelect?: (player: Profile) => void;
  selected?: string[];
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [players, setPlayers] = useState<Profile[]>([]);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setBusy(true);
      setError("");
      api<{ players: Profile[]; hasMore: boolean }>(
        `/arena/players?${new URLSearchParams({ q: query, page: String(page) })}`,
      )
        .then((data) => {
          if (active) {
            setPlayers(data.players);
            setMore(data.hasMore);
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setBusy(false);
        });
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, page]);
  return (
    <section aria-label="전체 선수 검색" className="space-y-3">
      <label
        className="flex items-center gap-2 text-sm font-medium"
        htmlFor="player-search"
      >
        <Search size={16} />
        전체 선수 검색
      </label>
      <Input
        id="player-search"
        value={query}
        maxLength={80}
        placeholder="닉네임 또는 #선수코드"
        disabled={disabled}
        onChange={(e) => {
          setQuery(e.target.value);
          setPage(0);
        }}
        className="h-12"
      />
      <p className="muted">친구가 아니어도 함께 경기할 수 있어요.</p>
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
      {busy && (
        <p role="status" className="muted">
          선수를 찾는 중…
        </p>
      )}
      <ul className="max-h-64 divide-y overflow-y-auto" aria-busy={busy}>
        {players.map((p) => (
          <li key={p.id}>
            {onSelect ? (
              <Button
                type="button"
                variant="ghost"
                className="h-auto min-h-14 w-full justify-start px-1"
                disabled={disabled}
                onClick={() => onSelect(p)}
              >
                <Avatar profile={p} size="small" />
                <span className="min-w-0 flex-1 truncate text-left">
                  {p.nickname}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    #{p.handle}
                  </span>
                </span>
                {selected.includes(p.id) && <Check size={16} />}
              </Button>
            ) : (
              <Link
                to="/players/$playerId"
                search={parseFilters({})}
                params={{ playerId: p.id }}
                className="flex min-h-16 items-center gap-3 py-3"
              >
                <Avatar profile={p} />
                <span>
                  {p.nickname}
                  <span className="muted ml-2">#{p.handle}</span>
                </span>
              </Link>
            )}
          </li>
        ))}
      </ul>
      {!busy && !players.length && (
        <p className="muted py-3">검색된 선수가 없어요.</p>
      )}
      <div className="flex justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-11"
          disabled={!page || busy || disabled}
          onClick={() => setPage((p) => p - 1)}
        >
          이전
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11"
          disabled={!more || busy || disabled}
          onClick={() => setPage((p) => p + 1)}
        >
          다음
        </Button>
      </div>
    </section>
  );
}
