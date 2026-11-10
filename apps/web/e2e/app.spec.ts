import { expect, type Page, test } from "@playwright/test";
import type { State } from "../src/lib/types";

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
  await expect(
    page.getByText("현재 Elo", { exact: true }).locator(".."),
  ).toBeInViewport({ ratio: 1 });
  await expect(page.getByText("승률", { exact: true })).toBeInViewport();
  await expect(page.getByText("Elo 변화", { exact: true })).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("mobile-home-viewport.png"),
  });
  await page.screenshot({
    path: info.outputPath("mobile-home.png"),
    fullPage: true,
  });
  await page.getByRole("navigation", { name: "코트 도구" }).screenshot({
    path: info.outputPath("mobile-home-tools.png"),
  });
  const mobile = page.viewportSize();
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("desktop-home.png"),
    fullPage: true,
  });
  if (mobile) await page.setViewportSize(mobile);
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
  await page.getByLabel("B팀 점수").fill("20");
  await page.getByRole("button", { name: "A팀 22점 승리" }).click();
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
  for (const choice of await page
    .getByRole("group", { name: "빠른 팀 조합" })
    .getByRole("button")
    .all())
    await expect(choice).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "A팀 22점 승리" }),
  ).toBeDisabled();
  await expect(page.getByLabel("A팀 점수")).toHaveValue("22");
  await expect(page.getByLabel("B팀 점수")).toHaveValue("20");
  await page.getByRole("button", { name: "같은 요청으로 다시 저장" }).click();
  await expect(
    page.getByRole("heading", { name: "한 게임, 잘 남겼어요!" }),
  ).toBeVisible();
  const after = await (
    await page.request.get("/api/kokko/state?player=all", { headers })
  ).json();
  expect(after.allMatches.length).toBe(before.allMatches.length + 1);
  const created = after.allMatches.find(
    (m: { id: string }) =>
      !before.allMatches.some((old: { id: string }) => old.id === m.id),
  );
  expect(created.scoreA).toBe(22);
  expect(created.scoreB).toBe(20);
  await page.getByRole("button", { name: "같은 선수로 다음 경기" }).click();
  await expect(page.getByLabel("A팀 점수")).toHaveValue("");
  await expect(page.getByLabel("B팀 점수")).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "A팀 2번째 선수 선택" }),
  ).toContainText("서연");
  await page.getByLabel("B팀 점수").fill("20");
  await page.getByRole("button", { name: "A팀 22점 승리" }).click();
  await page.getByRole("button", { name: "경기 저장하기" }).click();
  await expect(
    page.getByRole("heading", { name: "한 게임, 잘 남겼어요!" }),
  ).toBeVisible();
  const final = await (
    await page.request.get("/api/kokko/state?player=all", { headers })
  ).json();
  expect(final.allMatches.length).toBe(before.allMatches.length + 2);
});

