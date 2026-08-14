import { useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { isAudioMuted, setAudioMuted } from "../lib/sounds";

export default function SoundToggle() {
  const [muted, setMuted] = useState(isAudioMuted);

  const toggle = () => {
    const next = !muted;
    setAudioMuted(next);
    setMuted(next);
  };

  return (
    <button
      type="button"
      className="m-sound-toggle"
      onClick={toggle}
      aria-label={muted ? "تشغيل المؤثرات الصوتية" : "كتم المؤثرات الصوتية"}
      title={muted ? "تشغيل الصوت" : "كتم الصوت"}
    >
      {muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
    </button>
  );
}
