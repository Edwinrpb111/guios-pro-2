import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js';
import { crearApiAdmin, type ClienteAdmin } from './apiSupabase';
import { ErrorAdmin } from './tipos';

type Respuesta = { data: unknown; error: { message: string } | null };

interface Llamada {
  tabla: string;
  pasos: [string, unknown[]][];
}

/** Cliente simulado: registra cada consulta encadenada y responde según la tabla. */
function clienteSimulado(
  respuestas: {
    tablas?: Record<string, Respuesta | ((llamada: Llamada) => Respuesta)>;
    rpc?: Record<string, Respuesta>;
    funciones?: Record<string, Respuesta>;
  } = {},
) {
  const llamadas: Llamada[] = [];
  const rpcs: [string, unknown][] = [];
  const invocaciones: [string, unknown][] = [];

  const from = (tabla: string) => {
    const llamada: Llamada = { tabla, pasos: [] };
    llamadas.push(llamada);
    const resolver = () => {
      const r = respuestas.tablas?.[tabla] ?? { data: [], error: null };
      return Promise.resolve(typeof r === 'function' ? r(llamada) : r);
    };
    const cadena: Record<string, unknown> = {};
    for (const metodo of ['select', 'eq', 'order', 'range', 'update', 'limit']) {
      cadena[metodo] = (...argumentos: unknown[]) => {
        llamada.pasos.push([metodo, argumentos]);
        return cadena;
      };
    }
    cadena['maybeSingle'] = () => resolver();
    cadena['then'] = (ok: (v: unknown) => unknown, mal?: (e: unknown) => unknown) =>
      resolver().then(ok, mal);
    return cadena;
  };

  const cliente = {
    from,
    rpc: (nombre: string, argumentos: unknown) => {
      rpcs.push([nombre, argumentos]);
      return Promise.resolve(respuestas.rpc?.[nombre] ?? { data: null, error: null });
    },
    functions: {
      invoke: (nombre: string, opciones: { body: unknown }) => {
        invocaciones.push([nombre, opciones.body]);
        return Promise.resolve(respuestas.funciones?.[nombre] ?? { data: null, error: null });
      },
    },
  } as unknown as ClienteAdmin;
  return { cliente, llamadas, rpcs, invocaciones };
}

const FILA_CALCULO = {
  id_calculo: 7,
  origen: 'ia',
  anio_inicio: 2020,
  anio_fin: 2025,
  etiqueta_rango: null,
  bases_datos: 'OpenAlex',
  fecha_calculo: '2026-11-18T10:00:00Z',
  vigente: false,
  estado: 'pausado',
  progreso: 4,
  mensaje_error: 'Límite de OpenAlex',
  parametros: { umbral: 0.7 },
};

