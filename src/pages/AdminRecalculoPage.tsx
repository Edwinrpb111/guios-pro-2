import { useCallback, useEffect } from 'react';
import { Link, useParams } from 'react-router';
import { useApiAdmin } from '../admin/contexto';
import { Aviso, MarcoAdmin } from '../admin/MarcoAdmin';
import { calcularProgreso, type ProgresoSubfactores } from '../admin/progresoRecalculo';
import { nombreCalculo, rangoCalculo } from '../admin/resultado';
import { TablaIS } from '../admin/TablaIS';
import { useCarga } from '../admin/useCarga';
import { useRecalculo, type EstadoRecalculo } from '../admin/useRecalculo';
import { formatearRestante } from '../components/formato';
import { RegistroRecalculo } from '../components/RegistroRecalculo';
import type { Importancia } from '../guios-core';

const TOTAL_FACTORES = 18;

/** Cada cuánto se vuelve a leer el registro mientras el recálculo corre (issue #45, S16e). */
const INTERVALO_LECTURA_MS = 2000;

interface PropsProgreso extends Pick<EstadoRecalculo, 'progreso'> {
  resumen: ProgresoSubfactores;
  corriendo: boolean;
}

/** Barra por subfactores (issue #45, S16f): cuántos van, cuál es el actual y cuánto falta. */
function Progreso({ progreso, resumen, corriendo }: PropsProgreso) {
  const { hechos, total, actual, restanteMs } = resumen;
  return (
    <div className="admin-progreso">
      <p>
        <b>
          {total === null
            ? `${hechos} subfactores procesados`
            : `${hechos} de ${total} subfactores procesados`}
        </b>
        <span className="admin-ayuda">
          {' '}
          · {progreso} de {TOTAL_FACTORES} factores procesados
        </span>
      </p>
      <div
        className="admin-progreso__barra"
        role="progressbar"
        aria-label="Subfactores procesados"
        aria-valuemin={0}
        aria-valuemax={total ?? Math.max(hechos, 1)}
        aria-valuenow={hechos}
      >
        <div
          className="admin-progreso__relleno"
          style={{ width: total === null || total === 0 ? '0%' : `${(hechos / total) * 100}%` }}
        />
      </div>
      {corriendo && actual !== null && <p>Ahora: {actual}</p>}
      {corriendo && (
        <p className="admin-ayuda">
          Tiempo restante: {restanteMs === null ? 'calculando…' : formatearRestante(restanteMs)}
        </p>
      )}
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

  // Registro de los pasos (issue #43): se vuelve a leer tras cada paso (`registroVersion`).
  const { registroVersion } = recalculo;
  const cargarRegistro = useCallback(
    () => api.registroPasos(id),
    // `registroVersion` no se usa dentro: solo cambia la identidad para que `useCarga` relea.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api, id, registroVersion],
  );
  const registro = useCarga(cargarRegistro);
  const corriendo = fase === 'ejecutando' || fase === 'pausando';

  // Consola en vivo (issue #45, S16e): mientras corre un paso se relee el registro cada 2 s.
  // Se detiene al terminar, pausar o salir de la pantalla (limpieza del efecto).
  // `sondear` no lanza otra lectura si la anterior sigue en vuelo (una lectura lenta no se pierde).
  const { sondear } = registro;
  useEffect(() => {
    if (!corriendo) return;
    const temporizador = setInterval(sondear, INTERVALO_LECTURA_MS);
    return () => clearInterval(temporizador);
  }, [corriendo, sondear]);

  const totalSubfactores = comparacion.datos
    ? comparacion.datos.catalogo.reduce((suma, factor) => suma + factor.subfactores.length, 0)
    : null;
  const resumen = calcularProgreso({
    pasos: registro.datos ?? [],
    totalSubfactores,
    pendientes: recalculo.pendientes,
    corriendo,
  });
  const verRegistro = calculo?.origen === 'ia' && fase !== 'cargando';

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

        {enMarcha && calculo && (
          <Progreso progreso={recalculo.progreso} resumen={resumen} corriendo={corriendo} />
        )}
        {fase === 'ejecutando' && (
          <p className="admin-ayuda">
            Buscando y clasificando artículos, un subfactor por vez. Si cierras esta pestaña, el
            recálculo se retoma desde lo pendiente al volver.
          </p>
        )}
        {fase === 'ejecutando' && mensaje && <Aviso>{mensaje}</Aviso>}
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

      {verRegistro && (
        <RegistroRecalculo
          pasos={registro.datos ?? []}
          enMarcha={corriendo}
          abiertoInicial={corriendo || fase === 'pausado' || fase === 'error'}
          error={registro.error}
          // En vivo no hay botón: la lectura es automática (S16e).
          {...(corriendo ? {} : { onActualizar: registro.recargar })}
        />
      )}
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
