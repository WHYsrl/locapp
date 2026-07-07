"use client";

// Shared state machine for the delete flows: first DELETE without force; on
// 409 the server message is surfaced in the ConfirmDialog ("Elimina
// comunque") and the next confirm retries with force=true.

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";

export function useDeleteFlow({
  doDelete,
  onDeleted,
  forcible = true,
}: {
  doDelete: (force: boolean) => Promise<void>;
  onDeleted: () => void;
  /** false per le risorse senza flusso force (es. eventi: cascata diretta). */
  forcible?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (force: boolean) => doDelete(force),
    onSuccess: () => {
      setIsOpen(false);
      setConflict(null);
      onDeleted();
    },
    onError: (err) => {
      if (forcible && err instanceof ApiError && err.status === 409) setConflict(err.message);
    },
  });

  const err = mutation.error;
  const isHandled409 = forcible && err instanceof ApiError && err.status === 409;

  return {
    /** Apre il dialog resettando lo stato del flusso. */
    open: () => {
      setConflict(null);
      mutation.reset();
      setIsOpen(true);
    },
    /** Da spargere su <ConfirmDialog {...dialogProps} title=… message=… /> */
    dialogProps: {
      open: isOpen,
      pending: mutation.isPending,
      warning: conflict ?? undefined,
      confirmLabel: conflict ? "Elimina comunque" : "Elimina",
      error:
        mutation.isError && !isHandled409
          ? err instanceof ApiError
            ? err.message
            : "Errore durante l'eliminazione. Riprova."
          : undefined,
      onConfirm: () => mutation.mutate(!!conflict),
      onClose: () => {
        setIsOpen(false);
        setConflict(null);
      },
    },
  };
}
