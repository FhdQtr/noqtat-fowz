// ═══════════════════════════════════════════════════════════
// مشغّل مقطع يوتيوب داخل شاشة التلفزيون — من ثانية X إلى Y
// زر تشغيل كبير (إيماءة المستخدم تسمح بالصوت)، والمقطع يوقف لحاله
// ═══════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from "react";
import { Play, Loader2, CheckCircle2 } from "lucide-react";
import type { QuestionVideo } from "../types/game";

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<any> | null = null;

function loadYtApi(): Promise<any> {
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    if (window.YT?.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT);
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    tag.onerror = () => resolve(null);
    document.head.appendChild(tag);
    // احتياط: لو الـ API تأخر، ما نعلّق للأبد
    setTimeout(() => (window.YT?.Player ? resolve(window.YT) : resolve(null)), 8000);
  });
  return ytApiPromise;
}

export default function YouTubeClip({ video }: { video: QuestionVideo }) {
  const holderRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let destroyed = false;
    loadYtApi().then((YT) => {
      if (destroyed) return;
      if (!YT || !holderRef.current) {
        setFailed(true);
        return;
      }
      playerRef.current = new YT.Player(holderRef.current, {
        videoId: video.youtubeId,
        width: "100%",
        height: "100%",
        playerVars: {
          start: Math.max(0, Math.floor(video.start)),
          end: Math.max(1, Math.floor(video.end)),
          rel: 0,
          modestbranding: 1,
          controls: 0,
          disablekb: 1,
          playsinline: 1,
        },
        events: {
          onReady: () => !destroyed && setReady(true),
          onStateChange: (e: any) => {
            if (destroyed) return;
            if (e.data === YT.PlayerState.PLAYING) setPlaying(true);
            if (e.data === YT.PlayerState.ENDED) {
              setEnded(true);
              setPlaying(false);
            }
          },
          onError: () => !destroyed && setFailed(true),
        },
      });
    });
    return () => {
      destroyed = true;
      try {
        playerRef.current?.destroy?.();
      } catch {
        /* تجاهل */
      }
    };
  }, [video.youtubeId, video.start, video.end]);

  const play = () => {
    try {
      playerRef.current?.playVideo?.();
    } catch {
      /* تجاهل */
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <div
        className="relative overflow-hidden rounded-3xl border-4 border-gold/50 w-full max-w-3xl aspect-video bg-black"
        style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 44px rgba(212,175,55,0.18)" }}
      >
        <div ref={holderRef} className="absolute inset-0 w-full h-full [&>iframe]:w-full [&>iframe]:h-full" />
        {/* زر التشغيل — يختفي أول ما يشتغل المقطع */}
        {!playing && !ended && (
          <button
            onClick={play}
            disabled={!ready}
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-night/85 backdrop-blur-sm transition-colors hover:bg-night/70"
          >
            {ready ? (
              <>
                <span className="flex items-center justify-center w-24 h-24 rounded-full bg-gold text-night shadow-[0_0_50px_rgba(212,175,55,0.5)] animate-pulse">
                  <Play className="w-12 h-12 -mr-1" />
                </span>
                <span className="font-cairo font-black text-2xl text-gold-light">اضغط تشغيل المقطع</span>
                <span className="text-sm text-muted-foreground">
                  المدة: {Math.max(1, video.end - video.start)} ثانية — وبعدها يظهر السؤال
                </span>
              </>
            ) : (
              <>
                <Loader2 className="w-10 h-10 text-gold animate-spin" />
                <span className="font-cairo text-gold-light">جاري تحميل المقطع…</span>
              </>
            )}
          </button>
        )}
        {ended && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-night/90">
            <CheckCircle2 className="w-14 h-14 text-emerald2-light" />
            <span className="font-cairo font-black text-2xl text-gold-light">انتهى المقطع — السؤال قادم!</span>
          </div>
        )}
      </div>
      {failed && (
        <p className="text-maroon-light font-cairo font-bold">
          تعذّر تشغيل المقطع — تأكد من الرابط وأنه «غير مدرج» وليس «خاص»
        </p>
      )}
      {!ended && (
        <p className="font-cairo font-black text-2xl text-gold-light animate-pulse">
          شاهدوا المقطع جيداً — السؤال عنه!
        </p>
      )}
    </div>
  );
}
