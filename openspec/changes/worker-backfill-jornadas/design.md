# Design

## Context

El worker `worker.js` se ejecuta por cron 8 veces al día (4 ventanas de Madrid en verano e invierno, declaradas en `wrangler.jsonc`). Cada ejecución: login Biwenger → clasificación → KV `biwenger`; estado de la jornada actual → si todos los partidos acabaron → escribe la columna de la jornada actual en KV `jornadas`. No existe ninguna lectura de rondas anteriores (ver proposal.md — Why). El script local `update-jornadas.mjs` sí recorre todas las rondas de la temporada y usa `rounds/league/{roundId}` para posiciones oficiales, con cálculo por puntos como fallback (líneas 89-137) — es una referencia útil del shape de la API.

## Goals / Non-Goals

**Goals:**
- Capturar posiciones de jornadas recientes que quedaron vacías, sin intervención manual ni despliegue del dato.
- Mantener el coste del cron bajo: pocas peticiones extra, solo cuando hay huecos.
- Reutilizar la sesión ya abierta en cada ejecución y no sobrescribir jornadas completas.

**Non-Goals:**
- Portar al worker el fallback de cálculo por puntos de `update-jornadas.mjs` (cambio más grande y frágil; queda como follow-up documentado).
- Endpoint manual de reparación ni cambios en los scripts locales.
- Cambios de esquema en KV: la matriz `[14][38]` sigue igual.

## Decisions

### Decisión 1: Backfill de las N=3 rondas anteriores al round actual

Añadir una función `fetchJornadaPosiciones(session, roundId)` que llame a `rounds/league/{roundId}` y devuelva `{ roundId, jornadaNum, standings }`. En `updateBiwenger`, tras procesar la jornada actual, iterar desde la jornada anterior hacia atrás (máx. 3 rondas):

- Si la columna de esa jornada ya está completa en KV → saltar (0 peticiones).
- Si no: pedir los partidos de la ronda (`rounds/la-liga/{roundId}`); si no todos finalizaron → saltar y reintentar en la siguiente ejecución.
- Si todos finalizaron → copiar las posiciones oficiales (`standings[].lineup.position`) a la matriz y continuar.

Alternativas consideradas:
- **Recorrer todas las rondas de la temporada** (como `update-jornadas.mjs`): demasiadas peticiones por cron para un beneficio marginal — las jornadas antiguas ya están completas o quedaron fuera de rango hace semanas.
- **Script/endpoint manual de reparación**: arregla el caso concreto (lo haremos una vez en local) pero no evita la recurrencia; el backfill automático sí.

### Decisión 2: Una sola lectura y escritura de la matriz por ejecución

Hoy `updateJornadas` lee la matriz, escribe la columna de la jornada actual y hace un `put`. El backfill muta la misma matriz en memoria (varias columnas) y se hace **un único `put` al final** si hubo cambios. Menos operaciones de KV y estado consistente.

### Decisión 3: Guard por columna (`yaCompleta`)

Para cumplir "no sobrescribir jornadas completas": antes de rellenar una columna se comprueba `matrix.every(row => row[col] != null)`; si ya está completa, se omite sin llamar a la API de posiciones.

### Decisión 4: Motivo de jornada sin puntuar en KV y visible en la web

Durante cada ejecución programada el worker construye un mapa `{ jornada: motivo }` a partir de los partidos de las rondas en ventana (actual ± 3 hacia atrás): partido `postponed` → "Partido aplazado: equipo A – equipo B"; sin finalizar → "N/M partidos aún sin terminar"; finalizada sin posiciones → "Sin posiciones publicadas aún". Se persiste en la clave KV `jornadas-estado` (solo si cambió) y el `GET /api` lo expone como `jornadasEstado`. Cuando una columna pasa a estar completa, su motivo se elimina. El frontend (`src/app.js`) muestra el motivo en la vista de la jornada vacía y usa el mensaje genérico cuando no hay motivo.

Alternativas consideradas:
- **Consultar el estado de rondas en cada GET**: añadiría latencia y llamadas a Biwenger por cada visita; el estado es casi estático entre crons.
- **Calcular el motivo en el frontend**: la web no tiene acceso autenticado a la API de Biwenger.

**Fallback estático (sin deploy):** `update-jornadas.mjs` genera además `jornadas-estado.json` con los mismos motivos que el worker (solo rondas ya arrancadas y sin completar); `build.mjs` lo copia a `public/` y el frontend hace merge de los huecos que el API no cubra (`mergeEstadoData`). Así el motivo se ve en local/previsualización sin desplegar el worker. El API del worker (fuente fresca) siempre gana; el archivo se regenera al ejecutar el script.

## Risks / Trade-offs

- **Coste extra por cron** (hasta 3 rondas × 2 endpoints) → Mitigación: solo cuando hay columnas vacías; en estado normal son 0 peticiones extra porque todas las columnas recientes están completas.
- **Posiciones oficiales no publicadas todavía** → La columna queda pendiente y se reintenta en la siguiente ejecución hasta que Biwenger las publique; no se inventan valores.
- **Round id ausente o fuera de 1..38** → Se ignora esa ronda en el bucle (mismo manejo defensivo que hoy).

## Migration Plan

- Cambio solo de código en `worker.js`; el despliegue del worker es manual (`wrangler deploy`) y queda fuera de esta entrega local.
- Reparación del dato actual (jornada 8) en local: ejecutar `node update-jornadas.mjs` y `node build.mjs` para regenerar `jornadas-data.json` y el build; la web rellena los huecos del KV con el JSON.

## Open Questions

_No hay._