test("승리 점수 버튼은 듀스와 상한을 채우고 직접 입력도 유지한다", async ({
  page,
}, info) => {
  const session = await signIn(page);
  const snapshot = async (): Promise<State> =>
    (
      await page.request.get("/api/kokko/state?player=all", {
        headers: { Authorization: session.token },
      })
    ).json();
  const before = await snapshot();
  await page.goto("/matches/new");
  const a = page.getByLabel("A팀 점수");
  const b = page.getByLabel("B팀 점수");
  await page.getByRole("button", { name: "A팀 21점 승리" }).click();
  await expect(a).toHaveValue("21");
  await expect(b).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "경기 저장하기" }),
  ).toBeDisabled();
  for (const [loser, winner] of [
    ["0", "21"],
    ["19", "21"],
    ["20", "22"],
    ["27", "29"],
    ["28", "30"],
    ["29", "30"],
  ]) {
    await b.fill(loser);
    await page.getByRole("button", { name: `A팀 ${winner}점 승리` }).click();
    await expect(a).toHaveValue(winner);
    await expect(b).toHaveValue(loser);
  }
  await page.getByRole("button", { name: "팀 교환" }).click();
  await expect(a).toHaveValue("29");
  await expect(b).toHaveValue("30");
  await expect(
    page.getByRole("button", { name: "A팀 승리 점수 없음" }),
  ).toBeDisabled();
  await a.fill("30");
  await expect(
    page.getByRole("button", { name: "B팀 승리 점수 없음" }),
  ).toBeDisabled();
  await b.fill("31");
  await expect(
    page.getByRole("button", { name: "A팀 승리 점수 없음" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "팀 교환" }).click();
  await page.getByRole("tab", { name: "단식", exact: true }).click();
  await page.getByRole("button", { name: "B팀 1번째 선수 선택" }).click();
  await page.getByRole("button", { name: "서연", exact: true }).click();
  await a.fill("29");
  await page.getByRole("button", { name: "B팀 30점 승리" }).click();
  await a.fill("28");
  await expect(b).toHaveValue("30");
  await page.reload();
  await expect(a).toHaveValue("28");
  await expect(b).toHaveValue("30");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("mobile-winning-score.png"),
    fullPage: true,
  });
  const mobile = page.viewportSize();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({
    path: info.outputPath("desktop-winning-score.png"),
    fullPage: true,
  });
  if (mobile) await page.setViewportSize(mobile);
  await page.getByRole("button", { name: "경기 저장하기" }).click();
  await expect(
    page.getByRole("heading", { name: "한 게임, 잘 남겼어요!" }),
  ).toBeVisible();
  const created = (await snapshot()).allMatches.filter(
    (m) => !before.allMatches.some((old) => old.id === m.id),
  );
  expect(created).toHaveLength(1);
  expect(created[0]).toMatchObject({ kind: "singles", scoreA: 28, scoreB: 30 });
  await page.goto(`/matches/${created[0].id}`);
  await a.fill("20");
  await expect(b).toHaveValue("30");
  await page.getByRole("button", { name: "B팀 22점 승리" }).click();
  await page.getByRole("button", { name: "수정 저장하기" }).click();
  await expect(
    page.getByRole("heading", { name: "한 게임, 잘 남겼어요!" }),
  ).toBeVisible();
  expect(
    (await snapshot()).allMatches.find((m) => m.id === created[0].id),
  ).toMatchObject({ kind: "singles", scoreA: 20, scoreB: 22 });
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
  await page.goto(`/history?kind=${edited.kind}&period=all&player=all`);
  await page
    .getByRole("button", {
      name: `${edited.date} 1번째 경기 상세`,
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "변경 이력 보기" }).click();
  await expect(
    page.locator("summary").filter({ hasText: "수정" }).first(),
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

test("빠른 팀 조합과 다음 경기의 선수 기억", async ({ page }, info) => {
  const session = await signIn(page);
  const headers = { Authorization: session.token };
  const snapshot = async (): Promise<State> =>
    (await page.request.get("/api/kokko/state?player=all", { headers })).json();
  const before = await snapshot();
  await page.goto("/matches/new");
  await expect(page.getByRole("group", { name: "빠른 팀 조합" })).toHaveCount(
    0,
  );
  for (const [slot, name] of [
    ["A팀 2번째 선수 선택", "서연"],
    ["B팀 1번째 선수 선택", "지훈"],
    ["B팀 2번째 선수 선택", "민서"],
  ]) {
    await page.getByRole("button", { name: slot }).click();
    await page.getByRole("button", { name, exact: true }).click();
  }
  const choices = page.getByRole("group", { name: "빠른 팀 조합" });
  await expect(choices.getByRole("button")).toHaveCount(3);
  await expect(choices.getByRole("button", { pressed: true })).toHaveCount(1);
  const date = await page.getByLabel("경기 날짜").inputValue();
  await page.getByLabel("A팀 점수").fill("21");
  await page.getByLabel("B팀 점수").fill("18");
  await choices.getByRole("button", { pressed: true }).click();
  await expect(page.getByLabel("A팀 점수")).toHaveValue("21");
  await choices.getByRole("button", { name: /^조합: 유월 · 지훈 대 / }).click();
  await expect(page.getByLabel("A팀 점수")).toHaveValue("");
  await expect(page.getByLabel("B팀 점수")).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "A팀 2번째 선수 선택" }),
  ).toContainText("지훈");
  await page.getByRole("button", { name: "팀 교환" }).click();
  await expect(
    choices.getByRole("button", { name: / 대 유월 · 지훈$/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "팀 교환" }).click();
  await page.reload();
  await expect(
    choices.getByRole("button", { name: /^조합: 유월 · 지훈 대 / }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("A팀 점수").fill("21");
  await page.getByLabel("B팀 점수").fill("17");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("mobile-rotation.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "경기 저장하기" }).click();
  await expect(
    page.getByRole("heading", { name: "한 게임, 잘 남겼어요!" }),
  ).toBeVisible();
  const after = await snapshot();
  const created = after.allMatches.filter(
    (m) => !before.allMatches.some((old) => old.id === m.id),
  );
  expect(created).toHaveLength(1);
  const teammate = before.profiles.find((p) => p.nickname === "지훈");
  expect(created[0].a).toEqual([session.record.id, teammate?.id]);
  const next = page.getByRole("group", { name: "파트너 바꿔 다음 경기" });
  await expect(next.getByRole("button")).toHaveCount(2);
  await next
    .getByRole("button", { name: /^다음 경기: 유월 · 민서 대 / })
    .click();
  await expect(page.getByLabel("A팀 점수")).toHaveValue("");
  await expect(page.getByLabel("B팀 점수")).toHaveValue("");
  await expect(page.getByLabel("경기 날짜")).toHaveValue(date);
  await expect(page.getByLabel("당일 경기 순서")).toHaveValue("0");
  await expect(
    page.getByRole("button", { name: "A팀 2번째 선수 선택" }),
  ).toContainText("민서");
  await page.getByLabel("A팀 점수").fill("18");
  await page.getByLabel("B팀 점수").fill("21");
  await page.getByRole("button", { name: "경기 저장하기" }).click();
  await expect(
    page.getByRole("heading", { name: "한 게임, 잘 남겼어요!" }),
  ).toBeVisible();
  expect((await snapshot()).allMatches.length).toBe(
    before.allMatches.length + 2,
  );
  // The saved draft is removed; the date-scoped lineup survives leaving the form.
  await page.goto("/history");
  await page.goto("/matches/new");
  await expect(
    page.getByRole("button", { name: "A팀 2번째 선수 선택" }),
  ).toContainText("민서");
  await expect(page.getByLabel("A팀 점수")).toHaveValue("");
  await expect(choices.getByRole("button")).toHaveCount(3);
  await page.getByRole("tab", { name: "단식", exact: true }).click();
  await expect(choices).toHaveCount(0);
});

test("관리자 닉네임 편집의 검증, 재시도, 기록 보존", async ({ page }, info) => {
  const session = await signIn(page);
  const headers = { Authorization: session.token };
  const snapshot = async (): Promise<State> =>
    (await page.request.get("/api/kokko/state?player=all", { headers })).json();
  const before = await snapshot();
  const target = before.profiles.find((p) => p.nickname === "하린");
  expect(target).toBeTruthy();
  await page.goto("/settings");
  await page.getByRole("link", { name: "모임 관리" }).click();
  await page.getByRole("button", { name: "하린 닉네임 변경" }).click();
  await expect(page.getByLabel("새 닉네임")).toHaveValue("하린");
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "하린 닉네임 변경" }).click();
  await page.getByLabel("새 닉네임").fill("   ");
  await page.getByRole("button", { name: "닉네임 저장", exact: true }).click();
  await expect(
    page.getByText("닉네임은 1~20자로 입력해 주세요.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("새 닉네임").fill("가".repeat(21));
  await page.getByRole("button", { name: "닉네임 저장", exact: true }).click();
  await expect(
    page.getByText("닉네임은 1~20자로 입력해 주세요.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("새 닉네임").fill("  하린 🏸  ");
  await page.screenshot({
    path: info.outputPath("mobile-admin-nickname.png"),
    fullPage: true,
  });
  let first = true;
  await page.route(
    `**/api/kokko/members/${target?.id}/nickname`,
    async (route) => {
      if (first) {
        first = false;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ message: "잠시 후 다시 시도해 주세요." }),
        });
      } else await route.continue();
    },
  );
  await page.getByRole("button", { name: "닉네임 저장", exact: true }).click();
  await expect(
    page.getByText("잠시 후 다시 시도해 주세요.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("새 닉네임")).toHaveValue("  하린 🏸  ");
  await page.getByRole("button", { name: "닉네임 저장", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "하린 🏸 닉네임 변경" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "하린 🏸 닉네임 변경" }),
  ).toBeVisible();
  const after = await snapshot();
  expect(after.profiles.find((p) => p.id === target?.id)).toEqual({
    ...target,
    nickname: "하린 🏸",
  });
  expect(after.allMatches).toEqual(before.allMatches);
  expect(after.ratings).toEqual(before.ratings);
  expect(after.rankings).toEqual(before.rankings);
  await page.goto(`/players/${target?.id}`);
  await expect(
    page.getByRole("heading", { name: "하린 🏸", exact: true }),
  ).toBeVisible();
});

async function chooseCourtRoster(page: Page, names: string[]) {
  await page
    .getByRole("button", { name: /오늘의 선수 선택|참석 선수 바꾸기/ })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "유월 참석" }),
  ).toBeDisabled();
  for (const name of names) {
    const button = dialog.getByRole("button", {
      name: `${name} 참석`,
      exact: true,
    });
    if ((await button.getAttribute("aria-pressed")) !== "true")
      await button.click();
  }
  await dialog.getByRole("button", { name: /명 선택 완료/ }).click();
}

