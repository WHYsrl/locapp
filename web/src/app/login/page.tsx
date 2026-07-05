"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as api from "@/lib/api";
import { activateDemo, isAuthenticated, setToken } from "@/lib/auth";
import { btnPrimary, inputCls, labelCls } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated()) router.replace("/");
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.login(email, password);
      setToken(res.token);
      router.replace("/");
    } catch {
      setError("Credenziali non valide o servizio non disponibile.");
    } finally {
      setLoading(false);
    }
  };

  const enterDemo = () => {
    activateDemo();
    setToken("demo-token");
    router.replace("/");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-berry to-berry-dark p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold text-2xl font-black text-berry">V</span>
          <div>
            <h1 className="text-2xl font-bold text-white">
              Venue<span className="text-gold">Scout</span>
            </h1>
            <p className="text-sm text-white/60">Scouting location per eventi</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-2xl bg-white p-8 shadow-2xl">
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
          <button
            type="button"
            onClick={enterDemo}
            className="w-full rounded-lg border border-gold/40 bg-gold/10 px-4 py-2 text-sm font-semibold text-yellow-800 transition hover:bg-gold/20"
          >
            Entra in modalità demo
          </button>
          <p className="text-center text-xs text-ink/40">
            La modalità demo usa dati di esempio e non richiede il backend.
          </p>
        </form>
      </div>
    </div>
  );
}
