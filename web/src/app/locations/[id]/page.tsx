"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import GeocodeSuggest from "@/components/GeocodeSuggest";
import MapView from "@/components/MapView";
import CollapsibleSection from "@/components/CollapsibleSection";
import TagPicker, { TagChip, useTagColors } from "@/components/TagPicker";
import AddSupplierDialog from "@/components/AddSupplierDialog";
import AddContactDialog from "@/components/AddContactDialog";
import MediaSection from "@/components/MediaSection";
import ConfirmDialog from "@/components/ConfirmDialog";
import PoiDialog from "@/components/PoiDialog";
import { useDeleteFlow } from "@/lib/useDeleteFlow";
import { Badge, Card, EmptyState, Spinner, Stars, btnChip, btnPrimary, btnSecondary } from "@/components/ui";
import {
  CONFIGURATIONS,
  CONFIG_LABELS,
  EFFECTIVE_STATUS_CLASSES,
  EFFECTIVE_STATUS_LABELS,
  EL_STATUS_CLASSES,
  EL_STATUS_LABELS,
  POI_KIND_ICONS,
  POI_KIND_LABELS,
  formatDate,
  formatDateTime,
  formatMoney,
  tagLabel,
  yesNo,
} from "@/lib/labels";
import {
  lngLatOf,
  type Configuration,
  type GeocodeCandidate,
  type LocationDetail,
  type UsageEntry,
} from "@/lib/types";

/** Presigned GET URLs last ~1h on the backend: cache them for 30 min. */
const MEDIA_URL_STALE_MS = 30 * 60 * 1000;

