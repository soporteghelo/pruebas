// Paso 4: PVT-B (Psychomotor Vigilance Test, versión breve de 3 min) con duración adaptativa:
// termina sola cuando el resultado ya es claro (PVT-BA, Basner 2022; en promedio ~1 min 45 s).
// Si ya existe la referencia personal y la velocidad está fuera de ese rango, la prueba sigue hasta
// el máximo para confirmar. La cámara está apagada durante la prueba para medir tiempos con precisión.
// Medición: el inicio del estímulo se toma con performance.now() al pintarlo (requestAnimationFrame)
// y la respuesta con el timeStamp del evento pointerdown (misma base de tiempo, resolución sub-ms).
import { Timer, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PVT } from "@/config";
import { duracionTexto } from "@/lib/decision";
import { calcularPvt, evaluarAdaptativo, nuevoIsi, PVT_BA } from "@/lib/pvt";
import type { EventoPvt } from "@/lib/types";
import { Boton, Encabezado, Tarjeta } from "./ui";

interface Elementos {
  area: HTMLElement;
  caja: HTMLElement;
  texto: HTMLElement;
  barra: HTMLElement;
}

const CLASE_CAJA = {
  espera: "border-slate-700",
  estimulo: "border-amber-500",
  feedback: "border-slate-700",
};

/** Motor de la prueba, fuera de React para no introducir retrasos de renderizado. */
class MotorPvt {
  eventos: EventoPvt[] = [];
  private estado: "espera" | "estimulo" | "feedback" | "fin" = "espera";
  private inicio = 0;
  private onset = 0;
  private estimulos = 0;
  private timer = 0;
  private raf = 0;
  private rafBarra = 0;
  private parar = false;

  constructor(
    private el: Elementos,
    private limite: { segundos?: number; estimulos?: number },
    private op: { latenciaMs: number; lapsoMs: number; adaptativo: boolean; referencia: Referencia | null },
    private alTerminar: (duracionS: number) => void,
  ) {}

  /** Regla de parada adaptativa, revisada después de cada respuesta. */
  private revisarParada() {
    if (!this.op.adaptativo || !this.limite.segundos) return;
    const transcurrido = performance.now() - this.inicio;
    // Con referencia personal, la parada usa su umbral de lapso propio.
    const lapso = this.op.referencia?.lapso ?? this.op.lapsoMs;
    const est = evaluarAdaptativo(this.eventos, this.op.latenciaMs, lapso);
    if (!est.decision || transcurrido < PVT_BA.minimoMs) return;
    const ref = this.op.referencia;
    if (est.decision === "alta" && ref) {
      // Sin lapsos, pero más lento que su normal: se sigue midiendo para confirmar.
      const v = calcularPvt(this.eventos, { latenciaMs: this.op.latenciaMs, lapsoMs: this.op.lapsoMs, duracionS: transcurrido / 1000 }).velocidad;
      if (v < ref.velocidad * (1 - ref.caida)) return;
    }
    this.parar = true;
  }

  arrancar() {
    this.inicio = performance.now();
    this.el.area.addEventListener("pointerdown", this.toque, { passive: false });
    this.esperar(nuevoIsi() + PVT.feedbackMs);
    const barra = () => {
      if (this.estado === "fin") return;
      const p = this.limite.segundos ? (performance.now() - this.inicio) / (this.limite.segundos * 1000) : this.estimulos / (this.limite.estimulos || 1);
      this.el.barra.style.width = `${Math.min(100, p * 100)}%`;
      this.rafBarra = requestAnimationFrame(barra);
    };
    barra();
  }

  private terminado() {
    if (this.parar) return true;
    if (this.limite.segundos) return performance.now() - this.inicio >= this.limite.segundos * 1000;
    return this.estimulos >= (this.limite.estimulos || 0);
  }

  private pintar(estado: keyof typeof CLASE_CAJA, texto: string, color = "text-amber-400") {
    this.el.caja.className = `flex h-40 w-[80vw] max-w-sm items-center justify-center rounded-2xl border-4 ${CLASE_CAJA[estado]}`;
    this.el.texto.className = `cifras font-bold ${texto.length > 6 ? "text-2xl text-center px-3" : "text-7xl"} ${color}`;
    this.el.texto.textContent = texto;
  }

  /** Espera hasta el próximo estímulo. El intervalo (1-4 s) incluye 1 s de retroalimentación. */
  private esperar(isi: number) {
    this.estado = "espera";
    this.pintar("espera", "");
    if (this.terminado()) return this.finalizar();
    this.timer = window.setTimeout(() => {
      this.raf = requestAnimationFrame(() => this.mostrar());
    }, Math.max(0, isi - PVT.feedbackMs));
  }

