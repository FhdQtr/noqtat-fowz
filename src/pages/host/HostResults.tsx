import type { Match } from "../../types/game";
import { TEAM_COLORS } from "../../types/game";
import { useAsyncAction } from "../../lib/useAsyncAction";
import { unlockAudio } from "../../lib/sounds";
import { useNavigate } from "react-router";
import { Trophy, Trash2 } from "lucide-react";
import GoldConfetti from "../../components/GoldConfetti";
import ScoreAdjustmentPanel from "../../components/ScoreAdjustmentPanel";
import { deleteMatch } from "../../lib/matchApi";

export default function HostResults({ match, code }: { match: Match; code: string }) {
  const nav = useNavigate();
  const { busy, error: actionError, run } = useAsyncAction();
  const act = (fn: () => Promise<unknown>) => { unlockAudio(); return run(fn); };
  const winners = match.teamOrder.map((key) => match.teams[key]).filter(Boolean).sort((a, b) => b.score - a.score);
  const isTie = winners.length > 1 && winners[0].score === winners[1].score;
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4 relative">
      {actionError && <p role="alert" className="text-maroon-light font-bold">{actionError}</p>}
      <GoldConfetti />
      <div className="fixed inset-0 -z-10">
        <img src="/img/al-midan-hero.webp" alt="" className="w-full h-full object-cover opacity-30" />
        <div className="absolute inset-0 bg-night/80" />
      </div>
      <img src="/img/trophy.png" alt="الكأس" className="w-44 h-44 object-contain animate-float-slow drop-shadow-[0_0_44px_rgba(212,175,55,0.6)]" />
      <h1 className="mt-4 text-3xl sm:text-5xl font-black font-cairo text-gold-gradient text-center">
        {isTie ? "تعادل مثير!" : `الفائز: ${winners[0]?.name}`}
      </h1>
      {!isTie && winners[0] && (
        <p className="mt-2 text-gold-light font-cairo text-xl">{winners[0].score} نقطة</p>
      )}
      <div className="mt-8 glass-card p-6 w-full max-w-md">
        {winners.map((t, i) => {
          const c = TEAM_COLORS[t.color];
          return (
            <div key={t.code} className="flex items-center gap-3 py-2.5 border-b border-gold-faint/20 last:border-0">
              <span className="w-8 text-center font-black font-cairo text-gold-light">{i + 1}</span>
              <span className="w-3.5 h-3.5 rounded-full" style={{ background: c.light }} />
              <span className="flex-1 font-cairo font-bold">{t.name}</span>
              <span className="text-xs text-muted-foreground">{t.correctCount} صح · {t.wrongCount} غلط</span>
              <span className="font-black font-cairo text-gold-gradient text-xl">{t.score}</span>
            </div>
          );
        })}
      </div>
      <ScoreAdjustmentPanel match={match} matchCode={code} />
      <div className="mt-8 flex flex-wrap gap-3 justify-center">
        <button onClick={() => nav("/host")} className="btn-gold flex items-center gap-2">
          <Trophy className="w-5 h-5" />
          مسابقة جديدة
        </button>
        <button onClick={() => nav("/")} className="btn-ghost-gold">الرئيسية</button>
        <button disabled={busy} onClick={() => act(() => deleteMatch(code))} className="btn-ghost-gold !border-maroon/50 !text-maroon-light flex items-center gap-2">
          <Trash2 className="w-4 h-4" />
          حذف الغرفة
        </button>
      </div>
    </div>
  );

}
