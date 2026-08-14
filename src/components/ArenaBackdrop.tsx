interface ArenaBackdropProps {
  className?: string;
  strength?: "soft" | "strong";
}

export default function ArenaBackdrop({ className = "", strength = "strong" }: ArenaBackdropProps) {
  return (
    <div className={`fixed inset-0 -z-10 overflow-hidden bg-night ${className}`} aria-hidden="true">
      <img
        src="/img/al-midan-hero.webp"
        alt=""
        className={`h-full w-full object-cover ${strength === "soft" ? "opacity-30" : "opacity-55"}`}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,transparent_0%,rgba(8,5,8,.25)_42%,rgba(8,5,8,.92)_100%)]" />
      <div className="absolute inset-0 bg-gradient-to-b from-night/45 via-night/65 to-night" />
      <div className="arena-grid absolute inset-0 opacity-30" />
    </div>
  );
}
