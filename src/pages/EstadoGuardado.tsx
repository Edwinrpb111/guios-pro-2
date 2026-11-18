import type { EstadoGuardado as Estado } from '../evaluacion/useColaDeGuardado';

const TEXTOS: Record<Estado, string> = {
  inactivo: '',
  guardando: 'Guardando…',
  guardado: 'Cambios guardados',
  error: 'No se pudo guardar',
};

/** Indicador del autoguardado, anunciado a lectores de pantalla (`role="status"`). */
export function EstadoGuardado({ estado }: { estado: Estado }) {
  return (
    <span role="status" className="estado-guardado">
      {TEXTOS[estado]}
    </span>
  );
}
