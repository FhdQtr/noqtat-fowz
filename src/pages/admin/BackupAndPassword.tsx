import { useRef, useState } from "react";
import { exportBackup, importBackup, type BankBackup } from "../../lib/customBank";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { useCustomQuestions, useCustomTypes } from "../../lib/useCustomBank";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { Download, Upload, KeyRound, Loader2 } from "lucide-react";

export default function BackupAndPassword({
  section,
  onPasswordChanged,
}: {
  section: "backup" | "password";
  onPasswordChanged?: () => void;
}) {
  return section === "backup" ? <BackupSection /> : <PasswordSection onPasswordChanged={onPasswordChanged} />;
}

function BackupSection() {
  const customTypes = useCustomTypes();
  const customQs = useCustomQuestions();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const download = () => {
    const backup = exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const d = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `al-midan-backup-${d}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg("تم تنزيل النسخة الاحتياطية — احتفظ بالملف في مكان آمن");
  };

  const restore = async (file: File) => {
    setBusy(true);
    setMsg(null);
    try {
      const parsed = JSON.parse(await file.text()) as BankBackup;
      if (!Array.isArray(parsed.questions) || !Array.isArray(parsed.types)) {
        setMsg("الملف ليس نسخة احتياطية صالحة");
        return;
      }
      const before = customQs.length;
      await importBackup(parsed);
      const added = parsed.questions.filter((q) => !customQs.some((x) => x.id === q.id)).length;
      setMsg(`تم الاسترجاع — أُضيف ${added} سؤال جديد (كان عندك ${before})، والأسئلة الموجودة لم تُمس`);
    } catch {
      setMsg("تعذّر قراءة الملف — تأكد أنه ملف النسخة الاحتياطية بصيغة JSON");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
      <h3 className="font-black text-sm flex items-center gap-2"><Download className="w-4 h-4 text-gold" /> النسخ الاحتياطي</h3>
      <p className="text-sm text-white/60 leading-7">
        عندك الآن <span className="text-gold font-bold">{customQs.length}</span> سؤال و <span className="text-gold font-bold">{customTypes.length}</span> نوع مخصص.
        نزّل نسخة احتياطية كل فترة — ولو رجعت ملف نسخة قديم، تُضاف الأسئلة الناقصة فقط دون مسح الموجود.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button onClick={download} className="bg-gold text-navy font-black hover:bg-gold/90 h-11">
          <Download className="w-4 h-4 ml-2" /> تنزيل نسخة احتياطية
        </Button>
        <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy} className="border-white/15 h-11">
          {busy ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <Upload className="w-4 h-4 ml-2" />} استرجاع من ملف
        </Button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
      </div>
      {msg && <p className="text-sm text-emerald-300 leading-7">{msg}</p>}
    </div>
  );
}

function PasswordSection({ onPasswordChanged }: { onPasswordChanged?: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const change = async () => {
    if (next.length < 8) return setMsg({ ok: false, text: "كلمة المرور الجديدة يجب أن تكون ٨ أحرف على الأقل" });
    if (next !== confirm) return setMsg({ ok: false, text: "تأكيد كلمة السر غير مطابق" });
    setBusy(true);
    setMsg(null);
    try {
      const user = auth.currentUser;
      if (!user?.email) throw new Error("لا يوجد حساب مدير نشط");
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
      await updatePassword(user, next);
      setMsg({ ok: true, text: "تم تغيير كلمة المرور — سجّل دخولك من جديد" });
      setTimeout(() => onPasswordChanged?.(), 1500);
    } catch {
      setMsg({ ok: false, text: "تعذّر التغيير — تحقق من كلمة المرور الحالية" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4 max-w-md">
      <h3 className="font-black text-sm flex items-center gap-2"><KeyRound className="w-4 h-4 text-gold" /> تغيير كلمة سر لوحة التحكم</h3>
      <div className="space-y-3">
        <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="كلمة السر الحالية" className="bg-white/5 border-white/10" />
        <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="كلمة السر الجديدة" className="bg-white/5 border-white/10" />
        <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="تأكيد كلمة السر الجديدة" className="bg-white/5 border-white/10" />
      </div>
      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-300" : "text-red-300"}`}>{msg.text}</p>}
      <Button onClick={change} disabled={busy || !current || !next || !confirm} className="w-full bg-gold text-navy font-black hover:bg-gold/90 h-11">
        {busy ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <KeyRound className="w-4 h-4 ml-2" />} حفظ كلمة السر الجديدة
      </Button>
    </div>
  );
}
