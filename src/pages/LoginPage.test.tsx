import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { crearAuth, crearAuthConSesion, renderConAuth } from '../test/auth';
import { LoginPage } from './LoginPage';

function Rutas() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<p>Pantalla de inicio</p>} />
      <Route path="/admin/sugerida" element={<p>Pantalla admin</p>} />
    </Routes>
  );
}

describe('LoginPage', () => {
  it('muestra el formulario de inicio de sesión con etiquetas accesibles', () => {
    renderConAuth(<Rutas />, { ruta: '/login' });
    expect(screen.getByRole('heading', { name: 'GUIOS PRO 2.0' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Iniciar sesión', selected: true })).toBeInTheDocument();
    expect(screen.getByLabelText('Correo electrónico')).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nombre completo')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });

  it('envía correo y contraseña a iniciarSesion', async () => {
    const { auth } = renderConAuth(<Rutas />, { ruta: '/login' });
    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'clave1234');
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(auth.iniciarSesion).toHaveBeenCalledWith('ana@example.com', 'clave1234');
  });

  it('muestra el error en español cuando las credenciales son inválidas', async () => {
    const auth = crearAuth({
      iniciarSesion: vi.fn().mockResolvedValue({ error: 'Correo o contraseña incorrectos.' }),
    });
    renderConAuth(<Rutas />, { auth, ruta: '/login' });
    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'mala');
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos.');
  });

  it('deshabilita el envío mientras la petición está en curso', async () => {
    let resolver: (valor: { error: null }) => void = () => undefined;
    const auth = crearAuth({
      iniciarSesion: vi.fn().mockReturnValue(new Promise((r) => (resolver = r))),
    });
    renderConAuth(<Rutas />, { auth, ruta: '/login' });
    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'clave1234');
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(await screen.findByRole('button', { name: 'Ingresando…' })).toBeDisabled();
    resolver({ error: null });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeEnabled(),
    );
  });

  it('la pestaña de registro pide nombre completo y envía los tres datos a registrar', async () => {
    const { auth } = renderConAuth(<Rutas />, { ruta: '/login' });
    await userEvent.click(screen.getByRole('tab', { name: 'Crear cuenta' }));
    await userEvent.type(screen.getByLabelText('Nombre completo'), 'Ana Pérez');
    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'clave1234');
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(auth.registrar).toHaveBeenCalledWith('Ana Pérez', 'ana@example.com', 'clave1234');
  });

  it('en el registro exige una contraseña de al menos 8 caracteres', async () => {
    const { auth } = renderConAuth(<Rutas />, { ruta: '/login' });
    await userEvent.click(screen.getByRole('tab', { name: 'Crear cuenta' }));
    await userEvent.type(screen.getByLabelText('Nombre completo'), 'Ana Pérez');
    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'corta');
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(auth.registrar).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La contraseña debe tener al menos 8 caracteres.',
    );
  });

  it('muestra el error de registro y el aviso de confirmación de correo', async () => {
    const registrar = vi
      .fn()
      .mockResolvedValueOnce({
        error: 'Ya existe una cuenta con ese correo.',
        requiereConfirmacion: false,
      })
      .mockResolvedValueOnce({ error: null, requiereConfirmacion: true });
    renderConAuth(<Rutas />, { auth: crearAuth({ registrar }), ruta: '/login' });
    await userEvent.click(screen.getByRole('tab', { name: 'Crear cuenta' }));
    await userEvent.type(screen.getByLabelText('Nombre completo'), 'Ana');
    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'clave1234');
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ya existe una cuenta con ese correo.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Revisa tu correo');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('muestra la marca, el método y la institución en el panel de presentación', () => {
    renderConAuth(<Rutas />, { ruta: '/login' });
    expect(screen.getByRole('heading', { level: 1, name: 'GUIOS PRO 2.0' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Decide con evidencia si un software libre es adecuado para tu organización.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Pasos del método' })).toBeInTheDocument();
    expect(screen.getByText(/UNEMI/)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Ingresa a tu cuenta' }),
    ).toBeInTheDocument();
  });

  it('las pestañas controlan el panel del formulario y se recorren con el teclado', async () => {
    renderConAuth(<Rutas />, { ruta: '/login' });
    const ingresar = screen.getByRole('tab', { name: 'Iniciar sesión' });
    const registro = screen.getByRole('tab', { name: 'Crear cuenta' });
    expect(screen.getByRole('tabpanel', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(ingresar).toHaveAttribute('tabindex', '0');
    expect(registro).toHaveAttribute('tabindex', '-1');

    ingresar.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(registro).toHaveAttribute('aria-selected', 'true');
    expect(registro).toHaveFocus();
    expect(screen.getByLabelText('Nombre completo')).toBeInTheDocument();
    expect(screen.getByRole('tabpanel', { name: 'Crear cuenta' })).toBeInTheDocument();

    await userEvent.keyboard('{ArrowRight}');
    expect(ingresar).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(registro).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(ingresar).toHaveFocus();
    expect(ingresar).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowLeft}');
    expect(registro).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(registro).toHaveFocus();
    expect(registro).toHaveAttribute('aria-selected', 'true');
  });

  it('el registro indica el mínimo de la contraseña y la marca inválida si es corta', async () => {
    renderConAuth(<Rutas />, { ruta: '/login' });
    expect(screen.getByLabelText('Contraseña')).not.toHaveAccessibleDescription();
    await userEvent.click(screen.getByRole('tab', { name: 'Crear cuenta' }));
    const contrasena = screen.getByLabelText('Contraseña');
    expect(contrasena).toHaveAccessibleDescription('Mínimo 8 caracteres.');
    expect(contrasena).not.toHaveAttribute('aria-invalid', 'true');
    await userEvent.type(screen.getByLabelText('Nombre completo'), 'Ana');
    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com');
    await userEvent.type(contrasena, 'corta');
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(contrasena).toHaveAttribute('aria-invalid', 'true');
    expect(contrasena).toHaveAccessibleDescription(
      'Mínimo 8 caracteres. La contraseña debe tener al menos 8 caracteres.',
    );
  });

  it('el registro aclara que las cuentas nuevas tienen rol de decisor', async () => {
    renderConAuth(<Rutas />, { ruta: '/login' });
    expect(screen.queryByText(/rol de decisor/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Crear cuenta' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Crea tu cuenta' })).toBeInTheDocument();
    expect(screen.getByText(/Las cuentas nuevas tienen rol de decisor/)).toBeInTheDocument();
  });

  it('mientras envía marca el formulario como ocupado', async () => {
    let resolver: (valor: { error: null }) => void = () => undefined;
    const auth = crearAuth({
      iniciarSesion: vi.fn().mockReturnValue(new Promise((r) => (resolver = r))),
    });
    renderConAuth(<Rutas />, { auth, ruta: '/login' });
    const formulario = screen.getByRole('form', { name: 'Iniciar sesión' });
    expect(formulario).toHaveAttribute('aria-busy', 'false');
    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'clave1234');
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(formulario).toHaveAttribute('aria-busy', 'true');
    resolver({ error: null });
    await waitFor(() => expect(formulario).toHaveAttribute('aria-busy', 'false'));
  });

  it('con sesión activa redirige a /', () => {
    renderConAuth(<Rutas />, { auth: crearAuthConSesion('decisor'), ruta: '/login' });
    expect(screen.getByText('Pantalla de inicio')).toBeInTheDocument();
  });

  it('con sesión activa vuelve a la ruta originalmente pedida', () => {
    renderConAuth(<Rutas />, {
      auth: crearAuthConSesion('administrador'),
      ruta: { pathname: '/login', state: { desde: '/admin/sugerida' } },
    });
    expect(screen.getByText('Pantalla admin')).toBeInTheDocument();
  });

  it('mientras carga la sesión no muestra el formulario', () => {
    renderConAuth(<Rutas />, { auth: crearAuth({ cargando: true }), ruta: '/login' });
    expect(screen.queryByLabelText('Correo electrónico')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
