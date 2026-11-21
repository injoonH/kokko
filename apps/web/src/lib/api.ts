import PocketBase, { BaseAuthStore } from "pocketbase";
import {
  type PendingOAuth,
  providerName,
  validateOAuthCallback,
} from "./oauth";
import type {
  Filters,
  Me,
  Mutation,
  OAuthProvider,
  Profile,
  Proposal,
  State,
} from "./types";
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
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) pb.authStore.clear();
    return null;
  }
}
function rememberedPlayers() {
  const user = pb.authStore.record?.id || "";
  const ids = new Set<string>();
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (
        !(
          key.startsWith(`kokko.draft.${user}.`) ||
          key.startsWith(`kokko.lineup.${user}.`) ||
          key.startsWith(`kokko.court.${user}.`)
        )
      )
        continue;
      const value = JSON.parse(sessionStorage.getItem(key) || "null");
      for (const id of Array.isArray(value) ? value : value?.slots || [])
        if (typeof id === "string" && id) ids.add(id);
    }
    for (const id of JSON.parse(
      sessionStorage.getItem(`kokko.players.${user}`) || "[]",
    ))
      if (typeof id === "string") ids.add(id);
  } catch {}
  return [...ids].slice(0, 100);
}
export function rememberPlayer(player: Profile) {
  const ids = [
    player.id,
    ...rememberedPlayers().filter((id) => id !== player.id),
  ].slice(0, 100);
  sessionStorage.setItem(
    `kokko.players.${pb.authStore.record?.id || ""}`,
    JSON.stringify(ids),
  );
}
export function getState(
  filters: Filters,
  page = 0,
  at = "",
  ids: string[] = [],
) {
  const allIds = [...new Set([...ids, ...rememberedPlayers()])].slice(0, 100);
  return api<State>(
    `/arena/state?${new URLSearchParams({ ...filters, page: String(page), at, ids: allIds.join(",") })}`,
  );
}
export function mutate(q: Mutation, legacy = false) {
  if (legacy || q.groupId)
    return api<{ legacy: true; match: import("./types").Match }>(
      "/matches",
      "POST",
      q,
    );
  return api<Proposal>("/arena/proposals", "POST", q);
}
export function decide(
  proposal: Proposal,
  decision: "confirm" | "reject" | "cancel",
) {
  return api<Proposal>(`/arena/proposals/${proposal.id}`, "POST", {
    decision,
    version: proposal.version,
  });
}
export async function beginOAuth(
  provider: OAuthProvider,
  mode: "login" | "link" = "login",
) {
  const accountId = pb.authStore.isValid
    ? pb.authStore.record?.id || null
    : null;
  if (mode === "link" ? !accountId : accountId !== null)
    throw new Error("계정 상태가 달라졌습니다. 페이지를 새로고침해 주세요.");
  const methods = await pb
    .collection("users")
    .listAuthMethods()
    .catch(() => {
      throw new Error(
        "로그인 설정을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
    });
  const selected = methods.oauth2.providers.find((p) => p.name === provider);
  if (!selected)
    throw new Error(
      `${providerName(provider)} 로그인 설정이 필요합니다. 운영자에게 알려 주세요.`,
    );
  const redirect = `${window.location.origin}/auth/callback`;
  const pending: PendingOAuth = {
    provider,
    mode,
    accountId,
    redirect,
    created: Date.now(),
    state: selected.state,
    codeVerifier: selected.codeVerifier,
  };
  sessionStorage.setItem("kokko.oauth", JSON.stringify(pending));
  window.location.assign(selected.authURL + encodeURIComponent(redirect));
}
let callback: Promise<"/" | "/account"> | undefined;
export function finishOAuth() {
  if (callback) return callback;
  callback = (async () => {
    const raw = sessionStorage.getItem("kokko.oauth");
    const search = window.location.search;
    sessionStorage.removeItem("kokko.oauth");
    history.replaceState(null, "", "/auth/callback");
    const accountId = pb.authStore.isValid
      ? pb.authStore.record?.id || null
      : null;
    const { pending, code } = validateOAuthCallback(
      raw,
      search,
      accountId,
      window.location.origin,
    );
    try {
      // Isolate the response until the account binding has been rechecked. A
      // login/logout in another tab must not silently replace the current user.
      const client = new PocketBase(
        window.location.origin,
        new BaseAuthStore(),
      );
      if (pending.mode === "link")
        client.authStore.save(pb.authStore.token, pb.authStore.record);
      const result = await client
        .collection("users")
        .authWithOAuth2Code(
          pending.provider,
          code,
          pending.codeVerifier,
          pending.redirect,
          undefined,
          {
            query: pending.mode === "link" ? { kokkoMode: "link" } : {},
            headers: {
              Authorization: pending.mode === "link" ? pb.authStore.token : "",
            },
          },
        );
      const currentId = pb.authStore.isValid
        ? pb.authStore.record?.id || null
        : null;
      if (
        currentId !== accountId ||
        (pending.mode === "link" && result.record.id !== accountId)
      )
        throw new Error("인증 중 계정이 달라졌습니다. 다시 시작해 주세요.");
      pb.authStore.save(result.token, result.record);
    } catch (e) {
      const response = e as { response?: { message?: string } };
      throw new Error(
        response.response?.message && /[가-힣]/.test(response.response.message)
          ? response.response.message
          : `${providerName(pending.provider)} 인증을 완료하지 못했습니다. 계정 상태를 확인하고 다시 시작해 주세요.`,
      );
    }
    return pending.mode === "link" ? "/account" : "/";
  })();
  return callback;
}
export function logout() {
  pb.authStore.clear();
  for (const key of Object.keys(sessionStorage)) {
    if (key.startsWith("kokko.")) sessionStorage.removeItem(key);
  }
  window.location.assign("/login");
}
