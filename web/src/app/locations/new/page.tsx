"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import LocationForm from "@/components/LocationForm";
import { PageHeader } from "@/components/ui";
import type { LocationBase } from "@/lib/types";

export default function NewLocationPage() {
  const router = useRouter();
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: (payload: Partial<LocationBase>) => api.createLocation(payload),
    onSuccess: (loc) => {
      qc.invalidateQueries({ queryKey: ["locations"] });
      router.push(`/locations/${loc.id}`);
    },
  });

  return (
    <div>
      <PageHeader title="Nuova location" subtitle="Compila la scheda base: gli spazi e i referenti si aggiungono dopo la creazione." />
      {mutation.isError && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">Errore durante il salvataggio. Riprova.</p>
      )}
      <LocationForm
        onSubmit={(payload) => mutation.mutate(payload)}
        submitting={mutation.isPending}
        submitLabel="Crea location"
        onCancel={() => router.back()}
      />
    </div>
  );
}
