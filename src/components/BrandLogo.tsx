interface BrandLogoProps {
  className?: string;
  compact?: boolean;
}

export default function BrandLogo({ className = "", compact = false }: BrandLogoProps) {
  return (
    <img
      src="/brand/al-midan-logo.webp"
      alt="الميدان — الميدان يا حميدان"
      width={1472}
      height={561}
      className={`${compact ? "h-12 w-auto object-contain object-right" : "h-auto w-full object-contain"} ${className}`}
      draggable={false}
    />
  );
}
