import { redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { api, me } from "./api";

export async function requirePlayer() {
  const user = await me();
  if (!user) throw redirect({ to: "/login" });
  if (user.status !== "active") throw redirect({ to: "/join" });
  return { user };
}
export function useArenaQuery<T>(path: string | null, poll = false) {
  const [snapshot, setSnapshot] = useState<{ path: string; data: T } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: version explicitly refreshes a server snapshot.
  useEffect(() => {
    if (!path) return;
    let active = true;
    setError("");
    api<T>(path)
      .then((value) => {
        if (active) setSnapshot({ path, data: value });
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [path, version]);
  useEffect(() => {
    window.addEventListener("focus", refresh);
    const timer = poll
      ? window.setInterval(() => {
          if (document.visibilityState === "visible") refresh();
        }, 30_000)
      : undefined;
    return () => {
      window.removeEventListener("focus", refresh);
      if (timer) window.clearInterval(timer);
    };
  }, [poll, refresh]);
  return {
    data: snapshot?.path === path ? snapshot.data : null,
    error,
    refresh,
  };
}
