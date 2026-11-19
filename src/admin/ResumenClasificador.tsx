import { resumirClasificador } from './resumenDelClasificador';
import type { ConfiguracionRecalculo } from './tipos';

/** Líneas del resumen del clasificador: la misma redacción en P-09 y en la configuración. */
export function ResumenClasificador({
  configuracion,
}: {
  configuracion: Pick<ConfiguracionRecalculo, 'parametros' | 'claves'>;
}) {
  const { principal, avisos, conProblema } = resumirClasificador(configuracion);
  return (
    <>
      <p className="admin-resumen__principal">
        <b>{principal}</b>
      </p>
      {avisos.map((aviso, i) => (
        <p key={aviso} className={i === 0 && conProblema ? 'admin-resumen__alerta' : 'admin-ayuda'}>
          {aviso}
        </p>
      ))}
    </>
  );
}
