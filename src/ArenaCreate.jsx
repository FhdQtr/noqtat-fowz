// ═══════════════════════════════════════════════════════════════════
// 🏆 صراع الأبطال - شاشة منشئ المسابقة + QR Code
// نقطة فوز - تحدي تفاعلي متعدد اللاعبين
// الملف 2 - مطابق لهوية موقع نقطة فوز (Dark theme + Gold accent)
// ═══════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  db, ref, set, onValue, update,
  onAuthChange, signInWithGoogle, getPlayerProfile,
} from "./firebase.js";
import { remove } from "firebase/database";
import { useArenaEngine, validateConfig } from "./arenaEngine";
import { HostGameView } from "./ArenaPlayer";

// ─── Theme (نفس theme موقع نقطة فوز) ──────────────────────────────

const theme = {
  bg: "#0a0a0f",
  bgCard: "#12121a",
  bgHover: "#1a1a2e",
  bgInput: "#16162a",
  accent: "#00d4ff",
  accentAlt: "#ff6b35",
  purple: "#a855f7",
  green: "#22c55e",
  red: "#ef4444",
  yellow: "#fbbf24",         // اللون الأساسي لصراع الأبطال
  yellowAlt: "#f59e0b",       // ذهبي أغمق
  text: "#e4e4e7",
  textMuted: "#71717a",
  border: "#27273a",
  arenaGlow: "0 0 40px rgba(251, 191, 36, 0.25)",
  arenaGlowStrong: "0 0 60px rgba(251, 191, 36, 0.4)",
};

// ─── ثوابت اللعبة ──────────────────────────────────────────────────

const ARENA_CATEGORIES = {
  culture:   { ar: "ثقافة عامة", icon: "🌍", color: "#f59e0b" },
  science:   { ar: "علوم",       icon: "🔬", color: "#10b981" },
  religion:  { ar: "إسلامي",     icon: "🕌", color: "#22c55e" },
  language:  { ar: "لغة عربية",  icon: "📝", color: "#a855f7" },
  math:      { ar: "رياضيات",    icon: "🧮", color: "#3b82f6" },
  geography: { ar: "جغرافيا",    icon: "🗺️", color: "#06b6d4" },
  gulf:      { ar: "خليجيات",    icon: "🐪", color: "#dc2626" },
  tech:      { ar: "تقنية",      icon: "💻", color: "#6366f1" },
  riddles:   { ar: "ألغاز",      icon: "🧩", color: "#ec4899" },
  sports:    { ar: "رياضة",      icon: "⚽", color: "#f97316" },
};

const QUESTION_COUNTS = [15, 20, 25];
const PLAYER_RANGES = { min: 3, max: 6 };
const QUESTION_DURATION = 15;

// ─── دوال مساعدة ───────────────────────────────────────────────────

function generateArenaCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

function generatePlayerId() {
  return "p_" + Math.random().toString(36).substr(2, 9) + "_" + Date.now().toString(36);
}

// ═══════════════════════════════════════════════════════════════════
// المكون الرئيسي
// ═══════════════════════════════════════════════════════════════════

