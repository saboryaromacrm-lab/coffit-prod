import { useState } from 'react';
import { Plus, Trash2, Factory, User, Clock } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { produccionApi, type OperarioInput, type TurnoInput } from '../../api/produccion';
import type { ModoRegistro, Operario, Turno } from '../../types';
import Button from '../common/Button';
import ConfirmDialog from '../common/ConfirmDialog';

// ============================================================================
// PRODUCCION: operarios (con su forma de asentar la produccion) y turnos.
// Los cambios se guardan al salir de cada campo.
// ============================================================================

const input = 'px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30';

const MODOS: { value: ModoRegistro; label: string }[] = [
  { value: 'horario', label: 'Por horario' },
  { value: 'turno', label: 'Por turno' },
];

const hhmm = (t: string | null) => t?.slice(0, 5) ?? '';

type Borrar = { tipo: 'operario' | 'turno'; id: number; nombre: string } | null;

export default function ProduccionSection() {
  const qc = useQueryClient();
  const [borrar, setBorrar] = useState<Borrar>(null);

  const { data: opData } = useQuery({ queryKey: ['produccion-operarios'], queryFn: produccionApi.getOperarios });
  const { data: turnosData } = useQuery({ queryKey: ['produccion-turnos'], queryFn: produccionApi.getTurnos });
  const operarios: Operario[] = opData?.data || [];
  const turnos: Turno[] = turnosData?.data || [];

  // Perdidas usa la misma lista de operarios con otra clave.
  const refrescarOperarios = () => {
    qc.invalidateQueries({ queryKey: ['produccion-operarios'] });
    qc.invalidateQueries({ queryKey: ['operarios'] });
  };
  const refrescarTurnos = () => qc.invalidateQueries({ queryKey: ['produccion-turnos'] });
  const avisarError = (err: Error) => toast.error(err.message);

  const crearOperario = useMutation({
    mutationFn: produccionApi.createOperario,
    onSuccess: () => { refrescarOperarios(); toast.success('Operario creado'); },
    onError: avisarError,
  });
  const editarOperario = useMutation({
    mutationFn: ({ id, data }: { id: number; data: OperarioInput }) => produccionApi.updateOperario(id, data),
    onSuccess: () => { refrescarOperarios(); toast.success('Operario guardado'); },
    onError: (err: Error) => { refrescarOperarios(); avisarError(err); },
  });
  const crearTurno = useMutation({
    mutationFn: produccionApi.createTurno,
    onSuccess: () => { refrescarTurnos(); toast.success('Turno creado'); },
    onError: avisarError,
  });
  const editarTurno = useMutation({
    mutationFn: ({ id, data }: { id: number; data: TurnoInput }) => produccionApi.updateTurno(id, data),
    onSuccess: () => { refrescarTurnos(); toast.success('Turno guardado'); },
    onError: (err: Error) => { refrescarTurnos(); avisarError(err); },
  });
  const eliminar = useMutation({
    mutationFn: (b: NonNullable<Borrar>) => (b.tipo === 'operario' ? produccionApi.deleteOperario(b.id) : produccionApi.deleteTurno(b.id)),
    onSuccess: (_, b) => {
      if (b.tipo === 'operario') refrescarOperarios(); else refrescarTurnos();
      toast.success(b.tipo === 'operario' ? 'Operario eliminado' : 'Turno eliminado');
      setBorrar(null);
    },
    onError: avisarError,
  });

  const porTurno = operarios.some((o) => o.modo_registro === 'turno');

  return (
    <section className="bg-white rounded-xl border border-gray-100 p-5">
      <h2 className="text-sm font-semibold flex items-center gap-2 mb-1"><Factory size={16} /> Producción: operarios y turnos</h2>
      <p className="text-xs text-text-muted mb-4">
        Cada operario asienta su producción <strong>por horario</strong> (hora de ingreso y salida) o <strong>por turno</strong> (elige uno de los turnos de abajo).
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Operarios */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-text-muted flex items-center gap-1.5"><User size={13} /> Operarios ({operarios.length})</h3>
          {operarios.map((op) => (
            <FilaOperario key={op.id} operario={op}
              onGuardar={(data) => editarOperario.mutate({ id: op.id, data })}
              onBorrar={() => setBorrar({ tipo: 'operario', id: op.id, nombre: op.nombre })} />
          ))}
          {operarios.length === 0 && <p className="text-sm text-text-muted italic">No hay operarios.</p>}
          <NuevoOperario onCrear={(data, listo) => crearOperario.mutate(data, { onSuccess: listo })} cargando={crearOperario.isPending} />
        </div>

        {/* Turnos */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-text-muted flex items-center gap-1.5"><Clock size={13} /> Turnos ({turnos.length})</h3>
          {turnos.map((t) => (
            <FilaTurno key={t.id} turno={t}
              onGuardar={(data) => editarTurno.mutate({ id: t.id, data })}
              onBorrar={() => setBorrar({ tipo: 'turno', id: t.id, nombre: t.nombre })} />
          ))}
          {turnos.length === 0 && (
            <p className={`text-sm italic ${porTurno ? 'text-amber-600' : 'text-text-muted'}`}>
              No hay turnos{porTurno ? ': los operarios "por turno" no van a poder registrar.' : '.'}
            </p>
          )}
          <NuevoTurno onCrear={(data, listo) => crearTurno.mutate(data, { onSuccess: listo })} cargando={crearTurno.isPending} />
          <p className="text-[11px] text-text-muted">El horario es opcional: si lo cargás, los turnos se ordenan por hora.</p>
        </div>
      </div>

      <ConfirmDialog
        isOpen={borrar !== null}
        onClose={() => setBorrar(null)}
        onConfirm={() => borrar && eliminar.mutate(borrar)}
        title={borrar?.tipo === 'turno' ? 'Eliminar turno' : 'Eliminar operario'}
        message={`¿Eliminar "${borrar?.nombre}"? Los registros que ya tiene lo siguen mostrando.`}
        loading={eliminar.isPending}
      />
    </section>
  );
}

function SelectModo({ value, onChange }: { value: ModoRegistro; onChange: (m: ModoRegistro) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as ModoRegistro)} className={`${input} bg-white`}>
      {MODOS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
    </select>
  );
}

