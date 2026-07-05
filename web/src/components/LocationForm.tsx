"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as api from "@/lib/api";
import type { Cooking, LocationBase, LocationDetail, VisitStatus } from "@/lib/types";
import { SMART_TAGS, tagLabel } from "@/lib/labels";
import { Card, Field, btnPrimary, btnSecondary, inputCls } from "./ui";

interface FormState {
  name: string;
  parent_location_id: string;
  summary: string;
  address_line: string;
  city: string;
  province: string;
  postal_code: string;
  google_maps_url: string;
  lng: string;
  lat: string;
  visit_status: VisitStatus;
  accessibility_rating: string;
  accessibility_notes: string;
  availability_rules: string;
  smart_tags: string[];
  impressions: string;
  // logistics
  log_auto: string;
  log_pullman: string;
  log_ztl_present: boolean;
  log_ztl_hours: string;
  log_ztl_permits: string;
  log_stop_difficulty: string;
  log_parking_spots: string;
  log_notes: string;
  // technical
  tec_max_kw: string;
  tec_generators: boolean;
  tec_aerial_ladder: boolean;
  tec_cooking: Cooking | "";
  tec_heavy: boolean;
  tec_notes: string;
  // setup
  set_furniture: string;
  set_lights: string;
  set_projections: string;
  set_stage: string;
  set_audio: string;
  set_constraints: string;
  // party
  party_indoor_allowed: boolean;
  party_indoor_until: string;
  party_outdoor_allowed: boolean;
  party_outdoor_until: string;
  party_db_limit: string;
}

function fromDetail(loc?: LocationDetail | null): FormState {
  return {
    name: loc?.name ?? "",
    parent_location_id: loc?.parent_location_id ?? "",
    summary: loc?.summary ?? "",
    address_line: loc?.address_line ?? "",
    city: loc?.city ?? "",
    province: loc?.province ?? "",
    postal_code: loc?.postal_code ?? "",
    google_maps_url: loc?.google_maps_url ?? "",
    lng: loc?.lng != null ? String(loc.lng) : "",
    lat: loc?.lat != null ? String(loc.lat) : "",
    visit_status: loc?.visit_status ?? "da_visitare",
    accessibility_rating: loc?.accessibility_rating != null ? String(loc.accessibility_rating) : "",
    accessibility_notes: loc?.accessibility_notes ?? "",
    availability_rules: loc?.availability_rules ?? "",
    smart_tags: loc?.smart_tags ?? [],
    impressions: loc?.impressions ?? "",
    log_auto: loc?.logistics?.auto ?? "",
    log_pullman: loc?.logistics?.pullman ?? "",
    log_ztl_present: loc?.logistics?.ztl?.present ?? false,
    log_ztl_hours: loc?.logistics?.ztl?.hours ?? "",
    log_ztl_permits: loc?.logistics?.ztl?.permits ?? "",
    log_stop_difficulty: loc?.logistics?.stop_difficulty ?? "",
    log_parking_spots: loc?.logistics?.private_parking?.spots != null ? String(loc.logistics.private_parking.spots) : "",
    log_notes: loc?.logistics?.notes ?? "",
    tec_max_kw: loc?.technical?.max_kw != null ? String(loc.technical.max_kw) : "",
    tec_generators: loc?.technical?.generators ?? false,
    tec_aerial_ladder: loc?.technical?.aerial_ladder ?? false,
    tec_cooking: loc?.technical?.cooking ?? "",
    tec_heavy: loc?.technical?.heavy_vehicle_access ?? false,
    tec_notes: loc?.technical?.notes ?? "",
    set_furniture: loc?.setup?.furniture ?? "",
    set_lights: loc?.setup?.lights ?? "",
    set_projections: loc?.setup?.projections ?? "",
    set_stage: loc?.setup?.stage ?? "",
    set_audio: loc?.setup?.audio ?? "",
    set_constraints: (loc?.setup?.constraints ?? []).join("\n"),
    party_indoor_allowed: loc?.party?.indoor?.allowed ?? false,
    party_indoor_until: loc?.party?.indoor?.music_until ?? "",
    party_outdoor_allowed: loc?.party?.outdoor?.allowed ?? false,
    party_outdoor_until: loc?.party?.outdoor?.music_until ?? "",
    party_db_limit: loc?.party?.db_limit != null ? String(loc.party.db_limit) : "",
  };
}

