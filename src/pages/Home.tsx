import { useState } from "react";
import { useNavigate, Link } from "react-router";
import { Swords, Tv, Users, Trophy, Sparkles, LogIn } from "lucide-react";
import { unlockAudio, sfx } from "../lib/sounds";
import { findMatchByTeamCode } from "../lib/matchApi";

export default function Home() {
  const nav = useNavigate();
  const [joinCode, setJoinCode] = useState("");
  const [tvCode, setTvCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const goJoin = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setBusy(true);
    setErr("");
    unlockAudio();
    try {
      const matchCode = await findMatchByTeamCode(code);
      if (matchCode) {
        sfx.click();
        nav(`/play/${code}`);
      } else {
        setErr("الكود غير صحيح — تأكد من كود فريقك");
      }
    } finally {
      setBusy(false);
    }
  };

  const goTv = () => {
    const code = tvCode.trim().toUpperCase();
    if (code.length === 6) {
      unlockAudio();
      nav(`/tv/${code}`);
    } else {
      setErr("كود المسابقة ٦ أحرف");
    }
  };

  return (
    <div className="relative min-h-dvh flex flex-col">
      {/* الخلفية */}
      <div className="fixed inset-0 -z-10">
        <img src="/img/hero-bg.jpg" alt="" className="w-full h-full object-cover opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-b from-night/70 via-night/85 to-night" />
      </div>

      {/* الترويسة */}
      <header className="flex flex-col items-center pt-10 sm:pt-14 px-4 animate-fade-up">
        <img
          src="/img/logo.png"
          alt="نقطة فوز"
          className="w-24 h-24 sm:w-32 sm:h-32 animate-float-slow drop-shadow-[0_0_28px_rgba(212,175,55,0.45)]"
        />
        <h1 className="mt-3 text-4xl sm:text-6xl font-black font-cairo text-gold-gradient drop-shadow">
          نقطة فوز
        </h1>
        <p className="mt-2 font-ruqaa text-gold-light/90 text-lg sm:text-2xl">
          مسابقة المجالس — فريق ضد فريق
        </p>
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="w-3.5 h-3.5 text-gold" />
          <span>أكثر من ١٠٠٠ سؤال · أعلام · معالم · ألغاز · أمثال</span>
        </div>
      </header>

      {/* البطاقات */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-10 w-full max-w-3xl mx-auto gap-5">
        {/* إنشاء مسابقة */}
        <button
          onClick={() => {
            unlockAudio();
            sfx.click();
            nav("/host");
          }}
          className="group w-full glass-card relative overflow-hidden p-6 sm:p-7 text-right transition-all duration-300 hover:border-gold/70 hover:shadow-[0_0_44px_rgba(212,175,55,0.2)] animate-fade-up"
        >
          <div className="absolute inset-0 bg-gradient-to-l from-gold/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="flex items-center gap-5">
            <div className="shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-gold-light to-gold-dark flex items-center justify-center shadow-lg shadow-gold/30">
              <Swords className="w-8 h-8 sm:w-10 sm:h-10 text-night" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl sm:text-2xl font-black font-cairo text-gold-light">
                أنشئ مسابقة جديدة
              </h2>
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                أنت المقدم: اصنع غرفة، وزّع الفرق (٢ إلى ٤)، وكل فريق يدخل بكوده الخاص — والتحكم كله بيدك
              </p>
            </div>
          </div>
        </button>

        {/* دخول لاعب + شاشة عرض */}
        <div className="grid sm:grid-cols-2 gap-5 w-full">
          <div className="glass-card p-5 sm:p-6 animate-fade-up" style={{ animationDelay: "0.08s" }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-xl bg-maroon/30 border border-maroon-light/40 flex items-center justify-center">
                <Users className="w-5 h-5 text-maroon-light" />
              </div>
              <h3 className="font-cairo font-bold text-lg">دخول لاعب</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-3">امسح QR حق فريقك أو اكتب الكود</p>
            <div className="flex gap-2">
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && goJoin()}
                placeholder="XXXXXX-XXX"
                className="input-night text-center font-cairo tracking-widest"
                dir="ltr"
                maxLength={10}
              />
              <button onClick={goJoin} disabled={busy || !joinCode.trim()} className="btn-maroon px-4 shrink-0">
                <LogIn className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="glass-card p-5 sm:p-6 animate-fade-up" style={{ animationDelay: "0.16s" }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-xl bg-gold/15 border border-gold/40 flex items-center justify-center">
                <Tv className="w-5 h-5 text-gold-light" />
              </div>
              <h3 className="font-cairo font-bold text-lg">شاشة العرض</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-3">اعرض المسابقة على التلفزيون — اكتب كود المسابقة</p>
            <div className="flex gap-2">
              <input
                value={tvCode}
                onChange={(e) => setTvCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && goTv()}
                placeholder="XXXXXX"
                className="input-night text-center font-cairo tracking-widest"
                dir="ltr"
                maxLength={6}
              />
              <button onClick={goTv} disabled={tvCode.trim().length !== 6} className="btn-gold px-4 shrink-0">
                <Tv className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {err && (
          <div className="text-maroon-light text-sm font-bold bg-maroon/15 border border-maroon/40 rounded-xl px-5 py-2.5 animate-scale-in">
            {err}
          </div>
        )}

        {/* تحدي المعرفة الفردي */}
        <button
          onClick={() => {
            unlockAudio();
            sfx.click();
            nav("/challenge");
          }}
          className="w-full glass-card p-5 flex items-center gap-4 text-right transition-all hover:border-gold/60 animate-fade-up"
          style={{ animationDelay: "0.24s" }}
        >
          <div className="w-12 h-12 rounded-xl bg-night-600 border border-gold-faint/50 flex items-center justify-center shrink-0">
            <Trophy className="w-6 h-6 text-gold-light" />
          </div>
          <div className="flex-1">
            <h3 className="font-cairo font-bold">تحدي المعرفة — فردي</h3>
            <p className="text-xs text-muted-foreground">١٠٠ سؤال متصاعدة الصعوبة… فرصة وحدة للغلط. تقدر توصل الألماسية؟</p>
          </div>
        </button>
      </main>

      <footer className="pb-6 text-center text-xs text-muted-foreground/70">
        صنع بواسطة فهد القحطاني <span className="text-gold-faint mx-1">|</span> Fhd.AlQahtani
        <span className="text-gold-faint mx-1">|</span>
        <Link to="/admin" className="hover:text-gold-light transition-colors">لوحة التحكم</Link>
      </footer>
    </div>
  );
}
