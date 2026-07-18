# Login dual ORGM_TOKEN y Google PKCE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ofrecer en orgmorg acceso mediante `ORGM_TOKEN` o Google OAuth HTTPS, usando callback loopback con PKCE y guardando solamente una API key final validada.

**Architecture:** `orgm-admin-backend` emitirá un código CLI firmado, corto y ligado a PKCE; la CLI lo recibirá en `127.0.0.1`, lo canjeará por JWT y reutilizará el aprovisionamiento actual de API keys. El frontend web no cambia y los flujos ORGM_TOKEN/API key manual siguen disponibles.

**Tech Stack:** Python 3.13, FastAPI, PyJWT, pytest, TypeScript 5.7, Node 22, Ink 6, Vitest 4, paquete `open`.

## Global Constraints

- Trabajar en `/home/osmarg/Code/orgm-admin-backend/.worktrees/cli-google-pkce` para backend y `/home/osmarg/Code/orgmorg/.worktrees/dual-login-pkce` para CLI.
- Si `/home/osmarg/Code/orgm-admin-backend` no existe, clonar primero `https://github.com/osmargm1202/orgm-admin-backend.git` en esa ruta.
- Desplegar backend antes de publicar la CLI.
- Usar solamente `apiBaseUrl` configurado; HTTPS obligatorio salvo loopback de desarrollo.
- Callback permitido únicamente en `http://127.0.0.1:{puerto}/callback`, con puerto numérico entre 1024 y 65535.
- PKCE S256 obligatorio; state OAuth vence en 10 minutos y código CLI en 60 segundos.
- JWT y `code_verifier` nunca se escriben en disco, URL de callback, HTML, frames, errores o logs.
- Solo API key `orgm_...` validada se guarda en `config.json` con permisos `0600`.
- Permisos funcionales: `cotizaciones:ver`, `proyectos:ver`, `cotizaciones:imprimir`.
- Mantener `ORGM_TOKEN`, API key manual, login web existente y bypass `is_superadmin`.
- Pruebas no contactan Google ni producción.
- Hay un diff de formato sin commit en `src/cli/ui/screens/TokenLoginScreen.tsx` del checkout principal; no descartarlo ni incluirlo accidentalmente. Crear worktree desde `HEAD` y resolver ese diff con el usuario antes del merge final.

---

### Task 1: Primitivas PKCE y códigos CLI en backend

**Files:**

- Modify: `orgm-admin-backend/src/services/auth_service.py`
- Modify: `orgm-admin-backend/tests/test_auth.py`

**Interfaces:**

- Produces: `validar_redirect_uri_cli(value: str) -> str`
- Produces: `crear_state_oauth_cli(redirect_uri: str, code_challenge: str, client_state: str) -> str`
- Produces: `decodificar_oauth_state(state: str) -> Optional[dict]`
- Produces: `crear_codigo_cli(email: str, tenant_id: int, code_challenge: str) -> str`
- Produces: `canjear_codigo_cli(code: str, code_verifier: str) -> dict`
- Preserves: `build_authorize_url()` and `verificar_state()` for web callers.

- [ ] **Step 1: Write failing tests for loopback validation and PKCE**

Add to `tests/test_auth.py`:

```python
import base64
import hashlib


def _pkce(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def test_validar_redirect_uri_cli_solo_loopback():
    assert auth_service.validar_redirect_uri_cli(
        "http://127.0.0.1:49152/callback"
    ) == "http://127.0.0.1:49152/callback"
    invalidas = [
        "https://127.0.0.1:49152/callback",
        "http://localhost:49152/callback",
        "http://127.0.0.1:80/callback",
        "http://127.0.0.1:49152/otra",
        "http://127.0.0.1:49152/callback?q=1",
        "http://user@127.0.0.1:49152/callback",
    ]
    for uri in invalidas:
        with pytest.raises(ValueError):
            auth_service.validar_redirect_uri_cli(uri)


def test_state_cli_firmado_con_datos_validados():
    challenge = _pkce("v" * 43)
    state = auth_service.crear_state_oauth_cli(
        "http://127.0.0.1:49152/callback", challenge, "s" * 43
    )
    payload = auth_service.decodificar_oauth_state(state)
    assert payload["p"] == "oauth_cli"
    assert payload["redirect_uri"] == "http://127.0.0.1:49152/callback"
    assert payload["code_challenge"] == challenge
    assert payload["client_state"] == "s" * 43


def test_codigo_cli_exige_verifier_correcto():
    verifier = "v" * 43
    code = auth_service.crear_codigo_cli(
        "osmar@or-gm.com", 1, _pkce(verifier)
    )
    result = auth_service.canjear_codigo_cli(code, verifier)
    payload = auth_service.verificar_token(result["access_token"])
    assert payload["sub"] == "osmar@or-gm.com"
    assert payload["tenant_id"] == 1
    with pytest.raises(ValueError, match="PKCE"):
        auth_service.canjear_codigo_cli(code, "x" * 43)


def test_state_y_codigo_cli_vencidos_se_rechazan():
    expired = datetime.now(timezone.utc) - timedelta(seconds=1)
    expired_state = pyjwt.encode(
        {"p": "oauth_cli", "exp": expired},
        settings.jwt_secret,
        algorithm="HS256",
    )
    expired_code = pyjwt.encode(
        {
            "p": "cli_auth_code",
            "sub": "osmar@or-gm.com",
            "tenant_id": 1,
            "code_challenge": _pkce("v" * 43),
            "exp": expired,
        },
        settings.jwt_secret,
        algorithm="HS256",
    )
    assert auth_service.decodificar_oauth_state(expired_state) is None
    with pytest.raises(ValueError, match="vencido"):
        auth_service.canjear_codigo_cli(expired_code, "v" * 43)
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
cd /home/osmarg/Code/orgm-admin-backend/.worktrees/cli-google-pkce
uv run pytest tests/test_auth.py -q
```

