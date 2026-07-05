// Token storage (client-side only).

const TOKEN_KEY = "venuescout_token";
const EXPIRED_KEY = "venuescout_session_expired";

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

/** Mark that the session expired (401): the login page shows a message. */
export function flagSessionExpired(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(EXPIRED_KEY, "1");
}

/** Read-and-clear the session-expired flag. */
export function consumeSessionExpired(): boolean {
  if (typeof window === "undefined") return false;
  const expired = window.sessionStorage.getItem(EXPIRED_KEY) === "1";
  if (expired) window.sessionStorage.removeItem(EXPIRED_KEY);
  return expired;
}

/** Whether the user can access the app (has a token). */
export function isAuthenticated(): boolean {
  return !!getToken();
}
