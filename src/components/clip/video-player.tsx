"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Maximize, Pause, Play, Volume2, VolumeX } from "lucide-react";
import type { PlaybackSource } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface VideoPlayerHandle {
  play: () => void;
  pause: () => void;
}

/**
 * HLS (Mux) or progressive (local dev) playback. hls.js is loaded lazily and only when the
 * browser lacks native HLS (Safari/iOS play HLS natively).
 */
export const VideoPlayer = forwardRef<
  VideoPlayerHandle,
  {
    source: PlaybackSource | null;
    poster?: string | null;
    autoPlay?: boolean;
    muted?: boolean;
    loop?: boolean;
    controls?: boolean;
    className?: string;
    fit?: "cover" | "contain";
    onPlayed?: () => void;
  }
>(function VideoPlayer({ source, poster, autoPlay, muted: mutedProp = true, loop = true, controls = true, className, fit = "contain", onPlayed }, ref) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(mutedProp);
  const [error, setError] = useState<string | null>(null);
  const reported = useRef(false);

  useImperativeHandle(ref, () => ({
    play: () => void videoRef.current?.play().catch(() => undefined),
    pause: () => videoRef.current?.pause(),
  }));

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source) return;
    let hls: { destroy: () => void } | null = null;
    setError(null);
    if (source.type === "hls" && !video.canPlayType("application/vnd.apple.mpegurl")) {
      void import("hls.js").then(({ default: Hls }) => {
        if (!Hls.isSupported()) {
          setError("This browser cannot play this video.");
          return;
        }
        const h = new Hls({ capLevelToPlayerSize: true, maxBufferLength: 20 });
        h.loadSource(source.src);
        h.attachMedia(video);
        h.on(Hls.Events.ERROR, (_e, data) => {
          if (data.fatal) setError("Video failed to load.");
        });
        hls = h;
        if (autoPlay) void video.play().catch(() => undefined);
      });
    } else {
      video.src = source.src;
      if (autoPlay) void video.play().catch(() => undefined);
    }
    return () => {
      hls?.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [source, autoPlay]);

  useEffect(() => setMuted(mutedProp), [mutedProp]);

  if (!source) {
    return (
      <div className={cn("flex items-center justify-center bg-ff-bg2 text-sm text-ff-muted", className)}>Video unavailable</div>
    );
  }

  return (
    <div ref={wrapRef} className={cn("group relative overflow-hidden bg-black", className)}>
      <video
        ref={videoRef}
        poster={poster ?? undefined}
        muted={muted}
        loop={loop}
        playsInline
        preload="metadata"
        className={cn("size-full", fit === "cover" ? "object-cover" : "object-contain")}
        onPlay={() => {
          setPlaying(true);
          if (!reported.current) {
            reported.current = true;
            onPlayed?.();
          }
        }}
        onPause={() => setPlaying(false)}
        onError={() => setError("Video failed to load.")}
        onClick={() => {
          const v = videoRef.current;
          if (!v) return;
          if (v.paused) void v.play();
          else v.pause();
        }}
      />
      {error && <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-sm text-ff-muted">{error}</div>}
      {controls && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/70 to-transparent p-3 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
          <button
            type="button"
            aria-label={playing ? "Pause" : "Play"}
            className="pointer-events-auto flex size-8 items-center justify-center rounded-full bg-white/10 backdrop-blur hover:bg-white/20"
            onClick={() => {
              const v = videoRef.current;
              if (!v) return;
              if (v.paused) void v.play();
              else v.pause();
            }}
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </button>
          <button
            type="button"
            aria-label={muted ? "Unmute" : "Mute"}
            className="pointer-events-auto flex size-8 items-center justify-center rounded-full bg-white/10 backdrop-blur hover:bg-white/20"
            onClick={() => setMuted((m) => !m)}
          >
            {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </button>
          <button
            type="button"
            aria-label="Fullscreen"
            className="pointer-events-auto ml-auto flex size-8 items-center justify-center rounded-full bg-white/10 backdrop-blur hover:bg-white/20"
            onClick={() => {
              const el = wrapRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null;
              const v = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
              if (el?.requestFullscreen) void el.requestFullscreen();
              else v?.webkitEnterFullscreen?.();
            }}
          >
            <Maximize className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
});
