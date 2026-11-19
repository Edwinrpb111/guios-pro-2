// Tope de 110 s por paso (issue #43, S15a): cada fetch con su tiempo acotado, ningún lote ni
// reintento sin tiempo, y la pausa con un mensaje claro y el paso reanudable. Todo con reloj
// falso y `fetch` falso: nada duerme ni sale a la red.
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { buscarYClasificar } from './busqueda.ts';
import { GeminiClasificador } from './clasificador.ts';
import { ClasificadorCompatibleOpenAI } from './clasificador_openai.ts';
import { CrossrefProveedor } from './crossref.ts';
import { crearDependencias, type Dependencias } from './dependencias.ts';
import {
  ErrorPasoSinTiempo,
  ErrorProveedorNoDisponible,
  ErrorRespuestaInvalida,
} from './errores.ts';
import { atender } from './http.ts';
import { OpenAlexProveedor } from './openalex.ts';
import { PresupuestoPaso } from './presupuesto.ts';
import { iniciar } from './recalculo_iniciar.ts';
import { paso } from './recalculo_paso.ts';
import {
  candidato,
  CATALOGO_PRUEBA,
  clasificadorGuionado,
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
import type { Candidato, Clasificador, Veredicto } from './tipos.ts';

type Reloj = ReturnType<typeof crearRelojFalso>;

/** Presupuesto con reloj falso y señales controlables que anotan el tiempo pedido. */
function presupuestoFalso(reloj: Reloj) {
  const pedidas: number[] = [];
  const controles: AbortController[] = [];
  const presupuesto = new PresupuestoPaso({
    ahora: reloj.ahora,
    crearSenal: (ms) => {
      pedidas.push(ms);
      const control = new AbortController();
      controles.push(control);
      return control.signal;
    },
  });
  return { presupuesto, pedidas, controles };
}

/**
 * `fetch` «lento»: no responde nunca. Al recibir la llamada simula que el tiempo se agotó
 * (aborta la señal de esa llamada con un `TimeoutError`) y la promesa se rechaza.
 */
function fetchLento(controles: AbortController[]): typeof fetch {
  return ((_entrada: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolver, rechazar) => {
      init?.signal?.addEventListener('abort', () =>
        rechazar(new DOMException('se agotó el tiempo', 'TimeoutError')),
      );
      queueMicrotask(() => controles.at(-1)?.abort());
    })) as typeof fetch;
}

const CANDIDATOS = [candidato(1)];
const respuestaGemini = () =>
  respuestaJson({ candidates: [{ content: { parts: [{ text: '[]' }] } }] });

// Fetch con tiempo acotado ----------------------------------------------------------------

Deno.test(
  'Gemini: la llamada espera como máximo 30 s y, si se corta, no es un corte por tope',
  async () => {
    const reloj = crearRelojFalso();
    const { presupuesto, pedidas, controles } = presupuestoFalso(reloj);
    const clasificador = new GeminiClasificador({
      apiKey: 'clave',
      modelo: 'm',
      fetch: fetchLento(controles),
      presupuesto,
    });

    const error = await assertRejects(
      () => clasificador.clasificar('F', 'S', 'C', CANDIDATOS),
      ErrorProveedorNoDisponible,
    );

    assertEquals(pedidas, [30_000], 'el tiempo propio por defecto bajó de 60 s a 30 s');
    assert(!(error instanceof ErrorPasoSinTiempo), 'con tiempo de sobra no es un corte por tope');
    assert(error.message.includes('No se pudo conectar con Gemini'));
  },
);

Deno.test(
  'Gemini: si queda menos que su tiempo propio, usa lo que queda y pausa por tiempo',
  async () => {
    const reloj = crearRelojFalso();
    const { presupuesto, pedidas, controles } = presupuestoFalso(reloj);
    await reloj.esperar(90_000); // quedan 20 s
    const clasificador = new GeminiClasificador({
      apiKey: 'clave',
      modelo: 'm',
      fetch: fetchLento(controles),
      presupuesto,
    });

    await assertRejects(
      () => clasificador.clasificar('F', 'S', 'C', CANDIDATOS),
      ErrorPasoSinTiempo,
    );
    assertEquals(pedidas, [20_000]);
  },
);

