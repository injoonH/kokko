import { ArrowRight, Check } from "lucide-react";
import { useState } from "react";
import { beginOAuth } from "@/lib/api";
import { providerName } from "@/lib/oauth";
import type { OAuthProvider } from "@/lib/types";
import { Button } from "./ui/button";

export function OAuthButtons({
  providers,
  linked = [],
  mode = "login",
}: {
  providers: OAuthProvider[];
  linked?: OAuthProvider[];
  mode?: "login" | "link";
}) {
  const [busy, setBusy] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState("");
  return (
    <div className="space-y-3">
      {providers.map((provider) => {
        const connected = linked.includes(provider);
        const label = connected
          ? `${providerName(provider)} 연결됨`
          : mode === "link"
            ? `${providerName(provider)} 계정 연결`
            : provider === "kakao"
              ? "카카오 로그인"
              : "Google로 시작하기";
        return (
          <Button
            key={provider}
            variant={mode === "link" ? "outline" : "default"}
            className={`h-13 w-full rounded-xl ${provider === "kakao" && !connected ? "border-transparent bg-[#FEE500] text-black/85 hover:bg-[#FEE500]/90" : ""}`}
            disabled={busy !== null || connected}
            onClick={async () => {
              setBusy(provider);
              setError("");
              try {
                await beginOAuth(provider, mode);
              } catch (e) {
                setError((e as Error).message);
                setBusy(null);
              }
            }}
          >
            {provider === "kakao" && (
              <img src="/kakao-symbol.svg" alt="" className="h-5 w-5" />
            )}
            {busy === provider
              ? `${providerName(provider)}로 이동하는 중…`
              : label}
            {connected ? <Check /> : <ArrowRight />}
          </Button>
        );
      })}
      {providers.length === 0 && (
        <p className="rounded-xl border p-4 text-sm">
          로그인 준비 중이에요. 잠시 후 다시 방문해 주세요.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl border p-3 text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
