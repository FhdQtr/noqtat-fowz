import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  CirclePlay,
  Crown,
  Gamepad2,
  Gauge,
  MonitorPlay,
  RotateCcw,
  Settings2,
  Sparkles,
  Trophy,
  Users,
  Volume2,
  X,
  Zap,
} from "lucide-react";
import LiveTimer from "../components/LiveTimer";
import { haptic } from "../lib/haptics";
import { isAudioMuted, setAudioMuted, sfx, unlockAudio } from "../lib/sounds";
import "./MidanLiveDemo.css";

type View = "home" | "setup" | "game" | "summary";

type DemoQuestion = {
  eyebrow: string;
  prompt: string;
  answers: string[];
  correct: number;
};

const DEMO_QUESTIONS: DemoQuestion[] = [
  {
    eyebrow: "معلومات عامة",
    prompt: "ما الكوكب الأقرب إلى الشمس؟",
    answers: ["الزهرة", "عطارد", "الأرض", "المريخ"],
    correct: 1,
  },
  {
    eyebrow: "صح أم خطأ",
    prompt: "استضافت قطر كأس العالم لكرة القدم عام 2022.",
    answers: ["صح", "خطأ"],
    correct: 0,
  },
  {
    eyebrow: "ثقافة سريعة",
    prompt: "كم لونًا في علم دولة قطر؟",
    answers: ["لون واحد", "لونان", "ثلاثة ألوان", "أربعة ألوان"],
    correct: 1,
  },
];

function Wordmark() {
  return (
    <div className="live-wordmark" aria-label="الميدان">
      <span>الميدان</span>
      <i aria-hidden="true" />
    </div>
  );
}

function ScoreChip({ name, score, active, tone }: { name: string; score: number; active: boolean; tone: "blue" | "coral" }) {
  return (
    <div className="live-score" data-active={active} data-tone={tone}>
      <span className="live-score__signal" aria-hidden="true" />
      <span className="live-score__name">{name}</span>
      <strong>{score}</strong>
    </div>
  );
}