function toPayload(f: FormState): Partial<LocationBase> {
  const num = (s: string) => (s.trim() === "" ? null : Number(s));
  const str = (s: string) => (s.trim() === "" ? null : s.trim());
  return {
    name: f.name.trim(),
    parent_location_id: f.parent_location_id || null,
    summary: str(f.summary),
    address_line: str(f.address_line),
    city: str(f.city),
    province: str(f.province),
    postal_code: str(f.postal_code),
    google_maps_url: str(f.google_maps_url),
    lng: num(f.lng),
    lat: num(f.lat),
    visit_status: f.visit_status,
    accessibility_rating: num(f.accessibility_rating),
    accessibility_notes: str(f.accessibility_notes),
    availability_rules: str(f.availability_rules),
    smart_tags: f.smart_tags,
    impressions: str(f.impressions),
    logistics: {
      auto: f.log_auto || undefined,
      pullman: f.log_pullman || undefined,
      ztl: { present: f.log_ztl_present, hours: f.log_ztl_hours || undefined, permits: f.log_ztl_permits || undefined },
      stop_difficulty: f.log_stop_difficulty || undefined,
      private_parking: f.log_parking_spots ? { spots: Number(f.log_parking_spots) } : undefined,
      notes: f.log_notes || undefined,
    },
    technical: {
      max_kw: f.tec_max_kw ? Number(f.tec_max_kw) : undefined,
      generators: f.tec_generators,
      aerial_ladder: f.tec_aerial_ladder,
      cooking: f.tec_cooking || undefined,
      heavy_vehicle_access: f.tec_heavy,
      notes: f.tec_notes || undefined,
    },
    setup: {
      furniture: f.set_furniture || undefined,
      lights: f.set_lights || undefined,
      projections: f.set_projections || undefined,
      stage: f.set_stage || undefined,
      audio: f.set_audio || undefined,
      constraints: f.set_constraints
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    },
    party: {
      indoor: { allowed: f.party_indoor_allowed, music_until: f.party_indoor_until || undefined },
      outdoor: { allowed: f.party_outdoor_allowed, music_until: f.party_outdoor_until || undefined },
      db_limit: f.party_db_limit ? Number(f.party_db_limit) : undefined,
    },
  };
}

