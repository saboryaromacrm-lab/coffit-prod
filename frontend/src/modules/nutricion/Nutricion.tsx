import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import IngredientesNutri from './IngredientesNutri';
import ProductosNutri from './ProductosNutri';

// ============================================================================
// INFO NUTRICIONAL. Cada producto se calcula con su receta; la IA completa
// la info de los ingredientes que falten (y se corrige en Ingredientes).
// La pestaña vive en la URL (?tab=ingredientes).
// ============================================================================

const TABS = [
  { id: 'productos', label: 'Productos' },
  { id: 'ingredientes', label: 'Ingredientes' },
] as const;

export default function Nutricion() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'ingredientes' ? 'ingredientes' : 'productos';

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setParams(t.id === 'productos' ? {} : { tab: t.id })}
            className={clsx('flex-1 sm:flex-none px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap',
              tab === t.id ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text-primary')}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'productos' ? <ProductosNutri /> : <IngredientesNutri />}
    </div>
  );
}
