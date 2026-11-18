import type { Group } from "./types";

export const LEGACY_GROUP = "legacy";
const selectionKey = (user: string) => `kokko.group.${user}`;
export function currentGroup(user: string) {
  return sessionStorage.getItem(selectionKey(user)) || LEGACY_GROUP;
}
export function chooseInitialGroup(user: string, groups: Group[]) {
  const selected = currentGroup(user);
  const id = groups.find((g) => g.id === selected)?.id || groups[0]?.id;
  if (id) sessionStorage.setItem(selectionKey(user), id);
  return id;
}
// Legacy keys remain readable, including unresolved pre-migration requests.
// Every other group gets a distinct namespace, never a fallback to those keys.
export function groupStorageKey(
  type: "draft" | "lineup" | "court",
  user: string,
  group: string,
  suffix: string,
) {
  return `kokko.${type}.${user}.${group === LEGACY_GROUP ? "" : `${group}.`}${suffix}`;
}
export function hasPendingSave(user: string, group: string) {
  for (const key of Object.keys(sessionStorage)) {
    const parts = key.split(".");
    if (parts[0] !== "kokko" || parts[1] !== "draft" || parts[2] !== user)
      continue;
    const belongs =
      group === LEGACY_GROUP
        ? parts.length === 4
        : parts.length === 5 && parts[3] === group;
    if (belongs && JSON.parse(sessionStorage.getItem(key) || "null")?.request)
      return true;
  }
  return false;
}
export function changeGroup(user: string, group: string) {
  if (hasPendingSave(user, currentGroup(user))) return false;
  sessionStorage.setItem(selectionKey(user), group);
  return true;
}
