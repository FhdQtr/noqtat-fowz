// ═══════════════════════════════════════════════════════════════════
// 🏆 صراع الأبطال - شاشة اللاعب
// نقطة فوز - تحدي تفاعلي متعدد اللاعبين
// الملف 3 - Dark theme + Gold accent
// ═══════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from “react”;
import { useNavigate, useParams } from “react-router-dom”;
import { db, ref, set, get, onValue, update } from “./firebase.js”;
import { onDisconnect, remove } from “firebase/database”;
import {
PowerupsModal, ConfettiOverlay, RoundHeroes,
PowerupEffect, WinnerCelebration, ArenaSounds,
} from “./ArenaEffects”;

// ─── Theme ──────────────────────────────────────────────────────────

const theme = {
bg: “#0a0a0f”,
bgCard: “#12121a”,
bgHover: “#1a1a2e”,
bgInput: “#16162a”,
accent: “#00d4ff”,
accentAlt: “#ff6b35”,
purple: “#a855f7”,
green: “#22c55e”,
red: “#ef4444”,
yellow: “#fbbf24”,
yellowAlt: “#f59e0b”,
text: “#e4e4e7”,
textMuted: “#71717a”,
border: “#27273a”,
arenaGlow: “0 0 40px rgba(251, 191, 36, 0.25)”,
};

