# Test de Fatiga

App web para celular (PWA, funciona sin internet) que evalúa la fatiga de un trabajador antes del turno en 3 a 5 minutos y da un semáforo **Verde / Ámbar / Rojo** con los motivos y las recomendaciones.

Combina seis dimensiones:

| Dimensión | Cómo se mide | Puede llegar a |
|---|---|---|
| Sueño previo | Modelo previo de sueño-vigilia de Dawson (horas en 24 h y 48 h, vigilia al final del turno) | Rojo |
| Somnolencia declarada | Escala de Karolinska (KSS 1–9) | Rojo |
| Tiempo de reacción | PVT-B **adaptativo** (30 s a 3 min, ~1 min 15 s si está descansado) comparado con la **referencia personal** de cada trabajador | Rojo |
| Signos en el rostro | Cámara frontal **mientras responde el cuestionario**: PERCLOS, parpadeos, cierres largos, bostezos, cabeceos | Rojo |
| Somnolencia prevista | Modelo de tres procesos de la alerta (KSS estimado hasta el final del turno) | Ámbar |
| Declaraciones | Alcohol, medicamentos que dan sueño, "¿te sientes en condiciones?" | Rojo |

**Regla del semáforo:** ROJO si alguna dimensión está en rojo o si dos o más de las medidas (sueño, KSS, PVT, rostro) están en ámbar; ÁMBAR si alguna está en ámbar; VERDE en otro caso. Una dimensión no evaluada (sin cámara, calidad insuficiente) no penaliza.

> Es una herramienta de tamizaje, no un diagnóstico médico. **No existe un punto de corte validado universalmente para declarar aptitud por fatiga.** Los umbrales vienen con valores de referencia y se ajustan en *Modo supervisor → Ajustes*, idealmente con el médico ocupacional.

## Flujo en el celular

1. **Datos y turno** (nombre, DNI, empresa, horas del turno, si conducirá u operará equipos).
2. **Cámara (opcional):** 6 s de calibración personal mirando la pantalla.
3. **Cuestionario** de 8 preguntas, una por pantalla. La cámara sigue midiendo en una burbuja; si al final hay menos de 25 s de rostro visible, pide mirar la pantalla unos segundos más.
4. **PVT-B adaptativo:** la cámara se apaga para que el celular dedique todo a medir tiempos. Termina solo cuando el resultado ya es claro. Incluye práctica de 5 estímulos la primera vez.
5. **Resultado:** semáforo, motivos, qué hacer, curva de somnolencia prevista para el turno, detalle del PVT y del rostro. Botón *Enviar al supervisor* (WhatsApp / compartir).

El supervisor entra con PIN (inicial **1234**, cámbialo): ve el historial del celular con filtros por color, la **referencia personal de cada trabajador** (y puede reiniciarla), exporta CSV, envía a Google Sheets y ajusta umbrales.

## Matemática

### PVT-B (Basner, Mollicone y Dinges, 2011)

- Intervalo entre estímulos uniforme de 1 a 4 s (incluye 1 s de retroalimentación).
- Inicio del estímulo con `performance.now()` al pintarlo (`requestAnimationFrame`); respuesta con el `timeStamp` del evento `pointerdown` (misma base de tiempo).
- **Corrección de latencia táctil:** RT = RT medido − latencia del equipo (70 ms por defecto; NASA midió ~77 ms en pantallas táctiles).
- Falso inicio: toque sin estímulo o RT < 100 ms. Lapso: RT ≥ 355 ms. Omisión: 30 s sin respuesta (cuenta como lapso).
- Métricas: mediana y media de RT, **velocidad media = media(1/RT)**, **10 % más lento = media del 10 % menor de 1/RT**, lapsos, falsos inicios y **puntaje = 1 − (lapsos + falsos) / (estímulos válidos + falsos)**.
- Desempeño por fallas (lapsos + falsos inicios) en 3 min: ≤ 6 **alto**, 7–16 **medio**, > 16 **bajo** (Basner 2022). En una prueba más corta los cortes se escalan a su duración.

### Duración adaptativa (PVT-BA, Basner 2022)

Acortar la prueba a una duración fija pierde sensibilidad (la de 3 min ya se correlaciona poco con la de 10 min, Antler 2022). La alternativa validada es que **la prueba termine sola cuando el resultado ya es claro**:

