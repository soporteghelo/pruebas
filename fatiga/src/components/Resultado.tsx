// Resultado: semáforo, motivos por dimensión, predicción del turno y detalle de mediciones.
import { AlertTriangle, CheckCircle2, OctagonX, Share2 } from "lucide-react";
import { useState } from "react";
import { AJUSTES_INICIALES, NIVELES } from "@/config";
import { duracionTexto, horaTexto } from "@/lib/decision";
import { cortesPersonales } from "@/lib/referencia";
import { textoCompartir } from "@/lib/export";
import type { Evaluacion, LineaBase, PvtResultado, TpmResultado, Umbrales } from "@/lib/types";
import { Boton, COLOR_NIVEL, Punto, Tarjeta } from "./ui";

const ICONO = [CheckCircle2, AlertTriangle, OctagonX];
const FONDO = ["from-green-600 to-green-700", "from-amber-500 to-amber-600", "from-red-600 to-red-700"];

export default function Resultado({ ev, acciones, umbrales = AJUSTES_INICIALES.umbrales }: { ev: Evaluacion; acciones: React.ReactNode; umbrales?: Umbrales }) {
  const Icono = ICONO[ev.nivel];
  const [copiado, setCopiado] = useState(false);

  const compartir = async () => {
    const texto = textoCompartir(ev);
    try {
      if (navigator.share) {
        await navigator.share({ text: texto });
        return;
      }
    } catch {
      /* cancelado: se ofrece WhatsApp */
    }
    try {
      await navigator.clipboard?.writeText(texto);
      setCopiado(true);
    } catch {
      /* sin portapapeles */
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
  };

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl bg-gradient-to-br ${FONDO[ev.nivel]} p-5 text-white shadow-md`}>
        <div className="flex items-center gap-3">
          <Icono size={44} strokeWidth={2.2} />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider opacity-90">Resultado · {NIVELES[ev.nivel].corto}</p>
            <p className="text-2xl font-extrabold leading-tight">{NIVELES[ev.nivel].nombre}</p>
          </div>
        </div>
        <p className="mt-3 text-base font-medium">{NIVELES[ev.nivel].mensaje}</p>
        <p className="mt-3 text-sm opacity-90">
          {ev.trabajador.nombre} · DNI {ev.trabajador.dni}
          <br />
          {new Date(ev.fecha).toLocaleDateString("es-PE")} {horaTexto(ev.fecha)} · Turno {horaTexto(ev.turno.inicio)}–{horaTexto(ev.turno.fin)}
        </p>
      </div>

      <Tarjeta className="space-y-3">
        <p className="text-sm font-bold uppercase tracking-wide text-slate-500">Por qué</p>
        {ev.dimensiones.map((d) => (
          <div key={d.clave} className="flex gap-3">
            <div className="pt-1.5"><Punto nivel={d.nivel} /></div>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-slate-900">{d.titulo}: <span className="font-bold">{d.valor}</span></p>
              <p className="text-sm text-slate-600">{d.detalle}</p>
            </div>
          </div>
        ))}
      </Tarjeta>

      <Tarjeta>
        <p className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Qué hacer</p>
        <ul className="space-y-2">
          {ev.recomendaciones.map((r, i) => (
            <li key={i} className="flex gap-2 text-[15px] text-slate-800"><span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${COLOR_NIVEL[ev.nivel]}`} />{r}</li>
          ))}
        </ul>
      </Tarjeta>

      <Tarjeta>
        <p className="text-sm font-bold uppercase tracking-wide text-slate-500">Somnolencia prevista en el turno</p>
        <p className="mb-2 text-xs text-slate-500">Modelo de tres procesos (KSS 1 = muy alerta, 9 = muy somnoliento)</p>
        <GraficoKss m={ev.modelo} />
      </Tarjeta>

      {ev.pvt && <DetallePvt p={ev.pvt} lb={ev.lineaBase} umbrales={umbrales} />}

      {ev.rostro && (
        <Tarjeta>
          <p className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Rostro · calidad {ev.rostro.calidad}</p>
          <Metricas filas={[
            ["PERCLOS (P80)", `${(ev.rostro.perclos * 100).toFixed(1)} %`],
            ["Parpadeos por minuto", ev.rostro.parpadeosMin.toFixed(0)],
            ["Duración media del parpadeo", `${Math.round(ev.rostro.duracionParpadeoMs)} ms`],
            ["Cierres de 0,5 a 1 s", String(ev.rostro.cierresLargos)],
            ["Cierres de 1 s o más", String(ev.rostro.microsuenos)],
            ["Bostezos", String(ev.rostro.bostezos)],
            ["Cabeceos", `${ev.rostro.cabeceos}${ev.rostro.cabeceosOjosCerrados ? ` (${ev.rostro.cabeceosOjosCerrados} con ojos cerrados)` : ""}`],
            ["Tiempo medido", `${Math.round(ev.rostro.segundosValidos)} s de ${Math.round(ev.rostro.segundosTotales)} s · ${ev.rostro.fps.toFixed(0)} cuadros/s`],
          ]} />
        </Tarjeta>
      )}

      <Boton tipo="secundario" onClick={compartir} icono={<Share2 size={20} />}>{copiado ? "Copiado · abre WhatsApp" : "Enviar al supervisor"}</Boton>
      {acciones}
      <p className="px-2 pb-4 text-center text-xs text-slate-500">
        Herramienta de tamizaje, no es un diagnóstico médico. Los umbrales son referenciales y los ajusta la empresa. Ante cualquier duda, detente y consulta a tu supervisor.
      </p>
    </div>
  );
}

