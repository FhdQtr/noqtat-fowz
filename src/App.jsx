import { useState, useEffect, useCallback, useRef } from "react";
import {
  createRoom, joinRoom, listenToRoom, updateRoom, startRoomGame,
  submitAnswer, updateScore, nextQuestion as fbNextQuestion, endGame,
  forfeitGame, deleteRoom,
  joinMatchmaking, listenToMatchmaking, removeFromMatchmaking,
  db, ref, onValue, update, set, get,
} from "./firebase.js";

const FONTS_LINK = "https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Tajawal:wght@400;500;700;800;900&display=swap";

// ─── Data (Fallback questions when API unavailable) ─────────────────────────

const FALLBACK_QUIZ = [
  { q: "ما هي عاصمة قطر؟", options: ["الدوحة", "المنامة", "مسقط", "الرياض"], answer: 0, cat: "جغرافيا" },
  { q: "كم عدد أركان الإسلام؟", options: ["4", "5", "6", "7"], answer: 1, cat: "دين" },
  { q: "من هو مخترع الهاتف؟", options: ["أديسون", "نيوتن", "بيل", "تسلا"], answer: 2, cat: "علوم" },
  { q: "ما هي أكبر قارة في العالم؟", options: ["أفريقيا", "آسيا", "أوروبا", "أمريكا"], answer: 1, cat: "جغرافيا" },
  { q: "كم عدد ألوان قوس قزح؟", options: ["5", "6", "7", "8"], answer: 2, cat: "علوم" },
  { q: "ما هو أطول نهر في العالم؟", options: ["النيل", "الأمازون", "دجلة", "الفرات"], answer: 0, cat: "جغرافيا" },
  { q: "من كتب المعلقات السبع؟", options: ["شعراء الجاهلية", "المتنبي", "أحمد شوقي", "نزار قباني"], answer: 0, cat: "أدب" },
  { q: "ما هي الدولة صاحبة أكبر عدد سكان؟", options: ["الصين", "الهند", "أمريكا", "إندونيسيا"], answer: 1, cat: "جغرافيا" },
  { q: "كم عدد حروف اللغة العربية؟", options: ["26", "28", "30", "32"], answer: 1, cat: "لغة" },
  { q: "ما هي عملة اليابان؟", options: ["اليوان", "الين", "الوون", "الروبية"], answer: 1, cat: "اقتصاد" },
  { q: "من هو أول رائد فضاء؟", options: ["أرمسترونغ", "غاغارين", "ألدرين", "شيبرد"], answer: 1, cat: "علوم" },
  { q: "ما هو العنصر الكيميائي رمزه O؟", options: ["ذهب", "أكسجين", "حديد", "نيتروجين"], answer: 1, cat: "علوم" },
  { q: "كم عدد سور القرآن الكريم؟", options: ["112", "113", "114", "115"], answer: 2, cat: "دين" },
  { q: "ما هي أصغر دولة في العالم؟", options: ["موناكو", "الفاتيكان", "سان مارينو", "مالطا"], answer: 1, cat: "جغرافيا" },
  { q: "من هو خاتم الأنبياء والمرسلين؟", options: ["إبراهيم", "موسى", "عيسى", "محمد ﷺ"], answer: 3, cat: "دين" },
  { q: "كم عدد أحرف كلمة بسم الله الرحمن الرحيم بدون تكرار؟", options: ["8", "9", "10", "11"], answer: 2, cat: "لغة" },
  { q: "ما هو أسرع حيوان بري؟", options: ["الأسد", "الفهد", "الحصان", "الغزال"], answer: 1, cat: "علوم" },
  { q: "في أي سنة هجرية كانت غزوة بدر؟", options: ["1", "2", "3", "4"], answer: 1, cat: "دين" },
];

const FALLBACK_MATH = [
  { q: "15 × 7 = ؟", answer: "105" },
  { q: "144 ÷ 12 = ؟", answer: "12" },
  { q: "23 + 89 = ؟", answer: "112" },
  { q: "256 ÷ 16 = ؟", answer: "16" },
  { q: "17 × 13 = ؟", answer: "221" },
  { q: "1000 - 387 = ؟", answer: "613" },
  { q: "45 × 8 = ؟", answer: "360" },
  { q: "√144 = ؟", answer: "12" },
  { q: "25² = ؟", answer: "625" },
  { q: "99 + 88 + 77 = ؟", answer: "264" },
  { q: "33 × 3 = ؟", answer: "99" },
  { q: "1024 ÷ 32 = ؟", answer: "32" },
  { q: "56 + 78 = ؟", answer: "134" },
  { q: "19 × 11 = ؟", answer: "209" },
];

const FALLBACK_WORDS = [
  { letters: ["ق", "ط", "ر"], answer: "قطر", hint: "دولة خليجية" },
  { letters: ["ش", "م", "س"], answer: "شمس", hint: "نجم يضيء النهار" },
  { letters: ["ب", "ح", "ر"], answer: "بحر", hint: "مسطح مائي كبير" },
  { letters: ["ك", "ت", "ا", "ب"], answer: "كتاب", hint: "نقرأ فيه" },
  { letters: ["و", "ر", "د"], answer: "ورد", hint: "زهرة جميلة" },
  { letters: ["ن", "ج", "م"], answer: "نجم", hint: "يلمع في السماء ليلاً" },
  { letters: ["ق", "م", "ر"], answer: "قمر", hint: "ينير الليل" },
  { letters: ["س", "ح", "ا", "ب"], answer: "سحاب", hint: "في السماء قبل المطر" },
  { letters: ["ع", "ل", "م"], answer: "علم", hint: "رمز الدولة" },
  { letters: ["م", "س", "ج", "د"], answer: "مسجد", hint: "بيت الله" },
  { letters: ["ج", "ب", "ل"], answer: "جبل", hint: "مرتفع من الأرض" },
  { letters: ["ص", "ق", "ر"], answer: "صقر", hint: "طائر جارح" },
];

const FALLBACK_RIDDLES = [
  { q: "شي كلما أخذت منه كبر؟", options: ["الحفرة", "الماء", "النار", "الهواء"], answer: 0 },
  { q: "ما هو الشيء الذي يمشي بلا أرجل؟", options: ["الساعة", "السمك", "الماء", "الهواء"], answer: 0 },
  { q: "له رأس وليس له عيون؟", options: ["الدبوس", "القلم", "المسمار", "الإبرة"], answer: 2 },
  { q: "يسمع بلا أذن ويتكلم بلا لسان؟", options: ["الكتاب", "الهاتف", "الراديو", "التلفزيون"], answer: 1 },
  { q: "كلما زاد نقص؟", options: ["العمر", "الماء", "المال", "الوقت"], answer: 0 },
  { q: "ما هو البيت الذي ليس فيه أبواب ولا نوافذ؟", options: ["بيت الشعر", "بيت النمل", "بيت العنكبوت", "بيت الحكمة"], answer: 0 },
  { q: "أنا ابن الماء وإذا تركوني في الماء أموت؟", options: ["الثلج", "الملح", "السكر", "الجليد"], answer: 0 },
  { q: "شيء موجود في الليل 3 مرات وفي النهار مرة؟", options: ["حرف اللام", "القمر", "النجوم", "الظلام"], answer: 0 },
  { q: "ما الشيء الذي كلما لمسته صاح؟", options: ["الجرس", "الطفل", "القطة", "الباب"], answer: 0 },
  { q: "شيء يوجد في وسط مكة؟", options: ["حرف الكاف", "الكعبة", "الحجر", "زمزم"], answer: 0 },
];

// ─── AI Question Generator ──────────────────────────────────────────────────

const AI_SYSTEM_PROMPT = `أنت مولد أسئلة لمسابقة ثقافية عربية. قواعد صارمة:

1. الأسئلة الدينية حصرياً من الشريعة الإسلامية (قرآن، سنة، سيرة نبوية، فقه إسلامي)
2. ممنوع منعاً باتاً: أي محتوى جنسي أو إيحائي، أي محتوى سياسي، أي ذكر لإسرائيل (استخدم فلسطين فقط)، أي محتوى عنصري أو طائفي أو مذهبي
3. التصنيفات المسموحة: ثقافة عامة، علوم، جغرافيا، تاريخ إسلامي، قرآن وسنة، رياضيات، لغة عربية، رياضة، تقنية، طبيعة
4. الأسئلة تكون متنوعة وغير مكررة
5. مستوى الصعوبة متوسط (مناسب للجميع)
6. الإجابات تكون واضحة وصحيحة 100%

أجب فقط بـ JSON بدون أي نص إضافي أو backticks.`;

