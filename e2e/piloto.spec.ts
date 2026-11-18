import { expect, test, type Page } from '@playwright/test';
import {
  CUMPLIMIENTO,
  IMPORTANCIA,
  type Cumplimiento,
  type Importancia,
} from '../src/guios-core/escalas';
import piloto from '../src/guios-core/fixtures/piloto_libreoffice.json' with { type: 'json' };
import {
  borrarUsuarioDePrueba,
  crearUsuarioDePrueba,
  verificarSemilla,
  type UsuarioDePrueba,
} from './usuario';

/**
 * E2E del caso piloto LibreOffice–UNEMI (BRIEF §6.3, issue #9): login → contexto →
 * ID de factores → PS de subfactores (`pilot()` del CP1) → resultados → finalizar.
 * Los datos salen del fixture de guios-core (solo lectura) y del catálogo de la semilla.
 */

const FODA_A_CUADRANTE = {
  Oportunidad: /^Oportunidades/,
  Fortaleza: /^Fortalezas/,
  Amenaza: /^Amenazas/,
  Debilidad: /^Debilidades/,
} as const;

const escapar = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

let usuario: UsuarioDePrueba;

test.beforeAll(async () => {
  await verificarSemilla();
  usuario = await crearUsuarioDePrueba();
});

test.afterAll(async () => {
  if (usuario) await borrarUsuarioDePrueba(usuario);
});

async function iniciarSesion(pagina: Page) {
  await pagina.goto('/login');
  await pagina.getByLabel('Correo electrónico').fill(usuario.correo);
  await pagina.getByLabel('Contraseña').fill(usuario.contrasena);
  await pagina.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(pagina.getByRole('heading', { level: 1, name: 'Hola, Evaluador' })).toBeVisible();
}

async function llenarContexto(pagina: Page) {
  await pagina.getByRole('button', { name: 'Nueva evaluación' }).first().click();
  await expect(pagina).toHaveURL(/\/evaluaciones\/\d+\/contexto$/);

  await pagina.getByLabel('Título de la evaluación').fill('Piloto LibreOffice–UNEMI');
  await pagina.getByLabel('Nombre del software').fill('LibreOffice');
  await pagina.getByLabel('Versión').fill('7.6');
  await pagina.getByLabel('Tipo de licencia').selectOption('MPL 2.0');
  await pagina
    .getByRole('textbox', { name: 'Organización', exact: true })
    .fill('Universidad Estatal de Milagro');
  await pagina.getByLabel('Sector').selectOption('Educación');
  await pagina.getByLabel('País').fill('Ecuador');

  await pagina.getByRole('button', { name: 'Continuar a factores' }).click();
  await expect(pagina).toHaveURL(/\/factores$/);
}

async function asignarImportanciaDelDecisor(pagina: Page) {
  for (const factor of piloto.factores) {
    const id = factor.id as Importancia;
    await pagina
      .getByRole('radiogroup', { name: `Importancia del factor ${factor.nombre}`, exact: true })
      .getByRole('radio', { name: IMPORTANCIA[id], exact: true })
      .click();
    if (factor.nombre === 'Soporte') {
      // Único factor «Ambos» (RN-04): el piloto lo evalúa con alcance Interno.
      await pagina
        .getByRole('radiogroup', { name: 'Alcance del factor Soporte', exact: true })
        .getByRole('radio', { name: factor.alcance, exact: true })
        .click();
    }
  }
  const total = piloto.factores.length;
  await expect(pagina.getByRole('progressbar', { name: 'Factores valorados' })).toHaveAttribute(
    'aria-valuenow',
    String(total),
  );
  await pagina.getByRole('button', { name: 'Continuar a subfactores' }).click();
  await expect(pagina).toHaveURL(/\/subfactores/);
}

