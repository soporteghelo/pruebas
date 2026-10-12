// Flujo: Inicio → Datos → Cámara (calibración, opcional) → Cuestionario (con la cámara midiendo)
//        → PVT-B (cámara apagada) → Resultado. El supervisor entra con PIN.
import { Brain, ClipboardList, Eye, ShieldCheck, Timer, UserRound, Wifi, WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NIVELES } from "@/config";
import { CamaraFlotante, PanelDiagnostico, PantallaCamara } from "./components/Camara";
import Cuestionario from "./components/Cuestionario";
import Datos from "./components/Datos";
import PruebaPvt from "./components/PruebaPvt";
import Resultado from "./components/Resultado";
import Supervisor from "./components/Supervisor";
import { Boton, Tarjeta } from "./components/ui";
import type { EstadoVivo } from "./lib/face/analyzer";
import { MonitorRostro, type FaseMonitor } from "./lib/face/monitor";
import { evaluar } from "./lib/evaluar";
import { calcularPvt } from "./lib/pvt";
import { cortesPersonales, lineaBase, sesionesReferencia } from "./lib/referencia";
import { agregarEvaluacion, cargarAjustes, cargarHistorial, cargarReinicios, cargarUltimoTrabajador, guardarUltimoTrabajador } from "./lib/store";
import { sincronizarPendientes } from "./lib/sync";
import type { Ajustes, Evaluacion, EventoPvt, Respuestas, RostroResumen, Trabajador, Turno } from "./lib/types";

type Pantalla = "inicio" | "datos" | "camara" | "cuestionario" | "pvt" | "resultado" | "supervisor";

