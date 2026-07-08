"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import MapView, { type MapMarker } from "@/components/MapView";
import TagPicker, { TagChip, useTagColors } from "@/components/TagPicker";
import ConfirmDialog from "@/components/ConfirmDialog";
import ExportSlidesButton from "@/components/ExportSlidesButton";
import WorkHereButton from "@/components/WorkHereButton";
import { useDeleteFlow } from "@/lib/useDeleteFlow";
import { useWorkContext } from "@/lib/workContext";
import { Badge, Card, EmptyState, Modal, PageHeader, ScoreBadge, SegmentedControl, Spinner, btnDangerGhost, btnPrimary, btnSecondary, inputCls, labelCls } from "@/components/ui";
import {
  AVAILABILITY_CLASSES,
  AVAILABILITY_LABELS,
  EL_STATUSES,
  EL_STATUS_CLASSES,
  EL_STATUS_LABELS,
  QUOTE_STATUS_CLASSES,
  QUOTE_STATUS_LABELS,
  formatDate,
  formatDateTime,
  formatMoney,
} from "@/lib/labels";
import type { AvailabilityStatus, EventLocationEntry, EventLocationStatus, QuoteStatus } from "@/lib/types";

type View = "board" | "compare" | "map";

const STATUS_COLORS: Record<string, string> = {
  confermata: "#059669",
  utilizzata: "#6d2e46",
  preferita: "#c9a227",
  scartata: "#9ca3af",
};

