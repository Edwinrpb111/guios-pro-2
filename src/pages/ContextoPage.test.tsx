import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router';
import { repositorio } from '../datos';
import type { EvaluacionDetalle } from '../datos/tipos';
import { RETARDO_AUTOGUARDADO } from '../evaluacion/useContexto';
import { crearAuthConSesion, renderConAuth } from '../test/auth';
import { evaluacionVaciaPrueba, restablecerRepositorioFalso } from '../test/datos';
import { ContextoPage } from './ContextoPage';

vi.mock('../datos', async () => ({
  repositorio: (await import('../test/datos')).crearRepositorioFalso(),
}));

function Ubicacion() {
  return <p data-testid="ubicacion">{useLocation().pathname}</p>;
}

function renderizar(ruta = '/evaluaciones/7/contexto') {
  return renderConAuth(
    <Routes>
      <Route path="/evaluaciones/:id/contexto" element={<ContextoPage />} />
      <Route path="*" element={<Ubicacion />} />
    </Routes>,
    { auth: crearAuthConSesion('decisor'), ruta },
  );
}

const evaluacionConContexto: EvaluacionDetalle = {
  ...evaluacionVaciaPrueba,
  contexto: {
    titulo: 'Plataforma de aprendizaje',
    software: { id: 3, nombre: 'Moodle', version: '4.4', licencia: 'GPL v3' },
    organizacion: {
      id: 5,
      nombre: 'Universidad Estatal de Milagro',
      sector: 'Educación',
      pais: 'Ecuador',
    },
  },
};

// Las secciones también se nombran «Software evaluado» y «Organización»: se busca solo el control.
const campo = (nombre: string) => screen.getByLabelText(nombre, { selector: 'input, select' });
const esperarAutoguardado = () => act(() => vi.advanceTimersByTimeAsync(RETARDO_AUTOGUARDADO + 50));

