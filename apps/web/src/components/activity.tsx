import { useEffect, useRef, useState } from "react";
import { playerActivity, shiftDate } from "@/lib/activity";
import type { Match } from "@/lib/types";

const shades = [
  "bg-neutral-100",
  "bg-neutral-300",
  "bg-neutral-400",
  "bg-neutral-600",
  "bg-neutral-900",
];

export function PlayerActivity({
  matches,
  playerId,
  today,
}: {
  matches: Match[];
  playerId: string;
  today: string;
}) {
  const activity = playerActivity(matches, playerId, today);
  const [selected, setSelected] = useState(today);
  const calendar = useRef<HTMLFieldSetElement>(null);
  const start = activity.days[0].date;
  const leading = new Date(`${start}T00:00:00Z`).getUTCDay();
  const cells = [
    ...Array.from({ length: leading }, () => null),
    ...activity.days,
  ];
  const weeks = Math.ceil(cells.length / 7);
  const selectedDay = activity.days.find((day) => day.date === selected);
  const date = selectedDay?.date ?? today;
  const count = selectedDay?.count ?? activity.days[364].count;

  useEffect(() => {
    setSelected(today);
    if (calendar.current)
      calendar.current.scrollLeft = calendar.current.scrollWidth;
  }, [today]);

  return (
    <section className="panel min-w-0" aria-label="배드민턴 스트릭">
      <h2 className="text-xl font-bold">차곡차곡, 코트에 나온 날</h2>
      <p className="muted mt-2">
        단식·복식, 승패와 관계없이 함께한 기록이에요.
      </p>
      <dl className="my-5 grid grid-cols-3 gap-2">
        {[
          ["현재 연속", activity.current],
          ["최장 연속", activity.longest],
          ["최근 365일 활동", activity.activeDays],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-neutral-50 px-2 py-3">
            <dt className="min-h-8 text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums">
              {value}
              <span className="ml-1 text-sm font-normal">일</span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="mb-3 text-sm font-medium">
        최근 365일 · {activity.games}경기
      </p>
      <div className="flex gap-2">
        <div
          aria-hidden="true"
          className="grid shrink-0 self-start grid-rows-[repeat(7,16px)] gap-0.5 pt-7 text-[10px] leading-4 text-muted-foreground"
        >
          {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <fieldset
          ref={calendar}
          className="min-w-0 overflow-x-auto pb-2"
          aria-label="최근 365일 활동 달력"
        >
          <div className="w-max p-1">
            <div
              className="mb-2 grid h-4 gap-0.5 text-[10px] text-muted-foreground"
              style={{ gridTemplateColumns: `repeat(${weeks}, 16px)` }}
              aria-hidden="true"
            >
              {Array.from({ length: weeks }, (_, week) => {
                const first = cells
                  .slice(week * 7, week * 7 + 7)
                  .find((day) => day?.date.endsWith("-01"));
                return (
                  <span
                    key={shiftDate(start, week * 7 - leading)}
                    className="whitespace-nowrap"
                  >
                    {first ? `${Number(first.date.slice(5, 7))}월` : ""}
                  </span>
                );
              })}
            </div>
            <div
              className="grid grid-flow-col grid-rows-7 gap-0.5"
              style={{ gridTemplateColumns: `repeat(${weeks}, 16px)` }}
            >
              {cells.map((day, index) =>
                day ? (
                  <button
                    key={day.date}
                    type="button"
                    data-date={day.date}
                    aria-label={`${day.date} · ${day.count}경기`}
                    aria-pressed={date === day.date}
                    title={`${day.date} · ${day.count}경기`}
                    tabIndex={date === day.date ? 0 : -1}
                    className={`size-4 rounded-[3px] border border-black/5 ${shades[Math.min(day.count, 4)]} ${date === day.date ? "ring-2 ring-neutral-900 ring-offset-1" : ""} focus-visible:outline-2 focus-visible:outline-offset-2`}
                    onClick={() => setSelected(day.date)}
                    onFocus={() => setSelected(day.date)}
                    onKeyDown={(event) => {
                      const offset = {
                        ArrowLeft: -7,
                        ArrowRight: 7,
                        ArrowUp: -1,
                        ArrowDown: 1,
                      }[event.key];
                      if (
                        offset === undefined &&
                        event.key !== "Home" &&
                        event.key !== "End"
                      )
                        return;
                      event.preventDefault();
                      const next =
                        event.key === "Home"
                          ? start
                          : event.key === "End"
                            ? today
                            : shiftDate(day.date, offset ?? 0);
                      if (next < start || next > today) return;
                      calendar.current
                        ?.querySelector<HTMLButtonElement>(
                          `[data-date="${next}"]`,
                        )
                        ?.focus();
                    }}
                  />
                ) : (
                  <span
                    key={shiftDate(start, index - leading)}
                    aria-hidden="true"
                    className="size-4"
                  />
                ),
              )}
            </div>
          </div>
        </fieldset>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>옆으로 밀어 이전 날짜를 볼 수 있어요.</span>
        <div className="flex items-center gap-1">
          <span className="sr-only">
            색이 진할수록 경기가 많아요: 0, 1, 2, 3, 4경기 이상.
          </span>
          <span className="mr-1">적음</span>
          {shades.map((shade) => (
            <span key={shade} className={`size-3 rounded-[2px] ${shade}`} />
          ))}
          <span className="ml-1">많음</span>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-4">
        <label className="text-sm" htmlFor="activity-date">
          날짜별 기록
        </label>
        <input
          id="activity-date"
          type="date"
          min={start}
          max={today}
          value={date}
          className="min-h-11 min-w-0 rounded-lg border bg-background px-2 text-sm"
          onChange={(event) => {
            const next = event.target.value;
            if (next >= start && next <= today) {
              setSelected(next);
              calendar.current
                ?.querySelector(`[data-date="${next}"]`)
                ?.scrollIntoView({ block: "nearest", inline: "nearest" });
            }
          }}
        />
        <p role="status" className="w-full text-sm font-medium">
          {date} · {count}경기
        </p>
      </div>
      {activity.games === 0 && (
        <p className="muted mt-3">
          최근 365일에 기록한 경기가 없어요. 첫 경기부터 한 칸씩 채워봐요.
        </p>
      )}
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        한국 날짜 기준 · 하루 한 경기 이상이면 활동한 날이에요. 오늘 아직
        경기하지 않아도 어제까지의 연속 기록은 유지돼요. 최장 연속은 전체 기록
        기준이며, 위 필터와 관계없이 표시해요.
      </p>
    </section>
  );
}
