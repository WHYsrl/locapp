"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearToken, isAuthenticated, isDemoActive } from "@/lib/auth";

const NAV = [
  { href: "/", label: "Dashboard", icon: "◧" },
  { href: "/locations", label: "Location", icon: "⌂" },
  { href: "/search", label: "Ricerca AI", icon: "✦" },
  { href: "/ingest", label: "Acquisizione AI", icon: "⇪" },
  { href: "/projects", label: "Progetti", icon: "▤" },
  { href: "/contatti", label: "Contatti", icon: "☎" },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [demo, setDemo] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setDemo(isDemoActive());
    const onDemo = () => setDemo(true);
    window.addEventListener("venuescout:demo", onDemo);
    return () => window.removeEventListener("venuescout:demo", onDemo);
  }, []);

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

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col bg-berry text-white">
        <Link href="/" className="flex items-center gap-2 px-6 py-6">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold text-lg font-black text-berry">V</span>
          <span className="text-lg font-bold tracking-tight">
            Venue<span className="text-gold">Scout</span>
          </span>
        </Link>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  active ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span className="w-5 text-center text-base leading-none">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-3 pb-6">
          {demo && (
            <div className="mb-3 rounded-lg bg-gold/20 px-3 py-2 text-xs font-medium text-gold">
              Modalità demo attiva
              <span className="mt-0.5 block font-normal text-white/60">Dati di esempio, nessun backend</span>
            </div>
          )}
          <button
            onClick={() => {
              clearToken();
              router.replace("/login");
            }}
            className="w-full rounded-lg px-3 py-2 text-left text-sm text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            Esci
          </button>
        </div>
      </aside>
      <main className="ml-60 min-h-screen flex-1 px-8 py-8">
        <div className="mx-auto max-w-6xl">{ready ? children : null}</div>
      </main>
    </div>
  );
}
