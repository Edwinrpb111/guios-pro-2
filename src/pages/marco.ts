import { createContext, useContext } from 'react';

/** Acciones que el marco del decisor ofrece a las pantallas que contiene. */
export interface ValorMarco {
  /** Crea un borrador y abre su contexto. */
  crearEvaluacion: () => void;
  creandoEvaluacion: boolean;
}

export const ContextoMarco = createContext<ValorMarco | null>(null);

export function useMarco(): ValorMarco {
  const valor = useContext(ContextoMarco);
  if (!valor) throw new Error('useMarco debe usarse dentro de <MarcoDecisor>');
  return valor;
}
