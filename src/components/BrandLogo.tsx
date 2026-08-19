interface BrandLogoProps {
  className?: string;
  compact?: boolean;
}

export default function BrandLogo({ className = "", compact = false }: BrandLogoProps) {
  return (
    <span
      className={`brand-logo-frame ${compact ? "brand-logo-frame--compact" : ""} ${className}`}
      aria-label="الميدان — الميدان يا حميدان"
    >
      <svg className="brand-logo-mark" viewBox="0 0 44 44" aria-hidden="true">
        <rect x="3" y="3" width="16" height="16" rx="5" />
        <rect x="25" y="3" width="16" height="16" rx="5" />
        <rect x="3" y="25" width="16" height="16" rx="5" />
        <path d="M33 25a8 8 0 1 1-8 8 8 8 0 0 1 8-8Z" />
        <circle cx="22" cy="22" r="3" />
      </svg>
      <span className="brand-logo-copy">
        <strong>الميدان</strong>
        {!compact && <small>الميدان يا حميدان</small>}
      </span>
    </span>
  );
}
