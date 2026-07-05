"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { Badge, Card, PageHeader, Spinner, btnPrimary, btnSecondary, inputCls, labelCls } from "@/components/ui";
import type { ExtractedDraft, IngestSourceType } from "@/lib/types";

type Mode = "url" | "testo" | "file";

interface DraftRow {
  path: string;
  label: string;
  value: string;
  source?: string;
}

function flatten(obj: unknown, prefix: string, rows: DraftRow[], sources: Record<string, string>) {
  if (obj == null) return;
  if (Array.isArray(obj)) {
    rows.push({ path: prefix, label: prefix, value: obj.join(", "), source: sources[prefix] });
    return;
  }
  if (typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      flatten(v, prefix ? `${prefix}.${k}` : k, rows, sources);
    }
    return;
  }
  rows.push({ path: prefix, label: prefix, value: String(obj), source: sources[prefix] });
}

function draftRows(draft: ExtractedDraft): { locationRows: DraftRow[]; itemGroups: { key: string; title: string; items: { path: string; label: string }[] }[] } {
  const sources = draft.field_sources ?? {};
  const locationRows: DraftRow[] = [];
  flatten(draft.location ?? {}, "location", locationRows, sources);

  const itemGroups = [
    {
      key: "spaces",
      title: "Spazi",
      items: (draft.spaces ?? []).map((s, i) => ({
        path: `spaces.${i}`,
        label: `${s.name}${s.area_sqm ? ` · ${s.area_sqm} mq` : ""}${
          s.capacities ? ` · ${Object.entries(s.capacities).map(([c, n]) => `${c.replaceAll("_", " ")}: ${n}`).join(", ")}` : ""
        }`,
      })),
    },
    {
      key: "contacts",
      title: "Referenti",
      items: (draft.contacts ?? []).map((c, i) => ({
        path: `contacts.${i}`,
        label: `${c.first_name ?? ""} ${c.last_name ?? ""} — ${c.role ?? "referente"}${c.phone ? ` · ${c.phone}` : ""}${c.email ? ` · ${c.email}` : ""}`,
      })),
    },
    {
      key: "suppliers",
      title: "Fornitori",
      items: (draft.suppliers ?? []).map((s, i) => ({
        path: `suppliers.${i}`,
        label: `${s.company_name} — ${s.category ?? ""} (${s.requirement ?? "consigliato"})`,
      })),
    },
    {
      key: "price_items",
      title: "Voci di listino",
      items: (draft.price_items ?? []).map((p, i) => ({
        path: `price_items.${i}`,
        label: `${p.voce} — ${p.prezzo} € ${p.unita ?? ""}`,
      })),
    },
  ].filter((g) => g.items.length > 0);

  return { locationRows, itemGroups };
}

