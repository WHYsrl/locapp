"use client";

// Repository delle presentazioni: tutti i job di export Slides (in corso e
// conclusi), con filtri per tipo e ricerca sul nome del target. La lista si
// auto-aggiorna finché ci sono job pending/processing.

import Link from "next/link";
import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { Badge, Card, EmptyState, PageHeader, SegmentedControl, Spinner, inputCls } from "@/components/ui";
import { warningLabel } from "@/components/ExportJobsPanel";
import { formatDateTime } from "@/lib/labels";

const PER_PAGE = 20;

type KindFilter = "" | api.SlidesExportKind;

const KIND_LABELS: Record<api.SlidesExportKind, string> = {
  location: "Location",
  event: "Evento",
  project: "Progetto",
};

const KIND_CLASSES: Record<api.SlidesExportKind, string> = {
  location: "bg-sky-100 text-sky-800 border-sky-200",
  event: "bg-violet-100 text-violet-800 border-violet-200",
  project: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

function targetHref(job: api.ExportJob): string {
  switch (job.kind) {
    case "location":
      return `/locations/${job.target_id}`;
    case "project":
      return `/projects/${job.target_id}`;
    case "event":
      // /events/[id] risolve il progetto e reindirizza alla shortlist.
      return `/events/${job.target_id}`;
  }
}

function StatusBadge({ job }: { job: api.ExportJob }) {
  switch (job.status) {
    case "pending":
      return (
        <Badge className="border-gray-200 bg-gray-100 text-gray-700">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gray-500" />
          In coda
        </Badge>
      );
    case "processing":
      return (
        <Badge className="border-amber-200 bg-amber-100 text-amber-800">
          <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-amber-400/40 border-t-amber-700" />
          In lavorazione
        </Badge>
      );
    case "done":
      return <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800">✓ Pronta</Badge>;
    case "failed":
      return (
        <span title={job.error ?? "Errore durante l'esportazione"} className="cursor-help">
          <Badge className="border-red-200 bg-red-100 text-red-700">✕ Fallita</Badge>
        </span>
      );
  }
}

export default function PresentazioniPage() {
  const [kind, setKind] = useState<KindFilter>("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  // Debounce della ricerca (350ms) + reset pagina su cambio filtro.
  useEffect(() => {
    const t = window.setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(t);
  }, [search]);

  const jobsQ = useQuery({
    queryKey: ["export-jobs", { kind, q, page }],
    queryFn: () => api.listExportJobs({ kind, q: q || undefined, page, per_page: PER_PAGE }),
    placeholderData: keepPreviousData,
    // Auto-refresh finché ci sono job non conclusi in pagina.
    refetchInterval: (query) =>
      query.state.data?.data.some((j) => j.status === "pending" || j.status === "processing")
        ? 4000
        : false,
  });

  const jobs = jobsQ.data?.data ?? [];
  const total = jobsQ.data?.meta.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div>
      <PageHeader
        title="Presentazioni"
        subtitle="Tutte le presentazioni Google Slides generate: in corso, pronte e fallite."
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl<KindFilter>
            value={kind}
            onChange={(v) => {
              setKind(v);
              setPage(1);
            }}
            options={[
              ["", "Tutte"],
              ["location", "Location"],
              ["event", "Eventi"],
              ["project", "Progetti"],
            ]}
          />
          <input
            className={`${inputCls} max-w-xs`}
            placeholder="Cerca per nome…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {total > 0 && (
            <span className="ml-auto text-xs font-medium text-ink/45">{total} presentazioni</span>
          )}
        </div>
      </Card>

      {jobsQ.isLoading ? (
        <Spinner />
      ) : jobsQ.isError ? (
        <p className="text-sm text-red-600">Errore nel caricamento delle presentazioni. Riprova.</p>
      ) : jobs.length === 0 ? (
        <EmptyState
          title="Nessuna presentazione"
          hint='Genera la prima con "Esporta in Google Slides" da una location, un evento o un progetto.'
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-hairline bg-white shadow-soft">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs font-semibold uppercase tracking-wide text-ink/45">
                <th className="px-5 py-3">Nome</th>
                <th className="px-3 py-3">Tipo</th>
                <th className="px-3 py-3">Stato</th>
                <th className="px-3 py-3">Creata</th>
                <th className="px-5 py-3 text-right">Presentazione</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-berry/5">
              {jobs.map((job) => (
                <tr key={job.id} className="transition duration-150 hover:bg-tint/60">
                  <td className="px-5 py-3">
                    <Link
                      href={targetHref(job)}
                      className="font-semibold text-berry hover:underline"
                      title={`Apri ${KIND_LABELS[job.kind].toLowerCase()} in VenueScout`}
                    >
                      {job.target_name || "—"}
                    </Link>
                    {job.status === "done" && job.warnings.length > 0 && (
                      <span
                        className="ml-2 cursor-help text-xs text-yellow-700"
                        title={job.warnings.map(warningLabel).join("\n")}
                      >
                        ⚠ {job.warnings.length}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <Badge className={KIND_CLASSES[job.kind]}>{KIND_LABELS[job.kind]}</Badge>
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge job={job} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-ink/60">{formatDateTime(job.created_at)}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-right">
                    {job.status === "done" && job.url ? (
                      <a
                        href={job.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-berry hover:underline"
                      >
                        Apri ↗
                      </a>
                    ) : (
                      <span className="text-ink/30">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            className="rounded-full border border-hairline bg-white px-4 py-1.5 text-sm font-semibold text-berry shadow-sm transition duration-150 hover:bg-berry/5 disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ← Precedente
          </button>
          <span className="text-sm text-ink/55">
            Pagina {page} di {totalPages}
          </span>
          <button
            className="rounded-full border border-hairline bg-white px-4 py-1.5 text-sm font-semibold text-berry shadow-sm transition duration-150 hover:bg-berry/5 disabled:opacity-40"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Successiva →
          </button>
        </div>
      )}
    </div>
  );
}
