# Diseño: obtención de API key desde ORGM_TOKEN y título ORGMorg

Fecha: 2026-07-17  
Proyecto: orgmorg  
Estado: pendiente de revisión escrita

## 1. Objetivo

Agregar en Configuración una opción que reutilice `ORGM_TOKEN` para obtener y guardar automáticamente la API key requerida por orgmorg. Corregir también el título visible de `ORGMcalc` a `ORGMorg`.

El ajuste no requiere cambios en `orgm-admin-backend`.

## 2. Alcance

Incluye:

- opción `Iniciar sesión / Obtener API key` dentro de Configuración;
- reutilización de `ORGM_TOKEN` ya usado por MCP;
- guardado directo cuando el token ya es una API key `orgm_...`;
- creación de una API key cuando `ORGM_TOKEN` es JWT;
- selección automática del rol compatible de menor privilegio;
- validación final antes de persistir;
- corrección del título a `ORGMorg`;
- pruebas del flujo, errores y protección de secretos.

No incluye:

- OAuth nuevo para CLI;
- callback local de navegador;
- cambios en backend o frontend administrativo;
- almacenamiento del JWT;
- eliminación de entrada manual de API key.

## 3. Fuente del acceso

El MCP oficial usa:

```text
ORGM_TOKEN
```

Orgmorg leerá esta variable directamente desde `process.env`. El valor no se mostrará, no se incluirá en errores y no se escribirá en configuración cuando sea JWT.

## 4. Interfaz

Menú Configuración:

1. `Iniciar sesión / Obtener API key`
2. `Endpoint administrativo`
3. `Carpeta base`
4. `API key manual`

El nuevo elemento abrirá `TokenLoginScreen`.

Título del banner:

```text
ORGMorg
```

No debe permanecer ninguna referencia visible a `ORGMcalc`.

## 5. Flujo

### 5.1 API key existente en configuración

Antes de crear una nueva key:

1. cargar configuración;
2. si existe `apiKey`, validarla con `/auth/me`;
3. comprobar permisos requeridos;
4. si es válida, terminar sin crear duplicado.

La entrada manual seguirá disponible para reemplazarla.

### 5.2 ORGM_TOKEN tipo API key

Si `ORGM_TOKEN` comienza con `orgm_`:

1. validar con `/auth/me`;
2. comprobar permisos requeridos;
3. guardar en `config.json`;
4. mostrar correo y prefijo enmascarado.

### 5.3 ORGM_TOKEN tipo JWT

Si no comienza con `orgm_`:

1. validar JWT mediante `/auth/me`;
2. consultar `GET /api/roles`;
3. conservar roles activos que incluyan:
   - `cotizaciones:ver`;
   - `proyectos:ver`;
   - `cotizaciones:imprimir`;
4. calcular total de acciones permitidas por rol;
5. elegir rol con menor total;
6. desempatar por ID ascendente;
7. crear key mediante `POST /api/apikeys` con:

```json
{
  "nombre": "orgmorg-cli",
  "rol_id": 123
}
```

1. validar la key recién creada y sus permisos;
2. guardar únicamente la API key nueva;
3. mostrar correo, nombre del rol y prefijo enmascarado.

## 6. Cliente API

`AdminApiClient` añadirá operaciones autenticadas con token temporal:

- `listRoles()`;
- `createApiKey(name, roleId)`.

Tipos mínimos:

```ts
interface AdminRole {
  id: number
  name: string
  active: boolean
  permissions: Record<string, string[]>
}

interface CreatedApiKey {
  apiKey: string
  roleId: number
  roleName: string
}
```

La lógica de selección de rol será una función pura y probada por separado.

## 7. Permisos

Permisos funcionales obligatorios de la key final:

```text
cotizaciones:ver
proyectos:ver
cotizaciones:imprimir
```

Permisos necesarios en el JWT para obtener la key automáticamente:

```text
roles:ver
usuarios:crear
```

Si faltan, el mensaje indicará permiso exacto sin revelar token.

## 8. Errores

- API key existente válida: informar que ya está configurada; no crear otra.
- `ORGM_TOKEN` ausente: indicar que debe exportarse en entorno.
- `401`: token inválido o vencido.
- `403` consultando roles: indicar `roles:ver`.
- `403` creando key: indicar `usuarios:crear`.
- sin rol compatible: listar permisos funcionales requeridos.
- respuesta de creación sin `api_key`: tratar como respuesta inválida.
- key creada sin permisos: no persistir.
- fallo de guardado: informar sin imprimir key.

La configuración anterior permanece intacta hasta completar validación y creación.

## 9. Pruebas

### Cliente API

- parsea roles válidos;
- traduce 403 con permiso exacto;
- crea API key con nombre y rol correctos;
- rechaza respuesta sin key.

### Selección de rol

- descarta inactivos;
- descarta roles sin permisos requeridos;
- elige menor total de acciones;
- desempata por ID ascendente.

### Pantalla

- muestra opción nueva;
- key de entorno se valida y guarda;
- JWT crea y guarda key;
- key existente evita duplicado;
- token ausente no llama API;
- error no guarda configuración;
- ningún frame contiene secreto.

### Título

- render contiene `ORGMorg`;
- render no contiene `ORGMcalc`.

## 10. Criterios de aceptación

1. Configuración muestra botón de obtención automática.
2. Botón reutiliza `ORGM_TOKEN` sin backend nuevo.
3. API key existente se guarda directamente después de validar.
4. JWT crea key con rol mínimo compatible.
5. JWT nunca se persiste.
6. Key final posee tres permisos funcionales.
7. Título visible dice `ORGMorg`.
8. Entrada manual continúa operativa.
9. Build y suite completa pasan.
