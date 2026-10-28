"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Smartphone, Monitor, Star, Globe, ArrowRight, HelpCircle, Save, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import { InstagramIcon, FacebookIcon } from "@/components/ui/icons";
import { BusinessLogo } from "@/components/brand/BusinessLogo";

export interface LinkConfig {
  type: "google_review" | "instagram" | "facebook" | "website" | "other";
  label: string;
  url: string;
  enabled: boolean;
  sortOrder: number;
  locationId?: string | null;
}

interface LinksAndPageEditorProps {
  businessName: string;
  brandPrimaryHex: string;
  logoUrl?: string | null;
  initialLinks: LinkConfig[];
  /** Should throw with a readable message when saving fails. */
  onSave: (links: LinkConfig[]) => Promise<void>;
}

// Example URLs some businesses were created with; shown as empty so owners add their own.
const PLACEHOLDER_URLS = new Set([
  "https://g.page/review/example",
  "https://instagram.com/example",
  "https://facebook.com/example",
]);

const DEFAULT_LINKS: LinkConfig[] = [
  { type: "google_review", label: "Leave a Google review", url: "", enabled: false, sortOrder: 1 },
  { type: "instagram", label: "Follow on Instagram", url: "", enabled: false, sortOrder: 2 },
  { type: "facebook", label: "Like us on Facebook", url: "", enabled: false, sortOrder: 3 },
];

const META: Record<string, { title: string; icon: React.ComponentType<{ className?: string }>; color: string; placeholder: string }> = {
  google_review: {
    title: "Google review",
    icon: Star,
    color: "text-amber-500 fill-amber-500",
    placeholder: "https://g.page/r/your-code/review",
  },
  instagram: { title: "Instagram", icon: InstagramIcon, color: "text-pink-600", placeholder: "https://instagram.com/yourbusiness" },
  facebook: { title: "Facebook", icon: FacebookIcon, color: "text-blue-600", placeholder: "https://facebook.com/yourbusiness" },
  website: { title: "Website", icon: Globe, color: "text-slate-600", placeholder: "https://yourbusiness.co.uk" },
  other: { title: "Other link", icon: Globe, color: "text-slate-600", placeholder: "https://..." },
};

function normalise(links: LinkConfig[]): LinkConfig[] {
  const source = links.length > 0 ? links : DEFAULT_LINKS;
  return source.map((l) => ({
    type: l.type,
    label: l.label,
    url: PLACEHOLDER_URLS.has((l.url || "").trim()) ? "" : l.url || "",
    // An unfinished example link is never live
    enabled: PLACEHOLDER_URLS.has((l.url || "").trim()) ? false : l.enabled,
    sortOrder: l.sortOrder,
    locationId: l.locationId ?? null,
  }));
}