test("오늘의 코트 참석 선택, 추천 경기 기록, 당일 선수 기억", async ({
  page,
}, info) => {
  const session = await signIn(page);
  const headers = { Authorization: session.token };
  const before: State = await (
    await page.request.get("/api/kokko/state?player=all", { headers })
  ).json();
  await page.goto("/");
  await page.getByRole("link", { name: "다음 경기 추천", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "오늘의 코트", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
  await chooseCourtRoster(page, ["서연", "지훈", "민서", "도윤"]);
  await expect(
    page.getByRole("heading", { name: "함께하는 선수 5명" }),
  ).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(3);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "함께하는 선수 5명" }),
  ).toBeVisible();
  const recommendation = page.getByRole("article", {
    name: "추천 1",
    exact: true,
  });
  const names = await recommendation
    .locator("li > p:first-child")
    .allTextContents();
  expect(names).toHaveLength(4);
  expect(new Set(names).size).toBe(4);
  expect(names[0]).toBe("유월");
  expect(
    names.every((name) =>
      ["유월", "서연", "지훈", "민서", "도윤"].includes(name),
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("mobile-court.png"),
    fullPage: true,
  });
  const mobile = page.viewportSize();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({
    path: info.outputPath("desktop-court.png"),
    fullPage: true,
  });
  if (mobile) await page.setViewportSize(mobile);
  await recommendation
    .getByRole("button", { name: "이 조합으로 경기 기록" })
    .click();
  await expect(page.getByRole("group", { name: "빠른 팀 조합" })).toBeVisible();
  for (let i = 0; i < names.length; i++) {
    await expect(
      page.getByRole("button", {
        name: `${i < 2 ? "A" : "B"}팀 ${(i % 2) + 1}번째 선수 선택`,
      }),
    ).toContainText(names[i]);
  }
  await expect(page.getByLabel("A팀 점수")).toHaveValue("");
  await expect(page.getByLabel("B팀 점수")).toHaveValue("");
  await expect(page.getByLabel("경기 날짜")).toHaveValue(before.today);
  await expect(page.getByLabel("당일 경기 순서")).toHaveValue("0");
  await page.getByLabel("A팀 점수").fill("21");
  await page.getByLabel("B팀 점수").fill("18");
  await page.getByRole("button", { name: "경기 저장하기" }).click();
  await expect(
    page.getByRole("heading", { name: "한 게임, 잘 남겼어요!" }),
  ).toBeVisible();
  const after: State = await (
    await page.request.get("/api/kokko/state?player=all", { headers })
  ).json();
  expect(after.allMatches.length).toBe(before.allMatches.length + 1);
  await page.getByRole("link", { name: "다음 경기 추천받기" }).click();
  await expect(
    page.getByRole("heading", { name: "함께하는 선수 5명" }),
  ).toBeVisible();
  const games = after.allMatches.filter(
    (m) =>
      m.date === after.today && [...m.a, ...m.b].includes(session.record.id),
  ).length;
  await expect(
    page
      .getByRole("list", { name: "오늘 함께하는 선수" })
      .getByRole("listitem")
      .filter({ hasText: "유월" }),
  ).toContainText(`${games}경기`);
});