export default function MidanLiveDemo() {
  const [view, setView] = useState<View>("home");
  const [setupStep, setSetupStep] = useState(0);
  const [teams, setTeams] = useState<[string, string]>(["فريق البرق", "فريق الموج"]);
  const [duration, setDuration] = useState(20);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [turn, setTurn] = useState(0);
  const [scores, setScores] = useState<[number, number]>([0, 0]);
  const [selected, setSelected] = useState<number | null>(null);
  const [expired, setExpired] = useState(false);
  const [timerKey, setTimerKey] = useState(0);
  const [audioMuted, setAudioMutedState] = useState(isAudioMuted);

  const question = DEMO_QUESTIONS[questionIndex];
  const answered = selected !== null || expired;
  const winner = scores[0] === scores[1] ? null : scores[0] > scores[1] ? 0 : 1;

  const setupTitle = ["سمّ الفرق", "اضبط الجولة", "راجع الميدان"][setupStep];
  const setupHint = [
    "اسمان واضحان يكفيان لبدء التجربة.",
    "ثلاثة أسئلة محلية، بلا اتصال بقاعدة البيانات.",
    "كل شيء جاهز. ابدأ عندما يجتمع الفريقان.",
  ][setupStep];

  const resetMatch = () => {
    setQuestionIndex(0);
    setTurn(0);
    setScores([0, 0]);
    setSelected(null);
    setExpired(false);
    setTimerKey((key) => key + 1);
  };

  const openSetup = () => {
    unlockAudio();
    sfx.click();
    haptic("light");
    setSetupStep(0);
    setView("setup");
  };

  const startMatch = () => {
    resetMatch();
    setView("game");
    sfx.questionIn();
  };

  const chooseAnswer = (index: number) => {
    if (answered) return;
    setSelected(index);
    const correct = index === question.correct;
    if (correct) {
      setScores((current) => {
        const next: [number, number] = [...current];
        next[turn] += 100;
        return next;
      });
      sfx.correct();
      haptic("success");
    } else {
      sfx.wrong();
      haptic("error");
    }
  };

  const timeOut = () => {
    setExpired(true);
    sfx.timeout();
    haptic("error");
  };

  const nextQuestion = () => {
    if (questionIndex === DEMO_QUESTIONS.length - 1) {
      setView("summary");
      sfx.fanfare();
      return;
    }
    setQuestionIndex((index) => index + 1);
    setTurn((current) => (current === 0 ? 1 : 0));
    setSelected(null);
    setExpired(false);
    setTimerKey((key) => key + 1);
    sfx.questionIn();
  };

  const progress = useMemo(() => ((questionIndex + (answered ? 1 : 0)) / DEMO_QUESTIONS.length) * 100, [answered, questionIndex]);

  return (
    <main className="live-app" dir="rtl" data-view={view}>
      <header className="live-header">
        <button
          className="live-icon-button"
          type="button"
          aria-label={view === "home" ? "الإعدادات" : "العودة"}
          onClick={() => {
            sfx.click();
            if (view === "home") {
              openSetup();
              return;
            }
            setView("home");
          }}
        >
          {view === "home" ? <Settings2 /> : <ArrowRight />}
        </button>
        <Wordmark />
        <span className="live-demo-label"><i /> تجربة تفاعلية</span>
      </header>

      {view === "home" && (
        <section className="live-view live-home" aria-labelledby="live-title">
          <div className="live-home__copy">
            <p className="live-kicker"><Zap aria-hidden="true" /> مواجهة جماعية مباشرة</p>
            <h1 id="live-title">كل جلسة لها <span>ميدانها.</span></h1>
            <p className="live-lede">ابدأ الجولة، مرّر الدور بين الفرق، وشاهد النتيجة تتغيّر في لحظتها.</p>
            <button className="live-launch" type="button" onClick={openSetup}>
              <span className="live-launch__icon"><CirclePlay aria-hidden="true" /></span>
              <span><strong>ميدان جديد</strong><small>ثلاثة أسئلة للتجربة</small></span>
              <ChevronLeft aria-hidden="true" />
            </button>
          </div>

          <div className="live-arena" aria-label="معاينة مباشرة للمباراة">
            <div className="live-arena__orbit" aria-hidden="true" />
            <div className="live-arena__topline">
              <span>مباراة تجريبية</span>
              <span className="live-status"><i /> مباشر</span>
            </div>
            <div className="live-arena__scores">
              <ScoreChip name="فريق البرق" score={200} active tone="blue" />
              <ScoreChip name="فريق الموج" score={100} active={false} tone="coral" />
            </div>
            <div className="live-arena__question">
              <span>السؤال ٢ من ٣</span>
              <strong>أي كوكب يُعرف بالكوكب الأحمر؟</strong>
            </div>
            <LiveTimer duration={18} running={false} resetKey={0} compact onComplete={() => undefined} />
          </div>

          <nav className="live-dock" aria-label="طرق الدخول">
            <button type="button" onClick={openSetup}><Users /><span>دخول فريق</span></button>
            <button type="button" onClick={openSetup}><MonitorPlay /><span>شاشة الجمهور</span></button>
            <button type="button" onClick={openSetup}><Trophy /><span>تحدي فردي</span></button>
            <button
              type="button"
              aria-pressed={!audioMuted}
              onClick={() => {
                const next = !audioMuted;
                setAudioMuted(next);
                setAudioMutedState(next);
              }}
            >
              <Volume2 /><span>{audioMuted ? "تشغيل الصوت" : "الصوت يعمل"}</span>
            </button>
          </nav>
        </section>
      )}

      {view === "setup" && (
        <section className="live-view live-setup" aria-labelledby="setup-title">
          <div className="live-setup__stage" aria-hidden="true">
            <div className="live-stage-number">0{setupStep + 1}</div>
            <div className="live-stage-line"><i style={{ transform: `scaleX(${(setupStep + 1) / 3})` }} /></div>
            <p>من ثلاث خطوات</p>
            <div className="live-stage-preview">
              <Crown />
              <strong>{teams[0]}</strong>
              <span>ضد</span>
              <strong>{teams[1]}</strong>
            </div>
          </div>

          <div className="live-setup__panel">
            <div className="live-section-heading">
              <span>الخطوة {setupStep + 1}</span>
              <h1 id="setup-title">{setupTitle}</h1>
              <p>{setupHint}</p>
            </div>

            {setupStep === 0 && (
              <div className="live-fields">
                {teams.map((team, index) => (
                  <label key={index} className="live-field">
                    <span><i data-team={index} aria-hidden="true" /> الفريق {index + 1}</span>
                    <input
                      value={team}
                      maxLength={18}
                      onChange={(event) => setTeams((current) => {
                        const next: [string, string] = [...current];
                        next[index] = event.target.value;
                        return next;
                      })}
                    />
                  </label>
                ))}
              </div>
            )}

            {setupStep === 1 && (
              <div className="live-round-options">
                <div className="live-readout"><Gamepad2 /><span><strong>٣</strong> أسئلة تجريبية</span></div>
                <fieldset>
                  <legend>وقت السؤال</legend>
                  <div className="live-segmented">
                    {[15, 20, 30].map((seconds) => (
                      <button
                        type="button"
                        key={seconds}
                        data-selected={duration === seconds}
                        onClick={() => { setDuration(seconds); sfx.click(); }}
                      >
                        {seconds} ث
                      </button>
                    ))}
                  </div>
                </fieldset>
              </div>
            )}

            {setupStep === 2 && (
              <div className="live-review">
                <div><Users /><span>الفِرق</span><strong>{teams[0]} · {teams[1]}</strong></div>
                <div><Gauge /><span>الإيقاع</span><strong>{duration} ثانية لكل سؤال</strong></div>
                <div><Sparkles /><span>المحتوى</span><strong>٣ أسئلة محلية</strong></div>
              </div>
            )}

            <div className="live-setup__actions">
              <button className="live-secondary" type="button" onClick={() => setupStep === 0 ? setView("home") : setSetupStep((step) => step - 1)}>
                السابق
              </button>
              <button
                className="live-primary"
                type="button"
                disabled={setupStep === 0 && teams.some((team) => !team.trim())}
                onClick={() => setupStep === 2 ? startMatch() : setSetupStep((step) => step + 1)}
              >
                {setupStep === 2 ? "ابدأ المباراة" : "التالي"}
                <ArrowLeft aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>
      )}

      {view === "game" && (
        <section className="live-view live-game" aria-labelledby="question-title">
          <div className="live-game__rail">
            <div className="live-game__scores">
              <ScoreChip name={teams[0]} score={scores[0]} active={turn === 0} tone="blue" />
              <ScoreChip name={teams[1]} score={scores[1]} active={turn === 1} tone="coral" />
            </div>
            <div className="live-game__progress" aria-label={`السؤال ${questionIndex + 1} من ${DEMO_QUESTIONS.length}`}>
              <span>0{questionIndex + 1} / 0{DEMO_QUESTIONS.length}</span>
              <i><b style={{ transform: `scaleX(${progress / 100})` }} /></i>
            </div>
          </div>

          <div className="live-game__body">
            <aside className="live-game__timer">
              <LiveTimer duration={duration} running={!answered} resetKey={timerKey} onComplete={timeOut} />
              <span>دور {teams[turn]}</span>
            </aside>

            <div className="live-question">
              <p>{question.eyebrow}</p>
              <h1 id="question-title">{question.prompt}</h1>
              <div className="live-answers" data-count={question.answers.length}>
                {question.answers.map((answer, index) => {
                  const isSelected = selected === index;
                  const isCorrect = answered && index === question.correct;
                  const isWrong = isSelected && index !== question.correct;
                  return (
                    <button
                      type="button"
                      key={answer}
                      disabled={answered}
                      data-selected={isSelected}
                      data-correct={isCorrect}
                      data-wrong={isWrong}
                      onClick={() => chooseAnswer(index)}
                    >
                      <span>{String.fromCharCode(65 + index)}</span>
                      <strong>{answer}</strong>
                      <i aria-hidden="true">{isCorrect ? <Check /> : isWrong ? <X /> : null}</i>
                    </button>
                  );
                })}
              </div>

              {answered && (
                <div className="live-answer-result" role="status" data-success={selected === question.correct}>
                  <span>{expired ? "انتهى الوقت" : selected === question.correct ? "إجابة صحيحة · +100" : "إجابة غير صحيحة"}</span>
                  <button type="button" onClick={nextQuestion}>
                    {questionIndex === DEMO_QUESTIONS.length - 1 ? "عرض النتيجة" : "السؤال التالي"}
                    <ArrowLeft />
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {view === "summary" && (
        <section className="live-view live-summary" aria-labelledby="summary-title">
          <div className="live-summary__signal"><Trophy /></div>
          <p>انتهت التجربة</p>
          <h1 id="summary-title">{winner === null ? "تعادل جميل" : `${teams[winner]} يفوز`}</h1>
          <div className="live-summary__score">
            <span>{teams[0]} <strong>{scores[0]}</strong></span>
            <i>—</i>
            <span><strong>{scores[1]}</strong> {teams[1]}</span>
          </div>
          <div className="live-summary__actions">
            <button className="live-primary" type="button" onClick={startMatch}><RotateCcw />إعادة التجربة</button>
            <button className="live-secondary" type="button" onClick={() => setView("home")}>العودة للرئيسية</button>
          </div>
        </section>
      )}

      <footer className="live-credit">فكرة وتصميم: <strong>فهد القحطاني</strong></footer>
    </main>
  );
}
