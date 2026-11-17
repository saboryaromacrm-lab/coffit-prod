// Como asienta su produccion: con hora de ingreso/salida o eligiendo el turno.
export type ModoRegistro = 'horario' | 'turno';

// Unidad en que rinde una receta: unidades (productos), porciones o gramos.
export type BaseAsiento = 'u' | 'porc' | 'g';

// Como se asienta un producto/subreceta en Produccion: la unidad con que se
// carga (null = la receta) y cuanto rinde en la base de la receta (null = la
// receta completa). Ver utils/asiento.ts.
// Como se anoto una carga, ademas de la unidad configurada (null): en recetas
// completas o en la unidad suelta de su receta (unidades, porciones o kg).
export type FormaCarga = 'receta' | 'base';

export interface AsientoInput {
  asiento_unidad: string | null;
  asiento_rinde: number | null;
}

export interface Operario {
  id: number;
  nombre: string;
  modo_registro: ModoRegistro;
  activo: boolean;
  created_at?: string;
}

export interface Turno {
  id: number;
  nombre: string;
  hora_desde: string | null; // HH:MM:SS
  hora_hasta: string | null;
}

export interface ProduccionRegistro {
  id: number;
  fecha: string;
  hora_ingreso: string | null;
  hora_salida: string | null;
  turno_id: number | null;
  turno_nombre: string | null;
  producto_nombre: string;
  producto_id: number | null;
  cantidad: number;
  rinde: number | string | null; // solo si en esa carga la unidad rindio distinto
  forma: FormaCarga | null;
  estado: 'Completado' | 'En proceso' | 'Cancelado';
  observacion: string | null;
  operario_id: number | null;
  operario_nombre: string | null;
  operario_display: string | null;
  // Como se anoto (null si su producto ya no existe; unidad null = la receta)
  unidad: string | null;
  base: BaseAsiento | null;
  rinde_efectivo: number | string | null;
  unidades: number | string; // unidades reales (como en los reportes)
  created_at?: string;
  updated_at?: string;
}

export interface ProduccionRegistroInput {
  fecha: string;
  hora_ingreso?: string | null;
  hora_salida?: string | null;
  turno_id?: number | null; // con turno, las horas se ignoran
  producto_nombre: string;
  producto_id?: number | null;
  cantidad: number;
  rinde?: number | null;
  forma?: FormaCarga | null;
  estado: string;
  observacion?: string | null;
  operario_id?: number | null;
  operario_nombre?: string | null;
}

export interface ProductoCatalogo extends AsientoInput {
  id: number;
  nombre: string;
  tipo: 'producto' | 'subreceta';
  rendimiento: number; // lo que rinde la receta completa, en su base
  base: BaseAsiento;
  promedio: number | null; // lo que se carga normalmente en una carga, en su base
}

export interface ReporteTotales {
  total_registros: number;
  total_unidades: number;
  total_productos: number;
  total_dias: number;
}

// total_cantidad = lo asentado en su unidad; total_equivalente = en la base de
// la receta; total_unidades = unidades reales (lo que suma en los totales).
export interface ReporteProducto {
  producto_nombre: string;
  unidad: string | null;
  base: BaseAsiento | null;
  total_cantidad: number;
  total_equivalente: number | null;
  total_unidades: number;
  total_registros: number;
}

export interface ReporteOperario {
  operario: string;
  total_unidades: number;
  total_registros: number;
}

export interface ReporteDia {
  fecha: string;
  total_unidades: number;
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
