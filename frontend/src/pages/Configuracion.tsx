import { useState, useEffect } from 'react';
import { Save, Plus, Pencil, Trash2, CreditCard, Banknote, Download, Users, Copy, RefreshCw, Link2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { configuracionApi } from '../api/configuracion';
import { conceptosApi } from '../api/conceptos';
import { canalesApi } from '../api/canales';
import { productosApi } from '../api/productos';
import { colaboradoresApi, type Colaborador } from '../api/colaboradores';
import { COLAB_SECCIONES } from '../constants/colaboradorSecciones';
import type { Concepto, ConceptosResponse, Canal } from '../types';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import LoadingSpinner from '../components/common/LoadingSpinner';

// URL completa del link de un colaborador (respeta el base /cofcostos)
function colabLink(accessKey: string): string {
  return `${window.location.origin}/cofcostos/colaborador/${accessKey}`;
}

const configLabels: Record<string, string> = {
  iva: 'IVA (%)',
  iibb: 'IIBB (%)',
  comision_tarjeta: 'Comision Tarjeta (%)',
  descuento_efectivo: 'Descuento Efectivo (%)',
  moneda: 'Moneda',
  nombre_negocio: 'Nombre del Negocio',
};

// Claves que se sincronizan automaticamente con conceptos_costo al guardar
const CONFIG_SYNC_CLAVES = new Set([
  'iva', 'iibb', 'comision_tarjeta', 'descuento_efectivo',
]);

const canalIcons: Record<string, typeof CreditCard> = {
  tarjeta: CreditCard,
  efectivo: Banknote,
};

export default function Configuracion() {
  const queryClient = useQueryClient();

  const { data: configData, isLoading: loadingConfig } = useQuery({
    queryKey: ['configuracion'],
    queryFn: () => configuracionApi.getAll(),
  });
  const { data: conceptosData, isLoading: loadingConceptos } = useQuery({
    queryKey: ['conceptos'],
    queryFn: () => conceptosApi.getAll(),
  });
  const { data: canalesData } = useQuery({
    queryKey: ['canales'],
    queryFn: () => canalesApi.getAll(),
  });

  const configRows: Array<{ clave: string; valor: string }> = Array.isArray(configData?.data) ? configData.data : [];
  const conceptosResp: ConceptosResponse | null = conceptosData?.data || null;
  const conceptos: Concepto[] = conceptosResp?.conceptos || [];
  const resumenCanales = conceptosResp?.resumen_canales;
  const canales: Canal[] = canalesData?.data || [];

  const [editingConfig, setEditingConfig] = useState<Record<string, string>>({});
  const [conceptoModalOpen, setConceptoModalOpen] = useState(false);
  const [editingConceptoId, setEditingConceptoId] = useState<number | null>(null);
  const [deleteConceptoId, setDeleteConceptoId] = useState<number | null>(null);

  useEffect(() => {
    if (configRows.length > 0 && Object.keys(editingConfig).length === 0) {
      const map: Record<string, string> = {};
      configRows.forEach((r) => { map[r.clave] = r.valor; });
      setEditingConfig(map);
    }
  }, [configRows]);

  const updateConfigMut = useMutation({
    mutationFn: ({ clave, valor }: { clave: string; valor: string }) => configuracionApi.update(clave, valor),
    onSuccess: (res, vars) => {
      // El backend puede sincronizar conceptos_costo cuando la clave es un %-config conocido
      // (iva, iibb, comision_*, descuento_efectivo). Invalidamos TODO lo que depende
      // de esos porcentajes para que la UI se refresque de inmediato.
      queryClient.invalidateQueries({ queryKey: ['configuracion'] });
      queryClient.invalidateQueries({ queryKey: ['conceptos'] });
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['rentabilidades'] });
      queryClient.invalidateQueries({ queryKey: ['ofertas'] });

      const sincronizados = (res?.data as { conceptos_sincronizados?: number } | undefined)
        ?.conceptos_sincronizados ?? 0;
      if (sincronizados > 0) {
        toast.success(`Configuracion guardada (${sincronizados} concepto${sincronizados === 1 ? '' : 's'} de costo sincronizado${sincronizados === 1 ? '' : 's'})`);
      } else if (vars.clave in { iva: 1, iibb: 1, comision_tarjeta: 1, descuento_efectivo: 1 }) {
        toast.success('Configuracion guardada (no se encontro concepto matching para sincronizar)');
      } else {
        toast.success('Configuracion guardada');
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteConceptoMut = useMutation({
    mutationFn: (id: number) => conceptosApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conceptos'] });
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      toast.success('Concepto eliminado');
      setDeleteConceptoId(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSaveConfig = (clave: string) => {
    updateConfigMut.mutate({ clave, valor: editingConfig[clave] });
  };

  if (loadingConfig || loadingConceptos) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      {/* General Config */}
      <section className="bg-white rounded-xl border border-gray-100 p-5">
        <h2 className="text-sm font-semibold mb-2">Configuracion General</h2>
        <p className="text-[11px] text-text-muted mb-4">
          Los campos marcados con <span className="text-primary font-semibold">↻</span> se sincronizan automaticamente con la fila correspondiente en
          <span className="font-medium"> Conceptos de Costo</span> al guardar, asi las rentabilidades de toda la app se actualizan en tiempo real.
        </p>
        <div className="space-y-3">
          {configRows.map((row) => {
            const syncs = CONFIG_SYNC_CLAVES.has(row.clave);
            return (
              <div key={row.clave} className="flex items-center gap-3 flex-wrap">
                <label className="text-sm text-text-muted w-full sm:w-48 shrink-0 flex items-center gap-1.5">
                  {syncs && <span className="text-primary font-bold" title="Se sincroniza con Conceptos de Costo al guardar">↻</span>}
                  {configLabels[row.clave] || row.clave}
                </label>
                <input
                  value={editingConfig[row.clave] ?? row.valor}
                  onChange={(e) => setEditingConfig((prev) => ({ ...prev, [row.clave]: e.target.value }))}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 max-w-xs min-w-[140px]"
                />
                <button
                  onClick={() => handleSaveConfig(row.clave)}
                  className="p-1.5 text-text-muted hover:text-primary cursor-pointer"
                  title="Guardar"
                >
                  <Save size={14} />
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Conceptos de Costo */}
      <section className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-sm font-semibold">Conceptos de Costo</h2>
          <Button size="sm" onClick={() => { setEditingConceptoId(null); setConceptoModalOpen(true); }}><Plus size={14} /> Nuevo</Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-text-muted">
                <th className="px-3 py-2 font-medium">Nombre</th>
                <th className="px-3 py-2 font-medium hidden sm:table-cell">Tipo</th>
                <th className="px-3 py-2 font-medium text-right">Porcentaje</th>
                <th className="px-3 py-2 font-medium hidden md:table-cell">Canales</th>
                <th className="px-3 py-2 font-medium w-16"></th>
              </tr>
            </thead>
            <tbody>
              {conceptos.map((c) => (
                <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-3 py-2 font-medium">{c.nombre}</td>
                  <td className="px-3 py-2 hidden sm:table-cell">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      c.tipo === 'impuesto' ? 'bg-blue-100 text-blue-700' :
                      c.tipo === 'comision' ? 'bg-purple-100 text-purple-700' :
                      'bg-green-100 text-green-700'
                    }`}>{c.tipo}</span>
                  </td>
                  <td className="px-3 py-2 text-right">{c.porcentaje}%</td>
                  <td className="px-3 py-2 hidden md:table-cell">
                    <div className="flex gap-1">
                      {c.canal_ids?.map((cid) => {
                        const canal = canales.find((ch) => ch.id === cid);
                        return canal ? (
                          <span key={cid} className="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-text-muted">{canal.nombre}</span>
                        ) : null;
                      })}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button onClick={() => { setEditingConceptoId(c.id); setConceptoModalOpen(true); }} className="p-1.5 text-text-muted hover:text-primary cursor-pointer"><Pencil size={14} /></button>
                      <button onClick={() => setDeleteConceptoId(c.id)} className="p-1.5 text-text-muted hover:text-danger cursor-pointer"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Resumen por Canal */}
      {resumenCanales && (
        <section className="bg-white rounded-xl border border-gray-100 p-5">
          <h2 className="text-sm font-semibold mb-4">Resumen por Canal de Venta</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(['tarjeta', 'efectivo'] as const).map((key) => {
              const canal = resumenCanales[key];
              if (!canal) return null;
              const Icon = canalIcons[key] || CreditCard;
              return (
                <div key={key} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Icon size={18} className="text-primary" />
                    <h3 className="font-medium text-sm">{canal.nombre}</h3>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    {canal.impuestos > 0 && (
                      <div className="flex justify-between"><span className="text-text-muted">Impuestos</span><span className="text-red-600">-{canal.impuestos}%</span></div>
                    )}
                    {canal.comisiones > 0 && (
                      <div className="flex justify-between"><span className="text-text-muted">Comisiones</span><span className="text-red-600">-{canal.comisiones}%</span></div>
                    )}
                    {canal.descuentos > 0 && (
                      <div className="flex justify-between"><span className="text-text-muted">Descuentos</span><span className="text-red-600">-{canal.descuentos}%</span></div>
                    )}
                    <div className="flex justify-between border-t pt-1.5 font-medium">
                      <span>Total deducciones</span>
                      <span className="text-red-600">-{canal.total}%</span>
                    </div>
                  </div>
                  {canal.conceptos.length > 0 && (
                    <div className="mt-3 pt-2 border-t">
                      <p className="text-[10px] text-text-muted mb-1">Conceptos aplicados:</p>
                      <div className="flex flex-wrap gap-1">
                        {canal.conceptos.map((cc) => (
                          <span key={cc.id} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-50 text-text-muted">{cc.nombre} ({cc.valor}%)</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Colaboradores */}
      <ColaboradoresSection />

      {/* Export CSV */}
      <ExportCostosSection />

      {conceptoModalOpen && (
        <ConceptoModal
          editingId={editingConceptoId}
          conceptos={conceptos}
          canales={canales}
          onClose={() => setConceptoModalOpen(false)}
        />
      )}

      <ConfirmDialog
        isOpen={deleteConceptoId !== null}
        onClose={() => setDeleteConceptoId(null)}
        onConfirm={() => deleteConceptoId && deleteConceptoMut.mutate(deleteConceptoId)}
        title="Eliminar concepto"
        message="Esta seguro? Se recalcularan las rentabilidades."
        loading={deleteConceptoMut.isPending}
      />
    </div>
  );
}

function ConceptoModal({ editingId, conceptos, canales, onClose }: {
  editingId: number | null;
  conceptos: Concepto[];
  canales: Canal[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const existing = editingId ? conceptos.find((c) => c.id === editingId) : null;

  const [nombre, setNombre] = useState(existing?.nombre || '');
  const [tipo, setTipo] = useState<string>(existing?.tipo || 'impuesto');
  const [porcentaje, setPorcentaje] = useState(existing?.porcentaje || 0);
  const [descripcion, setDescripcion] = useState(existing?.descripcion || '');
  const [esResta, setEsResta] = useState(existing?.es_resta ?? true);
  const [selectedCanales, setSelectedCanales] = useState<number[]>(existing?.canal_ids || []);

  const toggleCanal = (id: number) => {
    setSelectedCanales((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]);
  };

  const createMut = useMutation({
    mutationFn: () => conceptosApi.create({
      nombre, tipo, porcentaje, descripcion: descripcion || undefined,
      es_resta: esResta ? 1 : 0, canales_ids: selectedCanales,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conceptos'] });
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      toast.success('Concepto creado');
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMut = useMutation({
    mutationFn: () => conceptosApi.update(editingId!, {
      nombre, tipo, porcentaje, descripcion: descripcion || undefined,
      es_resta: esResta ? 1 : 0, canales_ids: selectedCanales,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conceptos'] });
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      toast.success('Concepto actualizado');
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSubmit = () => {
    if (!nombre.trim()) return toast.error('Nombre es requerido');
    if (porcentaje <= 0) return toast.error('Porcentaje debe ser mayor a 0');
    if (selectedCanales.length === 0) return toast.error('Seleccione al menos un canal');
    editingId ? updateMut.mutate() : createMut.mutate();
  };

  return (
    <Modal isOpen onClose={onClose} title={editingId ? 'Editar Concepto' : 'Nuevo Concepto'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={handleSubmit} loading={createMut.isPending || updateMut.isPending}>{editingId ? 'Guardar' : 'Crear'}</Button></>}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Nombre *</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Tipo</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg">
              <option value="impuesto">Impuesto</option>
              <option value="comision">Comision</option>
              <option value="descuento">Descuento</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Porcentaje *</label>
            <input type="number" min="0" step="0.01" value={porcentaje} onChange={(e) => setPorcentaje(parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Descripcion</label>
          <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" checked={esResta} onChange={(e) => setEsResta(e.target.checked)} className="rounded" id="esResta" />
          <label htmlFor="esResta" className="text-sm cursor-pointer">Es deduccion (resta del precio)</label>
        </div>
        <div>
          <label className="block text-xs font-medium text-text-muted mb-2">Canales *</label>
          <div className="space-y-1">
            {canales.map((canal) => (
              <label key={canal.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 px-2 py-1.5 rounded">
                <input type="checkbox" checked={selectedCanales.includes(canal.id)} onChange={() => toggleCanal(canal.id)} className="rounded" />
                {canal.nombre}
              </label>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ExportCostosSection() {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const prodRes = await productosApi.getAll();

      const rows: string[] = ['Nombre,Costo'];

      const productos = prodRes?.data || [];
      productos.forEach((prod) => {
        const nombre = prod.nombre.replace(/"/g, '""');
        rows.push(`"${nombre}",${Number(prod.costo_total || 0).toFixed(2)}`);
      });

      const csv = '\uFEFF' + rows.join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `costos_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${productos.length} productos exportados`);
    } catch (err) {
      toast.error('Error al exportar');
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Exportar Costos</h2>
          <p className="text-xs text-text-muted mt-1">Descarga un CSV con nombre y costo de ingredientes, subrecetas y productos</p>
        </div>
        <Button onClick={handleExport} loading={exporting} size="sm" className="w-full sm:w-auto shrink-0">
          <Download size={14} /> Exportar CSV
        </Button>
      </div>
    </section>
  );
}

// ============================================================================
// COLABORADORES: crear colaboradores con su link y secciones habilitadas
// ============================================================================
function ColaboradoresSection() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Colaborador | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['colaboradores'],
    queryFn: () => colaboradoresApi.getAll(),
  });
  const colaboradores: Colaborador[] = data?.data || [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['colaboradores'] });

  const deleteMut = useMutation({
    mutationFn: (id: number) => colaboradoresApi.delete(id),
    onSuccess: () => { toast.success('Colaborador eliminado'); setDeleteId(null); invalidate(); },
    onError: (err: Error) => toast.error(err.message),
  });
  const regenMut = useMutation({
    mutationFn: (id: number) => colaboradoresApi.regenerarKey(id),
    onSuccess: () => { toast.success('Nuevo link generado (el anterior dejo de funcionar)'); invalidate(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const copiar = (accessKey: string) => {
    navigator.clipboard?.writeText(colabLink(accessKey))
      .then(() => toast.success('Link copiado'))
      .catch(() => toast.error('No se pudo copiar'));
  };

  return (
    <section className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Users size={16} /> Colaboradores</h2>
        <Button size="sm" onClick={() => { setEditing(null); setModalOpen(true); }}><Plus size={14} /> Nuevo</Button>
      </div>
      <p className="text-xs text-text-muted mb-4">
        Cada colaborador entra por su <strong>link propio</strong> y ve solo las secciones que le habilites.
        Para revocar el acceso, eliminalo o generá un link nuevo. <span className="text-amber-600">El acceso es por link (sin contraseña): compartilo solo con la persona.</span>
      </p>

      {isLoading ? <LoadingSpinner /> : colaboradores.length === 0 ? (
        <p className="text-sm text-text-muted italic">Todavia no hay colaboradores. Crea el primero con "Nuevo".</p>
      ) : (
        <div className="space-y-3">
          {colaboradores.map((c) => (
            <div key={c.id} className="border border-gray-200 rounded-lg p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-sm">{c.nombre}</div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {c.secciones.length === 0 ? (
                      <span className="text-[11px] text-amber-600">Sin secciones habilitadas</span>
                    ) : c.secciones.map((sk) => {
                      const s = COLAB_SECCIONES.find((x) => x.key === sk);
                      return <span key={sk} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-text-muted">{s?.label || sk}</span>;
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => { setEditing(c); setModalOpen(true); }} className="p-1.5 text-text-muted hover:text-primary" title="Editar"><Pencil size={14} /></button>
                  <button onClick={() => regenMut.mutate(c.id)} className="p-1.5 text-text-muted hover:text-amber-600" title="Generar link nuevo (invalida el actual)"><RefreshCw size={14} /></button>
                  <button onClick={() => setDeleteId(c.id)} className="p-1.5 text-text-muted hover:text-danger" title="Eliminar"><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2 bg-gray-50 rounded px-2 py-1.5">
                <Link2 size={13} className="text-text-muted shrink-0" />
                <a href={colabLink(c.access_key)} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary truncate hover:underline flex-1">{colabLink(c.access_key)}</a>
                <button onClick={() => copiar(c.access_key)} className="text-text-muted hover:text-primary shrink-0" title="Copiar link"><Copy size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <ColaboradorModal
          editing={editing}
          onClose={() => setModalOpen(false)}
          onSaved={() => { invalidate(); setModalOpen(false); }}
        />
      )}
      <ConfirmDialog
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        title="Eliminar colaborador"
        message="Se revoca su link de acceso. Esta seguro?"
        loading={deleteMut.isPending}
      />
    </section>
  );
}

function ColaboradorModal({ editing, onClose, onSaved }: {
  editing: Colaborador | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nombre, setNombre] = useState(editing?.nombre || '');
  const [secciones, setSecciones] = useState<string[]>(editing?.secciones || []);

  const toggle = (k: string) => setSecciones((prev) => prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]);

  const saveMut = useMutation({
    mutationFn: (): Promise<unknown> => editing
      ? colaboradoresApi.update(editing.id, { nombre: nombre.trim(), secciones })
      : colaboradoresApi.create({ nombre: nombre.trim(), secciones }),
    onSuccess: () => { toast.success(editing ? 'Colaborador actualizado' : 'Colaborador creado'); onSaved(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSave = () => {
    if (!nombre.trim()) return toast.error('El nombre es requerido');
    saveMut.mutate();
  };

  return (
    <Modal isOpen onClose={onClose} title={editing ? `Editar: ${editing.nombre}` : 'Nuevo colaborador'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={handleSave} loading={saveMut.isPending}>{editing ? 'Guardar' : 'Crear'}</Button></>}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Nombre *</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Juan (cocina)"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-muted mb-2">Secciones habilitadas</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {COLAB_SECCIONES.map((s) => (
              <label key={s.key} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 px-2 py-1.5 rounded border border-gray-100">
                <input type="checkbox" checked={secciones.includes(s.key)} onChange={() => toggle(s.key)} className="rounded" />
                <s.icon size={15} className="text-text-muted" />
                {s.label}
              </label>
            ))}
          </div>
          {secciones.length === 0 && <p className="text-[11px] text-amber-600 mt-1.5">Sin secciones el colaborador entra pero no ve nada. Marca al menos una.</p>}
        </div>
        {!editing && (
          <p className="text-[11px] text-text-muted bg-blue-50 border border-blue-100 rounded-lg p-2">
            Al crear se genera un link unico. Lo copiás de la lista y se lo pasás al colaborador.
          </p>
        )}
      </div>
    </Modal>
  );
}
