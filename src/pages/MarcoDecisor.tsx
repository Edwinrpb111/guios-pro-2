import { type ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { Layout } from '../components/Layout';
import { useNuevaEvaluacion } from '../evaluacion/consultas';
import { iniciales, nombreDeUsuario } from '../evaluacion/usuario';
import { AyudaMetodo } from './AyudaMetodo';
import { IconoIA, IconoInicio, IconoNueva, IconoSalir } from './iconos';
import { ContextoMarco } from './marco';

/** Un enlace de la sección «Administración» del menú (solo para administradores). */
interface EnlaceAdministracion {
  ruta: string;
  icono: ReactNode;
  texto: string;
  /** Texto corto de la barra inferior móvil. */
  textoMovil: string;
}

/**
 * Pantallas de administración del menú. `NavLink` sin `end`: el ítem queda activo también en
 * sus subrutas (P-09 en `/admin/sugerida/nuevo` y `/admin/sugerida/:id`). Aquí se sumará
 * «Configuración del recálculo» (issue #33).
 */
const ENLACES_ADMINISTRACION: readonly EnlaceAdministracion[] = [
  {
    ruta: '/admin/sugerida',
    icono: <IconoIA />,
    texto: 'Importancia sugerida',
    textoMovil: 'IA',
  },
];

export interface MarcoDecisorProps {
  /** Barra inferior de acciones del paso (P-03, P-04). */
  barraInferior?: ReactNode;
  children: ReactNode;
}

/**
 * Marco común de la aplicación con sesión: las pantallas del decisor (P-02..P-06) y las de
 * administración (P-08..P-10). Cabecera con el usuario y la ayuda del método, navegación
 * lateral y móvil, y la acción «Nueva evaluación». Une `Layout` con la sesión y el repositorio.
 */
export function MarcoDecisor({ barraInferior, children }: MarcoDecisorProps) {
  const { usuario, rol, cerrarSesion } = useAuth();
  const { crear, creando, error } = useNuevaEvaluacion();
  const nombre = nombreDeUsuario(usuario);
  const esAdministrador = rol === 'administrador';

  return (
    <Layout
      usuario={{
        nombre,
        iniciales: iniciales(nombre),
        detalle: esAdministrador ? 'Administrador' : 'Decisor',
      }}
      navegacion={
        <>
          <div className="nav-etiqueta">Decisor</div>
          <NavLink to="/" end>
            <IconoInicio /> Inicio e historial
          </NavLink>
          <button type="button" className="nav-boton" onClick={crear} disabled={creando}>
            <IconoNueva /> Nueva evaluación
          </button>
          {esAdministrador && (
            <>
              <div className="nav-etiqueta">Administración</div>
              {ENLACES_ADMINISTRACION.map((enlace) => (
                <NavLink key={enlace.ruta} to={enlace.ruta}>
                  {enlace.icono} {enlace.texto}
                </NavLink>
              ))}
            </>
          )}
          <div className="nav-etiqueta">Cuenta</div>
          <button type="button" className="nav-boton" onClick={() => void cerrarSesion()}>
            <IconoSalir /> Cerrar sesión
          </button>
        </>
      }
      navegacionMovil={
        <>
          <NavLink to="/" end>
            <IconoInicio />
            Inicio
          </NavLink>
          <button type="button" className="nav-boton" onClick={crear} disabled={creando}>
            <IconoNueva />
            Evaluar
          </button>
          {esAdministrador &&
            ENLACES_ADMINISTRACION.map((enlace) => (
              <NavLink key={enlace.ruta} to={enlace.ruta}>
                {enlace.icono}
                {enlace.textoMovil}
              </NavLink>
            ))}
        </>
      }
      accionesCabecera={<AyudaMetodo />}
      barraInferior={barraInferior}
    >
      <ContextoMarco.Provider value={{ crearEvaluacion: crear, creandoEvaluacion: creando }}>
        {error && (
          <div role="alert" className="alerta alerta--error">
            No se pudo crear la evaluación: {error}
          </div>
        )}
        {children}
      </ContextoMarco.Provider>
    </Layout>
  );
}

/**
 * El marco como ruta de diseño: las rutas hijas se dibujan en su contenido. Lo usan P-08..P-10
 * (`/admin/*`), que así comparten la barra lateral con Inicio y la evaluación (issue #31).
 */
export function MarcoDeRuta() {
  return (
    <MarcoDecisor>
      <Outlet />
    </MarcoDecisor>
  );
}
