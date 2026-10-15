# Análisis técnico del proyecto para elaborar informe académico

Actúa como un Ingeniero de Software especializado en Sistemas Operativos y documentación técnica universitaria.

## Contexto

He desarrollado un simulador interactivo del ciclo de vida de procesos de tres estados utilizando Vite + React.

La aplicación incluye una simulación visual, planificación de CPU y controles interactivos para representar las transiciones entre los estados:

- Listo (Ready).
- Ejecutando (Running).
- Bloqueado (Blocked).

El simulador dispone de funcionalidades automáticas y manuales relacionadas con la ejecución de procesos y las operaciones de entrada/salida.

Debo elaborar un informe académico para la asignatura de Sistemas Operativos de la carrera de Ingeniería de Software.

**Tu trabajo NO consiste en escribir el informe completo.**

Necesito que analices exhaustivamente el proyecto y extraigas únicamente la información técnica necesaria para que posteriormente pueda redactar el informe junto con ChatGPT.

## 1. Inspección del proyecto

Examina el código fuente real del repositorio.

Identifica:

- Tecnologías y dependencias principales.
- Estructura del proyecto y archivos fundamentales.
- Representación de los procesos y sus estados.
- Funcionamiento del planificador de CPU.
- Implementación del algoritmo Round Robin, si realmente está presente.
- Funcionamiento del quantum.
- Condiciones para cada transición entre estados.
- Comportamiento de las operaciones de E/S.
- Funcionamiento de los modos automático y manual.
- Atajos de teclado implementados.
- Generación aleatoria de procesos.
- Manejo de procesos finalizados.
- Métricas, historial de eventos y diagrama de Gantt, si existen.

No presupongas que todas las funcionalidades anteriores están implementadas. Confírmalo mediante el código.

No quiero una explicación detallada de cada componente React. Concéntrate en las funciones fundamentales del sistema operativo emulado.

## 2. Información requerida por el informe

La plantilla universitaria contiene las siguientes secciones:

1. Datos informativos.
2. Objetivos.
3. Introducción.
4. Marco teórico.
5. Materiales y recursos.
6. Procedimiento.
7. Resultados.
   - Diagrama de tres estados.
   - Código fuente.
   - Capturas de ejecución.
   - Análisis crítico.
8. Discusión de resultados.
9. Conclusiones.
10. Recomendaciones.
11. Bibliografía.
12. Anexos.

Necesito que identifiques qué información del proyecto resulta útil para completar cada sección.

No escribas párrafos extensos ni información académica genérica. Prioriza los hechos observables del programa.

### A. Arquitectura y funcionamiento

Describe brevemente:

- Cómo se representa un proceso.
- Qué propiedades determinan su comportamiento.
- Cómo funciona la cola Ready.
- Cómo se selecciona el proceso Running.
- Qué provoca que un proceso pase a Blocked.
- Cómo vuelve a Ready.
- Qué ocurre cuando se agota el quantum.
- Qué ocurre cuando finaliza un proceso.

Identifica las funciones core responsables de esas operaciones.

Proporciona la ruta de los archivos donde se encuentra la implementación.

### B. Procedimiento de desarrollo

Reconstruye las etapas técnicas que se puedan comprobar:

1. Preparación y tecnologías utilizadas.
2. Implementación del modelo de procesos.
3. Implementación del planificador y transiciones.
4. Implementación de la interfaz visual.
5. Implementación de la simulación automática.
6. Implementación de los controles manuales y E/S.
7. Validación de la simulación.

Distingue entre las etapas que pueden inferirse razonablemente de la estructura actual y aquellas cuyo orden histórico no puedes confirmar.

No inventes una cronología de desarrollo.

### C. Resultados y evidencias

Identifica qué funcionalidades podemos demostrar mediante capturas de pantalla.

Sugiere como máximo cuatro capturas importantes que permitan evidenciar:

- Procesos en estado Listo y Ejecutando.
- Solicitud de E/S y transición a Bloqueado.
- Finalización de E/S y regreso a Listo.
- Planificación de CPU, quantum y finalización de procesos.

Para cada captura indica:

- Qué estado debe tener la simulación.
- Qué acción debe realizar el usuario.
- Qué comportamiento técnico demuestra.

Si es posible, proporciona una secuencia reproducible de acciones.

### D. Diagrama del ciclo de tres estados

Extrae del código las transiciones que realmente implementa el simulador.

Entrega un diagrama sencillo en Mermaid que represente los estados Listo, Ejecutando y Bloqueado, así como las condiciones que permiten cambiar entre ellos.

