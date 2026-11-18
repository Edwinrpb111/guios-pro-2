import { useCallback } from 'react';
import { Link, useParams } from 'react-router';
import { useApiAdmin } from '../admin/contexto';
import { Aviso, MarcoAdmin } from '../admin/MarcoAdmin';
import { nombreCalculo, rangoCalculo } from '../admin/resultado';
import { TablaIS } from '../admin/TablaIS';
import { useCarga } from '../admin/useCarga';
import { useRecalculo, type EstadoRecalculo } from '../admin/useRecalculo';
import type { Importancia } from '../guios-core';

const TOTAL_FACTORES = 18;

function Progreso({ progreso, pendientes }: Pick<EstadoRecalculo, 'progreso' | 'pendientes'>) {
  return (
    <div className="admin-progreso">
      <p>
        <b>
          {progreso} de {TOTAL_FACTORES} factores procesados
        </b>
        {pendientes !== null && pendientes > 0 && (
          <span className="admin-ayuda"> · quedan {pendientes} subfactores</span>
        )}
      </p>
      <div
        className="admin-progreso__barra"
        role="progressbar"
        aria-label="Factores procesados"
        aria-valuemin={0}
        aria-valuemax={TOTAL_FACTORES}
        aria-valuenow={progreso}
      >
        <div
          className="admin-progreso__relleno"
          style={{ width: `${(progreso / TOTAL_FACTORES) * 100}%` }}
        />
      </div>
    </div>
  );
}

function textoCierre({ calculo, mensaje }: EstadoRecalculo): string {
  switch (calculo?.estado) {
    case 'publicado':
      return calculo.vigente
        ? 'Publicado como vigente. Las evaluaciones nuevas usarán esta IS; las anteriores conservan la suya.'
        : 'Publicado; hoy forma parte del histórico.';
    case 'descartado':
      return 'Este recálculo fue descartado. Sigue vigente el cálculo anterior.';
    default:
      return `Este recálculo falló${mensaje ? `: ${mensaje}` : '.'} Sigue vigente el cálculo anterior.`;
  }
}

function VistaRecalculo({ id }: { id: number }) {
  const api = useApiAdmin();
  const recalculo = useRecalculo(id);
  const { fase, calculo, mensaje, filas, ocupado } = recalculo;

  // Para comparar: el cálculo vigente al abrir la pantalla y el catálogo (nombres de factores).
  const cargarComparacion = useCallback(async () => {
    const [calculos, catalogo] = await Promise.all([api.listarCalculos(), api.catalogo()]);
    const vigente = calculos.find((c) => c.vigente && c.id !== id);
    const filasVigente = vigente ? await api.filasSugeridas(vigente.id) : [];
    return {
      catalogo,
      vigente: new Map<number, Importancia>(filasVigente.map((f) => [f.idFactor, f.is])),
    };
  }, [api, id]);
  const comparacion = useCarga(cargarComparacion);

  const enMarcha = ['ejecutando', 'pausando', 'pausado', 'guardando', 'error'].includes(fase);

  return (
    <MarcoAdmin
      titulo={calculo ? nombreCalculo(calculo) : 'Recálculo'}
      {...(calculo
        ? { descripcion: `${rangoCalculo(calculo)} · ${calculo.basesDatos ?? '—'}` }
        : {})}
    >
      <section className="admin-tarjeta">
        {fase === 'cargando' && <p>Cargando el recálculo…</p>}
        {fase === 'no_encontrado' && <p>No existe el cálculo {id}.</p>}

        {enMarcha && calculo && <Progreso {...recalculo} />}
        {fase === 'ejecutando' && (
          <p className="admin-ayuda">
            Buscando y clasificando artículos, un subfactor por vez. Si cierras esta pestaña, el
            recálculo se retoma desde lo pendiente al volver.
          </p>
        )}
        {fase === 'pausando' && <p>Pausando al terminar el subfactor en curso…</p>}
        {fase === 'pausado' && <Aviso>{mensaje ?? 'El recálculo está pausado.'}</Aviso>}
        {fase === 'guardando' && (
          <p>Calculando IL con los cuartiles de las 18 razones rᵢ e IS = intersección(IE, IL)…</p>
        )}
        {fase === 'error' && <Aviso tipo="error">{mensaje}</Aviso>}

        {(fase === 'revision' || (fase === 'cerrado' && filas.length > 0)) && comparacion.datos && (
          <TablaIS
            titulo="Resultado del recálculo"
            filas={filas}
            catalogo={comparacion.datos.catalogo}
            {...(fase === 'revision' ? { vigente: comparacion.datos.vigente } : {})}
          />
        )}
        {comparacion.error && fase === 'revision' && (
          <Aviso tipo="error">{comparacion.error}</Aviso>
        )}
        {fase === 'revision' && mensaje && <Aviso tipo="error">{mensaje}</Aviso>}
        {fase === 'cerrado' && <p className="admin-cierre">{textoCierre(recalculo)}</p>}

        <div className="admin-formulario__botones">
          {fase === 'revision' && (
            <span className="admin-ayuda admin-crece">
              IL se calcula con los cuartiles de las 18 razones rᵢ; IS = intersección de IE = 3 e
              IL. Los cálculos anteriores se conservan.
            </span>
          )}
          {(fase === 'ejecutando' || fase === 'pausando') && (
            <button
              type="button"
              className="boton"
              onClick={recalculo.pausar}
              disabled={fase === 'pausando'}
            >
              Pausar
            </button>
          )}
          {(fase === 'pausado' || fase === 'error' || fase === 'revision') && calculo && (
            <button
              type="button"
              className="boton"
              onClick={() => void recalculo.descartar()}
              disabled={ocupado}
            >
              Descartar
            </button>
          )}
          {fase === 'pausado' && (
            <button type="button" className="boton boton--primario" onClick={recalculo.reanudar}>
              Reanudar
            </button>
          )}
          {fase === 'error' && (
            <button type="button" className="boton boton--primario" onClick={recalculo.reanudar}>
              Reintentar
            </button>
          )}
          {fase === 'revision' && (
            <button
              type="button"
              className="boton boton--primario"
              onClick={() => void recalculo.publicar()}
              disabled={ocupado}
            >
              Publicar como vigente
            </button>
          )}
          {(fase === 'cerrado' || fase === 'no_encontrado') && (
            <Link className="boton" to="/admin/sugerida">
              Volver a Importancia sugerida
            </Link>
          )}
        </div>
      </section>
    </MarcoAdmin>
  );
}

/** P-09 (progreso y revisión): `/admin/sugerida/:id`. */
export function AdminRecalculoPage() {
  const { id } = useParams();
  const numero = Number(id);
  if (!Number.isInteger(numero) || numero < 1) {
    return (
      <MarcoAdmin titulo="Recálculo">
        <p>No existe el cálculo {id}.</p>
        <Link to="/admin/sugerida">Volver a Importancia sugerida</Link>
      </MarcoAdmin>
    );
  }
  // `key`: al cambiar de cálculo el estado empieza de cero.
  return <VistaRecalculo key={numero} id={numero} />;
}
