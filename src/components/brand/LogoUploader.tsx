"use client";

import React, { useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { BusinessLogo } from "./BusinessLogo";
import { fileToLogoDataUrl, LOGO_ACCEPT } from "@/lib/logo-image";

/** Pick, preview and remove a business logo. Hands the parent a resized data URL (or null). */
export function LogoUploader({
  businessName,
  value,
  brandColor,
  onChange,
  busy = false,
  compact = false,
}: {
  businessName: string;
  value: string | null;
  brandColor?: string | null;
  onChange: (dataUrl: string | null) => void | Promise<void>;
  busy?: boolean;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setProcessing(true);
    try {
      await onChange(await fileToLogoDataUrl(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "That image couldn't be used.");
    } finally {
      setProcessing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const working = busy || processing;

  return (
    <div>
      <div className="flex items-center gap-4">
        <BusinessLogo
          name={businessName || "Your business"}
          logoUrl={value}
          brandColor={brandColor}
          size={compact ? "md" : "lg"}
        />
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={working}
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-evergreen-deep border border-zinc-300 hover:border-evergreen bg-white rounded-full px-3.5 py-1.5 transition-colors cursor-pointer disabled:opacity-60"
            >
              <ImagePlus className="w-4 h-4" />
              {working ? "Working..." : value ? "Change logo" : "Upload logo"}
            </button>
            {value && (
              <button
                type="button"
                disabled={working}
                onClick={() => onChange(null)}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 hover:text-rose-700 rounded-full px-3 py-1.5 hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-60"
              >
                <Trash2 className="w-4 h-4" />
                Remove
              </button>
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-1.5">PNG, JPG or WebP. A square logo looks best.</p>
        </div>
      </div>
      {error && <p className="text-sm text-rose-700 mt-2">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept={LOGO_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => pick(e.target.files?.[0])}
      />
    </div>
  );
}
