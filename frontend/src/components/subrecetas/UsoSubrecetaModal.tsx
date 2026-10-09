import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Package, Cake, ExternalLink, Link2 } from 'lucide-react';
import Modal from '../common/Modal';
import { subrecetasApi } from '../../api/subrecetas';

// =============================================================================
// Productos (y pedidos personalizados) que usan una subreceta. Cada item lleva
// a su editor. Es el equivalente del "Ver recetas" de Ingredientes.
// =============================================================================
export default function UsoSubrecetaModal({ subrecetaId, nombre, onClose }: {
  subrecetaId: number;
  nombre: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({
    queryKey: ['subrecetas', subrecetaId, 'uso'],
    queryFn: () => subrecetasApi.getUso(subrecetaId),
  });
  const uso = data?.data;

  const ir = (ruta: string) => {
    onClose();
    navigate(ruta);
  };

  const vacio = uso && uso.productos.length === 0 && uso.personalizados.length === 0;

  return (
    <Modal isOpen onClose={onClose} title={`Dónde se usa: ${nombre}`} size="lg">
      {isLoading ? (
        <div className="text-center py-12 text-text-muted text-sm">Cargando...</div>
      ) : error || !uso ? (
        <div className="text-center py-12 text-red-600 text-sm">No se pudo cargar dónde se usa la subreceta</div>
      ) : vacio ? (
        <div className="text-center py-12">
          <Link2 size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-text-muted">Esta subreceta no se usa en ningún producto todavía</p>
        </div>
      ) : (
        <div className="space-y-5">
          {uso.productos.length > 0 && (
            <div>
              <h4 className="text-sm font-bold text-text-primary mb-2 flex items-center gap-2">
                <Package size={16} className="text-blue-500" /> Productos ({uso.productos.length})
              </h4>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                {uso.productos.map((p) => (
                  <button key={p.id} type="button" onClick={() => ir(`/productos?openId=${p.id}`)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-gray-100 last:border-0 hover:bg-blue-50/50 transition-colors group">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-text-primary truncate">{p.nombre}</span>
                        {p.es_borrador && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">Borrador</span>}
                      </div>
                      <div className="flex flex-wrap gap-x-3 text-xs text-text-muted mt-0.5">
                        <span>Usa <strong className="text-text-primary font-mono">{p.cantidad}</strong> {p.unidad}</span>
                        {p.categoria_nombre && <span>{p.categoria_icono} {p.categoria_nombre}</span>}
                      </div>
                    </div>
                    <ExternalLink size={14} className="text-gray-400 group-hover:text-blue-600 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {uso.personalizados.length > 0 && (
            <div>
              <h4 className="text-sm font-bold text-text-primary mb-2 flex items-center gap-2">
                <Cake size={16} className="text-primary" /> Pedidos personalizados ({uso.personalizados.length})
              </h4>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                {uso.personalizados.map((r, i) => {
                  // Una opcion de grupo no es de un producto: lleva a la biblioteca
                  const ruta = r.producto_id != null
                    ? `/pedidos-personalizados?producto=${r.producto_id}`
                    : '/pedidos-personalizados?tab=grupos';
                  const donde = r.producto_nombre ?? `Grupo ${r.grupo_nombre}`;
                  return (
                    <button key={i} type="button" onClick={() => ir(ruta)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-gray-100 last:border-0 hover:bg-orange-50/60 transition-colors group">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-text-primary truncate">
                          {donde}{r.opcion_nombre ? <span className="text-text-muted font-normal"> · {r.opcion_nombre}</span> : <span className="text-text-muted font-normal"> · receta base</span>}
                        </div>
                        <div className="text-xs text-text-muted mt-0.5">
                          Usa <strong className="text-text-primary font-mono">{r.cantidad}</strong> {r.unidad}{r.por_kg ? ' por kg del producto' : ''}
                        </div>
                      </div>
                      <ExternalLink size={14} className="text-gray-400 group-hover:text-primary shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <p className="text-[11px] text-text-muted text-center pt-2 border-t border-gray-100">
            Click en cualquier item para abrirlo
          </p>
        </div>
      )}
    </Modal>
  );
}
