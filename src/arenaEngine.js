// ═══════════════════════════════════════════════════════════════════
// 🏆 صراع الأبطال - محرك اللعبة (Game Engine)
// نقطة فوز - تحدي تفاعلي متعدد اللاعبين
// الملف 4 من خطة البناء
//
// هذا الملف يحتوي على:
// 1. useArenaEngine: Hook يدير دورة اللعبة (يستخدمه المنشئ فقط)
// 2. selectQuestions: دالة لاختيار الأسئلة
// 3. calculateRoundScores: دالة لحساب النقاط
// 4. منطق القدرات الأساسي (POWERUPS catalog)
// ═══════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from "react";
import { db, ref, set, update, onValue, get } from "./firebase.js";
import { remove } from "firebase/database";

// ─── ثوابت اللعبة ──────────────────────────────────────────────────

const ARENA_LEVELS = {
  easy:   { points: 100 },
  medium: { points: 150 },
  hard:   { points: 200 },
};

// مدة كل مرحلة بالثواني
const PHASE_DURATIONS = {
  question:    15, // مدة عرض السؤال
  reveal:      8,  // مدة عرض الإجابة الصحيحة + ترتيب اللاعبين (شاشة موحدة)
  finalDelay:  3,  // تأخير قبل عرض النهاية
};

// بونص السرعة (نسبة مئوية مضافة لنقاط الأسرع)
const SPEED_BONUS = {
  first:  0.20, // +20% للأول
  second: 0.10, // +10% للثاني
};

// ─── كتالوج القدرات الـ 14 ────────────────────────────────────────
// (المنطق الكامل للقدرات في الملف 5، هنا فقط الكتالوج والأسعار)

export const POWERUPS_CATALOG = {
  // هجومية
  ice: {
    id: "ice",
    name: "الجليد",
    icon: "❄️",
    description: "تجميد لاعب لسؤال كامل",
    cost: 50,
    type: "offensive",
    requiresTarget: true,
  },
  speed: {
    id: "speed",
    name: "التسريع",
    icon: "⚡",
    description: "وقت الباقين 5 ثواني لسؤالين",
    cost: 60,
    type: "offensive",
    requiresTarget: false,
  },
  mute: {
    id: "mute",
    name: "الكتم",
    icon: "🔇",
    description: "إخفاء سؤال 3 ثواني عن لاعب",
    cost: 40,
    type: "offensive",
    requiresTarget: true,
  },
  scramble: {
    id: "scramble",
    name: "التشويش",
    icon: "🌀",
    description: "تحريك خيارات لاعب",
    cost: 35,
    type: "offensive",
    requiresTarget: true,
  },
  // دفاعية
  shield: {
    id: "shield",
    name: "الدرع",
    icon: "🛡️",
    description: "حماية من خسارة نقاط",
    cost: 45,
    type: "defensive",
    requiresTarget: false,
  },
  doubleAnswer: {
    id: "doubleAnswer",
    name: "الإجابة المزدوجة",
    icon: "✌️",
    description: "اختر إجابتين، الصحيحة تُحتسب",
    cost: 50,
    type: "defensive",
    requiresTarget: false,
  },
  removeWrong: {
    id: "removeWrong",
    name: "حذف خاطئ",
    icon: "✂️",
    description: "حذف إجابة خاطئة من الخيارات",
    cost: 30,
    type: "defensive",
    requiresTarget: false,
  },
  extraTime: {
    id: "extraTime",
    name: "وقت إضافي",
    icon: "⏰",
    description: "10 ثواني إضافية لك",
    cost: 25,
    type: "defensive",
    requiresTarget: false,
  },
  // مضاعفة
  multiplier: {
    id: "multiplier",
    name: "المضاعف",
    icon: "✖️",
    description: "×2 على السؤال القادم",
    cost: 55,
    type: "multiplier",
    requiresTarget: false,
  },
  steal: {
    id: "steal",
    name: "السرقة",
    icon: "🦹",
    description: "سرق 30 نقطة من المتصدر",
    cost: 70,
    type: "multiplier",
    requiresTarget: false,
  },
  // خاصة (تتطلب ستريك)
  swap: {
    id: "swap",
    name: "التبادل",
    icon: "🔄",
    description: "بدّل ترتيبك (يتطلب 6 صحيحة متتالية)",
    cost: 100,
    type: "special",
    requiresTarget: true,
    streakRequired: 6,
  },
  veto: {
    id: "veto",
    name: "الفيتو",
    icon: "🚫",
    description: "منع لاعب من الإجابة (يتطلب 9 صحيحة متتالية)",
    cost: 120,
    type: "special",
    requiresTarget: true,
    streakRequired: 9,
  },
};

