import Carta from './Carta';

// Reutiliza la seccion Carta completa dentro del area colaborador.
// Solo agrega el marco visual (header + padding) del area colaborador.
export default function ColaboradorCarta() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-sidebar px-4 py-3">
        <span className="text-lg font-bold text-primary">Carta — menú digital</span>
      </div>
      <div className="max-w-7xl mx-auto px-4 py-6">
        <Carta />
      </div>
    </div>
  );
}
