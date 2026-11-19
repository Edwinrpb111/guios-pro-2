import { useCallback, useId, useState, type FormEvent } from 'react';
import { useApiAdmin } from '../admin/contexto';
import {
  formularioDesdeParametros,
  validarClave,
  validarConfiguracion,
  type FormularioConfiguracion,
} from '../admin/formularioConfiguracion';
import { Aviso, MarcoAdmin } from '../admin/MarcoAdmin';
import { ResumenClasificador } from '../admin/ResumenClasificador';
import {
  type CambioConfiguracion,
  type ConfiguracionRecalculo,
  type EstadoClave,
  type NombreClave,
  type ParametrosRecalculo,
} from '../admin/tipos';
import { useCarga } from '../admin/useCarga';

type Mensaje = { tipo: 'error' | 'exito'; texto: string };

const formatoFechaHora = new Intl.DateTimeFormat('es-EC', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function fechaHora(iso: string): string {
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? '—' : formatoFechaHora.format(fecha);
}

function mensajeDe(error: unknown, porDefecto: string): string {
  return error instanceof Error && error.message !== '' ? error.message : porDefecto;
}

type ValorProveedor = '' | 'gemini' | 'openai' | 'fake';

/** Ejemplos de dirección base de servicios compatibles con OpenAI (issue #40). */
const EJEMPLOS_DIRECCION = [
  { servicio: 'OpenRouter', direccion: 'https://openrouter.ai/api/v1' },
  { servicio: 'Groq', direccion: 'https://api.groq.com/openai/v1' },
  { servicio: 'DeepSeek', direccion: 'https://api.deepseek.com' },
] as const;

/** Claves que activan el aviso «Clave sin usar»: cada una solo se usa con su proveedor. */
const PROVEEDORES_CON_CLAVE = [
  {
    proveedor: 'gemini',
    clave: 'GEMINI_API_KEY',
    nombre: 'Gemini',
    boton: 'Usar Gemini',
    exito: 'El recálculo usará Gemini.',
  },
  {
    proveedor: 'openai',
    clave: 'OPENAI_COMPAT_API_KEY',
    nombre: 'la IA compatible con OpenAI',
    boton: 'Usar el proveedor compatible con OpenAI',
    exito: 'El recálculo usará el proveedor compatible con OpenAI.',
  },
] as const;

/** Opción grande del grupo «Proveedor del clasificador»: radio nativo + título + explicación. */
function OpcionProveedor({
  id,
  valor,
  actual,
  titulo,
  descripcion,
  alElegir,
}: {
  id: string;
  valor: ValorProveedor;
  actual: string;
  titulo: string;
  descripcion: string;
  alElegir: (valor: ValorProveedor) => void;
}) {
  return (
    <div className="admin-opcion" data-activa={actual === valor}>
      <input
        type="radio"
        id={id}
        name="proveedor-llm"
        value={valor}
        checked={actual === valor}
        onChange={() => alElegir(valor)}
        aria-describedby={`${id}-descripcion`}
      />
      <label htmlFor={id} className="admin-opcion__titulo">
        {titulo}
      </label>
      <p id={`${id}-descripcion`} className="admin-opcion__descripcion">
        {descripcion}
      </p>
    </div>
  );
}

function motivoSinUso(proveedor: ParametrosRecalculo['proveedorLlm']): string {
  switch (proveedor) {
    case 'fake':
      return 'el proveedor guardado es el clasificador falso (demostración).';
    case 'gemini':
      return 'el proveedor guardado es Gemini.';
    case 'openai':
      return 'el proveedor guardado es el compatible con OpenAI.';
    default:
      return 'el proveedor no está fijado y lo decide el secreto LLM_PROVIDER de Supabase.';
  }
}

/**
 * Un solo bloque para configurar el clasificador (issue #37): se elige Gemini, un servicio
 * compatible con OpenAI (issue #40) o Falso y, con los dos primeros, sus datos y su clave aparecen
 * ahí mismo. Modelo de Gemini, umbral, máximo de candidatos, llamadas por minuto a la IA
 * (issue #39), correo de Crossref y «usar el secreto de Supabase» van en «Opciones avanzadas».
 * Un campo vacío usa el secreto de Supabase de la Edge Function o, si tampoco existe, el valor por
 * defecto.
 */
function ConfiguracionClasificador({
  configuracion,
  alGuardar,
}: {
  configuracion: ConfiguracionRecalculo;
  alGuardar: () => void;
}) {
  const api = useApiAdmin();
  const id = useId();
  const inicial = configuracion.parametros;
  const [formulario, setFormulario] = useState<FormularioConfiguracion>(() =>
    formularioDesdeParametros(inicial),
  );
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);
  const [errorAviso, setErrorAviso] = useState<{ proveedor: ValorProveedor; texto: string } | null>(
    null,
  );
  const [enviando, setEnviando] = useState(false);
  const [avanzadasAbiertas, setAvanzadasAbiertas] = useState(false);

  const campo =
    (nombre: keyof FormularioConfiguracion) => (evento: { target: { value: string } }) =>
      setFormulario((actual) => ({ ...actual, [nombre]: evento.target.value }));
  const elegirProveedor = (proveedorLlm: ValorProveedor) =>
    setFormulario((actual) => ({ ...actual, proveedorLlm }));

  const guardar = async (evento: FormEvent) => {
    evento.preventDefault();
    const validacion = validarConfiguracion(formulario);
    if (validacion.error !== undefined) {
      setMensaje({ tipo: 'error', texto: validacion.error });
      // Solo las opciones avanzadas pueden fallar: se abren para que se vea el campo.
      setAvanzadasAbiertas(true);
      return;
    }
    setMensaje(null);
    setEnviando(true);
    try {
      await api.guardarParametros(validacion.parametros);
      setMensaje({ tipo: 'exito', texto: 'Parámetros guardados.' });
      alGuardar();
    } catch (e) {
      setMensaje({ tipo: 'error', texto: mensajeDe(e, 'No se pudieron guardar los parámetros.') });
    } finally {
      setEnviando(false);
    }
  };

  /** Un clic: fija el proveedor con los demás parámetros guardados tal cual están. */
  const usarProveedor = async (proveedor: 'gemini' | 'openai', exito: string) => {
    setErrorAviso(null);
    setEnviando(true);
    try {
      await api.guardarParametros({ ...inicial, proveedorLlm: proveedor });
      elegirProveedor(proveedor);
      setMensaje({ tipo: 'exito', texto: `Parámetros guardados. ${exito}` });
      alGuardar();
    } catch (e) {
      setErrorAviso({
        proveedor,
        texto: mensajeDe(e, 'No se pudieron guardar los parámetros.'),
      });
    } finally {
      setEnviando(false);
    }
  };

  const estadoClave = (nombre: NombreClave): EstadoClave =>
    configuracion.claves.find((c) => c.nombre === nombre) ?? {
      nombre,
      configurada: false,
      actualizadaEn: null,
    };

  return (
    <>
      {PROVEEDORES_CON_CLAVE.filter(
        (p) => estadoClave(p.clave).configurada && inicial.proveedorLlm !== p.proveedor,
      ).map((p) => (
        <Aviso key={p.proveedor} tipo="advertencia" etiqueta="Clave sin usar">
          <p>
            Hay una clave de {p.nombre} guardada, pero el recálculo no la usa:{' '}
            {motivoSinUso(inicial.proveedorLlm)}
          </p>
          {errorAviso?.proveedor === p.proveedor && <Aviso tipo="error">{errorAviso.texto}</Aviso>}
          <button
            type="button"
            className="boton boton--primario"
            onClick={() => void usarProveedor(p.proveedor, p.exito)}
            disabled={enviando}
          >
            {p.boton}
          </button>
        </Aviso>
      ))}
      <form
        className="admin-tarjeta admin-formulario admin-configuracion__bloque"
        onSubmit={(e) => void guardar(e)}
        noValidate
      >
        <fieldset className="admin-clasificador-bloque">
          <legend>Clasificador</legend>
          <p className="admin-ayuda">
            Elige con qué clasifica el recálculo las referencias de cada subfactor.
          </p>
          <div role="radiogroup" aria-labelledby={`${id}-proveedor`}>
            <p id={`${id}-proveedor`} className="admin-campo">
              Proveedor del clasificador
            </p>
            <div className="admin-opciones">
              <OpcionProveedor
                id={`${id}-gemini`}
                valor="gemini"
                actual={formulario.proveedorLlm}
                titulo="Gemini"
                descripcion="Clasifica con IA real. Necesita una clave de Gemini."
                alElegir={elegirProveedor}
              />
              <OpcionProveedor
                id={`${id}-fake`}
                valor="fake"
                actual={formulario.proveedorLlm}
                titulo="Falso (demostración)"
                descripcion="Sin red ni claves. El resultado siempre es el mismo: sirve para probar, no para resultados reales."
                alElegir={elegirProveedor}
              />
              <OpcionProveedor
                id={`${id}-openai`}
                valor="openai"
                actual={formulario.proveedorLlm}
                titulo="Compatible con OpenAI (OpenRouter, Groq, DeepSeek…)"
                descripcion="Servicios baratos o gratis con el formato de OpenAI (también Mistral, Together y OpenAI). Necesita dirección, modelo y clave."
                alElegir={elegirProveedor}
              />
            </div>
          </div>
          {formulario.proveedorLlm === '' && (
            <p className="admin-ayuda">
              Ahora no hay ninguna opción elegida: lo decide el secreto LLM_PROVIDER de Supabase
              (Opciones avanzadas), que la app no puede ver. Elige Gemini, Compatible con OpenAI o
              Falso para saber qué se usará.
            </p>
          )}
          {formulario.proveedorLlm === 'openai' && (
            <div className="admin-claves">
              <h3>Servicio compatible con OpenAI</h3>
              <p className="admin-ayuda">
                Sirve para OpenRouter, Groq, DeepSeek, Mistral, OpenAI y cualquier servicio que use
                el formato chat/completions de OpenAI. Copia la dirección base y el nombre del
                modelo de la documentación del servicio.
              </p>
              <label className="admin-campo">
                Dirección base (https)
                <input
                  value={formulario.openaiBaseUrl}
                  onChange={campo('openaiBaseUrl')}
                  placeholder="https://openrouter.ai/api/v1"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby={`${id}-direccion`}
                />
              </label>
              <div id={`${id}-direccion`} className="admin-ayuda admin-campo__ayuda">
                <p>
                  Solo https, sin usuario ni clave en la dirección. Vacío: OPENAI_COMPAT_BASE_URL.
                  Ejemplos:
                </p>
                <ul>
                  {EJEMPLOS_DIRECCION.map((e) => (
                    <li key={e.servicio}>
                      {e.servicio}: <code>{e.direccion}</code>
                    </li>
                  ))}
                </ul>
              </div>
              <label className="admin-campo">
                Modelo de la IA compatible
                <input
                  value={formulario.openaiModelo}
                  onChange={campo('openaiModelo')}
                  placeholder="meta-llama/llama-3.3-70b-instruct:free"
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby={`${id}-modelo-compatible`}
                />
              </label>
              <span id={`${id}-modelo-compatible`} className="admin-ayuda admin-campo__ayuda">
                Tal cual lo pide el servicio (OpenRouter usa «organización/modelo»). Vacío:
                OPENAI_COMPAT_MODEL.
              </span>
              <h3>Claves del servicio compatible y de OpenAlex</h3>
              <p className="admin-ayuda">
                Se guardan cifradas en Supabase Vault, al instante y por separado de la elección de
                arriba, y nunca se vuelven a mostrar. Si una clave no está guardada aquí, el
                recálculo usa la del secreto de Supabase con el mismo nombre.
              </p>
              <CampoClave
                servicio="la IA compatible con OpenAI"
                estado={estadoClave('OPENAI_COMPAT_API_KEY')}
                alCambiar={alGuardar}
              />
              <CampoClave
                servicio="OpenAlex"
                estado={estadoClave('OPENALEX_API_KEY')}
                alCambiar={alGuardar}
                ayuda="Opcional: solo hace falta si el recálculo busca en OpenAlex. Crossref funciona sin clave."
              />
            </div>
          )}
          {formulario.proveedorLlm === 'gemini' && (
            <div className="admin-claves">
              <h3>Claves de Gemini y OpenAlex</h3>
              <p className="admin-ayuda">
                Se guardan cifradas en Supabase Vault, al instante y por separado de la elección de
                arriba, y nunca se vuelven a mostrar. Si una clave no está guardada aquí, el
                recálculo usa la del secreto de Supabase con el mismo nombre.
              </p>
              <CampoClave
                servicio="Gemini"
                estado={estadoClave('GEMINI_API_KEY')}
                alCambiar={alGuardar}
              />
              <CampoClave
                servicio="OpenAlex"
                estado={estadoClave('OPENALEX_API_KEY')}
                alCambiar={alGuardar}
                ayuda="Opcional: solo hace falta si el recálculo busca en OpenAlex. Crossref funciona sin clave."
              />
            </div>
          )}
        </fieldset>

        <details className="admin-avanzadas" open={avanzadasAbiertas}>
          <summary
            onClick={(e) => {
              e.preventDefault();
              setAvanzadasAbiertas((abiertas) => !abiertas);
            }}
          >
            Opciones avanzadas
          </summary>
          <p className="admin-ayuda">
            Un campo vacío usa el secreto de Supabase de la Edge Function o, si tampoco existe, el
            valor por defecto.
          </p>
          <div className="admin-opciones admin-opciones--una">
            <OpcionProveedor
              id={`${id}-secreto`}
              valor=""
              actual={formulario.proveedorLlm}
              titulo="Usar el secreto de Supabase (LLM_PROVIDER)"
              descripcion="No recomendado: la app no puede ver ese secreto y no sabrás qué se usa."
              alElegir={elegirProveedor}
            />
          </div>
          <label className="admin-campo">
            Modelo
            <input
              value={formulario.modelo}
              onChange={campo('modelo')}
              placeholder="gemini-3.1-flash-lite"
              aria-describedby={`${id}-modelo`}
            />
          </label>
          <span id={`${id}-modelo`} className="admin-ayuda admin-campo__ayuda">
            Modelo de Gemini. Vacío: LLM_MODEL o gemini-3.1-flash-lite. El del servicio compatible
            con OpenAI se elige arriba.
          </span>
          <div className="admin-formulario__anios">
            <label className="admin-campo">
              Umbral de confianza (0 a 1)
              <input
                inputMode="decimal"
                value={formulario.umbral}
                onChange={campo('umbral')}
                placeholder="0,7"
              />
            </label>
            <label className="admin-campo">
              Máximo de candidatos por subfactor (1 a 200)
              <input
                inputMode="numeric"
                value={formulario.maxCandidatos}
                onChange={campo('maxCandidatos')}
                placeholder="50"
              />
            </label>
          </div>
          <label className="admin-campo">
            Llamadas a la IA por minuto
            <input
              inputMode="numeric"
              value={formulario.llamadasPorMinuto}
              onChange={campo('llamadasPorMinuto')}
              placeholder="15"
              aria-describedby={`${id}-ritmo`}
            />
          </label>
          <span id={`${id}-ritmo`} className="admin-ayuda admin-campo__ayuda">
            De 1 a 1000. El recálculo espera entre llamadas para no pasar de este número por minuto,
            y si la IA responde que se superó el límite, espera y reintenta solo unas veces antes de
            pausar. El plan gratis de Gemini permite cerca de 15 por minuto; con facturación
            activada se puede subir. Con menos de 4, un subfactor con muchos candidatos puede tardar
            demasiado en un solo paso. Vacío: LLM_LLAMADAS_POR_MINUTO o 15.
          </span>
          <label className="admin-campo">
            Correo para Crossref
            <input
              type="email"
              value={formulario.crossrefMailto}
              onChange={campo('crossrefMailto')}
              aria-describedby={`${id}-correo`}
            />
          </label>
          <span id={`${id}-correo`} className="admin-ayuda admin-campo__ayuda">
            Crossref atiende mejor las consultas que traen un correo de contacto (opcional).
          </span>
        </details>

        {mensaje && <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>}
        <div className="admin-formulario__botones">
          <button type="submit" className="boton boton--primario" disabled={enviando}>
            {enviando ? 'Guardando…' : 'Guardar configuración'}
          </button>
        </div>
      </form>
    </>
  );
}

