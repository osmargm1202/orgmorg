import http from "node:http"
import { AddressInfo } from "node:net"
import { createInternalNeonAuth } from "@neondatabase/neon-js/auth"
import open from "open"
import { clearSession, loadConfig, loadSession, saveSession, type StoredSession } from "../config.js"

const LOGIN_TIMEOUT_MS = 180_000
const START_PATH = "/auth/start"
const CALLBACK_PATH = "/auth/callback"
const COMPLETE_PATH = "/auth/complete"
const LOCALHOST_HOSTNAME = "localhost"
const NEON_AUTH_BROWSER_SDK_URL = "https://esm.sh/@neondatabase/neon-js@0.2.0-beta.1/auth"
const NEON_AUTH_SESSION_COOKIE_CANDIDATES = [
  "__Secure-better-auth.session_token",
  "__Secure-neonauth.session_token",
  "better-auth.session_token",
  "neonauth.session_token",
] as const
/** Neon Auth monta Better Auth en la base; la ruta es /get-session, no /api/auth/get-session */
const NEON_AUTH_GET_SESSION_PATH = "get-session"
const NEON_AUTH_TOKEN_PATH = "token"

interface RawSessionUser {
  id?: string
  email?: string | null
  name?: string | null
}

interface RawSessionRecord {
  id?: string
  token?: string
  expires_at?: number
  expiresAt?: number | string | Date
  createdAt?: string
  updatedAt?: string
  user?: RawSessionUser | null
}

interface RawSessionPayload {
  user?: RawSessionUser | null
  session?: RawSessionRecord | null
}

interface RawSessionResult {
  payload: unknown
  jwtToken?: string | null
}

export interface RunOAuthLoginOptions {
  allowBrowser?: boolean
  preferExistingBrowserSession?: boolean
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function normalizeTokenValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null
}

function normalizeExpiresAtValue(value: unknown): number | null {
  return typeof value === "number"
    ? value
    : typeof value === "string" && value.trim().length > 0
      ? Math.floor(new Date(value).getTime() / 1000)
      : value instanceof Date
        ? Math.floor(value.getTime() / 1000)
        : null
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")
  return Buffer.from(padded, "base64").toString("utf-8")
}

function getJwtExpiry(accessToken: string | null): number | null {
  if (!accessToken) return null
  try {
    const [, payload] = accessToken.split(".")
    if (!payload) return null
    const parsed = JSON.parse(decodeBase64Url(payload)) as { exp?: unknown }
    return typeof parsed.exp === "number" ? parsed.exp : null
  } catch {
    return null
  }
}

function looksLikeJwt(value: string | null): boolean {
  return Boolean(value && value.split(".").length === 3)
}

function resolveRawSessionPayload(raw: unknown): RawSessionPayload {
  if (typeof raw !== "object" || raw == null) {
    throw new Error("La respuesta del login no contiene una sesión válida.")
  }

  if ("data" in raw && typeof raw.data === "object" && raw.data != null) {
    return raw.data as RawSessionPayload
  }

  return raw as RawSessionPayload
}

function normalizeSessionUser(payload: RawSessionPayload, fallbackUser: StoredSession["user"] | null) {
  const user = payload.user ?? payload.session?.user ?? null
  const userId = typeof user?.id === "string" && user.id.trim().length > 0 ? user.id : fallbackUser?.id ?? null
  if (!userId) {
    throw new Error("No se recibió usuario desde Neon Auth.")
  }

  return {
    id: userId,
    email:
      typeof user?.email === "string"
        ? user.email
        : user?.email === null
          ? null
          : fallbackUser?.email ?? null,
    name:
      typeof user?.name === "string"
        ? user.name
        : user?.name === null
          ? null
          : fallbackUser?.name ?? null,
  }
}

function normalizeCallbackData(raw: unknown, provider: string, jwtToken?: string | null): StoredSession {
  const payload = resolveRawSessionPayload(raw)
  const session = payload.session ?? null
  const sessionToken = normalizeTokenValue(session?.token)
  if (!sessionToken) {
    throw new Error("No se recibió session token desde Neon Auth.")
  }

  const accessToken = normalizeTokenValue(jwtToken)

  return {
    sessionToken,
    sessionId: typeof session?.id === "string" && session.id.trim().length > 0 ? session.id : null,
    sessionExpiresAt: normalizeExpiresAtValue(session?.expiresAt ?? session?.expires_at ?? null),
    accessToken,
    expiresAt: getJwtExpiry(accessToken),
    provider,
    createdAt:
      typeof session?.createdAt === "string" && session.createdAt.trim().length > 0
        ? session.createdAt
        : new Date().toISOString(),
    updatedAt:
      typeof session?.updatedAt === "string" && session.updatedAt.trim().length > 0
        ? session.updatedAt
        : null,
    user: normalizeSessionUser(payload, null),
  }
}

