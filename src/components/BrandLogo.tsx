interface BrandLogoProps {
  className?: string;
  compact?: boolean;
}

export default function BrandLogo({ className = "", compact = false }: BrandLogoProps) {
  return (
    <span className={`brand-logo-frame ${compact ? "brand-logo-frame--compact" : ""} ${className}`}>
      <img
        src="/brand/al-midan-logo.webp"
        alt="الميدان — الميدان يا حميدان"
        width={1472}
        height={561}
        className="brand-logo-image"
        draggable={false}
      />
    </span>
  );
}
