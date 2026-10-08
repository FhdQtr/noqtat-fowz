import { useEffect, useMemo, useState } from "react";
import { useCustomQuestions, useCustomTypes } from "../../lib/useCustomBank";
import { type CustomQuestion } from "../../lib/customBank";
import { getAdminQuestionCatalog, deleteAdminQuestions, type AdminQuestionCatalog } from "../../lib/matchApi";
import bankVersion from "../../data/questionBankVersion.json";
import { typeLabel } from "../../types/game";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Search, Pencil, Trash2, Database, Loader2, RefreshCw, Check, Video } from "lucide-react";

const PAGE_SIZE = 48;

export default function ManageBank({ onEdit }: { onEdit: (q: CustomQuestion) => void }) {
  const customTypes = useCustomTypes();
  const customQs = useCustomQuestions();
  const [catalog, setCatalog] = useState<AdminQuestionCatalog>({ questions: [] });
  const questions = catalog.questions;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [fType, setFType] = useState("flag");
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [deletePrevious, setDeletePrevious] = useState(false);
  const staleBank = !loading && !error && catalog.bankRevision !== bankVersion.sha256;
  const inventory = catalog.inventory?.[fType];

  const reload = async () => {
    setLoading(true); setError("");
    try { setCatalog(await getAdminQuestionCatalog()); setSelected(new Set()); setPage(0); }
    catch { setError("تعذّر تحميل الأسئلة. أعد المحاولة، وتأكد من تحديث gameAction في Firebase."); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    let alive = true;
    setLoading(true);
    void getAdminQuestionCatalog().then((result) => { if (alive) { setCatalog(result); setError(""); } }).catch(() => {
      if (alive) setError("تعذّر تحميل الأسئلة. أعد المحاولة، وتأكد من تحديث gameAction في Firebase.");
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [customQs]);

  const sections = useMemo(() => Array.from(new Set([...questions.map((q) => q.type), ...customTypes.map((t) => t.id)]))
    .sort((a, b) => typeLabel(a).localeCompare(typeLabel(b), "ar")), [questions, customTypes]);
  const filtered = useMemo(() => questions.filter((q) => q.type === fType && !q.disabled
    && (!search.trim() || q.question.includes(search.trim()))), [questions, fType, search]);
  const { availableCounts, previousIds } = useMemo(() => {
    const availableCounts: Record<string, number> = {};
    const previousIds: number[] = [];
    for (const question of questions) {
      if (question.disabled) previousIds.push(question.id);
      else availableCounts[question.type] = (availableCounts[question.type] || 0) + 1;
    }
    return { availableCounts, previousIds };
  }, [questions]);
  const deleteIds = deletePrevious ? previousIds : Array.from(selected);
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
    if (!deleteIds.length || busy) return;
    setBusy(true); setError(""); setNotice("");
    const ids = deleteIds;
    try {
      await deleteAdminQuestions(ids);
      setSelected(new Set()); setConfirm(false);
      await reload();
      setNotice(`تم حذف ${ids.length} سؤال نهائيًا من اللعب ولوحة التحكم`);
    } catch { setError("تعذّر تأكيد الحذف. أعد المحاولة أو حدّث القائمة للتحقق."); }
    finally { setBusy(false); }
  };

  return <div className="space-y-4 pb-24">
    <div className="rounded-2xl border border-gold/25 bg-gold/5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="flex items-center gap-2 font-cairo text-xl font-black text-gold-light"><Database className="h-5 w-5" /> أسئلة الموقع</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">اختر القسم، وحط علامة صح على الأسئلة اللي تبي تحذفها نهائيًا. الإجابات مخفية.</p></div>
        <Button variant="outline" size="icon" aria-label="تحديث الأسئلة" disabled={loading || busy} onClick={() => void reload()} className="shrink-0 border-gold/30"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Button>
      </div>
    </div>
    {error && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</p>}
    {staleBank && <p role="alert" className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm leading-7 text-amber-100">{catalog.bankRevision ? "نسخة بنك الأسئلة في Firebase لا تطابق نسخة الموقع الحالية." : "نسخة Firebase الحالية لا تدعم التحقق من تطابق بنك الأسئلة وتفصيل أعداده."} الأعداد أدناه تخص نسخة الخادم المتاحة للعب؛ حدّث gameAction ثم اضغط تحديث الأسئلة.</p>}
    {notice && <p role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-200">{notice}</p>}
    <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
      <label className="block text-sm font-bold">القسم
        <select aria-label="القسم" value={fType} disabled={busy || loading} onChange={(e) => changeFilter(() => setFType(e.target.value))} className="mt-2 h-12 w-full rounded-xl border border-gold/30 bg-night px-3 text-base">
          {!sections.includes(fType) && <option value={fType}>{typeLabel(fType)}</option>}
          {sections.map((type) => <option key={type} value={type}>{typeLabel(type)} ({availableCounts[type] || 0})</option>)}
        </select>
      </label>
      {!loading && inventory && <div className="text-sm leading-7 text-muted-foreground">
        <p>المتاح للعب: {inventory.available} سؤال · الأساسي الصالح قبل الحذف والاستبعاد: {inventory.builtin - inventory.legacyDisabled}</p>
        <p>محذوف من الأساسي: {inventory.deleted} · مستبعد من الأساسي: {inventory.excluded} · مضاف ومتاح: {inventory.customAvailable}</p>
        <p className="text-xs">الأسئلة القديمة المعطّلة: {inventory.legacyDisabled}، ولا تدخل في العدد المتاح. البحث يصفّي القائمة فقط ولا يغيّر عدد القسم.</p>
      </div>}
      <div className="grid gap-2">
        <div className="relative"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" /><Input aria-label="بحث في السؤال" disabled={busy} value={search} onChange={(e) => changeFilter(() => setSearch(e.target.value))} placeholder="ابحث في السؤال" className="h-11 border-white/10 bg-night pr-9" /></div>
      </div>
    </div>
    {!loading && previousIds.length > 0 && <div className="rounded-2xl border border-maroon-light/30 bg-maroon/10 p-4">
      <p className="mb-3 text-sm leading-6">عندك {previousIds.length} سؤال استبعدتها سابقًا. احذفها نهائيًا دفعة واحدة.</p>
      <Button disabled={busy} variant="outline" className="border-maroon-light/40 text-maroon-light" onClick={() => { setDeletePrevious(true); setError(""); setConfirm(true); }}><Trash2 className="ml-2 h-4 w-4" /> حذف الأسئلة المستبعدة سابقًا نهائيًا</Button>
    </div>}
    {loading ? <div role="status" className="flex justify-center gap-2 py-10 text-gold-light"><Loader2 className="h-5 w-5 animate-spin" /> جاري تحميل الأسئلة</div> : <>
      <div className="flex items-center justify-between gap-3 text-sm"><span>{typeLabel(fType)} · {filtered.length} سؤال</span><button disabled={busy || !visible.length} onClick={() => setSelected((old) => { const next = new Set(old); const all = visible.every((q) => next.has(q.id)); visible.forEach((q) => all ? next.delete(q.id) : next.add(q.id)); return next; })} className="min-h-11 px-2 font-bold text-gold-light">{visible.length > 0 && visible.every((q) => selected.has(q.id)) ? "إلغاء تحديد الصفحة" : "تحديد الصفحة"}</button></div>
      {!filtered.length && !error && <p className="py-10 text-center text-muted-foreground">لا توجد أسئلة في هذا القسم تطابق الاختيار.</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {visible.map((q) => <div key={q.id} className={`relative overflow-hidden rounded-2xl border transition-colors ${selected.has(q.id) ? "border-gold bg-gold/15 ring-1 ring-gold" : "border-white/10 bg-white/5"}`}>
          <label className={`block h-full cursor-pointer p-4 ${busy ? "pointer-events-none opacity-60" : ""}`}>
            <div className="mb-3 flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">السؤال #{q.id}</span><span className="relative flex h-7 w-7 items-center justify-center"><input type="checkbox" aria-label={`تحديد السؤال ${q.id}: ${q.question}`} checked={selected.has(q.id)} disabled={busy} onChange={() => toggle(q.id)} className="h-7 w-7 cursor-pointer accent-[#d5b45d]" />{selected.has(q.id) && <Check aria-hidden="true" className="pointer-events-none absolute h-4 w-4 text-night" />}</span></div>
            {q.image && <img src={q.image} alt={q.question} loading="lazy" className={`mb-3 aspect-video w-full rounded-xl object-contain ${q.type === "brand" ? "bg-white p-6" : "bg-night"}`} />}
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
      <Button disabled={busy || !selected.size || loading} onClick={() => { setDeletePrevious(false); setError(""); setConfirm(true); }} className="bg-maroon text-white hover:bg-maroon-light"><Trash2 className="ml-2 h-4 w-4" /> حذف المحدد نهائيًا</Button>
    </div>
    <Dialog open={confirm} onOpenChange={(open) => { if (!busy) setConfirm(open); }}>
      <DialogContent className="border-gold/30 bg-night" dir="rtl"><DialogHeader><DialogTitle>حذف نهائي</DialogTitle><DialogDescription className="pt-2 leading-7">سيتم حذف {deleteIds.length} سؤال من اللعب ولوحة التحكم. لن تنتقل إلى قائمة محذوفات ولا يمكن استرجاعها من اللوحة. السؤال الجاري لن يتغير.</DialogDescription></DialogHeader>
        {error && <p role="alert" className="text-sm text-red-200">{error}</p>}
        <DialogFooter className="gap-2"><Button variant="outline" disabled={busy} onClick={() => setConfirm(false)}>إلغاء</Button><Button disabled={busy} onClick={() => void apply()} className="bg-gold text-night hover:bg-gold-light">{busy && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}{busy ? "جاري الحفظ" : "تأكيد الحذف النهائي"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
