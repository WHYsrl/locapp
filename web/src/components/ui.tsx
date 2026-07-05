"use client";

import { useEffect } from "react";

export const inputCls =
  "w-full rounded-lg border border-rose/30 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-berry focus:ring-2 focus:ring-berry/15 placeholder:text-ink/35";

export const labelCls = "mb-1 block text-xs font-semibold uppercase tracking-wide text-ink/50";

export const btnPrimary =
  "inline-flex items-center gap-2 rounded-lg bg-berry px-4 py-2 text-sm font-semibold text-white transition hover:bg-berry-dark disabled:cursor-not-allowed disabled:opacity-50";

export const btnSecondary =
  "inline-flex items-center gap-2 rounded-lg border border-berry/25 bg-white px-4 py-2 text-sm font-semibold text-berry transition hover:bg-berry/5 disabled:opacity-50";

export const btnGhost =
  "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-ink/60 transition hover:bg-berry/5 hover:text-berry";

export function Badge({
  children,
  className = "bg-gray-100 text-gray-700 border-gray-200",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${className}`}
    >
      {children}
    </span>
  );
}

export function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-rose/10 px-2.5 py-0.5 text-xs font-medium text-rose">
      {children}
    </span>
  );
}

export function Card({
  title,
  action,
  children,
  className = "",
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-berry/10 bg-white p-5 shadow-sm ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-sm font-bold uppercase tracking-wide text-berry">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-ink/60">{subtitle}</div>}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}

export function Stars({ value, max = 5 }: { value?: number | null; max?: number }) {
  if (value == null) return <span className="text-sm text-ink/40">—</span>;
  return (
    <span className="inline-flex items-center gap-0.5" title={`${value}/${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < value ? "text-gold" : "text-ink/15"}>
          ★
        </span>
      ))}
    </span>
  );
}

export function Spinner({ label = "Caricamento…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-sm text-ink/50">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-berry/25 border-t-berry" />
      {label}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-rose/30 bg-white/50 px-6 py-10 text-center">
      <p className="text-sm font-medium text-ink/70">{title}</p>
      {hint && <p className="mt-1 text-xs text-ink/45">{hint}</p>}
    </div>
  );
}

export function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className={`relative max-h-[85vh] w-full ${wide ? "max-w-3xl" : "max-w-lg"} overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-ink">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-ink/40 hover:bg-berry/5 hover:text-berry" aria-label="Chiudi">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ScoreBadge({ score }: { score: number }) {
  const cls =
    score >= 80
      ? "bg-emerald-100 text-emerald-800 border-emerald-200"
      : score >= 60
        ? "bg-gold/15 text-yellow-800 border-gold/30"
        : "bg-red-100 text-red-700 border-red-200";
  return <Badge className={cls}>{score}%</Badge>;
}
