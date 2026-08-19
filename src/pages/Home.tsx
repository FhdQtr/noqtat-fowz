import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowLeft, Gamepad2, Menu, MonitorPlay, ShieldCheck, Trophy, UsersRound } from "lucide-react";
import { unlockAudio, sfx } from "../lib/sounds";
import { findMatchByTeamCode } from "../lib/matchApi";
import { haptic } from "../lib/haptics";
import FluidSheet from "../components/FluidSheet";
import "./Home.css";

export default function Home() {
  const nav = useNavigate();
  const [joinCode, setJoinCode] = useState("");
  const [tvCode, setTvCode] = useState("");
  const [err, setErr] = useState("");
  const [errField, setErrField] = useState<"team" | "tv" | null>(null);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [floatingNav, setFloatingNav] = useState(false);

  useEffect(() => {
    let frame = 0;
    let current = false;
    const update = () => {
      const next = window.scrollY > 72;
      if (next !== current) {
        current = next;
        setFloatingNav(next);
      }
      frame = 0;
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

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
        setErr("ما لقينا فريق بهذا الكود — تأكد منه وحاول مرة ثانية");
        setErrField("team");
      }
    } catch {
      haptic("error");
      setErr("تعذّر الاتصال بالميدان حالياً — جرّب مرة ثانية");
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
      setErr("كود الميدان أربع خانات، مثل A482");
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
    <div className="am-home">
      <header className={`am-header ${floatingNav ? "is-floating" : ""}`}>
        <div className="am-nav">
          <Link to="/" aria-label="الصفحة الرئيسية" className="am-wordmark-link">
            <img
              className="am-wordmark-image"
              src="/brand/al-midan-logo.webp"
              alt="الميدان — الميدان يا حميدان"
              width="1472"
              height="561"
              decoding="async"
              fetchPriority="high"
            />
          </Link>
          <button
            className="am-menu"
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
        </div>
        <div className="am-sadu" aria-hidden="true" />
      </header>

      <main className="am-main">
        <section className="am-intro" aria-labelledby="am-home-title">
          <h1 id="am-home-title">مستعدين للتحدي؟</h1>
          <p>مسابقة جماعية للمجالس والتجمّعات</p>
        </section>

        <section className="am-action-grid" aria-label="خيارات اللعب">
          <button type="button" onClick={openMatch} className="am-new-match" data-state="default">
            <span className="am-new-match__icon" aria-hidden="true">
              <Gamepad2 />
            </span>
            <span className="am-new-match__copy">
              <strong>ميدان جديد</strong>
              <small>أنشئ المسابقة واختر الفرق والأسئلة</small>
            </span>
          </button>

          <article className="am-entry-card">
            <span className="am-entry-card__icon" aria-hidden="true">
              <UsersRound />
            </span>
            <div className="am-entry-card__content">
              <h2>دخول فريق</h2>
              <p>اكتب كود فريقك</p>
              <form
                className="am-code-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void goJoin();
                }}
              >
                <label htmlFor="team-code">كود الفريق</label>
                <div className="am-code-controls">
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
                    {busy ? <span className="am-spinner" aria-hidden="true" /> : <ArrowLeft aria-hidden="true" />}
                  </button>
                </div>
                <p
                  id="team-code-message"
                  className={`am-field-message ${errField === "team" ? "am-field-message--error" : ""}`}
                  role={errField === "team" ? "alert" : undefined}
                >
                  {errField === "team" ? err : " "}
                </p>
              </form>
            </div>
          </article>

          <article className="am-entry-card">
            <span className="am-entry-card__icon" aria-hidden="true">
              <MonitorPlay />
            </span>
            <div className="am-entry-card__content">
              <h2>شاشة الجمهور</h2>
              <p>اعرض النتائج على الشاشة</p>
              <form
                className="am-code-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  goTv();
                }}
              >
                <label htmlFor="tv-code">كود الميدان</label>
                <div className="am-code-controls">
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
                  <button
                    type="submit"
                    disabled={tvCode.trim().length !== 4}
                    data-state={errField === "tv" ? "error" : "default"}
                    aria-label="فتح شاشة الجمهور"
                  >
                    <ArrowLeft aria-hidden="true" />
                  </button>
                </div>
                <p
                  id="tv-code-message"
                  className={`am-field-message ${errField === "tv" ? "am-field-message--error" : ""}`}
                  role={errField === "tv" ? "alert" : undefined}
                >
                  {errField === "tv" ? err : " "}
                </p>
              </form>
            </div>
          </article>

          <Link to="/challenge" className="am-solo">
            <Trophy aria-hidden="true" />
            <span>تحدي فردي</span>
            <ArrowLeft aria-hidden="true" />
          </Link>
        </section>
      </main>

      <footer className="am-footer">
        <span>فكرة وتصميم: <strong>فهد القحطاني</strong></span>
      </footer>

      <FluidSheet open={menuOpen} title="قائمة الميدان" onClose={() => setMenuOpen(false)}>
        <nav className="am-sheet-links" aria-label="روابط الميدان">
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
