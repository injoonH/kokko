import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, logout, me } from "@/lib/api";
export const Route = createFileRoute("/join")({
  beforeLoad: async () => {
    const user = await me();
    if (!user) throw redirect({ to: "/login" });
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
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <img src="/kokko.svg" alt="" className="h-24 w-24" />
      <p className="eyebrow mt-6">
        {onboarding ? "나의 첫 코트" : "함께할 모임"}
      </p>
      <h1 className="page-title my-4">
        {onboarding ? "어떻게 불러 드릴까요?" : "모임에 참여하기"}
      </h1>
      <p className="muted mb-8 leading-relaxed">
        {onboarding
          ? "다른 회원에게 보이는 닉네임을 정해 주세요. 모임이 달라도 같은 닉네임과 레이팅을 사용해요."
          : "비공개 모임의 관리자에게 받은 초대 코드를 입력하세요."}
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api(
              onboarding ? "/onboard" : "/redeem",
              "POST",
              onboarding ? { nickname: value } : { code: value },
            );
            window.location.replace(onboarding ? "/account" : "/");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label
          htmlFor={onboarding ? "nickname" : "invite"}
          className="text-sm font-medium"
        >
          {onboarding ? "닉네임" : "초대 코드"}
        </label>
        <Input
          id={onboarding ? "nickname" : "invite"}
          autoComplete={onboarding ? "nickname" : "off"}
          required
          maxLength={onboarding ? 20 : 80}
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
          {busy
            ? "확인 중…"
            : onboarding
              ? "닉네임으로 시작하기"
              : "모임 참여하기"}
        </Button>
      </form>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 text-sm">
        {user.status === "active" && (
          <Link to="/account" className="underline">
            내 계정으로
          </Link>
        )}
        <Button variant="ghost" disabled={busy} onClick={logout}>
          다른 계정으로 로그인
        </Button>
      </div>
    </main>
  );
}