Expected: FAIL because the five CLI auth functions do not exist.

- [ ] **Step 3: Implement validation, signed state, and signed code**

Add imports and constants in `src/services/auth_service.py`:

```python
import base64
import hashlib
import hmac
import re
from urllib.parse import urlparse

_CLI_CHALLENGE_RE = re.compile(r"^[A-Za-z0-9_-]{43}$")
_CLI_STATE_RE = re.compile(r"^[A-Za-z0-9_-]{32,128}$")
_CLI_VERIFIER_RE = re.compile(r"^[A-Za-z0-9._~-]{43,128}$")
```

Add these functions:

```python
def validar_redirect_uri_cli(value: str) -> str:
    try:
        parsed = urlparse(value)
        port = parsed.port
    except ValueError as exc:
        raise ValueError("Callback CLI inválido") from exc
    if (
        parsed.scheme != "http"
        or parsed.hostname != "127.0.0.1"
        or port is None
        or not 1024 <= port <= 65535
        or parsed.path != "/callback"
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("Callback CLI inválido")
    return value


def decodificar_oauth_state(state: str) -> Optional[dict]:
    try:
        payload = jwt.decode(state, settings.jwt_secret, algorithms=[_ALG])
        return payload if payload.get("p") in {"oauth", "oauth_cli"} else None
    except jwt.PyJWTError:
        return None


def crear_state_oauth_cli(
    redirect_uri: str, code_challenge: str, client_state: str
) -> str:
    redirect_uri = validar_redirect_uri_cli(redirect_uri)
    if not _CLI_CHALLENGE_RE.fullmatch(code_challenge):
        raise ValueError("code_challenge PKCE inválido")
    if not _CLI_STATE_RE.fullmatch(client_state):
        raise ValueError("client_state inválido")
    return jwt.encode(
        {
            "p": "oauth_cli",
            "redirect_uri": redirect_uri,
            "code_challenge": code_challenge,
            "client_state": client_state,
            "exp": datetime.now(timezone.utc) + timedelta(minutes=10),
        },
        settings.jwt_secret,
        algorithm=_ALG,
    )


def crear_codigo_cli(email: str, tenant_id: int, code_challenge: str) -> str:
    if not _CLI_CHALLENGE_RE.fullmatch(code_challenge):
        raise ValueError("code_challenge PKCE inválido")
    return jwt.encode(
        {
            "p": "cli_auth_code",
            "sub": email,
            "tenant_id": tenant_id,
            "code_challenge": code_challenge,
            "exp": datetime.now(timezone.utc) + timedelta(seconds=60),
        },
        settings.jwt_secret,
        algorithm=_ALG,
    )


def canjear_codigo_cli(code: str, code_verifier: str) -> dict:
    if not _CLI_VERIFIER_RE.fullmatch(code_verifier):
        raise ValueError("Verifier PKCE inválido")
    try:
        payload = jwt.decode(code, settings.jwt_secret, algorithms=[_ALG])
    except jwt.PyJWTError as exc:
        raise ValueError("Código CLI inválido o vencido") from exc
    if payload.get("p") != "cli_auth_code":
        raise ValueError("Código CLI inválido o vencido")
    digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    expected = payload.get("code_challenge", "")
    if not hmac.compare_digest(challenge, expected):
        raise ValueError("PKCE inválido")
    return {
        "access_token": crear_token(payload["sub"], int(payload["tenant_id"])),
        "token_type": "bearer",
        "expires_in": settings.jwt_expire_days * 86400,
    }
```

Refactor existing state helpers without changing web behavior:

```python
def build_authorize_url(state: Optional[str] = None) -> str:
    oauth_state = state or jwt.encode(
        {"exp": datetime.now(timezone.utc) + timedelta(minutes=10), "p": "oauth"},
        settings.jwt_secret,
        algorithm=_ALG,
    )
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.oauth_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": oauth_state,
        "prompt": "select_account",
    }
    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"


def verificar_state(state: str) -> bool:
    return decodificar_oauth_state(state) is not None
```

- [ ] **Step 4: Run focused backend tests**

Run: `uv run pytest tests/test_auth.py -q`  
Expected: PASS.

- [ ] **Step 5: Commit backend primitives**

```bash
git add src/services/auth_service.py tests/test_auth.py
git commit -m "feat: add PKCE primitives for CLI login"
```

---

### Task 2: Endpoints OAuth CLI en backend

**Files:**

- Modify: `orgm-admin-backend/_models.py`
- Modify: `orgm-admin-backend/main.py`
- Modify: `orgm-admin-backend/tests/test_auth.py`

**Interfaces:**

- Consumes: Task 1 auth helpers.
- Produces: `GET /auth/cli/start`.
- Produces: `POST /auth/cli/exchange` with `{code, code_verifier}`.
- Extends: `GET /auth/google/callback` for `p = oauth_cli` while preserving web behavior.

- [ ] **Step 1: Write failing endpoint tests**

Add to `tests/test_auth.py`:

