"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as api from "@/lib/api";
import { consumeSessionExpired, isAuthenticated, setToken } from "@/lib/auth";
import { btnPrimary, inputCls, labelCls } from "@/components/ui";

// ---- minimal typings for Google Identity Services (script-tag loaded) ------

interface GsiButtonConfig {
  theme?: "outline" | "filled_blue" | "filled_black";
  size?: "large" | "medium" | "small";
  locale?: string;
  width?: number;
  text?: "signin_with" | "continue_with";
  shape?: "pill" | "rectangular";
}

interface GsiId {
  initialize(config: { client_id: string; callback: (resp: { credential: string }) => void }): void;
  renderButton(parent: HTMLElement, options: GsiButtonConfig): void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GsiId } };
  }
}

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const GSI_SRC = "https://accounts.google.com/gsi/client";

/**
 * Official Google button (GIS). The script is loaded only when
 * NEXT_PUBLIC_GOOGLE_CLIENT_ID is set. 403 → show the backend message;
 * 503 sso_not_configured → hide the button and log.
 */
function GoogleSignIn({ onLoggedIn }: { onLoggedIn: () => void }) {
  const slotRef = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleCredential = useCallback(
    async (resp: { credential: string }) => {
      setError(null);
      setPending(true);
      try {
        const res = await api.loginWithGoogle(resp.credential);
        setToken(res.token);
        onLoggedIn();
      } catch (err) {
        if (err instanceof api.ApiError && err.status === 503) {
          console.warn("Google SSO non configurato sul backend:", err.message);
          setHidden(true);
        } else if (err instanceof api.ApiError && err.status === 403) {
          setError(err.message);
        } else if (err instanceof api.NetworkError) {
          setError("Impossibile raggiungere il server — riprova.");
        } else {
          setError("Errore durante l'accesso con Google. Riprova.");
        }
      } finally {
        setPending(false);
      }
    },
    [onLoggedIn]
  );

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || hidden) return;

    let cancelled = false;
    const render = () => {
      const gsi = window.google?.accounts?.id;
      if (cancelled || !gsi || !slotRef.current) return;
      gsi.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleCredential });
      slotRef.current.innerHTML = "";
      gsi.renderButton(slotRef.current, {
        theme: "outline",
        size: "large",
        locale: "it",
        shape: "pill",
        width: 320,
      });
    };

    if (window.google?.accounts?.id) {
      render();
      return;
    }
    let script = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    if (!script) {
      script = document.createElement("script");
      script.src = GSI_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", render);
    return () => {
      cancelled = true;
      script?.removeEventListener("load", render);
    };
  }, [handleCredential, hidden]);

  if (!GOOGLE_CLIENT_ID || hidden) return null;

  return (
    <div>
      <div ref={slotRef} className="flex min-h-[44px] justify-center" />
      {pending && <p className="mt-2 text-center text-xs text-ink/45">Accesso con Google in corso…</p>}
      {error && <p className="mt-2 text-center text-sm text-red-600">{error}</p>}
      <div className="my-5 flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-hairline" />
        <span className="text-xs font-medium uppercase tracking-wide text-ink/40">oppure</span>
        <span className="h-px flex-1 bg-hairline" />
      </div>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (consumeSessionExpired()) setNotice("Sessione scaduta, accedi di nuovo.");
    if (isAuthenticated()) router.replace("/");
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      const res = await api.login(email, password);
      setToken(res.token);
      router.replace("/");
    } catch (err) {
      if (err instanceof api.NetworkError) {
        setError("Impossibile raggiungere il server — riprova.");
      } else if (err instanceof api.ApiError && err.status === 401) {
        setError("Credenziali non valide.");
      } else {
        setError("Errore durante l'accesso. Riprova.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-berry to-berry-dark p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold text-2xl font-black text-berry shadow-lg">
            V
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Venue<span className="text-gold">Scout</span>
            </h1>
            <p className="text-sm text-white/60">Scouting location per eventi</p>
          </div>
        </div>
        <div className="rounded-2xl border border-white/20 bg-white/90 p-8 shadow-2xl backdrop-blur-xl">
          {notice && (
            <p className="mb-4 rounded-xl bg-gold/15 px-3 py-2 text-sm font-medium text-yellow-800">{notice}</p>
          )}

          <GoogleSignIn onLoggedIn={() => router.replace("/")} />

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className={labelCls}>Email</label>
              <input
                className={inputCls}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@agenzia.it"
                required
              />
            </div>
            <div>
              <label className={labelCls}>Password</label>
              <input
                className={inputCls}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button className={`${btnPrimary} w-full justify-center`} disabled={loading}>
              {loading ? "Accesso in corso…" : "Accedi"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
