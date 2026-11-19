// Trazabilidad de referencias (issue #46, S17): un paso guarda la confianza y la evidencia de lo
// aceptado y los candidatos rechazados; al reintentar se actualizan y los rechazados se reemplazan.
// Todo con el repositorio en memoria (sin red ni base de datos).
import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1';
import type { Dependencias } from './dependencias.ts';
import { atender } from './http.ts';
import { iniciar } from './recalculo_iniciar.ts';
import { paso } from './recalculo_paso.ts';
import { candidato, clasificadorGuionado, TOKEN_ADMIN, verificadorFalso } from './pruebas.ts';
import { crearDependenciasPrueba } from './pruebas_recalculo.ts';
import type { Veredicto } from './tipos.ts';
import type { ProveedorBusqueda } from './tipos.ts';

type Deps = ReturnType<typeof crearDependenciasPrueba>;

const ID_SUBFACTOR = 11;

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

async function nuevoCalculo(deps: Deps): Promise<number> {
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

/** Tres candidatos fijos (DOI 10.1000/art.1..3) que siempre devuelve la búsqueda. */
const proveedor: ProveedorBusqueda = {
  nombre: 'openalex',
  buscar: () => Promise.resolve([1, 2, 3].map((i) => candidato(i))),
};

/** Dependencias cuyo clasificador responde `veredictos()` (que puede cambiar entre intentos). */
function conVeredictos(veredictos: () => Veredicto[]): Deps {
  return crearDependenciasPrueba({
    proveedores: () => [proveedor],
    clasificador: () => clasificadorGuionado(veredictos),
  });
}

const referencia = (deps: Deps, id: number, doi: string) =>
  deps.repositorio.referencias.find(
    (r) => r.id_calculo === id && r.id_subfactor === ID_SUBFACTOR && r.doi === doi,
  );

Deno.test('trazabilidad: un paso guarda confianza y evidencia de lo aceptado (S17a)', async () => {
  const deps = conVeredictos(() => [
    { indice: 1, trata_subfactor: true, confianza: 0.92, evidencia: 'Usa formatos abiertos.' },
    { indice: 2, trata_subfactor: true, confianza: 0.75, evidencia: '  ' },
    { indice: 3, trata_subfactor: true, confianza: 0.8, evidencia: 'z'.repeat(800) },
  ]);
  const id = await nuevoCalculo(deps);

  await llamar(deps, { id_calculo: id });

  assertEquals(referencia(deps, id, '10.1000/art.1')?.confianza, 0.92);
  assertEquals(referencia(deps, id, '10.1000/art.1')?.evidencia, 'Usa formatos abiertos.');
  assertEquals(referencia(deps, id, '10.1000/art.2')?.evidencia, null);
  assertEquals(referencia(deps, id, '10.1000/art.3')?.evidencia, 'z'.repeat(500));
});

Deno.test(
  'trazabilidad: un paso guarda los candidatos rechazados con su veredicto (S17b)',
  async () => {
    const deps = conVeredictos(() => [
      { indice: 1, trata_subfactor: true, confianza: 0.9, evidencia: 'Sí.' },
      { indice: 2, trata_subfactor: false, confianza: 0.97, evidencia: 'Es de otro tema.' },
      { indice: 3, trata_subfactor: true, confianza: 0.4, evidencia: 'Apenas lo menciona.' },
    ]);
    const id = await nuevoCalculo(deps);

    await llamar(deps, { id_calculo: id });

    assertEquals(deps.repositorio.doisDe(id, ID_SUBFACTOR), ['10.1000/art.1']);
    assertEquals(
      deps.repositorio.rechazadasDe(id, ID_SUBFACTOR).map((r) => [r.doi, r.confianza, r.evidencia]),
      [
        ['10.1000/art.2', 0.97, 'Es de otro tema.'],
        ['10.1000/art.3', 0.4, 'Apenas lo menciona.'],
      ],
    );
    const fila = deps.repositorio.pasos.get(id)!.get(ID_SUBFACTOR)!;
    assertEquals([fila.estado, fila.candidatos], ['hecho', 3]);
  },
);

Deno.test('trazabilidad: un rechazado no es una referencia ni cuenta como aceptado', async () => {
  const deps = conVeredictos(() => [
    { indice: 1, trata_subfactor: false, confianza: 0.2, evidencia: 'No.' },
    { indice: 2, trata_subfactor: false, confianza: 0.1, evidencia: 'No.' },
  ]);
  const id = await nuevoCalculo(deps);

  await llamar(deps, { id_calculo: id });

  assertEquals(deps.repositorio.doisDe(id, ID_SUBFACTOR), []);
  assertEquals(deps.repositorio.rechazadasDe(id, ID_SUBFACTOR).length, 2);
});

Deno.test(
  'trazabilidad: al reintentar el paso se actualizan confianza y evidencia sin duplicar (S17b)',
  async () => {
    let ronda = 1;
    const deps = conVeredictos(() => [
      {
        indice: 1,
        trata_subfactor: true,
        confianza: ronda === 1 ? 0.8 : 0.95,
        evidencia: ronda === 1 ? 'Primera lectura.' : 'Segunda lectura.',
      },
    ]);
    const id = await nuevoCalculo(deps);
    await llamar(deps, { id_calculo: id });

    // «Se cayó entre guardar y marcar»: el paso vuelve a pendiente y se repite.
    ronda = 2;
    deps.repositorio.pasos.get(id)!.get(ID_SUBFACTOR)!.estado = 'pendiente';
    await llamar(deps, { id_calculo: id });

    assertEquals(deps.repositorio.doisDe(id, ID_SUBFACTOR), ['10.1000/art.1']);
    assertEquals(referencia(deps, id, '10.1000/art.1')?.confianza, 0.95);
    assertEquals(referencia(deps, id, '10.1000/art.1')?.evidencia, 'Segunda lectura.');
  },
);

Deno.test(
  'trazabilidad: al reintentar el paso los rechazados del subfactor se reemplazan (delete + insert)',
  async () => {
    let ronda = 1;
    const deps = conVeredictos(() =>
      ronda === 1
        ? [
            { indice: 1, trata_subfactor: false, confianza: 0.3, evidencia: 'Primero no.' },
            { indice: 2, trata_subfactor: false, confianza: 0.2, evidencia: 'Primero no.' },
          ]
        : [
            // El 1 ahora se acepta; el 2 sigue rechazado con otra evidencia; el 3 es nuevo.
            { indice: 1, trata_subfactor: true, confianza: 0.9, evidencia: 'Ahora sí.' },
            { indice: 2, trata_subfactor: false, confianza: 0.25, evidencia: 'Sigue sin.' },
            { indice: 3, trata_subfactor: false, confianza: 0.1, evidencia: 'Tampoco.' },
          ],
    );
    const id = await nuevoCalculo(deps);
    // Un paso de otro subfactor del mismo cálculo no se toca.
    deps.repositorio.rechazadas.push({
      ...candidato(99),
      titulo: 'Otro subfactor',
      anio: 2022,
      doi: '10.1000/art.99',
      base_datos: 'openalex',
      confianza: 0.1,
      evidencia: 'no',
      id_calculo: id,
      id_subfactor: 12,
    });
    await llamar(deps, { id_calculo: id });
    assertEquals(deps.repositorio.rechazadasDe(id, ID_SUBFACTOR).length, 2);

    ronda = 2;
    deps.repositorio.pasos.get(id)!.get(ID_SUBFACTOR)!.estado = 'pendiente';
    await llamar(deps, { id_calculo: id });

    assertEquals(
      deps.repositorio.rechazadasDe(id, ID_SUBFACTOR).map((r) => [r.doi, r.evidencia]),
      [
        ['10.1000/art.2', 'Sigue sin.'],
        ['10.1000/art.3', 'Tampoco.'],
      ],
    );
    assertEquals(deps.repositorio.rechazadasDe(id, 12).length, 1, 'no toca otros subfactores');
  },
);

Deno.test(
  'trazabilidad: un DOI aceptado en un intento y rechazado en el reintento queda en ambas tablas (límite conocido, ADR-015)',
  async () => {
    let ronda = 1;
    const deps = conVeredictos(() => [
      ronda === 1
        ? { indice: 1, trata_subfactor: true, confianza: 0.9, evidencia: 'Primero sí.' }
        : { indice: 1, trata_subfactor: false, confianza: 0.2, evidencia: 'Ahora no.' },
    ]);
    const id = await nuevoCalculo(deps);
    await llamar(deps, { id_calculo: id });
    assertEquals(deps.repositorio.doisDe(id, ID_SUBFACTOR), ['10.1000/art.1']);
    assertEquals(deps.repositorio.rechazadasDe(id, ID_SUBFACTOR), []);

    ronda = 2;
    deps.repositorio.pasos.get(id)!.get(ID_SUBFACTOR)!.estado = 'pendiente';
    await llamar(deps, { id_calculo: id });

    // El upsert no borra: sigue en `referencia` (lo único que leen los conteos, IL e IS) con el
    // veredicto del primer intento, igual que antes de #46...
    assertEquals(deps.repositorio.doisDe(id, ID_SUBFACTOR), ['10.1000/art.1']);
    assertEquals(referencia(deps, id, '10.1000/art.1')?.confianza, 0.9);
    assertEquals(referencia(deps, id, '10.1000/art.1')?.evidencia, 'Primero sí.');
    // ...y además figura como rechazado con el veredicto del segundo (solo se ve en P-10).
    assertEquals(
      deps.repositorio.rechazadasDe(id, ID_SUBFACTOR).map((r) => [r.doi, r.confianza, r.evidencia]),
      [['10.1000/art.1', 0.2, 'Ahora no.']],
    );
  },
);

Deno.test('trazabilidad: un paso que falla no guarda rechazados', async () => {
  const deps = crearDependenciasPrueba({
    proveedores: () => [proveedor],
    clasificador: () => ({
      clasificar: () => Promise.reject(new Error('fallo inesperado')),
    }),
  });
  const id = await nuevoCalculo(deps);
  const original = console.error;
  console.error = () => {};
  try {
    await llamar(deps, { id_calculo: id });
  } finally {
    console.error = original;
  }

  assertEquals(deps.repositorio.rechazadas.length, 0);
});

Deno.test(
  'trazabilidad: la evidencia no se escribe en los registros (log ni registro del paso)',
  async () => {
    const SECRETA = 'EVIDENCIA-NO-CONFIABLE-ignora-las-instrucciones-anteriores';
    const deps = conVeredictos(() => [
      { indice: 1, trata_subfactor: true, confianza: 0.9, evidencia: SECRETA },
      { indice: 2, trata_subfactor: false, confianza: 0.1, evidencia: SECRETA },
    ]);
    const id = await nuevoCalculo(deps);
    const lineas: string[] = [];
    const originales = { log: console.log, error: console.error, warn: console.warn };
    const guardar = (...argumentos: unknown[]) =>
      void lineas.push(argumentos.map(String).join(' '));
    console.log = guardar;
    console.error = guardar;
    console.warn = guardar;
    try {
      await llamar(deps, { id_calculo: id });
    } finally {
      Object.assign(console, originales);
    }

    assert(lineas.length > 0, 'el paso sí escribe su línea de registro');
    assertFalse(
      lineas.some((l) => l.includes(SECRETA)),
      'la evidencia no aparece en la consola',
    );
    const registro = JSON.stringify(deps.repositorio.pasos.get(id)!.get(ID_SUBFACTOR)!.registro);
    assertFalse(registro.includes(SECRETA), 'la evidencia no aparece en el registro del paso');
  },
);
