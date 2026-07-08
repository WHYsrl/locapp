"use client";

// Contesto di lavoro ("sto lavorando sul progetto X / evento Y"), impostato
// esplicitamente con il bottone "Lavora su questo" sulle pagine di progetto
// ed evento. Persistito in localStorage così sopravvive al reload; mostrato
// come chip nella topbar (Shell) e usato per preselezionare l'evento nel
// dialog "Aggiungi a evento".

import { createContext, useCallback, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "venuescout:workctx";

export interface WorkContextValue {
  projectId: string;
  projectName: string;
  eventId?: string;
  eventName?: string;
}

interface WorkContextApi {
  ctx: WorkContextValue | null;
  setCtx: (value: WorkContextValue) => void;
  clearCtx: () => void;
}

const Ctx = createContext<WorkContextApi>({
  ctx: null,
  setCtx: () => {},
  clearCtx: () => {},
});

function readStored(): WorkContextValue | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WorkContextValue>;
    if (typeof parsed.projectId !== "string" || typeof parsed.projectName !== "string") return null;
    return {
      projectId: parsed.projectId,
      projectName: parsed.projectName,
      eventId: typeof parsed.eventId === "string" ? parsed.eventId : undefined,
      eventName: typeof parsed.eventName === "string" ? parsed.eventName : undefined,
    };
  } catch {
    return null;
  }
}

export function WorkContextProvider({ children }: { children: React.ReactNode }) {
  const [ctx, setCtxState] = useState<WorkContextValue | null>(null);

  // Idratazione lato client (evita mismatch SSR: il primo render è vuoto).
  useEffect(() => {
    setCtxState(readStored());
  }, []);

  const setCtx = useCallback((value: WorkContextValue) => {
    setCtxState(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
      // storage pieno/negato: il contesto resta valido solo in memoria
    }
  }, []);

  const clearCtx = useCallback(() => {
    setCtxState(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  return <Ctx.Provider value={{ ctx, setCtx, clearCtx }}>{children}</Ctx.Provider>;
}

export function useWorkContext(): WorkContextApi {
  return useContext(Ctx);
}