async function generateAIQuestions(modes, count = 10) {
  const modeDescriptions = {
    quiz: `${Math.ceil(count * 0.3)} أسئلة اختيار من متعدد (4 خيارات) متنوعة التصنيفات`,
    speed: `${Math.ceil(count * 0.25)} أسئلة حسابية رياضية (جمع، طرح، ضرب، قسمة، جذور، أُسُس) الجواب يكون رقم فقط`,
    riddles: `${Math.ceil(count * 0.25)} ألغاز ذكاء مع 4 خيارات`,
    words: `${Math.ceil(count * 0.2)} كلمات عربية (3 إلى 5 حروف) مع تلميح، الحروف تكون مبعثرة`,
  };

  const requestedModes = modes.map((m) => modeDescriptions[m]).filter(Boolean).join("\n");

  const prompt = `أنشئ ${count} أسئلة مسابقة منوعة كالتالي:
${requestedModes}

أرجع JSON بهذا الشكل بالضبط (بدون backticks أو نص إضافي):
{
  "questions": [
    {"type": "mcq", "mode": "quiz", "q": "نص السؤال", "options": ["خيار1", "خيار2", "خيار3", "خيار4"], "answer": 0},
    {"type": "input", "mode": "speed", "q": "25 × 4 = ؟", "answer": "100"},
    {"type": "mcq", "mode": "riddles", "q": "نص اللغز", "options": ["خيار1", "خيار2", "خيار3", "خيار4"], "answer": 0},
    {"type": "word", "mode": "words", "q": "رتب الحروف", "letters": ["ح","ر","ب"], "answer": "بحر", "hint": "مسطح مائي"}
  ]
}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        system: AI_SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) throw new Error("API error");

    const data = await response.json();
    const text = data.content
      .map((item) => (item.type === "text" ? item.text : ""))
      .filter(Boolean)
      .join("");

    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    if (parsed.questions && parsed.questions.length > 0) {
      return parsed.questions;
    }
    throw new Error("No questions");
  } catch (err) {
    console.error("AI question generation failed:", err);
    return null; // Will use fallback
  }
}

function getFallbackQuestions(modes, count = 10) {
  let questions = [];
  const perMode = Math.max(2, Math.ceil(count / modes.length));

  modes.forEach((gm) => {
    switch (gm) {
      case "quiz":
        questions.push(...shuffle(FALLBACK_QUIZ).slice(0, perMode).map((q) => ({ ...q, type: "mcq", mode: "quiz" })));
        break;
      case "speed":
        questions.push(...shuffle(FALLBACK_MATH).slice(0, perMode).map((q) => ({ ...q, type: "input", mode: "speed" })));
        break;
      case "riddles":
        questions.push(...shuffle(FALLBACK_RIDDLES).slice(0, perMode).map((q) => ({ ...q, type: "mcq", mode: "riddles" })));
        break;
      case "words":
        questions.push(...shuffle(FALLBACK_WORDS).slice(0, perMode).map((q) => ({ ...q, type: "word", mode: "words" })));
        break;
    }
  });
  return shuffle(questions).slice(0, count);
}

const GAME_MODES = [
  { id: "quiz", name: "كويز ثقافي", icon: "🧠", desc: "أسئلة ثقافية متنوعة", color: "#00d4ff" },
  { id: "speed", name: "تحدي السرعة", icon: "⚡", desc: "من يجاوب أسرع يفوز", color: "#ff6b35" },
  { id: "riddles", name: "ألغاز ذكاء", icon: "🔮", desc: "حل الألغاز والأحاجي", color: "#a855f7" },
  { id: "words", name: "ألعاب كلمات", icon: "✏️", desc: "رتب الحروف وكوّن كلمات", color: "#22c55e" },
];

const SCORE_MODES = [
  { id: "points", name: "أكثر نقاط", icon: "🏆", desc: "اللي يجمع أكثر نقاط يفوز" },
  { id: "speed", name: "أسرع إجابة", icon: "⏱️", desc: "كل سؤال من يجاوب أسرع ياخذ النقطة" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ─── Styles ─────────────────────────────────────────────────────────────────

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
  yellow: "#fbbf24",
  text: "#e4e4e7",
  textMuted: "#71717a",
  border: "#27273a",
  glow: "0 0 30px rgba(0, 212, 255, 0.15)",
  glowStrong: "0 0 60px rgba(0, 212, 255, 0.25)",
};

// ─── Components ─────────────────────────────────────────────────────────────

function Particles() {
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0 }}>
      {Array.from({ length: 25 }).map((_, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            width: Math.random() * 3 + 1,
            height: Math.random() * 3 + 1,
            background: i % 3 === 0 ? theme.accent : i % 3 === 1 ? theme.purple : theme.accentAlt,
            borderRadius: "50%",
            top: `${Math.random() * 100}%`,
            left: `${Math.random() * 100}%`,
            opacity: Math.random() * 0.4 + 0.1,
            animation: `particleFloat ${8 + Math.random() * 12}s ease-in-out infinite`,
            animationDelay: `${Math.random() * 5}s`,
          }}
        />
      ))}
    </div>
  );
}

function Logo({ size = "large" }) {
  const s = size === "large" ? 48 : 28;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size === "large" ? 14 : 8, justifyContent: "center" }}>
      <div
        style={{
          fontSize: s,
          fontWeight: 900,
          fontFamily: "Cairo, sans-serif",
          background: `linear-gradient(135deg, ${theme.accent}, ${theme.purple}, ${theme.accentAlt})`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          letterSpacing: "-1px",
          lineHeight: 1.1,
        }}
      >
        نقطة
      </div>
      <div
        style={{
          width: size === "large" ? 4 : 3,
          height: size === "large" ? 40 : 24,
          background: `linear-gradient(180deg, ${theme.accent}, ${theme.accentAlt})`,
          borderRadius: 2,
        }}
      />
      <div
        style={{
          fontSize: s,
          fontWeight: 900,
          fontFamily: "Cairo, sans-serif",
          background: `linear-gradient(135deg, ${theme.accentAlt}, ${theme.yellow})`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          letterSpacing: "-1px",
          lineHeight: 1.1,
        }}
      >
        فوز
      </div>
    </div>
  );
}

function NavHeader({ onBack, onHome, backLabel }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 30 }}>
      <Button variant="ghost" onClick={onBack}>
        {backLabel || "→ رجوع"}
      </Button>
      <Logo size="small" />
      {onHome && (
        <Button variant="ghost" onClick={onHome} color={theme.yellow} style={{ fontSize: 13 }}>
          🏠 من جديد
        </Button>
      )}
    </div>
  );
}

function Signature() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: "12px 0",
        opacity: 0.45,
        transition: "opacity 0.4s ease",
        cursor: "default",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.45")}
    >
      <span style={{ fontSize: 11, color: theme.textMuted, fontFamily: "Tajawal", fontWeight: 400, letterSpacing: "0.5px" }}>
        صنع بواسطة
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 13, color: "#e4e4e7", fontFamily: "Cairo", fontWeight: 700 }}>
          فهد القحطاني
        </span>
        <div
          style={{
            width: 2.5,
            height: 16,
            background: "#9b2335",
            borderRadius: 2,
          }}
        />
        <span style={{ fontSize: 11, color: theme.textMuted, fontFamily: "system-ui, sans-serif", fontWeight: 500, letterSpacing: "0.3px" }}>
          Fhd.AlQahtani
        </span>
      </div>
    </div>
  );
}

function Button({ children, onClick, variant = "primary", color, disabled, style: extraStyle, fullWidth }) {
  const [hovered, setHovered] = useState(false);
  const c = color || theme.accent;
  const base = {
    padding: "14px 32px",
    borderRadius: 14,
    border: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "Cairo, sans-serif",
    fontWeight: 700,
    fontSize: 16,
    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    width: fullWidth ? "100%" : "auto",
    opacity: disabled ? 0.4 : 1,
    position: "relative",
    overflow: "hidden",
  };

  const variants = {
    primary: {
      background: hovered ? c : `${c}dd`,
      color: "#0a0a0f",
      boxShadow: hovered ? `0 0 30px ${c}66` : `0 0 15px ${c}33`,
      transform: hovered ? "translateY(-2px) scale(1.02)" : "none",
    },
    outline: {
      background: hovered ? `${c}15` : "transparent",
      color: c,
      border: `2px solid ${hovered ? c : `${c}66`}`,
      boxShadow: hovered ? `0 0 20px ${c}22` : "none",
    },
    ghost: {
      background: hovered ? `${c}12` : "transparent",
      color: c,
    },
  };

  return (
    <button
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ ...base, ...variants[variant], ...extraStyle }}
    >
      {children}
    </button>
  );
}

function Card({ children, onClick, style: extraStyle, glow, hoverEffect = true }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered && hoverEffect ? theme.bgHover : theme.bgCard,
        border: `1px solid ${hovered && hoverEffect ? `${theme.accent}44` : theme.border}`,
        borderRadius: 20,
        padding: 24,
        cursor: onClick ? "pointer" : "default",
        transition: "all 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
        boxShadow: glow && hovered ? theme.glowStrong : glow ? theme.glow : "none",
        transform: hovered && hoverEffect && onClick ? "translateY(-4px) scale(1.01)" : "none",
        ...extraStyle,
      }}
    >
      {children}
    </div>
  );
}

function Timer({ seconds, total, color }) {
  const pct = (seconds / total) * 100;
  const isLow = seconds <= 5;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div
        style={{
          fontSize: 32,
          fontWeight: 900,
          fontFamily: "Cairo, sans-serif",
          color: isLow ? theme.red : color || theme.accent,
          animation: isLow ? "pulse 0.5s ease-in-out infinite" : "none",
          minWidth: 50,
          textAlign: "center",
        }}
      >
        {seconds}
      </div>
      <div
        style={{
          flex: 1,
          height: 8,
          background: `${theme.border}`,
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: isLow
              ? `linear-gradient(90deg, ${theme.red}, ${theme.yellow})`
              : `linear-gradient(90deg, ${color || theme.accent}, ${theme.purple})`,
            borderRadius: 4,
            transition: "width 1s linear",
          }}
        />
      </div>
    </div>
  );
}

function ScoreBoard({ players, teams, mode }) {
  if (teams) {
    return (
      <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
        {teams.map((team, i) => (
          <div
            key={i}
            style={{
              background: `linear-gradient(135deg, ${team.color}15, ${team.color}08)`,
              border: `2px solid ${team.color}44`,
              borderRadius: 16,
              padding: "16px 28px",
              textAlign: "center",
              minWidth: 140,
            }}
          >
            <div style={{ fontSize: 14, color: team.color, fontWeight: 700, marginBottom: 4, fontFamily: "Cairo" }}>
              {team.name}
            </div>
            <div style={{ fontSize: 36, fontWeight: 900, color: theme.text, fontFamily: "Cairo" }}>
              {team.score}
            </div>
            <div style={{ fontSize: 12, color: theme.textMuted, fontFamily: "Tajawal" }}>
              {team.players.join(" & ")}
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
      {players.map((p, i) => (
        <div
          key={i}
          style={{
            background: `linear-gradient(135deg, ${p.color}15, ${p.color}08)`,
            border: `2px solid ${p.color}44`,
            borderRadius: 16,
            padding: "16px 28px",
            textAlign: "center",
            minWidth: 120,
          }}
        >
          <div style={{ fontSize: 14, color: p.color, fontWeight: 700, marginBottom: 4, fontFamily: "Cairo" }}>
            {p.name}
          </div>
          <div style={{ fontSize: 36, fontWeight: 900, color: theme.text, fontFamily: "Cairo" }}>{p.score}</div>
        </div>
      ))}
    </div>
  );
}

function PlayerAvatar({ name, color, size = 48 }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `linear-gradient(135deg, ${color}, ${color}88)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.4,
        fontWeight: 800,
        color: "#0a0a0f",
        fontFamily: "Cairo",
        border: `3px solid ${color}66`,
        boxShadow: `0 0 15px ${color}33`,
      }}
    >
      {name.charAt(0)}
    </div>
  );
}

// ─── Main App ───────────────────────────────────────────────────────────────

