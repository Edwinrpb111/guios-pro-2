// Registro por paso del recálculo (issue #43, S15b): lo que se guarda en `recalculo_paso`
// (iniciado_en, duracion_ms, registro) y la línea `console.log` por intento. Todo con reloj y
// `fetch` falsos. El registro y el log nunca llevan claves, direcciones, prompts ni textos.
import { assert, assertEquals, assertMatch, assertNotMatch } from 'jsr:@std/assert@1';
import { GeminiClasificador } from './clasificador.ts';
import { ClasificadorCompatibleOpenAI } from './clasificador_openai.ts';
import { crearDependencias, type Dependencias } from './dependencias.ts';
import { ErrorProveedorNoDisponible, ErrorRespuestaInvalida } from './errores.ts';
import { atender } from './http.ts';
import { iniciar } from './recalculo_iniciar.ts';
import { paso } from './recalculo_paso.ts';
import {
  candidato,
  clasificadorGuionado,
  CONTEXTO_PRUEBA,
  crearFetchGuionado,
  crearRelojFalso,
  proveedorFijo,
  respuestaJson,
  TOKEN_ADMIN,
  verificadorFalso,
} from './pruebas.ts';
import { crearDependenciasPrueba, RepositorioMemoria } from './pruebas_recalculo.ts';
import type { Candidato, Clasificador, ProveedorBusqueda, Veredicto } from './tipos.ts';

type Reloj = ReturnType<typeof crearRelojFalso>;
type Deps = ReturnType<typeof crearDependenciasPrueba>;

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

