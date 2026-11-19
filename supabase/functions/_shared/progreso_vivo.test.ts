// Progreso en vivo (issue #45, S16d, ADR-014): el registro del paso se actualiza al empezar, tras
// la búsqueda, tras cada tanda y antes de guardar, con `etapa` y `lotes_total`. El contrato lo
// lee el panel del administrador (`src/admin/registro.ts`). Todo con relojes y `fetch` falsos.
import { assert, assertEquals, assertNotMatch } from 'jsr:@std/assert@1';
import { GeminiClasificador } from './clasificador.ts';
import type { Dependencias } from './dependencias.ts';
import { ErrorProveedorNoDisponible } from './errores.ts';
import { atender } from './http.ts';
import { iniciar } from './recalculo_iniciar.ts';
import { paso } from './recalculo_paso.ts';
import type { RegistroPaso } from './registro.ts';
import {
  candidato,
  crearFetchGuionado,
  crearRelojFalso,
  proveedorFijo,
  respuestaJson,
  TOKEN_ADMIN,
  verificadorFalso,
} from './pruebas.ts';
import { CONFIGURACION_PRUEBA, crearDependenciasPrueba } from './pruebas_recalculo.ts';
import { RitmoDeLlamadas } from './ritmo.ts';
import type { Candidato, Clasificador, ProveedorBusqueda, Veredicto } from './tipos.ts';

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

