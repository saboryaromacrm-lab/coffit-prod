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
  // Info nutricional por unidad (todos opcionales, null = sin datos)
  nutri_energia_kcal?: number | null;
  nutri_proteinas_g?: number | null;
  nutri_carbohidratos_g?: number | null;
  nutri_azucares_g?: number | null;
  nutri_grasas_g?: number | null;
  nutri_grasas_sat_g?: number | null;
  nutri_grasas_trans_g?: number | null;
  nutri_sodio_mg?: number | null;
  activo: boolean;
  ingredientes: SubrecetaIngrediente[];
  created_at?: string;
  updated_at?: string;
}
