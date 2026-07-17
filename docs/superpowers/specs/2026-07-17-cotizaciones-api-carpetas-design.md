# Diseño: consulta de cotizaciones y creación de carpetas

Fecha: 2026-07-17  
Proyecto: orgmorg  
Estado: pendiente de revisión escrita

## 1. Objetivo

Simplificar orgmorg para que realice un solo flujo operativo:

1. consultar cotizaciones existentes por nombre de proyecto;
2. seleccionar una cotización;
3. crear o completar su carpeta de proyecto;
4. descargar el PDF actualizado de la cotización dentro de `Oferta`.

La aplicación dejará de crear o modificar datos administrativos. El sistema administrativo será la única fuente de proyectos y cotizaciones.

## 2. Alcance

### 2.1 Incluye

- configuración del endpoint base del sistema administrativo;
- configuración de una carpeta base obligatoria;
- configuración y persistencia segura de una API key;
- validación de credenciales;
- búsqueda por nombre de proyecto;
- selección de una cotización por operación;
- creación de la estructura definida en `template/`;
- actualización no destructiva de carpetas existentes;
- descarga del PDF actualizado dentro de `Oferta`;
- interfaz Ink reducida a búsqueda, configuración y salida.

### 2.2 No incluye

- SQLite local;
- seed, importación o reconciliación de datasets;
- creación de proyectos o cotizaciones;
- edición, eliminación o recuperación de proyectos;
- gestión de clientes;
- consulta del último número de cotización;
- organización de archivos por tipo o fecha;
- descarga de archivos históricos o editables XLSX;
- comandos no interactivos distintos de `--help` y `--version`;
- selección múltiple o creación masiva de carpetas;
- almacenamiento de contraseñas de Google.

El código, pantallas, comandos, datos y dependencias exclusivos de estas funciones se eliminarán. No basta con ocultarlos en el menú.

## 3. Fuente de datos y contrato API

Backend de producción:

```text
https://admin-api.or-gm.com
```

La URL será editable para soportar desarrollo y cambios de infraestructura.

Contrato confirmado en `orgm-admin-backend`, commit `088065bf21b24bdc806670e4c4d8a4086a7bd02f`:

- Validar credencial: `GET /auth/me`; requiere credencial válida.
- Buscar cotizaciones: `GET /api/cotizaciones/search?q=<texto>`; requiere `cotizaciones:ver`.
- Resolver proyecto: `GET /api/proyectos/{id}`; requiere `proyectos:ver`.
- Descargar PDF actualizado: `GET /api/cotizaciones/{id}/pdf`; requiere `cotizaciones:imprimir`.

Todas las solicitudes autenticadas enviarán:

```http
Authorization: Bearer orgm_...
```

El tenant se obtiene de la API key. `X-Tenant-Id` no será configurable ni necesario mientras el backend lo resuelva desde la credencial.

### 3.1 Particularidad de la búsqueda

`GET /api/cotizaciones/search` busca por cliente, proyecto, servicio y descripción. Además, su respuesta contiene `id_proyecto`, pero no el nombre relacionado.

Para garantizar que orgmorg busque exclusivamente por nombre de proyecto:

1. consultar `/api/cotizaciones/search?q=<texto>`;
2. agrupar resultados por `id_proyecto`;
3. consultar cada proyecto único una sola vez;
4. normalizar texto para comparación insensible a mayúsculas y acentos;
5. conservar únicamente proyectos cuyo nombre contenga el término buscado;
6. ordenar sus cotizaciones por ID descendente.

Las consultas de proyecto se deduplicarán dentro de cada búsqueda.

## 4. Configuración

Archivo:

```text
~/.config/orgmorg/config.json
```

Estructura lógica:

```json
{
  "apiBaseUrl": "https://admin-api.or-gm.com",
  "basePath": "/ruta/base/de/proyectos",
  "apiKey": "orgm_..."
}
```

### 4.1 Reglas

- `apiBaseUrl`, `basePath` y `apiKey` son obligatorios.
- La aplicación bloqueará búsqueda y creación mientras falte alguno.
- La interfaz sugerirá `https://admin-api.or-gm.com` como endpoint inicial.
- El endpoint debe usar HTTPS, excepto `http://localhost` y loopback para desarrollo.
- `basePath` debe existir o poder crearse y ser escribible.
- `apiKey` debe iniciar con `orgm_`.
- La credencial se validará con `/auth/me` antes de guardar configuración completa.
- La API key se ingresará con campo oculto.
- La key completa no se mostrará en pantallas, mensajes, diagnósticos ni logs.
- El directorio de configuración tendrá permisos `0700` cuando el sistema lo soporte.
- `config.json` tendrá permisos `0600` cuando el sistema lo soporte.
- La API key no se aceptará como argumento CLI para evitar exposición en historial o lista de procesos.

