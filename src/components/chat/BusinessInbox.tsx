"use client";

import React, { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Lock, MessageSquare, Send } from "lucide-react";
import { ChatMessages, type ChatMessageView } from "./ChatMessages";

interface ListItem {
  id: string;
  status: "open" | "closed";
  customerName: string;
  memberNumber: string;
  lastMessageAt: string;
  lastMessagePreview: string;
  lastMessageFromCustomer: boolean;
  unread: boolean;
  closedAt: string | null;
}

interface Thread {
  id: string;
  status: "open" | "closed";
  customerName: string;
  memberNumber: string;
  closedAt: string | null;
  messages: ChatMessageView[];
}

function when(iso: string) {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/**
 * Customer messages for the owner, managers and staff. Everyone at the shop sees the same chats
 * and can reply; only the customer can end a chat, after which it is read-only here.
 */
export function BusinessInbox({ businessName, onUnreadChange }: { businessName: string; onUnreadChange?: () => void }) {
  const [filter, setFilter] = useState<"open" | "closed">("open");
  const [items, setItems] = useState<ListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const loadList = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/business/conversations?status=${filter}`, { cache: "no-store" });
      if (res.ok) {
        setItems((await res.json()).data);
        setLoaded(true);
      }
    } catch {
      // Retried on the next tick.
    }
  }, [filter]);

  const loadThread = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/v1/business/conversations/${id}`, { cache: "no-store" });
        if (res.ok) {
          setThread((await res.json()).data);
          onUnreadChange?.();
        }
      } catch {
        // Retried on the next tick.
      }
    },
    [onUnreadChange]
  );

  useEffect(() => {
    loadList();
    const id = setInterval(() => document.visibilityState === "visible" && loadList(), 8000);
    return () => clearInterval(id);
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) {
      setThread(null);
      return;
    }
    loadThread(selectedId);
    const id = setInterval(() => document.visibilityState === "visible" && loadThread(selectedId), 5000);
    return () => clearInterval(id);
  }, [selectedId, loadThread]);

  const reply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!thread || !draft.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/business/conversations/${thread.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Your reply couldn't be sent.");
      setThread(json.data);
      setDraft("");
      loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your reply couldn't be sent.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-3xl border border-zinc-200 bg-white overflow-hidden grid md:grid-cols-[320px_1fr] min-h-[520px]">
      {/* List */}
      <div className={`border-r border-zinc-200 flex flex-col ${selectedId ? "hidden md:flex" : "flex"}`}>
        <div className="p-3 border-b border-zinc-200">
          <div className="grid grid-cols-2 gap-1 p-1 rounded-full bg-zinc-100">
            {(["open", "closed"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  setFilter(f);
                  setSelectedId(null);
                }}
                className={`py-1.5 rounded-full text-sm font-semibold cursor-pointer ${
                  filter === f ? "bg-evergreen text-white" : "text-zinc-600"
                }`}
              >
                {f === "open" ? "Open" : "Ended"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loaded && items.length === 0 ? (
            <p className="p-6 text-sm text-zinc-500 text-center">
              {filter === "open" ? "No open chats. Customer messages will appear here." : "No ended chats yet."}
            </p>
          ) : (
            items.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                className={`w-full text-left px-4 py-3 border-b border-zinc-100 hover:bg-zinc-50 cursor-pointer ${
                  selectedId === c.id ? "bg-mist" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`truncate ${c.unread ? "font-bold text-zinc-900" : "font-semibold text-zinc-800"}`}>
                    {c.customerName}
                  </span>
                  <span className="text-xs text-zinc-500 shrink-0">{when(c.lastMessageAt)}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className={`text-sm truncate flex-1 ${c.unread ? "text-zinc-900" : "text-zinc-500"}`}>
                    {c.lastMessageFromCustomer ? "" : "You: "}
                    {c.lastMessagePreview}
                  </p>
                  {c.unread && <span className="w-2.5 h-2.5 rounded-full bg-marigold shrink-0" aria-label="Unread" />}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Thread */}
      <div className={`flex flex-col ${selectedId ? "flex" : "hidden md:flex"}`}>
        {!thread ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-zinc-500">
            <MessageSquare className="w-10 h-10 text-zinc-300" />
            <p className="mt-3">Pick a chat to read and reply.</p>
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b border-zinc-200 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="md:hidden p-1.5 rounded-full hover:bg-zinc-100 cursor-pointer"
                aria-label="Back to chats"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                <p className="font-semibold text-zinc-900 truncate">{thread.customerName}</p>
                <p className="text-xs text-zinc-500">Customer ID {thread.memberNumber}</p>
              </div>
            </div>

            <ChatMessages
              messages={thread.messages}
              viewer="business"
              businessName={businessName}
              className="flex-1 p-4 max-h-[420px]"
            />

            {thread.status === "closed" ? (
              <div className="m-3 rounded-2xl bg-zinc-50 border border-zinc-200 p-3 text-sm text-zinc-600 flex gap-2">
                <Lock className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  The customer ended this chat
                  {thread.closedAt ? ` on ${new Date(thread.closedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}.
                  It&rsquo;s kept here for your records. If they write again, a new chat opens.
                </span>
              </div>
            ) : (
              <form onSubmit={reply} className="p-3 border-t border-zinc-200 space-y-2">
                <label htmlFor="inbox-reply" className="sr-only">
                  Reply
                </label>
                <textarea
                  id="inbox-reply"
                  rows={2}
                  maxLength={2000}
                  placeholder={`Reply to ${thread.customerName}...`}
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) reply(e);
                  }}
                  className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-evergreen focus:bg-white"
                />
                {error && <p className="text-sm text-rose-700">{error}</p>}
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-zinc-500">Only the customer can end this chat.</p>
                  <button
                    type="submit"
                    disabled={sending || !draft.trim()}
                    className="inline-flex items-center gap-2 min-h-[40px] px-5 rounded-full bg-evergreen text-white text-sm font-semibold hover:bg-evergreen-deep cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                    {sending ? "Sending..." : "Send reply"}
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