test("오늘의 코트는 입력한 점수와 응답 대기 요청을 덮어쓰지 않는다", async ({
  page,
}) => {
  const session = await signIn(page);
  const state: State = await (
    await page.request.get("/api/kokko/state?player=all", {
      headers: { Authorization: session.token },
    })
  ).json();
  const slots = [
    session.record.id,
    ...["서연", "지훈", "민서"].map(
      (name) => state.profiles.find((p) => p.nickname === name)?.id,
    ),
  ];
  const draft = {
    kind: "doubles",
    date: state.today,
    slots,
    scoreA: "21",
    scoreB: "16",
    position: "0",
    request: null,
  };
  const key = `kokko.draft.${session.record.id}.new`;
  await page.goto("/court");
  await chooseCourtRoster(page, ["서연", "지훈", "민서"]);
  await page.evaluate(
    ({ key, draft }) => sessionStorage.setItem(key, JSON.stringify(draft)),
    { key, draft },
  );
  const first = page
    .getByRole("article", { name: "추천 1", exact: true })
    .getByRole("button", { name: "이 조합으로 경기 기록" });
  await first.click();
  await expect(
    page.getByRole("heading", { name: "작성 중인 경기가 있어요" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      (key) => JSON.parse(sessionStorage.getItem(key) || "null"),
      key,
    ),
  ).toEqual(draft);
  await page.getByRole("button", { name: "기존 경기 이어가기" }).click();
  await expect(page.getByLabel("A팀 점수")).toHaveValue("21");
  await expect(page.getByLabel("B팀 점수")).toHaveValue("16");
  await page.goto("/court");
  await first.click();
  await page.getByRole("button", { name: "새 조합으로 시작" }).click();
  await expect(page.getByLabel("A팀 점수")).toHaveValue("");
  await expect(page.getByLabel("B팀 점수")).toHaveValue("");
  await page.goto("/court");
  const request = {
    requestId: "keep-this-pending-request",
    action: "create",
    kind: "doubles",
    date: state.today,
    a: slots.slice(0, 2),
    b: slots.slice(2),
    scoreA: 21,
    scoreB: 16,
    position: 0,
    dayVersions: state.days,
  };
  await page.evaluate(
    ({ key, draft, request }) =>
      sessionStorage.setItem(key, JSON.stringify({ ...draft, request })),
    { key, draft, request },
  );
  await first.click();
  await expect(
    page.getByRole("heading", { name: "저장 확인이 필요한 경기가 있어요" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "새 조합으로 시작" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      (key) => JSON.parse(sessionStorage.getItem(key) || "null").request,
      key,
    ),
  ).toEqual(request);
  await page.getByRole("button", { name: "기존 경기 이어가기" }).click();
  await expect(
    page.getByRole("button", { name: "같은 요청으로 다시 저장" }),
  ).toBeVisible();
  await expect(page.getByLabel("A팀 점수")).toHaveValue("21");
});

test("예상 승률은 선수와 종목을 따라 바뀌고 기록을 변경하지 않는다", async ({
  page,
}, info) => {
  const session = await signIn(page);
  const snapshot = async (): Promise<State> =>
    (
      await page.request.get("/api/kokko/state?player=all", {
        headers: { Authorization: session.token },
      })
    ).json();
  const before = await snapshot();
  const ids = [
    session.record.id,
    ...["서연", "지훈", "민서"].map(
      (name) => before.profiles.find((p) => p.nickname === name)?.id || "",
    ),
  ];
  expect(ids.every(Boolean)).toBe(true);
  // Give the UI known Elo differences without changing the test database.
  await page.route("**/api/kokko/state?*", async (route) => {
    const response = await route.fetch();
    const state: State = await response.json();
    await route.fulfill({
      response,
      json: {
        ...state,
        rankings: [
          ...[1600, 1400, 1200, 1000].map((rating, i) => ({
            playerId: ids[i],
            kind: "doubles",
            rating,
            games: 10,
            rank: i + 1,
          })),
          ...[1400, 1000].map((rating, i) => ({
            playerId: ids[i],
            kind: "singles",
            rating,
            games: 10,
            rank: i + 1,
          })),
        ],
      },
    });
  });
  await page.goto("/matches/new");
  const prediction = page.getByRole("region", {
    name: "예상 승률",
    exact: true,
  });
  await expect(prediction).toContainText("선수를 중복 없이 모두 고르면");
  await expect(prediction.getByText(/A팀 예상/)).toHaveCount(0);
  for (const [slot, name] of [
    ["A팀 2번째 선수 선택", "서연"],
    ["B팀 1번째 선수 선택", "지훈"],
    ["B팀 2번째 선수 선택", "민서"],
  ]) {
    await page.getByRole("button", { name: slot }).click();
    await page.getByRole("button", { name, exact: true }).click();
  }
  await expect(prediction).toContainText("현재 복식 Elo 기준");
  await expect(prediction).toContainText("A팀 예상 91%");
  await expect(prediction).toContainText("B팀 예상 9%");
  await expect(prediction).toContainText("평균 1500 Elo");
  await expect(
    prediction.getByLabel("A팀 예상 Elo 변화", { exact: true }),
  ).toContainText("+2.9");
  await expect(
    prediction.getByLabel("A팀 예상 Elo 변화", { exact: true }),
  ).toContainText("-29.1");
  await expect(
    prediction.getByLabel("B팀 예상 Elo 변화", { exact: true }),
  ).toContainText("+29.1");
  await page.getByLabel("A팀 점수").fill("21");
  await page.getByLabel("B팀 점수").fill("18");
  await page.getByLabel("경기 날짜").fill(before.allMatches[0].date);
  await expect(prediction).toContainText("A팀 예상 91%");
  await page.getByRole("button", { name: "팀 교환" }).click();
  await expect(prediction).toContainText("A팀 예상 9%");
  await expect(prediction).toContainText("B팀 예상 91%");
  await expect(
    prediction.getByLabel("A팀 예상 Elo 변화", { exact: true }),
  ).toContainText("+29.1");
  await expect(page.getByLabel("A팀 점수")).toHaveValue("18");
  await expect(page.getByLabel("B팀 점수")).toHaveValue("21");
  await page
    .getByRole("group", { name: "빠른 팀 조합" })
    .getByRole("button", { name: /대 유월 · 민서$/ })
    .click();
  await expect(prediction).toContainText("A팀 예상 50%");
  await expect(prediction).toContainText("B팀 예상 50%");
  await expect(
    prediction.getByLabel("A팀 예상 Elo 변화", { exact: true }),
  ).toContainText("+16.0");
  await expect(
    prediction.getByLabel("A팀 예상 Elo 변화", { exact: true }),
  ).toContainText("-16.0");
  await page.getByRole("tab", { name: "단식", exact: true }).click();
  for (const [slot, name] of [
    ["A팀 1번째 선수 선택", "유월 (나)"],
    ["B팀 1번째 선수 선택", "서연"],
  ]) {
    await page.getByRole("button", { name: slot }).click();
    await page.getByRole("button", { name, exact: true }).click();
  }
  await expect(prediction).toContainText("현재 단식 Elo 기준");
  await expect(prediction).toContainText("A팀 예상 91%");
  await expect(prediction).not.toContainText("기록이 없는 선수");
  await page.getByRole("button", { name: "B팀 1번째 선수 선택" }).click();
  await page.getByRole("button", { name: "도윤", exact: true }).click();
  await expect(prediction).toContainText("Elo 1,000점으로 계산해요");
  await expect(prediction).toContainText("A팀 예상 91%");
  await page.reload();
  await expect(prediction).toContainText("A팀 예상 91%");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("mobile-prediction.png"),
    fullPage: true,
  });
  const mobile = page.viewportSize();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({
    path: info.outputPath("desktop-prediction.png"),
    fullPage: true,
  });
  if (mobile) await page.setViewportSize(mobile);
  await page.goto("/court");
  await chooseCourtRoster(page, ["서연", "지훈", "민서"]);
  const recommendation = page.getByRole("article", {
    name: "추천 1",
    exact: true,
  });
  await expect(recommendation).toContainText("A팀 예상 50%");
  await recommendation
    .getByRole("button", { name: "이 조합으로 경기 기록" })
    .click();
  await expect(prediction).toContainText("A팀 예상 50%");
  await expect(prediction).toContainText("B팀 예상 50%");
  const original = before.allMatches[0];
  await page.goto(`/matches/${original.id}`);
  await expect(prediction).toContainText(
    `현재 ${original.kind === "doubles" ? "복식" : "단식"} Elo 기준`,
  );
  const after = await snapshot();
  expect(after.revision).toBe(before.revision);
  expect(after.allMatches).toEqual(before.allMatches);
  expect(after.rankings).toEqual(before.rankings);
});

