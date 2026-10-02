# Apex Race Manager 2026

Juego de gestión de equipos de automovilismo, al estilo de *Motorsport Manager* y *APEX Race Manager*, con las parrillas y el calendario reales de la temporada 2026 de **Fórmula 1, Fórmula 2 y Fórmula 3**.

Eliges una categoría y un equipo y diriges sus fines de semana. Las otras dos categorías se simulan en paralelo con el mismo motor, así que al final de la temporada hay campeón en las tres.

## Cómo arrancarlo

```bash
npm install
npm run dev
```

Abre <http://localhost:3000>. Hay tres ranuras de partida de carrera (más la del fin de semana rápido) y se guardan automáticamente en el `localStorage` del navegador.

### Partidas guardadas y migraciones

Cada partida lleva un número de versión (`SAVE_VERSION` en `lib/game/season.ts`). Si cambias el formato de `GameState`, sube esa versión y añade el paso correspondiente en `lib/game/migrate.ts`: al abrir una partida antigua se aplican en orden las migraciones pendientes y se guarda antes una copia del original (`…-backup-v<versión>`). Las partidas de una versión más nueva o dañadas no se tocan: el menú las marca y solo se pueden borrar a mano.

## Qué incluye

**Datos de 2026**
- F1: 11 equipos (incluidos Audi y Cadillac), 22 pilotos y unidades de potencia de Mercedes, Ferrari, Red Bull Ford, Honda y Audi.
- F2: 11 equipos y 22 pilotos. F3: 10 equipos y 30 pilotos.
- Calendario de 23 GP tal y como quedó: Arabia Saudí cancelado, Baréin trasladado a Sepang y 6 fines de semana sprint. En F2, Miami y Canadá sustituyen a Baréin y Yeda.
- El rendimiento de coches y pilotos está calibrado con las clasificaciones reales de la temporada.

**Modos de juego**
- **Carrera**: una temporada completa con tu equipo; las otras dos categorías se simulan en paralelo.
- **Fin de semana rápido**: eliges categoría, circuito, equipo, formato (con o sin sprint en F1) y meteorología (realista, seco, lluvia o cambiante) y juegas un fin de semana suelto, sin tocar tu partida.

**Fin de semana**
- **Libres**: minijuego de reglajes (carga aerodinámica, suspensión y marchas) guiado por el feedback del piloto.
- **Clasificación**: Q1/Q2/Q3 con eliminaciones, *sprint shootout* con compuestos obligatorios y sesión única en F2/F3. Por tanda eliges neumático y nivel de riesgo.
- **Carreras**: Gran Premio y sprint en F1; sprint con parrilla invertida (top 10 en F2, top 12 en F3) y carrera principal en F2/F3.

**Carrera en directo**
- Vista cenital dibujada del trazado real de cada circuito (asfalto, pianos, grava, pit lane con garajes, gradas y árboles), con cámara que sigue a un piloto, vista general o cámara libre (arrastrar y rueda del ratón).
- Interfaz al estilo de los juegos de gestión: torre de tiempos, clima y previsión, centro de datos, minimapa, paneles de piloto con desgaste, combustible, ERS y daños, y control central de vuelta y velocidad (×1 a ×100).
- Decoraciones de los coches 2026 y cascos de cada piloto dibujados como ilustraciones propias (no se usan imágenes oficiales).
- Órdenes del muro por piloto: ritmo (de relajar a atacar), modo de motor (consumo de combustible), ERS (F1) y paradas con elección de compuesto. También puedes delegar el coche en el ingeniero IA.
- Neumáticos: desgaste con caída brusca de rendimiento, ventana de temperatura, pinchazos y regla de los dos compuestos.
- Meteorología dinámica: lluvia que empieza y para, humedad de la pista que sube y se seca, intermedios y lluvia extrema, pronóstico imperfecto y radar de 10 vueltas.
- Safety car, VSC, salida tras el coche de seguridad, averías según fiabilidad, errores de pilotaje, toques, penalizaciones, DRS en F2/F3 y modo adelantamiento en F1.
- La IA planifica sus estrategias (0 a 3 paradas), aprovecha los neutralizados y reacciona al clima.

**Gestión**
- Presupuesto, patrocinio, premios por puntos y premio final según la posición en el campeonato de equipos.
- Proyectos de desarrollo por área (aerodinámica, chasis, fiabilidad y unidad de potencia si eres equipo oficial) y mejoras de instalaciones. Los rivales también desarrollan.
- Clasificaciones con el resultado de cada ronda, calendario con ganadores, noticias y temporadas sucesivas, con pilotos que envejecen y coches que se reequilibran.

## Estructura

| Ruta | Contenido |
|---|---|
| `lib/game/data/` | Equipos, pilotos, unidades de potencia, circuitos, trazados, decoraciones y calendario 2026 |
| `lib/game/geo.ts` | Escenario de cada circuito (pianos, grava, boxes, gradas) a partir del trazado real |
| `components/art/` | Ilustraciones de monoplazas (perfil y cenital) y cascos |
| `components/race/` | Vista de pista y HUD de la carrera en directo |
| `lib/game/race.ts` | Simulador de carrera vuelta a vuelta |
| `lib/game/strategy.ts` | Planificador de estrategias de neumáticos |
| `lib/game/weather.ts`, `tyres.ts` | Modelos de clima y neumáticos |
| `lib/game/qualifying.ts`, `setup.ts` | Clasificación y reglajes |
| `lib/game/weekend.ts`, `season.ts`, `development.ts` | Fin de semana, temporada, puntos, finanzas y desarrollo |
| `lib/store.ts`, `lib/liveRace.ts` | Ranuras de partida (persistidas) y controlador de la carrera en directo |
| `lib/game/migrate.ts` | Migraciones de partidas guardadas entre versiones |
| `components/` | Interfaz (sede, fin de semana, carrera en directo, clasificaciones...) |

El motor (`lib/game`) no depende de React, así que se puede usar para simular temporadas completas sin interfaz.

Los trazados de los circuitos proceden de [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits) (licencia MIT, © Tomislav Bacinger).

> Proyecto no oficial con fines de entretenimiento. Los nombres de equipos, pilotos y circuitos pertenecen a sus propietarios.