```python
from urllib.parse import parse_qs, urlparse


def test_auth_cli_start_firma_state(monkeypatch, client_auth_on):
    monkeypatch.setattr(settings, "google_client_id", "test-client")
    verifier = "v" * 43
    challenge = _pkce(verifier)
    response = client_auth_on.get(
        "/auth/cli/start",
        params={
            "redirect_uri": "http://127.0.0.1:49152/callback",
            "code_challenge": challenge,
            "client_state": "s" * 43,
        },
        follow_redirects=False,
    )
    assert response.status_code in (302, 307)
    state = parse_qs(urlparse(response.headers["location"]).query)["state"][0]
    assert auth_service.decodificar_oauth_state(state)["p"] == "oauth_cli"


def test_callback_cli_y_exchange_no_exponen_jwt(monkeypatch, client_auth_on):
    monkeypatch.setattr(
        auth_service,
        "login_google",
        lambda session, code: {
            "access_token": "jwt-interno-no-redirigir",
            "token_type": "bearer",
            "expires_in": 604800,
            "email": "osmar@or-gm.com",
            "nombre": "Osmar",
            "tenant_id": 1,
        },
    )
    verifier = "v" * 43
    state = auth_service.crear_state_oauth_cli(
        "http://127.0.0.1:49152/callback", _pkce(verifier), "s" * 43
    )
    callback = client_auth_on.get(
        "/auth/google/callback",
        params={"code": "google-code", "state": state},
        follow_redirects=False,
    )
    assert callback.status_code in (302, 307)
    assert "jwt-interno-no-redirigir" not in callback.headers["location"]
    query = parse_qs(urlparse(callback.headers["location"]).query)
    assert query["state"] == ["s" * 43]
    exchange = client_auth_on.post(
        "/auth/cli/exchange",
        json={"code": query["code"][0], "code_verifier": verifier},
    )
    assert exchange.status_code == 200
    assert auth_service.verificar_token(exchange.json()["access_token"])["sub"] == "osmar@or-gm.com"


def test_callback_cli_cancelado_regresa_error(monkeypatch, client_auth_on):
    state = auth_service.crear_state_oauth_cli(
        "http://127.0.0.1:49152/callback", _pkce("v" * 43), "s" * 43
    )
    response = client_auth_on.get(
        "/auth/google/callback",
        params={"error": "access_denied", "state": state},
        follow_redirects=False,
    )
    query = parse_qs(urlparse(response.headers["location"]).query)
    assert query == {"error": ["access_denied"], "state": ["s" * 43]}
```

- [ ] **Step 2: Run tests and verify RED**

Run: `uv run pytest tests/test_auth.py -q`  
Expected: FAIL with 404 for `/auth/cli/start` and `/auth/cli/exchange`.

- [ ] **Step 3: Add exchange request model**

Add to `_models.py`:

```python
class CliTokenExchange(BaseModel):
    code: str
    code_verifier: str
```

Import `CliTokenExchange` in `main.py`.

- [ ] **Step 4: Add start and exchange endpoints**

Add before the Google callback in `main.py`:

```python
@app.get("/auth/cli/start")
async def auth_cli_start(
    redirect_uri: str = Query(...),
    code_challenge: str = Query(...),
    client_state: str = Query(...),
):
    if not settings.google_client_id:
        raise HTTPException(status_code=503, detail="GOOGLE_CLIENT_ID no configurado")
    try:
        state = auth_service.crear_state_oauth_cli(
            redirect_uri, code_challenge, client_state
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return RedirectResponse(auth_service.build_authorize_url(state))


@app.post("/auth/cli/exchange")
async def auth_cli_exchange(data: CliTokenExchange):
    try:
        return auth_service.canjear_codigo_cli(data.code, data.code_verifier)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
```

- [ ] **Step 5: Extend Google callback without changing web flow**

Import `urlencode` in `main.py` and add a controlled redirect helper:

```python
from urllib.parse import urlencode


def _redirect_cli(payload: dict, *, code: str = "", error: str = ""):
    query = {"state": payload["client_state"]}
    if code:
        query["code"] = code
    if error:
        query["error"] = error
    return RedirectResponse(
        f'{payload["redirect_uri"]}?{urlencode(query)}'
    )
```

Replace callback validation and error handling with:

```python
state_payload = auth_service.decodificar_oauth_state(state or "")
if state_payload is None:
    raise HTTPException(status_code=400, detail="State inválido (CSRF)")
is_cli = state_payload.get("p") == "oauth_cli"

if error:
    if is_cli:
        return _redirect_cli(state_payload, error="access_denied")
    raise HTTPException(status_code=400, detail=f"Google devolvió error: {error}")
if not code:
    raise HTTPException(status_code=400, detail="Falta el parámetro code")

try:
    resultado = auth_service.login_google(session, code)
except PermissionError as exc:
    if is_cli:
        return _redirect_cli(state_payload, error="not_authorized")
    raise HTTPException(status_code=403, detail=str(exc)) from exc
except Exception:
    logger.report_exc_info({"context": "auth_google_callback"})
    if is_cli:
        return _redirect_cli(state_payload, error="oauth_failed")
    raise HTTPException(status_code=502, detail="Error intercambiando código con Google")
```

Branch before the existing frontend redirect:

```python
if is_cli:
    cli_code = auth_service.crear_codigo_cli(
        resultado["email"],
        resultado["tenant_id"],
        state_payload["code_challenge"],
    )
    return _redirect_cli(state_payload, code=cli_code)
```

Update `test_callback_devuelve_pagina_no_json` to monkeypatch `decodificar_oauth_state` with `lambda state: {"p": "oauth"}` instead of monkeypatching `verificar_state`. Keep its HTML assertions unchanged.

- [ ] **Step 6: Verify focused and full backend suites**

Run:

```bash
uv run pytest tests/test_auth.py -q
uv run pytest -q
```

