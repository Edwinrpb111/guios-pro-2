// POST /functions/v1/recalculo-paso (BRIEF §11.3, §13.2): procesa UN subfactor pendiente por
// invocación. Los planes Free limitan cada invocación (150 s, 2 s de CPU), así que el recálculo
// no es una función larga: la pantalla P-09 la invoca hasta que no queden pendientes.
import type { UsuarioVerificado } from './auth.ts';
import { buscarYClasificar } from './busqueda.ts';
import type { Dependencias } from './dependencias.ts';
import { ErrorApi, ErrorProveedorNoDisponible, ErrorRespuestaInvalida } from './errores.ts';
import type { Resultado } from './http.ts';
import type { Calculo, Paso, SubfactorCatalogo } from './repositorio.ts';
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

export async function paso(
  cuerpo: unknown,
  _admin: UsuarioVerificado,
  dependencias: Dependencias,
): Promise<Resultado> {
  const idCalculo = leerIdCalculo(cuerpo);
  const { repositorio, configuracion } = dependencias;

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
      'El proveedor de IA (LLM_PROVIDER) cambió desde que se inició este cálculo. Inicia uno nuevo.',
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

  // Se arman antes de tocar el estado: si falta una clave, el cálculo no cambia.
  const fuentes = fuentesDe(calculo);
  const proveedores = dependencias.proveedores(fuentes);
  const clasificador = dependencias.clasificador(parametros?.modelo ?? configuracion.modelo);

  // Una invocación sobre un cálculo pausado lo reanuda (BRIEF §13.5).
  if (calculo.estado === 'pausado') {
    await repositorio.actualizarCalculo(idCalculo, { estado: 'en_proceso', mensaje_error: null });
  }

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
    });
    await repositorio.completarPaso(
      idCalculo,
      siguiente.id_subfactor,
      resultado.referencias,
      resultado.candidatos,
    );
  } catch (error) {
    const disponible = !(error instanceof ErrorProveedorNoDisponible);
    if (disponible && !(error instanceof ErrorRespuestaInvalida)) throw error;

    // 429, caída o respuesta inservible: se pausa con un mensaje legible y NO se reintenta en
    // bucle. El administrador reanuda desde P-09 y se retoma desde este mismo paso.
    if (error instanceof ErrorRespuestaInvalida) {
      await repositorio.marcarPasoConError(idCalculo, siguiente.id_subfactor, error.message);
    }
    await repositorio.actualizarCalculo(idCalculo, {
      estado: 'pausado',
      mensaje_error: error.message,
    });
    throw new ErrorApi(
      error instanceof ErrorRespuestaInvalida ? 502 : 503,
      error instanceof ErrorRespuestaInvalida ? 'respuesta_invalida' : 'proveedor_no_disponible',
      error.message,
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
