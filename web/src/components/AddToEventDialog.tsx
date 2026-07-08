"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { useWorkContext } from "@/lib/workContext";
import { Modal, btnPrimary, inputCls, labelCls } from "./ui";
import { formatDate } from "@/lib/labels";

export default function AddToEventDialog({
  open,
  onClose,
  locationId,
  locationName,
}: {
  open: boolean;
  onClose: () => void;
  locationId: string;
  locationName: string;
}) {
  const qc = useQueryClient();
  const { ctx: workCtx } = useWorkContext();
  const [projectId, setProjectId] = useState("");
  const [eventId, setEventId] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  // Contesto di lavoro attivo → preseleziona progetto/evento all'apertura.
  useEffect(() => {
    if (!open) {
      setPrefilled(false);
      return;
    }
    if (workCtx && !projectId && !eventId) {
      setProjectId(workCtx.projectId);
      if (workCtx.eventId) setEventId(workCtx.eventId);
      setPrefilled(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.listProjects(),
    enabled: open,
  });

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api.getProject(projectId),
    enabled: open && !!projectId,
  });

  const mutation = useMutation({
    mutationFn: () => api.addEventLocation(eventId, locationId),
    onSuccess: () => {
      const ev = project?.events.find((e) => e.id === eventId);
      setDone(`"${locationName}" aggiunta alla shortlist di ${ev?.name ?? "evento"}.`);
      qc.invalidateQueries({ queryKey: ["event-locations", eventId] });
      qc.invalidateQueries({ queryKey: ["project", projectId] });
    },
  });

  const close = () => {
    setDone(null);
    setProjectId("");
    setEventId("");
    mutation.reset();
    onClose();
  };

  return (
    <Modal open={open} onClose={close} title="Aggiungi a evento">
      {done ? (
        <div className="space-y-4">
          <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{done}</p>
          <button className={btnPrimary} onClick={close}>
            Chiudi
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-ink/60">
            Location: <span className="font-semibold text-ink">{locationName}</span>
          </p>
          {prefilled && workCtx && (
            <p className="rounded-lg bg-berry/[0.06] px-3 py-2 text-xs font-medium text-berry">
              Preimpostato dal contesto di lavoro: {workCtx.projectName}
              {workCtx.eventName ? ` · ${workCtx.eventName}` : ""}
            </p>
          )}
          <div>
            <label className={labelCls}>Progetto</label>
            <select
              className={inputCls}
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                setEventId("");
              }}
            >
              <option value="">— Seleziona progetto —</option>
              {(projects ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.client_name ? `(${p.client_name})` : ""}
                </option>
              ))}
            </select>
          </div>
          {projectId && (
            <div>
              <label className={labelCls}>Evento</label>
              <select className={inputCls} value={eventId} onChange={(e) => setEventId(e.target.value)}>
                <option value="">— Seleziona evento —</option>
                {(project?.events ?? []).map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name} {ev.date_start ? `— ${formatDate(ev.date_start)}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
          {mutation.isError && (
            <p className="text-sm text-red-600">Errore durante l&apos;aggiunta. Riprova.</p>
          )}
          <button className={btnPrimary} disabled={!eventId || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Aggiunta…" : "Aggiungi alla shortlist"}
          </button>
        </div>
      )}
    </Modal>
  );
}