## 5. Arquitectura

Se conservarán TypeScript, Ink, el sistema de navegación, el tema, el empaquetado npm y `template/`. Se reemplazará la capa SQLite por un cliente HTTP pequeño.

### 5.1 Módulo de configuración

Responsabilidades:

- cargar y normalizar configuración;
- validar valores requeridos;
- guardar configuración con permisos restrictivos;
- enmascarar secretos para presentación;
- ofrecer errores de configuración accionables.

No realizará llamadas HTTP fuera de una función explícita de validación.

### 5.2 Cliente API administrativo

Responsabilidades:

- construir URLs seguras desde `apiBaseUrl`;
- agregar encabezado Bearer;
- aplicar timeouts;
- reintentar operaciones GET transitorias;
- decodificar respuestas JSON;
- validar `Content-Type` del PDF;
- traducir errores HTTP a errores de dominio sin incluir la API key.

Operaciones públicas:

- `validateCredentials()`;
- `searchQuotationsByProjectName(query)`;
- `downloadQuotationPdf(quotationId, destination)`.

La resolución y deduplicación de proyectos quedará encapsulada dentro de la búsqueda. La interfaz no conocerá detalles de múltiples endpoints.

### 5.3 Servicio de carpetas

Responsabilidades:

- sanear el nombre del proyecto para uso en sistema de archivos;
- calcular ruta y vista previa;
- comprobar plantilla y permisos;
- preparar carpeta nueva de forma transaccional;
- completar carpeta existente sin borrar contenido;
- colocar el PDF mediante reemplazo atómico;
- limpiar temporales ante fallo.

Este módulo no realizará búsquedas ni autenticación.

### 5.4 Interfaz Ink

Menú principal:

1. `Buscar cotización`
2. `Configuración`
3. `Salir`

Pantallas mínimas:

- estado de configuración;
- edición de endpoint;
- edición de carpeta base;
- edición de API key;
- entrada de búsqueda;
- resultados;
- confirmación;
- progreso;
- resultado o error.

## 6. Flujo operativo

### 6.1 Configuración inicial

1. Usuario entra en Configuración.
2. Define endpoint y carpeta base.
3. Ingresa API key en campo oculto.
4. Aplicación valida sintaxis local.
5. Aplicación llama `/auth/me`.
6. Si la credencial es válida, guarda configuración con permisos restrictivos.
7. Si falla, conserva valores no secretos útiles, no persiste una key inválida y muestra causa.

### 6.2 Búsqueda

1. Usuario escribe parte del nombre del proyecto.
2. Aplicación consulta cotizaciones y resuelve proyectos únicos.
3. Aplicación elimina coincidencias provenientes solo de cliente, servicio o descripción.
4. Muestra por resultado:
   - ID de cotización;
   - nombre del proyecto;
   - fecha;
   - estado;
   - descripción cuando ayude a distinguir.
5. Usuario elige una cotización.

Una búsqueda vacía no consultará toda la base. Se solicitará un término antes de continuar.

### 6.3 Confirmación

Antes de escribir se mostrará:

- ID de cotización;
- nombre original del proyecto;
- nombre saneado de carpeta;
- ruta completa;
- ruta del PDF.

El usuario confirma o regresa a resultados.

### 6.4 Creación nueva

Formato de carpeta:

```text
<id_cotización> - <nombre_proyecto_saneado>
```

Procedimiento:

1. validar `basePath` y `template/`;
2. descargar PDF a un archivo temporal dentro del mismo sistema de archivos del destino;
3. crear una carpeta temporal hermana;
4. copiar estructura completa de `template/`;
5. colocar PDF en `Oferta/cotizacion_<id>.pdf`;
6. renombrar carpeta temporal al nombre final;
7. limpiar temporales si cualquier paso falla.

El renombrado final evita presentar una carpeta incompleta como resultado exitoso.

### 6.5 Carpeta existente

Si la ruta final ya existe:

1. no borrar ni reemplazar la carpeta;
2. descargar y validar PDF antes de modificar contenido;
3. crear únicamente directorios faltantes definidos por `template/`;
4. no copiar `.gitkeep` cuando no sea necesario para operación;
5. reemplazar `Oferta/cotizacion_<id>.pdf` mediante archivo temporal y `rename`;
6. conservar todos los demás archivos.

La operación será idempotente: repetirla deja la misma estructura y un PDF actualizado.

## 7. Manejo de errores

- Config incompleta: bloquear búsqueda y dirigir a Configuración.
- `401`: informar key inválida o revocada.
- `403`: informar permiso requerido según operación.
- `404` de proyecto o PDF: no crear ni modificar carpeta.
- `429` o `5xx`: reintentar GET hasta dos veces con espera incremental.
- Timeout o desconexión: reintentar; luego conservar estado anterior.
- Respuesta PDF con tipo incorrecto: rechazar contenido y limpiar temporal.
- `template/` ausente: bloquear creación con ruta esperada.
- `basePath` no escribible: informar ruta exacta sin crear contenido parcial.
- Espacio insuficiente: limpiar temporales y conservar PDF anterior.
- Nombre inválido: sanear y mostrar nombre final antes de confirmar.

