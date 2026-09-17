import { Routes, Route } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import ColaboradorLayout from './components/layout/ColaboradorLayout';
import ColaboradorIngredientes from './pages/ColaboradorIngredientes';
import ColaboradorCarta from './pages/ColaboradorCarta';
import ColaboradorSaborYAroma from './pages/ColaboradorSaborYAroma';
import SaborYAroma from './pages/SaborYAroma';
import Dashboard from './pages/Dashboard';
import Ingredientes from './pages/Ingredientes';
import Subrecetas from './pages/Subrecetas';
import Productos from './pages/Productos';
import Rentabilidades from './pages/Rentabilidades';
import Ofertas from './pages/Ofertas';
import Categorias from './pages/Categorias';
import Proveedores from './pages/Proveedores';
import Configuracion from './pages/Configuracion';
import Preparaciones from './pages/Preparaciones';
import Produccion from './pages/Produccion';
import ReportesProduccion from './pages/ReportesProduccion';
import Perdidas from './pages/Perdidas';
import PerdidasStandalone from './pages/PerdidasStandalone';
import EnviosSaboryAroma from './pages/EnviosSaboryAroma';
import EnviosCoffit from './pages/EnviosCoffit';
import ReportesEnvios from './pages/ReportesEnvios';
import PlanSemanal from './pages/PlanSemanal';
import PlanHoy from './pages/PlanHoy';
import Compras from './pages/Compras';
import ComprasStandalone from './pages/ComprasStandalone';
import Carta from './pages/Carta';

export default function App() {
  return (
    <Routes>
      {/* Standalone full-screen pages (no sidebar/header) */}
      <Route path="/produccion" element={<Produccion />} />
      <Route path="/registro-perdidas" element={<PerdidasStandalone />} />
      <Route path="/envios-saboryaroma" element={<EnviosSaboryAroma />} />
      <Route path="/envios-coffit" element={<EnviosCoffit />} />
      <Route path="/plan-hoy" element={<PlanHoy />} />
      <Route path="/registro-compras" element={<ComprasStandalone />} />

      {/* Area COLABORADOR: cada colaborador entra por su link /colaborador/:key.
          El layout valida el link y muestra solo las secciones habilitadas. */}
      <Route path="/colaborador/:key" element={<ColaboradorLayout />}>
        <Route path="ingredientes" element={<ColaboradorIngredientes />} />
        <Route path="envios-saboryaroma" element={<EnviosSaboryAroma />} />
        <Route path="envios-coffit" element={<EnviosCoffit />} />
        <Route path="produccion" element={<Produccion />} />
        <Route path="plan-hoy" element={<PlanHoy />} />
        <Route path="perdidas" element={<PerdidasStandalone />} />
        <Route path="compras" element={<ComprasStandalone />} />
        <Route path="carta" element={<ColaboradorCarta />} />
        <Route path="sabor-y-aroma" element={<ColaboradorSaborYAroma />} />
      </Route>

      {/* All other pages inside MainLayout */}
      <Route element={<MainLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/ingredientes" element={<Ingredientes />} />
        <Route path="/subrecetas" element={<Subrecetas />} />
        <Route path="/productos" element={<Productos />} />
        <Route path="/carta" element={<Carta />} />
        <Route path="/preparaciones" element={<Preparaciones />} />
        <Route path="/reportes-produccion" element={<ReportesProduccion />} />
        <Route path="/plan-semanal" element={<PlanSemanal />} />
        <Route path="/compras" element={<Compras />} />
        <Route path="/perdidas" element={<Perdidas />} />
        <Route path="/reportes-envios" element={<ReportesEnvios />} />
        <Route path="/sabor-y-aroma" element={<SaborYAroma />} />
        <Route path="/rentabilidades" element={<Rentabilidades />} />
        <Route path="/ofertas" element={<Ofertas />} />
        <Route path="/categorias" element={<Categorias />} />
        <Route path="/proveedores" element={<Proveedores />} />
        <Route path="/configuracion" element={<Configuracion />} />
      </Route>
    </Routes>
  );
}
