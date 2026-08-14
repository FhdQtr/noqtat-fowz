import { Sparkles } from "lucide-react";
import type { QuestionType } from "../types/game";

const TYPE_ICONS: Record<string, string> = {
  multiple_choice: "/img/al-midan-icons/multiple-choice.webp",
  true_false: "/img/al-midan-icons/true-false.webp",
  image: "/img/al-midan-icons/landmarks.webp",
  memory: "/img/al-midan-icons/memory.webp",
  flag: "/img/al-midan-icons/flags.webp",
  completion: "/img/al-midan-icons/proverbs.webp",
  ordering: "/img/al-midan-icons/ordering.webp",
  riddle: "/img/al-midan-icons/riddles.webp",
  acting: "/img/al-midan-icons/acting.webp",
};

interface QuestionTypeIconProps {
  type: QuestionType;
  className?: string;
}

export default function QuestionTypeIcon({ type, className = "h-12 w-12" }: QuestionTypeIconProps) {
  const src = TYPE_ICONS[type];
  if (!src) {
    return <span className={`inline-flex items-center justify-center rounded-2xl bg-gold/10 text-gold ${className}`}><Sparkles className="h-1/2 w-1/2" /></span>;
  }
  return <img src={src} alt="" width={256} height={256} className={`object-contain ${className}`} draggable={false} />;
}
