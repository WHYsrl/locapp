"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { Badge, Card, EmptyState, Modal, PageHeader, Spinner, btnPrimary, inputCls, labelCls } from "@/components/ui";
import { SUPPLIER_CATEGORIES } from "@/lib/labels";
import type { Company, CompanyKind, Contact } from "@/lib/types";

type Tab = "aziende" | "persone";

const KIND_LABELS: Record<CompanyKind, string> = {
  gestione: "Gestione location",
  fornitore: "Fornitore",
  entrambi: "Gestione + fornitore",
};

const KIND_CLASSES: Record<CompanyKind, string> = {
  gestione: "bg-sky-100 text-sky-800 border-sky-200",
  fornitore: "bg-emerald-100 text-emerald-800 border-emerald-200",
  entrambi: "bg-violet-100 text-violet-800 border-violet-200",
};

export default function ContattiPage() {
  const [tab, setTab] = useState<Tab>("aziende");
  const [q, setQ] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const [editCompany, setEditCompany] = useState<Company | "new" | null>(null);
  const [editContact, setEditContact] = useState<Contact | "new" | null>(null);

  const companiesQ = useQuery({ queryKey: ["companies", q], queryFn: () => api.listCompanies({ q: q || undefined }) });
  const contactsQ = useQuery({ queryKey: ["contacts", q], queryFn: () => api.listContacts({ q: q || undefined }) });

  return (
    <div>
      <PageHeader
        title="Contatti"
        subtitle="Anagrafica condivisa di aziende e persone: si inserisce una volta, si riusa ovunque."
        action={
          <button className={btnPrimary} onClick={() => (tab === "aziende" ? setEditCompany("new") : setEditContact("new"))}>
            + {tab === "aziende" ? "Nuova azienda" : "Nuova persona"}
          </button>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-lg border border-berry/20">
          <button
            onClick={() => setTab("aziende")}
            className={`px-4 py-2 text-sm font-semibold ${tab === "aziende" ? "bg-berry text-white" : "bg-white text-berry"}`}
          >
            Aziende
          </button>
          <button
            onClick={() => setTab("persone")}
            className={`px-4 py-2 text-sm font-semibold ${tab === "persone" ? "bg-berry text-white" : "bg-white text-berry"}`}
          >
            Persone
          </button>
        </div>
        <input className={`${inputCls} max-w-xs`} placeholder="Cerca…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          {tab === "aziende" ? (
            companiesQ.isLoading ? (
              <Spinner />
            ) : (companiesQ.data ?? []).length === 0 ? (
              <EmptyState title="Nessuna azienda" />
            ) : (
              <ul className="space-y-2">
                {(companiesQ.data ?? []).map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => setSelectedCompany(c.id)}
                      className={`w-full rounded-xl border bg-white p-4 text-left shadow-sm transition hover:border-berry/30 ${
                        selectedCompany === c.id ? "border-berry/50 ring-2 ring-berry/10" : "border-berry/10"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-bold text-ink">{c.name}</p>
                        <Badge className={KIND_CLASSES[c.kind]}>{KIND_LABELS[c.kind]}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-ink/50">
                        {[(c.supplier_categories ?? []).map((s) => s.replaceAll("_", " ")).join(", "), c.email, c.phone]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : contactsQ.isLoading ? (
            <Spinner />
          ) : (contactsQ.data ?? []).length === 0 ? (
            <EmptyState title="Nessuna persona" />
          ) : (
            <ul className="space-y-2">
              {(contactsQ.data ?? []).map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setSelectedContact(c.id)}
                    className={`w-full rounded-xl border bg-white p-4 text-left shadow-sm transition hover:border-berry/30 ${
                      selectedContact === c.id ? "border-berry/50 ring-2 ring-berry/10" : "border-berry/10"
                    }`}
                  >
                    <p className="font-bold text-ink">
                      {c.first_name} {c.last_name}
                    </p>
                    <p className="mt-1 text-xs text-ink/50">{[c.email, c.phone].filter(Boolean).join(" · ")}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          {tab === "aziende" && selectedCompany && (
            <CompanyDetailPanel id={selectedCompany} onEdit={(c) => setEditCompany(c)} />
          )}
          {tab === "persone" && selectedContact && (
            <ContactDetailPanel id={selectedContact} onEdit={(c) => setEditContact(c)} />
          )}
          {((tab === "aziende" && !selectedCompany) || (tab === "persone" && !selectedContact)) && (
            <EmptyState title="Seleziona una voce" hint="Clicca su un elemento della lista per vedere il dettaglio." />
          )}
        </div>
      </div>

      {editCompany && (
        <CompanyFormModal
          company={editCompany === "new" ? null : editCompany}
          onClose={() => setEditCompany(null)}
          onSaved={(id) => {
            setEditCompany(null);
            setSelectedCompany(id);
          }}
        />
      )}
      {editContact && (
        <ContactFormModal
          contact={editContact === "new" ? null : editContact}
          onClose={() => setEditContact(null)}
          onSaved={(id) => {
            setEditContact(null);
            setSelectedContact(id);
          }}
        />
      )}
    </div>
  );
}

function CompanyDetailPanel({ id, onEdit }: { id: string; onEdit: (c: Company) => void }) {
  const { data: company, isLoading } = useQuery({ queryKey: ["company", id], queryFn: () => api.getCompany(id) });
  if (isLoading || !company) return <Spinner />;
  return (
    <Card
      title={company.name}
      action={
        <button className="text-sm font-semibold text-berry hover:underline" onClick={() => onEdit(company)}>
          Modifica
        </button>
      }
    >
      <dl className="space-y-2 text-sm">
        <DetailRow label="Tipo" value={KIND_LABELS[company.kind]} />
        <DetailRow label="Categorie" value={(company.supplier_categories ?? []).map((s) => s.replaceAll("_", " ")).join(", ")} />
        <DetailRow label="P. IVA" value={company.vat_number} />
        <DetailRow label="Email" value={company.email} />
        <DetailRow label="Telefono" value={company.phone} />
        <DetailRow label="Sito" value={company.website} />
        <DetailRow label="Note" value={company.notes} />
      </dl>

      <h3 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wide text-ink/40">Persone</h3>
      {company.contacts.length === 0 ? (
        <p className="text-sm text-ink/40">Nessuna persona collegata</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {company.contacts.map((cc, i) => (
            <li key={i} className="rounded-lg bg-tint/50 px-3 py-2">
              <p className="font-semibold text-ink">
                {cc.contact.first_name} {cc.contact.last_name}
                {cc.role && <span className="ml-2 text-xs font-normal text-ink/50">{cc.role}</span>}
              </p>
              <p className="text-xs text-ink/55">{[cc.contact.phone, cc.contact.email].filter(Boolean).join(" · ")}</p>
            </li>
          ))}
        </ul>
      )}

      <h3 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wide text-ink/40">Location collegate</h3>
      {(company.linked_locations ?? []).length === 0 ? (
        <p className="text-sm text-ink/40">Nessuna location collegata</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {(company.linked_locations ?? []).map((l, i) => (
            <li key={i} className="flex items-center justify-between gap-2">
              <Link href={`/locations/${l.id}`} className="font-medium text-berry hover:underline">
                {l.name}
              </Link>
              <span className="text-xs text-ink/50">
                {l.category?.replaceAll("_", " ")}
                {l.requirement ? ` · ${l.requirement}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ContactDetailPanel({ id, onEdit }: { id: string; onEdit: (c: Contact) => void }) {
  const { data: contact, isLoading } = useQuery({ queryKey: ["contact", id], queryFn: () => api.getContact(id) });
  if (isLoading || !contact) return <Spinner />;
  return (
    <Card
      title={`${contact.first_name} ${contact.last_name}`}
      action={
        <button className="text-sm font-semibold text-berry hover:underline" onClick={() => onEdit(contact)}>
          Modifica
        </button>
      }
    >
      <dl className="space-y-2 text-sm">
        <DetailRow label="Email" value={contact.email} />
        <DetailRow label="Telefono" value={contact.phone} />
        <DetailRow label="Note" value={contact.notes} />
      </dl>

      <h3 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wide text-ink/40">Aziende</h3>
      {(contact.companies ?? []).length === 0 ? (
        <p className="text-sm text-ink/40">Nessuna azienda collegata</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {(contact.companies ?? []).map((cc, i) => (
            <li key={i} className="text-ink/80">
              {cc.company.name}
              {cc.role && <span className="ml-2 text-xs text-ink/50">{cc.role}</span>}
            </li>
          ))}
        </ul>
      )}

      <h3 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wide text-ink/40">Referente per le location</h3>
      {(contact.linked_locations ?? []).length === 0 ? (
        <p className="text-sm text-ink/40">Nessuna location collegata</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {(contact.linked_locations ?? []).map((l, i) => (
            <li key={i} className="flex items-center justify-between gap-2">
              <Link href={`/locations/${l.id}`} className="font-medium text-berry hover:underline">
                {l.name}
              </Link>
              <span className="text-xs text-ink/50">{l.role}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-3">
      <dt className="w-24 shrink-0 text-xs font-semibold uppercase tracking-wide text-ink/40">{label}</dt>
      <dd className="text-ink/80">{value}</dd>
    </div>
  );
}

function CompanyFormModal({
  company,
  onClose,
  onSaved,
}: {
  company: Company | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(company?.name ?? "");
  const [kind, setKind] = useState<CompanyKind>(company?.kind ?? "fornitore");
  const [categories, setCategories] = useState<string[]>(company?.supplier_categories ?? []);
  const [email, setEmail] = useState(company?.email ?? "");
  const [phone, setPhone] = useState(company?.phone ?? "");
  const [website, setWebsite] = useState(company?.website ?? "");
  const [vat, setVat] = useState(company?.vat_number ?? "");
  const [notes, setNotes] = useState(company?.notes ?? "");

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name,
        kind,
        supplier_categories: categories,
        email: email || null,
        phone: phone || null,
        website: website || null,
        vat_number: vat || null,
        notes: notes || null,
      };
      return company ? api.updateCompany(company.id, payload) : api.createCompany(payload);
    },
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ["companies"] });
      qc.invalidateQueries({ queryKey: ["company", c.id] });
      onSaved(c.id);
    },
  });

  return (
    <Modal open onClose={onClose} title={company ? `Modifica ${company.name}` : "Nuova azienda"}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) save.mutate();
        }}
      >
        <div>
          <label className={labelCls}>Nome *</label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className={labelCls}>Tipo</label>
          <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as CompanyKind)}>
            <option value="gestione">Gestione location</option>
            <option value="fornitore">Fornitore</option>
            <option value="entrambi">Entrambi</option>
          </select>
        </div>
        {kind !== "gestione" && (
          <div>
            <label className={labelCls}>Categorie fornitore</label>
            <div className="flex flex-wrap gap-2">
              {SUPPLIER_CATEGORIES.map((cat) => {
                const active = categories.includes(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategories(active ? categories.filter((c) => c !== cat) : [...categories, cat])}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                      active ? "border-berry bg-berry text-white" : "border-rose/30 bg-white text-ink/60"
                    }`}
                  >
                    {cat.replaceAll("_", " ")}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Email</label>
            <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Telefono</label>
            <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Sito web</label>
            <input className={inputCls} value={website} onChange={(e) => setWebsite(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>P. IVA</label>
            <input className={inputCls} value={vat} onChange={(e) => setVat(e.target.value)} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Note</label>
          <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {save.isError && <p className="text-sm text-red-600">Errore durante il salvataggio.</p>}
        <button className={btnPrimary} disabled={!name.trim() || save.isPending}>
          {save.isPending ? "Salvataggio…" : "Salva"}
        </button>
      </form>
    </Modal>
  );
}

function ContactFormModal({
  contact,
  onClose,
  onSaved,
}: {
  contact: Contact | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [firstName, setFirstName] = useState(contact?.first_name ?? "");
  const [lastName, setLastName] = useState(contact?.last_name ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [notes, setNotes] = useState(contact?.notes ?? "");

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        first_name: firstName,
        last_name: lastName,
        email: email || null,
        phone: phone || null,
        notes: notes || null,
      };
      return contact ? api.updateContact(contact.id, payload) : api.createContact(payload);
    },
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["contact", c.id] });
      onSaved(c.id);
    },
  });

  return (
    <Modal open onClose={onClose} title={contact ? "Modifica persona" : "Nuova persona"}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (firstName.trim() && lastName.trim()) save.mutate();
        }}
      >
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Nome *</label>
            <input className={inputCls} value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </div>
          <div>
            <label className={labelCls}>Cognome *</label>
            <input className={inputCls} value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Telefono</label>
            <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Note</label>
          <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {save.isError && <p className="text-sm text-red-600">Errore durante il salvataggio.</p>}
        <button className={btnPrimary} disabled={!firstName.trim() || !lastName.trim() || save.isPending}>
          {save.isPending ? "Salvataggio…" : "Salva"}
        </button>
      </form>
    </Modal>
  );
}
