// Pruebas de la barrera de administrador real y del guardado idempotente, con un cliente de
// Supabase simulado (sin red ni base de datos).
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0';
import { exigirAdmin } from './auth.ts';
import { ErrorApi } from './errores.ts';
import {
  leerConfiguracionGuardada,
  RepositorioSupabase,
  VerificadorSupabase,
} from './supabase_real.ts';

interface Llamada {
  tabla: string;
  operacion: string;
  argumentos: unknown[];
  filtros: [string, unknown][];
}

interface Guion {
  /** Resultado de `auth.getUser`. */
  usuario?: { data: { user: { id: string } | null }; error: { message: string } | null };
  /** Resultado de la consulta a `perfil`. */
  perfil?: { data: { rol: string } | null; error: { message: string } | null };
  /** Resultado de `rpc(...)`. */
  rpc?: { data: unknown; error: { message: string } | null };
  /** Resultado de las consultas a `recalculo_paso`. */
  paso?: { data: unknown; error: { message: string } | null };
  /** Resultado de las consultas a `referencia_rechazada`. */
  rechazadas?: { data: unknown; error: { message: string } | null };
}

/** Cliente simulado: registra cada operación encadenada y responde según el guion. */
function crearClienteSimulado(guion: Guion = {}) {
  const llamadas: Llamada[] = [];
  const tokensConsultados: string[] = [];

  const desde = (tabla: string) => {
    const nueva = (operacion: string, argumentos: unknown[]) => {
      const llamada: Llamada = { tabla, operacion, argumentos, filtros: [] };
      llamadas.push(llamada);
      const resultado = () => {
        if (tabla === 'perfil') return guion.perfil ?? { data: null, error: null };
        if (tabla === 'recalculo_paso') return guion.paso ?? { data: null, error: null };
        if (tabla === 'referencia_rechazada') {
          return guion.rechazadas ?? { data: null, error: null };
        }
        return { data: null, error: null };
      };
      const cadena = {
        eq(columna: string, valor: unknown) {
          llamada.filtros.push([columna, valor]);
          return cadena;
        },
        maybeSingle: () => Promise.resolve(resultado()),
        // Permite `await` directo de la cadena (update/upsert/insert sin `.select()`).
        then: (resolver: (valor: unknown) => unknown, rechazar?: (motivo: unknown) => unknown) =>
          Promise.resolve(resultado()).then(resolver, rechazar),
      };
      return cadena;
    };
    return {
      select: (...argumentos: unknown[]) => nueva('select', argumentos),
      insert: (...argumentos: unknown[]) => nueva('insert', argumentos),
      update: (...argumentos: unknown[]) => nueva('update', argumentos),
      delete: (...argumentos: unknown[]) => nueva('delete', argumentos),
      upsert: (...argumentos: unknown[]) => nueva('upsert', argumentos),
    };
  };

  const rpcs: { funcion: string; argumentos: unknown }[] = [];

  const cliente = {
    rpc: (funcion: string, argumentos: unknown) => {
      rpcs.push({ funcion, argumentos });
      return Promise.resolve(guion.rpc ?? { data: null, error: null });
    },
    auth: {
      getUser: (jwt: string) => {
        tokensConsultados.push(jwt);
        return Promise.resolve(
          guion.usuario ?? { data: { user: null }, error: { message: 'JWT inválido' } },
        );
      },
    },
    from: desde,
  } as unknown as SupabaseClient;

  return { cliente, llamadas, tokensConsultados, rpcs };
}

function solicitudCon(token: string): Request {
  return new Request('http://localhost/functions/v1/prueba', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  });
}

const USUARIO_VALIDO = { data: { user: { id: 'u-1' } }, error: null };

Deno.test(
  'VerificadorSupabase: un token que Supabase Auth rechaza devuelve null (401)',
  async () => {
    const { cliente, tokensConsultados, llamadas } = crearClienteSimulado({
      usuario: { data: { user: null }, error: { message: 'invalid JWT' } },
    });
    const verificador = new VerificadorSupabase(cliente);

    assertEquals(await verificador.verificar('token-malo'), null);
    assertEquals(tokensConsultados, ['token-malo']);
    assertEquals(llamadas.length, 0, 'sin usuario válido no se consulta el perfil');

    const error = await assertRejects(
      () => exigirAdmin(solicitudCon('token-malo'), verificador),
      ErrorApi,
    );
    assertEquals([error.estado, error.codigo], [401, 'sesion_invalida']);
  },
);

