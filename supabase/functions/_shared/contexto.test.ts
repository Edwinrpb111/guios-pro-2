import { assert, assertEquals } from 'jsr:@std/assert@1';
import { claveSubfactor, contextoDe, contextoSubfactores } from './contexto.ts';
import { CATALOGO_PRUEBA } from './pruebas.ts';

// Catálogo de la tesis (supabase/seed.sql): nombre de cada factor y su número de subfactores.
const FACTORES: [string, number][] = [
  ['Compatibilidad', 8],
  ['Personalización', 6],
  ['Prueba', 1],
  ['Fiabilidad', 5],
  ['Reusabilidad', 2],
  ['Usabilidad', 4],
  ['Mantenibilidad', 1],
  ['Portabilidad', 2],
  ['Documentación', 11],
  ['Formación', 4],
  ['Tiempo de adopción', 2],
  ['Casos de estudio de adopción FLOSS', 1],
  ['Centralidad de la tecnología de la información', 2],
  ['Apoyo de la alta dirección', 1],
  ['Bloqueo de proveedores', 1],
  ['Soporte', 6],
  ['Actitud hacia el cambio', 2],
  ['Coste total de propiedad', 2],
];

Deno.test(
  'contexto_subfactores.json cubre los 18 factores y los 61 subfactores del catálogo',
  () => {
    const contexto = contextoSubfactores();
    assert(contexto.version.length > 0);
    assertEquals(Object.keys(contexto.factores).length, 18);
    assertEquals(Object.keys(contexto.subfactores).length, 61);

    FACTORES.forEach(([nombre, cantidad], i) => {
      const orden = i + 1;
      assertEquals(contexto.factores[String(orden)]?.nombre, nombre);
      assert(
        (contexto.factores[String(orden)]?.terminos.length ?? 0) > 0,
        `factor ${orden} sin términos`,
      );
      for (let s = 1; s <= cantidad; s++) {
        const sub = contexto.subfactores[`${orden}.${s}`];
        assert(sub !== undefined, `falta el subfactor ${orden}.${s}`);
        assert(sub.terminos.length > 0 && sub.terminos.every((t) => t.trim() !== ''));
        assert(sub.contexto.trim() !== '');
      }
    });
  },
);

Deno.test('claveSubfactor y contextoDe: usan el JSON y, si falta, el catálogo', () => {
  const [primero, , personalizacion] = CATALOGO_PRUEBA;
  assertEquals(claveSubfactor(primero!), '1.1');

  const contexto = {
    version: 'prueba',
    factores: { '1': { nombre: 'Compatibilidad', terminos: ['compatibility'] } },
    subfactores: { '1.1': { terminos: ['open formats'], contexto: 'Formatos abiertos.' } },
  };
  assertEquals(contextoDe(contexto, primero!), {
    terminosFactor: ['compatibility'],
    terminosSubfactor: ['open formats'],
    descripcion: 'Formatos abiertos.',
  });
  assertEquals(contextoDe(contexto, personalizacion!), {
    terminosFactor: ['Personalización'],
    terminosSubfactor: ['Código fuente abierto'],
    descripcion: 'Código fuente abierto',
  });
});