describe('ContextoPage (P-03)', () => {
  let usuario: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    restablecerRepositorioFalso(repositorio);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('muestra el contexto guardado, el cálculo asociado y el paso actual', async () => {
    vi.mocked(repositorio.leerEvaluacion).mockResolvedValue(evaluacionConContexto);
    renderizar();
    expect(
      await screen.findByRole('heading', { name: 'Plataforma de aprendizaje' }),
    ).toBeInTheDocument();
    expect(campo('Título de la evaluación')).toHaveValue('Plataforma de aprendizaje');
    expect(campo('Nombre del software')).toHaveValue('Moodle');
    expect(campo('Versión')).toHaveValue('4.4');
    expect(campo('Tipo de licencia')).toHaveValue('GPL v3');
    expect(campo('Organización')).toHaveValue('Universidad Estatal de Milagro');
    expect(campo('Sector')).toHaveValue('Educación');
    expect(campo('País')).toHaveValue('Ecuador');
    expect(screen.getByText('IS: Cálculo inicial de la tesis')).toBeInTheDocument();
    expect(screen.getByText(/Se usará la/)).toHaveTextContent('Cálculo inicial de la tesis');
    expect(screen.getByRole('button', { name: /Contexto/ })).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(repositorio.leerEvaluacion).toHaveBeenCalledWith(7);
    expect(repositorio.leerCalculo).toHaveBeenCalledWith(1);
  });

  it('una evaluación nueva se titula «Nueva evaluación» y no deja continuar sin software', async () => {
    renderizar();
    expect(await screen.findByRole('heading', { name: 'Nueva evaluación' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continuar a factores/ })).toBeDisabled();
    await usuario.type(campo('Nombre del software'), 'LibreOffice');
    expect(screen.getByRole('button', { name: /Continuar a factores/ })).toBeEnabled();
  });

  it('guarda el borrador automáticamente tras cada cambio', async () => {
    renderizar();
    await screen.findByRole('heading', { name: 'Nueva evaluación' });
    await usuario.type(campo('Nombre del software'), 'LibreOffice');
    await usuario.selectOptions(campo('Tipo de licencia'), 'MPL 2.0');
    await usuario.type(campo('Organización'), 'UNEMI');
    expect(repositorio.guardarContexto).not.toHaveBeenCalled();

    await esperarAutoguardado();
    expect(repositorio.guardarContexto).toHaveBeenCalledTimes(1);
    expect(repositorio.guardarContexto).toHaveBeenCalledWith(7, {
      titulo: '',
      software: { id: null, nombre: 'LibreOffice', version: '', licencia: 'MPL 2.0' },
      organizacion: { id: null, nombre: 'UNEMI', sector: '', pais: '' },
    });
    expect(await screen.findByText('Cambios guardados')).toBeInTheDocument();
  });

  it('reutiliza los ids devueltos al guardar otra vez (actualiza, no duplica)', async () => {
    vi.mocked(repositorio.guardarContexto).mockImplementation((_id, contexto) =>
      Promise.resolve({
        ...contexto,
        software: { ...contexto.software, id: 31 },
        organizacion: { ...contexto.organizacion, id: 52 },
      }),
    );
    renderizar();
    await screen.findByRole('heading', { name: 'Nueva evaluación' });
    await usuario.type(campo('Nombre del software'), 'Odoo');
    await esperarAutoguardado();
    await usuario.type(campo('Versión'), '17');
    await esperarAutoguardado();

    expect(repositorio.guardarContexto).toHaveBeenCalledTimes(2);
    expect(vi.mocked(repositorio.guardarContexto).mock.calls[1]?.[1]).toMatchObject({
      software: { id: 31, nombre: 'Odoo', version: '17' },
      organizacion: { id: 52 },
    });
  });

  it('«Guardar borrador» guarda al instante', async () => {
    renderizar();
    await screen.findByRole('heading', { name: 'Nueva evaluación' });
    await usuario.type(campo('Título de la evaluación'), 'Suite ofimática');
    await usuario.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    expect(repositorio.guardarContexto).toHaveBeenCalledTimes(1);
    expect(vi.mocked(repositorio.guardarContexto).mock.calls[0]?.[1].titulo).toBe(
      'Suite ofimática',
    );
    expect(await screen.findByText('Cambios guardados')).toBeInTheDocument();
  });

  it('«Continuar a factores» guarda y abre P-04', async () => {
    vi.mocked(repositorio.leerEvaluacion).mockResolvedValue(evaluacionConContexto);
    renderizar();
    await screen.findByRole('heading', { name: 'Plataforma de aprendizaje' });
    await usuario.type(campo('Versión'), '.1');
    await usuario.click(screen.getByRole('button', { name: /Continuar a factores/ }));
    expect(repositorio.guardarContexto).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId('ubicacion')).toHaveTextContent('/evaluaciones/7/factores');
  });

  it('si no se puede guardar avisa y no avanza', async () => {
    vi.mocked(repositorio.leerEvaluacion).mockResolvedValue(evaluacionConContexto);
    vi.mocked(repositorio.guardarContexto).mockRejectedValue(new Error('sin conexión'));
    renderizar();
    await screen.findByRole('heading', { name: 'Plataforma de aprendizaje' });
    await usuario.click(screen.getByRole('button', { name: /Continuar a factores/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar el borrador');
    expect(screen.queryByTestId('ubicacion')).not.toBeInTheDocument();
  });

  it('al salir de la pantalla guarda lo que quedaba pendiente', async () => {
    const { unmount } = renderizar();
    await screen.findByRole('heading', { name: 'Nueva evaluación' });
    await usuario.type(campo('Nombre del software'), 'GIMP');
    expect(repositorio.guardarContexto).not.toHaveBeenCalled();
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(repositorio.guardarContexto).toHaveBeenCalledTimes(1);
  });

  it('una evaluación finalizada no se puede editar', async () => {
    vi.mocked(repositorio.leerEvaluacion).mockResolvedValue({
      ...evaluacionConContexto,
      estado: 'finalizada',
    });
    renderizar();
    await screen.findByRole('heading', { name: 'Plataforma de aprendizaje' });
    expect(screen.getByText(/está finalizada y no se puede editar/)).toBeInTheDocument();
    expect(campo('Nombre del software')).toBeDisabled();
    expect(campo('Tipo de licencia')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Guardar borrador' })).not.toBeInTheDocument();
  });

  it('una evaluación que no existe (o es de otro usuario) lo dice', async () => {
    vi.mocked(repositorio.leerEvaluacion).mockResolvedValue(null);
    renderizar();
    expect(await screen.findByText('No se encontró la evaluación.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver al historial' })).toHaveAttribute('href', '/');
  });

  it('un id inválido en la ruta se trata como no encontrada', async () => {
    renderizar('/evaluaciones/abc/contexto');
    expect(await screen.findByText('No se encontró la evaluación.')).toBeInTheDocument();
    expect(repositorio.leerEvaluacion).not.toHaveBeenCalled();
  });

  it('si falla la carga permite reintentar', async () => {
    vi.mocked(repositorio.leerEvaluacion).mockRejectedValueOnce(new Error('sin red'));
    renderizar();
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar la evaluación');
    await usuario.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Nueva evaluación' })).toBeInTheDocument();
  });

  it('ofrece los sectores y licencias del prototipo y conserva un valor que no esté en la lista', async () => {
    vi.mocked(repositorio.leerEvaluacion).mockResolvedValue({
      ...evaluacionConContexto,
      contexto: {
        ...evaluacionConContexto.contexto,
        software: { id: 3, nombre: 'X', version: '', licencia: 'EUPL' },
      },
    });
    renderizar();
    await screen.findByRole('heading', { name: 'Plataforma de aprendizaje' });
    const licencias = within(campo('Tipo de licencia')).getAllByRole('option');
    expect(licencias.map((o) => o.textContent)).toContain('MPL 2.0');
    expect(campo('Tipo de licencia')).toHaveValue('EUPL');
    expect(
      within(campo('Sector'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toContain('Gobierno');
  });
});
