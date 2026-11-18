import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { HistorialTabla, type FilaHistorial } from '../components/HistorialTabla';
import type { ResumenEvaluacion } from '../datos/tipos';
import { useCalculoVigente, useCatalogo, useHistorial } from '../evaluacion/consultas';
import {
  filtrarHistorial,
  formatearFecha,
  porcentajeAvance,
  rutaDeContinuacion,
  type FiltroHistorial,
} from '../evaluacion/historial';
import { nombreDeUsuario, primerNombre } from '../evaluacion/usuario';
import { MarcoDecisor } from './MarcoDecisor';
import { useMarco } from './marco';

/** P-02: inicio e historial de evaluaciones (HU-02). */
export function InicioPage() {
  return (
    <MarcoDecisor>
      <ContenidoInicio />
    </MarcoDecisor>
  );
}

function ContenidoInicio() {
  const { usuario } = useAuth();
  const { crearEvaluacion, creandoEvaluacion } = useMarco();
  const navegar = useNavigate();
  const historial = useHistorial();
  const catalogo = useCatalogo();
  const vigente = useCalculoVigente();
  const [filtro, setFiltro] = useState<FiltroHistorial>({ estado: 'todas', texto: '' });

  const evaluaciones: readonly ResumenEvaluacion[] = useMemo(
    () => historial.data ?? [],
    [historial.data],
  );
  const totalFactores = useMemo(
    () => catalogo.data?.dimensiones.reduce((suma, d) => suma + d.factores.length, 0) ?? 0,
    [catalogo.data],
  );
  const visibles = useMemo(() => filtrarHistorial(evaluaciones, filtro), [evaluaciones, filtro]);
  const filas: FilaHistorial[] = useMemo(
    () =>
      visibles.map((e) => ({
        id: e.id,
        titulo: e.titulo,
        detalle: e.software
          ? [`${e.software.nombre} ${e.software.version}`.trim(), e.software.licencia]
              .filter(Boolean)
              .join(' · ')
          : '',
        organizacion: e.organizacion ?? '—',
        fecha: formatearFecha(e.fecha),
        estado: e.estado,
        avance: catalogo.data ? porcentajeAvance(e, catalogo.data) : 0,
        recomendacion: e.estado === 'finalizada' ? e.codigo : null,
      })),
    [visibles, catalogo.data],
  );

  const finalizadas = evaluaciones.filter((e) => e.estado === 'finalizada').length;
  const cargando = historial.isPending || catalogo.isPending;
  const fallo = historial.isError || catalogo.isError;

  const abrir = (id: number) => {
    const evaluacion = evaluaciones.find((e) => e.id === id);
    if (evaluacion) void navegar(rutaDeContinuacion(evaluacion, totalFactores));
  };

  return (
    <>
      <div className="cabecera-pagina">
        <div>
          <h1>Hola, {primerNombre(nombreDeUsuario(usuario))}</h1>
          <p>Retoma una evaluación o inicia una nueva.</p>
        </div>
        <button
          type="button"
          className="boton boton--acento"
          onClick={crearEvaluacion}
          disabled={creandoEvaluacion}
        >
          <span aria-hidden="true">＋ </span>Nueva evaluación
        </button>
      </div>

      <div className="rejilla rejilla--4 inicio__resumen">
        <div className="tarjeta tarjeta--relleno kpi">
          <div className="kpi__titulo">Evaluaciones</div>
          <div className="kpi__valor">{evaluaciones.length}</div>
        </div>
        <div className="tarjeta tarjeta--relleno kpi">
          <div className="kpi__titulo">Finalizadas</div>
          <div className="kpi__valor">{finalizadas}</div>
        </div>
        <div className="tarjeta tarjeta--relleno kpi">
          <div className="kpi__titulo">En curso</div>
          <div className="kpi__valor">{evaluaciones.length - finalizadas}</div>
        </div>
        <div className="tarjeta tarjeta--relleno kpi">
          <div className="kpi__titulo">Importancia sugerida vigente</div>
          {vigente.data ? (
            <>
              <div className="kpi__valor kpi__valor--texto">{vigente.data.nombre}</div>
              <div className="ayuda-texto">
                {vigente.data.rango} · {new Date(vigente.data.fecha).getFullYear()}
              </div>
            </>
          ) : (
            <div className="kpi__valor kpi__valor--texto">
              {vigente.isPending ? 'Cargando…' : 'Sin cálculo vigente'}
            </div>
          )}
        </div>
      </div>

      <section className="tarjeta" aria-labelledby="titulo-historial">
        <div className="tarjeta__cabecera">
          <h2 id="titulo-historial">Historial de evaluaciones</h2>
          <span className="ayuda-texto">Solo tú puedes ver tus evaluaciones</span>
        </div>
        <div className="historial__filtros">
          <label>
            Estado
            <select
              value={filtro.estado}
              onChange={(e) =>
                setFiltro({ ...filtro, estado: e.target.value as FiltroHistorial['estado'] })
              }
            >
              <option value="todas">Todas</option>
              <option value="en_curso">En curso</option>
              <option value="finalizada">Finalizadas</option>
            </select>
          </label>
          <input
            type="search"
            aria-label="Buscar"
            placeholder="Buscar por título, software u organización"
            value={filtro.texto}
            onChange={(e) => setFiltro({ ...filtro, texto: e.target.value })}
          />
        </div>
        {cargando && <p className="historial__vacio">Cargando el historial…</p>}
        {fallo && (
          <div role="alert" className="alerta alerta--error">
            No se pudo cargar el historial.{' '}
            <button
              type="button"
              className="boton boton--chico"
              onClick={() => {
                void historial.refetch();
                void catalogo.refetch();
              }}
            >
              Reintentar
            </button>
          </div>
        )}
        {!cargando && !fallo && evaluaciones.length === 0 && (
          <p className="historial__vacio">Aún no tienes evaluaciones. Crea la primera.</p>
        )}
        {!cargando && !fallo && evaluaciones.length > 0 && (
          <HistorialTabla
            filas={filas}
            textoVacio="Ninguna evaluación coincide con el filtro."
            onAbrir={abrir}
          />
        )}
      </section>
    </>
  );
}