Deno.test(
  'VerificadorSupabase: un perfil con rol decisor es 403 (no es administrador)',
  async () => {
    const { cliente, llamadas } = crearClienteSimulado({
      usuario: USUARIO_VALIDO,
      perfil: { data: { rol: 'decisor' }, error: null },
    });
    const verificador = new VerificadorSupabase(cliente);

    assertEquals(await verificador.verificar('jwt'), { idUsuario: 'u-1', esAdmin: false });
    assertEquals(llamadas[0]?.tabla, 'perfil');
    assertEquals(llamadas[0]?.filtros, [['id', 'u-1']]);

    const error = await assertRejects(
      () => exigirAdmin(solicitudCon('jwt'), verificador),
      ErrorApi,
    );
    assertEquals([error.estado, error.codigo], [403, 'solo_administrador']);
  },
);

Deno.test('VerificadorSupabase: un perfil administrador pasa la barrera', async () => {
  const { cliente } = crearClienteSimulado({
    usuario: USUARIO_VALIDO,
    perfil: { data: { rol: 'administrador' }, error: null },
  });
  const verificador = new VerificadorSupabase(cliente);

  assertEquals(await verificador.verificar('jwt'), { idUsuario: 'u-1', esAdmin: true });
  assertEquals(await exigirAdmin(solicitudCon('jwt'), verificador), {
    idUsuario: 'u-1',
    esAdmin: true,
  });
});

Deno.test('VerificadorSupabase: un usuario sin perfil es 403, nunca administrador', async () => {
  const { cliente } = crearClienteSimulado({
    usuario: USUARIO_VALIDO,
    perfil: { data: null, error: null },
  });
  const verificador = new VerificadorSupabase(cliente);

  assertEquals(await verificador.verificar('jwt'), { idUsuario: 'u-1', esAdmin: false });
  const error = await assertRejects(() => exigirAdmin(solicitudCon('jwt'), verificador), ErrorApi);
  assertEquals([error.estado, error.codigo], [403, 'solo_administrador']);
});

Deno.test('VerificadorSupabase: si falla la lectura del perfil no concede acceso', async () => {
  const { cliente } = crearClienteSimulado({
    usuario: USUARIO_VALIDO,
    perfil: { data: null, error: { message: 'conexión caída' } },
  });
  const verificador = new VerificadorSupabase(cliente);

  const error = await assertRejects(() => verificador.verificar('jwt'), Error);
  assert(!(error instanceof ErrorApi), 'es un error interno (500), no una respuesta de acceso');
});

const REFERENCIAS = [
  {
    titulo: 'Uno',
    anio: 2022,
    doi: '10.1/uno',
    base_datos: 'openalex',
    confianza: 0.9,
    evidencia: 'Trata el subfactor.',
  },
  {
    titulo: 'Dos',
    anio: 2023,
    doi: '10.1/dos',
    base_datos: 'crossref',
    confianza: null,
    evidencia: null,
  },
];
const RECHAZADAS = [
  {
    titulo: 'Tres',
    anio: 2021,
    doi: '10.1/tres',
    base_datos: 'openalex',
    confianza: 0.3,
    evidencia: 'Otro tema.',
  },
];

Deno.test(
  'RepositorioSupabase.completarPaso: upsert idempotente por (cálculo, subfactor, doi) que actualiza confianza y evidencia',
  async () => {
    const { cliente, llamadas } = crearClienteSimulado();
    const repositorio = new RepositorioSupabase(cliente);
    const referencias = REFERENCIAS;

    await repositorio.completarPaso(7, 11, referencias, [], 5);

    const upsert = llamadas.find((l) => l.operacion === 'upsert');
    assertEquals(upsert?.tabla, 'referencia');
    assertEquals(upsert?.argumentos[0], [
      { ...referencias[0], id_calculo: 7, id_subfactor: 11 },
      { ...referencias[1], id_calculo: 7, id_subfactor: 11 },
    ]);
    // Al repetir el paso, la referencia ya guardada actualiza su confianza y evidencia.
    assertEquals(upsert?.argumentos[1], {
      onConflict: 'id_calculo,id_subfactor,doi',
      ignoreDuplicates: false,
    });

    const marca = llamadas.find((l) => l.tabla === 'recalculo_paso' && l.operacion === 'update');
    assertEquals(marca?.argumentos[0], {
      estado: 'hecho',
      candidatos: 5,
      aceptados: 2,
      detalle: null,
    });
    assertEquals(marca?.filtros, [
      ['id_calculo', 7],
      ['id_subfactor', 11],
    ]);
  },
);

