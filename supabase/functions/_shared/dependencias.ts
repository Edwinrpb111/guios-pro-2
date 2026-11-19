// Todo lo que necesitan los manejadores de las Edge Functions, agrupado para poder
// reemplazarlo por falsos en las pruebas.
import type { VerificadorAdmin } from './auth.ts';
import { GeminiClasificador } from './clasificador.ts';
import { ClasificadorCompatibleOpenAI } from './clasificador_openai.ts';
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
import type { PresupuestoPaso } from './presupuesto.ts';
import { RELOJ_REAL, RitmoDeLlamadas } from './ritmo.ts';
import type { Repositorio } from './repositorio.ts';
import type { Clasificador, NombreBase, ProveedorBusqueda } from './tipos.ts';

export interface Dependencias {
  verificador: VerificadorAdmin;
  repositorio: Repositorio;
  contexto: ContextoSubfactores;
  configuracion: Configuracion;
  /**
   * Un proveedor por fuente pedida, en el mismo orden. Con `presupuesto` (el tope de 110 s del
   * paso, issue #43) cada consulta dura como máximo lo que queda.
   */
  proveedores(fuentes: NombreBase[], presupuesto?: PresupuestoPaso): ProveedorBusqueda[];
  /** Hora en milisegundos; inyectable para probar el ritmo con un reloj falso. */
  ahora(): number;
  /** Espera `ms` milisegundos; inyectable para que las pruebas no duerman de verdad. */
  esperar(ms: number): Promise<void>;
  /** Un clasificador por paso: lleva la cuenta de las llamadas y la espera de ese paso. */
  clasificador(modelo: string, presupuesto?: PresupuestoPaso): Clasificador;
}

/** Lo que se puede reemplazar en las pruebas: reloj y `fetch` del clasificador. */
export interface OpcionesDependencias {
  ahora?: () => number;
  esperar?: (ms: number) => Promise<void>;
  fetch?: typeof fetch;
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
 * claves; con `gemini` u `openai` se usan OpenAlex, Crossref y Gemini o el proveedor compatible.
 */
export function crearDependencias(
  leer: (nombre: string) => string | undefined,
  infraestructura: { repositorio: Repositorio; verificador: VerificadorAdmin },
  opciones: OpcionesDependencias = {},
): Dependencias {
  const configuracion = leerConfiguracion(leer);
  const ahora = opciones.ahora ?? RELOJ_REAL.ahora;
  const esperar = opciones.esperar ?? RELOJ_REAL.esperar;
  return {
    repositorio: infraestructura.repositorio,
    verificador: infraestructura.verificador,
    contexto: contextoSubfactores(),
    configuracion,
    ahora,
    esperar,
    proveedores(fuentes, presupuesto) {
      return fuentes.map((fuente) => {
        if (configuracion.proveedorLlm === 'fake') return new ProveedorFalso(fuente);
        if (fuente === 'crossref') {
          return new CrossrefProveedor({
            ...(configuracion.crossrefMailto === undefined
              ? {}
              : { mailto: configuracion.crossrefMailto }),
            ahora,
            esperar,
            ...(presupuesto === undefined ? {} : { presupuesto }),
          });
        }
        if (configuracion.openalexApiKey === undefined) throw faltaSecreto('OPENALEX_API_KEY');
        return new OpenAlexProveedor({
          apiKey: configuracion.openalexApiKey,
          ...(presupuesto === undefined ? {} : { presupuesto }),
        });
      });
    },
    clasificador(modelo, presupuesto) {
      if (configuracion.proveedorLlm === 'fake') return new ClasificadorFalso();
      if (configuracion.proveedorLlm === 'openai') {
        if (configuracion.openaiBaseUrl === undefined) throw faltaSecreto('OPENAI_COMPAT_BASE_URL');
        if (modelo === '') throw faltaSecreto('OPENAI_COMPAT_MODEL');
        if (configuracion.openaiApiKey === undefined) throw faltaSecreto('OPENAI_COMPAT_API_KEY');
        // Mismo ritmo por minuto y mismos reintentos que Gemini (issue #39).
        return new ClasificadorCompatibleOpenAI({
          apiKey: configuracion.openaiApiKey,
          urlBase: configuracion.openaiBaseUrl,
          modelo,
          desactivarRazonamiento: configuracion.desactivarRazonamiento,
          ...(opciones.fetch === undefined ? {} : { fetch: opciones.fetch }),
          ...(presupuesto === undefined ? {} : { presupuesto }),
          ritmo: new RitmoDeLlamadas(
            { ahora, esperar },
            configuracion.llamadasPorMinuto,
            undefined,
            presupuesto,
          ),
        });
      }
      if (configuracion.geminiApiKey === undefined) throw faltaSecreto('GEMINI_API_KEY');
      // El clasificador falso (arriba) no espera: solo los clasificadores con IA tienen ritmo.
      return new GeminiClasificador({
        apiKey: configuracion.geminiApiKey,
        modelo,
        desactivarRazonamiento: configuracion.desactivarRazonamiento,
        ...(opciones.fetch === undefined ? {} : { fetch: opciones.fetch }),
        ...(presupuesto === undefined ? {} : { presupuesto }),
        ritmo: new RitmoDeLlamadas(
          { ahora, esperar },
          configuracion.llamadasPorMinuto,
          undefined,
          presupuesto,
        ),
      });
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
  opciones: OpcionesDependencias = {},
): Promise<Dependencias> {
  const guardada = await infraestructura.configuracionGuardada();
  return crearDependencias(combinarConEntorno(guardada, leer), infraestructura, opciones);
}
