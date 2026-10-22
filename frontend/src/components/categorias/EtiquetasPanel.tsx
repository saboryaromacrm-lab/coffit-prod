import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Tag, X, Plus, Pencil, Check, ArrowLeft } from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import SearchInput from '../common/SearchInput';
import LoadingSpinner from '../common/LoadingSpinner';
import EmptyState from '../common/EmptyState';
import Button from '../common/Button';
import { etiquetasApi } from '../../api/etiquetas';
import type { ItemEtiquetado, OrigenEtiquetado } from '../../api/etiquetas';
import type { ApiResponse } from '../../types';
import { normalizarTexto } from '../../utils/normalizers';

// =============================================================================
// ETIQUETAS: las que se usan en la Carta y en Pedidos personalizados, con
// cuantos productos tiene cada una, y para etiquetar productos desde aca.
//
// Dentro de una etiqueta, "Les falta" es el modo rapido pensado para el
// celular: se toca cada producto y se le pone la etiqueta. El cambio se ve al
// instante (se guarda en segundo plano) y el producto queda en verde para
// poder deshacerlo con otro toque.
// =============================================================================

const ORIGEN: Record<OrigenEtiquetado, { label: string; clase: string }> = {
  carta: { label: 'Carta', clase: 'bg-amber-100 text-amber-800' },
  personalizado: { label: 'Personalizado', clase: 'bg-orange-100 text-orange-700' },
};
const LIMITE_LISTA = 80; // sin busqueda ni filtro se muestran los primeros

// Igual que normalizarEtiqueta del backend (utils/etiquetas.js).
const normalizar = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/[.,;:]+$/, '').trim().toLocaleUpperCase('es');
const clave = (it: ItemEtiquetado) => `${it.origen}-${it.id}`;

type Datos = ApiResponse<{ items: ItemEtiquetado[] }>;
const QUERY = ['etiquetas'];

