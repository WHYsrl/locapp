"use client";

// Modal to link a referent (contact) to a location: pick from the registry
// (searchable) or create a new contact inline, then link with a role.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { Field, Modal, btnPrimary, inputCls } from "./ui";

export default function AddContactDialog({
  locationId,
  open,
  onClose,
}: {
  locationId: string;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"registry" | "new">("registry");
  const [q, setQ] = useState("");
  const [contactId, setContactId] = useState("");
  const [role, setRole] = useState("");
  const [companyId, setCompanyId] = useState("");
  // inline new contact
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const { data: contacts } = useQuery({
    queryKey: ["contacts", q],
    queryFn: () => api.listContacts({ q: q || undefined }),
    enabled: open && mode === "registry",
  });

  const { data: companies } = useQuery({
    queryKey: ["companies", "all"],
    queryFn: () => api.listCompanies(),
    enabled: open,
  });

  const reset = () => {
    setMode("registry");
    setQ("");
    setContactId("");
    setRole("");
    setCompanyId("");
    setFirstName("");
    setLastName("");
    setPhone("");
    setEmail("");
  };

  const link = useMutation({
    mutationFn: async () => {
      let cid = contactId;
      if (mode === "new") {
        const created = await api.createContact({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
        });
        cid = created.id;
      }
      return api.addLocationContact(locationId, {
        contact_id: cid,
        role: role.trim() || "Referente",
        company_id: companyId || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["location", locationId] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      reset();
      onClose();
    },
  });

  const canSubmit =
    mode === "registry" ? !!contactId : firstName.trim().length > 0 && lastName.trim().length > 0;

  return (
    <Modal open={open} onClose={onClose} title="Aggiungi referente">
      <div className="space-y-4">
        <div className="flex gap-2">
          {(
            [
              ["registry", "Da anagrafica"],
              ["new", "Nuovo contatto"],
            ] as ["registry" | "new", string][]
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                mode === m ? "bg-berry text-white" : "bg-tint text-ink/60 hover:text-berry"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "registry" ? (
          <>
            <Field label="Cerca contatto">
              <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome o cognome…" />
            </Field>
            <Field label="Contatto *">
              <select className={inputCls} value={contactId} onChange={(e) => setContactId(e.target.value)}>
                <option value="">— Seleziona contatto —</option>
                {(contacts ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.first_name} {c.last_name}
                    {c.email ? ` · ${c.email}` : ""}
                  </option>
                ))}
              </select>
            </Field>
          </>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Nome *">
              <input className={inputCls} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </Field>
            <Field label="Cognome *">
              <input className={inputCls} value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </Field>
            <Field label="Telefono">
              <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+39 …" />
            </Field>
            <Field label="Email">
              <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Ruolo">
            <input
              className={inputCls}
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="es. Referente eventi"
            />
          </Field>
          <Field label="Azienda (opzionale)">
            <select className={inputCls} value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">— Nessuna —</option>
              {(companies ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {link.isError && <p className="text-sm text-red-600">Errore durante il collegamento del referente.</p>}
        <button className={btnPrimary} disabled={!canSubmit || link.isPending} onClick={() => link.mutate()}>
          {link.isPending ? "Collegamento…" : "Collega referente"}
        </button>
      </div>
    </Modal>
  );
}