// ═══════════════════════════════════════════════════════════════════
// 1) دالة اختيار الأسئلة من البنك
// ═══════════════════════════════════════════════════════════════════

export function selectQuestions(allQuestions, config) {
  const { questionsCount, categories, levels } = config;

  // فلترة حسب الإعدادات
  const enabledLevels = Object.keys(levels).filter((l) => levels[l]);
  const filtered = allQuestions.filter(
    (q) =>
      categories.includes(q.category) &&
      enabledLevels.includes(q.level)
  );

  if (filtered.length === 0) {
    console.error("لا توجد أسئلة تطابق الإعدادات");
    return [];
  }

  // توزيع متوازن: 40% سهل، 35% متوسط، 25% صعب (إذا متاحة)
  const distribution = computeDistribution(questionsCount, enabledLevels);

  // اختيار من كل مستوى
  const selected = [];
  for (const level of enabledLevels) {
    const levelQuestions = filtered.filter((q) => q.level === level);
    const wanted = distribution[level] || 0;
    const shuffled = shuffleArray([...levelQuestions]);
    selected.push(...shuffled.slice(0, wanted));
  }

  // لو ما حصلنا العدد المطلوب، كمّل من الباقي عشوائياً
  if (selected.length < questionsCount) {
    const remainingPool = filtered.filter((q) => !selected.includes(q));
    const shuffledRemaining = shuffleArray(remainingPool);
    selected.push(...shuffledRemaining.slice(0, questionsCount - selected.length));
  }

  // خلط الترتيب النهائي وقص للعدد المطلوب
  return shuffleArray(selected).slice(0, questionsCount);
}

// توزيع الأسئلة على المستويات
function computeDistribution(total, enabledLevels) {
  const ratios = { easy: 0.4, medium: 0.35, hard: 0.25 };
  const distribution = { easy: 0, medium: 0, hard: 0 };

  // إذا مستوى واحد فقط مفعّل
  if (enabledLevels.length === 1) {
    distribution[enabledLevels[0]] = total;
    return distribution;
  }

  // إعادة توزيع النسب على المستويات المفعّلة فقط
  const totalRatio = enabledLevels.reduce((sum, l) => sum + ratios[l], 0);
  let allocated = 0;
  for (const level of enabledLevels) {
    const count = Math.floor((ratios[level] / totalRatio) * total);
    distribution[level] = count;
    allocated += count;
  }

  // توزيع الباقي على أول مستوى
  if (allocated < total && enabledLevels.length > 0) {
    distribution[enabledLevels[0]] += total - allocated;
  }

  return distribution;
}

// خلط مصفوفة (Fisher-Yates)
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ═══════════════════════════════════════════════════════════════════
// 2) دالة حساب النقاط في نهاية كل سؤال
// ═══════════════════════════════════════════════════════════════════