/** Una clave de solo escritura: se guarda, se reemplaza o se borra; nunca se muestra. */
function CampoClave({
  estado,
  servicio,
  alCambiar,
  ayuda,
}: {
  estado: EstadoClave;
  servicio: string;
  alCambiar: () => void;
  ayuda?: string;
}) {
  const api = useApiAdmin();
  const [valor, setValor] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);
  const [enviando, setEnviando] = useState(false);

  const ejecutar = async (accion: () => Promise<void>, exito: string, fallo: string) => {
    setMensaje(null);
    setEnviando(true);
    try {
      await accion();
      setMensaje({ tipo: 'exito', texto: exito });
      alCambiar();
    } catch (e) {
      setMensaje({ tipo: 'error', texto: mensajeDe(e, fallo) });
    } finally {
      setEnviando(false);
    }
  };

  const guardar = async () => {
    const validacion = validarClave(valor);
    if (validacion.error !== undefined) {
      setMensaje({ tipo: 'error', texto: validacion.error });
      return;
    }
    // El campo se vacía enseguida: la clave no queda en el estado de la pantalla.
    setValor('');
    await ejecutar(
      () => api.guardarClave(estado.nombre, validacion.valor),
      `Clave de ${servicio} guardada.`,
      'No se pudo guardar la clave.',
    );
  };

  const borrar = async () => {
    setConfirmando(false);
    await ejecutar(
      () => api.borrarClave(estado.nombre),
      `Clave de ${servicio} borrada.`,
      'No se pudo borrar la clave.',
    );
  };

  return (
    <div className="admin-clave">
      <fieldset>
        <legend>Clave de {servicio}</legend>
        <p className="admin-clave__estado">
          <code>{estado.nombre}</code>{' '}
          <span className="chip" data-configurada={estado.configurada}>
            {estado.configurada
              ? `Configurada · actualizada el ${estado.actualizadaEn === null ? '—' : fechaHora(estado.actualizadaEn)}`
              : 'No configurada'}
          </span>
        </p>
        <label className="admin-campo">
          Nueva clave de {servicio}
          <input
            type="password"
            autoComplete="new-password"
            spellCheck={false}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => {
              // Intro guarda la clave y no el formulario de parámetros que la contiene.
              if (e.key === 'Enter') {
                e.preventDefault();
                void guardar();
              }
            }}
          />
        </label>
        {ayuda !== undefined && <p className="admin-ayuda">{ayuda}</p>}
        {mensaje && <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>}
        <div className="admin-formulario__botones">
          {estado.configurada && !confirmando && (
            <button
              type="button"
              className="boton"
              onClick={() => setConfirmando(true)}
              disabled={enviando}
            >
              Borrar clave
            </button>
          )}
          {confirmando && (
            <>
              <span className="admin-ayuda admin-crece">
                ¿Borrar la clave? El recálculo usará {estado.nombre} de los secretos de Supabase, si
                existe.
              </span>
              <button type="button" className="boton" onClick={() => setConfirmando(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className="boton boton--peligro"
                onClick={() => void borrar()}
                disabled={enviando}
              >
                Sí, borrar {estado.nombre}
              </button>
            </>
          )}
          <button
            type="button"
            className="boton boton--primario"
            onClick={() => void guardar()}
            disabled={enviando}
          >
            {estado.configurada ? 'Reemplazar clave' : 'Guardar clave'}
          </button>
        </div>
      </fieldset>
    </div>
  );
}