export default function IngestPage() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileText, setFileText] = useState<string | null>(null);
  const [fileType, setFileType] = useState<IngestSourceType>("pdf");
  const [targetLocation, setTargetLocation] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [accept, setAccept] = useState<Record<string, boolean>>({});
  const [appliedLocationId, setAppliedLocationId] = useState<string | null>(null);

  const { data: locations } = useQuery({ queryKey: ["locations", "all"], queryFn: () => api.listLocations() });

  const createJob = useMutation({
    mutationFn: () => {
      if (mode === "url") return api.createIngestJob({ source_type: "url", url, location_id: targetLocation || null });
      if (mode === "testo") return api.createIngestJob({ source_type: "testo", text, location_id: targetLocation || null });
      return api.createIngestJob({ source_type: fileType, text: fileText ?? undefined, location_id: targetLocation || null });
    },
    onSuccess: (job) => {
      setJobId(job.id);
      setAccept({});
      setAppliedLocationId(null);
    },
  });

  const jobQ = useQuery({
    queryKey: ["ingest-job", jobId],
    queryFn: () => api.getIngestJob(jobId!),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === "pending" || s === "processing" ? 1500 : false;
    },
  });

  const job = jobQ.data;
  const draft = job?.status === "ready" ? job.extracted : null;

  const parsed = useMemo(() => (draft ? draftRows(draft) : null), [draft]);

  // default: everything accepted
  useEffect(() => {
    if (!parsed) return;
    setAccept((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      const next: Record<string, boolean> = {};
      parsed.locationRows.forEach((r) => (next[r.path] = true));
      parsed.itemGroups.forEach((g) => g.items.forEach((it) => (next[it.path] = true)));
      return next;
    });
  }, [parsed]);

  const applyJob = useMutation({
    mutationFn: () => api.applyIngestJob(jobId!, accept),
    onSuccess: (res) => {
      setAppliedLocationId(res.location_id);
      qc.invalidateQueries({ queryKey: ["locations"] });
      qc.invalidateQueries({ queryKey: ["ingest-job", jobId] });
    },
  });

  const canSubmit =
    (mode === "url" && url.trim().length > 5) ||
    (mode === "testo" && text.trim().length > 10) ||
    (mode === "file" && fileName !== "");

  const reset = () => {
    setJobId(null);
    setAccept({});
    setAppliedLocationId(null);
    createJob.reset();
    applyJob.reset();
  };

  return (
    <div>
      <PageHeader
        title="Acquisizione AI"
        subtitle="Incolla un link o un testo, oppure carica un file: l'AI estrae una bozza di scheda location da revisionare campo per campo."
      />

      {!jobId && (
        <Card>
          <div className="mb-4 flex gap-2">
            {(
              [
                ["url", "URL"],
                ["testo", "Testo"],
                ["file", "File"],
              ] as [Mode, string][]
            ).map(([m, label]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  mode === m ? "bg-berry text-white" : "bg-tint text-ink/60 hover:text-berry"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {mode === "url" && (
              <div>
                <label className={labelCls}>URL della pagina (sito della location, annuncio, articolo)</label>
                <input className={inputCls} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
              </div>
            )}
            {mode === "testo" && (
              <div>
                <label className={labelCls}>Testo libero (appunti, email, trascrizione sopralluogo)</label>
                <textarea
                  className={inputCls}
                  rows={8}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Incolla qui appunti o testo descrittivo della location…"
                />
              </div>
            )}
            {mode === "file" && (
              <div>
                <label className={labelCls}>File (PDF, PPTX, DOCX, immagine, audio)</label>
                <input
                  type="file"
                  className="block w-full text-sm text-ink/60 file:mr-4 file:rounded-lg file:border-0 file:bg-berry file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-berry-dark"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setFileName(f.name);
                    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
                    const type: IngestSourceType =
                      ext === "pdf" ? "pdf"
                        : ext === "pptx" ? "pptx"
                        : ext === "docx" ? "docx"
                        : ["png", "jpg", "jpeg", "webp"].includes(ext) ? "immagine"
                        : ["mp3", "m4a", "wav"].includes(ext) ? "audio"
                        : "testo";
                    setFileType(type);
                    if (f.type.startsWith("text/") || type === "testo") {
                      setFileText(await f.text());
                    } else {
                      setFileText(null);
                    }
                  }}
                />
                {fileName && <p className="mt-2 text-xs text-ink/50">Selezionato: {fileName}</p>}
              </div>
            )}

            <div>
              <label className={labelCls}>Location di destinazione (opzionale)</label>
              <select className={inputCls} value={targetLocation} onChange={(e) => setTargetLocation(e.target.value)}>
                <option value="">— Crea nuova location dalla bozza —</option>
                {(locations ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    Integra in: {l.name}
                  </option>
                ))}
              </select>
            </div>

            {createJob.isError && <p className="text-sm text-red-600">Errore nella creazione del job. Riprova.</p>}
            <button className={btnPrimary} disabled={!canSubmit || createJob.isPending} onClick={() => createJob.mutate()}>
              {createJob.isPending ? "Invio…" : "Avvia estrazione AI"}
            </button>
          </div>
        </Card>
      )}

      {jobId && job && (job.status === "pending" || job.status === "processing") && (
        <Card>
          <div className="py-8 text-center">
            <Spinner label="" />
            <p className="text-sm font-semibold text-ink">
              {job.status === "pending" ? "Job in coda…" : "Estrazione in corso…"}
            </p>
            <p className="mt-1 text-xs text-ink/50">L&apos;AI sta analizzando la fonte e componendo la bozza.</p>
          </div>
        </Card>
      )}

      {jobId && job?.status === "failed" && (
        <Card>
          <p className="text-sm text-red-700">Estrazione fallita: {job.error ?? "errore sconosciuto"}</p>
          <button className={`${btnSecondary} mt-4`} onClick={reset}>
            Riprova
          </button>
        </Card>
      )}

      {draft && parsed && !appliedLocationId && (
        <div className="space-y-6">
          <Card
            title="Bozza estratta"
            action={
              <div className="flex items-center gap-2">
                <Badge className="bg-gold/15 text-yellow-800 border-gold/30">
                  confidenza {Math.round((draft.confidence ?? 0) * 100)}%
                </Badge>
                <button className={btnSecondary} onClick={reset}>
                  Annulla
                </button>
              </div>
            }
          >
            <p className="mb-4 text-sm text-ink/60">
              Seleziona i campi da applicare alla scheda. Nulla viene scritto senza la tua conferma.
            </p>
            <div className="overflow-hidden rounded-lg border border-berry/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-berry/10 bg-tint/60 text-left text-xs font-semibold uppercase tracking-wide text-ink/50">
                    <th className="w-10 px-3 py-2" />
                    <th className="px-3 py-2">Campo</th>
                    <th className="px-3 py-2">Valore estratto</th>
                    <th className="px-3 py-2">Fonte</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-berry/5">
                  {parsed.locationRows.map((r) => (
                    <tr key={r.path} className={accept[r.path] ? "" : "opacity-45"}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={accept[r.path] ?? false}
                          onChange={(e) => setAccept((a) => ({ ...a, [r.path]: e.target.checked }))}
                          className="h-4 w-4 accent-[#6d2e46]"
                        />
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-ink/60">{r.path.replace(/^location\./, "")}</td>
                      <td className="px-3 py-2 text-ink">{r.value}</td>
                      <td className="px-3 py-2 text-xs text-ink/40">{r.source ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {parsed.itemGroups.map((g) => (
            <Card key={g.key} title={g.title}>
              <ul className="space-y-2">
                {g.items.map((it) => (
                  <li key={it.path} className={`flex items-start gap-3 rounded-lg bg-tint/50 px-3 py-2.5 text-sm ${accept[it.path] ? "" : "opacity-45"}`}>
                    <input
                      type="checkbox"
                      checked={accept[it.path] ?? false}
                      onChange={(e) => setAccept((a) => ({ ...a, [it.path]: e.target.checked }))}
                      className="mt-0.5 h-4 w-4 accent-[#6d2e46]"
                    />
                    <span className="text-ink/80">{it.label}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}

          {(draft.open_questions ?? []).length > 0 && (
            <Card title="Domande aperte">
              <ul className="list-inside list-disc space-y-1 text-sm text-yellow-800">
                {draft.open_questions!.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </Card>
          )}

          {applyJob.isError && <p className="text-sm text-red-600">Errore durante l&apos;applicazione della bozza.</p>}
          <div className="flex items-center gap-3">
            <button className={btnPrimary} disabled={applyJob.isPending} onClick={() => applyJob.mutate()}>
              {applyJob.isPending ? "Applicazione…" : "Applica campi selezionati"}
            </button>
            <span className="text-xs text-ink/50">
              {Object.values(accept).filter(Boolean).length} elementi selezionati
            </span>
          </div>
        </div>
      )}

      {appliedLocationId && (
        <Card>
          <div className="py-6 text-center">
            <p className="text-lg font-bold text-emerald-700">Bozza applicata ✓</p>
            <p className="mt-1 text-sm text-ink/60">I campi selezionati sono stati scritti sulla scheda location.</p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <Link href={`/locations/${appliedLocationId}`} className={btnPrimary}>
                Apri la scheda
              </Link>
              <button className={btnSecondary} onClick={reset}>
                Nuova acquisizione
              </button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
