"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff } from "lucide-react";

type Status = "idle" | "starting" | "scanning" | "error";

/**
 * Live camera QR scanner for the till. Uses the browser's BarcodeDetector where available
 * and falls back to jsQR. Stops itself after the first successful read.
 */
export function QrCameraScanner({ onResult, disabled = false }: { onResult: (text: string) => void; disabled?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<number | null>(null);
  const onResultRef = useRef(onResult);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  const stop = useCallback(() => {
    if (loopRef.current) window.clearTimeout(loopRef.current);
    loopRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus((s) => (s === "error" ? s : "idle"));
  }, []);

  useEffect(() => stop, [stop]);

  const start = async () => {
    setMessage(null);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      setMessage("The camera only works over a secure (https) connection. Type the customer ID below instead.");
      return;
    }
    setStatus("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      setStatus("scanning");

      type Detector = { detect: (src: CanvasImageSource) => Promise<Array<{ rawValue: string }>> };
      const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
      const detector = BD ? new BD({ formats: ["qr_code"] }) : null;
      const jsQR = detector ? null : (await import("jsqr")).default;

      const tick = async () => {
        if (!streamRef.current || !videoRef.current) return;
        const v = videoRef.current;
        let text: string | null = null;
        try {
          if (v.readyState >= 2) {
            if (detector) {
              const codes = await detector.detect(v);
              text = codes[0]?.rawValue || null;
            } else if (jsQR) {
              const scale = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight));
              const w = Math.round(v.videoWidth * scale);
              const h = Math.round(v.videoHeight * scale);
              const canvas = (canvasRef.current ||= document.createElement("canvas"));
              canvas.width = w;
              canvas.height = h;
              const g = canvas.getContext("2d", { willReadFrequently: true });
              if (g) {
                g.drawImage(v, 0, 0, w, h);
                const img = g.getImageData(0, 0, w, h);
                text = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" })?.data || null;
              }
            }
          }
        } catch {
          // A dropped frame is fine; try the next one.
        }

        if (text) {
          stop();
          if (navigator.vibrate) navigator.vibrate(60);
          onResultRef.current(text);
          return;
        }
        loopRef.current = window.setTimeout(tick, 140);
      };
      tick();
    } catch (err) {
      stop();
      setStatus("error");
      const name = err instanceof DOMException ? err.name : "";
      setMessage(
        name === "NotAllowedError"
          ? "Camera access was blocked. Allow the camera in your browser settings, or type the customer ID below."
          : name === "NotFoundError"
          ? "No camera was found on this device. Type the customer ID below instead."
          : "The camera couldn't start. Type the customer ID below instead."
      );
    }
  };

  const running = status === "scanning" || status === "starting";

  return (
    <div>
      <div className="relative aspect-[4/3] sm:aspect-video w-full overflow-hidden rounded-2xl bg-evergreen-deep">
        <video
          ref={videoRef}
          className={`absolute inset-0 w-full h-full object-cover ${running ? "" : "hidden"}`}
          muted
          playsInline
        />
        {running ? (
          <div aria-hidden className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-[58%] max-w-[260px] aspect-square rounded-3xl border-4 border-marigold/90 shadow-[0_0_0_9999px_rgba(29,38,36,0.45)]" />
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 text-white">
            <Camera className="w-10 h-10 text-marigold" />
            <p className="mt-3 font-display text-lg font-bold">Scan the customer&rsquo;s QR code</p>
            <p className="text-sm text-white/70 mt-1 max-w-xs">
              Ask them to open their card and tap &ldquo;Show my card&rdquo;.
            </p>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center gap-3">
        {running ? (
          <button
            type="button"
            onClick={stop}
            className="inline-flex items-center gap-2 min-h-[48px] px-5 rounded-full border border-zinc-300 font-semibold text-zinc-700 hover:bg-zinc-50 cursor-pointer"
          >
            <CameraOff className="w-4 h-4" />
            Stop camera
          </button>
        ) : (
          <button
            type="button"
            onClick={start}
            disabled={disabled}
            className="inline-flex items-center gap-2 min-h-[48px] px-5 rounded-full bg-evergreen text-white font-semibold hover:bg-evergreen-deep cursor-pointer disabled:opacity-60"
          >
            <Camera className="w-4 h-4" />
            Start camera
          </button>
        )}
        {status === "starting" && <span className="text-sm text-zinc-500">Starting camera...</span>}
        {status === "scanning" && <span className="text-sm text-zinc-500">Hold the code inside the frame</span>}
      </div>
      {message && <p className="mt-2 text-sm text-rose-700">{message}</p>}
    </div>
  );
}
