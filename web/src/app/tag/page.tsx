"use client";

// Central smart tag management: create, rename (usage-safe, propagated to
// locations/projects/events), pick a color from the fixed palette, delete.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { Card, EmptyState, PageHeader, Spinner, btnPrimary, inputCls, labelCls } from "@/components/ui";
import { DEFAULT_TAG_COLOR, TAG_COLORS, tagLabel } from "@/lib/labels";
import type { SmartTag } from "@/lib/types";

export default function TagsPage() {
  const qc = useQueryClient();
  const { data: tags, isLoading } = useQuery({ queryKey: ["tags"], queryFn: () => api.listTags() });
  const { data: locations } = useQuery({ queryKey: ["locations", "all"], queryFn: () => api.listLocations() });
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: () => api.listProjects() });

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>(TAG_COLORS[0]);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["tags"] });
    qc.invalidateQueries({ queryKey: ["locations"] });
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["location"] });
    qc.invalidateQueries({ queryKey: ["project"] });
    qc.invalidateQueries({ queryKey: ["event"] });
  };

  const create = useMutation({
    mutationFn: () => api.createTag({ name: newName.trim(), color: newColor }),
    onSuccess: () => {
      setNewName("");
      invalidateAll();
    },
  });

  const usageOf = (name: string) => {
    const inLocations = (locations ?? []).filter((l) => (l.smart_tags ?? []).includes(name)).length;
    const inProjects = (projects ?? []).filter((p) => (p.tags ?? []).includes(name)).length;
    return { inLocations, inProjects };
  };

  return (
    <div>
      <PageHeader
        title="Smart tag"
        subtitle="Registro centrale dei tag: crea, rinomina (la modifica si propaga a location, progetti ed eventi), colora ed elimina."
      />

      <Card title="Nuovo tag" className="mb-6">
        <form
          className="flex flex-wrap items-end gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (newName.trim()) create.mutate();
          }}
        >
          <div className="min-w-56">
            <label className={labelCls}>Nome</label>
            <input
              className={inputCls}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="es. team_building"
            />
          </div>
          <div>
            <label className={labelCls}>Colore</label>
            <ColorPalette value={newColor} onChange={setNewColor} />
          </div>
          <button className={btnPrimary} disabled={!newName.trim() || create.isPending}>
            {create.isPending ? "Creazione…" : "+ Crea tag"}
          </button>
        </form>
        {create.isError && <p className="mt-2 text-sm text-red-600">Errore durante la creazione del tag.</p>}
      </Card>

      {isLoading ? (
        <Spinner />
      ) : (tags ?? []).length === 0 ? (
        <EmptyState title="Nessun tag nel registro" hint="Crea il primo tag oppure salvane uno da una scheda location." />
      ) : (
        <div className="space-y-3">
          {(tags ?? []).map((tag) => (
            <TagRow key={tag.id} tag={tag} usage={usageOf(tag.name)} onChanged={invalidateAll} />
          ))}
        </div>
      )}
    </div>
  );
}

function ColorPalette({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      {TAG_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          title={c}
          aria-label={`Colore ${c}`}
          className={`h-6 w-6 rounded-full border-2 transition ${
            value === c ? "scale-110 border-ink/60" : "border-transparent hover:scale-105"
          }`}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}

function TagRow({
  tag,
  usage,
  onChanged,
}: {
  tag: SmartTag;
  usage: { inLocations: number; inProjects: number };
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tag.name);
  const color = tag.color ?? DEFAULT_TAG_COLOR;

  const update = useMutation({
    mutationFn: (payload: { name?: string; color?: string | null }) => api.updateTag(tag.id, payload),
    onSuccess: () => {
      setEditing(false);
      onChanged();
    },
  });

  const remove = useMutation({
    mutationFn: () => api.deleteTag(tag.id),
    onSuccess: onChanged,
  });

  const totalUsage = usage.inLocations + usage.inProjects;

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-hairline bg-white px-5 py-3.5 shadow-soft">
      <span
        className="inline-flex items-center whitespace-nowrap rounded-full border px-3 py-1 text-sm font-medium"
        style={{ backgroundColor: `${color}14`, borderColor: `${color}55`, color }}
      >
        {tagLabel(tag.name)}
      </span>

      <span className="text-xs text-ink/50">
        {usage.inLocations} location · {usage.inProjects} progetti
      </span>

      <div className="ml-auto flex flex-wrap items-center gap-3">
        <ColorPalette value={color} onChange={(c) => update.mutate({ color: c })} />

        {editing ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim() && name.trim() !== tag.name) update.mutate({ name: name.trim() });
              else setEditing(false);
            }}
          >
            <input
              className="w-44 rounded-lg border border-rose/30 bg-white px-3 py-1.5 text-sm text-ink outline-none transition focus:border-berry focus:ring-2 focus:ring-berry/15"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <button
              className="rounded-lg bg-berry px-3 py-1.5 text-xs font-semibold text-white hover:bg-berry-dark disabled:opacity-50"
              disabled={update.isPending || !name.trim()}
            >
              {update.isPending ? "…" : "Salva"}
            </button>
            <button
              type="button"
              className="rounded-lg px-2 py-1.5 text-xs font-medium text-ink/50 hover:text-berry"
              onClick={() => {
                setName(tag.name);
                setEditing(false);
              }}
            >
              Annulla
            </button>
          </form>
        ) : (
          <button
            className="rounded-lg border border-berry/25 bg-white px-3 py-1.5 text-xs font-semibold text-berry transition hover:bg-berry/5"
            onClick={() => setEditing(true)}
            title="Rinomina (si propaga a tutte le schede che usano il tag)"
          >
            ✎ Rinomina
          </button>
        )}

        <button
          className="rounded-lg px-2.5 py-1.5 text-sm text-ink/35 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
          title="Elimina tag"
          disabled={remove.isPending}
          onClick={() => {
            const warn =
              totalUsage > 0
                ? `Il tag "${tag.name}" è usato in ${totalUsage} schede: verrà rimosso ovunque. Continuare?`
                : `Eliminare il tag "${tag.name}"?`;
            if (window.confirm(warn)) remove.mutate();
          }}
        >
          ✕
        </button>
      </div>
      {update.isError && <p className="w-full text-xs text-red-600">Errore durante l&apos;aggiornamento del tag.</p>}
    </div>
  );
}
