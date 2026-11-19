// Capa HTTP común de las Edge Functions: CORS solo para el frontend (BRIEF §14), exigencia de
// administrador (§11.3) y errores como `{error, codigo}` con un mensaje en español.
import { exigirAdmin, exigirJwt, type UsuarioVerificado, type VerificadorAdmin } from './auth.ts';
import type { Dependencias } from './dependencias.ts';
import { ErrorApi } from './errores.ts';

export interface Resultado {
  estado: number;
  cuerpo: unknown;
}

export type Accion = (
  cuerpo: unknown,
  admin: UsuarioVerificado,
  dependencias: Dependencias,
) => Promise<Resultado>;

export interface OpcionesServidor {
  /** Orígenes del frontend que CORS acepta. */
  origenes: string[];
  /**
   * Da el verificador del JWT y del rol. No lee la configuración del recálculo: así se exige
   * administrador antes de tocarla (issue #33).
   */
  verificador: () => VerificadorAdmin | Promise<VerificadorAdmin>;
  /**
   * Crea las dependencias; puede lanzar un `ErrorApi` `configuracion_*` si falta configuración.
   * Se invoca solo después de comprobar que quien llama es administrador, y ese error no se
   * muestra al cliente. Puede ser asíncrona: lee la configuración guardada en la base (issue #33).
   */
  crear: () => Dependencias | Promise<Dependencias>;
}

const CABECERAS_PERMITIDAS = 'authorization, x-client-info, apikey, content-type';

function responder(estado: number, cuerpo: unknown, cabeceras: Record<string, string>): Response {
  if (estado === 204) return new Response(null, { status: 204, headers: cabeceras });
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { ...cabeceras, 'content-type': 'application/json; charset=utf-8' },
  });
}

function respuestaDeError(error: ErrorApi, cabeceras: Record<string, string>): Response {
  return responder(
    error.estado,
    { error: error.message, codigo: error.codigo, ...error.extra },
    cabeceras,
  );
}

async function leerCuerpo(peticion: Request): Promise<unknown> {
  try {
    return await peticion.json();
  } catch {
    throw new ErrorApi(
      400,
      'solicitud_invalida',
      'El cuerpo de la solicitud debe ser JSON válido.',
    );
  }
}

/** Los errores `configuracion_*` mencionan variables de entorno y no deben llegar al cliente. */
function esErrorDeConfiguracion(error: ErrorApi): boolean {
  return error.codigo.startsWith('configuracion_');
}

export async function atender(
  peticion: Request,
  opciones: OpcionesServidor,
  accion: Accion,
): Promise<Response> {
  const origen = peticion.headers.get('origin');

  // Un navegador siempre manda `Origin`; una llamada de servidor a servidor no. La autorización
  // real es el JWT de administrador: CORS solo evita que otras páginas usen la sesión del usuario.
  if (origen !== null && !opciones.origenes.includes(origen)) {
    return respuestaDeError(
      new ErrorApi(403, 'origen_no_permitido', 'Este origen no puede usar la función.'),
      {},
    );
  }
  const cabeceras: Record<string, string> =
    origen === null
      ? {}
      : {
          'access-control-allow-origin': origen,
          'access-control-allow-headers': CABECERAS_PERMITIDAS,
          'access-control-allow-methods': 'POST, OPTIONS',
          vary: 'Origin',
        };

  if (peticion.method === 'OPTIONS') return responder(204, null, cabeceras);
  if (peticion.method !== 'POST') {
    return respuestaDeError(
      new ErrorApi(405, 'metodo_no_permitido', 'Esta función solo acepta POST.'),
      cabeceras,
    );
  }

  try {
    // Primero el token y el rol: quien no se identifica recibe 401 y un decisor 403 sin que se
    // lea la configuración del recálculo, así que nunca ve detalles de ella ni un error suyo.
    exigirJwt(peticion);
    const admin = await exigirAdmin(peticion, await opciones.verificador());
    const dependencias = await opciones.crear();
    const cuerpo = await leerCuerpo(peticion);
    const resultado = await accion(cuerpo, admin, dependencias);
    return responder(resultado.estado, resultado.cuerpo, cabeceras);
  } catch (error) {
    if (error instanceof ErrorApi && !esErrorDeConfiguracion(error)) {
      return respuestaDeError(error, cabeceras);
    }
    // Un fallo de configuración nombra variables: queda en el registro del servidor y el cliente
    // recibe el mismo `error_interno` que ante cualquier fallo inesperado.
    console.error('Error inesperado en la Edge Function:', error);
    return respuestaDeError(
      new ErrorApi(
        500,
        'error_interno',
        'Ocurrió un error inesperado. Intenta de nuevo en unos minutos.',
      ),
      cabeceras,
    );
  }
}
