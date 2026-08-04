// ═══════════════════════════════════════════════════════════
// لوحة تحكم المقدم — إدارة بنك الأسئلة (محمية بكلمة سر)
// أول زيارة: إنشاء كلمة سر — بعدها: تسجيل دخول
// ═══════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  ShieldCheck, Lock, Loader2, PlusCircle, Database, ClipboardList,
  Save, KeyRound, LogOut, ArrowRight,
} from "lucide-react";
import { getAdminPassHash, setAdminPassHash, sha256, type CustomQuestion } from "../../lib/customBank";
import QuestionForm from "./QuestionForm";
import ManageBank from "./ManageBank";
import BulkImport from "./BulkImport";
import BackupAndPassword from "./BackupAndPassword";

const SESSION_KEY = "nf_admin_hash";

type GateState = "loading" | "setup" | "login" | "authed";
type Tab = "add" | "manage" | "bulk" | "backup" | "password";

const TABS: { id: Tab; label: string; icon: typeof PlusCircle }[] = [
  { id: "add", label: "إضافة سؤال", icon: PlusCircle },
  { id: "manage", label: "إدارة البنك", icon: Database },
  { id: "bulk", label: "إضافة جماعية", icon: ClipboardList },
  { id: "backup", label: "نسخ احتياطي", icon: Save },
  { id: "password", label: "كلمة السر", icon: KeyRound },
];

export default function Admin() {
  const nav = useNavigate();
  const [gate, setGate] = useState<GateState>("loading");
  const [storedHash, setStoredHash] = useState<string | null>(null);
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("add");
  const [editTarget, setEditTarget] = useState<CustomQuestion | null>(null);

  useEffect(() => {
    getAdminPassHash()
      .then((h) => {
        setStoredHash(h);
        if (!h) setGate("setup");
        else if (sessionStorage.getItem(SESSION_KEY) === h) setGate("authed");
        else setGate("login");
      })
      .catch(() => {
        setErr("تعذّر الاتصال — تأكد من الإنترنت ثم حدّث الصفحة");
        setGate("login");
      });
  }, []);

  const submit = async () => {
    setErr("");
    if (gate === "setup") {
      if (pass.trim().length < 4) return setErr("كلمة السر لازم ٤ أحرف على الأقل");
      if (pass !== pass2) return setErr("كلمتا السر غير متطابقتين");
      setBusy(true);
      try {
        const h = await sha256(pass);
        await setAdminPassHash(h);
        sessionStorage.setItem(SESSION_KEY, h);
        setStoredHash(h);
        setGate("authed");
      } catch {
        setErr("تعذّر الحفظ — حاول مرة ثانية");
      } finally {
        setBusy(false);
      }
    } else {
      setBusy(true);
      try {
        const h = await sha256(pass);
        if (h === storedHash) {
          sessionStorage.setItem(SESSION_KEY, h);
          setGate("authed");
        } else {
          setErr("كلمة السر غير صحيحة");
        }
      } finally {
        setBusy(false);
      }
    }
  };

  const logout = () => {
    sessionStorage.removeItem(SESSION_KEY);
    setPass("");
    setPass2("");
    setGate("login");
  };

  // ═══ بوابة الدخول ═══
  if (gate !== "authed")
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-4">
        <div className="fixed inset-0 -z-10">
          <img src="/img/hero-bg.jpg" alt="" className="w-full h-full object-cover opacity-25" />
          <div className="absolute inset-0 bg-night/88" />
        </div>
        <div className="glass-card w-full max-w-sm p-7 text-center animate-scale-in">
          <ShieldCheck className="w-14 h-14 text-gold-light mx-auto mb-4" />
          <h1 className="text-2xl font-black font-cairo text-gold-gradient mb-1">لوحة التحكم</h1>
          <p className="text-sm text-muted-foreground mb-6">
            {gate === "loading"
              ? "جاري التحميل…"
              : gate === "setup"
              ? "أول زيارة — أنشئ كلمة سر خاصة فيك"
              : "أدخل كلمة السر للمتابعة"}
          </p>
          {gate !== "loading" && (
            <>
              <input
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (gate === "login" || pass2) && submit()}
                placeholder={gate === "setup" ? "كلمة السر الجديدة…" : "كلمة السر…"}
                className="input-night text-center mb-3"
                autoFocus
              />
              {gate === "setup" && (
                <input
                  type="password"
                  value={pass2}
                  onChange={(e) => setPass2(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  placeholder="تأكيد كلمة السر…"
                  className="input-night text-center mb-3"
                />
              )}
              {err && <p className="text-maroon-light text-sm font-bold mb-3">{err}</p>}
              <button
                onClick={submit}
                disabled={busy || !pass}
                className="btn-gold shine w-full flex items-center justify-center gap-2"
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Lock className="w-5 h-5" />}
                {gate === "setup" ? "أنشئ وادخل" : "دخول"}
              </button>
            </>
          )}
          {err && gate === "loading" && <p className="text-maroon-light text-sm font-bold">{err}</p>}
        </div>
        <button onClick={() => nav("/")} className="mt-6 flex items-center gap-2 text-sm text-muted-foreground hover:text-gold-light transition-colors">
          <ArrowRight className="w-4 h-4" />
          العودة للرئيسية
        </button>
      </div>
    );

  // ═══ اللوحة ═══
  return (
    <div className="min-h-dvh px-4 py-6">
      <div className="fixed inset-0 -z-10">
        <img src="/img/hero-bg.jpg" alt="" className="w-full h-full object-cover opacity-20" />
        <div className="absolute inset-0 bg-night/90" />
      </div>

      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-8 h-8 text-gold-light" />
            <h1 className="text-2xl font-black font-cairo text-gold-gradient">لوحة التحكم</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => nav("/")} className="btn-ghost-gold !text-sm !px-4 !py-2">الرئيسية</button>
            <button onClick={logout} className="btn-ghost-gold !text-sm !px-4 !py-2 !border-maroon/50 !text-maroon-light flex items-center gap-1.5">
              <LogOut className="w-4 h-4" />
              خروج
            </button>
          </div>
        </div>

        {/* التبويبات */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => {
                setTab(id);
                if (id !== "add") setEditTarget(null);
              }}
              className={`shrink-0 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-cairo font-bold border transition-all ${
                tab === id
                  ? "bg-gold/20 border-gold text-gold-light"
                  : "border-gold-faint/40 text-muted-foreground hover:border-gold/50"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {tab === "add" && (
          <QuestionForm
            editTarget={editTarget}
            onDone={() => {
              setEditTarget(null);
              setTab("manage");
            }}
          />
        )}
        {tab === "manage" && (
          <ManageBank
            onEdit={(q) => {
              setEditTarget(q);
              setTab("add");
            }}
          />
        )}
        {tab === "bulk" && <BulkImport />}
        {tab === "backup" && <BackupAndPassword section="backup" />}
        {tab === "password" && (
          <BackupAndPassword
            section="password"
            onPasswordChanged={() => {
              void getAdminPassHash().then((h) => setStoredHash(h));
              logout();
            }}
          />
        )}
      </div>
    </div>
  );
}