  private mostrar() {
    if (this.estado !== "espera") return;
    this.estado = "estimulo";
    this.pintar("estimulo", "0");
    this.onset = performance.now();
    const contar = () => {
      if (this.estado !== "estimulo") return;
      const ms = performance.now() - this.onset;
      if (ms >= PVT.timeoutMs) {
        this.estimulos++;
        this.eventos.push({ tipo: "timeout", t: this.onset - this.inicio });
        this.revisarParada();
        navigator.vibrate?.(300);
        return this.retro("¡Toca apenas veas el contador!", "text-red-400");
      }
      this.el.texto.textContent = String(Math.floor(ms));
      this.raf = requestAnimationFrame(contar);
    };
    this.raf = requestAnimationFrame(contar);
  }

  private toque = (e: PointerEvent) => {
    e.preventDefault();
    const p = performance.now();
    // timeStamp es de alta resolución en navegadores modernos; si no lo parece, se usa el reloj actual.
    const t = e.timeStamp > 0 && e.timeStamp <= p + 5 && p - e.timeStamp < 1000 ? e.timeStamp : p;
    if (this.estado === "estimulo") {
      cancelAnimationFrame(this.raf);
      const rt = Math.max(0, t - this.onset);
      this.estimulos++;
      this.eventos.push({ tipo: "respuesta", rt, t: this.onset - this.inicio });
      this.revisarParada();
      // Se muestra ya descontada la latencia táctil, igual que en el resultado.
      this.retro(`${Math.max(0, Math.round(rt - this.op.latenciaMs))}`, "text-slate-100");
    } else if (this.estado === "espera") {
      clearTimeout(this.timer);
      cancelAnimationFrame(this.raf);
      this.eventos.push({ tipo: "anticipacion", t: t - this.inicio });
      this.revisarParada();
      this.retro("¡Muy pronto! Espera el contador", "text-red-400");
    }
  };

  private retro(texto: string, color: string) {
    this.estado = "feedback";
    this.pintar("feedback", texto, color);
    this.timer = window.setTimeout(() => this.esperar(nuevoIsi()), PVT.feedbackMs);
  }

  private finalizar() {
    const duracionS = (performance.now() - this.inicio) / 1000;
    this.detener();
    this.alTerminar(duracionS);
  }

  detener() {
    this.estado = "fin";
    clearTimeout(this.timer);
    cancelAnimationFrame(this.raf);
    cancelAnimationFrame(this.rafBarra);
    this.el.area.removeEventListener("pointerdown", this.toque);
  }
}

type Fase = "intro" | "practica" | "prueba" | "interrumpida";

/** Referencia personal para la regla de extensión: velocidad habitual y caída que dispara el aviso. */
export interface Referencia {
  velocidad: number;
  lapso: number;
  caida: number;
  medianaRt: number;
  sesiones: number;
}

