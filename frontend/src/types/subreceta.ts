export interface SubrecetaIngrediente {
  id: number;
  ingrediente_id: number;
  ingrediente_nombre: string;
  cantidad: number;
  unidad: string;
  costo_con_desperdicio: number;
  abreviatura: string;
}

export interface Subreceta {
  id: number;
  nombre: string;
  rendimiento_gramos: number;
  tipo_rendimiento: 'gramos' | 'porciones';
  costo_total: number;
  costo_por_100g: number;
  notas: string | null;
  activo: boolean;
  ingredientes: SubrecetaIngrediente[];
  created_at?: string;
  updated_at?: string;
}