Timeouts iniciales:

- JSON: 15 segundos;
- PDF: 120 segundos.

Solo se reintentarán solicitudes GET seguras. No se reintentarán `401`, `403` ni `404`.

## 8. Nombres y saneamiento

El ID de cotización no se modifica.

El nombre del proyecto:

- elimina separadores `/` y `\\`;
- elimina caracteres de control;
- reemplaza caracteres inválidos por espacio o guion;
- colapsa espacios repetidos;
- elimina puntos y espacios finales;
- evita nombres reservados del sistema cuando corresponda;
- aplica un límite razonable para mantener la ruta completa utilizable.

La interfaz siempre mostrará nombre original y nombre final cuando sean distintos.

## 9. Pruebas

### 9.1 Configuración

- carga configuración válida;
- detecta campos faltantes;
- normaliza endpoint;
- permite loopback HTTP y rechaza HTTP remoto;
- guarda archivo con permisos restrictivos;
- enmascara API key;
- no persiste key inválida.

### 9.2 Cliente API

- agrega Bearer sin filtrar secreto;
- codifica término de búsqueda;
- deduplica solicitudes de proyecto;
- filtra coincidencias exclusivamente por proyecto;
- normaliza mayúsculas y acentos;
- ordena cotizaciones por ID descendente;
- traduce `401`, `403`, `404`, `429` y `5xx`;
- reintenta solo errores transitorios;
- acepta únicamente `application/pdf` para descarga.

### 9.3 Sistema de archivos

- crea carpeta nueva con estructura completa;
- guarda PDF dentro de `Oferta`;
- sanea nombres inválidos;
- conserva archivos de carpeta existente;
- crea solo directorios faltantes;
- reemplaza PDF atómicamente;
- limpia archivos y carpetas temporales;
- no presenta éxito ante operación parcial.

### 9.4 Interfaz

- bloquea búsqueda con configuración incompleta;
- permite configurar y validar valores;
- recorre búsqueda, resultados, confirmación y éxito;
- regresa con Escape sin ejecutar operación;
- Ctrl+C sale correctamente;
- nunca muestra API key completa.

Las pruebas de integración usarán un servidor HTTP simulado. No dependerán del backend de producción.

## 10. Criterios de aceptación

El cambio se considera completo cuando:

1. un usuario configura endpoint, carpeta base y API key;
2. la credencial se valida contra el backend;
3. una búsqueda por nombre devuelve solo proyectos coincidentes;
4. el usuario puede seleccionar una cotización;
5. se crea o completa `<base>/<id> - <proyecto>/`;
6. el PDF actualizado queda en `Oferta/cotizacion_<id>.pdf`;
7. repetir la operación conserva archivos y actualiza PDF;
8. errores de red, permisos o disco no dejan resultados parciales;
9. ninguna función retirada permanece accesible por menú o comando;
10. SQLite y dependencias asociadas salen del paquete;
11. compilación y suite completa pasan.

## 11. Fuentes verificadas

- Backend y dominios: [`README.md`](https://github.com/osmargm1202/orgm-admin-backend/blob/088065bf21b24bdc806670e4c4d8a4086a7bd02f/README.md#L55-L76)
- Middleware y autenticación: [`main.py`](https://github.com/osmargm1202/orgm-admin-backend/blob/088065bf21b24bdc806670e4c4d8a4086a7bd02f/main.py#L242-L335)
- API keys y JWT: [`auth_service.py`](https://github.com/osmargm1202/orgm-admin-backend/blob/088065bf21b24bdc806670e4c4d8a4086a7bd02f/src/services/auth_service.py#L106-L153)
- Búsqueda de cotizaciones: [`main.py`](https://github.com/osmargm1202/orgm-admin-backend/blob/088065bf21b24bdc806670e4c4d8a4086a7bd02f/main.py#L660-L699)
- Respuesta de cotización: [`_models.py`](https://github.com/osmargm1202/orgm-admin-backend/blob/088065bf21b24bdc806670e4c4d8a4086a7bd02f/_models.py#L319-L340)
- Generación de PDF: [`main.py`](https://github.com/osmargm1202/orgm-admin-backend/blob/088065bf21b24bdc806670e4c4d8a4086a7bd02f/main.py#L874-L905)

## 12. Próximo paso

Después de revisar y aprobar esta especificación, se preparará un plan de implementación por tareas pequeñas, con pruebas primero y puntos de verificación antes de eliminar módulos existentes.
