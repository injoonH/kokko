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
import { getState } from "@/lib/api";
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

export function useStateData(filters: Filters) {
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
    getState(JSON.parse(key))
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
  }, [key, version]);
  useEffect(() => {
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);
  return { state, error, loading, refresh };
}
export function Loading() {
  return (
    <div role="status" aria-label="기록을 불러오는 중" className="space-y-6">
      <div className="skeleton h-12 w-2/3" />
      <div className="grid grid-cols-2 gap-4">
        <div className="skeleton h-40" />
        <div className="skeleton h-40" />
      </div>
      <div className="skeleton h-64" />
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
  size?: "small" | "normal";
}) {
  return profile?.avatar ? (
    <img
      src={profile.avatar}
      alt=""
      className={`${size === "small" ? "h-8 w-8" : "h-11 w-11"} shrink-0 rounded-full object-cover`}
    />
  ) : (
    <span
      aria-hidden="true"
      className={`${size === "small" ? "h-8 w-8 text-xs" : "h-11 w-11 text-sm"} inline-flex shrink-0 items-center justify-center rounded-full border bg-muted font-semibold`}
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
  profiles,
  players = false,
  results = false,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  profiles: Profile[];
  players?: boolean;
  results?: boolean;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-center gap-3">
      <Tabs
        value={filters.kind}
        onValueChange={(v) =>
          onChange({ ...filters, kind: v as Filters["kind"] })
        }
      >
        <TabsList className="h-11">
          <TabsTrigger value="doubles" className="min-w-17 min-h-9">
            복식
          </TabsTrigger>
          <TabsTrigger value="singles" className="min-w-17 min-h-9">
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
          className="min-h-11 w-32 bg-white"
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
            className="min-h-11 w-36 bg-white"
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
    <section className="panel">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="eyebrow mb-2">한 게임씩 쌓인 변화</p>
          <h2 className="text-xl font-bold">Elo 흐름</h2>
        </div>
        <Tooltip>
          <TooltipTrigger aria-label="Elo 차트 설명" className="p-2">
            <CircleHelp size={18} />
          </TooltipTrigger>
          <TooltipContent className="max-w-64">
            첫 점은 기간 시작 직전 Elo입니다. 같은 날의 경기도 각각 표시합니다.
          </TooltipContent>
        </Tooltip>
      </div>
      {state.stats.games === 0 ? (
        <div className="grid h-48 place-content-center text-center">
          <p className="text-3xl font-semibold">
            {Math.round(state.stats.current).toLocaleString()}
          </p>
          <p className="muted mt-2">
            이 기간에는 경기가 없어요. Elo는 그대로예요.
          </p>
        </div>
      ) : (
        <ChartContainer
          config={{ rating: { label: "Elo", color: "#343630" } }}
          className="h-64 w-full"
        >
          <LineChart
            accessibilityLayer
            data={state.stats.points}
            margin={{ top: 15, right: 14, bottom: 0, left: -10 }}
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
              width={55}
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
      <p className="mt-3 text-xs text-muted-foreground">
        날짜별 경기 순서 기준 · 점을 눌러 경기 확인
      </p>
    </section>
  );
}
export function StatCards({ state }: { state: State }) {
  const s = state.stats;
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
      <div className="rounded-2xl bg-primary p-5 text-white">
        <p className="text-xs text-white/65">현재 Elo</p>
        <p className="mt-3 text-4xl font-semibold tracking-tight">
          {Math.round(s.current).toLocaleString()}
        </p>
        <p className="mt-3 text-xs text-white/70">
          {s.rank ? `모임 ${s.rank}위` : "순위 미집계"} ·{" "}
          {state.filters.kind === "doubles" ? "복식" : "단식"}
        </p>
      </div>
      <div className="panel !p-5">
        <p className="muted">경기 수</p>
        <p className="mt-3 text-3xl font-semibold">
          {s.games}
          <span className="ml-1 text-sm font-normal text-muted-foreground">
            경기
          </span>
        </p>
        <p className="muted mt-3">
          {s.wins}승 {s.losses}패
        </p>
      </div>
      <div className="panel !p-5">
        <p className="muted">승률</p>
        <p className="mt-3 text-3xl font-semibold">
          {s.winRate.toFixed(0)}
          <span className="text-lg">%</span>
        </p>
        <p className="muted mt-3">선택 기간 기준</p>
      </div>
      <div className="panel !p-5">
        <p className="muted">Elo 변화</p>
        <p className="mt-3 text-3xl font-semibold">{signed(s.change)}</p>
        <p className="muted mt-3">기간 시작 직전 대비</p>
      </div>
    </div>
  );
}
