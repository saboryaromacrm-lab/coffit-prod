import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import type { ProductoCatalogo } from '../../types';

interface MultiSelectItemsProps {
  items: ProductoCatalogo[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  className?: string;
}

type FiltroTipo = 'todos' | 'producto' | 'subreceta';

/**
 * Dropdown multi-select con checkboxes para elegir productos y/o subrecetas.
 * Trabaja con arrays de NOMBRES (los productos y subrecetas pueden tener IDs duplicados).
 */
export default function MultiSelectItems({
  items,
  selected,
  onChange,
  placeholder = 'Filtrar items...',
  className = '',
}: MultiSelectItemsProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<FiltroTipo>('todos');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    return items.filter((it) => {
      if (tipoFiltro !== 'todos' && it.tipo !== tipoFiltro) return false;
      if (term && !it.nombre.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [items, search, tipoFiltro]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  function toggle(nombre: string) {
    if (selectedSet.has(nombre)) {
      onChange(selected.filter((n) => n !== nombre));
    } else {
      onChange([...selected, nombre]);
    }
  }

  function clearAll() {
    onChange([]);
  }

  function selectAllFiltered() {
    const toAdd = filtered.map((f) => f.nombre);
    const merged = Array.from(new Set([...selected, ...toAdd]));
    onChange(merged);
  }

  const label =
    selected.length === 0
      ? 'Todos los items'
      : selected.length === 1
      ? selected[0]
      : `${selected.length} seleccionados`;

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Boton del dropdown */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50"
      >
        <span className={`truncate ${selected.length > 0 ? 'text-text-primary font-medium' : 'text-text-muted'}`}>
          {label}
        </span>
        <ChevronDown size={16} className={`text-text-muted transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
          {/* Header: search + tipo */}
          <div className="p-2 border-b border-gray-100 space-y-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={placeholder}
                className="w-full pl-8 pr-7 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="flex gap-1">
              {(['todos', 'producto', 'subreceta'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipoFiltro(t)}
                  className={`flex-1 text-xs py-1 rounded ${
                    tipoFiltro === t ? 'bg-primary text-white' : 'bg-gray-100 text-text-muted hover:bg-gray-200'
                  }`}
                >
                  {t === 'todos' ? 'Todos' : t === 'producto' ? 'Productos' : 'Subrecetas'}
                </button>
              ))}
            </div>
          </div>

          {/* Lista de items */}
          <div className="max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-text-muted">Sin resultados</div>
            ) : (
              filtered.slice(0, 200).map((it) => {
                const checked = selectedSet.has(it.nombre);
                return (
                  <label
                    key={`${it.tipo}-${it.id}`}
                    className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 border-b border-gray-50 last:border-0"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(it.nombre)}
                      className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary/30"
                    />
                    <span className="flex-1 truncate">{it.nombre}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                        it.tipo === 'producto' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {it.tipo === 'producto' ? 'Prod.' : 'Subr.'}
                    </span>
                  </label>
                );
              })
            )}
          </div>

          {/* Footer acciones */}
          <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-t border-gray-100 bg-gray-50 text-xs">
            {filtered.length > 0 && (
              <button
                type="button"
                onClick={selectAllFiltered}
                className="text-primary hover:underline px-1"
              >
                Seleccionar visibles ({filtered.length})
              </button>
            )}
            <div className="flex-1" />
            {selected.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="text-red-600 hover:underline px-1"
              >
                Limpiar ({selected.length})
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-2 py-0.5 bg-primary text-white rounded hover:bg-primary/90"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Chips de seleccionados (debajo del dropdown) */}
      {selected.length > 0 && selected.length <= 5 && !open && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {selected.map((n) => (
            <span
              key={n}
              className="inline-flex items-center gap-1 bg-primary/10 text-primary text-[11px] px-1.5 py-0.5 rounded"
            >
              {n}
              <button
                type="button"
                onClick={() => onChange(selected.filter((x) => x !== n))}
                className="hover:text-primary/70"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
