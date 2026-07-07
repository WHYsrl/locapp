"use client";

// Create/edit dialog for the points of interest. Coordinates can be typed
// manually or proposed from the address via the existing GeocodeSuggest.

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import GeocodeSuggest from "./GeocodeSuggest";
import { Field, Modal, btnPrimary, btnSecondary, inputCls } from "./ui";
import { POI_KINDS, POI_KIND_ICONS, POI_KIND_LABELS } from "@/lib/labels";
import type { Poi, PoiKind } from "@/lib/types";

interface FormState {
  name: string;
  kind: PoiKind;
  address: string;
  city: string;
  notes: string;
  lat: string;
  lng: string;
}

const emptyForm: FormState = { name: "", kind: "hotel", address: "", city: "", notes: "", lat: "", lng: "" };

function fromPoi(poi?: Poi | null): FormState {
  if (!poi) return emptyForm;
  return {
    name: poi.name,
    kind: poi.kind,
    address: poi.address ?? "",
    city: poi.city ?? "",
    notes: poi.notes ?? "",
    lat: String(poi.lat),
    lng: String(poi.lng),
  };
}

export default function PoiDialog({
  open,
  onClose,
  poi = null,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** POI da modificare; null/undefined = creazione. */
  poi?: Poi | null;
  /** Invalidazioni extra (es. poi-distances della location corrente). */
  onSaved?: (saved: Poi) => void;
}) {
  const qc = useQueryClient();
  const [f, setF] = useState<FormState>(() => fromPoi(poi));
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setF((prev) => ({ ...prev, [key]: value }));

  // Reset the form each time the dialog opens (create vs edit target).
  useEffect(() => {
    if (open) setF(fromPoi(poi));
  }, [open, poi]);

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: f.name.trim(),
        kind: f.kind,
        lat: Number(f.lat),
        lng: Number(f.lng),
        address: f.address.trim() || null,
        city: f.city.trim() || null,
        notes: f.notes.trim() || null,
      };
      return poi ? api.updatePoi(poi.id, payload) : api.createPoi(payload);
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ["pois"] });
      onSaved?.(saved);
      onClose();
    },
  });

  const coordsValid =
    f.lat.trim() !== "" && f.lng.trim() !== "" && !Number.isNaN(Number(f.lat)) && !Number.isNaN(Number(f.lng));
  const canSubmit = f.name.trim() !== "" && coordsValid && !save.isPending;

  return (
    <Modal open={open} onClose={onClose} title={poi ? "Modifica POI" : "Nuovo punto di interesse"}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) save.mutate();
        }}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Nome *">
            <input
              className={inputCls}
              value={f.name}
              onChange={(e) => set("name", e.target.value)}
              required
              placeholder="es. Aeroporto di Linate"
            />
          </Field>
          <Field label="Tipo *">
            <select className={inputCls} value={f.kind} onChange={(e) => set("kind", e.target.value as PoiKind)}>
              {POI_KINDS.map((k) => (
                <option key={k} value={k}>
                  {POI_KIND_ICONS[k]} {POI_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Indirizzo">
            <input className={inputCls} value={f.address} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <Field label="Città">
            <input className={inputCls} value={f.city} onChange={(e) => set("city", e.target.value)} />
          </Field>
        </div>

        <GeocodeSuggest
          fields={{ name: f.name, address: f.address, city: f.city }}
          disabled={!f.name.trim() && !f.address.trim() && !f.city.trim()}
          buttonLabel="Proponi coordinate da nome/indirizzo"
          onPick={(c) => {
            // Align address/city from the candidate's display_name (Nominatim/Google
            // comma-separated form, e.g. "Stazione Termini, Piazza dei Cinquecento,
            // ..., Roma, Roma Capitale, Lazio, 00185, Italia").
            const parts = c.display_name.split(",").map((s) => s.trim()).filter(Boolean);
            const streetRe = /\b(via|viale|piazza|piazzale|corso|largo|strada|vicolo|lungotevere|borgo|contrada)\b/i;
            const street = parts.find((p) => streetRe.test(p)) ?? (parts.length > 1 ? parts[1] : "");
            const postalIdx = parts.findIndex((p) => /^\d{5}$/.test(p));
            const city = postalIdx >= 3 ? parts[postalIdx - 3] : "";
            setF((prev) => ({
              ...prev,
              lat: String(c.lat),
              lng: String(c.lon),
              address: street || prev.address,
              city: city || prev.city,
            }));
          }}
        />

        <div className="grid grid-cols-2 gap-4">
          <Field label="Latitudine *">
            <input className={inputCls} value={f.lat} onChange={(e) => set("lat", e.target.value)} placeholder="es. 45.4636" required />
          </Field>
          <Field label="Longitudine *">
            <input className={inputCls} value={f.lng} onChange={(e) => set("lng", e.target.value)} placeholder="es. 9.1885" required />
          </Field>
        </div>

        <Field label="Note">
          <textarea className={inputCls} rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>

        {save.isError && (
          <p className="text-sm text-red-600">
            {save.error instanceof api.ApiError ? save.error.message : "Errore durante il salvataggio. Riprova."}
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <button type="button" className={btnSecondary} onClick={onClose}>
            Annulla
          </button>
          <button type="submit" className={btnPrimary} disabled={!canSubmit}>
            {save.isPending ? "Salvataggio…" : poi ? "Salva modifiche" : "Crea POI"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
