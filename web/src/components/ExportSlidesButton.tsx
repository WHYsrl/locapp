"use client";

// "Esporta in Google Slides": bottone + modale opzioni. Flusso:
// 1) l'utente sceglie le sezioni da includere,
// 2) getDriveAccessToken() apre (se serve) il popup di consenso Google
//    con scope drive.file,
// 3) POST /export/slides con il token → link alla presentazione creata.
// I 401 del nostro backend sono gestiti da http() (redirect al login).

import { useState } from "react";
import * as api from "@/lib/api";
import { getDriveAccessToken, isDriveConfigured } from "@/lib/googleDrive";
import { Modal, btnPrimary, btnSecondary } from "@/components/ui";

/** Messaggi user-facing per i warning del backend. */
const WARNING_LABELS: Record<string, string> = {
  ai_unavailable: "Testi AI non disponibili: usati testi standard",
  photos_unavailable: "Alcune foto non erano disponibili e sono state omesse",
};

function warningLabel(code: string): string {
  return WARNING_LABELS[code] ?? code;
}

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

type Phase = "options" | "working" | "done" | "error";

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
}: {
  kind: api.SlidesExportKind;
  id: string;
}) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("options");
  const [include, setInclude] = useState<api.SlidesExportInclude>(DEFAULT_INCLUDE);
  const [result, setResult] = useState<api.SlidesExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const configured = isDriveConfigured();

  const openModal = () => {
    setPhase("options");
    setResult(null);
    setError(null);
    setOpen(true);
  };

  const generate = async () => {
    setPhase("working");
    setError(null);
    try {
      const accessToken = await getDriveAccessToken();
      const res = await api.exportSlides(kind, id, include, accessToken);
      setResult(res);
      setPhase("done");
      // Apri subito la presentazione (il link resta comunque nel modale).
      window.open(res.url, "_blank", "noopener");
    } catch (err) {
      if (err instanceof api.ApiError && err.code === "google_error") {
        setError("Errore lato Google durante la creazione della presentazione.");
      } else if (err instanceof api.NetworkError) {
        setError("Impossibile raggiungere il server — riprova.");
      } else if (err instanceof Error && err.message) {
        setError(err.message);
      } else {
        setError("Errore durante l'esportazione. Riprova.");
      }
      setPhase("error");
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
        {phase === "options" && (
          <div className="space-y-4">
            <p className="text-sm text-ink/60">
              Scegli cosa includere nella presentazione. Verrà creata nel tuo Google Drive
              (ti verrà chiesta l&apos;autorizzazione la prima volta).
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
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className={btnSecondary} onClick={() => setOpen(false)}>
                Annulla
              </button>
              <button type="button" className={btnPrimary} onClick={generate}>
                Genera presentazione
              </button>
            </div>
          </div>
        )}

        {phase === "working" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-berry/25 border-t-berry" />
            <p className="text-sm font-medium text-ink/70">Generazione in corso… può richiedere ~30s</p>
          </div>
        )}

        {phase === "done" && result && (
          <div className="space-y-4 py-2 text-center">
            <p className="text-sm text-ink/60">Presentazione creata nel tuo Google Drive.</p>
            <a
              href={result.url}
              target="_blank"
              rel="noreferrer"
              className={`${btnPrimary} justify-center px-6 py-3 text-base`}
            >
              Apri la presentazione ↗
            </a>
            {result.warnings.length > 0 && (
              <ul className="space-y-1 rounded-xl bg-gold/15 px-4 py-3 text-left text-sm text-yellow-800">
                {result.warnings.map((w) => (
                  <li key={w}>{warningLabel(w)}</li>
                ))}
              </ul>
            )}
            <div>
              <button type="button" className={btnSecondary} onClick={() => setOpen(false)}>
                Chiudi
              </button>
            </div>
          </div>
        )}

        {phase === "error" && (
          <div className="space-y-4 py-2">
            <p className="text-sm font-medium text-red-600">{error}</p>
            <div className="flex justify-end gap-2">
              <button type="button" className={btnSecondary} onClick={() => setOpen(false)}>
                Annulla
              </button>
              <button type="button" className={btnPrimary} onClick={generate}>
                Riprova
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
