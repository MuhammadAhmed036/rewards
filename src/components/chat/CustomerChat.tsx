"use client";

import React, { useCallback, useEffect, useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import { ChatMessages, type ChatMessageView } from "./ChatMessages";

interface Conversation {
  id: string;
  status: "open" | "closed";
  createdAt: string;
  closedAt: string | null;
  messages: ChatMessageView[];
}

/**
 * The customer's chat with a shop. Replies from staff or the owner appear automatically.
 * Only the customer can end the chat; writing again afterwards starts a new one.
 */
export function CustomerChat({ membershipId, businessName }: { membershipId: string; businessName: string }) {
  const [active, setActive] = useState<Conversation | null>(null);
  const [past, setPast] = useState<Conversation[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const apply = (data: { active: Conversation | null; past: Conversation[] }) => {
    setActive(data.active);
    setPast(data.past);
    setLoaded(true);
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/customer/conversations?membershipId=${membershipId}`, { cache: "no-store" });
      if (res.ok) apply((await res.json()).data);
    } catch {
      // Background refresh; try again on the next tick.
    }
  }, [membershipId]);

  useEffect(() => {
    load();
    const tick = () => document.visibilityState === "visible" && load();
    const id = setInterval(tick, 5000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [load]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/customer/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId, body: draft }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Your message couldn't be sent.");
      apply(json.data);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your message couldn't be sent.");
    } finally {
      setSending(false);
    }
  };

  const endChat = async () => {
    if (!active) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/customer/conversations/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId, conversationId: active.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Couldn't end the chat.");
      apply(json.data);
      setConfirmEnd(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't end the chat.");
    } finally {
      setSending(false);
    }
  };

  const waitingForReply = active && active.messages.length > 0 && active.messages[active.messages.length - 1].from === "customer";

  return (
    <div className="bg-white rounded-3xl border border-zinc-200 p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 border-b border-zinc-100 pb-3">
        <div>
          <h3 className="font-display text-lg font-bold text-evergreen-deep flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-evergreen" />
            Message {businessName}
          </h3>
          <p className="text-sm text-zinc-500">Questions or problems? The owner and staff will reply here.</p>
        </div>
        {active && !confirmEnd && (
          <button
            type="button"
            onClick={() => setConfirmEnd(true)}
            className="shrink-0 text-sm font-medium text-zinc-600 hover:text-zinc-900 border border-zinc-200 rounded-full px-3 py-1.5 cursor-pointer"
          >
            End chat
          </button>
        )}
      </div>

      {confirmEnd && active && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
          <p className="font-semibold">End this chat?</p>
          <p className="mt-0.5">Do this once your question is sorted. The shop keeps a copy, and you can always write again.</p>
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={endChat}
              disabled={sending}
              className="rounded-full bg-evergreen text-white px-4 py-1.5 font-semibold cursor-pointer disabled:opacity-60"
            >
              {sending ? "Ending..." : "Yes, end chat"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmEnd(false)}
              className="rounded-full border border-amber-300 px-4 py-1.5 font-medium cursor-pointer"
            >
              Keep chatting
            </button>
          </div>
        </div>
      )}

      {active ? (
        <ChatMessages messages={active.messages} viewer="customer" businessName={businessName} className="max-h-80 pr-1" />
      ) : (
        loaded && (
          <p className="text-sm text-zinc-600 rounded-2xl bg-paper p-4">
            No open chat. Write below and the shop will get your message straight away.
          </p>
        )
      )}

      {waitingForReply && <p className="text-xs text-zinc-500">Sent. You&rsquo;ll see the reply here.</p>}

      <form onSubmit={send} className="space-y-2">
        <label htmlFor="chat-draft" className="sr-only">
          Your message
        </label>
        <textarea
          id="chat-draft"
          rows={3}
          maxLength={2000}
          placeholder={active ? "Write a reply..." : "Write your message..."}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send(e);
          }}
          className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-evergreen focus:bg-white"
        />
        {error && <p className="text-sm text-rose-700">{error}</p>}
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-full bg-evergreen text-white font-semibold hover:bg-evergreen-deep cursor-pointer disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          {sending ? "Sending..." : active ? "Send" : "Send message"}
        </button>
      </form>

      {past.length > 0 && (
        <div className="border-t border-zinc-100 pt-3">
          <button
            type="button"
            onClick={() => setShowPast((v) => !v)}
            className="text-sm font-medium text-evergreen hover:text-evergreen-deep cursor-pointer"
          >
            {showPast ? "Hide" : "Show"} earlier chats ({past.length})
          </button>
          {showPast && (
            <div className="mt-3 space-y-4">
              {past.map((c) => (
                <div key={c.id} className="rounded-2xl border border-zinc-200 p-3">
                  <p className="text-xs text-zinc-500 mb-2">
                    Ended {c.closedAt ? new Date(c.closedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
                  </p>
                  <ChatMessages messages={c.messages} viewer="customer" businessName={businessName} className="max-h-60" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