test("가상 대결은 나 없는 팀의 승률과 Elo 변화를 보여주고 저장 대기 초안을 보존한다", async ({
  page,
}, info) => {
  const session = await signIn(page);
  const snapshot = async (): Promise<State> =>
    (
      await page.request.get("/api/kokko/state?player=all", {
        headers: { Authorization: session.token },
      })
    ).json();
  const before = await snapshot();
  const ids = ["서연", "지훈", "민서", "도윤"].map(
    (name) => before.profiles.find((p) => p.nickname === name)?.id || "",
  );
  expect(ids.every(Boolean)).toBe(true);
  await page.route("**/api/kokko/state?*", async (route) => {
    const response = await route.fetch();
    const state: State = await response.json();
    await route.fulfill({
      response,
      json: {
        ...state,
        rankings: [
          ...[1600, 1400, 1200, 1000].map((rating, i) => ({
            playerId: ids[i],
            kind: "doubles",
            rating,
            games: 10,
            rank: i + 1,
          })),
          ...[1400, 1000].map((rating, i) => ({
            playerId: ids[i],
            kind: "singles",
            rating,
            games: 10,
            rank: i + 1,
          })),
        ],
      },
    });
  });
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/kokko/") && request.method() !== "GET")
      writes.push(`${request.method()} ${request.url()}`);
  });
  await page.goto("/");
  const slots = [session.record.id, ...ids.slice(0, 3)];
  const request = {
    requestId: "preserve-pending-game-during-simulation",
    action: "create",
    kind: "doubles",
    date: before.today,
    a: slots.slice(0, 2),
    b: slots.slice(2),
    scoreA: 21,
    scoreB: 18,
    position: 0,
    dayVersions: before.days,
  };
  const draftKey = `kokko.draft.${session.record.id}.new`;
  const memory = {
    [draftKey]: JSON.stringify({
      kind: "doubles",
      date: before.today,
      slots,
      scoreA: "21",
      scoreB: "18",
      position: "0",
      request,
    }),
    [`kokko.lineup.${session.record.id}.${before.today}`]:
      JSON.stringify(slots),
    [`kokko.court.${session.record.id}.${before.today}`]: JSON.stringify(slots),
  };
  await page.evaluate((values) => {
    for (const [key, value] of Object.entries(values))
      sessionStorage.setItem(key, value);
  }, memory);
  await page.getByRole("link", { name: /가상 대결/ }).click();
  await expect(
    page.getByRole("heading", { name: "가상 대결", exact: true }),
  ).toBeVisible();
  const prediction = page.getByRole("region", {
    name: "예상 승률",
    exact: true,
  });
  await expect(prediction).toContainText("선수를 중복 없이 모두 고르면");
  const choose = async (slot: string, name: string) => {
    await page.getByRole("button", { name: slot, exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", {
        name: name === "선수 선택" ? "선택 해제" : name,
        exact: true,
      })
      .click();
  };
  for (const [slot, name] of [
    ["A팀 1번째 선수 선택", "서연"],
    ["A팀 2번째 선수 선택", "지훈"],
    ["B팀 1번째 선수 선택", "민서"],
    ["B팀 2번째 선수 선택", "도윤"],
  ])
    await choose(slot, name);
  const aChanges = prediction.getByLabel("A팀 예상 Elo 변화", { exact: true });
  const bChanges = prediction.getByLabel("B팀 예상 Elo 변화", { exact: true });
  await expect(prediction).toContainText("A팀 예상 91%");
  await expect(prediction).toContainText("B팀 예상 9%");
  await expect(aChanges).toContainText("+2.9");
  await expect(aChanges).toContainText("-29.1");
  await expect(bChanges).toContainText("+29.1");
  await expect(bChanges).toContainText("-2.9");
  await expect(prediction).toContainText("팀원 한 명당");
  await expect(page.getByText("조합을 바꾸면 점수는 비워져요.")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("mobile-simulator.png"),
    fullPage: true,
  });
  await prediction.scrollIntoViewIfNeeded();
  await prediction.screenshot({
    path: info.outputPath("mobile-simulator-prediction.png"),
  });
  const mobile = page.viewportSize();
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.screenshot({
    path: info.outputPath("desktop-simulator.png"),
    fullPage: true,
  });
  if (mobile) await page.setViewportSize(mobile);
  await choose("A팀 2번째 선수 선택", "민서");
  await expect(
    page.getByRole("button", { name: "B팀 1번째 선수 선택" }),
  ).toContainText("지훈");
  await expect(prediction).toContainText("A팀 예상 76%");
  await expect(aChanges).toContainText("+7.7");
  await expect(aChanges).toContainText("-24.3");
  await page.getByRole("button", { name: "팀 교환" }).click();
  await expect(prediction).toContainText("A팀 예상 24%");
  await expect(aChanges).toContainText("+24.3");
  await page
    .getByRole("group", { name: "빠른 팀 조합" })
    .getByRole("button", { pressed: false })
    .first()
    .click();
  await expect(
    page
      .getByRole("group", { name: "빠른 팀 조합" })
      .getByRole("button", { pressed: true }),
  ).toHaveCount(1);
  await page.getByRole("tab", { name: "단식", exact: true }).click();
  await choose("A팀 1번째 선수 선택", "서연");
  await choose("B팀 1번째 선수 선택", "지훈");
  await expect(prediction).toContainText("현재 단식 Elo 기준");
  await expect(prediction).toContainText("A팀 예상 91%");
  await expect(aChanges).toContainText("+2.9");
  await expect(aChanges).toContainText("-29.1");
  await choose("B팀 1번째 선수 선택", "유월 (나)");
  await expect(prediction).toContainText("Elo 1,000점으로 계산해요");
  await choose("B팀 1번째 선수 선택", "선수 선택");
  await expect(prediction).toContainText("선수를 중복 없이 모두 고르면");
  await expect(aChanges).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "가상 대결", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      (keys) =>
        Object.fromEntries(
          keys.map((key) => [key, sessionStorage.getItem(key)]),
        ),
      Object.keys(memory),
    ),
  ).toEqual(memory);
  await page.goto("/matches/new");
  await expect(
    page.getByRole("button", { name: "같은 요청으로 다시 저장" }),
  ).toBeVisible();
  await expect(page.getByLabel("A팀 점수")).toHaveValue("21");
  await expect(page.getByLabel("B팀 점수")).toHaveValue("18");
  await expect(page.getByLabel("A팀 점수")).toBeDisabled();
  for (const name of [
    "A팀 1번째 선수 선택",
    "A팀 2번째 선수 선택",
    "B팀 1번째 선수 선택",
    "B팀 2번째 선수 선택",
  ])
    await expect(
      page.getByRole("button", { name, exact: true }),
    ).toBeDisabled();
  expect(
    await page.evaluate(
      (key) => JSON.parse(sessionStorage.getItem(key) || "null").request,
      draftKey,
    ),
  ).toEqual(request);
  const after = await snapshot();
  expect(after.revision).toBe(before.revision);
  expect(after.allMatches).toEqual(before.allMatches);
  expect(after.rankings).toEqual(before.rankings);
  expect(writes).toEqual([]);
});

