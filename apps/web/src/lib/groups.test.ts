import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  changeGroup,
  chooseInitialGroup,
  currentGroup,
  groupStorageKey,
  hasPendingSave,
} from "./groups";
import type { Group } from "./types";

beforeEach(() => {
  const values: Record<string, string> = {};
  const storage = Object.defineProperties(values, {
    getItem: { value: (key: string) => values[key] ?? null },
    setItem: {
      value: (key: string, value: string) => {
        values[key] = value;
      },
    },
    removeItem: {
      value: (key: string) => {
        delete values[key];
      },
    },
  });
  vi.stubGlobal("sessionStorage", storage);
});
afterEach(() => vi.unstubAllGlobals());
const groups: Group[] = [
  { id: "legacy", name: "친구들", visibility: "private", role: "member" },
  { id: "second", name: "주말", visibility: "private", role: "owner" },
];

describe("Group context and pending drafts", () => {
  it("selects only a current membership and keeps accounts separate", () => {
    expect(chooseInitialGroup("a", groups)).toBe("legacy");
    expect(changeGroup("a", "second")).toBe(true);
    expect(chooseInitialGroup("a", groups)).toBe("second");
    expect(currentGroup("b")).toBe("legacy");
    expect(chooseInitialGroup("a", groups.slice(0, 1))).toBe("legacy");
    expect(chooseInitialGroup("no-groups", [])).toBeUndefined();
  });
  it("preserves existing legacy keys and isolates all other group data", () => {
    for (const type of ["draft", "lineup", "court"] as const) {
      const legacy = groupStorageKey(type, "a", "legacy", "new");
      expect(legacy).toBe(`kokko.${type}.a.new`);
      expect(groupStorageKey(type, "a", "second", "new")).toBe(
        `kokko.${type}.a.second.new`,
      );
      sessionStorage.setItem(legacy, "original");
      expect(
        sessionStorage.getItem(groupStorageKey(type, "a", "second", "new")),
      ).toBeNull();
    }
  });
  it("blocks switching while either new or historical current-group saves are unresolved", () => {
    for (const id of ["new", "match123"]) {
      const key = groupStorageKey("draft", "a", "legacy", id);
      sessionStorage.setItem(
        key,
        JSON.stringify({ request: { requestId: "same-retry" }, scoreA: "21" }),
      );
      expect(hasPendingSave("a", "legacy")).toBe(true);
      expect(changeGroup("a", "second")).toBe(false);
      expect(currentGroup("a")).toBe("legacy");
      expect(
        JSON.parse(sessionStorage.getItem(key) || "null").request.requestId,
      ).toBe("same-retry");
      sessionStorage.removeItem(key);
    }
  });
  it("never confuses another group's or account's pending request with the current draft", () => {
    sessionStorage.setItem(
      groupStorageKey("draft", "a", "second", "new"),
      JSON.stringify({ request: { requestId: "second" } }),
    );
    sessionStorage.setItem(
      groupStorageKey("draft", "b", "legacy", "new"),
      JSON.stringify({ request: { requestId: "other" } }),
    );
    expect(hasPendingSave("a", "legacy")).toBe(false);
    expect(changeGroup("a", "second")).toBe(true);
    expect(changeGroup("a", "legacy")).toBe(false);
  });
  it("keeps unfinished scores intact when switching is allowed", () => {
    const key = groupStorageKey("draft", "a", "legacy", "new");
    const raw = JSON.stringify({
      request: null,
      scoreA: "21",
      scoreB: "19",
      slots: ["a", "b", "c", "d"],
    });
    sessionStorage.setItem(key, raw);
    expect(changeGroup("a", "second")).toBe(true);
    expect(sessionStorage.getItem(key)).toBe(raw);
  });
});