export default function PruebaPvt({ duracionS, adaptativo, latenciaMs, lapsoMs, referencia, sesionesRef, primeraVez, onFin, onOmitir }: {
  duracionS: number;
  adaptativo: boolean;
  latenciaMs: number;
  lapsoMs: number;
  referencia: Referencia | null;
  sesionesRef: number;
  primeraVez: boolean;
  onFin: (eventos: EventoPvt[], duracionS: number) => void;
  onOmitir: () => void;
}) {
  const [fase, setFase] = useState<Fase>("intro");
  const [practica, setPractica] = useState<number | null>(null);
  const area = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const texto = useRef<HTMLSpanElement>(null);
  const barra = useRef<HTMLDivElement>(null);
  const motor = useRef<MotorPvt | null>(null);

  useEffect(() => {
    if (fase !== "practica" && fase !== "prueba") return;
    let bloqueo: { release: () => Promise<void> } | null = null;
    (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock
      ?.request("screen").then((l) => (bloqueo = l)).catch(() => {});
    const m = new MotorPvt(
      { area: area.current!, caja: caja.current!, texto: texto.current!, barra: barra.current! },
      fase === "prueba" ? { segundos: duracionS } : { estimulos: 5 },
      { latenciaMs, lapsoMs, adaptativo, referencia },
      (real) => {
        if (fase === "prueba") onFin(m.eventos, real);
        else {
          const rts = m.eventos.filter((e): e is Extract<EventoPvt, { tipo: "respuesta" }> => e.tipo === "respuesta").map((e) => Math.max(0, e.rt - latenciaMs));
          setPractica(rts.length ? rts.reduce((a, b) => a + b, 0) / rts.length : 0);
          setFase("intro");
        }
      },
    );
    motor.current = m;
    // Si la persona sale de la app (llamada, notificación), la prueba ya no es válida.
    const visibilidad = () => {
      if (document.hidden) {
        m.detener();
        setFase(fase === "prueba" ? "interrumpida" : "intro");
      }
    };
    document.addEventListener("visibilitychange", visibilidad);
    m.arrancar();
    return () => {
      m.detener();
      document.removeEventListener("visibilitychange", visibilidad);
      bloqueo?.release().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase]);

  if (fase === "practica" || fase === "prueba") {
    return (
      <div ref={area} className="pvt fixed inset-0 z-50 flex flex-col bg-[#05070d] text-white" onContextMenu={(e) => e.preventDefault()}>
        <div className="h-1.5 w-full bg-slate-800"><div ref={barra} className="h-full bg-marca-500" style={{ width: 0 }} /></div>
        <p className="pt-4 text-center text-sm text-slate-400">{fase === "practica" ? "Práctica · 5 estímulos" : "Prueba de reacción"}</p>
        <div className="flex flex-1 items-center justify-center">
          <div ref={caja} className="flex h-40 w-[80vw] max-w-sm items-center justify-center rounded-2xl border-4 border-slate-700">
            <span ref={texto} className="cifras text-7xl font-bold text-amber-400" />
          </div>
        </div>
        <p className="pb-10 text-center text-sm text-slate-500">Toca en cualquier parte apenas aparezca el contador</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Encabezado titulo="Prueba de reacción" subtitulo="Paso 4 de 4 · PVT-B" />
      {fase === "interrumpida" && (
        <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">La prueba se interrumpió porque saliste de la app. Hay que repetirla completa.</div>
      )}
      <Tarjeta className="space-y-3">
        <div className="flex items-center justify-center py-2">
          <div className="flex h-24 w-48 items-center justify-center rounded-2xl border-4 border-amber-500 bg-[#05070d]">
            <span className="cifras text-5xl font-bold text-amber-400">243</span>
          </div>
        </div>
        <ol className="list-decimal space-y-1.5 pl-5 text-[15px] text-slate-800">
          <li>Aparecerá un <b>contador amarillo</b> en el recuadro, en momentos al azar.</li>
          <li><b>Toca la pantalla lo más rápido que puedas</b> apenas lo veas.</li>
          <li><b>No toques antes</b>: cuenta como error.</li>
          <li>Usa siempre la misma mano y no salgas de la app.</li>
        </ol>
        <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
          {adaptativo
            ? <>Dura <b>entre 30 s y {duracionTexto(duracionS)}</b>: termina sola cuando el resultado ya es claro (en promedio menos de 2 min).</>
            : <>Dura <b>{duracionTexto(duracionS)}</b>.</>}
          <br />
          {referencia
            ? <>Se compara con <b>tu propia referencia</b> ({referencia.sesiones} evaluaciones, mediana {Math.round(referencia.medianaRt)} ms).</>
            : <>Estamos aprendiendo <b>tu tiempo de reacción normal</b>: {Math.min(sesionesRef, 3)} de 3 evaluaciones en buenas condiciones.</>}
        </p>
        {practica !== null && (
          <p className="rounded-xl bg-marca-50 p-3 text-center text-sm text-marca-900">Práctica terminada · promedio <b>{Math.round(practica)} ms</b>. ¡Ahora la prueba real!</p>
        )}
      </Tarjeta>
      {primeraVez && practica === null ? (
        <>
          <Boton onClick={() => setFase("practica")} icono={<Zap size={20} />}>Practicar (5 estímulos)</Boton>
          <Boton tipo="secundario" onClick={() => setFase("prueba")} icono={<Timer size={20} />}>Saltar práctica y comenzar</Boton>
        </>
      ) : (
        <>
          <Boton onClick={() => setFase("prueba")} icono={<Timer size={20} />}>Comenzar prueba</Boton>
          {practica === null && <Boton tipo="secundario" onClick={() => setFase("practica")} icono={<Zap size={20} />}>Practicar primero</Boton>}
        </>
      )}
      <Boton tipo="fantasma" onClick={onOmitir}>No puedo hacer la prueba ahora</Boton>
    </div>
  );
}