function Metricas({ filas }: { filas: [string, string][] }) {
  return (
    <dl className="divide-y divide-slate-100">
      {filas.map(([a, b]) => (
        <div key={a} className="flex justify-between gap-3 py-1.5 text-sm"><dt className="text-slate-600">{a}</dt><dd className="cifras text-right font-semibold text-slate-900">{b}</dd></div>
      ))}
    </dl>
  );
}

const DESEMPENO = { alta: "Alto", media: "Medio", baja: "Bajo" } as const;

/** Barra: cambio de velocidad de hoy frente a la referencia personal, con las zonas de aviso. */
function BarraReferencia({ p, lb, umbrales }: { p: PvtResultado; lb: LineaBase; umbrales: Umbrales }) {
  const cortes = cortesPersonales(lb, umbrales);
  const cambio = p.velocidad / lb.velocidad - 1; // negativo = más lento
  const min = -Math.max(0.4, cortes.rojo + 0.1);
  const max = 0.2;
  const x = (v: number) => ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * 100;
  return (
    <div className="mb-3 rounded-xl bg-slate-50 p-3">
      <p className="text-sm font-semibold text-slate-800">Comparado con tu referencia personal</p>
      <p className="text-xs text-slate-500">{lb.sesiones} evaluaciones en buenas condiciones · mediana habitual {Math.round(lb.medianaRt)} ms · lapso personal ≥{lb.lapsoPersonal} ms</p>
      <div className="relative mt-3 h-4 w-full overflow-hidden rounded-full">
        <div className="absolute inset-y-0 bg-red-300" style={{ left: 0, width: `${x(-cortes.rojo)}%` }} />
        <div className="absolute inset-y-0 bg-amber-300" style={{ left: `${x(-cortes.rojo)}%`, width: `${x(-cortes.ambar) - x(-cortes.rojo)}%` }} />
        <div className="absolute inset-y-0 bg-green-300" style={{ left: `${x(-cortes.ambar)}%`, right: 0 }} />
        <div className="absolute inset-y-0 w-px bg-slate-500" style={{ left: `${x(0)}%` }} />
      </div>
      <div className="relative h-6">
        <div className="absolute -top-1 -translate-x-1/2 text-center" style={{ left: `${x(cambio)}%` }}>
          <div className="mx-auto h-0 w-0 border-x-[6px] border-b-[8px] border-x-transparent border-b-slate-900" />
          <span className="cifras whitespace-nowrap text-xs font-bold">hoy {cambio >= 0 ? "+" : "−"}{Math.abs(cambio * 100).toFixed(0)} %</span>
        </div>
      </div>
      <p className="mt-1 text-xs text-slate-500">Más lento ← · tu normal = 0 · → más rápido. Aviso desde −{(cortes.ambar * 100).toFixed(0)} %, rojo desde −{(cortes.rojo * 100).toFixed(0)} % (según tu variación habitual de ±{(lb.cvVelocidad * 100).toFixed(1).replace(".", ",")} %).</p>
    </div>
  );
}

