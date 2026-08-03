import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** رمز QR أنيق بإطار ذهبي */
export default function QrCode({
  value,
  size = 140,
  label,
}: {
  value: string;
  size?: number;
  label?: string;
}) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    QRCode.toDataURL(value, {
      width: size * 2,
      margin: 1,
      color: { dark: "#1a1a26", light: "#f3dd9a" },
    }).then(setUrl).catch(() => {});
  }, [value, size]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="rounded-xl p-2 border border-gold/50 bg-night-700/60"
        style={{ boxShadow: "0 0 24px rgba(212,175,55,0.18)" }}
      >
        {url ? (
          <img src={url} alt="QR" width={size} height={size} className="rounded-lg" />
        ) : (
          <div style={{ width: size, height: size }} className="animate-pulse bg-night-600 rounded-lg" />
        )}
      </div>
      {label && <span className="text-xs text-muted-foreground font-tajawal">{label}</span>}
    </div>
  );
}
