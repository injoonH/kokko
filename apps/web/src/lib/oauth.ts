import type { OAuthProvider } from "./types";

export const providerName = (provider: OAuthProvider) =>
  provider === "google" ? "Google" : "카카오";
export type PendingOAuth = {
  provider: OAuthProvider;
  state: string;
  codeVerifier: string;
  redirect: string;
  created: number;
  mode: "login" | "link";
  accountId: string | null;
};

export function validateOAuthCallback(
  raw: string | null,
  search: string,
  accountId: string | null,
  origin: string,
  now = Date.now(),
) {
  const invalid = () =>
    new Error(
      "인증 요청이 만료되었거나 계정이 달라졌습니다. 다시 시작해 주세요.",
    );
  let pending: PendingOAuth;
  try {
    pending = JSON.parse(raw || "null");
  } catch {
    throw invalid();
  }
  const q = new URLSearchParams(search);
  if (
    !pending ||
    !["google", "kakao"].includes(pending.provider) ||
    !["login", "link"].includes(pending.mode) ||
    typeof pending.created !== "number" ||
    !Number.isFinite(pending.created) ||
    now < pending.created ||
    now - pending.created > 600_000 ||
    pending.redirect !== `${origin}/auth/callback` ||
    typeof pending.state !== "string" ||
    !pending.state ||
    q.get("state") !== pending.state ||
    typeof pending.codeVerifier !== "string" ||
    !/^[A-Za-z0-9._~-]{43,128}$/.test(pending.codeVerifier) ||
    pending.accountId !== accountId ||
    (pending.mode === "link" ? !accountId : accountId !== null)
  ) {
    throw invalid();
  }
  if (q.has("error"))
    throw new Error(
      q.get("error") === "access_denied"
        ? `${providerName(pending.provider)} 인증이 취소되었습니다. 다시 시작할 수 있어요.`
        : `${providerName(pending.provider)} 인증에 실패했습니다. 다시 시도하거나 운영자에게 알려 주세요.`,
    );
  const code = q.get("code");
  if (!code) throw invalid();
  return { pending, code };
}