function normalizeRehydratedSession(
  raw: unknown,
  currentSession: StoredSession,
  jwtToken?: string | null
): StoredSession {
  const payload = resolveRawSessionPayload(raw)
  const session = payload.session ?? null
  const accessToken = normalizeTokenValue(jwtToken)

  return {
    sessionToken: currentSession.sessionToken,
    sessionId:
      typeof session?.id === "string" && session.id.trim().length > 0
        ? session.id
        : currentSession.sessionId ?? null,
    sessionExpiresAt: normalizeExpiresAtValue(
      session?.expiresAt ?? session?.expires_at ?? currentSession.sessionExpiresAt ?? null
    ),
    accessToken,
    expiresAt: getJwtExpiry(accessToken),
    provider: currentSession.provider,
    createdAt:
      typeof session?.createdAt === "string" && session.createdAt.trim().length > 0
        ? session.createdAt
        : currentSession.createdAt,
    updatedAt:
      typeof session?.updatedAt === "string" && session.updatedAt.trim().length > 0
        ? session.updatedAt
        : currentSession.updatedAt ?? null,
    user: normalizeSessionUser(payload, currentSession.user),
  }
}

function buildAuthUrl(authUrl: string, endpoint: string): string {
  const normalized = authUrl.endsWith("/") ? authUrl : `${authUrl}/`
  return new URL(endpoint.replace(/^\/+/, ""), normalized).toString()
}

function buildSessionCookieHeader(cookieName: string, sessionToken: string): string {
  return `${cookieName}=${encodeURIComponent(sessionToken)}`
}

function createStoredSessionAuth(authUrl: string, sessionToken: string, cookieName: string) {
  return createInternalNeonAuth(authUrl, {
    fetchOptions: {
      headers: {
        Cookie: buildSessionCookieHeader(cookieName, sessionToken),
      },
    },
  } as Parameters<typeof createInternalNeonAuth>[1])
}

function getResponseErrorMessage(response: { error?: { message?: string } | null }): string | null {
  return typeof response.error?.message === "string" && response.error.message.trim().length > 0
    ? response.error.message
    : null
}

async function tryRehydrateWithCookie(
  authUrl: string,
  sessionToken: string,
  cookieName: string,
  currentSession: StoredSession
): Promise<StoredSession | null> {
  const auth = createStoredSessionAuth(authUrl, sessionToken, cookieName)
  const sessionResponse = await auth.adapter.getSession()
  const responseError =
    typeof sessionResponse === "object" && sessionResponse != null && "error" in sessionResponse
      ? getResponseErrorMessage(sessionResponse as { error?: { message?: string } | null })
      : null

  if (responseError) {
    throw new Error(responseError)
  }

  const payload =
    typeof sessionResponse === "object" && sessionResponse != null && "data" in sessionResponse
      ? (sessionResponse.data as unknown)
      : sessionResponse

  let accessToken = normalizeTokenValue(
    typeof payload === "object" &&
      payload != null &&
      "session" in payload &&
      typeof payload.session === "object" &&
      payload.session != null &&
      "token" in payload.session
      ? payload.session.token
      : null
  )

  if (!looksLikeJwt(accessToken)) {
    accessToken = normalizeTokenValue(await auth.getJWTToken())
  }

  return normalizeRehydratedSession(payload, currentSession, accessToken)
}

/**
 * Fallback: fetch directo a get-session con Cookie o Bearer.
 * Útil cuando createInternalNeonAuth falla (ej. diferencias de path o cookie name).
 */
