"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { Badge, Card, Modal, PageHeader, Spinner } from "@/components/ui";
import { useWorkContext } from "@/lib/workContext";
import {
  EFFECTIVE_STATUS_CLASSES,
  EFFECTIVE_STATUS_LABELS,
  PROJECT_STATUS_CLASSES,
  PROJECT_STATUS_LABELS,
  formatDate,
  formatDateTime,
  tagLabel,
} from "@/lib/labels";
import type { EffectiveStatus } from "@/lib/types";

const STATUSES: EffectiveStatus[] = ["da_visitare", "visitata", "proposta", "utilizzata"];

const EXPORT_KIND_LABELS: Record<api.SlidesExportKind, string> = {
  location: "Location",
  event: "Evento",
  project: "Progetto",
};

export default function DashboardPage() {
  const router = useRouter();
  const [pickProjectOpen, setPickProjectOpen] = useState(false);

  const locationsQ = useQuery({ queryKey: ["locations", "all"], queryFn: () => api.listLocations() });
  const projectsQ = useQuery({ queryKey: ["projects"], queryFn: () => api.listProjects() });
  const exportsQ = useQuery({
    queryKey: ["export-jobs", "latest"],
    queryFn: () => api.listExportJobs({ per_page: 3 }),
  });

  if (locationsQ.isLoading || projectsQ.isLoading) return <Spinner />;

  const locations = locationsQ.data ?? [];
  const projects = projectsQ.data ?? [];
  const latestExports = exportsQ.data?.data ?? [];
  const byStatus = (s: EffectiveStatus) =>
    locations.filter((l) => (l.effective_status ?? l.visit_status) === s);

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Panoramica di location e progetti" />

      {/* Azioni rapide */}
      <section className="mb-8">
        <h2 className="mb-3 text-[15px] font-semibold tracking-tight text-ink">Azioni rapide</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <QuickAction
            href="/ingest"
            icon="⇪"
            title="Aggiungi location"
            hint="Da URL, PDF, testo o voce con l'AI"
          />
          <QuickAction
            href="/projects?new=1"
            icon="▤"
            title="Nuovo progetto"
            hint="Crea un progetto per il cliente"
          />
          <QuickAction
            onClick={() => setPickProjectOpen(true)}
            icon="✚"
            title="Nuovo evento"
            hint="Scegli il progetto e crea l'evento"
          />
          <QuickAction
            href="/search"
            icon="✦"
            title="Trova location"
            hint="Ricerca AI dal brief dell'evento"
          />
        </div>
      </section>

      {/* stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Location" value={locations.length} />
        {STATUSES.map((s) => (
          <StatCard key={s} label={EFFECTIVE_STATUS_LABELS[s]} value={byStatus(s).length} />
        ))}
        <StatCard label="Progetti attivi" value={projects.filter((p) => p.status === "attivo").length} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card title="Progetti recenti" action={<Link href="/projects" className="text-sm font-semibold text-berry hover:underline">Tutti →</Link>}>
            <ul className="divide-y divide-berry/5">
              {projects.slice(0, 5).map((p) => (
                <li key={p.id}>
                  <Link href={`/projects/${p.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-tint/60">
                    <div>
                      <p className="font-semibold text-ink">{p.name}</p>
                      <p className="text-xs text-ink/50">
                        {p.client_name ?? "—"} · {p.events_count ?? 0} eventi · creato {formatDate(p.created_at)}
                      </p>
                    </div>
                    <Badge className={PROJECT_STATUS_CLASSES[p.status]}>{PROJECT_STATUS_LABELS[p.status]}</Badge>
                  </Link>
                </li>
              ))}
              {projects.length === 0 && <li className="py-6 text-center text-sm text-ink/40">Nessun progetto</li>}
            </ul>
          </Card>

          <Card title="Location per stato" action={<Link href="/locations" className="text-sm font-semibold text-berry hover:underline">Tutte →</Link>}>
            <div className="space-y-4">
              {STATUSES.map((s) => {
                const items = byStatus(s);
                if (!items.length) return null;
                return (
                  <div key={s}>
                    <div className="mb-2 flex items-center gap-2">
                      <Badge className={EFFECTIVE_STATUS_CLASSES[s]}>{EFFECTIVE_STATUS_LABELS[s]}</Badge>
                      <span className="text-xs text-ink/40">{items.length}</span>
                    </div>
                    <ul className="space-y-1">
                      {items.slice(0, 6).map((l) => (
                        <li key={l.id}>
                          <Link href={`/locations/${l.id}`} className="flex items-center justify-between rounded-lg px-3 py-1.5 text-sm hover:bg-tint">
                            <span className="font-medium text-ink">
                              {l.name}
                              {l.parent_name && <span className="ml-2 text-xs font-normal text-ink/40">in {l.parent_name}</span>}
                            </span>
                            <span className="text-xs text-ink/50">
                              {(l.smart_tags ?? []).slice(0, 2).map(tagLabel).join(", ")}
                            </span>
                          </Link>
                        </li>
                      ))}
                      {items.length > 6 && (
                        <li className="px-3 py-1 text-xs text-ink/40">e altre {items.length - 6}…</li>
                      )}
                    </ul>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <WorkingContextCard />

          <Card
            title="Ultime presentazioni"
            action={<Link href="/presentazioni" className="text-sm font-semibold text-berry hover:underline">Tutte →</Link>}
          >
            {exportsQ.isLoading ? (
              <Spinner label="Caricamento…" />
            ) : latestExports.length === 0 ? (
              <p className="py-4 text-center text-sm text-ink/40">
                Nessuna presentazione generata finora.
              </p>
            ) : (
              <ul className="divide-y divide-berry/5">
                {latestExports.map((job) => (
                  <li key={job.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink">{job.target_name || "—"}</p>
                      <p className="text-xs text-ink/50">
                        {EXPORT_KIND_LABELS[job.kind]} · {formatDateTime(job.created_at)}
                      </p>
                    </div>
                    {job.status === "done" && job.url ? (
                      <a
                        href={job.url}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 text-sm font-semibold text-berry hover:underline"
                      >
                        Apri ↗
                      </a>
                    ) : job.status === "failed" ? (
                      <Badge className="border-red-200 bg-red-100 text-red-700">Fallita</Badge>
                    ) : (
                      <Badge className="border-amber-200 bg-amber-100 text-amber-800">In corso…</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {/* Nuovo evento: prima scegli il progetto */}
      <Modal open={pickProjectOpen} onClose={() => setPickProjectOpen(false)} title="Nuovo evento — scegli il progetto">
        {projects.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-ink/60">Non ci sono ancora progetti: creane uno per aggiungere il primo evento.</p>
            <Link
              href="/projects?new=1"
              className="inline-flex items-center gap-2 rounded-full bg-berry px-5 py-2 text-sm font-semibold text-white shadow-sm transition duration-150 hover:bg-berry-dark"
              onClick={() => setPickProjectOpen(false)}
            >
              + Nuovo progetto
            </Link>
          </div>
        ) : (
          <div className="max-h-80 space-y-1.5 overflow-y-auto">
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-hairline bg-white px-4 py-3 text-left transition duration-150 hover:border-berry/30 hover:bg-berry/5"
                onClick={() => {
                  setPickProjectOpen(false);
                  router.push(`/projects/${p.id}?newEvent=1`);
                }}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">{p.name}</span>
                  <span className="block text-xs text-ink/50">
                    {p.client_name ?? "—"} · {p.events_count ?? 0} eventi
                  </span>
                </span>
                <Badge className={PROJECT_STATUS_CLASSES[p.status]}>{PROJECT_STATUS_LABELS[p.status]}</Badge>
              </button>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-hairline bg-white p-4 shadow-soft">
      <p className="text-2xl font-semibold tracking-tight text-berry">{value}</p>
      <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-ink/50">{label}</p>
    </div>
  );
}

