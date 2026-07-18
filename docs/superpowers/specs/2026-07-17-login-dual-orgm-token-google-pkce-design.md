# Diseño: login dual con ORGM_TOKEN y Google OAuth para CLI

Fecha: 2026-07-17  
Proyectos: orgmorg y orgm-admin-backend  
Estado: pendiente de revisión escrita

## 1. Objetivo

Permitir que orgmorg obtenga su API key mediante dos métodos:

1. reutilizar `ORGM_TOKEN` configurado para MCP;
2. iniciar sesión con Google en el navegador mediante HTTPS.

Ambos métodos terminan creando o validando una API key `orgm_...` con permisos funcionales mínimos. El JWT de Google permanece únicamente en memoria y nunca se guarda en `config.json`.

## 2. Situación actual

Orgmorg ya puede usar `ORGM_TOKEN` cuando contiene una API key o un JWT. Sin embargo, si la variable no existe, la aplicación solo muestra un error.

El backend dispone de:

- `GET /auth/google/start`;
- `GET /auth/google/callback`;
- emisión de JWT con duración de siete días;
- redirección del JWT al frontend mediante fragmento `#access_token`.

La CLI no puede leer el fragmento de otra pestaña del navegador. Para completar el login automáticamente se requiere un flujo específico para CLI.

## 3. Alcance

### Incluye

- selector de método de acceso dentro de orgmorg;
- flujo existente con `ORGM_TOKEN`;
- login Google en navegador;
- callback temporal en `127.0.0.1`;
- PKCE S256;
- código de autorización corto firmado por el backend;
- canje del código por JWT mediante HTTPS;
- creación y validación de API key con rol compatible de menor privilegio;
- guardado exclusivo de la API key final;
- mensajes de error específicos;
- pruebas unitarias e integración loopback en ambos repositorios.

### No incluye

- login con contraseña;
- cambios en el frontend administrativo;
- guardar o refrescar JWT;
- reemplazar la configuración manual del endpoint;
- revocar automáticamente API keys anteriores;
- contactar Google o producción desde pruebas automatizadas.

## 4. Interfaz de orgmorg

La opción actual `Iniciar sesión / Obtener API key` abrirá un selector:

```text
Acceso administrativo

> Usar ORGM_TOKEN
  Iniciar sesión con Google (HTTPS)
  Volver
```

`API key manual` permanece disponible en el menú Configuración.

La pantalla usará únicamente `apiBaseUrl` guardado en la configuración. No existirá una segunda URL interna para autenticación. Antes de abrir el navegador mostrará el endpoint que utilizará.

### API key existente

Si ya existe una API key válida con permisos funcionales:

- se mostrará correo y key enmascarada;
- no se creará otra automáticamente;
- el usuario podrá volver o elegir explícitamente `Reconfigurar`;
- una reconfiguración puede crear una key nueva y avisará que la anterior no se revoca automáticamente.

## 5. Flujo ORGM_TOKEN

El comportamiento existente se conserva:

1. leer `ORGM_TOKEN`;
2. si comienza con `orgm_`, validar y guardar la key;
3. si es JWT, validar identidad y permisos de aprovisionamiento;
4. seleccionar rol activo compatible de menor privilegio;
5. crear y validar API key;
6. guardar únicamente la key final.

Si falta la variable, la pantalla indicará que no está configurada y permitirá volver para elegir Google.

## 6. Flujo Google OAuth para CLI

### 6.1 Inicio en la CLI

1. Abrir servidor HTTP temporal en `127.0.0.1` y puerto asignado por el sistema.
2. Usar ruta fija `/callback`.
3. Generar con fuente criptográfica:
   - `client_state` aleatorio;
   - `code_verifier` PKCE;
   - `code_challenge = BASE64URL(SHA256(code_verifier))`.
4. Construir la URL:

```text
GET <apiBaseUrl>/auth/cli/start
  ?redirect_uri=http://127.0.0.1:<port>/callback
  &code_challenge=<challenge>
  &client_state=<state>
```

