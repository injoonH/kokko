import { Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  CircleHelp,
  RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { getState, rememberPlayer } from "@/lib/api";
import type { Filters, Profile, State } from "@/lib/types";
import { signed } from "@/lib/utils";
import { Button } from "./ui/button";
import { ChartContainer, ChartTooltip } from "./ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export function useStateData(filters: Filters, page = 0) {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const key = JSON.stringify(filters);
  // biome-ignore lint/correctness/useExhaustiveDependencies: version deliberately invalidates the server snapshot.
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    getState(JSON.parse(key), page)
      .then((s) => {
        if (active) setState(s);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [key, version, page]);
  useEffect(() => {
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);
  const addPlayer = async (player: Profile) => {
    rememberPlayer(player);
    const next = await getState(JSON.parse(key), page);
    setState(next);
  };
  return { state, error, loading, refresh, addPlayer };
}
export function Loading() {
  return (
    <div role="status" aria-label="기록을 불러오는 중" className="space-y-3">
      <div className="skeleton h-8 w-1/2" />
      <div className="skeleton h-16" />
      <div className="skeleton h-40" />
    </div>
  );
}
export function ErrorBox({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  return (
    <div role="alert" className="panel my-6">
      <p>{message}</p>
      <Button variant="outline" className="mt-4 h-11" onClick={retry}>
        <RefreshCw />
        다시 시도
      </Button>
    </div>
  );
}
export function Empty({
  title = "아직 기록이 없어요",
  description = "첫 경기를 기록하고 우리만의 이야기를 시작해 보세요.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="py-10 text-center">
      <img src="/kokko.svg" alt="" className="mx-auto mb-4 h-24 w-24" />
      <h3 className="font-bold">{title}</h3>
      <p className="muted mt-2">{description}</p>
      <Link to="/matches/new" className="action mt-5 border text-sm">
        첫 경기 기록하기
        <ArrowUpRight size={15} />
      </Link>
    </div>
  );
}
export function Avatar({
  profile,
  size = "normal",
}: {
  profile?: Profile;
  size?: "compact" | "small" | "normal";
}) {
  const dimensions =
    size === "compact" ? "size-6" : size === "small" ? "size-8" : "size-11";
  return profile?.avatar ? (
    <img
      src={profile.avatar}
      alt=""
      className={`${dimensions} shrink-0 rounded-full object-cover`}
    />
  ) : (
    <span
      aria-hidden="true"
      className={`${dimensions} ${size === "normal" ? "text-sm" : "text-xs"} inline-flex shrink-0 items-center justify-center rounded-full border bg-muted font-semibold`}
    >
      {profile?.nickname.slice(0, 1) || "?"}
    </span>
  );
}
export function Delta({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap font-medium">
      {value > 0 ? (
        <ArrowUp size={13} />
      ) : value < 0 ? (
        <ArrowDown size={13} />
      ) : null}
      {signed(value)}
    </span>
  );
}
export function FiltersBar({
  filters,
  onChange,
  profiles = [],
  players = false,
  results = false,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  profiles?: Profile[];
  players?: boolean;
  results?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Tabs
        value={filters.kind}
        onValueChange={(v) =>
          onChange({ ...filters, kind: v as Filters["kind"] })
        }
      >
        <TabsList className="min-h-12 p-0.5">
          <TabsTrigger value="doubles" className="min-h-11 min-w-13">
            복식
          </TabsTrigger>
          <TabsTrigger value="singles" className="min-h-11 min-w-13">
            단식
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <Select
        value={filters.period}
        onValueChange={(v) =>
          onChange({ ...filters, period: v as Filters["period"] })
        }
      >
        <SelectTrigger
          aria-label="조회 기간"
          className="min-h-11 w-27 bg-white"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {[
            ["7", "최근 7일"],
            ["30", "최근 30일"],
            ["90", "최근 90일"],
            ["all", "전체 기간"],
          ].map(([v, l]) => (
            <SelectItem key={v} value={v}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {players && (
        <Select
          value={filters.player || "all"}
          onValueChange={(v) =>
            onChange({
              ...filters,
              player: v,
              result: v === "all" ? "" : filters.result,
            })
          }
        >
          <SelectTrigger
            aria-label="조회 선수"
            className="min-h-11 w-29 bg-white"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">모든 선수</SelectItem>
            {profiles.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.nickname}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {results && filters.player !== "all" && (
        <Select
          value={filters.result || "all"}
          onValueChange={(v) =>
            onChange({
              ...filters,
              result: v === "all" ? "" : (v as Filters["result"]),
            })
          }
        >
          <SelectTrigger aria-label="승패" className="min-h-11 w-27 bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">모든 결과</SelectItem>
            <SelectItem value="win">승리</SelectItem>
            <SelectItem value="loss">패배</SelectItem>
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
export function RatingChart({ state }: { state: State }) {
  return (
    <section className="panel min-w-0">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Elo 흐름</h2>
        <Tooltip>
          <TooltipTrigger
            aria-label="Elo 차트 설명"
            className="grid size-11 place-items-center rounded-lg hover:bg-muted"
          >
            <CircleHelp size={18} />
          </TooltipTrigger>
          <TooltipContent className="max-w-64">
            확인된 경기의 전체 Elo를 표시해요. 첫 점은 표시된 첫 경기 직전의
            점수이며, 같은 날의 경기도 각각 표시해요. 점을 눌러 점수 변화를 볼
            수 있어요.
          </TooltipContent>
        </Tooltip>
      </div>
      {state.stats.games === 0 ? (
        <p className="muted py-5 text-center">
          이 기간에는 확인된 경기가 없어요.
        </p>
      ) : (
        <ChartContainer
          config={{ rating: { label: "Elo", color: "#343630" } }}
          className="h-40 w-full sm:h-48"
        >
          <LineChart
            accessibilityLayer
            data={state.stats.points}
            margin={{ top: 8, right: 12, bottom: 0, left: -8 }}
          >
            <CartesianGrid vertical={false} strokeDasharray="3 4" />
            <XAxis
              dataKey="id"
              tickLine={false}
              axisLine={false}
              minTickGap={35}
              tickFormatter={(id) =>
                state.stats.points
                  .find((p) => p.id === id)
                  ?.date.slice(5)
                  .replace("-", ".") || ""
              }
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              domain={["dataMin - 15", "dataMax + 15"]}
              tickFormatter={(v) => Math.round(v).toString()}
              tickCount={4}
              width={46}
            />
            <ChartTooltip
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload;
                if (!active || !p) return null;
                return (
                  <div className="max-w-64 rounded-xl border bg-white p-3 text-xs shadow-lg">
                    <p className="text-muted-foreground">
                      {p.date}
                      {p.order > 0 ? ` · ${p.order}번째 경기` : ""}
                    </p>
                    <p className="mt-2 font-medium">{p.label}</p>
                    {p.score && <p className="mt-1">{p.score}</p>}
                    <p className="mt-2 font-bold">
                      Elo {Math.round(p.rating)}{" "}
                      {p.id !== "baseline" && `(${signed(p.delta)})`}
                    </p>
                  </div>
                );
              }}
            />
            <Line
              dataKey="rating"
              type="linear"
              stroke="var(--color-rating)"
              strokeWidth={2.5}
              dot={{ r: 3, fill: "white", strokeWidth: 2 }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ChartContainer>
      )}
      {state.chartTruncated && (
        <p className="mt-1 text-xs text-muted-foreground">최근 200경기 표시</p>
      )}
    </section>
  );
}
export function RatingSummary({ state }: { state: State }) {
  const s = state.stats;
  const cell = "min-w-max flex-1 px-2 py-2 sm:px-3";
  const value =
    "text-lg leading-6 font-semibold whitespace-nowrap sm:text-2xl sm:leading-8";
  return (
    <dl
      className="flex flex-wrap gap-px overflow-hidden rounded-xl border bg-border"
      aria-label="경기 통계"
    >
      <div className={`${cell} bg-primary text-primary-foreground`}>
        <dt className="text-[13px] text-white/75">현재 Elo</dt>
        <dd className={value}>
          {Math.round(s.current).toLocaleString("ko-KR")}
        </dd>
        {s.rank > 0 && (
          <dd className="text-xs text-white/75">전체 {s.rank}위</dd>
        )}
      </div>
      <div className={`${cell} bg-card`}>
        <dt className="text-[13px] text-muted-foreground">경기 수</dt>
        <dd className={value}>{s.games.toLocaleString("ko-KR")}</dd>
        <dd className="text-xs text-muted-foreground">
          {s.wins}승 {s.losses}패
        </dd>
      </div>
      <div className={`${cell} bg-card`}>
        <dt className="text-[13px] text-muted-foreground">승률</dt>
        <dd className={value}>{s.winRate.toFixed(0)}%</dd>
      </div>
      <div className={`${cell} bg-card`}>
        <dt className="text-[13px] text-muted-foreground">Elo 변화</dt>
        <dd className={value}>{signed(s.change)}</dd>
      </div>
    </dl>
  );
}
