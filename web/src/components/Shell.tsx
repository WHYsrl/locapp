"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { NetworkError } from "@/lib/api";
import { clearToken, isAuthenticated } from "@/lib/auth";

const NAV = [
  { href: "/", label: "Dashboard", icon: "◧" },
  { href: "/locations", label: "Location", icon: "⌂" },
  { href: "/search", label: "Ricerca AI", icon: "✦" },
  { href: "/ingest", label: "Acquisizione AI", icon: "⇪" },
  { href: "/projects", label: "Progetti", icon: "▤" },
  { href: "/poi", label: "Punti di interesse", icon: "◎" },
  { href: "/contatti", label: "Contatti", icon: "☎" },
  { href: "/tag", label: "Tag", icon: "#" },
];

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

  const current = NAV.find((item) =>
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
  );

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
        <nav className="flex-1 space-y-0.5 px-3">
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition duration-150 ${
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
          })}
        </nav>
        <div className="border-t border-hairline px-6 py-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink/35">VenueScout</p>
        </div>
      </aside>

      <div className="ml-60 flex min-h-screen flex-1 flex-col">
        {/* sticky translucent top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-hairline bg-white/70 px-8 backdrop-blur-xl">
          <p className="text-sm font-semibold tracking-tight text-ink/70">{current?.label ?? "VenueScout"}</p>
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
    </div>
  );
}