1. Abrir la URL en el navegador predeterminado.
2. Si el navegador no abre, mostrar la URL para apertura manual.
3. Esperar callback durante un máximo de cinco minutos.

### 6.2 Inicio en el backend

`GET /auth/cli/start` validará:

- `redirect_uri` con esquema `http`;
- host literal `127.0.0.1`;
- puerto entre 1024 y 65535;
- ruta exacta `/callback`;
- ausencia de credenciales, query y fragmento en el callback;
- `code_challenge` PKCE S256 de 43 caracteres base64url sin padding;
- `client_state` base64url entre 32 y 128 caracteres.

El backend generará el state OAuth firmado, con vencimiento de diez minutos y estos datos:

```json
{
  "p": "oauth_cli",
  "redirect_uri": "http://127.0.0.1:49152/callback",
  "code_challenge": "...",
  "client_state": "...",
  "exp": 0
}
```

Luego redirigirá al login Google existente.

### 6.3 Callback Google

`GET /auth/google/callback` conservará el flujo web actual. Cuando el state firmado tenga `p = oauth_cli`:

1. validar state y vencimiento;
2. si Google devuelve cancelación, redirigir al callback local con un código de error controlado y `client_state`;
3. ejecutar la autorización Google existente;
4. validar que el correo tenga acceso;
5. crear un código CLI firmado con duración máxima de 60 segundos;
6. incluir en el código:
   - tipo `cli_auth_code`;
   - correo;
   - tenant;
   - `code_challenge`;
   - vencimiento;
7. redirigir a:

```text
http://127.0.0.1:<port>/callback?code=<codigo>&state=<client_state>
```

La redirección no contendrá JWT de acceso.

### 6.4 Callback local y canje

La CLI:

1. aceptará solo `GET /callback`;
2. comparará `state` en tiempo constante;
3. rechazará ausencia de código o error OAuth;
4. responderá al navegador con HTML mínimo de éxito o error, sin secretos;
5. cerrará el listener;
6. enviará por HTTPS:

```http
POST <apiBaseUrl>/auth/cli/exchange
Content-Type: application/json

{
  "code": "<codigo>",
  "code_verifier": "<verifier>"
}
```

El backend verificará firma, tipo, vencimiento y PKCE S256 antes de emitir el JWT normal:

```json
{
  "access_token": "<jwt>",
  "token_type": "bearer",
  "expires_in": 604800
}
```

El código firmado no incluirá el JWT. No requiere almacenamiento en base de datos y no será utilizable sin el `code_verifier` que permanece en la CLI.

## 7. Uso del JWT temporal

Después del canje:

1. validar JWT con `/auth/me`;
2. listar roles;
3. elegir rol activo que contenga:
   - `cotizaciones:ver`;
   - `proyectos:ver`;
   - `cotizaciones:imprimir`;
4. minimizar la suma total de acciones;
5. desempatar por ID ascendente;
6. crear `orgmorg-cli` mediante `POST /api/apikeys`;
7. validar API key creada;
8. guardar únicamente API key final.

El flujo debe seguir respetando el bypass efectivo de `is_superadmin`.

## 8. Componentes

### orgm-admin-backend

- modelos de entrada para inicio/canje CLI;
- validación estricta de callback loopback;
- creación y lectura de state OAuth CLI;
- creación y validación de código corto ligado a PKCE;
- `GET /auth/cli/start`;
- `POST /auth/cli/exchange`;
- bifurcación compatible dentro de `/auth/google/callback`.

Los endpoints web existentes conservarán su comportamiento.

### orgmorg

- `AuthMethodScreen` para seleccionar método;
- servicio de login web con listener loopback;
- generador PKCE y state;
- apertura de navegador mediante dependencia inyectable;
- eventos de progreso para mostrar URL, espera, canje y aprovisionamiento;
- cliente para `/auth/cli/exchange`;
- refactor del aprovisionamiento para recibir un token temporal desde entorno o login web;
- persistencia de la API key final mediante flujo existente.

