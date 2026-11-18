import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { repositorio } from '../datos';
import type { Contexto } from '../datos/tipos';
import { CLAVES } from './consultas';
import { useColaDeGuardado } from './useColaDeGuardado';

/** Espera tras el último cambio antes de guardar el borrador del contexto. */
export const RETARDO_AUTOGUARDADO = 600;

/**
 * Estado editable del contexto (P-03) con guardado automático: cada cambio programa un
 * *upsert* del borrador tras `RETARDO_AUTOGUARDADO` ms sin teclear; `guardarAhora` lo
 * adelanta, y al salir de la pantalla se guarda lo que quedara pendiente.
 */
export function useContexto(idEvaluacion: number, inicial: Contexto) {
  const consultas = useQueryClient();
  const cola = useColaDeGuardado();
  const [contexto, setContexto] = useState(inicial);
  // Último contexto: las tareas encoladas lo leen al ejecutarse, así guardan lo más reciente
  // y reutilizan los ids (organización, software) devueltos por el guardado anterior.
  const ultimo = useRef(inicial);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { encolar, esperar } = cola;

  const guardarAhora = useCallback((): Promise<boolean> => {
    if (temporizador.current !== null) {
      clearTimeout(temporizador.current);
      temporizador.current = null;
    }
    return encolar(async () => {
      const guardado = await repositorio.guardarContexto(idEvaluacion, ultimo.current);
      ultimo.current = {
        ...ultimo.current,
        software: { ...ultimo.current.software, id: guardado.software.id },
        organizacion: { ...ultimo.current.organizacion, id: guardado.organizacion.id },
      };
      setContexto(ultimo.current);
      void consultas.invalidateQueries({ queryKey: CLAVES.historial });
    });
  }, [encolar, idEvaluacion, consultas]);

  const cambiar = useCallback(
    (cambio: (actual: Contexto) => Contexto) => {
      ultimo.current = cambio(ultimo.current);
      setContexto(ultimo.current);
      if (temporizador.current !== null) clearTimeout(temporizador.current);
      temporizador.current = setTimeout(() => void guardarAhora(), RETARDO_AUTOGUARDADO);
    },
    [guardarAhora],
  );

  // Al salir de la pantalla se guarda el cambio pendiente (el guardado sigue aunque se desmonte).
  useEffect(
    () => () => {
      if (temporizador.current !== null) void guardarAhora();
    },
    [guardarAhora],
  );

  return {
    contexto,
    cambiar,
    guardarAhora,
    esperarGuardado: esperar,
    estado: cola.estado,
    error: cola.error,
  };
}
