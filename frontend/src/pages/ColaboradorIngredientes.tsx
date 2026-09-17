import Ingredientes from './Ingredientes';

// Reutiliza la seccion Ingredientes completa (editar precios cascadea a
// subrecetas/productos). Solo agrega el marco visual del area colaborador.
export default function ColaboradorIngredientes() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-sidebar px-4 py-3">
        <span className="text-lg font-bold text-primary">Ingredientes — actualizar precios</span>
      </div>
      <div className="max-w-6xl mx-auto px-4 py-6">
        <Ingredientes />
      </div>
    </div>
  );
}
