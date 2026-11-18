import { useCallback, useId, useState, type FormEvent } from 'react';
import { useApiAdmin } from '../admin/contexto';
import {
  formularioDesdeParametros,
  validarClave,
  validarConfiguracion,
  type FormularioConfiguracion,
} from '../admin/formularioConfiguracion';
import { Aviso, MarcoAdmin } from '../admin/MarcoAdmin';
import {
  CLAVES,
  type CambioConfiguracion,
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

/** Parámetros no secretos. Un campo vacío usa el secreto de Supabase o el valor por defecto. */
function FormularioParametros({
  inicial,
  alGuardar,
}: {
  inicial: ParametrosRecalculo;
  alGuardar: () => void;
}) {
  const api = useApiAdmin();
  const id = useId();
  const [formulario, setFormulario] = useState<FormularioConfiguracion>(() =>
    formularioDesdeParametros(inicial),
  );
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);
  const [enviando, setEnviando] = useState(false);

  const campo =
    (nombre: keyof FormularioConfiguracion) => (evento: { target: { value: string } }) =>
      setFormulario((actual) => ({ ...actual, [nombre]: evento.target.value }));

  const guardar = async (evento: FormEvent) => {
    evento.preventDefault();
    const validacion = validarConfiguracion(formulario);
    if (validacion.error !== undefined) {
      setMensaje({ tipo: 'error', texto: validacion.error });
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

  return (
    <form
      className="admin-tarjeta admin-formulario admin-configuracion__bloque"
      onSubmit={(e) => void guardar(e)}
      noValidate
    >
      <h2>Clasificador y búsqueda</h2>
      <p className="admin-ayuda">
        Un campo vacío usa el secreto de Supabase de la Edge Function o, si tampoco existe, el valor
        por defecto.
      </p>
      <label className="admin-campo" htmlFor={`${id}-select`}>
        Proveedor del clasificador
      </label>
      <div className="admin-campo">
        <select
          id={`${id}-select`}
          value={formulario.proveedorLlm}
          onChange={campo('proveedorLlm')}
          aria-describedby={`${id}-proveedor`}
        >
          <option value="">Usar el secreto de Supabase (LLM_PROVIDER)</option>
          <option value="gemini">Gemini</option>
          <option value="fake">Falso (demostración, sin red)</option>
        </select>
      </div>
      <span id={`${id}-proveedor`} className="admin-ayuda admin-campo__ayuda">
        Con el falso no hace falta ninguna clave y el resultado siempre es el mismo.
      </span>
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
        Vacío: LLM_MODEL o gemini-3.1-flash-lite.
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
      {mensaje && <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>}
      <div className="admin-formulario__botones">
        <button type="submit" className="boton boton--primario" disabled={enviando}>
          {enviando ? 'Guardando…' : 'Guardar parámetros'}
        </button>
      </div>
    </form>
  );
}

/** Una clave de solo escritura: se guarda, se reemplaza o se borra; nunca se muestra. */
function CampoClave({
  estado,
  servicio,
  alCambiar,
}: {
  estado: EstadoClave;
  servicio: string;
  alCambiar: () => void;
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

  const guardar = async (evento: FormEvent) => {
    evento.preventDefault();
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
    <form className="admin-clave" onSubmit={(e) => void guardar(e)} noValidate>
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
          />
        </label>
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
              <button type="button" className="boton" onClick={() => void borrar()}>
                Sí, borrar
              </button>
            </>
          )}
          <button type="submit" className="boton boton--primario" disabled={enviando}>
            {estado.configurada ? 'Reemplazar clave' : 'Guardar clave'}
          </button>
        </div>
      </fieldset>
    </form>
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
 * «Configuración del recálculo» (`/admin/configuracion`, issue #33): parámetros del clasificador
 * y de la búsqueda, y las claves de las APIs, que se guardan en Supabase Vault y nunca vuelven al
 * navegador. Solo administradores: la guarda de ruta oculta la pantalla y la base (RLS y
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
          <FormularioParametros inicial={datos.parametros} alGuardar={recargar} />
          <section
            className="admin-tarjeta admin-configuracion__bloque"
            aria-labelledby="claves-titulo"
          >
            <h2 id="claves-titulo">Claves de las APIs</h2>
            <p className="admin-ayuda">
              Se guardan cifradas en Supabase Vault y nunca se vuelven a mostrar. Si una clave no
              está guardada aquí, el recálculo usa la del secreto de Supabase con el mismo nombre.
            </p>
            {CLAVES.map(({ nombre, servicio }) => (
              <CampoClave
                key={nombre}
                servicio={servicio}
                estado={
                  datos.claves.find((c) => c.nombre === nombre) ?? {
                    nombre: nombre as NombreClave,
                    configurada: false,
                    actualizadaEn: null,
                  }
                }
                alCambiar={recargar}
              />
            ))}
          </section>
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
