import { iniciales, nombreDeUsuario, primerNombre } from './usuario';

describe('nombreDeUsuario', () => {
  it('usa el nombre completo registrado', () => {
    expect(
      nombreDeUsuario({
        email: 'ana@example.com',
        user_metadata: { nombre_completo: ' Ana Pérez ' },
      }),
    ).toBe('Ana Pérez');
  });

  it('sin nombre usa la parte local del correo', () => {
    expect(nombreDeUsuario({ email: 'ana@example.com', user_metadata: {} })).toBe('ana');
    expect(
      nombreDeUsuario({ email: 'ana@example.com', user_metadata: { nombre_completo: '  ' } }),
    ).toBe('ana');
  });

  it('sin usuario devuelve «Usuario»', () => {
    expect(nombreDeUsuario(null)).toBe('Usuario');
  });

  it('sin nombre y con el correo vacío o sin parte local devuelve «Usuario»', () => {
    expect(nombreDeUsuario({ email: '', user_metadata: {} })).toBe('Usuario');
    expect(nombreDeUsuario({ email: '@example.com', user_metadata: {} })).toBe('Usuario');
    expect(nombreDeUsuario({ user_metadata: {} })).toBe('Usuario');
  });
});

describe('primerNombre e iniciales', () => {
  it('toman la primera palabra y hasta dos iniciales', () => {
    expect(primerNombre('Laddy Rocha')).toBe('Laddy');
    expect(iniciales('laddy rocha')).toBe('LR');
    expect(iniciales('Edwin Pastor Bravo')).toBe('EP');
    expect(iniciales('ana')).toBe('A');
    expect(iniciales('   ')).toBe('?');
  });

  it('primerNombre ignora los espacios de los extremos', () => {
    expect(primerNombre('  Laddy Rocha ')).toBe('Laddy');
    expect(primerNombre('Ana')).toBe('Ana');
  });
});
