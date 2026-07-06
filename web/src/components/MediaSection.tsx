"use client";

// "Media e planimetrie" section for the location detail page.
// Upload (drag&drop + picker → POST /locations/:id/media → PUT presigned URL),
// catalog with kind/category filters, photo grid + lightbox, video cards,
// document rows with recatalog/download/delete.

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { ApiError } from "@/lib/api";
import CollapsibleSection from "./CollapsibleSection";
import { Badge, btnPrimary, btnSecondary } from "./ui";
import {
  MEDIA_CATEGORIES,
  MEDIA_CATEGORY_LABELS,
  MEDIA_KINDS,
  MEDIA_KIND_ICONS,
  MEDIA_KIND_LABELS,
} from "@/lib/labels";
import type { Media, MediaCategory, MediaKind } from "@/lib/types";

/** Presigned GET URLs last ~1h on the backend: cache them for 30 min. */
const MEDIA_URL_STALE_MS = 30 * 60 * 1000;

const STORAGE_BANNER =
  "Storage media non configurato — imposta le variabili S3_* su Render (vedi README).";

const selectSm =
  "rounded-lg border border-rose/30 bg-white px-2 py-1 text-xs text-ink outline-none transition focus:border-berry focus:ring-2 focus:ring-berry/15";

function useMediaUrl(id: string, onStorageError?: (err: unknown) => void) {
  const q = useQuery({
    queryKey: ["media-url", id],
    queryFn: () => api.getMediaUrl(id),
    staleTime: MEDIA_URL_STALE_MS,
    gcTime: MEDIA_URL_STALE_MS,
    retry: 1,
  });
  const { error } = q;
  useEffect(() => {
    if (error && onStorageError) onStorageError(error);
  }, [error, onStorageError]);
  return q;
}

/** Auto-suggest the media kind from mime type + filename. */
function suggestKind(file: File): MediaKind {
  const mime = file.type.toLowerCase();
  if (mime.startsWith("image/")) return "foto";
  if (mime.startsWith("video/")) return "video";
  if (mime === "application/pdf" && file.name.toLowerCase().includes("plan")) return "planimetria";
  return "documento";
}

function isStorageNotConfigured(err: unknown): boolean {
  return err instanceof ApiError && (err.code === "storage_not_configured" || err.status === 503);
}

type PendingStatus = "pronto" | "in_caricamento" | "caricato" | "errore";

interface PendingFile {
  id: string;
  file: File;
  kind: MediaKind;
  category: MediaCategory | "";
  status: PendingStatus;
  error?: string;
}

let pendingSeq = 0;

