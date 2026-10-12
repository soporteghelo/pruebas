// Piezas de interfaz reutilizables, pensadas para usar con el pulgar.
import type { ReactNode } from "react";
import type { Nivel } from "@/lib/types";

export const COLOR_NIVEL = ["bg-verde", "bg-ambar", "bg-rojo"] as const;
export const TEXTO_NIVEL = ["text-verde", "text-amber-600", "text-rojo"] as const;

export function Boton({ children, onClick, tipo = "primario", disabled, className = "", icono }: {
  children: ReactNode;
  onClick?: () => void;
  tipo?: "primario" | "secundario" | "fantasma" | "peligro";
  disabled?: boolean;
  className?: string;
  icono?: ReactNode;
}) {
  const estilos = {
    primario: "bg-marca-700 text-white active:bg-marca-800 shadow-sm",
    secundario: "bg-white text-slate-800 border border-slate-300 active:bg-slate-100",
    fantasma: "text-marca-700 active:bg-marca-50",
    peligro: "bg-rojo text-white active:bg-red-700",
  }[tipo];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-semibold transition disabled:opacity-40 ${estilos} ${className}`}
    >
      {icono}
      {children}
    </button>
  );
}

export function Tarjeta({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 ${className}`}>{children}</div>;
}

export function Campo({ etiqueta, children, ayuda }: { etiqueta: string; children: ReactNode; ayuda?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-slate-700">{etiqueta}</span>
      {children}
      {ayuda && <span className="mt-1 block text-xs text-slate-500">{ayuda}</span>}
    </label>
  );
}

export const claseEntrada =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base outline-none focus:border-marca-600 focus:ring-2 focus:ring-marca-100";

export function Opcion({ activo, onClick, children, className = "" }: { activo: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`min-h-12 rounded-xl border px-3 py-2.5 text-base font-medium transition ${
        activo ? "border-marca-700 bg-marca-700 text-white" : "border-slate-300 bg-white text-slate-800 active:bg-slate-100"
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function Progreso({ valor, className = "" }: { valor: number; className?: string }) {
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-slate-200 ${className}`}>
      <div className="h-full rounded-full bg-marca-600 transition-all duration-300" style={{ width: `${Math.round(Math.min(1, Math.max(0, valor)) * 100)}%` }} />
    </div>
  );
}

export function Punto({ nivel }: { nivel: Nivel | null }) {
  return <span className={`inline-block h-3 w-3 shrink-0 rounded-full ${nivel === null ? "bg-slate-300" : COLOR_NIVEL[nivel]}`} />;
}

export function Encabezado({ titulo, subtitulo, onAtras }: { titulo: string; subtitulo?: string; onAtras?: () => void }) {
  return (
    <div className="mb-4 flex items-start gap-2">
      {onAtras && (
        <button type="button" onClick={onAtras} aria-label="Atrás" className="-ml-2 rounded-lg p-2 text-slate-600 active:bg-slate-200">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
      )}
      <div>
        <h1 className="text-xl font-bold leading-tight text-slate-900">{titulo}</h1>
        {subtitulo && <p className="mt-0.5 text-sm text-slate-600">{subtitulo}</p>}
      </div>
    </div>
  );
}
