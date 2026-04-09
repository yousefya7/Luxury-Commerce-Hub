import { useState, useEffect, useRef, useCallback } from "react";
import { Music2, Play, Pause, Volume2, VolumeX, X, ChevronUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { PublicSettings } from "@/hooks/use-public-settings";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}

function extractVideoId(url: string): string | null {
  if (!url || !url.trim()) return null;
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /\/embed\/([a-zA-Z0-9_-]{11})/,
    /\/v\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) {
      console.log("[MusicPlayer] Extracted video ID:", m[1], "from URL:", url);
      return m[1];
    }
  }
  console.warn("[MusicPlayer] Could not extract video ID from URL:", url);
  return null;
}

let ytApiLoaded = false;
let ytApiCallbacks: (() => void)[] = [];

function loadYouTubeApi(): Promise<void> {
  return new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      console.log("[MusicPlayer] YouTube API already loaded — skipping script inject");
      resolve();
      return;
    }
    ytApiCallbacks.push(resolve);
    if (ytApiLoaded) return;
    ytApiLoaded = true;
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      console.log("[MusicPlayer] onYouTubeIframeAPIReady fired — API is ready");
      if (prev) prev();
      ytApiCallbacks.forEach((cb) => cb());
      ytApiCallbacks = [];
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    tag.id = "yt-iframe-api";
    document.head.appendChild(tag);
    console.log("[MusicPlayer] YouTube IFrame API script injected");
  });
}