test("기록과 가상 대결은 같은 선수 선택창으로 교환·해제하고 단식 자리를 보존한다", async ({
  page,
}, info) => {
  const session = await signIn(page);
  const before: State = await (
    await page.request.get("/api/kokko/state?player=all", {
      headers: { Authorization: session.token },
    })
  ).json();
  for (const [path, label] of [
    ["/matches/new", "entry"],
    ["/simulate", "simulator"],
  ]) {
    await page.goto(path);
    if (label === "entry") {
      await page.getByLabel("A팀 점수").fill("21");
      await page.getByLabel("B팀 점수").fill("18");
    }
    const choose = async (slot: string, name: string) => {
      await page.getByRole("button", { name: slot, exact: true }).click();
      const picker = page.getByRole("dialog", { name: "함께한 선수 선택" });
      for (const p of before.profiles.filter((p) => p.status !== "active"))
        await expect(
          picker.getByRole("button", { name: p.nickname, exact: true }),
        ).toHaveCount(0);
      await picker.getByRole("button", { name, exact: true }).click();
      await expect(picker).toHaveCount(0);
    };
    await choose("A팀 2번째 선수 선택", "서연");
    await choose("B팀 1번째 선수 선택", "서연");
    await expect(
      page.getByRole("button", { name: "A팀 2번째 선수 선택" }),
    ).toContainText("선수 선택");
    await choose("B팀 2번째 선수 선택", "민서");
    await choose("B팀 1번째 선수 선택", "유월 (나)");
    await expect(
      page.getByRole("button", { name: "A팀 1번째 선수 선택" }),
    ).toContainText("서연");
    await page.getByRole("button", { name: "B팀 1번째 선수 선택" }).click();
    const picker = page.getByRole("dialog", { name: "함께한 선수 선택" });
    await expect(
      picker.getByRole("button", { name: "유월 (나)", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await picker.screenshot({
      path: info.outputPath(`mobile-${label}-participant-picker.png`),
    });
    await picker
      .getByRole("button", { name: "선택 해제", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "B팀 1번째 선수 선택" }),
    ).toContainText("선수 선택");
    await choose("B팀 1번째 선수 선택", "지훈");
    await page.getByRole("tab", { name: "단식", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "A팀 2번째 선수 선택" }),
    ).toHaveCount(0);
    await choose("A팀 1번째 선수 선택", "민서");
    await page.getByRole("tab", { name: "복식", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "B팀 2번째 선수 선택" }),
    ).toContainText("서연");
    await expect(
      page.getByRole("button", { name: "A팀 1번째 선수 선택" }),
    ).toContainText("민서");
    if (label === "entry") {
      await expect(page.getByLabel("A팀 점수")).toHaveValue("21");
      await expect(page.getByLabel("B팀 점수")).toHaveValue("18");
    }
  }
  const after: State = await (
    await page.request.get("/api/kokko/state?player=all", {
      headers: { Authorization: session.token },
    })
  ).json();
  expect(after.revision).toBe(before.revision);
  expect(after.allMatches).toEqual(before.allMatches);
});