export default function EventShortlistPage() {
  const params = useParams<{ id: string; eventId: string }>();
  const projectId = params.id;
  const eventId = params.eventId;
  const qc = useQueryClient();
  const router = useRouter();
  const [view, setView] = useState<View>("board");
  const [addOpen, setAddOpen] = useState(false);
  const [addLocationId, setAddLocationId] = useState("");
  const [editingTags, setEditingTags] = useState(false);
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const tagColors = useTagColors();
  const { ctx: workCtx, setCtx: setWorkCtx, clearCtx: clearWorkCtx } = useWorkContext();

  const { data: event } = useQuery({ queryKey: ["event", eventId], queryFn: () => api.getEvent(eventId), enabled: !!eventId });
  const { data: shortlist, isLoading } = useQuery({
    queryKey: ["event-locations", eventId],
    queryFn: () => api.getEventLocations(eventId),
    enabled: !!eventId,
  });
  const { data: compare } = useQuery({
    queryKey: ["event-compare", eventId],
    queryFn: () => api.getEventCompare(eventId),
    enabled: !!eventId && view === "compare",
  });
  const { data: mapData } = useQuery({
    queryKey: ["event-map", eventId],
    queryFn: () => api.getEventMap(eventId),
    enabled: !!eventId && view === "map",
  });
  const { data: allLocations } = useQuery({ queryKey: ["locations", "all"], queryFn: () => api.listLocations() });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["event-locations", eventId] });
    qc.invalidateQueries({ queryKey: ["event-compare", eventId] });
    qc.invalidateQueries({ queryKey: ["project", projectId] });
  };

  const saveTags = useMutation({
    mutationFn: (tags: string[]) => api.updateEvent(eventId, { tags }),
    onSuccess: () => {
      setEditingTags(false);
      qc.invalidateQueries({ queryKey: ["event", eventId] });
      qc.invalidateQueries({ queryKey: ["tags"] });
    },
  });

  const deleteFlow = useDeleteFlow({
    doDelete: () => api.deleteEvent(eventId),
    forcible: false,
    onDeleted: () => {
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.removeQueries({ queryKey: ["event", eventId] });
      router.push(`/projects/${projectId}`);
    },
  });

  const addLoc = useMutation({
    mutationFn: () => api.addEventLocation(eventId, addLocationId),
    onSuccess: () => {
      invalidate();
      setAddOpen(false);
      setAddLocationId("");
    },
  });

  const markers: MapMarker[] = useMemo(
    () =>
      (mapData?.features ?? [])
        // Locations without coordinates arrive with geometry: null (valid GeoJSON).
        .filter((f) => Array.isArray(f.geometry?.coordinates))
        .map((f) => ({
        id: f.properties.id,
        lng: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
        label: f.properties.name,
        sub: f.properties.status ? EL_STATUS_LABELS[f.properties.status as EventLocationStatus] : undefined,
        color: f.properties.status ? STATUS_COLORS[f.properties.status] : undefined,
        href: `/locations/${f.properties.id}`,
      })),
    [mapData]
  );

  const inShortlist = new Set((shortlist ?? []).map((el) => el.location.id));

  return (
    <div>
      <nav className="mb-3 text-sm text-ink/50">
        <Link href="/projects" className="hover:text-berry">
          Progetti
        </Link>
        {" / "}
        <Link href={`/projects/${projectId}`} className="hover:text-berry">
          {event?.project?.name ?? "…"}
        </Link>
        {" / "}
        <span className="text-ink/80">{event?.name ?? "…"}</span>
      </nav>

      <PageHeader
        title={event?.name ?? "Evento"}
        subtitle={
          event
            ? [event.event_type, formatDate(event.date_start), event.pax ? `${event.pax} pax` : null].filter(Boolean).join(" · ")
            : undefined
        }
        action={
          <>
            <SegmentedControl<View>
              value={view}
              onChange={setView}
              options={[
                ["board", "Shortlist"],
                ["compare", "Confronta"],
                ["map", "Mappa"],
              ]}
            />
            <WorkHereButton
              active={workCtx?.eventId === eventId}
              disabled={!event}
              onActivate={() => {
                if (!event) return;
                setWorkCtx({
                  projectId: projectId,
                  projectName: event.project?.name ?? "Progetto",
                  eventId: eventId,
                  eventName: event.name,
                });
              }}
              onDeactivate={clearWorkCtx}
            />
            <ExportSlidesButton kind="event" id={eventId} name={event?.name} />
            <button className={btnDangerGhost} onClick={deleteFlow.open}>
              Elimina evento
            </button>
            <button className={btnPrimary} onClick={() => setAddOpen(true)}>
              + Aggiungi location
            </button>
          </>
        }
        highlight={workCtx?.eventId === eventId}
      />

      {/* event tags */}
      {event && (
        <div className="mb-4 -mt-2">
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
              {(event.tags ?? []).map((t) => (
                <TagChip key={t} name={t} color={tagColors[t]} />
              ))}
              {(event.tags ?? []).length === 0 && <span className="text-xs text-ink/40">Nessun tag</span>}
              <button
                className="rounded-lg px-1.5 py-0.5 text-sm text-ink/40 transition hover:bg-berry/5 hover:text-berry"
                title="Modifica i tag dell'evento"
                aria-label="Modifica i tag dell'evento"
                onClick={() => {
                  setDraftTags(event.tags ?? []);
                  setEditingTags(true);
                }}
              >
                ✎
              </button>
            </div>
          )}
        </div>
      )}

      {event?.brief && (
        <p className="mb-6 rounded-xl border-l-4 border-gold bg-gold/5 px-4 py-3 text-sm text-ink/75">
          <span className="font-semibold">Brief:</span> {event.brief}
        </p>
      )}

      {isLoading ? (
        <Spinner />
      ) : view === "map" ? (
        markers.length === 0 ? (
          <EmptyState title="Nessuna location georeferenziata" />
        ) : (
          <MapView markers={markers} height={560} />
        )
      ) : view === "compare" ? (
        <CompareView compare={compare} />
      ) : (shortlist ?? []).length === 0 ? (
        <EmptyState title="Shortlist vuota" hint="Aggiungi location dalla ricerca AI o manualmente." />
      ) : (
        <div className="space-y-5">
          {(shortlist ?? []).map((el) => (
            <ShortlistCard key={el.id} el={el} onChanged={invalidate} />
          ))}
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Aggiungi location alla shortlist">
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Location</label>
            <select className={inputCls} value={addLocationId} onChange={(e) => setAddLocationId(e.target.value)}>
              <option value="">— Seleziona —</option>
              {(allLocations ?? [])
                .filter((l) => !inShortlist.has(l.id))
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} {l.city ? `(${l.city})` : ""}
                  </option>
                ))}
            </select>
          </div>
          {addLoc.isError && <p className="text-sm text-red-600">Errore durante l&apos;aggiunta.</p>}
          <button className={btnPrimary} disabled={!addLocationId || addLoc.isPending} onClick={() => addLoc.mutate()}>
            {addLoc.isPending ? "Aggiunta…" : "Aggiungi"}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        {...deleteFlow.dialogProps}
        title="Eliminare l'evento?"
        message={
          <>
            <span className="font-semibold text-ink">{event?.name ?? "L'evento"}</span> verrà eliminato con
            tutta la shortlist, i sopralluoghi, i preventivi e le disponibilità collegate.
          </>
        }
      />
    </div>
  );
}

