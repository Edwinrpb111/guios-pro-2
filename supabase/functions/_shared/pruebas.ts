// Ayudas compartidas por las pruebas de las Edge Functions (no se despliegan con ellas).
import type { VerificadorAdmin } from './auth.ts';
import type { Candidato, ProveedorBusqueda, Veredicto, Clasificador } from './tipos.ts';
import type { SubfactorCatalogo } from './repositorio.ts';
import type { ContextoSubfactores } from './contexto.ts';

export function respuestaJson(
  cuerpo: unknown,
  estado = 200,
  cabeceras: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'content-type': 'application/json', ...cabeceras },
  });
}

type Guion = Response | Error | ((peticion: Request) => Response | Promise<Response>);

/** `fetch` falso: responde en orden con el guion y guarda cada petición recibida. */
export function crearFetchGuionado(guion: Guion[]) {
  const llamadas: Request[] = [];
  let posicion = 0;
  const falso = async (entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    llamadas.push(new Request(entrada, init));
    const paso = guion[Math.min(posicion, guion.length - 1)];
    posicion++;
    if (paso === undefined) throw new Error('El guion de fetch está vacío');
    if (paso instanceof Error) throw paso;
    if (typeof paso === 'function') return await paso(llamadas[llamadas.length - 1]!);
    return paso.clone();
  };
  return { fetch: falso as typeof fetch, llamadas };
}

/** Catálogo mínimo: 3 factores con 2, 1 y 2 subfactores (5 pasos). */
export const CATALOGO_PRUEBA: SubfactorCatalogo[] = [
  {
    id_subfactor: 11,
    id_factor: 1,
    orden_factor: 1,
    nombre_factor: 'Compatibilidad',
    orden: 1,
    enunciado: 'Formatos estándar',
  },
  {
    id_subfactor: 12,
    id_factor: 1,
    orden_factor: 1,
    nombre_factor: 'Compatibilidad',
    orden: 2,
    enunciado: 'Multiplataforma',
  },
  {
    id_subfactor: 21,
    id_factor: 2,
    orden_factor: 2,
    nombre_factor: 'Personalización',
    orden: 1,
    enunciado: 'Código fuente abierto',
  },
  {
    id_subfactor: 31,
    id_factor: 3,
    orden_factor: 3,
    nombre_factor: 'Prueba',
    orden: 1,
    enunciado: 'Fácil de desplegar',
  },
  {
    id_subfactor: 32,
    id_factor: 3,
    orden_factor: 3,
    nombre_factor: 'Prueba',
    orden: 2,
    enunciado: 'Fácil de probar',
  },
];

export const CONTEXTO_PRUEBA: ContextoSubfactores = {
  version: 'prueba',
  factores: { '1': { nombre: 'Compatibilidad', terminos: ['compatibility'] } },
  subfactores: {
    '1.1': {
      terminos: ['open formats', 'standard formats'],
      contexto: 'Uso de formatos estándar abiertos.',
    },
  },
};

export function candidato(i: number, cambios: Partial<Candidato> = {}): Candidato {
  return {
    titulo: `Artículo ${i}`,
    anio: 2022,
    doi: `10.1000/art.${i}`,
    resumen: `Resumen ${i}`,
    base: 'openalex',
    ...cambios,
  };
}

/** Proveedor que devuelve siempre la lista dada (y recuerda las consultas). */
export function proveedorFijo(
  nombre: 'openalex' | 'crossref',
  candidatos: Candidato[],
): ProveedorBusqueda & { consultas: string[] } {
  const consultas: string[] = [];
  return {
    nombre,
    consultas,
    buscar(consulta) {
      consultas.push(consulta);
      return Promise.resolve(candidatos.map((c) => ({ ...c, base: nombre })));
    },
  };
}

/** Clasificador que acepta todo con confianza alta, o lo que diga `guion`. */
export function clasificadorGuionado(
  guion: (candidatos: Candidato[]) => Veredicto[] = (candidatos) =>
    candidatos.map((_, i) => ({
      indice: i + 1,
      trata_subfactor: true,
      confianza: 0.95,
      evidencia: 'ok',
    })),
): Clasificador & { lotes: Candidato[][] } {
  const lotes: Candidato[][] = [];
  return {
    lotes,
    clasificar(_factor, _subfactor, _contexto, candidatos) {
      lotes.push(candidatos);
      return Promise.resolve(guion(candidatos));
    },
  };
}

export const TOKEN_ADMIN = 'token-admin';
export const TOKEN_DECISOR = 'token-decisor';

export const verificadorFalso: VerificadorAdmin = {
  verificar(jwt: string) {
    if (jwt === TOKEN_ADMIN) return Promise.resolve({ idUsuario: 'id-admin', esAdmin: true });
    if (jwt === TOKEN_DECISOR) return Promise.resolve({ idUsuario: 'id-decisor', esAdmin: false });
    return Promise.resolve(null);
  },
};