export default function App() {
  const [pantalla, setPantalla] = useState<Pantalla>("inicio");
  const [ajustes, setAjustes] = useState<Ajustes>(cargarAjustes);
  const [historial, setHistorial] = useState<Evaluacion[]>(cargarHistorial);
  const [trabajador, setTrabajador] = useState<Trabajador | null>(cargarUltimoTrabajador);
  const [turno, setTurno] = useState<Turno | null>(null);
  const [respuestas, setRespuestas] = useState<Respuestas | null>(null);
  const [rostro, setRostro] = useState<RostroResumen | null>(null);
  const [resultado, setResultado] = useState<Evaluacion | null>(null);
  const [enLinea, setEnLinea] = useState(typeof navigator === "undefined" ? true : navigator.onLine);

  const videoRef = useRef<HTMLVideoElement>(null);
  const monitor = useRef<MonitorRostro>(new MonitorRostro());
  const [fase, setFase] = useState<FaseMonitor>("apagado");
  const [vivo, setVivo] = useState<EstadoVivo | null>(null);
  const [progreso, setProgreso] = useState(0);

  // Estado de la cámara → React
  useEffect(() => {
    const m = monitor.current;
    m.onCambio = () => setFase(m.fase);
    return () => m.detener();
  }, []);

  useEffect(() => {
    if (fase !== "cargando" && fase !== "calibrando" && fase !== "midiendo") return;
    const id = window.setInterval(() => {
      setVivo(monitor.current.vivo());
      setProgreso(monitor.current.progresoCalibracion);
    }, 250);
    return () => clearInterval(id);
  }, [fase]);

  // Calibración terminada: pasa solo al cuestionario.
  useEffect(() => {
    if (fase === "midiendo" && pantalla === "camara") {
      const id = window.setTimeout(() => setPantalla("cuestionario"), 900);
      return () => clearTimeout(id);
    }
  }, [fase, pantalla]);

  // Envío de pendientes al iniciar y al recuperar internet.
  useEffect(() => {
    const sincronizar = () =>
      sincronizarPendientes(cargarAjustes().urlAppsScript).then((r) => {
        if (r.enviadas) setHistorial(cargarHistorial());
      });
    const on = () => {
      setEnLinea(true);
      sincronizar();
    };
    const off = () => setEnLinea(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    sincronizar();
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Llaves obligatorias: en Chrome reciente scrollTo devuelve una promesa y React la tomaría como limpieza.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pantalla]);

  const irInicio = () => {
    monitor.current.detener();
    setPantalla("inicio");
  };

  const nueva = () => {
    setRespuestas(null);
    setRostro(null);
    setResultado(null);
    setPantalla("datos");
  };

  const conDatos = (t: Trabajador, tu: Turno) => {
    setTrabajador(t);
    guardarUltimoTrabajador(t);
    setTurno(tu);
    setPantalla(ajustes.camara ? "camara" : "cuestionario");
  };

  const conRespuestas = (r: Respuestas) => {
    setRespuestas(r);
    setRostro(monitor.current.terminar());
    setPantalla("pvt");
  };

  const referenciaDesde = trabajador ? cargarReinicios()[trabajador.dni] ?? 0 : 0;
  const lb = trabajador ? lineaBase(historial, trabajador.dni, referenciaDesde) : null;
  const sesionesRef = trabajador ? sesionesReferencia(historial, trabajador.dni, referenciaDesde).length : 0;

  const finalizar = (eventos: EventoPvt[] | null, duracionS = ajustes.pvtSegundos) => {
    const u = ajustes.umbrales;
    const pvt = eventos
      ? calcularPvt(eventos, {
          latenciaMs: ajustes.latenciaMs,
          lapsoMs: ajustes.lapsoMs,
          duracionS,
          adaptativo: ajustes.pvtModo === "adaptativo",
          cortes: { alta: u.pvtFallasAlta, media: u.pvtFallasMedia },
        })
      : null;
    const ev = evaluar({ trabajador: trabajador!, turno: turno!, respuestas: respuestas!, pvt, rostro, historial, ajustes, referenciaDesde });
    setHistorial(agregarEvaluacion(ev));
    setResultado(ev);
    setPantalla("resultado");
    sincronizarPendientes(ajustes.urlAppsScript).then((r) => {
      if (r.enviadas) {
        setHistorial(cargarHistorial());
        setResultado((x) => (x && x.id === ev.id ? { ...x, sincronizado: true } : x));
      }
    });
  };

  const primeraVez = !historial.some((e) => e.trabajador.dni === trabajador?.dni && e.pvt);
  const camaraActiva = fase === "calibrando" || fase === "midiendo";
  const modoCamara = pantalla === "camara" && (fase === "cargando" || camaraActiva) ? "grande" : pantalla === "cuestionario" && camaraActiva ? "mini" : "oculto";
  const pendientes = historial.filter((e) => !e.sincronizado).length;

  return (
    <div className="mx-auto min-h-dvh max-w-md px-4 pb-10" style={{ paddingTop: "max(16px, env(safe-area-inset-top))" }}>
      <CamaraFlotante videoRef={videoRef} modo={modoCamara} fase={fase} vivo={vivo} progreso={progreso} />
      <PanelDiagnostico vivo={vivo} fase={fase} />

      {pantalla === "inicio" && (
        <Inicio
          empresa={ajustes.empresa}
          enLinea={enLinea}
          pendientes={pendientes}
          ultimo={historial[0]}
          onIniciar={nueva}
          onSupervisor={() => setPantalla("supervisor")}
        />
      )}
      {pantalla === "datos" && <Datos inicial={trabajador} empresa={ajustes.empresa} onAtras={irInicio} onListo={conDatos} />}
      {pantalla === "camara" && (
        <PantallaCamara
          fase={fase}
          vivo={vivo}
          error={monitor.current.error}
          onActivar={() => videoRef.current && monitor.current.iniciar(videoRef.current)}
          onSinCamara={() => {
            monitor.current.detener();
            setPantalla("cuestionario");
          }}
          onAtras={() => setPantalla("datos")}
        />
      )}
      {pantalla === "cuestionario" && (
        <Cuestionario
          camaraActiva={fase === "midiendo"}
          segundosRostro={vivo?.segundosValidos ?? 0}
          onAtras={() => {
            monitor.current.detener();
            setPantalla("datos");
          }}
          onListo={conRespuestas}
        />
      )}
      {pantalla === "pvt" && (
        <PruebaPvt
          duracionS={ajustes.pvtSegundos}
          adaptativo={ajustes.pvtModo === "adaptativo"}
          latenciaMs={ajustes.latenciaMs}
          lapsoMs={ajustes.lapsoMs}
          referencia={lb ? { velocidad: lb.velocidad, lapso: lb.lapsoPersonal, caida: cortesPersonales(lb, ajustes.umbrales).ambar, medianaRt: lb.medianaRt, sesiones: lb.sesiones } : null}
          sesionesRef={sesionesRef}
          primeraVez={primeraVez}
          onFin={finalizar}
          onOmitir={() => finalizar(null)}
        />
      )}
      {pantalla === "resultado" && resultado && (
        <Resultado
          ev={resultado}
          umbrales={ajustes.umbrales}
          acciones={
            <div className="grid grid-cols-2 gap-2">
              <Boton tipo="secundario" onClick={nueva}>Nueva evaluación</Boton>
              <Boton tipo="secundario" onClick={irInicio}>Inicio</Boton>
            </div>
          }
        />
      )}
      {pantalla === "supervisor" && (
        <Supervisor ajustes={ajustes} historial={historial} onAjustes={setAjustes} onHistorial={setHistorial} onSalir={irInicio} />
      )}
    </div>
  );
}

function Inicio({ empresa, enLinea, pendientes, ultimo, onIniciar, onSupervisor }: {
  empresa: string;
  enLinea: boolean;
  pendientes: number;
  ultimo?: Evaluacion;
  onIniciar: () => void;
  onSupervisor: () => void;
}) {
  const pasos = [
    { i: <UserRound size={20} />, t: "Tus datos y tu turno", d: "30 s" },
    { i: <Eye size={20} />, t: "Calibración del rostro (opcional)", d: "10 s" },
    { i: <ClipboardList size={20} />, t: "Sueño y somnolencia, con la cámara midiendo", d: "1–2 min" },
    { i: <Timer size={20} />, t: "Prueba de reacción PVT-B", d: "1–3 min" },
  ];
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-11 w-11" />
          <div>
            <p className="text-xl font-extrabold leading-tight text-marca-900">Test de Fatiga</p>
            <p className="text-xs text-slate-500">{empresa || "Evaluación antes del turno"}</p>
          </div>
        </div>
        <span className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${enLinea ? "bg-emerald-50 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
          {enLinea ? <Wifi size={14} /> : <WifiOff size={14} />}
          {enLinea ? "En línea" : "Sin internet"}
        </span>
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-marca-900 to-marca-700 p-5 text-white shadow-md">
        <Brain size={34} className="opacity-90" />
        <p className="mt-2 text-2xl font-extrabold leading-tight">¿Estás en condiciones de iniciar tu turno?</p>
        <p className="mt-1 text-sm text-blue-100">Evaluación de 3 a 5 minutos basada en tu sueño, tu somnolencia, tu tiempo de reacción y los signos de tu rostro.</p>
      </div>

      <Tarjeta className="space-y-3">
        {pasos.map((p, n) => (
          <div key={n} className="flex items-center gap-3">
            <div className="rounded-xl bg-marca-50 p-2 text-marca-700">{p.i}</div>
            <p className="flex-1 text-[15px] text-slate-800">{p.t}</p>
            <span className="text-xs text-slate-500">{p.d}</span>
          </div>
        ))}
      </Tarjeta>

      <Boton onClick={onIniciar} className="py-4 text-lg">Iniciar evaluación</Boton>

      <div className="flex items-start gap-2 rounded-xl bg-white p-3 text-xs text-slate-600 ring-1 ring-slate-200">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-600" />
        <span>El video no se graba ni sale del celular. Funciona sin internet; los resultados se envían cuando hay conexión.</span>
      </div>

      <div className="flex items-center justify-between text-sm">
        <button type="button" onClick={onSupervisor} className="font-semibold text-marca-700">Modo supervisor</button>
        <span className="text-xs text-slate-500">
          {ultimo ? `Última: ${NIVELES[ultimo.nivel].corto} · ${new Date(ultimo.fecha).toLocaleDateString("es-PE")}` : "Sin evaluaciones"}
          {pendientes > 0 && ` · ${pendientes} por enviar`}
        </span>
      </div>
    </div>
  );
}