- Después de cada respuesta, el teorema de Bayes actualiza la probabilidad de que el resultado de la prueba completa sea alto, medio o bajo. Partiendo de 1/3 cada uno: `odds = odds · LR`, con LR según haya o no falla y según el tramo de 30 s.
- La prueba termina cuando una categoría supera **99,619 %** (y han pasado al menos 30 s), o con más de 16 fallas. Si no, sigue hasta 3 min.
- Razones de verosimilitud usadas (dentro de los rangos publicados; el artículo las da solo en un gráfico): primeros 30 s, falla → alto ×0,25 y bajo ×3; sin falla → alto ×1,22 y bajo ×0,78. Desde 30 s, falla → alto ×0,18 y bajo ×4,5; sin falla → alto ×1,35 y bajo ×0,62.
- Basner reportó un promedio de 1 min 44 s, con ~92 % de sensibilidad y ~96 % de especificidad frente a la prueba completa. En nuestra simulación de 600 pruebas, la versión adaptativa coincidió con la prueba de 3 min en **96,2 %** de los casos, sin confundir nunca alto con bajo. Duraron **73 s en promedio** si la persona estaba descansada y 112 s en la mezcla de todos los niveles.
- En *Ajustes* se puede volver a una duración fija.

### Referencia personal (línea base)

Cada persona tiene su propio tiempo de reacción (edad, mano, costumbre, celular). Como hacen las herramientas industriales de aptitud (Aware4Duty, ARRB Fatigue Monitor), la app compara a cada trabajador **consigo mismo**:

- **Se forma sola** con las primeras **3 evaluaciones en buenas condiciones** de ese DNI: KSS ≤ 5, cumple las reglas de sueño de Dawson, sin alcohol ni medicamentos que den sueño, se siente en condiciones, PVT completo (≥ 15 estímulos) y sin desempeño bajo. Usa la **mediana de las últimas 10** que califican. Mientras se forma, la app avisa "1 de 3" y usa los cortes generales.
- Las evaluaciones que salen fuera de su rango no entran en la referencia, para que un mal día no la vaya arrastrando.
- **Velocidad personal:** caída = 1 − velocidad de hoy / velocidad habitual. Ámbar desde la mayor de 10 % o 2 veces su variación habitual entre sesiones. Rojo desde la mayor de 20 % o 3 veces esa variación.
- **Umbral de lapso personal:** 355 ms equivale a ~1,45 veces la mediana de una persona descansada típica. Se aplica la misma proporción a la mediana propia, nunca menos de 355 ms. Así, una persona naturalmente lenta (por ejemplo, 330 ms) no acumula "lapsos" por responder a su ritmo normal. El desempeño bajo con su propio umbral sigue siendo rojo siempre.
- Si con la referencia ya formada la prueba indica desempeño alto, pero la velocidad está fuera del rango personal, la prueba **no se corta antes**: sigue midiendo hasta 3 min para confirmar.
- La referencia vive en el celular donde se hizo la prueba (la latencia táctil cambia entre equipos). El supervisor puede **reiniciarla** si el trabajador cambió de celular o de mano, o volvió de un descanso médico.

### Modelo de tres procesos (parámetros del paquete FIPS, Ingre et al. 2014)

```
Despierto:  S(t) = la + (S_despertar − la) · e^(d·t)            la = 2.4, d = −0.0353
Durmiendo:  S(t) = S_dormir + t · g·(bl − ha)   hasta llegar a bl = 12.2
            S(t) = ha − (ha − bl) · e^(g·(t − t_quiebre))      ha = 14.3, g = ln(0.3/6.34)/8 ≈ −0.381
C(h) = 2.5 · cos(2π/24 · (h − 16.8))         ritmo circadiano (pico 16:48)
U(h) = −0.5 + 0.5 · cos(2π/12 · (h − 19.8))  componente de 12 h
W(t) = −5.72 · e^(−1.51·t)                   inercia del sueño al despertar
KSS = 10.6 − 0.6 · (S + C + U + W)
```

Se simula con el último sueño (horas exactas), el anterior (duración informada) y tres días previos de sueño habitual (7,5 h) para estabilizar S. Ámbar si el KSS previsto llega a 7 durante el turno; la app indica la hora de menor alerta para programar una pausa.

### Sueño previo (Dawson y McCulloch, 2005)

Contado hacia atrás desde el inicio del turno: ≥ 5 h de sueño en 24 h, ≥ 12 h en 48 h, y las horas despierto al terminar el turno no deben superar las horas dormidas en 48 h. Las siestas suman. Una regla incumplida = ámbar; dos o más = rojo.

