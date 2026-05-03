// ═══════════════════════════════════════════════════════════════════
// 🏆 صراع الأبطال - التأثيرات والقدرات
// نقطة فوز - Dark theme + Gold accent
// الملف 5
// ═══════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from "react";
import { POWERUPS_CATALOG, usePowerups } from "./arenaEngine";

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
  yellowAlt: "#f59e0b",
  text: "#e4e4e7",
  textMuted: "#71717a",
  border: "#27273a",
};

// ═══════════════════════════════════════════════════════════════════
// PowerupsModal - متجر القدرات
// ═══════════════════════════════════════════════════════════════════

export function PowerupsModal({ arenaCode, playerId, playerData, arenaData, onClose }) {
  const { purchasePowerup, activatePowerup, getAvailablePowerups, error, setError } =
    usePowerups(arenaCode, playerId, playerData);

  const [selectedTab, setSelectedTab] = useState("offensive");
  const [pendingTarget, setPendingTarget] = useState(null);
  const [purchasing, setPurchasing] = useState(false);

  const powerups = getAvailablePowerups();
  const groupedPowerups = {
    offensive: powerups.filter((p) => p.type === "offensive"),
    defensive: powerups.filter((p) => p.type === "defensive"),
    multiplier: powerups.filter((p) => p.type === "multiplier"),
    special: powerups.filter((p) => p.type === "special"),
  };

  const tabs = [
    { id: "offensive",  label: "هجومية",  icon: "⚔️", color: theme.red },
    { id: "defensive",  label: "دفاعية",  icon: "🛡️", color: theme.accent },
    { id: "multiplier", label: "مضاعفة",  icon: "✖️", color: theme.yellow },
    { id: "special",    label: "خاصة",    icon: "💎", color: theme.purple },
  ];

  async function handleBuy(powerup) {
    if (!powerup.canAfford || !powerup.meetsStreak || powerup.owned) return;
    setPurchasing(true);
    const success = await purchasePowerup(powerup.id);
    setPurchasing(false);
    if (success) ArenaSounds.play("purchase");
  }

  async function handleUse(powerup) {
    if (!powerup.owned || powerup.used) return;
    if (powerup.requiresTarget) { setPendingTarget(powerup); return; }
    const success = await activatePowerup(powerup.id);
    if (success) { ArenaSounds.play("activate"); onClose(); }
  }

  async function handleTargetSelected(targetPlayerId) {
    if (!pendingTarget) return;
    const success = await activatePowerup(pendingTarget.id, targetPlayerId);
    if (success) { ArenaSounds.play("activate"); setPendingTarget(null); onClose(); }
  }

  if (pendingTarget) {
    return (
      <TargetSelector
        powerup={pendingTarget} arenaData={arenaData}
        currentPlayerId={playerId}
        onSelect={handleTargetSelected}
        onCancel={() => setPendingTarget(null)}
      />
    );
  }

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.modal} onClick={(e) => e.stopPropagation()}>
        <header style={modalStyles.header}>
          <div>
            <h2 style={modalStyles.title}>⚡ متجر القدرات</h2>
            <p style={modalStyles.subtitle}>
              نقاطك: <strong style={{ color: theme.yellow, fontSize: 15 }}>{playerData?.score || 0}</strong>
              {playerData?.streak > 0 && (
                <> · ستريك: <strong style={{ color: theme.text }}>{playerData.streak} 🔥</strong></>
              )}
              <span style={{ display: "block", fontSize: 11, color: theme.textMuted, marginTop: 4, fontFamily: "Tajawal" }}>
                💡 القدرات تطبّق في السؤال التالي
              </span>
            </p>
          </div>
          <button onClick={onClose} style={modalStyles.closeBtn} aria-label="إغلاق">✕</button>
        </header>

        {/* عرض كل القدرات معاً مرتبة حسب النوع */}
        {tabs.map((category) => {
          const categoryPowerups = groupedPowerups[category.id];
          if (!categoryPowerups || categoryPowerups.length === 0) return null;
          return (
            <div key={category.id} style={{ marginBottom: 16 }}>
              <h3 style={{
                fontSize: 14, fontWeight: 800,
                color: category.color,
                margin: "0 0 10px",
                fontFamily: "Cairo",
                display: "flex", alignItems: "center", gap: 8,
                paddingRight: 8, borderRight: `3px solid ${category.color}`,
              }}>
                <span style={{ fontSize: 18 }}>{category.icon}</span>
                {category.label}
                <span style={{
                  fontSize: 11, color: theme.textMuted, fontWeight: 700,
                  marginRight: "auto",
                }}>
                  ({categoryPowerups.length})
                </span>
              </h3>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
                gap: 12,
              }}>
                {categoryPowerups.map((p) => (
                  <PowerupCard
                    key={p.id} powerup={p}
                    onBuy={() => handleBuy(p)} onUse={() => handleUse(p)}
                    purchasing={purchasing}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {error && (
          <div style={modalStyles.errorBox}>
            {error}
            <button onClick={() => setError(null)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 16 }}>✕</button>
          </div>
        )}
      </div>
      <ModalGlobalStyles />
    </div>
  );
}

function PowerupCard({ powerup, onBuy, onUse, purchasing }) {
  const isLocked = !powerup.meetsStreak;
  const canBuy = powerup.canAfford && !powerup.owned && !isLocked;
  const canUse = powerup.owned && !powerup.used;
  const isUsed = powerup.used;

  return (
    <div style={{
      background: powerup.owned ? `${theme.yellow}15` : theme.bgInput,
      border: `2px solid ${
        powerup.owned ? theme.yellow :
        isLocked ? theme.border :
        theme.border
      }`,
      borderRadius: 14,
      padding: 16,
      textAlign: "center",
      opacity: isLocked || isUsed ? 0.5 : 1,
      transition: "all 0.2s",
    }}>
      <div style={{ fontSize: 44, marginBottom: 10 }}>{powerup.icon}</div>
      <h3 style={{ fontSize: 16, fontWeight: 800, color: theme.text, margin: "0 0 6px", fontFamily: "Cairo" }}>
        {powerup.name}
      </h3>
      <p style={{
        fontSize: 12, color: theme.textMuted, margin: "0 0 12px",
        minHeight: 38, lineHeight: 1.5, fontFamily: "Tajawal",
      }}>
        {powerup.description}
      </p>

      {isLocked && (
        <div style={{
          fontSize: 11, color: theme.red,
          background: `${theme.red}20`,
          padding: "4px 10px", borderRadius: 999,
          marginBottom: 10, display: "inline-block",
          fontFamily: "Cairo", fontWeight: 700,
        }}>
          🔒 ستريك {powerup.streakRequired}
        </div>
      )}

      {isUsed ? (
        <button disabled style={{ ...modalStyles.btnUsed }}>✓ تم الاستخدام</button>
      ) : canUse ? (
        <button onClick={onUse} style={{ ...modalStyles.btnUse }}>استخدم الآن</button>
      ) : powerup.owned ? (
        <button disabled style={{ ...modalStyles.btnOwned }}>✓ مشتراة</button>
      ) : (
        <button
          onClick={onBuy}
          disabled={!canBuy || purchasing}
          style={{ ...modalStyles.btnBuy, opacity: canBuy ? 1 : 0.5, cursor: canBuy ? "pointer" : "not-allowed" }}
        >
          {powerup.cost} نقطة
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TargetSelector
// ═══════════════════════════════════════════════════════════════════

export function TargetSelector({ powerup, arenaData, currentPlayerId, onSelect, onCancel }) {
  const targets = arenaData?.players
    ? Object.entries(arenaData.players)
        .filter(([id]) => id !== currentPlayerId)
        .map(([id, p]) => ({ id, ...p }))
        .sort((a, b) => (b.score || 0) - (a.score || 0))
    : [];

  return (
    <div style={modalStyles.overlay} onClick={onCancel}>
      <div style={modalStyles.modal} onClick={(e) => e.stopPropagation()}>
        <header style={modalStyles.header}>
          <div>
            <h2 style={modalStyles.title}>{powerup.icon} اختر الهدف</h2>
            <p style={modalStyles.subtitle}>{powerup.name}: {powerup.description}</p>
          </div>
          <button onClick={onCancel} style={modalStyles.closeBtn}>✕</button>
        </header>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {targets.map((p) => (
            <button
              key={p.id} onClick={() => onSelect(p.id)}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 14px",
                background: theme.bgInput,
                border: `1px solid ${theme.border}`,
                borderRadius: 12, cursor: "pointer",
                fontFamily: "Cairo", textAlign: "right", width: "100%",
                color: theme.text, transition: "all 0.2s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = theme.red; e.currentTarget.style.background = `${theme.red}15`; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = theme.border; e.currentTarget.style.background = theme.bgInput; }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: "50%",
                background: theme.yellow, color: "#0a0a0f",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 800, fontSize: 16, flexShrink: 0,
                fontFamily: "Cairo", overflow: "hidden",
              }}>
                {p.avatar ? <img src={p.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span>{p.name.charAt(0)}</span>}
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 14, fontWeight: 800, fontFamily: "Cairo" }}>{p.name}</span>
                <span style={{ fontSize: 11, color: theme.textMuted, fontFamily: "Tajawal" }}>{p.score || 0} نقطة</span>
              </div>
              <span style={{ fontSize: 18, color: theme.red, fontWeight: 800 }}>←</span>
            </button>
          ))}
        </div>

        {targets.length === 0 && (
          <p style={{ textAlign: "center", color: theme.textMuted, padding: 24, fontFamily: "Tajawal" }}>
            لا يوجد لاعبون آخرون
          </p>
        )}
      </div>
      <ModalGlobalStyles />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ConfettiOverlay
// ═══════════════════════════════════════════════════════════════════

export function ConfettiOverlay({ trigger, points = 100 }) {
  const [particles, setParticles] = useState([]);

  useEffect(() => {
    if (!trigger) return;
    const newParticles = Array.from({ length: 25 }, (_, i) => ({
      id: `${Date.now()}-${i}`,
      angle: (Math.PI * 2 * i) / 25,
      distance: 100 + Math.random() * 80,
      delay: Math.random() * 100,
      size: 8 + Math.random() * 10,
      duration: 800 + Math.random() * 400,
    }));
    setParticles(newParticles);
    const timer = setTimeout(() => setParticles([]), 1500);
    return () => clearTimeout(timer);
  }, [trigger]);

  if (particles.length === 0) return null;

  return (
    <div style={{
      position: "fixed", inset: 0,
      pointerEvents: "none", zIndex: 9998,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        fontSize: 56, fontWeight: 900,
        background: `linear-gradient(135deg, ${theme.yellow}, ${theme.yellowAlt})`,
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        textShadow: `0 0 40px ${theme.yellow}`,
        animation: "arenaPointsPop 1.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
        fontFamily: "Cairo",
      }}>
        +{points}
      </div>
      {particles.map((p) => (
        <div key={p.id} style={{
          position: "absolute",
          width: p.size, height: p.size,
          background: `radial-gradient(circle, ${theme.yellow}, ${theme.yellowAlt})`,
          borderRadius: "50%",
          left: "50%", top: "50%",
          opacity: 0,
          boxShadow: `0 0 12px ${theme.yellow}`,
          animation: `arenaConfettiBurst ${p.duration}ms cubic-bezier(0.4, 0, 0.6, 1) ${p.delay}ms forwards`,
          "--angle": `${p.angle}rad`,
          "--distance": `${p.distance}px`,
        }} />
      ))}
      <style>{`
        @keyframes arenaPointsPop {
          0% { opacity: 0; transform: scale(0.3) translateY(20px); }
          30% { opacity: 1; transform: scale(1.3) translateY(-10px); }
          70% { opacity: 1; transform: scale(1) translateY(-30px); }
          100% { opacity: 0; transform: scale(0.9) translateY(-60px); }
        }
        @keyframes arenaConfettiBurst {
          0% { opacity: 1; transform: translate(-50%, -50%) translate(0, 0) scale(0.5); }
          100% {
            opacity: 0;
            transform: translate(-50%, -50%)
              translate(
                calc(cos(var(--angle)) * var(--distance)),
                calc(sin(var(--angle)) * var(--distance))
              )
              scale(1) rotate(720deg);
          }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// RoundHeroes - أبطال السؤال
// ═══════════════════════════════════════════════════════════════════

export function RoundHeroes({ question, answers, players }) {
  const correctOption = question?.answer;
  const winners = Object.entries(answers || {})
    .filter(([_, a]) => a.option === correctOption)
    .sort((a, b) => (a[1].timeUsed || 999) - (b[1].timeUsed || 999))
    .slice(0, 3)
    .map(([playerId, ans], idx) => ({
      playerId,
      name: players[playerId]?.name || "...",
      avatar: players[playerId]?.avatar,
      timeUsed: ans.timeUsed,
      rank: idx + 1,
    }));

  if (winners.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "20px 16px", color: theme.textMuted }}>
        <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "Cairo" }}>😔 لا أحد أصاب!</div>
      </div>
    );
  }

  const medals = ["🥇", "🥈", "🥉"];
  const labels = ["البطل", "الوصيف", "البرونز"];
  const colors = [
    { border: theme.yellow, bg: `${theme.yellow}15`, label: theme.yellow },
    { border: "#9ca3af", bg: "rgba(156,163,175,0.1)", label: "#9ca3af" },
    { border: "#d97706", bg: "rgba(217,119,6,0.1)", label: "#d97706" },
  ];

  return (
    <div style={{ textAlign: "center", padding: "20px 16px", borderTop: `1px solid ${theme.border}`, marginTop: 16 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: theme.yellow, marginBottom: 18, fontFamily: "Cairo" }}>
        ⭐ أبطال السؤال
      </div>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
        {winners.map((w, i) => (
          <div key={w.playerId} style={{
            border: `2px solid ${colors[i].border}`,
            background: colors[i].bg,
            borderRadius: 14,
            padding: "14px 12px",
            minWidth: 110,
            textAlign: "center",
            opacity: 0,
            animation: `arenaHeroRise 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards`,
            animationDelay: `${i * 200}ms`,
            transform: i === 0 ? "scale(1.08)" : "scale(1)",
            boxShadow: i === 0 ? `0 0 30px ${theme.yellow}40` : "none",
          }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>{medals[i]}</div>
            <div style={{
              width: 48, height: 48, borderRadius: "50%",
              background: theme.yellow, color: "#0a0a0f",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 800, fontSize: 20, margin: "0 auto 6px",
              fontFamily: "Cairo", overflow: "hidden",
            }}>
              {w.avatar ? <img src={w.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span>{w.name.charAt(0)}</span>}
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: theme.text, marginBottom: 4, fontFamily: "Cairo" }}>{w.name}</div>
            <div style={{ fontSize: 10, color: theme.textMuted, marginBottom: 6, fontFamily: "Tajawal" }}>{w.timeUsed.toFixed(1)} ثانية</div>
            <div style={{ fontSize: 10, fontWeight: 800, color: colors[i].label, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: "Cairo" }}>
              {labels[i]}
            </div>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes arenaHeroRise {
          from { opacity: 0; transform: translateY(40px) scale(0.9); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PowerupEffect
// ═══════════════════════════════════════════════════════════════════

export function PowerupEffect({ effect, onComplete }) {
  useEffect(() => {
    if (!effect) return;
    ArenaSounds.play(effect.type);
    const timer = setTimeout(() => onComplete?.(), 2000);
    return () => clearTimeout(timer);
  }, [effect]);

  if (!effect) return null;

  const effects = {
    ice:        { icon: "❄️",  text: "تم تجميدك!",       color: theme.accent },
    speed:      { icon: "⚡",  text: "وقت أقصر!",         color: theme.yellow },
    mute:       { icon: "🔇",  text: "تم كتم السؤال",     color: theme.textMuted },
    scramble:   { icon: "🌀",  text: "تم تشويش الخيارات!", color: theme.purple },
    shield:     { icon: "🛡️", text: "الدرع نشط",         color: theme.green },
    multiplier: { icon: "✖️2", text: "نقاط مضاعفة ×2",    color: theme.yellow },
    jackpot:    { icon: "🎰",  text: "جاكبوت! ×3",         color: theme.red },
    veto:       { icon: "🚫",  text: "تم منعك!",          color: theme.red },
  };

  const cfg = effects[effect.type] || { icon: "✨", text: "", color: theme.yellow };

  return (
    <div style={{
      position: "fixed", inset: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 9997, pointerEvents: "none",
      background: "rgba(10, 10, 15, 0.85)",
      backdropFilter: "blur(8px)",
      animation: "arenaEffectFade 2s ease forwards",
    }}>
      <div style={{
        textAlign: "center",
        animation: "arenaEffectPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
        color: cfg.color,
      }}>
        <div style={{
          fontSize: 96, marginBottom: 16,
          filter: `drop-shadow(0 0 30px ${cfg.color})`,
          animation: "arenaEffectShake 0.5s ease infinite alternate",
        }}>
          {cfg.icon}
        </div>
        <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 8, fontFamily: "Cairo" }}>
          {cfg.text}
        </div>
        {effect.from && (
          <div style={{ fontSize: 14, opacity: 0.8, fontFamily: "Tajawal" }}>
            من قِبَل: {effect.from}
          </div>
        )}
      </div>
      <style>{`
        @keyframes arenaEffectFade {
          0% { opacity: 0; }
          20% { opacity: 1; }
          80% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes arenaEffectPop {
          from { transform: scale(0.5); }
          to { transform: scale(1); }
        }
        @keyframes arenaEffectShake {
          from { transform: rotate(-5deg); }
          to { transform: rotate(5deg); }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// WinnerCelebration
// ═══════════════════════════════════════════════════════════════════

export function WinnerCelebration({ winner, isMe }) {
  useEffect(() => {
    if (isMe) ArenaSounds.play("victory");
  }, [isMe]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9998,
      background: `linear-gradient(135deg, ${theme.bg}, #1a1a2e)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden", direction: "rtl",
      fontFamily: "Tajawal, system-ui, sans-serif",
    }}>
      {/* Confetti */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        {Array.from({ length: 50 }).map((_, i) => (
          <div key={i} style={{
            position: "absolute",
            top: -10,
            left: `${Math.random() * 100}%`,
            width: 10, height: 14,
            background: [theme.yellow, theme.yellowAlt, theme.accent, theme.purple][i % 4],
            animation: `arenaFall ${2 + Math.random() * 2}s linear forwards`,
            animationDelay: `${Math.random() * 2}s`,
          }} />
        ))}
      </div>

      <div style={{
        textAlign: "center", color: theme.text, position: "relative", zIndex: 1,
        animation: "arenaCelebrateIn 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)",
      }}>
        <div style={{
          fontSize: 96, marginBottom: 16,
          animation: "arenaCrownBounce 2s ease infinite",
          filter: `drop-shadow(0 0 40px ${theme.yellow})`,
        }}>
          👑
        </div>
        <h1 style={{
          fontSize: 40, fontWeight: 900,
          background: `linear-gradient(135deg, ${theme.yellow}, ${theme.yellowAlt})`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          margin: "0 0 12px",
          fontFamily: "Cairo",
        }}>
          {isMe ? "أنت البطل!" : `${winner.name} هو البطل`}
        </h1>
        <div style={{
          fontSize: 56, fontWeight: 900, color: theme.text,
          marginBottom: 24, fontFamily: "Cairo",
          textShadow: `0 0 30px ${theme.yellow}80`,
        }}>
          {winner.score} نقطة
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 16 }}>
          <div style={{
            background: theme.bgCard, padding: "12px 18px", borderRadius: 12,
            border: `1px solid ${theme.border}`,
          }}>
            <div style={{ fontSize: 11, color: theme.textMuted, marginBottom: 4, fontFamily: "Tajawal" }}>أفضل ستريك</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: theme.yellow, fontFamily: "Cairo" }}>
              🔥 {winner.bestStreak || 0}
            </div>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes arenaFall {
          0% { transform: translateY(-10px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
        @keyframes arenaCelebrateIn {
          from { opacity: 0; transform: scale(0.5); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes arenaCrownBounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-12px); }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ArenaSounds - Web Audio API
// ═══════════════════════════════════════════════════════════════════

export const ArenaSounds = {
  ctx: null,
  enabled: true,

  init() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        console.warn("Audio not supported");
      }
    }
  },

  play(type) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      const sounds = {
        correct: () => this._beep(523, 0.15, "sine", 0.3),
        wrong: () => this._beep(220, 0.3, "sawtooth", 0.2),
        tick: () => this._beep(800, 0.05, "square", 0.1),
        purchase: () => {
          this._beep(523, 0.1, "sine", 0.2);
          setTimeout(() => this._beep(659, 0.1, "sine", 0.2), 100);
          setTimeout(() => this._beep(784, 0.15, "sine", 0.2), 200);
        },
        activate: () => this._beep(880, 0.2, "triangle", 0.3),
        ice: () => this._beep(165, 0.4, "triangle", 0.3),
        speed: () => this._sweep(400, 1200, 0.3),
        scramble: () => {
          for (let i = 0; i < 5; i++) {
            setTimeout(() => this._beep(200 + Math.random() * 800, 0.05, "square", 0.15), i * 50);
          }
        },
        victory: () => {
          this._beep(523, 0.15, "sine", 0.3);
          setTimeout(() => this._beep(659, 0.15, "sine", 0.3), 150);
          setTimeout(() => this._beep(784, 0.15, "sine", 0.3), 300);
          setTimeout(() => this._beep(1047, 0.4, "sine", 0.3), 450);
        },
      };
      sounds[type]?.();
    } catch (e) {}
  },

  _beep(freq, duration, wave = "sine", volume = 0.2) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = wave;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(this.ctx.currentTime);
    osc.stop(this.ctx.currentTime + duration);
  },

  _sweep(fromFreq, toFreq, duration) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(fromFreq, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(toFreq, this.ctx.currentTime + duration);
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  },

  toggle(enabled) { this.enabled = enabled; },
};

// ═══════════════════════════════════════════════════════════════════
// الستايلات
// ═══════════════════════════════════════════════════════════════════

const modalStyles = {
  overlay: {
    position: "fixed", inset: 0,
    background: "rgba(0, 0, 0, 0.75)",
    backdropFilter: "blur(8px)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 9999, padding: 16, direction: "rtl",
    fontFamily: "Tajawal, system-ui, sans-serif",
    animation: "arenaModalFade 0.2s ease",
  },
  modal: {
    background: theme.bgCard,
    borderRadius: 18,
    border: `1px solid ${theme.border}`,
    maxWidth: 680, width: "100%",
    maxHeight: "90vh", overflowY: "auto",
    boxShadow: `0 20px 60px rgba(0,0,0,0.6), 0 0 60px rgba(251,191,36,0.15)`,
    padding: 22,
    animation: "arenaModalPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
    marginBottom: 18, paddingBottom: 14,
    borderBottom: `1px solid ${theme.border}`,
  },
  title: {
    fontSize: 20, fontWeight: 800, color: theme.yellow,
    margin: "0 0 4px", fontFamily: "Cairo",
  },
  subtitle: {
    fontSize: 12, color: theme.textMuted, margin: 0, fontFamily: "Tajawal",
  },
  closeBtn: {
    width: 32, height: 32, borderRadius: "50%",
    background: theme.bgInput, border: `1px solid ${theme.border}`,
    color: theme.text, fontSize: 16, cursor: "pointer",
    transition: "all 0.2s",
  },
  tabs: {
    display: "flex", gap: 6, marginBottom: 16,
    overflowX: "auto", paddingBottom: 4,
  },
  tab: {
    flex: 1, minWidth: 80,
    padding: "10px 6px",
    background: theme.bgInput,
    border: `2px solid ${theme.border}`,
    borderRadius: 10,
    color: theme.textMuted,
    cursor: "pointer", fontFamily: "Cairo",
    display: "flex", flexDirection: "column",
    alignItems: "center", gap: 3,
    transition: "all 0.2s",
  },
  btnBuy: {
    width: "100%", padding: "11px 12px",
    background: `linear-gradient(135deg, ${theme.yellow}, ${theme.yellowAlt})`,
    color: "#0a0a0f", border: "none",
    borderRadius: 10, fontSize: 14, fontWeight: 800,
    cursor: "pointer", fontFamily: "Cairo",
    transition: "all 0.2s",
  },
  btnUse: {
    width: "100%", padding: "11px 12px",
    background: theme.green, color: "#0a0a0f",
    border: "none", borderRadius: 10,
    fontSize: 14, fontWeight: 800,
    cursor: "pointer", fontFamily: "Cairo",
  },
  btnOwned: {
    width: "100%", padding: "11px 12px",
    background: theme.bgInput, color: theme.textMuted,
    border: `1px solid ${theme.border}`, borderRadius: 10,
    fontSize: 13, fontWeight: 700,
    cursor: "not-allowed", fontFamily: "Cairo",
  },
  btnUsed: {
    width: "100%", padding: "11px 12px",
    background: "transparent", color: theme.textMuted,
    border: `1px solid ${theme.border}`, borderRadius: 10,
    fontSize: 13, fontWeight: 700,
    cursor: "not-allowed", fontFamily: "Cairo",
  },
  errorBox: {
    marginTop: 14, padding: "10px 14px",
    background: `${theme.red}20`, color: theme.red,
    borderRadius: 10, fontSize: 13, fontWeight: 600,
    fontFamily: "Tajawal",
    border: `1px solid ${theme.red}40`,
    display: "flex", justifyContent: "space-between", alignItems: "center",
  },
};

function ModalGlobalStyles() {
  return (
    <style>{`
      @keyframes arenaModalFade {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes arenaModalPop {
        from { opacity: 0; transform: scale(0.92); }
        to { opacity: 1; transform: scale(1); }
      }
    `}</style>
  );
}
