// Tandas en paralelo dentro de un paso (issue #45, S16a, ADR-014). Todo con relojes y `fetch`
// falsos: ninguna prueba duerme de verdad.
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { buscarYClasificar } from './busqueda.ts';
import { ErrorPasoSinTiempo, ErrorProveedorNoDisponible } from './errores.ts';
import { atender } from './http.ts';
import { PresupuestoPaso } from './presupuesto.ts';
import { iniciar } from './recalculo_iniciar.ts';
import { paso } from './recalculo_paso.ts';
import { RegistradorPaso } from './registro.ts';
import {
  candidato,
  CATALOGO_PRUEBA,
  CONTEXTO_PRUEBA,
  crearRelojFalso,
  proveedorFijo,
  TOKEN_ADMIN,
  verificadorFalso,
} from './pruebas.ts';
import { CONFIGURACION_PRUEBA, crearDependenciasPrueba } from './pruebas_recalculo.ts';
import { RitmoDeLlamadas } from './ritmo.ts';
import type { Candidato, Clasificador, Veredicto } from './tipos.ts';

const SUBFACTOR = CATALOGO_PRUEBA[0]!;

const todosAceptados = (lote: Candidato[]): Veredicto[] =>
  lote.map((_, i) => ({ indice: i + 1, trata_subfactor: true, confianza: 0.95, evidencia: 'ok' }));

/** Deja correr las tareas pendientes (sin temporizadores). */
async function vaciarTareas() {
  for (let i = 0; i < 50; i++) await Promise.resolve();
}

/** Clasificador cuyas llamadas quedan abiertas hasta que la prueba las resuelve a mano. */
function clasificadorControlado() {
  const llamadas: { lote: Candidato[]; resolver(): void; rechazar(error: Error): void }[] = [];
  let enVuelo = 0;
  let maximo = 0;
  const clasificador: Clasificador = {
    clasificar(_f, _s, _c, lote) {
      enVuelo++;
      maximo = Math.max(maximo, enVuelo);
      return new Promise<Veredicto[]>((resolver, rechazar) => {
        llamadas.push({
          lote,
          resolver: () => {
            enVuelo--;
            resolver(todosAceptados(lote));
          },
          rechazar: (error) => {
            enVuelo--;
            rechazar(error);
          },
        });
      });
    },
  };
  return { clasificador, llamadas, maximo: () => maximo };
}

const candidatos = (cantidad: number) =>
  proveedorFijo(
    'openalex',
    Array.from({ length: cantidad }, (_, i) => candidato(i + 1)),
  );

function ejecutar(
  clasificador: Clasificador,
  cantidad: number,
  llamadasSimultaneas?: number,
  extra: { presupuesto?: PresupuestoPaso } = {},
) {
  return buscarYClasificar({
    subfactor: SUBFACTOR,
    contexto: CONTEXTO_PRUEBA,
    proveedores: [candidatos(cantidad)],
    clasificador,
    anioInicio: 2020,
    anioFin: 2025,
    umbral: 0.7,
    maxCandidatos: cantidad,
    ...(llamadasSimultaneas === undefined ? {} : { llamadasSimultaneas }),
    ...extra,
  });
}

Deno.test('paralelo: manda a la IA tantas tandas a la vez como llamadas simultáneas', async () => {
  const { clasificador, llamadas, maximo } = clasificadorControlado();
  const promesa = ejecutar(clasificador, 60, 3); // 6 tandas de 10
  await vaciarTareas();
  assertEquals(llamadas.length, 3, 'arrancan 3 y las demás esperan');

  llamadas[0]!.resolver();
  await vaciarTareas();
  assertEquals(llamadas.length, 4, 'al terminar una entra la siguiente');

  for (let i = 1; i < 6; i++) {
    llamadas[i]!.resolver();
    await vaciarTareas();
  }
  const resultado = await promesa;
  assertEquals(maximo(), 3, 'nunca más de 3 en vuelo');
  assertEquals(llamadas.length, 6);
  assertEquals(resultado.referencias.length, 60);
});

