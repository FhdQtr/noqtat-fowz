// ═══════════════════════════════════════════════════════════
// لوحة تحكم الميدان — محمية بحساب Firebase وصلاحية admin
// ═══════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { getIdTokenResult, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInAnonymously, signInWithEmailAndPassword, signOut } from "firebase/auth";
import {
  ShieldCheck, Lock, Loader2, PlusCircle, Database, ClipboardList,
  Save, KeyRound, LogOut, ArrowRight, BarChart3, X,
} from "lucide-react";
import { type CustomQuestion } from "../../lib/customBank";
import { auth } from "../../lib/firebase";
import { authorizeAdmin, adminError } from "../../lib/adminAuth";
import QuestionForm from "./QuestionForm";
import ManageBank from "./ManageBank";
import BulkImport from "./BulkImport";
import BackupAndPassword from "./BackupAndPassword";
import UsageStats from "./UsageStats";

type GateState = "loading" | "login" | "authed";
type Tab = "stats" | "add" | "manage" | "bulk" | "backup" | "password";

const TABS: { id: Tab; label: string; icon: typeof PlusCircle }[] = [
  { id: "stats", label: "الإحصاءات", icon: BarChart3 },
  { id: "add", label: "إضافة سؤال", icon: PlusCircle },
  { id: "manage", label: "إدارة البنك", icon: Database },
  { id: "bulk", label: "إضافة جماعية", icon: ClipboardList },
  { id: "backup", label: "نسخ احتياطي", icon: Save },
  { id: "password", label: "كلمة السر", icon: KeyRound },
];

export default function Admin() {
  const nav = useNavigate();
  const [gate, setGate] = useState<GateState>("loading");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("stats");
  const [editTarget, setEditTarget] = useState<CustomQuestion | null>(null);

  useEffect(() => {
    let alive = true;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user || user.isAnonymous) { setGate("login"); return; }
      setGate("loading");
      void authorizeAdmin(user).then(() => {
        if (alive && auth.currentUser?.uid === user.uid) { setErr(""); setGate("authed"); }
      }).catch((error) => {
        if (alive && auth.currentUser?.uid === user.uid) { setErr(adminError(error, "access")); setGate("login"); }
      });
    });
    return () => { alive = false; unsubscribe(); };
  }, []);

  const googleLogin = async () => {
    setBusy(true); setErr("");
    let stage: "google" | "access" = "google";
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const credential = await signInWithPopup(auth, provider);
      stage = "access";
      await authorizeAdmin(credential.user);
      if (auth.currentUser?.uid === credential.user.uid) setGate("authed");
    } catch (error) {
      setErr(adminError(error, stage)); setGate("login");
    } finally { setBusy(false); }
  };

  const retryAccess = async () => {
    const user = auth.currentUser;
    if (!user || user.isAnonymous) return;
    setBusy(true); setErr("");
    try { await authorizeAdmin(user); setGate("authed"); }
    catch (error) { setErr(adminError(error, "access")); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    setErr("");
    if (!email.trim() || pass.length < 6) return setErr("أدخل بريد المدير وكلمة المرور");
    setBusy(true);
    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim(), pass);
      const token = await getIdTokenResult(credential.user, true);
      if (token.claims.admin !== true) {
        await signOut(auth);
        throw new Error("هذا الحساب لا يملك صلاحية الإدارة");
      }
      setGate("authed");
    } catch (error) {
      setErr(error instanceof Error && error.message.includes("صلاحية") ? error.message : "بيانات الدخول غير صحيحة أو الحساب غير مخوّل");
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await signOut(auth);
    await signInAnonymously(auth);
    setEmail("");
    setPass("");
    setGate("login");
  };

  // ═══ بوابة الدخول ═══
  if (gate !== "authed")
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-4 py-8">
        <div className="fixed inset-0 -z-10">
          <img src="/img/al-midan-hero.webp" alt="" className="w-full h-full object-cover opacity-25" />
          <div className="absolute inset-0 bg-night/88" />
        </div>
        <div className="glass-card relative w-full max-w-sm p-7 pt-16 text-center animate-scale-in">
          <button onClick={() => nav("/")} aria-label="إغلاق والعودة للرئيسية" className="absolute left-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full border border-gold/40 bg-night/60 text-gold-light hover:bg-gold/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold">
            <X className="h-6 w-6" />
          </button>
          <ShieldCheck className="w-14 h-14 text-gold-light mx-auto mb-4" />
          <h1 className="text-2xl font-black font-cairo text-gold-gradient mb-1">لوحة التحكم</h1>
          <p className="text-sm text-muted-foreground mb-6">
            {gate === "loading" ? "جاري التحقق…" : "دخول المدير المصرّح له"}
          </p>
          {gate !== "loading" && (
            <>
              <button onClick={() => void googleLogin()} disabled={busy} className="btn-gold w-full mb-5 flex items-center justify-center gap-2">
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />} الدخول بحساب Google
              </button>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="البريد الإلكتروني"
                className="input-night text-center mb-3"
                autoComplete="username"
                dir="ltr"
                autoFocus
              />
              <input
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="كلمة المرور"
                className="input-night text-center mb-3"
                autoComplete="current-password"
              />
              {err && <div role="alert" className="mb-4 rounded-xl border border-maroon-light/40 bg-maroon/15 p-3">
                <p className="text-maroon-light text-sm font-bold break-words">{err}</p>
                {auth.currentUser && !auth.currentUser.isAnonymous ? <button onClick={() => void retryAccess()} disabled={busy} className="btn-ghost-gold w-full mt-3 !text-sm">أعد التحقق من صلاحية الحساب</button> : null}
              </div>}
              <button
                onClick={submit}
                disabled={busy || !email || !pass}
                className="btn-gold shine w-full flex items-center justify-center gap-2"
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Lock className="w-5 h-5" />}
                دخول آمن
              </button>
            </>
          )}
          {err && gate === "loading" && <p className="text-maroon-light text-sm font-bold">{err}</p>}
        </div>
        <button onClick={() => nav("/")} className="btn-ghost-gold mt-5 w-full max-w-sm flex items-center justify-center gap-2">
          <ArrowRight className="w-4 h-4" />
          العودة للرئيسية
        </button>
      </div>
    );

  // ═══ اللوحة ═══
  return (
    <div className="min-h-dvh px-4 py-6">
      <div className="fixed inset-0 -z-10">
        <img src="/img/al-midan-hero.webp" alt="" className="w-full h-full object-cover opacity-20" />
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
            <button onClick={() => void logout()} className="btn-ghost-gold !text-sm !px-4 !py-2 !border-maroon/50 !text-maroon-light flex items-center gap-1.5">
              <LogOut className="w-4 h-4" />
              خروج
            </button>
          </div>
        </div>

        {/* التبويبات */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {TABS.filter(({ id }) => id !== "password" || auth.currentUser?.providerData.some((provider) => provider.providerId === "password")).map(({ id, label, icon: Icon }) => (
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

        {tab === "stats" && <UsageStats />}
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
            onPasswordChanged={() => void logout()}
          />
        )}
      </div>
    </div>
  );
}
