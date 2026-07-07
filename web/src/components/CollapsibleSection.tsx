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
    <section className={`rounded-2xl border border-hairline bg-white shadow-soft ${className}`}>
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="group flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <span
            className={`inline-block text-[10px] text-ink/35 transition-transform duration-200 group-hover:text-berry ${open ? "rotate-90" : ""}`}
            aria-hidden
          >
            ▶
          </span>
          <h2 className="min-w-0 text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
        </button>
        {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      </div>
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="border-t border-hairline px-5 pb-5 pt-4">{children}</div>
        </div>
      </div>
    </section>
  );
}
