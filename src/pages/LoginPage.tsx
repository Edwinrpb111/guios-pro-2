import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Navigate, useLocation } from 'react-router';
import { Cargando } from '../auth/Cargando';
import { useAuth } from '../auth/useAuth';

type Modo = 'ingresar' | 'registrar';

const MINIMO_CONTRASENA = 8;

const PESTANAS: readonly { modo: Modo; texto: string }[] = [
  { modo: 'ingresar', texto: 'Iniciar sesión' },
  { modo: 'registrar', texto: 'Crear cuenta' },
];

/** Los seis pasos del método GUIOS agrupados como en el prototipo del CP1. */
const PASOS_METODO: readonly { pasos: string; texto: string }[] = [
  { pasos: 'Pasos 1 y 2', texto: 'Importancia y factores relevantes' },
  { pasos: 'Pasos 3 y 4', texto: 'Subfactores y ponderación' },
  { pasos: 'Pasos 5 y 6', texto: 'FODA y recomendación' },
];

/** P-01: inicio de sesión y registro con correo y contraseña. */
export function LoginPage() {
  const { sesion, cargando, iniciarSesion, registrar } = useAuth();
  const ubicacion = useLocation();
  const [modo, setModo] = useState<Modo>('ingresar');
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [contrasenaInvalida, setContrasenaInvalida] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const pestanas = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();

  if (cargando) return <Cargando />;
  if (sesion) {
    const desde = (ubicacion.state as { desde?: string } | null)?.desde;
    return <Navigate to={desde ?? '/'} replace />;
  }

  function cambiarModo(nuevo: Modo) {
    setModo(nuevo);
    setError(null);
    setContrasenaInvalida(false);
    setAviso(null);
  }

  /** Patrón de pestañas de WAI-ARIA: flechas, Inicio y Fin cambian de pestaña y la enfocan. */
  function alTeclearPestana(evento: KeyboardEvent<HTMLButtonElement>) {
    const actual = PESTANAS.findIndex((p) => p.modo === modo);
    const total = PESTANAS.length;
    const destinos: Record<string, number> = {
      ArrowRight: (actual + 1) % total,
      ArrowLeft: (actual - 1 + total) % total,
      Home: 0,
      End: total - 1,
    };
    const destino = destinos[evento.key];
    const pestana = destino === undefined ? undefined : PESTANAS[destino];
    if (destino === undefined || !pestana) return;
    evento.preventDefault();
    cambiarModo(pestana.modo);
    pestanas.current[destino]?.focus();
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError(null);
    setContrasenaInvalida(false);
    setAviso(null);
    if (modo === 'registrar' && contrasena.length < MINIMO_CONTRASENA) {
      setError(`La contraseña debe tener al menos ${MINIMO_CONTRASENA} caracteres.`);
      setContrasenaInvalida(true);
      return;
    }
    setEnviando(true);
    try {
      if (modo === 'ingresar') {
        const resultado = await iniciarSesion(correo, contrasena);
        if (resultado.error) setError(resultado.error);
      } else {
        const resultado = await registrar(nombre.trim(), correo, contrasena);
        if (resultado.error) setError(resultado.error);
        else if (resultado.requiereConfirmacion) {
          setAviso('Revisa tu correo y confirma tu cuenta para poder iniciar sesión.');
        }
      }
    } finally {
      setEnviando(false);
    }
  }

  const esRegistro = modo === 'registrar';
  const textoAccion = esRegistro ? 'Crear cuenta' : 'Iniciar sesión';
  const textoEnviando = esRegistro ? 'Creando…' : 'Ingresando…';
  const idPestana = (m: Modo) => `${id}-pestana-${m}`;
  const idPanel = `${id}-panel`;
  const idAyudaContrasena = `${id}-ayuda-contrasena`;
  const idError = `${id}-error`;
  const descripcionContrasena =
    [esRegistro && idAyudaContrasena, contrasenaInvalida && idError].filter(Boolean).join(' ') ||
    undefined;

  return (
    <main className="acceso">
      <section className="acceso__presentacion" aria-labelledby={`${id}-marca`}>
        <div className="acceso__marca">
          <span className="layout__logo" aria-hidden="true">
            G
          </span>
          <h1 id={`${id}-marca`} className="acceso__nombre">
            GUIOS PRO <span className="layout__version">2.0</span>
          </h1>
        </div>
        <div className="acceso__mensaje">
          <p className="acceso__lema">
            Decide con evidencia si un software libre es adecuado para tu organización.
          </p>
          <p className="acceso__descripcion">
            Guía GUIOS: 18 factores y 61 subfactores validados por la literatura y por expertos, con
            clasificación FODA y una recomendación de adopción.
          </p>
          <ul className="acceso__pasos" aria-label="Pasos del método">
            {PASOS_METODO.map((paso) => (
              <li key={paso.pasos}>
                <b>{paso.pasos}</b>
                {paso.texto}
              </li>
            ))}
          </ul>
        </div>
        <p className="acceso__pie">
          Basado en la tesis de Rea Sánchez (2022) · Universidad Estatal de Milagro (UNEMI)
        </p>
      </section>

      <section className="acceso__lado-formulario">
        <div className="acceso__tarjeta">
          <div role="tablist" aria-label="Acceso" className="acceso__pestanas">
            {PESTANAS.map((pestana, indice) => {
              const seleccionada = pestana.modo === modo;
              return (
                <button
                  key={pestana.modo}
                  ref={(nodo) => {
                    pestanas.current[indice] = nodo;
                  }}
                  type="button"
                  role="tab"
                  id={idPestana(pestana.modo)}
                  aria-selected={seleccionada}
                  aria-controls={idPanel}
                  tabIndex={seleccionada ? 0 : -1}
                  className="acceso__pestana"
                  onClick={() => cambiarModo(pestana.modo)}
                  onKeyDown={alTeclearPestana}
                >
                  {pestana.texto}
                </button>
              );
            })}
          </div>

          <div role="tabpanel" id={idPanel} aria-labelledby={idPestana(modo)}>
            <h2 className="acceso__titulo">
              {esRegistro ? 'Crea tu cuenta' : 'Ingresa a tu cuenta'}
            </h2>
            <p className="acceso__subtitulo">
              {esRegistro
                ? 'Regístrate con tu correo para guardar tus evaluaciones.'
                : 'Continúa con tus evaluaciones de software libre.'}
            </p>

            <form
              onSubmit={(e) => void enviar(e)}
              aria-label={textoAccion}
              aria-busy={enviando}
              className="acceso__formulario"
            >
              {esRegistro && (
                <div className="campo">
                  <label htmlFor={`${id}-nombre`}>Nombre completo</label>
                  <input
                    id={`${id}-nombre`}
                    type="text"
                    name="nombre_completo"
                    autoComplete="name"
                    placeholder="Ej.: María Pérez"
                    required
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                  />
                </div>
              )}
              <div className="campo">
                <label htmlFor={`${id}-correo`}>Correo electrónico</label>
                <input
                  id={`${id}-correo`}
                  type="email"
                  name="correo"
                  autoComplete="email"
                  placeholder="nombre@organizacion.com"
                  required
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                />
              </div>
              <div className="campo">
                <label htmlFor={`${id}-contrasena`}>Contraseña</label>
                <input
                  id={`${id}-contrasena`}
                  type="password"
                  name="contrasena"
                  autoComplete={esRegistro ? 'new-password' : 'current-password'}
                  required
                  aria-invalid={contrasenaInvalida || undefined}
                  aria-describedby={descripcionContrasena}
                  value={contrasena}
                  onChange={(e) => setContrasena(e.target.value)}
                />
                {esRegistro && (
                  <p id={idAyudaContrasena} className="ayuda-texto acceso__ayuda">
                    Mínimo {MINIMO_CONTRASENA} caracteres.
                  </p>
                )}
              </div>
              {error && (
                <p id={idError} role="alert" className="alerta alerta--error">
                  {error}
                </p>
              )}
              {aviso && (
                <p role="status" className="alerta alerta--info">
                  {aviso}
                </p>
              )}
              <button
                type="submit"
                disabled={enviando}
                className="boton boton--primario acceso__enviar"
              >
                {enviando && <span className="acceso__giro" aria-hidden="true" />}
                {enviando ? textoEnviando : textoAccion}
              </button>
              {esRegistro && (
                <p className="ayuda-texto acceso__nota">
                  Las cuentas nuevas tienen rol de decisor. El rol de administrador lo asigna otro
                  administrador.
                </p>
              )}
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
