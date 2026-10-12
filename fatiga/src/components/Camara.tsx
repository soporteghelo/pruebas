// Cámara: vista flotante (siempre montada, para no perder el video entre pantallas)
// y pantalla de permiso + calibración personal.
import { Camera, CameraOff, Loader2, ShieldCheck } from "lucide-react";
import type { RefObject } from "react";
import type { EstadoVivo } from "@/lib/face/analyzer";
import type { FaseMonitor } from "@/lib/face/monitor";
import { Boton, Encabezado, Tarjeta } from "./ui";

export function CamaraFlotante({ videoRef, modo, fase, vivo, progreso }: {
  videoRef: RefObject<HTMLVideoElement | null>;
  modo: "grande" | "mini" | "oculto";
  fase: FaseMonitor;
  vivo: EstadoVivo | null;
  progreso: number;
}) {
  const grande = modo === "grande";
  const tam = grande ? 232 : 72;
  const ok = vivo?.rostro && vivo.mensaje === "Rostro detectado";
  const anillo = fase === "calibrando" ? progreso : fase === "midiendo" ? 1 : 0;
  const r = tam / 2 - 3;
  const per = 2 * Math.PI * r;
  return (
    <div
      aria-hidden={modo === "oculto"}
      className={`pointer-events-none fixed z-30 transition-all duration-300 ${modo === "oculto" ? "invisible opacity-0" : "opacity-100"}`}
      style={grande ? { top: 76, left: "50%", transform: "translateX(-50%)", width: tam, height: tam } : { top: 10, right: 12, width: tam, height: tam }}
    >
      <div className="relative h-full w-full overflow-hidden rounded-full bg-slate-800 shadow-lg ring-2 ring-white">
        <video ref={videoRef} className="espejo h-full w-full object-cover" muted playsInline />
        {fase === "cargando" && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/70 text-white">
            <Loader2 className="animate-spin" size={grande ? 40 : 22} />
          </div>
        )}
      </div>
      <svg className="absolute inset-0" width={tam} height={tam} viewBox={`0 0 ${tam} ${tam}`}>
        <circle cx={tam / 2} cy={tam / 2} r={r} fill="none" stroke={ok ? "#16a34a" : "#f59e0b"} strokeOpacity={fase === "midiendo" || fase === "calibrando" ? 1 : 0} strokeWidth={grande ? 6 : 4}
          strokeDasharray={`${per * anillo} ${per}`} strokeLinecap="round" transform={`rotate(-90 ${tam / 2} ${tam / 2})`} />
      </svg>
      {!grande && fase === "midiendo" && (
        <span className={`absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white ${ok ? "bg-verde" : "bg-ambar"}`}>
          {ok ? "● midiendo" : "ubica tu rostro"}
        </span>
      )}
    </div>
  );
}

/** Modo diagnóstico (agrega ?diagnostico a la URL): valores en vivo para ajustar umbrales en campo. */
export const DIAGNOSTICO = typeof location !== "undefined" && new URLSearchParams(location.search).has("diagnostico");

export function PanelDiagnostico({ vivo, fase }: { vivo: EstadoVivo | null; fase: FaseMonitor }) {
  if (!DIAGNOSTICO || fase === "apagado") return null;
  const m = vivo?.muestra;
  const f = (x: number | undefined, d = 3) => (x === undefined || Number.isNaN(x) ? "—" : x.toFixed(d));
  return (
    <pre data-diagnostico className="fixed bottom-2 left-2 z-40 rounded-lg bg-black/80 p-2 font-mono text-[10px] leading-tight text-lime-300">
      {[
        `fase ${fase} · rostro ${vivo?.rostro ? "sí" : "no"}`,
        `EAR ${f(m?.ear)} (abierto ${f(vivo?.ref?.earAbierto)})`,
        `eyeBlink ${f(m?.parpadeo)} (abierto ${f(vivo?.ref?.bsAbierto)})`,
        `cierre ${f(vivo?.cierre, 2)} · jaw ${f(m?.mandibula, 2)}`,
        `pitch ${f(m?.pitch, 1)} · yaw ${f(m?.yaw, 1)}`,
        `luz ${f(m?.luz, 0)} · tamaño ${f(m?.tamano, 2)}`,
        `válidos ${f(vivo?.segundosValidos, 1)} s · parp ${vivo?.parpadeos ?? 0} · largos ${vivo?.cierresLargos ?? 0}`,
      ].join("\n")}
    </pre>
  );
}

export function PantallaCamara({ fase, vivo, error, onActivar, onSinCamara, onAtras }: {
  fase: FaseMonitor;
  vivo: EstadoVivo | null;
  error: string;
  onActivar: () => void;
  onSinCamara: () => void;
  onAtras: () => void;
}) {
  const enCurso = fase === "cargando" || fase === "calibrando" || fase === "midiendo";
  return (
    <div className="space-y-4">
      <Encabezado titulo="Análisis del rostro" subtitulo="Paso 2 de 4 · opcional" onAtras={enCurso ? undefined : onAtras} />
      {enCurso ? (
        <>
          {/* Espacio para la vista grande de la cámara */}
          <div style={{ height: 250 }} />
          <div className="text-center">
            {fase === "cargando" && <p className="text-base font-semibold text-slate-700">Preparando el motor de visión…</p>}
            {fase === "calibrando" && (
              <>
                <p className="text-lg font-bold text-slate-900">Mira la pantalla y parpadea normal</p>
                <p className={`mt-1 text-base font-semibold ${vivo?.rostro && vivo.mensaje === "Rostro detectado" ? "text-verde" : "text-amber-600"}`}>{vivo?.mensaje ?? "Buscando tu rostro…"}</p>
                <p className="mt-2 text-sm text-slate-600">Estamos midiendo cómo se ven tus ojos abiertos para compararte contigo mismo.</p>
              </>
            )}
            {fase === "midiendo" && <p className="text-lg font-bold text-verde">¡Listo! Empecemos el cuestionario.</p>}
          </div>
          {fase === "cargando" && <p className="text-center text-xs text-slate-500">La primera vez descarga unos 15 MB; después funciona sin internet.</p>}
        </>
      ) : (
        <>
          <Tarjeta className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-marca-50 p-3 text-marca-700"><Camera size={26} /></div>
              <p className="text-base text-slate-800">Mientras respondes el cuestionario, la cámara frontal mide <b>cierre de ojos (PERCLOS)</b>, <b>parpadeos</b>, <b>bostezos</b> y <b>cabeceos</b>.</p>
            </div>
            <div className="flex items-start gap-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
              <ShieldCheck size={20} className="mt-0.5 shrink-0" />
              <span>El video <b>no se graba ni se envía</b>. Todo se procesa dentro de este celular y solo se guardan los números del resultado.</span>
            </div>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
              <li>Luz de frente, sin contraluz.</li>
              <li>Celular a la altura del pecho, a 30–50 cm de la cara.</li>
              <li>Sin lentes oscuros ni gorra que tape los ojos.</li>
            </ul>
          </Tarjeta>
          {fase === "error" && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</div>}
          <Boton onClick={onActivar} icono={<Camera size={20} />}>{fase === "error" ? "Intentar de nuevo" : "Activar cámara"}</Boton>
          <Boton tipo="secundario" onClick={onSinCamara} icono={<CameraOff size={20} />}>Continuar sin cámara</Boton>
        </>
      )}
    </div>
  );
}
