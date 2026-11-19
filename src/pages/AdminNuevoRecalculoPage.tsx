import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useApiAdmin } from '../admin/contexto';
import { EstadoClasificador } from '../admin/EstadoClasificador';
import { validarNuevoRecalculo } from '../admin/formulario';
import { Aviso, MarcoAdmin } from '../admin/MarcoAdmin';
import { FUENTES, type FuenteBibliografica } from '../admin/tipos';

const ANIO_FIN_POR_DEFECTO = 2025;

/**
 * P-09 (configuración): años y fuentes del recálculo; lo crea con `recalculo-iniciar`. Arriba, el
 * estado del clasificador con un enlace a «Configuración del recálculo» (issue #33).
 */
export function AdminNuevoRecalculoPage() {
  const api = useApiAdmin();
  const navegar = useNavigate();
  const [anioInicio, setAnioInicio] = useState('2020');
  const [anioFin, setAnioFin] = useState(String(ANIO_FIN_POR_DEFECTO));
  const [fuentes, setFuentes] = useState<FuenteBibliografica[]>(FUENTES.map((f) => f.id));
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const alternarFuente = (fuente: FuenteBibliografica) =>
    setFuentes((actuales) =>
      actuales.includes(fuente) ? actuales.filter((f) => f !== fuente) : [...actuales, fuente],
    );

  const iniciar = async (evento: FormEvent) => {
    evento.preventDefault();
    const validacion = validarNuevoRecalculo({ anioInicio, anioFin, fuentes });
    if (validacion.error !== undefined) {
      setError(validacion.error);
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      const id = await api.iniciarRecalculo(validacion.entrada);
      navegar(`/admin/sugerida/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar el recálculo.');
      setEnviando(false);
    }
  };

  return (
    <MarcoAdmin
      titulo="Nuevo recálculo"
      descripcion="Recalcula la importancia sugerida de los 18 factores con literatura reciente."
    >
      <EstadoClasificador />
      <form className="admin-tarjeta admin-formulario" onSubmit={(e) => void iniciar(e)} noValidate>
        <div className="admin-formulario__anios">
          <label>
            Desde (año)
            <input
              inputMode="numeric"
              value={anioInicio}
              onChange={(e) => setAnioInicio(e.target.value)}
            />
          </label>
          <label>
            Hasta (año)
            <input
              inputMode="numeric"
              value={anioFin}
              onChange={(e) => setAnioFin(e.target.value)}
            />
          </label>
        </div>
        <fieldset>
          <legend>Fuentes bibliográficas</legend>
          {FUENTES.map((f) => (
            <label key={f.id} className="admin-formulario__fuente">
              <input
                type="checkbox"
                checked={fuentes.includes(f.id)}
                onChange={() => alternarFuente(f.id)}
              />{' '}
              {f.nombre} <span className="admin-ayuda">· abierta</span>
            </label>
          ))}
        </fieldset>
        <Aviso>
          Para cada <b>subfactor</b> se buscan artículos sobre adopción de software libre en las
          fuentes elegidas y la IA solo <b>clasifica</b> si cada artículo lo trata: nunca inventa
          referencias. cᵢ es la suma de las citas de los subfactores del factor (tesis, paso 2a). El
          recálculo avanza un subfactor por vez; si cierras la pestaña, se retoma desde lo
          pendiente.
        </Aviso>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <div className="admin-formulario__botones">
          <Link className="boton" to="/admin/sugerida">
            Cancelar
          </Link>
          <button type="submit" className="boton boton--primario" disabled={enviando}>
            {enviando ? 'Iniciando…' : 'Iniciar recálculo'}
          </button>
        </div>
      </form>
    </MarcoAdmin>
  );
}
