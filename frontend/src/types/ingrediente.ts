export interface Ingrediente {
  id: number;
  nombre: string;
  categoria: string | null;
  unidad_id: number | null;
  unidad_nombre: string | null;
  unidad_abrev: string | null;
  contenido_envase: number;
  desperdicio: number;
  proveedor1: string | null;
  precio1: number;
  proveedor2: string | null;
  precio2: number;
  costo_unitario: number;
  costo_con_desperdicio: number;
  fecha_precio: string | null;
  dias_desde_actualizacion: number | null;
  notas: string | null;
  calorias: number;
  carbohidratos: number;
  proteinas: number;
  grasas: number;
  fibra: number;
  uso_recetas?: number;
  // Marca "actualizado por Sabor y Aroma" (ultimo envio del CRM que toco el costo)
  sya_fecha?: string | null;
  sya_codigo?: string | null;
  activo: boolean;
  created_at?: string;
  updated_at?: string;
}
