// POST /functions/v1/recalculo-paso (BRIEF §11.3, §13.2): procesa UN subfactor pendiente por
// invocación. Los planes Free limitan cada invocación (150 s, 2 s de CPU), así que el recálculo
// no es una función larga: la pantalla P-09 la invoca hasta que no queden pendientes.
import type { UsuarioVerificado } from './auth.ts';
import { buscarYClasificar } from './busqueda.ts';
import { modeloDelProveedor } from './configuracion.ts';
import type { Dependencias } from './dependencias.ts';
import {
  ErrorApi,
  ErrorPasoSinTiempo,
  ErrorProveedorNoDisponible,
  ErrorRespuestaInvalida,
} from './errores.ts';
import type { Resultado } from './http.ts';
import { PRESUPUESTO_PASO_MS, PresupuestoPaso } from './presupuesto.ts';
import {
  MENSAJE_INESPERADO,
  RegistradorPaso,
  type RegistroPaso,
  type ResultadoPaso,
} from './registro.ts';
import type { Calculo, Paso, Repositorio, SubfactorCatalogo } from './repositorio.ts';
import { BASES_VALIDAS, type NombreBase } from './tipos.ts';

/** Factores (0..18) cuyos subfactores tienen todos el paso `hecho`. */
export function calcularProgreso(catalogo: SubfactorCatalogo[], pasos: Paso[]): number {
  const hechos = new Set(pasos.filter((p) => p.estado === 'hecho').map((p) => p.id_subfactor));
  const completos = new Map<number, boolean>();
  for (const sub of catalogo) {
    completos.set(
      sub.id_factor,
      (completos.get(sub.id_factor) ?? true) && hechos.has(sub.id_subfactor),
    );
  }
  return [...completos.values()].filter(Boolean).length;
}

function leerIdCalculo(cuerpo: unknown): number {
  const id = (cuerpo as { id_calculo?: unknown } | null)?.id_calculo;
  if (typeof id !== 'number' || !Number.isInteger(id) || id < 1) {
    throw new ErrorApi(
      400,
      'solicitud_invalida',
      'El campo id_calculo debe ser un entero positivo.',
    );
  }
  return id;
}

function fuentesDe(calculo: Calculo): NombreBase[] {
  const fuentes = calculo.parametros?.fuentes;
  if (
    !Array.isArray(fuentes) ||
    fuentes.length === 0 ||
    !fuentes.every((f) => BASES_VALIDAS.includes(f as NombreBase))
  ) {
    throw new ErrorApi(
      409,
      'calculo_invalido',
      'El cálculo no tiene fuentes válidas guardadas. Inicia uno nuevo.',
    );
  }
  return fuentes as NombreBase[];
}

/** Mensaje de pausa cuando el paso agota su tope de tiempo (código `paso_sin_tiempo`). */
function mensajeSinTiempo(subfactor: SubfactorCatalogo): string {
  return `El subfactor «${subfactor.enunciado}» tardó más de lo permitido (${PRESUPUESTO_PASO_MS / 1000} s). Reduce el máximo de candidatos o sube las llamadas por minuto y reanuda.`;
}

/** Intentos anteriores del paso; si no se puede leer, se cuenta desde cero (el paso sigue). */
async function leerIntentos(
  repositorio: Repositorio,
  idCalculo: number,
  idSubfactor: number,
): Promise<number> {
  try {
    return await repositorio.intentosDelPaso(idCalculo, idSubfactor);
  } catch (error) {
    console.error('No se pudo leer el intento del paso:', error);
    return 0;
  }
}

/** El registro es un apoyo para el administrador: si no se puede escribir, el paso no falla. */
async function guardarRegistro(
  repositorio: Repositorio,
  idCalculo: number,
  idSubfactor: number,
  datos: { iniciado_en?: string; duracion_ms: number | null; registro: RegistroPaso },
): Promise<void> {
  try {
    await repositorio.guardarRegistroPaso(idCalculo, idSubfactor, datos);
  } catch (error) {
    console.error('No se pudo guardar el registro del paso:', error);
  }
}