export default function LocationForm({
  initial,
  onSubmit,
  submitting,
  submitLabel,
  onCancel,
}: {
  initial?: LocationDetail | null;
  onSubmit: (payload: Partial<LocationBase>) => void;
  submitting: boolean;
  submitLabel: string;
  onCancel: () => void;
}) {
  const [f, setF] = useState<FormState>(() => fromDetail(initial));
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setF((prev) => ({ ...prev, [key]: value }));

  const { data: parents } = useQuery({
    queryKey: ["locations", "roots"],
    queryFn: () => api.listLocations({ root_only: true }),
  });

  const checkbox = (checked: boolean, onChange: (v: boolean) => void, label: string) => (
    <label className="flex items-center gap-2 text-sm text-ink/80">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-rose/40 accent-[#6d2e46]"
      />
      {label}
    </label>
  );

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!f.name.trim()) return;
        onSubmit(toPayload(f));
      }}
    >
      <Card title="Anagrafica">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Nome *" className="md:col-span-2">
            <input className={inputCls} value={f.name} onChange={(e) => set("name", e.target.value)} required />
          </Field>
          <Field label="Location padre (per spazi interni, es. ristorante di un hotel)">
            <select className={inputCls} value={f.parent_location_id} onChange={(e) => set("parent_location_id", e.target.value)}>
              <option value="">— Nessuna (location principale)</option>
              {(parents ?? [])
                .filter((p) => p.id !== initial?.id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Stato visita">
            <select className={inputCls} value={f.visit_status} onChange={(e) => set("visit_status", e.target.value as VisitStatus)}>
              <option value="da_visitare">Da visitare</option>
              <option value="visitata">Visitata</option>
            </select>
          </Field>
          <Field label="Descrizione" className="md:col-span-2">
            <textarea className={inputCls} rows={3} value={f.summary} onChange={(e) => set("summary", e.target.value)} />
          </Field>
          <Field label="Indirizzo">
            <input className={inputCls} value={f.address_line} onChange={(e) => set("address_line", e.target.value)} placeholder="Via, numero civico" />
          </Field>
          <Field label="Città">
            <input className={inputCls} value={f.city} onChange={(e) => set("city", e.target.value)} />
          </Field>
          <Field label="Provincia">
            <input className={inputCls} value={f.province} onChange={(e) => set("province", e.target.value)} maxLength={2} />
          </Field>
          <Field label="CAP">
            <input className={inputCls} value={f.postal_code} onChange={(e) => set("postal_code", e.target.value)} />
          </Field>
          <Field label="Link Google Maps" className="md:col-span-2">
            <input className={inputCls} value={f.google_maps_url} onChange={(e) => set("google_maps_url", e.target.value)} />
          </Field>
          <Field label="Longitudine">
            <input className={inputCls} value={f.lng} onChange={(e) => set("lng", e.target.value)} placeholder="es. 9.1897" />
          </Field>
          <Field label="Latitudine">
            <input className={inputCls} value={f.lat} onChange={(e) => set("lat", e.target.value)} placeholder="es. 45.4708" />
          </Field>
        </div>
      </Card>

      <Card title="Tag e valutazione">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Smart tag" className="md:col-span-2">
            <div className="flex flex-wrap gap-2">
              {SMART_TAGS.map((tag) => {
                const active = f.smart_tags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() =>
                      set("smart_tags", active ? f.smart_tags.filter((t) => t !== tag) : [...f.smart_tags, tag])
                    }
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                      active ? "border-berry bg-berry text-white" : "border-rose/30 bg-white text-ink/60 hover:border-berry/40"
                    }`}
                  >
                    {tagLabel(tag)}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Accessibilità (1–5)">
            <select className={inputCls} value={f.accessibility_rating} onChange={(e) => set("accessibility_rating", e.target.value)}>
              <option value="">—</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {"★".repeat(n)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Note accessibilità">
            <input className={inputCls} value={f.accessibility_notes} onChange={(e) => set("accessibility_notes", e.target.value)} />
          </Field>
          <Field label="Regole di disponibilità" className="md:col-span-2">
            <input
              className={inputCls}
              value={f.availability_rules}
              onChange={(e) => set("availability_rules", e.target.value)}
              placeholder='es. "solo weekend ottobre–aprile"'
            />
          </Field>
          <Field label="Impressioni" className="md:col-span-2">
            <textarea className={inputCls} rows={2} value={f.impressions} onChange={(e) => set("impressions", e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card title="Logistica">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Accesso auto">
            <input className={inputCls} value={f.log_auto} onChange={(e) => set("log_auto", e.target.value)} />
          </Field>
          <Field label="Accesso pullman">
            <input className={inputCls} value={f.log_pullman} onChange={(e) => set("log_pullman", e.target.value)} />
          </Field>
          <div className="flex items-end pb-2">{checkbox(f.log_ztl_present, (v) => set("log_ztl_present", v), "ZTL presente")}</div>
          <Field label="Orari ZTL">
            <input className={inputCls} value={f.log_ztl_hours} onChange={(e) => set("log_ztl_hours", e.target.value)} disabled={!f.log_ztl_present} />
          </Field>
          <Field label="Permessi ZTL" className="md:col-span-2">
            <input className={inputCls} value={f.log_ztl_permits} onChange={(e) => set("log_ztl_permits", e.target.value)} disabled={!f.log_ztl_present} />
          </Field>
          <Field label="Difficoltà di sosta">
            <select className={inputCls} value={f.log_stop_difficulty} onChange={(e) => set("log_stop_difficulty", e.target.value)}>
              <option value="">—</option>
              <option value="bassa">Bassa</option>
              <option value="media">Media</option>
              <option value="alta">Alta</option>
            </select>
          </Field>
          <Field label="Posti parcheggio privato">
            <input className={inputCls} type="number" min={0} value={f.log_parking_spots} onChange={(e) => set("log_parking_spots", e.target.value)} />
          </Field>
          <Field label="Note logistica" className="md:col-span-2">
            <textarea className={inputCls} rows={2} value={f.log_notes} onChange={(e) => set("log_notes", e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card title="Scheda tecnica">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Potenza max (kW)">
            <input className={inputCls} type="number" min={0} value={f.tec_max_kw} onChange={(e) => set("tec_max_kw", e.target.value)} />
          </Field>
          <Field label="Cucina">
            <select className={inputCls} value={f.tec_cooking} onChange={(e) => set("tec_cooking", e.target.value as Cooking | "")}>
              <option value="">—</option>
              <option value="fiamma">Fiamma</option>
              <option value="induzione">Induzione</option>
              <option value="rigenerazione">Rigenerazione</option>
              <option value="no">No</option>
            </select>
          </Field>
          <div className="flex flex-col justify-end gap-2 pb-1">
            {checkbox(f.tec_generators, (v) => set("tec_generators", v), "Generatori ammessi")}
            {checkbox(f.tec_aerial_ladder, (v) => set("tec_aerial_ladder", v), "Autoscala possibile")}
            {checkbox(f.tec_heavy, (v) => set("tec_heavy", v), "Accesso mezzi pesanti")}
          </div>
          <Field label="Note tecniche" className="md:col-span-3">
            <textarea className={inputCls} rows={2} value={f.tec_notes} onChange={(e) => set("tec_notes", e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card title="Allestimenti e party">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Arredi">
            <input className={inputCls} value={f.set_furniture} onChange={(e) => set("set_furniture", e.target.value)} />
          </Field>
          <Field label="Luci">
            <input className={inputCls} value={f.set_lights} onChange={(e) => set("set_lights", e.target.value)} />
          </Field>
          <Field label="Proiezioni">
            <input className={inputCls} value={f.set_projections} onChange={(e) => set("set_projections", e.target.value)} />
          </Field>
          <Field label="Palco">
            <input className={inputCls} value={f.set_stage} onChange={(e) => set("set_stage", e.target.value)} />
          </Field>
          <Field label="Audio">
            <input className={inputCls} value={f.set_audio} onChange={(e) => set("set_audio", e.target.value)} />
          </Field>
          <Field label="Vincoli allestimento (uno per riga)">
            <textarea className={inputCls} rows={2} value={f.set_constraints} onChange={(e) => set("set_constraints", e.target.value)} />
          </Field>
          <div className="space-y-2">
            {checkbox(f.party_indoor_allowed, (v) => set("party_indoor_allowed", v), "Party indoor consentito")}
            <Field label="Musica fino alle (indoor)">
              <input className={inputCls} value={f.party_indoor_until} onChange={(e) => set("party_indoor_until", e.target.value)} placeholder="es. 01:00" disabled={!f.party_indoor_allowed} />
            </Field>
          </div>
          <div className="space-y-2">
            {checkbox(f.party_outdoor_allowed, (v) => set("party_outdoor_allowed", v), "Party outdoor consentito")}
            <Field label="Musica fino alle (outdoor)">
              <input className={inputCls} value={f.party_outdoor_until} onChange={(e) => set("party_outdoor_until", e.target.value)} placeholder="es. 23:30" disabled={!f.party_outdoor_allowed} />
            </Field>
          </div>
          <Field label="Limite dB">
            <input className={inputCls} type="number" min={0} value={f.party_db_limit} onChange={(e) => set("party_db_limit", e.target.value)} />
          </Field>
        </div>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <button type="button" className={btnSecondary} onClick={onCancel}>
          Annulla
        </button>
        <button type="submit" className={btnPrimary} disabled={submitting || !f.name.trim()}>
          {submitting ? "Salvataggio…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
