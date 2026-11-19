// Ritmo de llamadas a Gemini y reintento ante 429/503 (issue #39, S13). Todo con reloj falso:
// ninguna prueba duerme de verdad.
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { GeminiClasificador } from './clasificador.ts';
import { crearDependencias, type Dependencias } from './dependencias.ts';
import { ErrorProveedorNoDisponible } from './errores.ts';
import { atender } from './http.ts';
import { iniciar } from './recalculo_iniciar.ts';
import { paso } from './recalculo_paso.ts';
import {
  candidato,
  CONTEXTO_PRUEBA,
  crearFetchGuionado,
  crearRelojFalso,
  proveedorFijo,
  respuestaJson,
  TOKEN_ADMIN,
  verificadorFalso,
} from './pruebas.ts';
import { RepositorioMemoria } from './pruebas_recalculo.ts';
import { RitmoDeLlamadas } from './ritmo.ts';

const MENSAJE_PAUSA = 'Gemini no está disponible o alcanzó su cuota. Reanuda el cálculo más tarde.';

const ok = () => respuestaJson({ candidates: [{ content: { parts: [{ text: '[]' }] } }] });

/** Error de Gemini con la información de reintento (google.rpc.RetryInfo) cuando se indica. */
function limite(estado: 429 | 503, retryDelay?: string) {
  return respuestaJson(
    {
      error: {
        code: estado,
        message: 'cuota',
        status: estado === 429 ? 'RESOURCE_EXHAUSTED' : 'UNAVAILABLE',
        details:
          retryDelay === undefined
            ? []
            : [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay }],
      },
    },
    estado,
  );
}

type Reloj = ReturnType<typeof crearRelojFalso>;

/** `fetch` que anota la hora simulada de cada llamada y responde según el guion. */
function fetchConHora(reloj: Reloj, guion: (Response | Error)[]) {
  const horas: number[] = [];
  const { fetch, llamadas } = crearFetchGuionado(
    guion.map((respuesta) => () => {
      horas.push(reloj.ahora());
      if (respuesta instanceof Error) throw respuesta;
      return respuesta.clone();
    }),
  );
  return { fetch, llamadas, horas };
}

function ritmoDe(reloj: Reloj, llamadasPorMinuto = 15) {
  return new RitmoDeLlamadas(
    { ahora: reloj.ahora, esperar: (ms) => reloj.esperar(ms) },
    llamadasPorMinuto,
  );
}

function crear(
  reloj: Reloj,
  fetch: typeof globalThis.fetch,
  candidatos = 3,
  entorno: Record<string, string> = {},
) {
  const variables: Record<string, string> = {
    LLM_PROVIDER: 'gemini',
    GEMINI_API_KEY: 'clave-de-prueba',
    OPENALEX_API_KEY: 'otra-clave',
    ...entorno,
  };
  const repositorio = new RepositorioMemoria();
  const base = crearDependencias(
    (nombre) => variables[nombre],
    { repositorio, verificador: verificadorFalso },
    { ahora: reloj.ahora, esperar: (ms) => reloj.esperar(ms), fetch },
  );
  const deps: Dependencias = {
    ...base,
    contexto: CONTEXTO_PRUEBA,
    proveedores: (fuentes) =>
      fuentes.map((f) =>
        proveedorFijo(
          f,
          Array.from({ length: candidatos }, (_, i) => candidato(i + 1)),
        ),
      ),
  };
  return { deps, repositorio };
}

function llamar(deps: Dependencias, cuerpo: unknown) {
  return atender(
    new Request('http://localhost/functions/v1/recalculo-paso', {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN_ADMIN}` },
      body: JSON.stringify(cuerpo),
    }),
    { origenes: [], verificador: () => verificadorFalso, crear: () => deps },
    (entrada, admin, dependencias) => paso(entrada, admin, dependencias),
  );
}

async function nuevoCalculo(deps: Dependencias): Promise<number> {
  const respuesta = await atender(
    new Request('http://localhost/', {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN_ADMIN}` },
      body: JSON.stringify({ anio_inicio: 2020, anio_fin: 2025, fuentes: ['openalex'] }),
    }),
    { origenes: [], verificador: () => verificadorFalso, crear: () => deps },
    (entrada, admin, dependencias) => iniciar(entrada, admin, dependencias),
  );
  return (await respuesta.json()).id_calculo;
}

const suma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// (a) Ritmo ---------------------------------------------------------------------------------

