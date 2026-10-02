import { useEffect, useMemo, useState } from "react";
import { useCustomQuestions, useCustomTypes } from "../../lib/useCustomBank";
import { type CustomQuestion } from "../../lib/customBank";
import { getAdminQuestions, setAdminQuestionAvailability, type AdminQuestion } from "../../lib/matchApi";
import { LEVEL_LABEL, typeLabel } from "../../types/game";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Search, Pencil, Trash2, Eye, Database, Loader2, RefreshCw, Check, Video } from "lucide-react";

const PAGE_SIZE = 48;

export default function ManageBank({ onEdit }: { onEdit: (q: CustomQuestion) => void }) {
  const customTypes = useCustomTypes();
  const customQs = useCustomQuestions();
  const [questions, setQuestions] = useState<AdminQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [fType, setFType] = useState("flag");
  const [fLevel, setFLevel] = useState("all");
  const [excluded, setExcluded] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const reload = async () => {
    setLoading(true); setError("");
    try { setQuestions(await getAdminQuestions()); setSelected(new Set()); setPage(0); }
    catch { setError("تعذّر تحميل الأسئلة. أعد المحاولة، وتأكد من تحديث gameAction في Firebase."); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    let alive = true;
    void getAdminQuestions().then((qs) => { if (alive) setQuestions(qs); }).catch(() => {
      if (alive) setError("تعذّر تحميل الأسئلة. أعد المحاولة، وتأكد من تحديث gameAction في Firebase.");
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const sections = useMemo(() => Array.from(new Set([...questions.map((q) => q.type), ...customTypes.map((t) => t.id)]))
    .sort((a, b) => typeLabel(a).localeCompare(typeLabel(b), "ar")), [questions, customTypes]);
  const filtered = useMemo(() => questions.filter((q) => q.type === fType && q.disabled === excluded
    && (fLevel === "all" || q.level === fLevel)
    && (!search.trim() || q.question.includes(search.trim()))), [questions, fType, excluded, fLevel, search]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const changeFilter = (change: () => void) => { change(); setPage(0); setSelected(new Set()); setNotice(""); };
  const toggle = (id: number) => setSelected((old) => {
    const next = new Set(old);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const apply = async () => {
    if (!selected.size || busy) return;
    setBusy(true); setError(""); setNotice("");
    const ids = Array.from(selected);
    try {
      await setAdminQuestionAvailability(ids, !excluded);
      const changed = new Set(ids);
      setQuestions((old) => old.map((q) => changed.has(q.id) ? { ...q, disabled: !excluded } : q));
      setSelected(new Set()); setConfirm(false);
      setNotice(excluded ? `تمت إعادة ${ids.length} سؤال إلى اللعب` : `تم حذف ${ids.length} سؤال من اللعب`);
    } catch { setError("لم يتم حفظ التغيير. الأسئلة ما زالت محددة؛ أعد المحاولة."); }
    finally { setBusy(false); }
  };

  return <div className="space-y-4 pb-24">
    <div className="rounded-2xl border border-gold/25 bg-gold/5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="flex items-center gap-2 font-cairo text-xl font-black text-gold-light"><Database className="h-5 w-5" /> أسئلة الموقع</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">اختر القسم، وحط علامة صح على الأسئلة اللي تبي تحذفها من اللعب. الإجابات مخفية.</p></div>
        <Button variant="outline" size="icon" aria-label="تحديث الأسئلة" disabled={loading || busy} onClick={() => void reload()} className="shrink-0 border-gold/30"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Button>
      </div>
    </div>
    {error && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-200">{notice}</p>}
    <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
      <label className="block text-sm font-bold">القسم
        <select aria-label="القسم" value={fType} disabled={busy} onChange={(e) => changeFilter(() => setFType(e.target.value))} className="mt-2 h-12 w-full rounded-xl border border-gold/30 bg-night px-3 text-base">
          {!sections.includes(fType) && <option value={fType}>{typeLabel(fType)}</option>}
          {sections.map((type) => <option key={type} value={type}>{typeLabel(type)} ({questions.filter((q) => q.type === type && !q.disabled).length})</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        {[false, true].map((value) => <button key={String(value)} disabled={busy} aria-pressed={excluded === value} onClick={() => changeFilter(() => setExcluded(value))} className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-bold ${excluded === value ? "border-gold bg-gold/20 text-gold-light" : "border-white/10 text-muted-foreground"}`}>{value ? "المحذوفة من اللعب" : "المتاحة للعب"}</button>)}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="relative"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" /><Input aria-label="بحث في السؤال" disabled={busy} value={search} onChange={(e) => changeFilter(() => setSearch(e.target.value))} placeholder="ابحث في السؤال" className="h-11 border-white/10 bg-night pr-9" /></div>
        <select aria-label="المستوى" disabled={busy} value={fLevel} onChange={(e) => changeFilter(() => setFLevel(e.target.value))} className="h-11 rounded-md border border-white/10 bg-night px-3 text-sm"><option value="all">كل المستويات</option><option value="easy">سهل</option><option value="medium">متوسط</option><option value="hard">صعب</option></select>
      </div>
    </div>
    {loading ? <div role="status" className="flex justify-center gap-2 py-10 text-gold-light"><Loader2 className="h-5 w-5 animate-spin" /> جاري تحميل الأسئلة</div> : <>
      <div className="flex items-center justify-between gap-3 text-sm"><span>{typeLabel(fType)} · {filtered.length} سؤال</span><button disabled={busy || !visible.length} onClick={() => setSelected((old) => { const next = new Set(old); const all = visible.every((q) => next.has(q.id)); visible.forEach((q) => all ? next.delete(q.id) : next.add(q.id)); return next; })} className="min-h-11 px-2 font-bold text-gold-light">{visible.length > 0 && visible.every((q) => selected.has(q.id)) ? "إلغاء تحديد الصفحة" : "تحديد الصفحة"}</button></div>
      {!filtered.length && !error && <p className="py-10 text-center text-muted-foreground">لا توجد أسئلة في هذا القسم تطابق الاختيار.</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {visible.map((q) => <div key={q.id} className={`relative overflow-hidden rounded-2xl border transition-colors ${selected.has(q.id) ? "border-gold bg-gold/15 ring-1 ring-gold" : "border-white/10 bg-white/5"}`}>
          <label className={`block h-full cursor-pointer p-4 ${busy ? "pointer-events-none opacity-60" : ""}`}>
            <div className="mb-3 flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{LEVEL_LABEL[q.level]} · #{q.id}</span><span className="relative flex h-7 w-7 items-center justify-center"><input type="checkbox" aria-label={`تحديد السؤال ${q.id}: ${q.question}`} checked={selected.has(q.id)} disabled={busy} onChange={() => toggle(q.id)} className="h-7 w-7 cursor-pointer accent-[#d5b45d]" />{selected.has(q.id) && <Check aria-hidden="true" className="pointer-events-none absolute h-4 w-4 text-night" />}</span></div>
            {q.image && <img src={q.image} alt={q.question} loading="lazy" className="mb-3 aspect-video w-full rounded-xl bg-night object-contain" />}
            {q.video && <p className="mb-3 flex items-center gap-2 text-sm text-gold-light"><Video className="h-4 w-4" /> سؤال فيديو</p>}
            <p className="break-words text-base font-bold leading-7">{q.question}</p>
          </label>
          {q.custom && <Button variant="ghost" size="sm" disabled={busy} className="m-2 text-gold-light" onClick={() => { const full = customQs.find((item) => item.id === q.id); if (full) onEdit(full); }}><Pencil className="ml-1 h-4 w-4" /> تعديل السؤال</Button>}
        </div>)}
      </div>
      {pageCount > 1 && <div className="flex items-center justify-center gap-3 py-3"><Button variant="outline" disabled={busy || currentPage === 0} onClick={() => setPage(currentPage - 1)}>السابق</Button><span className="text-sm">{currentPage + 1} / {pageCount}</span><Button variant="outline" disabled={busy || currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}>التالي</Button></div>}
    </>}
    <div className="fixed inset-x-4 bottom-3 z-10 mx-auto max-w-3xl flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold/40 bg-night p-4 shadow-xl">
      <div><p className="font-bold text-gold-light">{selected.size} سؤال محدد</p><button disabled={busy || !selected.size} onClick={() => setSelected(new Set())} className="mt-1 text-xs text-muted-foreground">إلغاء التحديد</button></div>
      <Button disabled={busy || !selected.size || loading} onClick={() => { setError(""); setConfirm(true); }} className={excluded ? "bg-emerald-700 text-white hover:bg-emerald-600" : "bg-maroon text-white hover:bg-maroon-light"}>{excluded ? <Eye className="ml-2 h-4 w-4" /> : <Trash2 className="ml-2 h-4 w-4" />}{excluded ? "إعادة المحدد للعب" : "حذف المحدد من اللعب"}</Button>
    </div>
    <Dialog open={confirm} onOpenChange={(open) => { if (!busy) setConfirm(open); }}>
      <DialogContent className="border-gold/30 bg-night" dir="rtl"><DialogHeader><DialogTitle>{excluded ? "إعادة الأسئلة للعب" : "حذف الأسئلة من اللعب"}</DialogTitle><DialogDescription className="pt-2 leading-7">{excluded ? `ستعود ${selected.size} أسئلة إلى الاختيار في اللعب.` : `سيتم استبعاد ${selected.size} أسئلة من اللعب. تقدر ترجعها من قائمة «المحذوفة من اللعب». السؤال الجاري لن يتغير.`}</DialogDescription></DialogHeader>
        {error && <p role="alert" className="text-sm text-red-200">{error}</p>}
        <DialogFooter className="gap-2"><Button variant="outline" disabled={busy} onClick={() => setConfirm(false)}>إلغاء</Button><Button disabled={busy} onClick={() => void apply()} className="bg-gold text-night hover:bg-gold-light">{busy && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}{busy ? "جاري الحفظ" : "تأكيد"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
