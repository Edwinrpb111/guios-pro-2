import { Route, Routes } from 'react-router';
import { AdminNuevoRecalculoPage } from '../pages/AdminNuevoRecalculoPage';
import { AdminRecalculoPage } from '../pages/AdminRecalculoPage';
import { NoEncontradaPage } from '../pages/NoEncontradaPage';

/**
 * Rutas de P-09 bajo `/admin/sugerida/*` (BRIEF §12.1). P-08 es `/admin/sugerida` y P-10 es
 * un panel sobre P-08 (`?detalle=<id>`). La guarda de administrador (`RutaAdmin`) va en App.
 */
export function RutasSugerida() {
  return (
    <Routes>
      <Route path="nuevo" element={<AdminNuevoRecalculoPage />} />
      <Route path=":id" element={<AdminRecalculoPage />} />
      <Route path="*" element={<NoEncontradaPage />} />
    </Routes>
  );
}
