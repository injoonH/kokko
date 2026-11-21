import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, logout, me } from "@/lib/api";
import { parseFilters } from "@/lib/types";
export const Route = createFileRoute("/join")({
  beforeLoad: async () => {
    const user = await me();
    if (!user) throw redirect({ to: "/login" });
    if (user.status === "active")
      throw redirect({ to: "/", search: parseFilters({}) });
    return { user };
  },
  component: Join,
});
function Join() {
  const { user } = Route.useRouteContext();
  const onboarding = user.status !== "active" && user.publicSignup;
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!onboarding)
    return (
      <main className="mx-auto max-w-md px-6 py-16">
        <img src="/kokko.svg" alt="" className="h-24 w-24" />
        <h1 className="page-title my-6">곧 코트가 열려요</h1>
        <p className="muted mb-6">
          신규 가입을 준비 중이에요. 초대 코드 없이 닉네임만 정하고 시작할 수
          있도록 준비하고 있어요.
        </p>
        <Button onClick={logout} className="h-12 w-full">
          로그아웃하고 전체 코트 보기
        </Button>
      </main>
    );
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <img src="/kokko.svg" alt="" className="h-24 w-24" />
      <p className="eyebrow mt-6">나의 첫 코트</p>
      <h1 className="page-title my-4">어떻게 불러 드릴까요?</h1>
      <p className="muted mb-8 leading-relaxed">
        다른 회원에게 보이는 닉네임을 정해 주세요. 누구와 경기하든 같은 닉네임과
        레이팅을 사용해요. 닉네임, 프로필 사진과 확인된 경기 기록은 공개돼요.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api("/onboard", "POST", { nickname: value });
            window.location.replace("/");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor="nickname" className="text-sm font-medium">
          닉네임
        </label>
        <Input
          id="nickname"
          autoComplete="nickname"
          required
          maxLength={20}
          className="mt-2 h-13"
          value={value}
          disabled={busy}
          onChange={(e) => setValue(e.target.value)}
        />
        {onboarding && (
          <p className="muted mt-2">1~20자 · 언제든 변경할 수 있어요.</p>
        )}
        {error && (
          <p role="alert" className="my-3 text-sm">
            {error}
          </p>
        )}
        <Button className="mt-6 h-12 w-full" disabled={busy || !value.trim()}>
          {busy ? "확인 중…" : "닉네임으로 시작하기"}
        </Button>
      </form>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 text-sm">
        <Button variant="ghost" disabled={busy} onClick={logout}>
          다른 계정으로 로그인
        </Button>
      </div>
    </main>
  );
}
