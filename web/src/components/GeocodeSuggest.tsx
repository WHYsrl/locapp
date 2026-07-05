"use client";

// Geocoding with user confirmation: a button triggers GET /geocode?q=…,
// candidates are listed and nothing is applied until the user clicks
// "Usa questa" (onPick).

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import * as api from "@/lib/api";
import type { GeocodeCandidate } from "@/lib/types";
import { btnSecondary } from "./ui";

export default function GeocodeSuggest({
  query,
  disabled = false,
  buttonLabel = "Proponi coordinate e link Maps",
  buttonClassName = btnSecondary,
  onPick,
}: {
  /** Query sent to the geocoder, e.g. "<nome>, <indirizzo>, <città>". */
  query: string;
  disabled?: boolean;
  buttonLabel?: string;
  buttonClassName?: string;
  onPick: (candidate: GeocodeCandidate) => void;
}) {
  const [open, setOpen] = useState(false);
  const geo = useMutation({ mutationFn: (q: string) => api.geocode(q) });

  return (
    <div>
      <button
        type="button"
        className={buttonClassName}
        disabled={disabled || geo.isPending}
        title={disabled ? "Compila almeno nome e indirizzo o città" : undefined}
        onClick={() => {
          setOpen(true);
          geo.mutate(query);
        }}
      >
        {geo.isPending ? "Ricerca in corso…" : buttonLabel}
      </button>

      {open && !geo.isPending && (
        <div className="mt-3 rounded-lg border border-berry/15 bg-tint/40 p-3">
          {geo.isError ? (
            <p className="text-sm text-red-600">
              {geo.error instanceof api.NetworkError
                ? "Impossibile raggiungere il server — riprova."
                : "Errore durante la ricerca delle coordinate. Riprova."}
            </p>
          ) : (geo.data ?? []).length === 0 ? (
            <p className="text-sm text-ink/50">Nessun risultato per “{query}”.</p>
          ) : (
            <ul className="space-y-2">
              {(geo.data ?? []).map((c, i) => (
                <li
                  key={i}
                  className="flex items-start justify-between gap-3 rounded-lg border border-berry/10 bg-white px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-ink">{c.display_name}</p>
                    <p className="text-xs text-ink/50">
                      lat {c.lat} · lon {c.lon}
                      {c.type ? ` · ${c.type}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded-lg bg-berry px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-berry-dark"
                    onClick={() => {
                      onPick(c);
                      setOpen(false);
                    }}
                  >
                    Usa questa
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="mt-2 text-xs font-medium text-ink/50 transition hover:text-berry"
            onClick={() => setOpen(false)}
          >
            Chiudi
          </button>
        </div>
      )}
    </div>
  );
}
