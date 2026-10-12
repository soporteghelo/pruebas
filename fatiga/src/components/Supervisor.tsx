// Modo supervisor (protegido con PIN): historial del equipo, exportación, sincronización y ajustes.
import { Activity, CloudUpload, Download, Lock, RotateCcw, Search, Settings, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { AJUSTES_INICIALES, NIVELES, REFERENCIA } from "@/config";
import { horaTexto } from "@/lib/decision";
import { cortesPersonales, lineaBase, sesionesReferencia } from "@/lib/referencia";
import { exportarCsv } from "@/lib/export";
import { borrarHistorial, cargarHistorial, cargarReinicios, guardarAjustes, reiniciarReferencia } from "@/lib/store";
import { sincronizarPendientes } from "@/lib/sync";
import type { Ajustes, Evaluacion, Umbrales } from "@/lib/types";
import Resultado from "./Resultado";
import { Boton, Campo, claseEntrada, Encabezado, Opcion, Punto, Tarjeta } from "./ui";

export default function Supervisor({ ajustes, historial, onAjustes, onHistorial, onSalir }: {
  ajustes: Ajustes;
  historial: Evaluacion[];
  onAjustes: (a: Ajustes) => void;
  onHistorial: (h: Evaluacion[]) => void;
  onSalir: () => void;
}) {
  const [pin, setPin] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [pestana, setPestana] = useState<"lista" | "referencias" | "ajustes">("lista");
  const [sel, setSel] = useState<Evaluacion | null>(null);

  if (!abierto) {
    const probar = (v: string) => {
      setPin(v);
      if (v === ajustes.pin) setAbierto(true);
    };
    return (
      <div className="space-y-4">
        <Encabezado titulo="Modo supervisor" subtitulo="Ingresa el PIN" onAtras={onSalir} />
        <Tarjeta className="space-y-3 text-center">
          <Lock className="mx-auto text-marca-700" size={36} />
          <input className={`${claseEntrada} cifras text-center text-2xl tracking-[0.5em]`} type="password" inputMode="numeric" maxLength={8} value={pin} autoFocus onChange={(e) => probar(e.target.value)} />
          {pin.length >= ajustes.pin.length && pin !== ajustes.pin && <p className="text-sm text-rojo">PIN incorrecto</p>}
          {ajustes.pin === AJUSTES_INICIALES.pin && <p className="text-xs text-slate-500">PIN inicial: 1234. Cámbialo en Ajustes.</p>}
        </Tarjeta>
      </div>
    );
  }

  if (sel) {
    return (
      <div>
        <Encabezado titulo="Evaluación" subtitulo={sel.trabajador.nombre} onAtras={() => setSel(null)} />
        <Resultado ev={sel} umbrales={ajustes.umbrales} acciones={<Boton tipo="fantasma" onClick={() => setSel(null)}>Volver a la lista</Boton>} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Encabezado titulo="Modo supervisor" onAtras={onSalir} />
      <div className="grid grid-cols-3 gap-2">
        <Opcion activo={pestana === "lista"} onClick={() => setPestana("lista")} className="px-1 text-sm"><span className="flex flex-col items-center gap-0.5"><Users size={18} />Evaluaciones</span></Opcion>
        <Opcion activo={pestana === "referencias"} onClick={() => setPestana("referencias")} className="px-1 text-sm"><span className="flex flex-col items-center gap-0.5"><Activity size={18} />Referencias</span></Opcion>
        <Opcion activo={pestana === "ajustes"} onClick={() => setPestana("ajustes")} className="px-1 text-sm"><span className="flex flex-col items-center gap-0.5"><Settings size={18} />Ajustes</span></Opcion>
      </div>
      {pestana === "lista" ? (
        <Lista historial={historial} url={ajustes.urlAppsScript} onSel={setSel} onHistorial={onHistorial} />
      ) : pestana === "referencias" ? (
        <Referencias historial={historial} ajustes={ajustes} />
      ) : (
        <FormAjustes ajustes={ajustes} onGuardar={(a) => { guardarAjustes(a); onAjustes(a); }} onBorrar={() => onHistorial(borrarHistorial())} />
      )}
    </div>
  );
}

function Lista({ historial, url, onSel, onHistorial }: { historial: Evaluacion[]; url: string; onSel: (e: Evaluacion) => void; onHistorial: (h: Evaluacion[]) => void }) {
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  const [enviando, setEnviando] = useState(false);
  const lista = useMemo(() => {
    const k = q.trim().toLowerCase();
    return historial.filter((e) => (filtro === null || e.nivel === filtro) && (!k || `${e.trabajador.nombre} ${e.trabajador.dni} ${e.trabajador.empresa}`.toLowerCase().includes(k)));
  }, [historial, q, filtro]);
  const pendientes = historial.filter((e) => !e.sincronizado).length;
  const conteo = [0, 1, 2].map((n) => historial.filter((e) => e.nivel === n).length);

  const sincronizar = async () => {
    setEnviando(true);
    const r = await sincronizarPendientes(url);
    setEnviando(false);
    setMsg(r.error ? `Error: ${r.error}` : r.enviadas ? `${r.enviadas} evaluaciones enviadas a Google Sheets.` : navigator.onLine ? "No había pendientes." : "Sin conexión: se enviarán al volver internet.");
    onHistorial(cargarHistorial());
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {conteo.map((c, n) => (
          <button key={n} type="button" onClick={() => setFiltro(filtro === n ? null : n)}
            className={`rounded-xl p-3 text-left ring-1 transition ${filtro === n ? "ring-2 ring-marca-600" : "ring-slate-200"} bg-white`}>
            <div className="flex items-center gap-2"><Punto nivel={n as 0 | 1 | 2} /><span className="text-xs font-semibold text-slate-600">{NIVELES[n].corto}</span></div>
            <p className="cifras mt-1 text-2xl font-bold">{c}</p>
          </button>
        ))}
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input className={`${claseEntrada} pl-10`} placeholder="Buscar por nombre, DNI o empresa" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Boton tipo="secundario" onClick={() => exportarCsv(lista)} disabled={!lista.length} icono={<Download size={18} />}>CSV</Boton>
        <Boton tipo="secundario" onClick={sincronizar} disabled={!url || enviando || !pendientes} icono={<CloudUpload size={18} />}>{enviando ? "Enviando…" : `Enviar (${pendientes})`}</Boton>
      </div>
      {!url && <p className="text-xs text-slate-500">Configura la URL de Apps Script en Ajustes para enviar a Google Sheets.</p>}
      {msg && <p className="rounded-xl bg-slate-100 p-2 text-sm text-slate-700">{msg}</p>}
      <div className="space-y-2">
        {lista.map((e) => (
          <button key={e.id} type="button" onClick={() => onSel(e)} className="flex w-full items-center gap-3 rounded-xl bg-white p-3 text-left ring-1 ring-slate-200 active:bg-slate-50">
            <Punto nivel={e.nivel} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{e.trabajador.nombre}</p>
              <p className="text-xs text-slate-500">DNI {e.trabajador.dni} · {new Date(e.fecha).toLocaleDateString("es-PE")} {horaTexto(e.fecha)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold">{NIVELES[e.nivel].corto}</p>
              {!e.sincronizado && <p className="text-[10px] text-amber-600">pendiente</p>}
            </div>
          </button>
        ))}
        {!lista.length && <p className="py-8 text-center text-sm text-slate-500">No hay evaluaciones en este celular.</p>}
      </div>
    </div>
  );
}

/** Referencia personal de cada trabajador evaluado en este celular. */
function Referencias({ historial, ajustes }: { historial: Evaluacion[]; ajustes: Ajustes }) {
  const [reinicios, setReinicios] = useState(cargarReinicios);
  const trabajadores = useMemo(() => {
    const porDni = new Map<string, Evaluacion>();
    for (const e of historial) if (!porDni.has(e.trabajador.dni)) porDni.set(e.trabajador.dni, e);
    return [...porDni.values()].map((e) => {
      const desde = reinicios[e.trabajador.dni] ?? 0;
      return { e, lb: lineaBase(historial, e.trabajador.dni, desde), n: sesionesReferencia(historial, e.trabajador.dni, desde).length, desde };
    });
  }, [historial, reinicios]);
  return (
    <div className="space-y-3">
      <p className="rounded-xl bg-marca-50 p-3 text-sm text-marca-900">
        Cada trabajador tiene su propio tiempo de reacción normal. Con {REFERENCIA.minimo} evaluaciones en buenas condiciones (descansado, KSS ≤ 5, sin alcohol ni medicamentos)
        la app lo compara consigo mismo. Reinicia la referencia si cambió de celular, de mano o volvió de un descanso médico.
      </p>
      {trabajadores.map(({ e, lb, n, desde }) => (
        <Tarjeta key={e.trabajador.dni} className="space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-semibold">{e.trabajador.nombre}</p>
              <p className="text-xs text-slate-500">DNI {e.trabajador.dni}{desde ? ` · reiniciada el ${new Date(desde).toLocaleDateString("es-PE")}` : ""}</p>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${lb ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
              {lb ? "Lista" : `${Math.min(n, REFERENCIA.minimo)} de ${REFERENCIA.minimo}`}
            </span>
          </div>
          {lb ? (
            <p className="text-sm text-slate-700">
              Mediana <b>{Math.round(lb.medianaRt)} ms</b> · velocidad {lb.velocidad.toFixed(2)}/s · variación ±{(lb.cvVelocidad * 100).toFixed(1).replace(".", ",")} % · aviso desde −{(cortesPersonales(lb, ajustes.umbrales).ambar * 100).toFixed(0)} % · lapso ≥{lb.lapsoPersonal} ms · {lb.sesiones} evaluaciones
            </p>
          ) : (
            <p className="text-sm text-slate-600">Usa los cortes generales del PVT-B hasta completar su referencia.</p>
          )}
          <button type="button" className="flex items-center gap-1 pt-1 text-sm font-semibold text-marca-700"
            onClick={() => { if (confirm(`¿Reiniciar la referencia de ${e.trabajador.nombre}? Se volverá a construir con sus próximas evaluaciones.`)) setReinicios(reiniciarReferencia(e.trabajador.dni)); }}>
            <RotateCcw size={15} /> Reiniciar referencia
          </button>
        </Tarjeta>
      ))}
      {!trabajadores.length && <p className="py-8 text-center text-sm text-slate-500">Aún no hay evaluaciones en este celular.</p>}
    </div>
  );
}

const CAMPOS_UMBRAL: { k: keyof Umbrales; t: string; paso?: number }[] = [
  { k: "kssAmbar", t: "KSS ámbar desde" },
  { k: "kssRojo", t: "KSS rojo desde" },
  { k: "pvtFallasAlta", t: "PVT verde hasta (fallas/3 min)" },
  { k: "pvtFallasMedia", t: "PVT ámbar hasta (fallas/3 min)" },
  { k: "pvtCaidaVelocidad", t: "Caída vs. referencia ámbar", paso: 0.01 },
  { k: "pvtCaidaVelocidadRojo", t: "Caída vs. referencia rojo", paso: 0.01 },
  { k: "perclosAmbar", t: "PERCLOS ámbar", paso: 0.01 },
  { k: "perclosRojo", t: "PERCLOS rojo", paso: 0.01 },
  { k: "cierresLargosAmbar", t: "Cierres ≥0,5 s ámbar" },
  { k: "microsuenosRojo", t: "Cierres ≥1 s rojo" },
  { k: "bostezosAmbar", t: "Bostezos ámbar" },
  { k: "cabeceosAmbar", t: "Cabeceos ámbar" },
  { k: "modeloKssAmbar", t: "KSS previsto ámbar", paso: 0.5 },
  { k: "sueno24", t: "Sueño mín. 24 h", paso: 0.5 },
  { k: "sueno48", t: "Sueño mín. 48 h", paso: 0.5 },
];

function FormAjustes({ ajustes, onGuardar, onBorrar }: { ajustes: Ajustes; onGuardar: (a: Ajustes) => void; onBorrar: () => void }) {
  const [a, setA] = useState(ajustes);
  const [ok, setOk] = useState(false);
  const num = (v: string) => (v === "" ? 0 : Number(v));
  const cambiar = (x: Partial<Ajustes>) => { setA({ ...a, ...x }); setOk(false); };
  return (
    <div className="space-y-3">
      <Tarjeta className="space-y-3">
        <Campo etiqueta="Empresa (se sugiere al trabajador)"><input className={claseEntrada} value={a.empresa} onChange={(e) => cambiar({ empresa: e.target.value })} /></Campo>
        <Campo etiqueta="URL de Apps Script (Google Sheets)" ayuda="Instala apps-script/Code.gs como aplicación web y pega aquí la URL /exec.">
          <input className={claseEntrada} value={a.urlAppsScript} onChange={(e) => cambiar({ urlAppsScript: e.target.value.trim() })} placeholder="https://script.google.com/macros/s/…/exec" />
        </Campo>
        <Campo etiqueta="PIN del supervisor"><input className={claseEntrada} type="password" inputMode="numeric" maxLength={8} value={a.pin} onChange={(e) => cambiar({ pin: e.target.value.replace(/\D/g, "") })} /></Campo>
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-slate-700">Usar la cámara (análisis del rostro)</span>
          <input type="checkbox" className="h-6 w-6 accent-marca-700" checked={a.camara} onChange={(e) => cambiar({ camara: e.target.checked })} />
        </label>
      </Tarjeta>
      <Tarjeta className="space-y-3">
        <p className="text-sm font-bold text-slate-700">Prueba de reacción (PVT-B)</p>
        <div className="grid grid-cols-2 gap-2">
          <Opcion activo={a.pvtModo === "adaptativo"} onClick={() => cambiar({ pvtModo: "adaptativo", pvtSegundos: 180 })} className="text-sm">Adaptativa (recomendada)</Opcion>
          <Opcion activo={a.pvtModo === "fijo"} onClick={() => cambiar({ pvtModo: "fijo" })} className="text-sm">Duración fija</Opcion>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Campo etiqueta={a.pvtModo === "adaptativo" ? "Máximo (s)" : "Duración (s)"}><input className={claseEntrada} type="number" min={60} max={600} step={30} value={a.pvtSegundos} onChange={(e) => cambiar({ pvtSegundos: num(e.target.value) })} /></Campo>
          <Campo etiqueta="Lapso (ms)"><input className={claseEntrada} type="number" min={200} max={1000} value={a.lapsoMs} onChange={(e) => cambiar({ lapsoMs: num(e.target.value) })} /></Campo>
          <Campo etiqueta="Latencia (ms)"><input className={claseEntrada} type="number" min={0} max={200} value={a.latenciaMs} onChange={(e) => cambiar({ latenciaMs: num(e.target.value) })} /></Campo>
        </div>
        <p className="text-xs text-slate-500">Adaptativa: termina sola cuando el resultado ya es claro (PVT-BA, Basner 2022: en promedio 1 min 44 s, máximo 3 min). Una duración fija más corta pierde sensibilidad. Lapso de 355 ms (Basner 2011). La latencia táctil se resta de cada tiempo (NASA midió ~77 ms).</p>
      </Tarjeta>
      <Tarjeta className="space-y-3">
        <p className="text-sm font-bold text-slate-700">Umbrales del semáforo</p>
        <div className="grid grid-cols-2 gap-2">
          {CAMPOS_UMBRAL.map(({ k, t, paso }) => (
            <Campo key={k} etiqueta={t}>
              <input className={claseEntrada} type="number" step={paso ?? 1} value={a.umbrales[k]} onChange={(e) => cambiar({ umbrales: { ...a.umbrales, [k]: num(e.target.value) } })} />
            </Campo>
          ))}
        </div>
        <p className="text-xs text-slate-500">Valores de referencia: no existe un punto de corte validado universalmente para declarar aptitud. Ajústalos con tu médico ocupacional.</p>
        <Boton tipo="fantasma" onClick={() => cambiar({ ...AJUSTES_INICIALES, empresa: a.empresa, urlAppsScript: a.urlAppsScript, pin: a.pin })}>Restaurar valores recomendados</Boton>
      </Tarjeta>
      <Boton disabled={a.pin.length < 4} onClick={() => { onGuardar(a); setOk(true); }}>{ok ? "Guardado ✓" : "Guardar ajustes"}</Boton>
      <Boton tipo="peligro" onClick={() => { if (confirm("¿Borrar todas las evaluaciones guardadas en este celular? Las ya enviadas a Google Sheets se conservan allá.")) onBorrar(); }}>Borrar historial del celular</Boton>
    </div>
  );
}
