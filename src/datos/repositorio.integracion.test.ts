import { createClient } from '@supabase/supabase-js';
import { env } from 'node:process';
import type { Database } from '../lib/database.types';
import { crearRepositorio, type ClienteGuios } from './repositorio';
import type { Contexto } from './tipos';

/**
 * Integración contra Supabase local (issue #7): catálogo con la IS vigente, historial,
 * contexto y valoración de factores, con RLS real. Solo corre si se definen
 * SUPABASE_URL_PRUEBAS y SUPABASE_ANON_KEY_PRUEBAS (ver docs/variables-entorno.md);
 * en la CI se omite.
 */
const url = env['SUPABASE_URL_PRUEBAS'];
const claveAnonima = env['SUPABASE_ANON_KEY_PRUEBAS'];

async function registrarUsuario(): Promise<ClienteGuios> {
  if (!url || !claveAnonima) throw new Error('Faltan las variables de pruebas de integración');
  const cliente = createClient<Database>(url, claveAnonima, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await cliente.auth.signUp({
    email: `prueba-${crypto.randomUUID()}@example.com`,
    password: 'clave-de-prueba-1234',
    options: { data: { nombre_completo: 'Usuaria de Prueba' } },
  });
  expect(error).toBeNull();
  return cliente;
}

describe.skipIf(!url || !claveAnonima)('Repositorio contra Supabase local', () => {
  it('lee el catálogo (3/18/61) con Soporte «Ambos»', async () => {
    const repo = crearRepositorio(await registrarUsuario());
    const catalogo = await repo.leerCatalogo();
    const factores = catalogo.dimensiones.flatMap((d) => d.factores);
    expect(catalogo.dimensiones).toHaveLength(3);
    expect(factores).toHaveLength(18);
    expect(factores.flatMap((f) => f.idsSubfactores)).toHaveLength(61);
    expect(Object.keys(catalogo.subfactores)).toHaveLength(61);
    // Enunciados con las erratas corregidas (BRIEF §4.1).
    expect(Object.values(catalogo.subfactores).join(' ')).toContain('código fuente');
    expect(factores.filter((f) => f.alcance === 'Ambos').map((f) => f.nombre)).toEqual(['Soporte']);
  });

  it('lee el cálculo vigente de la tesis con la IS de los 18 factores', async () => {
    const repo = crearRepositorio(await registrarUsuario());
    const vigente = await repo.leerCalculoVigente();
    expect(vigente).toMatchObject({
      nombre: 'Cálculo inicial de la tesis',
      rango: 'RSL de la tesis',
      bases: 'IEEE, ACM, Scopus, WoS',
    });
    if (!vigente) return;
    const calculo = await repo.leerCalculo(vigente.id);
    const catalogo = await repo.leerCatalogo();
    const porNombre = new Map(
      catalogo.dimensiones.flatMap((d) => d.factores).map((f) => [f.nombre, f.id]),
    );
    expect(Object.keys(calculo.porFactor)).toHaveLength(18);
    // BRIEF §4.1: Compatibilidad IL 3 / IS 3; Usabilidad IL 2 / IS 2; Apoyo de la alta dirección IL 1 / IS 3 (se mantiene).
    const compatibilidad = calculo.porFactor[porNombre.get('Compatibilidad') ?? -1];
    const usabilidad = calculo.porFactor[porNombre.get('Usabilidad') ?? -1];
    expect(compatibilidad).toEqual({ ie: 3, il: 3, is: 3 });
    expect(usabilidad).toEqual({ ie: 3, il: 2, is: 2 });
  });

  it('crea un borrador, guarda el contexto y los factores y lo relee igual', async () => {
    const repo = crearRepositorio(await registrarUsuario());
    const catalogo = await repo.leerCatalogo();
    const soporte = catalogo.dimensiones
      .flatMap((d) => d.factores)
      .find((f) => f.nombre === 'Soporte');
    expect(soporte).toBeDefined();
    if (!soporte) return;

    const id = await repo.crearBorrador();
    const vacia = await repo.leerEvaluacion(id);
    expect(vacia).toMatchObject({
      id,
      estado: 'en_curso',
      contexto: {
        titulo: '',
        software: { id: null, nombre: '' },
        organizacion: { id: null, nombre: '' },
      },
      valoraciones: [],
    });
    expect((await repo.listarEvaluaciones()).map((e) => e.id)).toContain(id);

    // Contexto: la primera vez inserta organización y software; la segunda actualiza las mismas filas.
    const contexto: Contexto = {
      titulo: 'Adopción de LibreOffice',
      software: { id: null, nombre: 'LibreOffice', version: '7.x', licencia: 'MPL 2.0' },
      organizacion: {
        id: null,
        nombre: 'Universidad Estatal de Milagro',
        sector: 'Educación',
        pais: 'Ecuador',
      },
    };
    const guardado = await repo.guardarContexto(id, contexto);
    expect(guardado.software.id).not.toBeNull();
    expect(guardado.organizacion.id).not.toBeNull();
    const corregido = await repo.guardarContexto(id, {
      ...guardado,
      software: { ...guardado.software, version: '24.2' },
    });
    expect(corregido.software.id).toBe(guardado.software.id);
    expect(corregido.organizacion.id).toBe(guardado.organizacion.id);
    expect((await repo.leerEvaluacion(id))?.contexto).toEqual(corregido);

    // Factor Soporte: ID 4 con alcance Externo; reenviar actualiza la misma fila (upsert).
    await repo.guardarValoracionFactor(id, {
      idFactor: soporte.id,
      id: 4,
      alcance: 'Externo',
      ir: 4,
      relevante: true,
      pm: null,
      foda: null,
    });
    await repo.guardarValoracionFactor(id, {
      idFactor: soporte.id,
      id: 2,
      alcance: 'Externo',
      ir: 2,
      relevante: true,
      pm: 3.3333333,
      foda: 'Oportunidad',
    });
    const leida = await repo.leerEvaluacion(id);
    expect(leida?.valoraciones).toEqual([
      { idFactor: soporte.id, id: 2, alcance: 'Externo', cumplimientos: {} },
    ]);

    const [resumen] = (await repo.listarEvaluaciones()).filter((e) => e.id === id);
    expect(resumen).toMatchObject({
      titulo: 'Adopción de LibreOffice',
      estado: 'en_curso',
      codigo: null,
      software: { nombre: 'LibreOffice', version: '24.2', licencia: 'MPL 2.0' },
      organizacion: 'Universidad Estatal de Milagro',
      factoresValorados: [{ idFactor: soporte.id, relevante: true, subfactoresValorados: 0 }],
    });
  });

  it('RLS: otro usuario no ve la evaluación; una finalizada no se modifica', async () => {
    const clienteDueno = await registrarUsuario();
    const dueno = crearRepositorio(clienteDueno);
    const ajeno = crearRepositorio(await registrarUsuario());
    const catalogo = await dueno.leerCatalogo();
    const factor = catalogo.dimensiones[0]?.factores[0];
    if (!factor) throw new Error('catálogo vacío');

    const id = await dueno.crearBorrador();
    expect(await ajeno.leerEvaluacion(id)).toBeNull();
    expect((await ajeno.listarEvaluaciones()).map((e) => e.id)).not.toContain(id);
    await expect(
      ajeno.guardarContexto(id, {
        titulo: 'intruso',
        software: { id: null, nombre: 'X', version: '', licencia: '' },
        organizacion: { id: null, nombre: '', sector: '', pais: '' },
      }),
    ).rejects.toThrow(/no se pudo guardar/i);

    // Se finaliza con el cliente del dueño (lo que hará #8) y deja de ser editable.
    const fin = await clienteDueno
      .from('evaluacion')
      .update({ estado: 'finalizada' })
      .eq('id_evaluacion', id);
    expect(fin.error).toBeNull();
    await expect(
      dueno.guardarContexto(id, {
        titulo: 'cambio',
        software: { id: null, nombre: 'Y', version: '', licencia: '' },
        organizacion: { id: null, nombre: '', sector: '', pais: '' },
      }),
    ).rejects.toThrow(/no se pudo guardar/i);
    await expect(
      dueno.guardarValoracionFactor(id, {
        idFactor: factor.id,
        id: 3,
        alcance: 'Externo',
        ir: 3,
        relevante: true,
        pm: null,
        foda: null,
      }),
    ).rejects.toThrow(/no se pudo guardar/i);
    expect((await dueno.leerEvaluacion(id))?.estado).toBe('finalizada');
  });

  it('elimina una evaluación en curso propia con sus valoraciones, no la de otro ni una finalizada', async () => {
    const clienteDueno = await registrarUsuario();
    const dueno = crearRepositorio(clienteDueno);
    const ajeno = crearRepositorio(await registrarUsuario());
    const factor = (await dueno.leerCatalogo()).dimensiones[0]?.factores[0];
    if (!factor) throw new Error('catálogo vacío');

    const id = await dueno.crearBorrador();
    await dueno.guardarValoracionFactor(id, {
      idFactor: factor.id,
      id: 3,
      alcance: 'Externo',
      ir: 3,
      relevante: true,
      pm: null,
      foda: null,
    });
    await expect(ajeno.eliminarEvaluacion(id)).rejects.toThrow(/no se pudo eliminar/i);
    expect(await dueno.leerEvaluacion(id)).not.toBeNull();

    await dueno.eliminarEvaluacion(id);
    expect(await dueno.leerEvaluacion(id)).toBeNull();
    expect((await dueno.listarEvaluaciones()).map((e) => e.id)).not.toContain(id);
    const valoraciones = await clienteDueno
      .from('valoracion_factor')
      .select('id_val_factor')
      .eq('id_evaluacion', id);
    expect(valoraciones.data).toEqual([]);
    // Ya no existe: eliminarla otra vez falla en lugar de fingir éxito.
    await expect(dueno.eliminarEvaluacion(id)).rejects.toThrow(/no se pudo eliminar/i);

    // Una finalizada no se borra (BRIEF §10.3).
    const otra = await dueno.crearBorrador();
    await dueno.finalizarEvaluacion(otra, {
      factores: [],
      recomendacion: { codigo: 'A', texto: 'Adoptar', causas: [] },
    });
    await expect(dueno.eliminarEvaluacion(otra)).rejects.toThrow(/no se pudo eliminar/i);
    expect((await dueno.leerEvaluacion(otra))?.estado).toBe('finalizada');
  });

  it('valora subfactores (upsert) con la fotografía del factor y finaliza la evaluación', async () => {
    const cliente = await registrarUsuario();
    const repo = crearRepositorio(cliente);
    const catalogo = await repo.leerCatalogo();
    const formacion = catalogo.dimensiones
      .flatMap((d) => d.factores)
      .find((f) => f.nombre === 'Formación');
    if (!formacion) throw new Error('falta Formación en el catálogo');
    const [primero, segundo] = formacion.idsSubfactores;
    if (primero === undefined || segundo === undefined) throw new Error('faltan subfactores');

    const id = await repo.crearBorrador();
    const factor = {
      idFactor: formacion.id,
      id: 3 as const,
      alcance: 'Interno' as const,
      ir: 3 as const,
      relevante: true,
      pm: null,
      foda: null,
    };
    // El primer PS crea también la valoración del factor si no existía.
    await repo.guardarValoracionSubfactor(id, factor, primero, 1);
    await repo.guardarValoracionSubfactor(id, factor, primero, 2);
    await repo.guardarValoracionSubfactor(
      id,
      { ...factor, pm: 2.6666667, foda: 'Debilidad' },
      segundo,
      4,
    );
    expect((await repo.leerEvaluacion(id))?.valoraciones).toEqual([
      {
        idFactor: formacion.id,
        id: 3,
        alcance: 'Interno',
        cumplimientos: { [primero]: 2, [segundo]: 4 },
      },
    ]);
    const fotografia = await cliente
      .from('valoracion_factor')
      .select('ponderacion_global, clasificacion_foda')
      .eq('id_evaluacion', id)
      .single();
    expect(fotografia.data).toEqual({ ponderacion_global: 2.67, clasificacion_foda: 'Debilidad' });
    const [resumen] = (await repo.listarEvaluaciones()).filter((e) => e.id === id);
    expect(resumen?.factoresValorados).toEqual([
      { idFactor: formacion.id, relevante: true, subfactoresValorados: 2 },
    ]);

    await repo.finalizarEvaluacion(id, {
      factores: [{ ...factor, pm: 3, foda: 'Fortaleza' }],
      recomendacion: {
        codigo: 'C',
        texto: 'Analizar la adopción; debería posponerse',
        causas: [{ nombre: 'Formación', foda: 'Debilidad', ir: 3 }],
      },
    });
    const finalizada = await repo.leerEvaluacion(id);
    expect(finalizada).toMatchObject({
      estado: 'finalizada',
      recomendacion: {
        codigo: 'C',
        texto: 'Analizar la adopción; debería posponerse',
        causas: [{ nombre: 'Formación', foda: 'Debilidad', ir: 3 }],
      },
    });
    const refrescada = await cliente
      .from('valoracion_factor')
      .select('ponderacion_global, clasificacion_foda')
      .eq('id_evaluacion', id)
      .single();
    expect(refrescada.data).toEqual({ ponderacion_global: 3, clasificacion_foda: 'Fortaleza' });

    // Congelada: ni otro PS ni otra finalización.
    await expect(repo.guardarValoracionSubfactor(id, factor, primero, 4)).rejects.toThrow(
      /no se pudo guardar/i,
    );
    await expect(
      repo.finalizarEvaluacion(id, {
        factores: [],
        recomendacion: { codigo: 'A', texto: 'x', causas: [] },
      }),
    ).rejects.toThrow(/no se pudo finalizar/i);
    expect((await repo.leerEvaluacion(id))?.recomendacion?.codigo).toBe('C');
  });
});