export function calculateRoundScores(question, answers, players) {
  const correctOption = question.answer;
  const basePoints = ARENA_LEVELS[question.level]?.points || 100;
  const updates = {};

  // 1) فصل الإجابات الصحيحة وترتيبها بالسرعة
  const correctAnswers = Object.entries(answers || {})
    .filter(([_, ans]) => ans.option === correctOption)
    .sort((a, b) => (a[1].timeUsed || 999) - (b[1].timeUsed || 999));

  // 2) حساب النقاط لكل لاعب
  for (const [playerId, player] of Object.entries(players)) {
    const playerAnswer = answers?.[playerId];
    const isCorrect = playerAnswer?.option === correctOption;
    const wasFirst = correctAnswers[0]?.[0] === playerId;
    const wasSecond = correctAnswers[1]?.[0] === playerId;

    let pointsGained = 0;
    let newStreak = player.streak || 0;
    let bestStreak = player.bestStreak || 0;

    if (isCorrect) {
      // النقاط الأساسية
      pointsGained = basePoints;
      // بونص السرعة
      if (wasFirst) pointsGained += Math.round(basePoints * SPEED_BONUS.first);
      else if (wasSecond) pointsGained += Math.round(basePoints * SPEED_BONUS.second);

      // تطبيق المضاعف لو نشط (يأتي من القدرات)
      if (player.activeMultiplier) {
        pointsGained *= player.activeMultiplier;
      }

      // الستريك يزيد
      newStreak = (player.streak || 0) + 1;
      if (newStreak > bestStreak) bestStreak = newStreak;
    } else {
      // إجابة خاطئة أو لم يجب
      newStreak = 0;
    }

    // حماية الدرع
    if (pointsGained < 0 && player.activeShield) {
      pointsGained = 0;
    }

    const newScore = Math.max(0, (player.score || 0) + pointsGained);

    updates[`players/${playerId}/score`] = newScore;
    updates[`players/${playerId}/streak`] = newStreak;
    updates[`players/${playerId}/bestStreak`] = bestStreak;
    updates[`players/${playerId}/lastRoundPoints`] = pointsGained;
    updates[`players/${playerId}/lastAnswerCorrect`] = isCorrect;

    // تنظيف القدرات النشطة بعد استخدامها
    updates[`players/${playerId}/activeMultiplier`] = null;
    updates[`players/${playerId}/activeShield`] = null;
  }

  return updates;
}

// ═══════════════════════════════════════════════════════════════════
// 3) Hook المحرك الرئيسي
// ═══════════════════════════════════════════════════════════════════

/**
 * useArenaEngine - يستخدمه المنشئ (Host) فقط
 * يدير دورة اللعبة الكاملة من اختيار الأسئلة لانتهاء اللعبة
 *
 * @param {string} arenaCode - كود الجلسة
 * @param {boolean} isHost - هل المستخدم الحالي هو المنشئ
 * @param {Array} questionBank - بنك الأسئلة الكامل (window.ARENA_QUESTIONS)
 */