function CompareView({ compare }: { compare?: import("@/lib/types").CompareMatrix }) {
  if (!compare) return <Spinner />;
  if (compare.locations.length === 0) return <EmptyState title="Nessuna location da confrontare" />;
  return (
    <div className="overflow-x-auto rounded-2xl border border-hairline bg-white shadow-soft">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-berry/10 bg-tint/60">
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink/50">Criterio</th>
            {compare.locations.map((l) => (
              <th key={l.id} className="px-4 py-3 text-left">
                <Link href={`/locations/${l.id}`} className="font-bold text-berry hover:underline">
                  {l.name}
                </Link>
                <div className="mt-1">
                  <Badge className={EL_STATUS_CLASSES[l.status]}>{EL_STATUS_LABELS[l.status]}</Badge>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-berry/5">
          {compare.rows.map((row, i) => (
            <tr key={i}>
              <td className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink/50">{row.label}</td>
              {row.values.map((v, j) => (
                <td key={j} className="px-4 py-2.5 text-ink/80">
                  {v ?? <span className="text-ink/30">—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ShortlistCard({ el, onChanged }: { el: EventLocationEntry; onChanged: () => void }) {
  const [feedback, setFeedback] = useState(el.client_feedback ?? "");
  const [tab, setTab] = useState<"visits" | "quotes" | "availability" | null>(null);

  const patch = useMutation({
    mutationFn: (p: { status?: EventLocationStatus; client_feedback?: string }) => api.patchEventLocation(el.id, p),
    onSuccess: onChanged,
  });
  const remove = useMutation({
    mutationFn: () => api.deleteEventLocation(el.id),
    onSuccess: onChanged,
  });

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <Link href={`/locations/${el.location.id}`} className="text-lg font-bold text-berry hover:underline">
              {el.location.name}
            </Link>
            {el.match_score != null && <ScoreBadge score={Math.round(el.match_score)} />}
            <span className="text-sm text-ink/50">
              {el.location.city ?? ""} · max {el.location.max_capacity ?? "—"} pax
            </span>
          </div>
          {el.match_reasons && (
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
              {el.match_reasons.matched.slice(0, 3).map((m, i) => (
                <span key={`m${i}`} className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
                  ✓ {m}
                </span>
              ))}
              {el.match_reasons.unmatched.slice(0, 2).map((m, i) => (
                <span key={`u${i}`} className="rounded-full bg-red-50 px-2 py-0.5 text-red-600">
                  ✕ {m}
                </span>
              ))}
              {el.match_reasons.to_verify.slice(0, 2).map((m, i) => (
                <span key={`v${i}`} className="rounded-full bg-amber-50 px-2 py-0.5 text-yellow-700">
                  ? {m}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${EL_STATUS_CLASSES[el.status]}`}
            value={el.status}
            onChange={(e) => patch.mutate({ status: e.target.value as EventLocationStatus })}
            disabled={patch.isPending}
          >
            {EL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {EL_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <button
            className="rounded-lg px-2 py-1.5 text-sm text-ink/35 hover:bg-red-50 hover:text-red-600"
            title="Rimuovi dalla shortlist"
            onClick={() => {
              if (window.confirm(`Rimuovere ${el.location.name} dalla shortlist?`)) remove.mutate();
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* client feedback */}
      <div className="mt-4">
        <label className={labelCls}>Feedback del cliente</label>
        <div className="flex gap-2">
          <input
            className={inputCls}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Annota qui il feedback del cliente su questa location…"
          />
          <button
            className={btnSecondary}
            disabled={patch.isPending || feedback === (el.client_feedback ?? "")}
            onClick={() => patch.mutate({ client_feedback: feedback })}
          >
            Salva
          </button>
        </div>
      </div>

      {/* sub-sections */}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-berry/5 pt-4">
        <SectionToggle
          active={tab === "visits"}
          onClick={() => setTab(tab === "visits" ? null : "visits")}
          label={`Sopralluoghi (${el.visits.length})`}
        />
        <SectionToggle
          active={tab === "quotes"}
          onClick={() => setTab(tab === "quotes" ? null : "quotes")}
          label={`Preventivi (${el.quotes.length})`}
        />
        <SectionToggle
          active={tab === "availability"}
          onClick={() => setTab(tab === "availability" ? null : "availability")}
          label={`Disponibilità (${el.availability.length})`}
        />
      </div>

      {tab === "visits" && <VisitsSection el={el} onChanged={onChanged} />}
      {tab === "quotes" && <QuotesSection el={el} onChanged={onChanged} />}
      {tab === "availability" && <AvailabilitySection el={el} onChanged={onChanged} />}
    </Card>
  );
}

function SectionToggle({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition duration-150 ${
        active ? "bg-berry text-white shadow-sm" : "bg-black/[0.05] text-ink/60 hover:text-berry"
      }`}
    >
      {label}
    </button>
  );
}

function VisitsSection({ el, onChanged }: { el: EventLocationEntry; onChanged: () => void }) {
  const [when, setWhen] = useState("");
  const [attendees, setAttendees] = useState("");
  const [withClient, setWithClient] = useState(false);
  const [outcome, setOutcome] = useState("");

  const add = useMutation({
    mutationFn: () =>
      api.addVisit(el.id, {
        scheduled_at: new Date(when).toISOString(),
        attendees: attendees || null,
        with_client: withClient,
        outcome: outcome || null,
      }),
    onSuccess: () => {
      onChanged();
      setWhen("");
      setAttendees("");
      setOutcome("");
      setWithClient(false);
    },
  });

  return (
    <div className="mt-4 rounded-lg bg-tint/50 p-4">
      {el.visits.length > 0 && (
        <ul className="mb-4 space-y-2 text-sm">
          {el.visits.map((v) => (
            <li key={v.id} className="rounded-lg bg-white px-3 py-2.5">
              <p className="font-semibold text-ink">
                {formatDateTime(v.scheduled_at)}
                {v.with_client && <Badge className="ml-2 bg-gold/15 text-yellow-800 border-gold/30">con cliente</Badge>}
              </p>
              {v.attendees && <p className="text-xs text-ink/50">Partecipanti: {v.attendees}</p>}
              {v.outcome ? (
                <p className="mt-1 text-ink/70">{v.outcome}</p>
              ) : (
                <p className="mt-1 text-xs italic text-ink/40">Esito da registrare</p>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <input className={inputCls} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        <input className={inputCls} placeholder="Partecipanti" value={attendees} onChange={(e) => setAttendees(e.target.value)} />
        <label className="flex items-center gap-2 text-sm text-ink/70">
          <input type="checkbox" checked={withClient} onChange={(e) => setWithClient(e.target.checked)} className="h-4 w-4 accent-[#6d2e46]" />
          Con il cliente
        </label>
        <input className={inputCls} placeholder="Esito (se già svolto)" value={outcome} onChange={(e) => setOutcome(e.target.value)} />
      </div>
      <button className={`${btnSecondary} mt-3`} disabled={!when || add.isPending} onClick={() => add.mutate()}>
        {add.isPending ? "Salvataggio…" : "+ Aggiungi sopralluogo"}
      </button>
    </div>
  );
}

function QuotesSection({ el, onChanged }: { el: EventLocationEntry; onChanged: () => void }) {
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<QuoteStatus>("richiesto");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");

  const add = useMutation({
    mutationFn: () =>
      api.addQuote(el.id, {
        amount: amount ? Number(amount) : 0,
        currency: "EUR",
        status,
        valid_until: validUntil || null,
        notes: notes || null,
        received_at: status !== "richiesto" ? new Date().toISOString().slice(0, 10) : null,
      }),
    onSuccess: () => {
      onChanged();
      setAmount("");
      setNotes("");
      setValidUntil("");
      setStatus("richiesto");
    },
  });

  return (
    <div className="mt-4 rounded-lg bg-tint/50 p-4">
      {el.quotes.length > 0 && (
        <ul className="mb-4 space-y-2 text-sm">
          {el.quotes.map((q) => (
            <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2.5">
              <div>
                <span className="font-semibold text-ink">{q.amount > 0 ? formatMoney(q.amount, q.currency) : "importo n.d."}</span>
                {q.valid_until && <span className="ml-2 text-xs text-ink/50">valido fino al {formatDate(q.valid_until)}</span>}
                {q.notes && <p className="text-xs text-ink/60">{q.notes}</p>}
              </div>
              <Badge className={QUOTE_STATUS_CLASSES[q.status]}>{QUOTE_STATUS_LABELS[q.status]}</Badge>
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <input className={inputCls} type="number" min={0} placeholder="Importo €" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as QuoteStatus)}>
          {(Object.keys(QUOTE_STATUS_LABELS) as QuoteStatus[]).map((s) => (
            <option key={s} value={s}>
              {QUOTE_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <input className={inputCls} type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} title="Valido fino al" />
        <input className={inputCls} placeholder="Note" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <button className={`${btnSecondary} mt-3`} disabled={add.isPending} onClick={() => add.mutate()}>
        {add.isPending ? "Salvataggio…" : "+ Aggiungi preventivo"}
      </button>
    </div>
  );
}

function AvailabilitySection({ el, onChanged }: { el: EventLocationEntry; onChanged: () => void }) {
  const [date, setDate] = useState("");
  const [status, setStatus] = useState<AvailabilityStatus>("disponibile");
  const [expires, setExpires] = useState("");
  const [notes, setNotes] = useState("");

  const add = useMutation({
    mutationFn: () =>
      api.addAvailability(el.id, {
        date,
        status,
        option_expires_at: expires || null,
        notes: notes || null,
      }),
    onSuccess: () => {
      onChanged();
      setDate("");
      setExpires("");
      setNotes("");
      setStatus("disponibile");
    },
  });

  return (
    <div className="mt-4 rounded-lg bg-tint/50 p-4">
      {el.availability.length > 0 && (
        <ul className="mb-4 space-y-2 text-sm">
          {el.availability.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2.5">
              <div>
                <span className="font-semibold text-ink">{formatDate(a.date)}</span>
                {a.time_from && (
                  <span className="ml-2 text-xs text-ink/50">
                    {a.time_from}–{a.time_to ?? ""}
                  </span>
                )}
                {a.option_expires_at && (
                  <span className="ml-2 text-xs text-yellow-700">opzione scade il {formatDate(a.option_expires_at)}</span>
                )}
                {a.notes && <p className="text-xs text-ink/60">{a.notes}</p>}
              </div>
              <Badge className={AVAILABILITY_CLASSES[a.status]}>{AVAILABILITY_LABELS[a.status]}</Badge>
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as AvailabilityStatus)}>
          {(Object.keys(AVAILABILITY_LABELS) as AvailabilityStatus[]).map((s) => (
            <option key={s} value={s}>
              {AVAILABILITY_LABELS[s]}
            </option>
          ))}
        </select>
        <input className={inputCls} type="date" value={expires} onChange={(e) => setExpires(e.target.value)} title="Scadenza opzione" />
        <input className={inputCls} placeholder="Note" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <button className={`${btnSecondary} mt-3`} disabled={!date || add.isPending} onClick={() => add.mutate()}>
        {add.isPending ? "Salvataggio…" : "+ Aggiungi disponibilità"}
      </button>
    </div>
  );
}