Expected: both PASS; existing web callback test remains green.

- [ ] **Step 7: Commit backend endpoints**

```bash
git add _models.py main.py tests/test_auth.py
git commit -m "feat: add Google OAuth callback for CLI"
```

---

### Task 3: Servicio loopback OAuth en orgmorg

**Files:**

- Create: `src/services/cli-oauth.ts`
- Create: `tests/cli-oauth.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**

- Produces: `CliOAuthProgress` stages `opening-browser | waiting-callback | exchanging-code`.
- Produces: `obtainJwtWithBrowser(apiBaseUrl, options?) -> Promise<string>`.
- Consumes backend contract from Task 2.

- [ ] **Step 1: Install browser opener**

Run: `npm install open`  
Expected: `open` appears in dependencies and lockfile.

- [ ] **Step 2: Write failing PKCE and loopback tests**

Create `tests/cli-oauth.test.ts`:

```ts
import http from "node:http"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  createPkce,
  obtainJwtWithBrowser,
  type CliOAuthOptions,
} from "../src/services/cli-oauth.js"

const servers: http.Server[] = []
afterEach(async () => Promise.all(servers.splice(0).map(
  (server) => new Promise<void>((resolve) => server.close(() => resolve()))
)))

const listen = async (server: http.Server) => {
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Sin puerto")
  return `http://127.0.0.1:${address.port}`
}

describe("CLI OAuth", () => {
  it("genera verifier y challenge PKCE S256", () => {
    const value = createPkce(() => Buffer.alloc(32, 7))
    expect(value.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(value.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(value.challenge).not.toBe(value.verifier)
  })

  it("recibe callback, valida state y canjea código", async () => {
    let callbackUrl = ""
    const backend = http.createServer(async (request, response) => {
      const url = new URL(request.url ?? "/", "http://backend")
      if (url.pathname === "/auth/cli/start") {
        callbackUrl = url.searchParams.get("redirect_uri") ?? ""
        const state = url.searchParams.get("client_state") ?? ""
        response.writeHead(302, { location: `${callbackUrl}?code=short-code&state=${state}` })
        response.end()
        return
      }
      if (url.pathname === "/auth/cli/exchange") {
        response.writeHead(200, { "content-type": "application/json" })
        response.end(JSON.stringify({ access_token: "jwt-temporal", token_type: "bearer", expires_in: 604800 }))
      }
    })
    const apiBaseUrl = await listen(backend)
    const openBrowser = vi.fn(async (url: string) => {
      await fetch(url, { redirect: "follow" })
    })
    await expect(obtainJwtWithBrowser(apiBaseUrl, { openBrowser, timeoutMs: 1000 }))
      .resolves.toBe("jwt-temporal")
    expect(callbackUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/)
  })
})
```

- [ ] **Step 3: Run tests and verify RED**

Run: `npm test -- tests/cli-oauth.test.ts`  
Expected: FAIL because `cli-oauth.ts` does not exist.

- [ ] **Step 4: Implement PKCE, listener, browser and exchange**

Create `src/services/cli-oauth.ts` with these public definitions:

```ts
import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import http from "node:http"
import open from "open"

export type CliOAuthStage = "opening-browser" | "waiting-callback" | "exchanging-code"
export interface CliOAuthProgress { stage: CliOAuthStage; loginUrl?: string }
export interface CliOAuthOptions {
  fetch?: typeof fetch
  openBrowser?: (url: string) => Promise<void>
  random?: (size: number) => Buffer
  timeoutMs?: number
  signal?: AbortSignal
  onProgress?: (progress: CliOAuthProgress) => void
}

const base64url = (value: Buffer) => value.toString("base64url")

export function createPkce(random: (size: number) => Buffer = randomBytes) {
  const verifier = base64url(random(32))
  const challenge = base64url(createHash("sha256").update(verifier).digest())
  return { verifier, challenge }
}
```

Add helpers and the complete orchestration:

```ts
const safeEqual = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

const closeServer = (server: http.Server) =>
  new Promise<void>((resolve) => {
    if (!server.listening) return resolve()
    server.close(() => resolve())
  })

export async function obtainJwtWithBrowser(
  apiBaseUrl: string,
  options: CliOAuthOptions = {}
): Promise<string> {
  const fetchRequest = options.fetch ?? globalThis.fetch
  const openBrowser = options.openBrowser ?? (async (url: string) => {
    await open(url)
  })
  const random = options.random ?? randomBytes
  const { verifier, challenge } = createPkce(random)
  const clientState = base64url(random(32))
  let callbackResolve!: (code: string) => void
  let callbackReject!: (error: Error) => void
  let timer: NodeJS.Timeout | undefined
  const callback = new Promise<string>((resolve, reject) => {
    callbackResolve = resolve
    callbackReject = reject
  })
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1")
    if (request.method !== "GET" || url.pathname !== "/callback") {
      response.writeHead(404).end()
      return
    }
    const receivedState = url.searchParams.get("state") ?? ""
    if (!safeEqual(receivedState, clientState)) {
      response.writeHead(400, { "content-type": "text/html; charset=utf-8" })
      response.end("<!doctype html><title>ORGMorg</title><p>Callback inválido.</p>")
      callbackReject(new Error("El callback de autenticación no coincide."))
      return
    }
    if (url.searchParams.has("error")) {
      response.writeHead(400, { "content-type": "text/html; charset=utf-8" })
      response.end("<!doctype html><title>ORGMorg</title><p>Inicio cancelado.</p>")
      callbackReject(new Error("Inicio de sesión cancelado o no autorizado."))
      return
    }
    const code = url.searchParams.get("code")
    if (!code) {
      response.writeHead(400).end()
      callbackReject(new Error("El callback no incluyó código de autorización."))
      return
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" })
    response.end("<!doctype html><title>ORGMorg</title><p>Acceso recibido. Puedes cerrar esta pestaña.</p>")
    callbackResolve(code)
  })
  const abort = () => callbackReject(new Error("Inicio de sesión cancelado."))

  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen(0, "127.0.0.1", () => {
        server.removeListener("error", reject)
        resolve()
      })
    })
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("No se obtuvo puerto local.")
    const callbackUrl = `http://127.0.0.1:${address.port}/callback`
    const loginUrl = new URL("/auth/cli/start", `${apiBaseUrl.replace(/\/+$/, "")}/`)
    loginUrl.searchParams.set("redirect_uri", callbackUrl)
    loginUrl.searchParams.set("code_challenge", challenge)
    loginUrl.searchParams.set("client_state", clientState)
    options.onProgress?.({ stage: "opening-browser", loginUrl: loginUrl.toString() })
    try {
      await openBrowser(loginUrl.toString())
    } catch {
      // La URL ya fue entregada a la UI para apertura manual.
    }
    options.onProgress?.({ stage: "waiting-callback", loginUrl: loginUrl.toString() })
    if (options.signal?.aborted) abort()
    options.signal?.addEventListener("abort", abort, { once: true })
    timer = setTimeout(
      () => callbackReject(new Error("El inicio de sesión venció después de 5 minutos.")),
      options.timeoutMs ?? 300_000
    )
    const code = await callback
    options.onProgress?.({ stage: "exchanging-code" })
    const exchange = await fetchRequest(
      new URL("/auth/cli/exchange", `${apiBaseUrl.replace(/\/+$/, "")}/`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, code_verifier: verifier }),
      }
    )
    if (!exchange.ok) {
      throw new Error(
        exchange.status === 404
          ? "El backend no admite login para CLI."
          : "No fue posible canjear el acceso temporal."
      )
    }
    const payload = (await exchange.json()) as { access_token?: unknown }
    if (typeof payload.access_token !== "string" || !payload.access_token) {
      throw new Error("El backend devolvió un token inválido.")
    }
    return payload.access_token
  } finally {
    if (timer) clearTimeout(timer)
    options.signal?.removeEventListener("abort", abort)
    await closeServer(server)
  }
}
```

- [ ] **Step 5: Add negative tests**

Add this helper and tests to `tests/cli-oauth.test.ts`:

```ts
const beginWithoutBackend = async (overrides: CliOAuthOptions = {}) => {
  let resolveLoginUrl!: (url: string) => void
  const loginUrlReady = new Promise<string>((resolve) => { resolveLoginUrl = resolve })
  const result = obtainJwtWithBrowser("https://api.example.com", {
    timeoutMs: 1000,
    openBrowser: async (url) => resolveLoginUrl(url),
    ...overrides,
  })
  const loginUrl = new URL(await loginUrlReady)
  const callbackUrl = loginUrl.searchParams.get("redirect_uri")
  if (!callbackUrl) throw new Error("Sin callback")
  return { result, loginUrl, callbackUrl }
}

