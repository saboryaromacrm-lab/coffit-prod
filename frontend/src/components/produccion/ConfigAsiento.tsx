import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { produccionApi } from '../../api/produccion';
import type { AsientoInput, ProductoCatalogo } from '../../types';
import Button from '../common/Button';
import Modal from '../common/Modal';
import SearchInput from '../common/SearchInput';
import EmptyState from '../common/EmptyState';
import AsientoProduccion from './AsientoProduccion';
import { asientoInicial, asientoParaGuardar, enBase, rindeDe } from '../../utils/asiento';
import { normalizarTexto } from '../../utils/normalizers';

const configurado = (c: ProductoCatalogo) => !!(c.asiento_unidad || c.asiento_rinde);

// Pestaña "Configuración" de Reportes de produccion: los productos y
// subrecetas que ya dicen como se asientan, y desde aca se configura otro.
export default function ConfigAsiento() {
  const { data, isLoading } = useQuery({ queryKey: ['produccion-catalogo'], queryFn: produccionApi.getCatalogo });
  const catalogo = useMemo(() => data?.data || [], [data]);
  const configurados = useMemo(() => catalogo.filter(configurado), [catalogo]);
  const [buscar, setBuscar] = useState('');
  const [editando, setEditando] = useState<ProductoCatalogo | null>(null);
  const quitar = useGuardarAsiento();

  const resultados = useMemo(() => {
    const q = normalizarTexto(buscar.trim());
    return q ? catalogo.filter((c) => normalizarTexto(c.nombre).includes(q)).slice(0, 8) : [];
  }, [catalogo, buscar]);

  const elegir = (c: ProductoCatalogo) => {
    setEditando(c);
    setBuscar('');
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        <div>
          <h3 className="text-sm font-bold">🏭 Cómo se asienta cada producto</h3>
          <p className="text-xs text-text-muted mt-1">
            La unidad con que se carga en Producción (plancha, bandeja, tanda…) y cuánto rinde. Lo que no está configurado
            se carga por receta completa. Al configurar un producto, lo ya cargado también se lee así.
          </p>
        </div>
        <div className="relative">
          <SearchInput value={buscar} onChange={setBuscar} placeholder="Configurar un producto o subreceta…" />
          {resultados.length > 0 && (
            <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
              {resultados.map((c) => (
                <button key={`${c.tipo}-${c.id}`} type="button" onClick={() => elegir(c)}
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-primary/5 flex items-center gap-2 border-b border-gray-50 last:border-0">
                  <TipoBadge tipo={c.tipo} />
                  <span className="truncate flex-1">{c.nombre}</span>
                  <span className="text-[11px] text-text-muted shrink-0">
                    {configurado(c) ? equivalencia(c) : <><Plus size={11} className="inline" /> Configurar</>}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-bold">Configurados</h3>
          <span className="text-xs text-text-muted">{configurados.length}</span>
        </div>
        {isLoading ? null : configurados.length === 0 ? (
          <EmptyState message="Todavía no hay ninguno configurado: buscá arriba un producto o subreceta." />
        ) : (
          <ul className="divide-y divide-gray-50">
            {configurados.map((c) => (
              <li key={`${c.tipo}-${c.id}`} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <TipoBadge tipo={c.tipo} />
                    <span className="font-medium text-sm truncate">{c.nombre}</span>
                  </div>
                  <p className="text-xs text-text-muted mt-0.5">
                    {equivalencia(c)}{!c.asiento_rinde && ' (receta completa)'}
                  </p>
                </div>
                <button type="button" onClick={() => setEditando(c)} aria-label={`Editar ${c.nombre}`}
                  className="p-2 text-text-muted hover:text-primary">
                  <Pencil size={15} />
                </button>
                <button type="button" aria-label={`Quitar ${c.nombre}`}
                  onClick={() => {
                    if (confirm(`"${c.nombre}" vuelve a cargarse por receta completa (también lo ya cargado). ¿Seguir?`)) {
                      quitar.mutate({ item: c, asiento: { asiento_unidad: null, asiento_rinde: null } });
                    }
                  }}
                  className="p-2 text-text-muted hover:text-danger">
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {editando && <EditorAsiento key={`${editando.tipo}-${editando.id}`} item={editando} onClose={() => setEditando(null)} />}
    </div>
  );
}

// "1 plancha = 2 unidades"
const equivalencia = (c: ProductoCatalogo) => `1 ${c.asiento_unidad || 'receta'} = ${enBase(rindeDe(c), c.base)}`;

function TipoBadge({ tipo }: { tipo: ProductoCatalogo['tipo'] }) {
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0 ${
      tipo === 'subreceta' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
    }`}>
      {tipo === 'subreceta' ? 'SUB' : 'PROD'}
    </span>
  );
}

// Guarda solo como se asienta y refresca todo lo que lo lee.
function useGuardarAsiento(onSuccess?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ item, asiento }: { item: ProductoCatalogo; asiento: AsientoInput }) => produccionApi.setAsiento(item, asiento),
    onSuccess: (_, { item }) => {
      for (const key of ['produccion-catalogo', 'produccion-reportes', 'produccion-registros', 'produccion-reporte-ingredientes', 'productos', 'subrecetas']) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      toast.success(`"${item.nombre}" actualizado`);
      onSuccess?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

function EditorAsiento({ item, onClose }: { item: ProductoCatalogo; onClose: () => void }) {
  const [asiento, setAsiento] = useState(() => asientoInicial(item));
  const guardar = useGuardarAsiento(onClose);

  const handleGuardar = () => {
    const a = asientoParaGuardar(asiento);
    if ('error' in a) return toast.error(a.error);
    guardar.mutate({ item, asiento: a });
  };

  return (
    <Modal isOpen onClose={onClose} title={item.nombre} size="md"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={handleGuardar} loading={guardar.isPending}>Guardar</Button>
      </>}>
      <div className="space-y-3">
        <p className="text-xs text-text-muted">
          <TipoBadge tipo={item.tipo} /> La receta completa rinde {enBase(item.rendimiento, item.base)}.
        </p>
        <AsientoProduccion value={asiento} onChange={setAsiento} base={item.base} rendimiento={item.rendimiento} />
      </div>
    </Modal>
  );
}