Deno.test(
  'RepositorioSupabase.completarPaso: reemplaza los rechazados del subfactor (borra y luego inserta)',
  async () => {
    const { cliente, llamadas } = crearClienteSimulado();

    await new RepositorioSupabase(cliente).completarPaso(7, 11, REFERENCIAS, RECHAZADAS, 5);

    const operaciones = llamadas
      .filter((l) => l.tabla === 'referencia_rechazada')
      .map((l) => l.operacion);
    assertEquals(operaciones, ['delete', 'insert']);
    const borrado = llamadas.find((l) => l.operacion === 'delete');
    assertEquals(borrado?.filtros, [
      ['id_calculo', 7],
      ['id_subfactor', 11],
    ]);
    const insercion = llamadas.find((l) => l.operacion === 'insert');
    assertEquals(insercion?.argumentos[0], [{ ...RECHAZADAS[0], id_calculo: 7, id_subfactor: 11 }]);
    // Los rechazados se reemplazan antes de marcar el paso como hecho.
    const posicion = (l: Llamada | undefined) => llamadas.indexOf(l!);
    const marca = llamadas.find((l) => l.tabla === 'recalculo_paso' && l.operacion === 'update');
    assert(posicion(insercion) < posicion(marca));
  },
);

Deno.test(
  'RepositorioSupabase.completarPaso: sin rechazados borra los del intento anterior y no inserta',
  async () => {
    const { cliente, llamadas } = crearClienteSimulado();

    await new RepositorioSupabase(cliente).completarPaso(7, 11, REFERENCIAS, [], 5);

    const rechazadas = llamadas.filter((l) => l.tabla === 'referencia_rechazada');
    assertEquals(
      rechazadas.map((l) => l.operacion),
      ['delete'],
    );
  },
);

Deno.test(
  'RepositorioSupabase.completarPaso: si falla la base al guardar los rechazados el error sube',
  async () => {
    const { cliente } = crearClienteSimulado({
      rechazadas: { data: null, error: { message: 'violación de restricción' } },
    });

    await assertRejects(
      () => new RepositorioSupabase(cliente).completarPaso(7, 11, [], RECHAZADAS, 5),
      Error,
      'candidatos rechazados',
    );
  },
);

Deno.test(
  'RepositorioSupabase.crearCalculoConPasos: una sola RPC crea el cálculo y sus pasos',
  async () => {
    const { cliente, llamadas, rpcs } = crearClienteSimulado({ rpc: { data: 42, error: null } });
    const parametros = {
      anio_inicio: 2020,
      anio_fin: 2025,
      fuentes: ['openalex'],
      umbral: 0.7,
      modelo: 'fake',
      proveedor_llm: 'fake',
      version_prompt: 'v1',
      max_candidatos: 50,
    };

    const id = await new RepositorioSupabase(cliente).crearCalculoConPasos({
      anio_inicio: 2020,
      anio_fin: 2025,
      bases_datos: 'OpenAlex',
      parametros,
      creado_por: 'u-1',
    });

    assertEquals(id, 42);
    assertEquals(rpcs, [
      {
        funcion: 'crear_calculo_con_pasos',
        argumentos: {
          p_anio_inicio: 2020,
          p_anio_fin: 2025,
          p_bases_datos: 'OpenAlex',
          p_parametros: parametros,
          p_creado_por: 'u-1',
        },
      },
    ]);
    assertEquals(llamadas.length, 0, 'no inserta filas por separado (sería no atómico)');
  },
);

Deno.test('RepositorioSupabase.crearCalculoConPasos: un error de la RPC se propaga', async () => {
  const { cliente } = crearClienteSimulado({
    rpc: { data: null, error: { message: 'catálogo vacío' } },
  });
  await assertRejects(
    () =>
      new RepositorioSupabase(cliente).crearCalculoConPasos({
        anio_inicio: 2020,
        anio_fin: 2025,
        bases_datos: 'OpenAlex',
        parametros: {} as never,
        creado_por: 'u-1',
      }),
    Error,
    'catálogo vacío',
  );
});

