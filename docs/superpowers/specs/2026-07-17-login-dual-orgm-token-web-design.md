# Diseño: login dual con ORGM_TOKEN y callback web existente

Fecha: 2026-07-17  
Proyecto: orgmorg  
Estado: aprobado

## 1. Objetivo

Permitir que orgmorg obtenga su API key mediante dos métodos:

1. reutilizar `ORGM_TOKEN` configurado para MCP;
2. abrir el login Google HTTPS existente y pegar el token devuelto por su callback.

El backend administrativo no cambia. Ambos métodos validan el token, crean una API key con permisos mínimos cuando sea necesario y guardan únicamente la API key final.

## 2. Situación actual

El backend ya implementa:

- `GET /auth/google/start`;
- login Google;
- `GET /auth/google/callback`;
- emisión de JWT utilizable como Bearer;
- callback web que devuelve el token;
- aceptación del mismo token mediante `ORGM_TOKEN` en MCP.

Orgmorg ya puede aprovisionar una API key desde `ORGM_TOKEN`. El ajuste pendiente es ofrecer el login web como alternativa cuando esa variable no exista.

## 3. Alcance

### Incluye

- selector de método de acceso;
- conservación del flujo `ORGM_TOKEN`;
- apertura del login Google en navegador;
- presentación de URL manual si el navegador no abre;
- entrada oculta para pegar JWT o URL completa del callback;
- extracción de `access_token` desde fragmento o query del callback;
- validación del JWT;
- creación de API key con rol compatible de menor privilegio;
- guardado exclusivo de API key final;
- conservación de API key manual;
- pruebas sin producción.

### No incluye

- cambios en `orgm-admin-backend`;
- callback localhost;
- PKCE nuevo;
- login con contraseña;
- lectura automática de sesión o almacenamiento del navegador;
- acceso automático al portapapeles;
- almacenamiento o renovación del JWT;
- revocación automática de API keys anteriores.

## 4. Interfaz

La opción `Iniciar sesión / Obtener API key` abrirá:

```text
Acceso administrativo

> Usar ORGM_TOKEN
  Iniciar sesión con Google (HTTPS)
  Volver
```

`API key manual` permanece en Configuración.

Si ya existe una API key válida con permisos funcionales, la pantalla informará que el acceso está configurado y no creará otra hasta elegir explícitamente `Reconfigurar`.

## 5. Flujo ORGM_TOKEN

El comportamiento actual se conserva:

1. leer `ORGM_TOKEN`;
2. si comienza con `orgm_`, validar la key;
3. si es JWT, validar identidad y permisos de aprovisionamiento;
4. seleccionar rol activo compatible de menor privilegio;
5. crear y validar API key;
6. guardar únicamente API key final.

Si falta la variable, se muestra un error y se permite volver al selector para usar login web.

## 6. Flujo web HTTPS

1. Cargar `apiBaseUrl` de configuración.
2. Construir:

```text
<apiBaseUrl>/auth/google/start
```

1. Mostrar el endpoint que se utilizará.
2. Abrir la URL en navegador predeterminado.
3. Si falla la apertura, mostrar URL para abrir manualmente.
4. Mostrar instrucciones:
   - completar login Google;
   - copiar token o URL del callback;
   - volver a orgmorg;
   - pegar valor en campo oculto.
5. Al enviar, extraer token.
6. Limpiar inmediatamente el valor pegado del estado de pantalla.
7. Validar JWT con `/auth/me`.
8. Crear y validar API key mediante flujo existente.
9. Guardar únicamente API key final.
10. Mostrar correo, rol y key enmascarada.

## 7. Formatos aceptados

La entrada aceptará:

### JWT directo

```text
eyJ...
```

### URL con fragmento

```text
https://admin.or-gm.com/auth/callback#access_token=eyJ...
```

### URL con query

```text
https://admin.or-gm.com/auth/callback?access_token=eyJ...
```

La función pura `extractAccessToken(value)`:

