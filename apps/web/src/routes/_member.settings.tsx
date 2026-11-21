import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, LogOut, Shield } from "lucide-react";
import { ProfileForm } from "@/components/profile-form";
import { Button } from "@/components/ui/button";
import { logout } from "@/lib/api";
import { requirePlayer } from "@/lib/arena";
import { parseFilters } from "@/lib/types";
export const Route = createFileRoute("/_member/settings")({
  beforeLoad: requirePlayer,
  component: Settings,
});
function Settings() {
  const { user } = Route.useRouteContext();
  return (
    <div className="mx-auto max-w-xl">
      <p className="eyebrow mb-3">내 코트의 작은 설정</p>
      <h1 className="page-title mb-8">설정</h1>
      {user.profile && (
        <ProfileForm profile={user.profile} refresh={() => {}} />
      )}
      <div className="panel mt-5 space-y-4">
        <Link
          to="/account"
          className="flex min-h-11 items-center justify-between font-medium"
        >
          로그인 계정 연결
          <ArrowUpRight size={17} />
        </Link>
        <Link
          to="/players/$playerId"
          search={parseFilters({})}
          params={{ playerId: user.id }}
          className="flex min-h-11 items-center justify-between font-medium"
        >
          내 공개 프로필
          <ArrowUpRight size={17} />
        </Link>
        <Link
          to="/withdrawn"
          className="flex min-h-11 items-center justify-between font-medium"
        >
          제외된 경기
          <ArrowUpRight size={17} />
        </Link>
        {user.role === "admin" && (
          <Link
            to="/admin"
            className="flex min-h-11 items-center justify-between font-medium"
          >
            <span className="flex items-center gap-3">
              <Shield size={19} />
              서비스 관리
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
      <p className="muted mt-6">
        이메일과 로그인 계정 정보는 다른 회원에게 공개되지 않아요.
      </p>
    </div>
  );
}
