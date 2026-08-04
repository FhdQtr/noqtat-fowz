import { useMemo, useState } from "react";
import { addCustomQuestion, addCustomType } from "../../lib/customBank";
import { useCustomTypes } from "../../lib/useCustomBank";
import { TYPE_LABEL, LEVEL_LABEL, type QuestionLevel, type QuestionType } from "../../types/game";
import { Button } from "../../components/ui/button";
import { ClipboardPaste, Upload, CheckCircle2, XCircle, Loader2 } from "lucide-react";

// ═══ صيغة السطور المدعومة ═══
// صح/خطأ:        النوع | المستوى | السؤال | صح أو خطأ
// اختيار متعدد:  النوع | المستوى | السؤال | خيار1 | خيار2 | خيار3 | خيار4 | رقم الإجابة الصحيحة (1-4)
// المستوى يقبل: سهل / متوسط / صعب  أو  easy / medium / hard  أو  1 / 2 / 3

interface ParsedRow {
  lineNo: number;
  raw: string;
  ok: boolean;
  error?: string;
  typeName?: string;
  level?: QuestionLevel;
  question?: string;
  options?: string[];
  answer?: number; // فهرس الإجابة الصحيحة داخل الخيارات
  format?: "tf" | "mc";
}

function parseLevel(s: string): QuestionLevel | null {
  const v = s.trim();
  if (["سهل", "easy", "1"].includes(v)) return "easy";
  if (["متوسط", "medium", "2"].includes(v)) return "medium";
  if (["صعب", "hard", "3"].includes(v)) return "hard";
  return null;
}

function parseLine(line: string, lineNo: number): ParsedRow {
  const parts = line.split("|").map((p) => p.trim());
  const base: ParsedRow = { lineNo, raw: line, ok: false };
  if (parts.length !== 4 && parts.length !== 8) {
    return { ...base, error: `عدد الخانات غير صحيح (${parts.length}) — الصح/خطأ يحتاج 4 خانات والاختيارات يحتاج 8` };
  }
  const [typeName, levelStr, text] = parts;
  if (typeName.length < 2) return { ...base, error: "اسم النوع قصير جداً" };
  const level = parseLevel(levelStr);
  if (!level) return { ...base, error: `المستوى «${levelStr}» غير معروف — استخدم سهل/متوسط/صعب` };
  if (text.length < 4) return { ...base, error: "نص السؤال قصير جداً" };

  if (parts.length === 4) {
    const tf = parts[3];
    if (tf !== "صح" && tf !== "خطأ") return { ...base, error: "خانة الجواب يجب أن تكون «صح» أو «خطأ»" };
    return { ...base, ok: true, typeName, level, question: text, options: ["صح", "خطأ"], answer: tf === "صح" ? 0 : 1, format: "tf" };
  }

  const options = parts.slice(3, 7);
  if (options.some((o) => o.length === 0)) return { ...base, error: "أحد الخيارات الأربعة فارغ" };
  const correctNum = Number(parts[7]);
  if (![1, 2, 3, 4].includes(correctNum)) return { ...base, error: "رقم الإجابة الصحيحة يجب أن يكون من 1 إلى 4" };
  return { ...base, ok: true, typeName, level, question: text, options, answer: correctNum - 1, format: "mc" };
}

