// POST /functions/v1/recalculo-iniciar (BRIEF §11.3): crea el cálculo `en_proceso` y un paso
// `pendiente` por cada subfactor del catálogo.
import type { UsuarioVerificado } from './auth.ts';
import { VERSION_PROMPT } from './clasificador.ts';
import type { Dependencias } from './dependencias.ts';
import { ErrorApi } from './errores.ts';
import type { Resultado } from './http.ts';
import type { ParametrosCalculo } from './repositorio.ts';
import { BASES_VALIDAS, type NombreBase } from './tipos.ts';

const ANIO_MINIMO = 1900;
const ANIO_MAXIMO = 2100;

const NOMBRE_BASE: Record<NombreBase, string> = { openalex: 'OpenAlex', crossref: 'Crossref' };

function invalida(mensaje: string): ErrorApi {
  return new ErrorApi(400, 'solicitud_invalida', mensaje);
}

function leerAnio(cuerpo: Record<string, unknown>, campo: 'anio_inicio' | 'anio_fin'): number {
  const valor = cuerpo[campo];
  if (
    !Number.isInteger(valor) ||
    (valor as number) < ANIO_MINIMO ||
    (valor as number) > ANIO_MAXIMO
  ) {
    throw invalida(
      `El campo ${campo} debe ser un año entero entre ${ANIO_MINIMO} y ${ANIO_MAXIMO}.`,
    );
  }
  return valor as number;
}

function validarEntrada(cuerpo: unknown): {
  anioInicio: number;
  anioFin: number;
  fuentes: NombreBase[];
} {
  if (cuerpo === null || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
    throw invalida('La solicitud debe ser un objeto con anio_inicio, anio_fin y fuentes.');
  }
  const datos = cuerpo as Record<string, unknown>;
  const anioInicio = leerAnio(datos, 'anio_inicio');
  const anioFin = leerAnio(datos, 'anio_fin');
  if (anioInicio > anioFin) throw invalida('anio_inicio no puede ser mayor que anio_fin.');

  const { fuentes } = datos;
  if (
    !Array.isArray(fuentes) ||
    fuentes.length === 0 ||
    fuentes.some((f) => typeof f !== 'string')
  ) {
    throw invalida('El campo fuentes debe ser una lista no vacía de textos (openalex, crossref).');
  }
  const desconocida = (fuentes as string[]).find((f) => !BASES_VALIDAS.includes(f as NombreBase));
  if (desconocida !== undefined) {
    throw invalida(
      `La fuente «${desconocida}» no está disponible. Usa: ${BASES_VALIDAS.join(', ')}.`,
    );
  }
  return { anioInicio, anioFin, fuentes: [...new Set(fuentes as NombreBase[])] };
}

export async function iniciar(
  cuerpo: unknown,
  admin: UsuarioVerificado,
  dependencias: Dependencias,
): Promise<Resultado> {
  const { anioInicio, anioFin, fuentes } = validarEntrada(cuerpo);
  const { repositorio, configuracion } = dependencias;

  // Falla ahora, y no en el primer paso, si falta una clave de las fuentes o del clasificador.
  dependencias.proveedores(fuentes);
  dependencias.clasificador(configuracion.modelo);

  const catalogo = await repositorio.catalogo();
  if (catalogo.length === 0) {
    throw new ErrorApi(
      500,
      'catalogo_vacio',
      'El catálogo de subfactores está vacío: aplica las migraciones y la semilla.',
    );
  }

  const parametros: ParametrosCalculo = {
    anio_inicio: anioInicio,
    anio_fin: anioFin,
    fuentes,
    umbral: configuracion.umbral,
    modelo: configuracion.proveedorLlm === 'fake' ? 'fake' : configuracion.modelo,
    proveedor_llm: configuracion.proveedorLlm,
    version_prompt: VERSION_PROMPT,
    max_candidatos: configuracion.maxCandidatos,
  };

  const idCalculo = await repositorio.crearCalculo({
    anio_inicio: anioInicio,
    anio_fin: anioFin,
    bases_datos: fuentes.map((f) => NOMBRE_BASE[f]).join(', '),
    parametros,
    creado_por: admin.idUsuario,
  });
  try {
    await repositorio.crearPasos(
      idCalculo,
      catalogo.map((s) => s.id_subfactor),
    );
  } catch (error) {
    // Nunca queda un cálculo en proceso sin sus pasos.
    await repositorio
      .actualizarCalculo(idCalculo, {
        estado: 'fallido',
        mensaje_error: 'No se pudieron crear los pasos del cálculo. Inicia uno nuevo.',
      })
      .catch(() => undefined);
    throw error;
  }

  return { estado: 200, cuerpo: { id_calculo: idCalculo } };
}
