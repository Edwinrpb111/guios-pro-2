import { apiDiferida } from './contexto';
import { crearApiFalsa } from './pruebas';

describe('apiDiferida', () => {
  it('carga la API real una sola vez y solo al usarla', async () => {
    const real = crearApiFalsa();
    const cargar = vi.fn().mockResolvedValue(real);
    const api = apiDiferida(cargar);
    expect(cargar).not.toHaveBeenCalled();

    await api.listarCalculos();
    await api.publicar(3);
    await api.guardarResultado(3, []);

    expect(cargar).toHaveBeenCalledTimes(1);
    expect(real.publicar).toHaveBeenCalledWith(3);
    expect(real.guardarResultado).toHaveBeenCalledWith(3, []);
  });

  it('delega todas las operaciones de ApiAdmin', async () => {
    const real = crearApiFalsa();
    const api = apiDiferida(() => Promise.resolve(real));
    for (const nombre of Object.keys(real) as (keyof typeof real)[]) {
      await (api[nombre] as (...a: unknown[]) => Promise<unknown>)(1, 2);
      expect(real[nombre]).toHaveBeenCalled();
    }
  });

  it('si la carga falla, el error llega a quien llama', async () => {
    const api = apiDiferida(() => Promise.reject(new Error('Falta configurar Supabase')));
    await expect(api.listarCalculos()).rejects.toThrow('Falta configurar Supabase');
  });
});
