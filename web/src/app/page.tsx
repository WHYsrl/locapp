"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { Badge, Card, PageHeader, Spinner } from "@/components/ui";
import {
  EFFECTIVE_STATUS_CLASSES,
  EFFECTIVE_STATUS_LABELS,
  PROJECT_STATUS_CLASSES,
  PROJECT_STATUS_LABELS,
  formatDate,
  tagLabel,
} from "@/lib/labels";
import type { EffectiveStatus } from "@/lib/types";

const STATUSES: EffectiveStatus[] = ["da_visitare", "visitata", "proposta", "utilizzata"];

export default function DashboardPage() {
  const locationsQ = useQuery({ queryKey: ["locations", "all"], queryFn: () => api.listLocations() });
  const projectsQ = useQuery({ queryKey: ["projects"], queryFn: () => api.listProjects() });

  if (locationsQ.isLoading || projectsQ.isLoading) return <Spinner />;

  const locations = locationsQ.data ?? [];
  const projects = projectsQ.data ?? [];
  const byStatus = (s: EffectiveStatus) =>
    locations.filter((l) => (l.effective_status ?? l.visit_status) === s);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Panoramica di location e progetti"
        action={
          <Link href="/locations/new" className="rounded-lg bg-berry px-4 py-2 text-sm font-semibold text-white hover:bg-berry-dark">
            + Nuova location
          </Link>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Location" value={locations.length} />
        {STATUSES.map((s) => (
          <StatCard key={s} label={EFFECTIVE_STATUS_LABELS[s]} value={byStatus(s).length} />
        ))}
        <StatCard label="Progetti attivi" value={projects.filter((p) => p.status === "attivo").length} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Progetti recenti" action={<Link href="/projects" className="text-sm font-semibold text-berry hover:underline">Tutti →</Link>}>
          <ul className="divide-y divide-berry/5">
            {projects.slice(0, 5).map((p) => (
              <li key={p.id}>
                <Link href={`/projects/${p.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-tint/60">
                  <div>
                    <p className="font-semibold text-ink">{p.name}</p>
                    <p className="text-xs text-ink/50">
                      {p.client_name ?? "—"} · {p.events_count ?? 0} eventi · creato {formatDate(p.created_at)}
                    </p>
                  </div>
                  <Badge className={PROJECT_STATUS_CLASSES[p.status]}>{PROJECT_STATUS_LABELS[p.status]}</Badge>
                </Link>
              </li>
            ))}
            {projects.length === 0 && <li className="py-6 text-center text-sm text-ink/40">Nessun progetto</li>}
          </ul>
        </Card>

        <Card title="Location per stato" action={<Link href="/locations" className="text-sm font-semibold text-berry hover:underline">Tutte →</Link>}>
          <div className="space-y-4">
            {STATUSES.map((s) => {
              const items = byStatus(s);
              if (!items.length) return null;
              return (
                <div key={s}>
                  <div className="mb-2 flex items-center gap-2">
                    <Badge className={EFFECTIVE_STATUS_CLASSES[s]}>{EFFECTIVE_STATUS_LABELS[s]}</Badge>
                    <span className="text-xs text-ink/40">{items.length}</span>
                  </div>
                  <ul className="space-y-1">
                    {items.map((l) => (
                      <li key={l.id}>
                        <Link href={`/locations/${l.id}`} className="flex items-center justify-between rounded-lg px-3 py-1.5 text-sm hover:bg-tint">
                          <span className="font-medium text-ink">
                            {l.name}
                            {l.parent_name && <span className="ml-2 text-xs font-normal text-ink/40">in {l.parent_name}</span>}
                          </span>
                          <span className="text-xs text-ink/50">
                            {(l.smart_tags ?? []).slice(0, 2).map(tagLabel).join(", ")}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-berry/10 bg-white p-4 shadow-sm">
      <p className="text-2xl font-bold text-berry">{value}</p>
      <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-ink/50">{label}</p>
    </div>
  );
}