function BotonBorrar({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="p-1.5 text-text-muted hover:text-danger shrink-0" title="Eliminar">
      <Trash2 size={14} />
    </button>
  );
}

function FilaOperario({ operario, onGuardar, onBorrar }: {
  operario: Operario; onGuardar: (d: OperarioInput) => void; onBorrar: () => void;
}) {
  const [nombre, setNombre] = useState(operario.nombre);
  const guardarNombre = () => {
    if (nombre.trim() && nombre.trim() !== operario.nombre) onGuardar({ nombre: nombre.trim(), modo_registro: operario.modo_registro });
    else setNombre(operario.nombre);
  };
  return (
    <div className="flex items-center gap-2">
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} onBlur={guardarNombre}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} className={`${input} flex-1 min-w-0`} />
      <SelectModo value={operario.modo_registro} onChange={(m) => onGuardar({ nombre: operario.nombre, modo_registro: m })} />
      <BotonBorrar onClick={onBorrar} />
    </div>
  );
}

function NuevoOperario({ onCrear, cargando }: { onCrear: (d: OperarioInput, listo: () => void) => void; cargando: boolean }) {
  const [nombre, setNombre] = useState('');
  const [modo, setModo] = useState<ModoRegistro>('horario');
  const crear = () => nombre.trim() && onCrear({ nombre: nombre.trim(), modo_registro: modo }, () => setNombre(''));
  return (
    <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && crear()}
        placeholder="Nuevo operario" className={`${input} flex-1 min-w-0`} />
      <SelectModo value={modo} onChange={setModo} />
      <Button size="sm" onClick={crear} loading={cargando} disabled={!nombre.trim()}><Plus size={14} /></Button>
    </div>
  );
}

// Nombre y horario de un turno; se guarda al salir de un campo si cambio algo.
function CamposTurno({ valor, onChange, onBlur }: {
  valor: TurnoInput; onChange: (v: TurnoInput) => void; onBlur?: () => void;
}) {
  return (
    <>
      <input value={valor.nombre} onChange={(e) => onChange({ ...valor, nombre: e.target.value })} onBlur={onBlur}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} placeholder="Ej. Siesta" maxLength={50}
        className={`${input} flex-1 min-w-0`} />
      <input type="time" value={valor.hora_desde ?? ''} onChange={(e) => onChange({ ...valor, hora_desde: e.target.value || null })}
        onBlur={onBlur} className={`${input} w-24 px-2`} title="Desde (opcional)" />
      <input type="time" value={valor.hora_hasta ?? ''} onChange={(e) => onChange({ ...valor, hora_hasta: e.target.value || null })}
        onBlur={onBlur} className={`${input} w-24 px-2`} title="Hasta (opcional)" />
    </>
  );
}

function FilaTurno({ turno, onGuardar, onBorrar }: {
  turno: Turno; onGuardar: (d: TurnoInput) => void; onBorrar: () => void;
}) {
  const original: TurnoInput = { nombre: turno.nombre, hora_desde: turno.hora_desde && hhmm(turno.hora_desde), hora_hasta: turno.hora_hasta && hhmm(turno.hora_hasta) };
  const [valor, setValor] = useState(original);
  const guardar = () => {
    const cambio = valor.nombre.trim() !== original.nombre || valor.hora_desde !== original.hora_desde || valor.hora_hasta !== original.hora_hasta;
    if (!valor.nombre.trim()) setValor(original);
    else if (cambio) onGuardar({ ...valor, nombre: valor.nombre.trim() });
  };
  return (
    <div className="flex items-center gap-2">
      <CamposTurno valor={valor} onChange={setValor} onBlur={guardar} />
      <BotonBorrar onClick={onBorrar} />
    </div>
  );
}

function NuevoTurno({ onCrear, cargando }: { onCrear: (d: TurnoInput, listo: () => void) => void; cargando: boolean }) {
  const vacio: TurnoInput = { nombre: '', hora_desde: null, hora_hasta: null };
  const [valor, setValor] = useState(vacio);
  const crear = () => valor.nombre.trim() && onCrear({ ...valor, nombre: valor.nombre.trim() }, () => setValor(vacio));
  return (
    <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
      <CamposTurno valor={valor} onChange={setValor} />
      <Button size="sm" onClick={crear} loading={cargando} disabled={!valor.nombre.trim()}><Plus size={14} /></Button>
    </div>
  );
}