export default function MediaSection({ locationId, media }: { locationId: string; media: Media[] }) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const [pending, setPending] = useState<PendingFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [storageMissing, setStorageMissing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [kindFilter, setKindFilter] = useState<MediaKind | "all">("all");
  const [catFilter, setCatFilter] = useState<MediaCategory | "all">("all");
  const [lightbox, setLightbox] = useState<number | null>(null);

  // ---- upload -------------------------------------------------------------

  const addFiles = (list: FileList | File[]) => {
    const items = Array.from(list).map<PendingFile>((file) => ({
      id: `pf-${++pendingSeq}`,
      file,
      kind: suggestKind(file),
      category: "",
      status: "pronto",
    }));
    if (items.length > 0) setPending((prev) => [...prev, ...items]);
  };

  const setFileState = (id: string, patch: Partial<PendingFile>) =>
    setPending((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const uploadAll = async () => {
    const queue = pending.filter((p) => p.status === "pronto" || p.status === "errore");
    if (queue.length === 0) return;
    setUploading(true);
    setActionError(null);
    let uploadedSome = false;

    for (const pf of queue) {
      setFileState(pf.id, { status: "in_caricamento", error: undefined });
      try {
        const mime = pf.file.type || "application/octet-stream";
        const created = await api.createLocationMedia(locationId, {
          kind: pf.kind,
          category: pf.category || null,
          filename: pf.file.name,
          mime,
        });
        await api.uploadToPresignedUrl(created.upload_url, pf.file, mime);
        setFileState(pf.id, { status: "caricato" });
        uploadedSome = true;
      } catch (err) {
        if (isStorageNotConfigured(err)) {
          setStorageMissing(true);
          setFileState(pf.id, { status: "errore", error: "Storage non configurato" });
          break; // no point retrying the rest of the queue
        }
        setFileState(pf.id, {
          status: "errore",
          error: err instanceof Error ? err.message : "Errore di caricamento",
        });
      }
    }

    if (uploadedSome) {
      qc.invalidateQueries({ queryKey: ["location", locationId] });
      // keep the green check visible for a beat, then clear completed rows
      setTimeout(() => setPending((prev) => prev.filter((p) => p.status !== "caricato")), 1500);
    }
    setUploading(false);
  };

  // ---- recatalog / delete ---------------------------------------------------

  const recatalog = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { kind?: MediaKind; category?: MediaCategory | null } }) =>
      api.updateMedia(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["location", locationId] }),
    onError: (err) => {
      if (isStorageNotConfigured(err)) setStorageMissing(true);
      setActionError("Errore nell'aggiornamento del media. Riprova.");
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteMedia(id),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["location", locationId] });
      qc.removeQueries({ queryKey: ["media-url", id] });
      setLightbox(null);
    },
    onError: (err) => {
      if (isStorageNotConfigured(err)) setStorageMissing(true);
      setActionError("Errore nell'eliminazione del media. Riprova.");
    },
  });

  const notifyStorage = useCallback((err: unknown) => {
    if (isStorageNotConfigured(err)) setStorageMissing(true);
  }, []);

  const confirmDelete = (m: Media) => {
    if (window.confirm(`Eliminare "${m.filename ?? MEDIA_KIND_LABELS[m.kind]}"? L'operazione non è reversibile.`))
      remove.mutate(m.id);
  };

  // ---- catalog ---------------------------------------------------------------

  const kindsPresent = MEDIA_KINDS.filter((k) => media.some((m) => m.kind === k));
  const catsPresent = MEDIA_CATEGORIES.filter((c) => media.some((m) => m.category === c));

  const filtered = media.filter(
    (m) => (kindFilter === "all" || m.kind === kindFilter) && (catFilter === "all" || m.category === catFilter)
  );
  const photos = filtered.filter((m) => m.kind === "foto");
  const videos = filtered.filter((m) => m.kind === "video");
  const docs = filtered.filter((m) => m.kind !== "foto" && m.kind !== "video");

  const chipCls = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-medium transition ${
      active
        ? "border-berry bg-berry text-white"
        : "border-berry/20 bg-white text-ink/60 hover:border-berry/40 hover:text-berry"
    }`;

  const readyCount = pending.filter((p) => p.status === "pronto" || p.status === "errore").length;

  return (
    <CollapsibleSection storageKey="locdetail:media" title={`Media e planimetrie (${media.length})`} defaultOpen>
      <div className="space-y-5">
        {storageMissing && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
            {STORAGE_BANNER}
          </div>
        )}

        {/* upload zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
          }}
          className={`rounded-xl border-2 border-dashed px-6 py-7 text-center transition ${
            dragging ? "border-berry bg-berry/5" : "border-rose/30 bg-tint/30"
          }`}
        >
          <p className="text-sm text-ink/60">Trascina qui foto, video, planimetrie o documenti</p>
          <button type="button" className={`${btnSecondary} mt-3`} onClick={() => inputRef.current?.click()}>
            Scegli file…
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {/* pending files */}
        {pending.length > 0 && (
          <div className="space-y-2">
            <ul className="space-y-2">
              {pending.map((pf) => (
                <li key={pf.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-tint/50 px-3 py-2 text-sm">
                  <span aria-hidden>{MEDIA_KIND_ICONS[pf.kind]}</span>
                  <span className="min-w-0 flex-1 truncate font-medium text-ink" title={pf.file.name}>
                    {pf.file.name}
                  </span>
                  <select
                    className={selectSm}
                    value={pf.kind}
                    disabled={pf.status === "in_caricamento" || pf.status === "caricato"}
                    onChange={(e) => setFileState(pf.id, { kind: e.target.value as MediaKind })}
                    aria-label="Tipo"
                  >
                    {MEDIA_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {MEDIA_KIND_LABELS[k]}
                      </option>
                    ))}
                  </select>
                  <select
                    className={selectSm}
                    value={pf.category}
                    disabled={pf.status === "in_caricamento" || pf.status === "caricato"}
                    onChange={(e) => setFileState(pf.id, { category: e.target.value as MediaCategory | "" })}
                    aria-label="Categoria"
                  >
                    <option value="">Categoria —</option>
                    {MEDIA_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {MEDIA_CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                  {pf.status === "in_caricamento" && (
                    <span className="inline-flex items-center gap-1.5 text-xs text-ink/50">
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-berry/25 border-t-berry" />
                      Caricamento…
                    </span>
                  )}
                  {pf.status === "caricato" && <span className="text-xs font-semibold text-emerald-700">Caricato ✓</span>}
                  {pf.status === "errore" && (
                    <span className="text-xs font-medium text-red-600" title={pf.error}>
                      {pf.error ?? "Errore"}
                    </span>
                  )}
                  {pf.status !== "in_caricamento" && pf.status !== "caricato" && (
                    <button
                      type="button"
                      className="rounded-lg px-1.5 py-0.5 text-sm text-ink/30 transition hover:bg-red-50 hover:text-red-600"
                      title="Rimuovi dalla coda"
                      onClick={() => setPending((prev) => prev.filter((p) => p.id !== pf.id))}
                    >
                      ✕
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-3">
              <button type="button" className={btnPrimary} disabled={uploading || readyCount === 0} onClick={uploadAll}>
                {uploading
                  ? "Caricamento in corso…"
                  : `Carica ${readyCount} file`}
              </button>
              {!uploading && pending.length > 0 && (
                <button type="button" className={btnSecondary} onClick={() => setPending([])}>
                  Svuota coda
                </button>
              )}
            </div>
          </div>
        )}

        {actionError && <p className="text-sm text-red-600">{actionError}</p>}

        {/* filters */}
        {media.length > 0 && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" className={chipCls(kindFilter === "all")} onClick={() => setKindFilter("all")}>
                Tutti ({media.length})
              </button>
              {kindsPresent.map((k) => (
                <button key={k} type="button" className={chipCls(kindFilter === k)} onClick={() => setKindFilter(k)}>
                  {MEDIA_KIND_LABELS[k]} ({media.filter((m) => m.kind === k).length})
                </button>
              ))}
            </div>
            {catsPresent.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <button type="button" className={chipCls(catFilter === "all")} onClick={() => setCatFilter("all")}>
                  Tutte le categorie
                </button>
                {catsPresent.map((c) => (
                  <button key={c} type="button" className={chipCls(catFilter === c)} onClick={() => setCatFilter(c)}>
                    {MEDIA_CATEGORY_LABELS[c]}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {media.length === 0 && pending.length === 0 && (
          <p className="text-sm text-ink/40">Nessun media caricato per questa location.</p>
        )}
        {media.length > 0 && filtered.length === 0 && (
          <p className="text-sm text-ink/40">Nessun media corrisponde ai filtri selezionati.</p>
        )}

        {/* photo grid */}
        {photos.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {photos.map((m, i) => (
              <PhotoCard
                key={m.id}
                media={m}
                onOpen={() => setLightbox(i)}
                onDelete={() => confirmDelete(m)}
                deleting={remove.isPending}
                onStorageError={notifyStorage}
              />
            ))}
          </div>
        )}

        {/* video cards */}
        {videos.length > 0 && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {videos.map((m) => (
              <VideoCard
                key={m.id}
                media={m}
                onDelete={() => confirmDelete(m)}
                deleting={remove.isPending}
                onStorageError={notifyStorage}
              />
            ))}
          </div>
        )}

        {/* documents / planimetrie / listini */}
        {docs.length > 0 && (
          <ul className="space-y-2">
            {docs.map((m) => (
              <DocRow
                key={m.id}
                media={m}
                busy={recatalog.isPending || remove.isPending}
                onRecatalog={(patch) => recatalog.mutate({ id: m.id, patch })}
                onDelete={() => confirmDelete(m)}
                onStorageError={notifyStorage}
              />
            ))}
          </ul>
        )}
      </div>

      {lightbox != null && photos[lightbox] && (
        <Lightbox
          photos={photos}
          index={lightbox}
          onClose={() => setLightbox(null)}
          onPrev={() => setLightbox((i) => (i == null ? i : (i + photos.length - 1) % photos.length))}
          onNext={() => setLightbox((i) => (i == null ? i : (i + 1) % photos.length))}
        />
      )}
    </CollapsibleSection>
  );
}

// ---- cards & rows -----------------------------------------------------------

function PhotoCard({
  media,
  onOpen,
  onDelete,
  deleting,
  onStorageError,
}: {
  media: Media;
  onOpen: () => void;
  onDelete: () => void;
  deleting: boolean;
  onStorageError?: (err: unknown) => void;
}) {
  const { data: url, isError } = useMediaUrl(media.id, onStorageError);
  return (
    <div className="group relative aspect-square overflow-hidden rounded-lg border border-berry/10 bg-tint/60">
      {url ? (
        <button type="button" className="block h-full w-full cursor-zoom-in" onClick={onOpen} title={media.filename ?? "Apri foto"}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={media.filename ?? "Foto"}
            loading="lazy"
            className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
          />
        </button>
      ) : isError ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center">
          <span aria-hidden>🖼</span>
          <span className="text-[11px] leading-tight text-ink/45">Anteprima non disponibile</span>
        </div>
      ) : (
        <div className="h-full w-full animate-pulse bg-rose/10" />
      )}
      {media.category && (
        <span className="absolute bottom-1.5 left-1.5 rounded-full bg-ink/60 px-2 py-0.5 text-[10px] font-medium text-white">
          {MEDIA_CATEGORY_LABELS[media.category]}
        </span>
      )}
      <button
        type="button"
        className="absolute right-1.5 top-1.5 hidden h-6 w-6 items-center justify-center rounded-full bg-white/90 text-xs text-ink/50 shadow transition hover:bg-red-50 hover:text-red-600 group-hover:flex"
        title="Elimina foto"
        disabled={deleting}
        onClick={onDelete}
      >
        ✕
      </button>
    </div>
  );
}

function VideoCard({
  media,
  onDelete,
  deleting,
  onStorageError,
}: {
  media: Media;
  onDelete: () => void;
  deleting: boolean;
  onStorageError?: (err: unknown) => void;
}) {
  const { data: url, isLoading, isError } = useMediaUrl(media.id, onStorageError);
  return (
    <div className="flex items-center gap-3 rounded-lg border border-berry/10 bg-tint/50 px-3 py-2.5 text-sm">
      <span className="text-xl" aria-hidden>
        🎬
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink" title={media.filename ?? undefined}>
          {media.filename ?? "Video"}
        </p>
        {media.category && <p className="text-xs text-ink/45">{MEDIA_CATEGORY_LABELS[media.category]}</p>}
      </div>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="shrink-0 text-xs font-semibold text-berry hover:underline">
          Apri ↗
        </a>
      ) : (
        <span className="shrink-0 text-xs text-ink/40">{isLoading ? "…" : isError ? "Link n.d." : ""}</span>
      )}
      <button
        type="button"
        className="shrink-0 rounded-lg px-1.5 py-0.5 text-sm text-ink/30 transition hover:bg-red-50 hover:text-red-600"
        title="Elimina video"
        disabled={deleting}
        onClick={onDelete}
      >
        ✕
      </button>
    </div>
  );
}

function DocRow({
  media,
  busy,
  onRecatalog,
  onDelete,
  onStorageError,
}: {
  media: Media;
  busy: boolean;
  onRecatalog: (patch: { kind?: MediaKind; category?: MediaCategory | null }) => void;
  onDelete: () => void;
  onStorageError?: (err: unknown) => void;
}) {
  const qc = useQueryClient();
  const [downloading, setDownloading] = useState(false);
  const [dlError, setDlError] = useState(false);

  const download = async () => {
    setDownloading(true);
    setDlError(false);
    try {
      const url = await qc.fetchQuery({
        queryKey: ["media-url", media.id],
        queryFn: () => api.getMediaUrl(media.id),
        staleTime: MEDIA_URL_STALE_MS,
      });
      window.open(url, "_blank", "noopener");
    } catch (err) {
      onStorageError?.(err);
      setDlError(true);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg bg-tint/50 px-3 py-2.5 text-sm">
      <span aria-hidden>{MEDIA_KIND_ICONS[media.kind]}</span>
      <span className="min-w-0 flex-1 truncate font-medium text-ink" title={media.filename ?? undefined}>
        {media.filename ?? "(senza nome)"}
      </span>
      <Badge className="bg-berry/5 text-berry border-berry/15">{MEDIA_KIND_LABELS[media.kind]}</Badge>
      <select
        className={selectSm}
        value={media.kind}
        disabled={busy}
        onChange={(e) => onRecatalog({ kind: e.target.value as MediaKind })}
        aria-label="Ricataloga tipo"
        title="Ricataloga tipo"
      >
        {MEDIA_KINDS.map((k) => (
          <option key={k} value={k}>
            {MEDIA_KIND_LABELS[k]}
          </option>
        ))}
      </select>
      <select
        className={selectSm}
        value={media.category ?? ""}
        disabled={busy}
        onChange={(e) => onRecatalog({ category: (e.target.value || null) as MediaCategory | null })}
        aria-label="Ricataloga categoria"
        title="Ricataloga categoria"
      >
        <option value="">Categoria —</option>
        {MEDIA_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {MEDIA_CATEGORY_LABELS[c]}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="shrink-0 text-xs font-semibold text-berry hover:underline disabled:opacity-50"
        disabled={downloading}
        onClick={download}
      >
        {downloading ? "…" : "Scarica ↓"}
      </button>
      {dlError && <span className="text-xs text-red-600">Link non disponibile</span>}
      <button
        type="button"
        className="shrink-0 rounded-lg px-1.5 py-0.5 text-sm text-ink/30 transition hover:bg-red-50 hover:text-red-600"
        title="Elimina"
        disabled={busy}
        onClick={onDelete}
      >
        ✕
      </button>
    </li>
  );
}

// ---- lightbox ---------------------------------------------------------------

function Lightbox({
  photos,
  index,
  onClose,
  onPrev,
  onNext,
}: {
  photos: Media[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const m = photos[index];
  const { data: url, isError } = useMediaUrl(m.id);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "ArrowRight") onNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, onPrev, onNext]);

  const navBtn =
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-xl text-white transition hover:bg-white/30";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center gap-3 bg-ink/90 p-4" onClick={onClose}>
      <button
        type="button"
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/30"
        aria-label="Chiudi"
        onClick={onClose}
      >
        ✕
      </button>
      {photos.length > 1 && (
        <button
          type="button"
          className={navBtn}
          aria-label="Foto precedente"
          onClick={(e) => {
            e.stopPropagation();
            onPrev();
          }}
        >
          ‹
        </button>
      )}
      <figure className="flex max-h-full min-w-0 flex-col items-center" onClick={(e) => e.stopPropagation()}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={m.filename ?? "Foto"} className="max-h-[82vh] max-w-full rounded-lg object-contain shadow-2xl" />
        ) : isError ? (
          <p className="text-sm text-white/80">Immagine non disponibile.</p>
        ) : (
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/25 border-t-white" />
        )}
        <figcaption className="mt-3 text-center text-sm text-white/80">
          {m.filename ?? ""}
          {m.category ? ` · ${MEDIA_CATEGORY_LABELS[m.category]}` : ""}
          {photos.length > 1 ? ` · ${index + 1}/${photos.length}` : ""}
        </figcaption>
      </figure>
      {photos.length > 1 && (
        <button
          type="button"
          className={navBtn}
          aria-label="Foto successiva"
          onClick={(e) => {
            e.stopPropagation();
            onNext();
          }}
        >
          ›
        </button>
      )}
    </div>
  );
}
