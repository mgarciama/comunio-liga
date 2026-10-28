# Spec Delta

## Purpose

Mantiene las posiciones de las jornadas de la liga actualizadas en el KV del worker, capturándolas automáticamente desde la API de Biwenger y rellenando huecos de rondas recientes que no se capturaron a tiempo.

## ADDED Requirements

### Requirement: Backfill de jornadas recientes no capturadas

Cuando se ejecuta la actualización programada, el worker DEBE revisar también las rondas anteriores a la actual (hasta un máximo de 3) y escribir en KV las posiciones oficiales de cualquier jornada cuya columna esté vacía y cuyos partidos hayan finalizado.

#### Scenario: Jornada anterior pendiente se rellena

- **WHEN** el cron se ejecuta con una jornada anterior sin posiciones en KV y con todos sus partidos finalizados
- **THEN** el worker escribe las posiciones oficiales de esa jornada en la columna correspondiente de KV

#### Scenario: Jornada anterior con partidos en juego

- **WHEN** la jornada anterior aún tiene partidos sin finalizar
- **THEN** el worker no escribe posiciones para esa jornada
- **AND** la mantiene pendiente para ejecuciones posteriores

### Requirement: No sobrescribir jornadas ya completas

El backfill DEBE respetar las jornadas que ya tienen posiciones en KV y no volver a escribir sobre ellas.

#### Scenario: Columna de jornada completa

- **WHEN** la columna de una jornada ya tiene posiciones para los 14 managers
- **THEN** el worker conserva los valores existentes sin modificarlos
- **AND** no realiza peticiones adicionales para esa jornada

### Requirement: Posiciones oficiales de la ronda concreta

El backfill DEBE tomar las posiciones de la API de Biwenger para la ronda concreta que está rellenando, no la clasificación de la jornada en curso.

#### Scenario: Posiciones de ronda anterior

- **WHEN** una jornada anterior se rellena
- **THEN** las posiciones corresponden a la clasificación de esa ronda específica (`rounds/league/{roundId}`)
- **AND** los managers sin posición publicada no reciben valor en la columna

### Requirement: Motivo visible de jornada sin puntuar

Cuando una jornada no tiene posiciones en KV, el sistema DEBE exponer el motivo en el API y la web DEBE mostrarlo en lugar del mensaje genérico.

#### Scenario: Jornada con partido aplazado

- **WHEN** una jornada sin puntuar tiene un partido con estado `postponed`
- **THEN** el API devuelve el motivo con el nombre de los equipos implicados
- **AND** la web muestra ese motivo en la vista de la jornada

#### Scenario: Jornada con partidos sin terminar

- **WHEN** una jornada sin puntuar tiene partidos en juego o pendientes sin estado `postponed`
- **THEN** el API devuelve un motivo que indica cuántos partidos faltan por terminar

#### Scenario: Jornada sin motivo conocido

- **WHEN** una jornada sin puntuar no tiene un motivo registrado
- **THEN** la web muestra el mensaje genérico por defecto

#### Scenario: Jornada completada deja de mostrar motivo

- **WHEN** una jornada pasa a tener posiciones completas en KV
- **THEN** el motivo registrado para esa jornada desaparece del API