export function useArenaEngine(arenaCode, isHost, questionBank) {
  const [engineState, setEngineState] = useState("idle"); // idle | running | finished
  const [error, setError] = useState(null);

  // مراجع للحفاظ على القيم بدون إعادة render
  const arenaDataRef = useRef(null);
  const phaseTimerRef = useRef(null);
  const isProcessingRef = useRef(false);

  // ─── مراقبة بيانات الجلسة ───────────────────────────────────────

  useEffect(() => {
    if (!arenaCode || !isHost) return;

    const arenaRef = ref(db, `arenas/${arenaCode}`);
    const unsubscribe = onValue(arenaRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setEngineState("idle");
        return;
      }
      arenaDataRef.current = data;

      // تشغيل المحرك عند بدء اللعبة
      if (data.status === "playing" && engineState === "idle") {
        startGame(data);
      } else if (data.status === "finished" && engineState === "running") {
        stopEngine();
      }
    });

    return () => {
      unsubscribe();
      stopEngine();
    };
  }, [arenaCode, isHost]);

  // ─── بدء اللعبة (يحدث مرة واحدة) ────────────────────────────────

  async function startGame(data) {
    // حماية من التشغيل المزدوج
    if (isProcessingRef.current) return;
    if (data.questions && data.questions.length > 0) {
      // الأسئلة موجودة بالفعل، فقط استأنف
      setEngineState("running");
      schedulePhaseTransition(data);
      return;
    }

    isProcessingRef.current = true;

    try {
      // 1) اختيار الأسئلة
      const questions = selectQuestions(questionBank, data.config);

      if (questions.length === 0) {
        setError("لا توجد أسئلة كافية للإعدادات المختارة");
        await update(ref(db, `arenas/${arenaCode}`), {
          status: "finished",
          phase: "error",
          errorMessage: "لا توجد أسئلة كافية",
        });
        return;
      }

      // 2) كتابة الأسئلة وبدء السؤال الأول
      await update(ref(db, `arenas/${arenaCode}`), {
        questions,
        currentQuestion: 0,
        phase: "question",
        phaseStartedAt: Date.now(),
      });

      setEngineState("running");

      // 3) جدولة انتقال المرحلة الأولى
      const updatedData = { ...data, questions, currentQuestion: 0, phase: "question", phaseStartedAt: Date.now() };
      schedulePhaseTransition(updatedData);
    } catch (err) {
      console.error("Failed to start game:", err);
      setError("تعذر بدء اللعبة");
    } finally {
      isProcessingRef.current = false;
    }
  }

  // ─── جدولة الانتقال للمرحلة التالية ────────────────────────────

  function schedulePhaseTransition(data) {
    if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);

    const phase = data.phase;
    const phaseStart = data.phaseStartedAt || Date.now();
    const elapsed = (Date.now() - phaseStart) / 1000;
    const phaseDuration = PHASE_DURATIONS[phase] || 5;
    const remaining = Math.max(0, phaseDuration - elapsed) * 1000;

    phaseTimerRef.current = setTimeout(() => {
      handlePhaseEnd();
    }, remaining);
  }

  // ─── معالجة انتهاء كل مرحلة ─────────────────────────────────────

  async function handlePhaseEnd() {
    if (isProcessingRef.current) return;
    const data = arenaDataRef.current;
    if (!data || data.status !== "playing") return;

    isProcessingRef.current = true;

    try {
      const phase = data.phase;
      const currentQ = data.currentQuestion ?? 0;

      if (phase === "question") {
        await transitionToReveal(data, currentQ);
      } else if (phase === "reveal") {
        await transitionToNextOrEnd(data, currentQ);
      }
    } catch (err) {
      console.error("Phase end error:", err);
    } finally {
      isProcessingRef.current = false;

      // إعادة جدولة المرحلة الجديدة
      const updated = arenaDataRef.current;
      if (updated && updated.status === "playing") {
        schedulePhaseTransition(updated);
      }
    }
  }

  // ─── انتقال 1: من question إلى reveal ───────────────────────────
  // (هنا تُحسب النقاط)

  async function transitionToReveal(data, currentQ) {
    const question = data.questions[currentQ];
    if (!question) return;

    const answers = data.answers?.[currentQ] || {};
    const players = data.players || {};

    // حساب النقاط
    const scoreUpdates = calculateRoundScores(question, answers, players);

    // التحديث الكامل
    await update(ref(db, `arenas/${arenaCode}`), {
      ...scoreUpdates,
      phase: "reveal",
      phaseStartedAt: Date.now(),
    });
  }

  // ─── انتقال 2: للسؤال القادم أو إنهاء اللعبة ───────────────────

  async function transitionToNextOrEnd(data, currentQ) {
    const totalQ = data.questions?.length || 0;
    const isLastQuestion = currentQ >= totalQ - 1;

    if (isLastQuestion) {
      // إنهاء اللعبة
      await update(ref(db, `arenas/${arenaCode}`), {
        status: "finished",
        phase: "final",
        finishedAt: Date.now(),
      });

      // analytics
      if (typeof window !== "undefined" && window.gtag) {
        window.gtag("event", "arena_finished", {
          code: arenaCode,
          questions: totalQ,
          players: Object.keys(data.players || {}).length,
        });
      }
    } else {
      // السؤال التالي - تفعيل القدرات pending
      const advanceUpdates = {
        currentQuestion: currentQ + 1,
        phase: "question",
        phaseStartedAt: Date.now(),
      };

      // تحويل pending إلى active لكل لاعب
      const players = data.players || {};
      for (const [pid, p] of Object.entries(players)) {
        // تنظيف القدرات السابقة
        advanceUpdates[`players/${pid}/frozenForQuestion`] = null;
        advanceUpdates[`players/${pid}/scrambled`] = null;
        advanceUpdates[`players/${pid}/mutedFor`] = null;
        advanceUpdates[`players/${pid}/extraTime`] = null;
        advanceUpdates[`players/${pid}/activeMultiplier`] = null;
        advanceUpdates[`players/${pid}/activeShield`] = null;
        advanceUpdates[`players/${pid}/activeDoubleAnswer`] = null;
        advanceUpdates[`players/${pid}/activeRemoveWrong`] = null;
        advanceUpdates[`players/${pid}/activeVeto`] = null;

        // تحويل pending إلى active
        if (p.pendingFreeze) {
          advanceUpdates[`players/${pid}/frozenForQuestion`] = true;
          advanceUpdates[`players/${pid}/pendingFreeze`] = null;
        }
        if (p.pendingScramble) {
          advanceUpdates[`players/${pid}/scrambled`] = true;
          advanceUpdates[`players/${pid}/pendingScramble`] = null;
        }
        if (p.pendingMute) {
          advanceUpdates[`players/${pid}/mutedFor`] = p.pendingMute;
          advanceUpdates[`players/${pid}/pendingMute`] = null;
        }
        if (p.pendingExtraTime) {
          advanceUpdates[`players/${pid}/extraTime`] = p.pendingExtraTime;
          advanceUpdates[`players/${pid}/pendingExtraTime`] = null;
        }
        if (p.pendingMultiplier) {
          advanceUpdates[`players/${pid}/activeMultiplier`] = p.pendingMultiplier;
          advanceUpdates[`players/${pid}/pendingMultiplier`] = null;
        }
        if (p.pendingShield) {
          advanceUpdates[`players/${pid}/activeShield`] = true;
          advanceUpdates[`players/${pid}/pendingShield`] = null;
        }
        if (p.pendingDoubleAnswer) {
          advanceUpdates[`players/${pid}/activeDoubleAnswer`] = true;
          advanceUpdates[`players/${pid}/pendingDoubleAnswer`] = null;
        }
        if (p.pendingRemoveWrong) {
          advanceUpdates[`players/${pid}/activeRemoveWrong`] = true;
          advanceUpdates[`players/${pid}/pendingRemoveWrong`] = null;
        }
        if (p.pendingVeto) {
          advanceUpdates[`players/${pid}/activeVeto`] = true;
          advanceUpdates[`players/${pid}/pendingVeto`] = null;
        }
      }

      // تحويل التأثيرات العامة
      if (data.globalEffects?.pendingSpeedFor) {
        advanceUpdates[`globalEffects/speedFor`] = data.globalEffects.pendingSpeedFor;
        advanceUpdates[`globalEffects/pendingSpeedFor`] = null;
      }

      await update(ref(db, `arenas/${arenaCode}`), advanceUpdates);
    }
  }

  // ─── إيقاف المحرك ────────────────────────────────────────────────

  function stopEngine() {
    if (phaseTimerRef.current) {
      clearTimeout(phaseTimerRef.current);
      phaseTimerRef.current = null;
    }
    setEngineState("finished");
    isProcessingRef.current = false;
  }

  return {
    engineState,
    error,
  };
}

