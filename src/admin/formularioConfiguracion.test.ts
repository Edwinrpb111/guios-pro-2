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
  llamadasPorMinuto: '',
  llamadasSimultaneas: '',
  desactivarRazonamiento: false,
  crossrefMailto: '',
  openaiBaseUrl: '',
  openaiModelo: '',
};

describe('validarConfiguracion (issue #33)', () => {
  it('un formulario vacío deja todo en null: las Edge Functions usan los secretos de entorno', () => {
    expect(validarConfiguracion(VACIO)).toEqual({
      parametros: {
        proveedorLlm: null,
        modelo: null,
        umbral: null,
        maxCandidatos: null,
        llamadasPorMinuto: null,
        llamadasSimultaneas: null,
        desactivarRazonamiento: null,
        crossrefMailto: null,
        openaiBaseUrl: null,
        openaiModelo: null,
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
        llamadasPorMinuto: ' 30 ',
        llamadasSimultaneas: ' 4 ',
        desactivarRazonamiento: true,
        crossrefMailto: ' equipo@unemi.edu.ec ',
        openaiBaseUrl: '',
        openaiModelo: '',
      }),
    ).toEqual({
      parametros: {
        proveedorLlm: 'gemini',
        modelo: 'gemini-3.1-flash-lite',
        umbral: 0.75,
        maxCandidatos: 15,
        llamadasPorMinuto: 30,
        llamadasSimultaneas: 4,
        desactivarRazonamiento: true,
        crossrefMailto: 'equipo@unemi.edu.ec',
        openaiBaseUrl: null,
        openaiModelo: null,
      },
    });
    expect(validarConfiguracion({ ...VACIO, llamadasPorMinuto: '1' })).toMatchObject({
      parametros: { llamadasPorMinuto: 1 },
    });
    expect(validarConfiguracion({ ...VACIO, llamadasPorMinuto: '1000' })).toMatchObject({
      parametros: { llamadasPorMinuto: 1000 },
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
    [{ llamadasPorMinuto: '0' }, /llamadas por minuto/i],
    [{ llamadasPorMinuto: '1001' }, /llamadas por minuto/i],
    [{ llamadasPorMinuto: '2.5' }, /llamadas por minuto/i],
    [{ llamadasPorMinuto: '-3' }, /llamadas por minuto/i],
    [{ llamadasPorMinuto: 'muchas' }, /llamadas por minuto/i],
    [{ llamadasSimultaneas: '0' }, /llamadas simultáneas/i],
    [{ llamadasSimultaneas: '11' }, /llamadas simultáneas/i],
    [{ llamadasSimultaneas: '2.5' }, /llamadas simultáneas/i],
    [{ llamadasSimultaneas: '-1' }, /llamadas simultáneas/i],
    [{ llamadasSimultaneas: 'todas' }, /llamadas simultáneas/i],
    [{ crossrefMailto: 'sin-arroba' }, /correo/i],
    [{ modelo: 'x'.repeat(101) }, /modelo/i],
    [{ modelo: '../otro:generateContent' }, /modelo/i],
    [{ modelo: 'modelo con espacios' }, /modelo/i],
    [{ proveedorLlm: 'otro' }, /proveedor/i],
    [{ proveedorLlm: 'OpenAI' }, /proveedor/i],
  ])('rechaza %o con un mensaje claro', (cambio, mensaje) => {
    const resultado = validarConfiguracion({ ...VACIO, ...cambio } as FormularioConfiguracion);
    expect(resultado.error).toMatch(mensaje);
  });
});

describe('validarConfiguracion: llamadas simultáneas y razonamiento (issue #45)', () => {
  it.each([
    ['1', 1],
    ['5', 5],
    [' 10 ', 10],
  ])('las llamadas simultáneas «%s» se guardan como %i', (texto, esperado) => {
    expect(validarConfiguracion({ ...VACIO, llamadasSimultaneas: texto })).toMatchObject({
      parametros: { llamadasSimultaneas: esperado },
    });
  });

  it('vacío significa «usar el valor por defecto»: null', () => {
    expect(validarConfiguracion({ ...VACIO, llamadasSimultaneas: '  ' })).toMatchObject({
      parametros: { llamadasSimultaneas: null },
    });
  });

  it('el mensaje de rechazo dice el rango de 1 a 10', () => {
    expect(validarConfiguracion({ ...VACIO, llamadasSimultaneas: '11' }).error).toMatch(
      /entero entre 1 y 10/,
    );
  });

  it('marcado guarda true; sin marcar deja null (se usa el secreto o el valor por defecto)', () => {
    expect(validarConfiguracion({ ...VACIO, desactivarRazonamiento: true })).toMatchObject({
      parametros: { desactivarRazonamiento: true },
    });
    expect(validarConfiguracion({ ...VACIO, desactivarRazonamiento: false })).toMatchObject({
      parametros: { desactivarRazonamiento: null },
    });
  });
});

describe('validarConfiguracion: proveedor compatible con OpenAI (issue #40)', () => {
  it('acepta el proveedor «openai» con dirección base y modelo, y normaliza la dirección', () => {
    expect(
      validarConfiguracion({
        ...VACIO,
        proveedorLlm: 'openai',
        openaiBaseUrl: '  https://openrouter.ai/api/v1/  ',
        openaiModelo: ' meta-llama/llama-3.3-70b-instruct:free ',
      }),
    ).toEqual({
      parametros: {
        proveedorLlm: 'openai',
        modelo: null,
        umbral: null,
        maxCandidatos: null,
        llamadasPorMinuto: null,
        llamadasSimultaneas: null,
        desactivarRazonamiento: null,
        crossrefMailto: null,
        openaiBaseUrl: 'https://openrouter.ai/api/v1',
        openaiModelo: 'meta-llama/llama-3.3-70b-instruct:free',
      },
    });
  });

  it.each([
    ['https://api.groq.com/openai/v1/', 'https://api.groq.com/openai/v1'],
    ['https://api.deepseek.com', 'https://api.deepseek.com'],
    ['https://api.mistral.ai/v1//', 'https://api.mistral.ai/v1'],
    ['https://servidor.ejemplo.org:8443/v1', 'https://servidor.ejemplo.org:8443/v1'],
  ])('la dirección %s se guarda como %s', (texto, esperada) => {
    expect(validarConfiguracion({ ...VACIO, openaiBaseUrl: texto })).toMatchObject({
      parametros: { openaiBaseUrl: esperada },
    });
  });

  it.each([
    ['http://api.groq.com/openai/v1', /https/i],
    ['ftp://api.groq.com/v1', /https/i],
    ['api.groq.com/openai/v1', /https/i],
    ['https://jose:secreto123@api.groq.com/v1', /usuario|clave|credenciales/i],
    ['https://secreto123@api.groq.com/v1', /usuario|clave|credenciales/i],
    ['https://api.groq.com/v1?api_key=abc', /parámetros|consulta/i],
    ['https://api.groq.com/v1?', /parámetros|consulta/i],
    ['https://api.groq.com/v1#parte', /fragmento|#/i],
    ['https://api.groq.com/v1 con espacios', /dirección base/i],
    ['https://', /dirección base/i],
    ['https:///v1', /dirección base/i],
    ['https://api.groq.com\\v1', /dirección base/i],
    [`https://ejemplo.com/${'a'.repeat(200)}`, /200/],
  ])('rechaza la dirección base %s', (direccion, mensaje) => {
    const resultado = validarConfiguracion({ ...VACIO, openaiBaseUrl: direccion });
    expect(resultado.error).toMatch(mensaje);
    // El mensaje nunca repite la dirección escrita: podría llevar una clave.
    expect(resultado.error).not.toContain('secreto123');
  });

  it('el modelo admite «/», «:» y «@» y llega a 150 caracteres', () => {
    for (const modelo of [
      'gpt-4o-mini',
      'meta-llama/llama-3.3-70b-instruct:free',
      '@cf/meta/llama-3.1-8b-instruct',
      'x'.repeat(150),
    ]) {
      expect(validarConfiguracion({ ...VACIO, openaiModelo: modelo })).toMatchObject({
        parametros: { openaiModelo: modelo },
      });
    }
    // El del proveedor Gemini no cambia: sigue sin admitir «/» (va en la URL de Gemini).
    expect(validarConfiguracion({ ...VACIO, modelo: 'a/b' }).error).toMatch(/modelo/i);
  });

  it.each(['con espacios', 'comilla"', 'x'.repeat(151), 'ñandú'])(
    'rechaza el modelo %s',
    (modelo) => {
      expect(validarConfiguracion({ ...VACIO, openaiModelo: modelo }).error).toMatch(/modelo/i);
    },
  );
});

describe('formularioDesdeParametros', () => {
  it('muestra lo guardado y deja vacío lo que no está definido', () => {
    expect(
      formularioDesdeParametros({
        proveedorLlm: 'fake',
        modelo: null,
        umbral: 0.7,
        maxCandidatos: null,
        llamadasPorMinuto: 15,
        llamadasSimultaneas: 3,
        desactivarRazonamiento: true,
        crossrefMailto: 'a@b.ec',
        openaiBaseUrl: 'https://api.groq.com/openai/v1',
        openaiModelo: null,
      }),
    ).toEqual({
      proveedorLlm: 'fake',
      modelo: '',
      umbral: '0.7',
      maxCandidatos: '',
      llamadasPorMinuto: '15',
      llamadasSimultaneas: '3',
      desactivarRazonamiento: true,
      crossrefMailto: 'a@b.ec',
      openaiBaseUrl: 'https://api.groq.com/openai/v1',
      openaiModelo: '',
    });
  });
});

describe('formularioDesdeParametros: valores sin definir (issue #45)', () => {
  it('llamadas simultáneas vacías y razonamiento sin marcar si están en null o en false', () => {
    const base = {
      proveedorLlm: null,
      modelo: null,
      umbral: null,
      maxCandidatos: null,
      llamadasPorMinuto: null,
      llamadasSimultaneas: null,
      desactivarRazonamiento: null,
      crossrefMailto: null,
      openaiBaseUrl: null,
      openaiModelo: null,
    } as const;
    expect(formularioDesdeParametros(base)).toMatchObject({
      llamadasSimultaneas: '',
      desactivarRazonamiento: false,
    });
    expect(formularioDesdeParametros({ ...base, desactivarRazonamiento: false })).toMatchObject({
      desactivarRazonamiento: false,
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