export default function MusicPlayer() {
  const [location] = useLocation();
  const isAdmin = location.startsWith("/admin");

  const { data: settings } = useQuery<PublicSettings>({
    queryKey: ["/api/settings/public"],
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  const music = settings?.music;

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [needsClick, setNeedsClick] = useState(false);
  const [localVolume, setLocalVolume] = useState(60);

  const playerRef = useRef<any>(null);
  const activeVideoIdRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const divIdRef = useRef<string>("");
  const volumeSyncedRef = useRef(false);

  const destroyPlayer = useCallback(() => {
    console.log("[MusicPlayer] Destroying player instance");
    try { playerRef.current?.destroy(); } catch {}
    playerRef.current = null;
    activeVideoIdRef.current = null;
    volumeSyncedRef.current = false;
    setPlayerReady(false);
    setIsPlaying(false);
    setNeedsClick(false);
    if (containerRef.current) {
      containerRef.current.remove();
      containerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isAdmin) return;

    if (!music) {
      console.log("[MusicPlayer] Settings not yet loaded — waiting");
      return;
    }

    console.log("[MusicPlayer] Music settings received from API:", JSON.stringify(music));

    if (!music.enabled) {
      console.log("[MusicPlayer] Music is disabled in dashboard — not loading player");
      destroyPlayer();
      return;
    }

    if (!music.youtubeUrl) {
      console.log("[MusicPlayer] No YouTube URL saved in dashboard — not loading player");
      destroyPlayer();
      return;
    }

    const videoId = extractVideoId(music.youtubeUrl);
    if (!videoId) {
      console.warn("[MusicPlayer] URL could not be parsed — aborting");
      return;
    }

    if (videoId === activeVideoIdRef.current && playerRef.current) {
      console.log("[MusicPlayer] Same video ID already loaded — skipping reinit:", videoId);
      return;
    }

    destroyPlayer();
    activeVideoIdRef.current = videoId;
    const vol = music.volume ?? 60;
    setLocalVolume(vol);

    const divId = `yt-player-${Date.now()}`;
    divIdRef.current = divId;

    const container = document.createElement("div");
    container.style.cssText =
      "position:fixed;left:-9999px;top:-9999px;width:320px;height:180px;opacity:0;pointer-events:none;z-index:-1;";
    const inner = document.createElement("div");
    inner.id = divId;
    container.appendChild(inner);
    document.body.appendChild(container);
    containerRef.current = container;

    console.log("[MusicPlayer] Initializing YouTube player for videoId:", videoId);

    loadYouTubeApi().then(() => {
      if (activeVideoIdRef.current !== videoId) {
        console.log("[MusicPlayer] Video ID changed while API was loading — aborting");
        return;
      }

      playerRef.current = new window.YT.Player(divId, {
        height: "180",
        width: "320",
        videoId,
        playerVars: {
          autoplay: 1,
          loop: music.loop ? 1 : 0,
          playlist: music.loop ? videoId : undefined,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
          mute: 0,
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (e: any) => {
            console.log("[MusicPlayer] onReady fired — player initialized successfully");
            e.target.setVolume(vol);
            setPlayerReady(true);
            try {
              e.target.playVideo();
              console.log("[MusicPlayer] playVideo() called");
            } catch (err) {
              console.warn("[MusicPlayer] playVideo() threw:", err);
            }
            setTimeout(() => {
              try {
                const state = e.target.getPlayerState();
                console.log("[MusicPlayer] Player state after 1.5s:", state, "(1=playing, 2=paused, -1=unstarted)");
                if (state !== 1) {
                  console.log("[MusicPlayer] Autoplay was blocked by browser — showing click prompt");
                  setNeedsClick(true);
                }
              } catch {}
            }, 1500);
          },
          onStateChange: (e: any) => {
            const stateName: Record<number, string> = { [-1]: "UNSTARTED", 0: "ENDED", 1: "PLAYING", 2: "PAUSED", 3: "BUFFERING", 5: "CUED" };
            console.log("[MusicPlayer] State changed to:", e.data, stateName[e.data] || "UNKNOWN");
            if (e.data === 1) { setIsPlaying(true); setNeedsClick(false); }
            else if (e.data === 2 || e.data === 0) { setIsPlaying(false); }
          },
          onError: (e: any) => {
            const errors: Record<number, string> = {
              2: "Invalid video ID",
              5: "HTML5 player error",
              100: "Video not found or private",
              101: "Embedding disabled by owner",
              150: "Embedding disabled by owner",
            };
            console.error("[MusicPlayer] YouTube player error code:", e.data, "—", errors[e.data] || "Unknown error");
          },
        },
      });
    });

    return () => { destroyPlayer(); };
  }, [music?.enabled, music?.youtubeUrl, music?.loop, isAdmin, destroyPlayer]);

  // Sync volume from dashboard settings on first ready only — don't override local slider changes
  useEffect(() => {
    if (playerReady && !volumeSyncedRef.current && music?.volume !== undefined) {
      volumeSyncedRef.current = true;
      try { playerRef.current?.setVolume(music.volume); } catch {}
      setLocalVolume(music.volume);
    }
  }, [playerReady, music?.volume]);

  useEffect(() => {
    if (!needsClick || !playerRef.current || !playerReady) return;
    const handler = () => {
      console.log("[MusicPlayer] User clicked — starting music now");
      try { playerRef.current?.playVideo(); } catch {}
      setNeedsClick(false);
    };
    document.addEventListener("click", handler, { once: true });
    return () => document.removeEventListener("click", handler);
  }, [needsClick, playerReady]);

  const setPlayerVolume = (val: number) => {
    const p = playerRef.current;
    if (!p) {
      console.warn("[MusicPlayer] setVolume called but playerRef is null");
      return;
    }
    try {
      if (typeof p.setVolume === "function") {
        p.setVolume(val);
        console.log("[MusicPlayer] setVolume(" + val + ") called successfully");
      } else {
        console.error("[MusicPlayer] setVolume is not a function on player:", typeof p.setVolume);
      }
    } catch (err) {
      console.error("[MusicPlayer] setVolume error:", err);
    }
  };

  const handleVolumeChange = (val: number) => {
    console.log("[MusicPlayer] Volume slider changed to:", val, "| playerReady:", playerReady, "| player:", playerRef.current ? "exists" : "null");
    setLocalVolume(val);
    setPlayerVolume(val);
    if (val > 0 && isMuted) {
      try { playerRef.current?.unMute(); } catch {}
      setIsMuted(false);
    }
    if (val === 0) {
      try { playerRef.current?.mute(); } catch {}
      setIsMuted(true);
    }
  };

  const togglePlay = () => {
    if (!playerRef.current || !playerReady) return;
    try {
      if (isPlaying) { playerRef.current.pauseVideo(); console.log("[MusicPlayer] Paused by user"); }
      else { playerRef.current.playVideo(); console.log("[MusicPlayer] Played by user"); }
    } catch (err) {
      console.error("[MusicPlayer] togglePlay error:", err);
    }
  };

  const toggleMute = () => {
    if (!playerRef.current || !playerReady) return;
    try {
      if (isMuted) {
        playerRef.current.unMute();
        playerRef.current.setVolume(localVolume || 60);
        setIsMuted(false);
        console.log("[MusicPlayer] Unmuted, volume restored to", localVolume || 60);
      } else {
        playerRef.current.mute();
        setIsMuted(true);
        console.log("[MusicPlayer] Muted");
      }
    } catch (err) {
      console.error("[MusicPlayer] toggleMute error:", err);
    }
  };

  if (isAdmin) return null;
  if (!music?.enabled || !music?.youtubeUrl || isDismissed) return null;
  if (!extractVideoId(music.youtubeUrl)) return null;

  if (isMinimized) {
    return (
      <div
        className="fixed bottom-6 right-6 z-[9990] flex items-center gap-2 cursor-pointer"
        onClick={() => setIsMinimized(false)}
        data-testid="music-player-minimized"
      >
        <div className={`w-10 h-10 border-2 flex items-center justify-center transition-colors ${needsClick ? "border-accent-blue animate-pulse" : "border-border/60 hover:border-accent-blue"} bg-[hsl(0_0%_4%)]`}>
          <Music2 className={`w-4 h-4 ${isPlaying || needsClick ? "text-accent-blue" : "text-muted-foreground"}`} />
        </div>
      </div>
    );
  }

  return (
    <>
      {needsClick && (
        <div
          className="fixed bottom-[108px] right-6 z-[9991] bg-[hsl(0_0%_6%)] border-2 border-accent-blue/70 px-3 py-2"
          data-testid="music-autoplay-hint"
        >
          <p className="text-[10px] font-mono text-accent-blue uppercase tracking-widest whitespace-nowrap">
            🎵 Click anywhere to enable music
          </p>
        </div>
      )}

      <div
        className="fixed bottom-6 right-6 z-[9990] w-[220px] border-2 border-border/60 bg-[hsl(0_0%_4%)] shadow-2xl"
        data-testid="music-player"
      >
        <div className="flex items-center justify-between px-3 py-2 border-b-2 border-border/40 bg-[hsl(0_0%_6%)]">
          <div className="flex items-center gap-2">
            <Music2 className={`w-3 h-3 ${isPlaying ? "text-accent-blue" : "text-muted-foreground"}`} />
            <span className="text-[10px] font-mono tracking-luxury uppercase text-muted-foreground">
              {!playerReady ? "Loading…" : needsClick ? "Tap anywhere" : isPlaying ? "Now Playing" : "Paused"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsMinimized(true)}
              className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-music-minimize"
            >
              <ChevronUp className="w-3 h-3" />
            </button>
            <button
              onClick={() => {
                try { if (playerRef.current && playerReady) playerRef.current.pauseVideo(); } catch {}
                setIsDismissed(true);
              }}
              className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-music-close"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>

        <div className="px-3 py-3">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 bg-[hsl(0_0%_10%)] border border-border/40 flex items-center justify-center flex-shrink-0">
              <Music2 className="w-4 h-4 text-muted-foreground/60" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-widest">Resilient Radio</p>
              <div className="flex items-center gap-0.5 mt-1 h-4">
                {isPlaying ? (
                  [12, 8, 14, 6, 10].map((h, i) => (
                    <div
                      key={i}
                      className="w-0.5 bg-accent-blue rounded-sm"
                      style={{
                        height: `${h}px`,
                        animation: `musicBar 0.${6 + i * 2}s ease-in-out infinite alternate`,
                        animationDelay: `${i * 0.1}s`,
                      }}
                    />
                  ))
                ) : (
                  [10, 6, 10, 6, 10].map((h, i) => (
                    <div key={i} className="w-0.5 bg-border/40 rounded-sm" style={{ height: `${h}px` }} />
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between mb-3">
            <button
              onClick={toggleMute}
              disabled={!playerReady}
              className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors border border-border/40 hover:border-border/70 disabled:opacity-30"
              data-testid="button-music-mute"
            >
              {isMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
            </button>

            <button
              onClick={togglePlay}
              disabled={!playerReady}
              className="w-10 h-10 flex items-center justify-center border-2 border-accent-blue bg-accent-blue/10 hover:bg-accent-blue/20 text-accent-blue transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              data-testid="button-music-play-pause"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>

            <div className="w-7 h-7 flex items-center justify-center">
              {!playerReady && (
                <div className="w-3 h-3 border border-muted-foreground/40 border-t-muted-foreground animate-spin" />
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Volume2 className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />
            <input
              type="range"
              min={0}
              max={100}
              value={isMuted ? 0 : localVolume}
              onChange={(e) => handleVolumeChange(Number(e.target.value))}
              onInput={(e) => handleVolumeChange(Number((e.target as HTMLInputElement).value))}
              disabled={!playerReady}
              className="flex-1 h-1 accent-accent-blue cursor-pointer disabled:opacity-30"
              style={{ touchAction: "none" }}
              data-testid="range-music-volume"
            />
          </div>
        </div>
      </div>
    </>
  );
}
