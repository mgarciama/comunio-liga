# Proposal

## Why

El cron del worker (`worker.js`) solo procesa la jornada en curso: escribe la columna de KV `jornadas` únicamente cuando todos sus partidos han finalizado y Biwenger ya publicó las posiciones oficiales dentro de sus ventanas horarias (07:00/13:00/17:30/21:00 Madrid ±2 min). Si una jornada no cumple esas condiciones a tiempo, queda perdida para siempre: cuando la siguiente jornada pasa a ser la actual, el worker nunca vuelve a llamar a la anterior. Es lo ocurrido con la jornada 8, vacía en KV (0/14) mientras la 9 y la 10 se capturaron con normalidad.

## What Changes

- El worker incorpora un **backfill de rondas recientes**: en cada ejecución programada revisa, además de la jornada actual, un número fijo de rondas anteriores y rellena en KV cualquier columna vacía cuyos partidos ya hayan finalizado.
- El worker almacena en KV el **motivo de las jornadas sin puntuar** (partido aplazado, partidos en juego, posiciones sin publicar) y el API lo expone para que la web lo muestre.
- El backfill usa las posiciones oficiales publicadas por Biwenger (`rounds/league/{roundId}`), reutilizando la sesión existente; no recalcula puntos ni sobrescribe columnas ya completas.
- Coste adicional bajo por cron: solo 2-3 peticiones extra mientras existan huecos.
- Reparación local inmediata del dato (fuera de git): regenerar `jornadas-data.json` con `update-jornadas.mjs` y reconstruir el build para que la jornada 8 aparezca en la web.

## Capabilities

### New Capabilities
- `worker-cron`: actualización automática de las posiciones de jornadas en KV desde la API de Biwenger, con backfill de rondas recientes no capturadas.

### Modified Capabilities
_No hay — es la primera capability del repositorio._

## Impact

- `worker.js`: nueva función para leer posiciones de una ronda concreta, lógica de backfill en `updateBiwenger` y persistencia del motivo de jornadas sin puntuar.
- `src/app.js`: muestra el motivo cuando una jornada no tiene posiciones.
- `jornadas-data.json` y `public/jornadas-data.json`: regenerados con el contenido de la jornada 8 (solo local, sin commit).
