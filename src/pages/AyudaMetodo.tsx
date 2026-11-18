import { useState } from 'react';
import { AyudaMetodoContenido } from '../components/AyudaMetodoContenido';
import { VentanaModal } from '../components/VentanaModal';
import {
  CUMPLIMIENTO,
  IMPORTANCIA,
  TEXTOS_RECOMENDACION,
  UMBRAL_FODA,
  UMBRAL_RELEVANCIA,
} from '../guios-core';

const niveles = (escala: Readonly<Record<number, string>>) =>
  Object.entries(escala).map(([valor, nombre]) => ({ valor: Number(valor), nombre }));

const RECOMENDACIONES = Object.entries(TEXTOS_RECOMENDACION).map(([codigo, { titulo, texto }]) => ({
  codigo,
  titulo,
  texto,
}));

/**
 * P-11: ayuda del método. Botón para la cabecera de cualquier pantalla con sesión que abre un
 * modal global; los textos y niveles salen de `guios-core`, nunca se repiten aquí.
 */
export function AyudaMetodo() {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <button type="button" className="boton-ayuda-metodo" onClick={() => setAbierta(true)}>
        <span aria-hidden="true">?</span> Ayuda del método
      </button>
      <VentanaModal
        abierta={abierta}
        titulo="Ayuda del método GUIOS"
        onCerrar={() => setAbierta(false)}
      >
        <AyudaMetodoContenido
          importancia={niveles(IMPORTANCIA)}
          cumplimiento={niveles(CUMPLIMIENTO)}
          recomendaciones={RECOMENDACIONES}
          umbralRelevancia={UMBRAL_RELEVANCIA}
          umbralFoda={UMBRAL_FODA}
        />
      </VentanaModal>
    </>
  );
}
