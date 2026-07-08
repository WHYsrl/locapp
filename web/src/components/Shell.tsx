"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { NetworkError } from "@/lib/api";
import { clearToken, isAuthenticated } from "@/lib/auth";
import { useWorkContext } from "@/lib/workContext";
import ExportJobsPanel from "@/components/ExportJobsPanel";

type NavItem = { href: string; label: string; icon: string };

/** Primary "insert" action, highlighted at the top of the sidebar. */
const INSERT_ITEM: NavItem = { href: "/ingest", label: "Inserisci", icon: "⇪" };

const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "Lavoro",
    items: [
      { href: "/", label: "Dashboard", icon: "◧" },
      { href: "/search", label: "Ricerca", icon: "✦" },
      { href: "/projects", label: "Progetti", icon: "▤" },
    ],
  },
  {
    label: "Archivio",
    items: [
      { href: "/locations", label: "Location", icon: "⌂" },
      { href: "/presentazioni", label: "Presentazioni", icon: "▦" },
      { href: "/contatti", label: "Contatti", icon: "☎" },
      { href: "/poi", label: "Punti di interesse", icon: "◎" },
      { href: "/tag", label: "Tag", icon: "#" },
    ],
  },
];

const ALL_NAV: NavItem[] = [INSERT_ITEM, ...NAV_SECTIONS.flatMap((s) => s.items)];

function isActive(item: NavItem, pathname: string): boolean {
  return item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
}

/** Global banner shown when any query failed with a network-level error. */
function NetworkErrorBanner() {
  const qc = useQueryClient();
  const [visible, setVisible] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const cache = qc.getQueryCache();
    const check = () =>
      setVisible(cache.getAll().some((q) => q.state.error instanceof NetworkError));
    check();
    return cache.subscribe(check);
  }, [qc]);

  if (!visible) return null;

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
      <p className="text-sm font-medium text-red-700">Impossibile raggiungere il server — riprova</p>
      <button
        className="rounded-full border border-red-300 bg-white px-4 py-1.5 text-sm font-semibold text-red-700 transition duration-150 hover:bg-red-100 disabled:opacity-50"
        disabled={retrying}
        onClick={async () => {
          setRetrying(true);
          try {
            await qc.invalidateQueries();
          } finally {
            setRetrying(false);
          }
        }}
      >
        {retrying ? "Nuovo tentativo…" : "Riprova"}
      </button>
    </div>
  );
}

/** Topbar chip: progetto/evento su cui si sta lavorando (workContext). */
function WorkContextChip() {
  const { ctx, clearCtx } = useWorkContext();
  if (!ctx) return null;

  const href = ctx.eventId
    ? `/projects/${ctx.projectId}/events/${ctx.eventId}`
    : `/projects/${ctx.projectId}`;

  return (
    <span className="inline-flex max-w-[26rem] items-center gap-1 rounded-full border border-berry/25 bg-berry/10 py-1 pl-3 pr-1">
      <Link
        href={href}
        className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-berry hover:underline"
        title={`Stai lavorando su: ${ctx.projectName}${ctx.eventName ? ` · ${ctx.eventName}` : ""}`}
      >
        <span aria-hidden>📁</span>
        <span className="truncate">
          {ctx.projectName}
          {ctx.eventName && <span className="text-berry/70"> · {ctx.eventName}</span>}
        </span>
      </Link>
      <button
        type="button"
        onClick={clearCtx}
        className="rounded-full p-0.5 text-berry/50 transition duration-150 hover:bg-berry/10 hover:text-berry"
        aria-label="Esci dal contesto di lavoro"
        title="Esci dal contesto di lavoro"
      >
        ✕
      </button>
    </span>
  );
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(item, pathname);
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition duration-150 ${
        active
          ? "bg-berry/10 font-semibold text-berry"
          : "font-medium text-ink/60 hover:bg-black/[0.04] hover:text-ink"
      }`}
    >
      <span className="w-5 text-center text-base leading-none" aria-hidden>
        {item.icon}
      </span>
      {item.label}
    </Link>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (pathname === "/login") {
      setReady(true);
      return;
    }
    if (!isAuthenticated()) {
      router.replace("/login");
    } else {
      setReady(true);
    }
  }, [pathname, router]);

  if (pathname === "/login") return <>{children}</>;

  const current = ALL_NAV.find((item) => isActive(item, pathname));
  const insertActive = isActive(INSERT_ITEM, pathname);

  return (
    <div className="flex min-h-screen">
      {/* glass sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-hairline bg-white/70 backdrop-blur-xl">
        <Link href="/" className="flex items-center gap-2.5 px-6 py-6">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-berry text-lg font-black text-gold shadow-sm">
            V
          </span>
          <span className="text-lg font-bold tracking-tight text-ink">
            Venue<span className="text-berry">Scout</span>
          </span>
        </Link>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {/* primary action: acquisizione/inserimento */}
          <Link
            href={INSERT_ITEM.href}
            className={`mb-4 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold shadow-sm transition duration-150 ${
              insertActive
                ? "bg-berry text-white ring-2 ring-berry/30"
                : "bg-berry text-white hover:bg-berry-dark"
            }`}
          >
            <span className="w-5 text-center text-base leading-none" aria-hidden>
              {INSERT_ITEM.icon}
            </span>
            {INSERT_ITEM.label}
          </Link>

          {NAV_SECTIONS.map((section) => (
            <div key={section.label} className="mb-4">
              <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/35">
                {section.label}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavLink key={item.href} item={item} pathname={pathname} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-hairline px-6 py-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink/35">VenueScout</p>
        </div>
      </aside>

      <div className="ml-60 flex min-h-screen flex-1 flex-col">
        {/* sticky translucent top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-hairline bg-white/70 px-8 backdrop-blur-xl">
          <div className="flex min-w-0 items-center gap-3">
            <p className="shrink-0 text-sm font-semibold tracking-tight text-ink/70">
              {current?.label ?? "VenueScout"}
            </p>
            <WorkContextChip />
          </div>
          <button
            onClick={() => {
              clearToken();
              router.replace("/login");
            }}
            className="rounded-full px-3.5 py-1.5 text-sm font-medium text-ink/55 transition duration-150 hover:bg-black/[0.04] hover:text-ink"
          >
            Esci
          </button>
        </header>

        <main className="flex-1 px-8 py-8">
          <div className="mx-auto max-w-6xl">
            <NetworkErrorBanner />
            {ready ? children : null}
          </div>
        </main>
      </div>

      {/* export Slides in corso: pannello globale, persiste tra le pagine */}
      <ExportJobsPanel />
    </div>
  );
}
