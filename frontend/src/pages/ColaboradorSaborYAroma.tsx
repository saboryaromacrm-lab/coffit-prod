import SaborYAroma from './SaborYAroma';

// Reutiliza la seccion Sabor y Aroma completa dentro del area colaborador.
// Solo agrega el marco visual (header + padding) del area colaborador.
export default function ColaboradorSaborYAroma() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-sidebar px-4 py-3">
        <span className="text-lg font-bold text-primary">Sabor y Aroma — envíos de la distribuidora</span>
      </div>
      <div className="max-w-7xl mx-auto px-4 py-6">
        <SaborYAroma />
      </div>
    </div>
  );
}
