import { useMemo, useState } from "react";
import { QUESTIONS } from "../../data/questions";
import { useCustomQuestions, useCustomTypes } from "../../lib/useCustomBank";
import { deleteCustomQuestion, setQuestionDisabled, type CustomQuestion } from "../../lib/customBank";
import { LEVEL_LABEL, typeLabel } from "../../types/game";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { Search, Pencil, Trash2, EyeOff, Eye, Database, BarChart3 } from "lucide-react";

export default function ManageBank({ onEdit }: { onEdit: (q: CustomQuestion) => void }) {
  const customTypes = useCustomTypes();
  const customQs = useCustomQuestions();
  const [search, setSearch] = useState("");
  const [fType, setFType] = useState<string>("all");
  const [fLevel, setFLevel] = useState<string>("all");
  const [busyId, setBusyId] = useState<number | null>(null);

  const typeOptions = useMemo(() => {
    const ids = new Set<string>();
    QUESTIONS.forEach((q) => ids.add(q.type));
    customQs.forEach((q) => ids.add(q.type));
    customTypes.forEach((t) => ids.add(t.id));
    return Array.from(ids);
  }, [customQs, customTypes]);

  const stats = useMemo(() => {
    const m = new Map<string, { easy: number; medium: number; hard: number; custom: number }>();
    for (const t of typeOptions) m.set(t, { easy: 0, medium: 0, hard: 0, custom: 0 });
    const bump = (type: string, level: "easy" | "medium" | "hard", isCustom: boolean) => {
      const s = m.get(type) ?? { easy: 0, medium: 0, hard: 0, custom: 0 };
      s[level]++;
      if (isCustom) s.custom++;
      m.set(type, s);
    };
    QUESTIONS.forEach((q) => bump(q.type, q.level, false));
    customQs.forEach((q) => bump(q.type, q.level, true));
    return Array.from(m.entries()).sort((a, b) => typeLabel(a[0]).localeCompare(typeLabel(b[0]), "ar"));
  }, [typeOptions, customQs]);

  const filtered = useMemo(() => {
    return customQs.filter((q) => {
      if (fType !== "all" && q.type !== fType) return false;
      if (fLevel !== "all" && q.level !== fLevel) return false;
      if (search.trim() && !q.question.includes(search.trim())) return false;
      return true;
    });
  }, [customQs, fType, fLevel, search]);

  const toggleDisabled = async (q: CustomQuestion) => {
    setBusyId(q.id);
    try { await setQuestionDisabled(q.id, !q.disabled); } finally { setBusyId(null); }
  };

  const remove = async (q: CustomQuestion) => {
    if (!window.confirm(`حذف هذا السؤال نهائياً؟\n\n«${q.question.slice(0, 80)}»`)) return;
    setBusyId(q.id);
    try { await deleteCustomQuestion(q.id); } finally { setBusyId(null); }
  };

  return (
    <div className="space-y-5">
      {/* عدادات */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <h3 className="font-black text-sm mb-3 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-gold" /> عدّاد الأسئلة حسب النوع والمستوى</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-white/50 text-xs border-b border-white/10">
                <th className="text-right py-2 font-bold">النوع</th>
                <th className="text-center font-bold">سهل</th>
                <th className="text-center font-bold">متوسط</th>
                <th className="text-center font-bold">صعب</th>
                <th className="text-center font-bold">من إضافتك</th>
              </tr>
            </thead>
            <tbody>
              {stats.map(([t, s]) => (
                <tr key={t} className="border-b border-white/5">
                  <td className="py-2 font-bold">{typeLabel(t)}</td>
                  <td className="text-center">{s.easy}</td>
                  <td className="text-center">{s.medium}</td>
                  <td className="text-center">{s.hard}</td>
                  <td className="text-center text-gold font-bold">{s.custom || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* فلاتر */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
        <h3 className="font-black text-sm flex items-center gap-2">
          <Database className="w-4 h-4 text-gold" /> أسئلتك المضافة ({customQs.length})
          <span className="text-white/40 font-normal text-xs">— بنك الموقع الأساسي ({QUESTIONS.length}) محمي ولا يمكن تعديله من هنا</span>
        </h3>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-white/40" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث في نص السؤال..." className="bg-white/5 border-white/10 pr-9" />
          </div>
          <select value={fType} onChange={(e) => setFType(e.target.value)} className="h-10 rounded-md bg-white/5 border border-white/10 px-3 text-sm">
            <option value="all">كل الأنواع</option>
            {typeOptions.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
          </select>
          <select value={fLevel} onChange={(e) => setFLevel(e.target.value)} className="h-10 rounded-md bg-white/5 border border-white/10 px-3 text-sm">
            <option value="all">كل المستويات</option>
            <option value="easy">سهل</option>
            <option value="medium">متوسط</option>
            <option value="hard">صعب</option>
          </select>
        </div>

        <div className="space-y-2 max-h-[480px] overflow-y-auto pl-1">
          {filtered.length === 0 && (
            <p className="text-center text-white/40 py-8 text-sm">{customQs.length === 0 ? "لم تضف أي سؤال بعد — ابدأ من تبويب «إضافة سؤال»" : "لا نتائج مطابقة للبحث"}</p>
          )}
          {filtered.map((q) => (
            <div key={q.id} className={`rounded-xl border p-3 flex items-start gap-3 ${q.disabled ? "border-red-500/20 bg-red-500/5 opacity-70" : "border-white/10 bg-white/5"}`}>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm leading-6">{q.question}</p>
                <p className="text-xs text-white/50 mt-1">
                  {typeLabel(q.type)} • {LEVEL_LABEL[q.level] ?? q.level}
                  {q.image ? " • صورة" : ""}{q.video ? " • فيديو" : ""}
                  {" • الجواب: "}<span className="text-gold">{q.options[q.answer]}</span>
                  {q.disabled && <span className="text-red-300 font-bold"> • معطّل (لا يظهر في اللعب)</span>}
                </p>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <Button size="sm" variant="outline" className="border-white/15 h-8" disabled={busyId === q.id} onClick={() => onEdit(q)}>
                  <Pencil className="w-3.5 h-3.5 ml-1" /> تعديل
                </Button>
                <Button size="sm" variant="outline" className="border-white/15 h-8" disabled={busyId === q.id} onClick={() => toggleDisabled(q)}>
                  {q.disabled ? <><Eye className="w-3.5 h-3.5 ml-1" /> تفعيل</> : <><EyeOff className="w-3.5 h-3.5 ml-1" /> تعطيل</>}
                </Button>
                <Button size="sm" variant="outline" className="border-red-500/30 text-red-300 hover:bg-red-500/10 h-8" disabled={busyId === q.id} onClick={() => remove(q)}>
                  <Trash2 className="w-3.5 h-3.5 ml-1" /> حذف
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
