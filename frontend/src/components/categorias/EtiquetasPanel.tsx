import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Tag, X, Plus, Pencil } from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import SearchInput from '../common/SearchInput';
import LoadingSpinner from '../common/LoadingSpinner';
import EmptyState from '../common/EmptyState';
import Button from '../common/Button';
import { etiquetasApi } from '../../api/etiquetas';
import type { ItemEtiquetado, OrigenEtiquetado } from '../../api/etiquetas';
import { normalizarTexto } from '../../utils/normalizers';

// =============================================================================
// ETIQUETAS: las que se usan en la Carta y en Pedidos personalizados, con
// cuantos productos tiene cada una, y para etiquetar productos desde aca.
// =============================================================================

const ORIGEN: Record<OrigenEtiquetado, { label: string; clase: string }> = {
  carta: { label: 'Carta', clase: 'bg-amber-100 text-amber-800' },
  personalizado: { label: 'Personalizado', clase: 'bg-orange-100 text-orange-700' },
};
const LIMITE_LISTA = 80; // sin busqueda ni filtro se muestran los primeros

// Igual que normalizarEtiqueta del backend (utils/etiquetas.js).
const normalizar = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/[.,;:]+$/, '').trim().toLocaleUpperCase('es');

export default function EtiquetasPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['etiquetas'], queryFn: etiquetasApi.getAll });
  const etiquetas = useMemo(() => data?.data?.etiquetas || [], [data]);
  const items = useMemo(() => data?.data?.items || [], [data]);

  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [buscar, setBuscar] = useState('');
  const [origen, setOrigen] = useState<'' | OrigenEtiquetado>('');
  const [soloSin, setSoloSin] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState('');

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['etiquetas'] });
    qc.invalidateQueries({ queryKey: ['carta'] });
    qc.invalidateQueries({ queryKey: ['pp-productos'] });
    qc.invalidateQueries({ queryKey: ['pp-producto'] });
  };

  const guardar = useMutation({
    mutationFn: (v: { item: ItemEtiquetado; etiquetas: string[] }) => etiquetasApi.guardar(v.item.origen, v.item.id, v.etiquetas),
    onSuccess: refrescar,
    onError: (err: Error) => { toast.error(err.message); refrescar(); },
  });
  const renombrar = useMutation({
    mutationFn: (v: { de: string; a: string }) => etiquetasApi.renombrar(v.de, v.a),
    onSuccess: (res, v) => {
      const n = res.data.carta + res.data.personalizados;
      toast.success(`"${v.de}" → "${normalizar(v.a)}" en ${n} producto${n === 1 ? '' : 's'}`);
      setSeleccionada(normalizar(v.a));
      setNuevoNombre('');
      refrescar();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const filtrados = useMemo(() => {
    const q = normalizarTexto(buscar.trim());
    return items.filter((it) =>
      (!q || normalizarTexto(it.nombre).includes(q))
      && (!origen || it.origen === origen)
      && (!soloSin || it.etiquetas.length === 0)
      && (!seleccionada || it.etiquetas.includes(seleccionada)));
  }, [items, buscar, origen, soloSin, seleccionada]);
  const hayFiltro = !!(buscar.trim() || origen || soloSin || seleccionada);
  const visibles = hayFiltro ? filtrados : filtrados.slice(0, LIMITE_LISTA);
  const sinEtiquetas = items.filter((it) => it.etiquetas.length === 0).length;
  const sel = etiquetas.find((e) => e.nombre === seleccionada);

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-5">
      {/* Etiquetas en uso */}
      <section className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <h3 className="font-semibold text-sm flex items-center gap-1.5"><Tag size={15} className="text-primary" /> Etiquetas en uso ({etiquetas.length})</h3>
          <span className="text-xs text-text-muted">Tocá una para ver sus productos</span>
        </div>
        {etiquetas.length === 0 ? (
          <p className="text-sm text-text-muted">Todavía no hay productos etiquetados.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {etiquetas.map((e) => (
              <button key={e.nombre} type="button"
                onClick={() => { setSeleccionada(seleccionada === e.nombre ? null : e.nombre); setSoloSin(false); }}
                title={`Carta: ${e.carta} · Personalizados: ${e.personalizados}`}
                className={clsx('text-xs px-2.5 py-1.5 rounded-full border transition-colors flex items-center gap-1.5',
                  seleccionada === e.nombre ? 'bg-primary text-white border-primary' : 'bg-white border-gray-300 hover:border-primary')}>
                {e.nombre}
                <span className={clsx('tabular-nums font-bold', seleccionada === e.nombre ? 'text-white/90' : 'text-primary')}>{e.total}</span>
              </button>
            ))}
          </div>
        )}

        {sel && (
          <div className="flex flex-wrap items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 text-sm">
            <span><strong>{sel.nombre}</strong> · {sel.total} producto{sel.total === 1 ? '' : 's'} ({sel.carta} en la Carta · {sel.personalizados} personalizados)</span>
            <div className="flex items-center gap-1.5 ml-auto">
              <Pencil size={13} className="text-text-muted" />
              <input value={nuevoNombre} onChange={(ev) => setNuevoNombre(ev.target.value)} list="etiquetas-existentes"
                placeholder="Renombrar o unir con..." className="w-48 px-2 py-1 text-sm border border-gray-300 rounded-lg" />
              <Button size="sm" variant="secondary" disabled={!nuevoNombre.trim()} loading={renombrar.isPending}
                onClick={() => renombrar.mutate({ de: sel.nombre, a: nuevoNombre })}
                title="Cambia el nombre en todos sus productos. Si ya existe otra con ese nombre, quedan unidas.">
                Aplicar
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* Etiquetar productos */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[200px] max-w-md"><SearchInput value={buscar} onChange={setBuscar} placeholder="Buscar producto para etiquetar..." /></div>
          <select value={origen} onChange={(e) => setOrigen(e.target.value as '' | OrigenEtiquetado)} className="px-3 py-2 text-sm border border-gray-300 rounded-lg">
            <option value="">Carta y personalizados</option>
            <option value="carta">Solo Carta</option>
            <option value="personalizado">Solo personalizados</option>
          </select>
          <label className={clsx('flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg cursor-pointer select-none',
            soloSin ? 'border-primary bg-primary/5 text-primary' : 'border-gray-300')}>
            <input type="checkbox" checked={soloSin} onChange={(e) => setSoloSin(e.target.checked)} className="rounded" />
            Sin etiquetas <span className="text-xs font-bold tabular-nums">{sinEtiquetas}</span>
          </label>
          {seleccionada && (
            <button type="button" onClick={() => setSeleccionada(null)} className="text-xs text-primary hover:underline">Quitar filtro "{seleccionada}"</button>
          )}
        </div>

        <datalist id="etiquetas-existentes">{etiquetas.map((e) => <option key={e.nombre} value={e.nombre} />)}</datalist>

        {visibles.length === 0 ? (
          <EmptyState message="Ningún producto coincide." />
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-100">
            {visibles.map((it) => (
              <FilaProducto key={`${it.origen}-${it.id}`} item={it}
                onCambiar={(nuevas) => guardar.mutate({ item: it, etiquetas: nuevas })} />
            ))}
          </div>
        )}
        {!hayFiltro && filtrados.length > LIMITE_LISTA && (
          <p className="text-xs text-text-muted text-center">Mostrando {LIMITE_LISTA} de {filtrados.length}: buscá o filtrá para ver el resto.</p>
        )}
      </section>
    </div>
  );
}

function FilaProducto({ item, onCambiar }: { item: ItemEtiquetado; onCambiar: (etiquetas: string[]) => void }) {
  const [nueva, setNueva] = useState('');
  const agregar = () => {
    const e = normalizar(nueva);
    setNueva('');
    if (!e || item.etiquetas.includes(e)) return;
    onCambiar([...item.etiquetas, e]);
  };

  return (
    <div className="px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <div className="min-w-[180px] flex-1">
        <div className="text-sm font-medium flex items-center gap-1.5">
          {item.nombre}
          <span className={clsx('text-[10px] px-1.5 py-0.5 rounded-full font-semibold', ORIGEN[item.origen].clase)}>{ORIGEN[item.origen].label}</span>
        </div>
        {item.categoria && <div className="text-xs text-text-muted">{item.categoria}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {item.etiquetas.map((e) => (
          <span key={e} className="text-xs pl-2 pr-1 py-0.5 rounded-full bg-gray-100 text-text-primary flex items-center gap-0.5">
            {e}
            <button type="button" onClick={() => onCambiar(item.etiquetas.filter((x) => x !== e))}
              className="p-0.5 text-text-muted hover:text-danger" title={`Quitar ${e}`}><X size={11} /></button>
          </span>
        ))}
        <div className="flex items-center gap-1">
          <input value={nueva} onChange={(e) => setNueva(e.target.value)} list="etiquetas-existentes"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } }}
            placeholder="+ etiqueta" className="w-32 px-2 py-1 text-xs border border-gray-300 rounded-lg" />
          {nueva.trim() && (
            <button type="button" onClick={agregar} className="p-1 text-primary hover:bg-primary/10 rounded" title="Agregar"><Plus size={14} /></button>
          )}
        </div>
      </div>
    </div>
  );
}
