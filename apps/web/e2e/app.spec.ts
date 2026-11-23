import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  eloChangeLabel,
  predictMatch,
  winChanceLabels,
} from "../src/lib/prediction";
import type { Kind, Proposal, State } from "../src/lib/types";

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
async function expectPrediction(
  page: Page,
  state: State,
  kind: Kind,
  a: string[],
  b: string[],
) {
  const prediction = predictMatch(state, kind, a, b);
  if (!prediction) throw new Error("Expected a complete lineup");
  const region = page.getByRole("region", { name: "예상 승률", exact: true });
  if (!(await region.isVisible()))
    await page.getByText("예상 승률 미리보기", { exact: true }).click();
  const labels = winChanceLabels(prediction.expectedA);
  for (const [i, changes] of [
    prediction.changeA,
    prediction.changeB,
  ].entries()) {
    await expect(region).toContainText(
      `${i === 0 ? "A" : "B"}팀 예상 ${labels[i]}`,
    );
    const team = region.getByRole("group", {
      name: `${i === 0 ? "A" : "B"}팀 예상 Elo 변화`,
      exact: true,
    });
    for (const p of changes) {
      const nickname = state.profiles.find(
        (profile) => profile.id === p.id,
      )?.nickname;
      const player = team.getByRole("group", {
        name: `${nickname} 예상 변화`,
        exact: true,
      });
      await expect(player).toContainText(eloChangeLabel(p.win));
      await expect(player).toContainText(eloChangeLabel(p.loss));
      await expect(player).toContainText(`RD ${Math.round(p.rd)}`);
    }
  }
}