async function nuevoCalculo(deps: Dependencias, fuentes = ['openalex']) {
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

async function vaciarTareas() {
  for (let i = 0; i < 60; i++) await Promise.resolve();
}

const ID_SUBFACTOR = 11;
const fila = (deps: Deps, id: number) => deps.repositorio.pasos.get(id)!.get(ID_SUBFACTOR)!;
const registroDe = (deps: Deps, id: number): RegistroPaso => fila(deps, id).registro!;

const todosAceptados = (lote: Candidato[]): Veredicto[] =>
  lote.map((_, i) => ({ indice: i + 1, trata_subfactor: true, confianza: 0.95, evidencia: 'ok' }));

const candidatos = (cantidad: number): ProveedorBusqueda =>
  proveedorFijo(
    'openalex',
    Array.from({ length: cantidad }, (_, i) => candidato(i + 1)),
  );

/** Clasificador cuyas llamadas quedan abiertas hasta que la prueba las resuelve. */
function clasificadorControlado() {
  const llamadas: { lote: Candidato[]; resolver(): void; rechazar(error: Error): void }[] = [];
  const clasificador: Clasificador = {
    clasificar(_f, _s, _c, lote, medicion) {
      return new Promise<Veredicto[]>((resolver, rechazar) => {
        llamadas.push({
          lote,
          resolver: () => {
            if (medicion !== undefined) {
              medicion.tokensEntrada = 100 + lote.length;
              medicion.tokensSalida = 20;
              medicion.tokensRazonamiento = null;
            }
            resolver(todosAceptados(lote));
          },
          rechazar,
        });
      });
    },
  };
  return { clasificador, llamadas };
}

// Etapa y total de tandas ------------------------------------------------------------------------

Deno.test(
  'vivo: al empezar el registro dice que está buscando y aún no sabe cuántas tandas',
  async () => {
    const buscando: ProveedorBusqueda = {
      nombre: 'openalex',
      buscar: () => new Promise<Candidato[]>(() => {}),
    };
    const deps = crearDependenciasPrueba({ proveedores: () => [buscando] });
    const id = await nuevoCalculo(deps);

    void llamar(deps, { id_calculo: id });
    await vaciarTareas();

    const registro = registroDe(deps, id);
    assertEquals(registro.etapa, 'buscando');
    assertEquals(registro.lotes_total, null);
    assertEquals(registro.lotes, []);
    assertEquals(fila(deps, id).duracion_ms, null);
  },
);

Deno.test(
  'vivo: tras la búsqueda se guarda la etapa «clasificando» y el total de tandas',
  async () => {
    const { clasificador, llamadas } = clasificadorControlado();
    const deps = crearDependenciasPrueba({
      configuracion: { ...CONFIGURACION_PRUEBA, llamadasSimultaneas: 2 },
      proveedores: () => [candidatos(25)],
      clasificador: () => clasificador,
    });
    const id = await nuevoCalculo(deps);

    void llamar(deps, { id_calculo: id });
    await vaciarTareas();

    assertEquals(llamadas.length, 2);
    const registro = registroDe(deps, id);
    assertEquals(registro.etapa, 'clasificando');
    assertEquals(registro.lotes_total, 3);
    assertEquals(registro.lotes, [], 'ninguna tanda ha terminado todavía');
    assertEquals(registro.busqueda.length, 1);
    assertEquals(registro.busqueda[0]!.candidatos, 25);
  },
);

Deno.test(
  'vivo: tras cada tanda el registro suma esa tanda, en el orden en que terminan',
  async () => {
    const { clasificador, llamadas } = clasificadorControlado();
    const deps = crearDependenciasPrueba({
      configuracion: { ...CONFIGURACION_PRUEBA, llamadasSimultaneas: 3 },
      proveedores: () => [candidatos(25)],
      clasificador: () => clasificador,
    });
    const id = await nuevoCalculo(deps);
    void llamar(deps, { id_calculo: id });
    await vaciarTareas();

    llamadas[2]!.resolver(); // termina la tanda 3 (5 candidatos)
    await vaciarTareas();
    let registro = registroDe(deps, id);
    assertEquals(
      registro.lotes.map((l) => [l.n, l.tamano, l.resultado, l.aceptados]),
      [[3, 5, 'ok', 5]],
    );
    assertEquals(registro.etapa, 'clasificando');
    assertEquals(registro.lotes_total, 3);

    llamadas[0]!.resolver();
    await vaciarTareas();
    registro = registroDe(deps, id);
    assertEquals(
      registro.lotes.map((l) => l.n),
      [3, 1],
    );
    assertEquals(fila(deps, id).duracion_ms, null, 'el paso sigue en curso');
    assertEquals(fila(deps, id).estado, 'pendiente');
  },
);

Deno.test('vivo: cada tanda lleva ints o null de tokens y sus reintentos', async () => {
  const { clasificador, llamadas } = clasificadorControlado();
  const deps = crearDependenciasPrueba({
    proveedores: () => [candidatos(12)],
    clasificador: () => clasificador,
  });
  const id = await nuevoCalculo(deps);
  void llamar(deps, { id_calculo: id });
  await vaciarTareas();
  llamadas[0]!.resolver();
  await vaciarTareas();

  const lote = registroDe(deps, id).lotes[0]!;
  assertEquals(Object.keys(lote).sort(), [
    'aceptados',
    'ms',
    'n',
    'reintentos',
    'resultado',
    'tamano',
    'tokens_entrada',
    'tokens_razonamiento',
    'tokens_salida',
  ]);
  assertEquals(lote.tokens_entrada, 110);
  assertEquals(lote.tokens_salida, 20);
  assertEquals(lote.tokens_razonamiento, null);
  assertEquals(lote.reintentos, 0);
});

Deno.test('vivo: un clasificador que no informa tokens deja los tres en null', async () => {
  const deps = crearDependenciasPrueba({ proveedores: () => [candidatos(3)] });
  const id = await nuevoCalculo(deps);
  await llamar(deps, { id_calculo: id });
  const lote = registroDe(deps, id).lotes[0]!;
  assertEquals(
    [lote.tokens_entrada, lote.tokens_salida, lote.tokens_razonamiento],
    [null, null, null],
  );
});

Deno.test(
  'vivo: con Gemini real los tokens salen de usageMetadata y los reintentos de la tanda',
  async () => {
    const reloj = crearRelojFalso();
    const limite = respuestaJson({ error: { code: 429 } }, 429);
    const ok = respuestaJson({
      candidates: [{ content: { parts: [{ text: '[]' }] } }],
      usageMetadata: { promptTokenCount: 500, candidatesTokenCount: 40, thoughtsTokenCount: 0 },
    });
    const { fetch } = crearFetchGuionado([limite, ok]);
    const clasificador = new GeminiClasificador({
      apiKey: 'c',
      modelo: 'm',
      fetch,
      ritmo: new RitmoDeLlamadas({ ahora: reloj.ahora, esperar: (ms) => reloj.esperar(ms) }, 600),
    });
    const deps = crearDependenciasPrueba({
      proveedores: () => [candidatos(2)],
      clasificador: () => clasificador,
    });
    const id = await nuevoCalculo(deps);

    await llamar(deps, { id_calculo: id });

    const lote = registroDe(deps, id).lotes[0]!;
    assertEquals(lote.reintentos, 1);
    assertEquals([lote.tokens_entrada, lote.tokens_salida, lote.tokens_razonamiento], [500, 40, 0]);
  },
);

Deno.test(
  'vivo: antes de guardar el paso la etapa es «guardando» y al terminar queda en null',
  async () => {
    const deps = crearDependenciasPrueba({ proveedores: () => [candidatos(15)] });
    const id = await nuevoCalculo(deps);
    let antesDeGuardar: RegistroPaso | undefined;
    const completar = deps.repositorio.completarPaso.bind(deps.repositorio);
    deps.repositorio.completarPaso = (...argumentos) => {
      antesDeGuardar = structuredClone(registroDe(deps, id));
      return completar(...argumentos);
    };

    await llamar(deps, { id_calculo: id });

    assertEquals(antesDeGuardar?.etapa, 'guardando');
    assertEquals(antesDeGuardar?.lotes_total, 2);
    assertEquals(antesDeGuardar?.lotes.length, 2);
    const final = registroDe(deps, id);
    assertEquals(final.etapa, null);
    assertEquals(final.lotes_total, 2);
    assertEquals(final.resultado, 'hecho');
    assertEquals(final.aceptados, 15);
    assertEquals(fila(deps, id).estado, 'hecho');
  },
);

Deno.test('vivo: sin candidatos el total de tandas es 0 y el paso termina igual', async () => {
  const deps = crearDependenciasPrueba({ proveedores: () => [candidatos(0)] });
  const id = await nuevoCalculo(deps);
  await llamar(deps, { id_calculo: id });
  const final = registroDe(deps, id);
  assertEquals(
    [final.etapa, final.lotes_total, final.lotes, final.resultado],
    [null, 0, [], 'hecho'],
  );
});

Deno.test(
  'vivo: si el paso se pausa o falla, la etapa queda en null y se conserva el total',
  async () => {
    const fallido: Clasificador = {
      clasificar: () =>
        Promise.reject(new ErrorProveedorNoDisponible('Sin cuota.', 'reintento_agotado')),
    };
    const deps = crearDependenciasPrueba({
      proveedores: () => [candidatos(30)],
      clasificador: () => fallido,
    });
    const id = await nuevoCalculo(deps);

    await llamar(deps, { id_calculo: id });

    const registro = registroDe(deps, id);
    assertEquals(registro.etapa, null);
    assertEquals(registro.lotes_total, 3);
    assertEquals(registro.resultado, 'pausado');
    assertEquals(registro.mensaje, 'Sin cuota.');
  },
);

Deno.test('vivo: si la búsqueda falla no hay total de tandas', async () => {
  const caido: ProveedorBusqueda = {
    nombre: 'openalex',
    buscar: () => Promise.reject(new ErrorProveedorNoDisponible('Límite de OpenAlex.')),
  };
  const deps = crearDependenciasPrueba({ proveedores: () => [caido] });
  const id = await nuevoCalculo(deps);
  await llamar(deps, { id_calculo: id });
  const registro = registroDe(deps, id);
  assertEquals([registro.etapa, registro.lotes_total], [null, null]);
});

// Escrituras en orden y sin tumbar el paso -------------------------------------------------------

Deno.test(
  'vivo: las escrituras del registro llegan en orden aunque una tarde más que las otras',
  async () => {
    const deps = crearDependenciasPrueba({
      configuracion: { ...CONFIGURACION_PRUEBA, llamadasSimultaneas: 5 },
      proveedores: () => [candidatos(40)],
    });
    const id = await nuevoCalculo(deps);
    const guardar = deps.repositorio.guardarRegistroPaso.bind(deps.repositorio);
    let n = 0;
    const aterrizajes: number[] = [];
    deps.repositorio.guardarRegistroPaso = async (...argumentos) => {
      // Las primeras escrituras tardan más que las siguientes.
      const espera = Math.max(0, 6 - n++);
      for (let i = 0; i < espera * 10; i++) await Promise.resolve();
      aterrizajes.push(argumentos[2].registro.lotes.length);
      return guardar(...argumentos);
    };

    await llamar(deps, { id_calculo: id });
    await vaciarTareas();

    const final = registroDe(deps, id);
    assertEquals(final.resultado, 'hecho');
    assertEquals(final.etapa, null);
    assertEquals(final.lotes.length, 4);
    assertEquals(aterrizajes, [...aterrizajes].sort(), 'ninguna escritura vieja pisa a una nueva');
    assert(
      aterrizajes.length >= 6,
      'hubo escrituras al empezar, tras la búsqueda y tras cada tanda',
    );
  },
);

Deno.test('vivo: si falla escribir el progreso, el paso termina igual', async () => {
  const deps = crearDependenciasPrueba({ proveedores: () => [candidatos(25)] });
  const id = await nuevoCalculo(deps);
  const guardar = deps.repositorio.guardarRegistroPaso.bind(deps.repositorio);
  let llamadas = 0;
  deps.repositorio.guardarRegistroPaso = (...argumentos) => {
    // La primera escritura (al empezar) sale bien; las del progreso fallan.
    if (llamadas++ > 0 && argumentos[2].registro.etapa !== null) {
      return Promise.reject(new Error('base caída https://interno.example clave-x'));
    }
    return guardar(...argumentos);
  };
  const original = console.error;
  const errores: string[] = [];
  console.error = (...a: unknown[]) => void errores.push(a.map(String).join(' '));
  let respuesta: Response;
  try {
    respuesta = await llamar(deps, { id_calculo: id });
  } finally {
    console.error = original;
  }

  assertEquals(respuesta.status, 200);
  assertEquals(fila(deps, id).estado, 'hecho');
  assertEquals(registroDe(deps, id).resultado, 'hecho');
  assert(errores.length > 0, 'la falla queda en el log del servidor');
});

Deno.test('vivo: el registro en curso no copia claves, direcciones ni textos', async () => {
  const { clasificador, llamadas } = clasificadorControlado();
  const deps = crearDependenciasPrueba({
    proveedores: () => [candidatos(15)],
    clasificador: () => clasificador,
  });
  const id = await nuevoCalculo(deps);
  void llamar(deps, { id_calculo: id });
  await vaciarTareas();
  llamadas[0]!.resolver();
  await vaciarTareas();
  const texto = JSON.stringify(registroDe(deps, id));
  assertNotMatch(texto, /https?:\/\/|Artículo|Resumen \d|10\.1000/);
});
