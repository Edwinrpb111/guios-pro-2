import { assert, assertEquals } from 'jsr:@std/assert@1';
import { atender } from './http.ts';
import { iniciar } from './recalculo_iniciar.ts';
import { calcularProgreso, paso } from './recalculo_paso.ts';
import { ErrorProveedorNoDisponible, ErrorRespuestaInvalida } from './errores.ts';
import { CATALOGO_PRUEBA, clasificadorGuionado, TOKEN_ADMIN, TOKEN_DECISOR } from './pruebas.ts';
import {
  crearDependenciasPrueba,
  CONFIGURACION_PRUEBA,
  proveedorPorConsulta,
} from './pruebas_recalculo.ts';
import type { Dependencias } from './dependencias.ts';
import type { ProveedorBusqueda } from './tipos.ts';

type Deps = ReturnType<typeof crearDependenciasPrueba>;

function llamar(deps: Dependencias, cuerpo: unknown, token: string | null = TOKEN_ADMIN) {
  return atender(
    new Request('http://localhost/functions/v1/recalculo-paso', {
      method: 'POST',
      headers: token === null ? {} : { authorization: `Bearer ${token}` },
      body: JSON.stringify(cuerpo),
    }),
    { origenes: [], crear: () => deps },
    (entrada, admin, dependencias) => paso(entrada, admin, dependencias),
  );
}

