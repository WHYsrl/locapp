"use client";

// Pannello flottante (bottom-right, glass) con gli export Slides in corso.
// Montato in Shell: sopravvive alla navigazione tra le pagine; ogni riga fa
// polling del proprio job ogni 2.5s finché done/failed. Verde con link
// "Apri presentazione" a fine lavoro, rosso con errore e "Riprova" se fallito.

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { useExportJobs, type TrackedExport } from "@/lib/exportJobs";

const KIND_LABELS: Record<api.SlidesExportKind, string> = {
  location: "Location",
  event: "Evento",
  project: "Progetto",
};

/** Messaggi user-facing per i warning del backend. */
const WARNING_LABELS: Record<string, string> = {
  ai_unavailable: "Testi AI non disponibili: usati testi standard",
  photos_unavailable: "Alcune foto non erano disponibili e sono state omesse",
};

export function warningLabel(code: string): string {
  return WARNING_LABELS[code] ?? code;
}

function JobRow({ job }: { job: TrackedExport }) {
  const qc = useQueryClient();
  const { retryExport, dismiss } = useExportJobs();
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const { data, isError } = useQuery({
    queryKey: ["export-job", job.jobId],
    queryFn: () => api.getExportJob(job.jobId),
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === "done" || s === "failed" ? false : 2500;
    },
  });

  const status: api.ExportJobStatus = data?.status ?? "pending";
  const name = data?.target_name || job.targetName || "Presentazione";

  // A fine lavoro aggiorna il repository /presentazioni e la dashboard.
  const prevStatus = useRef<api.ExportJobStatus | null>(null);
  useEffect(() => {
    if ((status === "done" || status === "failed") && prevStatus.current !== status) {
      qc.invalidateQueries({ queryKey: ["export-jobs"] });
    }
    prevStatus.current = status;
  }, [status, qc]);

  const tone =
    status === "done"
      ? "border-emerald-200 bg-emerald-50/90"
      : status === "failed"
        ? "border-red-200 bg-red-50/90"
        : "border-hairline bg-white/80";

  return (
    <div className={`pointer-events-auto rounded-2xl border p-3.5 shadow-glass backdrop-blur-xl ${tone}`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0">
          {status === "done" ? (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-bold text-white">✓</span>
          ) : status === "failed" ? (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[11px] font-bold text-white">✕</span>
          ) : (
            <span className="block h-5 w-5 animate-spin rounded-full border-2 border-berry/25 border-t-berry" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink" title={name}>
            {name}
          </p>
          <p className="text-xs text-ink/50">
            {KIND_LABELS[job.kind]} ·{" "}
            {status === "done"
              ? "Presentazione pronta"
              : status === "failed"
                ? "Esportazione fallita"
                : status === "processing"
                  ? "Generazione in corso…"
                  : isError
                    ? "In attesa del server…"
                    : "In coda…"}
          </p>

          {status === "done" && data?.url && (
            <a
              href={data.url}
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:underline"
            >
              Apri presentazione ↗
            </a>
          )}
          {status === "done" && (data?.warnings?.length ?? 0) > 0 && (
            <ul className="mt-1 space-y-0.5 text-[11px] leading-snug text-yellow-800">
              {(data?.warnings ?? []).map((w) => (
                <li key={w}>{warningLabel(w)}</li>
              ))}
            </ul>
          )}

          {status === "failed" && (
            <div className="mt-1.5 space-y-1.5">
              <p className="text-xs leading-snug text-red-600">{data?.error ?? "Errore durante l'esportazione."}</p>
              {retryError && <p className="text-xs leading-snug text-red-600">{retryError}</p>}
              <button
                type="button"
                disabled={retrying}
                className="rounded-full border border-red-300 bg-white px-3 py-1 text-xs font-semibold text-red-700 transition duration-150 hover:bg-red-100 disabled:opacity-50"
                onClick={async () => {
                  setRetrying(true);
                  setRetryError(null);
                  try {
                    await retryExport(job.jobId);
                  } catch (err) {
                    setRetryError(err instanceof Error && err.message ? err.message : "Nuovo tentativo non riuscito.");
                  } finally {
                    setRetrying(false);
                  }
                }}
              >
                {retrying ? "Nuovo tentativo…" : "Riprova"}
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => dismiss(job.jobId)}
          className="shrink-0 rounded-full p-1 text-ink/35 transition duration-150 hover:bg-black/5 hover:text-ink"
          aria-label="Nascondi"
          title="Nascondi"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export default function ExportJobsPanel() {
  const { jobs } = useExportJobs();
  if (jobs.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {jobs.map((job) => (
        <JobRow key={job.jobId} job={job} />
      ))}
    </div>
  );
}