function descripcionCambio(cambio: string): string {
  if (cambio === 'parametros') return 'Parámetros actualizados';
  return cambio.charAt(0).toUpperCase() + cambio.slice(1);
}

function CambiosRecientes({ cambios }: { cambios: CambioConfiguracion[] }) {
  return (
    <section className="admin-tarjeta admin-configuracion__bloque" aria-labelledby="cambios">
      <h2 id="cambios">Cambios recientes</h2>
      {cambios.length === 0 ? (
        <p className="admin-ayuda">Todavía no hay cambios.</p>
      ) : (
        <ul className="admin-cambios" aria-label="Cambios recientes">
          {cambios.map((c) => (
            <li key={c.id}>
              {`${fechaHora(c.realizadoEn)} · ${c.realizadoPor ?? 'Sistema'} · ${descripcionCambio(c.cambio)}`}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * «Configuración del recálculo» (`/admin/configuracion`, issues #33 y #37): un resumen de lo que
 * usará de verdad el recálculo y un solo bloque guiado para elegir el clasificador, con sus
 * claves (Supabase Vault, nunca vuelven al navegador) y las opciones avanzadas. Solo administradores: la guarda de ruta oculta la pantalla y la base (RLS y
 * funciones `security definer`) rechaza a cualquier otro usuario.
 */
export function AdminConfiguracionPage() {
  const api = useApiAdmin();
  const { datos, error, cargando, recargar } = useCarga(
    useCallback(() => api.obtenerConfiguracion(), [api]),
  );

  return (
    <MarcoAdmin
      titulo="Configuración del recálculo"
      descripcion="Parámetros y claves que usan las Edge Functions al recalcular la importancia sugerida."
    >
      {cargando && datos === undefined && <p>Cargando la configuración…</p>}
      {!cargando && datos === undefined && (
        <>
          <Aviso tipo="error">{error ?? 'No se pudo leer la configuración.'}</Aviso>
          <button type="button" className="boton" onClick={recargar}>
            Reintentar
          </button>
        </>
      )}
      {datos !== undefined && (
        <div className="admin-configuracion">
          <p className="admin-ayuda">Última actualización: {fechaHora(datos.actualizadoEn)}</p>
          <section
            className="admin-tarjeta admin-configuracion__bloque admin-resumen"
            aria-labelledby="resumen-titulo"
          >
            <h2 id="resumen-titulo">Qué va a usar el recálculo</h2>
            <ResumenClasificador configuracion={datos} />
            <p className="admin-ayuda">Refleja lo que está guardado, no lo que estás editando.</p>
          </section>
          <ConfiguracionClasificador configuracion={datos} alGuardar={recargar} />
          <CambiosRecientes cambios={datos.cambios} />
          <Aviso>
            Los orígenes permitidos del frontend (ORIGENES_PERMITIDOS) no se cambian desde aquí:
            siguen siendo un secreto de Supabase.
          </Aviso>
        </div>
      )}
    </MarcoAdmin>
  );
}
