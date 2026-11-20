import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, LogOut, Shield } from "lucide-react";
import { ProfileForm } from "@/components/profile-form";
import { ErrorBox, Loading, useStateData } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { logout } from "@/lib/api";
import { parseFilters } from "@/lib/types";
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
        <Link
          to="/account"
          className="flex min-h-11 items-center justify-between font-medium"
        >
          로그인 계정 연결
          <ArrowUpRight size={17} />
        </Link>
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
          onClick={logout}
        >
          <LogOut />
          로그아웃
        </Button>
      </div>
      <p className="muted mt-6">이메일은 다른 회원에게 공개되지 않아요.</p>
    </div>
  );
}
