/** Funciones puras de P-08..P-10: resultado del recálculo y textos de los cálculos. */
import { importanciaSugeridaPorFactor, type Importancia } from '../guios-core';
import type { CalculoResumen, ConteoCitas, FilaSugerida } from './tipos';

/**
 * RN-09 y RN-10 con guios-core (ADR-002): las 18 filas que guarda `guardar_resultado_calculo`.
 * La razón se guarda con 4 decimales (`numeric(8,4)`); IL se clasifica con la exacta.
 */
export function filasDesdeConteo(conteos: readonly ConteoCitas[]): FilaSugerida[] {
  return importanciaSugeridaPorFactor(conteos).factores.map((f) => ({
    idFactor: f.idFactor,
    subfactores: f.subfactores,
    citas: f.citas,
    razon: Math.round(f.r * 10_000) / 10_000,
    ie: f.ie,
    il: f.il,
    is: f.is,
  }));
}

export type Variacion = 'sube' | 'baja' | 'igual';

/** Variación de la IS nueva frente a la vigente; `null` si no hay con qué comparar. */
export function compararIS(nueva: Importancia, vigente: Importancia | undefined): Variacion | null {
  if (vigente === undefined) return null;
  if (nueva > vigente) return 'sube';
  if (nueva < vigente) return 'baja';
  return 'igual';
}

export function nombreCalculo(c: Pick<CalculoResumen, 'origen' | 'anioInicio' | 'anioFin'>) {
  return c.origen === 'tesis'
    ? 'Cálculo inicial de la tesis'
    : `Recálculo IA ${c.anioInicio}–${c.anioFin}`;
}

export function rangoCalculo(
  c: Pick<CalculoResumen, 'origen' | 'anioInicio' | 'anioFin' | 'etiquetaRango'>,
) {
  if (c.origen === 'tesis') return c.etiquetaRango ?? '—';
  return `${c.anioInicio}–${c.anioFin}`;
}

const TEXTO_ESTADO: Record<CalculoResumen['estado'], string> = {
  en_proceso: 'En proceso',
  pausado: 'Pausado',
  completado: 'Listo para revisar',
  publicado: 'Histórico',
  descartado: 'Descartado',
  fallido: 'Fallido',
};

export function textoEstado(c: Pick<CalculoResumen, 'estado' | 'vigente'>): string {
  return c.vigente ? 'Vigente' : TEXTO_ESTADO[c.estado];
}

/** En proceso, pausado o completado sin publicar: se continúa o se revisa en P-09. */
export function estaSinTerminar(c: Pick<CalculoResumen, 'estado'>): boolean {
  return c.estado === 'en_proceso' || c.estado === 'pausado' || c.estado === 'completado';
}

export function formatearFecha(iso: string): string {
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? '—' : fecha.toLocaleDateString('es-EC');
}

/** Número con coma decimal y hasta `decimales` cifras («4,125»). */
export function formatearNumero(valor: number, decimales = 2): string {
  return Number(valor.toFixed(decimales)).toString().replace('.', ',');
}
