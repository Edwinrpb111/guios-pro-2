import { useCallback, useRef, useState } from 'react';

export type EstadoGuardado = 'inactivo' | 'guardando' | 'guardado' | 'error';

/**
 * Cola de guardados en serie: cada cambio se guarda como borrador (BRIEF §8.4) y se
 * ejecuta después del anterior, así llegan a la base en el orden en que se hicieron.
 * Un fallo no detiene la cola: se informa en `error` y la siguiente tarea corre igual.
 */
export function useColaDeGuardado() {
  const cola = useRef<Promise<unknown>>(Promise.resolve());
  const pendientes = useRef(0);
  const huboFallo = useRef(false);
  const [estado, setEstado] = useState<EstadoGuardado>('inactivo');
  const [error, setError] = useState<string | null>(null);

  /** Encola `tarea`; resuelve `true` si salió bien. `alFallar` permite deshacer el cambio local. */
  const encolar = useCallback(
    (tarea: () => Promise<unknown>, alFallar?: () => void): Promise<boolean> => {
      if (pendientes.current === 0) {
        huboFallo.current = false;
        setError(null);
      }
      pendientes.current += 1;
      setEstado('guardando');
      const ejecucion = cola.current.then(async () => {
        let correcto = true;
        try {
          await tarea();
        } catch (fallo) {
          correcto = false;
          huboFallo.current = true;
          alFallar?.();
          setError(fallo instanceof Error ? fallo.message : 'Error desconocido al guardar.');
        }
        pendientes.current -= 1;
        // Con tareas pendientes el estado sigue en «guardando»; el fallo se informa al vaciarse la cola.
        if (pendientes.current > 0) setEstado('guardando');
        else setEstado(huboFallo.current ? 'error' : 'guardado');
        return correcto;
      });
      cola.current = ejecucion;
      return ejecucion;
    },
    [],
  );

  /** Resuelve al vaciarse la cola (para no navegar con guardados en curso); `false` si alguno falló. */
  const esperar = useCallback(async (): Promise<boolean> => {
    await cola.current;
    return !huboFallo.current;
  }, []);

  return { estado, error, encolar, esperar };
}
