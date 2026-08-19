import { Crown, Users } from "lucide-react";
import type { CSSProperties } from "react";
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
      className="m-scoreboard"
      data-size={big ? "large" : "regular"}
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
            className="m-scoreboard__team"
            data-turn={isTurn ? "true" : "false"}
            data-leader={isLeader ? "true" : "false"}
            style={{
              "--team-color": c.hex,
              "--team-color-light": c.light,
            } as CSSProperties}
          >
            {isLeader && (
              <Crown
                className="m-scoreboard__crown"
                fill="currentColor"
              />
            )}
            <div className="m-scoreboard__identity">
              <span className="m-scoreboard__dot" />
              <span className="m-scoreboard__name">
                {t.name}
              </span>
            </div>
            <div className="m-scoreboard__score">
              {t.score}
            </div>
            {big && (
              <div className="m-scoreboard__meta">
                <Users aria-hidden="true" />
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
