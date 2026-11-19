/**
 * La API del administrador llega a las pantallas por contexto, así las pruebas usan una falsa.
 * La real se carga de forma diferida: el cliente de Supabase solo se crea cuando un
 * administrador entra a estas pantallas.
 */
import { createContext, useContext } from 'react';
import type { ApiAdmin } from './tipos';

export function apiDiferida(cargar: () => Promise<ApiAdmin>): ApiAdmin {
  let promesa: Promise<ApiAdmin> | null = null;
  const api = () => (promesa ??= cargar());
  return {
    listarCalculos: () => api().then((a) => a.listarCalculos()),
    obtenerCalculo: (id) => api().then((a) => a.obtenerCalculo(id)),
    filasSugeridas: (id) => api().then((a) => a.filasSugeridas(id)),
    catalogo: () => api().then((a) => a.catalogo()),
    referencias: (id) => api().then((a) => a.referencias(id)),
    iniciarRecalculo: (entrada) => api().then((a) => a.iniciarRecalculo(entrada)),
    pasoRecalculo: (id) => api().then((a) => a.pasoRecalculo(id)),
    registroPasos: (id) => api().then((a) => a.registroPasos(id)),
    pausar: (id) => api().then((a) => a.pausar(id)),
    conteoCitas: (id) => api().then((a) => a.conteoCitas(id)),
    guardarResultado: (id, filas) => api().then((a) => a.guardarResultado(id, filas)),
    publicar: (id) => api().then((a) => a.publicar(id)),
    descartar: (id) => api().then((a) => a.descartar(id)),
    obtenerConfiguracion: () => api().then((a) => a.obtenerConfiguracion()),
    guardarParametros: (parametros) => api().then((a) => a.guardarParametros(parametros)),
    guardarClave: (nombre, valor) => api().then((a) => a.guardarClave(nombre, valor)),
    borrarClave: (nombre) => api().then((a) => a.borrarClave(nombre)),
  };
}

// El import dinámico no busca separar el bundle (Vite avisa que `lib/supabase` ya está en el
// principal): evita que montar estas pantallas en pruebas exija las variables VITE_SUPABASE_*.
const apiSupabase = apiDiferida(async () => {
  const [{ supabase }, { crearApiAdmin }] = await Promise.all([
    import('../lib/supabase'),
    import('./apiSupabase'),
  ]);
  return crearApiAdmin(supabase);
});

export const ContextoApiAdmin = createContext<ApiAdmin>(apiSupabase);

export function useApiAdmin(): ApiAdmin {
  return useContext(ContextoApiAdmin);
}
