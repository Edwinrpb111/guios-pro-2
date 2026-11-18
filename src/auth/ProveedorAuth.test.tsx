import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ProveedorAuth } from './ProveedorAuth';
import { RutaAdmin } from './RutaAdmin';
import { RutaProtegida } from './RutaProtegida';
import { useAuth } from './useAuth';

type Escucha = (evento: string, sesion: unknown) => void;

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  from: vi.fn(),
  maybeSingle: vi.fn(),
  cancelar: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
      signInWithPassword: mocks.signInWithPassword,
      signUp: mocks.signUp,
      signOut: mocks.signOut,
    },
    from: mocks.from,
  },
}));

const sesionAna = { user: { id: 'u-1', email: 'ana@example.com' } };
let escucha: Escucha = () => undefined;

function Sonda() {
  const auth = useAuth();
  return (
    <div>
      <p>cargando: {String(auth.cargando)}</p>
      <p>correo: {auth.usuario?.email ?? 'ninguno'}</p>
      <p>rol: {auth.rol ?? 'ninguno'}</p>
      <button onClick={() => void auth.cerrarSesion()}>salir</button>
    </div>
  );
}

/** Expone el resultado de una acción de auth para poder comprobarlo. */
function Captura({ accion }: { accion: (auth: ReturnType<typeof useAuth>) => Promise<unknown> }) {
  const auth = useAuth();
  return (
    <button
      onClick={() => {
        void accion(auth).then((r) => {
          resultado = r;
        });
      }}
    >
      probar
    </button>
  );
}

let resultado: unknown;

function montar(hijo: React.ReactNode = <Sonda />) {
  return render(<ProveedorAuth>{hijo}</ProveedorAuth>);
}

async function esperarCarga() {
  await waitFor(() => expect(screen.getByText('cargando: false')).toBeInTheDocument());
}

beforeEach(() => {
  vi.resetAllMocks();
  resultado = undefined;
  mocks.getSession.mockResolvedValue({ data: { session: null } });
  mocks.onAuthStateChange.mockImplementation((cb: Escucha) => {
    escucha = cb;
    return { data: { subscription: { unsubscribe: mocks.cancelar } } };
  });
  mocks.maybeSingle.mockResolvedValue({ data: { rol: 'decisor' }, error: null });
  mocks.from.mockReturnValue({
    select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }),
  });
  mocks.signOut.mockResolvedValue({ error: null });
});

describe('ProveedorAuth', () => {
  it('empieza cargando y termina sin sesión', async () => {
    montar();
    expect(screen.getByText('cargando: true')).toBeInTheDocument();
    await esperarCarga();
    expect(screen.getByText('correo: ninguno')).toBeInTheDocument();
    expect(screen.getByText('rol: ninguno')).toBeInTheDocument();
  });

  it('con sesión existente carga el rol desde perfil y no deja de cargar antes de tenerlo', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: sesionAna } });
    mocks.maybeSingle.mockResolvedValue({ data: { rol: 'administrador' }, error: null });
    montar();
    await esperarCarga();
    expect(screen.getByText('rol: administrador')).toBeInTheDocument();
    expect(screen.getByText('correo: ana@example.com')).toBeInTheDocument();
    expect(mocks.from).toHaveBeenCalledWith('perfil');
  });

  it('si el perfil no se puede leer deja el rol en ninguno', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: sesionAna } });
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: 'fallo' } });
    montar();
    await esperarCarga();
    expect(screen.getByText('rol: ninguno')).toBeInTheDocument();
  });

  it('ignora un rol desconocido', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: sesionAna } });
    mocks.maybeSingle.mockResolvedValue({ data: { rol: 'superusuario' }, error: null });
    montar();
    await esperarCarga();
    expect(screen.getByText('rol: ninguno')).toBeInTheDocument();
  });

  it('reacciona a onAuthStateChange (inicio y cierre de sesión)', async () => {
    montar();
    await esperarCarga();
    act(() => escucha('SIGNED_IN', sesionAna));
    await waitFor(() => expect(screen.getByText('rol: decisor')).toBeInTheDocument());
    act(() => escucha('SIGNED_OUT', null));
    await waitFor(() => expect(screen.getByText('rol: ninguno')).toBeInTheDocument());
    expect(screen.getByText('correo: ninguno')).toBeInTheDocument();
  });

  it('se desuscribe al desmontar', async () => {
    const { unmount } = montar();
    await esperarCarga();
    unmount();
    expect(mocks.cancelar).toHaveBeenCalled();
  });

  it('iniciarSesion llama a signInWithPassword y traduce el error', async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: {},
      error: { code: 'invalid_credentials', message: 'Invalid login credentials' },
    });
    montar(<Captura accion={(a) => a.iniciarSesion('ana@example.com', 'mala')} />);
    await userEvent.click(screen.getByRole('button', { name: 'probar' }));
    await waitFor(() => expect(resultado).toEqual({ error: 'Correo o contraseña incorrectos.' }));
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: 'ana@example.com',
      password: 'mala',
    });
  });

  it('iniciarSesion correcto devuelve error null', async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: { session: sesionAna }, error: null });
    montar(<Captura accion={(a) => a.iniciarSesion('ana@example.com', 'clave1234')} />);
    await userEvent.click(screen.getByRole('button', { name: 'probar' }));
    await waitFor(() => expect(resultado).toEqual({ error: null }));
  });

  it('registrar envía nombre_completo y avisa si requiere confirmar el correo', async () => {
    mocks.signUp.mockResolvedValue({ data: { session: null, user: { id: 'u-2' } }, error: null });
    montar(<Captura accion={(a) => a.registrar('Ana Pérez', 'ana@example.com', 'clave1234')} />);
    await userEvent.click(screen.getByRole('button', { name: 'probar' }));
    await waitFor(() => expect(resultado).toEqual({ error: null, requiereConfirmacion: true }));
    expect(mocks.signUp).toHaveBeenCalledWith({
      email: 'ana@example.com',
      password: 'clave1234',
      options: { data: { nombre_completo: 'Ana Pérez' } },
    });
  });

  it('registrar con sesión inmediata no requiere confirmación', async () => {
    mocks.signUp.mockResolvedValue({
      data: { session: sesionAna, user: sesionAna.user },
      error: null,
    });
    montar(<Captura accion={(a) => a.registrar('Ana', 'ana@example.com', 'clave1234')} />);
    await userEvent.click(screen.getByRole('button', { name: 'probar' }));
    await waitFor(() => expect(resultado).toEqual({ error: null, requiereConfirmacion: false }));
  });

  it('registrar traduce el error de cuenta existente', async () => {
    mocks.signUp.mockResolvedValue({
      data: {},
      error: { code: 'user_already_exists', message: 'User already registered' },
    });
    montar(<Captura accion={(a) => a.registrar('Ana', 'ana@example.com', 'clave1234')} />);
    await userEvent.click(screen.getByRole('button', { name: 'probar' }));
    await waitFor(() =>
      expect(resultado).toEqual({
        error: 'Ya existe una cuenta con ese correo.',
        requiereConfirmacion: false,
      }),
    );
  });

  it('cerrarSesion llama a signOut de Supabase', async () => {
    montar();
    await userEvent.click(screen.getByRole('button', { name: 'salir' }));
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });
});