Deno.test(
  'RepositorioSupabase.completarPaso: sin referencias no hace upsert pero marca el paso',
  async () => {
    const { cliente, llamadas } = crearClienteSimulado();
    await new RepositorioSupabase(cliente).completarPaso(7, 11, [], [], 3);

    assertEquals(llamadas.filter((l) => l.operacion === 'upsert').length, 0);
    assertEquals(llamadas.filter((l) => l.operacion === 'insert').length, 0);
    assertEquals(llamadas.filter((l) => l.operacion === 'update').length, 1);
  },
);

Deno.test(
  'RepositorioSupabase.intentosDelPaso: lee el intento del registro guardado y es 0 sin registro',
  async () => {
    const con = (data: unknown) => crearClienteSimulado({ paso: { data, error: null } });

    const guardado = con({ registro: { intento: 3 } });
    assertEquals(await new RepositorioSupabase(guardado.cliente).intentosDelPaso(7, 11), 3);
    assertEquals(guardado.llamadas[0]!.tabla, 'recalculo_paso');
    assertEquals(guardado.llamadas[0]!.argumentos, ['registro']);
    assertEquals(guardado.llamadas[0]!.filtros, [
      ['id_calculo', 7],
      ['id_subfactor', 11],
    ]);

    for (const sin of [
      null,
      { registro: null },
      { registro: {} },
      { registro: { intento: 'x' } },
    ]) {
      assertEquals(await new RepositorioSupabase(con(sin).cliente).intentosDelPaso(7, 11), 0);
    }
  },
);

Deno.test('RepositorioSupabase.intentosDelPaso: un error de la base se propaga', async () => {
  const { cliente } = crearClienteSimulado({ paso: { data: null, error: { message: 'caída' } } });
  await assertRejects(
    () => new RepositorioSupabase(cliente).intentosDelPaso(7, 11),
    Error,
    'No se pudo leer el registro del paso',
  );
});

Deno.test(
  'RepositorioSupabase.guardarRegistroPaso: escribe solo iniciado_en, duracion_ms y registro',
  async () => {
    const { cliente, llamadas } = crearClienteSimulado();
    const repositorio = new RepositorioSupabase(cliente);
    const registro = {
      intento: 2,
      proveedor: 'fake',
      busqueda: [],
      lotes: [],
      etapa: null,
      lotes_total: 0,
      aceptados: 0,
      resultado: 'hecho' as const,
      mensaje: null,
    };

    await repositorio.guardarRegistroPaso(7, 11, {
      iniciado_en: '2026-11-22T10:00:00.000Z',
      duracion_ms: null,
      registro,
    });
    await repositorio.guardarRegistroPaso(7, 11, { duracion_ms: 1500, registro });

    assertEquals(
      llamadas.map((l) => [l.tabla, l.operacion]),
      [
        ['recalculo_paso', 'update'],
        ['recalculo_paso', 'update'],
      ],
    );
    assertEquals(llamadas[0]!.argumentos, [
      { iniciado_en: '2026-11-22T10:00:00.000Z', duracion_ms: null, registro },
    ]);
    assertEquals(llamadas[1]!.argumentos, [{ duracion_ms: 1500, registro }]);
    assertEquals(llamadas[1]!.filtros, [
      ['id_calculo', 7],
      ['id_subfactor', 11],
    ]);
  },
);

Deno.test(
  'leerConfiguracionGuardada: usa la RPC de service_role y devuelve su única fila',
  async () => {
    const fila = { proveedor_llm: 'gemini', umbral: 0.8, gemini_api_key: 'k' };
    const { cliente, rpcs } = crearClienteSimulado({ rpc: { data: [fila], error: null } });
    assertEquals(await leerConfiguracionGuardada(cliente), fila);
    assertEquals(rpcs, [{ funcion: 'configuracion_recalculo_servicio', argumentos: undefined }]);
  },
);

Deno.test('leerConfiguracionGuardada: sin fila devuelve null (se usa el entorno)', async () => {
  const { cliente } = crearClienteSimulado({ rpc: { data: [], error: null } });
  assertEquals(await leerConfiguracionGuardada(cliente), null);
});

Deno.test('leerConfiguracionGuardada: un error de la base es un error interno', async () => {
  const { cliente } = crearClienteSimulado({ rpc: { data: null, error: { message: 'caída' } } });
  const error = await assertRejects(() => leerConfiguracionGuardada(cliente), Error);
  assert(!(error instanceof ErrorApi));
});
