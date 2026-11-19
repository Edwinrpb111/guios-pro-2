/** Reglas de presentación de la trazabilidad de referencias (issue #46, P-10). */

interface ConConfianza {
  confianza: number | null;
}

/** El dato llega de la base: si falta (nulo o ausente) no se muestra ni se ordena por él. */
export function tieneConfianza(confianza: number | null | undefined): confianza is number {
  return typeof confianza === 'number';
}

/** De mayor a menor confianza; las nulas al final y, en empate, el orden original. */
export function ordenarPorConfianza<T extends ConConfianza>(lista: readonly T[]): T[] {
  return lista
    .map((elemento, indice) => ({ elemento, indice }))
    .sort((a, b) => {
      const ca = a.elemento.confianza;
      const cb = b.elemento.confianza;
      if (!tieneConfianza(ca)) return tieneConfianza(cb) ? 1 : a.indice - b.indice;
      if (!tieneConfianza(cb)) return -1;
      return cb - ca || a.indice - b.indice;
    })
    .map(({ elemento }) => elemento);
}

/** Cálculo previo a la trazabilidad: ninguna aceptada con confianza y ningún rechazado. */
export function sinDatosDeClasificacion(
  aceptadas: readonly ConConfianza[],
  rechazadas: readonly ConConfianza[],
): boolean {
  return rechazadas.length === 0 && !aceptadas.some((r) => tieneConfianza(r.confianza));
}