describe('crearApiAdmin (Supabase)', () => {
  it('lista los cálculos del más reciente al más antiguo y los convierte al modelo', async () => {
    const { cliente, llamadas } = clienteSimulado({
      tablas: { calculo_sugerida: { data: [FILA_CALCULO], error: null } },
    });
    const calculos = await crearApiAdmin(cliente).listarCalculos();
    expect(calculos).toEqual([
      {
        id: 7,
        origen: 'ia',
        anioInicio: 2020,
        anioFin: 2025,
        etiquetaRango: null,
        basesDatos: 'OpenAlex',
        fecha: '2026-11-18T10:00:00Z',
        vigente: false,
        estado: 'pausado',
        progreso: 4,
        mensajeError: 'Límite de OpenAlex',
        parametros: { umbral: 0.7 },
      },
    ]);
    expect(llamadas[0]?.pasos.filter(([m]) => m === 'order')).toEqual([
      ['order', ['fecha_calculo', { ascending: false }]],
      ['order', ['id_calculo', { ascending: false }]],
    ]);
  });

  it('rechaza un estado u origen desconocido en lugar de mostrar datos inválidos', async () => {
    const { cliente } = clienteSimulado({
      tablas: { calculo_sugerida: { data: [{ ...FILA_CALCULO, estado: 'raro' }], error: null } },
    });
    await expect(crearApiAdmin(cliente).listarCalculos()).rejects.toThrow(/estado/);
  });

  it('obtiene un cálculo por id o null si no existe', async () => {
    const { cliente, llamadas } = clienteSimulado({
      tablas: { calculo_sugerida: { data: null, error: null } },
    });
    expect(await crearApiAdmin(cliente).obtenerCalculo(99)).toBeNull();
    expect(llamadas[0]?.pasos).toContainEqual(['eq', ['id_calculo', 99]]);
  });

  it('lee las filas de IS de un cálculo y valida la escala 1..4', async () => {
    const fila = {
      id_factor: 1,
      num_subfactores: 8,
      total_citas: 33,
      razon_citas: 4.125,
      importancia_experto: 3,
      importancia_literatura: 3,
      importancia_sugerida: 3,
    };
    const ok = clienteSimulado({ tablas: { sugerida_factor: { data: [fila], error: null } } });
    expect(await crearApiAdmin(ok.cliente).filasSugeridas(7)).toEqual([
      { idFactor: 1, subfactores: 8, citas: 33, razon: 4.125, ie: 3, il: 3, is: 3 },
    ]);
    const mal = clienteSimulado({
      tablas: { sugerida_factor: { data: [{ ...fila, importancia_sugerida: 7 }], error: null } },
    });
    await expect(crearApiAdmin(mal.cliente).filasSugeridas(7)).rejects.toThrow(/importancia/i);
  });

  it('ordena el catálogo por factor y subfactor', async () => {
    const { cliente } = clienteSimulado({
      tablas: {
        factor: {
          data: [
            {
              id_factor: 2,
              nombre: 'B',
              orden: 2,
              subfactor: [
                { id_subfactor: 22, enunciado: 'b2', orden: 2 },
                { id_subfactor: 21, enunciado: 'b1', orden: 1 },
              ],
            },
            { id_factor: 1, nombre: 'A', orden: 1, subfactor: [] },
          ],
          error: null,
        },
      },
    });
    const catalogo = await crearApiAdmin(cliente).catalogo();
    expect(catalogo.map((f) => f.nombre)).toEqual(['A', 'B']);
    expect(catalogo[1]?.subfactores.map((s) => s.id)).toEqual([21, 22]);
  });

  it('lee todas las referencias por páginas de 1000 (límite de PostgREST)', async () => {
    const pagina = (desde: number, n: number) =>
      Array.from({ length: n }, (_, i) => ({
        id_referencia: desde + i,
        id_subfactor: 1,
        titulo: `T${desde + i}`,
        anio: 2022,
        doi: `10.1/${desde + i}`,
        base_datos: 'openalex',
      }));
    const { cliente, llamadas } = clienteSimulado({
      tablas: {
        referencia: (llamada) => {
          const [, [desde]] = llamada.pasos.find(([m]) => m === 'range') as [string, [number]];
          return { data: desde === 0 ? pagina(0, 1000) : pagina(1000, 5), error: null };
        },
      },
    });
    const referencias = await crearApiAdmin(cliente).referencias(7);
    expect(referencias).toHaveLength(1005);
    expect(referencias[1004]).toEqual({
      id: 1004,
      idSubfactor: 1,
      titulo: 'T1004',
      anio: 2022,
      doi: '10.1/1004',
      base: 'openalex',
    });
    expect(llamadas.map((l) => l.pasos.find(([m]) => m === 'range')?.[1])).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it('inicia el recálculo con la Edge Function y devuelve el id', async () => {
    const { cliente, invocaciones } = clienteSimulado({
      funciones: { 'recalculo-iniciar': { data: { id_calculo: 9 }, error: null } },
    });
    const id = await crearApiAdmin(cliente).iniciarRecalculo({
      anioInicio: 2020,
      anioFin: 2025,
      fuentes: ['openalex'],
    });
    expect(id).toBe(9);
    expect(invocaciones).toEqual([
      ['recalculo-iniciar', { anio_inicio: 2020, anio_fin: 2025, fuentes: ['openalex'] }],
    ]);
  });

  it('un paso devuelve {progreso, pendientes, estado}', async () => {
    const { cliente, invocaciones } = clienteSimulado({
      funciones: {
        'recalculo-paso': {
          data: { progreso: 3, pendientes: 40, estado: 'en_proceso' },
          error: null,
        },
      },
    });
    expect(await crearApiAdmin(cliente).pasoRecalculo(9)).toEqual({
      progreso: 3,
      pendientes: 40,
      estado: 'en_proceso',
    });
    expect(invocaciones).toEqual([['recalculo-paso', { id_calculo: 9 }]]);
  });

  it('un error de la Edge Function llega con su mensaje en español, código y estado', async () => {
    const respuesta = new Response(
      JSON.stringify({
        error: 'OpenAlex respondió 429.',
        codigo: 'proveedor_no_disponible',
        estado: 'pausado',
      }),
      { status: 503 },
    );
    const { cliente } = clienteSimulado({
      funciones: { 'recalculo-paso': { data: null, error: new FunctionsHttpError(respuesta) } },
    });
    const error = await crearApiAdmin(cliente)
      .pasoRecalculo(9)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorAdmin);
    expect(error).toMatchObject({
      message: 'OpenAlex respondió 429.',
      codigo: 'proveedor_no_disponible',
      estado: 'pausado',
    });
  });

  it('un error sin cuerpo legible da un mensaje genérico en español', async () => {
    const { cliente } = clienteSimulado({
      funciones: {
        'recalculo-iniciar': { data: null, error: { message: 'Failed to fetch' } },
      },
    });
    await expect(
      crearApiAdmin(cliente).iniciarRecalculo({ anioInicio: 2020, anioFin: 2025, fuentes: [] }),
    ).rejects.toThrow(/No se pudo contactar/);
  });

  describe('errores de las Edge Functions (issue #43)', () => {
    const MENSAJE_TIEMPO = /El paso tardó más de lo permitido/;

    async function errorDelPaso(error: unknown) {
      const { cliente } = clienteSimulado({
        funciones: { 'recalculo-paso': { data: null, error: error as { message: string } } },
      });
      return crearApiAdmin(cliente)
        .pasoRecalculo(9)
        .catch((e: unknown) => e);
    }

    it.each([504, 546])(
      'un %i del gateway es un corte por tiempo, no un problema de conexión',
      async (estado) => {
        const respuesta = new Response('<html>Gateway Timeout</html>', { status: estado });
        const error = await errorDelPaso(new FunctionsHttpError(respuesta));
        expect(error).toBeInstanceOf(ErrorAdmin);
        expect(error).toMatchObject({ tipo: 'tiempo', codigo: null, estado: null });
        expect((error as ErrorAdmin).message).toMatch(MENSAJE_TIEMPO);
        expect((error as ErrorAdmin).message).not.toMatch(/conexión/);
      },
    );

    it('un 546 WORKER_LIMIT con cuerpo JSON sin `error` también es un corte por tiempo', async () => {
      const respuesta = new Response(
        JSON.stringify({ code: 'WORKER_LIMIT', message: 'Function exceeded the limit' }),
        { status: 546 },
      );
      const error = await errorDelPaso(new FunctionsHttpError(respuesta));
      expect(error).toMatchObject({ tipo: 'tiempo' });
      expect((error as ErrorAdmin).message).toMatch(MENSAJE_TIEMPO);
    });

    it('un error del relay de Supabase es un corte por tiempo', async () => {
      const error = await errorDelPaso(new FunctionsRelayError(new Response('', { status: 502 })));
      expect(error).toMatchObject({ tipo: 'tiempo' });
      expect((error as ErrorAdmin).message).toMatch(MENSAJE_TIEMPO);
    });

    it('un fallo de red sin respuesta mantiene el mensaje de conexión', async () => {
      const error = await errorDelPaso(new FunctionsFetchError(new TypeError('Failed to fetch')));
      expect(error).toMatchObject({ tipo: 'red' });
      expect((error as ErrorAdmin).message).toMatch(/No se pudo contactar/);
    });

    it('un error HTTP con JSON `error` conserva su mensaje, código y estado', async () => {
      const respuesta = new Response(
        JSON.stringify({
          error: 'Tiempo agotado del paso.',
          codigo: 'paso_sin_tiempo',
          estado: 'pausado',
        }),
        { status: 503 },
      );
      const error = await errorDelPaso(new FunctionsHttpError(respuesta));
      expect(error).toMatchObject({
        message: 'Tiempo agotado del paso.',
        codigo: 'paso_sin_tiempo',
        estado: 'pausado',
        tipo: 'otro',
      });
    });

    it('un error HTTP sin cuerpo JSON no se hace pasar por falta de conexión', async () => {
      const respuesta = new Response('<html>Internal Server Error</html>', { status: 500 });
      const error = await errorDelPaso(new FunctionsHttpError(respuesta));
      expect(error).toMatchObject({ tipo: 'otro' });
      expect((error as ErrorAdmin).message).toMatch(/500/);
      expect((error as ErrorAdmin).message).not.toMatch(/conexión/);
    });
  });

  it('usa las funciones SQL de §11.2 con sus argumentos', async () => {
    const { cliente, rpcs } = clienteSimulado({
      rpc: {
        conteo_citas: {
          data: [{ id_factor: 1, num_subfactores: 2, total_citas: 5 }],
          error: null,
        },
      },
    });
    const api = crearApiAdmin(cliente);
    expect(await api.conteoCitas(7)).toEqual([{ idFactor: 1, subfactores: 2, citas: 5 }]);
    await api.guardarResultado(7, [
      { idFactor: 1, subfactores: 2, citas: 5, razon: 2.5, ie: 3, il: 4, is: 3 },
    ]);
    await api.publicar(7);
    await api.descartar(8);
    await api.pausar(9);
    expect(rpcs).toEqual([
      ['conteo_citas', { p_id_calculo: 7 }],
      [
        'guardar_resultado_calculo',
        {
          p_id_calculo: 7,
          p_filas: [
            {
              id_factor: 1,
              num_subfactores: 2,
              total_citas: 5,
              razon_citas: 2.5,
              importancia_experto: 3,
              importancia_literatura: 4,
              importancia_sugerida: 3,
            },
          ],
        },
      ],
      ['publicar_calculo', { p_id_calculo: 7 }],
      ['descartar_calculo', { p_id_calculo: 8 }],
      ['pausar_calculo', { p_id_calculo: 9 }],
    ]);
  });

  it('el mensaje de una función SQL (en español) llega al administrador', async () => {
    const { cliente } = clienteSimulado({
      rpc: {
        descartar_calculo: {
          data: null,
          error: { message: 'No se puede descartar un cálculo publicado.' },
        },
      },
    });
    await expect(crearApiAdmin(cliente).descartar(1)).rejects.toThrow(
      'No se puede descartar un cálculo publicado.',
    );
  });

  describe('configuración del recálculo (issue #33)', () => {
    const FILA = {
      proveedor_llm: 'gemini',
      modelo: 'gemini-3.1-flash-lite',
      umbral: 0.7,
      max_candidatos: null,
      llamadas_por_minuto: 12,
      crossref_mailto: 'equipo@unemi.edu.ec',
      openai_base_url: 'https://openrouter.ai/api/v1',
      openai_modelo: 'meta-llama/llama-3.3-70b-instruct:free',
      actualizado_en: '2026-11-18T10:00:00Z',
    };
    const ESTADO = [
      { nombre: 'GEMINI_API_KEY', configurada: true, actualizada_en: '2026-11-18T10:00:00Z' },
      {
        nombre: 'OPENAI_COMPAT_API_KEY',
        configurada: true,
        actualizada_en: '2026-11-19T10:00:00Z',
      },
      { nombre: 'OPENALEX_API_KEY', configurada: false, actualizada_en: null },
    ];
    const CAMBIOS = [
      {
        id_cambio: 3,
        cambio: 'clave GEMINI_API_KEY guardada',
        realizado_por_nombre: 'Ada Admin',
        realizado_en: '2026-11-18T10:00:00Z',
      },
    ];

    it('lee los parámetros, solo el estado de las claves y los cambios recientes', async () => {
      const { cliente, llamadas, rpcs } = clienteSimulado({
        tablas: {
          configuracion_recalculo: { data: FILA, error: null },
          configuracion_recalculo_cambio: { data: CAMBIOS, error: null },
        },
        rpc: { estado_claves_recalculo: { data: ESTADO, error: null } },
      });
      expect(await crearApiAdmin(cliente).obtenerConfiguracion()).toEqual({
        parametros: {
          proveedorLlm: 'gemini',
          modelo: 'gemini-3.1-flash-lite',
          umbral: 0.7,
          maxCandidatos: null,
          llamadasPorMinuto: 12,
          crossrefMailto: 'equipo@unemi.edu.ec',
          openaiBaseUrl: 'https://openrouter.ai/api/v1',
          openaiModelo: 'meta-llama/llama-3.3-70b-instruct:free',
        },
        actualizadoEn: '2026-11-18T10:00:00Z',
        claves: [
          { nombre: 'GEMINI_API_KEY', configurada: true, actualizadaEn: '2026-11-18T10:00:00Z' },
          {
            nombre: 'OPENAI_COMPAT_API_KEY',
            configurada: true,
            actualizadaEn: '2026-11-19T10:00:00Z',
          },
          { nombre: 'OPENALEX_API_KEY', configurada: false, actualizadaEn: null },
        ],
        cambios: [
          {
            id: 3,
            cambio: 'clave GEMINI_API_KEY guardada',
            realizadoPor: 'Ada Admin',
            realizadoEn: '2026-11-18T10:00:00Z',
          },
        ],
      });
      expect(rpcs).toEqual([['estado_claves_recalculo', undefined]]);
      const pasos = llamadas.find((l) => l.tabla === 'configuracion_recalculo')?.pasos ?? [];
      // Nunca se piden columnas de claves: solo existen en Vault.
      expect(JSON.stringify(pasos)).not.toMatch(/api_key/);
      // Sí se piden la dirección base y el modelo del proveedor compatible (no son secretos).
      expect(JSON.stringify(pasos)).toMatch(/openai_base_url, openai_modelo/);
      expect(
        llamadas.find((l) => l.tabla === 'configuracion_recalculo_cambio')?.pasos,
      ).toContainEqual(['limit', [10]]);
    });

    it('acepta el proveedor «openai» y rechaza uno desconocido', async () => {
      for (const [proveedor, acepta] of [
        ['openai', true],
        ['otro', false],
      ] as const) {
        const { cliente } = clienteSimulado({
          tablas: {
            configuracion_recalculo: { data: { ...FILA, proveedor_llm: proveedor }, error: null },
          },
          rpc: { estado_claves_recalculo: { data: ESTADO, error: null } },
        });
        const lectura = crearApiAdmin(cliente).obtenerConfiguracion();
        if (acepta) {
          expect((await lectura).parametros.proveedorLlm).toBe('openai');
        } else {
          await expect(lectura).rejects.toThrow(/proveedor del clasificador desconocido/);
        }
      }
    });

    it('sin fila visible (no es administrador) lo explica', async () => {
      const { cliente } = clienteSimulado({
        tablas: { configuracion_recalculo: { data: null, error: null } },
        rpc: { estado_claves_recalculo: { data: ESTADO, error: null } },
      });
      await expect(crearApiAdmin(cliente).obtenerConfiguracion()).rejects.toThrow(
        /Solo un administrador/,
      );
    });

    it('rechaza un estado de clave desconocido', async () => {
      const { cliente } = clienteSimulado({
        tablas: { configuracion_recalculo: { data: FILA, error: null } },
        rpc: {
          estado_claves_recalculo: {
            data: [{ nombre: 'OTRA', configurada: true, actualizada_en: null }],
            error: null,
          },
        },
      });
      await expect(crearApiAdmin(cliente).obtenerConfiguracion()).rejects.toThrow(ErrorAdmin);
    });

    it('guarda los parámetros con update de la única fila y comprueba que se aplicó', async () => {
      const { cliente, llamadas } = clienteSimulado({
        tablas: { configuracion_recalculo: { data: [{ id: true }], error: null } },
      });
      await crearApiAdmin(cliente).guardarParametros({
        proveedorLlm: 'fake',
        modelo: null,
        umbral: 0.8,
        maxCandidatos: 15,
        llamadasPorMinuto: 30,
        crossrefMailto: null,
        openaiBaseUrl: 'https://api.groq.com/openai/v1',
        openaiModelo: 'llama-3.3-70b-versatile',
      });
      expect(llamadas[0]?.pasos).toEqual([
        [
          'update',
          [
            {
              proveedor_llm: 'fake',
              modelo: null,
              umbral: 0.8,
              max_candidatos: 15,
              llamadas_por_minuto: 30,
              crossref_mailto: null,
              openai_base_url: 'https://api.groq.com/openai/v1',
              openai_modelo: 'llama-3.3-70b-versatile',
            },
          ],
        ],
        ['eq', ['id', true]],
        ['select', ['id']],
      ]);
    });

    it('si el update no tocó ninguna fila (RLS), avisa', async () => {
      const { cliente } = clienteSimulado({
        tablas: { configuracion_recalculo: { data: [], error: null } },
      });
      await expect(
        crearApiAdmin(cliente).guardarParametros({
          proveedorLlm: null,
          modelo: null,
          umbral: null,
          maxCandidatos: null,
          llamadasPorMinuto: null,
          crossrefMailto: null,
          openaiBaseUrl: null,
          openaiModelo: null,
        }),
      ).rejects.toThrow(/Solo un administrador/);
    });

    it('guarda y borra claves con sus funciones SQL de solo escritura', async () => {
      const { cliente, rpcs } = clienteSimulado();
      const api = crearApiAdmin(cliente);
      await api.guardarClave('OPENAI_COMPAT_API_KEY', 'k-compat');
      await api.guardarClave('GEMINI_API_KEY', 'k-1');
      await api.borrarClave('OPENALEX_API_KEY');
      expect(rpcs).toEqual([
        ['guardar_clave_recalculo', { p_nombre: 'OPENAI_COMPAT_API_KEY', p_valor: 'k-compat' }],
        ['guardar_clave_recalculo', { p_nombre: 'GEMINI_API_KEY', p_valor: 'k-1' }],
        ['borrar_clave_recalculo', { p_nombre: 'OPENALEX_API_KEY' }],
      ]);
    });

    it('el error de la base al guardar una clave no repite la clave', async () => {
      const { cliente } = clienteSimulado({
        rpc: {
          guardar_clave_recalculo: {
            data: null,
            error: { message: 'Solo un administrador puede realizar esta operación.' },
          },
        },
      });
      const promesa = crearApiAdmin(cliente).guardarClave('GEMINI_API_KEY', 'k-secreta');
      await expect(promesa).rejects.toThrow('Solo un administrador');
      await expect(promesa).rejects.not.toThrow(/k-secreta/);
    });
  });
});