async function valorarSubfactores(pagina: Page) {
  // HALLAZGO (src/, fuera del alcance del issue #9): al pasar de P-04 a P-05 sin recargar, la
  // pantalla parte de la evaluación en caché (sin las valoraciones recién guardadas) y
  // `useValoracionFactores` no la actualiza al llegar la lectura nueva: «Ningún factor es
  // relevante». Recargar equivale a retomar la evaluación. Quitar la recarga al corregirlo.
  await pagina.reload();
  const lista = pagina.getByRole('navigation', { name: 'Factores relevantes' });
  for (const factor of piloto.factores) {
    await lista.getByRole('button', { name: new RegExp(`^${escapar(factor.nombre)} \\d`) }).click();
    const detalle = pagina.getByRole('region', { name: factor.nombre, exact: true });
    await expect(detalle).toBeVisible();
    const filas = detalle.getByRole('radiogroup', { name: /^Cumplimiento:/ });
    await expect(filas).toHaveCount(factor.ps.length);

    for (const [indice, ps] of factor.ps.entries()) {
      await filas
        .nth(indice)
        .getByRole('radio', { name: CUMPLIMIENTO[ps as Cumplimiento], exact: true })
        .click();
    }
    const total = factor.ps.length;
    await expect(detalle.getByText(`${total}/${total} valorados`)).toBeVisible();
  }
  await pagina.getByRole('button', { name: 'Ver resultados' }).click();
  await expect(pagina).toHaveURL(/\/resultados$/);
}

/** Nombre del factor de cada botón de un cuadrante (el primer texto del botón; luego van IR y PM). */
async function factoresDelCuadrante(pagina: Page, foda: keyof typeof FODA_A_CUADRANTE) {
  const cuadrante = pagina
    .getByRole('group', { name: 'Matriz FODA' })
    .getByRole('region', { name: FODA_A_CUADRANTE[foda] });
  const nombres = await cuadrante.getByRole('button').locator('> span:first-child').allInnerTexts();
  return nombres.map((nombre) => nombre.trim());
}

async function comprobarResultados(pagina: Page) {
  const esperada = piloto.recomendacionEsperada;

  // FODA idéntico a BRIEF §6.3 (mismos factores en cada cuadrante, sin orden).
  for (const [foda, nombres] of Object.entries(piloto.fodaEsperado)) {
    // Con reintento: al llegar a P-06 la pantalla muestra primero lo que tenía en caché.
    await expect
      .poll(
        async () =>
          (await factoresDelCuadrante(pagina, foda as keyof typeof FODA_A_CUADRANTE)).sort(),
        { message: `cuadrante ${foda}` },
      )
      .toEqual([...nombres].sort());
  }

  // Recomendación C, causada por Personalización, Formación y Soporte.
  const tarjeta = pagina.getByRole('region', { name: 'Recomendación', exact: true });
  await expect(tarjeta).toHaveAttribute('data-recomendacion', esperada.codigo);
  const causas = tarjeta.getByRole('list', { name: 'Factores que causan la recomendación' });
  const filas = causas.getByRole('listitem');
  await expect(filas).toHaveCount(esperada.causas.length);
  for (const causa of esperada.causas) {
    const fila = filas.filter({
      has: pagina.locator('b', { hasText: new RegExp(`^${escapar(causa.nombre)}$`) }),
    });
    await expect(fila, `causa ${causa.nombre}`).toHaveCount(1);
    await expect(fila).toContainText(causa.foda);
    await expect(fila).toContainText(
      `Importancia relativa: ${IMPORTANCIA[causa.ir as Importancia]}`,
    );
  }
}

test('el caso piloto LibreOffice–UNEMI termina en la recomendación C', async ({ page }) => {
  await test.step('login', () => iniciarSesion(page));
  await test.step('contexto', () => llenarContexto(page));
  await test.step('ID de los 18 factores', () => asignarImportanciaDelDecisor(page));
  await test.step('PS de los subfactores (pilot() del CP1)', () => valorarSubfactores(page));
  await test.step('resultados: FODA y recomendación', () => comprobarResultados(page));

  await test.step('finalizar y conservar la fotografía', async () => {
    await page.getByRole('button', { name: 'Finalizar evaluación' }).click();
    await page.getByRole('button', { name: 'Confirmar y finalizar' }).click();
    await expect(
      page.getByText('Esta evaluación está finalizada y no se puede editar.'),
    ).toBeVisible();

    // Tras recargar, la recomendación y el FODA salen de lo guardado en la BD.
    await page.reload();
    await expect(
      page.getByText('Esta evaluación está finalizada y no se puede editar.'),
    ).toBeVisible();
    await comprobarResultados(page);
  });
});