export default function EtiquetasPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: QUERY, queryFn: etiquetasApi.getAll });
  const items = useMemo(() => data?.data?.items || [], [data]);

  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [modo, setModo] = useState<'con' | 'sin'>('sin');
  const [buscar, setBuscar] = useState('');
  const [origen, setOrigen] = useState<'' | OrigenEtiquetado>('');
  const [soloSin, setSoloSin] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState('');
  // Productos tocados en "Les falta": siguen visibles (en verde) para deshacer.
  const [recientes, setRecientes] = useState<Set<string>>(new Set());

  // Conteo por etiqueta, calculado de los productos: asi se actualiza solo con
  // cada toque, sin esperar al servidor.
  const etiquetas = useMemo(() => {
    const m = new Map<string, { nombre: string; carta: number; personalizados: number; total: number }>();
    for (const it of items) {
      for (const e of it.etiquetas) {
        const c = m.get(e) || { nombre: e, carta: 0, personalizados: 0, total: 0 };
        if (it.origen === 'carta') c.carta++; else c.personalizados++;
        c.total++;
        m.set(e, c);
      }
    }
    return [...m.values()].sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, 'es'));
  }, [items]);

  const elegir = (nombre: string | null) => {
    setSeleccionada(nombre);
    setModo('sin');
    setSoloSin(false);
    setRecientes(new Set());
    setNuevoNombre('');
    setBuscar('');
    setOrigen('');
  };

  // Guardado optimista: se pinta ya y, si falla, se vuelve atras.
  const guardar = useMutation({
    mutationFn: (v: { item: ItemEtiquetado; etiquetas: string[] }) => etiquetasApi.guardar(v.item.origen, v.item.id, v.etiquetas),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: QUERY });
      const previo = qc.getQueryData<Datos>(QUERY);
      qc.setQueryData<Datos>(QUERY, (viejo) => viejo && {
        ...viejo,
        data: {
          ...viejo.data,
          items: viejo.data.items.map((it) => (clave(it) === clave(v.item) ? { ...it, etiquetas: v.etiquetas } : it)),
        },
      });
      return { previo };
    },
    onError: (err: Error, v, ctx) => {
      if (ctx?.previo) qc.setQueryData(QUERY, ctx.previo);
      toast.error(`${v.item.nombre}: ${err.message}`);
    },
    onSettled: () => {
      // La Carta y el catalogo del POS tambien muestran etiquetas
      qc.invalidateQueries({ queryKey: ['carta'] });
      qc.invalidateQueries({ queryKey: ['pp-productos'] });
      qc.invalidateQueries({ queryKey: ['pp-producto'] });
    },
  });

  const renombrar = useMutation({
    mutationFn: (v: { de: string; a: string }) => etiquetasApi.renombrar(v.de, v.a),
    onSuccess: (res, v) => {
      const n = res.data.carta + res.data.personalizados;
      toast.success(`"${v.de}" → "${normalizar(v.a)}" en ${n} producto${n === 1 ? '' : 's'}`);
      qc.invalidateQueries({ queryKey: QUERY });
      elegir(normalizar(v.a));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Tocar un producto en "Les falta": le pone la etiqueta (o se la saca si ya
  // la tenia por un toque anterior).
  const alternar = (it: ItemEtiquetado) => {
    if (!seleccionada) return;
    const tiene = it.etiquetas.includes(seleccionada);
    setRecientes((r) => new Set(r).add(clave(it)));
    guardar.mutate({
      item: it,
      etiquetas: tiene ? it.etiquetas.filter((e) => e !== seleccionada) : [...it.etiquetas, seleccionada],
    });
  };

  const q = normalizarTexto(buscar.trim());
  const base = items.filter((it) => (!q || normalizarTexto(it.nombre).includes(q)) && (!origen || it.origen === origen));
  const conLa = seleccionada ? base.filter((it) => it.etiquetas.includes(seleccionada)) : [];
  const sinLa = seleccionada ? base.filter((it) => !it.etiquetas.includes(seleccionada) || recientes.has(clave(it))) : [];
  const general = base.filter((it) => !soloSin || it.etiquetas.length === 0);
  const visiblesGeneral = q || origen || soloSin ? general : general.slice(0, LIMITE_LISTA);
  const sinEtiquetas = items.filter((it) => it.etiquetas.length === 0).length;
  const sel = etiquetas.find((e) => e.nombre === seleccionada);
  const faltan = seleccionada ? items.filter((it) => !it.etiquetas.includes(seleccionada)).length : 0;

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <datalist id="etiquetas-existentes">{etiquetas.map((e) => <option key={e.nombre} value={e.nombre} />)}</datalist>

      {!seleccionada ? (
        /* Etiquetas en uso */
        <section className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <h3 className="font-semibold text-sm flex items-center gap-1.5"><Tag size={15} className="text-primary" /> Etiquetas en uso ({etiquetas.length})</h3>
            <span className="text-xs text-text-muted">Entrá a una para etiquetar productos</span>
          </div>
          {etiquetas.length === 0 ? (
            <p className="text-sm text-text-muted">Todavía no hay productos etiquetados.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {etiquetas.map((e) => (
                <button key={e.nombre} type="button" onClick={() => elegir(e.nombre)}
                  title={`Carta: ${e.carta} · Personalizados: ${e.personalizados}`}
                  className="text-sm px-3 py-2 rounded-full border border-gray-300 bg-white hover:border-primary active:bg-primary/10 flex items-center gap-1.5">
                  {e.nombre}
                  <span className="tabular-nums font-bold text-primary">{e.total}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      ) : (
        /* Dentro de una etiqueta: barra fija arriba para trabajar desde el celular */
        <section className="sticky top-0 z-20 -mx-4 sm:mx-0 px-4 py-3 sm:rounded-xl bg-white/95 backdrop-blur border-b sm:border border-gray-200 shadow-sm space-y-2.5">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => elegir(null)} className="p-1.5 -ml-1.5 text-text-muted hover:text-text-primary" title="Volver a todas las etiquetas">
              <ArrowLeft size={20} />
            </button>
            <span className="text-base font-bold text-primary truncate">{seleccionada}</span>
            <span className="text-xs text-text-muted whitespace-nowrap">
              {sel ? `${sel.carta} carta · ${sel.personalizados} pers.` : 'sin productos'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1 bg-gray-100 rounded-lg p-1">
            <button type="button" onClick={() => { setModo('con'); setRecientes(new Set()); }}
              className={clsx('py-2 text-sm rounded-md font-medium', modo === 'con' ? 'bg-white shadow-sm text-text-primary' : 'text-text-muted')}>
              Ya la tienen <span className="tabular-nums">({sel?.total ?? 0})</span>
            </button>
            <button type="button" onClick={() => setModo('sin')}
              className={clsx('py-2 text-sm rounded-md font-medium', modo === 'sin' ? 'bg-white shadow-sm text-primary' : 'text-text-muted')}>
              Les falta <span className="tabular-nums">({faltan})</span>
            </button>
          </div>
          <SearchInput value={buscar} onChange={setBuscar} placeholder="Buscar producto..." />
        </section>
      )}

      {/* Filtros generales (fuera de una etiqueta) */}
      {!seleccionada && (
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
        </div>
      )}

      {/* Lista segun donde estamos */}
      {seleccionada && modo === 'sin' ? (
        sinLa.length === 0 ? (
          <EmptyState message={q ? 'Ningún producto coincide.' : `Todos los productos ya tienen ${seleccionada} 🎉`} />
        ) : (
          <>
            <p className="text-xs text-text-muted px-1">Tocá un producto para ponerle <strong>{seleccionada}</strong>. Si te equivocás, tocalo de nuevo.</p>
            <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-100 overflow-hidden">
              {sinLa.map((it) => {
                const lista = it.etiquetas.includes(seleccionada);
                return (
                  <button key={clave(it)} type="button" onClick={() => alternar(it)}
                    className={clsx('w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors',
                      lista ? 'bg-green-50 active:bg-green-100' : 'active:bg-primary/10 hover:bg-gray-50')}>
                    <span className={clsx('w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0',
                      lista ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 text-transparent')}>
                      <Check size={16} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium truncate">{it.nombre}</span>
                      <span className="flex items-center gap-1.5 text-xs text-text-muted">
                        <span className={clsx('px-1.5 py-px rounded-full font-semibold text-[10px]', ORIGEN[it.origen].clase)}>{ORIGEN[it.origen].label}</span>
                        <span className="truncate">{it.categoria || ''}</span>
                      </span>
                    </span>
                    {lista && <span className="text-[11px] text-green-700 font-medium shrink-0">Etiquetado</span>}
                  </button>
                );
              })}
            </div>
          </>
        )
      ) : (
        <>
          {seleccionada && modo === 'con' && (
            <div className="flex flex-wrap items-center gap-2 text-sm px-1">
              <Pencil size={13} className="text-text-muted" />
              <input value={nuevoNombre} onChange={(ev) => setNuevoNombre(ev.target.value)} list="etiquetas-existentes"
                placeholder="Renombrar o unir con..." className="w-52 px-2 py-1.5 text-sm border border-gray-300 rounded-lg" />
              <Button size="sm" variant="secondary" disabled={!nuevoNombre.trim()} loading={renombrar.isPending}
                onClick={() => renombrar.mutate({ de: seleccionada, a: nuevoNombre })}
                title="Cambia el nombre en todos sus productos. Si ya existe otra con ese nombre, quedan unidas.">
                Aplicar
              </Button>
            </div>
          )}
          {(seleccionada ? conLa : visiblesGeneral).length === 0 ? (
            <EmptyState message="Ningún producto coincide." />
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-100">
              {(seleccionada ? conLa : visiblesGeneral).map((it) => (
                <FilaProducto key={clave(it)} item={it} onCambiar={(nuevas) => guardar.mutate({ item: it, etiquetas: nuevas })} />
              ))}
            </div>
          )}
          {!seleccionada && visiblesGeneral.length < general.length && (
            <p className="text-xs text-text-muted text-center">Mostrando {visiblesGeneral.length} de {general.length}: buscá o filtrá para ver el resto.</p>
          )}
        </>
      )}
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
