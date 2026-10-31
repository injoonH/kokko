import { doublesPairings } from "./rotation";
import type { Profile, State } from "./types";

export type CourtState = Pick<
  State,
  "me" | "today" | "profiles" | "rankings" | "allMatches"
>;
export type CourtPlayer = Profile & {
  rating: number;
  games: number;
  lastOrder: number;
};
export type CourtPlan = {
  slots: string[];
  expectedA: number;
  ratingA: number;
  ratingB: number;
};

export function courtPlayers(state: CourtState): CourtPlayer[] {
  const today = state.allMatches.filter(
    (m) => !m.deleted && m.date === state.today,
  );
  return state.profiles
    .filter((p) => p.status === "active")
    .map((p) => {
      const played = today.filter((m) => [...m.a, ...m.b].includes(p.id));
      return {
        ...p,
        rating:
          state.rankings.find(
            (r) => r.kind === "doubles" && r.playerId === p.id,
          )?.rating ?? 1000,
        games: played.length,
        lastOrder: Math.max(0, ...played.map((m) => m.order)),
      };
    });
}

export function courtRoster(ids: unknown, state: CourtState): string[] {
  const selected = new Set(Array.isArray(ids) ? ids : []);
  selected.add(state.me.id);
  return state.profiles
    .filter((p) => p.status === "active" && selected.has(p.id))
    .map((p) => p.id)
    .sort();
}

const pairKey = (ids: string[]) => JSON.stringify([...ids].sort());

export function suggestDoubles(
  state: CourtState,
  roster: readonly string[],
): CourtPlan[] {
  const players = new Map(courtPlayers(state).map((p) => [p.id, p]));
  const others = [...new Set(roster)]
    .filter((id) => id !== state.me.id && players.has(id))
    .sort();
  if (
    !roster.includes(state.me.id) ||
    !players.has(state.me.id) ||
    others.length < 3
  )
    return [];
  const partnerships = new Map<string, number>();
  for (const m of state.allMatches) {
    if (m.deleted || m.date !== state.today || m.kind !== "doubles") continue;
    for (const team of [m.a, m.b]) {
      const key = pairKey(team);
      partnerships.set(key, (partnerships.get(key) ?? 0) + 1);
    }
  }
  const candidates: (CourtPlan & { priority: number[] })[] = [];
  for (let i = 0; i < others.length - 2; i++) {
    for (let j = i + 1; j < others.length - 1; j++) {
      for (let k = j + 1; k < others.length; k++) {
        const guests = [others[i], others[j], others[k]];
        const turns = guests.map((id) => players.get(id) as CourtPlayer);
        const games = turns.map((p) => p.games).sort((a, b) => b - a);
        const lastPlayed = turns.map((p) => p.lastOrder).sort((a, b) => b - a);
        for (const slots of doublesPairings(
          [state.me.id, ...guests],
          state.me.id,
        )) {
          const rating = (id: string) => players.get(id)?.rating ?? 1000;
          const ratingA = (rating(slots[0]) + rating(slots[1])) / 2;
          const ratingB = (rating(slots[2]) + rating(slots[3])) / 2;
          const expectedA = 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
          const imbalance = Math.abs(expectedA - 0.5);
          const repeats =
            (partnerships.get(pairKey(slots.slice(0, 2))) ?? 0) +
            (partnerships.get(pairKey(slots.slice(2))) ?? 0);
          candidates.push({
            slots,
            expectedA,
            ratingA,
            ratingB,
            // First give less-played, longer-rested friends a turn. Among
            // similarly balanced teams (5 percentage-point bands), vary partners.
            priority: [
              ...games,
              ...lastPlayed,
              Math.floor((imbalance + 1e-12) / 0.05),
              repeats,
              imbalance,
            ],
          });
        }
      }
    }
  }
  candidates.sort((a, b) => {
    for (let i = 0; i < a.priority.length; i++) {
      const difference = a.priority[i] - b.priority[i];
      if (Math.abs(difference) > 1e-12) return difference;
    }
    return (
      pairKey(a.slots.slice(0, 2)).localeCompare(
        pairKey(b.slots.slice(0, 2)),
      ) || a.slots.join().localeCompare(b.slots.join())
    );
  });
  return candidates
    .slice(0, 3)
    .map(({ slots, expectedA, ratingA, ratingB }) => ({
      slots,
      expectedA,
      ratingA,
      ratingB,
    }));
}