async function tryDirectGetSession(
  authUrl: string,
  sessionToken: string,
  currentSession: StoredSession
): Promise<StoredSession | null> {
  const url = buildAuthUrl(authUrl, NEON_AUTH_GET_SESSION_PATH)

  const attempts: { headers: Record<string, string> }[] = [
    { headers: { Cookie: `neonauth.session_token=${encodeURIComponent(sessionToken)}` } },
    { headers: { Cookie: `better-auth.session_token=${encodeURIComponent(sessionToken)}` } },
    { headers: { Authorization: `Bearer ${sessionToken}` } },
  ]

  for (const { headers } of attempts) {
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json", ...headers },
      })
      if (!res.ok) continue

      const raw = (await res.json()) as unknown
      const jwtFromHeader = res.headers.get("set-auth-jwt") ?? res.headers.get("Set-Auth-Jwt")

      const payload = resolveRawSessionPayload(raw)
      const session = payload.session ?? null
      if (!session || !session.token) continue

      let accessToken = normalizeTokenValue(jwtFromHeader) ?? normalizeTokenValue(session.token)
      if (!looksLikeJwt(accessToken)) {
        const tokenUrl = buildAuthUrl(authUrl, NEON_AUTH_TOKEN_PATH)
        const tokenRes = await fetch(tokenUrl, {
          method: "GET",
          headers: { Accept: "application/json", ...headers },
        })
        if (tokenRes.ok) {
          const tokenBody = (await tokenRes.json()) as { token?: string; data?: { token?: string } }
          accessToken =
            normalizeTokenValue(tokenBody.token) ??
            normalizeTokenValue(tokenBody.data?.token) ??
            accessToken
        }
      }

      if (looksLikeJwt(accessToken)) {
        return normalizeRehydratedSession(payload, currentSession, accessToken)
      }
    } catch {
      continue
    }
  }
  return null
}

