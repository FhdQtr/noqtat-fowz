import { useState } from "react";
import { useNavigate, Link } from "react-router";
import { ArrowLeft, Gamepad2, LogIn, MonitorPlay, ShieldCheck, Sparkles, Trophy, Users } from "lucide-react";
import ArenaBackdrop from "../components/ArenaBackdrop";
import BrandLogo from "../components/BrandLogo";
import QuestionTypeIcon from "../components/QuestionTypeIcon";
import { unlockAudio, sfx } from "../lib/sounds";
import { findMatchByTeamCode } from "../lib/matchApi";

const FEATURE_TYPES = ["multiple_choice", "flag", "memory", "riddle", "acting"];

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
      } else setErr("ما لقينا فريق بهذا الكود — تأكد منه وحاول مرة ثانية");
    } catch {
      setErr("تعذّر الاتصال بالميدان حالياً — جرّب مرة ثانية");
    } finally {
      setBusy(false);
    }
  };

  const goTv = () => {
    const code = tvCode.trim().toUpperCase();
    if (code.length === 4) {
      unlockAudio();
      sfx.click();
      nav(`/tv/${code}`);
    } else setErr("كود الميدان أربع خانات، مثل A482");
  };

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <ArenaBackdrop />
      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-8">
        <BrandLogo compact className="max-w-[170px] sm:max-w-[220px]" />
        <div className="hidden items-center gap-2 rounded-full border border-gold/25 bg-night/55 px-4 py-2 text-xs text-gold-light/85 backdrop-blur-md sm:flex">
          <ShieldCheck className="h-4 w-4" />
          غرفة خاصة · لعب مباشر · حتى ٤ فرق
        </div>
      </header>

      <main className="relative z-10 mx-auto grid min-h-[calc(100dvh-150px)] w-full max-w-7xl items-center gap-10 px-4 pb-12 pt-5 lg:grid-cols-[1.08fr_.92fr] lg:px-8">
        <section className="text-center lg:text-right">
          <div className="mx-auto max-w-2xl lg:mx-0"><BrandLogo className="mx-auto max-w-[580px] lg:mx-0" /></div>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-4 py-2 text-sm font-bold text-gold-light backdrop-blur">
            <Sparkles className="h-4 w-4" />
            أكثر من ١٠٠٠ سؤال وتسعة أنواع تحديات
          </div>
          <h1 className="mt-6 text-3xl font-black leading-[1.35] text-white sm:text-5xl lg:text-6xl">
            جمّع الربع، قسّم الفرق،
            <span className="block text-gold-gradient">وخَلّ الحماس يحكم.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-8 text-stone-300 sm:text-lg lg:mx-0">
            تجربة مسابقات عربية صُممت للمجالس والتجمعات: مقدم يتحكم، شاشة عرض كبيرة، وجوال لكل فريق.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3 lg:justify-start">
            {FEATURE_TYPES.map((type) => <div key={type} className="type-gem"><QuestionTypeIcon type={type} className="h-12 w-12 sm:h-14 sm:w-14" /></div>)}
          </div>
        </section>

        <section className="space-y-4">
          <button onClick={() => { unlockAudio(); sfx.click(); nav("/host"); }} className="arena-primary group w-full text-right">
            <span className="arena-primary-icon"><Gamepad2 className="h-8 w-8" /></span>
            <span className="flex-1"><span className="block text-2xl font-black">افتح الميدان</span><span className="mt-1 block text-sm text-night/70">أنشئ مسابقة، اختر الفرق والأسئلة، وابدأ التحدي</span></span>
            <ArrowLeft className="h-6 w-6 transition-transform group-hover:-translate-x-1" />
          </button>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="arena-panel p-5">
              <div className="mb-4 flex items-center gap-3"><span className="icon-chip bg-maroon/25 text-maroon-light"><Users className="h-5 w-5" /></span><div><h2 className="font-black">دخول فريق</h2><p className="text-xs text-stone-400">اكتب كود فريقك</p></div></div>
              <div className="flex gap-2"><input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && goJoin()} placeholder="A482-1" className="input-night text-center tracking-[.16em]" dir="ltr" maxLength={8} aria-label="كود الفريق" /><button onClick={goJoin} disabled={busy || !joinCode.trim()} className="btn-maroon !px-4" aria-label="دخول الفريق"><LogIn className="h-5 w-5" /></button></div>
            </div>
            <div className="arena-panel p-5">
              <div className="mb-4 flex items-center gap-3"><span className="icon-chip bg-gold/15 text-gold-light"><MonitorPlay className="h-5 w-5" /></span><div><h2 className="font-black">شاشة الجمهور</h2><p className="text-xs text-stone-400">اعرضها على التلفزيون</p></div></div>
              <div className="flex gap-2"><input value={tvCode} onChange={(e) => setTvCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && goTv()} placeholder="A482" className="input-night text-center tracking-[.22em]" dir="ltr" maxLength={4} aria-label="كود الميدان" /><button onClick={goTv} disabled={tvCode.trim().length !== 4} className="btn-ghost-gold !px-4" aria-label="فتح شاشة الجمهور"><MonitorPlay className="h-5 w-5" /></button></div>
            </div>
          </div>

          <button onClick={() => { unlockAudio(); sfx.click(); nav("/challenge"); }} className="arena-panel group flex w-full items-center gap-4 p-5 text-right transition hover:border-gold/55">
            <span className="icon-chip bg-gold/15 text-gold-light"><Trophy className="h-6 w-6" /></span>
            <span className="flex-1"><span className="block font-black">تحدي المئة — فردي</span><span className="text-xs text-stone-400">١٠٠ سؤال متصاعد، فرصة نجاة واحدة، ورتبة تنتظرك</span></span>
            <ArrowLeft className="h-5 w-5 text-gold transition-transform group-hover:-translate-x-1" />
          </button>
          {err && <div role="alert" className="rounded-xl border border-maroon-light/40 bg-maroon/20 px-4 py-3 text-center text-sm font-bold text-rose-200">{err}</div>}
        </section>
      </main>

      <footer className="relative z-10 flex flex-col items-center justify-between gap-2 border-t border-white/5 px-4 py-4 text-xs text-stone-500 sm:flex-row sm:px-8">
        <span>صُنع بحماس في قطر بواسطة فهد القحطاني</span>
        <Link to="/admin" className="transition hover:text-gold-light">إدارة بنك الأسئلة</Link>
      </footer>
    </div>
  );
}
