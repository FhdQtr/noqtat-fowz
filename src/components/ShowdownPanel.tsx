import { useEffect } from "react";
import { CheckCircle2, Lock, Radio, Timer, Trophy, XCircle, Zap } from "lucide-react";
import type { Match } from "../types/game";
import { ANSWER_LETTERS } from "../lib/answers";
import { TEAM_COLORS } from "../types/game";
import { useServerNow } from "../lib/useServerNow";

interface ShowdownPanelProps {
  match: Match;
  teamCode?: string;
  submitting?: boolean;
  onAnswer?: (choice: number) => void;
  size?: "regular" | "large";
}

export default function ShowdownPanel({ match, teamCode, submitting = false, onAnswer, size = "regular" }: ShowdownPanelProps) {
  const { state } = match;
  const showdown = state.showdown;
  const question = state.question;
  const now = useServerNow(showdown ? 100 : null);
  const revealed = state.phase === "showdown_revealed";
  const waiting = Boolean(showdown && now < showdown.opensAt && !revealed);
  const expired = Boolean(showdown && now > showdown.closesAt && !revealed);
  const open = Boolean(showdown && now >= showdown.opensAt && now <= showdown.closesAt && !revealed);
  const countdown = showdown ? Math.max(0, Math.ceil((showdown.opensAt - now) / 1000)) : 0;
  const timeLeft = showdown ? Math.max(0, Math.ceil((showdown.closesAt - now) / 1000)) : 0;
  const teamAnswer = teamCode ? showdown?.answers?.[teamCode] : undefined;
  const winner = showdown?.winnerTeam ? match.teams[showdown.winnerTeam] : null;
  const large = size === "large";
  const questionImage = question?.image;
  const showdownNumber = showdown?.number;

  useEffect(() => {
    if (!questionImage || !showdownNumber) return;
    const image = new Image();
    image.src = questionImage;
  }, [questionImage, showdownNumber]);

  if (!showdown || !question) return null;

  return (
    <section className={`relative w-full overflow-hidden rounded-[28px] border-2 border-gold/70 bg-gradient-to-b from-[#24170f]/95 to-[#100b09]/95 ${large ? "max-w-5xl p-8" : "max-w-xl p-5"}`}
      style={{ boxShadow: "0 24px 80px rgba(0,0,0,.55), 0 0 46px rgba(212,175,55,.16)" }}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-maroon-light via-gold-light to-emerald2-light" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-gold/50 bg-gold/15 px-4 py-2 font-cairo font-black text-gold-light">
          <Zap className="h-5 w-5" />
          مواجهة الجميع #{showdown.number}
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/25 px-4 py-2 font-cairo font-black">
          <Trophy className="h-4 w-4 text-gold-light" />
          {showdown.points} نقطة
        </div>
      </div>

      {waiting ? (
        <div className={`flex flex-col items-center justify-center text-center ${large ? "min-h-[420px]" : "min-h-[340px]"}`}>
          <Radio className="mb-5 h-12 w-12 animate-pulse text-gold-light" />
          <p className="font-cairo text-xl font-black text-foreground">السؤال محمّل عند الجميع</p>
          <p className="mt-2 text-sm text-muted-foreground">لا تعتمد البداية على سرعة تحميل جهازك</p>
          <div className="mt-7 flex h-24 w-24 items-center justify-center rounded-full border-4 border-gold/60 bg-gold/10 font-cairo text-5xl font-black text-gold-light animate-pulse-gold">
            {Math.max(1, countdown)}
          </div>
        </div>
      ) : (
        <div className="mt-5 animate-fade-up">
          <div className="mb-4 flex items-center justify-center gap-2 font-cairo font-black text-gold-light">
            <Timer className="h-5 w-5" />
            {revealed ? "انتهت المواجهة" : expired ? "جاري حساب النتيجة…" : `${timeLeft} ثانية`}
          </div>
          {question.image ? (
            <div className="mx-auto mb-4 overflow-hidden rounded-2xl border-2 border-gold/45 bg-black/30">
              <img src={question.image} alt="صورة سؤال المواجهة" className={`w-full object-cover ${large ? "max-h-[360px]" : "max-h-[260px]"}`} decoding="async" />
            </div>
          ) : null}
          <h2 className={`text-center font-cairo font-black leading-relaxed text-foreground ${large ? "text-3xl" : "text-xl"}`}>{question.question}</h2>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {question.options.map((option, index) => {
              const correct = revealed && question.answer === index;
              const selected = teamAnswer?.choice === index;
              const stateName = correct ? "correct" : revealed && selected ? "wrong" : selected ? "selected" : "default";
              const interactive = Boolean(onAnswer && teamCode);
              return (
                <button key={index} type="button" onClick={() => onAnswer?.(index)}
                  disabled={!interactive || !open || Boolean(teamAnswer) || submitting || revealed}
                  data-state={stateName}
                  className={`m-answer-option ${interactive ? "m-answer-option--interactive" : ""} min-h-16 disabled:cursor-default`}>
                  <span className="m-answer-option__label" aria-hidden="true">{ANSWER_LETTERS[index]}</span>
                  <span className="m-answer-option__text">{option}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {match.teamOrder.map((code) => {
              const team = match.teams[code];
              const answer = showdown.answers?.[code];
              const color = TEAM_COLORS[team.color];
              return (
                <span key={code} className="rounded-full border px-3 py-1 text-xs font-cairo font-bold"
                  style={{ borderColor: `${color.hex}88`, color: color.light, background: `${color.hex}22` }}>
                  {team.name}: {answer ? (revealed ? answer.playerName : "تمت الإجابة") : "ينتظر"}
                </span>
              );
            })}
          </div>

          {teamAnswer && !revealed ? (
            <p className="mt-4 flex items-center justify-center gap-2 text-center font-cairo font-bold text-gold-light"><Lock className="h-4 w-4" />ثبتت إجابة فريقكم بواسطة {teamAnswer.playerName}</p>
          ) : null}
          {revealed ? (
            <div className="mt-5 space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                {match.teamOrder.map((code) => {
                  const result = showdown.answers?.[code];
                  const correct = Boolean(result && result.choice === question.answer);
                  return (
                    <div key={code} className={`rounded-xl border px-3 py-3 text-right ${correct ? "border-emerald2/45 bg-emerald2/10" : "border-maroon/35 bg-maroon/10"}`}>
                      <p className="flex items-center gap-2 font-cairo font-black">
                        {correct ? <CheckCircle2 className="h-4 w-4 text-emerald2-light" /> : <XCircle className="h-4 w-4 text-maroon-light" />}
                        فريق {match.teams[code].name}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {result ? `${result.playerName}: ${question.options[result.choice]} · ${correct ? "صحيحة" : "خاطئة"}` : "لم يرسل إجابة"}
                      </p>
                    </div>
                  );
                })}
              </div>
              <div className={`rounded-2xl border px-4 py-4 text-center font-cairo font-black ${winner ? "border-emerald2/60 bg-emerald2/10 text-emerald2-light" : "border-maroon/60 bg-maroon/10 text-maroon-light"}`}>
                {winner ? `الأسرع بالإجابة الصحيحة: فريق ${winner.name} · +${showdown.points} نقطة` : "لم يجب أي فريق إجابة صحيحة"}
              </div>
              {teamCode ? <p className="text-center text-xs font-bold text-muted-foreground">المقدم سيعيدكم للمسابقة بعد مشاهدة النتيجة</p> : null}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
