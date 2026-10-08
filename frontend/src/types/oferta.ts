export type TipoOferta = 'descuento_porcentaje' | 'descuento_fijo' | '2x1' | '3x2' | 'precio_especial' | 'compra_regalo';
export type EstadoOferta = 'activa' | 'pausada' | 'programada' | 'vencida';

// Categoria fija de carta que define la promo (la Carta y el menu la heredan)
export type CategoriaCartaPromo = 'Promo' | 'Combo' | 'Boxs';

// Rol de un producto dentro de una promo compra_regalo:
// 'pago' = se paga a precio de lista | 'regalo' = con descuento_pct (100 = gratis)
export type RolPromoProducto = 'pago' | 'regalo';

export interface OfertaProducto {
  id: number;
  nombre: string;
  precio_publico?: number;
  costo_total?: number;
  cantidad?: number;
  rol?: RolPromoProducto;
  descuento_pct?: number;
}

// Costo cargado a mano dentro de la promo (ej. "Vaso" $100), sin alta como
// ingrediente ni producto. Suma costo, no precio.
export interface OfertaCostoManual {
  id?: number;
  nombre: string;
  costo: number; // por unidad
  cantidad: number;
}

export interface Oferta {
  id: number;
  nombre: string;
  tipo: TipoOferta;
  categoria_carta?: CategoriaCartaPromo;
  valor: number;
  descripcion: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  estado: EstadoOferta;
  activo: boolean;
  productos: OfertaProducto[];
  manuales?: OfertaCostoManual[];
  created_at?: string;
}
