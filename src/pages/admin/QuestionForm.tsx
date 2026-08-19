// ═══════════════════════════════════════════════════════════
// نموذج إضافة/تعديل سؤال — مع معاينة حية كما يظهر للمتسابقين
// ═══════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import {
  Loader2, Save, Image as ImageIcon, Clapperboard, Type as TypeIcon,
  Plus, X, CheckCircle2, Trash2,
} from "lucide-react";
import {
  addCustomType, addCustomQuestion, updateCustomQuestion, deleteCustomQuestion,
  compressImage, parseYoutubeId, LEVELS, type CustomQuestion,
} from "../../lib/customBank";
import { useCustomTypes } from "../../lib/useCustomBank";
import { TYPE_LABEL, LEVEL_LABEL, type Question } from "../../types/game";
import { QuestionBody, OptionsDisplay } from "../../components/QuestionCard";

const BUILTIN_TYPES = Object.entries(TYPE_LABEL).map(([id, label]) => ({ id, label }));
const TF_OPTIONS = ["صح", "خطأ"];

interface Props {
  editTarget: CustomQuestion | null;
  onDone: () => void;
}

export default function QuestionForm({ editTarget, onDone }: Props) {
  const customTypes = useCustomTypes();
  const [typeId, setTypeId] = useState("multiple_choice");
  const [newTypeName, setNewTypeName] = useState("");
  const [media, setMedia] = useState<"none" | "image" | "video">("none");
  const [answerFormat, setAnswerFormat] = useState<"mc" | "tf">("mc");
  const [level, setLevel] = useState<"easy" | "medium" | "hard">("easy");
  const [text, setText] = useState("");
  const [options, setOptions] = useState<string[]>(["", "", "", ""]);
  const [correctIdx, setCorrectIdx] = useState(0);
  const [imageData, setImageData] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [vStart, setVStart] = useState("0");
  const [vEnd, setVEnd] = useState("25");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // تعبئة النموذج عند التعديل
  useEffect(() => {
    if (!editTarget) return;
    setTypeId(editTarget.type);
    setMedia(editTarget.video ? "video" : editTarget.image ? "image" : "none");
    setAnswerFormat(editTarget.format === "tf" || editTarget.options.length === 2 ? "tf" : "mc");
    setLevel(editTarget.level);
    setText(editTarget.question);
    const opts = [...editTarget.options];
    while (opts.length < 4) opts.push("");
    setOptions(opts.slice(0, 4));
    setCorrectIdx(editTarget.answer);
    setImageData(editTarget.image ?? null);
    setVideoUrl(editTarget.video ? `https://youtu.be/${editTarget.video.youtubeId}` : "");
    setVStart(String(editTarget.video?.start ?? 0));
    setVEnd(String(editTarget.video?.end ?? 25));
  }, [editTarget]);

  const ytId = videoUrl ? parseYoutubeId(videoUrl) : null;

  const validate = (): string => {
    if (!text.trim()) return "اكتب نص السؤال";
    if (typeId === "__new__" && newTypeName.trim().length < 2) return "اكتب اسم النوع الجديد";
    if (media === "image" && !imageData) return "ارفع الصورة أولاً";
    if (media === "video") {
      if (!ytId) return "رابط اليوتيوب غير صالح";
      if (Number(vEnd) <= Number(vStart)) return "ثانية النهاية لازم تكون أكبر من البداية";
      if (Number(vEnd) - Number(vStart) > 90) return "خلي المقطع أقصر من ٩٠ ثانية";
    }
    if (answerFormat === "mc" && options.some((o) => !o.trim())) return "عبّي الخيارات الأربعة كلها";
    return "";
  };

  const preview: Question | null = text.trim()
    ? {
        id: -1,
        type: typeId === "__new__" ? "custom" : typeId,
        category: "custom",
        level,
        question: text,
        options: answerFormat === "tf" ? TF_OPTIONS : options.map((o) => o || "…"),
        answer: correctIdx,
        image: media === "image" && imageData ? imageData : undefined,
        format: answerFormat,
      }
    : null;

  const save = async () => {
    const v = validate();
    if (v) {
      setErr(v);
      setMsg("");
      return;
    }
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      let finalType = typeId;
      if (typeId === "__new__") {
        const t = await addCustomType(newTypeName);
        finalType = t.id;
      }
      const payload: Omit<CustomQuestion, "id" | "createdAt"> = {
        type: finalType,
        category: "custom",
        level,
        question: text.trim(),
        options: answerFormat === "tf" ? TF_OPTIONS : options.map((o) => o.trim()),
        answer: correctIdx,
        format: answerFormat,
        image: media === "image" && imageData ? imageData : undefined,
        video: media === "video" && ytId
          ? { youtubeId: ytId, start: Number(vStart) || 0, end: Number(vEnd) || 25 }
          : undefined,
        disabled: false,
      };
      // Firebase يحذف القيم الفارغة — نبني الكائن بدون undefined
      const clean = JSON.parse(JSON.stringify(payload));
      if (editTarget) {
        await updateCustomQuestion(editTarget.id, clean);
        setMsg("تم تحديث السؤال بنجاح");
      } else {
        await addCustomQuestion(clean);
        setMsg("انحفظ السؤال في البنك — بيظهر في المباريات من الحين");
      }
      if (!editTarget) {
        setText("");
        setOptions(["", "", "", ""]);
        setCorrectIdx(0);
        setImageData(null);
        setVideoUrl("");
      }
    } catch (e) {
      setErr(`تعذّر الحفظ: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editTarget) return;
    setBusy(true);
    try {
      await deleteCustomQuestion(editTarget.id);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 animate-fade-up">
      {/* نوع السؤال */}
      <div className="glass-card p-5">
        <label className="block text-sm font-bold mb-2 text-gold-light/90">نوع السؤال</label>
        <div className="flex flex-wrap gap-2">
          {[...BUILTIN_TYPES, ...customTypes.map((t) => ({ id: t.id, label: t.name }))].map((t) => (
            <button
              key={t.id}
              onClick={() => setTypeId(t.id)}
              className={`rounded-full px-4 py-2 text-sm font-cairo font-bold border transition-colors ${
                typeId === t.id
                  ? "bg-gold/20 border-gold text-gold-light"
                  : "border-gold-faint/40 text-muted-foreground hover:border-gold/50"
              }`}
            >
              {t.label}
            </button>
          ))}
          <button
            onClick={() => setTypeId("__new__")}
            className={`rounded-full px-4 py-2 text-sm font-cairo font-bold border transition-colors flex items-center gap-1.5 ${
              typeId === "__new__"
                ? "bg-gold/20 border-gold text-gold-light"
                : "border-dashed border-gold/60 text-gold-light hover:bg-gold/10"
            }`}
          >
            <Plus className="w-4 h-4" />
            نوع جديد باسمك
          </button>
        </div>
        {typeId === "__new__" && (
          <input
            value={newTypeName}
            onChange={(e) => setNewTypeName(e.target.value)}
            placeholder="اسم النوع الجديد — مثال: تراث قطري، كرة قدم، أغاني…"
            className="input-night mt-3"
            maxLength={30}
          />
        )}
      </div>

      {/* شكل السؤال (وسائط) */}
      <div className="glass-card p-5">
        <label className="block text-sm font-bold mb-2 text-gold-light/90">شكل السؤال</label>
        <div className="grid grid-cols-3 gap-2">
          {([
            { id: "none", label: "كلام فقط", icon: TypeIcon },
            { id: "image", label: "صورة", icon: ImageIcon },
            { id: "video", label: "فيديو", icon: Clapperboard },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setMedia(id)}
              className={`flex items-center justify-center gap-2 rounded-xl py-2.5 font-cairo font-bold border transition-colors ${
                media === id
                  ? "bg-gold/20 border-gold text-gold-light"
                  : "border-gold-faint/40 text-muted-foreground hover:border-gold/50"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {media === "image" && (
          <div className="mt-4">
            <label className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gold/50 p-6 cursor-pointer hover:bg-gold/5 transition-colors">
              <ImageIcon className="w-8 h-8 text-gold-light" />
              <span className="font-cairo font-bold text-gold-light">
                {imageData ? "غيّر الصورة" : "ارفع الصورة من جهازك"}
              </span>
              <span className="text-xs text-muted-foreground">تُضغط وتُصغّر تلقائياً قبل الحفظ</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    setImageData(await compressImage(f));
                    setErr("");
                  } catch {
                    setErr("تعذّرت قراءة الصورة — جرّب صورة ثانية");
                  }
                }}
              />
            </label>
            {imageData && (
              <div className="relative mt-3 w-full max-w-xs mx-auto">
                <img src={imageData} alt="معاينة" className="rounded-2xl border-2 border-gold/40 w-full" />
                <button
                  onClick={() => setImageData(null)}
                  className="absolute top-2 left-2 rounded-full bg-night/80 border border-maroon/60 p-1.5 text-maroon-light"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {media === "video" && (
          <div className="mt-4 flex flex-col gap-3">
            <input
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="رابط مقطع اليوتيوب…"
              className="input-night text-left"
              dir="ltr"
            />
            {videoUrl && (
              <p className={`text-xs font-bold ${ytId ? "text-emerald2-light" : "text-maroon-light"}`}>
                {ytId ? "الرابط صالح" : "الرابط غير صالح — انسخه من يوتيوب كاملاً"}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">من ثانية</label>
                <input
                  type="number"
                  min={0}
                  value={vStart}
                  onChange={(e) => setVStart(e.target.value)}
                  className="input-night text-center"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">إلى ثانية</label>
                <input
                  type="number"
                  min={1}
                  value={vEnd}
                  onChange={(e) => setVEnd(e.target.value)}
                  className="input-night text-center"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              تقدر تاخذ أي مقطع يوتيوب طويل وتحدد منه المقطوعة اللي تبيها (يفضل ٢٠-٣٠ ثانية) — واللعبة تعرض هذا الجزء فقط ثم يظهر السؤال. ملاحظة: المقطع لازم يكون «عام» أو «غير مدرج» — «خاص» ما يشتغل.
            </p>
          </div>
        )}
      </div>

      {/* طريقة الإجابة والمستوى */}
      <div className="glass-card p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-bold mb-2 text-gold-light/90">طريقة الإجابة</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setAnswerFormat("mc")}
              className={`rounded-xl py-2.5 font-cairo font-bold border transition-colors ${
                answerFormat === "mc" ? "bg-gold/20 border-gold text-gold-light" : "border-gold-faint/40 text-muted-foreground"
              }`}
            >
              ٤ اختيارات
            </button>
            <button
              onClick={() => {
                setAnswerFormat("tf");
                setCorrectIdx(0);
              }}
              className={`rounded-xl py-2.5 font-cairo font-bold border transition-colors ${
                answerFormat === "tf" ? "bg-gold/20 border-gold text-gold-light" : "border-gold-faint/40 text-muted-foreground"
              }`}
            >
              صح / خطأ
            </button>
          </div>
        </div>
        <div>
          <label className="block text-sm font-bold mb-2 text-gold-light/90">مستوى الصعوبة</label>
          <div className="grid grid-cols-3 gap-2">
            {LEVELS.map((l) => (
              <button
                key={l}
                onClick={() => setLevel(l)}
                className={`rounded-xl py-2.5 font-cairo font-bold border transition-colors ${
                  level === l ? "bg-gold/20 border-gold text-gold-light" : "border-gold-faint/40 text-muted-foreground"
                }`}
              >
                {LEVEL_LABEL[l]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* نص السؤال والخيارات */}
      <div className="glass-card p-5">
        <label className="block text-sm font-bold mb-2 text-gold-light/90">نص السؤال</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="اكتب السؤال هنا…"
          className="input-night min-h-20 mb-4"
          maxLength={300}
        />
        {answerFormat === "mc" ? (
          <>
            <label className="block text-sm font-bold mb-2 text-gold-light/90">
              الخيارات الأربعة — اضغط الدائرة لتحديد الإجابة الصحيحة
            </label>
            <div className="flex flex-col gap-2.5">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-3">
                  <button
                    onClick={() => setCorrectIdx(i)}
                    className={`shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center transition-colors ${
                      correctIdx === i
                        ? "border-emerald2-light bg-emerald2 text-white"
                        : "border-gold-faint/50 hover:border-gold"
                    }`}
                    title="الإجابة الصحيحة"
                  >
                    {correctIdx === i && <CheckCircle2 className="w-5 h-5" />}
                  </button>
                  <input
                    value={opt}
                    onChange={(e) => setOptions((prev) => prev.map((o, j) => (j === i ? e.target.value : o)))}
                    placeholder={`الخيار ${["أ", "ب", "ج", "د"][i]}${correctIdx === i ? " (الإجابة الصحيحة)" : ""}`}
                    className="input-night"
                    maxLength={120}
                  />
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <label className="block text-sm font-bold mb-2 text-gold-light/90">الإجابة الصحيحة</label>
            <div className="grid grid-cols-2 gap-2">
              {TF_OPTIONS.map((o, i) => (
                <button
                  key={o}
                  onClick={() => setCorrectIdx(i)}
                  className={`rounded-xl py-2.5 font-cairo font-bold border transition-colors ${
                    correctIdx === i
                      ? "bg-emerald2/20 border-emerald2-light text-emerald2-light"
                      : "border-gold-faint/40 text-muted-foreground"
                  }`}
                >
                  {o}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* المعاينة */}
      {preview && (
        <div className="glass-card !border-gold/50 p-5">
          <p className="text-xs text-gold-light/80 font-bold mb-3">معاينة — هكذا يظهر للمتسابقين:</p>
          <QuestionBody q={preview} />
          <div className="mt-4">
            <OptionsDisplay q={preview} reveal chosen={correctIdx} />
          </div>
        </div>
      )}

      {err && (
        <p className="text-maroon-light text-sm font-bold bg-maroon/15 border border-maroon/40 rounded-xl px-4 py-2.5">{err}</p>
      )}
      {msg && (
        <p className="text-emerald2-light text-sm font-bold bg-emerald2/10 border border-emerald2/40 rounded-xl px-4 py-2.5 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          {msg}
        </p>
      )}

      <div className="flex gap-3">
        <button onClick={save} disabled={busy} className="btn-gold shine flex-1 flex items-center justify-center gap-2 text-lg">
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          {editTarget ? "حفظ التعديلات" : "احفظ السؤال في البنك"}
        </button>
        {editTarget && (
          <button onClick={remove} disabled={busy} className="btn-maroon flex items-center gap-2">
            <Trash2 className="w-5 h-5" />
            حذف
          </button>
        )}
      </div>
      {editTarget && (
        <button onClick={onDone} className="text-sm text-muted-foreground hover:text-gold-light transition-colors">
          إلغاء التعديل والعودة للقائمة
        </button>
      )}
    </div>
  );
}
