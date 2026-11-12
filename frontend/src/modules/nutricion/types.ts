// Tipos del modulo de info nutricional (contrato de /api/nutricion).

export type Nutriente =
  | 'energia_kcal' | 'proteinas_g' | 'carbohidratos_g' | 'azucares_g' | 'fibra_g'
  | 'grasas_g' | 'grasas_sat_g' | 'grasas_trans_g' | 'sodio_mg';

export type Valores = Record<Nutriente, number>;

// null = sin datos
export type EstadoIngrediente = 'sin_revisar' | 'controlado' | null;

export interface AlertaUnidad {
  tipo: 'producto' | 'subreceta';
  receta_id: number;
  receta: string;
  cantidad: number;
  motivo: string;
}

export interface IngredienteNutri {
  id: number;
  nombre: string;
  categoria: string | null;
  unidad: string | null;
  contenido_envase: number;
  precio_envase: number;
  gramos_por_unidad: number | null;
  valores: Valores | null; // cada 100 g
  estado: EstadoIngrediente;
  confianza: 'alta' | 'media' | 'baja' | null; // solo si lo sugirio la IA
  nota: string | null;
  controlado_at: string | null;
  usos: number;
  alertas: AlertaUnidad[];
}

export interface ErrorIA {
  id: number;
  nombre?: string;
  motivo: string;
}

export interface LineaCalculo {
  linea_id: number;
  tipo: 'ingrediente' | 'subreceta' | 'manual';
  nombre: string;
  cantidad: number;
  unidad: string;
  gramos: number | null;
  valores: Valores | null;
  completa: boolean;
  alerta?: string;
}

interface Calculo {
  total: Valores;
  gramos_receta: number;
  lineas: LineaCalculo[];
  completa: boolean;
  con_datos: boolean;
  faltantes: string[];
  sin_controlar: string[];
  alertas: { nombre: string; cantidad: number; motivo: string }[];
}

export type EstadoProducto = 'sin_datos' | 'incompleto' | 'pendiente' | 'controlado' | 'vencido';

export interface ProductoNutri extends Calculo {
  id: number;
  nombre: string;
  categoria: string | null;
  estado: EstadoProducto;
  controlado_at: string | null;
  porciones: number;
  peso_total_g: number | null;
  porcion_g: number | null;
  por_porcion: Valores;
  por_100g: Valores | null;
}

export interface ProductoNutriResumen {
  id: number;
  nombre: string;
  categoria: string | null;
  estado: EstadoProducto;
  porciones: number;
  porcion_g: number | null;
  energia_kcal: number | null;
  faltantes: number;
  sin_controlar: number;
  alertas: number;
}

export interface SubrecetaNutri extends Calculo {
  nombre: string;
  tipo_rendimiento: 'gramos' | 'porciones';
  rendimiento: number;
  por_unidad: Valores | null; // por porcion o cada 100 g
}

export interface ConfigModeloIA {
  modelo: string;
  opciones: { id: string; nombre: string; detalle: string }[];
  clave_configurada: boolean; // ANTHROPIC_API_KEY cargada en el servidor
}
