// Una escritura del progreso que nunca responde no debe frenar el paso (issue #45, S16d;
// hallazgo del verificador): cada escritura tiene un límite y las tandas no la esperan.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { RegistradorPaso, type RegistroPaso } from './registro.ts';

const colgada = () => new Promise<void>(() => {});

Deno.test('registrador: una escritura colgada se abandona al vencer su límite', async () => {
  const escritas: RegistroPaso[] = [];
  let llamadas = 0;
  const registrador = new RegistradorPaso(
    'fake',
    1,
    (parcial) => {
      llamadas++;
      if (llamadas === 1) return colgada();
      escritas.push(parcial);
      return Promise.resolve();
    },
    20,
  );

  const inicio = Date.now();
  await registrador.clasificando(3);
  await registrador.guardando();
  await registrador.vaciar();

  assert(Date.now() - inicio < 1000, 'la escritura colgada no frena el paso');
  assertEquals(llamadas, 2);
  assertEquals(
    escritas.map((r) => r.etapa),
    ['guardando'],
  );
});

Deno.test('registrador: el límite por defecto de cada escritura es 5 s', () => {
  const registrador = new RegistradorPaso('fake', 1, () => Promise.resolve());
  assertEquals(registrador.limiteEscrituraMs, 5_000);
});
