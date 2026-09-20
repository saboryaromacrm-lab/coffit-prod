// Rentabilidad de un canal Local para un item de carta
export interface CartaRentabilidadCanal {
  precio: number;
  costo: number;
  deducciones: number;
  ganancia: number;
  mc_neto: number;
  markup: number;
  detalles: { nombre: string; tipo: string; porcentaje: number; monto: number }[];
}

export type CartaEstadoMapeo = 'sin_mapear' | 'con_costo' | 'sin_costo';

// Variantes (precio null = hereda el precio base del item)
export interface VarianteTamano {
  nombre: string;
  precio: number | null;
}
export interface VarianteSabor {
  nombre: string;
  precio: number | null;
  fecha_nuevo: string | null; // YYYY-MM-DD cuando se marco nuevo
  es_nuevo?: boolean;         // calculado por el backend (dentro de la ventana)
}
export interface VarianteTopping {
  nombre: string;
  precio: number; // EXTRA aditivo (default 0)
}
// Temperatura (frío / caliente): opcion con precio propio.
// precio null = se cobra el precio base del item (sin cargo).
export interface VarianteTemperatura {
  nombre: string;
  precio: number | null;
}
// Una opcion dentro de un grupo (mismo modelo que temperatura: precio propio,
// null = precio base).
export interface OpcionDeGrupo {
  nombre: string;
  precio: number | null;
}
// Grupo de opciones generico, de seleccion UNICA (ej: "Tipo de huevo" ->
// Huevos enteros / Clara de huevo). El nombre del grupo es libre: sirve para
// cualquier eleccion de menu que no encaje en tamaño/sabor/topping/temperatura.
export interface GrupoDeOpciones {
  nombre: string;
  opciones: OpcionDeGrupo[];
}
// Adicion: producto real de la categoria "Adiciones" vinculado al item.
// El backend la devuelve RESUELTA (nombre/precios en vivo desde Productos).
export interface VarianteAdicion {
  producto_id: number;
  nombre: string;
  precio_extra: number;          // lo que paga el cliente (override o precio del producto)
  precio_override: number | null; // null = hereda el precio del producto
  precio_producto: number;        // precio publico actual del producto adicion
  costo: number;                  // costo actual del producto adicion
}
// Lo que se guarda (el resto se resuelve en vivo)
export interface VarianteAdicionInput {
  producto_id: number;
  precio: number | null; // null = hereda
}
// Producto disponible para agregar como adicion (categoria "Adiciones")
export interface AdicionDisponible {
  id: number;
  nombre: string;
  precio: number;
  costo: number;
}

export interface CartaItem {
  id: number;
  nombre: string;              // propio (raw) — para items sin mapear
  precio_venta: number;        // propio (override manual)
  precio_manual: 0 | 1;        // 1 = usar precio_venta aunque este mapeado
  categoria: string | null;    // propia (raw)
  subcategoria: string | null; // propia (raw) — solo para items sin mapear
  etiqueta: string | null;
  descripcion: string | null;
  imagen: string | null;
  frio_caliente: 0 | 1; // derivado: 1 si temperaturas.length > 0
  // Variantes estructuradas (parseadas por el backend)
  temperaturas: VarianteTemperatura[];
  grupos_opciones: GrupoDeOpciones[];
  tamanos: VarianteTamano[];
  sabores: VarianteSabor[];
  toppings: VarianteTopping[];
  fecha_lanzamiento: string | null; // YYYY-MM-DD
  destacado: 0 | 1;
  desactivar: 0 | 1;
  producto_id: number | null;
  oferta_id: number | null;
  orden: number;
  // Joins / calculados desde el backend
  producto_nombre: string | null;
  oferta_nombre: string | null;
  oferta_estado: 'activa' | 'pausada' | 'programada' | 'vencida' | null;
  // Composicion del box/combo (solo items mapeados a promo)
  incluye: { nombre: string; cantidad: number; es_regalo?: boolean }[];
  // Adiciones resueltas en vivo (productos de la categoria "Adiciones")
  adiciones: VarianteAdicion[];
  costo_total: number | null;
  producto_precio_publico: number | null;
  producto_categoria: string | null;
  producto_subcategoria: string | null;
  mapeado: boolean;
  tipo_mapeo: 'producto' | 'oferta' | null;
  // EFECTIVOS (heredados del producto/promo si esta mapeado) — usar para mostrar
  nombre_efectivo: string;
  categoria_efectiva: string | null;     // siempre la RAIZ
  subcategoria_efectiva: string | null;  // null si no tiene
  precio_efectivo: number;
  precio_inherido: number | null;
  tiene_costo: boolean;
  estado_mapeo: CartaEstadoMapeo;
  es_nuevo: boolean;        // por fecha de lanzamiento
  es_nuevo_total: boolean;  // por fecha O algun sabor nuevo
  rentabilidad: {
    tarjeta: CartaRentabilidadCanal;
    efectivo: CartaRentabilidadCanal;
  } | null;
}

export interface CartaResumen {
  total: number;
  con_costo: number;
  sin_mapear: number;
  sin_costo: number;
  nuevos: number;
  margen_promedio_tarjeta: number;
  por_categoria: { categoria: string; total: number; con_costo: number; sin_mapear: number }[];
}

export interface CartaSugerencia {
  id: number;
  nombre: string;
  costo_total: number;
  precio_publico: number;
  categoria_nombre: string | null;
  score: number;
}

export interface CartaCategoria {
  categoria: string;
  cantidad: number; // TOTAL incluyendo subcategorias
  subcategorias: { subcategoria: string; cantidad: number }[];
}

export interface CartaAutoMapPropuesta {
  carta_id: number;
  carta_nombre: string;
  carta_categoria: string | null;
  producto_id: number;
  producto_nombre: string;
  costo_total: number;
  score: number;
}

export interface CartaAutoMapResult {
  dry_run: boolean;
  total_candidatos?: number;
  mapeados?: number;
  propuestas: CartaAutoMapPropuesta[];
}

// Reverse lookup: por cada producto, que items de carta lo referencian.
export interface CartaMapeoProductoEntry {
  carta_count: number;
  items: { id: number; nombre: string }[];
}

export interface CartaMapeoProductos {
  disponible: boolean;
  productos: Record<string, CartaMapeoProductoEntry>;
}

// Reverse lookup para Promos/Boxs: que promo ya esta en la carta.
export interface CartaMapeoOfertas {
  disponible: boolean;
  ofertas: Record<string, { carta_id: number; carta_nombre: string }>;
}