Deno.test('compatible con OpenAI: mismo tope de 30 s y de lo que queda del paso', async () => {
  for (const [adelanto, esperado, porTope] of [
    [0, 30_000, false],
    [95_000, 15_000, true],
  ] as const) {
    const reloj = crearRelojFalso();
    const { presupuesto, pedidas, controles } = presupuestoFalso(reloj);
    await reloj.esperar(adelanto);
    const clasificador = new ClasificadorCompatibleOpenAI({
      apiKey: 'clave',
      urlBase: 'https://proveedor.example/v1',
      modelo: 'm',
      fetch: fetchLento(controles),
      presupuesto,
    });

    const error = await assertRejects(
      () => clasificador.clasificar('F', 'S', 'C', CANDIDATOS),
      ErrorProveedorNoDisponible,
    );

    assertEquals(pedidas, [esperado]);
    assertEquals(error instanceof ErrorPasoSinTiempo, porTope);
  }
});

Deno.test(
  'OpenAlex y Crossref: 20 s propios o lo que quede del paso, y pausan por tiempo',
  async () => {
    const fabricas = [
      (presupuesto: PresupuestoPaso, fetch: typeof globalThis.fetch) =>
        new OpenAlexProveedor({ apiKey: 'clave', fetch, presupuesto }),
      (presupuesto: PresupuestoPaso, fetch: typeof globalThis.fetch) =>
        new CrossrefProveedor({
          fetch,
          presupuesto,
          ahora: () => 0,
          esperar: () => Promise.resolve(),
        }),
    ];
    for (const crear of fabricas) {
      for (const [adelanto, esperado, porTope] of [
        [0, 20_000, false],
        [100_000, 10_000, true],
      ] as const) {
        const reloj = crearRelojFalso();
        const { presupuesto, pedidas, controles } = presupuestoFalso(reloj);
        await reloj.esperar(adelanto);
        const proveedor = crear(presupuesto, fetchLento(controles));

        const error = await assertRejects(
          () => proveedor.buscar('consulta', 2020, 2025, 10),
          ErrorProveedorNoDisponible,
        );

        assertEquals(pedidas, [esperado]);
        assertEquals(error instanceof ErrorPasoSinTiempo, porTope);
      }
    }
  },
);

Deno.test('Gemini: con el tiempo agotado ni siquiera llama a la API', async () => {
  const reloj = crearRelojFalso();
  const { presupuesto } = presupuestoFalso(reloj);
  await reloj.esperar(110_000);
  const { fetch, llamadas } = crearFetchGuionado([respuestaGemini()]);
  const clasificador = new GeminiClasificador({ apiKey: 'c', modelo: 'm', fetch, presupuesto });

  await assertRejects(() => clasificador.clasificar('F', 'S', 'C', CANDIDATOS), ErrorPasoSinTiempo);
  assertEquals(llamadas.length, 0);
});

// Reintentos y ritmo dentro del tope -----------------------------------------------------------

function ritmoConTope(reloj: Reloj, presupuesto: PresupuestoPaso) {
  return new RitmoDeLlamadas(
    { ahora: reloj.ahora, esperar: (ms) => reloj.esperar(ms) },
    15,
    undefined,
    presupuesto,
  );
}

Deno.test('reintento: no se reintenta si tras la espera quedarían menos de 15 s', async () => {
  const reloj = crearRelojFalso();
  const { presupuesto } = presupuestoFalso(reloj);
  await reloj.esperar(60_000); // quedan 50 s; el ritmo espera 4 s y quedan 46 s
  const limite = respuestaJson(
    {
      error: {
        code: 429,
        details: [{ '@type': 'google.rpc.RetryInfo', retryDelay: '30s' }],
      },
    },
    429,
  );
  const { fetch, llamadas } = crearFetchGuionado([limite, limite, respuestaGemini()]);
  const clasificador = new GeminiClasificador({
    apiKey: 'c',
    modelo: 'm',
    fetch,
    presupuesto,
    ritmo: ritmoConTope(reloj, presupuesto),
  });

  // 1.ª llamada a los 4 s (quedan 46); 429 → espera 30 s (quedan 16 ≥ 15) → 2.ª llamada;
  // 429 → otra espera de 30 s dejaría -14: se corta por tiempo, sin esperar.
  await assertRejects(() => clasificador.clasificar('F', 'S', 'C', CANDIDATOS), ErrorPasoSinTiempo);
  assertEquals(llamadas.length, 2);
  assertEquals(reloj.esperas.slice(-1), [30_000], 'no durmió una tercera vez');
});

