import { useState } from 'react';
import type {
  BusquedaRegistro,
  EtapaPaso,
  LoteRegistro,
  PasoRegistro,
  RegistroPaso,
} from '../admin/tipos';
import { formatearDuracion, formatearEntero, formatearHora } from './formato';

export interface RegistroRecalculoProps {
  /** Pasos con actividad, del más reciente al más antiguo. */
  pasos: readonly PasoRegistro[];
  /** El recálculo está corriendo: el paso más reciente sin duración sigue «en curso…». */
  enMarcha: boolean;
  /** El panel arranca abierto (solo se lee al montar). */
  abiertoInicial?: boolean;
  /** Error al leer el registro, en español. */
  error?: string | null;
  /** Se pide volver a leer el registro; sin esta función no hay botón. */
  onActualizar?: () => void;
}

const FUENTES: Record<string, string> = { openalex: 'OpenAlex', crossref: 'Crossref' };

const RESULTADOS_LOTE: Record<string, string> = {
  ok: 'correcto',
  reintento_agotado: 'reintentos agotados',
  sin_tiempo: 'sin tiempo',
  clave_rechazada: 'clave rechazada',
  sin_saldo: 'sin saldo',
  respuesta_invalida: 'respuesta inválida',
  error: 'error',
};

type EtiquetaPaso = 'en curso…' | 'cortado' | 'pausado' | 'hecho' | 'error' | 'pendiente';

/** Valor de `data-estado` para los colores de `.admin-estado`. */
const COLOR_ESTADO: Record<EtiquetaPaso, string | undefined> = {
  'en curso…': 'en_proceso',
  cortado: 'fallido',
  pausado: 'pausado',
  hecho: 'vigente',
  error: 'fallido',
  pendiente: undefined,
};

const numero = (valor: number | null) => (valor === null ? '—' : String(valor));

function plural(valor: number | null, singular: string, pluralTexto: string): string {
  if (valor === null) return '—';
  return `${valor} ${valor === 1 ? singular : pluralTexto}`;
}

/** Un paso iniciado sin duración está corriendo (solo el más reciente) o lo cortó la plataforma. */
function etiquetaDe(paso: PasoRegistro, esElMasReciente: boolean, enMarcha: boolean): EtiquetaPaso {
  if (paso.estado === 'pendiente' && paso.iniciadoEn !== null && paso.duracionMs === null) {
    return enMarcha && esElMasReciente ? 'en curso…' : 'cortado';
  }
  if (paso.estado === 'pendiente' && paso.registro?.resultado === 'pausado') return 'pausado';
  return paso.estado;
}

function lineaBusqueda(b: BusquedaRegistro): string {
  const fuente = b.fuente === null ? 'Fuente' : (FUENTES[b.fuente] ?? b.fuente);
  const detalle = b.error ?? plural(b.candidatos, 'candidato', 'candidatos');
  return `${fuente}: ${detalle} · ${formatearDuracion(b.ms)}`;
}

/** «tokens: 1.234 de entrada, 567 de salida, 4.000 de razonamiento»; `null` si no se informó ninguno. */
function textoTokens(l: LoteRegistro): string | null {
  const partes = [
    l.tokensEntrada === null ? null : `${formatearEntero(l.tokensEntrada)} de entrada`,
    l.tokensSalida === null ? null : `${formatearEntero(l.tokensSalida)} de salida`,
    l.tokensRazonamiento === null
      ? null
      : `${formatearEntero(l.tokensRazonamiento)} de razonamiento`,
  ].filter((parte) => parte !== null);
  return partes.length === 0 ? null : `tokens: ${partes.join(', ')}`;
}

function lineaLote(l: LoteRegistro): string {
  const cabecera = `Lote ${numero(l.n)}${l.tamano === null ? '' : ` (${l.tamano})`}`;
  const resultado = l.resultado === null ? '—' : (RESULTADOS_LOTE[l.resultado] ?? l.resultado);
  return [
    `${cabecera}: ${formatearDuracion(l.ms)}`,
    plural(l.reintentos, 'reintento', 'reintentos'),
    resultado,
    plural(l.aceptados, 'aceptado', 'aceptados'),
    textoTokens(l),
  ]
    .filter((parte) => parte !== null)
    .join(' · ');
}

/** Qué está haciendo el paso en curso, según la etapa y las tandas que ya terminaron. */
function textoEtapa(etapa: EtapaPaso | null, registro: RegistroPaso | null): string {
  switch (etapa) {
    case 'buscando':
      return 'Buscando candidatos en OpenAlex y Crossref…';
    case 'clasificando': {
      const terminadas = registro?.lotes.length ?? 0;
      const total = registro?.lotesTotal ?? null;
      return total === null
        ? 'Clasificando con la IA…'
        : `Clasificando con la IA: ${terminadas} de ${total} ${total === 1 ? 'tanda terminada' : 'tandas terminadas'}`;
    }
    case 'guardando':
      return 'Guardando las referencias aceptadas…';
    default:
      return 'Iniciando el paso…';
  }
}

