import http from "node:http"
import { AddressInfo } from "node:net"
import open from "open"
import {
  clearSession,
  loadConfig,
  loadSession,
  saveSession,
  type StoredSession,
} from "../config.js"

const LOGIN_TIMEOUT_MS = 180_000
const START_PATH = "/auth/start"
const CALLBACK_PATH = "/auth/callback"
const COMPLETE_PATH = "/auth/complete"
const LOCALHOST_HOSTNAME = "localhost"
const NEON_AUTH_BROWSER_SDK_URL = "https://esm.sh/@neondatabase/auth@0.2.0-beta.1"

interface RawSessionUser {
  id?: string
  email?: string | null
  name?: string | null
}

interface RawSessionPayload {
  user?: RawSessionUser | null
  session?: {
    token?: string
    access_token?: string
    accessToken?: string
    expires_at?: number
    expiresAt?: number | string | Date
    user?: RawSessionUser | null
  } | null
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

function normalizeCallbackData(raw: unknown, provider: string): StoredSession {
  const payload = ((): RawSessionPayload => {
    if (typeof raw !== "object" || raw == null) {
      throw new Error("La respuesta del login no contiene una sesión válida.")
    }
    if ("data" in raw && typeof raw.data === "object" && raw.data != null) {
      return raw.data as RawSessionPayload
    }
    return raw as RawSessionPayload
  })()

  const user = payload.user ?? payload.session?.user ?? null
  const accessToken =
    payload.session?.token ?? payload.session?.access_token ?? payload.session?.accessToken
  const userId = user?.id
  if (!accessToken || !userId) {
    throw new Error("No se recibió access token o usuario desde Neon Auth.")
  }

  const expiresAtValue = payload.session?.expires_at ?? payload.session?.expiresAt ?? null
  const expiresAt =
    typeof expiresAtValue === "number"
      ? expiresAtValue
      : typeof expiresAtValue === "string"
        ? Math.floor(new Date(expiresAtValue).getTime() / 1000)
        : expiresAtValue instanceof Date
          ? Math.floor(expiresAtValue.getTime() / 1000)
          : null

  return {
    accessToken,
    expiresAt,
    provider,
    createdAt: new Date().toISOString(),
    user: {
      id: userId,
      email: user?.email ?? null,
      name: user?.name ?? null,
    },
  }
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

function buildStartHtml(authUrl: string, provider: string, callbackURL: string): string {
  const safeAuthUrl = JSON.stringify(authUrl)
  const safeProvider = JSON.stringify(provider)
  const safeCallbackUrl = JSON.stringify(callbackURL)
  const safeSdkUrl = JSON.stringify(NEON_AUTH_BROWSER_SDK_URL)

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
      const status = document.getElementById("status");
      const errorNode = document.getElementById("error");
      const retryButton = document.getElementById("retry");

      async function notifyError(message) {
        try {
          await fetch("${COMPLETE_PATH}", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ error: message }),
          });
        } catch {
          // Ignorar errores de notificación al CLI.
        }
      }

      async function startLogin() {
        retryButton.style.display = "none";
        errorNode.textContent = "";
        status.textContent = "Redirigiendo al proveedor OAuth...";
        try {
          const auth = createAuthClient(authUrl);
          await auth.signIn.social({
            provider,
            callbackURL,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
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
  const safeSdkUrl = JSON.stringify(NEON_AUTH_BROWSER_SDK_URL)
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
      import { createAuthClient } from ${safeSdkUrl};

      const status = document.getElementById("status");
      const errorNode = document.getElementById("error");
      const authUrl = ${safeAuthUrl};
      const auth = createAuthClient(authUrl);
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

      function extractPayload(result) {
        if (!result || typeof result !== "object") {
          return null;
        }

        const payload =
          "data" in result && result.data && typeof result.data === "object"
            ? result.data
            : result;

        const session = payload && typeof payload === "object" ? payload.session : null;
        const user =
          payload && typeof payload === "object" ? payload.user ?? session?.user ?? null : null;
        const token = session?.token ?? session?.access_token ?? session?.accessToken ?? null;

        if (!session || !user?.id || !token) {
          return null;
        }

        return payload;
      }

      async function waitForSession() {
        let lastMessage = "";

        for (let attempt = 0; attempt < MAX_SESSION_ATTEMPTS; attempt += 1) {
          try {
            const result = await auth.getSession();
            if (result && typeof result === "object" && "error" in result && result.error) {
              lastMessage = getErrorMessage(result.error);
            }

            const payload = extractPayload(result);
            if (payload) {
              return payload;
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
          const payload = await waitForSession();
          await finish({ payload });
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

export async function runOAuthLogin(): Promise<StoredSession> {
  const config = await loadConfig()
  const provider = config.oauthProvider || "google"
  const deferred = createDeferred<StoredSession>()
  let timeoutHandle: NodeJS.Timeout | null = null

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${LOCALHOST_HOSTNAME}`)
      if (req.method === "GET" && url.pathname === START_PATH) {
        const callbackURL = buildLocalUrl((server.address() as AddressInfo).port, CALLBACK_PATH)
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" })
        res.end(buildStartHtml(config.authUrl, provider, callbackURL))
        return
      }

      if (req.method === "GET" && url.pathname === CALLBACK_PATH) {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" })
        res.end(buildCallbackHtml(config.authUrl))
        return
      }

      if (req.method === "POST" && url.pathname === COMPLETE_PATH) {
        const rawBody = await readRequestBody(req)
        const body = rawBody ? (JSON.parse(rawBody) as { payload?: unknown; error?: string }) : {}
        if (body.error) {
          deferred.reject(new Error(body.error))
        } else {
          deferred.resolve(normalizeCallbackData(body.payload, provider))
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