async function nuevoCalculo(deps: Dependencias, fuentes = ['openalex', 'crossref']) {
  const respuesta = await atender(
    new Request('http://localhost/', {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN_ADMIN}` },
      body: JSON.stringify({ anio_inicio: 2020, anio_fin: 2025, fuentes }),
    }),
    { origenes: [], verificador: () => verificadorFalso, crear: () => deps },
    (entrada, admin, dependencias) => iniciar(entrada, admin, dependencias),
  );
  return (await respuesta.json()).id_calculo as number;
}

/** Ejecuta `accion` guardando lo que se escribe con `console.log` (y lo restaura siempre). */
async function capturarConsola<T>(accion: () => Promise<T>) {
  const original = console.log;
  const lineas: string[] = [];
  console.log = (...argumentos: unknown[]) => {
    lineas.push(argumentos.map(String).join(' '));
  };
  try {
    const resultado = await accion();
    return { resultado, lineas };
  } finally {
    console.log = original;
  }
}

/** Deja correr las tareas pendientes (sin temporizadores) para ver el estado «a medio paso». */
async function vaciarTareas() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}

const ID_SUBFACTOR = 11;
const registroDe = (deps: Deps, id: number) => deps.repositorio.pasos.get(id)!.get(ID_SUBFACTOR)!;

// Contenido del registro --------------------------------------------------------------------------

Deno.test(
  'registro: un paso correcto guarda inicio, duración y el detalle de búsquedas y lotes',
  async () => {
    const reloj = crearRelojFalso();
    // Cada búsqueda tarda 1234 ms y cada lote 2345 ms (se adelanta el reloj falso).
    const lento: ProveedorBusqueda[] = (['openalex', 'crossref'] as const).map((nombre) => ({
      nombre,
      async buscar() {
        await reloj.esperar(1234);
        return [1, 2, 3].map((k) => candidato(k, { doi: `10.1000/${nombre}.${k}`, base: nombre }));
      },
    }));
    const clasificador: Clasificador = {
      async clasificar(_f, _s, _c, lote: Candidato[]): Promise<Veredicto[]> {
        await reloj.esperar(2345);
        return lote.map((_, i) => ({
          indice: i + 1,
          trata_subfactor: i < 4,
          confianza: 0.95,
          evidencia: 'ok',
        }));
      },
    };
    const deps = crearDependenciasPrueba({
      ahora: reloj.ahora,
      esperar: (ms) => reloj.esperar(ms),
      proveedores: () => lento,
      clasificador: () => clasificador,
    });
    const id = await nuevoCalculo(deps);

    const respuesta = await llamar(deps, { id_calculo: id });

    assertEquals(respuesta.status, 200);
    const fila = registroDe(deps, id);
    assertEquals(fila.estado, 'hecho');
    assertEquals(fila.iniciado_en, new Date(1_000_000).toISOString());
    assertEquals(fila.duracion_ms, 1234 * 2 + 2345);
    assertEquals(fila.registro, {
      intento: 1,
      proveedor: 'fake',
      busqueda: [
        { fuente: 'openalex', ms: 1234, candidatos: 3, error: null },
        { fuente: 'crossref', ms: 1234, candidatos: 3, error: null },
      ],
      lotes: [{ n: 1, tamano: 6, ms: 2345, reintentos: 0, resultado: 'ok', aceptados: 4 }],
      aceptados: 4,
      resultado: 'hecho',
      mensaje: null,
    });
  },
);

Deno.test('registro: con varios lotes anota cada uno con su tamaño y sus aceptados', async () => {
  const deps = crearDependenciasPrueba({
    proveedores: () => [
      proveedorFijo(
        'openalex',
        Array.from({ length: 25 }, (_, i) => candidato(i + 1)),
      ),
    ],
  });
  const id = await nuevoCalculo(deps, ['openalex']);

  await llamar(deps, { id_calculo: id });

  const registro = registroDe(deps, id).registro!;
  assertEquals(
    registro.lotes.map((l) => [l.n, l.tamano, l.resultado, l.aceptados]),
    [
      [1, 10, 'ok', 10],
      [2, 10, 'ok', 10],
      [3, 5, 'ok', 5],
    ],
  );
  assertEquals(registro.aceptados, 25);
});

Deno.test('registro: una fuente caída queda anotada con su error y sin lotes', async () => {
  const caido: ProveedorBusqueda = {
    nombre: 'openalex',
    buscar: () =>
      Promise.reject(new ErrorProveedorNoDisponible('OpenAlex alcanzó su límite de uso.')),
  };
  const deps = crearDependenciasPrueba({ proveedores: () => [caido] });
  const id = await nuevoCalculo(deps, ['openalex']);

  const respuesta = await llamar(deps, { id_calculo: id });

  assertEquals(respuesta.status, 503);
  const fila = registroDe(deps, id);
  assertEquals(fila.estado, 'pendiente');
  assert(fila.iniciado_en !== null);
  assertEquals(fila.duracion_ms, 0);
  assertEquals(fila.registro, {
    intento: 1,
    proveedor: 'fake',
    busqueda: [
      { fuente: 'openalex', ms: 0, candidatos: 0, error: 'OpenAlex alcanzó su límite de uso.' },
    ],
    lotes: [],
    aceptados: 0,
    resultado: 'pausado',
    mensaje: 'OpenAlex alcanzó su límite de uso.',
  });
});

Deno.test('registro: un lote que falla queda como pausado con el motivo del lote', async () => {
  const fallido: Clasificador = {
    clasificar: () =>
      Promise.reject(new ErrorProveedorNoDisponible('Sin cuota.', 'reintento_agotado')),
  };
  const deps = crearDependenciasPrueba({ clasificador: () => fallido });
  const id = await nuevoCalculo(deps);

  await llamar(deps, { id_calculo: id });

  const registro = registroDe(deps, id).registro!;
  assertEquals(registro.resultado, 'pausado');
  assertEquals(registro.mensaje, 'Sin cuota.');
  assertEquals(registro.aceptados, 0, 'no se guardó nada: no hay aceptados');
  assertEquals(registro.lotes, [
    { n: 1, tamano: 6, ms: 0, reintentos: 0, resultado: 'reintento_agotado', aceptados: 0 },
  ]);
  assertEquals(registroDe(deps, id).estado, 'pendiente');
});

Deno.test(
  'registro: una respuesta inválida deja el paso en error y el registro como error',
  async () => {
    const fallido: Clasificador = {
      clasificar: () => Promise.reject(new ErrorRespuestaInvalida('Respuesta que no es JSON.')),
    };
    const deps = crearDependenciasPrueba({ clasificador: () => fallido });
    const id = await nuevoCalculo(deps);

    const respuesta = await llamar(deps, { id_calculo: id });

    assertEquals(respuesta.status, 502);
    const fila = registroDe(deps, id);
    assertEquals(fila.estado, 'error');
    assertEquals(fila.detalle, 'Respuesta que no es JSON.');
    assertEquals(fila.registro!.resultado, 'error');
    assertEquals(fila.registro!.lotes[0]!.resultado, 'respuesta_invalida');
    assertEquals(fila.registro!.mensaje, 'Respuesta que no es JSON.');
  },
);

Deno.test(
  'registro: un fallo inesperado se anota sin copiar su texto y sigue siendo 500',
  async () => {
    const roto: Clasificador = {
      clasificar: () =>
        Promise.reject(new Error('fallo con sk-secreto en https://interno.example/x')),
    };
    const deps = crearDependenciasPrueba({ clasificador: () => roto });
    const id = await nuevoCalculo(deps);
    const errores: unknown[][] = [];
    const original = console.error;
    console.error = (...a: unknown[]) => errores.push(a);
    let respuesta: Response;
    try {
      respuesta = await llamar(deps, { id_calculo: id });
    } finally {
      console.error = original;
    }

    assertEquals(respuesta.status, 500);
    assertEquals((await respuesta.json()).codigo, 'error_interno');
    const registro = registroDe(deps, id).registro!;
    assertEquals(registro.resultado, 'error');
    assertEquals(registro.lotes[0]!.resultado, 'error');
    assert(registro.mensaje !== null && registro.mensaje.length > 0);
    assertNotMatch(JSON.stringify(registro), /sk-secreto|interno\.example/);
  },
);

Deno.test(
  'registro: un paso que la plataforma cortó muestra iniciado_en y duracion_ms nula',
  async () => {
    const colgado: Clasificador = { clasificar: () => new Promise<Veredicto[]>(() => {}) };
    const deps = crearDependenciasPrueba({ clasificador: () => colgado });
    const id = await nuevoCalculo(deps);

    void llamar(deps, { id_calculo: id }); // nunca termina: «lo cortó la plataforma»
    await vaciarTareas();

    const fila = registroDe(deps, id);
    assertEquals(fila.estado, 'pendiente');
    assertEquals(fila.iniciado_en, new Date(0).toISOString());
    assertEquals(fila.duracion_ms, null);
    assertEquals(fila.registro!.intento, 1);
    assertEquals(fila.registro!.proveedor, 'fake');
    assertEquals(fila.registro!.resultado, 'error');
    assertMatch(fila.registro!.mensaje ?? '', /no terminó/);
  },
);

Deno.test(
  'registro: el intento sube cada vez que se repite el mismo paso, también tras un corte',
  async () => {
    let clasificador: Clasificador = { clasificar: () => new Promise<Veredicto[]>(() => {}) };
    const deps = crearDependenciasPrueba({ clasificador: () => clasificador });
    const id = await nuevoCalculo(deps);

    void llamar(deps, { id_calculo: id }); // 1.º: cortado por la plataforma
    await vaciarTareas();
    assertEquals(registroDe(deps, id).registro!.intento, 1);

    clasificador = {
      clasificar: () => Promise.reject(new ErrorProveedorNoDisponible('Sin cuota.')),
    };
    await llamar(deps, { id_calculo: id }); // 2.º: pausa
    assertEquals(registroDe(deps, id).registro!.intento, 2);

    clasificador = clasificadorGuionado();
    await llamar(deps, { id_calculo: id }); // 3.º: termina
    const fila = registroDe(deps, id);
    assertEquals(fila.estado, 'hecho');
    assertEquals(fila.registro!.intento, 3);
    assertEquals(fila.registro!.resultado, 'hecho');
    assert(fila.duracion_ms !== null);
  },
);

Deno.test('registro: cada subfactor guarda su propio registro', async () => {
  const deps = crearDependenciasPrueba();
  const id = await nuevoCalculo(deps);
  await llamar(deps, { id_calculo: id });
  await llamar(deps, { id_calculo: id });
  assert(deps.repositorio.pasos.get(id)!.get(11)!.registro !== null);
  assert(deps.repositorio.pasos.get(id)!.get(12)!.registro !== null);
  assertEquals(deps.repositorio.pasos.get(id)!.get(21)!.registro, null);
});

Deno.test('registro: los motivos de lote de Gemini y del compatible con OpenAI', async () => {
  const candidatos = [candidato(1)];
  const motivo = async (clasificador: Clasificador) => {
    try {
      await clasificador.clasificar('F', 'S', 'C', candidatos);
    } catch (error) {
      if (error instanceof ErrorProveedorNoDisponible) return error.motivo;
      if (error instanceof ErrorRespuestaInvalida) return 'respuesta_invalida';
    }
    return 'sin_error';
  };
  const gemini = (respuesta: Response | Error) =>
    new GeminiClasificador({
      apiKey: 'c',
      modelo: 'm',
      fetch: crearFetchGuionado([respuesta]).fetch,
    });
  const openai = (respuesta: Response | Error) =>
    new ClasificadorCompatibleOpenAI({
      apiKey: 'c',
      urlBase: 'https://proveedor.example/v1',
      modelo: 'm',
      fetch: crearFetchGuionado([respuesta]).fetch,
    });

  assertEquals(await motivo(gemini(respuestaJson({}, 429))), 'reintento_agotado');
  assertEquals(await motivo(gemini(respuestaJson({}, 503))), 'reintento_agotado');
  assertEquals(await motivo(gemini(respuestaJson({}, 500))), 'error');
  assertEquals(await motivo(gemini(respuestaJson({}, 401))), 'clave_rechazada');
  assertEquals(await motivo(gemini(new Error('red caída'))), 'error');
  assertEquals(await motivo(gemini(respuestaJson({ candidates: [] }))), 'respuesta_invalida');

  assertEquals(await motivo(openai(respuestaJson({}, 429))), 'reintento_agotado');
  assertEquals(await motivo(openai(respuestaJson({}, 502))), 'error');
  assertEquals(await motivo(openai(respuestaJson({}, 403))), 'clave_rechazada');
  assertEquals(await motivo(openai(respuestaJson({}, 402))), 'sin_saldo');
  assertEquals(await motivo(openai(new Error('red caída'))), 'error');
});

Deno.test('registro: con Gemini real (fetch falso) anota los reintentos del lote', async () => {
  const reloj = crearRelojFalso();
  const limite = respuestaJson(
    { error: { code: 429, details: [{ '@type': 'google.rpc.RetryInfo', retryDelay: '5s' }] } },
    429,
  );
  const ok = respuestaJson({ candidates: [{ content: { parts: [{ text: '[]' }] } }] });
  const { fetch } = crearFetchGuionado([limite, limite, ok]);
  const repositorio = new RepositorioMemoria();
  const variables: Record<string, string> = {
    LLM_PROVIDER: 'gemini',
    GEMINI_API_KEY: 'clave-gemini-123',
    OPENALEX_API_KEY: 'clave-openalex-456',
  };
  const base = crearDependencias(
    (nombre) => variables[nombre],
    { repositorio, verificador: verificadorFalso },
    { ahora: reloj.ahora, esperar: (ms) => reloj.esperar(ms), fetch },
  );
  const deps: Dependencias = {
    ...base,
    contexto: CONTEXTO_PRUEBA,
    proveedores: (fuentes) => fuentes.map((f) => proveedorFijo(f, [candidato(1), candidato(2)])),
  };
  const id = await nuevoCalculo(deps, ['openalex']);

  const respuesta = await llamar(deps, { id_calculo: id });

  assertEquals(respuesta.status, 200);
  const registro = repositorio.pasos.get(id)!.get(ID_SUBFACTOR)!.registro!;
  assertEquals(registro.proveedor, 'gemini');
  assertEquals(registro.lotes.length, 1);
  assertEquals(registro.lotes[0]!.reintentos, 2);
  assertEquals(registro.lotes[0]!.resultado, 'ok');
  assertEquals(registro.lotes[0]!.ms, 4000 + 5000 + 5000);
});

// Seguridad del registro y del log --------------------------------------------------------------

/** Dependencias con Gemini «real» (fetch falso): la clave viaja en la petición, no en el registro. */
function dependenciasConGemini(respuestas: (Response | Error)[]) {
  const reloj = crearRelojFalso();
  const repositorio = new RepositorioMemoria();
  const variables: Record<string, string> = {
    LLM_PROVIDER: 'gemini',
    GEMINI_API_KEY: 'clave-gemini-123',
    OPENALEX_API_KEY: 'clave-openalex-456',
  };
  const base = crearDependencias(
    (nombre) => variables[nombre],
    { repositorio, verificador: verificadorFalso },
    {
      ahora: reloj.ahora,
      esperar: (ms) => reloj.esperar(ms),
      fetch: crearFetchGuionado(respuestas).fetch,
    },
  );
  const deps: Dependencias = {
    ...base,
    contexto: CONTEXTO_PRUEBA,
    proveedores: (fuentes) =>
      fuentes.map((f) => proveedorFijo(f, [candidato(1), candidato(2), candidato(3)])),
  };
  return { deps, repositorio };
}

Deno.test(
  'log: una línea JSON por intento, con lo útil y sin claves, direcciones ni textos',
  async () => {
    const ok = respuestaJson({ candidates: [{ content: { parts: [{ text: '[]' }] } }] });
    const rechazada = respuestaJson({ error: { message: 'API key not valid' } }, 401);
    const { deps, repositorio } = dependenciasConGemini([ok, rechazada]);
    const id = await nuevoCalculo(deps, ['openalex']);

    const { lineas } = await capturarConsola(async () => {
      await llamar(deps, { id_calculo: id }); // correcto
      await llamar(deps, { id_calculo: id }); // clave rechazada → pausa
    });

    assertEquals(lineas.length, 2, 'exactamente una línea por intento');
    const [primera, segunda] = lineas.map((l) => JSON.parse(l) as Record<string, unknown>);
    assertEquals(primera!.evento, 'recalculo_paso');
    assertEquals(primera!.id_calculo, id);
    assertEquals(primera!.id_subfactor, 11);
    assertEquals(primera!.subfactor, '1.1');
    assertEquals(primera!.intento, 1);
    assertEquals(primera!.proveedor, 'gemini');
    assertEquals(primera!.resultado, 'hecho');
    assertEquals(typeof primera!.duracion_ms, 'number');
    assertEquals(primera!.candidatos, 3);
    assertEquals(primera!.lotes, 1);
    assertEquals(primera!.aceptados, 0);
    assertEquals(segunda!.id_subfactor, 12);
    assertEquals(segunda!.subfactor, '1.2');
    assertEquals(segunda!.resultado, 'pausado');

    for (const texto of [...lineas, JSON.stringify([...repositorio.pasos.get(id)!.values()])]) {
      assertNotMatch(texto, /clave-gemini-123|clave-openalex-456/, 'sin claves');
      assertNotMatch(texto, /https?:\/\//, 'sin direcciones');
      assertNotMatch(
        texto,
        /googleapis|x-goog-api-key|authorization/i,
        'sin proveedores ni cabeceras',
      );
      assertNotMatch(texto, /Artículo|Resumen \d/, 'sin textos de candidatos');
    }
  },
);

Deno.test('log: también hay una línea cuando el paso falla por un error inesperado', async () => {
  const roto: Clasificador = {
    clasificar: () => Promise.reject(new Error('detalle con https://interno.example y clave-x')),
  };
  const deps = crearDependenciasPrueba({ clasificador: () => roto });
  const id = await nuevoCalculo(deps);
  const original = console.error;
  console.error = () => {};
  let lineas: string[];
  try {
    ({ lineas } = await capturarConsola(() => llamar(deps, { id_calculo: id })));
  } finally {
    console.error = original;
  }

  assertEquals(lineas.length, 1);
  const linea = JSON.parse(lineas[0]!) as Record<string, unknown>;
  assertEquals(linea.resultado, 'error');
  assertNotMatch(lineas[0]!, /interno\.example|clave-x|https?:\/\//);
});

Deno.test('log: una invocación sin pasos pendientes no escribe ninguna línea', async () => {
  const deps = crearDependenciasPrueba();
  const id = await nuevoCalculo(deps);
  for (let i = 0; i < 5; i++) await llamar(deps, { id_calculo: id });

  const { lineas } = await capturarConsola(() => llamar(deps, { id_calculo: id }));

  assertEquals(lineas, []);
});
