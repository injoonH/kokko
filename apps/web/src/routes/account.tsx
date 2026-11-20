import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowUpRight, LogOut, Users } from "lucide-react";
import { OAuthButtons } from "@/components/oauth-buttons";
import { ProfileForm } from "@/components/profile-form";
import { Button } from "@/components/ui/button";
import { api, logout, me } from "@/lib/api";
import { changeGroup } from "@/lib/groups";
import type { AuthConfig } from "@/lib/types";

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
      <section className="panel mb-5" aria-labelledby="my-groups">
        <h2
          id="my-groups"
          className="mb-4 flex items-center gap-2 text-lg font-bold"
        >
          <Users size={20} />
          나의 모임
        </h2>
        {user.groups.length ? (
          <div className="space-y-2">
            {user.groups.map((group) => (
              <Button
                key={group.id}
                variant="outline"
                className="h-12 w-full justify-between"
                onClick={() => {
                  if (changeGroup(user.id, group.id))
                    window.location.assign("/");
                  else
                    window.alert(
                      "저장 결과를 확인 중인 경기가 있어요. 현재 모임에서 저장을 완료한 뒤 이동해 주세요.",
                    );
                }}
              >
                {group.name}
                <ArrowUpRight size={18} />
              </Button>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed p-5">
            <p className="font-medium">첫 모임을 기다리고 있어요</p>
            <p className="muted mt-2 leading-relaxed">
              가입이 완료됐어요. 모임 찾기와 만들기는 곧 열릴 예정이에요. 비공개
              모임의 초대를 받았다면 지금 참여할 수 있어요.
            </p>
          </div>
        )}
        <Link
          to="/join"
          className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm underline"
        >
          비공개 모임 초대 코드 입력
          <ArrowUpRight size={15} />
        </Link>
      </section>
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