export async function rehydrateSession(
  authUrl: string,
  currentSession: StoredSession
): Promise<StoredSession> {
  const sessionToken = normalizeTokenValue(currentSession.sessionToken)
  if (!sessionToken) {
    throw new Error("La sesión actual no tiene session token guardado.")
  }

  const errors: string[] = []
  for (const cookieName of NEON_AUTH_SESSION_COOKIE_CANDIDATES) {
    try {
      const result = await tryRehydrateWithCookie(
        authUrl,
        sessionToken,
        cookieName,
        currentSession
      )
      if (result) return result
    } catch (err) {
      errors.push(`${cookieName}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const directResult = await tryDirectGetSession(authUrl, sessionToken, currentSession)
  if (directResult) return directResult

  throw new Error(
    `No se pudo rehidratar la sesión. ${errors.join("; ")}`
  )
}

function buildLocalUrl(port: number, pathname: string): string {
  return `http://${LOCALHOST_HOSTNAME}:${port}${pathname}`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function buildStartHtml(
  authUrl: string,
  provider: string,
  callbackURL: string,
  preferExistingBrowserSession: boolean
): string {
  const safeAuthUrl = JSON.stringify(authUrl)
  const safeProvider = JSON.stringify(provider)
  const safeCallbackUrl = JSON.stringify(callbackURL)
  const safeSdkUrl = JSON.stringify(NEON_AUTH_BROWSER_SDK_URL)
  const safePreferExistingBrowserSession = JSON.stringify(preferExistingBrowserSession)

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>orgmorg login</title>
    <style>
      body {
        background: #07131f;
        color: #d9f7ff;
        font-family: sans-serif;
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .card {
        width: min(640px, 92vw);
        border: 1px solid #5be7ff;
        border-radius: 12px;
        padding: 24px;
        box-shadow: 0 0 24px rgba(91, 231, 255, 0.16);
      }
      h1 {
        margin-top: 0;
        color: #5be7ff;
      }
      button {
        background: #5be7ff;
        color: #07131f;
        border: 0;
        border-radius: 8px;
        padding: 12px 16px;
        font-weight: 700;
        cursor: pointer;
      }
      pre {
        white-space: pre-wrap;
        word-break: break-word;
        color: #ffb8b8;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>orgmorg</h1>
      <p id="status">Preparando inicio de sesión con Neon Auth...</p>
      <button id="retry" style="display:none">Intentar de nuevo</button>
      <pre id="error"></pre>
    </div>
    <script type="module">
      import { createAuthClient } from ${safeSdkUrl};

      const authUrl = ${safeAuthUrl};
      const provider = ${safeProvider};
      const callbackURL = ${safeCallbackUrl};
      const preferExistingBrowserSession = ${safePreferExistingBrowserSession};
      const status = document.getElementById("status");
      const errorNode = document.getElementById("error");
      const retryButton = document.getElementById("retry");

      function getErrorMessage(error) {
        return error instanceof Error ? error.message : String(error);
      }

      function buildEndpoint(pathname) {
        const normalizedPath = pathname.startsWith("/") ? pathname.slice(1) : pathname;
        return new URL(normalizedPath, authUrl.endsWith("/") ? authUrl : authUrl + "/").toString();
      }

      async function parseJsonLikeResponse(response) {
        const text = await response.text();
        if (!text) {
          return null;
        }
        try {
          return JSON.parse(text);
        } catch {
          return text;
        }
      }

      function extractPayload(raw) {
        if (!raw || typeof raw !== "object") {
          return null;
        }

        const payload =
          "data" in raw && raw.data && typeof raw.data === "object"
            ? raw.data
            : raw;

        const session = payload && typeof payload === "object" ? payload.session : null;
        const user =
          payload && typeof payload === "object" ? payload.user ?? session?.user ?? null : null;
        const token = session?.token ?? null;

        if (!session || !user?.id || !token) {
          return null;
        }

        return payload;
      }

      function extractJwtToken(raw) {
        if (!raw || typeof raw !== "object") {
          return null;
        }

        if ("token" in raw && typeof raw.token === "string" && raw.token.trim()) {
          return raw.token;
        }

        if (
          "data" in raw &&
          raw.data &&
          typeof raw.data === "object" &&
          "token" in raw.data &&
          typeof raw.data.token === "string" &&
          raw.data.token.trim()
        ) {
          return raw.data.token;
        }

        return null;
      }

      async function finish(body) {
        await fetch("${COMPLETE_PATH}", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      }

      async function notifyError(message) {
        try {
          await finish({ error: message });
        } catch {
          // Ignorar errores de notificación al CLI.
        }
      }

      async function fetchSessionBundle() {
        const sessionResponse = await fetch(buildEndpoint("${NEON_AUTH_GET_SESSION_PATH}"), {
          method: "GET",
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        const sessionJwtFromHeader = sessionResponse.headers.get("set-auth-jwt");
        const sessionBody = await parseJsonLikeResponse(sessionResponse);

        if (!sessionResponse.ok) {
          throw new Error(
            (typeof sessionBody === "string" && sessionBody) ||
              (sessionBody && typeof sessionBody === "object" && typeof sessionBody.message === "string"
                ? sessionBody.message
                : "No se pudo recuperar la sesión actual de Neon Auth.")
          );
        }

        const payload = extractPayload(sessionBody);
        if (!payload) {
          return null;
        }

        let jwtToken =
          typeof sessionJwtFromHeader === "string" && sessionJwtFromHeader.trim()
            ? sessionJwtFromHeader
            : null;

        if (!jwtToken) {
          const tokenResponse = await fetch(buildEndpoint("${NEON_AUTH_TOKEN_PATH}"), {
            method: "GET",
            credentials: "include",
            headers: { Accept: "application/json" },
          });
          const tokenBody = await parseJsonLikeResponse(tokenResponse);
          if (tokenResponse.ok) {
            jwtToken = extractJwtToken(tokenBody);
          }
        }

        return { payload, jwtToken };
      }

      async function tryReuseExistingSession() {
        if (!preferExistingBrowserSession) {
          return false;
        }

        status.textContent = "Buscando una sesión web existente...";

        try {
          const sessionBundle = await fetchSessionBundle();
          if (!sessionBundle?.payload) {
            return false;
          }

          status.textContent = "Sesión web recuperada. Ya puedes volver a la terminal.";
          await finish(sessionBundle);
          setTimeout(() => window.close(), 1200);
          return true;
        } catch {
          return false;
        }
      }

      async function startLogin() {
        retryButton.style.display = "none";
        errorNode.textContent = "";
        try {
          const auth = createAuthClient(authUrl);
          const reusedSession = await tryReuseExistingSession();
          if (reusedSession) {
            return;
          }

          status.textContent = "Redirigiendo al proveedor OAuth...";
          await auth.signIn.social({
            provider,
            callbackURL,
          });
        } catch (error) {
          const message = getErrorMessage(error);
          status.textContent = "No se pudo iniciar el login OAuth.";
          errorNode.textContent =
            message +
            "\\n\\nSi el error es 403, revisa en Neon Auth que localhost esté permitido y que el dominio/callback de desarrollo sea válido.";
          errorNode.textContent +=
            "\\n\\norgmorg solo usa login social OAuth. Si el problema aparece como fallo de sign-up/sign-in o policy, normalmente está en la configuración externa de Neon Auth y no en este repo.";
          retryButton.style.display = "inline-block";
          await notifyError(message);
        }
      }

      retryButton.addEventListener("click", () => {
        void startLogin();
      });

      void startLogin();
    </script>
  </body>
</html>`
}

function buildCallbackHtml(authUrl: string) {
  const safeAuthUrl = JSON.stringify(authUrl)
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>orgmorg login</title>
    <style>
      body {
        background: #07131f;
        color: #d9f7ff;
        font-family: sans-serif;
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .card {
        width: min(640px, 92vw);
        border: 1px solid #5be7ff;
        border-radius: 12px;
        padding: 24px;
        box-shadow: 0 0 24px rgba(91, 231, 255, 0.16);
      }
      h1 {
        margin-top: 0;
        color: #5be7ff;
      }
      pre {
        white-space: pre-wrap;
        word-break: break-word;
        color: #ffb8b8;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>orgmorg</h1>
      <p id="status">Validando sesión con Neon Auth...</p>
      <pre id="error"></pre>
    </div>
    <script type="module">
      const status = document.getElementById("status");
      const errorNode = document.getElementById("error");
      const authUrl = ${safeAuthUrl};
      const RETRY_DELAY_MS = 250;
      const MAX_SESSION_ATTEMPTS = 20;

      async function finish(body) {
        await fetch("${COMPLETE_PATH}", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      }

      function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
      }

      function getErrorMessage(error) {
        return error instanceof Error ? error.message : String(error);
      }

      function buildEndpoint(pathname) {
        const normalizedPath = pathname.startsWith("/") ? pathname.slice(1) : pathname;
        return new URL(normalizedPath, authUrl.endsWith("/") ? authUrl : authUrl + "/").toString();
      }

      async function parseJsonLikeResponse(response) {
        const text = await response.text();
        if (!text) {
          return null;
        }
        try {
          return JSON.parse(text);
        } catch {
          return text;
        }
      }

      function extractPayload(raw) {
        if (!raw || typeof raw !== "object") {
          return null;
        }

        const payload =
          "data" in raw && raw.data && typeof raw.data === "object"
            ? raw.data
            : raw;

        const session = payload && typeof payload === "object" ? payload.session : null;
        const user =
          payload && typeof payload === "object" ? payload.user ?? session?.user ?? null : null;
        const token = session?.token ?? null;

        if (!session || !user?.id || !token) {
          return null;
        }

        return payload;
      }

      function extractJwtToken(raw) {
        if (!raw || typeof raw !== "object") {
          return null;
        }

        if ("token" in raw && typeof raw.token === "string" && raw.token.trim()) {
          return raw.token;
        }

        if (
          "data" in raw &&
          raw.data &&
          typeof raw.data === "object" &&
          "token" in raw.data &&
          typeof raw.data.token === "string" &&
          raw.data.token.trim()
        ) {
          return raw.data.token;
        }

        return null;
      }

      async function waitForSession() {
        let lastMessage = "";

        for (let attempt = 0; attempt < MAX_SESSION_ATTEMPTS; attempt += 1) {
          try {
            const sessionResponse = await fetch(buildEndpoint("${NEON_AUTH_GET_SESSION_PATH}"), {
              method: "GET",
              credentials: "include",
              headers: { Accept: "application/json" },
            });
            const sessionJwtFromHeader = sessionResponse.headers.get("set-auth-jwt");
            const sessionBody = await parseJsonLikeResponse(sessionResponse);

            if (!sessionResponse.ok) {
              lastMessage =
                (typeof sessionBody === "string" && sessionBody) ||
                (sessionBody && typeof sessionBody === "object" && typeof sessionBody.message === "string"
                  ? sessionBody.message
                  : "HTTP " + sessionResponse.status);
            }

            const payload = extractPayload(sessionBody);
            if (payload) {
              let jwtToken =
                typeof sessionJwtFromHeader === "string" && sessionJwtFromHeader.trim()
                  ? sessionJwtFromHeader
                  : null;

              if (!jwtToken) {
                const tokenResponse = await fetch(buildEndpoint("${NEON_AUTH_TOKEN_PATH}"), {
                  method: "GET",
                  credentials: "include",
                  headers: { Accept: "application/json" },
                });
                const tokenBody = await parseJsonLikeResponse(tokenResponse);
                if (tokenResponse.ok) {
                  jwtToken = extractJwtToken(tokenBody);
                }
              }

              return { payload, jwtToken };
            }
          } catch (error) {
            lastMessage = getErrorMessage(error);
          }

          if (attempt < MAX_SESSION_ATTEMPTS - 1) {
            await sleep(RETRY_DELAY_MS);
          }
        }

        throw new Error(lastMessage || "No se pudo recuperar la sesión autenticada.");
      }

      async function main() {
        try {
          const result = await waitForSession();
          await finish(result);
          status.textContent = "Login completado. Ya puedes volver a la terminal.";
          setTimeout(() => window.close(), 1200);
        } catch (error) {
          const message = getErrorMessage(error);
          errorNode.textContent =
            "No fue posible completar el login automáticamente.\\n" +
            message +
            "\\n\\nVuelve a la terminal para ver el detalle.";
          status.textContent = "Falló la validación automática de la sesión.";
          await finish({ error: message });
        }
      }

      main();
    </script>
  </body>
</html>`
}

function readRequestBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on("data", (chunk: Buffer) => chunks.push(chunk))
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")))
    req.on("error", reject)
  })
}

export function formatSessionLabel(session: StoredSession | null): string {
  if (!session) return "Sin sesión"
  const identity = session.user.email ?? session.user.name ?? session.user.id
  return `${identity} (${session.provider})`
}

export function canOpenBrowserAutomatically(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY)
}

export async function runOAuthLogin(options: RunOAuthLoginOptions = {}): Promise<StoredSession> {
  const { allowBrowser = true, preferExistingBrowserSession = true } = options
  const config = await loadConfig()
  const provider = config.oauthProvider || "google"

  if (!allowBrowser) {
    throw new Error(
      "No hay una sesión válida y este comando se está ejecutando en modo no interactivo. Ejecuta `orgmorg login` desde una terminal interactiva y vuelve a intentar."
    )
  }

  const deferred = createDeferred<StoredSession>()
  let timeoutHandle: NodeJS.Timeout | null = null

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${LOCALHOST_HOSTNAME}`)
      if (req.method === "GET" && url.pathname === START_PATH) {
        const callbackURL = buildLocalUrl((server.address() as AddressInfo).port, CALLBACK_PATH)
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" })
        res.end(buildStartHtml(config.authUrl, provider, callbackURL, preferExistingBrowserSession))
        return
      }

      if (req.method === "GET" && url.pathname === CALLBACK_PATH) {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" })
        res.end(buildCallbackHtml(config.authUrl))
        return
      }

      if (req.method === "POST" && url.pathname === COMPLETE_PATH) {
        const rawBody = await readRequestBody(req)
        const body = rawBody
          ? (JSON.parse(rawBody) as { payload?: unknown; jwtToken?: string | null; error?: string })
          : {}
        if (body.error) {
          deferred.reject(new Error(body.error))
        } else {
          deferred.resolve(normalizeCallbackData(body.payload, provider, body.jwtToken))
        }
        res.writeHead(200, { "content-type": "application/json" })
        res.end(JSON.stringify({ ok: true }))
        return
      }

      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
      res.end("No encontrado")
    } catch (error) {
      deferred.reject(error)
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" })
      res.end(
        `Error inesperado: ${escapeHtml(error instanceof Error ? error.message : String(error))}`
      )
    }
  })

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, LOCALHOST_HOSTNAME, () => resolve())
  })

  const address = server.address()
  if (!address || typeof address === "string") {
    server.close()
    throw new Error("No se pudo abrir el servidor local para completar el login.")
  }

  const callbackURL = buildLocalUrl((address as AddressInfo).port, CALLBACK_PATH)

  try {
    const loginUrl = `${buildLocalUrl((address as AddressInfo).port, START_PATH)}?callbackURL=${encodeURIComponent(callbackURL)}`
    await open(loginUrl)

    const timeout = new Promise<StoredSession>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error("Tiempo de espera agotado para completar el login OAuth."))
      }, LOGIN_TIMEOUT_MS)
    })

    const session = await Promise.race([deferred.promise, timeout])
    await saveSession(session)
    return session
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle)
    }
    server.close()
  }
}

export async function getSessionStatus(): Promise<StoredSession | null> {
  return loadSession()
}

export async function logout(): Promise<void> {
  await clearSession()
}
