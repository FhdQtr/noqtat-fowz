import { useNavigate } from "react-router";
import { LogOut } from "lucide-react";
import { leaveMatch } from "../lib/matchApi";
import { writeStored } from "../lib/storage";
import { useAsyncAction } from "../lib/useAsyncAction";

export default function LeaveMatchButton({ matchCode, playerId, storageKey, compact = false }: {
  matchCode: string;
  playerId: string;
  storageKey: string;
  compact?: boolean;
}) {
  const navigate = useNavigate();
  const { busy, error, run } = useAsyncAction("تعذّرت مغادرة المسابقة. تحقق من الاتصال وأعد المحاولة.");
  const leave = () => run(async () => {
    await leaveMatch(matchCode, playerId);
    writeStored(storageKey, null);
    navigate("/");
  });

  return (
    <div className={compact ? "text-center" : "mt-8 text-center"}>
      <button
        onClick={() => void leave()}
        disabled={busy}
        className={compact
          ? "flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-maroon-light transition-colors disabled:opacity-50"
          : "btn-ghost-gold flex items-center gap-2"}
      >
        <LogOut className="w-4 h-4" />
        {busy ? "جاري المغادرة…" : compact ? "مغادرة المسابقة" : "خروج"}
      </button>
      {error && <p role="alert" className="mt-2 text-sm text-maroon-light">{error}</p>}
    </div>
  );
}