export default function ArenaCreate() {
  const navigate = useNavigate();

  const [stage, setStage] = useState("setup");
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [hostName, setHostName] = useState("");
  const [showAuthOptions, setShowAuthOptions] = useState(true);

  const [questionsCount, setQuestionsCount] = useState(15);
  const [selectedCategories, setSelectedCategories] = useState(Object.keys(ARENA_CATEGORIES));
  const [enabledLevels, setEnabledLevels] = useState({ easy: true, medium: true, hard: true });
  const [powerupsEnabled, setPowerupsEnabled] = useState(true);

  const [arenaCode, setArenaCode] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [arenaData, setArenaData] = useState(null);
  const [copyFeedback, setCopyFeedback] = useState("");
  const [creating, setCreating] = useState(false);

  const qrCanvasRef = useRef(null);

  // محرك اللعبة
  const { error: engineError } = useArenaEngine(
    arenaCode,
    Boolean(arenaCode),
    typeof window !== "undefined" ? window.ARENA_QUESTIONS : []
  );

  useEffect(() => {
    if (engineError) alert(`خطأ في المحرك: ${engineError}`);
  }, [engineError]);

  // مراقبة المصادقة
  useEffect(() => {
    const unsubscribe = onAuthChange(async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setShowAuthOptions(false);
        const userProfile = await getPlayerProfile(currentUser.uid);
        if (userProfile) {
          setProfile(userProfile);
          setHostName(userProfile.name || currentUser.displayName || "لاعب");
        } else {
          setHostName(currentUser.displayName || "لاعب");
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // مراقبة بيانات الجلسة
  useEffect(() => {
    if (stage !== "lobby" || !arenaCode) return;
    const arenaRef = ref(db, `arenas/${arenaCode}`);
    const unsubscribe = onValue(arenaRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setArenaData(data);
        if (typeof window !== "undefined" && window.gtag) {
          window.gtag("event", "arena_lobby_view", { code: arenaCode });
        }
      }
    });
    return () => unsubscribe();
  }, [stage, arenaCode]);

  // QR Code
  useEffect(() => {
    if (stage !== "lobby" || !arenaCode || !qrCanvasRef.current) return;
    import("qrcode").then((QRCode) => {
      const joinUrl = `${window.location.origin}/arena/join/${arenaCode}`;
      QRCode.toCanvas(qrCanvasRef.current, joinUrl, {
        width: 220,
        margin: 1,
        color: { dark: theme.yellow, light: theme.bgCard },
        errorCorrectionLevel: "H",
      }, (err) => err && console.error(err));
    });
  }, [stage, arenaCode]);

  // ─── معالجات الأحداث ─────────────────────────────────────────────

  async function handleGoogleSignIn() {
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error("Google sign in failed:", err);
      alert("تعذر تسجيل الدخول. حاول مرة ثانية.");
    }
  }

  function toggleCategory(catKey) {
    setSelectedCategories((prev) => {
      if (prev.includes(catKey)) {
        if (prev.length === 1) return prev;
        return prev.filter((c) => c !== catKey);
      }
      return [...prev, catKey];
    });
  }

  function toggleLevel(level) {
    setEnabledLevels((prev) => {
      const next = { ...prev, [level]: !prev[level] };
      if (!next.easy && !next.medium && !next.hard) return prev;
      return next;
    });
  }

  async function handleCreateArena() {
    const trimmedName = hostName.trim();
    if (!trimmedName) { alert("الرجاء إدخال اسمك أو لقبك"); return; }
    if (trimmedName.length > 20) { alert("الاسم طويل جداً (الحد الأقصى 20 حرف)"); return; }
    if (selectedCategories.length === 0) { alert("الرجاء اختيار فئة واحدة على الأقل"); return; }

    setCreating(true);
    try {
      const code = generateArenaCode();
      const hostId = generatePlayerId();

      await set(ref(db, `arenas/${code}`), {
        host: trimmedName,
        hostId,
        hostUid: user?.uid || null,
        status: "waiting",
        config: {
          questionsCount,
          questionDuration: QUESTION_DURATION,
          minPlayers: PLAYER_RANGES.min,
          maxPlayers: PLAYER_RANGES.max,
          categories: selectedCategories,
          levels: enabledLevels,
          powerupsEnabled,
        },
        players: {
          [hostId]: {
            name: trimmedName, isHost: true, ready: true, score: 0,
            joinedAt: Date.now(), avatar: profile?.photo || user?.photoURL || "",
          },
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      setArenaCode(code);
      setPlayerId(hostId);
      setStage("lobby");

      if (typeof window !== "undefined" && window.gtag) {
        window.gtag("event", "arena_created", {
          code, questions_count: questionsCount,
          categories_count: selectedCategories.length, powerups: powerupsEnabled,
        });
      }
    } catch (err) {
      console.error("Failed to create arena:", err);
      alert("تعذر إنشاء الجلسة. تحقق من الاتصال وحاول مرة ثانية.");
    } finally {
      setCreating(false);
    }
  }

  async function copyArenaCode() {
    try {
      await navigator.clipboard.writeText(arenaCode);
      setCopyFeedback("تم النسخ!");
      setTimeout(() => setCopyFeedback(""), 2000);
    } catch {
      setCopyFeedback("تعذر النسخ");
    }
  }

  async function copyJoinLink() {
    const joinUrl = `${window.location.origin}/arena/join/${arenaCode}`;
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopyFeedback("تم نسخ الرابط!");
      setTimeout(() => setCopyFeedback(""), 2000);
    } catch {
      setCopyFeedback("تعذر النسخ");
    }
  }

  async function handleStartGame() {
    const playerCount = arenaData?.players ? Object.keys(arenaData.players).length : 0;
    if (playerCount < PLAYER_RANGES.min) {
      alert(`يلزم ${PLAYER_RANGES.min} لاعبين على الأقل لبدء المسابقة`);
      return;
    }

    const bank = typeof window !== "undefined" ? window.ARENA_QUESTIONS : null;
    if (!bank || bank.length === 0) {
      alert("بنك الأسئلة غير محمّل. تأكد من تحميل ملف arena-questions.js");
      return;
    }

    const validation = validateConfig(arenaData.config, bank);
    if (!validation.valid) {
      alert(`الأسئلة المتاحة (${validation.available}) أقل من المطلوب (${validation.needed}).\n\nوسّع الفئات أو فعّل مستويات إضافية.`);
      return;
    }

    try {
      await update(ref(db, `arenas/${arenaCode}`), {
        status: "playing",
        startedAt: Date.now(),
        currentQuestion: 0,
        phase: "question",
        phaseStartedAt: Date.now(),
      });
    } catch (err) {
      console.error("Failed to start game:", err);
      alert("تعذر بدء المسابقة");
    }
  }

  async function handleCancelArena() {
    if (!confirm("هل أنت متأكد من إلغاء الجلسة؟ سيخرج جميع اللاعبين.")) return;
    try {
      await remove(ref(db, `arenas/${arenaCode}`));
      navigate("/");
    } catch (err) {
      console.error("Failed to cancel arena:", err);
    }
  }

  // ─── العرض ───────────────────────────────────────────────────────

  // عند بدء اللعبة، يصير المنشئ لاعب
  if (stage === "lobby" && arenaData && arenaData.status !== "waiting") {
    return <HostGameView arenaCode={arenaCode} playerId={playerId} arenaData={arenaData} />;
  }

  // مرحلة 1: شاشة الترحيب
  if (showAuthOptions && !user) {
    return (
      <div style={styles.screen}>
        <ArenaParticles />
        <div style={{ ...styles.card, maxWidth: 460 }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ fontSize: 64, marginBottom: 12, filter: "drop-shadow(0 0 20px rgba(251,191,36,0.5))" }}>🏆</div>
            <h1 style={styles.titleGold}>صراع الأبطال</h1>
            <p style={{ ...styles.subtitle, marginTop: 8 }}>تحدّي ربعك في معركة معلومات</p>
          </div>

          <button onClick={handleGoogleSignIn} style={styles.btnGoogle}>
            <span style={{ fontSize: 22 }}>🔐</span>
            <div style={{ flex: 1, textAlign: "right" }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>تسجيل الدخول بـ Google</div>
              <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>احفظ نقاطك وتقدمك</div>
            </div>
          </button>

          <div style={styles.divider}>
            <span>أو</span>
          </div>

          <button onClick={() => setShowAuthOptions(false)} style={styles.btnSecondary}>
            <span style={{ fontSize: 22, marginLeft: 8 }}>👤</span>
            <div style={{ flex: 1, textAlign: "right" }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>ادخل كضيف</div>
              <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>بدون حفظ النقاط</div>
            </div>
          </button>

          <button onClick={() => navigate("/")} style={styles.btnLink}>← الرجوع للرئيسية</button>
        </div>
        <ArenaGlobalStyles />
      </div>
    );
  }

  // مرحلة 2: إعدادات الجلسة
  if (stage === "setup") {
    return (
      <div style={styles.screen}>
        <ArenaParticles />
        <div style={{ ...styles.card, maxWidth: 640 }}>
          <header style={styles.header}>
            <h1 style={styles.titleSm}>
              <span style={{ marginLeft: 8 }}>🏆</span>إنشاء تحدّي جديد
            </h1>
            {user && (
              <div style={styles.userBadge}>
                {user.photoURL && <img src={user.photoURL} alt="" style={{ width: 22, height: 22, borderRadius: "50%" }} />}
                <span>{user.displayName || "لاعب"}</span>
              </div>
            )}
          </header>

          {/* اسم المضيف */}
          <Section label="اسمك أو لقبك في المعركة">
            <input
              type="text" value={hostName} onChange={(e) => setHostName(e.target.value)}
              placeholder="مثلاً: أبو الأبطال" maxLength={20} dir="auto" style={styles.input}
            />
          </Section>

          {/* عدد الأسئلة */}
          <Section label="عدد الأسئلة">
            <div style={styles.pillsRow}>
              {QUESTION_COUNTS.map((count) => (
                <button
                  key={count} type="button"
                  onClick={() => setQuestionsCount(count)}
                  style={{ ...styles.pill, ...(questionsCount === count ? styles.pillActive : {}) }}
                >
                  {count} سؤال
                </button>
              ))}
            </div>
          </Section>

          {/* المستويات */}
          <Section label="مستويات الصعوبة">
            <div style={styles.pillsRow}>
              {[
                { key: "easy", label: "سهل · 100", color: theme.green },
                { key: "medium", label: "متوسط · 150", color: theme.yellow },
                { key: "hard", label: "صعب · 200", color: theme.red },
              ].map((lvl) => (
                <button
                  key={lvl.key} type="button"
                  onClick={() => toggleLevel(lvl.key)}
                  style={{
                    ...styles.pill,
                    ...(enabledLevels[lvl.key] ? {
                      background: lvl.color, borderColor: lvl.color, color: "#0a0a0f"
                    } : {}),
                  }}
                >
                  {enabledLevels[lvl.key] ? "✓ " : ""}{lvl.label}
                </button>
              ))}
            </div>
          </Section>

          {/* الفئات */}
          <Section
            label={`الفئات (${selectedCategories.length}/${Object.keys(ARENA_CATEGORIES).length})`}
            actions={
              <>
                <button onClick={() => setSelectedCategories(Object.keys(ARENA_CATEGORIES))} style={styles.btnLink}>الكل</button>
                <button onClick={() => setSelectedCategories([Object.keys(ARENA_CATEGORIES)[0]])} style={styles.btnLink}>مسح</button>
              </>
            }
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8 }}>
              {Object.entries(ARENA_CATEGORIES).map(([key, cat]) => {
                const active = selectedCategories.includes(key);
                return (
                  <button
                    key={key} type="button" onClick={() => toggleCategory(key)}
                    style={{
                      ...styles.categoryCard,
                      ...(active ? {
                        borderColor: cat.color,
                        background: `${cat.color}18`,
                        boxShadow: `0 0 20px ${cat.color}25`,
                      } : {}),
                    }}
                  >
                    <span style={{ fontSize: 26 }}>{cat.icon}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: active ? cat.color : theme.text }}>{cat.ar}</span>
                  </button>
                );
              })}
            </div>
          </Section>

          {/* القدرات */}
          <Section>
            <label style={{ ...styles.toggleRow, cursor: "pointer" }}>
              <input
                type="checkbox" checked={powerupsEnabled}
                onChange={(e) => setPowerupsEnabled(e.target.checked)}
                style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
              />
              <span style={{
                position: "relative", width: 48, height: 28,
                background: powerupsEnabled ? theme.yellow : theme.border,
                borderRadius: 999, flexShrink: 0, transition: "all 0.2s",
              }}>
                <span style={{
                  position: "absolute", top: 3, right: powerupsEnabled ? 23 : 3,
                  width: 22, height: 22, background: "#fff", borderRadius: "50%",
                  transition: "all 0.2s",
                }}/>
              </span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: theme.text, fontFamily: "Cairo" }}>
                  ⚡ تفعيل القدرات
                </div>
                <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2, fontFamily: "Tajawal" }}>
                  14 قدرة تُشترى بالنقاط (هجومية، دفاعية، مضاعفة، خاصة)
                </div>
              </div>
            </label>
          </Section>

          {/* تنبيه */}
          <div style={styles.notice}>
            <span style={{ fontSize: 18 }}>ℹ️</span>
            <span>اللعبة تتطلب من {PLAYER_RANGES.min} إلى {PLAYER_RANGES.max} لاعبين · مدة كل سؤال {QUESTION_DURATION} ثانية</span>
          </div>

          {/* الأزرار */}
          <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
            <button onClick={() => navigate("/")} disabled={creating} style={{ ...styles.btnGhost, flex: 1 }}>
              إلغاء
            </button>
            <button onClick={handleCreateArena} disabled={creating || !hostName.trim()} style={{ ...styles.btnGold, flex: 1 }}>
              {creating ? "جاري الإنشاء..." : <>إنشاء التحدّي <span style={{ marginRight: 6 }}>←</span></>}
            </button>
          </div>
        </div>
        <ArenaGlobalStyles />
      </div>
    );
  }

  // مرحلة 3: شاشة الـ Lobby
  const playersList = arenaData?.players
    ? Object.entries(arenaData.players).map(([id, p]) => ({ id, ...p }))
    : [];
  const playerCount = playersList.length;
  const canStart = playerCount >= PLAYER_RANGES.min;

  return (
    <div style={styles.screen}>
      <ArenaParticles />
      <div style={{ ...styles.card, maxWidth: 720 }}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.titleSm}>
              <span style={{ marginLeft: 8 }}>🏆</span>غرفة الانتظار
            </h1>
            <p style={{ fontSize: 12, color: theme.textMuted, marginTop: 4, fontFamily: "Tajawal" }}>
              {canStart ? "جاهز للبدء" : `بانتظار ${PLAYER_RANGES.min - playerCount} لاعبين على الأقل`}
            </p>
          </div>
          <button onClick={handleCancelArena} style={{ ...styles.btnGhost, padding: "8px 14px", fontSize: 13 }}>
            إلغاء الجلسة
          </button>
        </header>

        <div style={styles.lobbyGrid}>
          {/* QR + الكود */}
          <section style={styles.shareBox}>
            <div style={styles.qrWrap}>
              <canvas ref={qrCanvasRef} style={{ display: "block", borderRadius: 8 }} />
              <p style={{ margin: "10px 0 0", fontSize: 12, color: theme.textMuted, textAlign: "center", fontFamily: "Tajawal" }}>
                امسح الكود للانضمام
              </p>
            </div>

            <div style={{ textAlign: "center", position: "relative" }}>
              <div style={{ fontSize: 11, color: theme.textMuted, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 8, fontFamily: "Tajawal" }}>
                كود الدخول
              </div>
              <button onClick={copyArenaCode} style={styles.codeBox}>
                {arenaCode}
                <span style={{ fontSize: 16, opacity: 0.7 }}>📋</span>
              </button>
              {copyFeedback && <div style={styles.copyToast}>{copyFeedback}</div>}
            </div>

            <button onClick={copyJoinLink} style={{ ...styles.btnSecondary, padding: "8px 14px", fontSize: 13, justifyContent: "center" }}>
              📎 نسخ رابط الانضمام
            </button>
          </section>

          {/* قائمة اللاعبين */}
          <section>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: theme.text, margin: 0, fontFamily: "Cairo" }}>
                اللاعبون ({playerCount}/{PLAYER_RANGES.max})
              </h2>
              <span style={{
                width: 10, height: 10, borderRadius: "50%",
                background: canStart ? theme.green : theme.textMuted,
                boxShadow: canStart ? `0 0 0 4px ${theme.green}33` : "none",
                animation: canStart ? "pulse 2s infinite" : "none",
              }} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              {playersList.map((p, idx) => (
                <div key={p.id} style={styles.playerItem}>
                  <div style={styles.playerAvatar}>
                    {p.avatar ? <img src={p.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span>{p.name.charAt(0)}</span>}
                  </div>
                  <div style={{ flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: theme.text, fontFamily: "Cairo", display: "flex", alignItems: "center", gap: 6 }}>
                      {p.name}
                      {p.isHost && <span style={styles.hostBadge}>المنشئ</span>}
                    </span>
                    <span style={{ fontSize: 11, color: theme.textMuted, fontWeight: 600 }}>#{idx + 1}</span>
                  </div>
                </div>
              ))}
              {Array.from({ length: PLAYER_RANGES.max - playerCount }).map((_, i) => (
                <div key={`e-${i}`} style={{ ...styles.playerItem, opacity: 0.4, borderStyle: "dashed", background: "transparent" }}>
                  <div style={{ ...styles.playerAvatar, background: theme.border, color: theme.textMuted }}>
                    <span>?</span>
                  </div>
                  <span style={{ fontSize: 13, color: theme.textMuted, fontFamily: "Tajawal" }}>بانتظار لاعب...</span>
                </div>
              ))}
            </div>

            <div style={styles.configSummary}>
              <ConfigItem icon="📋" text={`${questionsCount} سؤال`} />
              <ConfigItem icon="⏱️" text={`${QUESTION_DURATION} ثانية`} />
              <ConfigItem icon="🎯" text={`${selectedCategories.length} فئات`} />
              {powerupsEnabled && <ConfigItem icon="⚡" text="القدرات مفعّلة" />}
            </div>
          </section>
        </div>

        {/* زر البدء */}
        <div style={{ marginTop: 20 }}>
          <button onClick={handleStartGame} disabled={!canStart} style={{ ...styles.btnGold, width: "100%", padding: 18, fontSize: 17 }}>
            {canStart ? "🚀 ابدأ المعركة" : `بانتظار ${PLAYER_RANGES.min - playerCount} لاعبين`}
          </button>
        </div>
      </div>
      <ArenaGlobalStyles />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// مكونات مساعدة
// ═══════════════════════════════════════════════════════════════════

function Section({ label, actions, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      {label && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: theme.text, fontFamily: "Cairo" }}>{label}</label>
          {actions && <div style={{ display: "flex", gap: 12 }}>{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

function ConfigItem({ icon, text }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: theme.textMuted, fontFamily: "Tajawal" }}>
      <span>{icon}</span>
      <span>{text}</span>
    </div>
  );
}

function ArenaParticles() {
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0 }}>
      {Array.from({ length: 20 }).map((_, i) => (
        <div key={i} style={{
          position: "absolute",
          width: Math.random() * 3 + 1, height: Math.random() * 3 + 1,
          background: i % 3 === 0 ? theme.yellow : i % 3 === 1 ? theme.purple : theme.accent,
          borderRadius: "50%",
          left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`,
          opacity: Math.random() * 0.3 + 0.1,
          animation: `particleFloat ${5 + Math.random() * 5}s infinite`, animationDelay: `${Math.random() * 5}s`,
        }} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// الستايلات
// ═══════════════════════════════════════════════════════════════════

const styles = {
  screen: {
    minHeight: "100vh",
    background: theme.bg,
    color: theme.text,
    padding: "24px 16px",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    fontFamily: "Tajawal, system-ui, sans-serif",
    direction: "rtl",
    position: "relative",
  },
  card: {
    background: theme.bgCard,
    borderRadius: 18,
    border: `1px solid ${theme.border}`,
    boxShadow: `0 20px 60px rgba(0,0,0,0.5), ${theme.arenaGlow}`,
    padding: "28px 24px",
    width: "100%",
    position: "relative",
    zIndex: 1,
  },
  titleGold: {
    fontSize: 30,
    fontWeight: 900,
    background: `linear-gradient(135deg, ${theme.yellow}, ${theme.yellowAlt})`,
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
    margin: 0,
    fontFamily: "Cairo, sans-serif",
    letterSpacing: "-0.5px",
  },
  titleSm: {
    fontSize: 20,
    fontWeight: 800,
    color: theme.yellow,
    margin: 0,
    display: "flex",
    alignItems: "center",
    fontFamily: "Cairo, sans-serif",
  },
  subtitle: {
    fontSize: 14,
    color: theme.textMuted,
    margin: 0,
    fontFamily: "Tajawal",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    paddingBottom: 14,
    borderBottom: `1px solid ${theme.border}`,
  },
  userBadge: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 12px",
    background: theme.bgInput,
    borderRadius: 999,
    fontSize: 13,
    color: theme.yellow,
    fontWeight: 700,
    fontFamily: "Cairo",
    border: `1px solid ${theme.yellow}33`,
  },
  input: {
    width: "100%",
    padding: "14px 16px",
    fontSize: 15,
    border: `1px solid ${theme.border}`,
    borderRadius: 12,
    background: theme.bgInput,
    color: theme.text,
    fontFamily: "Tajawal",
    boxSizing: "border-box",
    outline: "none",
    transition: "all 0.2s",
  },
  pillsRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  pill: {
    flex: 1,
    minWidth: 90,
    padding: "12px 14px",
    border: `1px solid ${theme.border}`,
    background: theme.bgInput,
    color: theme.textMuted,
    borderRadius: 12,
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "Cairo",
    transition: "all 0.2s",
  },
  pillActive: {
    background: theme.yellow,
    borderColor: theme.yellow,
    color: "#0a0a0f",
  },
  categoryCard: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    padding: "12px 6px",
    border: `1px solid ${theme.border}`,
    background: theme.bgInput,
    borderRadius: 12,
    cursor: "pointer",
    fontFamily: "Cairo",
    transition: "all 0.2s",
  },
  toggleRow: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: 14,
    background: theme.bgInput,
    borderRadius: 12,
    border: `1px solid ${theme.border}`,
  },
  notice: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 14px",
    background: `${theme.yellow}10`,
    borderRight: `3px solid ${theme.yellow}`,
    borderRadius: 8,
    fontSize: 12,
    color: theme.yellow,
    fontFamily: "Tajawal",
    fontWeight: 600,
  },
  btnGold: {
    padding: "14px 24px",
    border: "none",
    borderRadius: 12,
    background: `linear-gradient(135deg, ${theme.yellow}, ${theme.yellowAlt})`,
    color: "#0a0a0f",
    fontSize: 15,
    fontWeight: 800,
    cursor: "pointer",
    fontFamily: "Cairo",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    transition: "all 0.2s",
    boxShadow: theme.arenaGlow,
  },
  btnGhost: {
    padding: "14px 24px",
    border: `1px solid ${theme.border}`,
    borderRadius: 12,
    background: "transparent",
    color: theme.textMuted,
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "Cairo",
  },
  btnSecondary: {
    padding: "14px 18px",
    border: `1px solid ${theme.border}`,
    borderRadius: 12,
    background: theme.bgInput,
    color: theme.text,
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "Cairo",
    display: "flex",
    alignItems: "center",
    width: "100%",
  },
  btnGoogle: {
    padding: "14px 18px",
    border: `1px solid ${theme.border}`,
    borderRadius: 12,
    background: theme.bgInput,
    color: theme.text,
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "Cairo",
    display: "flex",
    alignItems: "center",
    gap: 14,
    width: "100%",
  },
  btnLink: {
    background: "none",
    border: "none",
    color: theme.yellow,
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    padding: "4px 0",
    fontFamily: "Cairo",
    display: "block",
    margin: "16px auto 0",
  },
  divider: {
    textAlign: "center",
    position: "relative",
    margin: "16px 0",
    color: theme.textMuted,
    fontSize: 13,
    fontFamily: "Tajawal",
  },
  lobbyGrid: {
    display: "grid",
    gridTemplateColumns: window.innerWidth > 640 ? "1fr 1fr" : "1fr",
    gap: 18,
    marginBottom: 20,
  },
  shareBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 14,
    padding: 18,
    background: theme.bgInput,
    borderRadius: 12,
    border: `1px solid ${theme.border}`,
  },
  qrWrap: {
    background: theme.bgCard,
    padding: 12,
    borderRadius: 12,
    border: `1px solid ${theme.yellow}33`,
  },
  codeBox: {
    background: theme.bg,
    border: `2px dashed ${theme.yellow}`,
    padding: "10px 18px",
    borderRadius: 12,
    fontSize: 24,
    fontWeight: 800,
    color: theme.yellow,
    letterSpacing: 4,
    cursor: "pointer",
    fontFamily: "monospace",
    display: "flex",
    alignItems: "center",
    gap: 12,
    transition: "all 0.2s",
  },
  copyToast: {
    position: "absolute",
    top: -10,
    background: theme.green,
    color: "#0a0a0f",
    padding: "4px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    fontFamily: "Cairo",
  },
  playerItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    background: theme.bgInput,
    border: `1px solid ${theme.border}`,
    borderRadius: 12,
  },
  playerAvatar: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    background: theme.yellow,
    color: "#0a0a0f",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 800,
    fontSize: 14,
    flexShrink: 0,
    overflow: "hidden",
    fontFamily: "Cairo",
  },
  hostBadge: {
    fontSize: 9,
    fontWeight: 800,
    background: theme.yellow,
    color: "#0a0a0f",
    padding: "2px 6px",
    borderRadius: 999,
    fontFamily: "Cairo",
  },
  configSummary: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
    padding: 10,
    background: theme.bgInput,
    borderRadius: 10,
    border: `1px solid ${theme.border}`,
  },
};

// ─── الأنماط الجلوبال (animations) ────────────────────────────────

function ArenaGlobalStyles() {
  return (
    <style>{`
      @keyframes particleFloat {
        0%, 100% { transform: translateY(0) translateX(0); opacity: 0.2; }
        25% { transform: translateY(-30px) translateX(15px); opacity: 0.5; }
        50% { transform: translateY(-15px) translateX(-10px); opacity: 0.3; }
        75% { transform: translateY(-40px) translateX(20px); opacity: 0.4; }
      }
      @keyframes pulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.15); opacity: 0.85; }
      }
      .arena-divider-line::before, .arena-divider-line::after {
        content: ""; position: absolute; top: 50%;
        width: 40%; height: 1px; background: ${theme.border};
      }
      input:focus { border-color: ${theme.yellow} !important; box-shadow: 0 0 0 3px ${theme.yellow}22 !important; }
      button:hover:not(:disabled) { transform: translateY(-1px); }
      button:disabled { opacity: 0.5; cursor: not-allowed !important; transform: none !important; }
    `}</style>
  );
}
