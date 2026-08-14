import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { Drama, Loader2, WifiOff, XCircle, EyeOff, Quote } from "lucide-react";
import { subscribeMatch } from "../lib/matchApi";
import type { Match } from "../types/game";

/** شاشة الممثّل السرية — يمسحها واحد من الفريق وتعرض له المثل فقط */
export default function ActView() {
  const { code = "" } = useParams();
  const [match, setMatch] = useState<Match | null | undefined>(undefined);
  const [connErr, setConnErr] = useState("");
  const [hidden, setHidden] = useState(true);

  useEffect(() => subscribeMatch(code.toUpperCase(), setMatch, setConnErr), [code]);

  // إخفاء المثل تلقائياً كل ما تغيّر السؤال
  const qid = match?.state.question?.id;
  useEffect(() => setHidden(true), [qid]);

  if (connErr)
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 px-6 text-center">
        <WifiOff className="w-14 h-14 text-gold" />
        <p className="font-cairo font-bold text-xl">تعذّر الاتصال بالمسابقة</p>
        <button onClick={() => window.location.reload()} className="btn-gold">إعادة المحاولة</button>
      </div>
    );
  if (match === undefined)
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-gold animate-spin" />
      </div>
    );
  if (match === null)
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 px-4 text-center">
        <XCircle className="w-14 h-14 text-maroon-light" />
        <p className="font-cairo font-bold text-xl">كود المسابقة غير صحيح</p>
      </div>
    );

  const st = match.state;
  const live =
    st.question?.type === "acting" && (st.phase === "question" || st.phase === "locked");

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-5 text-center">
      <div className="fixed inset-0 -z-10">
        <img src="/img/al-midan-hero.webp" alt="" className="w-full h-full object-cover opacity-25" />
        <div className="absolute inset-0 bg-night/90" />
      </div>

      {live ? (
        <div className="w-full max-w-md flex flex-col items-center gap-6 animate-fade-up">
          <div className="flex items-center gap-2 text-gold-light font-cairo font-bold">
            <Drama className="w-6 h-6" />
            أنت الممثّل — مثّل بدون كلام!
          </div>

          {hidden ? (
            <button
              onClick={() => setHidden(false)}
              className="glass-card w-full p-10 flex flex-col items-center gap-4 active:scale-[0.98] transition-transform"
            >
              <EyeOff className="w-12 h-12 text-gold-light" />
              <span className="font-cairo font-black text-xl text-gold-light">
                اضغط لكشف المثل
              </span>
              <span className="text-xs text-muted-foreground">
                تأكد أن أحد من فريقك ما يشوف شاشتك
              </span>
            </button>
          ) : (
            <div className="glass-card !border-gold/70 w-full p-8 animate-scale-in" style={{ boxShadow: "0 0 40px rgba(212,175,55,0.15)" }}>
              <Quote className="w-8 h-8 text-gold-light mx-auto mb-4" />
              <p className="font-cairo font-black text-3xl leading-relaxed text-gold-gradient">
                {st.question!.question}
              </p>
              <button
                onClick={() => setHidden(true)}
                className="btn-ghost-gold mt-6 !text-sm flex items-center gap-2 mx-auto"
              >
                <EyeOff className="w-4 h-4" />
                إخفاء
              </button>
            </div>
          )}

          <p className="text-sm text-muted-foreground leading-relaxed">
            ممنوع الكلام والكتابة — تمثيل وإشارة فقط.<br />
            فريقك يخمّن والمقدم يحكم.
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 animate-fade-up">
          <Drama className="w-14 h-14 text-muted-foreground" />
          <p className="font-cairo font-bold text-xl">ما فيه مثل للتمثيل حالياً</p>
          <p className="text-sm text-muted-foreground">
            لما يختار فريقكم «مثّل المثل» يظهر هنا تلقائياً
          </p>
        </div>
      )}
    </div>
  );
}