test("문장 티어는 누적 Elo와 종목을 따르고 공동 순위와 미배정을 보존한다", async ({
  page,
}, info) => {
  const session = await signIn(page);
  const snapshot = async (): Promise<State> =>
    (
      await page.request.get("/api/kokko/state?player=all", {
        headers: { Authorization: session.token },
      })
    ).json();
  const before = await snapshot();
  const ids = [
    session.record.id,
    ...["서연", "지훈", "민서", "도윤"].map(
      (name) => before.profiles.find((p) => p.nickname === name)?.id || "",
    ),
    before.profiles.find((p) => p.nickname.startsWith("하린"))?.id || "",
  ];
  expect(ids.every(Boolean)).toBe(true);
  await page.route("**/api/kokko/state?*", async (route) => {
    const response = await route.fetch();
    const state: State = await response.json();
    const rankings = [
      ...[1035, 1300, 1200, 1100, 900, 850].map((rating, i) => ({
        playerId: ids[i],
        kind: "doubles",
        rating,
        games: 12,
        rank: [4, 1, 2, 3, 6, 7][i],
      })),
      {
        playerId: "rank-tied",
        kind: "doubles",
        rating: 1034.9,
        games: 8,
        rank: 4,
      },
      {
        playerId: "rank-suspended",
        kind: "doubles",
        rating: 1600,
        games: 20,
        rank: 0,
      },
      {
        playerId: session.record.id,
        kind: "singles",
        rating: 1000,
        games: 0,
        rank: 0,
      },
    ];
    await route.fulfill({
      response,
      json: {
        ...state,
        profiles: [
          ...state.profiles,
          {
            id: "rank-tied",
            nickname: "같은 점수",
            avatar: "",
            status: "active",
          },
          {
            id: "rank-suspended",
            nickname: "쉬는 선수",
            avatar: "",
            status: "suspended",
          },
        ],
        rankings,
        stats: {
          ...state.stats,
          games: 0,
          wins: 0,
          losses: 0,
          winRate: 0,
          change: 0,
        },
      },
    });
  });
  await page.goto("/?kind=doubles&period=7");
  const tier = page.getByRole("region", { name: "복식 티어", exact: true });
  await expect(
    tier.getByRole("heading", { name: "골드", exact: true }),
  ).toBeVisible();
  await expect(tier).toContainText("1,035 Elo · 12경기");
  await expect(tier).toContainText("플래티넘까지 65 Elo");
  await expect(tier.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "35",
  );
  const gold = tier.getByRole("img", { name: "골드 문장", exact: true });
  await expect
    .poll(() => gold.evaluate((img) => (img as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  expect((await gold.boundingBox())?.width).toBeLessThanOrEqual(64);
  await tier.getByRole("button", { name: "티어 기준", exact: true }).click();
  const guide = page.getByRole("dialog");
  await expect(guide.getByRole("listitem")).toHaveCount(6);
  for (const name of [
    "브론즈",
    "실버",
    "골드",
    "플래티넘",
    "다이아몬드",
    "마스터",
  ]) {
    const image = guide.getByRole("img", { name: `${name} 문장`, exact: true });
    await expect
      .poll(() =>
        image.evaluate((img) => (img as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    expect((await image.boundingBox())?.width).toBeLessThanOrEqual(56);
  }
  await guide.screenshot({ path: info.outputPath("mobile-tier-guide.png") });
  await guide.getByRole("button", { name: "확인", exact: true }).click();
  await page.goto("/players?kind=doubles&period=all&player=all");
  const standings = page.getByRole("list", {
    name: "복식 선수 순위",
    exact: true,
  });
  await expect(standings.getByRole("link").first()).toContainText("서연");
  await expect(standings.getByText("모임 4위", { exact: true })).toHaveCount(2);
  for (const crest of await standings.getByRole("img", { name: /문장$/ }).all())
    expect((await crest.boundingBox())?.width).toBeLessThanOrEqual(24);
  await expect(
    standings.getByRole("link").filter({ hasText: "쉬는 선수" }),
  ).toContainText("이용 중지");
  await expect(
    standings.getByRole("link").filter({ hasText: "쉬는 선수" }),
  ).toContainText("순위 미집계");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("mobile-rankings.png"),
    fullPage: true,
  });
  const mobile = page.viewportSize();
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.screenshot({
    path: info.outputPath("desktop-rankings.png"),
    fullPage: true,
  });
  if (mobile) await page.setViewportSize(mobile);
  await standings.getByRole("link").filter({ hasText: "유월" }).click();
  await expect(
    page.getByRole("heading", { name: "유월", exact: true }),
  ).toBeVisible();
  await expect(tier).toContainText("골드");
  await expect(tier).toContainText("플래티넘까지 65 Elo");
  await page.getByRole("tab", { name: "단식", exact: true }).click();
  const singles = page.getByRole("region", { name: "단식 티어", exact: true });
  await expect(singles).toContainText("미배정");
  await expect(singles).toContainText("단식 첫 경기를 기록하면");
  await expect(singles.getByRole("img")).toHaveCount(0);
  await page.reload();
  await expect(singles).toContainText("미배정");
  const after = await snapshot();
  expect(after.revision).toBe(before.revision);
  expect(after.rankings).toEqual(before.rankings);
  expect(after.allMatches).toEqual(before.allMatches);
});
