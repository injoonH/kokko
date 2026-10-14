import { createFileRoute, redirect } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { googleLogin, me } from "@/lib/api";
export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    const u = await me();
    if (u) throw redirect({ to: u.status === "active" ? "/" : "/join" });
  },
  component: Login,
});
function Login() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
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
        <Button
          className="mt-6 h-13 w-full rounded-xl"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await googleLogin();
            } catch (e) {
              setError((e as Error).message);
              setBusy(false);
            }
          }}
        >
          {busy ? "Google로 이동하는 중…" : "Google로 시작하기"}
          <ArrowRight />
        </Button>
        {error && (
          <p role="alert" className="mt-4 rounded-xl border p-3 text-sm">
            {error}
          </p>
        )}
        <p className="mt-6 text-xs text-muted-foreground">
          처음 오셨나요? 모임의 초대 코드가 필요해요.
        </p>
      </div>
    </main>
  );
}