it("rechaza state incorrecto sin exponer código", async () => {
  const attempt = await beginWithoutBackend()
  const response = await fetch(`${attempt.callbackUrl}?code=secret-code&state=wrong`)
  expect(await response.text()).not.toContain("secret-code")
  await expect(attempt.result).rejects.toThrow("no coincide")
})

it("propaga cancelación OAuth sin exponer detalle", async () => {
  const attempt = await beginWithoutBackend()
  const state = attempt.loginUrl.searchParams.get("client_state")
  const response = await fetch(`${attempt.callbackUrl}?error=access_denied&state=${state}`)
  expect(await response.text()).not.toContain("access_denied")
  await expect(attempt.result).rejects.toThrow("cancelado")
})

it("vence y cierra listener", async () => {
  await expect(obtainJwtWithBrowser("https://api.example.com", {
    timeoutMs: 10,
    openBrowser: async () => {},
  })).rejects.toThrow("venció")
})

it("muestra URL aunque el opener falle y permite abortar", async () => {
  const controller = new AbortController()
  const progress = vi.fn(({ loginUrl }: { loginUrl?: string }) => {
    if (loginUrl) controller.abort()
  })
  await expect(obtainJwtWithBrowser("https://api.example.com", {
    signal: controller.signal,
    openBrowser: async () => { throw new Error("sin navegador") },
    onProgress: progress,
  })).rejects.toThrow("cancelado")
  expect(progress.mock.calls.some(([value]) => value.loginUrl?.startsWith("https://api.example.com/auth/cli/start"))).toBe(true)
})
```

Extend the fake backend test so `/auth/cli/exchange` can return 400 and assert the result is `No fue posible canjear el acceso temporal.`. Also capture the POST body and assert `code_verifier` is present but absent from progress events and callback HTML.

- [ ] **Step 6: Run focused tests and build**

Run:

```bash
npm test -- tests/cli-oauth.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit CLI OAuth service**

```bash
git add package.json package-lock.json src/services/cli-oauth.ts tests/cli-oauth.test.ts
git commit -m "feat: add PKCE browser login service"
```

---

### Task 4: Aprovisionamiento desde token temporal genérico

**Files:**

- Modify: `src/services/token-login.ts`
- Modify: `tests/token-login.test.ts`

**Interfaces:**

