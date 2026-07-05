// Token storage + demo-mode flags (client-side only).

export const DEMO_ENV = process.env.NEXT_PUBLIC_DEMO === "1";

const TOKEN_KEY = "venuescout_token";
const DEMO_KEY = "venuescout_demo";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
}

/** True when demo mode is active: forced via env or triggered by API fallback. */
export function isDemoActive(): boolean {
  if (DEMO_ENV) return true;
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(DEMO_KEY) === "1";
}

export function activateDemo(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(DEMO_KEY, "1");
  window.dispatchEvent(new Event("venuescout:demo"));
}

/** Whether the user can access the app (has token or demo mode). */
export function isAuthenticated(): boolean {
  return isDemoActive() || !!getToken();
}
