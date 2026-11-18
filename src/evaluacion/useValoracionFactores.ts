import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';
import { repositorio } from '../datos';
import type {
  CalculoImportancia,
  Catalogo,
  FactorCatalogo,
  FilaValoracionFactor,
  ValoracionFactor,
} from '../datos/tipos';
import { alcanceEfectivo, type Alcance, type Cumplimiento, type Importancia } from '../guios-core';
import { CLAVES } from './consultas';
import { derivarFactor, derivarFactores, filaParaGuardar, resumirFactores } from './derivar';
import { useColaDeGuardado } from './useColaDeGuardado';

/**
 * Valoración de factores y subfactores (P-04 y P-05): la ID de cada factor, el alcance de
 * Soporte y el PS de cada subfactor se aplican al instante en pantalla y se guardan como
 * borrador (*upsert*) en cada cambio. IR, relevancia, PM y FODA los calcula `guios-core`
 * (vía `derivar.ts`) y se guardan junto a la entrada.
 */
export function useValoracionFactores(
  idEvaluacion: number,
  catalogo: Catalogo,
  calculo: CalculoImportancia,
  inicial: readonly ValoracionFactor[],
) {
  const consultas = useQueryClient();
  const cola = useColaDeGuardado();
  const { encolar } = cola;
  const [valoraciones, setValoraciones] = useState(
    () => new Map(inicial.map((v) => [v.idFactor, v])),
  );
  // Alcance de Soporte elegido antes de asignar su ID: solo se guarda junto con ella.
  const [alcancesElegidos, setAlcancesElegidos] = useState<Readonly<Record<number, Alcance>>>({});
  // Valoraciones vigentes para los clics seguidos (el estado de React llega un render después).
  const actuales = useRef(valoraciones);

  const factores = useMemo(() => {
    const porId = new Map<number, { factor: FactorCatalogo; dimension: string }>();
    for (const dimension of catalogo.dimensiones) {
      for (const factor of dimension.factores)
        porId.set(factor.id, { factor, dimension: dimension.nombre });
    }
    return porId;
  }, [catalogo]);

  const filas = useMemo(
    () => derivarFactores(catalogo, calculo, [...valoraciones.values()], alcancesElegidos),
    [catalogo, calculo, valoraciones, alcancesElegidos],
  );
  const resumen = useMemo(() => resumirFactores(filas), [filas]);

  const fijar = useCallback((idFactor: number, valoracion: ValoracionFactor | undefined) => {
    const siguiente = new Map(actuales.current);
    if (valoracion) siguiente.set(idFactor, valoracion);
    else siguiente.delete(idFactor);
    actuales.current = siguiente;
    setValoraciones(siguiente);
  }, []);

  const guardar = useCallback(
    (
      nueva: ValoracionFactor,
      previa: ValoracionFactor | undefined,
      persistir: (fila: FilaValoracionFactor) => Promise<void> = (fila) =>
        repositorio.guardarValoracionFactor(idEvaluacion, fila),
    ) => {
      const entrada = factores.get(nueva.idFactor);
      if (!entrada) return;
      fijar(nueva.idFactor, nueva);
      const fila = filaParaGuardar(
        derivarFactor(entrada.factor, calculo, nueva, undefined, entrada.dimension),
      );
      void encolar(
        async () => {
          await persistir(fila);
          void consultas.invalidateQueries({ queryKey: CLAVES.historial });
        },
        // Si no se pudo guardar, se vuelve al valor anterior (salvo que ya se haya cambiado otra vez).
        () => {
          if (actuales.current.get(nueva.idFactor) === nueva) fijar(nueva.idFactor, previa);
        },
      );
    },
    [factores, calculo, fijar, encolar, idEvaluacion, consultas],
  );

  const cambiarImportancia = useCallback(
    (idFactor: number, id: Importancia) => {
      const entrada = factores.get(idFactor);
      if (!entrada) return;
      const previa = actuales.current.get(idFactor);
      const alcance = alcanceEfectivo(
        entrada.factor.alcance,
        previa?.alcance ?? alcancesElegidos[idFactor],
      );
      guardar({ idFactor, id, alcance, cumplimientos: previa?.cumplimientos ?? {} }, previa);
    },
    [factores, guardar, alcancesElegidos],
  );

  const cambiarAlcance = useCallback(
    (idFactor: number, alcance: Alcance) => {
      const previa = actuales.current.get(idFactor);
      if (previa) guardar({ ...previa, alcance }, previa);
      else setAlcancesElegidos((elegidos) => ({ ...elegidos, [idFactor]: alcance }));
    },
    [guardar],
  );

  /** Valora un subfactor: se aplica al instante y guarda el PS junto con la PM y el FODA del factor. */
  const cambiarCumplimiento = useCallback(
    (idFactor: number, idSubfactor: number, ps: Cumplimiento) => {
      const previa = actuales.current.get(idFactor);
      if (!previa) return;
      guardar(
        { ...previa, cumplimientos: { ...previa.cumplimientos, [idSubfactor]: ps } },
        previa,
        (fila) => repositorio.guardarValoracionSubfactor(idEvaluacion, fila, idSubfactor, ps),
      );
    },
    [guardar, idEvaluacion],
  );

  return {
    filas,
    resumen,
    valoraciones,
    cambiarImportancia,
    cambiarAlcance,
    cambiarCumplimiento,
    estado: cola.estado,
    error: cola.error,
    esperarGuardado: cola.esperar,
  };
}
