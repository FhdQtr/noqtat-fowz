import { Crown, Users } from "lucide-react";
import type { Match } from "../types/game";
import { TEAM_COLORS } from "../types/game";

/** شريط نتائج الفرق — يظهر فوق في كل الشاشات */
export default function ScoreBoard({
  match,
  highlight,
  big = false,
}: {
  match: Match;
  highlight?: string | null; // كود الفريق صاحب الدور
  big?: boolean; // نسخة شاشة التلفزيون
}) {
  const teams = match.teamOrder
    .map((c) => match.teams[c])
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  const top = teams[0]?.score ?? 0;

  return (
    <div
      className={`flex items-stretch justify-center gap-2 sm:gap-3 ${
        big ? "gap-3 sm:gap-5" : ""
      }`}
      dir="rtl"
    >
      {teams.map((t, i) => {
        const c = TEAM_COLORS[t.color];
        const isLeader = t.score === top && top > 0;
        const isTurn = highlight === t.code;
        const players = Object.values(match.players ?? {}).filter((p) => p.teamCode === t.code).length;
        return (
          <div
            key={t.code}
            className={`relative rounded-xl border transition-all duration-300 ${
              big ? "px-5 py-3 min-w-[150px] sm:min-w-[190px]" : "px-3 py-2 min-w-[100px]"
            } ${isTurn ? "animate-pulse-gold scale-[1.04]" : ""}`}
            style={{
              background: `linear-gradient(160deg, ${c.hex}26, #12121bcc)`,
              borderColor: isTurn ? "#d4af37" : `${c.hex}66`,
              boxShadow: isTurn ? "0 0 26px rgba(212,175,55,0.3)" : undefined,
            }}
          >
            {isLeader && (
              <Crown
                className={`absolute -top-3 right-1/2 translate-x-1/2 text-gold-light drop-shadow ${
                  big ? "w-6 h-6" : "w-4 h-4"
                }`}
                fill="#e8c96a"
              />
            )}
            <div className="flex items-center gap-2 justify-center">
              <span
                className={`rounded-full ${big ? "w-3.5 h-3.5" : "w-2.5 h-2.5"}`}
                style={{ background: c.light, boxShadow: `0 0 8px ${c.light}` }}
              />
              <span
                className={`font-cairo font-bold truncate ${
                  big ? "text-lg sm:text-xl" : "text-xs sm:text-sm"
                }`}
                style={{ color: c.light }}
              >
                {t.name}
              </span>
            </div>
            <div
              className={`text-center font-cairo font-black text-gold-gradient ${
                big ? "text-3xl sm:text-4xl" : "text-lg"
              }`}
            >
              {t.score}
            </div>
            {big && (
              <div className="flex items-center justify-center gap-1 text-muted-foreground text-xs mt-0.5">
                <Users className="w-3.5 h-3.5" />
                <span>{players}</span>
                <span className="mx-1">·</span>
                <span>المركز {i + 1}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
