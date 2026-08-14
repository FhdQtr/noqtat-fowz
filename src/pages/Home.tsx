import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowLeft, Gamepad2, LogIn, Menu, MonitorPlay, Trophy } from "lucide-react";
import BrandLogo from "../components/BrandLogo";
import { unlockAudio, sfx } from "../lib/sounds";
import { findMatchByTeamCode } from "../lib/matchApi";

export default function Home() {
  const nav = useNavigate();
  const [joinCode, setJoinCode] = useState("");
  const [tvCode, setTvCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const openMatch = () => {
    unlockAudio();
    sfx.click();
    nav("/host");
  };

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
        setErr("ما لقينا فريق بهذا الكود — تأكد منه وحاول مرة ثانية");
      }
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
    } else {
      setErr("كود الميدان أربع خانات، مثل A482");
    }
  };

  return (
    <div className="m-home">
      <header className="m-nav">
        <Link className="m-menu" to="/admin" aria-label="إدارة الميدان"><Menu aria-hidden="true" /></Link>
        <Link to="/" aria-label="الصفحة الرئيسية" className="m-wordmark-link"><BrandLogo compact className="m-wordmark" /></Link>
      </header>

      <main className="m-shell">
        <section className="m-intro" aria-labelledby="m-home-title">
          <div className="m-sadu" aria-hidden="true" />
          <p className="m-welcome">مستعدّين نتجمّع؟</p>
          <h1 id="m-home-title">الميدان يا حميدان</h1>
          <p className="m-lede">مسابقة جماعية مباشرة للمجالس والتجمّعات. مقدم يدير اللعب، شاشة للجمهور، وجوال لكل فريق.</p>
        </section>

        <section className="m-actions" aria-label="خيارات اللعب">
          <button type="button" onClick={openMatch} className="m-action m-action--primary">
            <span className="m-action-mark" aria-hidden="true"><Gamepad2 /></span>
            <span className="m-action-copy">
              <strong>ميدان جديد</strong>
              <small>أنشئ المسابقة، اختر الفرق والأسئلة، ثم ابدأ</small>
            </span>
            <ArrowLeft className="m-action-arrow" aria-hidden="true" />
          </button>

          <Link to="/challenge" className="m-challenge-link"><Trophy aria-hidden="true" /><span>تحدي فردي</span><ArrowLeft aria-hidden="true" /></Link>

          <div className="m-entry">
            <div className="m-entry-heading">
              <span className="m-entry-icon" aria-hidden="true"><LogIn /></span>
              <div><h2>دخول فريق</h2><p>استخدم الكود الذي ظهر عند المقدم</p></div>
            </div>
            <div className="m-code-form">
              <label htmlFor="team-code">كود الفريق</label>
              <div className="m-code-controls">
                <input id="team-code" value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} onKeyDown={(event) => event.key === "Enter" && goJoin()} placeholder="A482-1" dir="ltr" maxLength={8} autoComplete="off" />
                <button type="button" onClick={goJoin} disabled={busy || !joinCode.trim()} aria-label={busy ? "جاري الدخول" : "دخول الفريق"}>
                  {busy ? <span className="m-spinner" aria-hidden="true" /> : <ArrowLeft aria-hidden="true" />}
                </button>
              </div>
            </div>
          </div>

          <div className="m-entry">
            <div className="m-entry-heading">
              <span className="m-entry-icon" aria-hidden="true"><MonitorPlay /></span>
              <div><h2>شاشة الجمهور</h2><p>افتح لوحة النتائج على التلفزيون</p></div>
            </div>
            <div className="m-code-form">
              <label htmlFor="tv-code">كود الميدان</label>
              <div className="m-code-controls">
                <input id="tv-code" value={tvCode} onChange={(event) => setTvCode(event.target.value.toUpperCase())} onKeyDown={(event) => event.key === "Enter" && goTv()} placeholder="A482" dir="ltr" maxLength={4} autoComplete="off" />
                <button type="button" onClick={goTv} disabled={tvCode.trim().length !== 4} aria-label="فتح شاشة الجمهور"><ArrowLeft aria-hidden="true" /></button>
              </div>
            </div>
          </div>

          {err && <p role="alert" className="m-error">{err}</p>}
        </section>
      </main>

      <footer className="m-footer">
        <span>الميدان يا حميدان · قطر</span>
        <Link to="/admin">إدارة بنك الأسئلة</Link>
      </footer>
    </div>
  );
}
