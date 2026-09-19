export interface ProductoIngrediente {
  id: number;
  producto_id: number;
  ingrediente_id: number | null;
  subreceta_id: number | null;
  nombre: string;
  cantidad: number;
  unidad: string;
  unidad_display: string;
  costo_unitario: number;
  tipo: 'ingrediente' | 'subreceta';
}

export interface RentabilidadCanal {
  precio: number;
  costo: number;
  deducciones: number;
  ganancia: number;
  mc_neto: number;
  markup: number;
  detalles?: { nombre: string; tipo: string; porcentaje: number; monto: number }[];
}

export interface Rentabilidades {
  local_tarjeta: RentabilidadCanal;
  local_efectivo: RentabilidadCanal;
}

export interface Producto {
  id: number;
  nombre: string;
  categoria_id: number | null;      // la fila asignada (raiz O subcategoria)
  categoria_raiz_id: number | null; // siempre la RAIZ
  categoria_nombre: string | null;  // siempre la RAIZ
  categoria_icono: string | null;   // siempre la RAIZ
  subcategoria_id: number | null;   // null si cuelga directo de la raiz
  subcategoria_nombre: string | null;
  porciones: number;
  precio_publico: number;
  costo_total: number;
  peso_total_g: number | null;
  es_borrador: boolean | number;
  notas: string | null;
  precio_anterior_local: number | null;
  fecha_cambio_precio: string | null;
  activo: boolean;
  ingredientes: ProductoIngrediente[];
  rentabilidades: Rentabilidades;
  created_at?: string;
  updated_at?: string;
}
