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
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4 md:h-16 lg:gap-3 lg:px-8">
          <Link
            to="/"
            search={parseFilters({})}
            className="flex items-center gap-2"
            aria-label="kokko 홈"
          >
            <img src="/kokko.svg" alt="" className="size-7 md:size-8" />
            <span className="text-xl font-extrabold tracking-tighter md:text-2xl">
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
                {n.to === "/inbox" && <PendingBadge count={user?.pending} />}
              </Link>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <Link
              to={user ? "/matches/new" : "/login"}
              className="action bg-primary px-3 text-sm whitespace-nowrap text-white"
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
        className="mx-auto max-w-6xl px-4 pt-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:py-6 lg:px-8"
      >
        <Outlet />
      </main>
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
            className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${pathname === n.to ? "font-bold" : "text-muted-foreground"}`}
          >
            <span className="relative">
              <n.icon size={18} />
              {n.to === "/inbox" && (
                <span className="absolute -top-1.5 left-3">
                  <PendingBadge count={user?.pending} />
                </span>
              )}
            </span>
            {n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function PendingBadge({ count = 0 }: { count?: number }) {
  if (count < 1) return null;
  return (
    <span className="ml-1 inline-block min-w-4 rounded-full bg-primary px-1 text-center text-[10px] leading-4 font-bold text-primary-foreground">
      <span className="sr-only">확인할 경기 </span>
      {count > 99 ? "99+" : count}
      <span className="sr-only">개</span>
    </span>
  );
}

function AccountMenu({ user }: { user: Me }) {
  const item =
    "flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-3 text-sm outline-none data-highlighted:bg-muted";
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
          className="z-50 min-w-40 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
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
