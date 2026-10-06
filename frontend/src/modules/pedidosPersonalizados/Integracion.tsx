import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, XCircle, Copy, Download, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '../../components/common/Button';
import { ppApi } from './api';
import type { InformeImport } from './types';

// ============================================================================
// Referencia de la API para el POS (y mas adelante la tienda) + import.
// ============================================================================

const BASE = `${import.meta.env.VITE_API_URL}/public/pp`;

const ENDPOINTS = [
  {
    metodo: 'GET', ruta: '/catalogo', clave: false,
    para: 'Productos, pasos y opciones con precios y reglas (sin costos). Mandá el header If-None-Match con la última versión: si no cambió responde 304 sin datos.',
    respuesta: `{ "success": true, "data": { "version": "97a1da71b463", "productos": [{
  "id": 1, "nombre": "Budin", "precio_base": 0, "precio_desde": 6000,
  "pasos": [{ "id": 1, "nombre": "Harina", "min_sel": 1, "max_sel": 1,
    "opciones": [{ "id": 11, "nombre": "Harina integral (900 g)", "precio": 8500,
      "precio_modo": "fijo", "peso_kg": 0.9, "depende_de": null }] }] }] } }`,
  },
  {
    metodo: 'POST', ruta: '/cotizar', clave: false,
    para: 'Calcula precio y valida sin guardar. Devuelve por cada paso qué opciones se pueden elegir con lo ya elegido: el POS puede dibujar los botones con esto y no repetir reglas.',
    cuerpo: `{ "items": [{ "producto_id": 6, "opciones": [27, 36], "cantidad": 1 }] }`,
    respuesta: `{ "success": true, "data": { "ok": true, "total": 80000, "items": [{
  "precio_unitario": 80000, "peso_kg": 2.5, "errores": [],
  "pasos": [{ "paso_id": 6, "nombre": "Tamaño", "opciones_visibles": [34, 35, 36], "elegidas": [36] }] }] } }`,
  },
  {
    metodo: 'POST', ruta: '/pedidos', clave: true,
    para: 'Crea el pedido. El precio lo recalcula el servidor (el que mande el POS no cuenta). ref_externa = id de la venta en el POS: si se reintenta con el mismo, devuelve el mismo pedido (duplicado: true) y no crea otro.',
    cuerpo: `{ "ref_externa": "VENTA-1532", "cliente_nombre": "Ana", "cliente_telefono": "3704...",
  "fecha_entrega": "2026-10-10T16:00:00-03:00", "notas": "Sin nueces",
  "items": [{ "producto_id": 6, "opciones": [27, 36], "cantidad": 1, "notas": "Feliz cumple" }] }`,
    respuesta: `{ "success": true, "data": { "numero": "PP-20261010-0001", "estado": "pendiente",
  "total": 80000, "duplicado": false, "items": [...] } }`,
  },
  {
    metodo: 'GET', ruta: '/pedidos/:numero', clave: true,
    para: 'Estado y detalle de un pedido.',
  },
  {
    metodo: 'PATCH', ruta: '/pedidos/:numero/estado', clave: true,
    para: 'Cambia el estado: pendiente → en_produccion → listo → entregado, o cancelado. Las transiciones que no corresponden se rechazan (409).',
    cuerpo: `{ "estado": "entregado" }`,
  },
];

function copiar(texto: string) {
  navigator.clipboard.writeText(texto).then(() => toast.success('Copiado'), () => toast.error('No se pudo copiar'));
}

export default function Integracion() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['pp-estado'], queryFn: ppApi.getEstado });
  const estado = data?.data;
  const [informe, setInforme] = useState<InformeImport | null>(null);

  const importar = useMutation({
    mutationFn: ppApi.importar,
    onSuccess: (res) => {
      setInforme(res.data);
      qc.invalidateQueries({ queryKey: ['pp-productos'] });
      qc.invalidateQueries({ queryKey: ['pp-grupos'] });
      qc.invalidateQueries({ queryKey: ['pp-estado'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-4 max-w-4xl">
      <section className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <h3 className="font-semibold">Conexión del POS</h3>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-text-muted">URL base:</span>
          <code className="bg-gray-100 px-2 py-1 rounded text-xs break-all">{BASE}</code>
          <button type="button" onClick={() => copiar(BASE)} className="p-1 text-text-muted hover:text-primary" title="Copiar"><Copy size={14} /></button>
        </div>
        {estado && (
          <div className="grid sm:grid-cols-3 gap-2 text-sm">
            <div className="flex items-center gap-1.5">
              {estado.api_key_configurada
                ? <><CheckCircle2 size={16} className="text-green-600" /> Clave configurada</>
                : <><XCircle size={16} className="text-red-600" /> Falta la clave</>}
            </div>
            <div><span className="text-text-muted">Productos publicados:</span> {estado.productos_publicados}</div>
            <div><span className="text-text-muted">Versión del catálogo:</span> <code className="text-xs">{estado.catalogo_version}</code></div>
          </div>
        )}
        {estado && !estado.api_key_configurada && (
          <p className="text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Para que el POS pueda crear pedidos, agregá la variable <code>PP_API_KEY</code> (una clave larga al azar) en el
            servicio del backend en Dokploy y cargá la misma clave en el POS. El POS la manda en el header <code>X-API-Key</code>.
            Catálogo y cotización funcionan sin clave.
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold">Endpoints</h3>
        {ENDPOINTS.map((e) => (
          <div key={e.metodo + e.ruta} className="bg-white border border-gray-200 rounded-xl p-3 space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-gray-800 text-white">{e.metodo}</span>
              <code className="font-mono">{e.ruta}</code>
              {e.clave && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">X-API-Key</span>}
            </div>
            <p className="text-text-muted">{e.para}</p>
            {e.cuerpo && <Ejemplo titulo="Envía" texto={e.cuerpo} />}
            {e.respuesta && <Ejemplo titulo="Responde" texto={e.respuesta} />}
          </div>
        ))}
        <p className="text-xs text-text-muted">
          Errores: <code>{'{ "success": false, "message": "..." }'}</code>. Si el pedido no cumple las reglas responde 422 con la
          cotización y el error de cada paso. Nunca se exponen costos.
        </p>
      </section>

      <section className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold">Importar desde la tienda</h3>
            <p className="text-xs text-text-muted">Trae lo que falte del catálogo de pedidoscoffit. Lo ya importado no se toca.</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => importar.mutate()} loading={importar.isPending}>
            {!importar.isPending && <Download size={14} />} Importar
          </Button>
        </div>
        {importar.isPending && <p className="text-xs text-text-muted flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Leyendo la tienda...</p>}
        {informe && (
          <div className="text-sm space-y-1">
            <p>Productos nuevos: <b>{informe.productos_creados.length}</b> · Grupos nuevos: <b>{informe.grupos_creados}</b> · Ya estaban: {informe.omitidos.length}</p>
            {informe.productos_creados.length > 0 && <p className="text-xs text-text-muted">{informe.productos_creados.join(', ')}</p>}
            {informe.errores.map((e) => <p key={e} className="text-xs text-danger">{e}</p>)}
          </div>
        )}
      </section>
    </div>
  );
}

function Ejemplo({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-text-muted mb-1">
        {titulo}
        <button type="button" onClick={() => copiar(texto)} className="p-0.5 hover:text-primary" title="Copiar"><Copy size={12} /></button>
      </div>
      <pre className="bg-gray-900 text-gray-100 text-xs rounded-lg p-2.5 overflow-x-auto">{texto}</pre>
    </div>
  );
}
