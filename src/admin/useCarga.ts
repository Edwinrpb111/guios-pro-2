import { useCallback, useEffect, useRef, useState } from 'react';

export interface Carga<T> {
  datos: T | undefined;
  /** Mensaje en español si la carga falló. */
  error: string | null;
  cargando: boolean;
  recargar: () => void;
  /** Como `recargar`, pero no hace nada si todavía hay una lectura en vuelo (sondeo, #45). */
  sondear: () => void;
}

/** Ejecuta `cargar` (memorizada con `useCallback`) al montar y cada vez que se pide recargar. */
export function useCarga<T>(cargar: () => Promise<T>): Carga<T> {
  const enVuelo = useRef(false);
  const [estado, setEstado] = useState<Omit<Carga<T>, 'recargar' | 'sondear'>>({
    datos: undefined,
    error: null,
    cargando: true,
  });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vigente = true;
    enVuelo.current = true;
    cargar().then(
      (datos) => {
        if (vigente) {
          enVuelo.current = false;
          setEstado({ datos, error: null, cargando: false });
        }
      },
      (error: unknown) => {
        if (vigente) {
          enVuelo.current = false;
          setEstado((anterior) => ({
            ...anterior,
            error: error instanceof Error ? error.message : 'No se pudieron cargar los datos.',
            cargando: false,
          }));
        }
      },
    );
    return () => {
      vigente = false;
    };
  }, [cargar, version]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  const sondear = useCallback(() => {
    if (!enVuelo.current) setVersion((v) => v + 1);
  }, []);
  return { ...estado, recargar, sondear };
}
