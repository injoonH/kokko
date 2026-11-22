import { expect, type Page, test } from "@playwright/test";
import type { Me, State } from "../src/lib/types";

async function useIdentity(
  page: Page,
  provider: string,
  id: string,
  email = "",
) {
  await page.request.post(`/api/kokko/__test/oauth/${provider}`, {
    data: {
      id,
      email,
      name: "공개하면 안 되는 실명",
      verified: Boolean(email),
      modern: true,
    },
  });
}
async function account(page: Page): Promise<Me> {
  return page.evaluate(async () => {
    const session = JSON.parse(localStorage.getItem("pocketbase_auth") || "{}");
    return (
      await fetch("/api/kokko/me", {
        headers: { Authorization: session.token },
      })
    ).json();
  });
}
async function privateSession(page: Page, role = "admin") {
  const session = await (
    await page.request.get(`/api/kokko/__test/session?role=${role}`)
  ).json();
  await page.addInitScript(({ token, record }) => {
    localStorage.setItem("pocketbase_auth", JSON.stringify({ token, record }));
  }, session);
  return session;
}

test("카카오 가입은 이메일과 초대 없이 닉네임만 정한다", async ({
  page,
}, info) => {
  await useIdentity(page, "kakao", "31001");
  await page.goto("/login");
  await expect(
    page.getByText("계정으로 로그인하고 닉네임만 정하면", { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("mobile-social-login.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "카카오 로그인", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "어떻게 불러 드릴까요?" }),
  ).toBeVisible();
  await expect(page.getByLabel("닉네임", { exact: true })).toBeEmpty();
  const before = await account(page);
  expect(before).toMatchObject({
    status: "pending",
    profile: null,
    groups: [],
    providers: ["kakao"],
  });
  await page.getByLabel("닉네임", { exact: true }).fill("새로운 코트");
  await page.screenshot({
    path: info.outputPath("mobile-nickname-onboarding.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "닉네임으로 시작하기" }).click();
  await expect(
    page.getByRole("heading", { name: "우리의 전체 코트", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "선수 찾기", exact: true }),
  ).toBeVisible();
  const after = await account(page);
  expect(after).toMatchObject({
    id: before.id,
    status: "active",
    groups: [],
    profile: { nickname: "새로운 코트" },
  });
  const token = await page.evaluate(
    () => JSON.parse(localStorage.getItem("pocketbase_auth") || "{}").token,
  );
  expect(
    (
      await page.request.get("/api/kokko/state?group=legacy", {
        headers: { Authorization: token },
      })
    ).status(),
  ).toBe(404);
  await page.goto("/settings");
  await page.getByLabel("닉네임", { exact: true }).fill("코트의 새 친구");
  await page.getByRole("button", { name: "프로필 저장", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("프로필을 저장했어요.");
  await page.reload();
  await expect(page.getByLabel("닉네임", { exact: true })).toHaveValue(
    "코트의 새 친구",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("mobile-account-no-group.png"),
    fullPage: true,
  });
  await page.goto("/settings");
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await page
    .getByRole("button", { name: "카카오 로그인", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "우리의 전체 코트", exact: true }),
  ).toBeVisible();
  expect((await account(page)).id).toBe(before.id);
});

test("Google 신규 가입과 재로그인은 초대 없이 같은 계정을 사용한다", async ({
  page,
}) => {
  await useIdentity(
    page,
    "google",
    "google-open-signup",
    "open-signup@example.com",
  );
  await page.goto("/login");
  await page
    .getByRole("button", { name: "Google로 시작하기", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "어떻게 불러 드릴까요?" }),
  ).toBeVisible();
  await page.getByLabel("닉네임", { exact: true }).fill("학교의 새 친구");
  await page.getByRole("button", { name: "닉네임으로 시작하기" }).click();
  await expect(
    page.getByRole("heading", { name: "우리의 전체 코트", exact: true }),
  ).toBeVisible();
  const user = await account(page);
  expect(user).toMatchObject({
    providers: ["google"],
    groups: [],
    profile: { nickname: "학교의 새 친구" },
  });
  await page.goto("/settings");
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await page
    .getByRole("button", { name: "Google로 시작하기", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "우리의 전체 코트", exact: true }),
  ).toBeVisible();
  expect((await account(page)).id).toBe(user.id);
});

test("미완료 가입에서 계정을 연결해도 기존 레이팅을 지킨다", async ({
  page,
}, info) => {
  await useIdentity(page, "kakao", "42001", "different-provider@example.com");
  await page.goto("/login");
  await page
    .getByRole("button", { name: "카카오 로그인", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "어떻게 불러 드릴까요?" }),
  ).toBeVisible();
  expect(await account(page)).toMatchObject({
    status: "pending",
    profile: null,
    providers: ["kakao"],
  });
  await page.screenshot({
    path: info.outputPath("mobile-unfinished-account.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "다른 계정으로 로그인" }).click();
  await expect(
    page.getByRole("button", { name: "Google로 시작하기" }),
  ).toBeVisible();

  const session = await privateSession(page);
  const headers = { Authorization: session.token };
  const before: State = await (
    await page.request.get("/api/kokko/arena/state", { headers })
  ).json();
  await page.goto("/settings");
  await page.getByRole("link", { name: "로그인 계정 연결" }).click();
  await expect(
    page.getByRole("button", { name: "Google 연결됨" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "카카오 계정 연결" }).click();
  await expect(
    page.getByRole("button", { name: "카카오 연결됨" }),
  ).toBeDisabled();
  expect((await account(page)).id).toBe(session.record.id);
  const after: State = await (
    await page.request.get("/api/kokko/arena/state", { headers })
  ).json();
  expect(after).toEqual(before);
  await page.screenshot({
    path: info.outputPath("mobile-linked-accounts.png"),
    fullPage: true,
  });

  // A different member cannot take an already linked provider identity.
  const other = await (
    await page.request.get("/api/kokko/__test/session?role=member")
  ).json();
  const otherPage = await page.context().newPage();
  await otherPage.goto("/account");
  await otherPage.evaluate(
    (value) => localStorage.setItem("pocketbase_auth", JSON.stringify(value)),
    other,
  );
  await otherPage.reload();
  await otherPage.getByRole("button", { name: "카카오 계정 연결" }).click();
  await expect(otherPage.getByRole("alert")).toContainText(
    "이미 다른 회원에게 연결된 계정",
  );
  expect((await account(otherPage)).id).toBe(other.record.id);
  await otherPage.getByRole("link", { name: "내 계정으로 돌아가기" }).click();
  await expect(
    otherPage.getByRole("button", { name: "Google 연결됨" }),
  ).toBeDisabled();
  await expect(
    otherPage.getByRole("button", { name: "카카오 계정 연결" }),
  ).toBeEnabled();
  await otherPage.close();
});

test("취소된 콜백은 요청을 지우고 계정 정보를 남기지 않는다", async ({
  page,
}, info) => {
  await page.goto("/login");
  await page.evaluate(() =>
    sessionStorage.setItem(
      "kokko.oauth",
      JSON.stringify({
        provider: "kakao",
        mode: "login",
        accountId: null,
        state: "cancel-state",
        codeVerifier: "a".repeat(43),
        redirect: `${location.origin}/auth/callback`,
        created: Date.now(),
      }),
    ),
  );
  await page.goto("/auth/callback?state=cancel-state&error=access_denied");
  await expect(page.getByRole("alert")).toContainText("취소");
  expect(
    await page.evaluate(() => sessionStorage.getItem("kokko.oauth")),
  ).toBeNull();
  expect(page.url()).not.toContain("state=");
  expect(
    await page.evaluate(() => localStorage.getItem("pocketbase_auth")),
  ).toBeNull();
  await page.screenshot({
    path: info.outputPath("mobile-oauth-cancel.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "다시 로그인" }).click();
  await expect(
    page.getByRole("button", { name: "카카오 로그인", exact: true }),
  ).toBeVisible();
});
