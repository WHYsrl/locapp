"use client";

// Reusable danger confirmation dialog. Supports the "force" flow used by the
// delete endpoints: when the first DELETE returns 409, the caller re-opens
// the dialog passing the server message via `warning` and a stronger
// confirmLabel ("Elimina comunque") — this component stays presentational.

import { useEffect } from "react";
import { btnDanger, btnSecondary } from "./ui";

export default function ConfirmDialog({
  open,
  title,
  message,
  warning,
  confirmLabel = "Elimina",
  cancelLabel = "Annulla",
  pending = false,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message?: React.ReactNode;
  /** Server-side 409 message (shown in an amber box, e.g. before force). */
  warning?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  pending?: boolean;
  error?: React.ReactNode;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => e.key === "Escape" && !pending && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, pending, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="alertdialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => !pending && onClose()} />
      <div className="relative w-full max-w-md rounded-2xl border border-hairline bg-white/95 p-6 shadow-2xl backdrop-blur-xl">
        <div className="flex items-start gap-4">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-lg text-red-600"
            aria-hidden
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold tracking-tight text-ink">{title}</h3>
            {message && <div className="mt-1.5 text-sm leading-relaxed text-ink/65">{message}</div>}
            {warning && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                {warning}
              </div>
            )}
            {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
          </div>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button type="button" className={btnSecondary} onClick={onClose} disabled={pending}>
            {cancelLabel}
          </button>
          <button type="button" className={btnDanger} onClick={onConfirm} disabled={pending}>
            {pending ? "Eliminazione…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