async function nuevoCalculo(deps: Deps, fuentes = ['openalex', 'crossref']): Promise<number> {
  const respuesta = await atender(
    new Request('http://localhost/', {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN_ADMIN}` },
      body: JSON.stringify({ anio_inicio: 2020, anio_fin: 2025, fuentes }),
    }),
    { origenes: [], crear: () => deps },
    (entrada, admin, dependencias) => iniciar(entrada, admin, dependencias),
  );
  return (await respuesta.json()).id_calculo;
}

const conProveedores = (proveedores: ProveedorBusqueda[]): Pick<Dependencias, 'proveedores'> => ({
  proveedores: () => proveedores,
});

Deno.test('calcularProgreso: cuenta los factores con todos sus pasos hechos', () => {
  const pasos = (...estados: ('hecho' | 'pendiente' | 'error')[]) =>
    CATALOGO_PRUEBA.map((s, i) => ({
      id_subfactor: s.id_subfactor,
      estado: estados[i] ?? 'pendiente',
    }));
  assertEquals(calcularProgreso(CATALOGO_PRUEBA, pasos()), 0);
  // El factor 1 tiene 2 subfactores: con uno hecho todavía no cuenta.
  assertEquals(calcularProgreso(CATALOGO_PRUEBA, pasos('hecho')), 0);
  assertEquals(calcularProgreso(CATALOGO_PRUEBA, pasos('hecho', 'hecho')), 1);
  assertEquals(calcularProgreso(CATALOGO_PRUEBA, pasos('hecho', 'hecho', 'hecho')), 2);
  assertEquals(
    calcularProgreso(CATALOGO_PRUEBA, pasos('hecho', 'hecho', 'hecho', 'hecho', 'error')),
    2,
  );
  assertEquals(
    calcularProgreso(CATALOGO_PRUEBA, pasos('hecho', 'hecho', 'hecho', 'hecho', 'hecho')),
    3,
  );
});

Deno.test(
  'paso: procesa un subfactor pendiente por invocación y devuelve {progreso, pendientes, estado}',
  async () => {
    const deps = crearDependenciasPrueba();
    const id = await nuevoCalculo(deps);

    const esperado = [
      { progreso: 0, pendientes: 4 }, // 1.1
      { progreso: 1, pendientes: 3 }, // 1.2 completa el factor 1
      { progreso: 2, pendientes: 2 }, // 2.1 completa el factor 2
      { progreso: 2, pendientes: 1 }, // 3.1
      { progreso: 3, pendientes: 0 }, // 3.2 completa el factor 3
    ];
    for (const { progreso, pendientes } of esperado) {
      const respuesta = await llamar(deps, { id_calculo: id });
      assertEquals(respuesta.status, 200);
      assertEquals(await respuesta.json(), { progreso, pendientes, estado: 'en_proceso' });
    }
    assertEquals(deps.repositorio.calculos.get(id)!.progreso, 3);
  },
);

Deno.test(
  'paso: guarda las referencias aceptadas del subfactor y marca el paso como hecho',
  async () => {
    const deps = crearDependenciasPrueba();
    const id = await nuevoCalculo(deps);

    await llamar(deps, { id_calculo: id });

    const guardadas = deps.repositorio.referencias.filter((r) => r.id_calculo === id);
    assertEquals(guardadas.length, 6); // 3 candidatos de cada una de las 2 fuentes
    assert(guardadas.every((r) => r.id_subfactor === 11));
    assertEquals(new Set(guardadas.map((r) => r.base_datos)), new Set(['openalex', 'crossref']));
    assertEquals(deps.repositorio.pasos.get(id)!.get(11), {
      estado: 'hecho',
      candidatos: 6,
      detalle: null,
    });
  },
);

Deno.test(
  'paso: la misma referencia sirve a dos subfactores (c_i cuenta por subfactor, trampa 6)',
  async () => {
    const mismo = (nombre: 'openalex' | 'crossref'): ProveedorBusqueda => ({
      nombre,
      buscar: () =>
        Promise.resolve([
          { titulo: 'T', anio: 2022, doi: '10.1000/igual', resumen: null, base: nombre },
        ]),
    });
    const deps = crearDependenciasPrueba(conProveedores([mismo('openalex')]));
    const id = await nuevoCalculo(deps, ['openalex']);

    await llamar(deps, { id_calculo: id });
    await llamar(deps, { id_calculo: id });

    assertEquals(deps.repositorio.doisDe(id, 11), ['10.1000/igual']);
    assertEquals(deps.repositorio.doisDe(id, 12), ['10.1000/igual']);
  },
);

Deno.test(
  'paso: solo guarda artículos con DOI y descarta un índice inexistente del clasificador',
  async () => {
    const proveedor: ProveedorBusqueda = {
      nombre: 'openalex',
      buscar: () =>
        Promise.resolve([
          { titulo: 'Con DOI', anio: 2022, doi: '10.1000/con', resumen: null, base: 'openalex' },
          { titulo: 'Sin DOI', anio: 2022, doi: null, resumen: null, base: 'openalex' },
          { titulo: 'Otro', anio: 2022, doi: '10.1000/otro', resumen: null, base: 'openalex' },
        ]),
    };
    const clasificador = clasificadorGuionado(() => [
      { indice: 1, trata_subfactor: true, confianza: 0.9, evidencia: 'ok' },
      { indice: 7, trata_subfactor: true, confianza: 0.99, evidencia: 'inventado' },
    ]);
    const deps = crearDependenciasPrueba({
      ...conProveedores([proveedor]),
      clasificador: () => clasificador,
    });
    const id = await nuevoCalculo(deps, ['openalex']);

    await llamar(deps, { id_calculo: id });

    assertEquals(deps.repositorio.doisDe(id, 11), ['10.1000/con']);
    assertEquals(deps.repositorio.pasos.get(id)!.get(11)?.candidatos, 2);
  },
);

Deno.test(
  'paso: usa el umbral y el límite guardados en el cálculo, no los del entorno actual',
  async () => {
    const deps = crearDependenciasPrueba();
    const id = await nuevoCalculo(deps);
    deps.repositorio.calculos.get(id)!.parametros = {
      ...deps.repositorio.calculos.get(id)!.parametros,
      umbral: 0.99,
      max_candidatos: 2,
    };
    const clasificador = clasificadorGuionado();
    const conClasificador = { ...deps, clasificador: () => clasificador };

    await llamar(conClasificador, { id_calculo: id });

    assertEquals(clasificador.lotes.flat().length, 2);
    assertEquals(deps.repositorio.doisDe(id, 11), [], 'confianza 0.95 < umbral 0.99');
  },
);

Deno.test('paso: reanuda desde lo pendiente sin repetir lo hecho y es idempotente', async () => {
  const deps = crearDependenciasPrueba();
  const id = await nuevoCalculo(deps);
  await llamar(deps, { id_calculo: id });
  await llamar(deps, { id_calculo: id });
  const antes = deps.repositorio.referencias.length;

  // «Se cerró la pestaña»: al volver, se sigue desde el tercer paso.
  const respuesta = await llamar(deps, { id_calculo: id });
  assertEquals((await respuesta.json()).pendientes, 2);
  assertEquals(deps.repositorio.pasos.get(id)!.get(21)?.estado, 'hecho');
  assertEquals(deps.repositorio.referencias.length, antes + 6);

  // Si un paso se repite (por ejemplo, tras una caída entre guardar y marcar), no duplica.
  deps.repositorio.pasos.get(id)!.get(11)!.estado = 'pendiente';
  await llamar(deps, { id_calculo: id });
  assertEquals(deps.repositorio.referencias.length, antes + 6);
});

Deno.test('paso: sin pendientes no hace nada y devuelve el estado final', async () => {
  const deps = crearDependenciasPrueba();
  const id = await nuevoCalculo(deps);
  for (let i = 0; i < 5; i++) await llamar(deps, { id_calculo: id });
  const referencias = deps.repositorio.referencias.length;

  const respuesta = await llamar(deps, { id_calculo: id });

  assertEquals(await respuesta.json(), { progreso: 3, pendientes: 0, estado: 'en_proceso' });
  assertEquals(deps.repositorio.referencias.length, referencias);
});

Deno.test('paso: un decisor recibe 403 y no se procesa nada', async () => {
  const deps = crearDependenciasPrueba();
  const id = await nuevoCalculo(deps);

  const respuesta = await llamar(deps, { id_calculo: id }, TOKEN_DECISOR);

  assertEquals(respuesta.status, 403);
  assertEquals((await respuesta.json()).codigo, 'solo_administrador');
  assertEquals(deps.repositorio.referencias.length, 0);
  assert([...deps.repositorio.pasos.get(id)!.values()].every((p) => p.estado === 'pendiente'));
});

Deno.test('paso: valida id_calculo y que el cálculo exista', async () => {
  const deps = crearDependenciasPrueba();
  for (const cuerpo of [null, {}, { id_calculo: '1' }, { id_calculo: 1.5 }, { id_calculo: 0 }]) {
    const respuesta = await llamar(deps, cuerpo);
    assertEquals(respuesta.status, 400, JSON.stringify(cuerpo));
    assertEquals((await respuesta.json()).codigo, 'solicitud_invalida');
  }
  const noExiste = await llamar(deps, { id_calculo: 999 });
  assertEquals(noExiste.status, 404);
  assertEquals((await noExiste.json()).codigo, 'calculo_no_encontrado');
});

Deno.test(
  'paso: un cálculo que ya no está en curso (completado, publicado, descartado, fallido) da 409',
  async () => {
    const deps = crearDependenciasPrueba();
    const id = await nuevoCalculo(deps);
    for (const estado of ['completado', 'publicado', 'descartado', 'fallido'] as const) {
      deps.repositorio.calculos.get(id)!.estado = estado;
      const respuesta = await llamar(deps, { id_calculo: id });
      assertEquals(respuesta.status, 409, estado);
      assertEquals((await respuesta.json()).codigo, 'calculo_cerrado');
    }
    assertEquals(deps.repositorio.referencias.length, 0);
  },
);

Deno.test(
  'paso: un 429 o una caída de la API deja el cálculo pausado con un mensaje legible',
  async () => {
    const caido: ProveedorBusqueda = {
      nombre: 'openalex',
      buscar: () =>
        Promise.reject(new ErrorProveedorNoDisponible('OpenAlex alcanzó su límite de uso.')),
    };
    const deps = crearDependenciasPrueba(conProveedores([caido]));
    const id = await nuevoCalculo(deps, ['openalex']);

    const respuesta = await llamar(deps, { id_calculo: id });

    assertEquals(respuesta.status, 503);
    assertEquals(await respuesta.json(), {
      error: 'OpenAlex alcanzó su límite de uso.',
      codigo: 'proveedor_no_disponible',
      progreso: 0,
      pendientes: 5,
      estado: 'pausado',
    });
    const calculo = deps.repositorio.calculos.get(id)!;
    assertEquals(calculo.estado, 'pausado');
    assertEquals(calculo.mensaje_error, 'OpenAlex alcanzó su límite de uso.');
    assertEquals(deps.repositorio.pasos.get(id)!.get(11)?.estado, 'pendiente');
    assertEquals(deps.repositorio.referencias.length, 0);
  },
);

Deno.test('paso: no reintenta en bucle: una sola llamada a la API por invocación', async () => {
  let llamadas = 0;
  const caido: ProveedorBusqueda = {
    nombre: 'openalex',
    buscar: () => {
      llamadas++;
      return Promise.reject(new ErrorProveedorNoDisponible('caído'));
    },
  };
  const deps = crearDependenciasPrueba(conProveedores([caido]));
  const id = await nuevoCalculo(deps, ['openalex']);
  await llamar(deps, { id_calculo: id });
  assertEquals(llamadas, 1);
});

Deno.test(
  'paso: tras una pausa, la siguiente invocación reanuda el cálculo (pausado → en_proceso)',
  async () => {
    let caido = true;
    const intermitente: ProveedorBusqueda = {
      nombre: 'openalex',
      buscar: (consulta, inicio, fin, limite) =>
        caido
          ? Promise.reject(new ErrorProveedorNoDisponible('sin conexión'))
          : proveedorPorConsulta('openalex').buscar(consulta, inicio, fin, limite),
    };
    const deps = crearDependenciasPrueba(conProveedores([intermitente]));
    const id = await nuevoCalculo(deps, ['openalex']);
    await llamar(deps, { id_calculo: id });
    assertEquals(deps.repositorio.calculos.get(id)!.estado, 'pausado');

    caido = false;
    const respuesta = await llamar(deps, { id_calculo: id });

    assertEquals(respuesta.status, 200);
    assertEquals(await respuesta.json(), { progreso: 0, pendientes: 4, estado: 'en_proceso' });
    const calculo = deps.repositorio.calculos.get(id)!;
    assertEquals([calculo.estado, calculo.mensaje_error], ['en_proceso', null]);
  },
);

Deno.test(
  'paso: una respuesta inválida marca el paso con error, pausa el cálculo y se reintenta al reanudar',
  async () => {
    let rota = true;
    const proveedor: ProveedorBusqueda = {
      nombre: 'openalex',
      buscar: (consulta, inicio, fin, limite) =>
        rota
          ? Promise.reject(
              new ErrorRespuestaInvalida('OpenAlex devolvió una respuesta que no es JSON.'),
            )
          : proveedorPorConsulta('openalex').buscar(consulta, inicio, fin, limite),
    };
    const deps = crearDependenciasPrueba(conProveedores([proveedor]));
    const id = await nuevoCalculo(deps, ['openalex']);

    const respuesta = await llamar(deps, { id_calculo: id });

    assertEquals(respuesta.status, 502);
    const cuerpo = await respuesta.json();
    assertEquals(
      [cuerpo.codigo, cuerpo.estado, cuerpo.pendientes],
      ['respuesta_invalida', 'pausado', 5],
    );
    assertEquals(deps.repositorio.pasos.get(id)!.get(11)?.estado, 'error');
    assertEquals(
      deps.repositorio.pasos.get(id)!.get(11)?.detalle,
      'OpenAlex devolvió una respuesta que no es JSON.',
    );

    rota = false;
    const reanudada = await llamar(deps, { id_calculo: id });
    assertEquals(reanudada.status, 200);
    assertEquals(deps.repositorio.pasos.get(id)!.get(11)?.estado, 'hecho');
  },
);

Deno.test('paso: un fallo del clasificador también pausa sin guardar nada del paso', async () => {
  const clasificador = {
    clasificar: () => Promise.reject(new ErrorProveedorNoDisponible('Gemini alcanzó su cuota.')),
  };
  const deps = crearDependenciasPrueba({ clasificador: () => clasificador });
  const id = await nuevoCalculo(deps);

  const respuesta = await llamar(deps, { id_calculo: id });

  assertEquals(respuesta.status, 503);
  assertEquals(deps.repositorio.calculos.get(id)!.estado, 'pausado');
  assertEquals(deps.repositorio.referencias.length, 0);
});

Deno.test(
  'paso: no mezcla proveedores de IA: si LLM_PROVIDER cambió desde el inicio, da 409',
  async () => {
    const deps = crearDependenciasPrueba();
    const id = await nuevoCalculo(deps);
    const otroEntorno = crearDependenciasPrueba({
      repositorio: deps.repositorio,
      configuracion: { ...CONFIGURACION_PRUEBA, proveedorLlm: 'gemini' },
    });

    const respuesta = await llamar(otroEntorno, { id_calculo: id });

    assertEquals(respuesta.status, 409);
    assertEquals((await respuesta.json()).codigo, 'proveedor_cambiado');
    assertEquals(deps.repositorio.referencias.length, 0);
  },
);
Deno.test(
  'paso: un fallo inesperado es 500 y no pausa el cálculo ni filtra el detalle',
  async () => {
    const deps = crearDependenciasPrueba();
    const id = await nuevoCalculo(deps);
    const conFallo = crearDependenciasPrueba({
      repositorio: deps.repositorio,
      clasificador: () => {
        throw new Error('clave=secreta');
      },
    });

    const respuesta = await llamar(conFallo, { id_calculo: id });

    assertEquals(respuesta.status, 500);
    assert(!JSON.stringify(await respuesta.json()).includes('secreta'));
    assertEquals(deps.repositorio.calculos.get(id)!.estado, 'en_proceso');
  },
);
