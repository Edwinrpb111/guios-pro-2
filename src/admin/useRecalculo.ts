/**
 * Bucle del recálculo de P-09 (BRIEF §13.2, pasos 4 y 5): invoca `recalculo-paso` hasta que no
 * quedan pendientes, calcula IL e IS con guios-core y las guarda con `guardar_resultado_calculo`.
 * Pausa a pedido o ante un 429/caída (sin reintentar en bucle) y se retoma desde lo pendiente.
 * Ante un corte de la plataforma (tiempo o límite) o una caída de la red repite el MISMO paso
 * unas veces antes de mostrar el error (issue #43); una pausa del servidor no se reintenta.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApiAdmin } from './contexto';
import { filasDesdeConteo } from './resultado';
import { ErrorAdmin, type CalculoResumen, type FilaSugerida, type ResultadoPaso } from './tipos';

export type FaseRecalculo =
  | 'cargando'
  | 'ejecutando'
  | 'pausando'
  | 'pausado'
  | 'guardando'
  | 'revision'
  | 'cerrado'
  | 'error'
  | 'no_encontrado';

export interface EstadoRecalculo {
  fase: FaseRecalculo;
  calculo: CalculoResumen | null;
  /** Factores (0..18) con todos sus subfactores procesados. */
  progreso: number;
  /** Pasos que faltan, según el último paso; `null` si aún no se sabe. */
  pendientes: number | null;
  /** Motivo de una pausa o de un error, en español. */
  mensaje: string | null;
  /** Filas de IS del cálculo (en revisión o publicado). */
  filas: FilaSugerida[];
  /** Publicando o descartando. */
  ocupado: boolean;
}

const INICIAL: EstadoRecalculo = {
  fase: 'cargando',
  calculo: null,
  progreso: 0,
  pendientes: null,
  mensaje: null,
  filas: [],
  ocupado: false,
};

interface Control {
  /** `false` al desmontar o cambiar de cálculo: el bucle se detiene. */
  vivo: boolean;
  pausa: boolean;
  corriendo: boolean;
}

/** Reintentos automáticos del mismo paso según la clase de error (issue #43). */
const REINTENTOS: Record<'tiempo' | 'red', number> = { tiempo: 2, red: 1 };

/** Espera antes del reintento n (1, 2…): 3 s, 6 s. */
const ESPERA_BASE_MS = 3000;

const PASO_NO_COMPLETADO =
  'El paso tardó más de lo permitido y no se completó tras varios intentos. Reduce el máximo de candidatos o sube las llamadas por minuto, y pulsa Reintentar.';

export interface OpcionesRecalculo {
  /** Espera entre reintentos; se inyecta en las pruebas. Debe ser estable entre renders. */
  esperar?: (ms: number) => Promise<void>;
}

const esperarReal = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));

function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
}