export default function ArenaApp() {
  const [screen, setScreen] = useState("home");
  const [playerName, setPlayerName] = useState("");
  const [matchType, setMatchType] = useState(null); // "1v1" | "2v2"
  const [joinType, setJoinType] = useState(null); // "friend" | "random"
  const [gameMode, setGameMode] = useState([]); // array of selected mode ids
  const [scoreMode, setScoreMode] = useState("points");
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [gameState, setGameState] = useState(null);
  const [nameError, setNameError] = useState("");
  const [teamSetup, setTeamSetup] = useState(null); // { team1: [...], team2: [...] }
  const [aiDifficulty, setAiDifficulty] = useState(null); // "easy" | "medium" | "hard"

  const [isLoading, setIsLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");

  // ─── Online State ───
  const [myPlayerId, setMyPlayerId] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [roomData, setRoomData] = useState(null);
  const [onlineError, setOnlineError] = useState("");
  const [isOnlineGame, setIsOnlineGame] = useState(false);
  const roomListenerRef = useRef(null);
  const matchmakingListenerRef = useRef(null);
  const matchmakingPlayerIdRef = useRef(null);

  // Cleanup listeners
  const cleanupListeners = useCallback(() => {
    if (roomListenerRef.current) { roomListenerRef.current(); roomListenerRef.current = null; }
    if (matchmakingListenerRef.current) { matchmakingListenerRef.current(); matchmakingListenerRef.current = null; }
    if (matchmakingPlayerIdRef.current) {
      removeFromMatchmaking(matchType || "1v1", matchmakingPlayerIdRef.current).catch(() => {});
      matchmakingPlayerIdRef.current = null;
    }
  }, [matchType]);

  const goHome = useCallback(() => {
    cleanupListeners();
    setGameMode([]);
    setGameState(null);
    setTeamSetup(null);
    setAiDifficulty(null);
    setIsLoading(false);
    setMyPlayerId(null);
    setIsHost(false);
    setRoomData(null);
    setOnlineError("");
    setIsOnlineGame(false);
    setRoomCode("");
    setJoinCode("");
    setScreen("home");
  }, [cleanupListeners]);

  // Cleanup on unmount
  useEffect(() => { return () => cleanupListeners(); }, [cleanupListeners]);

  // ─── Online Room Functions ───

  // Create a room on Firebase
  const handleCreateRoom = useCallback(async () => {
    try {
      setOnlineError("");
      const code = generateRoomCode();
      setRoomCode(code);
      const pid = await createRoom(code, playerName, matchType);
      setMyPlayerId(pid);
      setIsHost(true);
      setIsOnlineGame(true);

      // Listen to room changes
      const unsub = listenToRoom(code, (data) => {
        setRoomData(data);
      });
      roomListenerRef.current = unsub;
      setScreen("room");
    } catch (err) {
      setOnlineError("خطأ في إنشاء الغرفة: " + err.message);
    }
  }, [playerName, matchType]);

  // Join a room by code
  const handleJoinRoom = useCallback(async (code) => {
    try {
      setOnlineError("");
      const pid = await joinRoom(code, playerName);
      setMyPlayerId(pid);
      setIsHost(false);
      setIsOnlineGame(true);
      setRoomCode(code);

      const unsub = listenToRoom(code, (data) => {
        setRoomData(data);
      });
      roomListenerRef.current = unsub;
      setScreen("room");
    } catch (err) {
      setOnlineError(err.message || "خطأ في الدخول");
    }
  }, [playerName]);

  // Start matchmaking (random online)
  const handleStartMatchmaking = useCallback(async () => {
    try {
      setOnlineError("");
      setScreen("matchmaking");
      setIsOnlineGame(true);

      const pid = await joinMatchmaking(playerName, matchType);
      matchmakingPlayerIdRef.current = pid;

      const unsub = listenToMatchmaking(matchType, async (queueData) => {
        if (!queueData) return;
        const entries = Object.entries(queueData);

        // Need 2 players for 1v1, 4 for 2v2
        const needed = matchType === "2v2" ? 4 : 2;
        if (entries.length >= needed) {
          // Sort by timestamp to determine host (earliest = host)
          entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
          const isFirstPlayer = entries[0][0] === pid;

          if (isFirstPlayer) {
            // I'm the host, create room
            const code = generateRoomCode();
            const hostPid = await createRoom(code, playerName, matchType);
            setMyPlayerId(hostPid);
            setIsHost(true);
            setRoomCode(code);

            // Wait a beat then join the other players
            for (let i = 1; i < needed; i++) {
              const otherName = entries[i][1].name;
              await joinRoom(code, otherName);
            }

            // Clean up all players from matchmaking queue
            for (const [epid] of entries.slice(0, needed)) {
              await removeFromMatchmaking(matchType, epid);
            }

            // Stop listening to matchmaking
            if (matchmakingListenerRef.current) { matchmakingListenerRef.current(); matchmakingListenerRef.current = null; }
            matchmakingPlayerIdRef.current = null;

            // Start listening to the room
            const roomUnsub = listenToRoom(code, (data) => { setRoomData(data); });
            roomListenerRef.current = roomUnsub;
            setScreen("room");
          } else {
            // I'm not host, wait for the host to create a room
            // The host will handle everything, I just need to find the room
            // Poll for a room that has my name
            const checkRoom = setInterval(async () => {
              // Look for any room with my name in it
              try {
                const { get: fbGet, ref: fbRef } = await import("firebase/database");
                const { getDatabase } = await import("firebase/database");
                const database = getDatabase();
                const roomsSnap = await fbGet(fbRef(database, "rooms"));
                if (roomsSnap.exists()) {
                  const rooms = roomsSnap.val();
                  for (const [rCode, rData] of Object.entries(rooms)) {
                    if (rData.status === "waiting" && rData.players) {
                      const playerNames = Object.values(rData.players).map(p => p.name);
                      if (playerNames.includes(playerName)) {
                        clearInterval(checkRoom);
                        // Found my room
                        const myPid = Object.entries(rData.players).find(([_, p]) => p.name === playerName)?.[0];
                        setMyPlayerId(myPid);
                        setIsHost(false);
                        setRoomCode(rCode);

                        if (matchmakingListenerRef.current) { matchmakingListenerRef.current(); matchmakingListenerRef.current = null; }
                        matchmakingPlayerIdRef.current = null;

                        const roomUnsub = listenToRoom(rCode, (data) => { setRoomData(data); });
                        roomListenerRef.current = roomUnsub;
                        setScreen("room");
                        return;
                      }
                    }
                  }
                }
              } catch (e) { /* keep polling */ }
            }, 1500);

            // Cleanup interval after 60 seconds
            setTimeout(() => clearInterval(checkRoom), 60000);
          }
        }
      });
      matchmakingListenerRef.current = unsub;
    } catch (err) {
      setOnlineError("خطأ في البحث: " + err.message);
    }
  }, [playerName, matchType]);

  // Host starts the online game
  const handleStartOnlineGame = useCallback(async (modes, sMode) => {
    if (!isHost || !roomCode) return;
    try {
      setScreen("loading");
      const loadingMessages = ["🧠 نجهز لك أسئلة جديدة...", "⚡ نخلط التحديات...", "🔮 نحضر الألغاز..."];
      let msgIdx = 0;
      setLoadingMsg(loadingMessages[0]);
      const msgInterval = setInterval(() => { msgIdx = (msgIdx + 1) % loadingMessages.length; setLoadingMsg(loadingMessages[msgIdx]); }, 1500);

      let questions = await generateAIQuestions(modes, 10);
      if (!questions) questions = getFallbackQuestions(modes, 10);
      clearInterval(msgInterval);

      await startRoomGame(roomCode, questions, modes, sMode, null);
      // The listenToRoom callback will handle transitioning to game screen
    } catch (err) {
      setOnlineError("خطأ في بدء اللعبة: " + err.message);
      setScreen("room");
    }
  }, [isHost, roomCode]);

  // Listen for room status changes (transition to game)
  useEffect(() => {
    if (!isOnlineGame || !roomData) return;

    if (roomData.status === "playing" && screen !== "game" && screen !== "loading") {
      // Game started by host, transition to game screen
      const playerEntries = roomData.players ? Object.entries(roomData.players) : [];
      const playerColors = [theme.accent, theme.accentAlt, theme.purple, theme.green];
      const players = playerEntries.map(([pid, pData], i) => ({
        id: pid,
        name: pData.name,
        score: pData.score || 0,
        color: playerColors[i % playerColors.length],
        isHuman: pid === myPlayerId,
        answered: false,
        correct: false,
        time: 0,
      }));

      setGameState({
        questions: roomData.questions || [],
        type: "mixed",
        currentQ: roomData.currentQ || 0,
        players,
        teams: roomData.teams || null,
        timer: roomData.timer || 15,
        totalTime: 15,
        phase: roomData.phase || "question",
        selectedAnswer: null,
        inputAnswer: "",
        scoreMode: roomData.scoreMode || "points",
        fastestPlayer: null,
        showHint: false,
        gameMode: roomData.gameMode || ["quiz"],
        aiDifficulty: null,
        isOnline: true,
        roomCode: roomCode,
        myPlayerId: myPlayerId,
        isHost: isHost,
      });
      setScreen("game");
    }

    // Sync game state from Firebase for non-host
    if (roomData.status === "playing" && screen === "game" && !isHost) {
      setGameState(prev => {
        if (!prev) return prev;
        const newQ = roomData.currentQ ?? prev.currentQ;
        const newPhase = roomData.phase ?? prev.phase;
        // Only update if question changed
        if (newQ !== prev.currentQ || (newPhase === "question" && prev.phase !== "question")) {
          return {
            ...prev,
            currentQ: newQ,
            phase: newPhase,
            timer: roomData.timer || 15,
            selectedAnswer: null,
            inputAnswer: "",
            showHint: false,
            players: prev.players.map(p => ({ ...p, answered: false, correct: false, time: 0 })),
          };
        }
        return prev;
      });
    }

    if (roomData.status === "finished") {
      setGameState(prev => prev ? { ...prev, phase: "final" } : prev);
    }
  }, [roomData, isOnlineGame, screen, myPlayerId, isHost, roomCode]);

  // Submit answer to Firebase
  const handleOnlineAnswer = useCallback(async (questionIndex, answer, isCorrect, timeLeft) => {
    if (!isOnlineGame || !roomCode || !myPlayerId) return;
    try {
      await submitAnswer(roomCode, myPlayerId, questionIndex, answer, isCorrect, timeLeft);
      const currentScore = gameState?.players?.find(p => p.id === myPlayerId)?.score || 0;
      const points = isCorrect ? (gameState?.scoreMode === "speed" ? Math.max(10, timeLeft * 10) : 10) : 0;
      await updateScore(roomCode, myPlayerId, currentScore + points);
    } catch (err) {
      console.error("Error submitting answer:", err);
    }
  }, [isOnlineGame, roomCode, myPlayerId, gameState]);

  // Host advances to next question
  const handleOnlineNextQuestion = useCallback(async (nextQ) => {
    if (!isHost || !roomCode) return;
    try {
      if (nextQ >= (gameState?.questions?.length || 10)) {
        await endGame(roomCode);
      } else {
        await fbNextQuestion(roomCode, nextQ);
      }
    } catch (err) {
      console.error("Error advancing question:", err);
    }
  }, [isHost, roomCode, gameState]);
  const simulatedNames = ["خالد", "سارة", "محمد", "نورة", "أحمد", "فاطمة", "عبدالله", "مريم"];

  const startGame = useCallback(
    async (modes, sMode, difficulty) => {
      const selectedModes = Array.isArray(modes) ? modes : (modes ? [modes] : gameMode);
      const sm = sMode || scoreMode;
      const diff = difficulty || aiDifficulty;

      // Show loading screen
      setIsLoading(true);
      setScreen("loading");

      const loadingMessages = diff
        ? ["🤖 الذكاء الاصطناعي يستعد...", "⚡ نجهز التحدي...", "🧠 نحضر الأسئلة...", "✨ جاري التحضير..."]
        : ["🧠 نجهز لك أسئلة جديدة...", "⚡ نخلط التحديات...", "🔮 نحضر الألغاز...", "✨ جاري التحضير..."];
      let msgIdx = 0;
      setLoadingMsg(loadingMessages[0]);
      const msgInterval = setInterval(() => {
        msgIdx = (msgIdx + 1) % loadingMessages.length;
        setLoadingMsg(loadingMessages[msgIdx]);
      }, 1500);

      // Try AI generation first, fallback to static
      let questions = await generateAIQuestions(selectedModes, 10);
      if (!questions) {
        questions = getFallbackQuestions(selectedModes, 10);
      }

      clearInterval(msgInterval);

      const playerColors = [theme.accent, theme.accentAlt, theme.purple, theme.green];
      const pName = playerName || "أنت";

      const aiNames = { easy: "🤖 بوت سهل", medium: "🤖 بوت متوسط", hard: "🤖 بوت صعب" };

      let players, teams;
      if (matchType === "2v2") {
        const otherNames = shuffle(simulatedNames).slice(0, 3);
        const t1 = teamSetup ? teamSetup.team1 : [pName, otherNames[0]];
        const t2 = teamSetup ? teamSetup.team2 : [otherNames[1], otherNames[2]];
        const allNames = [...t1, ...t2];
        players = allNames.map((name, i) => ({
          name, score: 0, color: playerColors[i], isHuman: name === pName,
          answered: false, correct: false, time: 0,
        }));
        teams = [
          { name: "فريق 1", players: [...t1], score: 0, color: theme.accent },
          { name: "فريق 2", players: [...t2], score: 0, color: theme.accentAlt },
        ];
      } else {
        const oppName = diff ? aiNames[diff] : shuffle(simulatedNames)[0];
        players = [
          { name: pName, score: 0, color: playerColors[0], isHuman: true, answered: false, correct: false, time: 0 },
          { name: oppName, score: 0, color: playerColors[1], isHuman: false, answered: false, correct: false, time: 0 },
        ];
        teams = null;
      }

      setGameState({
        questions,
        type: "mixed",
        currentQ: 0,
        players,
        teams,
        timer: 15,
        totalTime: 15,
        phase: "question",
        selectedAnswer: null,
        inputAnswer: "",
        scoreMode: sm,
        fastestPlayer: null,
        showHint: false,
        gameMode: selectedModes,
        aiDifficulty: diff || null,
      });
      setIsLoading(false);
      setScreen("game");
    },
    [gameMode, scoreMode, matchType, playerName, teamSetup, aiDifficulty]
  );

  return (
    <div
      dir="rtl"
      style={{
        minHeight: "100vh",
        background: theme.bg,
        color: theme.text,
        fontFamily: "Cairo, Tajawal, sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <link href={FONTS_LINK} rel="stylesheet" />
      <style>{`
        @keyframes particleFloat {
          0%, 100% { transform: translateY(0) translateX(0); opacity: 0.2; }
          25% { transform: translateY(-30px) translateX(15px); opacity: 0.5; }
          50% { transform: translateY(-15px) translateX(-10px); opacity: 0.3; }
          75% { transform: translateY(-40px) translateX(20px); opacity: 0.4; }
        }
        @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
        @keyframes glow { 0%, 100% { box-shadow: 0 0 20px rgba(0,212,255,0.2); } 50% { box-shadow: 0 0 40px rgba(0,212,255,0.4); } }
        @keyframes shake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
        @keyframes confetti { 0% { transform: translateY(0) rotate(0deg); opacity: 1; } 100% { transform: translateY(-200px) rotate(720deg); opacity: 0; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input:focus { outline: none; }
        ::selection { background: ${theme.accent}44; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: ${theme.bg}; }
        ::-webkit-scrollbar-thumb { background: ${theme.border}; border-radius: 3px; }
      `}</style>

      <Particles />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 700, margin: "0 auto", padding: "20px 16px", minHeight: "100vh" }}>
        {screen === "home" && (
          <HomeScreen
            playerName={playerName}
            setPlayerName={setPlayerName}
            nameError={nameError}
            setNameError={setNameError}
            onNext={(type) => {
              if (!playerName.trim()) {
                setNameError("اكتب اسمك أول!");
                return;
              }
              setNameError("");
              setMatchType(type);
              setScreen("joinType");
            }}
          />
        )}

        {screen === "joinType" && (
          <JoinTypeScreen
            matchType={matchType}
            onBack={() => setScreen("home")}
            onHome={goHome}
            onSelect={(type) => {
              setJoinType(type);
              if (type === "friend") {
                // Go to room screen without auto-creating - let user choose create or join
                setIsOnlineGame(true);
                setScreen("room");
              } else if (type === "online") {
                handleStartMatchmaking();
              } else if (type === "ai") {
                setScreen("aiDifficulty");
              }
            }}
          />
        )}

        {screen === "room" && (
          <RoomScreen
            roomCode={roomCode}
            joinCode={joinCode}
            setJoinCode={setJoinCode}
            matchType={matchType}
            playerName={playerName}
            isHost={isHost}
            roomData={roomData}
            onlineError={onlineError}
            onJoinRoom={handleJoinRoom}
            onCreateRoom={handleCreateRoom}
            onBack={() => { cleanupListeners(); setScreen("joinType"); }}
            onHome={goHome}
            onStart={() => {
              if (isOnlineGame) {
                setScreen("selectMode");
              } else if (matchType === "2v2") {
                setScreen("teamPicker");
              } else {
                setScreen("selectMode");
              }
            }}
          />
        )}

        {screen === "teamPicker" && (
          <TeamPickerScreen
            playerName={playerName}
            simulatedNames={simulatedNames}
            teamSetup={teamSetup}
            setTeamSetup={setTeamSetup}
            onBack={() => setScreen("room")}
            onHome={goHome}
            onNext={() => setScreen("selectMode")}
          />
        )}

        {screen === "aiDifficulty" && (
          <AIDifficultyScreen
            matchType={matchType}
            onBack={() => setScreen("joinType")}
            onHome={goHome}
            onSelect={(difficulty) => {
              setAiDifficulty(difficulty);
              const allModes = GAME_MODES.map((m) => m.id);
              startGame(allModes, "points", difficulty);
            }}
          />
        )}

        {screen === "matchmaking" && (
          <MatchmakingScreen
            matchType={matchType}
            playerName={playerName}
            onBack={() => { cleanupListeners(); setScreen("joinType"); }}
            onHome={goHome}
            onPlayAI={() => { cleanupListeners(); setScreen("aiDifficulty"); }}
          />
        )}

        {screen === "selectMode" && (
          <SelectModeScreen
            gameMode={gameMode}
            setGameMode={setGameMode}
            scoreMode={scoreMode}
            setScoreMode={setScoreMode}
            onBack={() => setScreen(isOnlineGame ? "room" : "joinType")}
            onHome={goHome}
            onStart={(modes, sMode) => {
              if (isOnlineGame && isHost) {
                handleStartOnlineGame(
                  Array.isArray(modes) ? modes : gameMode,
                  sMode || scoreMode
                );
              } else {
                startGame(modes, sMode);
              }
            }}
          />
        )}

        {screen === "loading" && (
          <div style={{ animation: "fadeIn 0.5s ease-out", paddingTop: 80, textAlign: "center" }}>
            <div
              style={{
                width: 100,
                height: 100,
                margin: "0 auto 30px",
                borderRadius: "50%",
                border: `3px solid ${theme.accent}33`,
                borderTopColor: theme.accent,
                animation: "spin 1s linear infinite",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 40,
              }}
            >
              🧠
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 800, fontFamily: "Cairo", marginBottom: 12, color: theme.text }}>
              {loadingMsg}
            </h2>
            <p style={{ color: theme.textMuted, fontFamily: "Tajawal", fontSize: 14 }}>
              الذكاء الاصطناعي يحضر لك أسئلة جديدة
            </p>
            <div style={{ marginTop: 30 }}>
              <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: theme.accent,
                      animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                    }}
                  />
                ))}
              </div>
            </div>
            <div style={{ marginTop: 40 }}>
              <Button variant="ghost" onClick={goHome} color={theme.textMuted}>
                إلغاء
              </Button>
            </div>
          </div>
        )}

        {screen === "game" && gameState && (
          <GameScreen
            gameState={gameState}
            setGameState={setGameState}
            matchType={matchType}
            onHome={goHome}
            onReplay={() => startGame(gameState?.gameMode, gameState?.scoreMode)}
            onOnlineAnswer={handleOnlineAnswer}
            onOnlineNextQuestion={handleOnlineNextQuestion}
            isOnlineGame={isOnlineGame}
            isHost={isHost}
          />
        )}
      </div>
    </div>
  );
}

