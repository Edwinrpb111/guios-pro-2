// Implementaciones reales con Supabase: repositorio y verificador de administrador. La clave
// `service_role` existe únicamente aquí, dentro de las Edge Functions (BRIEF §14).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0';
import type { UsuarioVerificado, VerificadorAdmin } from './auth.ts';
import type { ConfiguracionGuardada } from './configuracion.ts';
import type { InfraestructuraConBase } from './dependencias.ts';
import { ErrorApi } from './errores.ts';
import type {
  Calculo,
  EstadoCalculo,
  NuevaReferencia,
  NuevoCalculo,
  Paso,
  Repositorio,
  SubfactorCatalogo,
} from './repositorio.ts';

interface FilaSubfactor {
  id_subfactor: number;
  id_factor: number;
  orden: number;
  enunciado: string;
  factor: { nombre: string; orden: number } | { nombre: string; orden: number }[];
}

/** Lanza un error con contexto; el detalle se registra en el servidor y no llega al cliente. */
function exigir<T>(resultado: { data: T; error: { message: string } | null }, accion: string): T {
  if (resultado.error !== null) throw new Error(`${accion}: ${resultado.error.message}`);
  return resultado.data;
}

export class RepositorioSupabase implements Repositorio {
  readonly #cliente: SupabaseClient;

  constructor(cliente: SupabaseClient) {
    this.#cliente = cliente;
  }

  async catalogo(): Promise<SubfactorCatalogo[]> {
    const filas = exigir(
      await this.#cliente
        .from('subfactor')
        .select('id_subfactor, id_factor, orden, enunciado, factor!inner(nombre, orden)'),
      'No se pudo leer el catálogo',
    ) as unknown as FilaSubfactor[];
    return filas
      .map((fila) => {
        const factor = Array.isArray(fila.factor) ? fila.factor[0]! : fila.factor;
        return {
          id_subfactor: fila.id_subfactor,
          id_factor: fila.id_factor,
          orden_factor: factor.orden,
          nombre_factor: factor.nombre,
          orden: fila.orden,
          enunciado: fila.enunciado,
        };
      })
      .sort((a, b) => a.orden_factor - b.orden_factor || a.orden - b.orden);
  }

  /** La función SQL `crear_calculo_con_pasos` (solo service_role) lo hace en una transacción. */
  async crearCalculoConPasos(datos: NuevoCalculo): Promise<number> {
    const id = exigir(
      await this.#cliente.rpc('crear_calculo_con_pasos', {
        p_anio_inicio: datos.anio_inicio,
        p_anio_fin: datos.anio_fin,
        p_bases_datos: datos.bases_datos,
        p_parametros: datos.parametros,
        p_creado_por: datos.creado_por,
      }),
      'No se pudo crear el cálculo con sus pasos',
    );
    return id as number;
  }

  async obtenerCalculo(idCalculo: number): Promise<Calculo | null> {
    const fila = exigir(
      await this.#cliente
        .from('calculo_sugerida')
        .select('id_calculo, origen, estado, progreso, parametros')
        .eq('id_calculo', idCalculo)
        .maybeSingle(),
      'No se pudo leer el cálculo',
    );
    return fila as Calculo | null;
  }

  async actualizarCalculo(
    idCalculo: number,
    cambios: { estado?: EstadoCalculo; progreso?: number; mensaje_error?: string | null },
  ): Promise<void> {
    exigir(
      await this.#cliente.from('calculo_sugerida').update(cambios).eq('id_calculo', idCalculo),
      'No se pudo actualizar el cálculo',
    );
  }

  async listarPasos(idCalculo: number): Promise<Paso[]> {
    return exigir(
      await this.#cliente
        .from('recalculo_paso')
        .select('id_subfactor, estado')
        .eq('id_calculo', idCalculo),
      'No se pudieron leer los pasos',
    ) as Paso[];
  }

  async completarPaso(
    idCalculo: number,
    idSubfactor: number,
    referencias: NuevaReferencia[],
    candidatos: number,
  ): Promise<void> {
    if (referencias.length > 0) {
      exigir(
        await this.#cliente.from('referencia').upsert(
          referencias.map((r) => ({ ...r, id_calculo: idCalculo, id_subfactor: idSubfactor })),
          { onConflict: 'id_calculo,id_subfactor,doi', ignoreDuplicates: true },
        ),
        'No se pudieron guardar las referencias',
      );
    }
    exigir(
      await this.#cliente
        .from('recalculo_paso')
        .update({ estado: 'hecho', candidatos, aceptados: referencias.length, detalle: null })
        .eq('id_calculo', idCalculo)
        .eq('id_subfactor', idSubfactor),
      'No se pudo marcar el paso como hecho',
    );
  }

  async marcarPasoConError(idCalculo: number, idSubfactor: number, detalle: string): Promise<void> {
    exigir(
      await this.#cliente
        .from('recalculo_paso')
        .update({ estado: 'error', detalle })
        .eq('id_calculo', idCalculo)
        .eq('id_subfactor', idSubfactor),
      'No se pudo marcar el paso con error',
    );
  }
}

/** Valida el JWT con Supabase Auth y consulta el rol en `perfil` (solo `administrador` pasa). */
export class VerificadorSupabase implements VerificadorAdmin {
  readonly #cliente: SupabaseClient;

  constructor(cliente: SupabaseClient) {
    this.#cliente = cliente;
  }

  async verificar(jwt: string): Promise<UsuarioVerificado | null> {
    const { data, error } = await this.#cliente.auth.getUser(jwt);
    if (error !== null || data.user === null) return null;

    const perfil = exigir(
      await this.#cliente.from('perfil').select('rol').eq('id', data.user.id).maybeSingle(),
      'No se pudo leer el perfil',
    ) as { rol: string } | null;
    return { idUsuario: data.user.id, esAdmin: perfil?.rol === 'administrador' };
  }
}

/**
 * Configuración guardada por el administrador (issue #33), con las claves descifradas de Vault.
 * La función SQL solo la puede ejecutar `service_role`; el valor de las claves nunca sale de aquí.
 */
export async function leerConfiguracionGuardada(
  cliente: SupabaseClient,
): Promise<ConfiguracionGuardada | null> {
  const filas = exigir(
    await cliente.rpc('configuracion_recalculo_servicio'),
    'No se pudo leer la configuración del recálculo',
  ) as ConfiguracionGuardada[] | null;
  return filas?.[0] ?? null;
}

/** `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta la plataforma en las Edge Functions. */
export function crearInfraestructuraSupabase(
  leer: (nombre: string) => string | undefined,
): InfraestructuraConBase {
  const url = leer('SUPABASE_URL');
  const clave = leer('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !clave) {
    throw new ErrorApi(
      500,
      'configuracion_incompleta',
      'Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno de la función.',
    );
  }
  const cliente = createClient(url, clave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return {
    repositorio: new RepositorioSupabase(cliente),
    verificador: new VerificadorSupabase(cliente),
    configuracionGuardada: () => leerConfiguracionGuardada(cliente),
  };
}