Deno.test('paralelo: con 1 llamada simultánea las tandas van en serie', async () => {
  const { clasificador, llamadas, maximo } = clasificadorControlado();
  const promesa = ejecutar(clasificador, 30, 1);
  await vaciarTareas();
  assertEquals(llamadas.length, 1);
  for (let i = 0; i < 3; i++) {
    llamadas[i]!.resolver();
    await vaciarTareas();
  }
  await promesa;
  assertEquals(maximo(), 1);
});

Deno.test('paralelo: sin indicar llamadas simultáneas se mantiene el orden en serie', async () => {
  const { clasificador, llamadas, maximo } = clasificadorControlado();
  const promesa = ejecutar(clasificador, 20);
  await vaciarTareas();
  assertEquals(llamadas.length, 1);
  llamadas[0]!.resolver();
  await vaciarTareas();
  llamadas[1]!.resolver();
  await promesa;
  assertEquals(maximo(), 1);
});

Deno.test(
  'paralelo: las referencias salen en el orden de las tandas, no en el de llegada',
  async () => {
    const { clasificador, llamadas } = clasificadorControlado();
    const promesa = ejecutar(clasificador, 30, 3);
    await vaciarTareas();
    // Terminan al revés: la tanda 3, la 2 y al final la 1.
    llamadas[2]!.resolver();
    llamadas[1]!.resolver();
    llamadas[0]!.resolver();
    const resultado = await promesa;
    assertEquals(
      resultado.referencias.map((r) => r.doi),
      Array.from({ length: 30 }, (_, i) => `10.1000/art.${i + 1}`),
    );
  },
);

Deno.test('paralelo: el registro anota las tandas en el orden en que terminan', async () => {
  const { clasificador, llamadas } = clasificadorControlado();
  const registro = new RegistradorPaso('fake', 1);
  const promesa = buscarYClasificar({
    subfactor: SUBFACTOR,
    contexto: CONTEXTO_PRUEBA,
    proveedores: [candidatos(30)],
    clasificador,
    anioInicio: 2020,
    anioFin: 2025,
    umbral: 0.7,
    maxCandidatos: 30,
    llamadasSimultaneas: 3,
    registro,
  });
  await vaciarTareas();
  llamadas[2]!.resolver();
  await vaciarTareas();
  llamadas[0]!.resolver();
  await vaciarTareas();
  llamadas[1]!.resolver();
  await promesa;
  assertEquals(
    registro.lotes.map((l) => l.n),
    [3, 1, 2],
  );
});

Deno.test(
  'paralelo: si una tanda falla no se lanzan más y se espera a las que van en vuelo',
  async () => {
    const { clasificador, llamadas } = clasificadorControlado();
    let terminada = false;
    const promesa = ejecutar(clasificador, 60, 3).then(
      () => 'ok',
      (error: unknown) => {
        terminada = true;
        return error;
      },
    );
    await vaciarTareas();
    assertEquals(llamadas.length, 3);

    llamadas[0]!.rechazar(new ErrorProveedorNoDisponible('Sin cuota.', 'reintento_agotado'));
    await vaciarTareas();
    assertEquals(llamadas.length, 3, 'no se lanza una tanda nueva tras el fallo');
    assertEquals(terminada, false, 'todavía hay dos tandas en vuelo');

    llamadas[1]!.resolver();
    llamadas[2]!.resolver();
    const error = await promesa;
    assert(error instanceof ErrorProveedorNoDisponible);
    assertEquals(error.message, 'Sin cuota.');
    assertEquals(llamadas.length, 3);
  },
);

Deno.test('paralelo: con el tope del paso agotado no se lanza ninguna tanda', async () => {
  const reloj = crearRelojFalso();
  const presupuesto = new PresupuestoPaso({ ahora: reloj.ahora });
  const { clasificador, llamadas } = clasificadorControlado();
  await reloj.esperar(100_000); // quedan 10 s (< 15 s)
  await assertRejects(() => ejecutar(clasificador, 60, 3, { presupuesto }), ErrorPasoSinTiempo);
  assertEquals(llamadas.length, 0);
});

// Ritmo con llamadas concurrentes ------------------------------------------------------------

/**
 * Reloj en el que las esperas corren de verdad en paralelo: `esperar` agenda un vencimiento y
 * `correr` avanza la hora simulada al siguiente, hasta que no queda ninguno.
 */
