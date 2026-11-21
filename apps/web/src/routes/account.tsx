import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowUpRight, LogOut } from "lucide-react";
import { OAuthButtons } from "@/components/oauth-buttons";
import { ProfileForm } from "@/components/profile-form";
import { Button } from "@/components/ui/button";
import { api, logout, me } from "@/lib/api";
import type { AuthConfig } from "@/lib/types";
import { parseFilters } from "@/lib/types";

export const Route = createFileRoute("/account")({
  beforeLoad: async () => {
    const user = await me();
    if (!user) throw redirect({ to: "/login" });
    if (user.status !== "active") throw redirect({ to: "/join" });
    const config = await api<AuthConfig>("/auth");
    return { user, config };
  },
  component: Account,
});
function Account() {
  const { user, config } = Route.useRouteContext();
  return (
    <main className="mx-auto max-w-xl px-5 py-10">
      <div className="mb-9 flex items-center justify-between">
        <span className="text-3xl font-extrabold tracking-tighter">kokko.</span>
        <Button variant="ghost" onClick={logout}>
          <LogOut />
          로그아웃
        </Button>
      </div>
      <p className="eyebrow mb-3">어디서 치든, 나의 기록</p>
      <h1 className="page-title mb-7">내 계정</h1>
      <Link
        to="/"
        search={parseFilters({})}
        className="action mb-6 w-full border"
      >
        전체 코트로 돌아가기
        <ArrowUpRight size={18} />
      </Link>
      {user.profile && (
        <ProfileForm profile={user.profile} refresh={() => {}} />
      )}
      <section className="panel mt-5" aria-labelledby="linked-accounts">
        <h2 id="linked-accounts" className="text-lg font-bold">
          로그인 계정 연결
        </h2>
        <p className="muted mb-5 mt-2 leading-relaxed">
          다른 로그인 방식을 연결해도 같은 회원으로 로그인해요. 닉네임과 레이팅,
          지난 기록이 이어져요. 이미 다른 회원이 사용하는 계정은 연결할 수
          없어요.
        </p>
        <OAuthButtons
          providers={[...new Set([...config.providers, ...user.providers])]}
          linked={user.providers}
          mode="link"
        />
      </section>
      <p className="muted mt-6 text-center">
        이메일과 로그인 계정 정보는 다른 회원에게 공개되지 않아요.
      </p>
    </main>
  );
}