async function state(page: Page, token = "", player = "all"): Promise<State> {
  const res = await page.request.get(
    `/api/kokko/arena/state?period=all&player=${player}`,
    { headers: { Authorization: token } },
  );
  expect(res.ok()).toBeTruthy();
  return res.json();
}
async function choose(page: Page, slot: string, name: string) {
  await page.getByRole("button", { name: slot, exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: new RegExp(`^${name}(?: |#|$)`) })
    .click();
}
async function lineup(page: Page) {
  await choose(page, "A팀 2번째 선수 선택", "서연");
  await choose(page, "B팀 1번째 선수 선택", "지훈");
  await choose(page, "B팀 2번째 선수 선택", "민서");
}
async function reportGame(page: Page, token: string): Promise<Proposal> {
  const s = await state(page, token);
  const id = (n: string) => s.profiles.find((p) => p.nickname === n)?.id;
  const q = {
    requestId: crypto.randomUUID(),
    action: "create",
    kind: "doubles",
    date: s.today,
    a: [id("유월"), id("서연")],
    b: [id("지훈"), id("민서")],
    scoreA: 21,
    scoreB: 16,
  };
  const res = await page.request.post("/api/kokko/arena/proposals", {
    headers: { Authorization: token },
    data: q,
  });
  expect(res.status()).toBe(200);
  return res.json();
}
async function opponentSession(page: Page) {
  return (
    await page.request.get("/api/kokko/__test/session?role=opponent")
  ).json();
}
async function confirm(page: Page, p: Proposal) {
  const opponent = await opponentSession(page);
  const res = await page.request.post(`/api/kokko/arena/proposals/${p.id}`, {
    headers: { Authorization: opponent.token },
    data: { decision: "confirm", version: p.version },
  });
  expect(res.status()).toBe(200);
  return res.json();
}
async function mobileFits(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

async function aboveMobileNav(target: Locator) {
  const nav = target.page().getByRole("navigation", { name: "모바일 메뉴" });
  await expect(target).toBeVisible();
  await expect
    .poll(async () => {
      const [box, footer] = await Promise.all([
        target.boundingBox(),
        nav.boundingBox(),
      ]);
      return !!box && !!footer && box.y >= 0 && box.y + box.height <= footer.y;
    })
    .toBe(true);
}

test("로그인 없이 기존 경기, 전체 순위와 공개 프로필을 본다", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  const mobileNav = page.getByRole("navigation", { name: "모바일 메뉴" });
  await expect(mobileNav.getByRole("link")).toHaveText([
    "홈",
    "전체 순위",
    "경기 기록",
    "친구",
    "확인함",
  ]);
  await mobileNav.getByRole("link", { name: "전체 순위" }).click();
  await expect(
    page.getByRole("heading", { name: "전체 복식 순위", exact: true }),
  ).toBeVisible();
  await mobileFits(page);
  await page.screenshot({
    path: info.outputPath("mobile-global-leaderboard.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "단식", exact: true }).click();
  await expect(page).toHaveURL(/\/leaderboard\?kind=singles$/);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "전체 단식 순위", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 820, height: 920 });
  await expect(
    page
      .getByRole("navigation", { name: "주 메뉴", exact: true })
      .getByRole("link", { name: "전체 순위" }),
  ).toBeVisible();
  await page.goto("/leaderboard?kind=doubles");
  await mobileFits(page);
  await page.screenshot({
    path: info.outputPath("tablet-global-leaderboard.png"),
    fullPage: true,
  });
  await page
    .getByRole("list", { name: "전체 선수 순위" })
    .getByRole("link")
    .first()
    .click();
  await expect(page).toHaveURL(/\/players\//);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/history");
  await expect(
    page.getByRole("heading", { name: "전체 경기 기록" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /경기 상세$/ })
    .first()
    .click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toContainText("기록한 사람:");
  await expect(
    sheet.getByRole("button", { name: "삭제 요청", exact: true }),
  ).toHaveCount(0);
  await sheet.screenshot({ path: info.outputPath("mobile-public-match.png") });
  const s = await state(page);
  const detail = await page.request.get(
    `/api/kokko/arena/matches/${s.matches[0].id}`,
  );
  expect(detail.status()).toBe(200);
  const raw = await detail.text();
  for (const field of [
    '"email"',
    '"providers"',
    '"serviceRole"',
    '"payload"',
    '"reason"',
  ])
    expect(raw).not.toContain(field);
  await page.goto(`/players/${s.matches[0].a[0]}`);
  await expect(
    page.getByRole("heading", { name: "파트너와의 호흡" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "친구 요청", exact: true }),
  ).toHaveCount(0);
  expect((await page.request.get("/api/kokko/state")).status()).toBe(401);
  expect((await page.request.get("/api/kokko/arena/inbox")).status()).toBe(401);
  expect((await page.request.get("/api/no-such-route")).status()).toBe(404);
  await page.goto("/matches/new");
  await expect(
    page.getByRole("button", { name: "Google로 시작하기", exact: true }),
  ).toBeVisible();
});

test("내 대시보드, 기간 필터, 문장과 레이팅 신뢰도", async ({ page }, info) => {
  const session = await signIn(page);
  const before = await state(page, session.token, session.record.id);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/leaderboard");
  const ranks = page.getByRole("list", { name: "전체 선수 순위" });
  const own = ranks.getByRole("listitem").filter({ hasText: "유월" });
  const globalRow = await own.innerText();
  expect(await ranks.getByRole("listitem").count()).toBeGreaterThan(1);
  await aboveMobileNav(ranks.getByRole("listitem").nth(3));
  await page.getByRole("button", { name: "친구와 나", exact: true }).click();
  await expect(ranks.getByRole("listitem")).toHaveCount(1);
  await expect.poll(() => own.innerText()).toBe(globalRow);
  await page.getByRole("button", { name: "내 계정 메뉴" }).click();
  await mobileFits(page);
  await page.screenshot({ path: info.outputPath("mobile-account-menu.png") });
  await page.getByRole("menuitem", { name: "설정" }).click();
  await expect(
    page.getByRole("heading", { name: "설정", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("banner")
      .getByRole("link", { name: "경기 기록", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "유월님의 코트" }),
  ).toBeVisible();
  await aboveMobileNav(page.getByText("Elo 변화", { exact: true }));
  await aboveMobileNav(
    page.getByRole("button", { name: /번째 경기 상세/ }).nth(3),
  );
  await page.screenshot({ path: info.outputPath("mobile-home-viewport.png") });
  await page.setViewportSize({ width: 320, height: 740 });
  const eloChange = page
    .getByText("Elo 변화", { exact: true })
    .locator("..")
    .locator("dd")
    .first();
  await expect(eloChange).toBeVisible();
  const singleLine = await eloChange.evaluate((value) => {
    const text = document.createRange();
    text.selectNodeContents(value);
    const lines = text.getClientRects();
    return (
      lines.length === 1 &&
      lines[0].right <= value.getBoundingClientRect().right + 1
    );
  });
  expect(singleLine).toBe(true);
  await mobileFits(page);
  await page.screenshot({ path: info.outputPath("narrow-home-viewport.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "티어 기준" }).first().click();
  await expect(page.getByRole("dialog")).toContainText("마스터");
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.screenshot({
    path: info.outputPath("desktop-global-dashboard.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/history?kind=doubles&period=7&player=all");
  await page.reload();
  await expect(page.getByRole("combobox", { name: "조회 기간" })).toHaveText(
    "최근 7일",
  );
  await aboveMobileNav(
    page.getByRole("button", { name: /번째 경기 상세/ }).nth(4),
  );
  await page.goto(`/players/${session.record.id}`);
  await aboveMobileNav(
    page.getByRole("heading", { name: "Elo 흐름", exact: true }),
  );
  const rank = before.rankings.find(
    (r) => r.playerId === session.record.id && r.kind === "doubles",
  );
  await expect(
    page.getByRole("button", { name: "레이팅 신뢰도 안내" }),
  ).toContainText(`RD ${Math.round(rank?.rd ?? 350)}`);
  await page.getByRole("button", { name: "레이팅 신뢰도 안내" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "RD가 낮을수록 더 확실한 점수예요",
  );
  await page
    .getByRole("dialog")
    .screenshot({ path: info.outputPath("mobile-rating-confidence.png") });
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.screenshot({
    path: info.outputPath("mobile-public-player.png"),
    fullPage: true,
  });
  await mobileFits(page);
  expect((await state(page, session.token)).ratings).toEqual(before.ratings);
});

test("시즌 배치는 확인된 경기만 세고 Elo 순위와 LP 내역을 따로 보여 준다", async ({
  page,
}, info) => {
  const viewer = await signIn(page);
  const opponent = await opponentSession(page);
  const start = await state(page, viewer.token, viewer.record.id);
  await page.goto("/leaderboard?kind=singles");
  const leaderboard = page.getByRole("list", { name: "전체 선수 순위" });
  const own = leaderboard.getByRole("listitem").filter({ hasText: "유월" });
  await expect(own).toHaveCount(0);

  let acceptedID = "";
  for (let game = 0; game < 5; game++) {
    const response = await page.request.post("/api/kokko/arena/proposals", {
      headers: { Authorization: viewer.token },
      data: {
        requestId: crypto.randomUUID(),
        action: "create",
        kind: "singles",
        date: start.today,
        a: [viewer.record.id],
        b: [opponent.record.id],
        scoreA: game === 1 ? 18 : 21,
        scoreB: game === 1 ? 21 : 18,
      },
    });
    expect(response.ok()).toBe(true);
    const p: Proposal = await response.json();
    if (game === 0) {
      await page.reload();
      await expect(own).toHaveCount(0);
    }
    await confirm(page, p);
    acceptedID = p.matchId;
    if (game === 0) {
      await page.reload();
      await expect(own).toContainText("배치 중 1/5");
      await page.screenshot({
        path: info.outputPath("mobile-season-placement.png"),
      });
    }
  }

  await page.reload();
  await expect(own).toContainText("5경기");
  await expect(own).not.toContainText("배치 중");
  await expect(own).toContainText("LP");
  await page.screenshot({
    path: info.outputPath("mobile-season-leaderboard.png"),
    fullPage: true,
  });
  await page
    .getByRole("navigation", { name: "순위 기준" })
    .getByRole("link", { name: "Elo", exact: true })
    .click();
  await expect(own).toContainText("RD");
  await expect(page).toHaveURL(/view=elo/);
  await page.goto(`/players/${viewer.record.id}?kind=singles`);
  const rank = page.getByRole("region", { name: "단식 시즌 랭크" });
  await expect(rank).toContainText("시즌 최고");
  await expect(
    rank.getByRole("progressbar", { name: "다음 디비전 진행도" }),
  ).toBeVisible();
  await rank.screenshot({
    path: info.outputPath("mobile-season-rank-card.png"),
  });
  await rank.getByRole("button", { name: "티어 기준" }).click();
  await expect(page.getByRole("dialog")).toContainText("챌린저");
  await expect(page.getByRole("dialog").getByRole("listitem")).toHaveCount(10);
  await page
    .getByRole("dialog")
    .screenshot({ path: info.outputPath("mobile-season-tier-guide.png") });
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.goto(`/games/${acceptedID}`);
  await expect(page.getByText(/시즌 1 · [+-]?\d+ LP/)).toHaveCount(2);
  await mobileFits(page);
});

test("응답 유실을 재시도해도 상대 확인 전에는 Elo가 바뀌지 않는다", async ({
  page,
  browser,
}, info) => {
  const session = await signIn(page);
  const before = await state(page, session.token);
  await page.goto("/matches/new");
  await lineup(page);
  await page.getByLabel("B팀 점수").fill("20");
  await page
    .getByRole("button", { name: "A팀 22점 승리", exact: true })
    .click();
  await page.screenshot({
    path: info.outputPath("mobile-public-entry.png"),
    fullPage: true,
  });
  let first = true;
  let proposal: Proposal | undefined;
  await page.route("**/api/kokko/arena/proposals", async (route) => {
    if (first) {
      first = false;
      const res = await route.fetch();
      proposal = await res.json();
      await route.abort("failed");
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "경기 저장하기", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "같은 요청으로 다시 저장" }),
  ).toBeVisible();
  await expect(page.getByLabel("A팀 점수")).toHaveValue("22");
  await expect(
    page.getByRole("button", { name: "A팀 2번째 선수 선택" }),
  ).toBeDisabled();
  await page.reload();
  await expect(page.getByLabel("A팀 점수")).toHaveValue("22");
  await page.getByRole("button", { name: "같은 요청으로 다시 저장" }).click();
  await expect(
    page.getByRole("heading", { name: "상대 확인을 기다려요" }),
  ).toBeVisible();
  expect((await state(page, session.token)).revision).toBe(before.revision);
  if (!proposal) throw new Error("Missing proposal");
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  });
  const other = await context.newPage();
  await signIn(other, "teammate");
  await other.goto("/inbox");
  await expect(
    other.locator(`[data-proposal-id="${proposal.id}"]`),
  ).toContainText("같은 팀은 확인할 수 없어요");
  await context.close();
  const opposing = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  });
  const opp = await opposing.newPage();
  await signIn(opp, "opponent");
  await opp.goto("/inbox");
  const card = opp.locator(`[data-proposal-id="${proposal.id}"]`);
  await expect(card).toContainText("제출 시점의 마지막 순서로 예약");
  await card.screenshot({
    path: info.outputPath("mobile-opponent-confirmation.png"),
  });
  await card
    .getByRole("button", { name: "맞아요 · 반영", exact: true })
    .click();
  await expect(card).toContainText("반영 완료");
  const accepted = await state(page, session.token);
  expect(accepted.revision).toBe(before.revision + 1);
  await opposing.close();
  await page.getByRole("button", { name: "같은 선수로 다음 경기" }).click();
  await expect(page.getByLabel("A팀 점수")).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "A팀 2번째 선수 선택" }),
  ).toContainText("서연");
  await page.getByLabel("B팀 점수").fill("20");
  await page
    .getByRole("button", { name: "A팀 22점 승리", exact: true })
    .click();
  await page
    .getByRole("button", { name: "경기 저장하기", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "상대 확인을 기다려요" }),
  ).toBeVisible();
  expect((await state(page, session.token)).revision).toBe(accepted.revision);
});

test("듀스 점수와 빠른 조합은 직접 입력과 다음 대진을 유지한다", async ({
  page,
}, info) => {
  await signIn(page);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/matches/new");
  await lineup(page);
  const a = page.getByLabel("A팀 점수"),
    b = page.getByLabel("B팀 점수");
  await aboveMobileNav(a);
  await aboveMobileNav(b);
  for (const [loser, winner] of [
    ["0", "21"],
    ["19", "21"],
    ["20", "22"],
    ["27", "29"],
    ["28", "30"],
    ["29", "30"],
  ]) {
    await b.fill(loser);
    await page
      .getByRole("button", { name: `A팀 ${winner}점 승리`, exact: true })
      .click();
    await expect(a).toHaveValue(winner);
    await expect(b).toHaveValue(loser);
  }
  await page.getByRole("button", { name: "팀 교환", exact: true }).click();
  await expect(a).toHaveValue("29");
  await expect(b).toHaveValue("30");
  await expect(
    page.getByRole("button", { name: "A팀 승리 점수 없음" }),
  ).toBeDisabled();
  await b.fill("31");
  await expect(
    page.getByRole("button", { name: "경기 저장하기", exact: true }),
  ).toBeDisabled();
  await b.fill("18");
  await a.fill("21");
  const rotation = page.getByRole("group", { name: "빠른 팀 조합" });
  await rotation.getByRole("button", { pressed: false }).first().click();
  await expect(a).toHaveValue("");
  await expect(b).toHaveValue("");
  await page.screenshot({
    path: info.outputPath("mobile-quick-rotation.png"),
    fullPage: true,
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "B팀 1번째 선수 선택" }),
  ).not.toContainText("선수 선택");
  await mobileFits(page);
});

test("친구 수락 후 빠른 선수 목록에 보이고 차단은 과거 기록을 바꾸지 않는다", async ({
  page,
  browser,
}, info) => {
  const me = await signIn(page);
  const newcomer = await (
    await page.request.get("/api/kokko/__test/session?role=newcomer")
  ).json();
  const before = await state(page, me.token);
  await page.goto(`/players/${newcomer.record.id}`);
  await page.getByRole("button", { name: "친구 요청", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "요청 취소", exact: true }),
  ).toBeVisible();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  });
  const other = await context.newPage();
  await signIn(other, "newcomer");
  await other.goto("/friends");
  await other.getByRole("button", { name: "친구 수락", exact: true }).click();
  await expect(
    other
      .getByRole("region", { name: "전체 선수 검색" })
      .getByRole("button", { name: /^유월/ }),
  ).toBeVisible();
  await other.screenshot({
    path: info.outputPath("mobile-friends.png"),
    fullPage: true,
  });
  await page.goto("/matches/new");
  await page.getByRole("button", { name: "A팀 2번째 선수 선택" }).click();
  await expect(
    page.getByRole("dialog").getByRole("button", { name: /^모임 없는 선수/ }),
  ).toContainText("친구");
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.goto(`/players/${newcomer.record.id}`);
  await page.getByRole("button", { name: "차단", exact: true }).click();
  await page.getByRole("button", { name: "차단하기", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "차단 해제", exact: true }),
  ).toBeVisible();
  const players = await (
    await page.request.get("/api/kokko/arena/players?q=모임", {
      headers: { Authorization: me.token },
    })
  ).json();
  expect(players.players).toHaveLength(0);
  expect((await state(page, me.token)).revision).toBe(before.revision);
  await page.getByRole("button", { name: "차단 해제", exact: true }).click();
  await context.close();
});

