import { useId, type ReactNode } from 'react';

export interface NivelAyuda {
  valor: number;
  nombre: string;
}

export interface RecomendacionAyuda {
  codigo: string;
  titulo: string;
  texto: string;
}

export interface AyudaMetodoContenidoProps {
  /** Niveles de importancia 1..4 (IE, IL, IS, ID, IR). */
  importancia: readonly NivelAyuda[];
  /** Opciones de cumplimiento de un subfactor 1..4 (PS). */
  cumplimiento: readonly NivelAyuda[];
  /** Una por cada resultado posible del método, con el texto oficial. */
  recomendaciones: readonly RecomendacionAyuda[];
  /** Un factor se evalúa si su importancia relativa es mayor que este valor. */
  umbralRelevancia: number;
  /** Una PM igual o mayor que este valor es favorable. */
  umbralFoda: number;
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="ayuda-metodo__seccion">
      <h3 id={id}>{titulo}</h3>
      {children}
    </section>
  );
}

function Escala({ etiqueta, niveles }: { etiqueta: string; niveles: readonly NivelAyuda[] }) {
  return (
    <ul aria-label={etiqueta} className="ayuda-metodo__escala">
      {niveles.map(({ valor, nombre }) => (
        <li key={valor}>
          {valor} · {nombre}
        </li>
      ))}
    </ul>
  );
}

/**
 * Contenido de la ayuda del método (P-11). Solo presenta lo que recibe: los nombres de los
 * niveles, los umbrales y los textos de las recomendaciones salen de `guios-core`, que es el
 * único lugar donde viven las reglas.
 */
export function AyudaMetodoContenido({
  importancia,
  cumplimiento,
  recomendaciones,
  umbralRelevancia,
  umbralFoda,
}: AyudaMetodoContenidoProps) {
  const nivelUmbral = importancia.find((nivel) => nivel.valor === umbralRelevancia);
  const nombreUmbral = nivelUmbral
    ? `«${nivelUmbral.nombre}» (${nivelUmbral.valor})`
    : umbralRelevancia;

  return (
    <div className="ayuda-metodo">
      <Seccion titulo="¿Qué evalúa GUIOS?">
        <p>
          GUIOS ayuda a decidir si un software libre (FLOSS) es adecuado para tu organización. Tú
          valoras 18 factores de tres dimensiones (tecnológica, organizacional y económica) y sus 61
          subfactores. El sistema clasifica cada factor con un enfoque FODA y emite una
          recomendación de adopción A, B o C. Todo se guarda solo mientras avanzas.
        </p>
      </Seccion>

      <Seccion titulo="Importancia: de dónde sale cada valor">
        <dl className="ayuda-metodo__glosario">
          <dt>IE</dt>
          <dd>Importancia del experto: la fijó la encuesta a expertos de la tesis.</dd>
          <dt>IL</dt>
          <dd>
            Importancia de la literatura: cuántos artículos tratan los subfactores del factor,
            convertido en un nivel.
          </dd>
          <dt>IS</dt>
          <dd>
            Importancia sugerida: la intersección de IE e IL. Es la que ves junto a cada factor y
            sale del cálculo vigente de importancia sugerida, que solo un administrador puede
            actualizar.
          </dd>
          <dt>ID</dt>
          <dd>Importancia del decisor: la que tú asignas a cada factor para tu organización.</dd>
          <dt>IR</dt>
          <dd>
            Importancia relativa: la intersección de ID e IS. Decide si el factor se evalúa y cuánto
            pesa en la recomendación.
          </dd>
        </dl>
        <p>Todas las importancias usan la misma escala:</p>
        <Escala etiqueta="Escala de importancia" niveles={importancia} />
      </Seccion>

      <Seccion titulo="Qué factores se evalúan">
        <p>
          Un factor solo se evalúa si su importancia relativa es mayor que {nombreUmbral}. Los demás
          se excluyen y no cuentan para la recomendación. Soporte puede evaluarse con alcance
          interno o externo: lo eliges tú.
        </p>
      </Seccion>

      <Seccion titulo="Cumplimiento de los subfactores">
        <p>Para cada subfactor de un factor relevante indicas cuánto cumple el software:</p>
        <Escala etiqueta="Escala de cumplimiento" niveles={cumplimiento} />
        <p>
          Un solo clic por subfactor basta. Si dejas alguno sin valorar, el factor queda pendiente y
          no cuenta para la recomendación.
        </p>
      </Seccion>

      <Seccion titulo="Ponderación media y clasificación FODA">
        <p>
          La ponderación media (PM) es el promedio del cumplimiento de todos los subfactores del
          factor. Si la PM es {umbralFoda} o más, el factor es favorable. Según su alcance, se
          clasifica así:
        </p>
        <ul>
          <li>Alcance interno: Fortaleza (favorable) o Debilidad (desfavorable).</li>
          <li>Alcance externo: Oportunidad (favorable) o Amenaza (desfavorable).</li>
        </ul>
        <p>El color siempre va acompañado del nombre de la clasificación.</p>
      </Seccion>

      <Seccion titulo="La recomendación A, B o C">
        <p>
          Solo cuentan los factores evaluados. La recomendación depende de las debilidades y
          amenazas y de la importancia relativa de los factores donde aparecen; en los resultados se
          muestran las causas.
        </p>
        <dl className="ayuda-metodo__recomendaciones">
          {recomendaciones.map(({ codigo, titulo, texto }) => (
            <div key={codigo}>
              <dt>
                {codigo} · {titulo}
              </dt>
              <dd>{texto}</dd>
            </div>
          ))}
        </dl>
      </Seccion>
    </div>
  );
}
