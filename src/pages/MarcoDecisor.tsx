import { type ReactNode } from 'react';
import { NavLink } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { Layout } from '../components/Layout';
import { useNuevaEvaluacion } from '../evaluacion/consultas';
import { iniciales, nombreDeUsuario } from '../evaluacion/usuario';
import { AyudaMetodo } from './AyudaMetodo';
import { IconoIA, IconoInicio, IconoNueva, IconoSalir } from './iconos';
import { ContextoMarco } from './marco';

export interface MarcoDecisorProps {
  /** Barra inferior de acciones del paso (P-03, P-04). */
  barraInferior?: ReactNode;
  children: ReactNode;
}

/**
 * Marco común de las pantallas del decisor (P-02..P-06): cabecera con el usuario, navegación
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
              <NavLink to="/admin/sugerida">
                <IconoIA /> Importancia sugerida
              </NavLink>
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
          {esAdministrador && (
            <NavLink to="/admin/sugerida">
              <IconoIA />
              IA
            </NavLink>
          )}
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
