// ═══════════════════════════════════════════════════════════
// نقطة فوز — مؤثرات صوتية مولّدة بالكود (WebAudio) بدون ملفات
// ═══════════════════════════════════════════════════════════

let ctx: AudioContext | null = null;

function ac(): AudioContext {
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(
  freq: number,
  start: number,
  dur: number,
  type: OscillatorType = "sine",
  vol = 0.18,
  slideTo?: number
) {
  const c = ac();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  const t = c.currentTime + start;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export const sfx = {
  /** نقرة خفيفة عند الضغط */
  click() {
    tone(660, 0, 0.08, "triangle", 0.12);
  },
  /** قفل إجابة */
  lock() {
    tone(440, 0, 0.1, "square", 0.08);
    tone(880, 0.08, 0.16, "triangle", 0.14);
  },
  /** إجابة صحيحة */
  correct() {
    tone(523, 0, 0.14, "triangle", 0.16);
    tone(659, 0.1, 0.14, "triangle", 0.16);
    tone(784, 0.2, 0.22, "triangle", 0.18);
    tone(1047, 0.3, 0.35, "sine", 0.16);
  },
  /** إجابة خاطئة */
  wrong() {
    tone(220, 0, 0.2, "sawtooth", 0.12, 180);
    tone(160, 0.15, 0.35, "sawtooth", 0.1, 120);
  },
  /** سرقة السؤال لفرقة ثانية */
  steal() {
    tone(880, 0, 0.12, "triangle", 0.14, 660);
    tone(660, 0.1, 0.12, "triangle", 0.14, 880);
    tone(880, 0.2, 0.18, "triangle", 0.16);
  },
  /** عدّ تنازلي */
  tick() {
    tone(990, 0, 0.06, "sine", 0.1);
  },
  /** آخر ٣ ثواني */
  tickFinal() {
    tone(1320, 0, 0.09, "square", 0.09);
  },
  /** ظهور سؤال جديد */
  questionIn() {
    tone(392, 0, 0.12, "sine", 0.1);
    tone(523, 0.09, 0.16, "sine", 0.12);
  },
  /** فوز نهائي */
  fanfare() {
    const seq: [number, number][] = [
      [523, 0], [523, 0.14], [523, 0.28], [659, 0.42],
      [784, 0.62], [659, 0.78], [784, 0.92], [1047, 1.1],
    ];
    seq.forEach(([f, s]) => tone(f, s, 0.22, "triangle", 0.16));
    tone(1319, 1.3, 0.6, "sine", 0.14);
  },
  /** دخول لاعب جديد */
  join() {
    tone(740, 0, 0.09, "sine", 0.09);
    tone(988, 0.07, 0.12, "sine", 0.1);
  },
};

/** فتح قناة الصوت بعد أول تفاعل من المستخدم (سياسة المتصفحات) */
export function unlockAudio() {
  try {
    ac();
  } catch {
    /* تجاهل */
  }
}