1. recorta espacios;
2. si el valor es URL, busca `access_token` en fragmento y query;
3. si no es URL, usa el valor como token directo;
4. rechaza valor vacío o token ausente;
5. nunca incluye la entrada completa en errores.

## 8. Aprovisionamiento

La lógica de aprovisionamiento se extraerá a una función genérica que recibe un token temporal:

```ts
provisionApiKeyFromToken({ token, source, createClient })
```

Fuentes admitidas:

- `environment-key`;
- `environment-jwt`;
- `browser-jwt`;
- `existing` para resultado de key configurada.

Permisos funcionales de API key final:

```text
cotizaciones:ver
proyectos:ver
cotizaciones:imprimir
```

Permisos de aprovisionamiento del JWT:

```text
roles:ver
usuarios:crear
```

`is_superadmin` conserva su bypass efectivo aunque el mapa de permisos esté vacío.

## 9. Componentes

### `AuthMethodScreen`

- valida API key existente;
- muestra estado configurado o selector de métodos;
- exige acción explícita para reconfigurar.

### `TokenLoginScreen`

- conserva flujo `ORGM_TOKEN`;
- vuelve al selector mediante Escape.

### `WebLoginScreen`

- muestra endpoint y URL de login;
- abre navegador mediante dependencia inyectable;
- recibe token en entrada oculta;
- limpia token al enviarlo;
- aprovisiona y guarda API key final;
- muestra errores controlados y resultado enmascarado.

### Servicios

- `openLoginPage(url)` abre navegador;
- `extractAccessToken(value)` normaliza JWT o callback URL;
- `provisionApiKeyFromToken(...)` concentra validación, rol y creación de key.

## 10. Seguridad

- HTTPS obligatorio hacia backend, salvo loopback de desarrollo ya permitido.
- URL de login deriva únicamente de `apiBaseUrl` configurado.
- JWT se mantiene solo en memoria durante envío y aprovisionamiento.
- Campo usa máscara y nunca imprime valor real.
- Estado de entrada se limpia antes de llamadas de red.
- JWT no aparece en frames, errores, logs ni `config.json`.
- No se lee portapapeles automáticamente.
- Solo API key final validada llega a `saveConfig`.
- La configuración anterior permanece intacta ante error.

## 11. Errores

Se distinguirán:

- `ORGM_TOKEN` ausente;
- endpoint inválido;
- navegador no disponible;
- entrada vacía;
- callback sin `access_token`;
- JWT inválido o vencido;
- correo no autorizado;
- permisos de aprovisionamiento insuficientes;
- ausencia de rol compatible;
- API key final inválida;
- fallo de guardado.

Ningún error repetirá token o URL de callback pegada.

## 12. Pruebas

### Extracción

- JWT directo;
- fragmento `#access_token`;
- query `?access_token`;
- espacios;
- URL sin token;
- entrada vacía;
- errores sin secreto.

### Aprovisionamiento

- token web crea API key mínima;
- superadmin funciona con permisos vacíos;
- JWT no aparece en resultado;
- solo key validada se persiste.

### UI

- selector muestra ambos métodos;
- API key existente evita duplicado;
- navegador recibe URL derivada del endpoint configurado;
- fallo del opener deja URL visible;
- entrada está enmascarada;
- enviar limpia JWT del frame;
- éxito guarda API key y muestra máscara;
- errores no guardan configuración;
- API key manual permanece.

Las pruebas usarán dependencias inyectadas y no contactarán Google ni producción.

## 13. Criterios de aceptación

1. Configuración ofrece ORGM_TOKEN y Google HTTPS.
2. Opción web abre el login existente del backend.
3. Usuario puede pegar JWT o URL del callback.
4. Entrada nunca muestra el secreto.
5. JWT nunca se persiste.
6. Solo API key final validada se guarda.
7. API key posee permisos funcionales requeridos.
8. API key existente no genera duplicado automáticamente.
9. API key manual continúa disponible.
10. No se modifica `orgm-admin-backend`.
11. Build y suite completa pasan.
