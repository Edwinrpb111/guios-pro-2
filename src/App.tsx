import { Route, Routes } from 'react-router';
import { RutasSugerida } from './admin/rutas';
import { RutaAdmin } from './auth/RutaAdmin';
import { RutaProtegida } from './auth/RutaProtegida';
import { AdminConfiguracionPage } from './pages/AdminConfiguracionPage';
import { AdminSugeridaPage } from './pages/AdminSugeridaPage';
import { ContextoPage } from './pages/ContextoPage';
import { FactoresPage } from './pages/FactoresPage';
import { InformePage } from './pages/InformePage';
import { InicioPage } from './pages/InicioPage';
import { LoginPage } from './pages/LoginPage';
import { MarcoDeRuta } from './pages/MarcoDecisor';
import { NoEncontradaPage } from './pages/NoEncontradaPage';
import { ResultadosPage } from './pages/ResultadosPage';
import { SubfactoresPage } from './pages/SubfactoresPage';

/**
 * Rutas de la aplicación (BRIEF §12.1). Se irán agregando P-02..P-11
 * en sus issues correspondientes. Todo exige sesión salvo /login, y
 * /admin/* exige además el rol administrador. P-08..P-10 se dibujan dentro del mismo marco
 * (barra lateral y cabecera) que Inicio y la evaluación; solo cambia el contenido.
 */
export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RutaProtegida />}>
        <Route path="/" element={<InicioPage />} />
        <Route path="/evaluaciones/:id/contexto" element={<ContextoPage />} />
        <Route path="/evaluaciones/:id/factores" element={<FactoresPage />} />
        <Route path="/evaluaciones/:id/subfactores" element={<SubfactoresPage />} />
        <Route path="/evaluaciones/:id/resultados" element={<ResultadosPage />} />
        <Route path="/evaluaciones/:id/informe" element={<InformePage />} />
        <Route path="/admin" element={<RutaAdmin />}>
          <Route element={<MarcoDeRuta />}>
            <Route path="sugerida" element={<AdminSugeridaPage />} />
            <Route path="sugerida/*" element={<RutasSugerida />} />
            <Route path="configuracion" element={<AdminConfiguracionPage />} />
          </Route>
        </Route>
        <Route path="*" element={<NoEncontradaPage />} />
      </Route>
    </Routes>
  );
}
