import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useRouterState,
} from "@tanstack/react-router";
import {
  Home,
  Inbox,
  ListOrdered,
  Plus,
  Settings,
  Trophy,
  UserRound,
  Users,
} from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { Avatar } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { me } from "@/lib/api";
import { type Me, parseFilters } from "@/lib/types";
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
    { to: "/" as const, label: "홈", icon: Home },
    { to: "/leaderboard" as const, label: "전체 순위", icon: Trophy },
    { to: "/history" as const, label: "경기 기록", icon: ListOrdered },
    { to: "/friends" as const, label: "친구", icon: Users },
    { to: "/inbox" as const, label: "확인함", icon: Inbox },
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
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-2 px-4 lg:gap-3 lg:px-10">
          <Link
            to="/"
            search={parseFilters({})}
            className="flex items-center gap-2"
            aria-label="kokko 홈"
          >
            <img src="/kokko.svg" alt="" className="size-8 sm:size-10" />
            <span className="text-2xl font-extrabold tracking-tighter sm:text-3xl">
              kokko.
            </span>
          </Link>
          <nav className="hidden gap-3 md:flex lg:gap-5" aria-label="주 메뉴">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                activeOptions={{ exact: true, includeSearch: false }}
                aria-current={pathname === n.to ? "page" : undefined}
                className={`min-h-11 content-center text-sm whitespace-nowrap ${pathname === n.to ? "border-b-2 border-primary font-bold" : "text-muted-foreground"}`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <Link
              to={user ? "/matches/new" : "/login"}
              className="action bg-primary text-sm whitespace-nowrap text-white"
            >
              <Plus size={17} />
              {user ? "경기 기록" : "로그인"}
            </Link>
            {user && <AccountMenu user={user} />}
          </div>
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
            activeOptions={{ exact: true, includeSearch: false }}
            aria-current={pathname === n.to ? "page" : undefined}
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

function AccountMenu({ user }: { user: Me }) {
  const item =
    "flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm outline-none data-highlighted:bg-muted";
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="내 계정 메뉴"
          className="size-11 rounded-full"
        >
          <Avatar profile={user.profile ?? undefined} size="small" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-40 rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          <DropdownMenu.Item asChild>
            <Link
              to="/players/$playerId"
              params={{ playerId: user.id }}
              search={parseFilters({})}
              className={item}
            >
              <UserRound size={16} />내 프로필
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link to="/settings" className={item}>
              <Settings size={16} />
              설정
            </Link>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