// ─── Screens ────────────────────────────────────────────────────────────────

function HomeScreen({ playerName, setPlayerName, nameError, setNameError, onNext }) {
  return (
    <div style={{ animation: "fadeIn 0.6s ease-out", paddingTop: 60 }}>
      <div style={{ textAlign: "center", marginBottom: 50 }}>
        <div style={{ fontSize: 64, marginBottom: 8 }}>⚔️</div>
        <Logo size="large" />
        <p style={{ color: theme.textMuted, fontSize: 16, marginTop: 12, fontFamily: "Tajawal", fontWeight: 500 }}>
          جاهز تتحدّى ربعك؟
        </p>
      </div>

      <Card glow style={{ marginBottom: 32 }}>
        <label style={{ display: "block", fontSize: 14, color: theme.accent, fontWeight: 700, marginBottom: 10, fontFamily: "Cairo" }}>
          اسمك في الساحة
        </label>
        <input
          type="text"
          value={playerName}
          onChange={(e) => {
            setPlayerName(e.target.value);
            if (nameError) setNameError("");
          }}
          placeholder="اكتب اسمك هنا..."
          style={{
            width: "100%",
            padding: "16px 20px",
            background: theme.bgInput,
            border: `2px solid ${nameError ? theme.red : theme.border}`,
            borderRadius: 12,
            color: theme.text,
            fontSize: 18,
            fontFamily: "Cairo",
            fontWeight: 600,
            direction: "rtl",
            transition: "border-color 0.3s",
          }}
          onFocus={(e) => (e.target.style.borderColor = theme.accent)}
          onBlur={(e) => (e.target.style.borderColor = nameError ? theme.red : theme.border)}
        />
        {nameError && (
          <p style={{ color: theme.red, fontSize: 13, marginTop: 8, fontFamily: "Tajawal", animation: "shake 0.3s" }}>
            {nameError}
          </p>
        )}
      </Card>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Button onClick={() => onNext("1v1")} fullWidth color={theme.accent}>
          <span style={{ fontSize: 22, marginLeft: 8 }}>⚔️</span> 1 ضد 1
        </Button>
        <Button onClick={() => onNext("2v2")} fullWidth color={theme.purple}>
          <span style={{ fontSize: 22, marginLeft: 8 }}>👥</span> 2 ضد 2
        </Button>
      </div>

      <div
        style={{
          textAlign: "center",
          marginTop: 40,
          padding: "16px 0 8px",
          borderTop: `1px solid ${theme.border}`,
          color: theme.textMuted,
          fontSize: 12,
          fontFamily: "Tajawal",
        }}
      >
        كويز • سرعة • ألغاز • كلمات
      </div>
      <Signature />
    </div>
  );
}

