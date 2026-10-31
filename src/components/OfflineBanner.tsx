"use client";

import React from "react";
import { OFFLINE_MESSAGE, useOnline } from "@/lib/use-online";

/** A bar across the top while the device has no connection, so nobody wonders why a button isn't working. */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="alert" className="fixed top-0 inset-x-0 z-[110] bg-marigold text-zinc-900 text-sm font-semibold text-center px-4 py-2 shadow-md">
      {OFFLINE_MESSAGE}
    </div>
  );
}
