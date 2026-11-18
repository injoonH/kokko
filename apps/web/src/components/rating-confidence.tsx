import type { Ranking } from "@/lib/types";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";

export function RatingConfidence({ ranking }: { ranking?: Ranking }) {
  const rd = ranking?.games ? ranking.rd : 350;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          className="mt-3 h-auto min-h-11 w-full justify-between gap-2 px-2 text-xs"
          aria-label="레이팅 신뢰도 안내"
        >
          <span>레이팅 신뢰도 · RD {Math.round(rd)}</span>
          <span className="font-normal text-muted-foreground">알아보기</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>내 점수는 얼마나 확실할까요?</DialogTitle>
          <DialogDescription>
            Glicko는 점수와 함께 신뢰도를 계산해요.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm leading-relaxed">
          <p>
            현재 RD는 <strong>{Math.round(rd)}</strong>예요. RD가 낮을수록 더
            확실한 점수예요. 처음에는 350으로 시작하고, 경기를 기록할수록
            줄어들어요.
          </p>
          <p>
            오랫동안 쉬면 RD가 다시 높아져요. 쉬는 동안 점수 자체가 내려가지는
            않아요.
          </p>
          <p>
            나와 상대의 RD를 함께 반영하므로 처음 몇 경기는 점수가 크게 바뀔 수
            있어요. 복식도 팀원마다 변화량이 달라요.
          </p>
          <p className="text-muted-foreground">
            단식과 복식은 따로 계산해요. 점수 차 대신 승패를 반영하며, 과거
            기록을 수정하면 그 뒤의 점수와 RD도 다시 계산해요.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