- Consumes: `obtainJwtWithBrowser` and `CliOAuthOptions` from Task 3.
- Produces: `provisionApiKeyFromToken(input) -> Promise<TokenLoginResult>`.
- Produces: `obtainApiKeyFromBrowser(input) -> Promise<TokenLoginResult>` so JWT never reaches UI state.
- Preserves: `obtainApiKeyFromEnvironment(input)`.
- Extends source union with `browser-jwt`.

- [ ] **Step 1: Write failing browser-token test**

Add to `tests/token-login.test.ts`:

```ts
it("aprovisiona desde JWT del navegador sin persistirlo", async () => {
  const jwtClient = client({
    validateCredentials: vi.fn(async () => identity({}, "admin@or-gm.com", true)),
    listRoles: vi.fn(async () => [
      { id: 4, name: "CLI", active: true, permissions: functionalPermissions },
    ]),
    createApiKey: vi.fn(async () => "orgm_browser_created"),
  })
  const finalClient = client()
  const result = await provisionApiKeyFromToken({
    token: "jwt-browser-secret",
    source: "browser-jwt",
    createClient: (credential) =>
      credential === "orgm_browser_created" ? finalClient : jwtClient,
  })
  expect(result).toMatchObject({
    apiKey: "orgm_browser_created",
    source: "browser-jwt",
    roleName: "CLI",
  })
  expect(JSON.stringify(result)).not.toContain("jwt-browser-secret")
})
```

- [ ] **Step 2: Run test and verify RED**

Run: `npm test -- tests/token-login.test.ts`  
Expected: FAIL because `provisionApiKeyFromToken` and `browser-jwt` do not exist.

- [ ] **Step 3: Extract generic provisioning**

Add:

```ts
export type TokenLoginSource =
  | "existing"
  | "environment-key"
  | "environment-jwt"
  | "browser-jwt"

export interface ProvisionApiKeyInput {
  token: string
  source: Exclude<TokenLoginSource, "existing">
  createClient: (credential: string) => TokenLoginClient
}

// Replace the inline source union in TokenLoginResult.
export interface TokenLoginResult {
  apiKey: string
  email: string
  roleName: string | null
  source: TokenLoginSource
}
```

Move direct-key validation and JWT role/key creation into:

```ts
export async function provisionApiKeyFromToken(
  input: ProvisionApiKeyInput
): Promise<TokenLoginResult> {
  const tokenClient = input.createClient(input.token)
  const tokenIdentity = await tokenClient.validateCredentials()
  if (input.token.startsWith("orgm_")) {
    assertFunctionalPermissions(tokenIdentity)
    return {
      apiKey: input.token,
      email: tokenIdentity.email,
      roleName: null,
      source: input.source,
    }
  }
  assertProvisioningPermissions(tokenIdentity)
  const role = selectLeastPrivilegeRole(await tokenClient.listRoles())
  if (!role) throw new Error(`No existe un rol compatible con: ${FUNCTIONAL_PERMISSION_LABEL}.`)
  const apiKey = await tokenClient.createApiKey("orgmorg-cli", role.id)
  const finalIdentity = await input.createClient(apiKey).validateCredentials()
  assertFunctionalPermissions(finalIdentity)
  return { apiKey, email: finalIdentity.email, roleName: role.name, source: input.source }
}
```

Keep existing-key reuse in `obtainApiKeyFromEnvironment`, then delegate token handling to `provisionApiKeyFromToken`.

Add browser orchestration in the same service:

```ts
export interface ObtainBrowserApiKeyInput {
  config: Config
  oauthOptions?: CliOAuthOptions
  obtainJwt?: typeof obtainJwtWithBrowser
  onProvisioning?: () => void
  createClient: (credential: string) => TokenLoginClient
}

export async function obtainApiKeyFromBrowser(
  input: ObtainBrowserApiKeyInput
): Promise<TokenLoginResult> {
  const jwt = await (input.obtainJwt ?? obtainJwtWithBrowser)(
    input.config.apiBaseUrl,
    input.oauthOptions
  )
  input.onProvisioning?.()
  return provisionApiKeyFromToken({
    token: jwt,
    source: "browser-jwt",
    createClient: input.createClient,
  })
}
```

Add this orchestration test:

```ts
it("mantiene JWT del navegador dentro del servicio", async () => {
  const obtainJwt = vi.fn(async () => "jwt-browser-secret")
  const jwtClient = client({
    validateCredentials: vi.fn(async () => identity({}, "admin@or-gm.com", true)),
    listRoles: vi.fn(async () => [
      { id: 4, name: "CLI", active: true, permissions: functionalPermissions },
    ]),
    createApiKey: vi.fn(async () => "orgm_browser_created"),
  })
  const result = await obtainApiKeyFromBrowser({
    config,
    obtainJwt,
    createClient: (credential) => credential === "orgm_browser_created" ? client() : jwtClient,
  })
  expect(result).toEqual({
    apiKey: "orgm_browser_created",
    email: "osmar@or-gm.com",
    roleName: "CLI",
    source: "browser-jwt",
  })
  expect(JSON.stringify(result)).not.toContain("jwt-browser-secret")
})
```

- [ ] **Step 4: Run token tests and build**

Run:

```bash
npm test -- tests/token-login.test.ts
npm run build
```

Expected: PASS; existing ORGM_TOKEN cases remain green.

- [ ] **Step 5: Commit provisioning refactor**

```bash
git add src/services/token-login.ts tests/token-login.test.ts
git commit -m "refactor: provision API key from temporary token"
```

---

### Task 5: Selector de método y pantalla Google en Ink

**Files:**

