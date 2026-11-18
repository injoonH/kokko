import { LockKeyhole } from "lucide-react";
import { useState } from "react";
import { changeGroup, currentGroup } from "@/lib/groups";
import type { Me } from "@/lib/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

export function GroupSelector({ user }: { user: Me }) {
  const [error, setError] = useState("");
  const selected = user.groups.find((g) => g.id === currentGroup(user.id));
  if (!selected) return null;
  return (
    <div className="mx-auto max-w-6xl px-5 pb-3 md:px-10">
      <div className="flex min-h-9 items-center gap-2 text-xs text-muted-foreground">
        <LockKeyhole size={14} aria-hidden="true" />
        {user.groups.length === 1 ? (
          <p>{selected.name} · 비공개 모임</p>
        ) : (
          <Select
            value={selected.id}
            onValueChange={(id) => {
              if (id === selected.id) return;
              try {
                if (!changeGroup(user.id, id)) {
                  setError(
                    "저장 결과를 확인한 뒤 모임을 바꿔 주세요. 입력 화면에서 저장을 다시 시도할 수 있어요.",
                  );
                  return;
                }
                window.location.assign("/");
              } catch {
                setError(
                  "입력한 기록을 확인할 수 없어요. 현재 모임에서 저장을 마친 뒤 다시 시도해 주세요.",
                );
              }
            }}
          >
            <SelectTrigger
              aria-label="현재 모임"
              className="min-h-11 max-w-64 bg-background text-foreground"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {user.groups.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <span className="ml-auto hidden sm:inline">
          레이팅은 모임을 옮겨도 이어져요
        </span>
      </div>
      {error && (
        <p role="alert" className="mt-2 max-w-md text-xs text-foreground">
          {error}
        </p>
      )}
    </div>
  );
}
