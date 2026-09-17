export interface Perdida {
  id: number;
  fecha: string;
  item_tipo: 'producto' | 'ingrediente';
  item_nombre: string;
  item_id: number | null;
  cantidad: number;
  unidad: string | null;
  motivo: string | null;
  responsable: string | null;
  descripcion: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PerdidaInput {
  fecha: string;
  item_tipo: 'producto' | 'ingrediente';
  item_nombre: string;
  item_id?: number | null;
  cantidad: number;
  unidad?: string | null;
  motivo?: string | null;
  responsable?: string | null;
  descripcion?: string | null;
}

export interface ItemCatalogo {
  id: number;
  nombre: string;
  tipo: 'producto' | 'ingrediente';
}
