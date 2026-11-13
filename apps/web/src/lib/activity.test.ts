import { describe, expect, it } from "vitest";
import { playerActivity, shiftDate } from "./activity";

const match = (date: string, a = ["me"], b = ["other"], deleted = false) => ({
  date,
  a,
  b,
  deleted,
});

describe("배드민턴 활동과 연속 기록", () => {
  it("빈 기록은 365개의 빈 날짜와 0일을 보여준다", () => {
    const result = playerActivity([], "me", "2026-11-13");
    expect(result).toMatchObject({
      current: 0,
      longest: 0,
      activeDays: 0,
      games: 0,
    });
    expect(result.days).toHaveLength(365);
    expect(result.days[0]).toEqual({ date: "2025-11-14", count: 0 });
    expect(result.days[364]).toEqual({ date: "2026-11-13", count: 0 });
  });

  it("경기 수와 활동 일수를 구분하고 양 팀의 단복식을 합친다", () => {
    const result = playerActivity(
      [
        match("2026-11-12"),
        match("2026-11-13", ["other"], ["me"]),
        match("2026-11-13", ["other", "partner"], ["opponent", "me"]),
        match("2026-11-13", ["other"], ["partner"]),
        match("2026-11-14"),
        match("2026-11-11", ["me"], ["other"], true),
      ],
      "me",
      "2026-11-13",
    );
    expect(result).toMatchObject({
      current: 2,
      longest: 2,
      activeDays: 2,
      games: 3,
    });
    expect(result.days[364].count).toBe(2);
  });

  it("오늘을 기다리되 어제도 쉬었다면 현재 기록은 끝난다", () => {
    const matches = [match("2026-11-11"), match("2026-11-12")];
    expect(playerActivity(matches, "me", "2026-11-13").current).toBe(2);
    expect(playerActivity(matches, "me", "2026-11-14")).toMatchObject({
      current: 0,
      longest: 2,
    });
  });

  it("정렬에 관계없이 최장 기록은 달력 밖까지 전체 이력을 센다", () => {
    const matches = [
      match("2026-11-13"),
      match("2024-12-31"),
      match("2025-01-02"),
      match("2025-01-01"),
    ];
    expect(playerActivity(matches, "me", "2026-11-13")).toMatchObject({
      current: 1,
      longest: 3,
      activeDays: 1,
      games: 1,
    });
    const longRun = Array.from({ length: 400 }, (_, i) =>
      match(shiftDate("2026-11-13", -i)),
    );
    expect(playerActivity(longRun, "me", "2026-11-13")).toMatchObject({
      current: 400,
      longest: 400,
      activeDays: 365,
      games: 365,
    });
  });

  it("윤일과 연말 경계를 하루 간격으로 계산한다", () => {
    const matches = [
      match("2024-02-28"),
      match("2024-02-29"),
      match("2024-03-01"),
    ];
    expect(playerActivity(matches, "me", "2024-03-01").current).toBe(3);
    expect(shiftDate("2025-01-01", -1)).toBe("2024-12-31");
    expect(shiftDate("2026-03-08", 1)).toBe("2026-03-09");
  });

  it("삭제, 복원, 날짜와 참가자 정정을 새 스냅샷에서 반영한다", () => {
    const matches = [
      match("2026-11-11"),
      match("2026-11-12"),
      match("2026-11-13"),
    ];
    matches[1].deleted = true;
    expect(playerActivity(matches, "me", "2026-11-13").longest).toBe(1);
    matches[1].deleted = false;
    expect(playerActivity(matches, "me", "2026-11-13").longest).toBe(3);
    matches[1].date = "2026-11-10";
    expect(playerActivity(matches, "me", "2026-11-13")).toMatchObject({
      current: 1,
      longest: 2,
    });
    matches[2].a = ["someone-else"];
    expect(playerActivity(matches, "me", "2026-11-13").current).toBe(0);
  });
});
