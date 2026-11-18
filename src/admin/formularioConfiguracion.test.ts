import {
  formularioDesdeParametros,
  validarClave,
  validarConfiguracion,
  type FormularioConfiguracion,
} from './formularioConfiguracion';

const VACIO: FormularioConfiguracion = {
  proveedorLlm: '',
  modelo: '',
  umbral: '',
  maxCandidatos: '',
  crossrefMailto: '',
};

describe('validarConfiguracion (issue #33)', () => {
  it('un formulario vacío deja todo en null: las Edge Functions usan los secretos de entorno', () => {
    expect(validarConfiguracion(VACIO)).toEqual({
      parametros: {
        proveedorLlm: null,
        modelo: null,
        umbral: null,
        maxCandidatos: null,
        crossrefMailto: null,
      },
    });
  });

  it('acepta valores válidos, con coma decimal y espacios alrededor', () => {
    expect(
      validarConfiguracion({
        proveedorLlm: 'gemini',
        modelo: '  gemini-3.1-flash-lite ',
        umbral: '0,75',
        maxCandidatos: ' 15 ',
        crossrefMailto: ' equipo@unemi.edu.ec ',
      }),
    ).toEqual({
      parametros: {
        proveedorLlm: 'gemini',
        modelo: 'gemini-3.1-flash-lite',
        umbral: 0.75,
        maxCandidatos: 15,
        crossrefMailto: 'equipo@unemi.edu.ec',
      },
    });
    expect(validarConfiguracion({ ...VACIO, umbral: '0', maxCandidatos: '200' })).toMatchObject({
      parametros: { umbral: 0, maxCandidatos: 200 },
    });
    expect(validarConfiguracion({ ...VACIO, umbral: '1' })).toMatchObject({
      parametros: { umbral: 1 },
    });
  });

  it.each([
    [{ umbral: '1,5' }, /umbral/i],
    [{ umbral: '-0.1' }, /umbral/i],
    [{ umbral: 'alto' }, /umbral/i],
    [{ maxCandidatos: '0' }, /candidatos/i],
    [{ maxCandidatos: '201' }, /candidatos/i],
    [{ maxCandidatos: '2.5' }, /candidatos/i],
    [{ crossrefMailto: 'sin-arroba' }, /correo/i],
    [{ modelo: 'x'.repeat(101) }, /modelo/i],
    [{ proveedorLlm: 'openai' }, /proveedor/i],
  ])('rechaza %o con un mensaje claro', (cambio, mensaje) => {
    const resultado = validarConfiguracion({ ...VACIO, ...cambio } as FormularioConfiguracion);
    expect(resultado.error).toMatch(mensaje);
  });
});

describe('formularioDesdeParametros', () => {
  it('muestra lo guardado y deja vacío lo que no está definido', () => {
    expect(
      formularioDesdeParametros({
        proveedorLlm: 'fake',
        modelo: null,
        umbral: 0.7,
        maxCandidatos: null,
        crossrefMailto: 'a@b.ec',
      }),
    ).toEqual({
      proveedorLlm: 'fake',
      modelo: '',
      umbral: '0.7',
      maxCandidatos: '',
      crossrefMailto: 'a@b.ec',
    });
  });
});

describe('validarClave', () => {
  it('acepta una clave sin espacios alrededor y rechaza una vacía o demasiado larga', () => {
    expect(validarClave('  abc123  ')).toEqual({ valor: 'abc123' });
    expect(validarClave('   ').error).toMatch(/clave/i);
    expect(validarClave('x'.repeat(1001)).error).toMatch(/1000/);
  });
});