function Cuerpo({
  paso,
  registro,
  enCurso,
}: {
  paso: PasoRegistro;
  registro: RegistroPaso | null;
  enCurso: boolean;
}) {
  const aceptados = registro?.aceptados ?? paso.aceptados;
  const mensaje = registro?.mensaje ?? paso.detalle;
  const meta = [
    `Intento ${numero(registro?.intento ?? null)}`,
    registro?.proveedor ? `Proveedor: ${registro.proveedor}` : null,
    `Inicio: ${formatearHora(paso.iniciadoEn)}`,
  ].filter((parte) => parte !== null);
  return (
    <div className="admin-registro__cuerpo">
      <p>{meta.join(' · ')}</p>
      {registro !== null && registro.busqueda.length > 0 && (
        <ul aria-label="Búsqueda de candidatos">
          {registro.busqueda.map((b, i) => (
            <li key={i}>{lineaBusqueda(b)}</li>
          ))}
        </ul>
      )}
      {registro !== null && registro.lotes.length > 0 && (
        <ul aria-label="Lotes de la IA">
          {registro.lotes.map((l, i) => (
            <li key={i}>{lineaLote(l)}</li>
          ))}
        </ul>
      )}
      <p>
        Aceptados: {aceptados} de {plural(paso.candidatos, 'candidato', 'candidatos')}
      </p>
      {/* Mientras el paso corre, el mensaje guardado es el provisional («El paso no terminó…»):
          no es un error, así que se muestra la etapa en su lugar (issue #45). */}
      {enCurso && (
        <p className="admin-ayuda" role="status">
          {textoEtapa(registro?.etapa ?? null, registro)}
        </p>
      )}
      {!enCurso && mensaje !== null && (
        <p className="admin-registro__mensaje" data-resultado={registro?.resultado ?? paso.estado}>
          {mensaje}
        </p>
      )}
      {!enCurso && registro === null && (
        <p className="admin-ayuda">Este paso no tiene registro detallado.</p>
      )}
    </div>
  );
}

/**
 * Panel plegable «Registro del recálculo» (issue #43): un paso por subfactor, del más reciente
 * al más antiguo, con su estado, duración, búsquedas, lotes de la IA y mensaje. Solo recibe
 * props y emite `onActualizar`: la lectura de `recalculo_paso` la hace la capa de datos.
 */
export function RegistroRecalculo({
  pasos,
  enMarcha,
  abiertoInicial = false,
  error = null,
  onActualizar,
}: RegistroRecalculoProps) {
  // Solo se lee al montar: así el panel no se cierra solo cuando cambia la fase del recálculo.
  const [abierto] = useState(abiertoInicial);
  return (
    <section className="admin-tarjeta admin-registro">
      <details open={abierto}>
        <summary>
          <span>Registro del recálculo</span>{' '}
          <span className="admin-ayuda">
            · {pasos.length} {pasos.length === 1 ? 'paso' : 'pasos'}
          </span>
        </summary>
        {onActualizar && (
          <div className="admin-registro__acciones">
            <button type="button" className="boton" onClick={onActualizar}>
              Actualizar
            </button>
          </div>
        )}
        {error !== null && (
          <div className="admin-aviso admin-aviso--error" role="alert">
            {error}
          </div>
        )}
        {pasos.length === 0 ? (
          <p className="admin-ayuda">Aún no hay pasos registrados.</p>
        ) : (
          <ol className="admin-registro__lista">
            {pasos.map((paso, i) => {
              const etiqueta = etiquetaDe(paso, i === 0, enMarcha);
              const estado = COLOR_ESTADO[etiqueta];
              return (
                <li key={paso.idSubfactor}>
                  <details open={i === 0}>
                    <summary>
                      <span className="admin-registro__nombre">
                        {paso.nombre ?? `Subfactor ${paso.idSubfactor}`}
                      </span>
                      <span
                        className="chip admin-estado"
                        {...(estado ? { 'data-estado': estado } : {})}
                      >
                        {etiqueta}
                      </span>
                      {paso.duracionMs !== null && (
                        <span className="admin-registro__duracion">
                          {formatearDuracion(paso.duracionMs)}
                        </span>
                      )}
                    </summary>
                    <Cuerpo
                      paso={paso}
                      registro={paso.registro}
                      enCurso={etiqueta === 'en curso…'}
                    />
                  </details>
                </li>
              );
            })}
          </ol>
        )}
      </details>
    </section>
  );
}