Deno.test(
  'ritmo: si esperar el turno deja menos de 15 s, se pausa por tiempo sin esperar',
  async () => {
    const reloj = crearRelojFalso();
    const { presupuesto } = presupuestoFalso(reloj);
    await reloj.esperar(100_000); // quedan 10 s
    const ritmo = ritmoConTope(reloj, presupuesto);

    await assertRejects(() => ritmo.esperarTurno(), ErrorPasoSinTiempo);
    assertEquals(reloj.esperas, [100_000], 'no esperó el intervalo de 4 s');
  },
);

Deno.test('ritmo: con tiempo de sobra el comportamiento de #39 no cambia', async () => {
  const reloj = crearRelojFalso();
  const { presupuesto } = presupuestoFalso(reloj);
  const ritmo = ritmoConTope(reloj, presupuesto);
  await ritmo.esperarTurno();
  assertEquals(reloj.esperas, [4000]);
  assertEquals(await ritmo.esperarReintento(0, null), true);
  assertEquals(reloj.esperas, [4000, 5000]);
});

// Lotes dentro del tope -------------------------------------------------------------------------

/** Clasificador que «tarda» `ms` en cada lote (adelanta el reloj falso) y acepta todo. */
function clasificadorLento(reloj: Reloj, ms: number): Clasificador & { lotes: number } {
  const resultado = {
    lotes: 0,
    async clasificar(
      _factor: string,
      _subfactor: string,
      _contexto: string,
      lote: Candidato[],
    ): Promise<Veredicto[]> {
      resultado.lotes++;
      await reloj.esperar(ms);
      return lote.map((_, i) => ({
        indice: i + 1,
        trata_subfactor: true,
        confianza: 0.95,
        evidencia: 'ok',
      }));
    },
  };
  return resultado;
}

Deno.test('lotes: no se empieza un lote cuando queda menos de 15 s', async () => {
  const reloj = crearRelojFalso();
  const { presupuesto } = presupuestoFalso(reloj);
  const clasificador = clasificadorLento(reloj, 40_000);
  const candidatos = Array.from({ length: 40 }, (_, i) => candidato(i + 1)); // 4 lotes

  await assertRejects(
    () =>
      buscarYClasificar({
        subfactor: CATALOGO_PRUEBA[0]!,
        contexto: CONTEXTO_PRUEBA,
        proveedores: [proveedorFijo('openalex', candidatos)],
        clasificador,
        anioInicio: 2020,
        anioFin: 2025,
        umbral: 0.7,
        maxCandidatos: 40,
        presupuesto,
      }),
    ErrorPasoSinTiempo,
  );
  // Lotes a los 0, 40 y 80 s; al llegar a 120 s ya no queda tiempo para el cuarto.
  assertEquals(clasificador.lotes, 3);
});

Deno.test('lotes: con tiempo de sobra se clasifican todos y el resultado no cambia', async () => {
  const reloj = crearRelojFalso();
  const { presupuesto } = presupuestoFalso(reloj);
  const clasificador = clasificadorLento(reloj, 1000);
  const candidatos = Array.from({ length: 25 }, (_, i) => candidato(i + 1));

  const resultado = await buscarYClasificar({
    subfactor: CATALOGO_PRUEBA[0]!,
    contexto: CONTEXTO_PRUEBA,
    proveedores: [proveedorFijo('openalex', candidatos)],
    clasificador,
    anioInicio: 2020,
    anioFin: 2025,
    umbral: 0.7,
    maxCandidatos: 25,
    presupuesto,
  });

  assertEquals(clasificador.lotes, 3);
  assertEquals(resultado.referencias.length, 25);
});

// El paso completo: pausa clara y paso reanudable ---------------------------------------------

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

function dependenciasConReloj(reloj: Reloj, clasificador: Clasificador, candidatos = 40) {
  const repositorio = new RepositorioMemoria();
  const base = crearDependencias(
    (nombre) => ({ LLM_PROVIDER: 'fake' })[nombre],
    { repositorio, verificador: verificadorFalso },
    { ahora: reloj.ahora, esperar: (ms) => reloj.esperar(ms) },
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
    clasificador: () => clasificador,
  };
  return { deps, repositorio };
}