function problemFor(link: LinkConfig): string | null {
  if (!link.enabled) return null;
  const url = link.url.trim();
  if (!url) return "Add your link, or switch this button off.";
  if (!/^https:\/\//i.test(url)) return "The link must start with https://";
  return null;
}

export function LinksAndPageEditor({ businessName, brandPrimaryHex, logoUrl, initialLinks, onSave }: LinksAndPageEditorProps) {
  const initialKey = useMemo(() => JSON.stringify(initialLinks), [initialLinks]);
  const [links, setLinks] = useState<LinkConfig[]>(() => normalise(initialLinks));
  const [dirty, setDirty] = useState(false);
  const [previewMode, setPreviewMode] = useState<"mobile" | "desktop">("mobile");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showProblems, setShowProblems] = useState(false);

  // Links load after the editor mounts; take them in unless the owner is mid-edit.
  useEffect(() => {
    if (!dirty) setLinks(normalise(initialLinks));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey]);

  const handleUpdate = (index: number, updates: Partial<LinkConfig>) => {
    setLinks((prev) =>
      prev.map((l, i) => {
        if (i !== index) return l;
        const next = { ...l, ...updates };
        if (updates.url !== undefined && !l.url.trim() && updates.url.trim() && updates.enabled === undefined) {
          next.enabled = true;
        }
        return next;
      })
    );
    setDirty(true);
    setSaveSuccess(null);
    setSaveError(null);
  };

  const handlePublish = async () => {
    setShowProblems(true);
    if (links.some((l) => problemFor(l))) {
      setSaveError("Fix the highlighted links first.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(links.map((l) => ({ ...l, label: l.label.trim(), url: l.url.trim() })));
      setDirty(false);
      setShowProblems(false);
      const live = links.filter((l) => l.enabled && l.url.trim());
      const hidden = links.filter((l) => !l.enabled && l.url.trim());
      setSaveSuccess(
        live.length === 0
          ? "Saved, but no buttons are showing to customers. Switch on “Show to customers” for each link you want them to see."
          : hidden.length > 0
          ? `Saved. Customers now see ${live.map((l) => (META[l.type] || META.other).title).join(", ")}. Still hidden: ${hidden
              .map((l) => (META[l.type] || META.other).title)
              .join(", ")}.`
          : "Saved. Customers now see these buttons and go straight to your links."
      );
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Your links couldn't be saved. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const enabledLinks = links.filter((l) => l.enabled && l.url.trim());

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      <div className="lg:col-span-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Review &amp; social links</CardTitle>
            <p className="text-sm text-slate-500">
              These buttons show on every customer&rsquo;s card. Customers who tap one go straight to the link you add here.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            {links.map((link, idx) => {
              const meta = META[link.type] || META.other;
              const Icon = meta.icon;
              const problem = showProblems ? problemFor(link) : null;
              const canTest = /^https:\/\/\S+$/i.test(link.url.trim());

              return (
                <div key={link.type} className="p-4 rounded-2xl border border-zinc-200 bg-zinc-50/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-5 w-5 ${meta.color}`} />
                      <span className="font-bold text-sm">{meta.title}</span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={link.enabled}
                      onClick={() => handleUpdate(idx, { enabled: !link.enabled })}
                      className="flex items-center gap-2.5 text-sm font-medium text-zinc-700 cursor-pointer rounded-full"
                    >
                      Show to customers
                      <span
                        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
                          link.enabled ? "bg-evergreen" : "bg-zinc-300"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                            link.enabled ? "translate-x-[22px]" : "translate-x-0.5"
                          }`}
                        />
                      </span>
                    </button>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-500 block mb-1">Button text</label>
                    <Input value={link.label} onChange={(e) => handleUpdate(idx, { label: e.target.value })} className="text-sm bg-white" />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-500 block mb-1">Link</label>
                    <div className="flex gap-2">
                      <Input
                        type="url"
                        inputMode="url"
                        placeholder={meta.placeholder}
                        value={link.url}
                        onChange={(e) => handleUpdate(idx, { url: e.target.value })}
                        aria-invalid={Boolean(problem)}
                        className={`text-sm bg-white ${problem ? "border-rose-400 focus-visible:ring-rose-400" : ""}`}
                      />
                      {canTest && (
                        <a
                          href={link.url.trim()}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 inline-flex items-center gap-1 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 hover:border-evergreen"
                          title="Open this link in a new tab to check it"
                        >
                          <ExternalLink className="h-4 w-4" />
                          Test
                        </a>
                      )}
                    </div>
                    {problem && <p className="mt-1 text-sm text-rose-700">{problem}</p>}
                    {!problem && !link.enabled && link.url.trim() && (
                      <p className="mt-1 text-sm text-amber-800">
                        Customers can&rsquo;t see this button. Switch on &ldquo;Show to customers&rdquo; to show it.
                      </p>
                    )}
                  </div>

                  {link.type === "google_review" && (
                    <div className="text-xs text-slate-600 flex gap-1.5 pt-1 leading-relaxed">
                      <HelpCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-slate-400" />
                      <span>
                        Signed in to your Google Business Profile, search your business on Google and tap{" "}
                        <strong>Ask for reviews</strong>, then copy the link (it looks like{" "}
                        <code>https://g.page/r/…/review</code>). Or use your Place ID:{" "}
                        <code>https://search.google.com/local/writereview?placeid=YOUR_ID</code>
                      </span>
                    </div>
                  )}
                </div>
              );
            })}

            <Button variant="default" size="lg" onClick={handlePublish} disabled={saving} className="w-full font-bold cursor-pointer">
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Saving..." : "Save and publish links"}
            </Button>

            {saveError && (
              <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{saveError}</span>
              </div>
            )}
            {saveSuccess && (
              <div role="status" className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{saveSuccess}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Live preview */}
      <div className="lg:col-span-6 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-zinc-800">What customers see</span>
          <div className="flex p-1 bg-zinc-200 rounded-xl gap-1">
            {(["mobile", "desktop"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setPreviewMode(mode)}
                className={`p-2 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer ${
                  previewMode === mode ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500"
                }`}
              >
                {mode === "mobile" ? <Smartphone className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
                <span className="capitalize">{mode}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-center">
          <div
            className={`border-4 border-zinc-900 rounded-[2.5rem] p-2 bg-zinc-900 shadow-2xl transition-all ${
              previewMode === "mobile" ? "w-[340px] max-w-full" : "w-full max-w-lg"
            }`}
          >
            <div className="bg-zinc-50 rounded-[2rem] overflow-hidden text-zinc-900 min-h-[460px]">
              <div className="p-4 flex items-center gap-3 bg-white border-b border-zinc-200">
                <BusinessLogo name={businessName} logoUrl={logoUrl} brandColor={brandPrimaryHex} size="sm" />
                <div className="min-w-0">
                  <div className="font-display font-bold truncate">{businessName}</div>
                  <div className="text-[11px] text-zinc-500">Customer card preview</div>
                </div>
              </div>

              <div className="p-4 space-y-2">
                {enabledLinks.length === 0 ? (
                  <p className="text-sm text-zinc-500 p-4 text-center border border-dashed border-zinc-300 rounded-xl">
                    No buttons showing yet. Add a link and switch it on.
                  </p>
                ) : (
                  enabledLinks.map((link) => {
                    const meta = META[link.type] || META.other;
                    const Icon = meta.icon;
                    return (
                      <div
                        key={link.type}
                        className="flex items-center justify-between p-3.5 rounded-xl border border-zinc-200 bg-white text-sm font-semibold"
                      >
                        <span className="flex items-center gap-2">
                          <Icon className={`h-4 w-4 ${meta.color}`} />
                          <span>{link.label}</span>
                        </span>
                        <ArrowRight className="h-4 w-4 text-slate-400" />
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
  );
}
