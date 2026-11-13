import type { Match } from "./types";

const DAY = 86_400_000;

// Match dates are Korean civil dates. UTC arithmetic avoids browser timezone/DST shifts.
export function shiftDate(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY)
    .toISOString()
    .slice(0, 10);
}

export function playerActivity(
  matches: readonly Pick<Match, "date" | "a" | "b" | "deleted">[],
  playerId: string,
  today: string,
) {
  const counts = new Map<string, number>();
  for (const match of matches) {
    if (
      match.deleted ||
      match.date > today ||
      !(match.a.includes(playerId) || match.b.includes(playerId))
    )
      continue;
    counts.set(match.date, (counts.get(match.date) ?? 0) + 1);
  }
  const dates = [...counts.keys()].sort();
  let run = 0;
  let longest = 0;
  let previous = "";
  for (const date of dates) {
    run = previous && shiftDate(previous, 1) === date ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = date;
  }
  const current =
    previous === today || previous === shiftDate(today, -1) ? run : 0;
  const days = Array.from({ length: 365 }, (_, index) => {
    const date = shiftDate(today, index - 364);
    return { date, count: counts.get(date) ?? 0 };
  });
  return {
    current,
    longest,
    days,
    activeDays: days.filter((day) => day.count > 0).length,
    games: days.reduce((sum, day) => sum + day.count, 0),
  };
}
