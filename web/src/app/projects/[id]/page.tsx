"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import MapView, { type MapMarker } from "@/components/MapView";
import CollapsibleSection from "@/components/CollapsibleSection";
import TagPicker, { TagChip, useTagColors } from "@/components/TagPicker";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useDeleteFlow } from "@/lib/useDeleteFlow";
import { Badge, EmptyState, Modal, PageHeader, Spinner, btnDangerGhost, btnPrimary, btnSecondary, inputCls, labelCls } from "@/components/ui";
import {
  EL_STATUSES,
  EL_STATUS_CLASSES,
  EL_STATUS_LABELS,
  PROJECT_STATUS_CLASSES,
  PROJECT_STATUS_LABELS,
  formatDate,
} from "@/lib/labels";

const STATUS_COLORS: Record<string, string> = {
  confermata: "#059669",
  utilizzata: "#6d2e46",
  preferita: "#c9a227",
  scartata: "#9ca3af",
};

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [evName, setEvName] = useState("");
  const [evType, setEvType] = useState("");
  const [evDate, setEvDate] = useState("");
  const [evPax, setEvPax] = useState("");
  const [evBrief, setEvBrief] = useState("");
  const [editingTags, setEditingTags] = useState(false);
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const tagColors = useTagColors();

  const { data: project, isLoading } = useQuery({
    queryKey: ["project", id],
    queryFn: () => api.getProject(id),
    enabled: !!id,
  });

  const { data: mapData } = useQuery({
    queryKey: ["project-map", id],
    queryFn: () => api.getProjectMap(id),
    enabled: !!id,
  });

  const createEv = useMutation({
    mutationFn: () =>
      api.createEvent(id, {
        name: evName,
        event_type: evType || null,
        date_start: evDate || null,
        pax: evPax ? Number(evPax) : null,
        brief: evBrief || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", id] });
      setCreateOpen(false);
      setEvName("");
      setEvType("");
      setEvDate("");
      setEvPax("");
      setEvBrief("");
    },
  });

  const saveTags = useMutation({
    mutationFn: (tags: string[]) => api.updateProject(id, { tags }),
    onSuccess: () => {
      setEditingTags(false);
      qc.invalidateQueries({ queryKey: ["project", id] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["tags"] });
    },
  });

  const deleteFlow = useDeleteFlow({
    doDelete: (force) => api.deleteProject(id, force),
    onDeleted: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.removeQueries({ queryKey: ["project", id] });
      router.push("/projects");
    },
  });

  const markers: MapMarker[] = useMemo(
    () =>
      (mapData?.features ?? []).map((f) => ({
        id: f.properties.id,
        lng: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
        label: f.properties.name,
        sub: f.properties.event_name,
        color: f.properties.status ? STATUS_COLORS[f.properties.status] : undefined,
        href: `/locations/${f.properties.id}`,
      })),
    [mapData]
  );

  if (isLoading || !project) return <Spinner />;

  return (
    <div>
      <nav className="mb-3 text-sm text-ink/50">
        <Link href="/projects" className="hover:text-berry">
          Progetti
        </Link>
        {" / "}
        <span className="text-ink/80">{project.name}</span>
      </nav>

      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {project.name}
            <Badge className={PROJECT_STATUS_CLASSES[project.status]}>{PROJECT_STATUS_LABELS[project.status]}</Badge>
          </span>
        }
        subtitle={
          <>
            Cliente: <span className="font-medium text-ink/80">{project.client_name ?? "—"}</span>
            {project.notes && <span className="ml-2">· {project.notes}</span>}
          </>
        }
        action={
          <>
            <button className={btnDangerGhost} onClick={deleteFlow.open}>
              Elimina progetto
            </button>
            <button className={btnPrimary} onClick={() => setCreateOpen(true)}>
              + Nuovo evento
            </button>
          </>
        }
      />

      {/* project tags */}
      <div className="mb-6 -mt-2">
        {editingTags ? (
          <div className="max-w-2xl rounded-lg border border-berry/15 bg-white p-3">
            <TagPicker value={draftTags} onChange={setDraftTags} compact />
            <div className="mt-3 flex items-center gap-2">
              <button className={btnPrimary} disabled={saveTags.isPending} onClick={() => saveTags.mutate(draftTags)}>
                {saveTags.isPending ? "Salvataggio…" : "Salva tag"}
              </button>
              <button className={btnSecondary} onClick={() => setEditingTags(false)}>
                Annulla
              </button>
              {saveTags.isError && <span className="text-sm text-red-600">Errore nel salvataggio.</span>}
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {(project.tags ?? []).map((t) => (
              <TagChip key={t} name={t} color={tagColors[t]} />
            ))}
            {(project.tags ?? []).length === 0 && <span className="text-xs text-ink/40">Nessun tag</span>}
            <button
              className="rounded-lg px-1.5 py-0.5 text-sm text-ink/40 transition hover:bg-berry/5 hover:text-berry"
              title="Modifica i tag del progetto"
              aria-label="Modifica i tag del progetto"
              onClick={() => {
                setDraftTags(project.tags ?? []);
                setEditingTags(true);
              }}
            >
              ✎
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {project.events.length === 0 ? (
            <EmptyState title="Nessun evento nel progetto" hint="Aggiungi il primo evento per costruire la shortlist." />
          ) : (
            project.events.map((ev) => {
              const total = Object.values(ev.location_counts).reduce((a, b) => a + (b ?? 0), 0);
              return (
                <Link
                  key={ev.id}
                  href={`/projects/${id}/events/${ev.id}`}
                  className="block rounded-2xl border border-hairline bg-white p-5 shadow-soft transition duration-200 hover:border-berry/25 hover:shadow-md"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold tracking-tight text-berry">{ev.name}</h2>
                      <p className="text-sm text-ink/55">
                        {[ev.event_type, formatDate(ev.date_start), ev.pax ? `${ev.pax} pax` : null].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-ink/60">{total} location in shortlist</span>
                  </div>
                  {ev.brief && <p className="mt-2 line-clamp-2 text-sm text-ink/60">{ev.brief}</p>}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {EL_STATUSES.filter((s) => (ev.location_counts[s] ?? 0) > 0).map((s) => (
                      <Badge key={s} className={EL_STATUS_CLASSES[s]}>
                        {EL_STATUS_LABELS[s]}: {ev.location_counts[s]}
                      </Badge>
                    ))}
                  </div>
                </Link>
              );
            })
          )}
        </div>

        <div>
          <CollapsibleSection storageKey="project:mappa" title="Mappa del progetto" defaultOpen>
            {markers.length === 0 ? (
              <p className="text-sm text-ink/40">Nessuna location georeferenziata in shortlist.</p>
            ) : (
              <MapView markers={markers} height={420} />
            )}
          </CollapsibleSection>
        </div>
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nuovo evento">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (evName.trim()) createEv.mutate();
          }}
        >
          <div>
            <label className={labelCls}>Nome evento *</label>
            <input className={inputCls} value={evName} onChange={(e) => setEvName(e.target.value)} required placeholder="es. Cena di Gala" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Tipo</label>
              <input className={inputCls} value={evType} onChange={(e) => setEvType(e.target.value)} placeholder="conferenza, gala_dinner…" />
            </div>
            <div>
              <label className={labelCls}>Data</label>
              <input className={inputCls} type="date" value={evDate} onChange={(e) => setEvDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Pax</label>
            <input className={inputCls} type="number" min={1} value={evPax} onChange={(e) => setEvPax(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Brief</label>
            <textarea className={inputCls} rows={3} value={evBrief} onChange={(e) => setEvBrief(e.target.value)} />
          </div>
          {createEv.isError && <p className="text-sm text-red-600">Errore durante la creazione.</p>}
          <button className={btnPrimary} disabled={!evName.trim() || createEv.isPending}>
            {createEv.isPending ? "Creazione…" : "Crea evento"}
          </button>
        </form>
      </Modal>

      <ConfirmDialog
        {...deleteFlow.dialogProps}
        title="Eliminare il progetto?"
        message={
          <>
            <span className="font-semibold text-ink">{project.name}</span> verrà eliminato definitivamente.
          </>
        }
        warning={
          deleteFlow.dialogProps.warning ? (
            <div>
              <p>{deleteFlow.dialogProps.warning}</p>
              {project.events.length > 0 && (
                <ul className="mt-2 list-inside list-disc space-y-0.5">
                  {project.events.map((ev) => (
                    <li key={ev.id}>
                      {ev.name}
                      {ev.date_start ? ` · ${formatDate(ev.date_start)}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : undefined
        }
      />
    </div>
  );
}
