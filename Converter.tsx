import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  PRESETS,
  convertTo3gp,
  getFFmpeg,
  formatBytes,
  type PresetId,
} from "@/lib/convert-3gp";
import type { NativePickedFile } from "@/lib/native-ffmpeg";

type Status = "idle" | "loading-engine" | "converting" | "done" | "error";

interface Output {
  name: string;
  size: number;
  /** Browser conversions produce an in-memory file; native ones produce a file on disk. */
  url?: string;
  blob?: Blob;
  nativePath?: string;
}

interface SaveFileHandle {
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
}

type SaveFilePicker = (options: {
  suggestedName: string;
  types: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
}) => Promise<SaveFileHandle>;

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

export function Converter() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [presetId, setPresetId] = useState<PresetId>("standard");
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [logLine, setLogLine] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<Output | null>(null);
  const [dragging, setDragging] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const progressRef = useRef(0);
  // Inside the Android app we convert with the phone's own FFmpeg — far faster.
  const [nativeEngine, setNativeEngine] = useState(false);
  const [nativeFile, setNativeFile] = useState<NativePickedFile | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { hasNativeEngine } = await import("@/lib/native-ffmpeg");
      const ok = await hasNativeEngine();
      if (alive) setNativeEngine(ok);
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Tick a clock while converting so elapsed/remaining stay live.
  useEffect(() => {
    if (startedAt === null) return;
    const id = window.setInterval(() => {
      setElapsed((Date.now() - startedAt) / 1000);
    }, 500);
    return () => window.clearInterval(id);
  }, [startedAt]);

  const eta =
    startedAt !== null && progress > 0.02 && progress < 1
      ? Math.max(1, (elapsed / progress) * (1 - progress))
      : null;

  useEffect(() => {
    return () => {
      if (output?.url) URL.revokeObjectURL(output.url);
    };
  }, [output]);

  const reset = useCallback(() => {
    setOutput((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
    setError(null);
    setProgress(0);
    setStatus("idle");
    setLogLine("");
    setPreviewFailed(false);
    setSaveMessage(null);
    setStartedAt(null);
    setElapsed(0);
    progressRef.current = 0;
  }, []);

  const pickFile = useCallback(
    (next: File | null | undefined) => {
      if (!next) return;
      reset();
      setNativeFile(null);
      setFile(next);
      // Warm up the engine while the user picks a preset, so Convert starts instantly.
      void getFFmpeg().catch(() => {});
    },
    [reset],
  );

  // In the Android app, Android's own picker hands us a file the native engine can stream.
  const pickNative = useCallback(async () => {
    const { pickVideoNative } = await import("@/lib/native-ffmpeg");
    const picked = await pickVideoNative();
    if (!picked) return;
    reset();
    setFile(null);
    setNativeFile(picked);
  }, [reset]);

  const openPicker = useCallback(() => {
    if (nativeEngine) {
      void pickNative();
      return;
    }
    inputRef.current?.click();
  }, [nativeEngine, pickNative]);

  const download = useCallback(() => {
    if (!output?.url) return;
    setSaveMessage(null);
    const a = document.createElement("a");
    a.href = output.url;
    a.download = output.name;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    window.setTimeout(() => a.remove(), 1000);
    setSaveMessage("Download started. Check your browser's Downloads folder.");
  }, [output]);


  const saveFile = useCallback(async () => {
    if (!output) return;
    setSaving(true);
    setSaveMessage(null);
    const picker = (window as Window & { showSaveFilePicker?: SaveFilePicker })
      .showSaveFilePicker;

    try {
      // Native conversion already wrote the file to disk — just move it into Movies.
      if (output.nativePath) {
        const { saveNativeOutput } = await import("@/lib/native-ffmpeg");
        setSaveMessage(await saveNativeOutput(output.nativePath));
        return;
      }

      // Inside the Android app shell, write straight to device storage.
      const { isNativeApp, saveToDevice } = await import("@/lib/native-save");
      if (isNativeApp() && output.blob) {
        setSaveMessage(await saveToDevice(output.blob, output.name));
        return;
      }
      if (!output.blob) {
        setSaveMessage("The converted file is no longer available. Please convert again.");
        return;
      }


      if (picker) {

        const handle = await picker({
          suggestedName: output.name,
          types: [
            {
              description: "3GP video",
              accept: { "video/3gpp": [".3gp"] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(output.blob);
        await writable.close();
        setSaveMessage(`Saved ${output.name}`);
        return;
      }

      const sharedFile = new File([output.blob], output.name, { type: "video/3gpp" });
      if (navigator.share && navigator.canShare?.({ files: [sharedFile] })) {
        await navigator.share({ files: [sharedFile], title: output.name });
        setSaveMessage("File sent to your selected app or save location.");
        return;
      }

      download();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      download();
    } finally {
      setSaving(false);
    }
  }, [download, output]);


  const run = useCallback(async () => {
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    if (!file && !nativeFile) return;
    reset();
    setStatus("loading-engine");
    try {
      setStatus("converting");
      setStartedAt(Date.now());
      setElapsed(0);

      const trackProgress = (ratio: number) => {
        // ffmpeg progress can wobble backwards; keep the bar monotonic.
        const next = Math.max(progressRef.current, ratio);
        progressRef.current = next;
        setProgress(next);
      };

      // Fast path: the phone's own FFmpeg, running as real native code.
      if (nativeFile) {
        const { convertNative } = await import("@/lib/native-ffmpeg");
        const native = await convertNative(
          nativeFile,
          {
            width: preset.width,
            height: preset.height,
            fps: preset.fps,
            videoBitrate: preset.videoBitrate,
            audioRate: preset.audioRate,
            audioBitrate: preset.audioBitrate,
          },
          { onProgress: trackProgress, onLog: (line) => setLogLine(line) },
        );
        setOutput({ name: native.name, size: native.size, nativePath: native.path });
        setProgress(1);
        setStartedAt(null);
        setStatus("done");
        return;
      }

      const result = await convertTo3gp(file!, preset, {
        onProgress: trackProgress,
        onLog: (line) => setLogLine(line),
      });
      setOutput({
        url: URL.createObjectURL(result.blob),
        name: result.fileName,
        size: result.blob.size,
        blob: result.blob,
      });
      setProgress(1);
      setStartedAt(null);
      setStatus("done");
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while converting this video.",
      );
      setStartedAt(null);
      setStatus("error");
    }
  }, [file, nativeFile, presetId, reset]);

  const busy = status === "loading-engine" || status === "converting";

  return (
    <div className="panel p-5 sm:p-7">
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pickFile(e.dataTransfer.files?.[0]);
        }}
        onClick={() => !busy && openPicker()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-5 py-9 text-center transition-colors",
          dragging ? "border-primary bg-accent/60" : "border-border bg-secondary/30",
          busy && "pointer-events-none opacity-60",
        )}
      >
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          input file
        </span>
        <p className="mt-3 font-display text-lg font-semibold">
          {nativeFile ? nativeFile.name : file ? file.name : "Drop a video or tap to browse"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {nativeFile
            ? `${formatBytes(nativeFile.size)} · ready for the fast engine`
            : file
              ? `${formatBytes(file.size)} · ${file.type || "unknown format"}`
              : "MP4, MKV, MOV, AVI, WEBM, FLV, WMV, M4V and more"}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="video/*,.mkv,.flv,.wmv,.avi,.mov,.m4v,.ts,.3gp"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0])}
        />
      </div>

      {/* Presets */}
      <div className="mt-6">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          output quality
        </span>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={busy}
              onClick={() => setPresetId(preset.id)}
              className={cn(
                "rounded-lg border p-3 text-left transition-colors disabled:opacity-60",
                presetId === preset.id
                  ? "border-primary bg-accent/70"
                  : "border-border bg-secondary/40 hover:border-primary/50",
              )}
            >
              <span className="block font-display text-sm font-semibold">{preset.label}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{preset.detail}</span>
            </button>
          ))}
        </div>
      </div>

      <Button
        variant="hero"
        size="lg"
        className="mt-6 h-12 w-full text-base"
        disabled={(!file && !nativeFile) || busy}
        onClick={run}
      >
        {busy ? "Converting…" : "Convert to 3GP"}
      </Button>

      {nativeEngine && (
        <p className="mt-3 text-center font-mono text-xs uppercase tracking-[0.2em] text-primary">
          fast phone engine active
        </p>
      )}

      {busy && (
        <div className="mt-5 rounded-xl border border-border bg-accent/30 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-display text-sm font-semibold">
              {status === "loading-engine"
                ? "Starting engine…"
                : `Converting · ${Math.round(progress * 100)}%`}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {status === "loading-engine"
                ? "warming up"
                : eta !== null
                  ? `~${formatDuration(eta)} left`
                  : "estimating…"}
            </span>
          </div>
          <Progress
            value={status === "loading-engine" ? 3 : Math.round(progress * 100)}
            className="mt-3 h-2"
          />
          <div className="mt-2 flex items-baseline justify-between gap-3">
            <p className="truncate font-mono text-xs text-muted-foreground">
              {logLine || "processing frames"}
            </p>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              {formatDuration(elapsed)} elapsed
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Keep this tab open — large files take longer, and the estimate sharpens as it runs.
          </p>
        </div>
      )}

      {status === "done" && output && (
        <div className="mt-5 rounded-xl border border-primary/40 bg-accent/50 p-4">
          <p className="font-display text-base font-semibold">Ready: {output.name}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            3GP file · {formatBytes(output.size)}
          </p>
          {!output.url ? (
            <p className="mt-3 rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
              Your file is ready on the phone. Tap Save as 3gp to put it in your Movies folder.
            </p>
          ) : previewFailed ? (
            <p className="mt-3 rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
              This browser can't play 3GP inline — the file is fine, download it and play it in your
              phone's gallery or VLC.
            </p>
          ) : (
            <video
              src={output.url}
              controls
              playsInline
              onError={() => setPreviewFailed(true)}
              className="mt-3 w-full rounded-lg border border-border bg-background"
            />
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="hero" onClick={saveFile} disabled={saving}>
              {saving ? "Saving…" : "Save as 3gp"}
            </Button>
            <Button variant="panel" onClick={reset}>
              Convert again
            </Button>
          </div>
          {saveMessage && (
            <p className="mt-3 text-xs text-muted-foreground" role="status">
              {saveMessage}
            </p>
          )}
        </div>
      )}

      {status === "error" && (
        <div className="mt-5 rounded-xl border border-destructive/50 bg-destructive/10 p-4">
          <p className="font-display text-sm font-semibold text-destructive-foreground">
            Conversion failed
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        </div>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        Everything runs inside your browser — your video is never uploaded anywhere. Large files
        take longer and use more memory, so keep clips under a few hundred megabytes.
      </p>
    </div>
  );
}
