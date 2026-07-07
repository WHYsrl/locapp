// Google Drive access token via the Google Identity Services OAuth2 *token
// client* (implicit flow, popup). Used by the "Esporta in Google Slides"
// feature: the backend needs a drive.file-scoped access_token to create the
// presentation in the user's Drive.
//
// The GIS script is the same one the login page loads for SSO
// (https://accounts.google.com/gsi/client): we dedupe on the <script src>
// so it is loaded at most once per document.

const GIS_SRC = "https://accounts.google.com/gsi/client";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

/** Access tokens last ~1h: cache for 50 min to avoid repeated popups. */
const TOKEN_TTL_MS = 50 * 60 * 1000;

/** True when NEXT_PUBLIC_GOOGLE_CLIENT_ID is set (button enabled). */
export function isDriveConfigured(): boolean {
  return Boolean(CLIENT_ID);
}

// ---- minimal GIS oauth2 typings (script-tag loaded) -------------------------
// NOTE: no `declare global` here — the login page already augments
// Window.google with a narrower shape; we cast locally instead of merging.

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void;
}

interface GisOauth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (resp: TokenResponse) => void;
    error_callback?: (err: { type?: string; message?: string }) => void;
  }): TokenClient;
}

function gisOauth2(): GisOauth2 | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { google?: { accounts?: { oauth2?: GisOauth2 } } }).google
    ?.accounts?.oauth2;
}

// ---- script loader (deduped with the SSO loader via the src selector) -------

let gisLoading: Promise<void> | null = null;

function loadGisScript(): Promise<void> {
  if (gisOauth2()) return Promise.resolve();
  if (gisLoading) return gisLoading;

  gisLoading = new Promise<void>((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    if (!script) {
      script = document.createElement("script");
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    script.addEventListener(
      "load",
      () => {
        if (gisOauth2()) resolve();
        else reject(new Error("Impossibile inizializzare Google Identity Services."));
      },
      { once: true }
    );
    script.addEventListener(
      "error",
      () => {
        gisLoading = null; // allow retry
        reject(new Error("Impossibile caricare lo script di Google — controlla la connessione."));
      },
      { once: true }
    );
  });
  return gisLoading;
}

// ---- token cache -------------------------------------------------------------

let cachedToken: { token: string; expiresAt: number } | null = null;

function errorMessageFor(resp: TokenResponse): string {
  if (resp.error === "access_denied") {
    return "Autorizzazione Google negata — per esportare devi consentire l'accesso a Drive.";
  }
  return resp.error_description ?? "Errore durante l'autorizzazione Google. Riprova.";
}

/**
 * Returns a drive.file-scoped Google access token, opening the consent popup
 * when needed. Cached in memory ~50 min. Rejects with a user-facing Italian
 * message on missing client id, blocked popup or denied consent.
 */
export async function getDriveAccessToken(): Promise<string> {
  if (!CLIENT_ID) throw new Error("Client ID Google non configurato");
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;

  await loadGisScript();
  const oauth2 = gisOauth2();
  if (!oauth2) throw new Error("Impossibile inizializzare Google Identity Services.");

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const client = oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: (resp) => {
        if (settled) return;
        settled = true;
        if (resp.access_token) {
          const ttlMs = resp.expires_in
            ? Math.min(Math.max(resp.expires_in - 300, 60) * 1000, TOKEN_TTL_MS)
            : TOKEN_TTL_MS;
          cachedToken = { token: resp.access_token, expiresAt: Date.now() + ttlMs };
          resolve(resp.access_token);
        } else {
          reject(new Error(errorMessageFor(resp)));
        }
      },
      error_callback: (err) => {
        if (settled) return;
        settled = true;
        if (err.type === "popup_failed_to_open") {
          reject(new Error("Popup Google bloccato dal browser — consenti i popup per questo sito e riprova."));
        } else if (err.type === "popup_closed") {
          reject(new Error("Autorizzazione Google annullata — la finestra è stata chiusa."));
        } else {
          reject(new Error(err.message ?? "Errore durante l'autorizzazione Google. Riprova."));
        }
      },
    });
    client.requestAccessToken();
  });
}
