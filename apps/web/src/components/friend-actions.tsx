import { useState } from "react";
import { api } from "@/lib/api";
import type { Profile, Social } from "@/lib/types";
import { Button } from "./ui/button";

export function FriendActions({
  player,
  meId,
  social,
  refresh,
}: {
  player: Profile;
  meId: string;
  social: Social;
  refresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmBlock, setConfirmBlock] = useState(false);
  if (player.id === meId) return <span className="muted">나</span>;
  const has = (list: Profile[]) => list.some((p) => p.id === player.id);
  const blocked = has(social.blocked);
  const friend = has(social.friends);
  const incoming = has(social.incoming);
  const outgoing = has(social.outgoing);
  async function act(action: string) {
    setBusy(true);
    setError("");
    try {
      await api(`/arena/social/${player.id}`, "POST", { action });
      setConfirmBlock(false);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {blocked ? (
          <Button
            variant="outline"
            className="h-11"
            disabled={busy}
            onClick={() => act("unblock")}
          >
            차단 해제
          </Button>
        ) : incoming ? (
          <>
            <Button
              className="h-11"
              disabled={busy}
              onClick={() => act("accept")}
            >
              친구 수락
            </Button>
            <Button
              variant="outline"
              className="h-11"
              disabled={busy}
              onClick={() => act("decline")}
            >
              거절
            </Button>
          </>
        ) : friend ? (
          <Button
            variant="outline"
            className="h-11"
            disabled={busy}
            onClick={() => act("remove")}
          >
            친구 삭제
          </Button>
        ) : outgoing ? (
          <Button
            variant="outline"
            className="h-11"
            disabled={busy}
            onClick={() => act("remove")}
          >
            요청 취소
          </Button>
        ) : (
          <Button
            className="h-11"
            disabled={busy || player.status !== "active"}
            onClick={() => act("request")}
          >
            친구 요청
          </Button>
        )}
        {!blocked && (
          <Button
            variant="ghost"
            className="h-11"
            disabled={busy}
            onClick={() => setConfirmBlock((v) => !v)}
          >
            차단
          </Button>
        )}
      </div>
      {confirmBlock && (
        <div className="rounded-lg border p-3 text-sm">
          <p>
            친구 관계가 해제되고 서로 새 경기와 친구 요청을 보낼 수 없어요. 지난
            기록은 유지돼요.
          </p>
          <Button
            variant="outline"
            className="mt-3 h-11"
            disabled={busy}
            onClick={() => act("block")}
          >
            차단하기
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
