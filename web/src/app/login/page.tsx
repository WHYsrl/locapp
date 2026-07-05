"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as api from "@/lib/api";
import { consumeSessionExpired, isAuthenticated, setToken } from "@/lib/auth";
import { btnPrimary, inputCls, labelCls } from "@/components/ui";

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
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold text-2xl font-black text-berry">V</span>
          <div>
            <h1 className="text-2xl font-bold text-white">
              Venue<span className="text-gold">Scout</span>
            </h1>
            <p className="text-sm text-white/60">Scouting location per eventi</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-2xl bg-white p-8 shadow-2xl">
          {notice && (
            <p className="rounded-lg bg-gold/15 px-3 py-2 text-sm font-medium text-yellow-800">{notice}</p>
          )}
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
  );
}
