# Process State Simulator

Simulador local de planificación Round Robin con React, TypeScript y Vite. Incluye estados Lista, Corriendo y Bloqueado, E/S concurrente, métricas acumuladas, Gantt de los últimos 24 ticks e historial de transiciones.

## Iniciar

```sh
npm install
npm run dev
```

Abre la URL que indique Vite. No requiere backend ni servicios externos.

## Controles

- **Modo automático / Modo manual:** conserva procesos, colas, quantum consumido y métricas; pausa el reloj al cambiar. En automático pulsa Iniciar para reanudar.
- **Iniciar / Pausar:** activa o detiene el reloj lógico.
- **Siguiente tick:** avanza exactamente un intervalo y deja la simulación pausada.
- **Reiniciar:** crea entre 5 y 8 procesos nuevos y restablece métricas y controles.
- **+ Proceso:** añade un proceso aleatorio, hasta 15 activos.
- **Quantum:** entre 1 y 8 ticks; inicialmente 3. El cambio aplica en la próxima evaluación del proceso actual, sin reiniciar su consumo.
- **Velocidad:** 0.5x, 1x, 2x o 4x; a 1x cada tick dura un segundo.
- **Autogeneración:** cada 3 ticks tiene un 60 % de probabilidad de añadir un proceso. Al pausar no se generan llegadas; el paso manual también evalúa llegadas.

## Motor

`src/simulation.ts` contiene el modelo, el generador y el reducer. `resetSimulation()` crea una sesión; `createRandomProcess()` genera procesos con 4–18 ticks de CPU y posible E/S de 2–5 ticks; `scheduleNextProcess()` despacha desde la cola FIFO; `advanceSimulation()` avanza CPU y E/S un intervalo; `simulationReducer()` centraliza controles y reloj.

El motor copia los procesos antes de avanzar. Sus helpers internos modifican exclusivamente ese borrador. El generador usa una semilla almacenada, de modo que un mismo estado produce siempre el mismo resultado y las actualizaciones de React son reproducibles.

La finalización tiene prioridad sobre la solicitud de E/S, y esta sobre el agotamiento del quantum. Las operaciones de E/S nuevas comienzan a descontar en el siguiente tick. Un proceso liberado de E/S se añade al final de la cola. En modo automático, el despacho al terminar un tick no consume CPU hasta el siguiente intervalo: por eso la tarjeta Corriendo puede mostrar el próximo proceso mientras el último segmento del Gantt identifica al que acaba de ejecutar. Los intervalos sin ejecución se registran como IDLE.

La utilización de CPU es `ticks ocupados / ticks transcurridos`. El historial de eventos y el Gantt tienen tamaños limitados; los procesos finalizados se retiran del conjunto activo y se contabilizan.

`src/App.tsx` contiene los controles, el intervalo con limpieza y las visualizaciones. `src/App.css` y `src/index.css` definen la interfaz oscura, los diseños adaptativos y la preferencia de movimiento reducido.

## Verificar

Con Node.js 22.18 o posterior (soporte nativo de TypeScript):

```sh
npm test
npm run lint
npm run build
```

Las pruebas usan `node:test`, sin dependencias adicionales. Cubren finalización, FIFO y quantum, E/S e inactividad, prioridad de transiciones, pausa, paso manual, reinicio, inmutabilidad y sesiones aleatorias con comprobaciones de métricas y límites.

## Laboratorio manual

El selector **Modo manual** detiene el reloj y habilita los atajos:

| Tecla | Acción |
| --- | --- |
| Espacio | Despacha si la CPU está libre y consume exactamente un tick |
| I | Solicita E/S del proceso Corriendo y libera la CPU |
| 1–9 | Completa la E/S de la tarjeta con ese número visible |
| N | Crea un proceso, respetando el límite de 15 |
| R | Reinicia la sesión conservando el modo manual |

Cada acción tiene un botón equivalente. Todas las tarjetas bloqueadas tienen botón de completar, incluidas las que exceden nueve. Los números se reasignan según el orden actual de tarjetas bloqueadas. Los atajos ignoran repeticiones, combinaciones de sistema, composición de texto y campos editables. Espacio sobre un botón enfocado conserva su activación nativa.

`advanceSimulation()` comparte la lógica de CPU y Round Robin entre ambos modos. En manual no descuenta E/S, no genera llegadas ni provoca bloqueos programados. Al agotarse el quantum o finalizar, la CPU espera el siguiente paso para despachar. `requestProcessIO()` asigna un dispositivo aleatorio (teclado, disco, red o impresora) y bloquea sin consumir tiempo. `completeProcessIO()` devuelve el proceso al final de Lista sin despacharlo. Estas acciones no añaden ticks al Gantt ni consumen quantum.

`setSimulationMode()` cambia el modo sin reiniciar los procesos. Al regresar a automático, los bloqueos conservan su tiempo pendiente y vuelven a completarse por reloj. Las solicitudes automáticas programadas que se hayan sobrepasado en manual se evalúan en la siguiente ejecución automática. `handleKeyboardCommand()` traduce pulsaciones a las mismas acciones del reducer usadas por los botones; los listeners se limpian al salir del modo manual.

El registro muestra etiquetas de CPU, TICK, E/S, E/S COMPLETA, FIN e IDLE. Los mensajes contextuales y el resaltado de CPU responden a acciones reales. Las pruebas adicionales cubren la lección con tres procesos, E/S manual persistente, cambio de modo, asignación de números, finalización inválida y repetición de teclas.
