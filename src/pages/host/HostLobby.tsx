import type { Match } from "../../types/game";
import { TEAM_COLORS } from "../../types/game";
import { useAsyncAction } from "../../lib/useAsyncAction";
import { unlockAudio } from "../../lib/sounds";
import { useState } from "react";
import { Tv, Play, Users, Crown, Loader2, CheckCircle2, Share2 } from "lucide-react";
import QrCode from "../../components/QrCode";
import { startMatch, setCaptain, setAnswerMode, type TeamInvites } from "../../lib/matchApi";
import AnswerModeControls from "./AnswerModeControls";
import { PUBLIC_GAME_ORIGIN } from "../../lib/links";

export default function HostLobby({ match, code, invites }: { match: Match; code: string; invites: TeamInvites | null }) {
  const { busy, error: actionError, run } = useAsyncAction();
  const act = (fn: () => Promise<unknown>) => { unlockAudio(); return run(fn); };
  const [copied, setCopied] = useState(false);
  const teams = match.teamOrder.map((key) => match.teams[key]).filter(Boolean);
  const players = Object.values(match.players ?? {});
  const missingRepresentatives = match.answerMode === "representative"
    && teams.some((team) => !team.captainId || !match.players?.[team.captainId]);
  const shareTv = () => {
    void act(async () => {
      if (!navigator.clipboard) throw new Error("clipboard-unavailable");
      const key = invites?.viewerKey;
      await navigator.clipboard.writeText(`${PUBLIC_GAME_ORIGIN}/tv/${code}${key ? `?key=${encodeURIComponent(key)}` : ""}`);
      setCopied(true);
    });
  };
  return (
    <div className="min-h-dvh px-4 py-6 flex flex-col items-center">
      {actionError && <p role="alert" className="text-maroon-light font-bold">{actionError}</p>}
      <div className="fixed inset-0 -z-10">
        <img src="/img/al-midan-hero.webp" alt="" className="w-full h-full object-cover opacity-25" />
        <div className="absolute inset-0 bg-night/85" />
      </div>

      <p className="text-sm text-muted-foreground">كود المسابقة</p>
      <div className="flex items-center gap-3 mt-1">
        <span className="text-4xl sm:text-5xl font-black font-cairo tracking-[0.3em] text-gold-gradient" dir="ltr">{code}</span>
        <button onClick={shareTv} className="btn-ghost-gold !p-2" title="نسخ رابط شاشة العرض">
          {copied ? <CheckCircle2 className="w-5 h-5 text-emerald2-light" /> : <Share2 className="w-5 h-5" />}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 justify-center">
        <button onClick={() => window.open(`${PUBLIC_GAME_ORIGIN}/tv/${code}${invites?.viewerKey ? `?key=${encodeURIComponent(invites.viewerKey)}` : ""}`, "_blank", "noopener,noreferrer")} className="btn-gold flex items-center gap-2">
          <Tv className="w-5 h-5" />
          افتح شاشة العرض (التلفزيون)
        </button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">كل لاعب يمسح QR حق فريقه ويدخل مباشرة</p>

      <div className="mt-6 w-full max-w-3xl">
        <AnswerModeControls
          value={match.answerMode ?? "anyone"}
          disabled={busy}
          onChange={(mode) => act(() => setAnswerMode(code, mode))}
        />
      </div>

      {/* بطاقات الفرق مع QR */}
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-5 w-full max-w-3xl">
        {teams.map((t) => {
          const c = TEAM_COLORS[t.color];
          const members = players.filter((p) => p.teamCode === t.code);
          return (
            <div
              key={t.code}
              className="glass-card p-5 flex flex-col items-center animate-fade-up"
              style={{ borderColor: `${c.hex}88` }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="w-4 h-4 rounded-full" style={{ background: c.light, boxShadow: `0 0 10px ${c.light}` }} />
                <h3 className="font-cairo font-black text-xl" style={{ color: c.light }}>{t.name}</h3>
              </div>
              {invites?.teamKeys[t.code] ? (
                <>
                  <p className="mb-3 text-3xl font-black tracking-widest text-gold-light" dir="ltr">{invites.shortTeamCodes?.[t.code] ?? `${t.code}-${invites.teamKeys[t.code]}`}</p>
                  <QrCode value={`${PUBLIC_GAME_ORIGIN}/play/${t.code}?key=${encodeURIComponent(invites.teamKeys[t.code])}`} size={130} label="امسح للدخول الآمن" />
                </>
              ) : (
                <div className="flex h-[166px] items-center justify-center text-sm text-muted-foreground">
                  <Loader2 className="ml-2 h-5 w-5 animate-spin" /> جاري تجهيز رابط الفريق
                </div>
              )}
              <div className="mt-4 w-full">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                  <Users className="w-3.5 h-3.5" />
                  <span>{members.length} لاعب</span>
                  <span className="text-muted-foreground/60">— اضغط على الاسم لتعيينه ممثل الفريق</span>
                </div>
                <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                  {members.map((p) => {
                    const isCap = t.captainId === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => act(() => setCaptain(code, t.code, isCap ? null : p.id))}
                        disabled={busy}
                        title={isCap ? "إلغاء التعيين" : "تعيين ممثل الفريق"}
                        className={`rounded-full px-3 py-1 text-xs font-bold font-cairo animate-scale-in transition-all flex items-center gap-1 ${
                          isCap ? "ring-2 ring-gold scale-105" : "hover:scale-105"
                        }`}
                        style={{
                          background: isCap ? "#d4af3733" : `${c.hex}33`,
                          color: isCap ? "#f3dd9a" : c.light,
                          border: `1px solid ${isCap ? "#d4af37" : `${c.hex}66`}`,
                        }}
                      >
                        {isCap && <Crown className="w-3 h-3" />}
                        {p.name}
                      </button>
                    );
                  })}
                  {members.length === 0 && <span className="text-xs text-muted-foreground/60">بانتظار اللاعبين…</span>}
                </div>
                {t.captainId && (
                  <p className="mt-1.5 text-[11px] text-gold-light/80 font-cairo">
                    ممثل الفريق هو الوحيد الذي يثبت الإجابة في وضع «ممثل الفريق»
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={() => act(() => startMatch(code, match.teamOrder[0]))}
        disabled={busy || players.length === 0 || missingRepresentatives}
        className="btn-gold shine mt-10 text-lg px-10 flex items-center gap-2"
      >
        <Play className="w-5 h-5" />
        {players.length === 0
          ? "بانتظار دخول اللاعبين…"
          : missingRepresentatives
            ? "عيّن ممثلاً لكل فريق"
            : "ابدأ المسابقة"}
      </button>
    </div>
  );

}