test("모임 없는 새 선수도 검색해서 경기할 수 있다", async ({ page }) => {
  const session = await signIn(page, "newcomer");
  const before = await state(page, session.token);
  await page.goto("/matches/new");
  await page.getByRole("tab", { name: "단식", exact: true }).click();
  await page.getByRole("button", { name: "B팀 1번째 선수 선택" }).click();
  await page.getByText("다른 선수 찾기", { exact: true }).click();
  await page
    .getByRole("textbox", { name: "전체 선수 검색", exact: true })
    .fill("지훈");
  await page
    .getByRole("region", { name: "전체 선수 검색" })
    .getByRole("button", { name: /^지훈/ })
    .click();
  await page.getByLabel("B팀 점수").fill("18");
  await page
    .getByRole("button", { name: "A팀 21점 승리", exact: true })
    .click();
  await page
    .getByRole("button", { name: "경기 저장하기", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "상대 확인을 기다려요" }),
  ).toBeVisible();
  expect((await state(page, session.token)).revision).toBe(before.revision);
});

test("수정과 삭제는 상대 확인 후 반영하고 제외 경기는 복구를 요청한다", async ({
  page,
}, info) => {
  const session = await signIn(page);
  const p = await reportGame(page, session.token);
  await confirm(page, p);
  const before = await state(page, session.token);
  await page.goto(`/matches/${p.matchId}`);
  await expect(
    page.getByRole("button", { name: "팀 교환", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("A팀 점수").fill("18");
  await page.getByLabel("B팀 점수").fill("21");
  await page
    .getByRole("button", { name: "수정 확인 요청하기", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "상대 확인을 기다려요" }),
  ).toBeVisible();
  expect((await state(page, session.token)).revision).toBe(before.revision);
  const pending = await (
    await page.request.get("/api/kokko/arena/inbox", {
      headers: { Authorization: session.token },
    })
  ).json();
  const edit = pending.proposals.find(
    (x: Proposal) => x.matchId === p.matchId && x.status === "pending",
  );
  expect(edit.action).toBe("edit");
  await confirm(page, edit);
  await page.goto(`/games/${p.matchId}`);
  await expect(page.getByText("18 : 21", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "삭제 요청", exact: true }).click();
  await page.getByRole("button", { name: "요청 보내기", exact: true }).click();
  const inbox = await (
    await page.request.get("/api/kokko/arena/inbox", {
      headers: { Authorization: session.token },
    })
  ).json();
  await confirm(
    page,
    inbox.proposals.find(
      (x: Proposal) => x.matchId === p.matchId && x.status === "pending",
    ),
  );
  await page.goto("/withdrawn");
  await expect(
    page.getByRole("heading", { name: "제외된 경기" }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("mobile-withdrawn.png"),
    fullPage: true,
  });
  await page.goto(`/games/${p.matchId}`);
  await page.getByRole("button", { name: "복구 요청", exact: true }).click();
  await page.getByRole("button", { name: "요청 보내기", exact: true }).click();
  const restored = await (
    await page.request.get("/api/kokko/arena/inbox", {
      headers: { Authorization: session.token },
    })
  ).json();
  await confirm(
    page,
    restored.proposals.find(
      (x: Proposal) => x.matchId === p.matchId && x.status === "pending",
    ),
  );
  expect(
    (await page.request.get(`/api/kokko/arena/matches/${p.matchId}`)).status(),
  ).toBe(200);
});

test("잘못된 결과 신고와 관리자 제외는 사유를 기록한다", async ({
  page,
}, info) => {
  const session = await signIn(page);
  const p = await reportGame(page, session.token);
  await confirm(page, p);
  await page.goto(`/games/${p.matchId}`);
  await page
    .getByRole("button", { name: "잘못된 경기 신고", exact: true })
    .click();
  await page.getByLabel("사유", { exact: true }).fill("점수 입력을 잘못했어요");
  await page.getByRole("button", { name: "신고하기", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("신고를 접수했어요.");
  await page.goto("/admin");
  await expect(
    page.getByText("점수 입력을 잘못했어요", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("mobile-service-admin.png"),
    fullPage: true,
  });
  await page.goto(`/games/${p.matchId}`);
  await page
    .getByRole("button", { name: "관리자: 통계에서 제외", exact: true })
    .click();
  await page
    .getByLabel("사유", { exact: true })
    .fill("참여 선수와 확인한 잘못된 결과");
  await page
    .getByRole("button", { name: "통계에서 제외", exact: true })
    .click();
  await expect(page.getByText(/통계에서 제외됨/)).toBeVisible();
  expect(
    (await page.request.get(`/api/kokko/arena/matches/${p.matchId}`)).status(),
  ).toBe(404);
  await page.goto("/admin");
  await page
    .getByRole("button", { name: "복구 요청 허용", exact: true })
    .click();
  await page
    .getByLabel("검토 사유", { exact: true })
    .fill("참여 선수와 원본 확인 완료");
  await page.getByRole("button", { name: "검토 저장", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("검토 결과를 저장했어요.");
  expect(
    (await page.request.get(`/api/kokko/arena/matches/${p.matchId}`)).status(),
  ).toBe(404);
});

test("오늘의 코트는 친구를 골라 추천하고 기존 점수 초안을 지킨다", async ({
  page,
}, info) => {
  await signIn(page);
  await page.goto("/court");
  await page
    .getByRole("button", { name: "오늘의 선수 선택", exact: true })
    .click();
  for (const name of ["서연", "지훈", "민서", "도윤"]) {
    await page
      .getByRole("button", { name: `${name} 참석`, exact: true })
      .click();
  }
  await page
    .getByRole("button", { name: "5명 선택 완료", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "다음 게임, 이 조합 어때요?" }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("mobile-public-court.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "이 조합으로 경기 기록", exact: true })
    .first()
    .click();
  await page.getByLabel("B팀 점수").fill("19");
  await page
    .getByRole("button", { name: "A팀 21점 승리", exact: true })
    .click();
  await page.goto("/court");
  await page
    .getByRole("button", { name: "이 조합으로 경기 기록", exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "작성 중인 경기가 있어요",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /기존 경기|이어서|돌아/ })
    .click();
  await expect(page.getByLabel("A팀 점수")).toHaveValue("21");
  await expect(page.getByLabel("B팀 점수")).toHaveValue("19");
});

test("예상 승률과 가상 대결은 최신 RD를 쓰고 저장 초안과 Elo를 바꾸지 않는다", async ({
  page,
}, info) => {
  const session = await signIn(page);
  const before = await state(page, session.token);
  const id = (name: string) =>
    before.profiles.find((p) => p.nickname === name)?.id || "";
  await page.goto("/matches/new");
  await lineup(page);
  await expectPrediction(
    page,
    before,
    "doubles",
    [id("유월"), id("서연")],
    [id("지훈"), id("민서")],
  );
  await page.getByLabel("B팀 점수").fill("20");
  await page
    .getByRole("button", { name: "A팀 22점 승리", exact: true })
    .click();
  const draft = await page.evaluate(
    (id) => sessionStorage.getItem(`kokko.draft.${id}.new`),
    session.record.id,
  );
  await page.goto("/simulate");
  await lineup(page);
  await choose(page, "A팀 1번째 선수 선택", "도윤");
  await expectPrediction(
    page,
    before,
    "doubles",
    [id("도윤"), id("서연")],
    [id("지훈"), id("민서")],
  );
  await page.screenshot({
    path: info.outputPath("mobile-simulation.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      (id) => sessionStorage.getItem(`kokko.draft.${id}.new`),
      session.record.id,
    ),
  ).toBe(draft);
  const after = await state(page, session.token);
  expect(after.revision).toBe(before.revision);
  expect(after.rankings).toEqual(before.rankings);
  await page.goto("/matches/new");
  await expect(page.getByLabel("A팀 점수")).toHaveValue("22");
});

test("프로필 활동은 기간 필터와 무관하고 모바일 달력을 제공한다", async ({
  page,
}, info) => {
  const session = await signIn(page);
  const s = await state(page, session.token, session.record.id);
  await page.goto(`/players/${session.record.id}?period=7&kind=singles`);
  await expect(
    page.getByRole("heading", { name: "차곡차곡, 코트에 나온 날" }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("mobile-global-activity.png"),
    fullPage: true,
  });
  const filtered = await page.request.get(
    `/api/kokko/arena/state?period=7&kind=singles&player=${session.record.id}`,
  );
  expect((await filtered.json()).activity).toEqual(s.activity);
  await mobileFits(page);
});

test("관리자 닉네임 편집은 재시도 후에도 선수 ID와 전적을 보존한다", async ({
  page,
}, info) => {
  const session = await signIn(page);
  const before = await state(page, session.token);
  const target = before.profiles.find((p) => p.nickname === "하린");
  if (!target) throw new Error("Missing target");
  await page.goto("/admin");
  await page
    .getByRole("textbox", { name: "회원 검색", exact: true })
    .pressSequentially("하린");
  await expect(
    page.getByRole("textbox", { name: "회원 검색", exact: true }),
  ).toHaveValue("하린");
  await page
    .getByRole("button", { name: "하린 닉네임 변경", exact: true })
    .click();
  await page.getByLabel("새 닉네임", { exact: true }).fill(" ");
  await page.getByRole("button", { name: "닉네임 저장", exact: true }).click();
  await expect(
    page.getByText("닉네임은 1~20자로 입력해 주세요."),
  ).toBeVisible();
  await page.getByLabel("새 닉네임", { exact: true }).fill("새 하린");
  let first = true;
  await page.route(`**/arena/players/${target.id}/nickname`, async (route) => {
    if (first) {
      first = false;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "닉네임 저장", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "닉네임 저장", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "새 하린 닉네임 변경", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("mobile-admin-nickname.png"),
    fullPage: true,
  });
  const after = await state(page, session.token);
  expect(after.rankings).toEqual(before.rankings);
  expect(after.profiles.find((p) => p.id === target.id)?.nickname).toBe(
    "새 하린",
  );
  await page.request.patch(`/api/kokko/arena/players/${target.id}/nickname`, {
    headers: { Authorization: session.token },
    data: { nickname: "하린" },
  });
});

test("이전 모임의 미확인 저장을 재확인하고 점수를 새 확인 요청으로 전환한다", async ({
  page,
}) => {
  const session = await signIn(page);
  const s = await state(page, session.token);
  const ids = ["유월", "서연", "지훈", "민서"].map(
    (n) => s.profiles.find((p) => p.nickname === n)?.id,
  );
  await page.addInitScript(
    ({ user, ids, date }) => {
      const request = {
        groupId: "old-private-group",
        requestId: "unprocessed-legacy-request",
        action: "create",
        kind: "doubles",
        date,
        a: ids.slice(0, 2),
        b: ids.slice(2),
        scoreA: 22,
        scoreB: 20,
      };
      sessionStorage.setItem(
        `kokko.draft.${user}.old-private-group.new`,
        JSON.stringify({
          kind: "doubles",
          date,
          slots: ids,
          scoreA: "22",
          scoreB: "20",
          position: "0",
          request,
        }),
      );
    },
    { user: session.record.id, ids, date: s.today },
  );
  await page.goto("/matches/new");
  await page.getByText("이전 모임의 입력 초안 1개", { exact: true }).click();
  await page
    .getByRole("button", { name: "이전 초안 1 불러오기", exact: true })
    .click();
  await page
    .getByRole("button", { name: "같은 요청으로 다시 저장", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "이전 저장 요청은 처리되지 않았어요",
  );
  await expect(page.getByLabel("A팀 점수")).toHaveValue("22");
  await page
    .getByRole("button", { name: "경기 저장하기", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "상대 확인을 기다려요" }),
  ).toBeVisible();
});

test("일반 회원은 서비스 관리자 화면과 API를 사용할 수 없다", async ({
  page,
}) => {
  const session = await signIn(page, "member");
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "하린님의 코트", exact: true }),
  ).toBeVisible();
  expect(
    (
      await page.request.get("/api/kokko/arena/reports", {
        headers: { Authorization: session.token },
      })
    ).status(),
  ).toBe(403);
});

test("긴 닉네임도 상대 확인 카드에서 화면을 넘지 않는다", async ({
  page,
}, info) => {
  const session = await signIn(page);
  const p = await reportGame(page, session.token);
  const s = await state(page, session.token);
  const players = s.profiles.filter((player) =>
    [...p.match.a, ...p.match.b].includes(player.id),
  );
  try {
    for (const [i, player] of players.entries()) {
      const res = await page.request.patch(
        `/api/kokko/arena/players/${player.id}/nickname`,
        {
          headers: { Authorization: session.token },
          data: { nickname: `abcdefghijklmnopqrs${i}` },
        },
      );
      expect(res.status()).toBe(200);
    }
    await page.goto("/inbox");
    await expect(page.locator(`[data-proposal-id="${p.id}"]`)).toBeVisible();
    await mobileFits(page);
    await page
      .locator(`[data-proposal-id="${p.id}"]`)
      .screenshot({ path: info.outputPath("mobile-inbox-long-names.png") });
  } finally {
    for (const player of players)
      await page.request.patch(
        `/api/kokko/arena/players/${player.id}/nickname`,
        {
          headers: { Authorization: session.token },
          data: { nickname: player.nickname },
        },
      );
  }
});
