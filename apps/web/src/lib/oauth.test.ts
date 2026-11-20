import { describe, expect, it } from "vitest";
import { type PendingOAuth, validateOAuthCallback } from "./oauth";

const now = 1_000_000;
const origin = "https://kokko.example";
const login: PendingOAuth = {
  provider: "google",
  state: "random-state",
  codeVerifier: "a".repeat(43),
  redirect: `${origin}/auth/callback`,
  created: now - 10,
  mode: "login",
  accountId: null,
};
const search = "?state=random-state&code=provider-code";
const validate = (
  pending: unknown,
  query = search,
  accountId: string | null = null,
) =>
  validateOAuthCallback(JSON.stringify(pending), query, accountId, origin, now);

describe("OAuth callback binding", () => {
  it("accepts Google and Kakao login or an explicit link to the same account", () => {
    expect(validate(login).code).toBe("provider-code");
    expect(validate({ ...login, provider: "kakao" }).pending.provider).toBe(
      "kakao",
    );
    expect(
      validate(
        { ...login, provider: "kakao", mode: "link", accountId: "member" },
        search,
        "member",
      ).pending.mode,
    ).toBe("link");
  });
  it("rejects unknown providers, modes, missing PKCE/state and foreign redirects", () => {
    for (const pending of [
      null,
      {},
      { ...login, provider: "github" },
      { ...login, mode: "merge" },
      { ...login, state: "" },
      { ...login, codeVerifier: "short" },
      { ...login, redirect: "https://other.example/auth/callback" },
    ])
      expect(() => validate(pending)).toThrow();
    expect(() => validate(login, "?state=forged&code=provider-code")).toThrow();
    expect(() => validate(login, "?state=random-state")).toThrow();
  });
  it("rejects expired/future/invalid requests and malformed storage", () => {
    for (const created of [now - 600_001, now + 1, null, "recent"])
      expect(() => validate({ ...login, created })).toThrow();
    expect(() =>
      validateOAuthCallback("{bad", search, null, origin, now),
    ).toThrow();
    expect(() =>
      validateOAuthCallback(null, search, null, origin, now),
    ).toThrow();
  });
  it("rejects login/link after an account switch or logout", () => {
    expect(() => validate(login, search, "other")).toThrow();
    const link = { ...login, mode: "link", accountId: "member" };
    expect(() => validate(link, search, "other")).toThrow();
    expect(() => validate(link)).toThrow();
    expect(() => validate({ ...login, mode: "link" })).toThrow();
  });
  it("recognizes cancellation only for the matching request", () => {
    expect(() =>
      validate(login, "?state=random-state&error=access_denied"),
    ).toThrow("취소");
    expect(() => validate(login, "?state=forged&error=access_denied")).toThrow(
      "만료",
    );
  });
});
