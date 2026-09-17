export interface Envio {
  id: number;
  fecha: string;
  producto_id: number | null;
  producto_nombre: string;
  cantidad_enviada: number;
  cantidad_vencida: number;
  cantidad_vendida: number;
  observacion: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface EnvioInput {
  fecha: string;
  producto_id?: number | null;
  producto_nombre: string;
  cantidad_enviada: number;
  observacion?: string | null;
}

export interface EnvioCatalogo {
  id: number;
  nombre: string;
  porciones: number;
  costo_total: number;
  peso_total_g: number | null;
}

export interface ReporteEnvioRegistro {
  id: number;
  fecha: string;
  producto_id: number | null;
  producto_nombre: string;
  cantidad_enviada: number;
  cantidad_vencida: number;
  cantidad_vendida: number;
  observacion: string | null;
  costo_unitario: number;
  monto_enviado: number;
  monto_vencido: number;
  monto_vendido: number;
}

export interface ReporteEnvioPorProducto {
  producto_nombre: string;
  n_envios: number;
  total_enviados: number;
  total_vencidos: number;
  total_vendidos: number;
  costo_unitario: number;
  monto_enviado: number;
  monto_vencido: number;
  monto_vendido: number;
}

export interface ReporteEnvioPorDia {
  fecha: string;
  total_enviados: number;
  total_vencidos: number;
  monto_enviado: number;
  monto_vencido: number;
}

export interface ReporteEnvioTotales {
  total_envios: number;
  total_enviados: number;
  total_vencidos: number;
  total_vendidos: number;
  monto_enviado: number;
  monto_vencido: number;
  monto_vendido: number;
  productos_distintos: number;
}

export interface ReporteEnviosData {
  registros: ReporteEnvioRegistro[];
  porProducto: ReporteEnvioPorProducto[];
  porDia: ReporteEnvioPorDia[];
  totales: ReporteEnvioTotales;
}
