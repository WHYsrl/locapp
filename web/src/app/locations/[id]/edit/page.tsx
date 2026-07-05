"use client";

import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import LocationForm from "@/components/LocationForm";
import { PageHeader, Spinner } from "@/components/ui";
import type { LocationBase } from "@/lib/types";

export default function EditLocationPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const qc = useQueryClient();

  const { data: loc, isLoading } = useQuery({
    queryKey: ["location", id],
    queryFn: () => api.getLocation(id),
    enabled: !!id,
  });

  const mutation = useMutation({
    mutationFn: (payload: Partial<LocationBase>) => api.updateLocation(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["location", id] });
      qc.invalidateQueries({ queryKey: ["locations"] });
      router.push(`/locations/${id}`);
    },
  });

  if (isLoading || !loc) return <Spinner />;

  return (
    <div>
      <PageHeader title={`Modifica — ${loc.name}`} subtitle="Aggiorna la scheda base della location." />
      {mutation.isError && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">Errore durante il salvataggio. Riprova.</p>
      )}
      <LocationForm
        initial={loc}
        onSubmit={(payload) => mutation.mutate(payload)}
        submitting={mutation.isPending}
        submitLabel="Salva modifiche"
        onCancel={() => router.back()}
      />
    </div>
  );
}