- Create: `src/cli/ui/screens/AuthMethodScreen.tsx`
- Create: `src/cli/ui/screens/WebLoginScreen.tsx`
- Modify: `src/cli/ui/screens/TokenLoginScreen.tsx`
- Modify: `src/cli/ui/App.tsx`
- Modify: `src/cli/ui/types.ts`
- Modify: `tests/settings-ui.test.tsx`

**Interfaces:**

- Consumes: `obtainApiKeyFromBrowser` from Task 4; JWT never enters component state.
- Produces routes: `config-auth-method`, `config-token-env`, `config-token-web`.

- [ ] **Step 1: Write failing selector and web success tests**

Add to `tests/settings-ui.test.tsx`:

```tsx
it("ofrece ORGM_TOKEN y Google HTTPS", () => {
  const onSelect = vi.fn()
  const { lastFrame } = render(<AuthMethodScreen onSelect={onSelect} onBack={() => {}} />)
  expect(lastFrame()).toContain("Usar ORGM_TOKEN")
  expect(lastFrame()).toContain("Iniciar sesión con Google (HTTPS)")
})

it("login web guarda solo API key final", async () => {
  const saveConfig = vi.fn(async () => {})
  const obtainApiKey = vi.fn(async () => ({
    apiKey: "orgm_web_key",
    email: "osmar@or-gm.com",
    roleName: "CLI",
    source: "browser-jwt" as const,
  }))
  const { stdin, lastFrame } = render(
    <WebLoginScreen
      onBack={() => {}}
      loadConfig={async () => ({ apiBaseUrl: "https://api.example.com", basePath: "/tmp", apiKey: null })}
      saveConfig={saveConfig}
      obtainApiKey={obtainApiKey}
    />
  )
  await waitForText(lastFrame, "Enter abrir Google")
  stdin.write("\r")
  await waitForText(lastFrame, "API key configurada")
  expect(saveConfig).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "orgm_web_key" }))
  expect(lastFrame()).not.toContain("jwt-web-secret")
  expect(lastFrame()).not.toContain("orgm_web_key")
})
```

- [ ] **Step 2: Run UI test and verify RED**

Run: `npm test -- tests/settings-ui.test.tsx`  
Expected: FAIL because both screens do not exist.

- [ ] **Step 3: Implement method selector and existing-key guard**

`AuthMethodScreen` uses these exact items:

```ts
const METHODS = [
  { id: "config-token-env", label: "Usar ORGM_TOKEN" },
  { id: "config-token-web", label: "Iniciar sesión con Google (HTTPS)" },
] as const
```

It receives injectable loading and validation:

```ts
interface AuthMethodScreenProps {
  onSelect: (screen: "config-token-env" | "config-token-web") => void
  onBack: () => void
  loadConfig?: typeof defaultLoadConfig
  validateCredentials?: (config: AdminApiConfig) => Promise<AuthIdentity>
}
```

On mount, load configuration. If `apiKey` exists, validate it with `AdminApiClient` and `hasPermissions(identity.permissions, FUNCTIONAL_PERMISSIONS)`. A valid key renders one `MenuScreen` item:

```ts
{
  id: "reconfigure",
  label: `Acceso configurado: ${identity.email} (${maskApiKey(config.apiKey)}) · Reconfigurar`,
}
```

Selecting `reconfigure` changes local mode to `methods`; it does not call `onSelect`. Missing, invalid or underprivileged keys go directly to `METHODS`. Loading and transient validation errors render controlled `ScreenFrame` states without secrets.

- [ ] **Step 4: Implement WebLoginScreen state machine**

Use states `loading | ready | opening | waiting | exchanging | provisioning | done | error` and injected dependencies:

```ts
interface WebLoginScreenProps {
  onBack: () => void
  loadConfig?: typeof defaultLoadConfig
  saveConfig?: typeof defaultSaveConfig
  obtainApiKey?: typeof obtainApiKeyFromBrowser
}
```

On Enter:

```ts
const abortController = new AbortController()
abortRef.current = abortController
const result = await obtainApiKey({
  config,
  onProvisioning: () => setStatus("provisioning"),
  oauthOptions: {
    signal: abortController.signal,
    onProgress: ({ stage, loginUrl }) => {
      setStatus(stage === "opening-browser" ? "opening" : stage === "waiting-callback" ? "waiting" : "exchanging")
      if (loginUrl) setLoginUrl(loginUrl)
    },
  },
  createClient: (credential) =>
    new AdminApiClient({ apiBaseUrl: config.apiBaseUrl, apiKey: credential }),
})
await saveConfig({ ...config, apiKey: result.apiKey })
setResult(result)
setStatus("done")
```

Clear `abortRef` in `finally`. Escape during `opening`, `waiting` or `exchanging` calls `abortRef.current?.abort()`; all other Escape handling returns normally. Render the configured endpoint before starting. During `opening` and `waiting`, render `loginUrl` with `Si el navegador no abrió, abre esta URL:` so manual fallback is usable. Render only endpoint, login URL, progress, controlled errors, email, role and `maskApiKey(result.apiKey)`. Never render JWT, code or verifier. Use the stable `useInput` callback/ref pattern already established in `TokenLoginScreen`.

- [ ] **Step 5: Wire navigation and preserve manual access**

- Configuration menu route becomes `config-auth-method`.
- `config-token-env` renders existing `TokenLoginScreen`.
- `config-token-web` renders `WebLoginScreen`.
- `API key manual` remains unchanged.
- Add all three IDs to `Screen` union.

- [ ] **Step 6: Add existing-key and error tests**

Add an existing-key guard test:

