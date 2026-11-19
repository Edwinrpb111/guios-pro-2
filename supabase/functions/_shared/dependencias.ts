// Todo lo que necesitan los manejadores de las Edge Functions, agrupado para poder
// reemplazarlo por falsos en las pruebas.
import type { VerificadorAdmin } from './auth.ts';
import { GeminiClasificador } from './clasificador.ts';
import {
  combinarConEntorno,
  type Configuracion,
  type ConfiguracionGuardada,
  leerConfiguracion,
} from './configuracion.ts';
import { contextoSubfactores, type ContextoSubfactores } from './contexto.ts';
import { CrossrefProveedor } from './crossref.ts';
import { ErrorApi } from './errores.ts';
import { ClasificadorFalso, ProveedorFalso } from './falsos.ts';
import { OpenAlexProveedor } from './openalex.ts';
import type { Repositorio } from './repositorio.ts';
import type { Clasificador, NombreBase, ProveedorBusqueda } from './tipos.ts';

export interface Dependencias {
  verificador: VerificadorAdmin;
  repositorio: Repositorio;
  contexto: ContextoSubfactores;
  configuracion: Configuracion;
  /** Un proveedor por fuente pedida, en el mismo orden. */
  proveedores(fuentes: NombreBase[]): ProveedorBusqueda[];
  clasificador(modelo: string): Clasificador;
}

function faltaSecreto(variable: string): ErrorApi {
  return new ErrorApi(
    500,
    'configuracion_incompleta',
    `Falta configurar ${variable} en «Configuración del recálculo» o en los secretos de Supabase (o usa LLM_PROVIDER=fake).`,
  );
}

/**
 * Elige las implementaciones según `LLM_PROVIDER` (BRIEF §13.4, §13.6): con `fake` no hay red ni
 * claves; con `gemini` se usan OpenAlex, Crossref y Gemini.
 */
export function crearDependencias(
  leer: (nombre: string) => string | undefined,
  infraestructura: { repositorio: Repositorio; verificador: VerificadorAdmin },
): Dependencias {
  const configuracion = leerConfiguracion(leer);
  return {
    repositorio: infraestructura.repositorio,
    verificador: infraestructura.verificador,
    contexto: contextoSubfactores(),
    configuracion,
    proveedores(fuentes) {
      return fuentes.map((fuente) => {
        if (configuracion.proveedorLlm === 'fake') return new ProveedorFalso(fuente);
        if (fuente === 'crossref') {
          return new CrossrefProveedor(
            configuracion.crossrefMailto === undefined
              ? {}
              : { mailto: configuracion.crossrefMailto },
          );
        }
        if (configuracion.openalexApiKey === undefined) throw faltaSecreto('OPENALEX_API_KEY');
        return new OpenAlexProveedor({ apiKey: configuracion.openalexApiKey });
      });
    },
    clasificador(modelo) {
      if (configuracion.proveedorLlm === 'fake') return new ClasificadorFalso();
      if (configuracion.geminiApiKey === undefined) throw faltaSecreto('GEMINI_API_KEY');
      return new GeminiClasificador({ apiKey: configuracion.geminiApiKey, modelo });
    },
  };
}

export interface InfraestructuraConBase {
  repositorio: Repositorio;
  verificador: VerificadorAdmin;
  /** Configuración guardada por el administrador (issue #33); `null` si no hay fila. */
  configuracionGuardada(): Promise<ConfiguracionGuardada | null>;
}

/**
 * Igual que `crearDependencias`, pero antes lee la configuración guardada en la base: lo que el
 * administrador definió en la app manda y lo que falta sale del entorno. Se llama en cada
 * petición para que un cambio en la app se aplique sin redesplegar. Si la lectura falla, la
 * petición falla (error interno) en lugar de usar en silencio otra configuración.
 */
export async function crearDependenciasConBase(
  leer: (nombre: string) => string | undefined,
  infraestructura: InfraestructuraConBase,
): Promise<Dependencias> {
  const guardada = await infraestructura.configuracionGuardada();
  return crearDependencias(combinarConEntorno(guardada, leer), infraestructura);
}
