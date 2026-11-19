import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { formatearNumero } from './resultado';
import type { FactorCatalogo, ReferenciaCalculo, ReferenciaRechazada } from './tipos';
import { ordenarPorConfianza, sinDatosDeClasificacion, tieneConfianza } from './trazabilidad';

type Pestana = 'aceptados' | 'rechazados';

const PESTANAS: readonly { clave: Pestana; texto: string }[] = [
  { clave: 'aceptados', texto: 'Aceptados' },
  { clave: 'rechazados', texto: 'Rechazados' },
];

type Articulo = ReferenciaCalculo | ReferenciaRechazada;

/** Un artículo con su confianza y la evidencia de la IA (texto plano: React lo escapa). */
function ArticuloTraza({ articulo }: { articulo: Articulo }) {
  return (
    <li>
      <h4 className="admin-referencias__titulo">{articulo.titulo}</h4>
      <span className="admin-ayuda">
        {articulo.anio} · {articulo.base ?? 'sin base'} ·{' '}
        <a href={`https://doi.org/${articulo.doi}`} target="_blank" rel="noopener noreferrer">
          DOI {articulo.doi}
        </a>
        {tieneConfianza(articulo.confianza) && (
          <>
            {' · '}
            <b>Confianza {formatearNumero(articulo.confianza, 2)}</b>
          </>
        )}
      </span>
      {typeof articulo.evidencia === 'string' && articulo.evidencia !== '' && (
        <span className="admin-referencias__evidencia">{articulo.evidencia}</span>
      )}
    </li>
  );
}

function Subfactor({
  numero,
  enunciado,
  aceptadas,
  rechazadas,
}: {
  numero: number;
  enunciado: string;
  aceptadas: readonly ReferenciaCalculo[];
  rechazadas: readonly ReferenciaRechazada[];
}) {
  const id = useId();
  const [activa, setActiva] = useState<Pestana>('aceptados');
  const botones = useRef<(HTMLButtonElement | null)[]>([]);

  /** Patrón de pestañas de WAI-ARIA: flechas, Inicio y Fin cambian de pestaña y la enfocan. */
  function alTeclear(evento: KeyboardEvent<HTMLButtonElement>) {
    const actual = PESTANAS.findIndex((p) => p.clave === activa);
    const total = PESTANAS.length;
    const destinos: Record<string, number> = {
      ArrowRight: (actual + 1) % total,
      ArrowLeft: (actual - 1 + total) % total,
      Home: 0,
      End: total - 1,
    };
    const destino = destinos[evento.key];
    const pestana = destino === undefined ? undefined : PESTANAS[destino];
    if (destino === undefined || !pestana) return;
    evento.preventDefault();
    setActiva(pestana.clave);
    botones.current[destino]?.focus();
  }

  const listas: Record<Pestana, readonly Articulo[]> = {
    aceptados: ordenarPorConfianza(aceptadas),
    rechazados: ordenarPorConfianza(rechazadas),
  };
  const vacio: Record<Pestana, string> = {
    aceptados: 'Sin artículos aceptados para este subfactor.',
    rechazados: 'Sin candidatos rechazados registrados para este subfactor.',
  };

  return (
    <section aria-label={`Subfactor ${numero}`} className="admin-referencias__subfactor">
      <p>
        <b>Subfactor {numero}:</b> {enunciado} ({aceptadas.length} aceptados, {rechazadas.length}{' '}
        rechazados)
      </p>
      <div
        role="tablist"
        aria-label={`Referencias del subfactor ${numero}`}
        className="admin-pestanas"
      >
        {PESTANAS.map((pestana, indice) => {
          const seleccionada = pestana.clave === activa;
          return (
            <button
              key={pestana.clave}
              ref={(nodo) => {
                botones.current[indice] = nodo;
              }}
              type="button"
              role="tab"
              id={`${id}-pestana-${pestana.clave}`}
              aria-selected={seleccionada}
              aria-controls={`${id}-panel-${pestana.clave}`}
              tabIndex={seleccionada ? 0 : -1}
              className="admin-pestanas__pestana"
              onClick={() => setActiva(pestana.clave)}
              onKeyDown={alTeclear}
            >
              {pestana.texto}
            </button>
          );
        })}
      </div>
      {PESTANAS.map((pestana) => {
        const lista = listas[pestana.clave];
        return (
          <div
            key={pestana.clave}
            role="tabpanel"
            id={`${id}-panel-${pestana.clave}`}
            aria-labelledby={`${id}-pestana-${pestana.clave}`}
            hidden={pestana.clave !== activa}
          >
            {lista.length === 0 ? (
              <p className="admin-ayuda">{vacio[pestana.clave]}</p>
            ) : (
              <ul>
                {lista.map((articulo) => (
                  <ArticuloTraza key={articulo.id} articulo={articulo} />
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}

/**
 * P-10: referencias de un factor por subfactor, con pestañas «Aceptados» y «Rechazados»
 * ordenadas por confianza, la evidencia de la IA y el DOI (issue #46, S17c).
 * Recibe todas las referencias del cálculo: «sin datos de clasificación» se decide sobre
 * el cálculo entero (S17d), no sobre el factor.
 */
export function ReferenciasFactor({
  factor,
  referencias,
  rechazadas,
}: {
  factor: FactorCatalogo;
  referencias: readonly ReferenciaCalculo[];
  rechazadas: readonly ReferenciaRechazada[];
}) {
  const sinDatos = sinDatosDeClasificacion(referencias, rechazadas);
  return (
    <section aria-label={`Referencias de ${factor.nombre}`} className="admin-referencias">
      <h3>Referencias de {factor.nombre}</h3>
      {sinDatos && (
        <p className="admin-aviso">
          Cálculo sin datos de clasificación: es anterior al registro de la confianza y la evidencia
          de la IA, por eso solo se listan los artículos aceptados.
        </p>
      )}
      {factor.subfactores.map((sub, k) => (
        <Subfactor
          key={sub.id}
          numero={k + 1}
          enunciado={sub.enunciado}
          aceptadas={referencias.filter((r) => r.idSubfactor === sub.id)}
          rechazadas={rechazadas.filter((r) => r.idSubfactor === sub.id)}
        />
      ))}
    </section>
  );
}