function QuickAction({
  href,
  onClick,
  icon,
  title,
  hint,
}: {
  href?: string;
  onClick?: () => void;
  icon: string;
  title: string;
  hint: string;
}) {
  const inner = (
    <>
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-berry/10 text-xl text-berry transition duration-200 group-hover:bg-berry group-hover:text-white">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold tracking-tight text-ink">{title}</span>
        <span className="mt-0.5 block text-xs leading-snug text-ink/50">{hint}</span>
      </span>
    </>
  );
  const cls =
    "group flex w-full items-center gap-4 rounded-2xl border border-hairline bg-white/70 p-5 text-left shadow-soft backdrop-blur transition duration-200 hover:border-berry/30 hover:shadow-md";
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

/** "In lavorazione": il contesto di lavoro corrente (progetto/evento). */
function WorkingContextCard() {
  const { ctx, clearCtx } = useWorkContext();

  return (
    <Card title="In lavorazione">
      {ctx ? (
        <div className="flex items-start justify-between gap-3 rounded-xl bg-berry/[0.04] p-4 ring-1 ring-berry/25">
          <div className="min-w-0">
            <Link href={`/projects/${ctx.projectId}`} className="block truncate font-semibold text-berry hover:underline">
              📁 {ctx.projectName}
            </Link>
            {ctx.eventId && ctx.eventName && (
              <Link
                href={`/projects/${ctx.projectId}/events/${ctx.eventId}`}
                className="mt-0.5 block truncate text-sm font-medium text-ink/70 hover:text-berry hover:underline"
              >
                ↳ {ctx.eventName}
              </Link>
            )}
            <p className="mt-1.5 text-xs text-ink/45">
              &quot;Aggiungi a evento&quot; in Ricerca è preimpostato su questo contesto.
            </p>
          </div>
          <button
            type="button"
            onClick={clearCtx}
            className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold text-ink/45 transition duration-150 hover:bg-black/5 hover:text-ink"
          >
            Esci ✕
          </button>
        </div>
      ) : (
        <p className="py-2 text-sm text-ink/45">
          Nessun contesto attivo. Apri un progetto o un evento e premi{" "}
          <span className="font-semibold text-ink/60">&quot;Lavora su questo&quot;</span> per fissarlo qui e nella barra in alto.
        </p>
      )}
    </Card>
  );
}
