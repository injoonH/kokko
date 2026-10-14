import PocketBase from "pocketbase";
import type { Filters, Me, Mutation, State } from "./types";
export const pb = new PocketBase(window.location.origin);
pb.autoCancellation(false);
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const res = await fetch(`/api/kokko${path}`, {
    method,
    headers: {
      Authorization: pb.authStore.token,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => {
    throw new Error(
      "서버에 연결하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.",
    );
  });
  const data = await res
    .json()
    .catch(() => ({ message: "서버 응답을 확인할 수 없습니다." }));
  if (!res.ok) {
    if (res.status === 401) {
      pb.authStore.clear();
    }
    throw new ApiError(
      typeof data.message === "string" && /[가-힣]/.test(data.message)
        ? data.message
        : res.status === 401
          ? "로그인이 만료되었습니다. 다시 로그인해 주세요."
          : res.status === 403
            ? "이 요청을 처리할 권한이 없습니다."
            : res.status === 429
              ? "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."
              : "요청에 실패했습니다. 다시 시도해 주세요.",
      res.status,
    );
  }
  return data;
}
export async function me(): Promise<Me | null> {
  if (!pb.authStore.isValid) return null;
  try {
    return await api<Me>("/me");
  } catch {
    return null;
  }
}
export function getState(filters: Filters) {
  return api<State>(`/state?${new URLSearchParams(filters)}`);
}
export function mutate(q: Mutation) {
  return api("/matches", "POST", q);
}
export async function googleLogin() {
  const methods = await pb
    .collection("users")
    .listAuthMethods()
    .catch(() => {
      throw new Error(
        "로그인 설정을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
    });
  const google = methods.oauth2.providers.find((p) => p.name === "google");
  if (!google)
    throw new Error("Google 로그인 설정이 필요합니다. 운영자에게 알려 주세요.");
  const redirect = `${window.location.origin}/auth/callback`;
  sessionStorage.setItem(
    "kokko.oauth",
    JSON.stringify({ ...google, redirect, created: Date.now() }),
  );
  window.location.assign(google.authURL + encodeURIComponent(redirect));
}
let callback: Promise<void> | undefined;
export function finishGoogle() {
  if (callback) return callback;
  callback = (async () => {
    const raw = sessionStorage.getItem("kokko.oauth");
    if (!raw)
      throw new Error("로그인 요청이 만료되었습니다. 다시 시작해 주세요.");
    const provider = JSON.parse(raw);
    const q = new URLSearchParams(window.location.search);
    if (q.has("error")) throw new Error("Google 로그인이 취소되었습니다.");
    if (
      !q.get("code") ||
      q.get("state") !== provider.state ||
      Date.now() - provider.created > 600_000
    )
      throw new Error("로그인 확인에 실패했습니다. 다시 시작해 주세요.");
    await pb
      .collection("users")
      .authWithOAuth2Code(
        "google",
        q.get("code") as string,
        provider.codeVerifier,
        provider.redirect,
      )
      .catch(() => {
        throw new Error(
          "Google 인증을 완료하지 못했습니다. 다시 로그인해 주세요.",
        );
      });
    sessionStorage.removeItem("kokko.oauth");
    history.replaceState(null, "", "/auth/callback");
  })();
  return callback;
}