const ARENA_CATEGORIES = {
culture:   { ar: “ثقافة عامة”, icon: “🌍”, color: “#f59e0b” },
science:   { ar: “علوم”,       icon: “🔬”, color: “#10b981” },
religion:  { ar: “إسلامي”,     icon: “🕌”, color: “#22c55e” },
language:  { ar: “لغة عربية”,  icon: “📝”, color: “#a855f7” },
math:      { ar: “رياضيات”,    icon: “🧮”, color: “#3b82f6” },
geography: { ar: “جغرافيا”,    icon: “🗺️”, color: “#06b6d4” },
gulf:      { ar: “خليجيات”,    icon: “🐪”, color: “#dc2626” },
tech:      { ar: “تقنية”,      icon: “💻”, color: “#6366f1” },
riddles:   { ar: “ألغاز”,      icon: “🧩”, color: “#ec4899” },
sports:    { ar: “رياضة”,      icon: “⚽”, color: “#f97316” },
};

const ARENA_LEVELS = {
easy:   { ar: “سهل”,   color: theme.green, points: 100 },
medium: { ar: “متوسط”, color: theme.yellow, points: 150 },
hard:   { ar: “صعب”,   color: theme.red,    points: 200 },
};

const PLAYER_RANGES = { min: 3, max: 6 };

function generatePlayerId() {
return “p_” + Math.random().toString(36).substr(2, 9) + “_” + Date.now().toString(36);
}

function normalizeArenaCode(input) {
return input.trim().toUpperCase().replace(/[^A-Z2-9]/g, “”);
}

// ═══════════════════════════════════════════════════════════════════
// المكون الرئيسي
// ═══════════════════════════════════════════════════════════════════

export default function ArenaPlayer() {
const navigate = useNavigate();
const { code: codeFromUrl } = useParams();

const [stage, setStage] = useState(“join”);
const [playerId, setPlayerId] = useState(””);
const [playerName, setPlayerName] = useState(””);
const [arenaCode, setArenaCode] = useState(codeFromUrl ? normalizeArenaCode(codeFromUrl) : “”);
const [arenaInfo, setArenaInfo] = useState(null);
const [arenaData, setArenaData] = useState(null);
const [errorMsg, setErrorMsg] = useState(””);

useEffect(() => {
if (codeFromUrl && stage === “join”) {
const cleanCode = normalizeArenaCode(codeFromUrl);
if (cleanCode.length === 6) peekArenaInfo(cleanCode);
}
}, [codeFromUrl]);

async function peekArenaInfo(code) {
try {
const snap = await get(ref(db, `arenas/${code}`));
if (!snap.exists()) {
setErrorMsg(“الجلسة غير موجودة. تأكد من الكود أو اطلب من المنشئ كود جديد.”);
return;
}
const data = snap.val();
if (data.status !== “waiting”) {
setErrorMsg(data.status === “playing” ? “هذه المعركة بدأت بالفعل، انتظر الجولة القادمة.” : “هذه المعركة انتهت.”);
return;
}
const playerCount = data.players ? Object.keys(data.players).length : 0;
if (playerCount >= PLAYER_RANGES.max) {
setErrorMsg(`الغرفة ممتلئة (${PLAYER_RANGES.max} لاعبين كحد أقصى).`);
return;
}
setArenaInfo({ code, host: data.host, playerCount, config: data.config });
} catch (err) {
console.error(“Failed to peek arena:”, err);
setErrorMsg(“تعذر الاتصال. تحقق من الإنترنت وحاول مرة ثانية.”);
}
}

async function handleJoin() {
const trimmedName = playerName.trim();
const cleanCode = normalizeArenaCode(arenaCode);

```
if (!trimmedName) { setErrorMsg("الرجاء إدخال اسمك"); return; }
if (trimmedName.length > 20) { setErrorMsg("الاسم طويل جداً (الحد الأقصى 20 حرف)"); return; }
if (cleanCode.length !== 6) { setErrorMsg("كود الدخول يجب أن يكون 6 أحرف"); return; }

setErrorMsg("");

try {
  const snap = await get(ref(db, `arenas/${cleanCode}`));
  if (!snap.exists()) { setErrorMsg("الجلسة غير موجودة"); return; }
  const data = snap.val();
  if (data.status !== "waiting") { setErrorMsg("لا يمكن الانضمام، الجلسة بدأت أو انتهت"); return; }
  const currentPlayers = data.players || {};
  if (Object.keys(currentPlayers).length >= PLAYER_RANGES.max) { setErrorMsg("الغرفة ممتلئة"); return; }

  const nameExists = Object.values(currentPlayers).some(
    (p) => p.name.toLowerCase() === trimmedName.toLowerCase()
  );
  if (nameExists) { setErrorMsg("هذا الاسم مستخدم. اختر اسماً آخر."); return; }

  const newId = generatePlayerId();
  const playerRef = ref(db, `arenas/${cleanCode}/players/${newId}`);
  onDisconnect(playerRef).remove();

  await set(playerRef, {
    name: trimmedName, isHost: false, ready: true, score: 0,
    joinedAt: Date.now(), avatar: "",
  });

  setPlayerId(newId);
  setArenaCode(cleanCode);
  setStage("waiting");

  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("event", "arena_joined", { code: cleanCode });
  }
} catch (err) {
  console.error("Failed to join:", err);
  setErrorMsg("تعذر الانضمام. حاول مرة ثانية.");
}
```

}

useEffect(() => {
if (!arenaCode || !playerId) return;
if (stage !== “waiting” && stage !== “playing”) return;

```
const arenaRef = ref(db, `arenas/${arenaCode}`);
const unsubscribe = onValue(arenaRef, (snapshot) => {
  const data = snapshot.val();
  if (!data) {
    setErrorMsg("تم إنهاء الجلسة بواسطة المنشئ");
    setStage("error");
    return;
  }
  setArenaData(data);
  if (data.status === "playing" && stage === "waiting") setStage("playing");
  else if (data.status === "finished") setStage("finished");
});
return () => unsubscribe();
```

}, [arenaCode, playerId, stage]);

async function handleLeaveArena() {
if (!confirm(“هل تريد الخروج من الجلسة؟”)) return;
try {
await remove(ref(db, `arenas/${arenaCode}/players/${playerId}`));
} catch (err) {
console.error(“Leave error:”, err);
}
navigate(”/”);
}

// ─── العرض ───────────────────────────────────────────────────────

if (stage === “error”) {
return (
<div style={styles.screen}>
<div style={{ …styles.card, maxWidth: 460 }}>
<div style={{ textAlign: “center”, padding: “20px 0” }}>
<div style={{ fontSize: 64, marginBottom: 16 }}>⚠️</div>
<h2 style={{ fontSize: 22, color: theme.red, margin: “0 0 12px”, fontFamily: “Cairo” }}>حصلت مشكلة</h2>
<p style={{ color: theme.textMuted, margin: “0 0 24px”, lineHeight: 1.6, fontFamily: “Tajawal” }}>{errorMsg}</p>
<button onClick={() => navigate(”/”)} style={styles.btnGold}>الرجوع للرئيسية</button>
</div>
</div>
<ArenaPlayerStyles />
</div>
);
}

if (stage === “join”) {
return (
<JoinScreen
arenaCode={arenaCode} setArenaCode={setArenaCode}
playerName={playerName} setPlayerName={setPlayerName}
arenaInfo={arenaInfo} errorMsg={errorMsg} setErrorMsg={setErrorMsg}
onJoin={handleJoin} onPeek={peekArenaInfo} onBack={() => navigate(”/”)}
/>
);
}

if (stage === “waiting”) {
return <WaitingScreen arenaCode={arenaCode} playerId={playerId} arenaData={arenaData} onLeave={handleLeaveArena} />;
}

if (stage === “playing”) {
return <PlayingScreen arenaCode={arenaCode} playerId={playerId} arenaData={arenaData} />;
}

if (stage === “finished”) {
return <FinishedScreen arenaData={arenaData} playerId={playerId} onExit={() => navigate(”/”)} />;
}

return null;
}

// ═══════════════════════════════════════════════════════════════════
// شاشة الانضمام
// ═══════════════════════════════════════════════════════════════════

function JoinScreen({ arenaCode, setArenaCode, playerName, setPlayerName, arenaInfo, errorMsg, setErrorMsg, onJoin, onPeek, onBack }) {
function handleCodeChange(e) {
const cleaned = normalizeArenaCode(e.target.value);
setArenaCode(cleaned);
setErrorMsg(””);
if (cleaned.length === 6) onPeek(cleaned);
}

function handleSubmit(e) {
e.preventDefault();
onJoin();
}

return (
<div style={styles.screen}>
<div style={{ …styles.card, maxWidth: 460 }}>
<div style={{ textAlign: “center”, marginBottom: 24 }}>
<div style={{ fontSize: 56, marginBottom: 12, filter: “drop-shadow(0 0 20px rgba(251,191,36,0.5))” }}>🎯</div>
<h1 style={styles.titleGold}>انضم للمعركة</h1>
<p style={{ …styles.subtitle, marginTop: 6 }}>أدخل الكود واسمك للدخول</p>
</div>

```
    <form onSubmit={handleSubmit}>
      <Section label="اسمك">
        <input
          type="text" value={playerName}
          onChange={(e) => { setPlayerName(e.target.value); setErrorMsg(""); }}
          placeholder="مثلاً: المحارب" maxLength={20} dir="auto" autoFocus style={styles.input}
        />
      </Section>

      <Section label="كود الدخول (6 أحرف)">
        <input
          type="text" value={arenaCode} onChange={handleCodeChange}
          placeholder="ABC123" maxLength={6} dir="ltr" autoComplete="off" spellCheck="false"
          style={{
            ...styles.input,
            textAlign: "center", fontSize: 22, fontWeight: 800,
            letterSpacing: 4, fontFamily: "monospace",
            textTransform: "uppercase", color: theme.yellow,
          }}
        />
      </Section>

      {arenaInfo && !errorMsg && (
        <div style={styles.infoPreview}>
          <InfoRow icon="👤" label="المنشئ" value={arenaInfo.host} />
          <InfoRow icon="👥" label="اللاعبون" value={`${arenaInfo.playerCount} / ${PLAYER_RANGES.max}`} />
          <InfoRow icon="📋" label="عدد الأسئلة" value={`${arenaInfo.config?.questionsCount} سؤال`} />
          {arenaInfo.config?.powerupsEnabled && <InfoRow icon="⚡" label="القدرات" value="مفعّلة" />}
        </div>
      )}

      {errorMsg && (
        <div style={styles.errorBanner}>{errorMsg}</div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button type="button" onClick={onBack} style={{ ...styles.btnGhost, flex: 1 }}>إلغاء</button>
        <button
          type="submit"
          disabled={!playerName.trim() || arenaCode.length !== 6}
          style={{ ...styles.btnGold, flex: 1 }}
        >
          انضم للمعركة <span style={{ marginRight: 6 }}>←</span>
        </button>
      </div>
    </form>
  </div>
  <ArenaPlayerStyles />
</div>
```

);
}

// ═══════════════════════════════════════════════════════════════════
// شاشة الانتظار
// ═══════════════════════════════════════════════════════════════════

function WaitingScreen({ arenaCode, playerId, arenaData, onLeave }) {
const players = arenaData?.players
? Object.entries(arenaData.players).map(([id, p]) => ({ id, …p }))
: [];
const playerCount = players.length;
const myInfo = arenaData?.players?.[playerId];

return (
<div style={styles.screen}>
<div style={{ …styles.card, maxWidth: 640 }}>
<header style={styles.header}>
<div>
<h1 style={styles.titleSm}>
<span style={{ marginLeft: 8 }}>⏳</span>غرفة الانتظار
</h1>
<p style={{ fontSize: 12, color: theme.textMuted, marginTop: 4, fontFamily: “Tajawal” }}>
بانتظار بدء المنشئ للمعركة…
</p>
</div>
<button onClick={onLeave} style={{ …styles.btnGhost, padding: “8px 14px”, fontSize: 13 }}>خروج</button>
</header>

```
    {/* بطاقتي */}
    <div style={styles.myCard}>
      <div style={styles.myAvatar}>{myInfo?.name?.charAt(0) || "؟"}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, opacity: 0.85, fontFamily: "Tajawal", textTransform: "uppercase", letterSpacing: 0.5 }}>أنت</div>
        <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "Cairo" }}>{myInfo?.name || "..."}</div>
      </div>
      <div style={{ textAlign: "center", background: "rgba(0,0,0,0.3)", padding: "8px 14px", borderRadius: 10 }}>
        <div style={{ fontSize: 10, opacity: 0.85, fontFamily: "Tajawal" }}>الكود</div>
        <strong style={{ fontSize: 16, fontFamily: "monospace", letterSpacing: 1 }}>{arenaCode}</strong>
      </div>
    </div>

    {/* اللاعبون */}
    <div style={{ marginBottom: 16 }}>
      <h2 style={{ fontSize: 14, fontWeight: 700, color: theme.text, margin: "0 0 12px", fontFamily: "Cairo" }}>
        اللاعبون ({playerCount}/{PLAYER_RANGES.max})
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {players.map((p, idx) => (
          <div key={p.id} style={{
            ...styles.playerItem,
            ...(p.id === playerId ? { background: `${theme.yellow}15`, borderColor: theme.yellow } : {}),
          }}>
            <div style={styles.playerAvatar}>
              {p.avatar ? <img src={p.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span>{p.name.charAt(0)}</span>}
            </div>
            <div style={{ flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: theme.text, fontFamily: "Cairo", display: "flex", alignItems: "center", gap: 6 }}>
                {p.name}
                {p.isHost && <span style={styles.hostBadge}>المنشئ</span>}
                {p.id === playerId && <span style={styles.selfBadge}>أنت</span>}
              </span>
              <span style={{ fontSize: 11, color: theme.textMuted, fontWeight: 600 }}>#{idx + 1}</span>
            </div>
          </div>
        ))}
        {Array.from({ length: PLAYER_RANGES.max - playerCount }).map((_, i) => (
          <div key={`e-${i}`} style={{ ...styles.playerItem, opacity: 0.4, borderStyle: "dashed", background: "transparent" }}>
            <div style={{ ...styles.playerAvatar, background: theme.border, color: theme.textMuted }}>?</div>
            <span style={{ fontSize: 13, color: theme.textMuted, fontFamily: "Tajawal" }}>بانتظار لاعب...</span>
          </div>
        ))}
      </div>
    </div>

    {/* مؤشر انتظار */}
    <div style={{ textAlign: "center", marginTop: 18 }}>
      <div style={{ display: "inline-flex", gap: 8, marginBottom: 10 }}>
        <span style={{ ...styles.dot, animationDelay: "0s" }} />
        <span style={{ ...styles.dot, animationDelay: "0.2s" }} />
        <span style={{ ...styles.dot, animationDelay: "0.4s" }} />
      </div>
      <p style={{ color: theme.textMuted, margin: 0, fontSize: 13, fontFamily: "Tajawal" }}>
        المنشئ سيبدأ المعركة قريباً
      </p>
    </div>
  </div>
  <ArenaPlayerStyles />
</div>
```

);
}

// ═══════════════════════════════════════════════════════════════════
// شاشة اللعب
// ═══════════════════════════════════════════════════════════════════

function PlayingScreen({ arenaCode, playerId, arenaData }) {
const config = arenaData?.config || {};
const currentQ = arenaData?.currentQuestion ?? 0;
const totalQ = config.questionsCount || 0;
const phase = arenaData?.phase || “question”;
const questionData = arenaData?.questions?.[currentQ];
const myPlayer = arenaData?.players?.[playerId];
const myScore = myPlayer?.score || 0;
const myStreak = myPlayer?.streak || 0;

const [timeLeft, setTimeLeft] = useState(config.questionDuration || 15);
const [selectedOption, setSelectedOption] = useState(null);
const [hasSubmitted, setHasSubmitted] = useState(false);
const [showPowerupsModal, setShowPowerupsModal] = useState(false);
const [confettiTrigger, setConfettiTrigger] = useState(0);
const [activeEffect, setActiveEffect] = useState(null);
const timerRef = useRef(null);
const questionStartRef = useRef(Date.now());
const lastRoundRef = useRef(null);

useEffect(() => {
setTimeLeft(config.questionDuration || 15);
setSelectedOption(null);
setHasSubmitted(false);
questionStartRef.current = Date.now();
}, [currentQ, config.questionDuration]);

// كشف الإجابة
useEffect(() => {
if (phase === “reveal” && lastRoundRef.current !== currentQ) {
lastRoundRef.current = currentQ;
const wasCorrect = myPlayer?.lastAnswerCorrect;
if (wasCorrect) {
setConfettiTrigger((prev) => prev + 1);
ArenaSounds.play(“correct”);
} else {
ArenaSounds.play(“wrong”);
}
}
}, [phase, currentQ, myPlayer?.lastAnswerCorrect]);

// اكتشاف القدرات المستهدفة
useEffect(() => {
if (myPlayer?.frozenForQuestion && !activeEffect) setActiveEffect({ type: “ice” });
else if (myPlayer?.scrambled && !activeEffect) setActiveEffect({ type: “scramble” });
else if (myPlayer?.mutedFor && !activeEffect) setActiveEffect({ type: “mute” });
}, [myPlayer?.frozenForQuestion, myPlayer?.scrambled, myPlayer?.mutedFor]);

useEffect(() => {
if (phase !== “question” || hasSubmitted) {
if (timerRef.current) clearInterval(timerRef.current);
return;
}
timerRef.current = setInterval(() => {
setTimeLeft((prev) => {
if (prev <= 0.1) {
clearInterval(timerRef.current);
if (!hasSubmitted) submitAnswer(null);
return 0;
}
return prev - 0.1;
});
}, 100);
return () => clearInterval(timerRef.current);
}, [phase, hasSubmitted, currentQ]);

async function submitAnswer(optionIndex) {
if (hasSubmitted) return;
setHasSubmitted(true);
setSelectedOption(optionIndex);
const elapsedMs = Date.now() - questionStartRef.current;
const timeUsed = Math.min(elapsedMs / 1000, config.questionDuration || 15);
try {
await update(ref(db, `arenas/${arenaCode}/answers/${currentQ}/${playerId}`), {
option: optionIndex, timeUsed, submittedAt: Date.now(),
});
} catch (err) { console.error(“Submit answer failed:”, err); }
}

function handleOptionClick(idx) {
if (hasSubmitted || phase !== “question”) return;
submitAnswer(idx);
}

// مرحلة كشف الإجابة
if (phase === “reveal”) {
const correctAnswer = questionData?.answer;
const wasCorrect = myPlayer?.lastAnswerCorrect;
const pointsGained = myPlayer?.lastRoundPoints || 0;
const playersList = arenaData?.players
? Object.entries(arenaData.players)
.map(([id, p]) => ({ id, …p }))
.sort((a, b) => (b.score || 0) - (a.score || 0))
: [];

```
return (
  <div style={styles.screen}>
    <div style={{ ...styles.card, maxWidth: 580 }}>
      {/* القسم الأول: نتيجة اللاعب */}
      <div style={{ textAlign: "center", padding: "20px 16px 14px", borderBottom: `1px solid ${theme.border}` }}>
        <div style={{ fontSize: 64, color: wasCorrect ? theme.green : theme.red, lineHeight: 1, marginBottom: 8 }}>
          {wasCorrect ? "✓" : "✗"}
        </div>
        <h2 style={{
          fontSize: 22, fontWeight: 800,
          color: wasCorrect ? theme.green : theme.red,
          margin: "0 0 8px", fontFamily: "Cairo",
        }}>
          {wasCorrect ? "إجابة صحيحة!" : selectedOption === null ? "انتهى الوقت" : "إجابة خاطئة"}
        </h2>
        {questionData && (
          <p style={{ fontSize: 14, color: theme.textMuted, margin: "0 0 12px", fontFamily: "Tajawal" }}>
            الإجابة الصحيحة: <strong style={{ color: theme.text }}>{questionData.options[correctAnswer]}</strong>
          </p>
        )}
        {wasCorrect && pointsGained > 0 && (
          <div style={{
            display: "inline-block", padding: "6px 20px",
            background: `linear-gradient(135deg, ${theme.yellow}, ${theme.yellowAlt})`,
            color: "#0a0a0f", borderRadius: 999,
            fontSize: 20, fontWeight: 800,
            fontFamily: "Cairo",
            boxShadow: theme.arenaGlow,
          }}>
            +{pointsGained} نقطة
          </div>
        )}
        {myStreak > 1 && (
          <div style={{ fontSize: 13, color: theme.yellow, fontWeight: 700, fontFamily: "Cairo", marginTop: 8 }}>
            🔥 سلسلة {myStreak} متتالية
          </div>
        )}
      </div>

      {/* القسم الثاني: ترتيب جميع اللاعبين مع نقاطهم */}
      <div style={{ padding: "16px 14px" }}>
        <h3 style={{
          fontSize: 15, fontWeight: 800, color: theme.yellow,
          margin: "0 0 12px", fontFamily: "Cairo", textAlign: "center",
        }}>
          📊 الترتيب بعد هذا السؤال
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {playersList.map((p, idx) => {
            const playerAnswer = arenaData?.answers?.[currentQ]?.[p.id];
            const playerWasCorrect = playerAnswer?.option === correctAnswer;
            const playerGained = p.lastRoundPoints || 0;
            const isMe = p.id === playerId;

            return (
              <div key={p.id} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px",
                background: isMe ? `${theme.yellow}15` : theme.bgInput,
                border: `1px solid ${isMe ? theme.yellow : theme.border}`,
                borderRadius: 10,
              }}>
                {/* الترتيب */}
                <div style={{
                  width: 32, textAlign: "center",
                  fontSize: idx < 3 ? 22 : 14,
                  fontWeight: 800,
                  color: idx === 0 ? theme.yellow : idx === 1 ? "#9ca3af" : idx === 2 ? "#d97706" : theme.textMuted,
                  fontFamily: "Cairo",
                }}>
                  {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`}
                </div>
                {/* أيقونة صح/خطأ */}
                <div style={{
                  width: 24, height: 24, borderRadius: "50%",
                  background: playerWasCorrect ? `${theme.green}25` : `${theme.red}25`,
                  color: playerWasCorrect ? theme.green : theme.red,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, fontWeight: 800, flexShrink: 0,
                }}>
                  {playerWasCorrect ? "✓" : "✗"}
                </div>
                {/* الاسم */}
                <span style={{
                  flex: 1, fontSize: 13, fontWeight: 700,
                  color: theme.text, fontFamily: "Cairo",
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                  {p.name}
                  {isMe && <span style={styles.selfBadge}>أنت</span>}
                </span>
                {/* النقاط المضافة */}
                {playerGained > 0 && (
                  <span style={{
                    fontSize: 12, fontWeight: 800,
                    color: theme.green, fontFamily: "Cairo",
                  }}>
                    +{playerGained}
                  </span>
                )}
                {/* المجموع */}
                <span style={{
                  fontSize: 16, fontWeight: 800,
                  color: theme.yellow, fontFamily: "Cairo",
                  minWidth: 50, textAlign: "left",
                }}>
                  {p.score || 0}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>

    {wasCorrect && <ConfettiOverlay trigger={confettiTrigger} points={pointsGained} />}
    <ArenaPlayerStyles />
  </div>
);
```

}

// التحميل
if (!questionData) {
return (
<div style={styles.screen}>
<div style={{ …styles.card, maxWidth: 460 }}>
<div style={{ textAlign: “center”, padding: “40px 20px” }}>
<div style={{
width: 48, height: 48,
border: `4px solid ${theme.bgInput}`,
borderTopColor: theme.yellow,
borderRadius: “50%”,
margin: “0 auto 16px”,
animation: “spin 0.8s linear infinite”,
}} />
<p style={{ color: theme.textMuted, margin: 0, fontFamily: “Tajawal” }}>جاري تحميل السؤال…</p>
</div>
</div>
<ArenaPlayerStyles />
</div>
);
}

// مرحلة السؤال
const levelInfo = ARENA_LEVELS[questionData.level] || ARENA_LEVELS.medium;
const categoryInfo = ARENA_CATEGORIES[questionData.category] || {};
const timePercent = (timeLeft / (config.questionDuration || 15)) * 100;
const isLowTime = timeLeft <= 5;

return (
<div style={styles.screen}>
<div style={{ …styles.card, maxWidth: 580 }}>
<header style={{ display: “flex”, justifyContent: “space-between”, alignItems: “center”, marginBottom: 14, gap: 10, flexWrap: “wrap” }}>
<div>
<span style={{ fontSize: 18, fontWeight: 800, color: theme.yellow, fontFamily: “Cairo” }}>سؤال {currentQ + 1}</span>
<span style={{ fontSize: 13, color: theme.textMuted, fontWeight: 600 }}> / {totalQ}</span>
</div>
<div style={{ display: “flex”, gap: 8, flexWrap: “wrap” }}>
<span style={{
padding: “4px 10px”, borderRadius: 999, fontSize: 11, fontWeight: 700,
background: `${categoryInfo.color}20`, color: categoryInfo.color, fontFamily: “Cairo”,
border: `1px solid ${categoryInfo.color}40`,
}}>
{categoryInfo.icon} {categoryInfo.ar}
</span>
<span style={{
padding: “4px 10px”, borderRadius: 999, fontSize: 11, fontWeight: 800,
background: levelInfo.color, color: “#0a0a0f”, fontFamily: “Cairo”,
}}>
{levelInfo.ar} · {levelInfo.points}
</span>
</div>
</header>

```
    {/* عداد الوقت */}
    <div style={{
      position: "relative", height: 36,
      background: theme.bgInput, borderRadius: 12,
      overflow: "hidden", marginBottom: 18,
      border: `1px solid ${theme.border}`,
      animation: isLowTime ? "shake 0.4s infinite" : "none",
    }}>
      <div style={{
        position: "absolute", right: 0, top: 0, height: "100%",
        width: `${timePercent}%`,
        background: isLowTime
          ? `linear-gradient(90deg, ${theme.red}, #f87171)`
          : `linear-gradient(90deg, ${theme.yellow}, ${theme.yellowAlt})`,
        transition: "width 0.1s linear, background 0.3s ease",
      }} />
      <span style={{
        position: "absolute", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 17, fontWeight: 800, color: "#0a0a0f",
        textShadow: "0 1px 2px rgba(255,255,255,0.3)",
        fontFamily: "Cairo",
      }}>
        {Math.ceil(timeLeft)}
      </span>
    </div>

    {/* السؤال */}
    <div style={{ marginBottom: 20 }}>
      {questionData.image && (
        <div style={{ fontSize: 56, textAlign: "center", marginBottom: 14 }}>{questionData.image}</div>
      )}
      <h2 style={{
        fontSize: 18, fontWeight: 700, color: theme.text,
        margin: 0, lineHeight: 1.5, fontFamily: "Cairo",
      }}>
        {questionData.question}
      </h2>
    </div>

    {/* الخيارات */}
    <div style={{
      display: "grid",
      gridTemplateColumns: questionData.options?.length === 2 ? "1fr 1fr" : "1fr 1fr",
      gap: 10, marginBottom: 18,
    }}>
      {questionData.options?.map((opt, idx) => {
        const letters = ["أ", "ب", "ج", "د"];
        const isSelected = selectedOption === idx;
        return (
          <button
            key={idx} onClick={() => handleOptionClick(idx)} disabled={hasSubmitted}
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "14px 16px",
              background: isSelected ? theme.yellow : theme.bgInput,
              border: `2px solid ${isSelected ? theme.yellow : theme.border}`,
              borderRadius: 12, cursor: hasSubmitted ? "default" : "pointer",
              fontFamily: "Cairo", textAlign: "right", minHeight: 60,
              transition: "all 0.2s",
              opacity: hasSubmitted && !isSelected ? 0.5 : 1,
            }}
          >
            <span style={{
              width: 32, height: 32, borderRadius: "50%",
              background: isSelected ? "#0a0a0f" : `${theme.yellow}20`,
              color: isSelected ? theme.yellow : theme.yellow,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 800, fontSize: 14, flexShrink: 0,
              fontFamily: "Cairo",
            }}>
              {letters[idx]}
            </span>
            <span style={{
              fontSize: 14, fontWeight: 700,
              color: isSelected ? "#0a0a0f" : theme.text,
              fontFamily: "Cairo",
            }}>
              {opt}
            </span>
          </button>
        );
      })}
    </div>

    {/* الـ footer */}
    <footer style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      gap: 12, paddingTop: 14, borderTop: `1px solid ${theme.border}`,
    }}>
      <div>
        <div style={{ fontSize: 11, color: theme.textMuted, fontWeight: 600, fontFamily: "Tajawal", textTransform: "uppercase", letterSpacing: 0.5 }}>نقاطك</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: theme.yellow, fontFamily: "Cairo" }}>{myScore}</div>
      </div>

      {myStreak > 1 && (
        <div style={{
          padding: "6px 12px", borderRadius: 999,
          background: getStreakBg(myStreak),
          color: "#0a0a0f", fontWeight: 800, fontSize: 13,
          fontFamily: "Cairo",
          animation: myStreak >= 9 ? "fire 1s infinite" : "none",
        }}>
          🔥 {myStreak}
        </div>
      )}

      {config.powerupsEnabled && (
        <button onClick={() => setShowPowerupsModal(true)} style={{
          padding: "10px 14px",
          border: `2px solid ${theme.yellow}`,
          background: theme.bgInput,
          color: theme.yellow,
          borderRadius: 12,
          fontWeight: 800,
          cursor: "pointer",
          fontFamily: "Cairo",
          position: "relative",
          fontSize: 13,
        }}>
          ⚡ القدرات
          {Object.keys(myPlayer?.powerups || {}).filter((id) => !myPlayer.powerups[id].used).length > 0 && (
            <span style={{
              position: "absolute", top: -6, left: -6,
              background: theme.yellow, color: "#0a0a0f",
              width: 20, height: 20, borderRadius: "50%",
              fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 800,
            }}>
              {Object.keys(myPlayer.powerups).filter((id) => !myPlayer.powerups[id].used).length}
            </span>
          )}
        </button>
      )}
    </footer>

    {hasSubmitted && (
      <div style={{
        marginTop: 14, padding: 12,
        background: `${theme.green}15`, color: theme.green,
        borderRadius: 10, textAlign: "center",
        fontSize: 13, fontWeight: 700, fontFamily: "Cairo",
        border: `1px solid ${theme.green}40`,
      }}>
        تم إرسال إجابتك · بانتظار باقي اللاعبين
      </div>
    )}

    {showPowerupsModal && (
      <PowerupsModal
        arenaCode={arenaCode} playerId={playerId}
        playerData={myPlayer} arenaData={arenaData}
        onClose={() => setShowPowerupsModal(false)}
      />
    )}

    {activeEffect && (
      <PowerupEffect effect={activeEffect} onComplete={() => setActiveEffect(null)} />
    )}
  </div>
  <ArenaPlayerStyles />
</div>
```

);
}

function getStreakBg(streak) {
if (streak >= 9) return `linear-gradient(135deg, ${theme.accentAlt}, ${theme.red})`;
if (streak >= 6) return `linear-gradient(135deg, ${theme.yellow}, ${theme.yellowAlt})`;
if (streak >= 3) return theme.green;
return theme.accent;
}

// ═══════════════════════════════════════════════════════════════════
// HostGameView (للمنشئ بعد بدء اللعبة)
// ═══════════════════════════════════════════════════════════════════

export function HostGameView({ arenaCode, playerId, arenaData }) {
const navigate = useNavigate();

if (arenaData?.status === “finished”) {
return (
<FinishedScreen
arenaData={arenaData} playerId={playerId}
onExit={async () => {
if (!confirm(“هل تريد إنهاء الجلسة وحذفها؟”)) return;
try { await remove(ref(db, `arenas/${arenaCode}`)); }
catch (err) { console.error(“Cleanup failed:”, err); }
navigate(”/”);
}}
/>
);
}

return <PlayingScreen arenaCode={arenaCode} playerId={playerId} arenaData={arenaData} />;
}

// ═══════════════════════════════════════════════════════════════════
// شاشة النهاية
// ═══════════════════════════════════════════════════════════════════

function FinishedScreen({ arenaData, playerId, onExit }) {
const playersList = arenaData?.players
? Object.entries(arenaData.players)
.map(([id, p]) => ({ id, …p }))
.sort((a, b) => (b.score || 0) - (a.score || 0))
: [];
const myRank = playersList.findIndex((p) => p.id === playerId) + 1;
const winner = playersList[0];
const isWinner = winner?.id === playerId;
const [showCelebration, setShowCelebration] = useState(true);

useEffect(() => {
const timer = setTimeout(() => setShowCelebration(false), 4000);
return () => clearTimeout(timer);
}, []);

if (showCelebration && winner) {
return <WinnerCelebration winner={winner} isMe={isWinner} />;
}

return (
<div style={styles.screen}>
<div style={{ …styles.card, maxWidth: 640 }}>
<div style={{ textAlign: “center”, padding: “20px 0 28px” }}>
<div style={{ fontSize: 72, marginBottom: 12 }}>{isWinner ? “👑” : “🎯”}</div>
<h1 style={{
fontSize: 28, fontWeight: 800,
color: isWinner ? theme.yellow : theme.text,
margin: “0 0 8px”, fontFamily: “Cairo”,
}}>
{isWinner ? “أنت البطل!” : “انتهت المعركة”}
</h1>
<p style={{ fontSize: 14, color: theme.textMuted, margin: 0, fontFamily: “Tajawal” }}>
{isWinner ? `فزت بـ ${winner.score} نقطة` : `ترتيبك: #${myRank}`}
</p>
</div>

```
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
      {playersList.map((p, idx) => (
        <div key={p.id} style={{
          ...styles.playerItem,
          padding: "14px 18px",
          ...(idx === 0 ? { borderColor: theme.yellow, background: `${theme.yellow}15`, boxShadow: theme.arenaGlow } : {}),
          ...(idx === 1 ? { borderColor: "#9ca3af" } : {}),
          ...(idx === 2 ? { borderColor: "#d97706" } : {}),
          ...(p.id === playerId ? { boxShadow: `0 0 0 3px ${theme.yellow}40` } : {}),
        }}>
          <span style={{ fontSize: 24, minWidth: 40, textAlign: "center" }}>
            {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`}
          </span>
          <span style={{
            flex: 1, fontSize: 15, fontWeight: 700, fontFamily: "Cairo",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            {p.name}
            {p.id === playerId && <span style={styles.selfBadge}>أنت</span>}
          </span>
          <span style={{ fontSize: 18, fontWeight: 800, color: theme.yellow, fontFamily: "Cairo" }}>
            {p.score || 0}
          </span>
        </div>
      ))}
    </div>

    <button onClick={onExit} style={{ ...styles.btnGold, width: "100%", padding: 16, fontSize: 16 }}>
      الرجوع للرئيسية
    </button>
  </div>
  <ArenaPlayerStyles />
</div>
```

);
}

// ═══════════════════════════════════════════════════════════════════
// مكونات صغيرة
// ═══════════════════════════════════════════════════════════════════

function Section({ label, children }) {
return (
<div style={{ marginBottom: 16 }}>
{label && (
<label style={{ display: “block”, fontSize: 13, fontWeight: 700, color: theme.text, marginBottom: 8, fontFamily: “Cairo” }}>
{label}
</label>
)}
{children}
</div>
);
}

function InfoRow({ icon, label, value }) {
return (
<div style={{ display: “flex”, alignItems: “center”, gap: 12 }}>
<span style={{
width: 32, height: 32, background: theme.bgCard, borderRadius: “50%”,
display: “flex”, alignItems: “center”, justifyContent: “center”,
fontSize: 16, flexShrink: 0,
border: `1px solid ${theme.border}`,
}}>
{icon}
</span>
<div style={{ flex: 1 }}>
<div style={{ fontSize: 11, color: theme.textMuted, fontWeight: 600, textTransform: “uppercase”, letterSpacing: 0.5, fontFamily: “Tajawal” }}>{label}</div>
<div style={{ fontSize: 14, fontWeight: 700, color: theme.text, fontFamily: “Cairo” }}>{value}</div>
</div>
</div>
);
}

// ─── الستايلات المشتركة ────────────────────────────────────────────

const styles = {
screen: {
minHeight: “100vh”,
background: theme.bg,
color: theme.text,
padding: “24px 16px”,
display: “flex”,
alignItems: “flex-start”,
justifyContent: “center”,
fontFamily: “Tajawal, system-ui, sans-serif”,
direction: “rtl”,
},
card: {
background: theme.bgCard,
borderRadius: 18,
border: `1px solid ${theme.border}`,
boxShadow: `0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(251, 191, 36, 0.1)`,
padding: “24px 20px”,
width: “100%”,
},
titleGold: {
fontSize: 26,
fontWeight: 900,
background: `linear-gradient(135deg, ${theme.yellow}, ${theme.yellowAlt})`,
WebkitBackgroundClip: “text”,
WebkitTextFillColor: “transparent”,
backgroundClip: “text”,
margin: 0,
fontFamily: “Cairo”,
},
titleSm: {
fontSize: 20,
fontWeight: 800,
color: theme.yellow,
margin: 0,
display: “flex”,
alignItems: “center”,
fontFamily: “Cairo”,
},
subtitle: {
fontSize: 14,
color: theme.textMuted,
margin: 0,
fontFamily: “Tajawal”,
},
header: {
display: “flex”,
justifyContent: “space-between”,
alignItems: “center”,
marginBottom: 18,
paddingBottom: 14,
borderBottom: `1px solid ${theme.border}`,
},
input: {
width: “100%”,
padding: “14px 16px”,
fontSize: 15,
border: `1px solid ${theme.border}`,
borderRadius: 12,
background: theme.bgInput,
color: theme.text,
fontFamily: “Tajawal”,
boxSizing: “border-box”,
outline: “none”,
},
myCard: {
display: “flex”,
alignItems: “center”,
gap: 14,
padding: 14,
background: `linear-gradient(135deg, ${theme.yellow}, ${theme.yellowAlt})`,
color: “#0a0a0f”,
borderRadius: 12,
marginBottom: 18,
boxShadow: `0 0 30px rgba(251,191,36,0.3)`,
},
myAvatar: {
width: 44,
height: 44,
background: “rgba(0,0,0,0.2)”,
color: “#0a0a0f”,
borderRadius: “50%”,
display: “flex”,
alignItems: “center”,
justifyContent: “center”,
fontWeight: 800,
fontSize: 20,
fontFamily: “Cairo”,
},
playerItem: {
display: “flex”,
alignItems: “center”,
gap: 10,
padding: “10px 14px”,
background: theme.bgInput,
border: `1px solid ${theme.border}`,
borderRadius: 12,
},
playerAvatar: {
width: 32,
height: 32,
borderRadius: “50%”,
background: theme.yellow,
color: “#0a0a0f”,
display: “flex”,
alignItems: “center”,
justifyContent: “center”,
fontWeight: 800,
fontSize: 14,
flexShrink: 0,
fontFamily: “Cairo”,
overflow: “hidden”,
},
hostBadge: {
fontSize: 9,
fontWeight: 800,
background: theme.yellow,
color: “#0a0a0f”,
padding: “2px 6px”,
borderRadius: 999,
fontFamily: “Cairo”,
},
selfBadge: {
fontSize: 9,
fontWeight: 800,
background: theme.accent,
color: “#0a0a0f”,
padding: “2px 6px”,
borderRadius: 999,
fontFamily: “Cairo”,
},
infoPreview: {
background: theme.bgInput,
borderRadius: 12,
padding: 14,
marginBottom: 14,
display: “flex”,
flexDirection: “column”,
gap: 10,
border: `1px solid ${theme.border}`,
},
errorBanner: {
padding: “10px 14px”,
background: `${theme.red}20`,
color: theme.red,
borderRadius: 10,
fontSize: 13,
fontWeight: 600,
fontFamily: “Tajawal”,
border: `1px solid ${theme.red}40`,
marginBottom: 14,
},
btnGold: {
padding: “14px 24px”,
border: “none”,
borderRadius: 12,
background: `linear-gradient(135deg, ${theme.yellow}, ${theme.yellowAlt})`,
color: “#0a0a0f”,
fontSize: 15,
fontWeight: 800,
cursor: “pointer”,
fontFamily: “Cairo”,
display: “flex”,
alignItems: “center”,
justifyContent: “center”,
gap: 8,
boxShadow: theme.arenaGlow,
},
btnGhost: {
padding: “14px 18px”,
border: `1px solid ${theme.border}`,
borderRadius: 12,
background: “transparent”,
color: theme.textMuted,
fontSize: 14,
fontWeight: 700,
cursor: “pointer”,
fontFamily: “Cairo”,
},
dot: {
width: 12,
height: 12,
background: theme.yellow,
borderRadius: “50%”,
animation: “bounce 1.4s infinite ease-in-out”,
display: “inline-block”,
},
};

function ArenaPlayerStyles() {
return (
<style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-3px); } 75% { transform: translateX(3px); } } @keyframes bounce { 0%, 80%, 100% { transform: scale(0.7); opacity: 0.5; } 40% { transform: scale(1); opacity: 1; } } @keyframes fire { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.08); } } input:focus { border-color: ${theme.yellow} !important; box-shadow: 0 0 0 3px ${theme.yellow}22 !important; } button:hover:not(:disabled) { transform: translateY(-1px); }`}</style>
);
}