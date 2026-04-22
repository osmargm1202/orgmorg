# Diseño: base de datos local unificada con merge viejo+nuevo

Fecha: 2026-04-22
Proyecto: orgmorg
Estado: aprobado para planificación

## Resumen

Orgmorg usará una base de datos SQLite local en una ruta configurable. La base se poblará con un merge de datos donde la fuente nueva manda para proyectos y cotizaciones, mientras que la fuente vieja aporta clientes y relaciones auxiliares para resolver cliente por proyecto cuando sea posible.

Cuando un proyecto nuevo no pueda asignarse con seguridad a un cliente existente, el sistema no bloqueará la importación. En su lugar, asignará temporalmente el proyecto y sus cotizaciones al cliente `55` (`ORGM`) y generará un archivo de export de pendientes para una segunda fase de corrección con bash/script.

## Objetivo

Construir una base de datos local actualizada y usable que consolide:

- clientes del dataset anterior
- proyectos del dataset nuevo
- cotizaciones del dataset nuevo
- relaciones auxiliares del dataset anterior para resolver `cliente_id`

La primera fase debe dejar la base lista para uso normal. La segunda fase corregirá asignaciones temporales de cliente usando el export generado.

## Fuentes de datos

### Fuente principal

- `data/proyectos.json`
- `data/cotizaciones.json`

Estas dos fuentes son la verdad principal para proyectos y cotizaciones.

### Fuente de apoyo

- `data/cliente.json`
- `data/proyecto_clientes.json`
- `data/cotizacion_clientes.json`

Estas fuentes viejas se usan para:

- poblar clientes históricos
- intentar resolver `cliente_id` de proyectos nuevos
- mantener compatibilidad con datos previos cuando ayuden al merge

## Regla principal de merge

La fuente nueva manda.

Esto significa:

- proyectos finales salen de `data/proyectos.json`
- cotizaciones finales salen de `data/cotizaciones.json`
- datos viejos no reemplazan registros nuevos
- datos viejos solo rellenan o ayudan a resolver relaciones faltantes

## Ruta de base de datos

La ruta de SQLite soportará dos mecanismos:

1. configuración persistente por comando `orgmorg config db-path <ruta>`
2. override por variable de entorno

Precedencia:

1. override por entorno
2. valor guardado en config
3. ruta default del proyecto

Esto permite uso diario normal y también ejecución controlada desde scripts o migraciones.

## Arquitectura propuesta

### Inicialización

1. Resolver ruta efectiva de DB
2. Crear directorio si no existe
3. Abrir o crear SQLite
4. Aplicar esquema bootstrap

### Seed / import fase 1

1. Cargar datasets nuevo + viejo
2. Importar clientes desde fuente vieja
3. Importar proyectos desde fuente nueva
4. Resolver `cliente_id` por proyecto con apoyo de fuente vieja cuando exista match confiable
5. Si no hay match, asignar cliente `55`
6. Importar cotizaciones desde fuente nueva usando siempre el `cliente_id` final del proyecto
7. Generar export de pendientes para revisión y fase 2

### Fase 2 posterior

Un bash/script separado leerá el export de pendientes y actualizará:

- `proyectos.cliente_id`
- `cotizaciones.cliente_id` asociadas al proyecto

La fase 2 no forma parte de esta implementación de diseño; solo se deja preparado el insumo.

## Modelo de datos final

Se mantienen tablas actuales:

- `clientes`
- `proyectos`
- `cotizaciones`
- `seed_sequences`
- `import_mappings` si sigue siendo útil para resolución reproducible

No se agrega tabla `clientes_pendientes` dentro de SQLite.

Los pendientes existirán únicamente como archivo exportado.

## Reglas por entidad

### Clientes

- importar clientes viejos desde `data/cliente.json`
- no crear cliente nuevo automático para proyectos ambiguos
- usar cliente `55` como asignación temporal para proyectos sin match
- si cliente `55` no existe, el proceso debe fallar con error claro

Decisión de diseño: la implementación debe validar explícitamente la existencia del cliente `55` antes de asignar pendientes.

### Proyectos

