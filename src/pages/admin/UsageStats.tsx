import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarDays, ExternalLink, Gamepad2, Loader2, RefreshCw, Users } from "lucide-react";
import { getUsageStats, type UsageDay, type UsageStats as UsageStatsData } from "../../lib/matchApi";

const numberFormat = new Intl.NumberFormat("ar-QA");
const dateFormat = new Intl.DateTimeFormat("ar-QA", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Qatar" });
const dateTimeFormat = new Intl.DateTimeFormat("ar-QA", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Qatar",
});

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return dateFormat.format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function busiestHour(day: UsageDay) {
  const entries = Object.entries(day.hours ?? {});
  if (!entries.length) return "—";
  const [hour, values] = entries.reduce((best, current) => {
    const bestActivity = (best[1].activePlayers ?? 0) + (best[1].matchesStarted ?? 0);
    const currentActivity = (current[1].activePlayers ?? 0) + (current[1].matchesStarted ?? 0);
    return currentActivity > bestActivity ? current : best;
  });
  return `${numberFormat.format(Number(hour))}:00 (${numberFormat.format(values.activePlayers ?? 0)} لاعب)`;
}

function StatCard({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Users }) {
  return (
    <div className="glass-card p-5">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-gold/25 bg-gold/10 text-gold-light">
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-3xl font-black text-foreground">{numberFormat.format(value)}</p>
      <p className="mt-1 text-sm font-bold text-muted-foreground">{label}</p>
    </div>
  );
}

export default function UsageStats() {
  const [stats, setStats] = useState<UsageStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setStats(await getUsageStats());
    } catch {
      setError("تعذّر تحميل الإحصاءات. تأكد من تحديث وظائف Firebase ثم حاول مرة أخرى.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const lastActivity = useMemo(() => {
    if (!stats) return null;
    return Math.max(
      stats.totals.playerLastAt ?? 0,
      stats.totals.matchesCreatedLastAt ?? 0,
      stats.totals.matchesStartedLastAt ?? 0,
    );
  }, [stats]);

  if (loading) {
    return <div className="glass-card flex min-h-56 items-center justify-center gap-3 text-gold-light"><Loader2 className="h-6 w-6 animate-spin" /> جاري تحميل الإحصاءات…</div>;
  }

  if (error) {
    return (
      <div className="glass-card p-6 text-center">
        <p className="mb-4 font-bold text-maroon-light">{error}</p>
        <button onClick={() => void load()} className="btn-gold inline-flex items-center gap-2"><RefreshCw className="h-4 w-4" /> إعادة المحاولة</button>
      </div>
    );
  }

  const totals = stats?.totals ?? {};
  const daily = stats?.daily ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-gold-light">استخدام الميدان</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {lastActivity ? `آخر نشاط ${dateTimeFormat.format(new Date(lastActivity))} — بتوقيت قطر` : "تبدأ الأرقام من تاريخ تفعيل التتبع"}
          </p>
        </div>
        <button onClick={() => void load()} className="btn-ghost-gold !px-4 !py-2 inline-flex items-center gap-2 text-sm"><RefreshCw className="h-4 w-4" /> تحديث</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="أجهزة لاعبين فريدة" value={totals.uniquePlayers ?? 0} icon={Users} />
        <StatCard label="مسابقات أُنشئت" value={totals.matchesCreated ?? 0} icon={CalendarDays} />
        <StatCard label="مسابقات بدأت فعليًا" value={totals.matchesStarted ?? 0} icon={Gamepad2} />
      </div>

      <div className="glass-card overflow-hidden">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <BarChart3 className="h-5 w-5 text-gold-light" />
          <div>
            <h3 className="font-black">آخر 30 يومًا</h3>
            <p className="text-xs text-muted-foreground">اللاعب يُحسب مرة واحدة فقط في اليوم حتى لو أعاد فتح الصفحة</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-right text-sm">
            <thead className="bg-white/[0.03] text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-bold">التاريخ</th>
                <th className="px-5 py-3 font-bold">اللاعبون</th>
                <th className="px-5 py-3 font-bold">بدأت</th>
                <th className="px-5 py-3 font-bold">أُنشئت</th>
                <th className="px-5 py-3 font-bold">أكثر وقت نشاطًا</th>
              </tr>
            </thead>
            <tbody>
              {daily.map((day) => (
                <tr key={day.date} className="border-t border-white/[0.06]">
                  <td className="px-5 py-3 font-bold">{formatDate(day.date)}</td>
                  <td className="px-5 py-3">{numberFormat.format(day.activePlayers ?? 0)}</td>
                  <td className="px-5 py-3">{numberFormat.format(day.matchesStarted ?? 0)}</td>
                  <td className="px-5 py-3">{numberFormat.format(day.matchesCreated ?? 0)}</td>
                  <td className="px-5 py-3 text-muted-foreground">{busiestHour(day)}</td>
                </tr>
              ))}
              {!daily.length && <tr><td colSpan={5} className="px-5 py-10 text-center text-muted-foreground">لا توجد بيانات بعد. ستظهر أول الأرقام عند إنشاء ميدان ودخول اللاعبين.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="glass-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-black text-gold-light">الزوار والدول</h3>
          <p className="mt-1 text-sm text-muted-foreground">تظهر في Vercel Analytics حسب الدولة واليوم، من دون حفظ أسماء اللاعبين أو عناوين IP داخل الميدان.</p>
        </div>
        <a href="https://vercel.com/dashboard" target="_blank" rel="noreferrer" className="btn-gold inline-flex shrink-0 items-center justify-center gap-2 !px-4 !py-2 text-sm">
          فتح Vercel <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      <p className="px-1 text-xs leading-6 text-muted-foreground">ملاحظة: هذه الإحصاءات تبدأ من لحظة نشر هذا التحديث ولا تسترجع الاستخدام القديم. «أجهزة لاعبين فريدة» تقدير قريب لعدد الأشخاص؛ الجهاز أو المتصفح الجديد يُحسب كمستخدم جديد.</p>
    </div>
  );
}
