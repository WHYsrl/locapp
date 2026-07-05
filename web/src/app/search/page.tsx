"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as api from "@/lib/api";
import AddToEventDialog from "@/components/AddToEventDialog";
import { Card, PageHeader, ScoreBadge, Spinner, Tag, btnPrimary, inputCls, labelCls } from "@/components/ui";
import { tagLabel } from "@/lib/labels";
import type { SearchResult } from "@/lib/types";

export default function SearchPage() {
  const [brief, setBrief] = useState("");
  const [poiId, setPoiId] = useState("");
  const [maxMinutes, setMaxMinutes] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [addTarget, setAddTarget] = useState<{ id: string; name: string } | null>(null);

  const { data: pois } = useQuery({ queryKey: ["pois"], queryFn: () => api.listPois() });

  const search = useMutation({
    mutationFn: () =>
      api.searchBrief({
        brief,
        near_poi_id: poiId || undefined,
        max_minutes: maxMinutes ? Number(maxMinutes) : undefined,
        limit: 10,
      }),
    onSuccess: setResults,
  });

  return (
    <div>
      <PageHeader
        title="Ricerca AI da brief"
        subtitle="Descrivi l'evento in linguaggio naturale: l'AI incrocia capienze, tag, vincoli e distanze."
      />

      <Card className="mb-6">
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Brief dell&apos;evento</label>
            <textarea
              className={inputCls}
              rows={4}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="es. Cena di gala per 320 persone a ottobre vicino a Milano, ambiente elegante, musica live fino a mezzanotte, budget location 20k…"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className={labelCls}>Vicino a (POI, opzionale)</label>
              <select className={inputCls} value={poiId} onChange={(e) => setPoiId(e.target.value)}>
                <option value="">— Nessun vincolo di distanza —</option>
                {(pois ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Max minuti in auto</label>
              <input
                className={inputCls}
                type="number"
                min={5}
                value={maxMinutes}
                onChange={(e) => setMaxMinutes(e.target.value)}
                disabled={!poiId}
                placeholder="es. 30"
              />
            </div>
            <div className="flex items-end">
              <button
                className={`${btnPrimary} w-full justify-center`}
                disabled={brief.trim().length < 10 || search.isPending}
                onClick={() => search.mutate()}
              >
                {search.isPending ? "Ricerca in corso…" : "Cerca location"}
              </button>
            </div>
          </div>
        </div>
      </Card>

      {search.isPending && <Spinner label="L'AI sta analizzando il brief…" />}
      {search.isError && <p className="text-sm text-red-600">Errore durante la ricerca. Riprova.</p>}

      {results && !search.isPending && (
        <div className="space-y-4">
          {results.length === 0 && <p className="text-sm text-ink/50">Nessun risultato per questo brief.</p>}
          {results.map((r) => (
            <Card key={r.location.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <ScoreBadge score={r.score} />
                    <Link href={`/locations/${r.location.id}`} className="text-lg font-bold text-berry hover:underline">
                      {r.location.name}
                    </Link>
                    <span className="text-sm text-ink/50">
                      {r.location.city ?? ""} · max {r.location.max_capacity ?? "—"} pax
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(r.location.smart_tags ?? []).map((t) => (
                      <Tag key={t}>{tagLabel(t)}</Tag>
                    ))}
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
                    <ReasonList title="Punti a favore" items={r.reasons.matched} icon="✓" cls="text-emerald-700" />
                    <ReasonList title="Criticità" items={r.reasons.unmatched} icon="✕" cls="text-red-600" />
                    <ReasonList title="Da verificare" items={r.reasons.to_verify} icon="?" cls="text-yellow-700" />
                  </div>
                  {r.distances.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {r.distances.map((d, i) => (
                        <span key={i} className="rounded-full bg-tint px-3 py-1 text-xs font-medium text-ink/60">
                          {d.poi}: {d.km} km · ~{d.minutes_car} min auto
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  className="rounded-lg border border-berry/25 bg-white px-4 py-2 text-sm font-semibold text-berry hover:bg-berry/5"
                  onClick={() => setAddTarget({ id: r.location.id, name: r.location.name })}
                >
                  + Aggiungi a evento
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <AddToEventDialog
        open={!!addTarget}
        onClose={() => setAddTarget(null)}
        locationId={addTarget?.id ?? ""}
        locationName={addTarget?.name ?? ""}
      />
    </div>
  );
}

function ReasonList({ title, items, icon, cls }: { title: string; items: string[]; icon: string; cls: string }) {
  if (!items.length) return <div className="hidden md:block" />;
  return (
    <div>
      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink/40">{title}</p>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-1.5 text-ink/75">
            <span className={`mt-0.5 text-xs font-bold ${cls}`}>{icon}</span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
