export interface PasoStepper {
  id: string;
  titulo: string;
  subtitulo?: string;
  completado?: boolean;
  /** Si se puede ir a este paso; por defecto, solo los completados. */
  habilitado?: boolean;
}

export interface StepperProps {
  pasos: readonly PasoStepper[];
  /** Id del paso actual. */
  actual: string;
  onIrAPaso?: (id: string) => void;
}

/**
 * Stepper de la evaluación. En escritorio muestra todos los pasos; por debajo de 760 px
 * se reduce a «Paso n de N» con una barra de avance (BRIEF §12.3).
 */
export function Stepper({ pasos, actual, onIrAPaso }: StepperProps) {
  const indiceActual = pasos.findIndex((p) => p.id === actual);
  const numeroActual = indiceActual + 1;
  const porcentaje = pasos.length > 0 ? Math.round((numeroActual / pasos.length) * 100) : 0;

  return (
    <div className="stepper">
      <nav aria-label="Pasos de la evaluación">
        <ol className="stepper__lista">
          {pasos.map((paso, indice) => {
            const esActual = paso.id === actual;
            const habilitado = paso.habilitado ?? paso.completado ?? false;
            return (
              <li key={paso.id} className="stepper__item">
                <button
                  type="button"
                  className="stepper__paso"
                  aria-current={esActual ? 'step' : undefined}
                  data-completado={paso.completado ?? false}
                  disabled={!esActual && !habilitado}
                  onClick={() => {
                    if (!esActual) onIrAPaso?.(paso.id);
                  }}
                >
                  <span className="stepper__numero" aria-hidden="true">
                    {paso.completado && !esActual ? '✓' : indice + 1}
                  </span>
                  <span>
                    <b className="stepper__titulo">{paso.titulo}</b>
                    {paso.subtitulo && <span className="stepper__subtitulo">{paso.subtitulo}</span>}
                    {paso.completado && <span className="solo-lectores">completado</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
      <div className="stepper__movil">
        <div className="stepper__movil-fila">
          <span>
            Paso {numeroActual} de {pasos.length}
          </span>
          <b>{indiceActual >= 0 ? pasos[indiceActual]?.titulo : ''}</b>
        </div>
        <div
          className="stepper__barra"
          role="progressbar"
          aria-label="Avance de la evaluación"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={porcentaje}
        >
          <div className="stepper__barra-relleno" style={{ width: `${porcentaje}%` }} />
        </div>
      </div>
    </div>
  );
}
