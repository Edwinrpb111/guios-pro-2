import { IMPORTANCIA, type Alcance, type Importancia } from '../guios-core/escalas';
import { AyudaContextual } from './AyudaContextual';
import { SegmentedSelector } from './SegmentedSelector';

export interface FactorFilaProps {
  nombre: string;
  totalSubfactores: number;
  /** Alcance con el que se evalúa el factor. */
  alcance: Alcance;
  /** `true` solo para los factores «Ambos» (Soporte): se elige Interno o Externo. */
  alcanceEditable: boolean;
  /** Importancia sugerida (IS) vigente. */
  importanciaSugerida: Importancia;
  /** Explicación de dónde sale la IS (IE, IL y cálculo vigente). */
  ayudaSugerida: string;
  /** Importancia del decisor (ID); `null` si aún no la asignó. */
  importanciaDecisor: Importancia | null;
  /** Importancia relativa (IR) calculada; `null` si aún no hay ID. */
  importanciaRelativa: Importancia | null;
  relevante: boolean;
  deshabilitado?: boolean;
  onCambiarImportancia: (valor: Importancia) => void;
  onCambiarAlcance: (valor: Alcance) => void;
}

const NIVELES: readonly Importancia[] = [1, 2, 3, 4];
const OPCIONES_IMPORTANCIA = NIVELES.map((valor) => ({ valor, etiqueta: IMPORTANCIA[valor] }));
const OPCIONES_ALCANCE: readonly { valor: Alcance; etiqueta: string }[] = [
  { valor: 'Interno', etiqueta: 'Interno' },
  { valor: 'Externo', etiqueta: 'Externo' },
];

/**
 * Fila de un factor en P-04: IS vigente con ayuda, importancia del decisor en un clic,
 * importancia relativa y relevancia (siempre con texto además del color).
 * Solo recibe props y emite eventos; los valores los calcula `guios-core` en la pantalla.
 */
export function FactorFila({
  nombre,
  totalSubfactores,
  alcance,
  alcanceEditable,
  importanciaSugerida,
  ayudaSugerida,
  importanciaDecisor,
  importanciaRelativa,
  relevante,
  deshabilitado = false,
  onCambiarImportancia,
  onCambiarAlcance,
}: FactorFilaProps) {
  return (
    <div className="factor-fila">
      <div className="factor-fila__nombre">
        <b>{nombre}</b>
        <div className="factor-fila__meta">
          <span className="chip">
            {totalSubfactores} {totalSubfactores === 1 ? 'subfactor' : 'subfactores'}
          </span>
          {alcanceEditable ? (
            <SegmentedSelector
              etiqueta={`Alcance del factor ${nombre}`}
              opciones={OPCIONES_ALCANCE}
              valor={alcance}
              onCambiar={onCambiarAlcance}
              deshabilitado={deshabilitado}
            />
          ) : (
            <span className="chip">{alcance}</span>
          )}
        </div>
      </div>
      <div className="factor-fila__sugerida">
        Sugerida
        <AyudaContextual
          etiqueta={`Ayuda sobre la importancia sugerida de ${nombre}`}
          texto={ayudaSugerida}
        />
        <b>{IMPORTANCIA[importanciaSugerida]}</b>
      </div>
      <SegmentedSelector
        etiqueta={`Importancia del factor ${nombre}`}
        opciones={OPCIONES_IMPORTANCIA}
        valor={importanciaDecisor}
        onCambiar={onCambiarImportancia}
        deshabilitado={deshabilitado}
        variante="importancia"
      />
      <div className="factor-fila__ir">
        {importanciaRelativa === null ? (
          <span className="factor-fila__tenue">Asigna tu importancia</span>
        ) : (
          <>
            <span className="factor-fila__tenue">Imp. relativa</span>
            <b className="factor-fila__ir-valor">{IMPORTANCIA[importanciaRelativa]}</b>
            {relevante ? (
              <span className="factor-fila__relevante">● Relevante</span>
            ) : (
              <span className="factor-fila__excluido">○ Se excluye</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
