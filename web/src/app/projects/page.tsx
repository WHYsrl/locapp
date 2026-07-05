"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { Badge, EmptyState, Modal, PageHeader, Spinner, btnPrimary, inputCls, labelCls } from "@/components/ui";
import { PROJECT_STATUS_CLASSES, PROJECT_STATUS_LABELS, formatDate } from "@/lib/labels";

export default function ProjectsPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [notes, setNotes] = useState("");

  const { data: projects, isLoading } = useQuery({ queryKey: ["projects"], queryFn: () => api.listProjects() });

  const create = useMutation({
    mutationFn: () => api.createProject({ name, client_name: client || undefined, notes: notes || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      setCreateOpen(false);
      setName("");
      setClient("");
      setNotes("");
    },
  });

  return (
    <div>
      <PageHeader
        title="Progetti"
        subtitle="Ogni progetto contiene più eventi, ciascuno con la propria shortlist di location."
        action={
          <button className={btnPrimary} onClick={() => setCreateOpen(true)}>
            + Nuovo progetto
          </button>
        }
      />

      {isLoading ? (
        <Spinner />
      ) : (projects ?? []).length === 0 ? (
        <EmptyState title="Nessun progetto" hint="Crea il primo progetto per iniziare a costruire le shortlist." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {(projects ?? []).map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className="rounded-xl border border-berry/10 bg-white p-5 shadow-sm transition hover:border-berry/30 hover:shadow"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-berry">{p.name}</h2>
                  <p className="text-sm text-ink/60">{p.client_name ?? "—"}</p>
                </div>
                <Badge className={PROJECT_STATUS_CLASSES[p.status]}>{PROJECT_STATUS_LABELS[p.status]}</Badge>
              </div>
              {p.notes && <p className="mt-3 line-clamp-2 text-sm text-ink/60">{p.notes}</p>}
              <p className="mt-3 text-xs text-ink/45">
                {p.events_count ?? 0} eventi · creato {formatDate(p.created_at)}
              </p>
            </Link>
          ))}
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nuovo progetto">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <div>
            <label className={labelCls}>Nome progetto *</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required placeholder="es. Convention ACME 2026" />
          </div>
          <div>
            <label className={labelCls}>Cliente</label>
            <input className={inputCls} value={client} onChange={(e) => setClient(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Note</label>
            <textarea className={inputCls} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {create.isError && <p className="text-sm text-red-600">Errore durante la creazione.</p>}
          <button className={btnPrimary} disabled={!name.trim() || create.isPending}>
            {create.isPending ? "Creazione…" : "Crea progetto"}
          </button>
        </form>
      </Modal>
    </div>
  );
}
