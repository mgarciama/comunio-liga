# Tasks

## 1. Refactor base del worker

- [x] 1.1 Refactorizar `updateJornadas` para leer la matriz una vez, aplicar columnas en memoria y escribir un único `put` si hubo cambios, conservando el guard `yaCompleta` por columna — verify: `node --check worker.js` pasa y el harness de verificación (fetch mockeado) confirma que una matriz completa no produce escrituras
- [x] 1.2 Añadir `fetchJornadaPosiciones(session, roundId)` que llame a `rounds/league/{roundId}` y devuelva las posiciones oficiales — verify: `node --check worker.js` pasa y el harness con fetch mockeado devuelve las posiciones de la ronda pedida

## 2. Backfill de rondas anteriores

- [x] 2.1 Implementar en `updateBiwenger` el bucle de backfill (máx. 3 rondas anteriores; solo columnas no completas; solo rondas con partidos finalizados; reutiliza la sesión) — verify: `node --check worker.js` pasa y el harness con fetch mockeado rellena la columna vacía (caso J8) y salta las completas
- [x] 2.2 Proteger el reinicio: una columna pendiente con partidos "en juego" o sin posiciones publicadas no se escribe y queda pendiente para la siguiente ejecución — verify: harness con fetch mockeado confirma que la columna queda vacía y no hay `put`

## 3. Reparación local del dato (fuera de git)

- [ ] 3.1 Regenerar `jornadas-data.json` con `node update-jornadas.mjs` — verify: la columna de la jornada 8 aparece con 14 posiciones en el JSON — **BLOQUEADA (no es bug): el partido Rayo Vallecano–Athletic de la ronda 8 está `postponed` y sin jugar; Biwenger no publica posiciones de ronda incompleta. Se rellenará cuando se juegue (o con el backfill desplegado).** El script regeneró J1-J7 y J9-J10 (14/14) con posiciones oficiales.
- [x] 3.2 Reconstruir el sitio con `node build.mjs` — verify: build OK y `public/jornadas-data.json` contiene la jornada 8 — **Parcial: build OK; `public/jornadas-data.json` queda con J8=0/14 (correcto, ronda pendiente) y J1-J7/J9-J10 completas.**

## 4. Verificación de integración

- [x] 4.1 Validar el flujo completo del backfill simulando un cron con fetch mockeado: sesión → jornada actual completa → backfill rellena la J8 — verify: harness imprime las columnas y la J8 queda con 14/14 — **S1-S4 del harness pasan: J8=14/14, 1 único put, columnas completas intactas, cero puts en los casos en juego/sin publicar.**

## 5. Motivo visible de jornada sin puntuar

- [x] 5.1 Worker: persistir `jornadas-estado` con el motivo de las rondas en ventana (aplazado / en juego / sin publicar) y exponerlo en `GET /api` como `jornadasEstado` — verify: harness con partido `postponed` confirma motivo "aplazado" en KV y el escenario de partidos en juego confirma motivo "sin terminar" — **S2/S3/S5 pasan: motivos correctos y 1 solo put de estado.**
- [x] 5.2 Frontend (`src/app.js`): mostrar el motivo en la vista de jornada vacía (público y admin) con fallback al mensaje genérico — verify: `node build.mjs` OK y `index.html` contiene la rama que pinta el motivo — **build OK; `index.html` contiene "aún no se ha puntuado" y la lectura de `jornadasEstado`.**
- [x] 5.3 Fuente estática del motivo: `update-jornadas.mjs` genera `jornadas-estado.json` (espejo del worker), `build.mjs` lo copia a `public/` y el frontend lo mergea como fallback cuando el API no da motivo — verify: `node update-jornadas.mjs` + `node build.mjs` generan `public/jornadas-estado.json` con la J8 → **generado: `{"8": "Partido aplazado: Rayo Vallecano – Athletic"}`; build OK; `index.html` carga `jornadas-estado.json` (2 referencias).**

## Workflow follow-up

- Archivar el change una vez revisado.
- (Fuera de esta entrega local) `wrangler deploy` para publicar el worker.
