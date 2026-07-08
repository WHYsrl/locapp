"use client";

// "Esporta in Google Slides": bottone + modale opzioni. Flusso non bloccante:
// 1) l'utente sceglie le sezioni da includere,
// 2) getDriveAccessToken() apre (se serve) il popup di consenso Google
//    con scope drive.file,
// 3) POST /export/slides risponde 202 {job_id}: il modale si chiude subito e
//    il job compare nel pannello flottante (ExportJobsPanel, montato in
//    Shell) che ne fa il polling — l'utente può continuare a navigare.
// I 401 del nostro backend sono gestiti da http() (redirect al login).

import { useState } from "react";
import * as api from "@/lib/api";
import { isDriveConfigured } from "@/lib/googleDrive";
import { useExportJobs } from "@/lib/exportJobs";
import { Modal, btnPrimary, btnSecondary } from "@/components/ui";

const INCLUDE_OPTIONS: readonly (readonly [keyof api.SlidesExportInclude, string])[] = [
  ["photos", "Foto"],
  ["capacities", "Capienze"],
  ["distances", "Distanze POI"],
  ["prices", "Prezzi"],
  ["ai_texts", "Testi AI"],
];

const DEFAULT_INCLUDE: api.SlidesExportInclude = {
  photos: true,
  capacities: true,
  distances: true,
  prices: false,
  ai_texts: true,
};

function SlidesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="8" y="9" width="8" height="6" rx="1" fill="currentColor" />
    </svg>
  );
}

export default function ExportSlidesButton({
  kind,
  id,
  name,
}: {
  kind: api.SlidesExportKind;
  id: string;
  /** Nome del target, mostrato subito nel pannello export (opzionale). */
  name?: string;
}) {
  const [open, setOpen] = useState(false);
  const [include, setInclude] = useState<api.SlidesExportInclude>(DEFAULT_INCLUDE);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { startExport } = useExportJobs();

  const configured = isDriveConfigured();

  const openModal = () => {
    setError(null);
    setStarting(false);
    setOpen(true);
  };

  const generate = async () => {
    setStarting(true);
    setError(null);
    try {
      await startExport(kind, id, include, name);
      // Il pannello flottante prende in carico il job: chiudi subito.
      setOpen(false);
    } catch (err) {
      if (err instanceof api.ApiError && err.code === "google_error") {
        setError("Errore lato Google durante l'avvio dell'esportazione.");
      } else if (err instanceof api.NetworkError) {
        setError("Impossibile raggiungere il server — riprova.");
      } else if (err instanceof Error && err.message) {
        setError(err.message);
      } else {
        setError("Errore durante l'esportazione. Riprova.");
      }
    } finally {
      setStarting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={btnSecondary}
        disabled={!configured}
        title={configured ? "Esporta in Google Slides" : "Configura NEXT_PUBLIC_GOOGLE_CLIENT_ID"}
        onClick={openModal}
      >
        <SlidesIcon />
        Esporta in Google Slides
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Esporta in Google Slides">
        <div className="space-y-4">
          <p className="text-sm text-ink/60">
            Scegli cosa includere nella presentazione. Verrà creata nel tuo Google Drive
            (ti verrà chiesta l&apos;autorizzazione la prima volta). La generazione avviene in
            background: puoi continuare a lavorare mentre il pannello in basso a destra ne
            segue l&apos;avanzamento.
          </p>
          <div className="space-y-2">
            {INCLUDE_OPTIONS.map(([key, label]) => (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-hairline bg-white px-3.5 py-2.5 text-sm font-medium text-ink transition duration-150 hover:border-berry/30"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-berry"
                  checked={include[key]}
                  onChange={(e) => setInclude((prev) => ({ ...prev, [key]: e.target.checked }))}
                />
                {label}
              </label>
            ))}
          </div>
          {error && <p className="text-sm font-medium text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={btnSecondary} onClick={() => setOpen(false)}>
              Annulla
            </button>
            <button type="button" className={btnPrimary} disabled={starting} onClick={generate}>
              {starting ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Avvio…
                </>
              ) : (
                "Genera presentazione"
              )}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
