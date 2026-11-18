import { FunctionsHttpError } from '@supabase/supabase-js';
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
    for (const metodo of ['select', 'eq', 'order', 'range']) {
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
});