Deno.test('paso: al agotar los 110 s el cálculo queda pausado con un mensaje claro', async () => {
  const reloj = crearRelojFalso();
  const { deps, repositorio } = dependenciasConReloj(reloj, clasificadorLento(reloj, 40_000));
  const id = await nuevoCalculo(deps);

  const respuesta = await llamar(deps, { id_calculo: id });

  assertEquals(respuesta.status, 503);
  const cuerpo = await respuesta.json();
  assertEquals(cuerpo.codigo, 'paso_sin_tiempo');
  assertEquals(cuerpo.estado, 'pausado');
  assertEquals([cuerpo.progreso, cuerpo.pendientes], [0, 5]);
  const mensaje =
    'El subfactor «Formatos estándar» tardó más de lo permitido (110 s). Reduce el máximo de candidatos o sube las llamadas por minuto y reanuda.';
  assertEquals(cuerpo.error, mensaje);
  const calculo = repositorio.calculos.get(id)!;
  assertEquals(calculo.estado, 'pausado');
  assertEquals(calculo.mensaje_error, mensaje);
});

Deno.test(
  'paso: tras agotar el tiempo el paso sigue pendiente, sin guardar nada, y es reanudable',
  async () => {
    const reloj = crearRelojFalso();
    const lento = clasificadorLento(reloj, 40_000);
    let actual: Clasificador = lento;
    const { deps, repositorio } = dependenciasConReloj(reloj, lento);
    const conActual: Dependencias = { ...deps, clasificador: () => actual };
    const id = await nuevoCalculo(conActual);

    await llamar(conActual, { id_calculo: id });
    assertEquals(repositorio.pasos.get(id)!.get(11)?.estado, 'pendiente');
    assertEquals(repositorio.referencias.length, 0);

    // El administrador reduce candidatos o la IA responde rápido: se reanuda el MISMO subfactor.
    actual = clasificadorGuionado();
    const respuesta = await llamar(conActual, { id_calculo: id });
    assertEquals(respuesta.status, 200);
    assertEquals(repositorio.calculos.get(id)!.estado, 'en_proceso');
    assertEquals(repositorio.calculos.get(id)!.mensaje_error, null);
    assertEquals(repositorio.pasos.get(id)!.get(11)?.estado, 'hecho');
  },
);

Deno.test(
  'paso: el presupuesto de 110 s se entrega a los proveedores y al clasificador',
  async () => {
    const reloj = crearRelojFalso();
    const recibidos: unknown[] = [];
    const { deps } = dependenciasConReloj(reloj, clasificadorGuionado());
    const espiado: Dependencias = {
      ...deps,
      proveedores: (fuentes, presupuesto) => {
        recibidos.push(presupuesto);
        return deps.proveedores(fuentes, presupuesto);
      },
      clasificador: (modelo, presupuesto) => {
        recibidos.push(presupuesto);
        return deps.clasificador(modelo, presupuesto);
      },
    };
    const id = await nuevoCalculo(espiado);
    recibidos.length = 0; // iniciar solo valida la configuración, sin tope de tiempo

    await llamar(espiado, { id_calculo: id });

    assertEquals(recibidos.length, 2);
    assert(recibidos.every((r) => r instanceof PresupuestoPaso));
    assert(recibidos[0] === recibidos[1], 'es el mismo presupuesto para todo el paso');
  },
);

Deno.test('paso: los demás errores conservan su código y su mensaje', async () => {
  const reloj = crearRelojFalso();
  for (const [error, codigo, estado] of [
    [new ErrorProveedorNoDisponible('Gemini se quedó sin cuota.'), 'proveedor_no_disponible', 503],
    [new ErrorRespuestaInvalida('Respuesta rara.'), 'respuesta_invalida', 502],
  ] as const) {
    const fallido: Clasificador = { clasificar: () => Promise.reject(error) };
    const { deps } = dependenciasConReloj(reloj, fallido, 3);
    const id = await nuevoCalculo(deps);
    const respuesta = await llamar(deps, { id_calculo: id });
    assertEquals(respuesta.status, estado);
    const cuerpo = await respuesta.json();
    assertEquals([cuerpo.codigo, cuerpo.error], [codigo, error.message]);
  }
});
