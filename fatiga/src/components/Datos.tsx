// Paso 1: datos del trabajador y del turno.
import { useState } from "react";
import { duracionTexto, turnoDesde } from "@/lib/turno";
import type { Trabajador, Turno } from "@/lib/types";
import { Boton, Campo, claseEntrada, Encabezado, Opcion, Tarjeta } from "./ui";

const PRESETS = [
  { nombre: "Día", inicio: "07:00", fin: "19:00" },
  { nombre: "Noche", inicio: "19:00", fin: "07:00" },
  { nombre: "08–18", inicio: "08:00", fin: "18:00" },
];

export default function Datos({ inicial, empresa, onAtras, onListo }: {
  inicial: Trabajador | null;
  empresa: string;
  onAtras: () => void;
  onListo: (t: Trabajador, turno: Turno) => void;
}) {
  const [t, setT] = useState<Trabajador>(inicial ?? { nombre: "", dni: "", empresa, cargo: "", area: "" });
  const hora = new Date().getHours();
  const porDefecto = hora >= 13 || hora < 3 ? PRESETS[1] : PRESETS[0];
  const [inicio, setInicio] = useState(porDefecto.inicio);
  const [fin, setFin] = useState(porDefecto.fin);
  const [critica, setCritica] = useState<boolean | null>(null);

  const dniOk = /^[0-9A-Za-z]{8,12}$/.test(t.dni.trim());
  const nombreOk = t.nombre.trim().length >= 3;
  const turno = turnoDesde(inicio, fin, Date.now());
  const horas = (turno.fin - turno.inicio) / 3_600_000;
  const listo = dniOk && nombreOk && critica !== null && horas > 0 && horas <= 16;
  const set = (k: keyof Trabajador) => (e: React.ChangeEvent<HTMLInputElement>) => setT({ ...t, [k]: e.target.value });

  return (
    <div className="space-y-4">
      <Encabezado titulo="Tus datos" subtitulo="Paso 1 de 4" onAtras={onAtras} />
      <Tarjeta className="space-y-3">
        <Campo etiqueta="Apellidos y nombres">
          <input className={claseEntrada} value={t.nombre} onChange={set("nombre")} autoComplete="name" placeholder="Ej. Quispe Mamani, Ana" />
        </Campo>
        <Campo etiqueta="DNI o carné de extranjería">
          <input className={claseEntrada} value={t.dni} onChange={(e) => setT({ ...t, dni: e.target.value.replace(/\s/g, "") })} inputMode="numeric" maxLength={12} placeholder="8 dígitos" />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Empresa">
            <input className={claseEntrada} value={t.empresa} onChange={set("empresa")} />
          </Campo>
          <Campo etiqueta="Cargo">
            <input className={claseEntrada} value={t.cargo} onChange={set("cargo")} placeholder="Ej. Operador" />
          </Campo>
        </div>
        <Campo etiqueta="Área">
          <input className={claseEntrada} value={t.area} onChange={set("area")} placeholder="Ej. Mina, Planta, Transporte" />
        </Campo>
      </Tarjeta>

      <Tarjeta className="space-y-3">
        <p className="text-sm font-semibold text-slate-700">Tu turno de hoy</p>
        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map((p) => (
            <Opcion key={p.nombre} activo={inicio === p.inicio && fin === p.fin} onClick={() => { setInicio(p.inicio); setFin(p.fin); }} className="text-sm">
              {p.nombre}
            </Opcion>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Inicio">
            <input type="time" className={claseEntrada} value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </Campo>
          <Campo etiqueta="Fin">
            <input type="time" className={claseEntrada} value={fin} onChange={(e) => setFin(e.target.value)} />
          </Campo>
        </div>
        <p className="text-sm text-slate-600">Duración: <b>{duracionTexto(horas)}</b>{horas > 16 && <span className="text-rojo"> · revisa las horas</span>}</p>
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700">¿Vas a conducir u operar equipos en este turno?</p>
          <div className="grid grid-cols-2 gap-2">
            <Opcion activo={critica === true} onClick={() => setCritica(true)}>Sí</Opcion>
            <Opcion activo={critica === false} onClick={() => setCritica(false)}>No</Opcion>
          </div>
        </div>
      </Tarjeta>

      <Boton disabled={!listo} onClick={() => onListo({ ...t, nombre: t.nombre.trim(), dni: t.dni.trim().toUpperCase() }, { ...turno, tareaCritica: !!critica })}>
        Continuar
      </Boton>
      {!listo && <p className="text-center text-xs text-slate-500">Completa nombre, DNI y la pregunta de conducción u operación.</p>}
    </div>
  );
}
