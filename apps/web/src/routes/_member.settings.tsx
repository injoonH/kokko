import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, LogOut, Shield } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Avatar, ErrorBox, Loading, useStateData } from "@/components/shared";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { api, pb } from "@/lib/api";
import { type Profile, parseFilters } from "@/lib/types";
export const Route = createFileRoute("/_member/settings")({
  component: Settings,
});
function Settings() {
  const { state, error, refresh } = useStateData(parseFilters({}));
  if (error) return <ErrorBox message={error} retry={refresh} />;
  if (!state) return <Loading />;
  const p = state.profiles.find((p) => p.id === state.me.id);
  return (
    <div className="mx-auto max-w-xl">
      <p className="eyebrow mb-3">내 코트의 작은 설정</p>
      <h1 className="page-title mb-8">설정</h1>
      {p && <ProfileForm profile={p} refresh={refresh} />}
      <div className="panel mt-5 space-y-4">
        {state.me.role === "admin" && (
          <Link
            to="/admin"
            className="flex min-h-11 items-center justify-between font-medium"
          >
            <span className="flex items-center gap-3">
              <Shield size={19} />
              모임 관리
            </span>
            <ArrowUpRight size={17} />
          </Link>
        )}
        <Button
          variant="ghost"
          className="min-h-11 w-full justify-start px-0"
          onClick={() => {
            pb.authStore.clear();
            for (const k of Object.keys(sessionStorage)) {
              if (k.startsWith("kokko.")) sessionStorage.removeItem(k);
            }
            window.location.assign("/login");
          }}
        >
          <LogOut />
          로그아웃
        </Button>
      </div>
      <p className="muted mt-6">이메일은 다른 회원에게 공개되지 않아요.</p>
    </div>
  );
}
function ProfileForm({
  profile,
  refresh,
}: {
  profile: Profile;
  refresh: () => void;
}) {
  const form = useForm({ defaultValues: { nickname: profile.nickname } });
  const [avatar, setAvatar] = useState(profile.avatar);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function image(file?: File) {
    if (!file) return;
    setError("");
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 10_000_000
    ) {
      setError("10MB 이하의 PNG·JPEG·WebP 이미지를 선택해 주세요.");
      return;
    }
    try {
      const img = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error();
      const side = Math.min(img.width, img.height);
      ctx.drawImage(
        img,
        (img.width - side) / 2,
        (img.height - side) / 2,
        side,
        side,
        0,
        0,
        256,
        256,
      );
      img.close();
      setAvatar(canvas.toDataURL("image/jpeg", 0.85));
    } catch {
      setError("이미지를 읽지 못했습니다. 다른 파일을 선택해 주세요.");
    }
  }
  return (
    <Form {...form}>
      <form
        className="panel space-y-5"
        onSubmit={form.handleSubmit(async (values) => {
          setError("");
          setMessage("");
          try {
            await api("/profile", "PATCH", { ...values, avatar });
            setMessage("프로필을 저장했어요.");
            refresh();
          } catch (e) {
            setError((e as Error).message);
          }
        })}
      >
        <div className="flex items-center gap-4">
          <Avatar profile={{ ...profile, avatar }} />
          <div>
            <label className="text-sm font-medium" htmlFor="avatar">
              프로필 사진
            </label>
            <input
              id="avatar"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="mt-1 block w-full max-w-60 text-xs"
              onChange={(e) => void image(e.target.files?.[0])}
            />
          </div>
          {avatar && (
            <Button type="button" variant="ghost" onClick={() => setAvatar("")}>
              삭제
            </Button>
          )}
        </div>
        <FormField
          control={form.control}
          name="nickname"
          rules={{
            required: "닉네임을 입력해 주세요.",
            maxLength: { value: 20, message: "20자 이내로 입력해 주세요." },
          }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>닉네임</FormLabel>
              <FormControl>
                <Input {...field} maxLength={20} className="h-12" />
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
        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
        <Button className="h-12 w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "저장 중…" : "프로필 저장"}
        </Button>
      </form>
    </Form>
  );
}
