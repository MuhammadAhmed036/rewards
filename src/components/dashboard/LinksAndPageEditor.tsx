"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Smartphone,
  Monitor,
  Star,
  Globe,
  ArrowRight,
  HelpCircle,
  Save,
  CheckCircle2,
} from "lucide-react";
import { InstagramIcon, FacebookIcon } from "@/components/ui/icons";

export interface LinkConfig {
  type: "google_review" | "instagram" | "facebook" | "website" | "other";
  label: string;
  url: string;
  enabled: boolean;
  sortOrder: number;
}

interface LinksAndPageEditorProps {
  businessName: string;
  brandPrimaryHex: string;
  initialLinks: LinkConfig[];
  onSave: (links: LinkConfig[]) => Promise<void>;
}

export function LinksAndPageEditor({
  businessName,
  brandPrimaryHex,
  initialLinks,
  onSave,
}: LinksAndPageEditorProps) {
  const [links, setLinks] = useState<LinkConfig[]>(initialLinks);
  const [previewMode, setPreviewMode] = useState<"mobile" | "desktop">("mobile");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleUpdate = (index: number, updates: Partial<LinkConfig>) => {
    setLinks((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
    setSaveSuccess(false);
  };

  const handlePublish = async () => {
    setSaving(true);
    try {
      await onSave(links);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const enabledLinks = links.filter((l) => l.enabled);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Settings Form (Left 6 Cols) */}
      <div className="lg:col-span-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Review & Social Links</CardTitle>
            <p className="text-sm text-slate-500">
              Configure the buttons visible on your customer loyalty hub.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {links.map((link, idx) => {
              let Icon: React.ComponentType<{ className?: string }> = Globe;
              let defaultHelper = "";
              if (link.type === "google_review") {
                Icon = Star;
                defaultHelper =
                  "Find your Google review link in Google Business Profile → Get more reviews → Share review form.";
              } else if (link.type === "instagram") {
                Icon = InstagramIcon;
                defaultHelper = "e.g. https://instagram.com/yourbusiness";
              } else if (link.type === "facebook") {
                Icon = FacebookIcon;
                defaultHelper = "e.g. https://facebook.com/yourbusiness";
              }

              return (
                <div
                  key={link.type}
                  className="p-4 rounded-2xl border border-zinc-200 bg-zinc-50/50 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Icon
                        className={`h-5 w-5 ${
                          link.type === "google_review"
                            ? "text-amber-500 fill-amber-500"
                            : link.type === "instagram"
                            ? "text-pink-600"
                            : link.type === "facebook"
                            ? "text-blue-600"
                            : "text-slate-600"
                        }`}
                      />
                      <span className="font-bold text-sm capitalize">
                        {link.type.replace("_", " ")}
                      </span>
                    </div>

                    <label className="flex items-center space-x-2 text-xs font-semibold cursor-pointer">
                      <span>{link.enabled ? "Enabled" : "Disabled"}</span>
                      <input
                        type="checkbox"
                        checked={link.enabled}
                        onChange={(e) => handleUpdate(idx, { enabled: e.target.checked })}
                        className="rounded border-slate-300 text-slate-900 focus:ring-slate-900 h-4 w-4"
                      />
                    </label>
                  </div>

                  <div className="space-y-2">
                    <div>
                      <label className="text-xs font-medium text-slate-500 block mb-1">
                        Button Label
                      </label>
                      <Input
                        value={link.label}
                        onChange={(e) => handleUpdate(idx, { label: e.target.value })}
                        className="text-sm bg-white"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-slate-500 block mb-1">
                        Destination URL (https)
                      </label>
                      <Input
                        type="url"
                        placeholder="https://..."
                        value={link.url}
                        onChange={(e) => handleUpdate(idx, { url: e.target.value })}
                        className="text-sm bg-white font-mono"
                      />
                    </div>

                    {defaultHelper && (
                      <p className="text-[11px] text-slate-500 flex items-start space-x-1 pt-1">
                        <HelpCircle className="h-3 w-3 shrink-0 mt-0.5 text-slate-400" />
                        <span>{defaultHelper}</span>
                      </p>
                    )}
                  </div>
                </div>
              );
            })}

            <div className="flex items-center justify-between pt-2">
              <Button
                variant="default"
                size="lg"
                onClick={handlePublish}
                disabled={saving}
                className="w-full font-bold shadow-md"
              >
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Saving..." : "Publish Link Settings"}
              </Button>
            </div>

            {saveSuccess && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center space-x-2 animate-in fade-in">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>Link settings published successfully!</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Live Preview Panel (Right 6 Cols) */}
      <div className="lg:col-span-6 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-zinc-800">
            Live Customer Preview
          </span>
          <div className="flex p-1 bg-zinc-200 rounded-xl space-x-1">
            <button
              onClick={() => setPreviewMode("mobile")}
              className={`p-2 rounded-lg text-xs font-semibold flex items-center space-x-1 ${
                previewMode === "mobile"
                  ? "bg-white text-zinc-900 shadow-sm"
                  : "text-zinc-500"
              }`}
            >
              <Smartphone className="h-4 w-4" />
              <span>Mobile</span>
            </button>
            <button
              onClick={() => setPreviewMode("desktop")}
              className={`p-2 rounded-lg text-xs font-semibold flex items-center space-x-1 ${
                previewMode === "desktop"
                  ? "bg-white text-zinc-900 shadow-sm"
                  : "text-zinc-500"
              }`}
            >
              <Monitor className="h-4 w-4" />
              <span>Desktop</span>
            </button>
          </div>
        </div>

        {/* Frame Device */}
        <div className="flex justify-center">
          <div
            className={`border-4 border-zinc-900 rounded-[2.5rem] p-2 bg-zinc-900 shadow-2xl transition-all ${
              previewMode === "mobile" ? "w-[340px]" : "w-full max-w-lg"
            }`}
          >
            {/* Screen View */}
            <div className="bg-zinc-50 rounded-[2rem] overflow-hidden text-zinc-900 min-h-[500px]">
              {/* Header */}
              <div
                className="p-4 text-white text-center"
                style={{ backgroundColor: brandPrimaryHex || "#0f172a" }}
              >
                <div className="text-base font-extrabold">{businessName}</div>
                <div className="text-[11px] text-white/80">Loyalty Hub (Preview)</div>
              </div>

              {/* Sample Member Card */}
              <div className="p-4 space-y-4">
                <div className="rounded-2xl bg-white p-4 border border-zinc-200 shadow-sm">
                  <div className="text-xs uppercase text-zinc-400 font-semibold">
                    Sample Member Card
                  </div>
                  <div className="text-2xl font-black mt-1">45 points</div>
                  <Badge variant="success" className="mt-2 text-[10px]">
                    Active Member
                  </Badge>
                </div>

                {/* Preview of Social / Review Buttons */}
                <div className="space-y-2">
                  <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider pl-1">
                    Connect & Review
                  </div>
                  {enabledLinks.length === 0 ? (
                    <p className="text-xs text-zinc-400 italic p-3 text-center border border-dashed rounded-xl">
                      No buttons currently enabled.
                    </p>
                  ) : (
                    enabledLinks.map((link) => {
                      let Icon: React.ComponentType<{ className?: string }> = Globe;
                      if (link.type === "google_review") Icon = Star;
                      if (link.type === "instagram") Icon = InstagramIcon;
                      if (link.type === "facebook") Icon = FacebookIcon;

                      return (
                        <div
                          key={link.type}
                          className="flex items-center justify-between p-3 rounded-xl border border-zinc-200 bg-white text-xs font-semibold shadow-xs"
                        >
                          <span className="flex items-center space-x-2">
                            <Icon
                              className={`h-4 w-4 ${
                                link.type === "google_review"
                                  ? "text-amber-500 fill-amber-500"
                                  : link.type === "instagram"
                                  ? "text-pink-600"
                                  : link.type === "facebook"
                                  ? "text-blue-600"
                                  : "text-slate-600"
                              }`}
                            />
                            <span>{link.label}</span>
                          </span>
                          <ArrowRight className="h-3 w-3 text-slate-400" />
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
