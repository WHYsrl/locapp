"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import MapView, { type MapMarker } from "@/components/MapView";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useDeleteFlow } from "@/lib/useDeleteFlow";
import { Badge, EmptyState, PageHeader, SegmentedControl, Spinner, Stars, Tag, btnPrimary, inputCls } from "@/components/ui";
import {
  CONFIGURATIONS,
  CONFIG_LABELS,
  EFFECTIVE_STATUS_CLASSES,
  EFFECTIVE_STATUS_LABELS,
  tagLabel,
} from "@/lib/labels";
import { lngLatOf, type Configuration, type EffectiveStatus, type LocationFilters, type LocationListItem } from "@/lib/types";

/** Miniatura riga: thumbnail dal serializer (mappa o cover) con fallback alla
 *  static map; se l'immagine non è raggiungibile si nasconde (placeholder). */
function RowThumb({ loc }: { loc: LocationListItem }) {
  const [broken, setBroken] = useState(false);
  // Il fallback map-thumb del serializer passa dall'helper versionato (?v=)
  // così il cambio di stile invalida anche la copia in cache del browser.
  const src =
    loc.thumbnail_url && !loc.thumbnail_url.includes("/map-thumb.png")
      ? api.resolveApiUrl(loc.thumbnail_url)
      : api.mapThumbUrl(loc.id);
  if (broken) return <div className="h-11 w-[72px] rounded-lg border border-hairline bg-surface" aria-hidden />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setBroken(true)}
      className="h-11 w-[72px] rounded-lg border border-hairline object-cover"
    />
  );
}

/** Row actions dropdown ("⋯"): apri, modifica, elimina. */
function RowMenu({ loc, onDelete }: { loc: LocationListItem; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        className="rounded-full px-2.5 py-1 text-base leading-none text-ink/45 transition duration-150 hover:bg-black/[0.05] hover:text-ink"
        aria-label={`Azioni per ${loc.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="menu"
            className="absolute right-0 z-40 mt-1 w-44 overflow-hidden rounded-xl border border-hairline bg-white/95 py-1 shadow-soft backdrop-blur-xl"
          >
            <Link
              role="menuitem"
              href={`/locations/${loc.id}`}
              className="block px-3.5 py-2 text-sm text-ink/80 transition duration-150 hover:bg-black/[0.04]"
              onClick={() => setOpen(false)}
            >
              Apri scheda
            </Link>
            <Link
              role="menuitem"
              href={`/locations/${loc.id}/edit`}
              className="block px-3.5 py-2 text-sm text-ink/80 transition duration-150 hover:bg-black/[0.04]"
              onClick={() => setOpen(false)}
            >
              Modifica
            </Link>
            <button
              role="menuitem"
              className="block w-full px-3.5 py-2 text-left text-sm text-red-600 transition duration-150 hover:bg-red-50"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
            >
              Elimina
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function LocationsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [tag, setTag] = useState("");
  const [status, setStatus] = useState<EffectiveStatus | "">("");
  const [minCapacity, setMinCapacity] = useState("");
  const [configuration, setConfiguration] = useState<Configuration | "">("");
  const [view, setView] = useState<"table" | "map">("table");
  const [deleting, setDeleting] = useState<LocationListItem | null>(null);

  const del = useDeleteFlow({
    doDelete: (force) => api.deleteLocation(deleting!.id, force),
    onDeleted: () => {
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ["locations"] });
    },
  });

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
            <SegmentedControl<"table" | "map">
              value={view}
              onChange={setView}
              options={[
                ["table", "Tabella"],
                ["map", "Mappa"],
              ]}
            />
            <Link href="/locations/new" className={btnPrimary}>
              + Nuova
            </Link>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 rounded-2xl border border-hairline bg-white p-4 shadow-soft md:grid-cols-3 lg:grid-cols-6">
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
        // overflow visibile: il menù ⋯ delle righe non deve essere tagliato
        <div className="rounded-2xl border border-hairline bg-white shadow-soft">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline bg-surface/70 text-left text-xs font-semibold uppercase tracking-wide text-ink/50">
                <th className="w-24 rounded-tl-2xl px-4 py-3">Mappa</th>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Città</th>
                <th className="px-4 py-3">Tag</th>
                <th className="px-4 py-3 text-right">Capienza max</th>
                <th className="px-4 py-3">Accessibilità</th>
                <th className="px-4 py-3">Stato</th>
                <th className="w-12 rounded-tr-2xl px-2 py-3" aria-label="Azioni" />
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.04]">
              {(locations ?? []).map((l) => {
                const st = l.effective_status ?? l.visit_status;
                return (
                  <tr key={l.id} className="transition duration-150 hover:bg-surface/60">
                    <td className="px-4 py-2">
                      <Link href={`/locations/${l.id}`} className="block" tabIndex={-1} aria-hidden>
                        <RowThumb loc={l} />
                      </Link>
                    </td>
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
                    <td className="px-2 py-3 text-right">
                      <RowMenu
                        loc={l}
                        onDelete={() => {
                          setDeleting(l);
                          del.open();
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        {...del.dialogProps}
        title="Eliminare la location?"
        message={
          deleting ? (
            <>
              <span className="font-semibold text-ink">{deleting.name}</span> e i suoi dati (spazi, media,
              listini) verranno eliminati definitivamente.
            </>
          ) : undefined
        }
      />
    </div>
  );
}
