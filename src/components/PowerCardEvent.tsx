import { useEffect, useState } from "react";
import { Clock3, CopyPlus, Snowflake, Swords, UserRoundCheck, Zap } from "lucide-react";
import type { Match, PowerCardId } from "../types/game";
import { POWER_CARD_LABEL, TEAM_COLORS } from "../types/game";

const ICONS = {
  extraTime: Clock3,
  swapQuestion: CopyPlus,
  pickPlayer: UserRoundCheck,
  doublePoints: Zap,
  freeze: Snowflake,
  steal: Swords,
} satisfies Record<PowerCardId, typeof Clock3>;

export default function PowerCardEvent({ match }: { match: Match }) {
  const event = match.state.cardEvent;
  const [visibleId, setVisibleId] = useState<string | null>(null);

  useEffect(() => {
    if (!event?.id || Date.now() - event.at > 5000) return;
    setVisibleId(event.id);
    const timer = window.setTimeout(() => setVisibleId(null), 3000);
    return () => window.clearTimeout(timer);
  }, [event?.id, event?.at]);

  if (!event || visibleId !== event.id) return null;
  const team = match.teams[event.byTeam];
  if (!team) return null;
  const Icon = ICONS[event.card];
  const color = TEAM_COLORS[team.color];
  const targetTeam = event.targetTeam ? match.teams[event.targetTeam] : null;
  return (
    <div className="power-event-layer" aria-live="assertive">
      <div className="power-event-card" style={{ "--team-card-color": color.light } as React.CSSProperties}>
        <span className="power-event-flare" />
        <div className="power-event-icon"><Icon /></div>
        <p>فريق {team.name} استخدم</p>
        <h2>{POWER_CARD_LABEL[event.card]}</h2>
        {event.targetPlayerName ? <strong>وتورّط {event.targetPlayerName} بالإجابة بروحه 😂</strong> : null}
        {!event.targetPlayerName && targetTeam && event.card === "freeze" ? <strong>تم تجميد كروت فريق {targetTeam.name}</strong> : null}
      </div>
    </div>
  );
}