function DetallePvt({ p, lb, umbrales }: { p: PvtResultado; lb: LineaBase | null; umbrales: Umbrales }) {
  const w = 320;
  const h = 90;
  const max = Math.max(600, ...p.rts.map((x) => Math.min(x, 1000)));
  const y = (rt: number) => h - 6 - (Math.min(rt, max) / max) * (h - 12);
  return (
    <Tarjeta>
      <p className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Tiempo de reacción</p>
      {lb && lb.velocidad > 0 && <BarraReferencia p={p} lb={lb} umbrales={umbrales} />}
      {p.rts.length > 1 && (
        <svg viewBox={`0 0 ${w} ${h}`} className="mb-2 w-full" role="img" aria-label="Tiempos de reacción a lo largo de la prueba">
          <line x1="0" x2={w} y1={y(p.lapsoMs)} y2={y(p.lapsoMs)} stroke="#f59e0b" strokeDasharray="4 4" />
          <text x={w - 2} y={y(p.lapsoMs) - 3} textAnchor="end" fontSize="9" fill="#b45309">lapso {p.lapsoMs} ms</text>
          {p.rts.map((rt, i) => (
            <rect key={i} x={(i / p.rts.length) * w + 0.5} width={Math.max(1.5, w / p.rts.length - 1.5)} y={y(rt)} height={h - 6 - y(rt)} rx="1" fill={rt >= p.lapsoMs ? "#dc2626" : "#3b82f6"} />
          ))}
        </svg>
      )}
      <Metricas filas={[
        ["Duración", `${duracionTexto(p.duracionS)}${p.adaptativo ? (p.anticipado ? " · terminó antes (resultado claro)" : " · adaptativa") : ""}`],
        ["Desempeño (PVT-B)", p.categoria ? DESEMPENO[p.categoria] : "—"],
        ["Mediana", `${Math.round(p.medianaRt)} ms`],
        ["Media", `${Math.round(p.mediaRt)} ms`],
        ["Velocidad media (1/RT)", `${p.velocidad.toFixed(2)} /s`],
        ["10 % más lento (1/RT)", `${p.lentos10.toFixed(2)} /s`],
        ["Lapsos (≥ " + p.lapsoMs + " ms)", String(p.lapsos)],
        ["Falsos inicios", String(p.falsos)],
        ["Estímulos válidos", String(p.validos)],
        ["Puntaje de desempeño", `${(p.puntaje * 100).toFixed(0)} %`],
      ]} />
      <p className="mt-2 text-xs text-slate-500">Tiempos corregidos restando {p.latenciaMs} ms de latencia táctil del equipo.</p>
    </Tarjeta>
  );
}

function GraficoKss({ m }: { m: TpmResultado }) {
  const w = 320;
  const h = 150;
  const iz = 22;
  const ab = 18;
  const c = m.curva;
  if (c.length < 2) return null;
  const t0 = c[0].t;
  const t1 = c[c.length - 1].t;
  const x = (t: number) => iz + ((t - t0) / Math.max(1, t1 - t0)) * (w - iz - 6);
  const y = (k: number) => 6 + ((9 - k) / 8) * (h - ab - 6);
  const linea = c.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.kss).toFixed(1)}`).join(" ");
  // Marcas cada 2 h exactas
  const marcas: number[] = [];
  const d = new Date(t0);
  d.setMinutes(0, 0, 0);
  for (let t = d.getTime() + 3_600_000; t < t1; t += 3_600_000) if (new Date(t).getHours() % 2 === 0) marcas.push(t);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="KSS previsto durante el turno">
      <rect x={iz} y={y(9)} width={w - iz - 6} height={y(7) - y(9)} fill="#fee2e2" />
      <rect x={iz} y={y(7)} width={w - iz - 6} height={y(6) - y(7)} fill="#fef3c7" />
      {[1, 3, 5, 7, 9].map((k) => (
        <g key={k}>
          <line x1={iz} x2={w - 6} y1={y(k)} y2={y(k)} stroke="#e2e8f0" />
          <text x={iz - 5} y={y(k) + 3} fontSize="9" textAnchor="end" fill="#64748b">{k}</text>
        </g>
      ))}
      {marcas.map((t) => (
        <text key={t} x={x(t)} y={h - 4} fontSize="9" textAnchor="middle" fill="#64748b">{horaTexto(t)}</text>
      ))}
      <path d={linea} fill="none" stroke="#1d4ed8" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx={x(m.horaMax)} cy={y(m.kssMax)} r="4" fill="#dc2626" />
      <text x={Math.min(w - 40, Math.max(iz + 34, x(m.horaMax)))} y={y(m.kssMax) < 20 ? y(m.kssMax) + 16 : y(m.kssMax) - 7} fontSize="10" fontWeight="bold" textAnchor="middle" fill="#b91c1c">{m.kssMax.toFixed(1)} · {horaTexto(m.horaMax)}</text>
    </svg>
  );
}
