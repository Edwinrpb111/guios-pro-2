import { useCallback } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useApiAdmin } from '../admin/contexto';
import { DetalleCalculoPanel } from '../admin/DetalleCalculoPanel';
import { Aviso, MarcoAdmin } from '../admin/MarcoAdmin';
import {
  estaSinTerminar,
  formatearFecha,
  nombreCalculo,
  rangoCalculo,
  textoEstado,
} from '../admin/resultado';
import { useCarga } from '../admin/useCarga';

function Indicador({
  titulo,
  valor,
  detalle,
}: {
  titulo: string;
  valor: string;
  detalle?: string;
}) {
  return (
    <section className="admin-indicador" aria-label={titulo}>
      <h2 className="admin-indicador__titulo">{titulo}</h2>
      <p className="admin-indicador__valor">{valor}</p>
      {detalle && <p className="admin-ayuda">{detalle}</p>}
    </section>
  );
}

/** P-08: importancia sugerida vigente, historial de cálculos y acceso al recálculo (HU-08). */
export function AdminSugeridaPage() {
  const api = useApiAdmin();
  const [parametros, setParametros] = useSearchParams();
  const cargar = useCallback(async () => {
    const calculos = await api.listarCalculos();
    const vigente = calculos.find((c) => c.vigente) ?? null;
    const filasVigente = vigente ? await api.filasSugeridas(vigente.id) : [];
    return { calculos, vigente, filasVigente };
  }, [api]);
  const { datos, error, cargando } = useCarga(cargar);

  const detalle = Number(parametros.get('detalle'));
  const abrirDetalle = (id: number) => setParametros({ detalle: String(id) });
  const cerrarDetalle = useCallback(() => setParametros({}), [setParametros]);

  // En proceso o pausado: hay que terminarlo (o descartarlo) antes de iniciar otro.
  const enCurso = datos?.calculos.find((c) => c.estado === 'en_proceso' || c.estado === 'pausado');
  const porRevisar = datos?.calculos.find((c) => c.estado === 'completado');
  const pendiente = enCurso ?? porRevisar;

  return (
    <MarcoAdmin
      titulo="Importancia sugerida"
      descripcion="Recalcula la importancia sugerida de los 18 factores con literatura reciente."
      acciones={
        enCurso || !datos ? (
          <button type="button" className="boton boton--primario" disabled>
            Nuevo recálculo
          </button>
        ) : (
          <Link className="boton boton--primario" to="/admin/sugerida/nuevo">
            Nuevo recálculo
          </Link>
        )
      }
    >
      {cargando && <p>Cargando los cálculos…</p>}
      {error && <Aviso tipo="error">{error}</Aviso>}
      {datos && (
        <>
          {pendiente && (
            <Aviso>
              {pendiente === enCurso
                ? `Hay un recálculo ${textoEstado(pendiente).toLowerCase()} (${nombreCalculo(pendiente)}). `
                : `Hay un recálculo listo para revisar (${nombreCalculo(pendiente)}). `}
              <Link to={`/admin/sugerida/${pendiente.id}`}>
                {pendiente === enCurso ? 'Continuar el recálculo' : 'Revisar y publicar'}
              </Link>
            </Aviso>
          )}

          <div className="admin-indicadores">
            <Indicador
              titulo="Cálculo vigente"
              valor={datos.vigente ? nombreCalculo(datos.vigente) : 'Ninguno'}
              {...(datos.vigente ? { detalle: rangoCalculo(datos.vigente) } : {})}
            />
            <Indicador
              titulo="Factores con IS Importante"
              valor={String(datos.filasVigente.filter((f) => f.is === 3).length)}
            />
            <Indicador titulo="Cálculos registrados" valor={String(datos.calculos.length)} />
          </div>

          <section className="admin-tarjeta">
            <div className="admin-tarjeta__cabecera">
              <h2>Historial de cálculos</h2>
              <p className="admin-ayuda">
                Cada evaluación queda vinculada al cálculo con el que se hizo.
              </p>
            </div>
            <table className="admin-tabla">
              <caption className="solo-lectores">Historial de cálculos</caption>
              <thead>
                <tr>
                  <th scope="col">Cálculo</th>
                  <th scope="col">Origen</th>
                  <th scope="col">Rango</th>
                  <th scope="col">Fecha</th>
                  <th scope="col">Estado</th>
                  <th scope="col">
                    <span className="solo-lectores">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {datos.calculos.map((c) => (
                  <tr key={c.id}>
                    <th scope="row" data-l="Cálculo">
                      {nombreCalculo(c)}
                      <span className="admin-ayuda admin-bloque">{c.basesDatos ?? '—'}</span>
                    </th>
                    <td data-l="Origen">
                      <span className="chip" data-origen={c.origen}>
                        {c.origen === 'ia' ? 'Búsqueda asistida por IA' : 'Tesis'}
                      </span>
                    </td>
                    <td data-l="Rango">{rangoCalculo(c)}</td>
                    <td data-l="Fecha">{formatearFecha(c.fecha)}</td>
                    <td data-l="Estado">
                      <span
                        className="chip admin-estado"
                        data-estado={c.vigente ? 'vigente' : c.estado}
                      >
                        {textoEstado(c)}
                      </span>
                    </td>
                    <td className="admin-tabla__acciones">
                      {estaSinTerminar(c) && (
                        <Link className="boton" to={`/admin/sugerida/${c.id}`}>
                          {c.estado === 'completado' ? 'Revisar' : 'Continuar'}
                        </Link>
                      )}
                      <button
                        type="button"
                        className="boton"
                        onClick={() => abrirDetalle(c.id)}
                        aria-label={`Ver detalle de ${nombreCalculo(c)}`}
                      >
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
      {Number.isInteger(detalle) && detalle > 0 && (
        <DetalleCalculoPanel key={detalle} id={detalle} onCerrar={cerrarDetalle} />
      )}
    </MarcoAdmin>
  );
}
