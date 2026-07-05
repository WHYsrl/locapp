"use client";

// Modal to link a supplier company to a location: pick from the registry
// (searchable, kind=fornitore) or create a new company inline, choose
// category, requirement, optional specific contact and conditions.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { SUPPLIER_CATEGORIES } from "@/lib/labels";
import type { CompanyKind } from "@/lib/types";
import { Field, Modal, btnPrimary, inputCls } from "./ui";

export default function AddSupplierDialog({
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
  const [companyId, setCompanyId] = useState("");
  const [category, setCategory] = useState("catering");
  const [requirement, setRequirement] = useState<"obbligatorio" | "consigliato">("consigliato");
  const [contactId, setContactId] = useState("");
  const [conditions, setConditions] = useState("");
  // inline new company
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<CompanyKind>("fornitore");

  const { data: companies } = useQuery({
    queryKey: ["companies", "fornitore", q],
    queryFn: () => api.listCompanies({ q: q || undefined, kind: "fornitore" }),
    enabled: open && mode === "registry",
  });

  const { data: companyDetail } = useQuery({
    queryKey: ["company", companyId],
    queryFn: () => api.getCompany(companyId),
    enabled: open && mode === "registry" && !!companyId,
  });

  const reset = () => {
    setMode("registry");
    setQ("");
    setCompanyId("");
    setCategory("catering");
    setRequirement("consigliato");
    setContactId("");
    setConditions("");
    setNewName("");
    setNewKind("fornitore");
  };

  const link = useMutation({
    mutationFn: async () => {
      let cid = companyId;
      if (mode === "new") {
        const created = await api.createCompany({
          name: newName.trim(),
          kind: newKind,
          supplier_categories: [category],
        });
        cid = created.id;
      }
      return api.addLocationSupplier(locationId, {
        company_id: cid,
        contact_id: mode === "registry" && contactId ? contactId : undefined,
        category,
        requirement,
        conditions: conditions.trim() || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["location", locationId] });
      qc.invalidateQueries({ queryKey: ["companies"] });
      reset();
      onClose();
    },
  });

  const canSubmit = mode === "registry" ? !!companyId : newName.trim().length > 1;

  return (
    <Modal open={open} onClose={onClose} title="Aggiungi fornitore">
      <div className="space-y-4">
        <div className="flex gap-2">
          {(
            [
              ["registry", "Da anagrafica"],
              ["new", "Nuova azienda"],
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
            <Field label="Cerca azienda (kind: fornitore)">
              <input
                className={inputCls}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Nome azienda…"
              />
            </Field>
            <Field label="Azienda *">
              <select
                className={inputCls}
                value={companyId}
                onChange={(e) => {
                  setCompanyId(e.target.value);
                  setContactId("");
                }}
              >
                <option value="">— Seleziona azienda —</option>
                {(companies ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.supplier_categories?.length ? ` (${c.supplier_categories.join(", ")})` : ""}
                  </option>
                ))}
              </select>
            </Field>
            {companyId && (
              <Field label="Referente specifico dell'azienda (opzionale)">
                <select className={inputCls} value={contactId} onChange={(e) => setContactId(e.target.value)}>
                  <option value="">— Nessun referente specifico —</option>
                  {(companyDetail?.contacts ?? []).map(({ contact, role }) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.first_name} {contact.last_name}
                      {role ? ` — ${role}` : ""}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Nome azienda *" className="md:col-span-2">
              <input
                className={inputCls}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="es. Rossi Catering S.r.l."
              />
            </Field>
            <Field label="Tipo">
              <select className={inputCls} value={newKind} onChange={(e) => setNewKind(e.target.value as CompanyKind)}>
                <option value="fornitore">Fornitore</option>
                <option value="gestione">Gestione</option>
                <option value="entrambi">Entrambi</option>
              </select>
            </Field>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Categoria">
            <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
              {SUPPLIER_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Vincolo">
            <select
              className={inputCls}
              value={requirement}
              onChange={(e) => setRequirement(e.target.value as "obbligatorio" | "consigliato")}
            >
              <option value="consigliato">Consigliato</option>
              <option value="obbligatorio">Obbligatorio</option>
            </select>
          </Field>
        </div>

        <Field label="Condizioni (opzionale)">
          <textarea
            className={inputCls}
            rows={2}
            value={conditions}
            onChange={(e) => setConditions(e.target.value)}
            placeholder="es. Esclusiva per eventi oltre 100 pax…"
          />
        </Field>

        {link.isError && <p className="text-sm text-red-600">Errore durante il collegamento del fornitore.</p>}
        <button className={btnPrimary} disabled={!canSubmit || link.isPending} onClick={() => link.mutate()}>
          {link.isPending ? "Collegamento…" : "Collega fornitore"}
        </button>
      </div>
    </Modal>
  );
}
