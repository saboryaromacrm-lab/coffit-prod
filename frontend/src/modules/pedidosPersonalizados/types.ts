// Tipos del modulo de pedidos personalizados (espejo de la API /api/pp).

// Linea de receta: una sola fuente (ingrediente, subreceta, producto de
// CoffitCost o costo manual). `por_kg` = la cantidad es por kg del item.
export interface LineaReceta {
  ingrediente_id?: number | null;
  subreceta_id?: number | null;
  cc_producto_id?: number | null;
  nombre_manual?: string | null;
  costo_manual?: number | null;
  cantidad: number;
  por_kg: boolean;
  // Solo para mostrar (los manda el servidor al leer y el buscador al agregar)
  nombre?: string;
  unidad?: string;
  costo_unitario?: number | null; // null = la fuente ya no existe
}

export type PrecioModo = 'fijo' | 'por_kg';

// Una opcion nueva (sin guardar) tiene `key` en vez de `id`.
export interface OpcionEditor {
  id?: number;
  key?: string;
  nombre: string;
  descripcion?: string | null;
  precio: number;
  precio_modo: PrecioModo;
  peso_kg: number | null;
  depende_de: number | string | null;
  etiquetas: string[];
  imagen?: string | null;
  activo: boolean;
  receta: LineaReceta[];
}

export interface AjusteGrupo {
  opcion_id: number;
  precio: number | null;
  oculto: boolean;
}

export interface PasoEditor {
  id?: number;
  key?: string;
  nombre: string;
  min_sel: number;
  max_sel: number;
  grupo_id: number | null;
  ajustes: AjusteGrupo[];
  opciones: OpcionEditor[];
}

export interface ProductoEditor {
  id?: number;
  nombre: string;
  descripcion: string | null;
  categoria: string | null;
  imagen: string | null;
  emoji: string | null;
  precio_base: number;
  etiquetas: string[];
  es_congelado: boolean;
  con_anticipacion: boolean; // se pide con anticipacion (solo la marca, sin horario)
  activo: boolean;
  orden?: number;
  receta: LineaReceta[];
  pasos: PasoEditor[];
}

export interface ProductoResumen {
  id: number;
  nombre: string;
  categoria: string | null;
  imagen: string | null;
  emoji: string | null;
  precio_base: number;
  activo: boolean;
  con_anticipacion: boolean;
  orden: number;
  pasos: number;
  precio_desde: number | null;
}

export interface OpcionGrupo {
  id?: number;
  key?: string;
  nombre: string;
  descripcion?: string | null;
  precio: number;
  etiquetas: string[];
  imagen?: string | null;
  activo: boolean;
  receta: LineaReceta[];
}

export interface Grupo {
  id?: number;
  nombre: string;
  activo: boolean;
  usado_en?: number;
  opciones: OpcionGrupo[];
}

export type IdOpcion = number | string;

export interface Simulacion {
  nombre: string | null;
  cantidad: number;
  peso_kg: number | null;
  precio_unitario: number;
  costo_unitario: number;
  costo_incompleto: boolean;
  food_cost: number | null;
  opciones: { opcion_id: IdOpcion; paso_id: IdOpcion; paso_nombre: string; nombre: string; precio: number; costo: number }[];
  pasos: { paso_id: IdOpcion; nombre: string; min_sel: number; max_sel: number; opciones_visibles: IdOpcion[]; elegidas: IdOpcion[] }[];
  errores: { paso_id: IdOpcion | null; mensaje: string }[];
}

export interface Combinacion {
  opciones: { paso: string; nombre: string }[];
  precio: number;
  costo: number;
  costo_incompleto: boolean;
  margen: number;
  food_cost: number | null;
}

export type EstadoPedido = 'pendiente' | 'en_produccion' | 'listo' | 'entregado' | 'cancelado';

export interface PedidoResumen {
  id: number;
  numero: string;
  origen: 'pos' | 'web' | 'panel';
  ref_externa: string | null;
  cliente_nombre: string | null;
  cliente_telefono: string | null;
  fecha_entrega: string | null;
  estado: EstadoPedido;
  total: number;
  costo_total: number;
  unidades: number;
  food_cost: number | null;
  created_at: string;
}

export interface PedidoDetalle extends Omit<PedidoResumen, 'unidades'> {
  notas: string | null;
  transiciones: EstadoPedido[];
  items: {
    id: number;
    producto_id: number | null;
    nombre: string;
    cantidad: number;
    precio_unitario: number;
    costo_unitario: number;
    peso_kg: number | null;
    notas: string | null;
    opciones: { id: number; opcion_id: number | null; paso_nombre: string; opcion_nombre: string; precio: number; costo: number }[];
  }[];
}

export interface EstadoIntegracion {
  api_key_configurada: boolean;
  catalogo_version: string;
  productos_publicados: number;
}

export interface InformeImport {
  grupos_creados: number;
  productos_creados: string[];
  omitidos: string[];
  errores: string[];
}