Deno.test(
  'ritmo: con 15 por minuto dos llamadas seguidas quedan a 4 s o más, entre lotes y entre pasos',
  async () => {
    const reloj = crearRelojFalso();
    // 25 candidatos = 3 lotes por paso; 2 pasos = 6 llamadas.
    const { fetch, horas } = fetchConHora(reloj, [ok()]);
    const { deps } = crear(reloj, fetch, 25);
    const id = await nuevoCalculo(deps);

    assertEquals((await llamar(deps, { id_calculo: id })).status, 200);
    assertEquals((await llamar(deps, { id_calculo: id })).status, 200);

    assertEquals(horas.length, 6);
    for (let i = 1; i < horas.length; i++) {
      assert(horas[i]! - horas[i - 1]! >= 4000, `llamadas ${i} y ${i + 1} muy juntas`);
    }
    // Espera lo justo antes de cada llamada: 6 esperas de 4 s, sin esperas dobles.
    assertEquals(reloj.esperas, [4000, 4000, 4000, 4000, 4000, 4000]);
  },
);

Deno.test('ritmo: LLM_LLAMADAS_POR_MINUTO cambia el espaciado (60 por minuto = 1 s)', async () => {
  const reloj = crearRelojFalso();
  const { fetch, horas } = fetchConHora(reloj, [ok()]);
  const { deps } = crear(reloj, fetch, 25, { LLM_LLAMADAS_POR_MINUTO: '60' });
  const id = await nuevoCalculo(deps);

  await llamar(deps, { id_calculo: id });

  assertEquals(horas.length, 3);
  assertEquals(reloj.esperas, [1000, 1000, 1000]);
});

Deno.test('ritmo: no espera de más si ya pasó tiempo desde la llamada anterior', async () => {
  const reloj = crearRelojFalso();
  const ritmo = ritmoDe(reloj);
  await ritmo.esperarTurno(); // la primera espera el intervalo completo
  await reloj.esperar(10_000); // pasa más del intervalo por otra causa
  await ritmo.esperarTurno();
  assertEquals(reloj.esperas, [4000, 10_000]);
});

// (b) 429 y luego éxito --------------------------------------------------------------------

Deno.test('429 y luego 200: el paso termina, no se pausa y espera el retryDelay', async () => {
  const reloj = crearRelojFalso();
  const { fetch, horas } = fetchConHora(reloj, [limite(429, '17s'), ok()]);
  const { deps, repositorio } = crear(reloj, fetch);
  const id = await nuevoCalculo(deps);

  const respuesta = await llamar(deps, { id_calculo: id });

  assertEquals(respuesta.status, 200);
  assertEquals((await respuesta.json()).estado, 'en_proceso');
  assertEquals(repositorio.calculos.get(id)!.estado, 'en_proceso');
  assertEquals(repositorio.calculos.get(id)!.mensaje_error, null);
  assertEquals(repositorio.pasos.get(id)!.get(11)?.estado, 'hecho');
  assertEquals(horas.length, 2);
  assert(horas[1]! - horas[0]! >= 17_000);
  assertEquals(reloj.esperas, [4000, 17_000]);
});

Deno.test('429 sin retryDelay: espera por defecto 5 s y luego 10 s (retroceso)', async () => {
  const reloj = crearRelojFalso();
  const { fetch } = fetchConHora(reloj, [limite(429), limite(429), ok()]);
  const { deps } = crear(reloj, fetch);
  const id = await nuevoCalculo(deps);

  assertEquals((await llamar(deps, { id_calculo: id })).status, 200);

  assertEquals(reloj.esperas, [4000, 5000, 10_000]);
});

Deno.test('retryDelay: acepta decimales y se limita a 30 s por espera', async () => {
  const reloj = crearRelojFalso();
  const { fetch } = fetchConHora(reloj, [limite(429, '17.5s'), limite(429, '120s'), ok()]);
  const { deps } = crear(reloj, fetch);
  const id = await nuevoCalculo(deps);

  assertEquals((await llamar(deps, { id_calculo: id })).status, 200);

  assertEquals(reloj.esperas, [4000, 17_500, 30_000]);
});

// (c) 429 más allá del máximo --------------------------------------------------------------

Deno.test(
  '429 repetidos: tras 3 reintentos pausa igual que antes (mismo mensaje y código) y reanuda',
  async () => {
    const reloj = crearRelojFalso();
    const { fetch, horas } = fetchConHora(reloj, [
      limite(429, '1s'),
      limite(429, '1s'),
      limite(429, '1s'),
      limite(429, '1s'),
      ok(),
    ]);
    const { deps, repositorio } = crear(reloj, fetch);
    const id = await nuevoCalculo(deps);

    const respuesta = await llamar(deps, { id_calculo: id });

    assertEquals(respuesta.status, 503);
    assertEquals(await respuesta.json(), {
      error: MENSAJE_PAUSA,
      codigo: 'proveedor_no_disponible',
      progreso: 0,
      pendientes: 5,
      estado: 'pausado',
    });
    assertEquals(horas.length, 4, '1 llamada + 3 reintentos');
    const calculo = repositorio.calculos.get(id)!;
    assertEquals([calculo.estado, calculo.mensaje_error], ['pausado', MENSAJE_PAUSA]);
    assertEquals(repositorio.pasos.get(id)!.get(11)?.estado, 'pendiente');
    assertEquals(repositorio.referencias.length, 0);

    // Al reanudar se retoma desde el mismo paso.
    const reanudada = await llamar(deps, { id_calculo: id });
    assertEquals(reanudada.status, 200);
    assertEquals(repositorio.pasos.get(id)!.get(11)?.estado, 'hecho');
    assertEquals(repositorio.calculos.get(id)!.estado, 'en_proceso');
  },
);