// ═══════════════════════════════════════════════════════════════════
// 4) Hook خفيف للقدرات (يستخدمه اللاعب)
// ═══════════════════════════════════════════════════════════════════

/**
 * usePowerups - hook لإدارة شراء واستخدام القدرات
 * يستخدمه اللاعب من شاشة اللعب
 */
export function usePowerups(arenaCode, playerId, playerData) {
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState(null);

  const myScore = playerData?.score || 0;
  const myStreak = playerData?.streak || 0;
  const ownedPowerups = playerData?.powerups || {};

  // ─── شراء قدرة ─────────────────────────────────────────────────

  async function purchasePowerup(powerupId) {
    const powerup = POWERUPS_CATALOG[powerupId];
    if (!powerup) {
      setError("قدرة غير موجودة");
      return false;
    }

    // التحقق من النقاط
    if (myScore < powerup.cost) {
      setError(`تحتاج ${powerup.cost} نقطة (لديك ${myScore})`);
      return false;
    }

    // التحقق من الستريك للقدرات الخاصة
    if (powerup.streakRequired && myStreak < powerup.streakRequired) {
      setError(`تحتاج سلسلة ${powerup.streakRequired} إجابات صحيحة متتالية`);
      return false;
    }

    // التحقق من عدم امتلاك نفس القدرة مرتين
    if (ownedPowerups[powerupId]) {
      setError("تمتلك هذه القدرة بالفعل");
      return false;
    }

    setPurchasing(true);
    setError(null);

    try {
      await update(ref(db, `arenas/${arenaCode}/players/${playerId}`), {
        score: myScore - powerup.cost,
        [`powerups/${powerupId}`]: {
          purchasedAt: Date.now(),
          used: false,
        },
      });
      return true;
    } catch (err) {
      console.error("Purchase failed:", err);
      setError("تعذر الشراء");
      return false;
    } finally {
      setPurchasing(false);
    }
  }

  // ─── استخدام قدرة ─────────────────────────────────────────────

  async function activatePowerup(powerupId, targetPlayerId = null) {
    const powerup = POWERUPS_CATALOG[powerupId];
    if (!powerup) return false;
    if (!ownedPowerups[powerupId] || ownedPowerups[powerupId].used) {
      setError("لا تمتلك هذه القدرة");
      return false;
    }

    if (powerup.requiresTarget && !targetPlayerId) {
      setError("اختر هدفاً");
      return false;
    }

    try {
      const updates = {
        [`players/${playerId}/powerups/${powerupId}/used`]: true,
        [`players/${playerId}/powerups/${powerupId}/usedAt`]: Date.now(),
      };

      // التأثيرات حسب نوع القدرة
      switch (powerupId) {
        // ─── القدرات الذاتية (تتفعل في السؤال التالي) ─────
        case "multiplier":
          updates[`players/${playerId}/pendingMultiplier`] = 2;
          break;
        case "shield":
          updates[`players/${playerId}/pendingShield`] = true;
          break;
        case "extraTime":
          updates[`players/${playerId}/pendingExtraTime`] = 10;
          break;
        case "doubleAnswer":
          updates[`players/${playerId}/pendingDoubleAnswer`] = true;
          break;
        case "removeWrong":
          updates[`players/${playerId}/pendingRemoveWrong`] = true;
          break;
        // ─── القدرات الموجهة (تطبق في السؤال التالي) ──────
        case "ice":
          updates[`players/${targetPlayerId}/pendingFreeze`] = true;
          break;
        case "mute":
          updates[`players/${targetPlayerId}/pendingMute`] = 3;
          break;
        case "scramble":
          updates[`players/${targetPlayerId}/pendingScramble`] = true;
          break;
        case "speed":
          updates[`globalEffects/pendingSpeedFor`] = { from: playerId, questions: 2 };
          break;
        case "steal":
          updates[`pendingActions/steal`] = { from: playerId, at: Date.now() };
          break;
        case "swap":
          updates[`pendingActions/swap`] = { from: playerId, target: targetPlayerId, at: Date.now() };
          break;
        case "veto":
          updates[`players/${targetPlayerId}/pendingVeto`] = true;
          break;
      }

      await update(ref(db, `arenas/${arenaCode}`), updates);
      return true;
    } catch (err) {
      console.error("Activate failed:", err);
      setError("تعذر التفعيل");
      return false;
    }
  }

  // ─── القدرات المتاحة للشراء حالياً ────────────────────────────

  function getAvailablePowerups() {
    return Object.values(POWERUPS_CATALOG).map((p) => ({
      ...p,
      canAfford: myScore >= p.cost,
      meetsStreak: !p.streakRequired || myStreak >= p.streakRequired,
      owned: !!ownedPowerups[p.id],
      used: ownedPowerups[p.id]?.used || false,
    }));
  }

  return {
    purchasePowerup,
    activatePowerup,
    getAvailablePowerups,
    purchasing,
    error,
    setError,
  };
}