Las dependencias de red, navegador, reloj y aleatoriedad serán inyectables en pruebas.

## 9. Seguridad

- HTTPS obligatorio hacia backend, salvo backend loopback explícito de desarrollo.
- Callback permitido solo en `127.0.0.1`; no se aceptará `localhost` ni hosts arbitrarios.
- PKCE S256 obligatorio.
- State OAuth firmado y limitado a diez minutos.
- Código CLI firmado y limitado a 60 segundos.
- JWT ausente de URL, HTML, frames, errores y logs.
- `code_verifier` ausente de URL y logs.
- Comparación segura de `state` y challenge.
- Listener enlazado únicamente a loopback.
- Listener cerrado siempre mediante `finally`.
- `config.json` conserva permisos `0600` y solo almacena API key final.

## 10. Errores

La CLI distinguirá:

- endpoint inválido;
- fallo al abrir navegador;
- timeout de cinco minutos;
- login cancelado por usuario;
- correo no autorizado;
- callback/state inválido;
- código vencido;
- PKCE inválido;
- backend no compatible con login CLI;
- JWT inválido;
- permisos de aprovisionamiento insuficientes;
- ausencia de rol compatible;
- API key final inválida;
- fallo de guardado.

Ningún error incluirá token, código o verifier.

La configuración anterior permanecerá intacta hasta validar la API key final.

## 11. Pruebas

### Backend

- acepta callback `127.0.0.1` válido;
- rechaza hosts, rutas, puertos y esquemas no permitidos;
- firma state OAuth CLI con vencimiento;
- conserva login web existente;
- callback CLI redirige con código y state, sin JWT;
- rechaza state alterado o vencido;
- canje acepta verifier correcto;
- canje rechaza código alterado, vencido o tipo incorrecto;
- canje rechaza verifier incorrecto;
- Google cancelado y correo no autorizado producen error seguro.

### CLI

- selector muestra ORGM_TOKEN y Google HTTPS;
- ORGM_TOKEN conserva comportamiento actual;
- ausencia de variable no modifica configuración;
- PKCE usa longitudes y formato correctos;
- listener usa `127.0.0.1` y puerto aleatorio;
- state incorrecto se rechaza;
- callback de error se muestra sin secretos;
- timeout cierra listener;
- fallo al abrir browser muestra URL de respaldo;
- canje devuelve JWT solo en memoria;
- JWT crea API key mínima y se descarta;
- solo API key validada llega a `saveConfig`;
- ningún frame contiene JWT, código o verifier;
- prueba de integración usa backend falso loopback y no producción.

## 12. Compatibilidad y despliegue

El backend debe desplegarse antes de publicar la CLI nueva. Mientras los endpoints CLI no estén disponibles:

- `ORGM_TOKEN` seguirá funcionando;
- API key manual seguirá funcionando;
- login Google mostrará mensaje de backend no compatible.

No se requiere migración de base de datos ni cambio en el formato de `config.json`.

En sesiones SSH, contenedores sin navegador o equipos donde el navegador no pueda regresar al loopback de la CLI, el usuario utilizará `ORGM_TOKEN` o API key manual.

## 13. Criterios de aceptación

1. Pantalla ofrece ORGM_TOKEN y Google HTTPS como métodos separados.
2. Login Google abre navegador y vuelve automáticamente a la CLI.
3. Callback solo acepta loopback seguro y valida state.
4. PKCE S256 protege el canje.
5. JWT nunca se guarda ni aparece en URL o UI.
6. Solo API key final validada se persiste.
7. API key posee los tres permisos funcionales.
8. API key manual continúa disponible.
9. Flujo ORGM_TOKEN continúa operativo.
10. Endpoint configurado es la única URL usada por ambos métodos.
11. Pruebas no contactan Google ni producción.
12. Build y suites completas pasan en ambos repositorios.