Deno.test(
  'la espera total de un paso no pasa de 90 s: se rinde antes de reventar el tiempo',
  async () => {
    const reloj = crearRelojFalso();
    const { fetch, horas } = fetchConHora(reloj, [limite(429, '30s')]);
    const { deps } = crear(reloj, fetch);
    const id = await nuevoCalculo(deps);

    const respuesta = await llamar(deps, { id_calculo: id });

    assertEquals(respuesta.status, 503);
    assert(suma(reloj.esperas) <= 90_000, `esperó ${suma(reloj.esperas)} ms`);
    assertEquals(horas.length, 3, 'el tercer reintento ya no cabía en el presupuesto');
  },
);

// (d) 503 ----------------------------------------------------------------------------------

Deno.test('503 se reintenta igual que 429: éxito sin pausar, o pausa al agotarse', async () => {
  const relojA = crearRelojFalso();
  const exito = fetchConHora(relojA, [limite(503, '2s'), ok()]);
  const a = crear(relojA, exito.fetch);
  const idA = await nuevoCalculo(a.deps);
  assertEquals((await llamar(a.deps, { id_calculo: idA })).status, 200);
  assertEquals(a.repositorio.calculos.get(idA)!.estado, 'en_proceso');
  // El reintento también es una llamada: tras los 2 s del retryDelay faltan 2 s para el ritmo.
  assertEquals(relojA.esperas, [4000, 2000, 2000]);

  const relojB = crearRelojFalso();
  const agotado = fetchConHora(relojB, [limite(503, '1s')]);
  const b = crear(relojB, agotado.fetch);
  const idB = await nuevoCalculo(b.deps);
  const respuesta = await llamar(b.deps, { id_calculo: idB });
  assertEquals(respuesta.status, 503);
  assertEquals((await respuesta.json()).error, MENSAJE_PAUSA);
  assertEquals(agotado.horas.length, 4);
  assertEquals(b.repositorio.calculos.get(idB)!.estado, 'pausado');
});

// Lo que NO se reintenta ---------------------------------------------------------------------

Deno.test(
  'no se reintenta: otros 5xx, clave rechazada, caída de red ni respuesta inválida',
  async () => {
    for (const guion of [
      respuestaJson({}, 500),
      respuestaJson({}, 502),
      respuestaJson({}, 403),
      new TypeError('sin red'),
      respuestaJson({}, 400),
    ]) {
      const reloj = crearRelojFalso();
      const { fetch, horas } = fetchConHora(reloj, [guion]);
      const clasificador = new GeminiClasificador({
        apiKey: 'k',
        modelo: 'm',
        fetch,
        ritmo: ritmoDe(reloj),
      });
      await assertRejects(() => clasificador.clasificar('f', 's', 'c', [candidato(1)]));
      assertEquals(horas.length, 1);
      assertEquals(reloj.esperas, [4000], 'solo la espera de ritmo previa a la llamada');
    }
  },
);

Deno.test(
  'sin ritmo configurado el clasificador no espera ni reintenta (comportamiento anterior)',
  async () => {
    const { fetch, llamadas } = crearFetchGuionado([limite(429, '1s')]);
    await assertRejects(
      () =>
        new GeminiClasificador({ apiKey: 'k', modelo: 'm', fetch }).clasificar('f', 's', 'c', []),
      ErrorProveedorNoDisponible,
    );
    assertEquals(llamadas.length, 1);
  },
);

// (e) El clasificador falso nunca espera --------------------------------------------------

Deno.test('LLM_PROVIDER=fake: el recálculo completo no espera nunca', async () => {
  const reloj = crearRelojFalso();
  const repositorio = new RepositorioMemoria();
  const base = crearDependencias(
    (nombre) => (nombre === 'LLM_PROVIDER' ? 'fake' : undefined),
    { repositorio, verificador: verificadorFalso },
    { ahora: reloj.ahora, esperar: (ms) => reloj.esperar(ms) },
  );
  const deps: Dependencias = { ...base, contexto: CONTEXTO_PRUEBA };
  const id = await nuevoCalculo(deps);

  for (let i = 0; i < 5; i++) assertEquals((await llamar(deps, { id_calculo: id })).status, 200);

  assertEquals(
    [...repositorio.pasos.get(id)!.values()].every((p) => p.estado === 'hecho'),
    true,
  );
  assertEquals(reloj.esperas, []);
});
