export interface ConceptoCompra {
  id: number;
  nombre: string;
  color: string;
  activo?: boolean;
}

export interface MetodoPago {
  id: number;
  nombre: string;
  activo?: boolean;
}

export interface Compra {
  id: number;
  fecha: string;
  proveedor_id: number | null;
  proveedor_nombre: string | null;
  proveedor_nombre_display?: string | null;
  concepto_id: number | null;
  concepto_nombre?: string | null;
  concepto_color?: string | null;
  ingrediente_id: number | null;
  ingrediente_nombre?: string | null;
  cantidad_envases: number | null;
  monto_total: number;
  metodo_pago_id: number | null;
  metodo_pago_nombre?: string | null;
  detalle: string | null;
  activo: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CompraInput {
  fecha: string;
  proveedor_id?: number | null;
  proveedor_nombre?: string | null;
  concepto_id?: number | null;
  ingrediente_id?: number | null;
  cantidad_envases?: number | null;
  monto_total: number;
  metodo_pago_id?: number | null;
  detalle?: string | null;
}

export interface CompraMetricas {
  mes_actual: { total: number; cantidad: number; desde: string; hasta: string };
  mes_anterior: { total: number; cantidad: number; desde: string; hasta: string };
  variacion_pct: number | null;
  top_proveedores: { proveedor: string; total: number }[];
  top_conceptos: { concepto: string; color: string; total: number }[];
}
