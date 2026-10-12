// Paso 3: cuestionario de sueño, somnolencia (KSS) y declaraciones, una pregunta por pantalla.
// Mientras tanto la cámara (si está activa) sigue midiendo el rostro.
import { useEffect, useRef, useState } from "react";
import { KSS } from "@/config";
import { horas, ultimoSueno } from "@/lib/sueno";
import { duracionTexto } from "@/lib/turno";
import type { Respuestas } from "@/lib/types";
import { Boton, claseEntrada, Encabezado, Opcion, Progreso, Tarjeta } from "./ui";

const SEGUNDOS_MIN_ROSTRO = 25;
const ESPERA_MAX_S = 25;

const SIESTAS = [
  { min: 0, txt: "No" },
  { min: 15, txt: "15 min" },
  { min: 30, txt: "30 min" },
  { min: 45, txt: "45 min" },
  { min: 60, txt: "1 h" },
  { min: 90, txt: "1 h 30" },
  { min: 120, txt: "2 h o más" },
];

// Colores de la escala KSS: de alerta (verde) a muy somnoliento (rojo).
const COLOR_KSS = ["#15803d", "#16a34a", "#22c55e", "#65a30d", "#ca8a04", "#d97706", "#ea580c", "#dc2626", "#b91c1c"];

export default function Cuestionario({ camaraActiva, segundosRostro, onAtras, onListo }: {
  camaraActiva: boolean;
  segundosRostro: number;
  onAtras: () => void;
  onListo: (r: Respuestas) => void;
}) {
  const [paso, setPaso] = useState(0);
  const [r, setR] = useState<Partial<Respuestas>>({});
  const [esperando, setEsperando] = useState(false);
  const [espera, setEspera] = useState(0);
  const avance = useRef<number | null>(null);
  const hecho = useRef(false);

  const ahora = Date.now();
  const sueno = r.dormir && r.despertar ? ultimoSueno({ dormir: r.dormir, despertar: r.despertar }, ahora) : null;
  const durUltimo = sueno ? horas(sueno) : 0;

  const fijar = (k: keyof Respuestas, v: Respuestas[keyof Respuestas], auto = true) => {
    setR((x) => ({ ...x, [k]: v }));
    if (auto) {
      if (avance.current) clearTimeout(avance.current);
      avance.current = window.setTimeout(() => setPaso((p) => p + 1), 280);
    }
  };
  useEffect(() => () => { if (avance.current) clearTimeout(avance.current); }, []);

  const pasos: { titulo: string; ayuda?: string; listo: boolean; contenido: React.ReactNode; auto?: boolean }[] = [
    {
      titulo: "Tu último sueño principal",
      ayuda: "¿A qué hora te dormiste y a qué hora despertaste?",
      listo: durUltimo >= 0.5 && durUltimo <= 16,
      contenido: (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="mb-1 block text-sm font-semibold text-slate-700">Me dormí</span>
              <input type="time" className={claseEntrada} value={r.dormir ?? ""} onChange={(e) => fijar("dormir", e.target.value, false)} /></label>
            <label className="block"><span className="mb-1 block text-sm font-semibold text-slate-700">Desperté</span>
              <input type="time" className={claseEntrada} value={r.despertar ?? ""} onChange={(e) => fijar("despertar", e.target.value, false)} /></label>
          </div>
          {sueno && (
            <p className="rounded-xl bg-marca-50 p-3 text-center text-base text-marca-900">
              Dormiste <b>{duracionTexto(durUltimo)}</b>
              <span className="block text-xs text-slate-600">
                del {new Date(sueno.inicio).toLocaleString("es-PE", { weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false })} al {new Date(sueno.fin).toLocaleString("es-PE", { weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false })}
              </span>
            </p>
          )}
        </div>
      ),
    },
    {
      titulo: "El sueño anterior a ese",
      ayuda: "¿Cuántas horas dormiste en tu sueño principal previo (la noche o el día anterior)?",
      listo: (r.horasSuenoAnterior ?? -1) >= 0,
      contenido: (
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-4">
            <button type="button" aria-label="Menos" className="h-14 w-14 rounded-full bg-slate-200 text-3xl font-bold active:bg-slate-300" onClick={() => fijar("horasSuenoAnterior", Math.max(0, (r.horasSuenoAnterior ?? 7) - 0.5), false)}>−</button>
            <span className="cifras w-32 text-center text-4xl font-bold">{r.horasSuenoAnterior === undefined ? "—" : duracionTexto(r.horasSuenoAnterior)}</span>
            <button type="button" aria-label="Más" className="h-14 w-14 rounded-full bg-slate-200 text-3xl font-bold active:bg-slate-300" onClick={() => fijar("horasSuenoAnterior", Math.min(16, (r.horasSuenoAnterior ?? 7) + 0.5), false)}>+</button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[4, 5, 6, 7, 8, 9, 10, 0].map((h) => (
              <Opcion key={h} activo={r.horasSuenoAnterior === h} onClick={() => fijar("horasSuenoAnterior", h, false)} className="text-sm">{h === 0 ? "No dormí" : `${h} h`}</Opcion>
            ))}
          </div>
        </div>
      ),
    },
    {
      titulo: "Siestas",
      ayuda: "¿Cuánto dormiste en siestas durante las últimas 24 horas?",
      listo: r.siestaMin !== undefined,
      auto: true,
      contenido: (
        <div className="grid grid-cols-2 gap-2">
          {SIESTAS.map((s) => <Opcion key={s.min} activo={r.siestaMin === s.min} onClick={() => fijar("siestaMin", s.min)}>{s.txt}</Opcion>)}
        </div>
      ),
    },
    {
      titulo: "Calidad de tu sueño",
      ayuda: "¿Cómo dormiste en tu último sueño?",
      listo: !!r.calidad,
      auto: true,
      contenido: (
        <div className="grid grid-cols-3 gap-2">
          {(["buena", "regular", "mala"] as const).map((c) => <Opcion key={c} activo={r.calidad === c} onClick={() => fijar("calidad", c)} className="capitalize">{c}</Opcion>)}
        </div>
      ),
    },
    {
      titulo: "¿Cómo te sientes ahora?",
      ayuda: "Elige lo que mejor describe tus últimos 10 minutos.",
      listo: !!r.kss,
      auto: true,
      contenido: (
        <div className="space-y-1.5">
          {KSS.map((txt, i) => (
            <button key={i} type="button" onClick={() => fijar("kss", i + 1)} aria-pressed={r.kss === i + 1}
              className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-[15px] transition ${r.kss === i + 1 ? "border-marca-700 bg-marca-50 font-semibold" : "border-slate-200 bg-white active:bg-slate-100"}`}>
              <span className="cifras flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: COLOR_KSS[i] }}>{i + 1}</span>
              {txt}
            </button>
          ))}
        </div>
      ),
    },
    {
      titulo: "Alcohol",
      ayuda: "¿Consumiste bebidas alcohólicas en las últimas 12 horas?",
      listo: r.alcohol !== undefined,
      auto: true,
      contenido: <SiNo valor={r.alcohol} onCambio={(v) => fijar("alcohol", v)} />,
    },
    {
      titulo: "Medicamentos",
      ayuda: "¿Tomaste algún medicamento que pueda dar sueño? (antialérgicos, antigripales, relajantes, pastillas para dormir)",
      listo: r.medicamento !== undefined,
      auto: true,
      contenido: <SiNo valor={r.medicamento} onCambio={(v) => fijar("medicamento", v)} />,
    },
    {
      titulo: "Tu condición",
      ayuda: "¿Te sientes en condiciones de trabajar con seguridad hoy?",
      listo: r.enCondiciones !== undefined,
      auto: true,
      contenido: <SiNo valor={r.enCondiciones} onCambio={(v) => fijar("enCondiciones", v)} />,
    },
  ];

  const terminar = () => {
    if (hecho.current) return;
    hecho.current = true;
    onListo(r as Respuestas);
  };
  const fin = paso >= pasos.length;

  // Al terminar: si la cámara aún no midió lo suficiente, se pide mirar la pantalla unos segundos más.
  useEffect(() => {
    if (!fin) return;
    if (!camaraActiva || segundosRostro >= SEGUNDOS_MIN_ROSTRO) {
      terminar();
      return;
    }
    setEsperando(true);
    const t0 = Date.now();
    const id = window.setInterval(() => setEspera((Date.now() - t0) / 1000), 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fin]);

  useEffect(() => {
    if (esperando && (segundosRostro >= SEGUNDOS_MIN_ROSTRO || espera >= ESPERA_MAX_S)) terminar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esperando, segundosRostro, espera]);

  if (fin) {
    return (
      <div className="space-y-4 pt-24 text-center">
        <p className="text-lg font-bold">Mira la pantalla unos segundos más</p>
        <p className="text-sm text-slate-600">La cámara necesita {SEGUNDOS_MIN_ROSTRO} s con tu rostro visible para un resultado confiable.</p>
        <Progreso valor={Math.max(segundosRostro / SEGUNDOS_MIN_ROSTRO, espera / ESPERA_MAX_S)} />
        <Boton tipo="fantasma" onClick={terminar}>Continuar</Boton>
      </div>
    );
  }

  const p = pasos[paso];
  return (
    <div className="space-y-4">
      <div className={camaraActiva ? "pr-20" : ""}>
        <Encabezado titulo={p.titulo} subtitulo={`Paso 3 de 4 · pregunta ${paso + 1} de ${pasos.length}`} onAtras={() => (paso === 0 ? onAtras() : setPaso(paso - 1))} />
      </div>
      <Progreso valor={(paso + 1) / pasos.length} />
      <Tarjeta className="space-y-4">
        {p.ayuda && <p className="text-base text-slate-800">{p.ayuda}</p>}
        {p.contenido}
      </Tarjeta>
      {!p.auto && <Boton disabled={!p.listo} onClick={() => setPaso(paso + 1)}>Siguiente</Boton>}
      {p.auto && p.listo && <Boton tipo="secundario" onClick={() => setPaso(paso + 1)}>Siguiente</Boton>}
    </div>
  );
}

function SiNo({ valor, onCambio }: { valor: boolean | undefined; onCambio: (v: boolean) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Opcion activo={valor === true} onClick={() => onCambio(true)} className="py-4 text-lg">Sí</Opcion>
      <Opcion activo={valor === false} onClick={() => onCambio(false)} className="py-4 text-lg">No</Opcion>
    </div>
  );
}
