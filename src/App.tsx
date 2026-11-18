import { Route, Routes } from 'react-router';
import { RutasSugerida } from './admin/rutas';
import { RutaAdmin } from './auth/RutaAdmin';
import { RutaProtegida } from './auth/RutaProtegida';
import { AdminSugeridaPage } from './pages/AdminSugeridaPage';
import { ContextoPage } from './pages/ContextoPage';
import { FactoresPage } from './pages/FactoresPage';
import { InicioPage } from './pages/InicioPage';
import { LoginPage } from './pages/LoginPage';
import { NoEncontradaPage } from './pages/NoEncontradaPage';

/**
 * Rutas de la aplicación (BRIEF §12.1). Se irán agregando P-02..P-11
 * en sus issues correspondientes. Todo exige sesión salvo /login, y
 * /admin/* exige además el rol administrador.
 */
export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RutaProtegida />}>
        <Route path="/" element={<InicioPage />} />
        <Route path="/evaluaciones/:id/contexto" element={<ContextoPage />} />
        <Route path="/evaluaciones/:id/factores" element={<FactoresPage />} />
        <Route path="/admin" element={<RutaAdmin />}>
          <Route path="sugerida" element={<AdminSugeridaPage />} />
          <Route path="sugerida/*" element={<RutasSugerida />} />
        </Route>
        <Route path="*" element={<NoEncontradaPage />} />
      </Route>
    </Routes>
  );
}