describe('ProveedorAuth: estado del rol entre sesiones', () => {
  it('si la lectura de perfil se rechaza termina de cargar con rol ninguno', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: sesionAna } });
    mocks.maybeSingle.mockRejectedValue(new Error('red caída'));
    montar();
    await esperarCarga();
    expect(screen.getByText('rol: ninguno')).toBeInTheDocument();
  });

  it('al volver a entrar no usa el rol de la sesión anterior mientras lo vuelve a leer', async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: { rol: 'administrador' }, error: null });
    montar();
    await esperarCarga();
    act(() => escucha('SIGNED_IN', sesionAna));
    await waitFor(() => expect(screen.getByText('rol: administrador')).toBeInTheDocument());
    act(() => escucha('SIGNED_OUT', null));
    await waitFor(() => expect(screen.getByText('rol: ninguno')).toBeInTheDocument());

    let resolver: (v: unknown) => void = () => undefined;
    mocks.maybeSingle.mockReturnValueOnce(new Promise((r) => (resolver = r)));
    act(() => escucha('SIGNED_IN', sesionAna));
    expect(screen.getByText('cargando: true')).toBeInTheDocument();
    expect(screen.getByText('rol: ninguno')).toBeInTheDocument();
    await act(async () => resolver({ data: { rol: 'decisor' }, error: null }));
    await esperarCarga();
    expect(screen.getByText('rol: decisor')).toBeInTheDocument();
  });
});

describe('ProveedorAuth junto con las guardas', () => {
  function RutasReales() {
    return (
      <MemoryRouter initialEntries={['/admin/sugerida']}>
        <Routes>
          <Route path="/login" element={<p>Pantalla de ingreso</p>} />
          <Route element={<RutaProtegida />}>
            <Route path="/" element={<p>Contenido protegido</p>} />
            <Route element={<RutaAdmin />}>
              <Route path="/admin/sugerida" element={<p>Contenido de administración</p>} />
            </Route>
          </Route>
        </Routes>
      </MemoryRouter>
    );
  }

  it('un administrador ve admin y al cerrar sesión va a /login', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: sesionAna } });
    mocks.maybeSingle.mockResolvedValue({ data: { rol: 'administrador' }, error: null });
    render(
      <ProveedorAuth>
        <RutasReales />
      </ProveedorAuth>,
    );
    expect(await screen.findByText('Contenido de administración')).toBeInTheDocument();
    act(() => escucha('SIGNED_OUT', null));
    expect(await screen.findByText('Pantalla de ingreso')).toBeInTheDocument();
    expect(screen.queryByText('Contenido de administración')).not.toBeInTheDocument();
  });

  it('un decisor que entra a /admin/sugerida termina en /', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: sesionAna } });
    render(
      <ProveedorAuth>
        <RutasReales />
      </ProveedorAuth>,
    );
    expect(await screen.findByText('Contenido protegido')).toBeInTheDocument();
    expect(screen.queryByText('Contenido de administración')).not.toBeInTheDocument();
  });
});

describe('useAuth', () => {
  it('falla con un mensaje claro fuera del proveedor', () => {
    const silenciar = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Sonda />)).toThrow('useAuth debe usarse dentro de <ProveedorAuth>');
    silenciar.mockRestore();
  });
});
