"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as api from "@/lib/api";
import MapView, { type MapMarker } from "@/components/MapView";
import { Badge, EmptyState, PageHeader, Spinner, Stars, Tag, inputCls } from "@/components/ui";
import {
  CONFIGURATIONS,
  CONFIG_LABELS,
  EFFECTIVE_STATUS_CLASSES,
  EFFECTIVE_STATUS_LABELS,
  tagLabel,
} from "@/lib/labels";
import { lngLatOf, type Configuration, type EffectiveStatus, type LocationFilters } from "@/lib/types";

export default function LocationsPage() {
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [tag, setTag] = useState("");
  const [status, setStatus] = useState<EffectiveStatus | "">("");
  const [minCapacity, setMinCapacity] = useState("");
  const [configuration, setConfiguration] = useState<Configuration | "">("");
  const [view, setView] = useState<"table" | "map">("table");

  const filters: LocationFilters = useMemo(
    () => ({
      q: q || undefined,
      city: city || undefined,
      tag: tag || undefined,
      status,
      min_capacity: minCapacity ? Number(minCapacity) : undefined,
      configuration,
    }),
    [q, city, tag, status, minCapacity, configuration]
  );

  const { data: all } = useQuery({ queryKey: ["locations", "all"], queryFn: () => api.listLocations() });
  const { data: allTags } = useQuery({ queryKey: ["tags"], queryFn: () => api.listTags() });
  const { data: locations, isLoading } = useQuery({
    queryKey: ["locations", filters],
    queryFn: () => api.listLocations(filters),
  });

  const cities = useMemo(() => {
    const set = new Set<string>();
    for (const l of all ?? []) if (l.city) set.add(l.city);
    return [...set].sort();
  }, [all]);

  const markers: MapMarker[] = useMemo(
    () =>
      (locations ?? [])
        .map((l): MapMarker | null => {
          const ll = lngLatOf(l) ?? (l.parent_location_id ? lngLatOf((all ?? []).find((p) => p.id === l.parent_location_id) ?? l) : null);
          if (!ll) return null;
          return {
            id: l.id,
            lng: ll[0],
            lat: ll[1],
            label: l.name,
            sub: l.city ?? undefined,
            href: `/locations/${l.id}`,
          };
        })
        .filter((m): m is MapMarker => m !== null),
    [locations, all]
  );

  return (
    <div>
      <PageHeader
        title="Location"
        subtitle={`${locations?.length ?? 0} location in archivio`}
        action={
          <>
            <div className="flex overflow-hidden rounded-lg border border-berry/20">
              <button
                onClick={() => setView("table")}
                className={`px-4 py-2 text-sm font-semibold ${view === "table" ? "bg-berry text-white" : "bg-white text-berry"}`}
              >
                Tabella
              </button>
              <button
                onClick={() => setView("map")}
                className={`px-4 py-2 text-sm font-semibold ${view === "map" ? "bg-berry text-white" : "bg-white text-berry"}`}
              >
                Mappa
              </button>
            </div>
            <Link href="/locations/new" className="rounded-lg bg-berry px-4 py-2 text-sm font-semibold text-white hover:bg-berry-dark">
              + Nuova
            </Link>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 rounded-xl border border-berry/10 bg-white p-4 shadow-sm md:grid-cols-3 lg:grid-cols-6">
        <input className={inputCls} placeholder="Cerca…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={inputCls} value={city} onChange={(e) => setCity(e.target.value)}>
          <option value="">Tutte le città</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select className={inputCls} value={tag} onChange={(e) => setTag(e.target.value)}>
          <option value="">Tutti i tag</option>
          {(allTags ?? []).map((t) => (
            <option key={t.id} value={t.name}>
              {tagLabel(t.name)}
            </option>
          ))}
        </select>
        <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as EffectiveStatus | "")}>
          <option value="">Tutti gli stati</option>
          {(Object.keys(EFFECTIVE_STATUS_LABELS) as EffectiveStatus[]).map((s) => (
            <option key={s} value={s}>
              {EFFECTIVE_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <input
          className={inputCls}
          type="number"
          min={0}
          placeholder="Capienza min"
          value={minCapacity}
          onChange={(e) => setMinCapacity(e.target.value)}
        />
        <select className={inputCls} value={configuration} onChange={(e) => setConfiguration(e.target.value as Configuration | "")}>
          <option value="">Ogni configurazione</option>
          {CONFIGURATIONS.map((c) => (
            <option key={c} value={c}>
              {CONFIG_LABELS[c]}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <Spinner />
      ) : view === "map" ? (
        <MapView markers={markers} height={560} />
      ) : (locations ?? []).length === 0 ? (
        <EmptyState title="Nessuna location trovata" hint="Prova a modificare i filtri di ricerca." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-berry/10 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-berry/10 bg-tint/60 text-left text-xs font-semibold uppercase tracking-wide text-ink/50">
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Città</th>
                <th className="px-4 py-3">Tag</th>
                <th className="px-4 py-3 text-right">Capienza max</th>
                <th className="px-4 py-3">Accessibilità</th>
                <th className="px-4 py-3">Stato</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-berry/5">
              {(locations ?? []).map((l) => {
                const st = l.effective_status ?? l.visit_status;
                return (
                  <tr key={l.id} className="transition hover:bg-tint/50">
                    <td className="px-4 py-3">
                      <Link href={`/locations/${l.id}`} className="font-semibold text-berry hover:underline">
                        {l.name}
                      </Link>
                      {l.parent_name && <p className="text-xs text-ink/45">interna a {l.parent_name}</p>}
                    </td>
                    <td className="px-4 py-3 text-ink/70">{l.city ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(l.smart_tags ?? []).slice(0, 3).map((t) => (
                          <Tag key={t}>{tagLabel(t)}</Tag>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-ink">{l.max_capacity ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Stars value={l.accessibility_rating} />
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={EFFECTIVE_STATUS_CLASSES[st]}>{EFFECTIVE_STATUS_LABELS[st]}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
