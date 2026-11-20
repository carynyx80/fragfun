"use client";

import { useRef, useState } from "react";
import { UploadCloud, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { api, sha256Hex, ClientApiError } from "@/lib/client";
import { VIDEO_MIME_TYPES } from "@/lib/validation";
import { cn } from "@/lib/utils";

const MAX_BYTES = 200 * 1024 * 1024;
const MAX_SECONDS = 90;

type Phase = "idle" | "checking" | "uploading" | "processing" | "failed";

function readVideoMeta(file: File): Promise<{ duration: number; frame: Blob | null }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.playsInline = true;
    v.src = url;
    const done = (frame: Blob | null) => {
      URL.revokeObjectURL(url);
      resolve({ duration: v.duration, frame });
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This video could not be read by your browser."));
    };
    v.onloadedmetadata = () => {
      v.currentTime = Math.min(1, (v.duration || 1) / 3);
    };
    v.onseeked = () => {
      try {
        const scale = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight));
        const c = document.createElement("canvas");
        c.width = Math.round(v.videoWidth * scale);
        c.height = Math.round(v.videoHeight * scale);
        c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
        c.toBlob((b) => done(b), "image/jpeg", 0.85);
      } catch {
        done(null);
      }
    };
  });
}

function putWithProgress(url: string, file: File, onProgress: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    if (url.startsWith("/")) xhr.withCredentials = true;
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else {
        let msg = `Upload failed (${xhr.status}).`;
        try {
          msg = JSON.parse(xhr.responseText)?.error?.message ?? msg;
        } catch {
          /* ignore */
        }
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload. Check your connection and retry."));
    xhr.send(file);
  });
}

export function UploadStep({ onReady }: { onReady: (clipId: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rights, setRights] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const pick = (f: File | undefined) => {
    setError(null);
    if (!f) return;
    if (!VIDEO_MIME_TYPES.includes(f.type as (typeof VIDEO_MIME_TYPES)[number])) return setError("Upload an MP4, MOV or WebM video.");
    if (f.size > MAX_BYTES) return setError("Videos can be at most 200 MB.");
    setFile(f);
  };

  const start = async () => {
    if (!file) return;
    setError(null);
    setPhase("checking");
    try {
      const meta = await readVideoMeta(file);
      if (Number.isFinite(meta.duration) && meta.duration > MAX_SECONDS) throw new Error(`Clips can be at most ${MAX_SECONDS} seconds long.`);
      const contentHash = await sha256Hex(file);
      const up = await api<{ clipId: string; uploadUrl: string; provider: "mux" | "local" }>("/api/uploads", {
        method: "POST",
        json: {
          filename: file.name,
          size: file.size,
          mimeType: file.type,
          durationSeconds: Number.isFinite(meta.duration) ? Math.round(meta.duration * 100) / 100 : undefined,
          contentHash,
          rightsConfirmed: true,
        },
      });
      setPhase("uploading");
      await putWithProgress(up.uploadUrl, file, setProgress);
      // Thumbnail captured in the browser (Mux also generates its own; the custom frame wins when present).
      if (meta.frame && up.provider === "local") {
        const fd = new FormData();
        fd.append("file", meta.frame, "thumb.jpg");
        await fetch(`/api/clips/${up.clipId}/thumbnail`, { method: "POST", body: fd, credentials: "same-origin" });
      }
      setPhase("processing");
      for (let i = 0; i < 240; i++) {
        const s = await api<{ status: string; error: string | null }>(`/api/clips/${up.clipId}/status`);
        if (s.status === "ready") return onReady(up.clipId);
        if (s.status === "failed") throw new Error(s.error ?? "Video processing failed.");
        await new Promise((r) => setTimeout(r, 2500));
      }
      throw new Error("Processing is taking longer than expected. Your clip will appear in your dashboard when ready.");
    } catch (e) {
      setPhase("failed");
      setError(e instanceof ClientApiError || e instanceof Error ? e.message : "Upload failed.");
    }
  };

  const busy = phase === "checking" || phase === "uploading" || phase === "processing";
  return (
    <div className="space-y-5">
      <div
        role="button"
        tabIndex={0}
        onClick={() => !busy && input.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && !busy && input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!busy) pick(e.dataTransfer.files[0]);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-ff-border bg-ff-bg2 px-6 py-14 text-center transition-colors",
          dragging && "border-ff-green bg-ff-green/5",
          busy && "cursor-default opacity-80",
        )}
      >
        <UploadCloud className="size-8 text-ff-muted" />
        <p className="mt-3 font-medium">{file ? file.name : "Drop your clip here or click to browse"}</p>
        <p className="mt-1 text-sm text-ff-muted">
          {file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : `MP4, MOV or WebM · up to 200 MB · max ${MAX_SECONDS}s`}
        </p>
        <input
          ref={input}
          type="file"
          accept="video/mp4,video/quicktime,video/webm"
          className="hidden"
          data-testid="video-input"
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </div>

      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} className="mt-0.5 size-4 accent-[#8bff16]" data-testid="rights-checkbox" />
        <span className="text-ff-muted">
          I own this clip or have the rights to upload it, and it complies with the{" "}
          <a href="/terms" target="_blank" className="text-white underline underline-offset-2">
            Terms
          </a>
          . Footage I don&apos;t own may be removed after a takedown request.
        </span>
      </label>

      {busy && (
        <div className="space-y-2 rounded-xl border border-ff-border bg-ff-card p-4">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" />
            {phase === "checking" && "Checking your video…"}
            {phase === "uploading" && `Uploading… ${progress}%`}
            {phase === "processing" && "Processing video and generating thumbnail…"}
          </div>
          {phase === "uploading" && <Progress value={progress} />}
        </div>
      )}
      {error && (
        <p className="rounded-xl border border-ff-red/30 bg-ff-red/5 px-4 py-3 text-sm text-ff-red" role="alert">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        {phase === "failed" && (
          <Button variant="outline" onClick={() => setPhase("idle")} className="h-10 rounded-full">
            <RotateCcw /> Reset
          </Button>
        )}
        <Button onClick={() => void start()} disabled={!file || !rights || busy} className="h-10 rounded-full px-5 font-semibold" data-testid="upload-button">
          {phase === "failed" ? "Retry upload" : "Upload clip"}
        </Button>
      </div>
    </div>
  );
}
