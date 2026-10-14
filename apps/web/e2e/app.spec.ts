import { expect, type Page, test } from "@playwright/test";

async function signIn(page: Page, role = "admin") {
  const response = await page.request.get(
    `/api/kokko/__test/session?role=${role}`,
  );
  const session = await response.json();
  await page.addInitScript(({ token, record }) => {
    localStorage.setItem("pocketbase_auth", JSON.stringify({ token, record }));
  }, session);
  return session;
}
test("로그인 전 데이터와 중첩 URL 보호", async ({ page }) => {
  await page.goto("/history");
  await expect(
    page.getByRole("button", { name: "Google로 시작하기" }),
  ).toBeVisible();
  expect((await page.request.get("/api/kokko/state")).status()).toBe(401);
  expect((await page.request.get("/api/no-such-route")).status()).toBe(404);
});
test("모바일 대시보드, 필터 복원, 선수 상세", async ({ page }, info) => {
  await signIn(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "유월님의 코트" }),
  ).toBeVisible();
  await expect(page.getByText("Elo 흐름")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("mobile-home.png"),
    fullPage: true,
  });
  await page.goto("/history?kind=doubles&period=7&player=all");
  await expect(
    page.getByRole("heading", { name: "경기 기록", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole("combobox", { name: "조회 기간" })).toHaveText(
    "최근 7일",
  );
  await page.goto("/players");
  await page.getByRole("link").filter({ hasText: "유월" }).click();
  await expect(
    page.getByRole("heading", { name: "파트너와의 호흡" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "유월", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("mobile-player.png"),
    fullPage: true,
  });
});
test("응답 유실 재시도와 같은 선수 다음 경기", async ({ page }, info) => {
  const session = await signIn(page);
  const headers = { Authorization: session.token };
  const before = await (
    await page.request.get("/api/kokko/state?player=all", { headers })
  ).json();
  await page.goto("/matches/new");
  await page.getByRole("button", { name: "A팀 2번째 선수 선택" }).click();
  await page.getByRole("button", { name: "서연", exact: true }).click();
  await page.getByRole("button", { name: "B팀 1번째 선수 선택" }).click();
  await page.getByRole("button", { name: "지훈", exact: true }).click();
  await page.getByRole("button", { name: "B팀 2번째 선수 선택" }).click();
  await page.getByRole("button", { name: "민서", exact: true }).click();
  await page.getByLabel("A팀 점수").fill("21");
  await page.getByLabel("B팀 점수").fill("18");
  await page.screenshot({
    path: info.outputPath("mobile-entry.png"),
    fullPage: true,
  });
  let first = true;
  await page.route("**/api/kokko/matches", async (route) => {
    if (first) {
      first = false;
      await route.fetch();
      await route.abort("failed");
    } else {
      await route.continue();
    }
  });
  await page.getByRole("button", { name: "경기 저장하기" }).click();
  await expect(
    page.getByRole("button", { name: "같은 요청으로 다시 저장" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "같은 요청으로 다시 저장" }).click();
  await expect(
    page.getByRole("heading", { name: "한 게임, 잘 남겼어요!" }),
  ).toBeVisible();
  const after = await (
    await page.request.get("/api/kokko/state?player=all", { headers })
  ).json();
  expect(after.allMatches.length).toBe(before.allMatches.length + 1);
  await page.getByRole("button", { name: "같은 선수로 다음 경기" }).click();
  await expect(page.getByLabel("A팀 점수")).toHaveValue("");
  await expect(page.getByLabel("B팀 점수")).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "A팀 2번째 선수 선택" }),
  ).toContainText("서연");
  await page.getByLabel("A팀 점수").fill("21");
  await page.getByLabel("B팀 점수").fill("18");
  await page.getByRole("button", { name: "경기 저장하기" }).click();
  await expect(
    page.getByRole("heading", { name: "한 게임, 잘 남겼어요!" }),
  ).toBeVisible();
  const final = await (
    await page.request.get("/api/kokko/state?player=all", { headers })
  ).json();
  expect(final.allMatches.length).toBe(before.allMatches.length + 2);
});
test("초대 전 차단과 가입 완료", async ({ page }) => {
  const s = await signIn(page, "pending");
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "코트에 오신 걸 환영해요" }),
  ).toBeVisible();
  expect(
    (
      await page.request.get("/api/kokko/state", {
        headers: { Authorization: s.token },
      })
    ).status(),
  ).toBe(403);
  await page.getByLabel("초대 코드").fill(s.invite);
  await page.getByRole("button", { name: "모임 참여하기" }).click();
  await expect(
    page.getByRole("heading", { name: "신규 회원님의 코트" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "신규 회원님의 코트" }),
  ).toBeVisible();
});
test("일반 회원은 관리자 화면 접근 불가", async ({ page }) => {
  await signIn(page, "member");
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "하린님의 코트" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "모임 관리" })).toHaveCount(0);
});

test("경기 수정·순서 변경·삭제·관리자 복구", async ({ page }) => {
  const session = await signIn(page);
  const headers = { Authorization: session.token };
  const snapshot = async () =>
    (await page.request.get("/api/kokko/state?player=all", { headers })).json();
  const before = await snapshot();
  const target = before.allMatches.at(-1);
  await page.goto(`/matches/${target.id}`);
  await page.getByLabel("A팀 점수").fill("18");
  await page.getByLabel("B팀 점수").fill("21");
  await page.getByLabel("당일 경기 순서").selectOption("1");
  await page.getByRole("button", { name: "수정 저장하기" }).click();
  await expect(
    page.getByRole("heading", { name: "한 게임, 잘 남겼어요!" }),
  ).toBeVisible();
  const edited = (await snapshot()).allMatches.find(
    (m: { id: string }) => m.id === target.id,
  );
  expect(edited.order).toBe(1);
  expect(edited.scoreB).toBe(21);
  await page.goto("/history?kind=doubles&period=all&player=all");
  await page
    .getByRole("button", {
      name: `${edited.date} 1번째 경기 상세`,
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "변경 이력 보기" }).click();
  await expect(
    page.locator("summary").filter({ hasText: "수정" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "삭제", exact: true }).click();
  await page.getByRole("button", { name: "삭제하기", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "이 경기를 삭제할까요?" }),
  ).toHaveCount(0);
  expect((await snapshot()).allMatches.length).toBe(
    before.allMatches.length - 1,
  );
  await page.goto("/admin");
  await page.getByRole("button", { name: "복구", exact: true }).click();
  await page.getByRole("button", { name: "복구하기", exact: true }).click();
  await expect(page.getByText("삭제된 경기가 없어요.")).toBeVisible();
  expect((await snapshot()).allMatches.length).toBe(before.allMatches.length);
  await page.getByRole("button", { name: "초대 코드 만들기" }).click();
  await expect(
    page.getByLabel("새 초대 코드 · 지금 복사해 주세요"),
  ).toHaveValue(/.{32}/);
  await page.getByRole("button", { name: "사용 중지" }).first().click();
  await expect(page.getByText("중지됨", { exact: true })).toBeVisible();
});
