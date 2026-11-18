import { IMPORTANCIA, type Importancia } from '../guios-core';
import { compararIS, formatearNumero, type Variacion } from './resultado';
import type { FactorCatalogo, FilaSugerida } from './tipos';

const TEXTO_VARIACION: Record<Variacion, { simbolo: string; texto: string }> = {
  sube: { simbolo: '▲', texto: 'la nueva es mayor' },
  baja: { simbolo: '▼', texto: 'la nueva es menor' },
  igual: { simbolo: '=', texto: 'sin cambio' },
};

export interface TablaISProps {
  filas: readonly FilaSugerida[];
  catalogo: readonly FactorCatalogo[];
  /** IS del cálculo vigente por id de factor: agrega la columna de comparación (P-09). */
  vigente?: ReadonlyMap<number, Importancia>;
  /** Si se indica, cada factor es un botón (P-10: ver sus referencias). */
  onSeleccionarFactor?: (idFactor: number) => void;
  titulo: string;
}

function Nivel({ valor }: { valor: Importancia }) {
  return (
    <span className="admin-nivel" data-nivel={valor}>
      {valor} · {IMPORTANCIA[valor]}
    </span>
  );
}

/** Tabla de n, cᵢ, rᵢ, IL e IS por factor, en el orden del catálogo. */
export function TablaIS({ filas, catalogo, vigente, onSeleccionarFactor, titulo }: TablaISProps) {
  const porFactor = new Map(filas.map((f) => [f.idFactor, f]));
  const ordenadas = catalogo.flatMap((factor) => {
    const fila = porFactor.get(factor.id);
    return fila ? [{ factor, fila }] : [];
  });

  return (
    <table className="admin-tabla">
      <caption className="solo-lectores">{titulo}</caption>
      <thead>
        <tr>
          <th scope="col">Factor</th>
          <th scope="col">n</th>
          <th scope="col">cᵢ</th>
          <th scope="col">rᵢ = cᵢ/n</th>
          <th scope="col">IL</th>
          <th scope="col">{vigente ? 'IS nueva' : 'IS'}</th>
          {vigente && <th scope="col">IS vigente</th>}
        </tr>
      </thead>
      <tbody>
        {ordenadas.map(({ factor, fila }) => {
          const anterior = vigente?.get(factor.id);
          const variacion = vigente ? compararIS(fila.is, anterior) : null;
          return (
            <tr key={factor.id}>
              <th scope="row" data-l="Factor">
                {onSeleccionarFactor ? (
                  <button
                    type="button"
                    className="admin-enlace"
                    onClick={() => onSeleccionarFactor(factor.id)}
                  >
                    {factor.nombre}
                  </button>
                ) : (
                  factor.nombre
                )}
              </th>
              <td data-l="n">{fila.subfactores}</td>
              <td data-l="cᵢ">{fila.citas}</td>
              <td data-l="rᵢ">{formatearNumero(fila.razon, 4)}</td>
              <td data-l="IL">{fila.il}</td>
              <td data-l={vigente ? 'IS nueva' : 'IS'}>
                <Nivel valor={fila.is} />
              </td>
              {vigente && (
                <td data-l="IS vigente">
                  {anterior === undefined ? (
                    '—'
                  ) : (
                    <>
                      <Nivel valor={anterior} />{' '}
                      {variacion && (
                        <span className="admin-variacion" data-variacion={variacion}>
                          <span aria-hidden="true">{TEXTO_VARIACION[variacion].simbolo}</span>{' '}
                          {TEXTO_VARIACION[variacion].texto}
                        </span>
                      )}
                    </>
                  )}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
