import api from './axios';
import type { ApiResponse } from '../types';

export interface ControlChecklist {
  hecho: boolean;
  observacion: string;
  actualizado_por: string | null;
  actualizado_en: string | null;
}

export interface ItemChecklist {
  carta_item_id: number;
  nombre: string;
  categoria: string;
  subcategoria: string | null;
  imagen: string | null;
  descripcion: string | null;
  // producto = tiene receta | combo = box/promo (lleva otros productos) | sin_receta = item suelto
  tipo: 'producto' | 'combo' | 'sin_receta';
  receta: { nombre: string; cantidad: number; unidad: string; tipo: 'ingrediente' | 'subreceta' | 'manual' }[];
  incluye: { nombre: string; cantidad: number; es_regalo: boolean }[];
  preparacion: string | null;
  coccion: string | null;
  tener_en_cuenta: string | null;
  control: ControlChecklist;
}

export const cartaChecklistApi = {
  getAll: (): Promise<ApiResponse<ItemChecklist[]>> => api.get('/carta-checklist'),

  // Solo se mandan los campos que cambian: tildar no pisa la observacion.
  // `key` = link del colaborador, para registrar quien lo marco.
  guardar: (
    cartaItemId: number,
    cambios: { hecho?: boolean; observacion?: string },
    key?: string,
  ): Promise<ApiResponse<ControlChecklist>> =>
    api.put(`/carta-checklist/${cartaItemId}`, { ...cambios, ...(key && { key }) }),
};
