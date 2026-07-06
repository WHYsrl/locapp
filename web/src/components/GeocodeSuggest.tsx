"use client";

// Geocoding with user confirmation: a button triggers GET /geocode with the
// structured params (name, address, city, postal_code, province), candidates
// are listed and nothing is applied until the user clicks "Usa questa"
// (onPick). On empty results the user can retry with address+city only.

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import * as api from "@/lib/api";
import type { GeocodeCandidate, GeocodeParams } from "@/lib/types";
import { btnSecondary } from "./ui";

export interface GeocodeFields {
  name?: string;
  address?: string;
  city?: string;
  postal_code?: string;
  province?: string;
}

const clean = (s?: string) => {
  const t = s?.trim();
  return t ? t : undefined;
};

export default function GeocodeSuggest({
  fields,
  disabled = false,
  buttonLabel = "Proponi coordinate e link Maps",
  buttonClassName = btnSecondary,
  onPick,
}: {
  /** Form fields sent as structured geocode params. */
  fields: GeocodeFields;
  disabled?: boolean;
  buttonLabel?: string;
  buttonClassName?: string;
  onPick: (candidate: GeocodeCandidate) => void;
}) {
  const [open, setOpen] = useState(false);
  const [lastMode, setLastMode] = useState<"full" | "address_only">("full");
  const geo = useMutation({ mutationFn: (p: GeocodeParams) => api.geocode(p) });

  const address = clean(fields.address);
  const city = clean(fields.city);

  const run = (mode: "full" | "address_only") => {
    setLastMode(mode);
    setOpen(true);
    geo.mutate(
      mode === "full"
        ? {
            name: clean(fields.name),
            address,
            city,
            postal_code: clean(fields.postal_code),
            province: clean(fields.province),
          }
        : { address, city }
    );
  };

  return (
    <div>
      <button
        type="button"
        className={buttonClassName}
        disabled={disabled || geo.isPending}
        title={disabled ? "Compila almeno nome e indirizzo o città" : undefined}
        onClick={() => run("full")}
      >
        {geo.isPending ? "Ricerca in corso…" : buttonLabel}
      </button>

      {open && !geo.isPending && (
        <div className="mt-3 rounded-lg border border-berry/15 bg-tint/40 p-3">
          {geo.isError ? (
            geo.error instanceof api.NetworkError ? (
              <p className="text-sm text-red-600">Impossibile raggiungere il server — riprova.</p>
            ) : geo.error instanceof api.ApiError ? (
              <p className="text-sm text-red-600">
                Errore dal servizio di geocoding ({geo.error.status}): {geo.error.message}
              </p>
            ) : (
              <p className="text-sm text-red-600">Errore durante la ricerca delle coordinate. Riprova.</p>
            )
          ) : (geo.data ?? []).length === 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-ink/60">
                Nessun risultato — prova a semplificare l&apos;indirizzo (senza nome location) o verifica la città.
              </p>
              {lastMode === "full" && (address || city) && (
                <button
                  type="button"
                  className="rounded-lg border border-berry/25 bg-white px-3 py-1.5 text-xs font-semibold text-berry transition hover:bg-berry/5"
                  onClick={() => run("address_only")}
                >
                  Riprova solo con l&apos;indirizzo
                </button>
              )}
            </div>
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
