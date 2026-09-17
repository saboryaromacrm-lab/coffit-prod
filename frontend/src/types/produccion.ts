export interface Operario {
  id: number;
  nombre: string;
  activo: boolean;
  created_at?: string;
}

export interface ProduccionRegistro {
  id: number;
  fecha: string;
  hora_ingreso: string | null;
  hora_salida: string | null;
  producto_nombre: string;
  producto_id: number | null;
  cantidad: number;
  estado: 'Completado' | 'En proceso' | 'Cancelado';
  observacion: string | null;
  operario_id: number | null;
  operario_nombre: string | null;
  operario_display: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ProduccionRegistroInput {
  fecha: string;
  hora_ingreso?: string | null;
  hora_salida?: string | null;
  producto_nombre: string;
  producto_id?: number | null;
  cantidad: number;
  estado: string;
  observacion?: string | null;
  operario_id?: number | null;
  operario_nombre?: string | null;
}

export interface ProductoCatalogo {
  id: number;
  nombre: string;
  tipo: 'producto' | 'subreceta';
}

export interface ReporteTotales {
  total_registros: number;
  total_unidades: number;
  total_productos: number;
  total_dias: number;
}

export interface ReporteProducto {
  producto_nombre: string;
  total_cantidad: number;
  total_registros: number;
}

export interface ReporteOperario {
  operario: string;
  total_cantidad: number;
  total_registros: number;
}

export interface ReporteDia {
  fecha: string;
  total_cantidad: number;
  total_registros: number;
}

export interface ReporteEstado {
  estado: string;
  cantidad: number;
}

export interface ReporteData {
  porProducto: ReporteProducto[];
  porOperario: ReporteOperario[];
  porDia: ReporteDia[];
  totales: ReporteTotales;
  porEstado: ReporteEstado[];
}

export interface ReporteIngrediente {
  ingrediente_id: number;
  nombre: string;
  unidad: string;
  cantidad_total: number;
  costo_total: number;
  porcentaje: number;
}

export interface ReporteIngredientesData {
  ingredientes: ReporteIngrediente[];
  totales: {
    total_ingredientes: number;
    total_cantidad: number;
    total_costo: number;
  };
  filtro_subreceta: string | null;
}
