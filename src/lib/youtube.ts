export interface YouTubePlayer {
  playVideo(): void;
  destroy(): void;
}

interface PlayerOptions {
  videoId: string;
  width: string;
  height: string;
  playerVars: Record<string, number>;
  events: {
    onReady(): void;
    onStateChange(event: { data: number }): void;
    onError(): void;
  };
}

interface YouTubeAPI {
  Player: new (element: HTMLElement, options: PlayerOptions) => YouTubePlayer;
  PlayerState: { PLAYING: number; ENDED: number; PAUSED: number };
}

declare global {
  interface Window {
    YT?: YouTubeAPI;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let pending: Promise<YouTubeAPI | null> | null = null;

/** Share one script request; a failed attempt can be retried on the next clip. */
export function loadYouTubeAPI(): Promise<YouTubeAPI | null> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (pending) return pending;
  pending = new Promise<YouTubeAPI | null>((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    const script = document.createElement("script");
    let settled = false;
    const complete = (api: YouTubeAPI | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      script.onerror = null;
      if (window.onYouTubeIframeAPIReady === ready) window.onYouTubeIframeAPIReady = previous;
      if (!api) script.remove();
      resolve(api);
    };
    const ready = () => {
      try { previous?.(); }
      finally { complete(window.YT?.Player ? window.YT : null); }
    };
    window.onYouTubeIframeAPIReady = ready;
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => complete(null);
    const timeout = setTimeout(() => complete(window.YT?.Player ? window.YT : null), 8000);
    document.head.appendChild(script);
  }).then((api) => {
    if (!api) pending = null;
    return api;
  });
  return pending;
}
