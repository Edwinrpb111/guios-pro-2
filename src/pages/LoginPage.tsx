import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router';
import { Cargando } from '../auth/Cargando';
import { useAuth } from '../auth/useAuth';

type Modo = 'ingresar' | 'registrar';

const MINIMO_CONTRASENA = 8;

/** P-01: inicio de sesión y registro con correo y contraseña. */
export function LoginPage() {
  const { sesion, cargando, iniciarSesion, registrar } = useAuth();
  const ubicacion = useLocation();
  const [modo, setModo] = useState<Modo>('ingresar');
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (cargando) return <Cargando />;
  if (sesion) {
    const desde = (ubicacion.state as { desde?: string } | null)?.desde;
    return <Navigate to={desde ?? '/'} replace />;
  }

  function cambiarModo(nuevo: Modo) {
    setModo(nuevo);
    setError(null);
    setAviso(null);
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError(null);
    setAviso(null);
    if (modo === 'registrar' && contrasena.length < MINIMO_CONTRASENA) {
      setError(`La contraseña debe tener al menos ${MINIMO_CONTRASENA} caracteres.`);
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

  return (
    <main className="pagina">
      <h1>GUIOS PRO 2.0</h1>
      <p>Evaluación de la adopción de software libre en organizaciones.</p>

      <div role="tablist" aria-label="Acceso">
        <button
          type="button"
          role="tab"
          aria-selected={!esRegistro}
          onClick={() => cambiarModo('ingresar')}
        >
          Iniciar sesión
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={esRegistro}
          onClick={() => cambiarModo('registrar')}
        >
          Crear cuenta
        </button>
      </div>

      <form onSubmit={(e) => void enviar(e)} aria-label={textoAccion}>
        {esRegistro && (
          <p>
            <label>
              Nombre completo
              <br />
              <input
                type="text"
                name="nombre_completo"
                autoComplete="name"
                required
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </label>
          </p>
        )}
        <p>
          <label>
            Correo electrónico
            <br />
            <input
              type="email"
              name="correo"
              autoComplete="email"
              required
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
            />
          </label>
        </p>
        <p>
          <label>
            Contraseña
            <br />
            <input
              type="password"
              name="contrasena"
              autoComplete={esRegistro ? 'new-password' : 'current-password'}
              required
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
            />
          </label>
        </p>
        {error && <p role="alert">{error}</p>}
        {aviso && <p role="status">{aviso}</p>}
        <button type="submit" disabled={enviando}>
          {enviando ? textoEnviando : textoAccion}
        </button>
      </form>
    </main>
  );
}
