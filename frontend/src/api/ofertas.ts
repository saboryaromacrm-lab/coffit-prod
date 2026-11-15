import api from './axios';
import type { Oferta, OfertaCostoManual, PasoPromo, PropuestaIA, CategoriaCartaPromo, ApiResponse } from '../types';

interface OfertaPayload {
  nombre: string;
  tipo: string;
  categoria_carta?: string;
  valor: number;
  descripcion?: string;
  fecha_inicio?: string;
  fecha_fin?: string;
  estado: string;
  productos: { id: number; cantidad: number; rol?: string; descuento_pct?: number }[] | number[];
  manuales?: OfertaCostoManual[];
  pasos?: PasoPromo[];
}

// El asistente piensa varias propuestas con toda la carta: no aplica el timeout corto
const TIMEOUT_IA = 5 * 60 * 1000;

export const ofertasApi = {
  getAll: (): Promise<ApiResponse<Oferta[]>> =>
    api.get('/ofertas'),
  create: (data: OfertaPayload): Promise<ApiResponse<Oferta>> =>
    api.post('/ofertas', data),
  update: (id: number, data: OfertaPayload): Promise<ApiResponse<Oferta>> =>
    api.put(`/ofertas/${id}`, data),
  delete: (id: number): Promise<ApiResponse<null>> =>
    api.delete(`/ofertas/${id}`),

  // Asistente IA: propone combos/promos/boxs con la carta y su rentabilidad
  sugerirConIA: (pedido: { objetivo: string; categoria: CategoriaCartaPromo | null; cantidad: number }):
    Promise<ApiResponse<{ propuestas: PropuestaIA[]; descartadas: number }>> =>
    api.post('/combos-ia/sugerir', pedido, { timeout: TIMEOUT_IA }),
};
