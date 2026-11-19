import { useCallback, useEffect, useId, useState } from 'react';
import { useApiAdmin } from './contexto';
import {
  formatearFecha,
  formatearNumero,
  nombreCalculo,
  rangoCalculo,
  textoEstado,
} from './resultado';
import { ReferenciasFactor } from './ReferenciasFactor';
import { TablaIS } from './TablaIS';
import type { CalculoResumen, ReferenciaCalculo, ReferenciaRechazada } from './tipos';
import { useCarga } from './useCarga';

export interface DetalleCalculoPanelProps {
  id: number;
  onCerrar: () => void;
}

function Parametros({ calculo }: { calculo: CalculoResumen }) {
  const p = calculo.parametros;
  if (calculo.origen !== 'ia' || p === null) return null;
  const filas: [string, string | undefined][] = [
    ['Años', p.anio_inicio !== undefined ? `${p.anio_inicio}–${p.anio_fin}` : undefined],
    ['Fuentes', p.fuentes?.join(', ')],
    ['Umbral de confianza', p.umbral !== undefined ? formatearNumero(p.umbral, 2) : undefined],
    ['Proveedor de IA', p.proveedor_llm],
    ['Modelo', p.modelo],
    ['Versión del prompt', p.version_prompt],
    ['Máximo de candidatos', p.max_candidatos?.toString()],
  ];
  return (
    <section aria-label="Parámetros del cálculo" className="admin-parametros">
      <h3>Parámetros</h3>
      <dl>
        {filas.map(([nombre, valor]) => (
          <div key={nombre}>
            <dt>{nombre}</dt>
            <dd>{valor ?? '—'}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** P-10: detalle de un cálculo de IS en un panel lateral sobre P-08 (RF-12, HU-10). */
export function DetalleCalculoPanel({ id, onCerrar }: DetalleCalculoPanelProps) {
  const api = useApiAdmin();
  const idTitulo = useId();
  const cargar = useCallback(async () => {
    const [calculo, filas, catalogo] = await Promise.all([
      api.obtenerCalculo(id),
      api.filasSugeridas(id),
      api.catalogo(),
    ]);
    return { calculo, filas, catalogo };
  }, [api, id]);
  const { datos, error, cargando } = useCarga(cargar);

  const [idFactor, setIdFactor] = useState<number | null>(null);
  const [trazabilidad, setTrazabilidad] = useState<{
    referencias: ReferenciaCalculo[];
    rechazadas: ReferenciaRechazada[];
  } | null>(null);
  const [errorReferencias, setErrorReferencias] = useState<string | null>(null);

  useEffect(() => {
    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') onCerrar();
    };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [onCerrar]);

  const verReferencias = (factor: number) => {
    setIdFactor(factor);
    if (trazabilidad !== null) return;
    Promise.all([api.referencias(id), api.rechazadas(id)]).then(
      ([referencias, rechazadas]) => setTrazabilidad({ referencias, rechazadas }),
      (e: unknown) =>
        setErrorReferencias(
          e instanceof Error ? e.message : 'No se pudieron leer las referencias.',
        ),
    );
  };

  const calculo = datos?.calculo ?? null;
  const factor = datos?.catalogo.find((f) => f.id === idFactor);

  return (
    <>
      <div className="admin-velo" aria-hidden="true" onClick={onCerrar} />
      <aside className="admin-panel" role="dialog" aria-modal="true" aria-labelledby={idTitulo}>
        <div className="admin-panel__cabecera">
          <div>
            <p className="admin-ayuda">Detalle del cálculo</p>
            <h2 id={idTitulo}>{calculo ? nombreCalculo(calculo) : `Cálculo ${id}`}</h2>
            {calculo && (
              <p className="admin-ayuda">
                {rangoCalculo(calculo)} · {calculo.basesDatos ?? '—'} ·{' '}
                {formatearFecha(calculo.fecha)} · {textoEstado(calculo)}
              </p>
            )}
          </div>
          <button type="button" className="boton boton--fantasma" onClick={onCerrar} autoFocus>
            <span aria-hidden="true">✕</span>
            <span className="solo-lectores">Cerrar detalle</span>
          </button>
        </div>

        {cargando && <p>Cargando el cálculo…</p>}
        {error && (
          <p role="alert" className="admin-aviso admin-aviso--error">
            {error}
          </p>
        )}
        {datos && calculo === null && <p>No existe el cálculo {id}.</p>}
        {datos && calculo && (
          <>
            <Parametros calculo={calculo} />
            {datos.filas.length === 0 ? (
              <p>Este cálculo todavía no tiene resultados ({textoEstado(calculo)}).</p>
            ) : (
              <TablaIS
                titulo={`IS de ${nombreCalculo(calculo)}`}
                filas={datos.filas}
                catalogo={datos.catalogo}
                {...(calculo.origen === 'ia' ? { onSeleccionarFactor: verReferencias } : {})}
              />
            )}
            {calculo.origen === 'tesis' ? (
              <p className="admin-ayuda">
                Valores de la Tabla 5.3 de la tesis (revisión sistemática de la literatura).
              </p>
            ) : factor === undefined ? (
              datos.filas.length > 0 && (
                <p className="admin-ayuda">Selecciona un factor para ver sus referencias.</p>
              )
            ) : errorReferencias ? (
              <p role="alert">{errorReferencias}</p>
            ) : trazabilidad === null ? (
              <p>Cargando las referencias…</p>
            ) : (
              <ReferenciasFactor
                factor={factor}
                referencias={trazabilidad.referencias}
                rechazadas={trazabilidad.rechazadas}
              />
            )}
          </>
        )}
      </aside>
    </>
  );
}
