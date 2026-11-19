// Tope de tiempo por invocación de `recalculo-paso` (issue #43, S15a): 110 s en total, medidos
// con el reloj inyectable. Ninguna prueba espera de verdad: las señales de aborto son falsas.
import { assert, assertEquals, assertThrows } from 'jsr:@std/assert@1';
import { ErrorPasoSinTiempo, ErrorProveedorNoDisponible } from './errores.ts';
import {
  esErrorDeTiempo,
  PRESUPUESTO_PASO_MS,
  PresupuestoPaso,
  senalDe,
  TIEMPO_MINIMO_LOTE_MS,
} from './presupuesto.ts';
import { crearRelojFalso } from './pruebas.ts';

/** Fábrica de señales que anota cuántos ms se pidieron (no usa temporizadores). */
function senalesFalsas() {
  const pedidas: number[] = [];
  return {
    pedidas,
    crearSenal: (ms: number): AbortSignal => {
      pedidas.push(ms);
      return new AbortController().signal;
    },
  };
}

Deno.test('presupuesto: el tope por paso es de 110 s y el mínimo para un lote, de 15 s', () => {
  assertEquals(PRESUPUESTO_PASO_MS, 110_000);
  assertEquals(TIEMPO_MINIMO_LOTE_MS, 15_000);
});

Deno.test('presupuesto: el tiempo restante sigue al reloj y nunca baja de cero', async () => {
  const reloj = crearRelojFalso();
  const presupuesto = new PresupuestoPaso({ ahora: reloj.ahora });
  assertEquals(presupuesto.restante(), 110_000);
  await reloj.esperar(30_000);
  assertEquals(presupuesto.restante(), 80_000);
  await reloj.esperar(200_000);
  assertEquals(presupuesto.restante(), 0);
});

Deno.test(
  'presupuesto: cada fetch usa el menor entre su tiempo propio y el que queda',
  async () => {
    const reloj = crearRelojFalso();
    const { pedidas, crearSenal } = senalesFalsas();
    const presupuesto = new PresupuestoPaso({ ahora: reloj.ahora, crearSenal });

    assertEquals(presupuesto.senal(30_000).porPresupuesto, false);
    await reloj.esperar(90_000); // quedan 20 s
    assertEquals(presupuesto.senal(30_000).porPresupuesto, true);
    assertEquals(presupuesto.senal(10_000).porPresupuesto, false);

    assertEquals(pedidas, [30_000, 20_000, 10_000]);
  },
);

Deno.test('presupuesto: sin tiempo restante no se arma ninguna llamada y se pausa', async () => {
  const reloj = crearRelojFalso();
  const { pedidas, crearSenal } = senalesFalsas();
  const presupuesto = new PresupuestoPaso({ ahora: reloj.ahora, crearSenal });
  await reloj.esperar(110_000);

  const error = assertThrows(() => presupuesto.senal(20_000), ErrorPasoSinTiempo);
  assert(error instanceof ErrorProveedorNoDisponible, 'sigue el camino de pausa existente');
  assertEquals(pedidas, []);
});

Deno.test('presupuesto: no se empieza un lote con menos de 15 s', async () => {
  const reloj = crearRelojFalso();
  const presupuesto = new PresupuestoPaso({ ahora: reloj.ahora });
  await reloj.esperar(95_000); // quedan exactamente 15 s
  presupuesto.exigirTiempoParaLote();
  await reloj.esperar(1);
  assertThrows(() => presupuesto.exigirTiempoParaLote(), ErrorPasoSinTiempo);
});

Deno.test('presupuesto: acepta un total distinto del por defecto', async () => {
  const reloj = crearRelojFalso();
  const presupuesto = new PresupuestoPaso({ ahora: reloj.ahora, totalMs: 5000 });
  await reloj.esperar(2000);
  assertEquals(presupuesto.restante(), 3000);
});

Deno.test('senalDe: sin presupuesto usa solo el tiempo propio y no es por presupuesto', () => {
  const { porPresupuesto, signal } = senalDe(undefined, 30_000);
  assertEquals(porPresupuesto, false);
  assertEquals(signal.aborted, false);
});

Deno.test('esErrorDeTiempo: reconoce el aborto por tiempo y no otros errores', () => {
  assert(esErrorDeTiempo(new DOMException('tiempo', 'TimeoutError')));
  assert(esErrorDeTiempo(new DOMException('aborto', 'AbortError')));
  assert(!esErrorDeTiempo(new Error('red caída')));
  assert(!esErrorDeTiempo(new TypeError('fetch failed')));
});
