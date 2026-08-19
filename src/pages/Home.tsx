import { useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  ArrowLeft,
  Gamepad2,
  Menu,
  MonitorPlay,
  Radio,
  ShieldCheck,
  Trophy,
  UsersRound,
  Zap,
} from "lucide-react";
import { unlockAudio, sfx } from "../lib/sounds";
import { findMatchByTeamCode } from "../lib/matchApi";
import { haptic } from "../lib/haptics";
import FluidSheet from "../components/FluidSheet";
import BrandLogo from "../components/BrandLogo";
import "./Home.css";

export default function Home() {
  const nav = useNavigate();
  const [joinCode, setJoinCode] = useState("");
  const [tvCode, setTvCode] = useState("");
  const [err, setErr] = useState("");
  const [errField, setErrField] = useState<"team" | "tv" | null>(null);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const openMatch = () => {
    unlockAudio();
    haptic("light");
    sfx.click();
    nav("/host");
  };

  const goJoin = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setBusy(true);
    setErr("");
    setErrField(null);
    unlockAudio();
    try {
      const matchCode = await findMatchByTeamCode(code);
      if (matchCode) {
        haptic("success");
        sfx.click();
        nav(`/play/${code}`);
      } else {
        haptic("error");
        setErr("ما لقينا فريق بهذا الكود. تأكد منه وحاول مرة ثانية.");
        setErrField("team");
      }
    } catch {
      haptic("error");
      setErr("تعذّر الاتصال بالميدان حالياً. جرّب مرة ثانية.");
      setErrField("team");
    } finally {
      setBusy(false);
    }
  };

  const goTv = () => {
    const code = tvCode.trim().toUpperCase();
    if (code.length === 4) {
      unlockAudio();
      haptic("light");
      sfx.click();
      nav(`/tv/${code}`);
    } else {
      haptic("error");
      setErr("كود الميدان أربع خانات، مثل A482.");
      setErrField("tv");
    }
  };

  const updateJoinCode = (value: string) => {
    setJoinCode(value.toUpperCase());
    if (errField === "team") {
      setErr("");
      setErrField(null);
    }
  };

  const updateTvCode = (value: string) => {
    setTvCode(value.toUpperCase());
    if (errField === "tv") {
      setErr("");
      setErrField(null);
    }
  };

  return (
    <div className="next-home">
      <header className="next-nav">
        <Link to="/" className="next-nav__brand" aria-label="الصفحة الرئيسية">
          <BrandLogo />
        </Link>
        <div className="next-nav__status" aria-label="حالة المنصة">
          <span aria-hidden="true" />
          جاهز للعب
        </div>
        <button
          className="next-nav__menu"
          type="button"
          aria-label="فتح قائمة الميدان"
          aria-expanded={menuOpen}
          onClick={() => {
            haptic("light");
            setMenuOpen(true);
          }}
        >
          <Menu aria-hidden="true" />
        </button>
      </header>

      <main className="next-shell">
        <section className="next-hero" aria-labelledby="next-home-title">
          <div className="next-hero__copy">
            <p className="next-eyebrow"><Radio aria-hidden="true" /> مسابقة جماعية مباشرة</p>
            <h1 id="next-home-title">
              كل جلسة لها
              <span>ميدانها.</span>
            </h1>
            <p className="next-hero__lede">
              أنشئ المواجهة، وزّع الفرق، واعرض السؤال للجميع. كل فريق يجيب من جواله والنتيجة تتغيّر مباشرة.
            </p>
            <div className="next-proof" aria-label="مزايا الميدان">
              <span><strong>٩</strong> أنواع تحديات</span>
              <span><Zap aria-hidden="true" /> تفاعل مباشر</span>
              <span><UsersRound aria-hidden="true" /> فرق وجمهور</span>
            </div>
          </div>

          <div className="next-map" aria-label="خريطة طرق اللعب">
            <svg className="next-map__lines" viewBox="0 0 560 460" aria-hidden="true">
              <path d="M280 232C207 232 196 99 110 99" />
              <path d="M280 232C353 232 364 99 450 99" />
              <path d="M280 232C280 315 382 349 450 349" />
              <path d="M280 232C280 315 178 349 110 349" />
            </svg>

            <span className="next-map__node next-map__node--team">
              <UsersRound aria-hidden="true" />
              <span>دخول فريق</span>
            </span>
            <span className="next-map__node next-map__node--audience">
              <MonitorPlay aria-hidden="true" />
              <span>شاشة الجمهور</span>
            </span>
            <span className="next-map__node next-map__node--solo">
              <Trophy aria-hidden="true" />
              <span>تحدي فردي</span>
            </span>
            <span className="next-map__node next-map__node--live">
              <Radio aria-hidden="true" />
              <span>نتائج مباشرة</span>
            </span>

            <button type="button" onClick={openMatch} className="next-map__start">
              <span className="next-map__start-icon" aria-hidden="true"><Gamepad2 /></span>
              <span>
                <strong>ميدان جديد</strong>
                <small>ابدأ المواجهة</small>
              </span>
              <ArrowLeft aria-hidden="true" />
            </button>
          </div>
        </section>

        <section className="next-access" aria-label="الدخول إلى الميدان">
          <article className="next-access-card">
            <div className="next-access-card__head">
              <span><UsersRound aria-hidden="true" /></span>
              <div>
                <h2>دخول فريق</h2>
                <p>اكتب الكود الذي ظهر عند المقدم</p>
              </div>
            </div>
            <form
              className="next-code-form"
              onSubmit={(event) => {
                event.preventDefault();
                void goJoin();
              }}
            >
              <label htmlFor="team-code">كود الفريق</label>
              <div className="next-code-controls">
                <input
                  id="team-code"
                  value={joinCode}
                  onChange={(event) => updateJoinCode(event.target.value)}
                  placeholder="A482-1"
                  dir="ltr"
                  maxLength={8}
                  autoComplete="off"
                  inputMode="text"
                  aria-invalid={errField === "team"}
                  aria-describedby="team-code-message"
                />
                <button
                  type="submit"
                  disabled={busy || !joinCode.trim()}
                  data-state={busy ? "loading" : errField === "team" ? "error" : "default"}
                  aria-label={busy ? "جاري الدخول" : "دخول الفريق"}
                  aria-busy={busy}
                >
                  {busy ? <span className="next-spinner" aria-hidden="true" /> : <ArrowLeft aria-hidden="true" />}
                </button>
              </div>
              <p id="team-code-message" className="next-field-message" data-state={errField === "team" ? "error" : "idle"} role={errField === "team" ? "alert" : undefined}>
                {errField === "team" ? err : " "}
              </p>
            </form>
          </article>

          <article className="next-access-card">
            <div className="next-access-card__head">
              <span><MonitorPlay aria-hidden="true" /></span>
              <div>
                <h2>شاشة الجمهور</h2>
                <p>افتح لوحة السؤال والنتائج</p>
              </div>
            </div>
            <form
              className="next-code-form"
              onSubmit={(event) => {
                event.preventDefault();
                goTv();
              }}
            >
              <label htmlFor="tv-code">كود الميدان</label>
              <div className="next-code-controls">
                <input
                  id="tv-code"
                  value={tvCode}
                  onChange={(event) => updateTvCode(event.target.value)}
                  placeholder="A482"
                  dir="ltr"
                  maxLength={4}
                  autoComplete="off"
                  inputMode="text"
                  aria-invalid={errField === "tv"}
                  aria-describedby="tv-code-message"
                />
                <button type="submit" disabled={tvCode.trim().length !== 4} data-state={errField === "tv" ? "error" : "default"} aria-label="فتح شاشة الجمهور">
                  <ArrowLeft aria-hidden="true" />
                </button>
              </div>
              <p id="tv-code-message" className="next-field-message" data-state={errField === "tv" ? "error" : "idle"} role={errField === "tv" ? "alert" : undefined}>
                {errField === "tv" ? err : " "}
              </p>
            </form>
          </article>

          <Link to="/challenge" className="next-solo">
            <span><Trophy aria-hidden="true" /></span>
            <div><strong>تحدي فردي</strong><small>اختبر معلوماتك مباشرة</small></div>
            <ArrowLeft aria-hidden="true" />
          </Link>
        </section>
      </main>

      <footer className="next-footer">
        <p>اللعبة تبدأ بسؤال. الحماس يصنعه الفريق.</p>
        <span>فكرة وتصميم: <strong>فهد القحطاني</strong></span>
      </footer>

      <FluidSheet open={menuOpen} title="قائمة الميدان" onClose={() => setMenuOpen(false)}>
        <nav className="next-sheet-links" aria-label="روابط الميدان">
          <Link to="/admin" onClick={() => setMenuOpen(false)}>
            <ShieldCheck aria-hidden="true" />
            <span><strong>إدارة الميدان</strong><small>بنك الأسئلة والنسخ الاحتياطي</small></span>
            <ArrowLeft aria-hidden="true" />
          </Link>
          <Link to="/challenge" onClick={() => setMenuOpen(false)}>
            <Trophy aria-hidden="true" />
            <span><strong>تحدي فردي</strong><small>اختبر معلوماتك مباشرة</small></span>
            <ArrowLeft aria-hidden="true" />
          </Link>
        </nav>
      </FluidSheet>
    </div>
  );
}
