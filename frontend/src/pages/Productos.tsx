import { useState, useMemo, useEffect } from 'react';
import { Plus, Pencil, Trash2, X, Copy, Link2, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { productosApi } from '../api/productos';
import { ingredientesApi } from '../api/ingredientes';
import { subrecetasApi } from '../api/subrecetas';
import { conceptosApi } from '../api/conceptos';
import { categoriasApi } from '../api/categorias';
import { opcionesJerarquia, soloRaices, hijasDe, raizDe } from '../utils/categoriasTree';
import { cartaApi } from '../api/carta';
import type { Producto, Ingrediente, Subreceta, CategoriaProducto, ResumenCanales } from '../types';
import { formatMoney, formatDate } from '../utils/formatters';
import { calcularMCNeto, getMCColor, calcularFoodCost, getFoodCostColor } from '../utils/calculators';
import { normalizarTexto } from '../utils/normalizers';
import { useProductosStore } from '../stores/productosStore';
import { useDebounce } from '../hooks/useDebounce';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import MCBadge from '../components/common/MCBadge';
import SearchInput from '../components/common/SearchInput';
import ConfirmDialog from '../components/common/ConfirmDialog';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmptyState from '../components/common/EmptyState';
import NumericInput from '../components/common/NumericInput';

interface RecipeItem {
  ingrediente_id?: number;
  subreceta_id?: number;
  nombre: string;
  cantidad: number;
  unidad: string;
  costo_unitario: number;
  tipo: 'ingrediente' | 'subreceta';
  fecha_precio?: string;
}

function isStalePrice(fecha?: string, days = 45): boolean {
  if (!fecha) return false;
  const diff = Date.now() - new Date(fecha).getTime();
  return diff > days * 86400000;
}

export default function Productos() {
  const { tabActivo, setTab, buscar, setBuscar, categoriaId, setCategoriaId, modalOpen, editingId, openModal, closeModal } = useProductosStore();
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [filtroMC, setFiltroMC] = useState('');
  const [filtroCarta, setFiltroCarta] = useState('');
  const [sortBy, setSortBy] = useState<string>('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const debouncedBuscar = useDebounce(buscar);

  // Primer click en una columna: mayor a menor (desc); segundo: menor a mayor (asc)
  const toggleSort = (col: string) => {
    if (sortBy === col) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortBy(col); setSortDir('desc'); }
  };

  // Header clickeable con indicador de orden
  const thSort = (col: string, label: string, align: 'left' | 'right' | 'center' = 'left', hideCls = '') => {
    const active = sortBy === col;
    const alignCls = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
    const justify = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start';
    return (
      <th className={`px-4 py-3 font-medium ${alignCls} ${hideCls} cursor-pointer select-none hover:text-text-primary`} onClick={() => toggleSort(col)}>
        <span className={`inline-flex items-center gap-1 ${justify}`}>
          {label}
          {active
            ? (sortDir === 'desc' ? <ChevronDown size={13} className="text-primary" /> : <ChevronUp size={13} className="text-primary" />)
            : <ChevronsUpDown size={13} className="opacity-30" />}
        </span>
      </th>
    );
  };
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [openIdProcessed, setOpenIdProcessed] = useState(false);

  const filters = useMemo(() => ({
    es_borrador: tabActivo === 'borradores' ? 1 : 0,
    ...(debouncedBuscar && { buscar: debouncedBuscar }),
    ...(categoriaId && { categoria_id: Number(categoriaId) }),
  }), [tabActivo, debouncedBuscar, categoriaId]);

  const { data, isLoading } = useQuery({
    queryKey: ['productos', filters],
    queryFn: () => productosApi.getAll(filters),
  });

  const { data: catData } = useQuery({
    queryKey: ['categorias', 'productos'],
    queryFn: () => categoriasApi.getProductos(),
  });

  // Reverse lookup: que productos estan mapeados en la carta.
  // No bloqueante: si la carta no esta migrada, la columna muestra "—".
  const { data: mapeoCartaData } = useQuery({
    queryKey: ['carta-mapeo-productos'],
    queryFn: () => cartaApi.getMapeoProductos(),
    retry: false,
    staleTime: 30_000,
  });
  const mapeoCarta = mapeoCartaData?.data;
  const cartaDisponible = mapeoCarta?.disponible ?? false;
  const cartaPorProducto = useMemo(() => {
    const map = new Map<number, { carta_count: number; items: { id: number; nombre: string }[] }>();
    const obj = mapeoCarta?.productos || {};
    for (const key of Object.keys(obj)) map.set(Number(key), obj[key]);
    return map;
  }, [mapeoCarta]);

  // Mapeo inverso: crear/vincular el item de carta de un producto.
  const agregarCartaMut = useMutation({
    mutationFn: (productoId: number) => cartaApi.fromProducto(productoId),
    onSuccess: (res) => {
      const yaExistia = res?.data?.ya_existia;
      toast.success(yaExistia ? 'Ya estaba en la carta' : 'Agregado a la carta');
      queryClient.invalidateQueries({ queryKey: ['carta-mapeo-productos'] });
      queryClient.invalidateQueries({ queryKey: ['carta'] });
      queryClient.invalidateQueries({ queryKey: ['carta-resumen'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => productosApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      toast.success('Producto eliminado');
      setDeleteId(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const productosRaw = data?.data || [];
  const categorias = catData?.data || [];

  // Deep-link ?openId=N (desde Ingredientes -> "Ver recetas").
  // Espera a que la lista cargue antes de abrir el modal para que el form se popule.
  useEffect(() => {
    if (openIdProcessed) return;
    const openIdRaw = searchParams.get('openId');
    if (!openIdRaw) {
      setOpenIdProcessed(true);
      return;
    }
    if (productosRaw.length === 0) return; // esperar a que cargue

    const id = Number(openIdRaw);
    if (!Number.isNaN(id)) {
      const exists = productosRaw.some((p) => p.id === id);
      if (exists) {
        openModal(id);
      } else {
        // Si el producto buscado no aparece en la pestaña actual (puede ser borrador),
        // cambiar a la pestaña que probablemente lo contenga.
        setTab(tabActivo === 'publicados' ? 'borradores' : 'publicados');
        return; // re-evaluamos en el siguiente render con la otra pestaña
      }
    }
    const next = new URLSearchParams(searchParams);
    next.delete('openId');
    setSearchParams(next, { replace: true });
    setOpenIdProcessed(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productosRaw, openIdProcessed]);

  // Client-side filter by MC Tarjeta + estado en carta
  const productos = useMemo(() => {
    let list = productosRaw;
    if (filtroMC) {
      list = list.filter((p: any) => {
        const mc = p.rentabilidades?.local_tarjeta?.mc_neto ?? 0;
        switch (filtroMC) {
          case 'critico': return mc < 15;
          case 'bajo': return mc >= 15 && mc < 25;
          case 'medio': return mc >= 25 && mc < 35;
          case 'bueno': return mc >= 35 && mc < 50;
          case 'excelente': return mc >= 50;
          case 'negativo': return mc <= 0;
          default: return true;
        }
      });
    }
    if (filtroCarta && cartaDisponible) {
      list = list.filter((p) => {
        const enCarta = cartaPorProducto.has(p.id);
        return filtroCarta === 'mapeado' ? enCarta : !enCarta;
      });
    }
    // Ordenamiento por columna (click en el header)
    if (sortBy) {
      const val = (p: Producto): string | number => {
        switch (sortBy) {
          case 'nombre': return (p.nombre || '').toLowerCase();
          case 'updated': return p.updated_at ? new Date(p.updated_at).getTime() : 0;
          case 'costo': return Number(p.costo_total) || 0;
          case 'precio_local': return Number(p.precio_publico) || 0;
          case 'mc_efec': return p.rentabilidades?.local_efectivo?.mc_neto ?? 0;
          default: return 0;
        }
      };
      list = [...list].sort((a, b) => {
        const va = val(a); const vb = val(b);
        const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number);
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    return list;
  }, [productosRaw, filtroMC, filtroCarta, cartaDisponible, cartaPorProducto, sortBy, sortDir]);

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {(['publicados', 'borradores'] as const).map((tab) => (
          <button key={tab} onClick={() => setTab(tab)}
            className={`px-4 py-2 text-sm rounded-md font-medium transition-colors cursor-pointer ${tabActivo === tab ? 'bg-white shadow-sm text-text-primary' : 'text-text-muted hover:text-text-primary'}`}>
            {tab === 'publicados' ? 'Publicados' : 'Borradores'}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="w-full sm:flex-1 sm:min-w-[200px]">
          <SearchInput value={buscar} onChange={setBuscar} placeholder="Buscar producto..." />
        </div>
        {/* Elegir una categoria principal incluye sus subcategorias;
            elegir una subcategoria filtra solo esa. */}
        <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg">
          <option value="">Todas las categorias</option>
          {opcionesJerarquia(categorias).map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
        <select value={filtroMC} onChange={(e) => setFiltroMC(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg">
          <option value="">MC Tarjeta: Todos</option>
          <option value="negativo">🔴 Negativo (≤0%)</option>
          <option value="critico">🔴 Critico (&lt;15%)</option>
          <option value="bajo">🟠 Bajo (15-25%)</option>
          <option value="medio">🟡 Medio (25-35%)</option>
          <option value="bueno">🟢 Bueno (35-50%)</option>
          <option value="excelente">💚 Excelente (≥50%)</option>
        </select>
        {cartaDisponible && (
          <select value={filtroCarta} onChange={(e) => setFiltroCarta(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg">
            <option value="">Carta: Todos</option>
            <option value="mapeado">🔗 En carta</option>
            <option value="no_mapeado">⚪ Sin mapear</option>
          </select>
        )}
        <Button onClick={() => openModal()}>
          <Plus size={16} /> Nuevo
        </Button>
      </div>

      {/* Table */}
      {isLoading ? <LoadingSpinner /> : productos.length === 0 ? <EmptyState message="No hay productos" /> : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-text-muted">
                {thSort('nombre', 'Producto', 'left')}
                <th className="px-4 py-3 font-medium text-center hidden md:table-cell">Carta</th>
                {thSort('updated', 'Ult. modificado', 'left', 'hidden sm:table-cell')}
                {thSort('costo', 'Costo', 'right')}
                {thSort('precio_local', 'Precio Local', 'right')}
                {thSort('mc_efec', 'MC Efec', 'center')}
                <th className="px-4 py-3 font-medium w-20"></th>
              </tr>
            </thead>
            <tbody>
              {productos.map((prod) => (
                <tr key={prod.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <div className="font-medium">{prod.nombre}</div>
                    {prod.categoria_nombre && (
                      <div className="text-xs text-text-muted">
                        {prod.categoria_icono} {prod.categoria_nombre}
                        {prod.subcategoria_nombre && <span className="text-text-muted/80"> › {prod.subcategoria_nombre}</span>}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center hidden md:table-cell">
                    {!cartaDisponible ? (
                      <span className="text-xs text-text-muted">—</span>
                    ) : (() => {
                      const entry = cartaPorProducto.get(prod.id);
                      if (entry) {
                        const nombres = entry.items.map((i) => i.nombre).join(', ');
                        const primero = entry.items[0];
                        return (
                          <a
                            href={`/carta`}
                            title={`En carta: ${nombres}. Click para abrir la Carta.`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-green-100 text-green-700 hover:bg-green-200"
                            onClick={(e) => { e.preventDefault(); window.open(`/carta?buscar=${encodeURIComponent(primero?.nombre || '')}`, '_blank'); }}
                          >
                            <Link2 size={11} /> En carta{entry.carta_count > 1 ? ` (${entry.carta_count})` : ''}
                          </a>
                        );
                      }
                      return (
                        <button
                          onClick={() => agregarCartaMut.mutate(prod.id)}
                          disabled={agregarCartaMut.isPending}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                          title="Crear el item de carta de este producto"
                        >
                          <Plus size={11} /> Agregar a carta
                        </button>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 text-text-muted whitespace-nowrap hidden sm:table-cell">
                    {prod.updated_at ? formatDate(prod.updated_at) : <span className="text-text-muted/50">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">{formatMoney(prod.costo_total)}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(prod.precio_publico)}</td>
                  <td className="px-4 py-3 text-center"><MCBadge value={prod.rentabilidades?.local_efectivo?.mc_neto || 0} size="sm" /></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => openModal(prod.id)} className="p-1.5 text-text-muted hover:text-primary cursor-pointer"><Pencil size={14} /></button>
                      <button onClick={() => setDeleteId(prod.id)} className="p-1.5 text-text-muted hover:text-danger cursor-pointer"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && <ProductoModal productoId={editingId} productos={productos} categorias={categorias} onClose={closeModal} />}

      <ConfirmDialog isOpen={deleteId !== null} onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        title="Eliminar producto" message="Esta seguro que desea eliminar este producto?" loading={deleteMut.isPending} />
    </div>
  );
}

function ProductoModal({ productoId, productos, categorias, onClose }: {
  productoId: number | null; productos: Producto[]; categorias: CategoriaProducto[]; onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const existing = productoId ? productos.find((p) => p.id === productoId) : null;

  const [nombre, setNombre] = useState(existing?.nombre || '');
  // Guarda el id FINAL (subcategoria si tiene, si no la raiz). Los 2 selects
  // de abajo son solo vistas derivadas de este unico estado.
  const [categoriaId, setCategoriaId] = useState(existing?.categoria_id?.toString() || '');
  const raizSeleccionada = (raizDe(categorias, categoriaId ? Number(categoriaId) : null) ?? '').toString();
  const subcategoriasDisponibles = hijasDe(categorias, raizSeleccionada ? Number(raizSeleccionada) : null);
  const subSeleccionada = categoriaId && categoriaId !== raizSeleccionada ? categoriaId : '';
  const [porciones, setPorciones] = useState(existing?.porciones || 1);
  const [precioPublico, setPrecioPublico] = useState(existing?.precio_publico || 0);
  const [esBorrador, setEsBorrador] = useState(!!existing?.es_borrador);
  const [pesoTotalG, setPesoTotalG] = useState<number | null>(existing?.peso_total_g ?? null);
  const [precioVentaKg, setPrecioVentaKg] = useState(0);
  const [varianteOpen, setVarianteOpen] = useState(false);
  const [varNombre, setVarNombre] = useState('');
  const [duplicarOpen, setDuplicarOpen] = useState(false);
  const [dupNombre, setDupNombre] = useState('');
  const [convertirOpen, setConvertirOpen] = useState(false);
  const [convRendimiento, setConvRendimiento] = useState<number>(0);
  const [convTipo, setConvTipo] = useState<'gramos' | 'porciones'>('porciones');
  const [varCantOriginal, setVarCantOriginal] = useState(0);
  const [varCantNueva, setVarCantNueva] = useState(0);
  const [varPorciones, setVarPorciones] = useState(1);
  const [varPrecioLocal, setVarPrecioLocal] = useState(0);
  const [notas, setNotas] = useState(existing?.notas || '');
  const [items, setItems] = useState<RecipeItem[]>(
    existing?.ingredientes?.map((i: any) => ({
      ingrediente_id: i.ingrediente_id || undefined,
      subreceta_id: i.subreceta_id || undefined,
      nombre: i.nombre,
      cantidad: Number(i.cantidad) || 0,
      unidad: i.unidad || 'g',
      costo_unitario: Number(i.costo_unitario) || 0,
      tipo: i.tipo,
    })) || []
  );
  const [search, setSearch] = useState('');

  const { data: ingData } = useQuery({ queryKey: ['ingredientes', {}], queryFn: () => ingredientesApi.getAll() });
  const { data: subData } = useQuery({ queryKey: ['subrecetas'], queryFn: () => subrecetasApi.getAll() });
  const { data: conceptosData } = useQuery({ queryKey: ['conceptos'], queryFn: () => conceptosApi.getAll() });

  const allIng = ingData?.data || [];
  const allSub = subData?.data || [];
  const resumenCanales = conceptosData?.data?.resumen_canales as ResumenCanales | undefined;

  // Enrich items with fecha_precio from allIng (loaded async)
  const enrichedItems = useMemo(() => {
    if (allIng.length === 0) return items;
    return items.map((item) => {
      if (item.tipo === 'ingrediente' && item.ingrediente_id && !item.fecha_precio) {
        const ing = allIng.find((i) => i.id === item.ingrediente_id);
        if (ing?.fecha_precio) return { ...item, fecha_precio: ing.fecha_precio };
      }
      return item;
    });
  }, [items, allIng]);

  const filteredIng = search.length >= 2 ? allIng.filter((i) =>
    normalizarTexto(i.nombre).includes(normalizarTexto(search)) &&
    !items.some((item) => item.tipo === 'ingrediente' && item.ingrediente_id === i.id)
  ).slice(0, 5) : [];

  const filteredSub = search.length >= 2 ? allSub.filter((s) =>
    normalizarTexto(s.nombre).includes(normalizarTexto(search)) &&
    !items.some((item) => item.tipo === 'subreceta' && item.subreceta_id === s.id)
  ).slice(0, 3) : [];

  const costoReceta = items.reduce((s, i) => s + i.cantidad * i.costo_unitario, 0);
  const costoPorPorcion = porciones > 0 ? costoReceta / porciones : 0;
  const precioPorKg = pesoTotalG && pesoTotalG > 0 ? (costoReceta / pesoTotalG) * 1000 : null;
  const mcKgTarjeta = precioPorKg !== null && precioVentaKg > 0 && resumenCanales ? calcularMCNeto(precioVentaKg, precioPorKg, resumenCanales.tarjeta) : null;
  const mcKgEfectivo = precioPorKg !== null && precioVentaKg > 0 && resumenCanales ? calcularMCNeto(precioVentaKg, precioPorKg, resumenCanales.efectivo) : null;

  const mcTarjeta = resumenCanales ? calcularMCNeto(precioPublico, costoPorPorcion, resumenCanales.tarjeta) : null;
  const mcEfectivo = resumenCanales ? calcularMCNeto(precioPublico, costoPorPorcion, resumenCanales.efectivo) : null;
  const foodCost = calcularFoodCost(precioPublico, costoPorPorcion);

  // Variante calculations
  const varRatio = varCantOriginal > 0 && varCantNueva > 0 ? varCantNueva / varCantOriginal : 0;
  const varCostoReceta = costoReceta * varRatio;
  const varCostoPorPorcion = varPorciones > 0 ? varCostoReceta / varPorciones : 0;
  const varMcTarjeta = varRatio > 0 && varPrecioLocal > 0 && resumenCanales ? calcularMCNeto(varPrecioLocal, varCostoPorPorcion, resumenCanales.tarjeta) : null;
  const varMcEfectivo = varRatio > 0 && varPrecioLocal > 0 && resumenCanales ? calcularMCNeto(varPrecioLocal, varCostoPorPorcion, resumenCanales.efectivo) : null;

  const varianteMut = useMutation({
    mutationFn: () => productosApi.create({
      nombre: varNombre,
      categoria_id: categoriaId ? Number(categoriaId) : undefined,
      porciones: varPorciones,
      precio_publico: varPrecioLocal,
      es_borrador: esBorrador ? 1 : 0,
      notas: notas ? `Variante de ${nombre}. ${notas}` : `Variante de ${nombre}`,
      peso_total_g: pesoTotalG && varRatio > 0 ? Math.round(pesoTotalG * varRatio) : null,
      ingredientes: items.map((i) => ({
        ingrediente_id: i.ingrediente_id,
        subreceta_id: i.subreceta_id,
        cantidad: Math.round(i.cantidad * varRatio * 100) / 100,
        unidad: i.unidad,
      })),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      toast.success(`Variante "${varNombre}" creada`);
      setVarianteOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleCrearVariante = () => {
    if (!varNombre.trim()) return toast.error('Nombre de variante requerido');
    if (varRatio <= 0) return toast.error('Completar cantidades original y variante');
    if (items.length === 0) return toast.error('El producto no tiene ingredientes');
    varianteMut.mutate();
  };

  // -------------------- DUPLICAR PRODUCTO --------------------
  // Copia todo el producto actual (ingredientes, porciones, peso, categoria, notas, borrador)
  // EXCEPTO los precios (se guardan en 0) y el historial de precio anterior.
  const duplicarMut = useMutation({
    mutationFn: () => productosApi.create({
      nombre: dupNombre.trim(),
      categoria_id: categoriaId ? Number(categoriaId) : undefined,
      porciones,
      precio_publico: 0,
      es_borrador: esBorrador ? 1 : 0,
      notas: notas || undefined,
      peso_total_g: pesoTotalG,
      ingredientes: items.map((i) => ({
        ingrediente_id: i.ingrediente_id,
        subreceta_id: i.subreceta_id,
        cantidad: i.cantidad,
        unidad: i.unidad,
      })),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      toast.success(`Producto "${dupNombre}" duplicado`);
      setDuplicarOpen(false);
      setDupNombre('');
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleDuplicar = () => {
    if (!dupNombre.trim()) return toast.error('Ingresa el nombre del nuevo producto');
    if (dupNombre.trim().toLowerCase() === nombre.trim().toLowerCase()) {
      return toast.error('El nombre debe ser distinto al original');
    }
    if (items.length === 0) return toast.error('El producto no tiene ingredientes para duplicar');
    duplicarMut.mutate();
  };

  // -------------------- CONVERTIR A SUBRECETA --------------------
  // Detecta si el producto tiene subrecetas anidadas (no se pueden incluir en una subreceta nueva).
  const subrecetasAnidadas = items.filter((i) => i.tipo === 'subreceta');
  const ingredientesDirectos = items.filter((i) => i.tipo === 'ingrediente');
  const tieneSubrecetasAnidadas = subrecetasAnidadas.length > 0;

  function abrirConvertir() {
    if (!productoId) return;
    if (ingredientesDirectos.length === 0) {
      toast.error('El producto no tiene ingredientes directos para convertir a subreceta');
      return;
    }
    // Pre-llenar rendimiento segun lo que ya tenga el producto
    if (pesoTotalG && pesoTotalG > 0) {
      setConvRendimiento(pesoTotalG);
      setConvTipo('gramos');
    } else {
      setConvRendimiento(porciones || 1);
      setConvTipo('porciones');
    }
    setConvertirOpen(true);
  }

  const convertirMut = useMutation({
    mutationFn: () => productosApi.convertToSubreceta(productoId!, {
      rendimiento_gramos: convRendimiento,
      tipo_rendimiento: convTipo,
      confirmar_subrecetas_anidadas: tieneSubrecetasAnidadas,
    }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      queryClient.invalidateQueries({ queryKey: ['subrecetas'] });
      const data = res?.data as { ingredientes_copiados?: number; subrecetas_anidadas_descartadas?: string[] } | undefined;
      const ingCount = data?.ingredientes_copiados ?? 0;
      const descartadas = data?.subrecetas_anidadas_descartadas ?? [];
      let msg = `Convertido a subreceta. ${ingCount} ingrediente(s) copiado(s)`;
      if (descartadas.length > 0) {
        msg += `. Descartadas: ${descartadas.join(', ')}`;
      }
      toast.success(msg, { duration: 5000 });
      setConvertirOpen(false);
      onClose();
    },
    onError: (err: Error) => toast.error(err.message || 'Error al convertir'),
  });

  const handleConvertir = () => {
    const r = parseFloat(String(convRendimiento));
    if (isNaN(r) || r <= 0) return toast.error('Rendimiento debe ser mayor a 0');
    if (convTipo !== 'gramos' && convTipo !== 'porciones') return toast.error('Tipo invalido');
    convertirMut.mutate();
  };

  const addIng = (ing: Ingrediente) => {
    setItems([...items, {
      ingrediente_id: ing.id,
      nombre: ing.nombre,
      cantidad: 0,
      unidad: ing.unidad_abrev || 'g',
      costo_unitario: Number(ing.costo_con_desperdicio) || 0,
      tipo: 'ingrediente',
      fecha_precio: ing.fecha_precio || undefined,
    }]);
    setSearch('');
  };

  const addSub = (sub: Subreceta) => {
    const rendimiento = Number(sub.rendimiento_gramos) || 1;
    const costoTotal = Number(sub.costo_total) || 0;
    const costoPor100g = Number(sub.costo_por_100g) || 0;
    const cu = sub.tipo_rendimiento === 'porciones'
      ? costoTotal / rendimiento
      : costoPor100g / 100;
    setItems([...items, {
      subreceta_id: sub.id,
      nombre: sub.nombre,
      cantidad: 0,
      unidad: sub.tipo_rendimiento === 'porciones' ? 'porc' : 'g',
      costo_unitario: cu,
      tipo: 'subreceta',
    }]);
    setSearch('');
  };

  const createMut = useMutation({
    mutationFn: () => productosApi.create({
      nombre, categoria_id: categoriaId ? Number(categoriaId) : undefined, porciones, precio_publico: precioPublico, es_borrador: esBorrador ? 1 : 0, notas: notas || undefined, peso_total_g: pesoTotalG,
      ingredientes: items.map((i) => ({ ingrediente_id: i.ingrediente_id, subreceta_id: i.subreceta_id, cantidad: i.cantidad, unidad: i.unidad })),
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['productos'] }); queryClient.invalidateQueries({ queryKey: ['carta'] }); toast.success('Producto creado'); onClose(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMut = useMutation({
    mutationFn: () => productosApi.update(productoId!, {
      nombre, categoria_id: categoriaId ? Number(categoriaId) : undefined, porciones, precio_publico: precioPublico, es_borrador: esBorrador ? 1 : 0, notas: notas || undefined, peso_total_g: pesoTotalG,
      ingredientes: items.map((i) => ({ ingrediente_id: i.ingrediente_id, subreceta_id: i.subreceta_id, cantidad: i.cantidad, unidad: i.unidad })),
    }),
    // Invalida carta tambien: nombre/precio/categoria del producto se heredan en la carta.
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['productos'] }); queryClient.invalidateQueries({ queryKey: ['carta'] }); queryClient.invalidateQueries({ queryKey: ['carta-resumen'] }); toast.success('Producto actualizado'); onClose(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSubmit = () => {
    if (!nombre.trim()) return toast.error('Nombre es requerido');
    if (items.length === 0) return toast.error('Agregar al menos 1 ingrediente');
    productoId ? updateMut.mutate() : createMut.mutate();
  };

  return (
    <Modal isOpen onClose={onClose} title={productoId ? 'Editar Producto' : 'Nuevo Producto'} size="xl"
      footer={
        <div className="flex items-center justify-between w-full gap-2">
          <div className="flex gap-2 flex-wrap">
            {productoId && (
              <>
                <Button variant="secondary" onClick={() => { setDupNombre(`${nombre} (copia)`); setDuplicarOpen(true); }}>
                  📋 Duplicar
                </Button>
                <Button variant="secondary" onClick={abrirConvertir}>
                  🔄 Convertir a subreceta
                </Button>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSubmit} loading={createMut.isPending || updateMut.isPending}>
              {productoId ? 'Guardar' : 'Crear'}
            </Button>
          </div>
        </div>
      }>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: form + recipe */}
        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-text-muted mb-1">Nombre *</label>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            {/* Categoria + subcategoria. `categoriaId` guarda SIEMPRE el id
                final que va al backend (la subcategoria si hay, si no la raiz),
                por eso el resto del formulario no cambia. */}
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Categoria</label>
              <select value={raizSeleccionada} onChange={(e) => setCategoriaId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg">
                <option value="">Sin categoria</option>
                {soloRaices(categorias).map((c) => <option key={c.id} value={c.id}>{c.icono} {c.nombre}</option>)}
              </select>
            </div>
            {subcategoriasDisponibles.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Subcategoria</label>
                <select
                  value={subSeleccionada}
                  onChange={(e) => setCategoriaId(e.target.value || raizSeleccionada)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg">
                  <option value="">— Sin subcategoria —</option>
                  {subcategoriasDisponibles.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Porciones</label>
              <NumericInput value={porciones} onChange={(v) => setPorciones(v || 1)} min={1} step="1"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Precio Local</label>
              <NumericInput value={precioPublico} onChange={(v) => setPrecioPublico(v)} min={0} step="0.01"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
              {costoPorPorcion > 0 && precioPublico > 0 && (
                <span className={`text-[11px] font-medium mt-0.5 block ${((precioPublico - costoPorPorcion) / costoPorPorcion) * 100 < 50 ? 'text-red-500' : ((precioPublico - costoPorPorcion) / costoPorPorcion) * 100 < 100 ? 'text-amber-500' : 'text-green-600'}`}>
                  Markup: {(((precioPublico - costoPorPorcion) / costoPorPorcion) * 100).toFixed(0)}%
                </span>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Notas</label>
            <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Notas opcionales..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={esBorrador} onChange={(e) => setEsBorrador(e.target.checked)} className="rounded" />
            Guardar como borrador
          </label>

          {/* Ingredient search */}
          <div className="relative">
            <label className="block text-xs font-medium text-text-muted mb-1">Agregar ingrediente o subreceta</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
            {(filteredIng.length > 0 || filteredSub.length > 0) && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {filteredIng.map((ing) => (
                  <button key={`ing-${ing.id}`} onClick={() => addIng(ing)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer">
                    {ing.nombre} <span className="text-xs text-text-muted">(Ingrediente - {ing.unidad_abrev})</span>
                  </button>
                ))}
                {filteredSub.map((sub) => (
                  <button key={`sub-${sub.id}`} onClick={() => addSub(sub)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 cursor-pointer">
                    {sub.nombre} <span className="text-xs text-blue-600">(Subreceta)</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Recipe items */}
          {items.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="bg-gray-50 text-text-muted text-xs">
                    <th className="px-3 py-2 text-left font-medium">Item</th>
                    <th className="px-3 py-2 text-right font-medium w-24">Cant.</th>
                    <th className="px-3 py-2 text-center font-medium w-12">U.</th>
                    <th className="px-3 py-2 text-right font-medium w-24">Subtotal</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {enrichedItems.map((item, idx) => {
                    const stale = item.tipo === 'ingrediente' && isStalePrice(item.fecha_precio);
                    // Link a la pagina correspondiente (ingrediente o subreceta) con deep-link ?openId=N
                    // Abre en nueva pestania para que el user no pierda lo que esta editando.
                    const targetId = item.tipo === 'ingrediente' ? item.ingrediente_id : item.subreceta_id;
                    const targetPath = item.tipo === 'ingrediente' ? '/ingredientes' : '/subrecetas';
                    const href = targetId ? `${targetPath}?openId=${targetId}` : null;
                    return (
                    <tr key={idx} className="border-t border-gray-100">
                      <td className="px-3 py-2">
                        {href ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`${stale ? 'text-red-600 font-medium' : 'text-primary'} hover:underline cursor-pointer`}
                            title={`Abrir ${item.tipo} en nueva pestania`}
                          >
                            {item.nombre}
                          </a>
                        ) : (
                          <span className={stale ? 'text-red-600 font-medium' : ''}>{item.nombre}</span>
                        )}
                        <span className={`ml-1 text-xs ${item.tipo === 'subreceta' ? 'text-blue-500' : 'text-text-muted'}`}>
                          ({item.tipo})
                        </span>
                        {stale && (
                          <div className="text-[10px] text-red-500 leading-tight">Precio no actualizado hace 45 dias</div>
                        )}
                      </td>
                      <td className="px-3 py-1">
                        <NumericInput value={item.cantidad} onChange={(v) => { const n = [...items]; n[idx].cantidad = v; setItems(n); }}
                          min={0} step="0.01" className="w-full text-right px-2 py-1 text-sm border border-gray-300 rounded" />
                      </td>
                      <td className="px-3 py-2 text-center text-text-muted text-xs">{item.unidad}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(item.cantidad * item.costo_unitario)}</td>
                      <td className="px-1 py-2">
                        <button onClick={() => setItems(items.filter((_, i) => i !== idx))} className="text-text-muted hover:text-danger cursor-pointer">
                          <X size={14} />
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          )}

          {/* Cost summary */}
          <div className="p-3 bg-gray-50 rounded-lg space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-text-muted">Costo total preparacion</span>
              <span className="font-bold">{formatMoney(costoReceta)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-text-muted">Costo por porcion</span>
              <span className="font-bold">{formatMoney(costoPorPorcion)}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-gray-200">
              <div className="flex items-center gap-2">
                <span className="text-sm text-text-muted">Peso total (g)</span>
                <NumericInput value={pesoTotalG ?? 0} onChange={(v) => setPesoTotalG(v || null)} min={0} step="1"
                  placeholder="Ej: 1200"
                  className="w-24 text-right px-2 py-1 text-sm border border-gray-300 rounded" />
              </div>
              <div className="text-right">
                <span className="text-xs text-text-muted block">Costo/kg</span>
                <span className="font-bold text-primary">{precioPorKg !== null ? formatMoney(precioPorKg) : '—'}</span>
              </div>
            </div>

            {/* Venta por kg */}
            {precioPorKg !== null && (
              <div className="pt-2 border-t border-gray-200 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-text-muted">Precio venta/kg</span>
                  <NumericInput value={precioVentaKg} onChange={(v) => setPrecioVentaKg(v)} min={0} step="0.01"
                    placeholder="Ej: 15000"
                    className="w-28 text-right px-2 py-1 text-sm border border-gray-300 rounded" />
                </div>
                {mcKgTarjeta && mcKgEfectivo && (
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: '💳 Tarjeta', data: mcKgTarjeta },
                      { label: '💵 Efectivo', data: mcKgEfectivo },
                    ].map((ch) => (
                      <div key={ch.label} className="p-2 bg-white rounded border border-gray-200">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-medium">{ch.label}</span>
                          <MCBadge value={ch.data.mc} size="sm" />
                        </div>
                        <div className="space-y-0.5 text-[11px] text-text-muted">
                          <div className="flex justify-between"><span>Precio</span><span>{formatMoney(precioVentaKg)}</span></div>
                          {ch.data.deducciones.map((d, i) => (
                            <div key={i} className="flex justify-between"><span>(-) {d.nombre} {d.porcentaje}%</span><span>{formatMoney(d.monto)}</span></div>
                          ))}
                          <div className="flex justify-between"><span>(-) Costo/kg</span><span>{formatMoney(precioPorKg)}</span></div>
                          <div className="flex justify-between font-bold text-text-primary pt-0.5 border-t border-gray-100">
                            <span>Ganancia/kg</span>
                            <span style={{ color: getMCColor(ch.data.mc) }}>{formatMoney(ch.data.ganancia)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Crear Variante */}
          {productoId && items.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <label className="flex items-center gap-2 px-3 py-2 bg-gray-50 cursor-pointer text-sm font-medium"
                onClick={() => setVarianteOpen(!varianteOpen)}>
                <Copy size={14} className="text-primary" />
                Crear variante de este producto
                <input type="checkbox" checked={varianteOpen}
                  onChange={(e) => setVarianteOpen(e.target.checked)}
                  className="ml-auto rounded" />
              </label>

              {varianteOpen && (
                <div className="p-3 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">Nombre variante *</label>
                    <input value={varNombre} onChange={(e) => setVarNombre(e.target.value)}
                      placeholder={`Ej: ${nombre} - 500ml`}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-text-muted mb-1">Cant. original</label>
                      <NumericInput value={varCantOriginal} onChange={(v) => setVarCantOriginal(v)} min={0} step="1"
                        placeholder="Ej: 1500"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-text-muted mb-1">Cant. variante</label>
                      <NumericInput value={varCantNueva} onChange={(v) => setVarCantNueva(v)} min={0} step="1"
                        placeholder="Ej: 500"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    </div>
                  </div>

                  {varRatio > 0 && (
                    <div className="text-xs text-text-muted bg-blue-50 px-3 py-2 rounded">
                      Ratio: <span className="font-bold text-blue-700">{(varRatio * 100).toFixed(1)}%</span> del original
                      &nbsp;— Ingredientes se escalan proporcionalmente
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-text-muted mb-1">Porciones</label>
                      <NumericInput value={varPorciones} onChange={(v) => setVarPorciones(v || 1)} min={1} step="1"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-text-muted mb-1">Precio Local</label>
                      <NumericInput value={varPrecioLocal} onChange={(v) => setVarPrecioLocal(v)} min={0} step="0.01"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    </div>
                  </div>

                  {/* Variante cost preview */}
                  {varRatio > 0 && (
                    <div className="p-3 bg-gray-50 rounded-lg space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-text-muted">Costo variante</span>
                        <span className="font-bold">{formatMoney(varCostoReceta)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-text-muted">Costo/porcion</span>
                        <span className="font-bold">{formatMoney(varCostoPorPorcion)}</span>
                      </div>
                      {varMcTarjeta && varMcEfectivo && (
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-200">
                          {[
                            { label: '💳 Tarjeta', data: varMcTarjeta },
                            { label: '💵 Efectivo', data: varMcEfectivo },
                          ].map((ch) => (
                            <div key={ch.label} className="flex justify-between items-center text-xs">
                              <span>{ch.label}</span>
                              <MCBadge value={ch.data.mc} size="sm" />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <Button onClick={handleCrearVariante} loading={varianteMut.isPending} className="w-full">
                    <Copy size={14} /> Crear variante como producto nuevo
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: MC Neto breakdown */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-text-primary">Rentabilidad por canal</h3>
          {[
            { label: 'Tarjeta', icon: '💳', data: mcTarjeta, precio: precioPublico },
            { label: 'Efectivo', icon: '💵', data: mcEfectivo, precio: precioPublico },
          ].map((ch) => (
            <div key={ch.label} className="p-3 bg-gray-50 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium">{ch.icon} {ch.label}</span>
                {ch.data && <MCBadge value={ch.data.mc} size="sm" />}
              </div>
              {ch.data && (
                <div className="space-y-1 text-xs text-text-muted">
                  <div className="flex justify-between"><span>Precio</span><span>{formatMoney(ch.precio)}</span></div>
                  {ch.data.deducciones.map((d, i) => (
                    <div key={i} className="flex justify-between"><span>(-) {d.nombre} {d.porcentaje}%</span><span>{formatMoney(d.monto)}</span></div>
                  ))}
                  <div className="flex justify-between"><span>(-) Costo</span><span>{formatMoney(costoPorPorcion)}</span></div>
                  <div className="flex justify-between font-bold text-text-primary pt-1 border-t border-gray-200">
                    <span>Ganancia</span>
                    <span style={{ color: getMCColor(ch.data.mc) }}>{formatMoney(ch.data.ganancia)}</span>
                  </div>
                  {/* Food cost: el costo como % del precio. Es el mismo en todos
                      los canales (el precio no cambia), pero se muestra en cada
                      cuadro para leer la rentabilidad completa de un vistazo. */}
                  <div className="flex justify-between">
                    <span title="Costo del plato sobre el precio de venta. Referencia: hasta 30% bien, 30-40% atencion, +40% alto.">
                      Food cost
                    </span>
                    {/* Sin precio no hay food cost: mostrar 0% seria enganoso
                        (parece un costo excelente cuando en realidad falta el precio) */}
                    {precioPublico > 0 ? (
                      <span className="font-medium" style={{ color: getFoodCostColor(foodCost) }}>
                        {foodCost.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-text-muted/60">—</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Mini-modal: duplicar producto */}
      {duplicarOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setDuplicarOpen(false); }}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-bold text-text-primary flex items-center gap-2">
                📋 Duplicar producto
              </h3>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-900">
                Se copiaran los <strong>ingredientes</strong>, <strong>porciones</strong>, <strong>peso</strong>, <strong>categoria</strong> y <strong>notas</strong> del producto actual.
                Los <strong>precios</strong> quedaran en 0 para que los cargues manualmente.
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Nombre del nuevo producto *</label>
                <input
                  value={dupNombre}
                  onChange={(e) => setDupNombre(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleDuplicar(); }}
                  autoFocus
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="Ej: Torta bruce keto (copia)"
                />
              </div>
              <div className="text-[11px] text-text-muted">
                Ingredientes a copiar: <strong>{items.length}</strong>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDuplicarOpen(false)}>Cancelar</Button>
              <Button onClick={handleDuplicar} loading={duplicarMut.isPending}>
                Duplicar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Mini-modal: convertir producto a subreceta */}
      {convertirOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setConvertirOpen(false); }}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-bold text-text-primary flex items-center gap-2">
                🔄 Convertir producto a subreceta
              </h3>
            </div>
            <div className="px-5 py-4 space-y-4 overflow-y-auto">
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-900 space-y-1">
                <p className="font-semibold">⚠ Esta accion es irreversible:</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>Se creara una nueva subreceta llamada <strong>"{nombre}"</strong></li>
                  <li>El <strong>producto se eliminara</strong> permanentemente (con sus precios e historial de cambios)</li>
                  <li>Los <strong>ingredientes directos ({ingredientesDirectos.length})</strong> se copiaran a la nueva subreceta</li>
                  {tieneSubrecetasAnidadas && (
                    <li className="text-red-700">
                      <strong>{subrecetasAnidadas.length} subreceta(s) anidada(s) NO se incluiran</strong> (las subrecetas no soportan otras subrecetas adentro):{' '}
                      {subrecetasAnidadas.map((s) => s.nombre).join(', ')}
                    </li>
                  )}
                  <li>Los registros de produccion con este nombre se mantendran (ahora como subreceta)</li>
                </ul>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Tipo de rendimiento *</label>
                  <select
                    value={convTipo}
                    onChange={(e) => setConvTipo(e.target.value as 'gramos' | 'porciones')}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="porciones">Porciones</option>
                    <option value="gramos">Gramos</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">
                    Rendimiento * {convTipo === 'gramos' ? '(g)' : '(porciones)'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={convRendimiento || ''}
                    onChange={(e) => setConvRendimiento(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>

              <div className="text-[11px] text-text-muted">
                {convTipo === 'porciones'
                  ? 'La subreceta rinde N porciones. Cuando un producto la use, podras indicar cuantas porciones consume.'
                  : 'La subreceta rinde N gramos totales. Cuando un producto la use, podras indicar cuantos gramos consume.'}
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConvertirOpen(false)}>Cancelar</Button>
              <Button onClick={handleConvertir} loading={convertirMut.isPending}>
                Convertir a subreceta
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
