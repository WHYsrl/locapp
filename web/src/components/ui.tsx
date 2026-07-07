"use client";

import { useEffect } from "react";

// Shared component classes for the Apple-contemporary restyle: pill buttons,
// 12px-radius inputs with berry/30 focus ring, white cards with hairline
// borders and soft shadows. Change here, applies everywhere.

export const inputCls =
  "w-full rounded-xl border border-hairline bg-white px-3.5 py-2 text-sm text-ink outline-none transition duration-150 focus:border-berry/40 focus:ring-2 focus:ring-berry/30 placeholder:text-ink/35";

export const labelCls = "mb-1 block text-xs font-semibold uppercase tracking-wide text-ink/50";

export const btnPrimary =
  "inline-flex items-center gap-2 rounded-full bg-berry px-5 py-2 text-sm font-semibold text-white shadow-sm transition duration-150 hover:bg-berry-dark active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";

export const btnSecondary =
  "inline-flex items-center gap-2 rounded-full border border-hairline bg-white px-5 py-2 text-sm font-semibold text-berry shadow-sm transition duration-150 hover:bg-berry/5 active:scale-[0.98] disabled:opacity-50";

export const btnDanger =
  "inline-flex items-center gap-2 rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition duration-150 hover:bg-red-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";

export const btnDangerGhost =
  "inline-flex items-center gap-2 rounded-full border border-red-200 bg-white px-5 py-2 text-sm font-semibold text-red-600 transition duration-150 hover:bg-red-50 disabled:opacity-50";

export const btnGhost =
  "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-ink/60 transition duration-150 hover:bg-berry/5 hover:text-berry";

/** Small header action ("+ Aggiungi …") used inside cards/sections. */
export const btnChip =
  "rounded-full border border-hairline bg-white px-3 py-1 text-xs font-semibold text-berry shadow-sm transition duration-150 hover:bg-berry/5";

export function Badge({
  children,
  className = "bg-gray-100 text-gray-700 border-gray-200",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {children}
    </span>
  );
}

export function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-rose/10 px-2 py-0.5 text-xs font-medium text-rose">
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
    <section className={`rounded-2xl border border-hairline bg-white p-5 shadow-soft ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>}
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
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-ink md:text-[32px]">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-ink/55">{subtitle}</div>}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}

/** iOS-like segmented control: inset gray track, white active thumb. */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className = "",
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly (readonly [T, string])[];
  className?: string;
}) {
  return (
    <div className={`inline-flex items-center gap-0.5 rounded-full bg-black/[0.05] p-1 ${className}`} role="tablist">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={value === v}
          onClick={() => onChange(v)}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition duration-150 ${
            value === v ? "bg-white text-ink shadow-sm" : "text-ink/55 hover:text-ink"
          }`}
        >
          {label}
        </button>
      ))}
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
    <div className="rounded-2xl border border-dashed border-hairline bg-white/60 px-6 py-10 text-center">
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
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div
        className={`relative max-h-[85vh] w-full ${wide ? "max-w-3xl" : "max-w-lg"} overflow-y-auto rounded-2xl border border-hairline bg-white/95 p-6 shadow-2xl backdrop-blur-xl`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold tracking-tight text-ink">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-ink/40 transition duration-150 hover:bg-black/5 hover:text-ink"
            aria-label="Chiudi"
          >
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