export async function paso(
  cuerpo: unknown,
  _admin: UsuarioVerificado,
  dependencias: Dependencias,
): Promise<Resultado> {
  const idCalculo = leerIdCalculo(cuerpo);
  const { repositorio, configuracion } = dependencias;
  // El tope de 110 s corre desde que entra la invocación (issue #43).
  const presupuesto = new PresupuestoPaso({ ahora: dependencias.ahora });

  const calculo = await repositorio.obtenerCalculo(idCalculo);
  if (calculo === null) {
    throw new ErrorApi(404, 'calculo_no_encontrado', `No existe el cálculo ${idCalculo}.`);
  }
  if (calculo.estado !== 'en_proceso' && calculo.estado !== 'pausado') {
    throw new ErrorApi(
      409,
      'calculo_cerrado',
      `El cálculo ${idCalculo} está ${calculo.estado} y ya no admite pasos.`,
    );
  }
  const parametros = calculo.parametros;
  if (
    parametros?.proveedor_llm !== undefined &&
    parametros.proveedor_llm !== configuracion.proveedorLlm
  ) {
    throw new ErrorApi(
      409,
      'proveedor_cambiado',
      'El proveedor de IA cambió (en «Configuración del recálculo» o en LLM_PROVIDER) desde que se inició este cálculo. Vuelve a ponerlo o inicia uno nuevo.',
    );
  }

  const catalogo = await repositorio.catalogo();
  const pasos = await repositorio.listarPasos(idCalculo);
  const estadoPaso = new Map(pasos.map((p) => [p.id_subfactor, p.estado]));
  const siguiente = catalogo.find((s) => {
    const estado = estadoPaso.get(s.id_subfactor);
    return estado === 'pendiente' || estado === 'error';
  });

  const resumen = (pasosActuales: Paso[], estado: string) => ({
    progreso: calcularProgreso(catalogo, pasosActuales),
    pendientes: pasosActuales.filter((p) => p.estado !== 'hecho').length,
    estado,
  });
  if (siguiente === undefined) return { estado: 200, cuerpo: resumen(pasos, calculo.estado) };

  // Se arman antes de tocar el estado: si falta una clave, el cálculo no cambia. Todo el paso
  // comparte el mismo presupuesto de tiempo (110 s, issue #43).
  const fuentes = fuentesDe(calculo);
  const proveedores = dependencias.proveedores(fuentes, presupuesto);
  const clasificador = dependencias.clasificador(
    parametros?.modelo ?? modeloDelProveedor(configuracion),
    presupuesto,
  );

  // Una invocación sobre un cálculo pausado lo reanuda (BRIEF §13.5).
  if (calculo.estado === 'pausado') {
    await repositorio.actualizarCalculo(idCalculo, { estado: 'en_proceso', mensaje_error: null });
  }

  // El registro se escribe YA al empezar: si la plataforma corta el paso, queda el inicio, el
  // intento y `duracion_ms` nula. Una falla al escribir el registro nunca tumba el paso.
  const intento = (await leerIntentos(repositorio, idCalculo, siguiente.id_subfactor)) + 1;
  const registrador = new RegistradorPaso(configuracion.proveedorLlm, intento);
  await guardarRegistro(repositorio, idCalculo, siguiente.id_subfactor, {
    iniciado_en: new Date(presupuesto.inicio).toISOString(),
    duracion_ms: null,
    registro: registrador.interrumpido(),
  });
  const terminar = async (resultado: ResultadoPaso, mensaje: string | null, aceptados: number) => {
    const duracion = Math.max(0, presupuesto.ahora() - presupuesto.inicio);
    const registro = registrador.cerrar(resultado, mensaje, aceptados);
    await guardarRegistro(repositorio, idCalculo, siguiente.id_subfactor, {
      duracion_ms: duracion,
      registro,
    });
    // Una línea por intento, solo con ids, conteos y tiempos: nunca claves, URL ni textos.
    console.log(
      JSON.stringify({
        evento: 'recalculo_paso',
        id_calculo: idCalculo,
        id_subfactor: siguiente.id_subfactor,
        subfactor: `${siguiente.orden_factor}.${siguiente.orden}`,
        intento,
        proveedor: registro.proveedor,
        resultado,
        duracion_ms: duracion,
        busqueda: registro.busqueda.map((b) => ({
          fuente: b.fuente,
          ms: b.ms,
          candidatos: b.candidatos,
        })),
        candidatos: registro.busqueda.reduce((suma, b) => suma + b.candidatos, 0),
        lotes: registro.lotes.length,
        aceptados,
      }),
    );
  };

  try {
    const resultado = await buscarYClasificar({
      subfactor: siguiente,
      contexto: dependencias.contexto,
      proveedores,
      clasificador,
      anioInicio: parametros?.anio_inicio ?? 0,
      anioFin: parametros?.anio_fin ?? 0,
      umbral: parametros?.umbral ?? configuracion.umbral,
      maxCandidatos: parametros?.max_candidatos ?? configuracion.maxCandidatos,
      presupuesto,
      registro: registrador,
    });
    await repositorio.completarPaso(
      idCalculo,
      siguiente.id_subfactor,
      resultado.referencias,
      resultado.candidatos,
    );
    await terminar('hecho', null, resultado.referencias.length);
  } catch (error) {
    const sinTiempo = error instanceof ErrorPasoSinTiempo;
    const invalida = error instanceof ErrorRespuestaInvalida;
    if (!(error instanceof ErrorProveedorNoDisponible) && !invalida) {
      // Fallo inesperado: queda anotado (sin copiar su texto) y sigue siendo un error interno.
      await terminar('error', MENSAJE_INESPERADO, 0);
      throw error;
    }

    // 429, caída, respuesta inservible o tiempo agotado: se pausa con un mensaje legible y NO se
    // reintenta en bucle. El administrador reanuda desde P-09 y se retoma desde este mismo paso.
    const mensaje = sinTiempo ? mensajeSinTiempo(siguiente) : error.message;
    if (invalida) {
      await repositorio.marcarPasoConError(idCalculo, siguiente.id_subfactor, mensaje);
    }
    await repositorio.actualizarCalculo(idCalculo, { estado: 'pausado', mensaje_error: mensaje });
    await terminar(invalida ? 'error' : 'pausado', mensaje, 0);
    throw new ErrorApi(
      invalida ? 502 : 503,
      invalida ? 'respuesta_invalida' : sinTiempo ? 'paso_sin_tiempo' : 'proveedor_no_disponible',
      mensaje,
      resumen(await repositorio.listarPasos(idCalculo), 'pausado'),
    );
  }

  const despues = await repositorio.listarPasos(idCalculo);
  const estadoFinal = resumen(despues, 'en_proceso');
  if (estadoFinal.progreso !== calculo.progreso) {
    await repositorio.actualizarCalculo(idCalculo, { progreso: estadoFinal.progreso });
  }
  return { estado: 200, cuerpo: estadoFinal };
}
