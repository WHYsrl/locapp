"use client";

// Collapsible card section with chevron header. Remembers the open/closed
// state per section in localStorage (key: venuescout:sec:<storageKey>).

import { useEffect, useState } from "react";

const PREFIX = "venuescout:sec:";

export default function CollapsibleSection({
  storageKey,
  title,
  action,
  defaultOpen = false,
  className = "",
  children,
}: {
  /** Stable identifier used to persist the open/closed state. */
  storageKey: string;
  title: React.ReactNode;
  /** Optional header action (rendered outside the toggle button). */
  action?: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  // Restore persisted state after mount (SSR-safe, no hydration mismatch).
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(PREFIX + storageKey);
      if (saved != null) setOpen(saved === "1");
    } catch {
      // localStorage unavailable: keep default
    }
  }, [storageKey]);

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(PREFIX + storageKey, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  };

  return (
    <section className={`rounded-xl border border-berry/10 bg-white shadow-sm ${className}`}>
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <span
            className={`inline-block text-xs text-berry/60 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
            aria-hidden
          >
            ▶
          </span>
          <h2 className="min-w-0 text-sm font-bold uppercase tracking-wide text-berry">{title}</h2>
        </button>
        {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      </div>
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-5 pb-5">{children}</div>
        </div>
      </div>
    </section>
  );
}