/** Al cambiar de cálculo, monta de nuevo el componente (`key={id}`) para empezar de cero. */
export function useRecalculo(id: number, opciones: OpcionesRecalculo = {}) {
  const api = useApiAdmin();
  const esperar = useRef(opciones.esperar ?? esperarReal);
  const [estado, setEstado] = useState<EstadoRecalculo>(INICIAL);
  const control = useRef<Control>({ vivo: false, pausa: false, corriendo: false });

  const motor = useMemo(() => {
    const actualizar = (cambios: Partial<EstadoRecalculo>) =>
      setEstado((anterior) => ({ ...anterior, ...cambios }));

    async function abrir(c: Control): Promise<void> {
      const calculo = await api.obtenerCalculo(id);
      if (!c.vivo) return;
      if (calculo === null) {
        actualizar({ fase: 'no_encontrado', calculo: null });
        return;
      }
      actualizar({ calculo, progreso: calculo.progreso });
      switch (calculo.estado) {
        case 'en_proceso':
          // Al volver a la pantalla se retoma desde lo pendiente (BRIEF §13.2, paso 4).
          void ejecutar(c);
          return;
        case 'pausado':
          actualizar({ fase: 'pausado', mensaje: calculo.mensajeError });
          return;
        case 'completado':
        case 'publicado': {
          const filas = await api.filasSugeridas(id);
          if (!c.vivo) return;
          actualizar({
            fase: calculo.estado === 'completado' ? 'revision' : 'cerrado',
            filas,
            mensaje: null,
          });
          return;
        }
        default:
          actualizar({ fase: 'cerrado', filas: [], mensaje: calculo.mensajeError });
      }
    }

    async function finalizar(c: Control): Promise<void> {
      actualizar({ fase: 'guardando' });
      const filas = filasDesdeConteo(await api.conteoCitas(id));
      await api.guardarResultado(id, filas);
      if (c.vivo) await abrir(c);
    }

    /**
     * Invoca un paso y, si la plataforma lo corta o la red falla, repite el mismo paso unas
     * veces. Devuelve `null` si se pidió pausar o se desmontó durante la espera.
     */
    async function invocarPaso(c: Control): Promise<ResultadoPaso | null> {
      for (let reintentos = 0; ; reintentos++) {
        try {
          return await api.pasoRecalculo(id);
        } catch (error) {
          const tipo = error instanceof ErrorAdmin ? error.tipo : 'otro';
          if (tipo === 'otro' || reintentos >= REINTENTOS[tipo]) {
            throw tipo === 'tiempo' && reintentos > 0
              ? new ErrorAdmin(PASO_NO_COMPLETADO, null, null, tipo)
              : error;
          }
          if (!c.vivo || c.pausa) return null;
          actualizar({
            mensaje: `${mensajeDe(error)} Reintentando (${reintentos + 1} de ${REINTENTOS[tipo]})…`,
          });
          await esperar.current(ESPERA_BASE_MS * (reintentos + 1));
          if (!c.vivo || c.pausa) return null;
        }
      }
    }

    async function ejecutar(c: Control): Promise<void> {
      if (c.corriendo) return;
      c.corriendo = true;
      actualizar({ fase: c.pausa ? 'pausando' : 'ejecutando', mensaje: null });
      try {
        for (;;) {
          if (!c.vivo) return;
          if (c.pausa) {
            // El paso en curso ya terminó: se pausa en la base y se muestra el estado real.
            await api.pausar(id);
            c.pausa = false;
            if (c.vivo) await abrir(c);
            return;
          }
          const resultado = await invocarPaso(c);
          if (!c.vivo) return;
          // Reintento cancelado por una pausa: el bucle la atiende en la vuelta siguiente.
          if (resultado === null) continue;
          actualizar({
            progreso: resultado.progreso,
            pendientes: resultado.pendientes,
            mensaje: null,
          });
          if (resultado.pendientes === 0) break;
        }
        await finalizar(c);
      } catch (error) {
        if (!c.vivo) return;
        if (error instanceof ErrorAdmin && error.estado === 'pausado') {
          // 429 o caída: la Edge Function ya dejó el cálculo pausado; no se reintenta en bucle.
          actualizar({ fase: 'pausado', mensaje: error.message });
        } else if (error instanceof ErrorAdmin && error.codigo === 'calculo_cerrado') {
          await abrir(c).catch((e: unknown) =>
            actualizar({ fase: 'error', mensaje: mensajeDe(e) }),
          );
        } else {
          actualizar({ fase: 'error', mensaje: mensajeDe(error) });
        }
      } finally {
        c.corriendo = false;
      }
    }

    return { abrir, ejecutar, actualizar };
  }, [api, id]);

  useEffect(() => {
    const c: Control = { vivo: true, pausa: false, corriendo: false };
    control.current = c;
    motor.abrir(c).catch((error: unknown) => {
      if (c.vivo) motor.actualizar({ fase: 'error', mensaje: mensajeDe(error) });
    });
    return () => {
      c.vivo = false;
    };
  }, [motor]);

  const pausar = useCallback(() => {
    const c = control.current;
    if (!c.corriendo) return;
    c.pausa = true;
    motor.actualizar({ fase: 'pausando' });
  }, [motor]);

  /** Reanuda un cálculo pausado o reintenta tras un error. */
  const reanudar = useCallback(() => {
    const c = control.current;
    c.pausa = false;
    if (estado.calculo === null) {
      motor.actualizar({ fase: 'cargando', mensaje: null });
      motor.abrir(c).catch((error: unknown) => {
        if (c.vivo) motor.actualizar({ fase: 'error', mensaje: mensajeDe(error) });
      });
      return;
    }
    void motor.ejecutar(c);
  }, [motor, estado.calculo]);

  const cerrarCon = useCallback(
    async (accion: (id: number) => Promise<void>) => {
      const c = control.current;
      motor.actualizar({ ocupado: true, mensaje: null });
      try {
        await accion(id);
        await motor.abrir(c);
      } catch (error) {
        if (c.vivo) motor.actualizar({ mensaje: mensajeDe(error) });
      } finally {
        if (c.vivo) motor.actualizar({ ocupado: false });
      }
    },
    [motor, id],
  );

  const publicar = useCallback(() => cerrarCon((i) => api.publicar(i)), [cerrarCon, api]);
  const descartar = useCallback(() => cerrarCon((i) => api.descartar(i)), [cerrarCon, api]);

  return { ...estado, pausar, reanudar, publicar, descartar };
}