export default function LocationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();
  const router = useRouter();

  const [editingTags, setEditingTags] = useState(false);
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [poiDialogOpen, setPoiDialogOpen] = useState(false);

  const tagColors = useTagColors();

  const { data: loc, isLoading } = useQuery({
    queryKey: ["location", id],
    queryFn: () => api.getLocation(id),
    enabled: !!id,
  });
  const { data: usage } = useQuery({
    queryKey: ["location-usage", id],
    queryFn: () => api.getLocationUsage(id),
    enabled: !!id,
  });
  const { data: history } = useQuery({
    queryKey: ["location-history", id],
    queryFn: () => api.getLocationHistory(id),
    enabled: !!id,
  });
  const { data: poiDistances, isLoading: poiDistancesLoading } = useQuery({
    queryKey: ["poi-distances", id],
    queryFn: () => api.getPoiDistances(id),
    enabled: !!id,
  });

  const deleteFlow = useDeleteFlow({
    doDelete: (force) => api.deleteLocation(id, force),
    onDeleted: () => {
      qc.invalidateQueries({ queryKey: ["locations"] });
      qc.removeQueries({ queryKey: ["location", id] });
      router.push("/locations");
    },
  });

  const saveTags = useMutation({
    mutationFn: (tags: string[]) => api.updateLocation(id, { smart_tags: tags }),
    onSuccess: () => {
      setEditingTags(false);
      qc.invalidateQueries({ queryKey: ["location", id] });
      qc.invalidateQueries({ queryKey: ["locations"] });
      qc.invalidateQueries({ queryKey: ["tags"] });
    },
  });

  const removeSupplier = useMutation({
    mutationFn: (supplierId: string) => api.removeLocationSupplier(id, supplierId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["location", id] }),
  });

  const removeContact = useMutation({
    mutationFn: (contactId: string) => api.removeLocationContact(id, contactId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["location", id] }),
  });

  // La PATCH invia sempre lat+lng insieme (contratto backend).
  const applyCoords = useMutation({
    mutationFn: (c: GeocodeCandidate) =>
      api.updateLocation(id, { lat: Number(c.lat), lng: Number(c.lon), google_maps_url: c.google_maps_url }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["location", id] });
      qc.invalidateQueries({ queryKey: ["locations"] });
    },
  });

  if (isLoading || !loc) return <Spinner />;

  const st = loc.effective_status ?? loc.visit_status;
  const ll = lngLatOf(loc);
  const usedConfigs = CONFIGURATIONS.filter((c) => loc.spaces.some((s) => s.capacities[c] != null));

  // Contact fields: prefer own values, fall back to effective_* (inherited
  // from the parent) when the API provides them.
  const phone = loc.phone ?? loc.effective_phone ?? null;
  const email = loc.email ?? loc.effective_email ?? null;
  const website = loc.website ?? loc.effective_website ?? null;
  const phoneInherited = !loc.phone && loc.effective_phone != null;
  const emailInherited = !loc.email && loc.effective_email != null;
  const websiteInherited = !loc.website && loc.effective_website != null;
  const inheritedBadge = <Badge className="bg-gold/15 text-yellow-800 border-gold/30">ereditato</Badge>;

  const gmapsHref =
    loc.google_maps_url ?? (ll ? `https://www.google.com/maps?q=${ll[1]},${ll[0]}` : null);

  // ---- stat cards -----------------------------------------------------------
  let maxCap: { n: number; config: Configuration } | null = null;
  for (const s of loc.spaces) {
    for (const c of CONFIGURATIONS) {
      const n = s.capacities[c];
      if (n != null && (maxCap == null || n > maxCap.n)) maxCap = { n, config: c };
    }
  }
  const interni = loc.spaces.filter((s) => s.kind === "interno").length;
  const esterni = loc.spaces.length - interni;
  const meetingConfigs: Configuration[] = ["platea", "classroom", "ferro_di_cavallo"];
  const meetingRooms = loc.spaces.filter((s) => meetingConfigs.some((c) => s.capacities[c] != null)).length;
  const lastUse = latestUsage(usage);

  return (
    <div>
      {/* breadcrumb */}
      <nav className="mb-3 text-sm text-ink/50">
        <Link href="/locations" className="hover:text-berry">
          Location
        </Link>
        {loc.parent && (
          <>
            {" / "}
            <Link href={`/locations/${loc.parent.id}`} className="hover:text-berry">
              {loc.parent.name}
            </Link>
          </>
        )}
        {" / "}
        <span className="text-ink/80">{loc.name}</span>
      </nav>

      {/* hero: cover a sinistra, pannello info compatto a destra */}
      <div className="mb-6 overflow-hidden rounded-2xl border border-hairline bg-white shadow-soft">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <HeroCover loc={loc} />

          <div className="min-w-0 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-ink">{loc.name}</h1>
                  <Badge className={EFFECTIVE_STATUS_CLASSES[st]}>{EFFECTIVE_STATUS_LABELS[st]}</Badge>
                </div>
                <p className="mt-1 text-sm text-ink/60">
                  {[loc.address_line, loc.postal_code, loc.city, loc.province ? `(${loc.province})` : null]
                    .filter(Boolean)
                    .join(", ") || "Indirizzo non impostato"}
                  {gmapsHref && (
                    <a
                      href={gmapsHref}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-2 whitespace-nowrap text-xs font-medium text-berry hover:underline"
                    >
                      Apri in Google Maps ↗
                    </a>
                  )}
                </p>
                {loc.parent && <p className="mt-0.5 text-xs text-ink/40">interna a {loc.parent.name}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link href={`/locations/${loc.id}/edit`} className={btnSecondary}>
                  Modifica scheda
                </Link>
                <button
                  className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 transition duration-150 hover:bg-red-50"
                  onClick={deleteFlow.open}
                >
                  Elimina location
                </button>
              </div>
            </div>

            {(phone || email || website) && (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink/70">
                {phone && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-ink/40">Tel</span>
                    <a href={`tel:${phone.replace(/\s+/g, "")}`} className="font-medium text-berry hover:underline">
                      {phone}
                    </a>
                    {phoneInherited && inheritedBadge}
                  </span>
                )}
                {email && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-ink/40">Email</span>
                    <a href={`mailto:${email}`} className="font-medium text-berry hover:underline">
                      {email}
                    </a>
                    {emailInherited && inheritedBadge}
                  </span>
                )}
                {website && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-ink/40">Web</span>
                    <a
                      href={normalizeUrl(website)}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-berry hover:underline"
                    >
                      {hostnameOf(website)} ↗
                    </a>
                    {websiteInherited && inheritedBadge}
                  </span>
                )}
              </div>
            )}

            {!ll && (loc.address_line || loc.city) && (
              <div className="mt-3">
                <GeocodeSuggest
                  fields={{
                    name: loc.name,
                    address: loc.address_line ?? undefined,
                    city: loc.city ?? undefined,
                    postal_code: loc.postal_code ?? undefined,
                    province: loc.province ?? undefined,
                  }}
                  buttonLabel="Coordinate mancanti — proponi da indirizzo"
                  buttonClassName="text-xs font-medium text-berry underline decoration-dotted underline-offset-2 transition hover:text-berry-dark disabled:opacity-50"
                  onPick={(c) => applyCoords.mutate(c)}
                />
                {applyCoords.isPending && <p className="mt-1 text-xs text-ink/40">Salvataggio coordinate…</p>}
                {applyCoords.isError && (
                  <p className="mt-1 text-xs text-red-600">Errore nel salvataggio delle coordinate. Riprova.</p>
                )}
              </div>
            )}

            {loc.summary && <p className="mt-3 text-sm leading-relaxed text-ink/75">{loc.summary}</p>}

            {/* smart tags + inline edit + accessibilità */}
            {editingTags ? (
              <div className="mt-3 rounded-lg border border-berry/15 bg-tint/40 p-3">
                <TagPicker value={draftTags} onChange={setDraftTags} compact />
                <div className="mt-3 flex items-center gap-2">
                  <button
                    className={btnPrimary}
                    disabled={saveTags.isPending}
                    onClick={() => saveTags.mutate(draftTags)}
                  >
                    {saveTags.isPending ? "Salvataggio…" : "Salva tag"}
                  </button>
                  <button className={btnSecondary} onClick={() => setEditingTags(false)}>
                    Annulla
                  </button>
                  {saveTags.isError && <span className="text-sm text-red-600">Errore nel salvataggio.</span>}
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {(loc.smart_tags ?? []).map((t) => (
                  <TagChip key={t} name={t} color={tagColors[t]} />
                ))}
                <button
                  className="rounded-lg px-1.5 py-0.5 text-sm text-ink/40 transition hover:bg-berry/5 hover:text-berry"
                  title="Modifica i tag"
                  aria-label="Modifica i tag"
                  onClick={() => {
                    setDraftTags(loc.smart_tags ?? []);
                    setEditingTags(true);
                  }}
                >
                  ✎
                </button>
                <span className="ml-2 text-sm text-ink/50">Accessibilità:</span>
                <Stars value={loc.accessibility_rating} />
              </div>
            )}
            {loc.accessibility_notes && <p className="mt-1 text-xs text-ink/50">{loc.accessibility_notes}</p>}
            {loc.availability_rules && (
              <p className="mt-2 text-xs font-medium text-yellow-800">Disponibilità: {loc.availability_rules}</p>
            )}

            {/* mini-mappa nel pannello: link alla sezione mappa / Google Maps */}
            {ll && <PanelMapThumb loc={loc} href={gmapsHref ?? "#mappa"} external={!!gmapsHref} />}
          </div>
        </div>
      </div>

      {/* stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Capienza max"
          value={maxCap ? `${maxCap.n} pax` : "—"}
          sub={maxCap ? CONFIG_LABELS[maxCap.config] : "nessuno spazio censito"}
        />
        <StatCard
          label="N. spazi"
          value={loc.spaces.length || "—"}
          sub={loc.spaces.length > 0 ? `${interni} interni · ${esterni} esterni` : undefined}
        />
        <StatCard
          label="Sale meeting"
          value={meetingRooms || "—"}
          sub={meetingRooms > 0 ? "platea / classroom / ferro di cavallo" : undefined}
        />
        <StatCard
          label="Ultimo evento/uso"
          value={lastUse ? formatDate(lastUse.event.date_start) : "Mai"}
          sub={lastUse ? lastUse.event.name : "nessun utilizzo registrato"}
        />
      </div>

      {/* children */}
      {loc.children.length > 0 && (
        <Card title="Location interne" className="mb-6">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {loc.children.map((child) => (
              <Link
                key={child.id}
                href={`/locations/${child.id}`}
                className="flex items-center justify-between rounded-lg border border-berry/10 bg-tint/40 px-4 py-3 transition hover:border-berry/30"
              >
                <div>
                  <p className="font-semibold text-berry">{child.name}</p>
                  <p className="text-xs text-ink/50">{(child.smart_tags ?? []).map(tagLabel).join(", ")}</p>
                </div>
                <span className="text-sm text-ink/50">max {child.max_capacity ?? "—"} pax</span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      <div className="space-y-6">
        {/* spaces */}
        <CollapsibleSection storageKey="locdetail:spazi" title="Spazi e capienze" defaultOpen>
          {loc.spaces.length === 0 ? (
            <EmptyState title="Nessuno spazio censito" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-berry/10 text-left text-xs font-semibold uppercase tracking-wide text-ink/50">
                    <th className="py-2 pr-3">Spazio</th>
                    <th className="py-2 pr-3">Tipo</th>
                    <th className="py-2 pr-3 text-right">mq</th>
                    {usedConfigs.map((c) => (
                      <th key={c} className="py-2 pr-3 text-right">
                        {CONFIG_LABELS[c]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-berry/5">
                  {loc.spaces.map((s) => (
                    <tr key={s.id}>
                      <td className="py-2.5 pr-3">
                        <p className="font-semibold text-ink">{s.name}</p>
                        {s.features?.bagni?.count != null && (
                          <p className="text-xs text-ink/45">
                            {s.features.bagni.count} bagni{s.features.bagni.accessible ? " (accessibili)" : ""}
                            {s.features.cucina ? " · cucina" : ""}
                            {s.features.foyer ? " · foyer" : ""}
                            {s.features.guardaroba ? " · guardaroba" : ""}
                          </p>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-ink/60">
                        {s.kind}
                        {s.covered && s.covered !== "coperto" ? ` · ${s.covered}` : ""}
                        {s.height_m ? ` · h ${s.height_m} m` : ""}
                      </td>
                      <td className="py-2.5 pr-3 text-right text-ink/70">{s.area_sqm ?? "—"}</td>
                      {usedConfigs.map((c) => (
                        <td key={c} className="py-2.5 pr-3 text-right font-medium text-ink">
                          {s.capacities[c] ?? "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CollapsibleSection>

        {/* media & floor plans */}
        <MediaSection locationId={id} media={loc.media} />

        {/* logistics */}
        <CollapsibleSection
          storageKey="locdetail:logistica"
          defaultOpen
          title={
            <span className="flex items-center gap-2">
              Logistica
              {loc.logistics_inherited && loc.parent && (
                <Badge className="bg-gold/15 text-yellow-800 border-gold/30">ereditata da {loc.parent.name}</Badge>
              )}
            </span>
          }
        >
          {loc.effective_logistics ? (
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm md:grid-cols-2">
              <Info label="Accesso auto" value={loc.effective_logistics.auto} />
              <Info label="Accesso pullman" value={loc.effective_logistics.pullman} />
              <Info
                label="ZTL"
                value={
                  loc.effective_logistics.ztl?.present
                    ? `Sì — ${loc.effective_logistics.ztl.hours ?? "orari n.d."}${loc.effective_logistics.ztl.permits ? ` · ${loc.effective_logistics.ztl.permits}` : ""}`
                    : "No"
                }
              />
              <Info label="Difficoltà di sosta" value={loc.effective_logistics.stop_difficulty} />
              <Info
                label="Parcheggio privato"
                value={
                  loc.effective_logistics.private_parking?.spots != null
                    ? `${loc.effective_logistics.private_parking.spots} posti`
                    : undefined
                }
              />
              <Info
                label="Parcheggi vicini"
                value={loc.effective_logistics.nearby_parking?.map((p) => `${p.name} (${p.distance_m} m)`).join(", ")}
              />
              <Info label="Note" value={loc.effective_logistics.notes} full />
            </dl>
          ) : (
            <EmptyState title="Logistica non compilata" />
          )}
        </CollapsibleSection>

        {/* POI distances */}
        <CollapsibleSection
          storageKey="locdetail:poi"
          title="Punti di interesse e distanze"
          action={
            <button className={btnChip} onClick={() => setPoiDialogOpen(true)}>
              + Nuovo POI
            </button>
          }
        >
          {poiDistancesLoading ? (
            <Spinner label="Calcolo distanze…" />
          ) : (poiDistances ?? []).length === 0 ? (
            <EmptyState
              title="Nessun POI censito"
              hint={!ll ? "Imposta prima le coordinate della location per calcolare le distanze." : "Crea un punto di interesse per vedere qui le distanze."}
            />
          ) : (
            <ul className="divide-y divide-black/[0.04] text-sm">
              {(poiDistances ?? []).map((d) => (
                <li key={d.poi.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="text-base leading-none" title={POI_KIND_LABELS[d.poi.kind]} aria-hidden>
                      {POI_KIND_ICONS[d.poi.kind]}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink">{d.poi.name}</p>
                      <p className="text-xs text-ink/45">
                        {[POI_KIND_LABELS[d.poi.kind], d.poi.city].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-ink/70">
                    <span className="font-medium text-ink">
                      {d.estimated ? "~" : ""}
                      {d.km} km
                    </span>
                    <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-medium">
                      {d.estimated ? "~" : ""}
                      {d.minutes_car} min in auto
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CollapsibleSection>

        {/* technical */}
        <CollapsibleSection storageKey="locdetail:tecnica" title="Scheda tecnica" defaultOpen>
          {loc.technical ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-3">
              <Info label="Potenza max" value={loc.technical.max_kw != null ? `${loc.technical.max_kw} kW` : undefined} />
              <Info label="Generatori" value={yesNo(loc.technical.generators)} />
              <Info label="Autoscala" value={yesNo(loc.technical.aerial_ladder)} />
              <Info label="Cucina" value={loc.technical.cooking} />
              <Info label="Mezzi pesanti" value={yesNo(loc.technical.heavy_vehicle_access)} />
              <Info label="Note" value={loc.technical.notes} full />
            </dl>
          ) : (
            <EmptyState title="Dati tecnici non compilati" />
          )}
        </CollapsibleSection>

        {/* setup & party */}
        <CollapsibleSection storageKey="locdetail:allestimenti" title="Allestimenti e party">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink/40">Allestimenti</h3>
              {loc.setup ? (
                <dl className="space-y-2 text-sm">
                  <Info label="Arredi" value={loc.setup.furniture} />
                  <Info label="Luci" value={loc.setup.lights} />
                  <Info label="Proiezioni" value={loc.setup.projections} />
                  <Info label="Palco" value={loc.setup.stage} />
                  <Info label="Audio" value={loc.setup.audio} />
                  {(loc.setup.constraints ?? []).length > 0 && (
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-ink/40">Vincoli</dt>
                      <dd>
                        <ul className="mt-1 list-inside list-disc text-ink/75">
                          {loc.setup.constraints!.map((c, i) => (
                            <li key={i}>{c}</li>
                          ))}
                        </ul>
                      </dd>
                    </div>
                  )}
                </dl>
              ) : (
                <p className="text-sm text-ink/40">Non compilato</p>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink/40">Party</h3>
              {loc.party ? (
                <dl className="space-y-2 text-sm">
                  <Info
                    label="Indoor"
                    value={
                      loc.party.indoor?.allowed
                        ? `Consentito${loc.party.indoor.music_until ? ` · musica fino alle ${loc.party.indoor.music_until}` : ""}`
                        : "Non consentito"
                    }
                  />
                  <Info
                    label="Outdoor"
                    value={
                      loc.party.outdoor?.allowed
                        ? `Consentito${loc.party.outdoor.music_until ? ` · musica fino alle ${loc.party.outdoor.music_until}` : ""}`
                        : "Non consentito"
                    }
                  />
                  <Info label="Limite dB" value={loc.party.db_limit != null ? `${loc.party.db_limit} dB` : undefined} />
                  {(loc.party.structural_constraints ?? []).length > 0 && (
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-ink/40">Vincoli strutturali</dt>
                      <dd>
                        <ul className="mt-1 list-inside list-disc text-ink/75">
                          {loc.party.structural_constraints!.map((c, i) => (
                            <li key={i}>{c}</li>
                          ))}
                        </ul>
                      </dd>
                    </div>
                  )}
                </dl>
              ) : (
                <p className="text-sm text-ink/40">Non compilato</p>
              )}
            </div>
          </div>
        </CollapsibleSection>

        {/* suppliers */}
        <CollapsibleSection
          storageKey="locdetail:fornitori"
          title={`Fornitori (${loc.suppliers.length})`}
          action={
            <button className={btnChip} onClick={() => setSupplierOpen(true)}>
              + Aggiungi fornitore
            </button>
          }
        >
          {loc.suppliers.length === 0 ? (
            <p className="text-sm text-ink/40">Nessun fornitore collegato</p>
          ) : (
            <ul className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
              {loc.suppliers.map((s) => (
                <li key={s.id} className="rounded-lg bg-tint/50 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-ink">{s.company.name}</p>
                    <button
                      className="shrink-0 rounded-lg px-1.5 py-0.5 text-sm text-ink/30 transition hover:bg-red-50 hover:text-red-600"
                      title="Rimuovi fornitore"
                      disabled={removeSupplier.isPending}
                      onClick={() => {
                        if (window.confirm(`Scollegare ${s.company.name} da questa location?`)) removeSupplier.mutate(s.id);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge className="bg-berry/5 text-berry border-berry/15">{s.category.replaceAll("_", " ")}</Badge>
                    <Badge
                      className={
                        s.requirement === "obbligatorio"
                          ? "bg-red-100 text-red-700 border-red-200"
                          : "bg-emerald-100 text-emerald-800 border-emerald-200"
                      }
                    >
                      {s.requirement}
                    </Badge>
                  </div>
                  {s.contact && (
                    <p className="mt-1.5 text-xs text-ink/60">
                      Referente: <span className="font-medium text-ink/80">{s.contact.first_name} {s.contact.last_name}</span>
                      {[s.contact.phone, s.contact.email].filter(Boolean).length > 0 &&
                        ` · ${[s.contact.phone, s.contact.email].filter(Boolean).join(" · ")}`}
                    </p>
                  )}
                  {s.conditions && <p className="mt-1 text-xs text-ink/60">{s.conditions}</p>}
                </li>
              ))}
            </ul>
          )}
        </CollapsibleSection>

        {/* contacts */}
        <CollapsibleSection
          storageKey="locdetail:referenti"
          title={`Referenti (${loc.contacts.length})`}
          action={
            <button className={btnChip} onClick={() => setContactOpen(true)}>
              + Aggiungi referente
            </button>
          }
        >
          {loc.contacts.length === 0 ? (
            <p className="text-sm text-ink/40">Nessun referente</p>
          ) : (
            <ul className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
              {loc.contacts.map((c, i) => (
                <li key={`${c.contact.id}-${i}`} className="rounded-lg bg-tint/50 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-ink">
                        {c.contact.first_name} {c.contact.last_name}
                      </p>
                      <p className="text-xs text-ink/50">
                        {c.role}
                        {c.company ? ` · ${c.company.name}` : ""}
                      </p>
                      <p className="mt-1 text-xs text-ink/60">
                        {[c.contact.phone, c.contact.email].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <button
                      className="shrink-0 rounded-lg px-1.5 py-0.5 text-sm text-ink/30 transition hover:bg-red-50 hover:text-red-600"
                      title="Rimuovi referente"
                      disabled={removeContact.isPending}
                      onClick={() => {
                        if (window.confirm(`Scollegare ${c.contact.first_name} ${c.contact.last_name} da questa location?`))
                          removeContact.mutate(c.contact.id);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CollapsibleSection>

        {/* price lists */}
        <CollapsibleSection storageKey="locdetail:listini" title="Listini">
          {loc.price_lists.length === 0 ? (
            <EmptyState title="Nessun listino" />
          ) : (
            <div className="space-y-5">
              {loc.price_lists.map((pl) => (
                <div key={pl.id}>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-ink">{pl.name}</h3>
                    <span className="text-xs text-ink/45">
                      {pl.valid_from ? `valido ${formatDate(pl.valid_from)} → ${formatDate(pl.valid_to)}` : ""}
                    </span>
                    {pl.extracted_by_ai && <Badge className="bg-gold/15 text-yellow-800 border-gold/30">estratto con AI</Badge>}
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-berry/10 text-left text-xs font-semibold uppercase tracking-wide text-ink/50">
                        <th className="py-1.5 pr-3">Voce</th>
                        <th className="py-1.5 pr-3 text-right">Prezzo</th>
                        <th className="py-1.5 pr-3">Unità</th>
                        <th className="py-1.5">Note</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-berry/5">
                      {pl.items.map((it, i) => (
                        <tr key={i}>
                          <td className="py-2 pr-3 text-ink">{it.voce}</td>
                          <td className="py-2 pr-3 text-right font-medium text-ink">{formatMoney(it.prezzo)}</td>
                          <td className="py-2 pr-3 text-ink/60">{it.unita ?? "—"}</td>
                          <td className="py-2 text-ink/60">{[it.note, it.stagionalita].filter(Boolean).join(" · ") || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {pl.payment_terms && (
                    <p className="mt-2 text-xs text-ink/50">
                      Pagamenti: {pl.payment_terms.acconto_pct != null ? `acconto ${pl.payment_terms.acconto_pct}%` : ""}
                      {pl.payment_terms.saldo ? ` · ${pl.payment_terms.saldo}` : ""}
                      {pl.payment_terms.metodi?.length ? ` · ${pl.payment_terms.metodi.join(", ")}` : ""}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>

        {/* usage */}
        <CollapsibleSection storageKey="locdetail:utilizzo" title="Utilizzo in progetti ed eventi">
          {(usage ?? []).length === 0 ? (
            <EmptyState title="Mai proposta o utilizzata finora" />
          ) : (
            <ul className="divide-y divide-berry/5 text-sm">
              {(usage ?? []).map((u, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div>
                    <Link href={`/projects/${u.project.id}/events/${u.event.id}`} className="font-semibold text-berry hover:underline">
                      {u.event.name}
                    </Link>
                    <span className="ml-2 text-ink/50">· {u.project.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-ink/50">{formatDate(u.event.date_start)}</span>
                    <Badge className={EL_STATUS_CLASSES[u.status]}>{EL_STATUS_LABELS[u.status]}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CollapsibleSection>

        {/* project notes */}
        <CollapsibleSection storageKey="locdetail:note" title="Note di progetto">
          {(loc.project_notes ?? []).length === 0 ? (
            <p className="text-sm text-ink/40">Nessuna nota specifica di progetto</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {(loc.project_notes ?? []).map((n, i) => (
                <li key={i} className="rounded-lg border-l-4 border-gold bg-gold/5 px-3 py-2.5">
                  <p className="text-xs font-semibold text-ink/60">
                    {n.project_name}
                    {n.event_name ? ` · ${n.event_name}` : ""}
                  </p>
                  <p className="mt-1 text-ink/80">{n.notes}</p>
                </li>
              ))}
            </ul>
          )}
        </CollapsibleSection>

        {loc.impressions && (
          <CollapsibleSection storageKey="locdetail:impressioni" title="Impressioni">
            <p className="text-sm italic leading-relaxed text-ink/70">“{loc.impressions}”</p>
          </CollapsibleSection>
        )}

        {/* history */}
        <CollapsibleSection storageKey="locdetail:cronologia" title="Cronologia">
          {(history ?? []).length === 0 ? (
            <EmptyState title="Nessuna attività registrata" />
          ) : (
            <ol className="relative ml-2 space-y-4 border-l border-berry/15 pl-5">
              {(history ?? []).map((h) => (
                <li key={h.id} className="relative">
                  <span className="absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full bg-rose" />
                  <p className="text-xs text-ink/45">{formatDateTime(h.date)}</p>
                  <p className="text-sm font-semibold text-ink">{h.title}</p>
                  {h.description && <p className="text-sm text-ink/60">{h.description}</p>}
                </li>
              ))}
            </ol>
          )}
        </CollapsibleSection>

        {/* full map */}
        {ll && (
          <div id="mappa">
            <CollapsibleSection storageKey="locdetail:mappa" title="Mappa">
              <MapView markers={[{ id: loc.id, lng: ll[0], lat: ll[1], label: loc.name, sub: loc.city ?? undefined }]} height={320} />
            </CollapsibleSection>
          </div>
        )}
      </div>

      <AddSupplierDialog locationId={id} open={supplierOpen} onClose={() => setSupplierOpen(false)} />
      <AddContactDialog locationId={id} open={contactOpen} onClose={() => setContactOpen(false)} />
      <PoiDialog
        open={poiDialogOpen}
        onClose={() => setPoiDialogOpen(false)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["poi-distances", id] })}
      />
      <ConfirmDialog
        {...deleteFlow.dialogProps}
        title="Eliminare la location?"
        message={
          <>
            <span className="font-semibold text-ink">{loc.name}</span> e i suoi dati (spazi, media, listini)
            verranno eliminati definitivamente.
          </>
        }
      />
    </div>
  );
}

// ---- hero pieces ------------------------------------------------------------

/** Cover: prima foto (URL presigned) → static map thumb → placeholder tint. */
function HeroCover({ loc }: { loc: LocationDetail }) {
  const photo = loc.media.find((m) => m.kind === "foto");
  const photoQ = useQuery({
    queryKey: ["media-url", photo?.id ?? "none"],
    queryFn: () => api.getMediaUrl(photo!.id),
    enabled: !!photo,
    staleTime: MEDIA_URL_STALE_MS,
    gcTime: MEDIA_URL_STALE_MS,
    retry: 1,
  });
  const [thumbBroken, setThumbBroken] = useState(false);

  let content: React.ReactNode;
  if (photo && photoQ.data) {
    content = (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoQ.data}
        alt={photo.filename ?? `Foto di ${loc.name}`}
        className="absolute inset-0 h-full w-full object-cover"
      />
    );
  } else if (photo && photoQ.isLoading) {
    content = <div className="absolute inset-0 animate-pulse bg-rose/10" />;
  } else if (!thumbBroken) {
    content = (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={api.mapThumbUrl(loc.id)}
        alt={`Mappa di ${loc.name}`}
        onError={() => setThumbBroken(true)}
        className="absolute inset-0 h-full w-full object-cover"
      />
    );
  } else {
    content = (
      <div className="absolute inset-0 flex items-center justify-center bg-tint">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-16 w-16 text-rose/50"
          aria-hidden
        >
          <path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 12h.01M9 15h.01M15 9h.01M15 12h.01M15 15h.01M10 21v-3h4v3" />
        </svg>
      </div>
    );
  }

  return <div className="relative h-56 w-full overflow-hidden bg-tint sm:h-72 lg:h-auto lg:min-h-[340px]">{content}</div>;
}

/** Mini-mappa statica nel pannello info; si nasconde se il thumb non esiste. */
function PanelMapThumb({ loc, href, external }: { loc: LocationDetail; href: string; external: boolean }) {
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      title="Apri la mappa"
      className="mt-4 block overflow-hidden rounded-lg border border-berry/10 transition hover:border-berry/30"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={api.mapThumbUrl(loc.id)}
        alt={`Mappa di ${loc.name}`}
        loading="lazy"
        onError={() => setBroken(true)}
        className="h-28 w-full object-cover"
      />
    </a>
  );
}

function StatCard({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-2xl border border-hairline bg-white px-4 py-3 shadow-soft">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight text-ink">{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-ink/50" title={sub}>{sub}</p>}
    </div>
  );
}

/** Entry di utilizzo più recente (per data inizio evento). */
function latestUsage(usage?: UsageEntry[]): UsageEntry | null {
  const dated = (usage ?? []).filter((u) => u.event.date_start);
  if (dated.length === 0) return null;
  return dated.reduce((best, u) => (u.event.date_start! > best.event.date_start! ? u : best));
}

/** Prepend https:// when the stored website has no scheme. */
function normalizeUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url.replace(/^\/\//, "")}`;
}

/** Display-friendly hostname (falls back to the raw value if unparsable). */
function hostnameOf(url: string): string {
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function Info({ label, value, full = false }: { label: string; value?: string | null; full?: boolean }) {
  if (!value) return null;
  return (
    <div className={full ? "md:col-span-2" : undefined}>
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink/40">{label}</dt>
      <dd className="mt-0.5 text-ink/80">{value}</dd>
    </div>
  );
}
