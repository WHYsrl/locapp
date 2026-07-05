"use client";

// Live voice dictation via the Web Speech API (it-IT, continuous, interim
// results). Feature-detected at runtime: on browsers without support
// (Firefox/Safari) a clear notice with fallback to the "Testo" tab is shown.

import { useCallback, useEffect, useRef, useState } from "react";
import { btnPrimary, btnSecondary, inputCls } from "./ui";

// Minimal typings for SpeechRecognition (not part of the standard TS DOM lib).
interface SRAlternative {
  transcript: string;
}
interface SRResult {
  isFinal: boolean;
  0: SRAlternative;
  length: number;
}
interface SRResultList {
  length: number;
  [index: number]: SRResult;
}
interface SREvent {
  resultIndex: number;
  results: SRResultList;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SREvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SRConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SRConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SRConstructor;
    webkitSpeechRecognition?: SRConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export default function VoiceDictation({
  value,
  onChange,
  onFallbackToText,
}: {
  /** Final transcript (editable by the user after stopping). */
  value: string;
  onChange: (text: string) => void;
  /** Called when the user opts to switch to the "Testo" tab on unsupported browsers. */
  onFallbackToText: () => void;
}) {
  // null = not yet detected (avoids SSR/hydration mismatch)
  const [supported, setSupported] = useState<boolean | null>(null);
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const recordingRef = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    setSupported(getSpeechRecognition() !== null);
    return () => {
      recordingRef.current = false;
      recRef.current?.abort();
      recRef.current = null;
    };
  }, []);

  const stop = useCallback(() => {
    recordingRef.current = false;
    setRecording(false);
    setInterim("");
    recRef.current?.stop();
    recRef.current = null;
  }, []);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) return;
    setError(null);
    const rec = new Ctor();
    rec.lang = "it-IT";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (event) => {
      let finalChunk = "";
      let interimChunk = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const transcript = res[0]?.transcript ?? "";
        if (res.isFinal) finalChunk += transcript;
        else interimChunk += transcript;
      }
      if (finalChunk) {
        const base = valueRef.current;
        const sep = base && !base.endsWith(" ") && !base.endsWith("\n") ? " " : "";
        onChange(base + sep + finalChunk.trim());
      }
      setInterim(interimChunk);
    };
    rec.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("Accesso al microfono negato: consenti l'uso del microfono al browser e riprova.");
      } else if (event.error !== "aborted" && event.error !== "no-speech") {
        setError("Errore durante la dettatura. Riprova.");
      }
    };
    rec.onend = () => {
      // Chrome stops the session periodically: restart while recording.
      if (recordingRef.current && recRef.current === rec) {
        try {
          rec.start();
        } catch {
          recordingRef.current = false;
          setRecording(false);
          setInterim("");
        }
      }
    };
    recRef.current = rec;
    recordingRef.current = true;
    setRecording(true);
    try {
      rec.start();
    } catch {
      recordingRef.current = false;
      setRecording(false);
      setError("Impossibile avviare la dettatura.");
    }
  }, [onChange]);

  if (supported === null) {
    return <p className="text-sm text-ink/40">Verifica del supporto alla dettatura…</p>;
  }

  if (!supported) {
    return (
      <div className="rounded-lg border border-gold/40 bg-gold/10 px-4 py-4">
        <p className="text-sm font-semibold text-ink">La dettatura è supportata su Chrome/Edge.</p>
        <p className="mt-1 text-sm text-ink/60">
          Questo browser non supporta il riconoscimento vocale (Web Speech API). Puoi comunque incollare o
          digitare gli appunti nella modalità testo.
        </p>
        <button type="button" className={`${btnSecondary} mt-3`} onClick={onFallbackToText}>
          Passa alla modalità testo
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {!recording ? (
          <button type="button" className={btnPrimary} onClick={start}>
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" aria-hidden />
            {value.trim() ? "Riprendi registrazione" : "Avvia registrazione"}
          </button>
        ) : (
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
            onClick={stop}
          >
            <span className="relative flex h-2.5 w-2.5" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
            </span>
            Ferma registrazione
          </button>
        )}
        {recording && (
          <span className="text-sm font-medium text-red-600">
            Sto ascoltando… parla pure, la trascrizione appare in tempo reale.
          </span>
        )}
        {!recording && value.trim() && (
          <button type="button" className={btnSecondary} onClick={() => onChange("")}>
            Svuota trascrizione
          </button>
        )}
      </div>

      {recording ? (
        <div
          className="min-h-40 w-full whitespace-pre-wrap rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-ink shadow-[0_0_0_3px_rgba(220,38,38,0.08)]"
          aria-live="polite"
        >
          {value}
          {interim && <span className="text-ink/35 italic">{value ? " " : ""}{interim}</span>}
          {!value && !interim && <span className="text-ink/35">La trascrizione apparirà qui…</span>}
        </div>
      ) : (
        <textarea
          className={inputCls}
          rows={8}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Detta gli appunti del sopralluogo, poi rivedi e correggi il testo prima di inviarlo all'AI…"
        />
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!recording && value.trim().length > 0 && (
        <p className="text-xs text-ink/50">
          Rivedi e correggi la trascrizione, poi avvia l&apos;estrazione: verrà elaborata come testo.
        </p>
      )}
    </div>
  );
}
