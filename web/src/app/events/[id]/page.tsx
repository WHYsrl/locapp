"use client";

// Redirect di comodo: /events/:id → /projects/:projectId/events/:id.
// Serve dove conosciamo solo l'id dell'evento (es. repository presentazioni).

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { EmptyState, Spinner } from "@/components/ui";

export default function EventRedirectPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();

  const { data, isError } = useQuery({
    queryKey: ["event", id],
    queryFn: () => api.getEvent(id),
    enabled: !!id,
  });

  useEffect(() => {
    if (data) router.replace(`/projects/${data.project_id}/events/${data.id}`);
  }, [data, router]);

  if (isError) {
    return <EmptyState title="Evento non trovato" hint="L'evento potrebbe essere stato eliminato." />;
  }
  return <Spinner label="Apertura evento…" />;
}
