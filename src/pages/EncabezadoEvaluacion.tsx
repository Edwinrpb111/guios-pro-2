import { Link } from 'react-router';
import { Stepper, type PasoStepper } from '../components/Stepper';
import { rutaDeEvaluacion, type PasoEvaluacion } from '../evaluacion/historial';
import { useNavigate } from 'react-router';

export interface EncabezadoEvaluacionProps {
  idEvaluacion: number;
  titulo: string;
  descripcion: string;
  /** Nombre del cálculo de importancia sugerida asociado a la evaluación. */
  nombreCalculo: string;
  pasos: readonly PasoStepper[];
  actual: PasoEvaluacion;
}

/** Migas, título, cálculo de IS y stepper de los pasos de una evaluación (P-03..P-06). */
export function EncabezadoEvaluacion({
  idEvaluacion,
  titulo,
  descripcion,
  nombreCalculo,
  pasos,
  actual,
}: EncabezadoEvaluacionProps) {
  const navegar = useNavigate();
  const nombre = titulo.trim() === '' ? 'Nueva evaluación' : titulo;
  return (
    <>
      <div className="migas">
        <Link to="/">Inicio</Link> › {nombre}
      </div>
      <div className="cabecera-pagina">
        <div>
          <h1>{nombre}</h1>
          <p>{descripcion}</p>
        </div>
        <span className="chip chip--marino">IS: {nombreCalculo}</span>
      </div>
      <Stepper
        pasos={pasos}
        actual={actual}
        onIrAPaso={(paso) => void navegar(rutaDeEvaluacion(idEvaluacion, paso as PasoEvaluacion))}
      />
    </>
  );
}
