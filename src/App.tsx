import { Route, Routes } from 'react-router';
import { InicioPage } from './pages/InicioPage';
import { NoEncontradaPage } from './pages/NoEncontradaPage';

/**
 * Rutas de la aplicación (BRIEF §12.1). Se irán agregando P-01..P-11
 * en sus issues correspondientes.
 */
export function App() {
  return (
    <Routes>
      <Route path="/" element={<InicioPage />} />
      <Route path="*" element={<NoEncontradaPage />} />
    </Routes>
  );
}