### Rostro (MediaPipe Face Landmarker, 478 puntos + blendshapes + matriz de pose)

- **EAR** (Soukupová y Čech): `(|p2−p6| + |p3−p5|) / (2·|p1−p4|)` en píxeles reales, promedio de ambos ojos.
- **Cierre ocular 0–1** = promedio de `(1 − EAR/EAR_abierto) / 0.65` y del blendshape `eyeBlink` normalizado entre el valor abierto personal y el cerrado (abierto + 0,4; mínimo 0,45).
- **PERCLOS P80**: fracción del **tiempo** (no de cuadros) con cierre ≥ 0,8; los cruces se interpolan entre cuadros.
- **Parpadeo**: sube al cruzar 0,5 y termina bajo 0,3 (histéresis); la duración se mide al 50 % de cierre. < 0,5 s parpadeo; 0,5–1 s cierre largo; ≥ 1 s cierre tipo microsueño.
- **Bostezo**: `jawOpen` ≥ 0,5 sostenido 1–10 s (el habla no llega a 1 s). Los cierres de ojos durante el bostezo no se cuentan aparte.
- **Cabeceo**: desvío de pitch > 15° respecto a la mediana móvil de 10 s y retorno (< 6°) en 0,15–2,5 s. Un cambio de postura sostenido no cuenta.
- **Calidad**: se excluyen cuadros mirando a un costado (yaw > 30°). Con menos de 20 s útiles, menos del 50 % del tiempo con rostro o < 5 cuadros/s, el resultado facial es *no concluyente* y no penaliza. Avisa poca luz, rostro lejos y FPS bajos.
- Semáforo: rojo con PERCLOS ≥ 30 %, 2 o más cierres ≥ 1 s o un cabeceo con ojos cerrados; ámbar con PERCLOS ≥ 15 %, un cierre ≥ 1 s, 2 cierres largos, 2 bostezos, 2 cabeceos, o frente a la línea base personal: parpadeos 40 % más largos, PERCLOS +10 puntos o párpados 15 % más caídos.

### Mejoras frente a los repositorios de referencia

