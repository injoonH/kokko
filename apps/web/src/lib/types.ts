export type Kind = "singles" | "doubles";
export type Filters = {
  kind: Kind;
  period: "7" | "30" | "90" | "all";
  player: string;
  result: "" | "win" | "loss";
};
export type Match = {
  groupId: string;
  id: string;
  kind: Kind;
  date: string;
  order: number;
  a: string[];
  b: string[];
  scoreA: number;
  scoreB: number;
  author: string;
  version: number;
  deleted: boolean;
  created: string;
  updated: string;
};
export type Profile = {
  id: string;
  nickname: string;
  avatar: string;
  status: string;
  handle?: string;
  selectable?: boolean;
};
export type Rating = {
  matchId: string;
  playerId: string;
  kind: Kind;
  before: number;
  after: number;
  delta: number;
  expected: number;
  beforeRD: number;
  afterRD: number;
};
export type Ranking = {
  playerId: string;
  kind: Kind;
  rating: number;
  rd: number;
  lastPlayed: string;
  games: number;
  rank: number;
};
export type Pair = {
  playerId: string;
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  synergy: number | null;
};
export type Point = {
  id: string;
  date: string;
  order: number;
  rating: number;
  delta: number;
  label: string;
  score: string;
};
export type State = {
  me: { id: string; role: string; serviceRole: string };
  group: Group;
  today: string;
  revision: number;
  profiles: Profile[];
  matches: Match[];
  allMatches: Match[];
  deleted: Match[];
  ratings: Rating[];
  rankings: Ranking[];
  days: Record<string, number>;
  filters: Filters;
  activity?: Activity;
  hasMore?: boolean;
  chartTruncated?: boolean;
  dayTruncated?: boolean;
  planningMatches?: Match[];
  friends?: string[];
  pending?: number;
  stats: {
    games: number;
    wins: number;
    losses: number;
    winRate: number;
    change: number;
    current: number;
    rank: number;
    points: Point[];
    partners: Pair[];
    opponents: Pair[];
  };
};
export type Activity = {
  current: number;
  longest: number;
  activeDays: number;
  games: number;
  days: { date: string; count: number }[];
};
export type Proposal = {
  id: string;
  matchId: string;
  actor: string;
  action: Mutation["action"];
  baseVersion: number;
  version: number;
  status: "pending" | "confirmed" | "rejected" | "cancelled" | "superseded";
  confirmedBy: string;
  created: string;
  resolved: string;
  match: Match;
  before?: Match;
};
export type Social = {
  friends: Profile[];
  incoming: Profile[];
  outgoing: Profile[];
  blocked: Profile[];
  hasMore?: boolean;
};
export type Standings = {
  profiles: Profile[];
  rankings: Ranking[];
  hasMore: boolean;
  page: number;
};
export type Mutation = {
  groupId?: string;
  requestId: string;
  action: "create" | "edit" | "move" | "delete" | "restore";
  id?: string;
  version?: number;
  kind?: Kind;
  date?: string;
  a?: string[];
  b?: string[];
  scoreA?: number;
  scoreB?: number;
  position?: number;
  dayVersions?: Record<string, number>;
};
export type Group = {
  id: string;
  name: string;
  visibility: "private" | "open";
  role: "owner" | "moderator" | "member";
};
export type OAuthProvider = "google" | "kakao";
export type AuthConfig = { publicSignup: boolean; providers: OAuthProvider[] };
export type Me = {
  id: string;
  status: string;
  role: string;
  groups: Group[];
  profile: Profile | null;
  providers: OAuthProvider[];
  publicSignup: boolean;
};
export type Invite = {
  id: string;
  created: string;
  expires: string;
  disabled: boolean;
  redeemedBy: string;
};
export function parseFilters(raw: Record<string, unknown>): Filters {
  return {
    kind: raw.kind === "singles" ? "singles" : "doubles",
    period: ["7", "30", "90", "all"].includes(String(raw.period))
      ? (String(raw.period) as Filters["period"])
      : "30",
    player: typeof raw.player === "string" ? raw.player : "",
    result: raw.result === "win" || raw.result === "loss" ? raw.result : "",
  };
}
export function validScore(a: number, b: number) {
  if (!Number.isInteger(a) || !Number.isInteger(b)) return false;
  const hi = Math.max(a, b),
    lo = Math.min(a, b);
  return (
    lo >= 0 &&
    ((hi === 21 && lo <= 19) ||
      (hi >= 22 && hi <= 29 && lo === hi - 2) ||
      (hi === 30 && (lo === 28 || lo === 29)))
  );
}

export function winningScore(opponent: number): number | null {
  if (!Number.isInteger(opponent) || opponent < 0 || opponent >= 30)
    return null;
  return Math.min(30, Math.max(21, opponent + 2));
}
