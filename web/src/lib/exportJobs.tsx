"use client";

// Export Slides non bloccante: il POST /export/slides risponde 202 {job_id}
// e la generazione gira in background. Questo context tiene la lista dei job
// avviati in questa sessione (persistita in sessionStorage, così un reload
// riprende il polling dei job non conclusi); il pannello flottante
// (ExportJobsPanel, montato in Shell) fa il polling di ciascun job.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import * as api from "@/lib/api";
import { getDriveAccessToken } from "@/lib/googleDrive";

const STORAGE_KEY = "venuescout:exportjobs";
/** I job più vecchi di 24h vengono scartati all'idratazione. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface TrackedExport {
  jobId: string;
  kind: api.SlidesExportKind;
  targetId: string;
  targetName?: string;
  /** Opzioni scelte nel modale: servono per "Riprova" sui job falliti. */
  include: api.SlidesExportInclude;
  startedAt: number;
}

interface ExportJobsApi {
  jobs: TrackedExport[];
  /** Apre (se serve) il popup Google, POSTa l'export e traccia il job. */
  startExport: (
    kind: api.SlidesExportKind,
    targetId: string,
    include: api.SlidesExportInclude,
    targetName?: string
  ) => Promise<void>;
  /** Rilancia un job fallito con le stesse opzioni (nuovo job_id). */
  retryExport: (jobId: string) => Promise<void>;
  dismiss: (jobId: string) => void;
}

const Ctx = createContext<ExportJobsApi>({
  jobs: [],
  startExport: async () => {},
  retryExport: async () => {},
  dismiss: () => {},
});

function readStored(): TrackedExport[] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter(
      (j): j is TrackedExport =>
        !!j &&
        typeof j === "object" &&
        typeof (j as TrackedExport).jobId === "string" &&
        typeof (j as TrackedExport).targetId === "string" &&
        typeof (j as TrackedExport).startedAt === "number" &&
        now - (j as TrackedExport).startedAt < MAX_AGE_MS
    );
  } catch {
    return [];
  }
}

export function ExportJobsProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<TrackedExport[]>([]);
  const hydrated = useRef(false);
  const jobsRef = useRef<TrackedExport[]>([]);
  jobsRef.current = jobs;

  // Idratazione lato client (sessionStorage non esiste in SSR).
  useEffect(() => {
    setJobs(readStored());
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
    } catch {
      // storage negato: il pannello resta valido solo in memoria
    }
  }, [jobs]);

  const startExport = useCallback<ExportJobsApi["startExport"]>(
    async (kind, targetId, include, targetName) => {
      const accessToken = await getDriveAccessToken();
      const { job_id } = await api.exportSlides(kind, targetId, include, accessToken);
      setJobs((prev) => [
        ...prev,
        { jobId: job_id, kind, targetId, targetName, include, startedAt: Date.now() },
      ]);
    },
    []
  );

  const retryExport = useCallback<ExportJobsApi["retryExport"]>(
    async (jobId) => {
      const tracked = jobsRef.current.find((j) => j.jobId === jobId);
      if (!tracked) return;
      const accessToken = await getDriveAccessToken();
      const { job_id } = await api.exportSlides(tracked.kind, tracked.targetId, tracked.include, accessToken);
      setJobs((prev) =>
        prev.map((j) =>
          j.jobId === jobId ? { ...j, jobId: job_id, startedAt: Date.now() } : j
        )
      );
    },
    []
  );

  const dismiss = useCallback((jobId: string) => {
    setJobs((prev) => prev.filter((j) => j.jobId !== jobId));
  }, []);

  return <Ctx.Provider value={{ jobs, startExport, retryExport, dismiss }}>{children}</Ctx.Provider>;
}

export function useExportJobs(): ExportJobsApi {
  return useContext(Ctx);
}