[driving-monitor-python](https://github.com/danielsousaoliveira/driving-monitor-python) usa umbrales fijos (EAR 0,28, MAR, 6° de cabeza) y [driver-fatigue-detection](https://github.com/javronich1/driver-fatigue-detection) una heurística de blendshapes por percentiles. Esta app:

1. Corre **en el navegador del celular**, sin Python ni servidor, y offline.
2. Se **calibra con cada persona** en la postura real de uso (mirar el celular cierra un poco los párpados) y además compara contra su **historial personal**.
3. **Fusiona** geometría (EAR) y el blendshape del modelo, en lugar de depender de uno solo.
4. Mide PERCLOS y duraciones con el **tiempo real entre cuadros**, así no depende de los FPS del equipo.
5. Distingue parpadeo, cierre largo y microsueño; bostezo frente a habla; cabeceo frente a cambio de postura.
6. **Controla la calidad** y declara "no concluyente" en vez de dar falsas alarmas.
7. Integra el rostro con sueño, KSS, PVT y modelos matemáticos en una sola decisión explicada.
8. **Privacidad:** el video nunca se graba ni sale del celular; solo se guardan números. La app además bloquea la telemetría de uso que MediaPipe envía a Google por defecto.

## Instalación y uso

```bash
npm install
npm run dev          # http://localhost:3000 (en la PC; la cámara funciona en localhost)
npm run dev:https    # https://IP-de-tu-PC:3443 para probar en el celular de la misma red
npm run build        # genera dist/ (PWA lista para publicar)
```

`npm run preparar` (se ejecuta solo con dev y build) copia el motor de visión de MediaPipe a `public/mediapipe/` y descarga el modelo facial (3,8 MB) a `public/models/`, para no depender de un CDN.

**Publicar:** sube `dist/` a cualquier hosting con HTTPS (Vercel, Netlify, GitHub Pages, Firebase Hosting). En el celular, ábrela en Chrome o Safari y usa *Agregar a pantalla de inicio*. La primera vez que se activa la cámara descarga ~15 MB; después funciona sin internet.

**Google Sheets:** en tu hoja, *Extensiones → Apps Script*, pega [apps-script/Code.gs](apps-script/Code.gs), *Implementar → Aplicación web* (Ejecutar como: Yo; Acceso: Cualquier usuario) y copia la URL `/exec` en *Modo supervisor → Ajustes*. Cada evaluación llega como una fila de 45 columnas en la hoja *Evaluaciones*, con el resultado coloreado y sin duplicados. Sin internet quedan en cola y se envían al volver la conexión.

**Modo diagnóstico:** agrega `?diagnostico` a la URL para ver en vivo EAR, eyeBlink, cierre, jawOpen, pitch, yaw, luz y conteos. Sirve para ajustar umbrales con celulares reales.

## Pruebas

```bash
npm test     # 30 pruebas: PVT-B, PVT adaptativo (simulación de 600 pruebas), referencia personal, modelo de tres procesos, Dawson, semáforo y analizador facial
npm run lint # verificación de tipos
```

Además se probó de punta a punta en Chrome con emulación de celular y una cámara simulada (rostro real de muestra de MediaPipe con parpadeos de 150 ms y cierres de 0,7 a 1,4 s): duración media de parpadeo medida 153 ms, cierre largo y cierre ≥ 1 s detectados, PERCLOS 10 %, PVT, semáforo y envío a Sheets correctos, sin errores. Falta validarla con trabajadores reales en distintos celulares y condiciones de luz: se recomienda un piloto de 2 a 4 semanas para fijar la latencia táctil de los equipos y los umbrales.

## Estructura

| Archivo | Qué hace |
|---|---|
| [src/config.ts](src/config.ts) | Parámetros del PVT, umbrales por defecto, textos de KSS y del semáforo |
| [src/lib/pvt.ts](src/lib/pvt.ts) | Métricas del PVT-B y regla de parada adaptativa (PVT-BA) |
| [src/lib/referencia.ts](src/lib/referencia.ts) | Referencia personal: sesiones que califican, mediana, variación y lapso personal |
| [src/lib/tpm.ts](src/lib/tpm.ts) | Modelo de tres procesos (FIPS) |
| [src/lib/sueno.ts](src/lib/sueno.ts) | Historial de sueño y reglas de Dawson |
| [src/lib/face/features.ts](src/lib/face/features.ts) | EAR, pose y lectura de blendshapes por cuadro |
| [src/lib/face/analyzer.ts](src/lib/face/analyzer.ts) | Calibración, PERCLOS, parpadeos, bostezos, cabeceos, calidad |
| [src/lib/face/monitor.ts](src/lib/face/monitor.ts) | Cámara + MediaPipe en el navegador |
| [src/lib/decision.ts](src/lib/decision.ts) | Semáforo, línea base personal y recomendaciones |
| [src/components/PruebaPvt.tsx](src/components/PruebaPvt.tsx) | Motor de la prueba de reacción |
| [apps-script/Code.gs](apps-script/Code.gs) | Receptor para Google Sheets |

## Fuentes

- Basner M, Mollicone D, Dinges DF. [Validity and sensitivity of a brief psychomotor vigilance test (PVT-B) to total and partial sleep deprivation](https://pmc.ncbi.nlm.nih.gov/articles/PMC3197786/). Acta Astronautica, 2011.
- Basner M. [An adaptive-duration version of the PVT-B (PVT-BA)](https://academic.oup.com/sleepadvances/article/3/1/zpac038/6764767). Sleep Advances, 2022.
- Basner M, Dinges DF. [An adaptive-duration version of the PVT accurately tracks changes in psychomotor vigilance induced by sleep restriction](https://pmc.ncbi.nlm.nih.gov/articles/PMC3250358/). Sleep, 2012.
- Antler CA et al. [The 3-minute PVT demonstrates inadequate convergent validity relative to the 10-minute PVT](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8885985/), 2022.
- Arsintescu L. et al. [Validation of a touchscreen psychomotor vigilance task](https://ntrs.nasa.gov/api/citations/20170009855/downloads/20170009855.pdf). NASA, 2017 (latencia táctil).
- Wilson MD, Strickland L, Ballard T. [FIPS: Fatigue Impairment Prediction Suite](https://github.com/humanfactors/FIPS) (implementación del modelo de tres procesos).
- Dawson D, McCulloch K. *Managing fatigue: It's about sleep*. Sleep Medicine Reviews, 2005 (modelo previo de sueño-vigilia).
- Åkerstedt T, Gillberg M. *Subjective and objective sleepiness in the active individual*, 1990 (KSS).
- Dinges DF, Grace R. [PERCLOS: A valid psychophysiological measure of alertness](https://rosap.ntl.bts.gov/view/dot/14304). FHWA, 1998.
- Soukupová T, Čech J. *Real-time eye blink detection using facial landmarks*, 2016 (EAR).
- [MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker).