Representa la finalización como salida del ciclo, sin confundirla con uno de los tres estados principales del modelo.

### E. Análisis crítico

El informe exige responder estas cinco preguntas:

1. ¿Por qué un proceso no puede pasar directamente de Bloqueado a Ejecutando?
2. ¿Qué pasaría si el planificador no respetara el quantum?
3. ¿Cómo se relaciona el estado Bloqueado con el uso de E/S?
4. ¿Qué diferencia hay entre expropiación y bloqueo voluntario?
5. En tu simulador, ¿qué proceso tuvo más cambios de contexto? ¿Por qué?

Para las primeras cuatro, identifica qué comportamiento implementado en el simulador permite fundamentar las respuestas.

Para la quinta:

- Verifica si el proyecto registra cambios de contexto por PID.
- Distingue entre cambios de contexto, despachos de CPU y cambios de estado.
- Si existen datos reales, indica qué proceso acumuló más cambios o participaciones en ellos y explica el criterio de medición.
- Si no existen datos suficientes, indícalo explícitamente.
- Explica cuál sería la manera más sencilla de obtener evidencia válida mediante una ejecución reproducible del simulador.

No inventes PIDs, métricas ni resultados experimentales.

### F. Materiales y recursos

Identifica solamente los recursos que puedas confirmar:

- Lenguajes de programación.
- Frameworks.
- Librerías relevantes.
- Herramientas de desarrollo.
- Software utilizado para ejecutar la aplicación.

No inventes equipos físicos, sistemas operativos de desarrollo ni herramientas que no puedas verificar.

### G. Discusión y conclusiones

Identifica entre tres y cinco hallazgos técnicos que puedan utilizarse posteriormente para elaborar la discusión y las conclusiones.

Prioriza aspectos como:

- Comportamiento del planificador.
- Efecto del quantum.
- Liberación de CPU al bloquear un proceso.
- Reincorporación de los procesos después de E/S.
- Diferencias entre simulación automática y manual.

No redactes todavía las conclusiones finales.

## 3. Restricciones

- NO modifiques el código fuente.
- NO crees un documento Word ni PDF.
- NO generes archivos adicionales.
- NO escribas el informe completo.
- NO inventes resultados experimentales.
- NO incluyas largas explicaciones de React, CSS o Vite.
- NO supongas que una funcionalidad existe porque aparezca mencionada en este prompt.
- NO incluyas código completo salvo fragmentos estrictamente indispensables.
- Si ejecutas pruebas disponibles, distingue sus resultados de la simple inspección del código.

**Importante:** la plantilla original establece en su objetivo general una implementación usando Python, pero este proyecto está desarrollado con React. Identifica claramente el lenguaje real y señala esta discrepancia sin intentar ocultarla.

## 4. Formato de respuesta obligatorio

Entrega un informe de análisis técnico con exactamente estas secciones:

### 1. Resumen técnico del proyecto

Máximo 150 palabras.

### 2. Funciones core y arquitectura

Tabla con función, propósito, archivo y comportamiento relevante.

### 3. Modelo de estados y planificación

Explicación técnica concreta de las transiciones, quantum y E/S.

### 4. Procedimiento verificable

Entre cinco y siete pasos cortos, indicando qué se puede confirmar.

### 5. Resultados demostrables

Funcionalidades verificadas, evidencias disponibles y capturas recomendadas.

### 6. Diagrama de estados

Código Mermaid breve y fiel al comportamiento real.

### 7. Información para el análisis crítico

Las cinco preguntas con evidencias técnicas del programa; no respuestas académicas extensas.

### 8. Recursos utilizados

Lista concreta de tecnologías y herramientas confirmadas.

### 9. Hallazgos para discusión y conclusiones

Entre tres y cinco hallazgos sustentados en el proyecto.

### 10. Información pendiente

Señala exclusivamente los datos que deban obtenerse manualmente, las pruebas que falten y las discrepancias con la plantilla.

## 5. Criterio de calidad

La respuesta debe ser suficientemente técnica para sustentar un informe universitario, pero lo bastante breve como para utilizarla como contexto en otra conversación.

**Prioridad absoluta: precisión, trazabilidad al código fuente y concisión.**

No necesito una auditoría de software ni propuestas de refactorización. Necesito comprender y documentar exactamente qué desarrollé, cómo funciona y qué resultados puedo demostrar.

Empieza inspeccionando el repositorio y entrega únicamente el análisis solicitado.
