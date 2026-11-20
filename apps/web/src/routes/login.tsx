import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { OAuthButtons } from "@/components/oauth-buttons";
import { Button } from "@/components/ui/button";
import { api, me } from "@/lib/api";
import type { AuthConfig } from "@/lib/types";
export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    const u = await me();
    if (u)
      throw redirect({
        to:
          u.status !== "active" ? "/join" : u.groups.length ? "/" : "/account",
      });
  },
  component: Login,
});
function Login() {
  const [error, setError] = useState("");
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const load = useCallback(() => {
    setError("");
    api<AuthConfig>("/auth")
      .then(setConfig)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  return (
    <main className="grid min-h-dvh place-items-center px-6 py-10">
      <div className="w-full max-w-md text-center">
        <p className="eyebrow mb-6">우리들의 배드민턴 기록</p>
        <h1 className="text-6xl font-extrabold tracking-tighter">kokko.</h1>
        <img
          src="/kokko.svg"
          alt="배드민턴 라켓을 든 꼬꼬"
          className="mx-auto my-10 h-40 w-40"
        />
        <h2 className="text-3xl font-bold leading-tight">
          함께 친 한 게임,
          <br />
          오래 남는 기록.
        </h2>
        <p className="muted my-5 leading-relaxed">
          승패부터 파트너와의 호흡까지.
          <br />
          우리의 코트 위 이야기를 모아 보세요.
        </p>
        <div className="mt-8">
          {config ? (
            <OAuthButtons providers={config.providers} />
          ) : (
            !error && (
              <p role="status" className="muted">
                로그인 방법을 불러오는 중…
              </p>
            )
          )}
        </div>
        {error && (
          <div className="mt-4 rounded-xl border p-3 text-sm">
            <p role="alert">{error}</p>
            <Button variant="ghost" onClick={load}>
              다시 시도
            </Button>
          </div>
        )}
        <p className="mt-6 text-xs text-muted-foreground">
          {config?.publicSignup
            ? "처음이어도 괜찮아요. 계정으로 로그인하고 닉네임만 정하면 돼요."
            : "처음 오셨나요? 모임의 초대 코드가 필요해요."}
        </p>
        <p className="mt-3 break-keep text-xs leading-relaxed text-muted-foreground">
          이미 기록이 있나요? 기존 로그인 방법으로 들어온 뒤 설정에서 다른
          계정을 연결해 주세요.
        </p>
      </div>
    </main>
  );
}
