"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import * as api from "@/lib/api";
import MapView from "@/components/MapView";
import { Badge, Card, EmptyState, Spinner, Stars, Tag } from "@/components/ui";
import {
  CONFIGURATIONS,
  CONFIG_LABELS,
  EFFECTIVE_STATUS_CLASSES,
  EFFECTIVE_STATUS_LABELS,
  EL_STATUS_CLASSES,
  EL_STATUS_LABELS,
  formatDate,
  formatDateTime,
  formatMoney,
  tagLabel,
  yesNo,
} from "@/lib/labels";
import { lngLatOf } from "@/lib/types";

export default function LocationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

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

  if (isLoading || !loc) return <Spinner />;

  const st = loc.effective_status ?? loc.visit_status;
  const ll = lngLatOf(loc);
  const usedConfigs = CONFIGURATIONS.filter((c) => loc.spaces.some((s) => s.capacities[c] != null));

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

      {/* header */}
      <div className="mb-6 rounded-xl border border-berry/10 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-ink">{loc.name}</h1>
              <Badge className={EFFECTIVE_STATUS_CLASSES[st]}>{EFFECTIVE_STATUS_LABELS[st]}</Badge>
            </div>
            <p className="mt-1 text-sm text-ink/60">
              {[loc.address_line, loc.postal_code, loc.city, loc.province ? `(${loc.province})` : null]
                .filter(Boolean)
                .join(", ") || "Indirizzo non impostato"}
              {loc.parent && <span className="ml-2 text-xs text-ink/40">· interna a {loc.parent.name}</span>}
            </p>
            {loc.summary && <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink/75">{loc.summary}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {(loc.smart_tags ?? []).map((t) => (
                <Tag key={t}>{tagLabel(t)}</Tag>
              ))}
              <span className="ml-2 text-sm text-ink/50">Accessibilità:</span>
              <Stars value={loc.accessibility_rating} />
            </div>
            {loc.accessibility_notes && <p className="mt-1 text-xs text-ink/50">{loc.accessibility_notes}</p>}
            {loc.availability_rules && (
              <p className="mt-2 text-xs font-medium text-yellow-800">Disponibilità: {loc.availability_rules}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <Link
              href={`/locations/${loc.id}/edit`}
              className="rounded-lg border border-berry/25 bg-white px-4 py-2 text-sm font-semibold text-berry hover:bg-berry/5"
            >
              Modifica scheda
            </Link>
            {loc.google_maps_url && (
              <a href={loc.google_maps_url} target="_blank" rel="noreferrer" className="text-xs font-medium text-berry hover:underline">
                Apri in Google Maps ↗
              </a>
            )}
          </div>
        </div>
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* spaces */}
          <Card title="Spazi e capienze">
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
          </Card>

          {/* logistics */}
          <Card
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
          </Card>

          {/* technical */}
          <Card title="Scheda tecnica">
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
          </Card>

          {/* setup & party */}
          <Card title="Allestimenti e party">
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
          </Card>

          {/* price lists */}
          <Card title="Listini">
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
          </Card>

          {/* usage */}
          <Card title="Utilizzo in progetti ed eventi">
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
          </Card>

          {/* history */}
          <Card title="Cronologia">
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
          </Card>
        </div>

        {/* sidebar */}
        <div className="space-y-6">
          {ll && (
            <Card title="Mappa">
              <MapView markers={[{ id: loc.id, lng: ll[0], lat: ll[1], label: loc.name, sub: loc.city ?? undefined }]} height={240} />
            </Card>
          )}

          <Card title="Referenti">
            {loc.contacts.length === 0 ? (
              <p className="text-sm text-ink/40">Nessun referente</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {loc.contacts.map((c, i) => (
                  <li key={i} className="rounded-lg bg-tint/50 px-3 py-2.5">
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
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Fornitori">
            {loc.suppliers.length === 0 ? (
              <p className="text-sm text-ink/40">Nessun fornitore collegato</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {loc.suppliers.map((s) => (
                  <li key={s.id} className="rounded-lg bg-tint/50 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-ink">{s.company.name}</p>
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
                    <p className="text-xs text-ink/50">{s.category.replaceAll("_", " ")}</p>
                    {s.conditions && <p className="mt-1 text-xs text-ink/60">{s.conditions}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Media">
            {loc.media.length === 0 ? (
              <p className="text-sm text-ink/40">Nessun media</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {loc.media.map((m) => (
                  <div
                    key={m.id}
                    className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-berry/10 bg-tint/60 p-2 text-center"
                  >
                    <span className="text-2xl">
                      {m.kind === "foto" ? "🖼" : m.kind === "video" ? "🎬" : m.kind === "planimetria" ? "📐" : m.kind === "listino" ? "🧾" : "📄"}
                    </span>
                    <span className="line-clamp-2 text-[11px] leading-tight text-ink/60">{m.filename ?? m.kind}</span>
                    <span className="text-[10px] uppercase tracking-wide text-ink/35">{m.category ?? m.kind}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Note di progetto">
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
          </Card>

          {loc.impressions && (
            <Card title="Impressioni">
              <p className="text-sm italic leading-relaxed text-ink/70">“{loc.impressions}”</p>
            </Card>
          )}

        </div>
      </div>
    </div>
  );
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