```tsx
it("no ofrece crear otra key hasta elegir Reconfigurar", async () => {
  const { stdin, lastFrame } = render(
    <AuthMethodScreen
      onSelect={() => {}}
      onBack={() => {}}
      loadConfig={async () => ({
        apiBaseUrl: "https://api.example.com",
        basePath: "/tmp",
        apiKey: "orgm_existing",
      })}
      validateCredentials={async () => ({
        email: "osmar@or-gm.com",
        tenantId: 1,
        expiresAt: null,
        isSuperadmin: false,
        permissions: { cotizaciones: ["ver", "imprimir"], proyectos: ["ver"] },
      })}
    />
  )
  await waitForText(lastFrame, "Reconfigurar")
  expect(lastFrame()).not.toContain("Iniciar sesión con Google")
  stdin.write("\r")
  await waitForText(lastFrame, "Iniciar sesión con Google")
})
```

Add table-driven web error tests:

```tsx
it.each([
  ["timeout", "El inicio de sesión venció después de 5 minutos.", "venció"],
  ["cancelado", "Inicio de sesión cancelado o no autorizado.", "cancelado"],
  ["backend viejo", "El backend no admite login para CLI.", "no admite"],
  ["sin rol", "No existe un rol compatible.", "rol compatible"],
  ["guardado", "No fue posible guardar configuración.", "guardar"],
])("muestra error web %s sin guardar", async (_name, message, expected) => {
  const saveConfig = vi.fn(async () => {})
  const { stdin, lastFrame } = render(
    <WebLoginScreen
      onBack={() => {}}
      loadConfig={async () => ({ apiBaseUrl: "https://api.example.com", basePath: "/tmp", apiKey: null })}
      saveConfig={saveConfig}
      obtainApiKey={async () => { throw new Error(message) }}
    />
  )
  await waitForText(lastFrame, "Enter abrir Google")
  stdin.write("\r")
  await waitForText(lastFrame, expected)
  expect(saveConfig).not.toHaveBeenCalled()
  expect(lastFrame()).not.toContain("jwt-web-secret")
  expect(lastFrame()).not.toContain("short-code")
  expect(lastFrame()).not.toContain("pkce-verifier")
})
```

Add a `TokenLoginScreen` case with `readEnvironmentToken={() => undefined}`; press Enter, assert the frame says `ORGM_TOKEN no está configurado`, `saveConfig` is untouched, and Escape invokes `onBack` to return to the selector.

- [ ] **Step 7: Run UI tests, full suite, and build**

Run:

```bash
npm test -- tests/settings-ui.test.tsx tests/cli-oauth.test.ts tests/token-login.test.ts
npm run check
```

Expected: PASS with no flaky input test.

- [ ] **Step 8: Commit UI flow**

```bash
git add src/cli/ui tests/settings-ui.test.tsx
git commit -m "feat: add dual authentication methods"
```

---

### Task 6: Integración, seguridad y entrega coordinada

**Files:**

- Modify: `tests/workflow.integration.test.ts`
- Modify: `docs/superpowers/specs/2026-07-17-login-dual-orgm-token-google-pkce-design.md`

**Interfaces:**

- Verifies full backend-to-loopback-to-API-key contract without Google or production.

- [ ] **Step 1: Add end-to-end loopback integration test**

Extend `workflow.integration.test.ts` with a local fake backend that:

1. accepts `/auth/cli/start`;
2. redirects to the supplied loopback callback with matching state and short code;
3. validates POST `/auth/cli/exchange` contains code and verifier;
4. returns a JWT fixture;
5. serves `/auth/me`, `/api/roles`, `/api/apikeys`, and final `/auth/me`;
6. asserts only the final `orgm_` key reaches `saveConfig`;
7. asserts no request log or rendered frame contains JWT/verifier.

- [ ] **Step 2: Run security searches**

Run in orgmorg:

```bash
rg -n "access_token|code_verifier|jwt-web-secret" src tests
rg -n "console\.(log|error)|JSON\.stringify\(.*token" src
```

Expected: only controlled parsing/test fixtures; no secret logging or rendering.

Run in backend:

```bash
rg -n "access_token" main.py src/services/auth_service.py tests/test_auth.py
```

Expected: token appears only in exchange response and existing auth service; never callback URL.

- [ ] **Step 3: Verify backend**

```bash
uv run pytest tests/test_auth.py -q
uv run pytest -q
```

Expected: PASS.

- [ ] **Step 4: Verify orgmorg**

```bash
npm run check
npm audit --audit-level=high
npm pack --dry-run
```

Expected: build and all tests PASS; no high/critical vulnerabilities; package includes new service/screens.

- [ ] **Step 5: Review deployment order**

Confirm:

1. backend endpoints deployed and smoke-tested with invalid callback only;
2. existing web login still works;
3. then publish/deploy orgmorg;
4. `ORGM_TOKEN` and API key manual remain fallback paths.

Do not use a real Google token in automated tests or commit messages.

- [ ] **Step 6: Mark specification implemented and commit integration**

Change the spec header from `Estado: pendiente de revisión escrita` to `Estado: implementado` only after Steps 2-5 pass.

```bash
git add tests/workflow.integration.test.ts docs/superpowers/specs/2026-07-17-login-dual-orgm-token-google-pkce-design.md
git commit -m "test: cover dual authentication workflow"
```

- [ ] **Step 7: Request code review for both repositories**

Review backend first for redirect validation, PKCE, compatibility and secret exposure. Review CLI second for listener lifecycle, UI input stability, persistence and no-production tests. Resolve findings before merge.
