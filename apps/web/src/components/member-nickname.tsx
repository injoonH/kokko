import { useState } from "react";
import { useForm } from "react-hook-form";
import { api } from "@/lib/api";
import type { Profile } from "@/lib/types";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "./ui/form";
import { Input } from "./ui/input";

export function MemberNicknameDialog({
  profile,
  onClose,
  onSaved,
}: {
  profile: Profile;
  onClose: () => void;
  onSaved: (nickname: string) => void;
}) {
  const form = useForm({ defaultValues: { nickname: profile.nickname } });
  const [error, setError] = useState("");
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !form.formState.isSubmitting) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>회원 닉네임 변경</DialogTitle>
          <DialogDescription>
            {profile.nickname}님의 닉네임을 바꿔요. 사진과 경기 기록은
            유지됩니다.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            className="space-y-5"
            onSubmit={form.handleSubmit(async ({ nickname }) => {
              setError("");
              try {
                const trimmed = nickname.trim();
                await api(`/members/${profile.id}/nickname`, "PATCH", {
                  nickname: trimmed,
                });
                onSaved(trimmed);
              } catch (e) {
                setError((e as Error).message);
              }
            })}
          >
            <FormField
              control={form.control}
              name="nickname"
              rules={{
                validate: (value) => {
                  const length = Array.from(value.trim()).length;
                  return (
                    (length >= 1 && length <= 20) ||
                    "닉네임은 1~20자로 입력해 주세요."
                  );
                },
              }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>새 닉네임</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      autoComplete="off"
                      className="h-12"
                      disabled={form.formState.isSubmitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {error && (
              <p role="alert" className="text-sm">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="h-11"
                disabled={form.formState.isSubmitting}
                onClick={onClose}
              >
                취소
              </Button>
              <Button className="h-11" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "저장 중…" : "닉네임 저장"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
