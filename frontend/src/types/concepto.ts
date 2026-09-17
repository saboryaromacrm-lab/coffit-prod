export interface Concepto {
  id: number;
  nombre: string;
  tipo: 'impuesto' | 'comision' | 'descuento';
  porcentaje: number;
  descripcion: string | null;
  es_resta: boolean;
  orden: number;
  activo: boolean;
  canal_ids: number[];
}

export interface ResumenCanalConcepto {
  id: number;
  nombre: string;
  tipo: string;
  valor: number;
}

export interface ResumenCanal {
  nombre: string;
  icono: string | null;
  impuestos: number;
  comisiones: number;
  descuentos: number;
  total: number;
  conceptos: ResumenCanalConcepto[];
}

export type ResumenCanales = Record<'tarjeta' | 'efectivo' | 'pedidosya', ResumenCanal>;

export interface ConceptosResponse {
  conceptos: Concepto[];
  resumen_canales: ResumenCanales;
}