function relojConcurrente(inicio = 1_000_000) {
  let hora = inicio;
  const pendientes: { fin: number; resolver(): void }[] = [];
  return {
    ahora: () => hora,
    esperar(ms: number): Promise<void> {
      return new Promise((resolver) => pendientes.push({ fin: hora + ms, resolver }));
    },
    async correr(hasta: Promise<unknown>) {
      let terminado = false;
      void hasta.finally(() => (terminado = true));
      while (!terminado) {
        await vaciarTareas();
        if (pendientes.length === 0) continue;
        pendientes.sort((a, b) => a.fin - b.fin);
        const siguiente = pendientes.shift()!;
        hora = Math.max(hora, siguiente.fin);
        siguiente.resolver();
      }
      await hasta;
    },
  };
}

Deno.test('ritmo: llamadas concurrentes siguen separadas por el intervalo del ritmo', async () => {
  const reloj = relojConcurrente();
  const ritmo = new RitmoDeLlamadas(reloj, 15); // un turno cada 4 s
  const horas: number[] = [];
  const turno = async () => {
    await ritmo.esperarTurno();
    horas.push(reloj.ahora());
  };
  await reloj.correr(Promise.all([turno(), turno(), turno(), turno()]));
  const inicio = 1_000_000;
  assertEquals(
    horas.map((h) => h - inicio),
    [4000, 8000, 12000, 16000],
  );
});

Deno.test(
  'ritmo: las esperas de reintento simultáneas cuentan una sola vez en el tiempo del paso',
  async () => {
    const reloj = relojConcurrente();
    const ritmo = new RitmoDeLlamadas(reloj, 15);
    // Cuatro reintentos a la vez de 30 s: en pared son 30 s, no 120 s (tope de espera: 90 s).
    const resultados = await (async () => {
      const promesa = Promise.all([
        ritmo.esperarReintento(0, 30_000),
        ritmo.esperarReintento(0, 30_000),
        ritmo.esperarReintento(0, 30_000),
        ritmo.esperarReintento(0, 30_000),
      ]);
      await reloj.correr(promesa);
      return promesa;
    })();
    assertEquals(resultados, [true, true, true, true]);
    assertEquals(ritmo.reintentos, 4);
  },
);

Deno.test('ritmo: reintentos que no caben en el tope de espera siguen rechazándose', async () => {
  const reloj = relojConcurrente();
  const ritmo = new RitmoDeLlamadas(reloj, 15, 50_000); // 50 s de espera como máximo
  const primera = ritmo.esperarReintento(0, 30_000);
  await reloj.correr(primera);
  // Ya se esperaron 30 s en pared: otros 30 s no caben en 50 s.
  assertEquals(await ritmo.esperarReintento(0, 30_000), false);
});

// Cableado del paso ----------------------------------------------------------------------------

Deno.test('paralelo: el paso usa las llamadas simultáneas de la configuración', async () => {
  const { clasificador, llamadas, maximo } = clasificadorControlado();
  const deps = crearDependenciasPrueba({
    configuracion: { ...CONFIGURACION_PRUEBA, llamadasSimultaneas: 2 },
    proveedores: () => [candidatos(40)],
    clasificador: () => clasificador,
  });
  const crear = await atender(
    new Request('http://localhost/', {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN_ADMIN}` },
      body: JSON.stringify({ anio_inicio: 2020, anio_fin: 2025, fuentes: ['openalex'] }),
    }),
    { origenes: [], verificador: () => verificadorFalso, crear: () => deps },
    (entrada, admin, dependencias) => iniciar(entrada, admin, dependencias),
  );
  const id = ((await crear.json()) as { id_calculo: number }).id_calculo;

  const respuesta = atender(
    new Request('http://localhost/', {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN_ADMIN}` },
      body: JSON.stringify({ id_calculo: id }),
    }),
    { origenes: [], verificador: () => verificadorFalso, crear: () => deps },
    (entrada, admin, dependencias) => paso(entrada, admin, dependencias),
  );
  await vaciarTareas();
  assertEquals(llamadas.length, 2, 'con 2 simultáneas arrancan 2 de las 4 tandas');
  for (let i = 0; i < 4; i++) {
    await vaciarTareas();
    llamadas[i]!.resolver();
  }
  assertEquals((await respuesta).status, 200);
  assertEquals(maximo(), 2);
});
