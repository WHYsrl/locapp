"use client";

// Reusable smart-tag multi-select bound to the central tag registry
// (GET /tags), with inline "crea nuovo tag". Used on location forms,
// location/project/event detail pages.

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { DEFAULT_TAG_COLOR, tagLabel } from "@/lib/labels";

/** Map tag name → color from the registry (cached query, shared app-wide). */
export function useTagColors(): Record<string, string> {
  const { data: tags } = useQuery({ queryKey: ["tags"], queryFn: () => api.listTags() });
  return useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of tags ?? []) map[t.name] = t.color ?? DEFAULT_TAG_COLOR;
    return map;
  }, [tags]);
}

/** Colored read-only tag chip. */
export function TagChip({ name, color }: { name: string; color?: string }) {
  const c = color ?? DEFAULT_TAG_COLOR;
  return (
    <span
      className="inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `${c}14`, borderColor: `${c}55`, color: c }}
    >
      {tagLabel(name)}
    </span>
  );
}

export default function TagPicker({
  value,
  onChange,
  compact = false,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  /** Compact layout for inline editing in page headers. */
  compact?: boolean;
}) {
  const qc = useQueryClient();
  const { data: tags, isLoading } = useQuery({ queryKey: ["tags"], queryFn: () => api.listTags() });
  const [newName, setNewName] = useState("");

  const create = useMutation({
    mutationFn: (name: string) => api.createTag({ name }),
    onSuccess: (tag) => {
      qc.invalidateQueries({ queryKey: ["tags"] });
      if (!value.includes(tag.name)) onChange([...value, tag.name]);
      setNewName("");
    },
  });

  // Registry names + any already-selected names not (yet) in the registry.
  const names = useMemo(() => {
    const out = (tags ?? []).map((t) => t.name);
    for (const v of value) if (!out.includes(v)) out.push(v);
    return out;
  }, [tags, value]);

  const colorOf = (name: string) => (tags ?? []).find((t) => t.name === name)?.color ?? DEFAULT_TAG_COLOR;

  const toggle = (name: string) =>
    onChange(value.includes(name) ? value.filter((t) => t !== name) : [...value, name]);

  const submitNew = () => {
    const name = newName.trim();
    if (!name || create.isPending) return;
    create.mutate(name);
  };

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div className="flex flex-wrap gap-2">
        {isLoading && <span className="text-xs text-ink/40">Caricamento tag…</span>}
        {names.map((name) => {
          const active = value.includes(name);
          const color = colorOf(name);
          return (
            <button
              key={name}
              type="button"
              onClick={() => toggle(name)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                active ? "text-white" : "bg-white text-ink/60 hover:text-ink"
              }`}
              style={
                active
                  ? { backgroundColor: color, borderColor: color }
                  : { borderColor: `${color}66` }
              }
            >
              {tagLabel(name)}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <input
          className="w-full max-w-56 rounded-lg border border-rose/30 bg-white px-3 py-1.5 text-xs text-ink outline-none transition focus:border-berry focus:ring-2 focus:ring-berry/15 placeholder:text-ink/35"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitNew();
            }
          }}
          placeholder="Crea nuovo tag…"
        />
        <button
          type="button"
          onClick={submitNew}
          disabled={!newName.trim() || create.isPending}
          className="rounded-lg border border-berry/25 bg-white px-3 py-1.5 text-xs font-semibold text-berry transition hover:bg-berry/5 disabled:opacity-50"
        >
          {create.isPending ? "Creazione…" : "+ Crea"}
        </button>
      </div>
    </div>
  );
}
