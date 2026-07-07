"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import MapView, { type MapMarker } from "@/components/MapView";
import PoiDialog from "@/components/PoiDialog";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useDeleteFlow } from "@/lib/useDeleteFlow";
import { Badge, EmptyState, PageHeader, SegmentedControl, Spinner, btnGhost, btnPrimary, inputCls } from "@/components/ui";
import { POI_KINDS, POI_KIND_CLASSES, POI_KIND_ICONS, POI_KIND_LABELS } from "@/lib/labels";
import type { Poi, PoiKind } from "@/lib/types";

type View = "table" | "map";

export default function PoiPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<PoiKind | "">("");
  const [view, setView] = useState<View>("table");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Poi | null>(null);
  const [deleting, setDeleting] = useState<Poi | null>(null);

  const filters = useMemo(() => ({ q: q || undefined, kind }), [q, kind]);
  const { data: pois, isLoading } = useQuery({
    queryKey: ["pois", filters],
    queryFn: () => api.listPois(filters),
  });

  const del = useDeleteFlow({
    doDelete: () => api.deletePoi(deleting!.id),
    forcible: false,
    onDeleted: () => {
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ["pois"] });
    },
  });

  const markers: MapMarker[] = useMemo(
    () =>
      (pois ?? []).map((p) => ({
        id: p.id,
        lng: p.lng,
        lat: p.lat,
        label: `${POI_KIND_ICONS[p.kind]} ${p.name}`,
        sub: [POI_KIND_LABELS[p.kind], p.city].filter(Boolean).join(" · "),
        color: "#a26769",
      })),
    [pois]
  );

  return (
    <div>
      <PageHeader
        title="Punti di interesse"
        subtitle={`${pois?.length ?? 0} POI usati per ricerche e distanze`}
        action={
          <>
            <SegmentedControl<View>
              value={view}
              onChange={setView}
              options={[
                ["table", "Tabella"],
                ["map", "Mappa"],
              ]}
            />
            <button
              className={btnPrimary}
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              + Nuovo POI
            </button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-3 rounded-2xl border border-hairline bg-white p-4 shadow-soft sm:grid-cols-2 lg:grid-cols-4">
        <input className={inputCls} placeholder="Cerca…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as PoiKind | "")}>
          <option value="">Tutti i tipi</option>
          {POI_KINDS.map((k) => (
            <option key={k} value={k}>
              {POI_KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <Spinner />
      ) : view === "map" ? (
        markers.length === 0 ? (
          <EmptyState title="Nessun POI georeferenziato" />
        ) : (
          <MapView markers={markers} height={560} />
        )
      ) : (pois ?? []).length === 0 ? (
        <EmptyState title="Nessun punto di interesse" hint="Crea il primo POI: hotel, aeroporti, stazioni o monumenti di riferimento." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-hairline bg-white shadow-soft">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline bg-surface/70 text-left text-xs font-semibold uppercase tracking-wide text-ink/50">
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Città</th>
                <th className="px-4 py-3">Indirizzo</th>
                <th className="px-4 py-3 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.04]">
              {(pois ?? []).map((p) => (
                <tr key={p.id} className="transition duration-150 hover:bg-surface/60">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-ink">{p.name}</p>
                    {p.notes && <p className="mt-0.5 text-xs text-ink/45">{p.notes}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={POI_KIND_CLASSES[p.kind]}>
                      <span aria-hidden>{POI_KIND_ICONS[p.kind]}</span>
                      {POI_KIND_LABELS[p.kind]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-ink/70">{p.city ?? "—"}</td>
                  <td className="px-4 py-3 text-ink/70">{p.address ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        className={btnGhost}
                        onClick={() => {
                          setEditing(p);
                          setDialogOpen(true);
                        }}
                      >
                        Modifica
                      </button>
                      <button
                        className="rounded-full px-3 py-1.5 text-sm font-medium text-ink/45 transition duration-150 hover:bg-red-50 hover:text-red-600"
                        onClick={() => {
                          setDeleting(p);
                          del.open();
                        }}
                      >
                        Elimina
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PoiDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        poi={editing}
        onSaved={() => qc.invalidateQueries({ queryKey: ["poi-distances"] })}
      />

      <ConfirmDialog
        {...del.dialogProps}
        title="Eliminare il POI?"
        message={
          deleting ? (
            <>
              <span className="font-semibold text-ink">{deleting.name}</span> verrà rimosso: non sarà più
              disponibile per ricerche e calcolo delle distanze.
            </>
          ) : undefined
        }
      />
    </div>
  );
}