function JoinTypeScreen({ matchType, onBack, onHome, onSelect }) {
  return (
    <div style={{ animation: "fadeIn 0.6s ease-out", paddingTop: 40 }}>
      <NavHeader onBack={onBack} onHome={onHome} />

      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>{matchType === "1v1" ? "⚔️" : "👥"}</div>
        <h2 style={{ fontSize: 26, fontWeight: 800, fontFamily: "Cairo", color: theme.text }}>
          {matchType === "1v1" ? "مباراة 1 ضد 1" : "مباراة 2 ضد 2"}
        </h2>
        <p style={{ color: theme.textMuted, fontFamily: "Tajawal", marginTop: 8 }}>كيف تبي تلعب؟</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Card onClick={() => onSelect("friend")} glow>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ fontSize: 40 }}>🤝</div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "Cairo", color: theme.accent }}>العب مع صديقك</div>
              <div style={{ color: theme.textMuted, fontSize: 14, fontFamily: "Tajawal", marginTop: 4 }}>
                أنشئ غرفة وشارك الكود مع صديقك
              </div>
            </div>
          </div>
        </Card>

        <Card onClick={() => onSelect("online")} glow>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ fontSize: 40 }}>🌐</div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "Cairo", color: theme.green }}>العب أونلاين</div>
              <div style={{ color: theme.textMuted, fontSize: 14, fontFamily: "Tajawal", marginTop: 4 }}>
                ابحث عن لاعب حقيقي متصل الحين
              </div>
            </div>
          </div>
        </Card>

        <Card onClick={() => onSelect("ai")} glow>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ fontSize: 40 }}>🤖</div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "Cairo", color: theme.purple }}>تحدى الذكاء الاصطناعي</div>
              <div style={{ color: theme.textMuted, fontSize: 14, fontFamily: "Tajawal", marginTop: 4 }}>
                اختر المستوى وتحدى الـ AI
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function RoomScreen({ roomCode, joinCode, setJoinCode, matchType, playerName, isHost, roomData, onlineError, onJoinRoom, onCreateRoom, onBack, onHome, onStart }) {
  const [tab, setTab] = useState("choose"); // "choose" | "create" | "join"
  const [copied, setCopied] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [joining, setJoining] = useState(false);
  const [creating, setCreating] = useState(false);

  const needed = matchType === "2v2" ? 4 : 2;
  const playersJoined = roomData?.players ? Object.keys(roomData.players).length : 0;
  const playerList = roomData?.players ? Object.values(roomData.players) : [];

  // Once we have roomData (created or joined), show waiting room
  const inRoom = !!(roomData && (isHost || playersJoined > 0));

  const handleCreate = async () => {
    setCreating(true);
    try {
      await onCreateRoom();
      setTab("create");
    } catch (err) {
      setJoinError(err.message || "خطأ في إنشاء الغرفة");
    }
    setCreating(false);
  };

  const handleJoin = async () => {
    if (joinCode.length < 5) return;
    setJoining(true);
    setJoinError("");
    try {
      await onJoinRoom(joinCode);
    } catch (err) {
      setJoinError(err.message || "خطأ في الدخول");
    }
    setJoining(false);
  };

  // ── Choose screen: Create or Join ──
  if (!inRoom && tab === "choose") {
    return (
      <div style={{ animation: "fadeIn 0.6s ease-out", paddingTop: 40 }}>
        <NavHeader onBack={onBack} onHome={onHome} />

        {onlineError && (
          <div style={{ background: `${theme.red}15`, border: `1px solid ${theme.red}33`, borderRadius: 12, padding: 14, marginBottom: 20, textAlign: "center" }}>
            <p style={{ color: theme.red, fontFamily: "Tajawal", fontSize: 14 }}>{onlineError}</p>
          </div>
        )}

        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🤝</div>
          <h2 style={{ fontSize: 24, fontWeight: 800, fontFamily: "Cairo", color: theme.text }}>العب مع صديقك</h2>
          <p style={{ color: theme.textMuted, fontFamily: "Tajawal", marginTop: 8, fontSize: 14 }}>أنشئ غرفة جديدة أو ادخل غرفة صديقك</p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Card onClick={handleCreate} glow>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ fontSize: 40 }}>🏠</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "Cairo", color: theme.accent }}>أنشئ غرفة</div>
                <div style={{ color: theme.textMuted, fontSize: 14, fontFamily: "Tajawal", marginTop: 4 }}>
                  سوّ غرفة وشارك الكود مع صديقك
                </div>
              </div>
              {creating ? (
                <div style={{ width: 24, height: 24, border: `3px solid ${theme.accent}33`, borderTopColor: theme.accent, borderRadius: "50%", animation: "spin 1s linear infinite" }} />
              ) : (
                <div style={{ fontSize: 20, color: theme.textMuted }}>←</div>
              )}
            </div>
          </Card>

          <Card onClick={() => setTab("join")} glow>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ fontSize: 40 }}>🔑</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "Cairo", color: theme.green }}>ادخل غرفة</div>
                <div style={{ color: theme.textMuted, fontSize: 14, fontFamily: "Tajawal", marginTop: 4 }}>
                  عندك كود من صديقك؟ ادخله هنا
                </div>
              </div>
              <div style={{ fontSize: 20, color: theme.textMuted }}>←</div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // ── Join screen: Enter code ──
  if (!inRoom && tab === "join") {
    return (
      <div style={{ animation: "fadeIn 0.6s ease-out", paddingTop: 40 }}>
        <NavHeader onBack={() => setTab("choose")} onHome={onHome} />

        {onlineError && (
          <div style={{ background: `${theme.red}15`, border: `1px solid ${theme.red}33`, borderRadius: 12, padding: 14, marginBottom: 20, textAlign: "center" }}>
            <p style={{ color: theme.red, fontFamily: "Tajawal", fontSize: 14 }}>{onlineError}</p>
          </div>
        )}

        <Card glow>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔑</div>
            <p style={{ fontSize: 16, fontWeight: 700, color: theme.text, fontFamily: "Cairo", marginBottom: 6 }}>
              ادخل كود الغرفة
            </p>
            <p style={{ fontSize: 13, color: theme.textMuted, fontFamily: "Tajawal", marginBottom: 20 }}>
              اطلب الكود من صديقك وادخله هنا
            </p>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); setJoinError(""); }}
              placeholder="XXXXX"
              maxLength={5}
              style={{
                width: "100%", padding: "20px", background: theme.bgInput,
                border: `2px solid ${joinError ? theme.red : theme.border}`,
                borderRadius: 14, color: theme.accent, fontSize: 36, fontFamily: "Cairo",
                fontWeight: 900, textAlign: "center", letterSpacing: 12, marginBottom: 10,
              }}
              onFocus={(e) => (e.target.style.borderColor = theme.accent)}
              onBlur={(e) => (e.target.style.borderColor = joinError ? theme.red : theme.border)}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            />
            {joinError && (
              <p style={{ color: theme.red, fontSize: 13, marginBottom: 10, fontFamily: "Tajawal", animation: "shake 0.3s" }}>{joinError}</p>
            )}
            <Button
              onClick={handleJoin}
              fullWidth
              disabled={joinCode.length < 5 || joining}
              color={theme.green}
            >
              {joining ? "⏳ جاري الدخول..." : "🎮 ادخل الغرفة"}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // ── Waiting Room: Show code + players ──
  return (
    <div style={{ animation: "fadeIn 0.6s ease-out", paddingTop: 40 }}>
      <NavHeader onBack={onBack} onHome={onHome} />

      {onlineError && (
        <div style={{ background: `${theme.red}15`, border: `1px solid ${theme.red}33`, borderRadius: 12, padding: 14, marginBottom: 20, textAlign: "center" }}>
          <p style={{ color: theme.red, fontFamily: "Tajawal", fontSize: 14 }}>{onlineError}</p>
        </div>
      )}

      <Card glow>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 14, color: theme.textMuted, fontFamily: "Tajawal", marginBottom: 16 }}>
            {isHost ? "شارك هالكود مع صديقك" : "أنت في الغرفة"}
          </p>
          <div
            style={{
              fontSize: 42, fontWeight: 900, letterSpacing: 12, color: theme.accent, fontFamily: "Cairo",
              padding: "20px", background: `${theme.accent}08`, borderRadius: 16,
              border: `2px dashed ${theme.accent}33`, marginBottom: 16, animation: "glow 3s ease-in-out infinite",
            }}
          >
            {roomCode}
          </div>
          <Button variant="outline" onClick={() => { navigator.clipboard?.writeText(roomCode); setCopied(true); setTimeout(() => setCopied(false), 2000); }} fullWidth>
            {copied ? "✅ تم النسخ!" : "📋 نسخ الكود"}
          </Button>

          <div style={{ marginTop: 30, padding: "16px", background: theme.bgInput, borderRadius: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ color: theme.textMuted, fontFamily: "Tajawal", fontSize: 14 }}>اللاعبين</span>
              <span style={{ color: theme.accent, fontFamily: "Cairo", fontWeight: 700 }}>{playersJoined} / {needed}</span>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              {Array.from({ length: needed }).map((_, i) => {
                const player = playerList[i];
                return (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{
                      width: 50, height: 50, borderRadius: "50%",
                      background: player ? `${theme.accent}22` : theme.bgCard,
                      border: `2px solid ${player ? theme.accent : theme.border}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 22, transition: "all 0.5s",
                      animation: player ? "scaleIn 0.4s ease-out" : "none",
                    }}>
                      {player ? (i === 0 ? "👑" : "🎮") : "❓"}
                    </div>
                    <span style={{ fontSize: 12, color: player ? theme.text : theme.textMuted, fontFamily: "Cairo", fontWeight: 600 }}>
                      {player ? player.name : "ننتظر..."}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {isHost ? (
            <Button
              onClick={onStart}
              fullWidth
              disabled={playersJoined < needed}
              style={{ marginTop: 20 }}
              color={playersJoined >= needed ? theme.green : theme.accent}
            >
              {playersJoined >= needed ? "🚀 ابدأ المباراة!" : `⏳ ننتظر ${needed - playersJoined} لاعبين...`}
            </Button>
          ) : (
            <div style={{ marginTop: 20, padding: 14, background: `${theme.green}10`, borderRadius: 12, border: `1px solid ${theme.green}33` }}>
              <p style={{ color: theme.green, fontFamily: "Cairo", fontSize: 15, fontWeight: 700 }}>
                ✅ أنت داخل الغرفة! ننتظر صاحب الغرفة يبدأ...
              </p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function TeamPickerScreen({ playerName, simulatedNames, teamSetup, setTeamSetup, onBack, onHome, onNext }) {
  const otherPlayers = useRef(shuffle(simulatedNames).slice(0, 3)).current;
  const allPlayers = [playerName, ...otherPlayers];
  
  const [team1, setTeam1] = useState(teamSetup?.team1 || [playerName]);
  const [team2, setTeam2] = useState(teamSetup?.team2 || []);
  
  const unassigned = allPlayers.filter((p) => !team1.includes(p) && !team2.includes(p));
  
  const playerEmojis = { 0: "😎", 1: "🎮", 2: "🕹️", 3: "👾" };
  
  const moveToTeam = (name, targetTeam) => {
    // Remove from current location
    setTeam1((prev) => prev.filter((p) => p !== name));
    setTeam2((prev) => prev.filter((p) => p !== name));
    
    if (targetTeam === 1) {
      setTeam1((prev) => prev.length < 2 ? [...prev, name] : prev);
    } else {
      setTeam2((prev) => prev.length < 2 ? [...prev, name] : prev);
    }
  };
  
  const removeFromTeam = (name) => {
    if (name === playerName) return; // Can't remove yourself
    setTeam1((prev) => prev.filter((p) => p !== name));
    setTeam2((prev) => prev.filter((p) => p !== name));
  };
  
  const autoFill = () => {
    const shuffled = shuffle(allPlayers);
    setTeam1(shuffled.slice(0, 2));
    setTeam2(shuffled.slice(2, 4));
  };
  
  const isReady = team1.length === 2 && team2.length === 2;
  
  const handleNext = () => {
    setTeamSetup({ team1: [...team1], team2: [...team2] });
    onNext();
  };

  const renderPlayerChip = (name, canRemove, teamColor) => {
    const idx = allPlayers.indexOf(name);
    const isYou = name === playerName;
    return (
      <div
        key={name}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 14px",
          background: `${teamColor}12`,
          border: `1.5px solid ${teamColor}44`,
          borderRadius: 12,
          animation: "scaleIn 0.3s ease-out",
        }}
      >
        <span style={{ fontSize: 20 }}>{playerEmojis[idx] || "🎮"}</span>
        <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "Cairo", color: theme.text }}>
          {name} {isYou ? "(أنت)" : ""}
        </span>
        {canRemove && !isYou && (
          <button
            onClick={() => removeFromTeam(name)}
            style={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              border: "none",
              background: `${theme.red}33`,
              color: theme.red,
              fontSize: 12,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginRight: -4,
            }}
          >
            ✕
          </button>
        )}
      </div>
    );
  };

  const renderDropZone = (teamPlayers, teamNum, teamColor, teamName) => (
    <div
      style={{
        flex: 1,
        background: `${teamColor}06`,
        border: `2px solid ${teamColor}33`,
        borderRadius: 16,
        padding: 16,
        minHeight: 140,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 16, fontWeight: 800, fontFamily: "Cairo", color: teamColor }}>
          {teamName}
        </span>
        <span style={{ fontSize: 12, color: theme.textMuted, fontFamily: "Cairo", fontWeight: 600 }}>
          {teamPlayers.length} / 2
        </span>
      </div>
      
      <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 80 }}>
        {teamPlayers.map((name) => renderPlayerChip(name, true, teamColor))}
        {teamPlayers.length < 2 && (
          <div
            style={{
              padding: "12px",
              border: `2px dashed ${teamColor}22`,
              borderRadius: 10,
              textAlign: "center",
              color: theme.textMuted,
              fontSize: 13,
              fontFamily: "Tajawal",
            }}
          >
            اختر لاعب
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ animation: "fadeIn 0.6s ease-out", paddingTop: 40 }}>
      <NavHeader onBack={onBack} onHome={onHome} />

      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>👥</div>
        <h2 style={{ fontSize: 24, fontWeight: 800, fontFamily: "Cairo" }}>وزّع الفرق</h2>
        <p style={{ color: theme.textMuted, fontFamily: "Tajawal", fontSize: 14, marginTop: 6 }}>
          اختر من معاك ومن ضدك
        </p>
      </div>

      {/* Unassigned Players */}
      {unassigned.length > 0 && (
        <Card hoverEffect={false} style={{ marginBottom: 16, padding: 16 }}>
          <div style={{ fontSize: 13, color: theme.textMuted, fontFamily: "Cairo", fontWeight: 600, marginBottom: 10 }}>
            لاعبين بدون فريق ({unassigned.length})
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {unassigned.map((name) => {
              const idx = allPlayers.indexOf(name);
              return (
                <div
                  key={name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 10px",
                    background: theme.bgInput,
                    border: `1.5px solid ${theme.border}`,
                    borderRadius: 10,
                  }}
                >
                  <span style={{ fontSize: 18 }}>{playerEmojis[idx] || "🎮"}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, fontFamily: "Cairo", color: theme.text }}>
                    {name}
                  </span>
                  <div style={{ display: "flex", gap: 4, marginRight: 4 }}>
                    <button
                      onClick={() => moveToTeam(name, 1)}
                      disabled={team1.length >= 2}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 6,
                        border: "none",
                        background: team1.length >= 2 ? theme.bgCard : `${theme.accent}22`,
                        color: team1.length >= 2 ? theme.textMuted : theme.accent,
                        fontSize: 11,
                        fontWeight: 900,
                        cursor: team1.length >= 2 ? "not-allowed" : "pointer",
                        fontFamily: "Cairo",
                      }}
                    >
                      ف1
                    </button>
                    <button
                      onClick={() => moveToTeam(name, 2)}
                      disabled={team2.length >= 2}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 6,
                        border: "none",
                        background: team2.length >= 2 ? theme.bgCard : `${theme.accentAlt}22`,
                        color: team2.length >= 2 ? theme.textMuted : theme.accentAlt,
                        fontSize: 11,
                        fontWeight: 900,
                        cursor: team2.length >= 2 ? "not-allowed" : "pointer",
                        fontFamily: "Cairo",
                      }}
                    >
                      ف2
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Teams */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        {renderDropZone(team1, 1, theme.accent, "⚡ فريق 1")}
        {renderDropZone(team2, 2, theme.accentAlt, "🔥 فريق 2")}
      </div>

      {/* Auto Fill */}
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <Button variant="ghost" onClick={autoFill} color={theme.purple}>
          🎲 توزيع عشوائي
        </Button>
      </div>

      <Button
        onClick={handleNext}
        fullWidth
        disabled={!isReady}
        color={theme.green}
        style={{ fontSize: 18 }}
      >
        {isReady ? "✅ التالي: اختر نوع التحدي" : `⏳ وزّع كل اللاعبين (${team1.length + team2.length}/4)`}
      </Button>
    </div>
  );
}

function MatchmakingScreen({ matchType, playerName, onBack, onHome, onPlayAI }) {
  const [dots, setDots] = useState(1);
  const [waitTime, setWaitTime] = useState(0);

  useEffect(() => {
    const i = setInterval(() => setDots((d) => (d % 3) + 1), 500);
    const w = setInterval(() => setWaitTime((t) => t + 1), 1000);
    return () => {
      clearInterval(i);
      clearInterval(w);
    };
  }, []);

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}:${sec.toString().padStart(2, "0")}` : `${sec} ثانية`;
  };

  return (
    <div style={{ animation: "fadeIn 0.6s ease-out", paddingTop: 40, textAlign: "center" }}>
      <NavHeader onBack={onBack} onHome={onHome} backLabel="→ إلغاء" />

      <div
        style={{
          width: 120,
          height: 120,
          margin: "0 auto 30px",
          borderRadius: "50%",
          border: `3px solid ${theme.accent}33`,
          borderTopColor: theme.accent,
          animation: "spin 1s linear infinite",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 48,
        }}
      >
        🔍
      </div>

      <h2 style={{ fontSize: 24, fontWeight: 800, fontFamily: "Cairo", marginBottom: 12 }}>
        {`نبحث لك عن منافس${".".repeat(dots)}`}
      </h2>
      <p style={{ color: theme.textMuted, fontFamily: "Tajawal", fontSize: 15, marginBottom: 8 }}>
        {matchType === "2v2" ? "نبحث عن 3 لاعبين حقيقيين..." : "نبحث عن لاعب حقيقي متصل..."}
      </p>
      <p style={{ color: theme.accent, fontFamily: "Cairo", fontSize: 14, fontWeight: 600 }}>
        ⏱️ {formatTime(waitTime)}
      </p>

      {waitTime >= 10 && (
        <div style={{ marginTop: 30, animation: "fadeIn 0.5s ease-out" }}>
          <Card hoverEffect={false} style={{ background: `${theme.purple}08`, borderColor: `${theme.purple}33`, padding: 20 }}>
            <p style={{ color: theme.textMuted, fontFamily: "Tajawal", fontSize: 14, marginBottom: 14 }}>
              ما لقينا أحد لحد الحين. تقدر تكمل الانتظار أو تلعب ضد الذكاء الاصطناعي
            </p>
            <Button onClick={onPlayAI} color={theme.purple} fullWidth>
              🤖 العب ضد الذكاء الاصطناعي
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
}

function AIDifficultyScreen({ matchType, onBack, onHome, onSelect }) {
  const difficulties = [
    {
      id: "easy",
      name: "سهل",
      icon: "😊",
      desc: "البوت بطيء ويغلط كثير",
      color: theme.green,
      detail: "مناسب للمبتدئين",
    },
    {
      id: "medium",
      name: "متوسط",
      icon: "🧐",
      desc: "البوت معتدل السرعة والدقة",
      color: theme.yellow,
      detail: "تحدي متوازن",
    },
    {
      id: "hard",
      name: "صعب",
      icon: "🤯",
      desc: "البوت سريع ويجاوب صح غالباً",
      color: theme.red,
      detail: "للمحترفين فقط!",
    },
  ];

  return (
    <div style={{ animation: "fadeIn 0.6s ease-out", paddingTop: 40 }}>
      <NavHeader onBack={onBack} onHome={onHome} />

      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>🤖</div>
        <h2 style={{ fontSize: 26, fontWeight: 800, fontFamily: "Cairo" }}>تحدى الذكاء الاصطناعي</h2>
        <p style={{ color: theme.textMuted, fontFamily: "Tajawal", fontSize: 14, marginTop: 8 }}>
          اختر مستوى الصعوبة
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {difficulties.map((d) => (
          <Card key={d.id} onClick={() => onSelect(d.id)} glow>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 16,
                  background: `${d.color}15`,
                  border: `2px solid ${d.color}33`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 32,
                }}
              >
                {d.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "Cairo", color: d.color }}>{d.name}</div>
                <div style={{ color: theme.textMuted, fontSize: 13, fontFamily: "Tajawal", marginTop: 2 }}>{d.desc}</div>
                <div style={{ color: `${d.color}88`, fontSize: 12, fontFamily: "Tajawal", marginTop: 2 }}>{d.detail}</div>
              </div>
              <div style={{ fontSize: 20, color: theme.textMuted }}>←</div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function SelectModeScreen({ gameMode, setGameMode, scoreMode, setScoreMode, onBack, onHome, onStart }) {
  const allSelected = gameMode.length === GAME_MODES.length;

  const toggleMode = (id) => {
    setGameMode((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (allSelected) {
      setGameMode([]);
    } else {
      setGameMode(GAME_MODES.map((m) => m.id));
    }
  };

  return (
    <div style={{ animation: "fadeIn 0.6s ease-out", paddingTop: 40 }}>
      <NavHeader onBack={onBack} onHome={onHome} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, fontFamily: "Cairo" }}>
          اختر نوع التحدي
        </h2>
        <button
          onClick={toggleAll}
          style={{
            padding: "8px 18px",
            borderRadius: 10,
            border: `2px solid ${allSelected ? theme.accent : theme.border}`,
            background: allSelected ? `${theme.accent}18` : "transparent",
            color: allSelected ? theme.accent : theme.textMuted,
            fontWeight: 700,
            fontSize: 13,
            fontFamily: "Cairo",
            cursor: "pointer",
            transition: "all 0.3s",
          }}
        >
          {allSelected ? "✓ الكل" : "اختر الكل"}
        </button>
      </div>

      <p style={{ fontSize: 13, color: theme.textMuted, fontFamily: "Tajawal", marginBottom: 16, textAlign: "center" }}>
        اختر قسم واحد أو أكثر، الأسئلة بتكون مخلوطة من كل اللي تختاره
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 30 }}>
        {GAME_MODES.map((mode) => {
          const isSelected = gameMode.includes(mode.id);
          return (
            <Card
              key={mode.id}
              onClick={() => toggleMode(mode.id)}
              glow={isSelected}
              style={{
                border: isSelected ? `2px solid ${mode.color}` : `1px solid ${theme.border}`,
                background: isSelected ? `${mode.color}12` : theme.bgCard,
                textAlign: "center",
                padding: 20,
                position: "relative",
              }}
            >
              {isSelected && (
                <div
                  style={{
                    position: "absolute",
                    top: 10,
                    left: 10,
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    background: mode.color,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                    color: "#0a0a0f",
                    fontWeight: 900,
                    animation: "scaleIn 0.3s ease-out",
                  }}
                >
                  ✓
                </div>
              )}
              <div style={{ fontSize: 36, marginBottom: 8 }}>{mode.icon}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: isSelected ? mode.color : theme.textMuted, fontFamily: "Cairo", transition: "color 0.3s" }}>{mode.name}</div>
              <div style={{ fontSize: 12, color: theme.textMuted, fontFamily: "Tajawal", marginTop: 4 }}>
                {mode.desc}
              </div>
            </Card>
          );
        })}
      </div>

      <h3 style={{ fontSize: 18, fontWeight: 700, fontFamily: "Cairo", marginBottom: 14, color: theme.textMuted }}>
        طريقة الفوز
      </h3>

      <div style={{ display: "flex", gap: 10, marginBottom: 30 }}>
        {SCORE_MODES.map((sm) => (
          <Card
            key={sm.id}
            onClick={() => setScoreMode(sm.id)}
            style={{
              flex: 1,
              border: scoreMode === sm.id ? `2px solid ${theme.accent}` : `1px solid ${theme.border}`,
              background: scoreMode === sm.id ? `${theme.accent}10` : theme.bgCard,
              textAlign: "center",
              padding: 16,
            }}
          >
            <div style={{ fontSize: 28 }}>{sm.icon}</div>
            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "Cairo", marginTop: 6 }}>{sm.name}</div>
          </Card>
        ))}
      </div>

      <Button
        onClick={() => onStart(gameMode, scoreMode)}
        fullWidth
        disabled={gameMode.length === 0}
        color={theme.green}
        style={{ fontSize: 18 }}
      >
        🚀 ابدأ التحدي! {gameMode.length > 0 ? `(${gameMode.length} ${gameMode.length === 1 ? "قسم" : "أقسام"})` : ""}
      </Button>
    </div>
  );
}

function GameScreen({ gameState, setGameState, matchType, onHome, onReplay, onOnlineAnswer, onOnlineNextQuestion, isOnlineGame, isHost }) {
  const timerRef = useRef(null);
  const [showQuitModal, setShowQuitModal] = useState(false);
  const { questions, currentQ, players, teams, timer, totalTime, phase, scoreMode, gameMode } = gameState;

  const question = questions[currentQ];
  const type = question?.type || "mcq";
  const currentMode = question?.mode || (Array.isArray(gameMode) ? gameMode[0] : gameMode);

  // Pause timer when quit modal is open
  useEffect(() => {
    if (showQuitModal && timerRef.current) {
      clearInterval(timerRef.current);
    }
  }, [showQuitModal]);

  // Timer
  useEffect(() => {
    if (phase !== "question") return;
    timerRef.current = setInterval(() => {
      setGameState((prev) => {
        if (!prev) return null;
        if (prev.timer <= 1) {
          clearInterval(timerRef.current);
          return handleTimeUp(prev);
        }
        return { ...prev, timer: prev.timer - 1 };
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [phase, currentQ]);

  // Bot answers (difficulty affects speed and accuracy) - ONLY for offline/AI games
  useEffect(() => {
    if (phase !== "question") return;
    if (isOnlineGame) return; // Online games have real players, no bots needed
    const bots = players.filter((p) => !p.isHuman);
    const diff = gameState.aiDifficulty;
    const timeouts = [];
    bots.forEach((bot) => {
      // AI difficulty settings
      let delay, accuracy;
      if (diff === "easy") {
        delay = 5000 + Math.random() * 7000; // Slow
        accuracy = 0.4; // 40% correct
      } else if (diff === "hard") {
        delay = 1000 + Math.random() * 3000; // Fast
        accuracy = 0.85; // 85% correct
      } else {
        delay = 2500 + Math.random() * 5000; // Medium
        accuracy = 0.6; // 60% correct
      }

      const t = setTimeout(() => {
        setGameState((prev) => {
          if (!prev || prev.phase !== "question") return prev;
          const newPlayers = [...prev.players];
          const botIdx = newPlayers.findIndex((p) => p.name === bot.name);
          if (botIdx >= 0 && !newPlayers[botIdx].answered) {
            const isCorrect = Math.random() < accuracy;
            newPlayers[botIdx] = { ...newPlayers[botIdx], answered: true, correct: isCorrect, time: Date.now() };
          }
          return { ...prev, players: newPlayers };
        });
      }, delay);
      timeouts.push(t);
    });
    return () => timeouts.forEach(clearTimeout);
  }, [phase, currentQ]);

  function handleTimeUp(state) {
    return processResults({ ...state, timer: 0 });
  }

  function handleAnswer(answerIdx) {
    if (gameState.phase !== "question" || gameState.selectedAnswer !== null) return;
    clearInterval(timerRef.current);

    let isCorrect = false;
    if (type === "mcq") {
      isCorrect = answerIdx === question.answer;
    }

    const newPlayers = [...gameState.players];
    const humanIdx = newPlayers.findIndex((p) => p.isHuman);
    newPlayers[humanIdx] = { ...newPlayers[humanIdx], answered: true, correct: isCorrect, time: Date.now() };

    // Send to Firebase if online
    if (isOnlineGame && onOnlineAnswer) {
      onOnlineAnswer(currentQ, answerIdx, isCorrect, gameState.timer);
    }

    const newState = { ...gameState, selectedAnswer: answerIdx, players: newPlayers };
    setGameState(processResults(newState));
  }

  function handleInputSubmit() {
    if (gameState.phase !== "question" || !gameState.inputAnswer.trim()) return;
    clearInterval(timerRef.current);

    let isCorrect = false;
    if (type === "input") {
      isCorrect = gameState.inputAnswer.trim() === question.answer;
    } else if (type === "word") {
      isCorrect = gameState.inputAnswer.trim() === question.answer;
    }

    const newPlayers = [...gameState.players];
    const humanIdx = newPlayers.findIndex((p) => p.isHuman);
    newPlayers[humanIdx] = { ...newPlayers[humanIdx], answered: true, correct: isCorrect, time: Date.now() };

    // Send to Firebase if online
    if (isOnlineGame && onOnlineAnswer) {
      onOnlineAnswer(currentQ, gameState.inputAnswer.trim(), isCorrect, gameState.timer);
    }

    const newState = { ...gameState, selectedAnswer: true, players: newPlayers };
    setGameState(processResults(newState));
  }

  function processResults(state) {
    const newPlayers = state.players.map((p) => {
      if (p.correct) {
        const points = scoreMode === "speed" ? Math.max(10, state.timer * 10) : 10;
        return { ...p, score: p.score + points };
      }
      return p;
    });

    let newTeams = state.teams;
    if (newTeams) {
      newTeams = newTeams.map((team, tIdx) => {
        const teamPlayerNames = team.players;
        const teamScore = newPlayers.filter((p) => teamPlayerNames.includes(p.name)).reduce((s, p) => s + p.score, 0);
        return { ...team, score: teamScore };
      });
    }

    const fastest = newPlayers.filter((p) => p.correct).sort((a, b) => (a.time || 999) - (b.time || 999))[0];

    return {
      ...state,
      players: newPlayers,
      teams: newTeams,
      phase: "result",
      fastestPlayer: fastest?.name || null,
    };
  }

  function nextQuestion() {
    const nextQ = currentQ + 1;

    // Online game: host tells Firebase to advance, non-host waits for sync
    if (isOnlineGame) {
      if (isHost && onOnlineNextQuestion) {
        onOnlineNextQuestion(nextQ);
      }
      // Non-host: the roomData listener in ArenaApp will update gameState
      return;
    }

    // Offline game: update locally
    if (nextQ >= questions.length) {
      setGameState((prev) => ({ ...prev, phase: "final" }));
      return;
    }
    setGameState((prev) => ({
      ...prev,
      currentQ: nextQ,
      timer: totalTime,
      phase: "question",
      selectedAnswer: null,
      inputAnswer: "",
      showHint: false,
      fastestPlayer: null,
      players: prev.players.map((p) => ({ ...p, answered: false, correct: false, time: 0 })),
    }));
  }

  const modeColor = GAME_MODES.find((m) => m.id === currentMode)?.color || theme.accent;

  // ── Forfeit Screen ──
  if (phase === "forfeit") {
    const humanPlayer = players.find((p) => p.isHuman);
    const opponent = players.find((p) => !p.isHuman);
    const forfeitedByHuman = gameState.forfeitedBy === "human";

    return (
      <div style={{ animation: "fadeIn 0.6s ease-out", paddingTop: 60, textAlign: "center" }}>
        <div style={{ fontSize: 80, marginBottom: 20 }}>
          {forfeitedByHuman ? "🏳️" : "🏆"}
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 900, fontFamily: "Cairo", marginBottom: 12 }}>
          {forfeitedByHuman ? "انسحبت من المباراة" : `${opponent?.name} انسحب!`}
        </h1>

        <Card
          glow
          hoverEffect={false}
          style={{
            marginBottom: 24,
            padding: 24,
            background: forfeitedByHuman ? `${theme.red}08` : `${theme.green}08`,
            borderColor: forfeitedByHuman ? `${theme.red}33` : `${theme.green}33`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20, flexWrap: "wrap" }}>
            <div style={{ textAlign: "center" }}>
              <PlayerAvatar name={forfeitedByHuman ? humanPlayer?.name : opponent?.name} color={theme.red} size={56} />
              <div style={{ fontSize: 13, color: theme.red, fontFamily: "Cairo", fontWeight: 700, marginTop: 8 }}>
                {forfeitedByHuman ? humanPlayer?.name : opponent?.name}
              </div>
              <div style={{ fontSize: 12, color: theme.textMuted, fontFamily: "Tajawal" }}>انسحب 🏳️</div>
            </div>

            <div style={{ fontSize: 28, color: theme.textMuted }}>VS</div>

            <div style={{ textAlign: "center" }}>
              <PlayerAvatar name={forfeitedByHuman ? opponent?.name : humanPlayer?.name} color={theme.green} size={56} />
              <div style={{ fontSize: 13, color: theme.green, fontFamily: "Cairo", fontWeight: 700, marginTop: 8 }}>
                {forfeitedByHuman ? opponent?.name : humanPlayer?.name}
              </div>
              <div style={{ fontSize: 12, color: theme.yellow, fontFamily: "Tajawal" }}>فاز! 🏆</div>
            </div>
          </div>

          <div
            style={{
              marginTop: 20,
              padding: "12px 20px",
              background: `${forfeitedByHuman ? theme.red : theme.green}10`,
              borderRadius: 12,
              fontSize: 15,
              fontFamily: "Cairo",
              fontWeight: 700,
              color: forfeitedByHuman ? theme.red : theme.green,
            }}
          >
            {forfeitedByHuman
              ? `${opponent?.name} فاز بسبب انسحابك`
              : "مبروك! فزت لأن الخصم انسحب من المباراة 🎉"}
          </div>
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Button onClick={onReplay} fullWidth color={theme.green}>
            🔄 العب مرة ثانية
          </Button>
          <Button variant="outline" onClick={onHome} fullWidth>
            🏠 الرئيسية
          </Button>
        </div>
        <div style={{ marginTop: 24 }}><Signature /></div>
      </div>
    );
  }

  // ── Final Screen ──
  if (phase === "final") {
    const winner = teams
      ? teams.reduce((a, b) => (a.score > b.score ? a : b))
      : players.reduce((a, b) => (a.score > b.score ? a : b));
    const isDraw = teams
      ? teams.every((t) => t.score === teams[0].score)
      : players.every((p) => p.score === players[0].score);

    return (
      <div style={{ animation: "fadeIn 0.6s ease-out", paddingTop: 40, textAlign: "center" }}>
        <div style={{ position: "relative" }}>
          {!isDraw &&
            Array.from({ length: 20 }).map((_, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  fontSize: 20,
                  left: `${10 + Math.random() * 80}%`,
                  top: `${Math.random() * 100}%`,
                  animation: `confetti ${1 + Math.random() * 2}s ease-out ${Math.random()}s infinite`,
                }}
              >
                {["🎉", "⭐", "🏆", "✨", "🎊"][i % 5]}
              </div>
            ))}

          <div style={{ fontSize: 80, marginBottom: 16, animation: "pulse 1s ease-in-out infinite" }}>
            {isDraw ? "🤝" : "🏆"}
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 900, fontFamily: "Cairo", marginBottom: 8 }}>
            {isDraw ? "تعادل!" : teams ? `${winner.name} فاز!` : `${winner.name} فاز! 🎉`}
          </h1>
          <p style={{ color: theme.textMuted, fontFamily: "Tajawal", fontSize: 16, marginBottom: 30 }}>
            {isDraw ? "ما في فايز هالمرة، العب مرة ثانية!" : "مبروك على الفوز!"}
          </p>
        </div>

        <Card glow style={{ marginBottom: 24, padding: 20 }}>
          <ScoreBoard players={players} teams={teams} />
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Button onClick={onReplay} fullWidth color={theme.green}>
            🔄 العب مرة ثانية
          </Button>
          <Button variant="outline" onClick={onHome} fullWidth>
            🏠 الرئيسية
          </Button>
        </div>
        <div style={{ marginTop: 24 }}><Signature /></div>
      </div>
    );
  }

  // ── Game Question ──
  return (
    <div style={{ animation: "slideUp 0.5s ease-out", position: "relative" }}>
      {/* Quit Confirmation Modal */}
      {showQuitModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.8)",
            backdropFilter: "blur(8px)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            animation: "fadeIn 0.3s ease-out",
          }}
        >
          <div
            style={{
              background: theme.bgCard,
              border: `2px solid ${theme.red}44`,
              borderRadius: 24,
              padding: 32,
              maxWidth: 380,
              width: "100%",
              textAlign: "center",
              animation: "scaleIn 0.3s ease-out",
              boxShadow: `0 0 60px ${theme.red}22`,
            }}
          >
            <div style={{ fontSize: 56, marginBottom: 16 }}>⚠️</div>
            <h3 style={{ fontSize: 22, fontWeight: 900, fontFamily: "Cairo", marginBottom: 10, color: theme.text }}>
              متأكد تبي تطلع؟
            </h3>
            <p style={{ color: theme.textMuted, fontFamily: "Tajawal", fontSize: 15, marginBottom: 24, lineHeight: 1.8 }}>
              إذا طلعت من المباراة بتخسر والطرف الثاني بيفوز تلقائياً
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Button
                onClick={() => {
                  setShowQuitModal(false);
                  clearInterval(timerRef.current);
                  setGameState((prev) => prev ? { ...prev, phase: "forfeit", forfeitedBy: "human" } : prev);
                }}
                fullWidth
                color={theme.red}
              >
                🏳️ انسحب من المباراة
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowQuitModal(false)}
                fullWidth
                color={theme.accent}
              >
                🎮 كمل اللعب
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => setShowQuitModal(true)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              border: `1.5px solid ${theme.border}`,
              background: "transparent",
              color: theme.textMuted,
              fontSize: 16,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.3s",
              fontFamily: "system-ui",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = theme.red;
              e.currentTarget.style.color = theme.red;
              e.currentTarget.style.background = `${theme.red}12`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = theme.border;
              e.currentTarget.style.color = theme.textMuted;
              e.currentTarget.style.background = "transparent";
            }}
            title="خروج"
          >
            ✕
          </button>
          <span style={{ fontSize: 20 }}>{GAME_MODES.find((m) => m.id === currentMode)?.icon}</span>
          <span style={{ color: modeColor, fontWeight: 700, fontFamily: "Cairo", fontSize: 14 }}>
            {GAME_MODES.find((m) => m.id === currentMode)?.name}
          </span>
        </div>
        <div
          style={{
            background: `${modeColor}15`,
            padding: "6px 16px",
            borderRadius: 20,
            color: modeColor,
            fontWeight: 700,
            fontFamily: "Cairo",
            fontSize: 14,
          }}
        >
          {currentQ + 1} / {questions.length}
        </div>
      </div>

      {/* Score */}
      <div style={{ marginBottom: 16 }}>
        <ScoreBoard players={players} teams={teams} />
      </div>

      {/* Timer */}
      {phase === "question" && (
        <div style={{ marginBottom: 20 }}>
          <Timer seconds={timer} total={totalTime} color={modeColor} />
        </div>
      )}

      {/* Question Card */}
      <Card
        glow
        hoverEffect={false}
        style={{
          marginBottom: 20,
          background: phase === "result" ? `${theme.bgCard}` : theme.bgCard,
          borderColor: phase === "result" ? `${theme.green}44` : theme.border,
        }}
      >
        {type === "word" && (
          <div style={{ textAlign: "center", marginBottom: 8 }}>
            <span
              style={{
                background: `${theme.yellow}15`,
                color: theme.yellow,
                padding: "4px 12px",
                borderRadius: 8,
                fontSize: 13,
                fontFamily: "Tajawal",
              }}
            >
              💡 {question.hint}
            </span>
          </div>
        )}

        <h3
          style={{
            fontSize: type === "word" ? 20 : 22,
            fontWeight: 800,
            textAlign: "center",
            fontFamily: "Cairo",
            lineHeight: 1.6,
            color: theme.text,
            marginBottom: type === "word" ? 16 : 0,
          }}
        >
          {type === "word" ? "رتب الحروف وكوّن كلمة:" : question.q}
        </h3>

        {type === "word" && (
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            {shuffle(question.letters).map((l, i) => (
              <div
                key={i}
                style={{
                  width: 52,
                  height: 52,
                  background: `linear-gradient(135deg, ${modeColor}22, ${modeColor}08)`,
                  border: `2px solid ${modeColor}44`,
                  borderRadius: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 24,
                  fontWeight: 800,
                  fontFamily: "Cairo",
                  color: modeColor,
                }}
              >
                {l}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Answers */}
      {phase === "question" && type === "mcq" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {question.options.map((opt, i) => (
            <button
              key={i}
              onClick={() => handleAnswer(i)}
              style={{
                padding: "18px 12px",
                background: theme.bgCard,
                border: `2px solid ${theme.border}`,
                borderRadius: 14,
                color: theme.text,
                fontSize: 17,
                fontWeight: 700,
                fontFamily: "Cairo",
                cursor: "pointer",
                transition: "all 0.2s",
                textAlign: "center",
              }}
              onMouseEnter={(e) => {
                e.target.style.borderColor = modeColor;
                e.target.style.background = `${modeColor}12`;
              }}
              onMouseLeave={(e) => {
                e.target.style.borderColor = theme.border;
                e.target.style.background = theme.bgCard;
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      {phase === "question" && (type === "input" || type === "word") && (
        <div style={{ display: "flex", gap: 10 }}>
          <input
            type="text"
            value={gameState.inputAnswer}
            onChange={(e) => setGameState((prev) => ({ ...prev, inputAnswer: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && handleInputSubmit()}
            placeholder={type === "word" ? "اكتب الكلمة..." : "اكتب الجواب..."}
            style={{
              flex: 1,
              padding: "16px 20px",
              background: theme.bgInput,
              border: `2px solid ${theme.border}`,
              borderRadius: 12,
              color: theme.text,
              fontSize: 20,
              fontFamily: "Cairo",
              fontWeight: 700,
              textAlign: "center",
            }}
            onFocus={(e) => (e.target.style.borderColor = modeColor)}
            onBlur={(e) => (e.target.style.borderColor = theme.border)}
            autoFocus
          />
          <Button onClick={handleInputSubmit} color={modeColor}>
            ✓
          </Button>
        </div>
      )}

      {/* Result Phase */}
      {phase === "result" && (
        <div style={{ animation: "scaleIn 0.4s ease-out" }}>
          {type === "mcq" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
              {question.options.map((opt, i) => {
                const isCorrect = i === question.answer;
                const isSelected = i === gameState.selectedAnswer;
                return (
                  <div
                    key={i}
                    style={{
                      padding: "18px 12px",
                      background: isCorrect
                        ? `${theme.green}20`
                        : isSelected && !isCorrect
                        ? `${theme.red}20`
                        : theme.bgCard,
                      border: `2px solid ${
                        isCorrect ? theme.green : isSelected && !isCorrect ? theme.red : theme.border
                      }`,
                      borderRadius: 14,
                      color: isCorrect ? theme.green : isSelected && !isCorrect ? theme.red : theme.textMuted,
                      fontSize: 17,
                      fontWeight: 700,
                      fontFamily: "Cairo",
                      textAlign: "center",
                    }}
                  >
                    {isCorrect ? "✓ " : isSelected && !isCorrect ? "✗ " : ""}
                    {opt}
                  </div>
                );
              })}
            </div>
          )}

          {(type === "input" || type === "word") && (
            <Card
              hoverEffect={false}
              style={{
                textAlign: "center",
                marginBottom: 20,
                background: players.find((p) => p.isHuman)?.correct ? `${theme.green}10` : `${theme.red}10`,
                borderColor: players.find((p) => p.isHuman)?.correct ? `${theme.green}44` : `${theme.red}44`,
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>
                {players.find((p) => p.isHuman)?.correct ? "✅" : "❌"}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "Cairo", marginBottom: 4 }}>
                {players.find((p) => p.isHuman)?.correct ? "إجابة صحيحة!" : "إجابة خاطئة!"}
              </div>
              <div style={{ color: theme.green, fontSize: 22, fontWeight: 800, fontFamily: "Cairo" }}>
                الجواب: {question.answer}
              </div>
            </Card>
          )}

          {/* Player results */}
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 20 }}>
            {players.map((p, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 16px",
                  background: `${p.correct ? theme.green : theme.red}10`,
                  border: `1px solid ${p.correct ? theme.green : theme.red}33`,
                  borderRadius: 10,
                }}
              >
                <PlayerAvatar name={p.name} color={p.color} size={28} />
                <span style={{ fontSize: 14, fontWeight: 600, fontFamily: "Cairo" }}>{p.name}</span>
                <span style={{ fontSize: 16 }}>{p.correct ? "✅" : "❌"}</span>
                {gameState.fastestPlayer === p.name && scoreMode === "speed" && (
                  <span style={{ fontSize: 12, color: theme.yellow }}>⚡ أسرع</span>
                )}
              </div>
            ))}
          </div>

          {isOnlineGame && !isHost ? (
            <div style={{ padding: "16px", background: `${theme.purple}10`, borderRadius: 12, border: `1px solid ${theme.purple}33`, textAlign: "center" }}>
              <p style={{ color: theme.purple, fontFamily: "Cairo", fontSize: 15, fontWeight: 700 }}>
                ⏳ ننتظر صاحب الغرفة ينتقل للسؤال التالي...
              </p>
            </div>
          ) : (
            <Button onClick={nextQuestion} fullWidth color={modeColor} style={{ fontSize: 18 }}>
              {currentQ + 1 >= questions.length ? "🏆 النتائج" : "→ السؤال التالي"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
