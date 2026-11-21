import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useRouterState,
} from "@tanstack/react-router";
import { Home, Inbox, ListOrdered, Plus, Settings, Users } from "lucide-react";
import { me } from "@/lib/api";
import { parseFilters } from "@/lib/types";
export const Route = createFileRoute("/_member")({
  beforeLoad: async () => {
    const user = await me();
    if (user && user.status !== "active") throw redirect({ to: "/join" });
    return { user };
  },
  component: Layout,
});
function Layout() {
  const { user } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const nav = [
    { to: "/" as const, label: "전체 코트", icon: Home },
    { to: "/history" as const, label: "경기 기록", icon: ListOrdered },
    { to: "/friends" as const, label: "친구", icon: Users },
    { to: "/inbox" as const, label: "확인함", icon: Inbox },
    { to: "/settings" as const, label: "설정", icon: Settings },
  ];
  return (
    <div className="min-h-dvh">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:bg-white focus:p-4"
      >
        본문으로 이동
      </a>
      <header className="border-b bg-background/95">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-3 px-5 md:px-10">
          <Link
            to="/"
            search={parseFilters({})}
            className="flex items-center gap-2"
            aria-label="kokko 홈"
          >
            <img src="/kokko.svg" alt="" className="h-10 w-10" />
            <span className="text-3xl font-extrabold tracking-tighter">
              kokko.
            </span>
          </Link>
          <nav className="hidden gap-5 lg:flex" aria-label="주 메뉴">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={`py-2 text-sm ${pathname === n.to ? "border-b-2 border-primary font-bold" : "text-muted-foreground"}`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <Link
            to={user ? "/matches/new" : "/login"}
            className="action bg-primary text-white text-sm"
          >
            <Plus size={17} />
            {user ? "경기 기록" : "로그인"}
          </Link>
        </div>
      </header>
      <main
        id="content"
        className="mx-auto max-w-6xl px-5 py-8 pb-28 md:px-10 md:py-12"
      >
        <Outlet />
      </main>
      <footer className="mx-auto hidden max-w-6xl justify-between border-t px-10 py-7 text-xs text-muted-foreground md:flex">
        <span>함께 친 한 게임, 오래 남는 기록.</span>
        <span>kokko · 어디서 치든, 나의 기록</span>
      </footer>
      <nav
        aria-label="모바일 메뉴"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {nav.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            className={`flex min-h-17 flex-col items-center justify-center gap-1 text-[11px] ${pathname === n.to ? "font-bold" : "text-muted-foreground"}`}
          >
            <n.icon size={20} />
            {n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