// ═══════════════════════════════════════════════════════════════════
// 5) دوال مساعدة للتكامل مع ArenaCreate.jsx
// ═══════════════════════════════════════════════════════════════════

/**
 * استدعها من ArenaCreate قبل بدء اللعبة للتأكد من توفر أسئلة كافية
 */
export function validateConfig(config, questionBank) {
  const enabledLevels = Object.keys(config.levels).filter((l) => config.levels[l]);
  const matching = questionBank.filter(
    (q) =>
      config.categories.includes(q.category) &&
      enabledLevels.includes(q.level)
  );

  return {
    valid: matching.length >= config.questionsCount,
    available: matching.length,
    needed: config.questionsCount,
    perCategory: config.categories.reduce((acc, cat) => {
      acc[cat] = matching.filter((q) => q.category === cat).length;
      return acc;
    }, {}),
  };
}

/**
 * إعادة تعيين القدرات الزمنية في بداية كل سؤال
 * يُستدعى تلقائياً من المحرك
 */
export async function resetTransientEffects(arenaCode, players) {
  const updates = {};
  for (const playerId of Object.keys(players || {})) {
    updates[`players/${playerId}/frozenForQuestion`] = null;
    updates[`players/${playerId}/mutedFor`] = null;
    updates[`players/${playerId}/scrambled`] = null;
    updates[`players/${playerId}/extraTime`] = null;
    updates[`players/${playerId}/lastRoundPoints`] = null;
    updates[`players/${playerId}/lastAnswerCorrect`] = null;
  }
  if (Object.keys(updates).length > 0) {
    await update(ref(db, `arenas/${arenaCode}`), updates);
  }
}