- todos los proyectos del dataset nuevo deben entrar en la base
- el `id` del proyecto se conserva desde la fuente nueva
- `id_externo` se conserva si existe
- resolución de `cliente_id`:
  1. intentar match por relación disponible desde dataset viejo
  2. si no hay match confiable, usar cliente `55`

### Cotizaciones

- todas las cotizaciones del dataset nuevo deben entrar si su proyecto existe
- `cliente_id` no se toma de fuente vieja cuando contradiga proyecto
- `cliente_id` de cotización siempre debe copiar el `cliente_id` final del proyecto
- si proyecto quedó temporalmente en `55`, sus cotizaciones también

Esto preserva integridad entre `proyectos` y `cotizaciones`.

## Export de pendientes

Se generará un archivo para segunda fase de corrección.

Ruta recomendada:

- `exports/clientes_pendientes.json`

Formato por registro:

```json
{
  "proyecto_id": 417,
  "proyecto_nombre": "PROYECTO RESIDENCIAL PUNTA CANA",
  "cliente_id_temporal": 55,
  "motivo": "Sin match confiable en datos viejos",
  "cotizaciones": [101, 102],
  "cliente_sugerido": null,
  "notas": null
}
```

Campos mínimos requeridos:

- `proyecto_id`
- `proyecto_nombre`
- `cliente_id_temporal`
- `motivo`
- `cotizaciones`

Campos opcionales útiles:

- `cliente_sugerido`
- `notas`

El export debe regenerarse completo en cada corrida para reflejar estado actual del seed.

## CLI y flujo operativo

### Configuración

- `orgmorg config db-path <ruta>` guarda ruta persistente
- variable de entorno permite override temporal

### Comandos

- `orgmorg db init` crea esquema en ruta efectiva
- `orgmorg db seed [dataDir]` ejecuta merge de fase 1

No se necesita comando nuevo para esta etapa si `db seed` ya encapsula el proceso.

## Salida esperada de `db seed`

El comando debe reportar al menos:

- ruta efectiva de base de datos
- conteo por archivo cargado
- clientes insertados
- proyectos insertados
- cotizaciones insertadas
- proyectos asignados temporalmente a cliente `55`
- cotizaciones asociadas a cliente `55`
- ruta del export de pendientes

## Errores y validaciones

El proceso debe fallar con mensaje claro si ocurre cualquiera de estos casos:

- cliente `55` no existe
- `data/proyectos.json` es inválido
- `data/cotizaciones.json` es inválido
- una cotización referencia un proyecto inexistente
- la ruta de DB no es escribible

## Idempotencia

El seed debe ser idempotente dentro de lo razonable:

- correr `db seed` dos veces no debe duplicar filas
- el export de pendientes debe regenerarse, no append infinito
- inserts deben usar estrategia segura (`INSERT OR IGNORE` o upsert controlado)

## Validación mínima

Se deben cubrir al menos estos casos:

1. la DB se crea en ruta correcta por config
2. la DB se crea en ruta correcta por override de entorno
3. proyecto con match válido usa cliente real
4. proyecto sin match usa cliente `55`
5. cotización de proyecto pendiente usa cliente `55`
6. export contiene proyectos pendientes correctos
7. re-ejecutar seed no duplica datos

## Alcance

Incluye:

- resolver ruta efectiva de DB
- poblar SQLite local
- consolidar datasets viejo+nuevo
- asignar cliente temporal `55` a pendientes
- generar export para fase 2

No incluye:

- script bash final de reasignación por proyecto
- UI adicional para resolver pendientes
- normalización avanzada de nombres fuera de reglas ya existentes
- reconciliación manual dentro de app

## Recomendación de implementación

Aplicar este diseño extendiendo flujo existente de importación en lugar de crear pipeline de staging nuevo.

Razón:

- menor cambio estructural
- aprovecha `src/import.ts` y `src/db.ts`
- reduce costo de adopción
- deja fase 2 desacoplada y simple

## Resultado esperado

Al terminar fase 1, orgmorg tendrá una base SQLite local operativa y consistente, con todos los proyectos y cotizaciones nuevos cargados, clientes viejos disponibles, y un listado explícito de asignaciones temporales pendientes para corrección posterior.
