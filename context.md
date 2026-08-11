# Contexto: login Google de ORGMorg

## Objetivo

Permitir que `orgmorg` obtenga una API key administrativa mediante uno de estos métodos:

1. Usar `ORGM_TOKEN` configurado para MCP.
2. Abrir el login Google existente, copiar el JWT o la URL del callback y pegarlo de forma oculta en la CLI.

Se decidió mantener el segundo método con pegado manual. No se implementará callback localhost, servicio temporal ni PKCE por ahora.

## Estado de `orgmorg`

La implementación del login dual y del aprovisionamiento restringido está terminada localmente.

Incluye:

- Selector entre `ORGM_TOKEN` y Google HTTPS.
- Apertura de `<apiBaseUrl>/auth/google/start` en el navegador.
- Entrada enmascarada para JWT o callback.
- Extracción de `access_token` desde:
  - JWT directo;
  - fragmento `#access_token=...`;
  - query `?access_token=...`.
- Reutilización prioritaria de una API key local válida.
- Aprovisionamiento automático de una segunda API key restringida desde `ORGM_TOKEN` o JWT web.
- Creación o reutilización del rol `orgmorg-cli-read-only`, con únicamente los permisos funcionales.
- Persistencia exclusiva de la API key final; el JWT, callback y `ORGM_TOKEN` permanecen en memoria.
- Conservación de la configuración manual de API key.

Permisos funcionales requeridos:

- `cotizaciones:ver`
- `proyectos:ver`
- `cotizaciones:imprimir`

Verificación realizada:

- Build correcto y 52 pruebas aprobadas.
- `https://admin-api.or-gm.com/auth/google/start` devuelve `307` hacia Google.
- El Client ID desplegado tiene el sufijo esperado y 72 caracteres; no se registró su valor.
- Un script `npx tsx --eval`, ejecutado con `ORGM_TOKEN` inyectado por `sops-shared-env`, aprovisionó una API key distinta, la guardó localmente y validó únicamente los permisos funcionales.
- La búsqueda `a` devolvió 565 resultados; el humo posterior creó una carpeta temporal y descargó el PDF de oferta desde producción.

Commits principales:

- `062be4c` — helpers de login web.
- `bc5da3b` — aprovisionamiento desde token temporal.
- `91f3e93` — selector y pantalla de login web.
- `27d25d8` — integración y prueba de persistencia segura.

## Estado OAuth desplegado

El inicio de sesión abre:

```text
https://admin-api.or-gm.com/auth/google/start
```

La comprobación sin credenciales confirmó un `307` hacia `accounts.google.com`. El Client ID configurado tiene el formato esperado `*.apps.googleusercontent.com`; la corrección de producción ya está aplicada.

No se ejecutó un login Google interactivo durante la última verificación, por lo que siguen pendientes el consentimiento y el callback reales.

## Cambios requeridos en `orgm-admin-backend`

No se requiere cambiar la lógica Python actual para el flujo de credenciales. La CLI crea el rol restringido mediante los endpoints existentes de roles y API keys.

```env
AUTH_ENABLED=true

GOOGLE_CLIENT_ID=<oauth-client-id-completo>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<secret-correspondiente>

OAUTH_REDIRECT_URI=https://admin-api.or-gm.com/auth/google/callback
FRONTEND_URL=https://admin.or-gm.com

JWT_SECRET=<secreto-fuerte-y-estable>
JWT_EXPIRE_DAYS=7

ALLOWED_EMAILS=osmargm1202@gmail.com,osmar@or-gm.com
```

Los valores reales de `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y `JWT_SECRET` deben almacenarse en el mecanismo de secretos del despliegue. No deben incluirse en Git ni mostrarse en registros.

Archivos backend relacionados:

- `src/config.py` — declara variables de autenticación.
- `src/services/auth_service.py` — construye URL OAuth, valida `state`, intercambia código y emite JWT.
- `main.py` — expone `/auth/google/start` y `/auth/google/callback`.
- `docker-compose.yml` — inyecta variables OAuth cuando se usa ese despliegue.
- `.env.example` — documenta nombres y valores de referencia; no contiene credenciales reales.

## Configuración requerida en Google Cloud

Crear o seleccionar un cliente **OAuth 2.0 Web application**.

Configurar como redirect URI autorizado exactamente:

```text
https://admin-api.or-gm.com/auth/google/callback
```

También se debe verificar:

- OAuth consent screen configurado.
- Scopes `openid email profile`.
- Si la aplicación está en modo `Testing`, agregar los correos utilizados como test users.
- Client Secret correspondiente al mismo Client ID configurado en backend.

## Autorización interna del backend

Después de completar Google OAuth, el correo debe cumplir una condición:

- existir como usuario activo en la base de datos; o
- aparecer en `ALLOWED_EMAILS`.

Los correos de `ALLOWED_EMAILS` funcionan como superadmin para el aprovisionamiento inicial.

La CLI prioriza una API key local válida con los permisos funcionales. Si no existe, usa el JWT web o `ORGM_TOKEN` temporal para:

1. crear o reutilizar `orgmorg-cli-read-only`;
2. asignarle únicamente `cotizaciones:ver`, `cotizaciones:imprimir` y `proyectos:ver`;
3. crear una nueva API key con ese rol y persistir solo esa key.

Un token temporal que no sea superadmin requiere `roles:ver`, `roles:crear` y `usuarios:crear`.

## Flujo esperado después de corregir OAuth

1. Ejecutar `npm run dev` en `orgmorg`.
2. Entrar a `Configuración`.
3. Seleccionar `Iniciar sesión / Obtener API key`.
4. Elegir `Iniciar sesión con Google (HTTPS)`.
5. Completar login en Google.
6. Copiar el JWT o la URL completa que contiene `access_token`.
7. Pegarla en la entrada oculta de la CLI.
8. La CLI crea o reutiliza el rol restringido, crea la segunda API key y guarda solo la key `orgm_...`.

## Validación posterior al despliegue

1. Confirmar que `/auth/google/start` devuelve `307` hacia Google.
2. Confirmar que el Client ID tiene formato válido sin imprimirlo completo.
3. Completar Google OAuth sin recibir `invalid_client`.
4. Confirmar redirect a:

   ```text
   https://admin-api.or-gm.com/auth/google/callback
   ```

5. Confirmar que el callback final contiene `access_token`.
6. Pegar callback en la CLI.
7. Confirmar mensaje `API key configurada`.
8. Revisar `~/.config/orgmorg/config.json` y comprobar que solo contiene la API key final, no JWT ni callback.

## Pendientes

### Backend

- Completar una prueba Google interactiva: consentimiento, callback y emisión de JWT de siete días.
- Verificar `ALLOWED_EMAILS` o un usuario activo para la cuenta que hará el login.


## Restricciones vigentes

- No mostrar, registrar ni persistir JWT o callback.
- Guardar únicamente la API key final validada.
- Usar exclusivamente `apiBaseUrl` configurado.
- Mantener entrada manual de API key.
- No implementar servicio localhost ni PKCE por ahora.
