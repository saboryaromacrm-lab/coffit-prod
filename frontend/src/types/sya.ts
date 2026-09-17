// Seccion "Sabor y Aroma": envios de mercaderia del CRM de la distribuidora.
// Identidad estable de cada articulo: (crm_producto_id, crm_presentacion_id).

export type SyaModo = 'granel' | 'paquete' | 'unidad';
export type SyaEnvioEstado = 'enviado' | 'anulado' | 'ignorado';
export type SyaItemEstado = 'aplicado' | 'pendiente_mapeo' | 'inconsistente' | 'anulado';

export interface SyaArticulo {
  id: number;
  crm_producto_id: number;
  crm_presentacion_id: number;
  nombre_crm: string;
  codigo_propio: string | null;
  codigo_barras: string | null;
  ultimo_modo: SyaModo | null;
  ultima_cantidad: number | null;
  ultimo_costo_unitario: number | null;
  ultima_fecha: string | null;
  // Destino materia prima
  usa_mp: 0 | 1;
  ingrediente_id: number | null;
  factor_mp: number | null;
  factor_modo: SyaModo | null;
  actualizar_costo: 0 | 1;
  // Destino venta
  usa_venta: 0 | 1;
  venta_nombre: string | null;
  venta_precio: number | null;
  venta_activo: 0 | 1;
  venta_costo_unitario: number | null;
  // Enriquecidos
  ingrediente_nombre?: string | null;
  ingrediente_unidad?: string | null;
  ingrediente_costo_actual?: number | null;
  items_pendientes?: number;
  updated_at?: string;
}

export interface SyaEnvio {
  id: number;
  crm_id: number;
  codigo: string | null;
  fecha: string | null;
  sucursal_id: number | null;
  estado: SyaEnvioEstado;
  version: number;
  total_costo: number | null;
  observaciones: string | null;
  motivo_anulacion: string | null;
  // Contadores (lista)
  items_total?: number;
  items_aplicados?: number;
  items_pendientes?: number;
  items_inconsistentes?: number;
}

export interface SyaEnvioItem {
  id: number;
  envio_id: number;
  crm_item_id: number;
  crm_producto_id: number;
  crm_presentacion_id: number;
  nombre_crm: string | null;
  modo: SyaModo;
  cantidad: number;
  tam_kg: number | null;
  total_kg: number | null;
  costo_unitario: number;
  estado: SyaItemEstado;
  nota: string | null;
  cant_mp: number | null;
  cant_venta: number | null;
  cantidad_ingrediente: number | null;
  ingrediente_id: number | null;
  costo_aplicado: 0 | 1;
  // Enriquecidos con el mapeo actual
  articulo_id: number | null;
  usa_mp: 0 | 1 | null;
  usa_venta: 0 | 1 | null;
  factor_mp: number | null;
  ingrediente_nombre: string | null;
  ingrediente_unidad: string | null;
}

export interface SyaEnvioDetalle extends SyaEnvio {
  items: SyaEnvioItem[];
}

export interface SyaResumen {
  envios: number;
  envios_anulados: number;
  ultimo_envio: string | null;
  articulos: number;
  articulos_sin_mapear: number;
  articulos_en_venta: number;
  items_pendientes: number;
  items_inconsistentes: number;
}

export interface SyaImportResultado {
  procesados: number;
  nuevos: number;
  actualizados: number;
  anulados: number;
  ignorados: number;
  sin_cambios: number;
  errores: { crm_id: number; codigo: string | null; error: string }[];
  items_aplicados: number;
  items_pendientes: number;
  items_inconsistentes: number;
  ingredientes_actualizados: number;
  cursor: string | null;
}

export interface SyaSugerencia {
  id: number;
  nombre: string;
  unidad: string;
  costo_unitario: number;
  score: number;
}

export interface SyaMapeoInput {
  usa_mp: boolean;
  ingrediente_id?: number | null;
  factor_mp?: number | null;
  actualizar_costo?: boolean;
  usa_venta: boolean;
  venta_nombre?: string | null;
  venta_precio?: number | null;
  venta_activo?: boolean;
}
