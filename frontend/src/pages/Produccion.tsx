import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Plus, Trash2, Save, Clock, User, Package, Calendar,
  X, ChevronDown, ChevronUp, Users,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { produccionApi } from '../api/produccion';
import type {
  Operario, ProduccionRegistroInput, ProductoCatalogo,
} from '../types';
import Button from '../components/common/Button';
import NumericInput from '../components/common/NumericInput';

const ESTADOS = ['Completado', 'En proceso', 'Cancelado'] as const;

function todayStr(): string {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// =============================================================================
// MAIN — Full-screen registration page (no sidebar, no header)
// =============================================================================
export default function Produccion() {
  const queryClient = useQueryClient();
  const today = todayStr();

  const [fecha, setFecha] = useState(today);
  const [horaIngreso, setHoraIngreso] = useState('');
  const [horaSalida, setHoraSalida] = useState('');
  const [operarioId, setOperarioId] = useState('');
  const [rows, setRows] = useState<RegistroRow[]>([createEmptyRow()]);
  const [showOperarios, setShowOperarios] = useState(false);

  const { data: catalogoData } = useQuery({
    queryKey: ['produccion-catalogo'],
    queryFn: produccionApi.getCatalogo,
  });
  const catalogo: ProductoCatalogo[] = catalogoData?.data || [];

  const { data: operariosData } = useQuery({
    queryKey: ['produccion-operarios'],
    queryFn: produccionApi.getOperarios,
  });
  const operarios: Operario[] = operariosData?.data || [];

  const saveMut = useMutation({
    mutationFn: (registros: ProduccionRegistroInput[]) => produccionApi.saveRegistros(registros),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['produccion-registros'] });
      queryClient.invalidateQueries({ queryKey: ['produccion-reportes'] });
      toast.success(`${vars.length} registro${vars.length > 1 ? 's' : ''} guardado${vars.length > 1 ? 's' : ''}`);
      setRows([createEmptyRow()]);
      setHoraIngreso('');
      setHoraSalida('');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateRow = useCallback((idx: number, updates: Partial<RegistroRow>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...updates } : r)));
  }, []);

  const addRow = () => setRows((prev) => [...prev, createEmptyRow()]);

  const removeRow = (idx: number) => {
    if (rows.length <= 1) return;
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const selectedOperario = operarios.find((o) => String(o.id) === operarioId);

  const handleSave = () => {
    const valid = rows.filter((r) => r.producto_nombre.trim());
    if (valid.length === 0) {
      toast.error('Agrega al menos 1 producto');
      return;
    }
    if (!operarioId) {
      toast.error('Selecciona un operario');
      return;
    }

    const registros: ProduccionRegistroInput[] = valid.map((r) => ({
      fecha,
      hora_ingreso: horaIngreso || null,
      hora_salida: horaSalida || null,
      producto_nombre: r.producto_nombre.trim(),
      producto_id: r.producto_id,
      cantidad: r.cantidad || 1,
      estado: r.estado,
      observacion: r.observacion || null,
      operario_id: Number(operarioId),
      operario_nombre: selectedOperario?.nombre || null,
    }));

    saveMut.mutate(registros);
  };

  const validCount = rows.filter((r) => r.producto_nombre.trim()).length;

  return (
    <div className="min-h-screen bg-bg-light">
      {/* Top bar with branding */}
      <div className="bg-sidebar px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">☕</span>
          <span className="text-lg font-bold text-primary">Produccion</span>
        </div>
        <div className="text-white/60 text-xs">
          {fecha}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* Operario selector - PROMINENT */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <label className="block text-xs font-semibold text-text-muted mb-1.5">
            <User size={12} className="inline mr-1" />Operario *
          </label>
          <select
            value={operarioId}
            onChange={(e) => setOperarioId(e.target.value)}
            className={`w-full px-3 py-3 text-base font-medium border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white ${
              operarioId ? 'border-green-400 bg-green-50/30' : 'border-red-300 bg-red-50/20'
            }`}
          >
            <option value="">-- Seleccionar operario --</option>
            {operarios.map((op) => (
              <option key={op.id} value={String(op.id)}>{op.nombre}</option>
            ))}
          </select>
        </div>

        {/* Fecha + horas */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1">
                <Calendar size={12} className="inline mr-1" />Fecha
              </label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1">
                <Clock size={12} className="inline mr-1" />Ingreso
              </label>
              <input
                type="time"
                value={horaIngreso}
                onChange={(e) => setHoraIngreso(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1">
                <Clock size={12} className="inline mr-1" />Salida
              </label>
              <input
                type="time"
                value={horaSalida}
                onChange={(e) => setHoraSalida(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
        </div>

        {/* Product rows - card layout for tablet */}
        <div className="space-y-3">
          {rows.map((row, idx) => (
            <ProductoCard
              key={row.key}
              row={row}
              idx={idx}
              catalogo={catalogo}
              updateRow={updateRow}
              removeRow={removeRow}
              canRemove={rows.length > 1}
            />
          ))}
        </div>

        {/* Add row + Save */}
        <div className="flex items-center gap-3">
          <button
            onClick={addRow}
            className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium text-primary border-2 border-dashed border-primary/30 rounded-xl hover:bg-primary/5 cursor-pointer transition-colors"
          >
            <Plus size={18} /> Agregar otro producto
          </button>
        </div>

        <Button
          onClick={handleSave}
          loading={saveMut.isPending}
          className="w-full py-3.5 text-base"
          disabled={validCount === 0}
        >
          <Save size={18} /> Guardar Produccion ({validCount})
        </Button>

        {/* Operarios management */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <button
            onClick={() => setShowOperarios(!showOperarios)}
            className="w-full flex items-center justify-between text-sm font-medium text-text-muted hover:text-text-primary cursor-pointer py-1"
          >
            <span className="flex items-center gap-2">
              <Users size={16} />
              Gestionar Operarios ({operarios.length})
            </span>
            {showOperarios ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {showOperarios && <OperariosManager operarios={operarios} />}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// TYPES
// =============================================================================
interface RegistroRow {
  key: number;
  producto_nombre: string;
  producto_id: number | null;
  cantidad: number;
  estado: string;
  observacion: string;
}

function createEmptyRow(): RegistroRow {
  return {
    key: Date.now() + Math.random(),
    producto_nombre: '',
    producto_id: null,
    cantidad: 1,
    estado: 'Completado',
    observacion: '',
  };
}

// =============================================================================
// PRODUCTO CARD — touch-optimized card for each product row
// =============================================================================
function ProductoCard({ row, idx, catalogo, updateRow, removeRow, canRemove }: {
  row: RegistroRow;
  idx: number;
  catalogo: ProductoCatalogo[];
  updateRow: (idx: number, updates: Partial<RegistroRow>) => void;
  removeRow: (idx: number) => void;
  canRemove: boolean;
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click/touch
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [dropdownOpen]);

  const filtered = useMemo(() => {
    if (!searchText.trim()) return catalogo;
    const q = searchText.toLowerCase();
    return catalogo.filter((p) => p.nombre.toLowerCase().includes(q));
  }, [catalogo, searchText]);

  const selectProduct = (prod: ProductoCatalogo) => {
    updateRow(idx, { producto_nombre: prod.nombre, producto_id: prod.id });
    setDropdownOpen(false);
    setSearchText('');
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
      {/* Row header with number + delete */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-text-muted bg-gray-100 rounded-full w-6 h-6 flex items-center justify-center">
          {idx + 1}
        </span>
        {canRemove && (
          <button
            onClick={() => removeRow(idx)}
            className="text-text-muted hover:text-danger cursor-pointer p-2 -m-2"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      {/* Producto selector */}
      <div ref={dropdownRef} className="relative">
        <label className="block text-xs font-semibold text-text-muted mb-1">
          <Package size={11} className="inline mr-1" />Producto
        </label>
        <input
          ref={inputRef}
          value={dropdownOpen ? searchText : row.producto_nombre}
          onChange={(e) => {
            setSearchText(e.target.value);
            if (!dropdownOpen) setDropdownOpen(true);
          }}
          onFocus={() => {
            setSearchText('');
            setDropdownOpen(true);
          }}
          placeholder="Buscar producto o subreceta..."
          className={`w-full px-3 py-3 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 ${
            row.producto_nombre ? 'border-green-300 bg-green-50/30' : 'border-gray-300'
          }`}
          autoComplete="off"
        />
        {row.producto_nombre && !dropdownOpen && (
          <button
            onClick={() => {
              updateRow(idx, { producto_nombre: '', producto_id: null });
              setSearchText('');
              inputRef.current?.focus();
            }}
            className="absolute right-2 top-[30px] p-1 text-text-muted hover:text-danger cursor-pointer"
          >
            <X size={14} />
          </button>
        )}

        {/* Dropdown list */}
        {dropdownOpen && (
          <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-4 py-3 text-sm text-text-muted text-center">
                No se encontraron productos
              </div>
            ) : (
              filtered.map((prod) => (
                <button
                  key={`${prod.tipo}-${prod.id}`}
                  onClick={() => selectProduct(prod)}
                  className="w-full text-left px-4 py-3 text-sm hover:bg-primary/10 active:bg-primary/20 cursor-pointer flex items-center gap-2 border-b border-gray-50 last:border-0"
                >
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0 ${
                    prod.tipo === 'subreceta' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                  }`}>
                    {prod.tipo === 'subreceta' ? 'SUB' : 'PROD'}
                  </span>
                  <span className="truncate">{prod.nombre}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Cantidad + Estado — 2 cols */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-text-muted mb-1">Cantidad</label>
          <NumericInput
            value={row.cantidad}
            onChange={(v) => updateRow(idx, { cantidad: v })}
            min={0}
            step="1"
            className="w-full px-3 py-3 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 text-center font-mono text-base"
            placeholder="1"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-text-muted mb-1">Estado</label>
          <select
            value={row.estado}
            onChange={(e) => updateRow(idx, { estado: e.target.value })}
            className="w-full px-2 py-3 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
          >
            {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
      </div>

      {/* Observacion */}
      <div>
        <input
          value={row.observacion}
          onChange={(e) => updateRow(idx, { observacion: e.target.value })}
          placeholder="Observacion (opcional)..."
          className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>
    </div>
  );
}

// =============================================================================
// OPERARIOS MANAGER
// =============================================================================
function OperariosManager({ operarios }: { operarios: Operario[] }) {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');

  const createMut = useMutation({
    mutationFn: (nombre: string) => produccionApi.createOperario(nombre),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['produccion-operarios'] });
      setNewName('');
      toast.success('Operario creado');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => produccionApi.deleteOperario(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['produccion-operarios'] });
      toast.success('Operario eliminado');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="mt-4 space-y-3">
      <div className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nombre del operario"
          className="flex-1 px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newName.trim()) createMut.mutate(newName.trim());
          }}
        />
        <Button
          onClick={() => newName.trim() && createMut.mutate(newName.trim())}
          loading={createMut.isPending}
        >
          <Plus size={14} /> Agregar
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {operarios.map((op) => (
          <div
            key={op.id}
            className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm"
          >
            <User size={14} className="text-text-muted shrink-0" />
            <span className="font-medium">{op.nombre}</span>
            <button
              onClick={() => {
                if (confirm(`Eliminar operario "${op.nombre}"?`)) deleteMut.mutate(op.id);
              }}
              className="text-text-muted hover:text-danger cursor-pointer p-1 -mr-1"
            >
              <X size={14} />
            </button>
          </div>
        ))}
        {operarios.length === 0 && (
          <p className="text-sm text-text-muted">No hay operarios. Agrega uno arriba.</p>
        )}
      </div>
    </div>
  );
}
