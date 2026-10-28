"use client";

import React, { useEffect, useRef } from "react";

export interface ChatMessageView {
  id: string;
  from: "customer" | "business";
  senderType: string;
  senderName: string | null;
  body: string;
  createdAt: string;
}

const ROLE_LABEL: Record<string, string> = { owner: "Owner", manager: "Manager", staff: "Staff" };

function timeLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * Message bubbles. `viewer` decides which side is "mine": customers see their own messages
 * on the right, the shop sees its replies on the right.
 */
export function ChatMessages({
  messages,
  viewer,
  businessName,
  className = "",
}: {
  messages: ChatMessageView[];
  viewer: "customer" | "business";
  businessName: string;
  className?: string;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const lastId = messages[messages.length - 1]?.id;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [lastId]);

  return (
    <div className={`space-y-3 overflow-y-auto ${className}`} aria-live="polite">
      {messages.map((m) => {
        const mine = m.from === viewer;
        const who =
          m.from === "customer"
            ? viewer === "customer"
              ? "You"
              : m.senderName || "Customer"
            : viewer === "business"
            ? `${m.senderName || "Staff"} · ${ROLE_LABEL[m.senderType] || "Staff"}`
            : businessName;
        return (
          <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] sm:max-w-[75%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
              <span className="text-xs text-zinc-500 mb-1 px-1">
                {who}, {timeLabel(m.createdAt)}
              </span>
              <div
                className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                  mine ? "bg-evergreen text-white rounded-br-md" : "bg-zinc-100 text-zinc-900 rounded-bl-md"
                }`}
              >
                {m.body}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
