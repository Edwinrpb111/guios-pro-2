import { assertEquals } from 'jsr:@std/assert@1';
import { esDoiValido, normalizarDoi } from './doi.ts';

Deno.test('normalizarDoi: pasa a minúsculas y quita el prefijo https://doi.org/', () => {
  assertEquals(normalizarDoi('https://doi.org/10.1000/ABC.1'), '10.1000/abc.1');
});

Deno.test('normalizarDoi: acepta http, dx.doi.org, el prefijo doi: y espacios', () => {
  assertEquals(normalizarDoi('http://dx.doi.org/10.1000/x'), '10.1000/x');
  assertEquals(normalizarDoi('doi:10.1000/x'), '10.1000/x');
  assertEquals(normalizarDoi('DOI: 10.1000/X'), '10.1000/x');
  assertEquals(normalizarDoi('  10.1000/x  '), '10.1000/x');
});

Deno.test('normalizarDoi: devuelve null si no hay un DOI válido', () => {
  for (const valor of [
    '',
    '   ',
    null,
    undefined,
    123,
    {},
    'sin-doi',
    '10.1/x',
    '10.1000/',
    'https://example.com/10.1000/x',
    '10.1000/con espacio',
  ]) {
    assertEquals(normalizarDoi(valor), null, `debía rechazar ${JSON.stringify(valor)}`);
  }
});

Deno.test('normalizarDoi: rechaza un DOI que no cabe en la columna (200 caracteres)', () => {
  const largo = `10.1000/${'a'.repeat(193)}`;
  assertEquals(largo.length, 201);
  assertEquals(normalizarDoi(largo), null);
  assertEquals(normalizarDoi(`10.1000/${'a'.repeat(192)}`)?.length, 200);
});

Deno.test('esDoiValido: solo acepta DOI ya normalizados', () => {
  assertEquals(esDoiValido('10.1000/abc'), true);
  assertEquals(esDoiValido('10.1000/ABC'), false);
  assertEquals(esDoiValido('https://doi.org/10.1000/abc'), false);
});