export default function BulkImport() {
  const customTypes = useCustomTypes();
  const [text, setText] = useState("");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ ok: number; failed: number; newTypes: string[] } | null>(null);

  const rows = useMemo<ParsedRow[]>(() => {
    return text
      .split("\n")
      .map((l, i) => ({ l: l.trim(), i }))
      .filter((x) => x.l.length > 0)
      .map((x) => parseLine(x.l, x.i + 1));
  }, [text]);

  const okRows = rows.filter((r) => r.ok);
  const badRows = rows.filter((r) => !r.ok);

  const doImport = async () => {
    if (okRows.length === 0 || importing) return;
    setImporting(true);
    setResult(null);
    setProgress({ done: 0, total: okRows.length });

    // خريطة اسم النوع → معرّفه (الأنواع الأصلية بعناوينها + أنواعك المخصصة)
    const nameToId = new Map<string, QuestionType>();
    for (const [id, label] of Object.entries(TYPE_LABEL)) nameToId.set(label, id as QuestionType);
    for (const t of customTypes) nameToId.set(t.name, t.id);

    let ok = 0;
    let failed = 0;
    const newTypes: string[] = [];

    for (const row of okRows) {
      try {
        let typeId = nameToId.get(row.typeName!);
        if (!typeId) {
          const created = await addCustomType(row.typeName!);
          typeId = created.id;
          nameToId.set(row.typeName!, typeId);
          if (!newTypes.includes(created.name)) newTypes.push(created.name);
        }
        await addCustomQuestion({
          type: typeId,
          category: "custom",
          level: row.level!,
          question: row.question!,
          options: row.options!,
          answer: row.answer!,
          format: row.format!,
        });
        ok++;
      } catch {
        failed++;
      }
      setProgress({ done: ok + failed, total: okRows.length });
    }

    setProgress(null);
    setResult({ ok, failed, newTypes });
    setImporting(false);
    if (failed === 0) setText("");
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
      <h3 className="font-black text-sm flex items-center gap-2"><ClipboardPaste className="w-4 h-4 text-gold" /> إضافة جماعية — الصق أسئلة كثيرة دفعة واحدة</h3>

      <div className="rounded-xl bg-navy/60 border border-white/10 p-3 text-xs leading-6 text-white/70 space-y-1">
        <p className="font-bold text-white">صيغة السطر (خانات مفصولة بالعلامة | ):</p>
        <p>سؤال صح/خطأ: <span className="text-gold" dir="rtl">النوع | المستوى | السؤال | صح أو خطأ</span></p>
        <p>سؤال اختيارات: <span className="text-gold" dir="rtl">النوع | المستوى | السؤال | خيار1 | خيار2 | خيار3 | خيار4 | رقم الإجابة الصحيحة</span></p>
        <p>المستوى: سهل / متوسط / صعب — والنوع: اسم نوع موجود (مثل «اختيار من متعدد» أو «صح أم خطأ» أو اسم نوع أنشأته) أو اسم جديد وسيُنشأ لك تلقائياً.</p>
        <p className="text-white/50">مثال: اختيار من متعدد | سهل | ما هي عاصمة قطر؟ | الدوحة | الريان | الوكرة | الخور | 1</p>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        placeholder={"اختيار من متعدد | سهل | ما هي عاصمة قطر؟ | الدوحة | الريان | الوكرة | الخور | 1\nصح أم خطأ | متوسط | قطر أكبر مصدّر للغاز المسال في العالم | صح"}
        className="w-full rounded-xl bg-white/5 border border-white/10 p-3 text-sm leading-7 placeholder:text-white/25 focus:outline-none focus:border-gold/50"
        dir="rtl"
      />

      {rows.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-bold">
            معاينة: <span className="text-emerald-300">{okRows.length} جاهز</span>
            {badRows.length > 0 && <span className="text-red-300"> • {badRows.length} فيه خطأ</span>}
          </p>
          <div className="max-h-64 overflow-y-auto space-y-1 pl-1">
            {rows.map((r) => (
              <div key={r.lineNo} className={`rounded-lg border px-3 py-2 text-xs flex items-start gap-2 ${r.ok ? "border-white/10 bg-white/5" : "border-red-500/30 bg-red-500/10"}`}>
                {r.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />}
                <div className="min-w-0">
                  {r.ok ? (
                    <p className="leading-5">
                      <span className="text-white/50">سطر {r.lineNo}:</span> {r.question}
                      <span className="text-white/50"> — {r.typeName} • {LEVEL_LABEL[r.level!]} • الجواب: </span>
                      <span className="text-gold">{r.options![r.answer!]}</span>
                    </p>
                  ) : (
                    <p className="leading-5 text-red-200"><span className="text-white/50">سطر {r.lineNo}:</span> {r.error}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {progress && (
        <p className="text-sm font-bold text-gold flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> جاري الاستيراد... {progress.done} من {progress.total}
        </p>
      )}
      {result && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm leading-7">
          تم استيراد <span className="font-black text-emerald-300">{result.ok}</span> سؤال بنجاح
          {result.failed > 0 && <> — وتعذّر استيراد {result.failed}</>}
          {result.newTypes.length > 0 && <><br />أنواع جديدة أُنشئت: <span className="text-gold font-bold">{result.newTypes.join("، ")}</span></>}
        </div>
      )}

      <Button onClick={doImport} disabled={okRows.length === 0 || importing} className="w-full bg-gold text-navy font-black hover:bg-gold/90 h-11">
        <Upload className="w-4 h-4 ml-2" /> استيراد {okRows.length > 0 ? `${okRows.length} سؤال` : "الأسئلة"}
      </Button>
    </div>
  );
}
