export interface FilaHistorial {
  id: number;
  titulo: string;
  /** Línea secundaria (p. ej. «LibreOffice 7.x · MPL 2.0»). */
  detalle: string;
  organizacion: string;
  /** Fecha ya formateada. */
  fecha: string;
  estado: 'en_curso' | 'finalizada';
  /** Avance 0..100; se muestra solo en las que están en curso. */
  avance: number;
  recomendacion: 'A' | 'B' | 'C' | null;
  /** Si se ofrece «Eliminar» en la fila (solo cuando hay `onEliminar`). */
  eliminable?: boolean;
}

export interface HistorialTablaProps {
  filas: readonly FilaHistorial[];
  textoVacio?: string;
  /** Se emite al pulsar «Continuar» o «Ver resultados». */
  onAbrir: (id: number) => void;
  /** Se emite al pulsar «Eliminar»; la confirmación la pide quien usa la tabla. */
  onEliminar?: (id: number) => void;
}

/** Tabla del historial de evaluaciones (P-02); en móvil cada fila pasa a tarjeta. */
export function HistorialTabla({
  filas,
  textoVacio = 'No hay evaluaciones para mostrar.',
  onAbrir,
  onEliminar,
}: HistorialTablaProps) {
  if (filas.length === 0) return <p className="historial__vacio">{textoVacio}</p>;
  return (
    <table className="tabla tabla--tarjetas">
      <thead>
        <tr>
          <th scope="col">Evaluación</th>
          <th scope="col">Organización</th>
          <th scope="col">Fecha</th>
          <th scope="col">Estado</th>
          <th scope="col">Rec.</th>
          <th scope="col">
            <span className="solo-lectores">Acción</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {filas.map((fila) => {
          const finalizada = fila.estado === 'finalizada';
          const titulo = fila.titulo.trim() === '' ? 'Evaluación sin título' : fila.titulo;
          return (
            <tr key={fila.id}>
              <td data-etiqueta="Evaluación">
                <b>{titulo}</b>
                {fila.detalle && <div className="tabla__detalle">{fila.detalle}</div>}
              </td>
              <td data-etiqueta="Organización">{fila.organizacion}</td>
              <td data-etiqueta="Fecha">{fila.fecha}</td>
              <td data-etiqueta="Estado">
                <span className="estado-pildora" data-estado={fila.estado}>
                  {finalizada ? 'Finalizada' : `En curso · ${fila.avance} %`}
                </span>
              </td>
              <td data-etiqueta="Recomendación">
                {fila.recomendacion ? (
                  <span
                    className="recomendacion-insignia"
                    data-codigo={fila.recomendacion}
                    aria-label={`Recomendación ${fila.recomendacion}`}
                  >
                    {fila.recomendacion}
                  </span>
                ) : (
                  <span className="tabla__tenue">—</span>
                )}
              </td>
              <td data-etiqueta="" className="tabla__acciones">
                <button
                  type="button"
                  className={
                    finalizada ? 'boton boton--chico' : 'boton boton--primario boton--chico'
                  }
                  aria-label={`${finalizada ? 'Ver resultados' : 'Continuar'} «${titulo}»`}
                  onClick={() => onAbrir(fila.id)}
                >
                  {finalizada ? 'Ver resultados' : 'Continuar'}
                </button>
                {onEliminar && fila.eliminable && (
                  <>
                    {' '}
                    <button
                      type="button"
                      className="boton boton--fantasma boton--chico"
                      aria-label={`Eliminar «${titulo}»`}
                      onClick={() => onEliminar(fila.id)}
                    >
                      Eliminar
                    </button>
                  </>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
