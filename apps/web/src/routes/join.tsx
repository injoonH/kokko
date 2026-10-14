import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api, me, pb } from "@/lib/api";
import { parseFilters } from "@/lib/types";
export const Route = createFileRoute("/join")({
  beforeLoad: async () => {
    const u = await me();
    if (!u) throw redirect({ to: "/login" });
    if (u.status === "active")
      throw redirect({ to: "/", search: parseFilters({}) });
    return { user: u };
  },
  component: Join,
});
function Join() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <main className="mx-auto max-w-md px-6 py-20">
      <img src="/kokko.svg" alt="" className="h-24 w-24" />
      <h1 className="page-title my-5">코트에 오신 걸 환영해요</h1>
      <p className="muted mb-8">
        관리자에게 받은 초대 코드로 모임에 참여하세요.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api("/redeem", "POST", { code });
            window.location.replace("/");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor="invite" className="text-sm font-medium">
          초대 코드
        </label>
        <input
          id="invite"
          autoComplete="off"
          required
          className="field mt-2"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        {error && (
          <p role="alert" className="my-3 text-sm">
            {error}
          </p>
        )}
        <Button className="mt-5 h-12 w-full" disabled={busy}>
          {busy ? "확인 중…" : "모임 참여하기"}
        </Button>
      </form>
      <button
        type="button"
        className="mt-6 text-sm underline"
        onClick={() => {
          pb.authStore.clear();
          window.location.assign("/login");
        }}
      >
        다른 Google 계정으로 로그인
      </button>
    </main>
  );
}
