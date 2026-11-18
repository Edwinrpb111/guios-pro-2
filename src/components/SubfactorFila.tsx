import { CUMPLIMIENTO, type Cumplimiento } from '../guios-core/escalas';
import { SegmentedSelector } from './SegmentedSelector';

export interface SubfactorFilaProps {
  /** Posición del subfactor dentro de su factor (1, 2, 3…). */
  numero: number;
  enunciado: string;
  /** Cumplimiento (PS) valorado; `null` si aún no se valoró. */
  valor: Cumplimiento | null;
  deshabilitado?: boolean;
  onCambiar: (valor: Cumplimiento) => void;
}

const NIVELES: readonly Cumplimiento[] = [1, 2, 3, 4];
const OPCIONES = NIVELES.map((valor) => ({ valor, etiqueta: CUMPLIMIENTO[valor] }));

/**
 * Fila de un subfactor en P-05: su enunciado y el cumplimiento en un clic (BRIEF §12.2).
 * Solo recibe props y emite eventos; la PM y el FODA los calcula `guios-core` en la pantalla.
 */
export function SubfactorFila({
  numero,
  enunciado,
  valor,
  deshabilitado = false,
  onCambiar,
}: SubfactorFilaProps) {
  return (
    <div className="subfactor-fila" data-valorado={valor !== null}>
      <span className="subfactor-fila__numero" aria-hidden="true">
        {numero}
      </span>
      <div className="subfactor-fila__enunciado">
        <span>{enunciado}</span>
        {valor === null && <small className="subfactor-fila__falta">Sin valorar</small>}
      </div>
      <SegmentedSelector
        etiqueta={`Cumplimiento: ${enunciado}`}
        opciones={OPCIONES}
        valor={valor}
        onCambiar={onCambiar}
        deshabilitado={deshabilitado}
        variante="cumplimiento"
      />
    </div>
  );
}
