import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { finishOAuth, pb } from "@/lib/api";
export const Route = createFileRoute("/auth/callback")({ component: Callback });
function Callback() {
  const [error, setError] = useState("");
  useEffect(() => {
    finishOAuth()
      .then((path) => window.location.replace(path))
      .catch((e) => setError(e.message));
  }, []);
  return (
    <main className="mx-auto max-w-md p-8 text-center">
      <img src="/kokko.svg" alt="" className="mx-auto h-24" />
      <h1 className="my-6 text-2xl font-bold">로그인 확인</h1>
      {error ? (
        <>
          <p role="alert" className="break-keep leading-relaxed">
            {error}
          </p>
          <a
            className="action mt-6 border"
            href={pb.authStore.isValid ? "/account" : "/login"}
          >
            {pb.authStore.isValid ? "내 계정으로 돌아가기" : "다시 로그인"}
          </a>
        </>
      ) : (
        <p role="status">계정 인증을 확인하고 있어요…</p>
      )}
    </main>
  );
}
